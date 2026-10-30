const API = "/api/readalong-admin";
const CHUNK_SIZE = 8 * 1024 * 1024;
const allowed = /\.(pdf|json|mp3|m4a|m4b|aac|wav|ogg|oga|opus|flac|wma)$/i;
let currentPrefix = "";
let filePageCursors = [null];
let filePageIndex = 0;
let nextFileCursor = null;
let dialogResolve = null;

const $ = (id) => document.getElementById(id);
const show = (id, visible) => $(id).classList.toggle("hidden", !visible);
const setStatus = (message, error = false) => {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
};
const api = async (path, options = {}) => {
  const response = await fetch(API + "/" + path, { credentials: "same-origin", ...options });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    show("managerPanel", false);
    show("loginPanel", true);
    show("logoutBtn", false);
  }
  if (!response.ok) throw new Error(data.error || "Yêu cầu thất bại (" + response.status + ")");
  return data;
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

async function checkSession() {
  try {
    const result = await api("session");
    show("loginPanel", !result.authenticated);
    show("managerPanel", result.authenticated);
    show("logoutBtn", result.authenticated);
    if (result.authenticated) { await loadFiles(); activateTab("library"); }
  } catch (error) {
    show("loginPanel", true);
    show("managerPanel", false);
    $("loginError").textContent = error.message;
  }
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("loginError").textContent = "";
  const code = $("otpCode").value.trim();
  try {
    await postJson("login", { code });
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
  setStatus("Đang tải danh sách…");
  $("fileRows").replaceChildren();
  $("currentPath").textContent = "/" + currentPrefix;
  try {
    const cursor = filePageCursors[filePageIndex];
    const result = await api("files?prefix=" + encodeURIComponent(currentPrefix) + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""));
    nextFileCursor = result.truncated ? result.cursor : null;
    $("prevPageBtn").disabled = filePageIndex === 0;
    $("nextPageBtn").disabled = !nextFileCursor;
    $("pageLabel").textContent = "Trang " + (filePageIndex + 1);
    const entries = [...result.folders, ...result.files].sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, "vi");
    });
    if (currentPrefix) {
      const parent = document.createElement("tr");
      const up = document.createElement("button");
      up.className = "folder-name"; up.type = "button"; up.textContent = "↰ ..";
      up.addEventListener("click", () => { const parent = currentPrefix.split("/").filter(Boolean).slice(0, -1).join("/"); setFolder(parent ? parent + "/" : ""); loadFiles(); });
      const cell = document.createElement("td"); cell.append(up); parent.append(cell);
      addCell(parent, "Thư mục cha"); addCell(parent, "—"); addCell(parent, "—"); addCell(parent, "—");
      $("fileRows").append(parent);
    }
    for (const entry of entries) {
      const row = document.createElement("tr");
      addEntry(row, entry);
      $("fileRows").append(row);
    }
    if (!entries.length && !currentPrefix) {
      const row = document.createElement("tr"); const cell = addCell(row, "Thư viện chưa có tệp. Hãy tải PDF/audio lên.");
      cell.colSpan = 5; cell.className = "empty"; $("fileRows").append(row);
    } else if (!entries.length && currentPrefix) {
      const row = document.createElement("tr"); const cell = addCell(row, "Thư mục trống.");
      cell.colSpan = 5; cell.className = "empty"; $("fileRows").append(row);
    }
    setStatus("Đã tải " + entries.length + " mục · Trang " + (filePageIndex + 1) + (result.truncated ? " · Còn trang tiếp theo" : " · Trang cuối"));
  } catch (error) {
    setStatus(error.message, true);
  }
}


function activateTab(name) {
  const library = name === "library";
  show("libraryPanel", library);
  show("diagnosticsPanel", !library);
  $("libraryTabBtn").classList.toggle("active", library);
  $("diagnosticsTabBtn").classList.toggle("active", !library);
  if (!library && $("diagnosticsPanel").dataset.scanned !== "true") runDiagnostics();
}
$("libraryTabBtn").addEventListener("click", () => activateTab("library"));
$("diagnosticsTabBtn").addEventListener("click", () => activateTab("diagnostics"));

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
      "Đã kiểm tra " + result.scanned + " tệp trong " + (result.prefix || "toàn bộ thư viện") +
      " · " + formatDate(result.checkedAt);
    $("diagnosticStats").append(
      diagnosticStat("Tệp đã quét", result.scanned, "neutral"),
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
    setStatus("Kiểm tra hoàn tất: " + result.errors + " lỗi, " + result.warnings + " cảnh báo.", result.errors > 0);
  } catch (error) {
    $("diagnosticsSummary").textContent = "Không thể hoàn tất kiểm tra: " + error.message;
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
$("prevPageBtn").addEventListener("click", () => { if (filePageIndex > 0) { filePageIndex--; loadFiles(); } });
$("nextPageBtn").addEventListener("click", () => { if (nextFileCursor) { filePageCursors[filePageIndex + 1] = nextFileCursor; filePageIndex++; loadFiles(); } });
function setFolder(prefix) { currentPrefix = prefix; filePageCursors = [null]; filePageIndex = 0; nextFileCursor = null; }
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
