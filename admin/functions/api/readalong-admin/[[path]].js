import { validateAnalyticsBatch } from '../../lib/analytics.mjs';
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
  const expires = new Date(Date.now() + Math.max(0, maxAge) * 1000).toUTCString();
  return SESSION_COOKIE + "=" + value + "; Path=/; Max-Age=" + maxAge + "; Expires=" + expires + "; HttpOnly; Secure; SameSite=Lax";
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
  return row ? { tokenHash, expiresAt: Number(row.expires_at) } : null;
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
    add("error", "unsupported_format", "Định dạng tệp không được Read Along hỗ trợ.", "Thay tệp này thủ công bằng PDF hoặc định dạng audio được ứng dụng hỗ trợ, sau đó tải lại.");
    return issues;
  }
  if (size === 0) {
    add("error", "empty_file", "Tệp có dung lượng 0 byte, có thể upload chưa hoàn tất.", "Kiểm tra tệp gốc và tải lên lại.");
    return issues;
  }
  if (ext === ".wma") {
    add("warning", "playback_compatibility", "WMA có thể không phát được trên Android WebView.", "Thay tệp WMA thủ công bằng MP3 hoặc M4A/AAC được ứng dụng hỗ trợ.");
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

const SCAN_RULE_VERSION = "2026-10-31.1";

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
  // The root books.json is the catalog manifest, not a per-book timestamp sidecar.
  // Keep it out of binary validation, PDF/audio pairing, and scan findings.
  const listed = (await listAllObjects(bucket, prefix)).filter((object) => object.key !== "books.json");
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
        try {
          const cachedFindings = JSON.parse(previous.findings_json || "[]");
          skipped++;
          return { item, fp, findings: cachedFindings, cached: true };
        } catch { /* malformed cache is rechecked */ }
      }
      return { item, fp, findings: await inspectLibraryObject(bucket, item), cached: false };
    }));
    const statements = [];
    for (const result of inspected) {
      findings.push(...result.findings);
      if (!result.cached) changed.push(result.item.key);
      const retryRequired = result.findings.some((finding) => finding.code === "content_check_failed");
      if (!result.cached && !retryRequired) statements.push(db.prepare(
        "INSERT INTO admin_scan_cache (object_key, fingerprint, rule_version, findings_json, scanned_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(object_key) DO UPDATE SET fingerprint=excluded.fingerprint, rule_version=excluded.rule_version, findings_json=excluded.findings_json, scanned_at=excluded.scanned_at"
      ).bind(result.item.key, result.fp, SCAN_RULE_VERSION, JSON.stringify(result.findings), Date.now()));
      if (retryRequired) await db.prepare("DELETE FROM admin_scan_cache WHERE object_key = ?").bind(result.item.key).run();
    }
    if (statements.length) await db.batch(statements);
  }
  if (stale.length) {
    for (let i = 0; i < stale.length; i += 50) {
      await db.batch(stale.slice(i, i + 50).map((key) => db.prepare("DELETE FROM admin_scan_cache WHERE object_key = ?").bind(key)));
    }
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
      similarity:Math.round(best.score*100),...(best.score>=0.95?{suggestedRename}:{}),
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

  if (route === "usage/track" && method === "OPTIONS") {
    return new Response(null, { status: 204, headers: {
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400"
    }});
  }
  if (route === "usage/track" && method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const installId = String(body.installId || ""), launchId = String(body.launchId || "");
    const platform = ["android", "ios", "web"].includes(body.platform) ? body.platform : "other";
    const appVersion = /^[0-9A-Za-z.+-]{1,40}$/.test(String(body.appVersion || "")) ? String(body.appVersion) : "unknown";
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(installId) || !/^[A-Za-z0-9_-]{16,100}$/.test(launchId)) return json({ error: "Invalid anonymous identifier" }, 400);
    const installHash = await sha256(installId), launchHash = await sha256(launchId), now = Date.now();
    const inserted = await env.DB.prepare("INSERT OR IGNORE INTO admin_app_visits (launch_hash, install_hash, platform, app_version, visited_at) VALUES (?, ?, ?, ?, ?)")
      .bind(launchHash, installHash, platform, appVersion, now).run();
    if (Number(inserted.meta?.changes || 0) > 0) {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO admin_app_installations (install_hash, first_seen, last_seen, platform, app_version) VALUES (?, ?, ?, ?, ?) ON CONFLICT(install_hash) DO UPDATE SET last_seen=excluded.last_seen, platform=excluded.platform, app_version=excluded.app_version")
          .bind(installHash, now, now, platform, appVersion),
        env.DB.prepare("UPDATE admin_app_totals SET total_visits = total_visits + 1 WHERE id = 1"),
        env.DB.prepare("INSERT INTO admin_app_platform_totals (platform, total_visits) VALUES (?, 1) ON CONFLICT(platform) DO UPDATE SET total_visits = total_visits + 1").bind(platform)
      ]);
    }
    await env.DB.prepare("DELETE FROM admin_app_visits WHERE visited_at < ?").bind(now - 90 * 86400000).run();
    return json({ ok: true, recorded: Number(inserted.meta?.changes || 0) > 0 });
  }
  if (route === "usage/stats" && method === "GET") {
    // Prefer the published manifest; fall back to actual R2 objects when it is missing, empty or invalid.
    let manifest = null;
    try {
      const object = await env.READALONG.get("books.json");
      if (object) {
        const parsed = JSON.parse(await object.text());
        if (Array.isArray(parsed.books) && parsed.books.length) manifest = parsed;
      }
    } catch {
      // An unreadable manifest is handled by the inventory fallback.
    }
    let counts, source;
    if (manifest) {
      const books = manifest.books;
      counts = {
        books: books.length,
        pdfs: books.filter(book => typeof book.pdf === "string" && book.pdf).length,
        audios: books.reduce((sum, book) => sum + (Array.isArray(book.audios) ? book.audios.length : 0), 0),
        sync: books.filter(book => typeof book.sync === "string" && book.sync).length
      };
      source = "manifest";
    } else {
      const inventory = { pdfs: 0, audios: 0, sync: 0, objects: 0 };
      const audioExtensions = new Set([".mp3", ".m4a", ".m4b", ".aac", ".wav", ".ogg", ".oga", ".opus", ".flac", ".wma"]);
      let cursor;
      do {
        const page = await env.READALONG.list({ limit: 1000, ...(cursor ? { cursor } : {}) });
        for (const item of page.objects || []) {
          inventory.objects++;
          const key = String(item.key || "");
          const ext = extensionOf(key);
          if (ext === ".pdf") inventory.pdfs++;
          else if (audioExtensions.has(ext)) inventory.audios++;
          else if (ext === ".json" && key !== "books.json") inventory.sync++;
        }
        cursor = page.truncated ? page.cursor : undefined;
        if (inventory.objects > 10000) throw new Error("R2 inventory exceeds 10,000 objects; refusing incomplete statistics.");
      } while (cursor);
      counts = { books: inventory.pdfs, pdfs: inventory.pdfs, audios: inventory.audios, sync: inventory.sync };
      source = "r2_inventory";
    }
    const now = Date.now();
    const [totals, devices, recentVisits, recentDevices] = await Promise.all([
      env.DB.prepare("SELECT total_visits FROM admin_app_platform_totals WHERE platform = 'android'").first(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM admin_app_installations WHERE platform = 'android'").first(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM admin_app_visits WHERE visited_at >= ? AND platform = 'android'").bind(now - 30 * 86400000).first(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM admin_app_installations WHERE last_seen >= ? AND platform = 'android'").bind(now - 30 * 86400000).first()
    ]);
    return json({
      ...counts, source,
      totalVisits: Number(totals?.total_visits || 0), visits30d: Number(recentVisits?.total || 0),
      totalDevices: Number(devices?.total || 0), devices30d: Number(recentDevices?.total || 0),
      updatedAt: new Date().toISOString()
    });
  }
  if (route === "analytics/events" && method === "OPTIONS") {
    return new Response(null, { status: 204, headers: {
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400"
    }});
  }
  if (route === "analytics/events" && method === "POST") {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 65536) return json({ error: "Request too large" }, 413);
    let raw = "", body;
    try {
      const reader = request.body?.getReader();
      if (!reader) return json({ error: "Request body required" }, 400);
      const decoder = new TextDecoder();
      let totalBytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        totalBytes += chunk.value.byteLength;
        if (totalBytes > 65536) {
          await reader.cancel();
          return json({ error: "Request too large" }, 413);
        }
        raw += decoder.decode(chunk.value, { stream: true });
      }
      raw += decoder.decode();
      body = JSON.parse(raw);
    } catch { return json({ error: "Invalid JSON" }, 400); }
    const validation = validateAnalyticsBatch(body);
    if (!validation.valid) return json({ error: validation.error }, 400);

    const now = Date.now();
    const installHash = await sha256(validation.installId);
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM admin_reading_events WHERE install_hash = ? AND received_at >= ?"
    ).bind(installHash, now - 60 * 60 * 1000).first();
    if (Number(recent?.total || 0) + body.events.length > 150) {
      return json({ error: "Analytics rate limit exceeded" }, 429);
    }

    const statements = [];
    for (const event of body.events) {
      statements.push(env.DB.prepare(
        "INSERT OR IGNORE INTO admin_reading_events (event_id, session_id, install_hash, sequence, event_type, occurred_at, received_at, platform, app_version, reading_seconds, listening_seconds, book_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        event.eventId, event.sessionId, installHash, event.sequence, event.type,
        event.occurredAt, now, event.platform, event.appVersion,
        event.readingSeconds || 0, event.listeningSeconds || 0, event.bookId || null
      ));
      // SQLite changes() excludes rows written by triggers, unlike D1 meta.changes.
      statements.push(env.DB.prepare("SELECT changes() AS inserted"));
    }
    statements.push(env.DB.prepare(
      "DELETE FROM admin_reading_events WHERE received_at < ?"
    ).bind(now - 90 * 86400000));
    statements.push(env.DB.prepare(
      "DELETE FROM admin_reading_daily_sessions WHERE day_utc < date('now', '-24 months')"
    ));
    statements.push(env.DB.prepare(
      "DELETE FROM admin_reading_daily WHERE day_utc < date('now', '-24 months')"
    ));
    const results = await env.DB.batch(statements);
    let accepted = 0;
    for (let index = 0; index < body.events.length; index++) {
      accepted += Number(results[index * 2 + 1]?.results?.[0]?.inserted || 0);
    }
    return json({ ok: true, accepted, duplicates: body.events.length - accepted });
  }

  if (route === "telemetry/events" && method === "POST") {
    assertOrigin(request);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!Array.isArray(body.events) || body.events.length > 25) return json({ error: "Invalid event batch" }, 400);
    const rayId = request.headers.get("cf-ray") || null, statements = [];
    for (const event of body.events) {
      const type = String(event?.type || "").slice(0, 80);
      if (!/^[a-zA-Z0-9_.-]+$/.test(type)) continue;
      const details = {};
      for (const [key, value] of Object.entries(event.details || {}).slice(0, 30)) {
        if (/otp|cookie|token|secret|password|authorization/i.test(key)) continue;
        details[key] = typeof value === "string" ? value.replace(/(otp|cookie|token|secret|password)\s*[:=]\s*[^\s,;]+/ig, "$1=[redacted]").slice(0, 500)
          : (typeof value === "number" || typeof value === "boolean" || value === null ? value : String(value).slice(0, 200));
      }
      statements.push(env.DB.prepare("INSERT INTO admin_client_events (event_type, details_json, ray_id, created_at) VALUES (?, ?, ?, ?)")
        .bind(type, JSON.stringify(details).slice(0, 3000), rayId, Date.now()));
    }
    if (statements.length) await env.DB.batch(statements);
    await env.DB.prepare("DELETE FROM admin_client_events WHERE id NOT IN (SELECT id FROM admin_client_events ORDER BY created_at DESC LIMIT 5000)").run();
    return json({ ok: true, accepted: statements.length });
  }

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
    const token = getCookie(request, SESSION_COOKIE);
    const cookiePresent = !!token;
    const session = await authenticate(request, env);
    const now = Date.now();
    if (!session) return json({
      authenticated: false, cookiePresent, expiresAt: null, expiresIn: 0,
      reason: cookiePresent ? "expired_or_unknown" : "cookie_missing"
    });
    // Sliding idle timeout: renew both the D1 expiry and browser cookie whenever
    // the session is checked. The browser never stores the session token in JS.
    const expiresAt = now + SESSION_TTL * 1000;
    await env.DB.prepare("UPDATE admin_sessions SET expires_at = ? WHERE token_hash = ?")
      .bind(expiresAt, session.tokenHash).run();
    return json({
      authenticated: true, cookiePresent: true, expiresAt,
      expiresIn: SESSION_TTL, reason: "valid"
    }, 200, { "set-cookie": cookie(token, SESSION_TTL) });
  }

  if (route === "logout" && method === "POST") {
    assertOrigin(request);
    const token = getCookie(request, SESSION_COOKIE);
    if (token) await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": cookie("", 0) });
  }

  // Public read-only dashboard: returns aggregate usage and library health only; all mutations remain behind OTP.
  if (route === "analytics/dashboard" && method === "GET") {
    const parseDay = value => {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const date = new Date(value + "T00:00:00.000Z");
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
    };
    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const defaultStart = new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10);
    const startText = url.searchParams.get("start") || defaultStart;
    const endText = url.searchParams.get("end") || defaultEnd;
    const startDate = parseDay(startText), endDate = parseDay(endText);
    if (!startDate || !endDate || startText > endText) return json({ error: "Invalid date range" }, 400);
    const startMs = startDate.getTime(), endExclusive = endDate.getTime() + 86400000;
    if (endExclusive - startMs > 731 * 86400000) return json({ error: "Date range cannot exceed 24 months" }, 400);
    const cutoff = Date.now() - 90 * 86400000;
    const [daily, totals, breakdown, latestScan, manifestObject] = await Promise.all([
      env.DB.prepare("SELECT day_utc, reading_seconds, listening_seconds, event_count, session_count FROM admin_reading_daily WHERE day_utc >= ? AND day_utc <= ? ORDER BY day_utc ASC")
        .bind(startText, endText).all(),
      env.DB.prepare("SELECT MIN(day_utc) AS first_day, MAX(day_utc) AS last_day, COUNT(*) AS days_with_data FROM admin_reading_daily WHERE day_utc >= ? AND day_utc <= ?")
        .bind(startText, endText).first(),
      env.DB.prepare("SELECT platform, COUNT(DISTINCT install_hash) AS devices, COUNT(DISTINCT session_id) AS sessions, SUM(reading_seconds) AS reading_seconds, SUM(listening_seconds) AS listening_seconds, COUNT(*) AS events FROM admin_reading_events WHERE received_at >= ? AND received_at < ? GROUP BY platform ORDER BY events DESC LIMIT 20")
          .bind(Math.max(startMs, cutoff), endExclusive).all(),
      env.DB.prepare("SELECT status, scanned, errors, warnings, duration_ms, rule_version, created_at FROM admin_scan_logs WHERE prefix = '' ORDER BY created_at DESC LIMIT 1").first(),
      env.READALONG.get("books.json")
    ]);
    const rows = daily.results || [];
    const readingSeconds = rows.reduce((sum, row) => sum + Number(row.reading_seconds || 0), 0);
    const listeningSeconds = rows.reduce((sum, row) => sum + Number(row.listening_seconds || 0), 0);
    const eventCount = rows.reduce((sum, row) => sum + Number(row.event_count || 0), 0);
    const rawAvailable = endExclusive > cutoff;
    const breakdownRows = breakdown.results || [];
    let libraryStats = { books: null, pdfs: null, audioParts: null, syncedBooks: null, status: "invalid_manifest" };
    try {
      if (manifestObject) {
        const manifest = JSON.parse(await manifestObject.text());
        if (Array.isArray(manifest.books)) libraryStats = {
          books: manifest.books.length,
          pdfs: manifest.books.filter(book => typeof book.pdf === "string" && book.pdf).length,
          audioParts: manifest.books.reduce((sum, book) => sum + (Array.isArray(book.audios) ? book.audios.length : 0), 0),
          syncedBooks: manifest.books.filter(book => typeof book.sync === "string" && book.sync).length,
          status: "published_manifest"
        };
      } else libraryStats.status = "manifest_missing";
    } catch {}
    return json({
      start: startText, end: endText, timezone: "UTC",
      hasData: rows.length > 0 && eventCount > 0,
      summary: {
        readingSeconds, listeningSeconds, totalSeconds: readingSeconds + listeningSeconds,
        eventCount,
        activeDevices: rawAvailable ? breakdownRows.reduce((sum, row) => sum + Number(row.devices || 0), 0) : null
      },
      daily: rows.map(row => ({
        day: row.day_utc, readingSeconds: Number(row.reading_seconds || 0),
        listeningSeconds: Number(row.listening_seconds || 0),
        eventCount: Number(row.event_count || 0)
      })),
      breakdown: {
        available: rawAvailable,
        rawRetentionDays: 90,
        platforms: breakdownRows.reduce((items, row) => {
          const key = row.platform || "unknown";
          let item = items.find(entry => entry.platform === key);
          if (!item) { item = { platform: key, devices: 0, sessions: 0, readingSeconds: 0, listeningSeconds: 0, events: 0 }; items.push(item); }
          item.devices += Number(row.devices || 0);
          item.sessions += Number(row.sessions || 0);
          item.readingSeconds += Number(row.reading_seconds || 0);
          item.listeningSeconds += Number(row.listening_seconds || 0);
          item.events += Number(row.events || 0);
          return items;
        }, []),
        note: !rawAvailable ? "Dữ liệu chi tiết đã quá thời hạn 90 ngày; chỉ còn số tổng hợp theo ngày." : startMs < cutoff ? "Phân bổ nền tảng và thiết bị chỉ tính phần giao với 90 ngày gần nhất; thời lượng vẫn lấy tổng hợp toàn kỳ." : "Phân bổ nền tảng và thiết bị lấy từ dữ liệu chi tiết trong khoảng chọn (tối đa 90 ngày)."
      },
      library: libraryStats,
      latestScan: latestScan ? {
        status: latestScan.status, scanned: Number(latestScan.scanned || 0),
        errors: Number(latestScan.errors || 0), warnings: Number(latestScan.warnings || 0),
        durationMs: Number(latestScan.duration_ms || 0), ruleVersion: latestScan.rule_version,
        createdAt: new Date(Number(latestScan.created_at)).toISOString()
      } : null,
      coverage: {
        firstDay: totals?.first_day || null, lastDay: totals?.last_day || null,
        daysWithData: Number(totals?.days_with_data || 0),
        rawFrom: new Date(Math.max(startMs, cutoff)).toISOString().slice(0, 10),
        rawAvailable
      },
      generatedAt: new Date().toISOString()
    });
  }

  const auth = await requireAuth(request, env);
  if (auth.response) return auth.response;




  if (route === "catalog/preview" && method === "GET") {
    // Build from the current R2 inventory; never use the checked-in seed manifest.
    const scan = await scanLibrary(env.READALONG, "", env.DB);
    const keys = (await listAllKeys(env.READALONG, "")).filter(key => key !== "books.json" && !key.endsWith("/"));
    const normalize = value => String(value || "").normalize("NFKC").replace(/\.[^/.]+$/, "")
      .replace(/[_-]+/g, " ").replace(/[’']/g, "").replace(/\bread\s+along\b/gi, " ")
      .replace(/\bbook\b/gi, " ").replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ").trim().toLocaleLowerCase("vi");
    const badKeys = new Set(scan.findings.filter(item => item.severity === "error").map(item => item.key));
    const groups = new Map();
    for (const key of keys) {
      const ext = extensionOf(key);
      if (ext !== ".pdf" && ext !== ".json" && (!AUDIO_EXTENSIONS.has(ext) || ext === ".wma")) continue;
      const file = key.split("/").pop();
      const stem = file.replace(/\.[^.]+$/, "");
      const dir = key.includes("/") ? key.slice(0, key.lastIndexOf("/") + 1) : "";
      const partMatch = ext !== ".pdf" && ext !== ".json" ? stem.match(/(?:_P(\d+)|[_ -](?:side|part|pt|disc)[ _.-]*(\d+))$/i) : null;
      const base = partMatch ? stem.slice(0, partMatch.index) : stem;
      const normalized = normalize(ext === ".json" ? base.replace(/[_-]sync$/i, "") : base);
      if (!normalized) continue;
      const groupKey = dir + "|" + normalized;
      if (!groups.has(groupKey)) groups.set(groupKey, { dir, normalized, pdf: [], audios: [], sync: [] });
      const group = groups.get(groupKey);
      const item = { key, stem, ext, part: partMatch ? Number(partMatch[1] || partMatch[2]) : null, partStyle: partMatch ? (partMatch[1] ? "P" : "legacy") : null };
      if (ext === ".pdf") group.pdf.push(item);
      else if (ext === ".json") group.sync.push(item);
      else group.audios.push(item);
    }
    const books = [], excluded = [];
    const encodeKey = key => key.split("/").map(encodeURIComponent).join("/");
    for (const group of groups.values()) {
      const label = group.pdf[0]?.stem || group.audios[0]?.stem || group.sync[0]?.stem || group.normalized;
      const reasons = [];
      if (group.pdf.length !== 1) reasons.push(group.pdf.length ? "Có nhiều PDF trùng tên" : "Thiếu PDF");
      if (!group.audios.length) reasons.push("Thiếu audio");
      if (group.sync.length > 1) reasons.push("Có nhiều JSON đồng bộ trùng tên");
      const selected = [...group.pdf, ...group.audios, ...group.sync];
      const invalid = selected.filter(item => badKeys.has(item.key));
      if (invalid.length) reasons.push("Có tệp bị đánh dấu lỗi khi quét: " + invalid.map(item => item.key).join(", "));
      if (reasons.length) {
        excluded.push({ title: label, files: selected.map(item => item.key), reasons });
        continue;
      }
      group.audios.sort((a,b) => {
        if (a.part !== null && b.part !== null) return a.part-b.part || a.key.localeCompare(b.key);
        if (a.part !== null) return -1;
        if (b.part !== null) return 1;
        return a.key.localeCompare(b.key, "vi", { numeric: true, sensitivity: "base" });
      });
      const title = group.pdf[0].stem.replace(/[_-]+/g, " ").replace(/\bread\s+along\b/ig, "").replace(/\s+/g, " ").trim();
      const slug = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "book";
      const id = "book-" + slug + "-" + (await sha256(group.pdf[0].key)).slice(0, 8);
      const host = "https://pub-763a3a5ae235415cbef15b64f7a20820.r2.dev/";
      books.push({
        id, title,
        pdf: host + encodeKey(group.pdf[0].key),
        audios: group.audios.map(item => host + encodeKey(item.key)),
        sync: group.sync.length ? host + encodeKey(group.sync[0].key) : null
      });
    }
    books.sort((a,b) => a.title.localeCompare(b.title, "vi", { sensitivity: "base" }));
    return json({ ok: true, manifest: { books }, included: books.length, excluded, scanned: scan.scanned, errors: scan.errors, warnings: scan.warnings, checkedAt: scan.checkedAt });
  }

  if (route === "catalog/publish" && method === "POST") {
    assertOrigin(request);
    let manifest;
    try { manifest = await request.json(); } catch { return json({ error: "books.json không phải JSON hợp lệ" }, 400); }
    if (!manifest || !Array.isArray(manifest.books) || !manifest.books.length || manifest.books.length > 1000) {
      return json({ error: "Manifest phải có mảng books từ 1 đến 1.000 mục" }, 400);
    }
    const ids = new Set(), refs = [];
    const allowedHost = "pub-763a3a5ae235415cbef15b64f7a20820.r2.dev";
    const resolveRef = (value, extensions, label) => {
      if (value === null && extensions.includes(".json")) return null;
      if (typeof value !== "string") throw new Error(label + " phải là URL hoặc null");
      let parsed, key;
      try { parsed = new URL(value); key = decodeURIComponent(parsed.pathname.slice(1)); } catch { throw new Error(label + " có URL không hợp lệ"); }
      if (parsed.protocol !== "https:" || parsed.hostname !== allowedHost || parsed.search || parsed.hash ||
          !validKey(key) || !extensions.includes(extensionOf(key))) throw new Error(label + " không thuộc kho R2 hợp lệ");
      refs.push({ key, label });
      return value;
    };
    const normalized = [];
    try {
      for (const book of manifest.books) {
        if (!book || typeof book !== "object" || typeof book.id !== "string" || !book.id.trim() ||
            typeof book.title !== "string" || !book.title.trim() || ids.has(book.id) ||
            !Array.isArray(book.audios) || !book.audios.length) throw new Error("Mỗi sách cần id/title duy nhất và ít nhất một audio");
        ids.add(book.id);
        normalized.push({
          id: book.id.trim(), title: book.title.trim(),
          pdf: resolveRef(book.pdf, [".pdf"], "PDF của " + book.title),
          audios: book.audios.map((value, index) => resolveRef(value, [".mp3",".m4a",".m4b",".aac",".wav",".ogg",".oga",".opus",".flac"], "Audio " + (index+1) + " của " + book.title)),
          sync: resolveRef(book.sync ?? null, [".json"], "Sync của " + book.title)
        });
      }
    } catch (error) { return json({ error: error.message }, 400); }
    for (let i = 0; i < refs.length; i += 12) {
      const batch = await Promise.all(refs.slice(i, i + 12).map(async ref => ({ ...ref, exists: !!(await env.READALONG.head(ref.key)) })));
      const missing = batch.filter(item => !item.exists);
      if (missing.length) return json({ error: "Không tìm thấy " + missing.length + " tệp trong R2: " + missing.slice(0, 8).map(item => item.key).join(", "), missing: missing.map(item => item.key) }, 409);
    }
    const output = JSON.stringify({ books: normalized }, null, 2) + "\n";
    await env.READALONG.put("books.json", output, { httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" } });
    await audit(env, "publish_books_manifest", "books.json", { books: normalized.length, files: refs.length });
    return json({ ok: true, key: "books.json", books: normalized.length, files: refs.length, bytes: new TextEncoder().encode(output).length });
  }

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

  if (route === "files/all" && method === "GET") {
    const startedAt=Date.now(), requestId=crypto.randomUUID(), rayId=request.headers.get("cf-ray")||null;
    const prefix=url.searchParams.get("prefix")||"";
    try {
      if(prefix&&!validKey(prefix.endsWith("/")?prefix.slice(0,-1):prefix)) return json({error:"Invalid folder path",requestId,rayId},400);
      const normalized=prefix?(prefix.endsWith("/")?prefix:prefix+"/"):"";
      const folders=new Set(), files=[];
      let cursor, scanned=0;
      do {
        const result=await env.READALONG.list({prefix:normalized,delimiter:"/",limit:1000,...(cursor?{cursor}:{})});
        for(const key of result.delimitedPrefixes||[]) folders.add(key);
        for(const object of result.objects||[]) {
          if(object.key===normalized||object.key.endsWith("/")) continue;
          files.push({key:object.key,name:object.key.slice(normalized.length),type:"file",size:object.size,uploaded:object.uploaded,contentType:object.httpMetadata?.contentType||""});
        }
        scanned += (result.objects||[]).length + (result.delimitedPrefixes||[]).length;
        if(scanned>5000) throw new Error("Thư mục có hơn 5.000 mục; hãy thu hẹp bằng cách mở thư mục con.");
        cursor=result.truncated?result.cursor:undefined;
      } while(cursor);
      const folderItems=[...folders].map(key=>({key,name:key.slice(normalized.length).replace(/\/$/,""),type:"folder"}));
      await env.DB.prepare("INSERT INTO admin_library_requests (request_id,prefix,page_size,cursor_present,folders_count,files_count,truncated,status,duration_ms,ray_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(requestId,normalized,5000,0,folderItems.length,files.length,0,200,Date.now()-startedAt,rayId,Date.now()).run();
      return json({prefix:normalized,folders:folderItems,files,truncated:false,total:folderItems.length+files.length,requestId,rayId});
    } catch(error) {
      const message=String(error?.message||"Library listing failed").slice(0,800);
      try { await env.DB.prepare("INSERT INTO admin_library_requests (request_id,prefix,page_size,cursor_present,folders_count,files_count,truncated,status,duration_ms,ray_id,error_message,created_at) VALUES (?,?,?,?,0,0,0,?,?,?,?,?)")
        .bind(requestId,prefix,5000,0,500,Date.now()-startedAt,rayId,message,Date.now()).run(); } catch {}
      return json({error:message,requestId,rayId},message.includes("5.000")?413:500);
    }
  }

  if (route === "files" && method === "GET") {
    const startedAt=Date.now(), requestId=crypto.randomUUID(), rayId=request.headers.get("cf-ray")||null;
    const prefix=url.searchParams.get("prefix")||"";
    const cursorPresent=!!url.searchParams.get("cursor");
    let pageSize=25;
    try {
      if(prefix&&!validKey(prefix.endsWith("/")?prefix.slice(0,-1):prefix)) return json({error:"Invalid folder path",requestId,rayId},400);
      const normalized=prefix?(prefix.endsWith("/")?prefix:prefix+"/"):"";
      const requestedCursor=url.searchParams.get("cursor")||undefined;
      const requestedLimit=Number(url.searchParams.get("limit")||25);
      pageSize=[25,50,100].includes(requestedLimit)?requestedLimit:25;
      const result=await env.READALONG.list({prefix:normalized,delimiter:"/",limit:pageSize,...(requestedCursor?{cursor:requestedCursor}:{})});
      const folders=(result.delimitedPrefixes||[]).map(key=>({key,name:key.slice(normalized.length),type:"folder"}));
      const files=result.objects.filter(obj=>obj.key!==normalized&&!obj.key.endsWith("/")).map(obj=>({key:obj.key,name:obj.key.slice(normalized.length),type:"file",size:obj.size,uploaded:obj.uploaded,contentType:obj.httpMetadata?.contentType||""}));
      await env.DB.prepare("INSERT INTO admin_library_requests (request_id,prefix,page_size,cursor_present,folders_count,files_count,truncated,status,duration_ms,ray_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(requestId,normalized,pageSize,cursorPresent?1:0,folders.length,files.length,result.truncated?1:0,200,Date.now()-startedAt,rayId,Date.now()).run();
      return json({prefix:normalized,folders,files,truncated:result.truncated,cursor:result.cursor||null,pageSize,requestId,rayId});
    } catch(error) {
      const message=String(error?.message||"Library listing failed").slice(0,800);
      try {
        await env.DB.prepare("INSERT INTO admin_library_requests (request_id,prefix,page_size,cursor_present,folders_count,files_count,truncated,status,duration_ms,ray_id,error_message,created_at) VALUES (?,?,?,?,0,0,0,?,?,?,?,?)")
          .bind(requestId,prefix,pageSize,cursorPresent?1:0,500,Date.now()-startedAt,rayId,message,Date.now()).run();
      } catch {}
      return json({error:message,requestId,rayId},500);
    }
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
  const request = context.request, origin = request.headers.get("Origin") || "";
  const allowedOrigins = new Set(["https://localhost", "http://localhost", "capacitor://localhost"]);
  const corsAllowed = allowedOrigins.has(origin);
  const requestPath = new URL(request.url).pathname;
  if ((requestPath.endsWith("/usage/track") || requestPath.endsWith("/analytics/events")) && origin && !corsAllowed) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: { "content-type": "application/json" } });
  }
  try {
    const response = await handle(request, context.env), headers = new Headers(response.headers);
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "no-referrer");
    headers.set("cache-control", "no-store");
    if (corsAllowed) { headers.set("access-control-allow-origin", origin); headers.append("vary", "Origin"); }
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    const rayId = request.headers.get("cf-ray") || null;
    const message = String(error?.message || "Unhandled server exception").replace(/(otp|cookie|token|secret|password)\s*[:=]\s*[^\s,;]+/ig, "$1=[redacted]").slice(0, 1000);
    try {
      await context.env.DB?.prepare("INSERT INTO admin_server_errors (route, message, ray_id, created_at) VALUES (?, ?, ?, ?)")
        .bind(new URL(request.url).pathname.slice(0, 180), message, rayId, Date.now()).run();
      await context.env.DB?.prepare("DELETE FROM admin_server_errors WHERE id NOT IN (SELECT id FROM admin_server_errors ORDER BY created_at DESC LIMIT 2000)").run();
    } catch {}
    const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    if (corsAllowed) { headers.set("access-control-allow-origin", origin); headers.append("vary", "Origin"); }
    return new Response(JSON.stringify({ error: "Internal server error", rayId }), { status: 500, headers });
  }
}
