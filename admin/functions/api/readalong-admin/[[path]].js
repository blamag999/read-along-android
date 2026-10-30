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
  if (!/^\d{6}$/.test(String(code || ""))) return null;
  let key;
  try {
    key = await crypto.subtle.importKey("raw", decodeBase32(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  } catch {
    return null;
  }
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let drift = -1; drift <= 1; drift++) {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setBigUint64(0, BigInt(counter + drift), false);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, buffer));
    const offset = mac[mac.length - 1] & 0x0f;
    const binary = ((mac[offset] & 0x7f) << 24) | ((mac[offset + 1] & 0xff) << 16) |
      ((mac[offset + 2] & 0xff) << 8) | (mac[offset + 3] & 0xff);
    if (String(binary % 1000000).padStart(6, "0") === String(code)) return counter + drift;
  }
  return null;
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
    if (keys.length > 5000) throw new Error("Thư mục có hơn 5.000 đối tượng; hãy quét từng thư mục con để thu hẹp phạm vi.");
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


const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".m4b", ".aac", ".wav", ".ogg", ".oga", ".opus", ".flac", ".wma"]);

async function readObjectRange(bucket, key, offset, length) {
  const object = await bucket.get(key, { range: { offset, length } });
  return object ? new Uint8Array(await object.arrayBuffer()) : new Uint8Array();
}

function hasMp3Frame(bytes) {
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) continue;
    const version = (bytes[i + 1] >> 3) & 3;
    const layer = (bytes[i + 1] >> 1) & 3;
    const bitrate = (bytes[i + 2] >> 4) & 15;
    const sampleRate = (bytes[i + 2] >> 2) & 3;
    if (version !== 1 && layer !== 0 && bitrate !== 0 && bitrate !== 15 && sampleRate !== 3) return true;
  }
  return false;
}

async function inspectLibraryObject(bucket, item) {
  const key = item.key;
  const ext = extensionOf(key);
  const size = Number(item.size || 0);
  const issues = [];
  const add = (severity, code, message, suggestion) => issues.push({ severity, code, key, message, suggestion });
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    add("error", "unsupported_format", "Định dạng tệp không được Read Along Admin hỗ trợ.", "Chuyển đổi sang PDF, MP3 hoặc định dạng audio được hỗ trợ; sau đó tải lại.");
    return issues;
  }
  if (size === 0) {
    add("error", "empty_file", "Tệp có dung lượng 0 byte, có thể upload chưa hoàn tất.", "Kiểm tra tệp gốc và tải lên lại.");
    return issues;
  }
  if (ext === ".wma") {
    add("warning", "playback_compatibility", "WMA có thể lưu trữ nhưng phát không ổn định hoặc không được hỗ trợ trên Android WebView.", "Ưu tiên chuyển sang MP3 hoặc M4A/AAC.");
    return issues;
  }

  try {
    const head = await readObjectRange(bucket, key, 0, Math.min(size, 4096));
    if (ext === ".pdf") {
      const header = new TextDecoder().decode(head.slice(0, 8));
      if (!header.startsWith("%PDF-")) {
        add("error", "invalid_pdf_header", "Không tìm thấy chữ ký %PDF- ở đầu tệp; tệp có thể sai định dạng hoặc hỏng.", "Mở PDF gốc để xác nhận, rồi xuất hoặc tải lại tệp.");
      } else {
        const tail = await readObjectRange(bucket, key, Math.max(0, size - Math.min(size, 2048)), Math.min(size, 2048));
        const tailText = new TextDecoder().decode(tail);
        if (!tailText.includes("%%EOF")) add("warning", "pdf_eof_missing", "Không tìm thấy dấu kết thúc %%EOF ở 2 KB cuối; PDF có thể bị cắt cụt hoặc chưa hoàn chỉnh.", "Mở thử PDF; nếu không đọc hết trang, hãy xuất và tải lại bản đầy đủ.");
      }
    } else if (ext === ".mp3") {
      const id3 = head.length >= 3 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33;
      if (!id3 && !hasMp3Frame(head)) add("error", "invalid_mp3_header", "Không tìm thấy ID3 tag hoặc MPEG audio frame hợp lệ ở đầu tệp.", "Kiểm tra tệp có thực sự là MP3 và chuyển mã/tải lại nếu cần.");
    } else if (ext === ".wav") {
      if (head.length < 12 || String.fromCharCode(...head.slice(0, 4)) !== "RIFF" || String.fromCharCode(...head.slice(8, 12)) !== "WAVE") add("error", "invalid_wav_header", "Thiếu chữ ký RIFF/WAVE hợp lệ.", "Xuất lại audio dưới dạng WAV chuẩn.");
    } else if (ext === ".flac") {
      if (String.fromCharCode(...head.slice(0, 4)) !== "fLaC") add("error", "invalid_flac_header", "Thiếu chữ ký fLaC.", "Chuyển mã hoặc tải lại tệp FLAC.");
    } else if ([".ogg", ".oga", ".opus"].includes(ext)) {
      if (String.fromCharCode(...head.slice(0, 4)) !== "OggS") add("error", "invalid_ogg_header", "Thiếu chữ ký OggS.", "Kiểm tra codec/container và xuất lại tệp OGG/Opus.");
      else if (ext === ".opus" && !new TextDecoder().decode(head).includes("OpusHead")) add("warning", "opus_header_missing", "Không tìm thấy OpusHead trong phần đầu tệp Ogg.", "Xác nhận đây là audio Opus đúng chuẩn.");
    } else if (ext === ".m4a" || ext === ".m4b") {
      if (head.length < 12 || String.fromCharCode(...head.slice(4, 8)) !== "ftyp") add("error", "invalid_mp4_audio_header", "Thiếu hộp ftyp của container MP4/M4A.", "Xuất lại audio dưới dạng M4A/AAC chuẩn.");
    } else if (ext === ".aac") {
      if (head.length < 2 || head[0] !== 0xff || (head[1] & 0xf6) !== 0xf0) add("error", "invalid_aac_header", "Không tìm thấy ADTS sync word ở đầu tệp AAC.", "Kiểm tra tệp AAC có dùng ADTS; nếu không, đóng gói lại thành M4A.");
    }
    if (ext === ".json") {
      if (size > 2 * 1024 * 1024) {
        add("warning", "json_too_large_to_validate", "JSON lớn hơn 2 MB nên công cụ chỉ kiểm tra dung lượng, chưa kiểm tra cú pháp.", "Nếu đây là tệp marker/timestamp, nên giữ JSON gọn và kiểm tra riêng.");
      } else {
        const object = await bucket.get(key);
        const text = object ? await object.text() : "";
        try { JSON.parse(text); }
        catch { add("error", "invalid_json", "Nội dung JSON không hợp lệ hoặc bị cắt cụt.", "Mở JSON bằng trình soạn thảo, sửa cú pháp rồi tải lại."); }
      }
    }
  } catch {
    add("warning", "content_check_failed", "Không thể đọc nội dung tệp để kiểm tra chữ ký; thông tin metadata vẫn được giữ nguyên.", "Thử quét lại. Nếu lỗi lặp lại, kiểm tra quyền truy cập hoặc tải lại tệp.");
  }
  return issues;
}

const SCAN_RULE_VERSION = "2026-10-30.2";

async function listAllObjects(bucket, prefix) {
  const objects = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    objects.push(...page.objects.filter((item) => !item.key.endsWith("/")));
    cursor = page.truncated ? page.cursor : undefined;
    if (objects.length > 5000) throw new Error("Thư mục có hơn 5.000 đối tượng; hãy quét từng thư mục con để thu hẹp phạm vi.");
  } while (cursor);
  return objects;
}

async function scanLibrary(bucket, prefix, db) {
  const startedAt = Date.now();
  const listed = await listAllObjects(bucket, prefix);
  const cachedRows = await db.prepare("SELECT object_key, fingerprint, rule_version, findings_json FROM admin_scan_cache").all();
  const cache = new Map((cachedRows.results || []).filter((row) => row.object_key.startsWith(prefix)).map((row) => [row.object_key, row]));
  const items = listed.map((object) => ({
    key: object.key, size: object.size, uploaded: object.uploaded,
    etag: object.etag || object.httpEtag || ""
  }));
  const present = new Set(items.map((item) => item.key));
  const stale = [...cache.keys()].filter((key) => !present.has(key));
  const changed = [];
  const findings = [];
  let skipped = 0;
  const fingerprint = (item) => JSON.stringify([Number(item.size || 0), String(item.uploaded || ""), String(item.etag || "")]);
  for (let i = 0; i < items.length; i += 10) {
    const batch = items.slice(i, i + 10);
    const inspected = await Promise.all(batch.map(async (item) => {
      const fp = fingerprint(item);
      const previous = cache.get(item.key);
      if (previous && previous.fingerprint === fp && previous.rule_version === SCAN_RULE_VERSION) {
        skipped++;
        try { return { item, fp, findings: JSON.parse(previous.findings_json || "[]"), cached: true }; }
        catch { /* malformed cache is rechecked */ }
      }
      return { item, fp, findings: await inspectLibraryObject(bucket, item), cached: false };
    }));
    for (const result of inspected) {
      findings.push(...result.findings);
      if (!result.cached) changed.push(result.item.key);
      await db.prepare(
        "INSERT INTO admin_scan_cache (object_key, fingerprint, rule_version, findings_json, scanned_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(object_key) DO UPDATE SET fingerprint=excluded.fingerprint, rule_version=excluded.rule_version, findings_json=excluded.findings_json, scanned_at=excluded.scanned_at"
      ).bind(result.item.key, result.fp, SCAN_RULE_VERSION, JSON.stringify(result.findings), Date.now()).run();
    }
  }
  for (const key of stale) {
    await db.prepare("DELETE FROM admin_scan_cache WHERE object_key = ?").bind(key).run();
  }

  const normalizeBookName = value => String(value || "")
    .normalize("NFKC").replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ")
    .replace(/[’']/g, "").replace(/\bread\s+along\b/gi, " ")
    .replace(/\bbook\b/gi, " ").replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ").trim().toLocaleLowerCase("vi");
  const similarity = (left, right) => {
    if (!left || !right) return 0;
    const aa=left.replace(/\s+/g,""),bb=right.replace(/\s+/g,"");
    const row=Array.from({length:bb.length+1},(_,i)=>i);
    for(let i=1;i<=aa.length;i++){
      let diagonal=row[0];row[0]=i;
      for(let j=1;j<=bb.length;j++){
        const above=row[j];
        row[j]=Math.min(row[j]+1,row[j-1]+1,diagonal+(aa[i-1]===bb[j-1]?0:1));
        diagonal=above;
      }
    }
    const edit=1-row[bb.length]/Math.max(aa.length,bb.length,1);
    const x=new Set(left.split(" ")),y=new Set(right.split(" "));
    const overlap=[...x].filter(t=>y.has(t)).length/Math.max(x.size,y.size,1);
    return Math.max(edit,overlap*0.92);
  };
  const assets=items.filter(item=>{
    const ext=extensionOf(item.key);
    return ext===".pdf" || AUDIO_EXTENSIONS.has(ext) || ext===".json";
  }).map(item=>{
    const name=item.key.split("/").pop().replace(/\.[^.]+$/,"");
    const ext=extensionOf(item.key);
    const pSuffix=ext!==".pdf" && ext!==".json" ? name.match(/_P(\d+)$/i) : null;
    const legacySuffix=ext!==".pdf" && ext!==".json" ? name.match(/(?:[_ -](?:side|part|pt|disc)[ _.-]*(\d+))$/i) : null;
    const partMatch=pSuffix || legacySuffix;
    const withoutPart=partMatch ? name.slice(0,partMatch.index) : name;
    const baseName=ext===".json" ? withoutPart.replace(/[_-]sync$/i,"") : withoutPart;
    return {...item,ext,dir:item.key.includes("/")?item.key.slice(0,item.key.lastIndexOf("/")+1):"",
      stem:name,part:partMatch?Number(partMatch[1]):null,partStyle:pSuffix?"P":legacySuffix?"legacy":null,
      normalized:normalizeBookName(baseName)};
  }).filter(item=>item.normalized);
  const groups=new Map();
  for(const item of assets){
    const groupKey=item.dir+"|"+item.normalized;
    if(!groups.has(groupKey))groups.set(groupKey,{pdf:[],audio:[],json:[],items:[]});
    const group=groups.get(groupKey);group.items.push(item);
    if(item.ext===".pdf")group.pdf.push(item);
    else if(item.ext===".json")group.json.push(item);
    else group.audio.push(item);
  }
  for(const group of groups.values()){
    const first=group.items[0];
    if(group.pdf.length>1) findings.push({
      severity:"error",code:"duplicate_pdf",key:group.pdf[0].key,
      message:"Có nhiều PDF cùng tên sách sau khi chuẩn hóa.",
      suggestion:"Chỉ giữ một PDF chính hoặc đổi tên/phân loại rõ ràng các bản khác nhau."
    });
    if(group.json.length>1) findings.push({
      severity:"error",code:"duplicate_timestamp_json",key:group.json[0].key,
      message:"Có nhiều JSON mốc thời gian cùng tên sách.",
      suggestion:"Xác định JSON đúng với audio; giữ một tệp JSON có tên gốc trùng PDF."
    });
    if(group.pdf.length && !group.audio.length) findings.push({
      severity:"error",code:"missing_audio",key:group.pdf[0].key,
      message:"Có PDF nhưng chưa có MP3/audio cùng tên gốc.",
      suggestion:"Đặt tên audio trùng tên PDF; nếu chia phần, dùng hậu tố _P1, _P2..."
    });
    if(group.audio.length && !group.pdf.length) findings.push({
      severity:"error",code:"missing_pdf",key:group.audio[0].key,
      message:"Có MP3/audio nhưng chưa có PDF cùng tên gốc.",
      suggestion:"Đặt tên PDF trùng tên gốc của audio, bỏ hậu tố _P1/_P2 nếu có."
    });
    const needsPartCheck=group.audio.length>1 || group.audio.some(x=>x.partStyle==="legacy");
    if(needsPartCheck){
      const parts=group.audio.map(x=>x.part);
      const sequenceValid=parts.every(Number.isInteger) && new Set(parts).size===parts.length &&
        [...parts].sort((a,b)=>a-b).every((n,i)=>n===i+1);
      const canonicalNames=group.audio.every(x=>x.partStyle==="P");
      if(!sequenceValid || !canonicalNames){
        findings.push({
          severity:"warning",code:"invalid_audio_parts",key:group.audio[0].key,
          message:"Nhiều audio hoặc audio có hậu tố phần chưa đúng quy tắc _P1, _P2... liên tục.",
          suggestion:"Đổi tên các phần theo mẫu _P1, _P2, _P3...; tên gốc phải trùng PDF."
        });
        if(sequenceValid && group.pdf.length===1){
          const pdfStem=group.pdf[0].key.split("/").pop().replace(/\.[^.]+$/,"");
          for(const audio of group.audio.filter(x=>x.partStyle==="legacy")){
            findings.push({
              severity:"warning",code:"rename_audio_part",key:audio.key,
              suggestedRename:audio.dir+pdfStem+"_P"+audio.part+audio.ext,
              message:"Tên phần audio chưa theo quy tắc hậu tố _P"+audio.part+".",
              suggestion:"Duyệt đổi tên để thống nhất thứ tự các phần audio."
            });
          }
        }
      }
    } else if(group.audio.length===1 && group.audio[0].part!==null && group.audio[0].part!==1){
      findings.push({
        severity:"warning",code:"audio_part_sequence",key:group.audio[0].key,
        message:"Sách chỉ có một tệp audio nhưng hậu tố phần bắt đầu từ P"+group.audio[0].part+".",
        suggestion:"Nếu đây là phần duy nhất, đổi hậu tố thành _P1; nếu còn phần khác, tải đủ các phần."
      });
    }
  }
  const pairedKeys=new Set(assets.filter(x=>x.ext===".pdf" || x.ext===".json" || AUDIO_EXTENSIONS.has(x.ext))
    .map(x=>x.key));
  const unmatched=assets.filter(item=>{
    const group=groups.get(item.dir+"|"+item.normalized);
    return item.ext===".pdf" ? !group.audio.length : item.ext===".json" ? (!group.pdf.length || !group.audio.length) : !group.pdf.length;
  });
  const reported=new Set();
  for(const item of unmatched){
    if(reported.has(item.key))continue;
    const opposite=assets.filter(other=>other.dir===item.dir && other.normalized!==item.normalized &&
      (item.ext===".pdf" ? (other.ext!==".pdf" && other.ext!==".json") :
       item.ext===".json" ? other.ext===".pdf" : other.ext===".pdf"));
    const ranked=opposite.map(other=>({other,score:similarity(item.normalized,other.normalized)}))
      .filter(x=>x.score>=0.65).sort((a,b)=>b.score-a.score);
    if(!ranked.length)continue;
    const best=ranked[0];
    if(ranked.length>1 && best.score-ranked[1].score<0.08){
      findings.push({severity:"warning",code:"ambiguous_name_match",key:item.key,
        message:"Có nhiều tệp khác loại tên gần giống; không thể đề xuất đổi tên an toàn.",
        suggestion:"Đối chiếu nội dung sách và xác định đúng cặp trước khi sửa tên."});
      reported.add(item.key);continue;
    }
    const counterpart=best.other;
    const suggestedRename=item.dir+counterpart.stem+(item.ext);
    findings.push({severity:"warning",code:"name_mismatch",key:item.key,candidateKey:counterpart.key,
      similarity:Math.round(best.score*100),suggestedRename,
      message:"Tên tệp gần giống nhưng chưa trùng tên gốc; hiện không được ghép tự động.",
      suggestion:"Nếu xác nhận cùng một sách, duyệt đổi tên thành: "+suggestedRename});
    reported.add(item.key);
  }
  for(const item of assets.filter(x=>x.ext===".json")){
    const group=groups.get(item.dir+"|"+item.normalized);
    if(!group.pdf.length || !group.audio.length){
      findings.push({severity:"warning",code:"orphan_timestamp_json",key:item.key,
        message:"JSON mốc thời gian chưa có đủ PDF và audio cùng tên gốc.",
        suggestion:"Đảm bảo tên JSON trùng tên PDF và audio của đúng sách."});
    }
  }
  const errors = findings.filter((x) => x.severity === "error").length;
  const warnings = findings.filter((x) => x.severity === "warning").length;
  return { prefix, scanned: items.length, changed: changed.length, skipped, removed: stale.length, errors, warnings, findings, complete: true, checkedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, ruleVersion: SCAN_RULE_VERSION };
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
    const now = Date.now();
    const since = now - RATE_WINDOW_MS;
    await env.DB.prepare("DELETE FROM admin_auth_attempts WHERE attempted_at <= ?").bind(since).run();
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM admin_auth_attempts WHERE ip_hash = ? AND attempted_at > ?"
    ).bind(ipHash, since).first();
    if ((count?.total || 0) >= MAX_ATTEMPTS) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const acceptedCounter = await verifyTotp(env.READALONG_TOTP_SECRET, body.code);
    if (acceptedCounter === null) {
      await env.DB.prepare("INSERT INTO admin_auth_attempts (ip_hash, attempted_at) VALUES (?, ?)").bind(ipHash, Date.now()).run();
      return json({ error: "Invalid authentication code" }, 401);
    }
    const replayGuard = await env.DB.prepare(
      "UPDATE admin_totp_state SET last_counter = ? WHERE id = 1 AND last_counter < ?"
    ).bind(acceptedCounter, acceptedCounter).run();
    if (!replayGuard.meta?.changes) {
      await env.DB.prepare("INSERT INTO admin_auth_attempts (ip_hash, attempted_at) VALUES (?, ?)").bind(ipHash, Date.now()).run();
      return json({ error: "This OTP code has already been used. Wait for the next code." }, 401);
    }
    await env.DB.prepare("DELETE FROM admin_auth_attempts WHERE ip_hash = ?").bind(ipHash).run();
    await env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(Date.now()).run();
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const token = base64url(raw);
    const tokenHash = await sha256(token);
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


  if (route === "diagnostics/scan" && method === "GET") {
    const prefix = url.searchParams.get("prefix") || "";
    if (prefix && !validKey(prefix.endsWith("/") ? prefix.slice(0, -1) : prefix)) return json({ error: "Invalid folder path" }, 400);
    const normalized = prefix ? (prefix.endsWith("/") ? prefix : prefix + "/") : "";
    const scanId = crypto.randomUUID();
    const startedAt = Date.now();
    const rayId = request.headers.get("cf-ray") || null;
    try {
      const result = await scanLibrary(env.READALONG, normalized, env.DB);
      await env.DB.prepare("INSERT INTO admin_scan_logs (scan_id, prefix, status, scanned, changed, skipped, errors, warnings, duration_ms, rule_version, ray_id, detail_json, created_at) VALUES (?, ?, 'success', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(scanId, normalized, result.scanned, result.changed, result.skipped, result.errors, result.warnings, Date.now() - startedAt, result.ruleVersion, rayId, JSON.stringify({ removed: result.removed }), Date.now()).run();
      return json({ ...result, scanId, rayId });
    } catch (error) {
      const message = String(error?.message || "Library scan failed").slice(0, 1000);
      await env.DB.prepare("INSERT INTO admin_scan_logs (scan_id, prefix, status, scanned, changed, skipped, errors, warnings, duration_ms, rule_version, ray_id, error_message, created_at) VALUES (?, ?, 'failed', 0, 0, 0, 0, 0, ?, ?, ?, ?, ?)")
        .bind(scanId, normalized, Date.now() - startedAt, SCAN_RULE_VERSION, rayId, message, Date.now()).run();
      return json({ error: message, scanId, rayId, durationMs: Date.now() - startedAt }, 503);
    }
  }

  if (route === "debug/logs" && method === "GET") {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
    const result = await env.DB.prepare("SELECT scan_id, prefix, status, scanned, changed, skipped, errors, warnings, duration_ms, rule_version, ray_id, error_message, detail_json, created_at FROM admin_scan_logs ORDER BY created_at DESC LIMIT ?").bind(limit).all();
    return json({ entries: result.results || [] });
  }

  if (route === "files" && method === "GET") {
    const prefix = url.searchParams.get("prefix") || "";
    if (prefix && !validKey(prefix.endsWith("/") ? prefix.slice(0, -1) : prefix)) return json({ error: "Invalid folder path" }, 400);
    const normalized = prefix ? (prefix.endsWith("/") ? prefix : prefix + "/") : "";
    const requestedCursor = url.searchParams.get("cursor") || undefined;
    const result = await env.READALONG.list({ prefix: normalized, delimiter: "/", limit: 100, ...(requestedCursor ? { cursor: requestedCursor } : {}) });
    const folders = (result.delimitedPrefixes || []).map((key) => ({ key, name: key.slice(normalized.length), type: "folder" }));
    const files = result.objects.filter((obj) => obj.key !== normalized && !obj.key.endsWith("/")).map((obj) => ({
      key: obj.key, name: obj.key.slice(normalized.length), type: "file", size: obj.size, uploaded: obj.uploaded,
      contentType: obj.httpMetadata?.contentType || ""
    }));
    return json({ prefix: normalized, folders, files, truncated: result.truncated, cursor: result.cursor || null, pageSize: 100 });
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
    if (!validKey(source) || !validKey(destination) || !ALLOWED_EXTENSIONS.has(extensionOf(destination)) || extensionOf(source) !== extensionOf(destination)) return json({ error: "Invalid file name or format; keep the original extension" }, 400);
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
  } catch {
    return json({ error: "Internal server error" }, 500);
  }
}
