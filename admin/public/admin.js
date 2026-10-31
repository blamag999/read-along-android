const API = "/api/readalong-admin";
const CHUNK_SIZE = 8 * 1024 * 1024;
const allowed = /\.(pdf|json|mp3|m4a|m4b|aac|wav|ogg|oga|opus|flac|wma)$/i;
let currentPrefix = "";
let filePageCursors = [null];
let filePageIndex = 0;
let nextFileCursor = null;
let allLibraryEntries = [];
let filteredLibraryEntries = [];
let dialogResolve = null;
let pageSize = [25, 50, 100].includes(Number(sessionStorage.getItem("readalong-page-size"))) ? Number(sessionStorage.getItem("readalong-page-size")) : 25;
let clientLogs = [];
let fileLoadSequence = 0;
let telemetryEventQueue = [];
let telemetryFlushScheduled = false;

const $ = (id) => document.getElementById(id);
const show = (id, visible) => $(id).classList.toggle("hidden", !visible);
const setStatus = (message, error = false) => {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
};
const api = async (path, options = {}) => {
  const started = performance.now();
  let response = null, data = {}, failure = "";
  try {
    response = await fetch(API + "/" + path, { credentials: "same-origin", ...options });
    data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      queueTelemetryEvent("auth_api_unauthorized", { path: String(path).split("?")[0], status: 401 });
      show("managerPanel", false); show("loginPanel", true); show("homePanel", false);
      show("logoutBtn", false); show("homeBtn", false);
    }
    if (!response.ok) {
      const error = new Error(data.error || "Yêu cầu thất bại (" + response.status + ")");
      error.rayId = response.headers.get("cf-ray") || data.rayId || "";
      throw error;
    }
    return data;
  } catch (error) {
    failure = error.message || String(error);
    throw error;
  } finally {
    const log = {
      at: new Date().toISOString(),
      method: String(options.method || "GET").toUpperCase(),
      path: String(path).split("?")[0],
      status: response ? response.status : "NETWORK",
      durationMs: Math.round(performance.now() - started),
      rayId: response?.headers.get("cf-ray") || data.rayId || "",
      error: failure
    };
    clientLogs.unshift(log);
    clientLogs = clientLogs.slice(0, 100);
    queueTelemetryEvent("api_request", log);
  }
};
const postJson = (path, body) => api(path, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});
const formatSize = (size) => {
  if (!Number.isFinite(size)) return "—";
  if (size < 1024) return size + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return value.toFixed(value >= 10 ? 1 : 2) + " " + units[unit];
};
const formatDate = (value) => value ? new Date(value).toLocaleString("vi-VN") : "—";

function confirmAction(title, message, accept = "Xác nhận") {
  $("dialogTitle").textContent = title;
  $("dialogText").textContent = message;
  $("acceptDialog").textContent = accept;
  show("confirmDialog", true);
  return new Promise((resolve) => { dialogResolve = resolve; });
}
$("cancelDialog").addEventListener("click", () => { show("confirmDialog", false); dialogResolve?.(false); dialogResolve = null; });
$("acceptDialog").addEventListener("click", () => { show("confirmDialog", false); dialogResolve?.(true); dialogResolve = null; });

function queueTelemetryEvent(type, details = {}) {
  telemetryEventQueue.push({ type: String(type).slice(0,80), details });
  if (telemetryEventQueue.length>100) telemetryEventQueue=telemetryEventQueue.slice(-100);
  if (telemetryFlushScheduled) return;
  telemetryFlushScheduled=true; setTimeout(flushTelemetryEvents,250);
}
async function flushTelemetryEvents() {
  telemetryFlushScheduled=false;
  if (!telemetryEventQueue.length) return;
  const events=telemetryEventQueue.splice(0,25);
  try {
    const response=await fetch(API+"/telemetry/events",{method:"POST",credentials:"same-origin",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify({events})});
    if(!response.ok) {
      clientLogs.unshift({at:new Date().toISOString(),method:"POST",path:"telemetry/events",status:response.status,durationMs:0,rayId:response.headers.get("cf-ray")||"",error:"Không đồng bộ được log sự kiện"});
      clientLogs=clientLogs.slice(0,100);
    }
  } catch(error) {
    clientLogs.unshift({at:new Date().toISOString(),method:"POST",path:"telemetry/events",status:"NETWORK",durationMs:0,rayId:"",error:String(error.message||error)});
    clientLogs=clientLogs.slice(0,100);
  }
  if(telemetryEventQueue.length&&!telemetryFlushScheduled){telemetryFlushScheduled=true;setTimeout(flushTelemetryEvents,250);}
}
window.addEventListener("error",event=>queueTelemetryEvent("javascript_error",{message:String(event.message||"Unknown error").slice(0,500),source:String(event.filename||"").split("/").pop().slice(0,120),line:event.lineno||0,column:event.colno||0}));
window.addEventListener("unhandledrejection",event=>queueTelemetryEvent("unhandled_promise_rejection",{reason:String(event.reason?.message||event.reason||"Unknown rejection").slice(0,500)}));

let sessionHeartbeatStarted=false;
function startSessionHeartbeat(){
  if(sessionHeartbeatStarted)return;
  sessionHeartbeatStarted=true;
  setInterval(async()=>{
    if(location.hash!=="#manage" || $("managerPanel").classList.contains("hidden")) return;
    try{
      const result=await api("session",{cache:"no-store"});
      if(!result.authenticated){
        queueTelemetryEvent("auth_session_expired_during_use",{reason:result.reason||"unknown",cookiePresent:!!result.cookiePresent,host:location.host});
        show("managerPanel",false);show("loginPanel",true);show("logoutBtn",false);
        $("loginError").textContent="Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.";
      }
    }catch(error){queueTelemetryEvent("auth_session_heartbeat_error",{error:String(error.message||error).slice(0,300)});}
  },5*60*1000);
}
async function checkSession() {
  const startedAt = performance.now();
  try {
    const result = await api("session", { cache: "no-store" });
    queueTelemetryEvent("auth_session_check", {
      authenticated: !!result.authenticated, cookiePresent: !!result.cookiePresent,
      reason: result.reason || "unknown", expiresIn: Number(result.expiresIn || 0),
      expiresAt: result.expiresAt || null, durationMs: Math.round(performance.now() - startedAt), host: location.host
    });
    show("loginPanel", !result.authenticated);
    show("managerPanel", result.authenticated);
    show("homePanel", false);
    show("logoutBtn", result.authenticated);
    show("homeBtn", result.authenticated);
    if (result.authenticated) {
      $("loginError").textContent = "";
      await loadFiles();
      startSessionHeartbeat();
    } else {
      $("loginError").textContent = result.reason === "cookie_missing"
        ? "Không tìm thấy cookie phiên đăng nhập trên hostname hiện tại. Hãy đăng nhập lại; nếu lỗi lặp lại sau khi tải lại trang, gửi thông tin lỗi tự động."
        : "Cookie phiên không còn hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại.";
    }
  } catch (error) {
    queueTelemetryEvent("auth_session_check_error", {
      error: String(error.message || error).slice(0, 500),
      durationMs: Math.round(performance.now() - startedAt), host: location.host
    });
    show("loginPanel", true);
    show("managerPanel", false);
    show("logoutBtn", false);
    show("homeBtn", false);
    $("loginError").textContent = "Không thể kiểm tra phiên đăng nhập do lỗi kết nối hoặc máy chủ: " + error.message + ". Đây chưa chắc là phiên đã hết hạn; hãy thử lại.";
  }
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("loginError").textContent = "";
  const code = $("otpCode").value.trim();
  try {
    await postJson("login", { code });
    queueTelemetryEvent("auth_login_success", { host: location.host });
    $("otpCode").value = "";
    show("loginPanel", false);
    show("managerPanel", true);
    show("logoutBtn", true);
    show("homeBtn", true);
    show("homePanel", false);
    await loadFiles();
    startSessionHeartbeat();
  } catch (error) {
    $("loginError").textContent = error.message;
  }
});

$("logoutBtn").addEventListener("click", async () => {
  try { await postJson("logout", {}); } catch {}
  queueTelemetryEvent("auth_logout", { host: location.host });
  show("managerPanel", false);
  show("loginPanel", false);
  show("homePanel", true);
  show("logoutBtn", false);
  show("homeBtn", false);
  location.hash = "";
  loadPublicStats();
});

$("homeBtn").addEventListener("click", () => { location.hash = ""; });
$("manageBtn").addEventListener("click", () => { location.hash = "manage"; });

function addCell(row, value) {
  const cell = document.createElement("td");
  if (value instanceof Node) cell.append(value);
  else cell.textContent = value ?? "";
  row.append(cell);
  return cell;
}
function actionButton(label, action, extra = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (extra) button.className = extra;
  button.addEventListener("click", action);
  return button;
}
function addEntry(row, entry) {
  const nameCell = document.createElement("td");
  if (entry.type === "folder") {
    const link = document.createElement("button");
    link.className = "folder-name";
    link.type = "button";
    link.textContent = "📁 " + entry.name;
    link.addEventListener("click", () => { setFolder(entry.key); loadFiles(); });
    nameCell.append(link);
  } else {
    nameCell.textContent = "📄 " + entry.name;
  }
  row.append(nameCell);
  addCell(row, entry.type === "folder" ? "Thư mục" : (entry.contentType || entry.key.split(".").pop().toUpperCase()));
  addCell(row, entry.type === "folder" ? "—" : formatSize(entry.size));
  addCell(row, entry.type === "folder" ? "—" : formatDate(entry.uploaded));
  const actions = document.createElement("div");
  actions.className = "row-actions";
  if (entry.type === "file") {
    actions.append(actionButton("Đổi tên / Di chuyển", () => renameEntry(entry)));
    actions.append(actionButton("Xóa", () => deleteFile(entry), "delete"));
  } else {
    actions.append(actionButton("Mở", () => { setFolder(entry.key); loadFiles(); }));
    actions.append(actionButton("Xóa thư mục", () => deleteFolder(entry), "delete"));
  }
  const actionCell = document.createElement("td");
  actionCell.append(actions);
  row.append(actionCell);
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").toLocaleLowerCase("vi");
}
function libraryAssetGroups(entries) {
  const folders = entries.filter(entry => entry.type === "folder");
  const files = entries.filter(entry => entry.type === "file");
  const groups = new Map(), ungrouped = [];
  const audioExtensions = new Set([".mp3", ".m4a", ".m4b", ".aac", ".wav", ".ogg", ".oga", ".opus", ".flac", ".wma"]);
  const extension = name => {
    const match = String(name || "").match(/\.[^.]+$/);
    return match ? match[0].toLowerCase() : "";
  };
  const normalize = value => String(value || "").normalize("NFKC")
    .replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ")
    .replace(/[’']/g, "").replace(/\bread\s+along\b/gi, " ")
    .replace(/\bbook\b/gi, " ").replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ").trim().toLocaleLowerCase("vi");
  for (const file of files) {
    if (file.key === "books.json") { ungrouped.push(file); continue; }
    const ext = extension(file.name);
    const isPdf = ext === ".pdf", isJson = ext === ".json", isAudio = audioExtensions.has(ext);
    if (!isPdf && !isJson && !isAudio) { ungrouped.push(file); continue; }
    const stem = file.name.replace(/\.[^.]+$/, "");
    const partMatch = !isPdf && !isJson ? stem.match(/(?:_P(\d+)|[_ -](?:side|part|pt|disc)[ _.-]*(\d+))$/i) : null;
    const base = partMatch ? stem.slice(0, partMatch.index) : stem;
    const normalized = normalize(isJson ? base.replace(/[_-]sync$/i, "") : base);
    if (!normalized) { ungrouped.push(file); continue; }
    const directory = file.key.slice(0, Math.max(0, file.key.lastIndexOf("/") + 1));
    const groupKey = directory + "|" + normalized;
    if (!groups.has(groupKey)) groups.set(groupKey, { key: groupKey, normalized, directory, pdf: [], audio: [], json: [], all: [] });
    const group = groups.get(groupKey);
    group.all.push(file);
    if (isPdf) group.pdf.push(file);
    else if (isJson) group.json.push(file);
    else group.audio.push({ ...file, part: partMatch ? Number(partMatch[1] || partMatch[2]) : null });
  }
  const sortFiles = (a,b) => a.name.localeCompare(b.name,"vi",{sensitivity:"base",numeric:true});
  const books = [...groups.values()].map(group => {
    group.pdf.sort(sortFiles); group.json.sort(sortFiles);
    group.audio.sort((a,b) => {
      if (Number.isInteger(a.part) && Number.isInteger(b.part)) return a.part-b.part || sortFiles(a,b);
      if (Number.isInteger(a.part)) return -1;
      if (Number.isInteger(b.part)) return 1;
      return sortFiles(a,b);
    });
    const representative = group.pdf[0] || group.audio[0] || group.json[0];
    const titleFile = group.pdf[0] || representative;
    let title = titleFile.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\bread\s+along\b/ig, "").replace(/\s+/g, " ").trim();
    const status = group.pdf.length > 1 || group.json.length > 1 ? "error"
      : !group.pdf.length || !group.audio.length ? "warning"
      : group.audio.some(file => extension(file.name) === ".wma") ? "compatibility" : "good";
    return { ...group, title: title || group.normalized, status };
  }).sort((a,b) => a.title.localeCompare(b.title,"vi",{sensitivity:"base",numeric:true}));
  return { folders: folders.sort(sortFiles), books, ungrouped: ungrouped.sort(sortFiles) };
}
const expandedLibraryGroups = new Set();
function libraryStatus(group) {
  if (group.status === "error") return ["Trùng file", "error"];
  if (group.status === "warning") return [!group.pdf.length ? "Thiếu PDF" : "Thiếu audio", "warning"];
  if (group.status === "compatibility") return ["Cần xử lý audio", "warning"];
  return ["Đủ file", "good"];
}
function appendLibraryFileRow(anchorRow, file, kind, label) {
  const row = document.createElement("tr");
  row.className = "library-file-row";
  const nameCell = document.createElement("td");
  nameCell.className = "library-child-name";
  nameCell.textContent = (kind === "pdf" ? "📕 " : kind === "audio" ? "🎧 " : "🧩 ") + file.name;
  row.append(nameCell);
  addCell(row, label);
  addCell(row, formatSize(file.size));
  addCell(row, formatDate(file.uploaded));
  const actions = document.createElement("div");
  actions.className = "row-actions";
  actions.append(actionButton("Đổi tên / Di chuyển", () => renameEntry(file)));
  actions.append(actionButton("Xóa", () => deleteFile(file), "delete"));
  const cell = document.createElement("td"); cell.append(actions); row.append(cell);
  anchorRow.after(row);
  return row;
}

const R2_PUBLIC_BASE = "https://pub-763a3a5ae235415cbef15b64f7a20820.r2.dev/";
let ffmpegInstance = null;
let ffmpegLoadPromise = null;
async function fetchAsBlobUrl(url, mimeType) {
  const response = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!response.ok) throw new Error("Không tải được thành phần chuyển đổi (" + response.status + ").");
  return URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: mimeType }));
}
async function getAudioConverter() {
  if (ffmpegInstance) return ffmpegInstance;
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      setStatus("Đang tải bộ chuyển đổi audio (chỉ tải khi cần)…");
      const { FFmpeg } = await import("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js");
      const ffmpeg = new FFmpeg();
      const workerURL = await fetchAsBlobUrl("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js", "text/javascript");
      const coreURL = await fetchAsBlobUrl("https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js", "text/javascript");
      const wasmURL = await fetchAsBlobUrl("https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm", "application/wasm");
      try {
        await ffmpeg.load({ classWorkerURL: workerURL, coreURL, wasmURL });
        ffmpegInstance = ffmpeg;
        return ffmpeg;
      } catch (error) {
        ffmpeg.terminate();
        throw error;
      } finally {
        URL.revokeObjectURL(workerURL);
        URL.revokeObjectURL(coreURL);
        URL.revokeObjectURL(wasmURL);
      }
    })().catch(error => {
      ffmpegLoadPromise = null;
      throw error;
    });
  }
  return ffmpegLoadPromise;
}
function r2PublicUrl(key) {
  return R2_PUBLIC_BASE + key.split("/").map(encodeURIComponent).join("/");
}
async function convertWmaGroup(group, button, reportProgress = () => {}) {
  const sources = group.audio.filter(file => /\.wma$/i.test(file.name));
  if (!sources.length) return;
  const destinations = sources.map(file => file.key.replace(/\.wma$/i, ".mp3"));
  const existing = new Set(allLibraryEntries.filter(entry => entry.type === "file").map(entry => entry.key));
  const conflict = destinations.find(key => existing.has(key));
  if (conflict) {
    reportProgress("Bị chặn: MP3 đích đã tồn tại.", 0, "error");
    setStatus("Không thể chuyển đổi: file đích đã tồn tại (" + conflict + "). Không ghi đè file MP3.", true);
    return;
  }
  if (sources.some(file => Number(file.size) > 256 * 1024 * 1024)) {
    reportProgress("Bị chặn: WMA vượt giới hạn 256 MB.", 0, "error");
    setStatus("Bộ sách có WMA lớn hơn 256 MB. Để tránh thiếu bộ nhớ trình duyệt, hãy chuyển file này bằng công cụ ngoài rồi tải MP3 lên.", true);
    return;
  }
  if (!await confirmAction("Chuyển đổi audio WMA?", "Sẽ chuyển " + sources.length + " file WMA trong bộ “" + group.title + "” sang MP3 ngay trên trình duyệt. File WMA gốc được giữ nguyên; file MP3 trùng tên sẽ không bị ghi đè. Cần kết nối mạng để tải bộ chuyển đổi lần đầu.", "Chuyển đổi và tải MP3 lên")) return;
  button.disabled = true;
  const oldLabel = button.textContent;
  let ffmpeg = null, completed = 0;
  const setProgress = (stage, percent, detail = "") => {
    const totalPercent = Math.max(0, Math.min(100, Math.round(((completed + percent / 100) / sources.length) * 100)));
    reportProgress(stage + " · " + (completed + 1) + "/" + sources.length + (detail ? " · " + detail : ""), totalPercent, "running");
  };
  try {
    reportProgress("Đang tải bộ chuyển đổi…", 0, "running");
    ffmpeg = await getAudioConverter();
    ffmpeg.on("progress", ({ progress }) => {
      setProgress("Đang giải mã và mã hóa MP3", Math.max(0, Math.min(100, Math.round((Number(progress) || 0) * 100))));
    });
    for (let index = 0; index < sources.length; index++) {
      const source = sources[index];
      const inputName = "readalong-input-" + index + ".wma";
      const outputName = "readalong-output-" + index + ".mp3";
      reportProgress("Đang tải WMA: " + source.name, Math.round(index / sources.length * 100), "running");
      const response = await fetch(r2PublicUrl(source.key), { mode: "cors", credentials: "omit" });
      if (!response.ok) throw new Error("Không tải được WMA " + source.name + " (" + response.status + ").");
      const input = new Uint8Array(await response.arrayBuffer());
      if (!input.length || input.length > 256 * 1024 * 1024) throw new Error("Kích thước WMA không hợp lệ hoặc vượt giới hạn bộ nhớ.");
      await ffmpeg.writeFile(inputName, input);
      reportProgress("Đang chuyển đổi: " + source.name, Math.round(index / sources.length * 100), "running");
      const exitCode = await ffmpeg.exec(["-y", "-i", inputName, "-map", "0:a:0", "-vn", "-c:a", "libmp3lame", "-q:a", "3", outputName]);
      if (exitCode !== 0) throw new Error("FFmpeg không giải mã được " + source.name + ". Có thể codec WMA không được hỗ trợ bởi bản engine này.");
      const output = await ffmpeg.readFile(outputName);
      if (!(output instanceof Uint8Array) || output.length < 128) throw new Error("MP3 đầu ra rỗng hoặc quá nhỏ: " + source.name);
      const hasId3 = output.length >= 3 && output[0] === 0x49 && output[1] === 0x44 && output[2] === 0x33;
      const hasMpegFrame = output.length >= 2 && output[0] === 0xff && (output[1] & 0xe0) === 0xe0;
      if (!hasId3 && !hasMpegFrame) throw new Error("Đầu ra không có chữ ký MP3 hợp lệ: " + source.name);
      const outputFile = new File([output], source.name.replace(/\.wma$/i, ".mp3"), { type: "audio/mpeg" });
      reportProgress("Đang tải MP3 lên R2: " + outputFile.name, Math.round(index / sources.length * 100), "running");
      await uploadOne(outputFile, index, sources.length, destinations[index], percent => {
        setProgress("Đang tải MP3 lên R2", percent, outputFile.name);
      });
      completed++;
      await ffmpeg.deleteFile(inputName).catch(() => {});
      await ffmpeg.deleteFile(outputName).catch(() => {});
      reportProgress("Đã xử lý " + source.name, Math.round(completed / sources.length * 100), "running");
    }
    queueTelemetryEvent("library_wma_conversion_success", { fileCount: completed });
    reportProgress("Hoàn tất " + completed + "/" + sources.length + " file MP3. WMA gốc vẫn được giữ.", 100, "success");
    setStatus("Đã chuyển và tải lên " + completed + "/" + sources.length + " file MP3. File WMA gốc vẫn được giữ nguyên.");
    await loadFiles();
    await runDiagnostics();
  } catch (error) {
    queueTelemetryEvent("library_wma_conversion_error", { completed, error: String(error.message || error).slice(0, 300) });
    reportProgress("Dừng sau " + completed + "/" + sources.length + ": " + error.message, 0, "error");
    setStatus("Chuyển đổi dừng sau " + completed + "/" + sources.length + " file: " + error.message + ". Các file WMA gốc không bị thay đổi.", true);
    if (completed) { await loadFiles(); await runDiagnostics(); }
  } finally {
    if (ffmpeg) {
      ffmpeg.terminate();
      ffmpegInstance = null;
      ffmpegLoadPromise = null;
    }
    button.disabled = false;
    button.textContent = oldLabel;
  }
}

function renderLibraryPage() {
  const term=normalizeSearch($("searchFilesInput").value.trim());
  const sort=$("sortFilesSelect").value;
  const grouped = libraryAssetGroups(allLibraryEntries);
  const folders = grouped.folders.filter(entry => !term || normalizeSearch(entry.name).includes(term));
  let books = grouped.books.filter(group => !term || normalizeSearch(group.title + " " + group.all.map(file => file.name).join(" ")).includes(term));
  let ungrouped = grouped.ungrouped.filter(entry => !term || normalizeSearch(entry.name).includes(term));
  if (sort === "desc") books = books.reverse();
  const entries = [...folders.map(entry => ({ type:"folder", entry })), ...books.map(entry => ({ type:"book", entry }))];
  if (ungrouped.length) entries.push({ type:"unmatched", entry:ungrouped });
  filteredLibraryEntries = entries;
  const totalPages=Math.max(1,Math.ceil(entries.length/pageSize));
  filePageIndex=Math.min(Math.max(0,filePageIndex),totalPages-1);
  const start=filePageIndex*pageSize, pageEntries=entries.slice(start,start+pageSize);
  $("pageJumpInput").value=String(filePageIndex+1); $("pageJumpInput").max=String(totalPages);
  $("pageTotal").textContent=" / "+totalPages;
  $("firstPageBtn").disabled=filePageIndex===0; $("prevPageBtn").disabled=filePageIndex===0;
  $("nextPageBtn").disabled=filePageIndex>=totalPages-1; $("lastPageBtn").disabled=filePageIndex>=totalPages-1;
  $("fileRows").replaceChildren();
  if(currentPrefix){
    const parent=document.createElement("tr"),up=document.createElement("button");
    up.className="folder-name";up.type="button";up.textContent="↰ ..";
    up.addEventListener("click",()=>{const p=currentPrefix.split("/").filter(Boolean).slice(0,-1).join("/");setFolder(p?p+"/":"");loadFiles();});
    const cell=document.createElement("td");cell.append(up);parent.append(cell);
    addCell(parent,"Thư mục cha");addCell(parent,"—");addCell(parent,"—");addCell(parent,"—");$("fileRows").append(parent);
  }
  for (const item of pageEntries) {
    if (item.type === "folder") {
      const row=document.createElement("tr"); addEntry(row,item.entry); $("fileRows").append(row); continue;
    }
    if (item.type === "unmatched") {
      const section=document.createElement("tr"), cell=addCell(section,"Tệp độc lập / chưa ghép · "+item.entry.length+" file");
      cell.colSpan=5; cell.className="library-unmatched-heading"; $("fileRows").append(section);
      for (const file of item.entry) { const row=document.createElement("tr"); addEntry(row,file); $("fileRows").append(row); }
      continue;
    }
    const group=item.entry, row=document.createElement("tr"), [statusLabel,statusKind]=libraryStatus(group);
    row.className="library-book-row";
    const titleCell=document.createElement("td");
    const toggle=actionButton((expandedLibraryGroups.has(group.key)?"▾ ":"▸ ")+group.title,()=>{
      if(expandedLibraryGroups.has(group.key)) expandedLibraryGroups.delete(group.key); else expandedLibraryGroups.add(group.key);
      renderLibraryPage();
    },"library-book-toggle");
    titleCell.append(toggle);
    if(group.pdf[0]) { const hint=document.createElement("div"); hint.className="file-meta"; hint.textContent="PDF: "+group.pdf[0].name; titleCell.append(hint); }
    else { const hint=document.createElement("div"); hint.className="file-meta"; hint.textContent="Chưa có PDF"; titleCell.append(hint); }
    row.append(titleCell);
    addCell(row,group.pdf.length+" PDF · "+group.audio.length+" Audio · "+group.json.length+" JSON");
    addCell(row,formatSize(group.all.reduce((sum,file)=>sum+Number(file.size||0),0)));
    addCell(row,formatDate(group.all.reduce((latest,file)=>!latest||new Date(file.uploaded)>new Date(latest)?file.uploaded:latest,null)));
    const actions=document.createElement("div"); actions.className="row-actions";
    const status=document.createElement("span"); status.className="library-status "+statusKind; status.textContent=statusLabel; actions.append(status);
    const actionCell=document.createElement("td"); actionCell.append(actions); row.append(actionCell);
    $("fileRows").append(row);
    if(expandedLibraryGroups.has(group.key)){
      let anchor=row;
      for(const file of group.pdf) anchor=appendLibraryFileRow(anchor,file,"pdf","PDF chính");
      for(const file of group.audio) anchor=appendLibraryFileRow(anchor,file,"audio","Audio"+(Number.isInteger(file.part)?" · Phần "+file.part:""));
      for(const file of group.json) anchor=appendLibraryFileRow(anchor,file,"json","JSON đồng bộ");
    }
  }
  if(!pageEntries.length){
    const row=document.createElement("tr"),cell=addCell(row,term?"Không tìm thấy sách/tệp/thư mục phù hợp.":(currentPrefix?"Thư mục trống.":"Thư viện chưa có tệp. Hãy tải PDF/audio lên."));
    cell.colSpan=5;cell.className="empty";$("fileRows").append(row);
  }
  const independentFiles = ungrouped.length;
  const breakdown = books.length + " bộ sách · " + folders.length + " thư mục · " + (independentFiles ? "1 nhóm tệp độc lập (" + independentFiles + " tệp)" : "0 nhóm tệp độc lập");
  $("pageStatus").textContent = entries.length ? "Hiển thị " + (start+1) + "–" + Math.min(start+pageEntries.length,entries.length) + " / " + entries.length + " mục quản lý · " + breakdown : "0 mục quản lý · " + breakdown;
}
async function loadFiles() {
  const requestSeq=++fileLoadSequence,requestedPrefix=currentPrefix,startedAt=performance.now();
  queueTelemetryEvent("library_load_start",{requestSeq,prefix:requestedPrefix,mode:"full_snapshot"});
  $("currentPath").textContent="/"+requestedPrefix;
  $("refreshBtn").disabled=true;
  $("fileRows").replaceChildren();
  setStatus("Đang tải danh sách thư mục…");
  try{
    const result=await api("files/all?prefix="+encodeURIComponent(requestedPrefix),{cache:"no-store"});
    if(requestSeq!==fileLoadSequence||requestedPrefix!==currentPrefix)return;
    if(!Array.isArray(result.folders)||!Array.isArray(result.files))throw new Error("API trả về danh sách thư viện không đúng cấu trúc.");
    allLibraryEntries=[...result.folders,...result.files];
    if ($("diagnosticsPanel").dataset.scanned === "true") {
      $("diagnosticsPanel").dataset.scanned = "false";
      $("diagnosticsSummary").textContent = "Thư viện đã thay đổi. Hãy quét lại để cập nhật kết quả.";
    }
    filePageIndex=0;
    renderLibraryPage();
    queueTelemetryEvent("library_load_success",{requestSeq,prefix:requestedPrefix,mode:"full_snapshot",folderCount:result.folders.length,fileCount:result.files.length,total:allLibraryEntries.length,durationMs:Math.round(performance.now()-startedAt)});
    setStatus("Đã tải "+allLibraryEntries.length+" mục trong thư mục hiện tại.");
  }catch(error){
    if(requestSeq!==fileLoadSequence)return;
    allLibraryEntries=[];filteredLibraryEntries=[];renderLibraryPage();
    queueTelemetryEvent("library_load_error",{requestSeq,prefix:requestedPrefix,durationMs:Math.round(performance.now()-startedAt),error:String(error.message||error).slice(0,500)});
    setStatus(error.message,true);
    const row=document.createElement("tr"),cell=addCell(row,"Không tải được thư viện: "+error.message);
    cell.colSpan=5;cell.className="empty error";$("fileRows").append(row);
  }finally{if(requestSeq===fileLoadSequence)$("refreshBtn").disabled=false;}
}

$("pageSizeSelect").value=String(pageSize);
$("pageSizeSelect").addEventListener("change",()=>{
  pageSize=Math.min(100,Math.max(25,Number($("pageSizeSelect").value)||25));
  sessionStorage.setItem("readalong-page-size",String(pageSize));
  filePageIndex=0;renderLibraryPage();
});
$("searchFilesInput").addEventListener("input",()=>{filePageIndex=0;renderLibraryPage();});
$("sortFilesSelect").addEventListener("change",()=>{filePageIndex=0;renderLibraryPage();});
$("nextPageBtn").addEventListener("click",()=>{const total=Math.max(1,Math.ceil(filteredLibraryEntries.length/pageSize));if(filePageIndex<total-1){filePageIndex++;renderLibraryPage();queueTelemetryEvent("library_page_navigation",{action:"next",page:filePageIndex+1,totalPages:total});}});
$("lastPageBtn").addEventListener("click",()=>{filePageIndex=Math.max(0,Math.ceil(filteredLibraryEntries.length/pageSize)-1);renderLibraryPage();queueTelemetryEvent("library_page_navigation",{action:"last",page:filePageIndex+1});});
$("firstPageBtn").addEventListener("click",()=>{filePageIndex=0;renderLibraryPage();queueTelemetryEvent("library_page_navigation",{action:"first",page:1});});
$("prevPageBtn").addEventListener("click",()=>{if(filePageIndex>0){filePageIndex--;renderLibraryPage();queueTelemetryEvent("library_page_navigation",{action:"previous",page:filePageIndex+1});}});
$("pageJumpInput").addEventListener("change",()=>{
  const total=Math.max(1,Math.ceil(filteredLibraryEntries.length/pageSize));
  const requested=Math.min(total,Math.max(1,Number($("pageJumpInput").value)||1));
  filePageIndex=requested-1;renderLibraryPage();
});
$("pageJumpInput").addEventListener("keydown",event=>{if(event.key==="Enter")$("pageJumpInput").dispatchEvent(new Event("change"));});

function diagnosticStat(label, value, kind) {
  const box = document.createElement("div");
  box.className = "diagnostic-stat " + kind;
  const number = document.createElement("strong");
  number.textContent = String(value);
  const caption = document.createElement("span");
  caption.textContent = label;
  box.append(number, caption);
  return box;
}

async function runDiagnostics() {
  const buttons = [$("scanBtn")];
  buttons.forEach((button) => { if (button) button.disabled = true; });
  $("diagnosticsPanel").open = true;
  $("diagnosticsSummary").textContent = "Đang quét thư viện và kiểm tra chữ ký tệp…";
  $("diagnosticStats").replaceChildren();
  $("diagnosticRows").replaceChildren();
  $("diagnosticsPanel").dataset.scanned = "false";
  try {
    const result = await api("diagnostics/scan?prefix=");
    $("diagnosticsPanel").dataset.scanned = "true";
    $("diagnosticsSummary").textContent =
      "Đã đối chiếu " + result.scanned + " tệp · kiểm tra mới/thay đổi " + result.changed +
      " · bỏ qua " + result.skipped + " tệp đã hoàn chỉnh" +
      (result.removed ? " · đã xóa khỏi cache " + result.removed : "") +
      " · " + formatDate(result.checkedAt);
    $("diagnosticStats").append(
      diagnosticStat("Tệp trong thư viện", result.scanned, "neutral"),
      diagnosticStat("Quét mới / thay đổi", result.changed, "neutral"),
      diagnosticStat("Bỏ qua từ cache", result.skipped, "good"),
      diagnosticStat("Lỗi cần xử lý", result.errors, result.errors ? "bad" : "good"),
      diagnosticStat("Cảnh báo", result.warnings, result.warnings ? "warn" : "good")
    );
    if (!result.findings.length) {
      const row = document.createElement("tr");
      const cell = addCell(row, "Không phát hiện lỗi theo các quy tắc kiểm tra hiện tại.");
      cell.colSpan = 5;
      cell.className = "empty";
      $("diagnosticRows").append(row);
    }
    const diagnosticBooks = libraryAssetGroups(allLibraryEntries).books;
    const conversionActionsShown = new Set();
    for (const finding of result.findings) {
      const row = document.createElement("tr");
      const level = document.createElement("span");
      level.className = "severity " + finding.severity;
      level.textContent = finding.severity === "error" ? "Lỗi" : "Cảnh báo";
      addCell(row, level);
      const keyCell = addCell(row, finding.key);
      keyCell.className = "diagnostic-key";
      addCell(row, finding.message);
      addCell(row, finding.suggestion || "Kiểm tra tệp gốc.");
      const actionCell = document.createElement("td");
      if (finding.code === "playback_compatibility" && /\.wma$/i.test(finding.key)) {
        const group = diagnosticBooks.find(book => book.audio.some(file => file.key === finding.key));
        if (group && !conversionActionsShown.has(group.key)) {
          conversionActionsShown.add(group.key);
          const wmaCount = group.audio.filter(file => /\.wma$/i.test(file.name)).length;
          const convertButton = actionButton("Chuyển " + wmaCount + " WMA → MP3", () => {}, "convert-audio");
          const progressBox = document.createElement("div");
          progressBox.className = "conversion-progress hidden";
          const progressText = document.createElement("span");
          progressText.className = "conversion-progress-text";
          progressText.textContent = "Chưa chạy";
          const progressTrack = document.createElement("div");
          progressTrack.className = "conversion-progress-track";
          const progressFill = document.createElement("span");
          progressTrack.append(progressFill);
          progressBox.append(progressText, progressTrack);
          convertButton.addEventListener("click", () => {
            convertWmaGroup(group, convertButton, (message, percent, state) => {
              progressBox.classList.remove("hidden");
              progressBox.classList.toggle("is-error", state === "error");
              progressBox.classList.toggle("is-success", state === "success");
              progressText.textContent = message;
              progressFill.style.width = percent + "%";
            });
          });
          actionCell.append(convertButton, progressBox);
        } else if (group) {
          const note = document.createElement("span");
          note.className = "muted diagnostic-group-note";
          note.textContent = "Đã gộp trong thao tác chuyển đổi cùng bộ sách.";
          actionCell.append(note);
        }
      }
      if (finding.candidateKey) {
        const match = document.createElement("div");
        match.className = "diagnostic-key";
        match.textContent = "Tệp đối chiếu: " + finding.candidateKey + (finding.similarity ? " · " + finding.similarity + "%" : "");
        actionCell.append(match);
      }
      if (finding.suggestedRename) {
        actionCell.append(actionButton("Duyệt gợi ý đổi tên", async () => {
          const destination = prompt("Xác nhận tên mới cho tệp này:", finding.suggestedRename);
          if (!destination || destination === finding.key) return;
          if (!allowed.test(destination)) { setStatus("Tên tệp hoặc định dạng không hợp lệ.", true); return; }
          try {
            await postJson("rename", { source: finding.key, destination });
            setStatus("Đã đổi tên theo gợi ý. Hãy quét lại thư viện để xác nhận ghép cặp.");
            await loadFiles();
            await runDiagnostics();
          } catch (error) { setStatus(error.message, true); }
        }));
      }
      actionCell.append(actionButton("Mở thư mục", () => {
        const parts = finding.key.split("/");
        parts.pop();
        setFolder(parts.length ? parts.join("/") + "/" : "");
        loadFiles();
        $("currentPath").scrollIntoView({ behavior: "smooth", block: "center" });
      }));
      row.append(actionCell);
      $("diagnosticRows").append(row);
    }
    setStatus("Kiểm tra hoàn tất: " + result.changed + " file mới/thay đổi, bỏ qua " + result.skipped + " file · " + result.errors + " lỗi, " + result.warnings + " cảnh báo.", result.errors > 0);
  } catch (error) {
    $("diagnosticsSummary").textContent = "Không thể hoàn tất kiểm tra: " + error.message + (error.rayId ? " · Ray ID: " + error.rayId : "");
    const row = document.createElement("tr");
    const cell = addCell(row, error.message);
    cell.colSpan = 5;
    cell.className = "empty error";
    $("diagnosticRows").append(row);
    setStatus(error.message, true);
  } finally {
    buttons.forEach((button) => { if (button) button.disabled = false; });
  }
}
$("publishBooksBtn").addEventListener("click", async () => {
  const button = $("publishBooksBtn");
  if (!await confirmAction("Tạo danh mục từ thư viện R2?", "Hệ thống sẽ quét danh sách tệp hiện tại, ghép chính xác theo tên chuẩn hóa và chỉ đưa sách có đủ PDF/audio, không trùng và không có lỗi nghiêm trọng vào bản xem trước. Không tệp nào trong R2 bị xóa hoặc đổi tên.", "Tạo bản xem trước")) return;
  button.disabled = true;
  const oldLabel = button.textContent;
  button.textContent = "Đang quét và tạo bản xem trước…";
  try {
    const preview = await api("catalog/preview");
    if (!preview.manifest || !Array.isArray(preview.manifest.books)) throw new Error("Không nhận được bản xem trước hợp lệ.");
    const included = preview.included;
    const excluded = preview.excluded || [];
    const details = excluded.slice(0, 8).map(item => "• " + item.title + ": " + item.reasons.join("; ")).join("\n");
    const message = "Sẽ xuất bản " + included + " sách từ thư viện R2.\n" +
      "Loại khỏi danh mục: " + excluded.length + " nhóm.\n" +
      "Quét: " + preview.scanned + " tệp · " + preview.errors + " lỗi · " + preview.warnings + " cảnh báo.\n\n" +
      (details ? "Một số nhóm bị loại:\n" + details + (excluded.length > 8 ? "\n… và " + (excluded.length - 8) + " nhóm khác.\n" : "\n") : "") +
      "\nChỉ books.json được ghi lại; tệp PDF/audio/JSON trong R2 không bị thay đổi.";
    if (!await confirmAction("Duyệt và xuất bản danh mục?", message, "Xuất bản books.json")) return;
    button.textContent = "Đang xác minh và xuất bản…";
    const result = await postJson("catalog/publish", preview.manifest);
    setStatus("Đã cập nhật books.json từ R2: " + result.books + " sách, " + result.files + " tệp đã xác minh. Đã loại " + excluded.length + " nhóm không đủ điều kiện.");
    await loadFiles();
  } catch (error) {
    setStatus("Không thể tạo danh mục: " + error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = oldLabel;
  }
});
$("scanBtn").addEventListener("click", runDiagnostics);
// scanAgainBtn đã bị loại khỏi giao diện; scanBtn là nút quét duy nhất.

async function renameEntry(entry) {
  const suggestion = entry.key;
  const destination = prompt("Nhập đường dẫn và tên mới (có thể thay đổi thư mục):", suggestion);
  if (!destination || destination === entry.key) return;
  if (!allowed.test(destination)) { setStatus("Chỉ hỗ trợ PDF, JSON và các định dạng audio được phép.", true); return; }
  try {
    setStatus("Đang di chuyển/đổi tên…");
    await postJson("rename", { source: entry.key, destination });
    setStatus("Đã đổi tên/di chuyển tệp.");
    await loadFiles();
  } catch (error) { setStatus(error.message, true); }
}
async function deleteFile(entry) {
  if (!await confirmAction("Xóa tệp?", "Tệp sẽ bị xóa khỏi bucket my-audio-book. Thao tác này không thể hoàn tác.", "Xóa tệp")) return;
  try {
    await api("file?key=" + encodeURIComponent(entry.key), { method: "DELETE" });
    setStatus("Đã xóa tệp.");
    await loadFiles();
  } catch (error) { setStatus(error.message, true); }
}
async function deleteFolder(entry) {
  if (!await confirmAction("Xóa toàn bộ thư mục?", "Tất cả tệp bên trong " + entry.key + " sẽ bị xóa. Thao tác không thể hoàn tác.", "Xóa thư mục")) return;
  try {
    setStatus("Đang xóa thư mục và các tệp bên trong…");
    const result = await api("folder?prefix=" + encodeURIComponent(entry.key), { method: "DELETE" });
    setStatus("Đã xóa thư mục (" + result.objectsDeleted + " tệp).");
    await loadFiles();
  } catch (error) { setStatus(error.message, true); }
}

$("newFolderBtn").addEventListener("click", async () => {
  const name = prompt("Tên thư mục mới:");
  if (!name?.trim()) return;
  try {
    await postJson("folders", { prefix: currentPrefix, name: name.trim() });
    setStatus("Đã tạo thư mục.");
    await loadFiles();
  } catch (error) { setStatus(error.message, true); }
});
$("rootBtn").addEventListener("click",()=>{setFolder("");loadFiles();});
$("refreshBtn").addEventListener("click",loadFiles);
function setFolder(prefix) {
  queueTelemetryEvent("library_folder_change", { from: currentPrefix, to: prefix });
  currentPrefix=prefix; filePageCursors=[null]; filePageIndex=0; nextFileCursor=null; allLibraryEntries=[]; filteredLibraryEntries=[];
  fileLoadSequence++;
}
$("fileInput").addEventListener("change", async (event) => {
  const files = [...event.target.files];
  event.target.value = "";
  if (files.length) await uploadFiles(files);
});

async function uploadOne(file, index, total, destinationKey = null, onProgress = null) {
  if (!allowed.test(file.name)) throw new Error("Định dạng không hỗ trợ: " + file.name);
  const key = destinationKey || currentPrefix + file.name;
  const started = await postJson("multipart/start", { key, size: file.size, contentType: file.type || "application/octet-stream" });
  const parts = [];
  const chunkSize = Math.max(CHUNK_SIZE, Math.ceil(file.size / 10000));
  const count = Math.ceil(file.size / chunkSize);
  try {
    for (let partNumber = 1; partNumber <= count; partNumber++) {
      const start = (partNumber - 1) * chunkSize;
      const chunk = file.slice(start, Math.min(start + chunkSize, file.size));
      const response = await fetch(API + "/multipart/part", {
        method: "PUT", credentials: "same-origin", body: chunk,
        headers: { "X-Upload-Key": key, "X-Upload-Id": started.uploadId, "X-Part-Number": String(partNumber) }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Tải phần " + partNumber + " thất bại");
      parts.push({ partNumber, etag: result.etag });
      const percent = Math.round(((index + (partNumber / count)) / total) * 100);
      $("progress").querySelector("span").style.width = percent + "%";
      if (onProgress) onProgress(percent);
    }
    await postJson("multipart/complete", { key, uploadId: started.uploadId, parts, size: file.size });
  } catch (error) {
    try { await postJson("multipart/abort", { key, uploadId: started.uploadId }); } catch {}
    throw error;
  }
}
async function uploadFiles(files) {
  show("progress", true);
  $("progress").querySelector("span").style.width = "0%";
  let completed = 0;
  for (let i = 0; i < files.length; i++) {
    try {
      setStatus("Đang tải " + files[i].name + " (" + (i + 1) + "/" + files.length + ")…");
      await uploadOne(files[i], i, files.length);
      completed++;
    } catch (error) {
      setStatus(files[i].name + ": " + error.message, true);
      break;
    }
  }
  show("progress", false);
  if (completed) {
    setStatus("Đã tải thành công " + completed + "/" + files.length + " tệp.");
    await loadFiles();
  }
}

$("auditRows").closest("details").addEventListener("toggle", async (event) => {
  if (!event.target.open) return;
  try {
    const result = await api("audit");
    $("auditRows").replaceChildren();
    for (const entry of result.entries) {
      const row = document.createElement("div"); row.className = "audit-entry";
      const left = document.createElement("span"); left.textContent = entry.action + (entry.object_key ? " · " + entry.object_key : "");
      const right = document.createElement("time"); right.textContent = formatDate(entry.created_at);
      row.append(left, right); $("auditRows").append(row);
    }
    if (!result.entries.length) $("auditRows").textContent = "Chưa có thao tác.";
  } catch (error) { $("auditRows").textContent = error.message; }
});

async function loadPublicStats() {
  const status = $("homeStatus");
  try {
    const response = await fetch(API + "/usage/stats", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "HTTP " + response.status);
    $("statBooks").textContent = Number(data.books || 0).toLocaleString("vi-VN");
    $("statPdfs").textContent = Number(data.pdfs || 0).toLocaleString("vi-VN");
    $("statAudios").textContent = Number(data.audios || 0).toLocaleString("vi-VN");
    $("statSync").textContent = Number(data.sync || 0).toLocaleString("vi-VN");
    $("statVisits").textContent = Number(data.totalVisits || 0).toLocaleString("vi-VN");
    $("statVisitsRecent").textContent = "Trong 30 ngày: " + Number(data.visits30d || 0).toLocaleString("vi-VN");
    $("statDevices").textContent = Number(data.totalDevices || 0).toLocaleString("vi-VN");
    $("statDevicesRecent").textContent = "Hoạt động 30 ngày: " + Number(data.devices30d || 0).toLocaleString("vi-VN");
    status.textContent = "Cập nhật lúc " + formatDate(data.updatedAt) + ". Thiết bị được đếm theo mã cài đặt ẩn danh.";
  } catch (error) {
    status.textContent = "Chưa tải được thống kê: " + error.message;
    queueTelemetryEvent("public_dashboard_stats_error", { message: String(error.message || error).slice(0, 300) });
  }
}
async function handleRoute() {
  if (location.hash !== "#manage") {
    show("homePanel", true); show("loginPanel", false); show("managerPanel", false);
    show("logoutBtn", false); show("homeBtn", false);
    await loadPublicStats();
    return;
  }
  show("homePanel", false);
  await checkSession();
}
window.addEventListener("hashchange", handleRoute);
handleRoute();
