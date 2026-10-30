const SESSION_COOKIE = "readalong_admin_session";
const SESSION_TTL = 30 * 60;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".json", ".mp3", ".m4a", ".m4b", ".aac", ".wav",
  ".ogg", ".oga", ".opus", ".flac", ".wma"
]);

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });

const bytesToHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
const base64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = String(value || "").toUpperCase().replace(/=+$/g, "").replace(/\s/g, "");
  if (clean.length < 32 || !/^[A-Z2-7]+$/.test(clean)) throw new Error("Invalid TOTP secret");
  let bits = "";
  for (const char of clean) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(out);
}

async function verifyTotp(secret, code) {
  if (!/^\d{6}$/.test(String(code || ""))) return false;
  let key;
  try {
    key = await crypto.subtle.importKey("raw", decodeBase32(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  } catch {
    return false;
  }
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let drift = -1; drift <= 1; drift++) {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setBigUint64(0, BigInt(counter + drift), false);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, buffer));
    const offset = mac[mac.length - 1] & 0x0f;
    const binary = ((mac[offset] & 0x7f) << 24) | ((mac[offset + 1] & 0xff) << 16) |
      ((mac[offset + 2] & 0xff) << 8) | (mac[offset + 3] & 0xff);
    if (String(binary % 1000000).padStart(6, "0") === String(code)) return true;
  }
  return false;
}

function getCookie(request, name) {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

function cookie(value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

function validKey(value, allowEmpty = false) {
  if (allowEmpty && value === "") return true;
  if (typeof value !== "string" || !value || value.length > 1024) return false;
  if (value.startsWith("/") || value.includes("\\") || value.includes("\0")) return false;
  const parts = value.split("/");
  return parts.every((part) => part && part !== "." && part !== "..");
}

function extensionOf(key) {
  const name = key.split("/").pop() || "";
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

function assertOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) throw new Error("Invalid request origin");
}

async function audit(env, action, key, detail = {}) {
  await env.DB.prepare(
    "INSERT INTO admin_audit_log (action, object_key, detail_json, created_at) VALUES (?, ?, ?, ?)"
  ).bind(action, key || null, JSON.stringify(detail), Date.now()).run();
}

async function authenticate(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT token_hash, expires_at FROM admin_sessions WHERE token_hash = ? AND expires_at > ?"
  ).bind(tokenHash, Date.now()).first();
  return row ? { tokenHash } : null;
}

async function requireAuth(request, env) {
  const session = await authenticate(request, env);
  if (!session) return { response: json({ error: "Unauthorized" }, 401, { "www-authenticate": "Session" }) };
  return { session };
}

async function listAllKeys(bucket, prefix) {
  const keys = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    keys.push(...page.objects.map((item) => item.key));
    cursor = page.truncated ? page.cursor : undefined;
    if (keys.length > 5000) throw new Error("Folder contains more than 5,000 objects; delete in smaller folders");
  } while (cursor);
  return keys;
}

async function moveObject(bucket, source, destination) {
  if (!validKey(source) || !validKey(destination) || source === destination) throw new Error("Invalid source or destination");
  const existing = await bucket.head(source);
  if (!existing) throw new Error("Source file not found");
  if (await bucket.head(destination)) throw new Error("Destination already exists");
  const object = await bucket.get(source);
  if (!object) throw new Error("Source file not found");
  await bucket.put(destination, object.body, {
    httpMetadata: object.httpMetadata,
    customMetadata: object.customMetadata
  });
  const copied = await bucket.head(destination);
  if (!copied || copied.size !== existing.size) {
    await bucket.delete(destination);
    throw new Error("Copy verification failed; source was preserved");
  }
  await bucket.delete(source);
}

async function handle(request, env) {
  if (!env.READALONG || !env.DB) return json({ error: "Admin service is not configured" }, 503);
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/readalong-admin\/?/, "").replace(/\/$/, "");
  const method = request.method.toUpperCase();

  if (route === "login" && method === "POST") {
    assertOrigin(request);
    if (!env.READALONG_TOTP_SECRET) return json({ error: "TOTP secret is not configured" }, 503);
    const ipHash = await sha256(clientIp(request));
    const since = Date.now() - RATE_WINDOW_MS;
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM admin_auth_attempts WHERE ip_hash = ? AND attempted_at > ?"
    ).bind(ipHash, since).first();
    if ((count?.total || 0) >= MAX_ATTEMPTS) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const ok = await verifyTotp(env.READALONG_TOTP_SECRET, body.code);
    if (!ok) {
      await env.DB.prepare("INSERT INTO admin_auth_attempts (ip_hash, attempted_at) VALUES (?, ?)").bind(ipHash, Date.now()).run();
      return json({ error: "Invalid authentication code" }, 401);
    }
    await env.DB.prepare("DELETE FROM admin_auth_attempts WHERE ip_hash = ?").bind(ipHash).run();
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const token = base64url(raw);
    const tokenHash = await sha256(token);
    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO admin_sessions (token_hash, created_at, expires_at, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?)"
    ).bind(tokenHash, now, now + SESSION_TTL * 1000, ipHash, (request.headers.get("User-Agent") || "").slice(0, 300)).run();
    await audit(env, "login", null);
    return json({ ok: true, expiresIn: SESSION_TTL }, 200, { "set-cookie": cookie(token, SESSION_TTL) });
  }

  if (route === "session" && method === "GET") {
    const session = await authenticate(request, env);
    return json({ authenticated: !!session });
  }

  if (route === "logout" && method === "POST") {
    assertOrigin(request);
    const token = getCookie(request, SESSION_COOKIE);
    if (token) await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": cookie("", 0) });
  }

  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;

  if (route === "files" && method === "GET") {
    const prefix = url.searchParams.get("prefix") || "";
    if (prefix && !validKey(prefix.endsWith("/") ? prefix.slice(0, -1) : prefix)) return json({ error: "Invalid folder path" }, 400);
    const normalized = prefix ? (prefix.endsWith("/") ? prefix : prefix + "/") : "";
    const result = await env.READALONG.list({ prefix: normalized, delimiter: "/", limit: 1000 });
    const folders = (result.delimitedPrefixes || []).map((key) => ({ key, name: key.slice(normalized.length), type: "folder" }));
    const files = result.objects.filter((obj) => obj.key !== normalized && !obj.key.endsWith("/")).map((obj) => ({
      key: obj.key, name: obj.key.slice(normalized.length), type: "file", size: obj.size, uploaded: obj.uploaded,
      contentType: obj.httpMetadata?.contentType || ""
    }));
    return json({ prefix: normalized, folders, files, truncated: result.truncated, cursor: result.cursor || null });
  }

  if (route === "folders" && method === "POST") {
    assertOrigin(request);
    const body = await request.json();
    const prefix = String(body.prefix || "");
    const name = String(body.name || "").trim();
    if (!name || name.length > 120 || /[\\/\0]/.test(name) || name === "." || name === "..") return json({ error: "Invalid folder name" }, 400);
    const key = `${prefix}${name}/`;
    if (prefix && !validKey(prefix.endsWith("/") ? prefix.slice(0, -1) : prefix)) return json({ error: "Invalid folder path" }, 400);
    await env.READALONG.put(key, new Uint8Array(), { httpMetadata: { contentType: "application/x-directory" } });
    await audit(env, "create_folder", key);
    return json({ ok: true, key });
  }

  if (route === "multipart/start" && method === "POST") {
    assertOrigin(request);
    const body = await request.json();
    const key = String(body.key || "");
    const size = Number(body.size);
    const contentType = String(body.contentType || "application/octet-stream").slice(0, 120);
    if (!validKey(key) || !ALLOWED_EXTENSIONS.has(extensionOf(key))) return json({ error: "Unsupported file name or format" }, 400);
    if (!Number.isSafeInteger(size) || size <= 0 || size > 5 * 1024 * 1024 * 1024 * 1024) return json({ error: "Invalid file size" }, 400);
    if (await env.READALONG.head(key)) return json({ error: "A file with this name already exists" }, 409);
    const upload = await env.READALONG.createMultipartUpload(key, { httpMetadata: { contentType } });
    return json({ uploadId: upload.uploadId, key });
  }

  if (route === "multipart/part" && method === "PUT") {
    assertOrigin(request);
    const key = request.headers.get("X-Upload-Key") || "";
    const uploadId = request.headers.get("X-Upload-Id") || "";
    const partNumber = Number(request.headers.get("X-Part-Number"));
    if (!validKey(key) || !uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000 || !request.body) return json({ error: "Invalid multipart request" }, 400);
    const upload = env.READALONG.resumeMultipartUpload(key, uploadId);
    const part = await upload.uploadPart(partNumber, request.body);
    return json({ partNumber, etag: part.etag });
  }

  if (route === "multipart/complete" && method === "POST") {
    assertOrigin(request);
    const body = await request.json();
    const key = String(body.key || "");
    const uploadId = String(body.uploadId || "");
    const parts = body.parts;
    if (!validKey(key) || !uploadId || !Array.isArray(parts) || !parts.length || parts.length > 10000) return json({ error: "Invalid multipart completion" }, 400);
    const upload = env.READALONG.resumeMultipartUpload(key, uploadId);
    await upload.complete(parts.map((part) => ({ partNumber: Number(part.partNumber), etag: String(part.etag) })));
    const object = await env.READALONG.head(key);
    if (!object || object.size !== Number(body.size)) {
      if (object) await env.READALONG.delete(key);
      return json({ error: "Uploaded file verification failed" }, 500);
    }
    await audit(env, "upload", key, { size: object.size });
    return json({ ok: true, key, size: object.size });
  }

  if (route === "multipart/abort" && method === "POST") {
    assertOrigin(request);
    const body = await request.json();
    if (!validKey(String(body.key || "")) || !body.uploadId) return json({ error: "Invalid multipart upload" }, 400);
    await env.READALONG.resumeMultipartUpload(body.key, body.uploadId).abort();
    return json({ ok: true });
  }

  if (route === "rename" && method === "POST") {
    assertOrigin(request);
    const body = await request.json();
    const source = String(body.source || "");
    const destination = String(body.destination || "");
    if (!validKey(source) || !validKey(destination) || !ALLOWED_EXTENSIONS.has(extensionOf(destination))) return json({ error: "Invalid file name or format" }, 400);
    await moveObject(env.READALONG, source, destination);
    await audit(env, "rename_or_move", source, { destination });
    return json({ ok: true });
  }

  if (route === "file" && method === "DELETE") {
    assertOrigin(request);
    const key = url.searchParams.get("key") || "";
    if (!validKey(key)) return json({ error: "Invalid file key" }, 400);
    await env.READALONG.delete(key);
    await audit(env, "delete_file", key);
    return json({ ok: true });
  }

  if (route === "folder" && method === "DELETE") {
    assertOrigin(request);
    const prefix = url.searchParams.get("prefix") || "";
    const normalized = prefix.endsWith("/") ? prefix : prefix + "/";
    if (!validKey(normalized.slice(0, -1))) return json({ error: "Invalid folder path" }, 400);
    const keys = await listAllKeys(env.READALONG, normalized);
    if (keys.length) await env.READALONG.delete(keys);
    await audit(env, "delete_folder", normalized, { objectsDeleted: keys.length });
    return json({ ok: true, objectsDeleted: keys.length });
  }

  if (route === "audit" && method === "GET") {
    const result = await env.DB.prepare(
      "SELECT action, object_key, detail_json, created_at FROM admin_audit_log ORDER BY created_at DESC LIMIT 100"
    ).all();
    return json({ entries: result.results || [] });
  }

  return json({ error: "Not found" }, 404);
}

export async function onRequest(context) {
  try {
    const response = await handle(context.request, context.env);
    const headers = new Headers(response.headers);
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "no-referrer");
    headers.set("cache-control", "no-store");
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 400);
  }
}
