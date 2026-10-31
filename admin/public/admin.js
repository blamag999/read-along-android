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
let activeTab = "library";
const tabStatusIds = { library: "status", overview: "overviewStatus", diagnostics: "diagnosticsStatus", analytics: "analyticsTabStatus", audit: "auditStatus", public: "publicStatus" };
const setStatus = (message, error = false, tab = "library") => {
  const target = $(tabStatusIds[tab] || "status");
  if (!target) return;
  target.textContent = message;
  const bar = target.closest(".tab-status");
  if (bar) {
    bar.classList.toggle("is-error", !!error);
    bar.classList.toggle("is-success", !error && /hoàn tất|thành công|đã tải|đã đổi tên|đã xóa/i.test(message));
    bar.classList.toggle("is-running", /đang /i.test(message));
  }
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
    show("loginHomeBtn", !result.authenticated);
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
    show("loginHomeBtn", true);
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
      if (finding.code === "playback_compatibility" || finding.code === "unsupported_format") {
        const warning = document.createElement("span");
        warning.className = "compatibility-warning";
        warning.textContent = "Cần thay file bằng định dạng được ứng dụng hỗ trợ. Admin không chuyển đổi audio.";
        actionCell.append(warning);
      }
      if (finding.candidateKey) {
        const match = document.createElement("div");
        match.className = "diagnostic-key";
        match.textContent = "Tệp đối chiếu: " + finding.candidateKey + (finding.similarity ? " · " + finding.similarity + "%" : "");
        actionCell.append(match);
      }
      if (finding.suggestedRename && (Number(finding.similarity) >= 95 || finding.code === "rename_audio_part")) {
        actionCell.append(actionButton("Duyệt gợi ý đổi tên", async () => {
          const destination = prompt("Xác nhận tên mới cho tệp này (độ tin cậy " + (Number(finding.similarity) || 100) + "%):", finding.suggestedRename);
          if (!destination || destination === finding.key) return;
          if (!allowed.test(destination)) { setStatus("Tên tệp hoặc định dạng không hợp lệ.", true, "diagnostics"); return; }
          try {
            await postJson("rename", { source: finding.key, destination });
            setStatus("Đã đổi tên theo gợi ý. Hãy quét lại thư viện để xác nhận ghép cặp.");
            await loadFiles();
            await runDiagnostics();
          } catch (error) { setStatus(error.message, true, "diagnostics"); }
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
    setStatus("Kiểm tra hoàn tất: " + result.changed + " file mới/thay đổi, bỏ qua " + result.skipped + " file · " + result.errors + " lỗi, " + result.warnings + " cảnh báo.", result.errors > 0, "diagnostics");
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
    setStatus("Đang đổi tên/di chuyển: " + entry.key + " → " + destination);
    await postJson("rename", { source: entry.key, destination });
    setStatus("Đã đổi tên/di chuyển thành công: " + destination);
    await loadFiles();
  } catch (error) { setStatus("Không thể đổi tên/di chuyển " + entry.key + ": " + error.message, true); }
}
async function deleteFile(entry) {
  if (!await confirmAction("Xác nhận xóa tệp?", "Bạn sắp xóa tệp:\n" + entry.key + "\n\nTệp sẽ bị xóa khỏi bucket my-audio-book. Thao tác này không thể hoàn tác.", "Xóa vĩnh viễn")) return;
  try {
    await api("file?key=" + encodeURIComponent(entry.key), { method: "DELETE" });
    setStatus("Đã xóa tệp.");
    await loadFiles();
  } catch (error) { setStatus(error.message, true); }
}
async function deleteFolder(entry) {
  if (!await confirmAction("Xác nhận xóa thư mục?", "Bạn sắp xóa thư mục và toàn bộ nội dung:\n" + entry.key + "\n\nThao tác không thể hoàn tác.", "Xóa toàn bộ")) return;
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
  show("uploadProgressText", true);
  $("progress").querySelector("span").style.width = "0%";
  const failures = [];
  let completed = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    setStatus("Đang tải lên " + file.name + " (" + (i + 1) + "/" + files.length + ")");
    $("uploadProgressText").textContent = "Đang xử lý " + (i + 1) + "/" + files.length + ": " + file.name;
    try {
      await uploadOne(file, i, files.length);
      completed++;
      $("uploadProgressText").textContent = "Đã tải " + completed + "/" + files.length + " file · " + file.name;
    } catch (error) {
      failures.push({ name: file.name, message: error.message || String(error) });
      $("uploadProgressText").textContent = "Lỗi " + failures.length + ": " + file.name + " · tiếp tục file kế tiếp";
    }
  }
  show("progress", false);
  if (completed) await loadFiles();
  const summary = "Hoàn tất upload: " + completed + "/" + files.length + " thành công" + (failures.length ? " · " + failures.length + " thất bại" : "");
  setStatus(summary, failures.length > 0);
  $("uploadProgressText").textContent = failures.length
    ? failures.map(item => "Thất bại: " + item.name + " — " + item.message).join(" | ")
    : summary;
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

function formatDuration(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600), minutes = Math.floor((value % 3600) / 60);
  return hours ? hours + " giờ " + minutes + " phút" : minutes + " phút";
}
function renderAnalyticsTrend(rows, rangeDays) {
  const root = $("analyticsTrend"); root.replaceChildren();
  if (!rows.length) { root.textContent = "Chưa có dữ liệu trong khoảng thời gian này."; return; }
  const bucketSize = rangeDays > 365 ? "month" : rangeDays > 90 ? "week" : "day";
  const buckets = new Map();
  for (const row of rows) {
    const date = new Date(row.day + "T00:00:00Z");
    const key = bucketSize === "month" ? row.day.slice(0,7) :
      bucketSize === "week" ? new Date(date.getTime() - ((date.getUTCDay()+6)%7)*86400000).toISOString().slice(0,10) : row.day;
    const item = buckets.get(key) || { reading: 0, listening: 0, events: 0 };
    item.reading += row.readingSeconds; item.listening += row.listeningSeconds; item.events += row.eventCount;
    buckets.set(key, item);
  }
  const max = Math.max(1, ...[...buckets.values()].map(x => x.reading + x.listening));
  for (const [label, item] of buckets) {
    const group = document.createElement("div"); group.className = "analytics-bar-group";
    const bar = document.createElement("div"); bar.className = "analytics-bar";
    const reading = document.createElement("span"); reading.className = "analytics-reading-bar";
    reading.style.height = Math.max(2, item.reading / max * 100) + "%";
    const listening = document.createElement("span"); listening.className = "analytics-listening-bar";
    listening.style.height = Math.max(2, item.listening / max * 100) + "%";
    bar.append(reading, listening);
    const caption = document.createElement("small"); caption.textContent = label;
    const total = document.createElement("span"); total.textContent = formatDuration(item.reading + item.listening);
    group.append(bar, total, caption); root.append(group);
  }
}
async function loadAnalyticsDashboard() {
  const button = $("refreshAnalyticsBtn"), status = $("analyticsStatus");
  button.disabled = true; status.textContent = "Đang tải dữ liệu…";
  try {
    const days = Number($("analyticsRange").value) || 30;
    const end = new Date(), start = new Date(end.getTime() - (days - 1) * 86400000);
    const startText = start.toISOString().slice(0,10), endText = end.toISOString().slice(0,10);
    const data = await api("analytics/dashboard?start=" + startText + "&end=" + endText, { cache: "no-store" });
    const summary = data.summary || {};
    $("analyticsReading").textContent = formatDuration(summary.readingSeconds);
    $("analyticsListening").textContent = formatDuration(summary.listeningSeconds);
    $("analyticsDevices").textContent = summary.activeDevices === null ? "—" : Number(summary.activeDevices || 0).toLocaleString("vi-VN");
    const library = data.library || {};
    $("analyticsTotal").textContent = formatDuration(summary.totalSeconds);
    $("libraryBooks").textContent = library.books == null ? "—" : Number(library.books).toLocaleString("vi-VN");
    $("libraryPdfs").textContent = library.pdfs == null ? "—" : Number(library.pdfs).toLocaleString("vi-VN");
    $("libraryAudioParts").textContent = library.audioParts == null ? "—" : Number(library.audioParts).toLocaleString("vi-VN");
    $("librarySyncedBooks").textContent = library.syncedBooks == null ? "—" : Number(library.syncedBooks).toLocaleString("vi-VN");
    const scan = data.latestScan;
    $("libraryErrors").textContent = scan ? Number(scan.errors || 0).toLocaleString("vi-VN") : "Chưa quét";
    $("libraryWarnings").textContent = scan ? Number(scan.warnings || 0).toLocaleString("vi-VN") : "Chưa quét";
    $("libraryScanned").textContent = scan ? Number(scan.scanned || 0).toLocaleString("vi-VN") : "—";
    $("libraryScanAt").textContent = scan ? formatDate(scan.createdAt) : "Chưa quét";
    $("libraryScanStatus").textContent = !scan ? "Chưa có kết quả quét thư viện." : scan.status === "success" ? "Kết quả lần quét gần nhất · " + scan.ruleVersion + " · " + Math.round(Number(scan.durationMs || 0) / 1000) + " giây." : "Lần quét gần nhất thất bại; xem Diagnostics để biết chi tiết.";
    if (library.status !== "published_manifest") $("libraryScanStatus").textContent += " Không đọc được books.json đang xuất bản.";
    $("analyticsDevicesNote").textContent = data.breakdown?.available ? "Thiết bị duy nhất trong khoảng chọn" : "Ngoài cửa sổ lưu chi tiết 90 ngày";
    $("analyticsRetentionNote").textContent = data.breakdown?.note || "";
    $("analyticsUpdated").textContent = "Cập nhật " + formatDate(data.generatedAt) + " · UTC";
    status.textContent = data.hasData ? "Đã tải dữ liệu tổng hợp." : "Chưa có sự kiện thống kê trong khoảng thời gian này. Có thể người dùng chưa bật đồng ý hoặc chưa phát sinh hoạt động.";
    renderAnalyticsTrend(data.daily || [], days);\n    $("publicReading").textContent = formatDuration(summary.readingSeconds);\n    $("publicListening").textContent = formatDuration(summary.listeningSeconds);\n    $("publicBooks").textContent = library.books == null ? "—" : Number(library.books).toLocaleString("vi-VN");\n    $("publicErrors").textContent = scan ? Number(scan.errors || 0).toLocaleString("vi-VN") : "Chưa quét";\n    setStatus(data.hasData ? "Đã cập nhật số liệu công khai." : "Chưa có số liệu trong khoảng thời gian này.", false, "public");\n    $("overviewReading").textContent = formatDuration(summary.readingSeconds);\n    $("overviewListening").textContent = formatDuration(summary.listeningSeconds);\n    $("overviewBooks").textContent = library.books == null ? "—" : Number(library.books).toLocaleString("vi-VN");\n    $("overviewErrors").textContent = scan ? Number(scan.errors || 0).toLocaleString("vi-VN") : "Chưa quét";\n    $("overviewTrend").replaceChildren(...$("analyticsTrend").cloneNode(true).childNodes);\n    setStatus(data.hasData ? "Đã cập nhật dữ liệu tổng quan." : "Chưa có dữ liệu thống kê trong khoảng thời gian này.", false, "overview");\n    setStatus(data.hasData ? "Đã tải dữ liệu thống kê." : "Chưa có dữ liệu thống kê trong khoảng thời gian này.", false, "analytics");
    const body = $("analyticsPlatforms"); body.replaceChildren();
    const platforms = data.breakdown?.platforms || [];
    if (!platforms.length) {
      const row = document.createElement("tr"), cell = document.createElement("td"); cell.colSpan = 5;
      cell.className = "empty"; cell.textContent = data.breakdown?.available ? "Chưa có dữ liệu nền tảng." : "Dữ liệu nền tảng chỉ có trong 90 ngày gần nhất.";
      row.append(cell); body.append(row);
    } else for (const item of platforms) {
      const row = document.createElement("tr");
      for (const value of [item.platform, Number(item.devices || 0).toLocaleString("vi-VN"), formatDuration(item.readingSeconds), formatDuration(item.listeningSeconds), Number(item.events || 0).toLocaleString("vi-VN")]) {
        const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
      }
      body.append(row);
    }
  } catch (error) { status.textContent = "Không tải được Dashboard: " + error.message; setStatus("Không tải được dữ liệu tổng quan: " + error.message, true, "overview");\n    setStatus("Không tải được số liệu Dashboard: " + error.message, true, "public"); setStatus("Không tải được thống kê: " + error.message, true, "analytics"); }
  finally { button.disabled = false; }
}
$("refreshAnalyticsBtn").addEventListener("click", loadAnalyticsDashboard);\n$("overviewRefreshBtn").addEventListener("click", loadAnalyticsDashboard);
$("analyticsRange").addEventListener("change", loadAnalyticsDashboard);

// Dashboard chỉ đọc là trang mặc định; khu vực quản lý thư viện vẫn yêu cầu OTP.
$("loginHomeBtn").addEventListener("click", () => { location.hash = ""; });

const tabIds = { library: "libraryTab", overview: "overviewTab", diagnostics: "diagnosticsTab", analytics: "analyticsTab", audit: "auditTab" };
const tabButtons = { library: "tabLibraryBtn", overview: "tabOverviewBtn", diagnostics: "tabDiagnosticsBtn", analytics: "tabAnalyticsBtn", audit: "tabAuditBtn" };
function switchTab(name) {
  if (!tabIds[name]) return;
  activeTab = name;
  for (const [key, id] of Object.entries(tabIds)) show(id, key === name);
  for (const [key, id] of Object.entries(tabButtons)) {
    const button = $(id);
    button.classList.toggle("active", key === name);
    button.setAttribute("aria-selected", key === name ? "true" : "false");
  }
  sessionStorage.setItem("readalong-admin-tab", name);
  if (name === "analytics" || name === "overview") loadAnalyticsDashboard();
  if (name === "audit") { const details = $("auditRows").closest("details"); details.open = true; loadAuditEntries(); }
  if (name === "diagnostics" && $("diagnosticsPanel").dataset.scanned !== "true") setStatus("Chưa có kết quả mới. Chọn Quét thư viện để bắt đầu.", false, "diagnostics");
}
for (const [key, id] of Object.entries(tabButtons)) $(id).addEventListener("click", () => switchTab(key));
function applyTheme(theme, persist = false) {
  const selected = ["light", "dark"].includes(theme) ? theme : "system";
  const resolved = selected === "system" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : selected;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = selected;
  $("themeToggleBtn").textContent = "Giao diện: " + (selected === "system" ? "Hệ thống" : selected === "light" ? "Sáng" : "Tối");
  if (persist) localStorage.setItem("readalong-admin-theme", selected);
}
applyTheme(localStorage.getItem("readalong-admin-theme") || "system");
$("themeToggleBtn").addEventListener("click", () => {
  const current = document.documentElement.dataset.themePreference || "system";
  applyTheme(current === "system" ? "light" : current === "light" ? "dark" : "system", true);
});
window.matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => {
  if ((document.documentElement.dataset.themePreference || "system") === "system") applyTheme("system");
});
async function loadAuditEntries() {
  setStatus("Đang tải nhật ký thao tác…", false, "audit");
  try {
    const result = await api("audit");
    $("auditRows").replaceChildren();
    for (const entry of result.entries || []) {
      const row = document.createElement("div"); row.className = "audit-entry";
      const left = document.createElement("span"); left.textContent = entry.action + (entry.object_key ? " · " + entry.object_key : "");
      const right = document.createElement("time"); right.textContent = formatDate(entry.created_at);
      row.append(left, right); $("auditRows").append(row);
    }
    if (!(result.entries || []).length) $("auditRows").textContent = "Chưa có thao tác.";
    setStatus("Đã tải " + (result.entries || []).length + " bản ghi nhật ký.", false, "audit");
  } catch (error) { $("auditRows").textContent = error.message; setStatus("Không tải được nhật ký: " + error.message, true, "audit"); }
}
async function handleRoute() {
  if (location.hash !== "#manage") {
    show("homePanel", true); show("loginPanel", false); show("managerPanel", false);
    show("logoutBtn", false); show("homeBtn", false);
    loadAnalyticsDashboard();
    return;
  }
  show("homePanel", false);
  await checkSession();
}
window.addEventListener("hashchange", handleRoute);
handleRoute();
