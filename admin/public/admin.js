const API = "/api/readalong-admin";
const CHUNK_SIZE = 8 * 1024 * 1024;
const allowed = /\.(pdf|json|mp3|m4a|m4b|aac|wav|ogg|oga|opus|flac|wma)$/i;
let currentPrefix = "";
let filePageCursors = [null];
let filePageIndex = 0;
let nextFileCursor = null;
let dialogResolve = null;
let pageSize = [25, 50, 100].includes(Number(sessionStorage.getItem("readalong-page-size"))) ? Number(sessionStorage.getItem("readalong-page-size")) : 25;
let clientLogs = [];
let serverLogs = [];
let serverEvents = [];
let libraryRequests = [];
let fileLoadSequence = 0;
let debugEventQueue = [];
let debugFlushScheduled = false;

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
      queueDebugEvent("auth_api_unauthorized", { path: String(path).split("?")[0], status: 401 });
      show("managerPanel", false);
      show("loginPanel", true);
      show("logoutBtn", false);
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
    queueDebugEvent("api_request", log);
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

function queueDebugEvent(type, details = {}) {
  debugEventQueue.push({ type: String(type).slice(0,80), details });
  if (debugEventQueue.length>100) debugEventQueue=debugEventQueue.slice(-100);
  if (debugFlushScheduled) return;
  debugFlushScheduled=true; setTimeout(flushDebugEvents,250);
}
async function flushDebugEvents() {
  debugFlushScheduled=false;
  if (!debugEventQueue.length) return;
  const events=debugEventQueue.splice(0,25);
  try {
    const response=await fetch(API+"/debug/events",{method:"POST",credentials:"same-origin",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify({events})});
    if(!response.ok) {
      clientLogs.unshift({at:new Date().toISOString(),method:"POST",path:"debug/events",status:response.status,durationMs:0,rayId:response.headers.get("cf-ray")||"",error:"Không đồng bộ được log sự kiện"});
      clientLogs=clientLogs.slice(0,100);
    }
  } catch(error) {
    clientLogs.unshift({at:new Date().toISOString(),method:"POST",path:"debug/events",status:"NETWORK",durationMs:0,rayId:"",error:String(error.message||error)});
    clientLogs=clientLogs.slice(0,100);
  }
  if(debugEventQueue.length&&!debugFlushScheduled){debugFlushScheduled=true;setTimeout(flushDebugEvents,250);}
}
window.addEventListener("error",event=>queueDebugEvent("javascript_error",{message:String(event.message||"Unknown error").slice(0,500),source:String(event.filename||"").split("/").pop().slice(0,120),line:event.lineno||0,column:event.colno||0}));
window.addEventListener("unhandledrejection",event=>queueDebugEvent("unhandled_promise_rejection",{reason:String(event.reason?.message||event.reason||"Unknown rejection").slice(0,500)}));

async function checkSession() {
  const startedAt = performance.now();
  try {
    const result = await api("session", { cache: "no-store" });
    queueDebugEvent("auth_session_check", {
      authenticated: !!result.authenticated, cookiePresent: !!result.cookiePresent,
      reason: result.reason || "unknown", expiresIn: Number(result.expiresIn || 0),
      expiresAt: result.expiresAt || null, durationMs: Math.round(performance.now() - startedAt), host: location.host
    });
    show("loginPanel", !result.authenticated);
    show("managerPanel", result.authenticated);
    show("logoutBtn", result.authenticated);
    if (result.authenticated) {
      $("loginError").textContent = "";
      await loadFiles();
      activateTab("library");
    } else {
      $("loginError").textContent = result.reason === "cookie_missing"
        ? "Không tìm thấy cookie phiên đăng nhập trên hostname hiện tại. Hãy đăng nhập lại; nếu lỗi lặp lại sau khi tải lại trang, gửi log Debug."
        : "Cookie phiên không còn hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại.";
    }
  } catch (error) {
    queueDebugEvent("auth_session_check_error", {
      error: String(error.message || error).slice(0, 500),
      durationMs: Math.round(performance.now() - startedAt), host: location.host
    });
    show("loginPanel", true);
    show("managerPanel", false);
    show("logoutBtn", false);
    $("loginError").textContent = "Không thể kiểm tra phiên đăng nhập do lỗi kết nối hoặc máy chủ: " + error.message + ". Đây chưa chắc là phiên đã hết hạn; hãy thử lại.";
  }
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("loginError").textContent = "";
  const code = $("otpCode").value.trim();
  try {
    await postJson("login", { code });
    queueDebugEvent("auth_login_success", { host: location.host });
    $("otpCode").value = "";
    show("loginPanel", false);
    show("managerPanel", true);
    show("logoutBtn", true);
    await loadFiles();
  } catch (error) {
    $("loginError").textContent = error.message;
  }
});

$("logoutBtn").addEventListener("click", async () => {
  try { await postJson("logout", {}); } catch {}
  queueDebugEvent("auth_logout", { host: location.host });
  show("managerPanel", false);
  show("loginPanel", true);
  show("logoutBtn", false);
});

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

async function loadFiles() {
  const requestSeq = ++fileLoadSequence;
  const requestedPrefix = currentPrefix;
  const requestedPage = filePageIndex;
  const requestedPageSize = pageSize;
  const cursor = filePageCursors[requestedPage] || null;
  const startedAt = performance.now();
  queueDebugEvent("library_load_start", {
    requestSeq, prefix: requestedPrefix, page: requestedPage + 1,
    pageSize: requestedPageSize, cursorPresent: !!cursor
  });
  $("currentPath").textContent = "/" + requestedPrefix;
  $("prevPageBtn").disabled = true;
  $("nextPageBtn").disabled = true;
  $("refreshBtn").disabled = true;
  setStatus("Đang tải trang " + (requestedPage + 1) + "…");
  $("fileRows").replaceChildren();
  if (requestedPage > 0 && !cursor) {
    const message = "Thiếu cursor của trang " + (requestedPage + 1) + ". Hãy quay lại trang đầu và thử lại.";
    queueDebugEvent("library_pagination_state_error", { requestSeq, prefix: requestedPrefix, page: requestedPage + 1, pageSize: requestedPageSize, reason: "missing_cursor" });
    setStatus(message, true);
    const row = document.createElement("tr"); const cell = addCell(row, message);
    cell.colSpan = 5; cell.className = "empty error"; $("fileRows").append(row);
    $("prevPageBtn").disabled = requestedPage === 0;
    $("nextPageBtn").disabled = true;
    $("refreshBtn").disabled = false;
    return;
  }
  try {
    const result = await api("files?prefix=" + encodeURIComponent(requestedPrefix) + "&limit=" + requestedPageSize + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""));
    if (requestSeq !== fileLoadSequence || requestedPrefix !== currentPrefix || requestedPage !== filePageIndex) {
      queueDebugEvent("library_stale_response_ignored", { requestSeq, activeRequestSeq: fileLoadSequence, prefix: requestedPrefix, page: requestedPage + 1, currentPrefix, currentPage: filePageIndex + 1 });
      return;
    }
    if (!Array.isArray(result.folders) || !Array.isArray(result.files)) throw new Error("API trả về dữ liệu phân trang không đúng cấu trúc.");
    const returnedCursor = result.truncated ? result.cursor : null;
    if (result.truncated && !returnedCursor) throw new Error("R2 báo còn dữ liệu nhưng không trả cursor. Đã ghi nhận sự kiện để kiểm tra.");
    if (cursor && returnedCursor && cursor === returnedCursor) throw new Error("Cursor không thay đổi giữa hai trang. Đã dừng phân trang để tránh lặp dữ liệu.");
    nextFileCursor = returnedCursor;
    $("pageLabel").textContent = "Trang " + (requestedPage + 1);
    const entries = [...result.folders, ...result.files].sort((a,b) => a.type !== b.type ? (a.type === "folder" ? -1 : 1) : a.name.localeCompare(b.name,"vi"));
    if (requestedPrefix) {
      const parent = document.createElement("tr"), up = document.createElement("button");
      up.className = "folder-name"; up.type = "button"; up.textContent = "↰ ..";
      up.addEventListener("click", () => { const p=currentPrefix.split("/").filter(Boolean).slice(0,-1).join("/"); setFolder(p ? p+"/" : ""); loadFiles(); });
      const cell=document.createElement("td"); cell.append(up); parent.append(cell);
      addCell(parent,"Thư mục cha"); addCell(parent,"—"); addCell(parent,"—"); addCell(parent,"—"); $("fileRows").append(parent);
    }
    for (const entry of entries) { const row=document.createElement("tr"); addEntry(row,entry); $("fileRows").append(row); }
    if (!entries.length) {
      const row=document.createElement("tr");
      const cell=addCell(row,requestedPrefix ? "Thư mục trống." : "Thư viện chưa có tệp. Hãy tải PDF/audio lên.");
      cell.colSpan=5; cell.className="empty"; $("fileRows").append(row);
    }
    queueDebugEvent("library_load_success", {
      requestSeq, prefix: requestedPrefix, page: requestedPage + 1, pageSize: requestedPageSize,
      cursorPresent: !!cursor, folderCount: result.folders.length, fileCount: result.files.length,
      renderedCount: entries.length, truncated: !!result.truncated, nextCursorPresent: !!returnedCursor,
      durationMs: Math.round(performance.now()-startedAt)
    });
    setStatus("Đã tải " + entries.length + " mục · Trang " + (requestedPage+1) + (result.truncated ? " · Còn trang tiếp theo" : " · Trang cuối"));
  } catch(error) {
    if (requestSeq !== fileLoadSequence) return;
    nextFileCursor=null;
    queueDebugEvent("library_load_error", { requestSeq, prefix: requestedPrefix, page: requestedPage+1, pageSize: requestedPageSize, cursorPresent: !!cursor, durationMs: Math.round(performance.now()-startedAt), error: String(error.message||error).slice(0,500) });
    setStatus(error.message,true);
    const row=document.createElement("tr"), cell=addCell(row,"Không tải được trang: "+error.message);
    cell.colSpan=5; cell.className="empty error"; $("fileRows").append(row);
  } finally {
    if(requestSeq===fileLoadSequence) {
      $("prevPageBtn").disabled=requestedPage===0;
      $("nextPageBtn").disabled=!nextFileCursor;
      $("refreshBtn").disabled=false;
    }
  }
}


function activateTab(name) {
  const library = name === "library";
  show("libraryPanel", library);
  const diagnostics = name === "diagnostics";
  const debug = name === "debug";
  show("diagnosticsPanel", diagnostics);
  show("debugPanel", debug);
  $("libraryTabBtn").classList.toggle("active", library);
  $("diagnosticsTabBtn").classList.toggle("active", diagnostics);
  $("debugTabBtn").classList.toggle("active", debug);
  if (diagnostics && $("diagnosticsPanel").dataset.scanned !== "true") runDiagnostics();
  if (debug) loadDebugLogs();
}
$("libraryTabBtn").addEventListener("click", () => activateTab("library"));
$("diagnosticsTabBtn").addEventListener("click", () => activateTab("diagnostics"));
$("debugTabBtn").addEventListener("click", () => activateTab("debug"));
$("pageSizeSelect").value = String(pageSize);
$("pageSizeSelect").addEventListener("change", () => {
  pageSize = Math.min(100, Math.max(25, Number($("pageSizeSelect").value) || 25));
  sessionStorage.setItem("readalong-page-size", String(pageSize));
  setFolder(currentPrefix);
  loadFiles();
});

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
  const buttons = [$("scanBtn"), $("scanAgainBtn")];
  buttons.forEach((button) => { if (button) button.disabled = true; });
  show("diagnosticsPanel", true);
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
$("scanBtn").addEventListener("click", runDiagnostics);
$("scanAgainBtn").addEventListener("click", runDiagnostics);

async function loadDebugLogs() {
  const button = $("refreshDebugBtn");
  if (button) { button.disabled = true; button.textContent = "Đang tải log…"; }
  queueDebugEvent("debug_refresh_clicked", { host: location.host });
  try {
    const result = await api("debug/logs?limit=100", { cache: "no-store" });
    serverLogs = Array.isArray(result.entries) ? result.entries : [];
    libraryRequests = Array.isArray(result.libraryRequests) ? result.libraryRequests : [];
    serverEvents = Array.isArray(result.events) ? result.events : [];
    renderDebugLogs();
    setStatus("Đã làm mới log: " + serverLogs.length + " lượt quét, " + libraryRequests.length + " yêu cầu thư viện, " + serverEvents.length + " sự kiện.");
  } catch (error) {
    const target = $("serverLogRows");
    if (target) {
      target.replaceChildren();
      const row = document.createElement("tr");
      const cell = addCell(row, "Không tải được log máy chủ: " + error.message);
      cell.colSpan = 6; cell.className = "empty error"; target.append(row);
    }
    setStatus("Làm mới log thất bại: " + error.message, true);
  } finally {
    if (button) { button.disabled = false; button.textContent = "Làm mới log"; }
  }
}
function renderDebugLogs() {
  const server = $("serverLogRows");
  const client = $("clientLogRows");
  const requests = $("libraryRequestRows");
  const events = $("serverEventRows");
  if (server) {
    server.replaceChildren();
    if (!serverLogs.length) {
      const row = document.createElement("tr"); const cell = addCell(row, "Chưa có lịch sử quét.");
      cell.colSpan = 6; cell.className = "empty"; server.append(row);
    }
    for (const log of serverLogs) {
      const row = document.createElement("tr");
      addCell(row, formatDate(log.created_at));
      addCell(row, log.status === "success" ? "Thành công" : "Thất bại");
      addCell(row, (log.scanned || 0) + " / " + (log.changed || 0) + " / " + (log.skipped || 0));
      addCell(row, (log.errors || 0) + " / " + (log.warnings || 0));
      addCell(row, (log.duration_ms || 0) + " ms");
      addCell(row, [log.ray_id, log.error_message].filter(Boolean).join(" · ") || "—");
      server.append(row);
    }
  }
  if (requests) {
    requests.replaceChildren();
    if (!libraryRequests.length) { const row=document.createElement("tr"); const cell=addCell(row,"Chưa có yêu cầu phân trang được ghi nhận."); cell.colSpan=8; cell.className="empty"; requests.append(row); }
    for (const log of libraryRequests) {
      const row=document.createElement("tr");
      addCell(row,formatDate(log.created_at)); addCell(row,log.prefix||"/");
      addCell(row,String(log.page_size||"—")); addCell(row,log.cursor_present ? "Có" : "Không");
      addCell(row,(log.folders_count||0)+" / "+(log.files_count||0)); addCell(row,log.truncated ? "Còn" : "Hết");
      addCell(row,log.status+" · "+(log.duration_ms||0)+" ms");
      addCell(row,[log.ray_id,log.error_message].filter(Boolean).join(" · ")||"—"); requests.append(row);
    }
  }
  if (events) {
    events.replaceChildren();
    if (!serverEvents.length) { const row=document.createElement("tr"); const cell=addCell(row,"Chưa có sự kiện giao diện được đồng bộ."); cell.colSpan=4; cell.className="empty"; events.append(row); }
    for (const event of serverEvents) {
      const row=document.createElement("tr");
      addCell(row,formatDate(event.created_at)); addCell(row,event.event_type);
      addCell(row,event.ray_id||"—"); addCell(row,event.details_json||"—"); events.append(row);
    }
  }
  if (client) {
    client.replaceChildren();
    if (!clientLogs.length) {
      const row = document.createElement("tr"); const cell = addCell(row, "Chưa ghi nhận yêu cầu API.");
      cell.colSpan = 6; cell.className = "empty"; client.append(row);
    }
    for (const log of clientLogs) {
      const row = document.createElement("tr");
      addCell(row, formatDate(log.at)); addCell(row, log.path);
      addCell(row, String(log.status)); addCell(row, log.durationMs + " ms");
      addCell(row, log.rayId || "—"); addCell(row, log.error || "—");
      client.append(row);
    }
  }
}
$("refreshDebugBtn").addEventListener("click", () => {
  loadDebugLogs().catch(error => setStatus("Làm mới log thất bại: " + error.message, true));
});
$("exportDebugBtn").addEventListener("click", async () => {
  const button = $("exportDebugBtn");
  button.disabled = true;
  const oldLabel = button.textContent;
  button.textContent = "Đang chuẩn bị…";
  try {
    while (debugEventQueue.length) await flushDebugEvents();
    await loadDebugLogs();
    const payload = {
      exportedAt: new Date().toISOString(),
      host: location.host,
      serverLogs, libraryRequests, serverEvents, clientLogs,
      pendingBrowserEvents: debugEventQueue
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "read-along-admin-debug-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setStatus("Đã tạo tệp JSON log để tải xuống.");
  } catch (error) {
    setStatus("Xuất JSON thất bại: " + error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = oldLabel;
  }
});


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
$("rootBtn").addEventListener("click", () => { setFolder(""); loadFiles(); });
$("refreshBtn").addEventListener("click", loadFiles);
$("prevPageBtn").addEventListener("click", async () => {
  queueDebugEvent("pagination_click_previous", { prefix: currentPrefix, fromPage: filePageIndex+1, pageSize, targetCursorPresent: !!filePageCursors[filePageIndex-1] });
  if (filePageIndex <= 0 || !filePageCursors[filePageIndex-1] && filePageIndex-1 > 0) {
    setStatus("Không có cursor của trang trước. Hãy tải lại thư mục từ trang đầu.", true);
    return;
  }
  filePageIndex--;
  await loadFiles();
});
$("nextPageBtn").addEventListener("click", async () => {
  queueDebugEvent("pagination_click_next", { prefix: currentPrefix, fromPage: filePageIndex+1, pageSize, cursorPresent: !!nextFileCursor });
  if (!nextFileCursor) {
    queueDebugEvent("pagination_click_ignored", { reason:"next_cursor_missing", prefix:currentPrefix, page:filePageIndex+1 });
    setStatus("Không có cursor trang tiếp theo. Hãy làm mới thư viện để cập nhật danh sách.", true);
    return;
  }
  filePageCursors[filePageIndex+1] = nextFileCursor;
  filePageIndex++;
  await loadFiles();
});
function setFolder(prefix) {
  queueDebugEvent("library_folder_change", { from: currentPrefix, to: prefix });
  currentPrefix=prefix; filePageCursors=[null]; filePageIndex=0; nextFileCursor=null;
  fileLoadSequence++;
}
$("fileInput").addEventListener("change", async (event) => {
  const files = [...event.target.files];
  event.target.value = "";
  if (files.length) await uploadFiles(files);
});

async function uploadOne(file, index, total) {
  if (!allowed.test(file.name)) throw new Error("Định dạng không hỗ trợ: " + file.name);
  const key = currentPrefix + file.name;
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

checkSession();
