// Read Along diagnostics endpoint.
// Deploy as a Cloudflare Worker named "read-along-diagnostics".
// Required secret: GITHUB_TOKEN (fine-grained PAT, Issues: Read and write,
// restricted to blamag999/read-along-android).
const MAX_BODY_BYTES = 100 * 1024;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_IP = 3;
const rateBuckets = new Map();

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

function allowedByRateLimit(ip, now) {
  const recent = (rateBuckets.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_IP) {
    rateBuckets.set(ip, recent);
    return false;
  }
  recent.push(now);
  rateBuckets.set(ip, recent);
  if (rateBuckets.size > 5000) {
    for (const [key, times] of rateBuckets) {
      if (!times.some(t => now - t < WINDOW_MS)) rateBuckets.delete(key);
      if (rateBuckets.size <= 4000) break;
    }
  }
  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "Content-Type",
        "access-control-max-age": "86400"
      }
    });
    if (url.pathname !== "/submit") return json({ error: "Not found" }, 404);
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { allow: "POST, OPTIONS" });
    if (!env.GITHUB_TOKEN) return json({ error: "Diagnostics endpoint is not configured yet" }, 503);
    if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) return json({ error: "Expected application/json" }, 415);
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json({ error: "Log is too large (max 100 KB)" }, 413);

    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    if (!allowedByRateLimit(ip, Date.now())) return json({ error: "Too many reports. Please try again later." }, 429);

    let payload;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json({ error: "Log is too large (max 100 KB)" }, 413);
      payload = JSON.parse(raw);
    } catch (_) {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (payload?.website) return json({ error: "Rejected" }, 400);
    if (!payload || typeof payload !== "object" || !payload.report || typeof payload.report !== "object" || Array.isArray(payload.report)) {
      return json({ error: "Missing diagnostics report" }, 400);
    }

    const reportText = JSON.stringify(payload.report, null, 2);
    if (new TextEncoder().encode(reportText).byteLength > 80 * 1024) return json({ error: "Log is too large (max 80 KB)" }, 413);
    const title = "[Diagnostics] Read Along - " + new Date().toISOString().replace("T", " ").replace(/\\.\\d{3}Z$/, " UTC");
    const fence = String.fromCharCode(96).repeat(3);
    const body = [
      "## Mô tả lỗi",
      "Vui lòng bổ sung mô tả lỗi và các bước tái hiện nếu có.",
      "",
      "## Log chẩn đoán",
      fence + "json",
      reportText.replace(/`{3}/g, "` ` `"),
      fence,
      "",
      "---",
      "Được gửi tự động từ Read Along. Log có thể công khai trong repository."
    ].join("\n");

    let ghResponse;
    try {
      ghResponse = await fetch("https://api.github.com/repos/blamag999/read-along-android/issues", {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": "Bearer " + env.GITHUB_TOKEN,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "Read-Along-Diagnostics"
        },
        body: JSON.stringify({ title, body })
      });
    } catch (_) {
      return json({ error: "Could not reach GitHub. Please try again later." }, 502);
    }
    if (!ghResponse.ok) {
      const status = ghResponse.status;
      return json({ error: status === 401 || status === 403 ? "GitHub token is invalid or lacks Issues write permission" : "GitHub could not create the issue" }, 502);
    }
    const issue = await ghResponse.json();
    return json({ success: true, issueUrl: issue.html_url, issueNumber: issue.number }, 201);
  }
};
