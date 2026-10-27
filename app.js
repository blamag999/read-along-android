// Ứng dụng đọc PDF và đồng bộ âm thanh theo từng trang (PDF Audio Sync)

// STATE CHÍNH CỦA ỨNG DỤNG
const state = {
  pdfDoc: null,
  pdfLoading: false,
  pageNum: 1,
  totalPages: 0,
  pageRendering: false,
  pageNumPending: null,
  pageNumPendingSyncAudio: false,
  pdfFileName: '',
  audioFileName: '',
  currentBookKey: '', // Key định danh duy nhất của cuốn truyện hiện tại
  dirHandle: null, // Thư mục trên máy tính nếu được cấp quyền ghi
  folderJsonFiles: [], // Các tệp JSON trong thư mục được chọn để đồng bộ hàng loạt

  // DANH SÁCH TẬP TRUYỆN (PLAYLIST)
  playlist: [],
  currentStoryIndex: -1,
  activeFilter: 'paired', // Mặc định chỉ hiện mục đủ PDF và MP3
  searchQuery: '',
  playlistPage: 1,
  playlistPageSize: 0,
  playlistTotalPages: 1,

  // Mốc thời gian: { [pageNumber]: timestampInSeconds } (CHỈ DÀNH RIÊNG CHO CUỐN HIỆN TẠI)
  pageTimestamps: {},
  pageTurnMode: 'next', // next: tự lật trang theo mốc | markers: dừng chờ người đọc lật trang | off: đọc liên tục
  waitingForManualPageTurn: false,
  pendingManualPage: null,
  resumeAfterManualTurn: false,
  autoSeekAudio: true,
  isAudioDrivenChange: false,

  // CHẾ ĐỘ HIỂN THỊ
  viewMode: 'fit-height',
  zoomScale: 1.0,

  // MULTI-AUDIO STATE
  currentAudioIndex: 0,   // Phần âm thanh đang phát trong currentStoryAudios
  currentStoryAudios: [], // Danh sách các phần âm thanh của truyện đang mở
  pdfSelectionInProgress: false
};

// =======================================================
// INDEXEDDB THƯ VIỆN SÁCH (CÁCH LY DỮ LIỆU TỪNG CUỐN)
// =======================================================
const DB_NAME = 'PdfAudioSyncDB';
const DB_STORE = 'book_library';
let dbInstance = null;

function initIndexedDB() {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    request.onerror = () => resolve(null);
  });
}

// Tạo key định danh duy nhất không trùng lặp cho mỗi truyện
function getBookUniqueKey(pdfName, audioName) {
  const name = pdfName || audioName || 'unnamed';
  return name
    .toLowerCase()
    .replace(/\.[^/.]+$/, "")
    .replace(/^[xX]22/g, "")
    .replace(/[_\-\s,\.]+/g, "_")
    .trim();
}

function normalizeStoryTitle(filename) {
  if (!filename) return '';
  return filename
    .replace(/\.[^/.]+$/, "")
    .replace(/^[xX]22/g, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\bread[\s_-]*along\b/gi, "")
    .replace(/\bbook\b/gi, "")
    .replace(/\bside[\s_-]*[0-9]+\b/gi, "")
    .replace(/\bpart[\s_-]*[0-9]+\b/gi, "")
    .replace(/[,\.]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function saveBookToLibrary(bookData) {
  if (!dbInstance) await initIndexedDB();
  if (!dbInstance || !bookData.id) return;

  try {
    const tx = dbInstance.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const getReq = store.get(bookData.id);
    getReq.onsuccess = () => {
      const existing = getReq.result || {};
      const merged = {
        id: bookData.id,
        pdfName: bookData.pdfName || existing.pdfName || '',
        pdfBlob: bookData.pdfBlob || existing.pdfBlob || null,
        audioName: bookData.audioName || existing.audioName || '',
        audioBlob: bookData.audioBlob || existing.audioBlob || null,
        audios: (bookData.audios !== undefined) ? bookData.audios : (existing.audios || []),
        timestamps: (bookData.timestamps !== undefined) ? bookData.timestamps : (existing.timestamps || {}),
        updatedAt: Date.now()
      };
      store.put(merged);
    };
  } catch (err) {}
}

async function getBookFromLibrary(key) {
  if (!dbInstance) await initIndexedDB();
  if (!dbInstance || !key) return null;

  return new Promise((resolve) => {
    try {
      const tx = dbInstance.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const req = store.get(key.toLowerCase());
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

// DOM ELEMENTS
const dom = {
  btnFitHeight: document.getElementById('btnFitHeight'),
  btnTwoPages: document.getElementById('btnTwoPages'),
  btnAutoFlipToggle: document.getElementById('btnAutoFlipToggle'),
  btnReloadMarkers: document.getElementById('btnReloadMarkers'),
  btnOpenReadMenu: document.getElementById('btnOpenReadMenu'),
  readOptionsMenu: document.getElementById('readOptionsMenu'),
  menuTwoPages: document.getElementById('menuTwoPages'),
  menuAutoFlip: document.getElementById('menuAutoFlip'),
  menuReloadMarkers: document.getElementById('menuReloadMarkers'),
  menuCheckUpdates: document.getElementById('menuCheckUpdates'),
  updateChannelSelect: document.getElementById('updateChannelSelect'),
  menuTwoPagesState: document.getElementById('menuTwoPagesState'),
  menuAutoFlipState: document.getElementById('menuAutoFlipState'),
  btnZoomOut: document.getElementById('btnZoomOut'),
  btnZoomIn: document.getElementById('btnZoomIn'),
  lblZoomLevel: document.getElementById('lblZoomLevel'),

  btnOpenPlaylist: document.getElementById('btnOpenPlaylist'),
  lblPlaylistCount: document.getElementById('lblPlaylistCount'),
  playlistModal: document.getElementById('playlistModal'),
  btnClosePlaylist: document.getElementById('btnClosePlaylist'),
  lblPlaylistSubtitle: document.getElementById('lblPlaylistSubtitle'),
  txtPlaylistSearch: document.getElementById('txtPlaylistSearch'),
  playlistItemsList: document.getElementById('playlistItemsList'),
  playlistLoading: document.getElementById('playlistLoading'),
  btnPlaylistPrevPage: document.getElementById('btnPlaylistPrevPage'),
  btnPlaylistNextPage: document.getElementById('btnPlaylistNextPage'),
  lblPlaylistPage: document.getElementById('lblPlaylistPage'),
  playlistPagination: document.getElementById('playlistPagination'),
  btnExportR2Catalog: document.getElementById('btnExportR2Catalog'),
  r2PublicBaseInput: document.getElementById('r2PublicBaseInput'),

  btnNode1FolderOnline: document.getElementById('btnNode1FolderOnline'),
  btnToggleSettings: document.getElementById('btnToggleSettings'),
  btnChooseAudio: document.getElementById('btnChooseAudio'),
  folderInput: document.getElementById('folderInput'),
  pdfFileInput: document.getElementById('pdfFileInput'),
  audioFileInput: document.getElementById('audioFileInput'),

  node1Modal: document.getElementById('node1Modal'),
  btnCloseNode1Modal: document.getElementById('btnCloseNode1Modal'),
  btnTriggerFolderPicker: document.getElementById('btnTriggerFolderPicker'),
  btnTriggerPdfPicker: document.getElementById('btnTriggerPdfPicker'),
  btnLoadR2Catalog: document.getElementById('btnLoadR2Catalog'),

  pdfFileName: document.getElementById('pdfFileName'),
  audioFileName: document.getElementById('audioFileName'),
  syncCountBadge: document.getElementById('syncCountBadge'),
  syncBanner: document.getElementById('syncBanner'),

  filePickerSection: document.getElementById('filePickerSection'),


  viewerContainer: document.getElementById('viewerContainer'),
  dropOverlay: document.getElementById('dropOverlay'),
  emptyState: document.getElementById('emptyState'),
  canvasWrapper: document.getElementById('canvasWrapper'),
  pageLeftWrapper: document.getElementById('pageLeftWrapper'),
  pageRightWrapper: document.getElementById('pageRightWrapper'),
  pdfCanvasLeft: document.getElementById('pdfCanvasLeft'),
  pdfCanvasRight: document.getElementById('pdfCanvasRight'),
  pdfLoadingIndicator: document.getElementById('pdfLoadingIndicator'),
  lblLoadingText: document.getElementById('lblLoadingText'),

  lblPagePrefix: document.getElementById('lblPagePrefix'),
  lblCurrentPage: document.getElementById('lblCurrentPage'),
  readerPageStatus: document.getElementById('readerPageStatus'),
  pageJumpInput: document.getElementById('pageJumpInput'),
  btnPageJump: document.getElementById('btnPageJump'),
  lblTotalPages: document.getElementById('lblTotalPages'),
  lblPageTimestamp: document.getElementById('lblPageTimestamp'),
  lblSaveStatus: document.getElementById('lblSaveStatus'),
  btnPinCurrentTime: document.getElementById('btnPinCurrentTime'),
  btnSaveToFolder: document.getElementById('btnSaveToFolder'),

  audioElement: document.getElementById('audioElement'),
  audioSeeker: document.getElementById('audioSeeker'),
  lblAudioCurrentTime: document.getElementById('lblAudioCurrentTime'),
  lblAudioDuration: document.getElementById('lblAudioDuration'),
  btnPrevPage: document.getElementById('btnPrevPage'),
  btnNextPage: document.getElementById('btnNextPage'),
  btnPlayPause: document.getElementById('btnPlayPause'),
  playPauseIcon: document.getElementById('playPauseIcon'),
  btnRewind5: document.getElementById('btnRewind5'),
  btnForward5: document.getElementById('btnForward5'),
  btnReplayPage: document.getElementById('btnReplayPage'),
  selPageTurnMode: document.getElementById('selPageTurnMode'),
  chkAutoSeekAudio: document.getElementById('chkAutoSeekAudio'),

  btnOpenSyncModal: document.getElementById('btnOpenSyncModal'),
  btnCloseSyncModal: document.getElementById('btnCloseSyncModal'),
  syncModal: document.getElementById('syncModal'),
  syncTableBody: document.getElementById('syncTableBody'),
  btnExportSync: document.getElementById('btnExportSync'),
  btnSaveToGithubFolder: document.getElementById('btnSaveToGithubFolder'),
  btnLoadFromGithub: document.getElementById('btnLoadFromGithub'),
  githubTokenInput: document.getElementById('githubTokenInput'),
  githubTokenStatus: document.getElementById('githubTokenStatus'),
  btnSaveGithubToken: document.getElementById('btnSaveGithubToken'),
  btnClearGithubToken: document.getElementById('btnClearGithubToken'),
  importSyncInput: document.getElementById('importSyncInput'),
  btnClearSync: document.getElementById('btnClearSync'),
  toastMessage: document.getElementById('toastMessage')
};

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function showToast(msg) {
  dom.toastMessage.textContent = msg;
  dom.toastMessage.classList.remove('hidden');
  setTimeout(() => {
    dom.toastMessage.classList.add('hidden');
  }, 3500);
}

function updateSyncCountBadge() {
  const count = Object.keys(state.pageTimestamps).length;
  dom.syncCountBadge.textContent = `⏱️ ${count} mốc`;
  if (count > 0) {
    dom.syncCountBadge.classList.remove('empty');
  } else {
    dom.syncCountBadge.classList.add('empty');
  }
}

// GitHub stores only marker JSON; PDF and audio remain local.
const GITHUB_OWNER='blamag999',GITHUB_REPO='pdf-audio-sync',GITHUB_BRANCH='main',GITHUB_SYNC_DIR='sync_data';
const GITHUB_TOKEN_SESSION_KEY='pdf_audio_sync_github_token';let githubSyncTimer=null;
function getSyncStem(){
  const n = state.pdfFileName || state.currentBookKey || 'truyen';
  return n.replace(/\.[^/.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'truyen';
}
function getCloudSyncPath(){return GITHUB_SYNC_DIR+'/'+getSyncStem()+'.json';}
function getGithubToken(){return(sessionStorage.getItem(GITHUB_TOKEN_SESSION_KEY)||'').trim();}
function updateGithubTokenStatus(){
 const token=getGithubToken();
 if(dom.githubTokenStatus)dom.githubTokenStatus.textContent=token?'Đã có token trong phiên hiện tại ('+token.slice(0,8)+'…'+token.slice(-4)+').':'Chưa có token trong phiên này.';
 if(dom.githubTokenInput)dom.githubTokenInput.value='';
}
function saveGithubTokenFromInput(){
 const token=(dom.githubTokenInput?.value||'').trim();
 if(!token){showToast('Hãy nhập token mới trước khi lưu.');dom.githubTokenInput?.focus();return;}
 if(!/^(github_pat_|gh[pousr]_[A-Za-z0-9_]+)/.test(token)){
  if(!confirm('Token không giống định dạng token GitHub thông dụng. Bạn vẫn muốn lưu token này?'))return;
 }
 try{sessionStorage.setItem(GITHUB_TOKEN_SESSION_KEY,token);updateGithubTokenStatus();showToast('Đã lưu/thay GitHub token trong phiên hiện tại.');}
 catch(e){showToast('Không thể lưu token trong phiên trình duyệt.');}
}
function clearGithubToken(){
 if(!getGithubToken()){updateGithubTokenStatus();showToast('Không có token nào đang lưu trong phiên này.');return;}
 if(!confirm('Xóa token khỏi phiên trình duyệt hiện tại? Thao tác này không thu hồi token trên GitHub.'))return;
 sessionStorage.removeItem(GITHUB_TOKEN_SESSION_KEY);
 if(githubSyncTimer){clearTimeout(githubSyncTimer);githubSyncTimer=null;}
 updateGithubTokenStatus();showToast('Đã xóa token khỏi phiên trình duyệt.');
}
function encodeBase64Utf8(v){const b=new TextEncoder().encode(v);let x='';for(let i=0;i<b.length;i+=0x8000)x+=String.fromCharCode(...b.subarray(i,i+0x8000));return btoa(x);}
async function getGithubWriteToken(askForToken=false){
 let token=getGithubToken();
 if(!token&&askForToken){
  token=prompt('Nhập GitHub Personal Access Token có quyền Contents: Read and write cho blamag999/pdf-audio-sync. Token chỉ được giữ trong phiên trình duyệt hiện tại.');
  if(token){token=token.trim();if(token)sessionStorage.setItem(GITHUB_TOKEN_SESSION_KEY,token);}
 }
 if(!token&&askForToken)alert('Chưa có GitHub token. Cần quyền Contents: Read and write.');
 return token||'';
}
async function getGitBlobSha(content){
 const bytes=new TextEncoder().encode(content);
 const prefix=new TextEncoder().encode('blob '+bytes.length+'\0');
 const all=new Uint8Array(prefix.length+bytes.length);all.set(prefix);all.set(bytes,prefix.length);
 const digest=await crypto.subtle.digest('SHA-1',all);
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
async function putJsonFileOnGitHub(filename,content,token){
 const safeName=filename.split('/').pop();
 if(!safeName||safeName==='.'||safeName==='..')throw Error('Tên tệp JSON không hợp lệ: '+filename);
 const path=GITHUB_SYNC_DIR+'/'+safeName;
 const url='https://api.github.com/repos/'+GITHUB_OWNER+'/'+GITHUB_REPO+'/contents/'+path.split('/').map(encodeURIComponent).join('/');
 const headers={'Accept':'application/vnd.github+json','Authorization':'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
 const localSha=await getGitBlobSha(content);
 const old=await fetch(url+'?ref='+encodeURIComponent(GITHUB_BRANCH),{headers});
 let sha=null;
 if(old.ok){
  const oldData=await old.json();sha=oldData.sha||null;
  if(sha===localSha)return {path,changed:false};
 }else if(old.status!==404)throw Error(filename+': không đọc được tệp hiện có trên GitHub ('+old.status+').');
 const body={message:'Sync changed JSON file '+safeName,content:encodeBase64Utf8(content),branch:GITHUB_BRANCH};
 if(sha)body.sha=sha;
 const res=await fetch(url,{method:'PUT',headers,body:JSON.stringify(body)});
 if(!res.ok)throw Error(filename+': GitHub từ chối lưu ('+res.status+'): '+(await res.text()).slice(0,300));
 return {path,changed:true};
}
async function syncAllFolderJsonToGitHub({askForToken=false}={}){
 let token=await getGithubWriteToken(askForToken);
 if(!token)return false;
 let files=[];
 try{
  if(state.dirHandle){
   for await(const entry of state.dirHandle.values()){
    if(entry.kind==='file'&&entry.name.toLowerCase().endsWith('.json')){
     files.push({name:entry.name,blob:await entry.getFile()});
    }
   }
  }else{
   files=(state.folderJsonFiles||[]).slice();
  }
 }catch(e){
  alert('Không thể đọc các tệp JSON trong thư mục đã chọn. Hãy chọn lại thư mục và cấp quyền đọc.\\n\\n'+e.message);
  return false;
 }
 if(!files.length){
  showToast('Không tìm thấy tệp JSON trong thư mục đã chọn. Hãy mở thư mục trước khi đồng bộ hàng loạt.');
  return false;
 }
 let changed=0,unchanged=0,failed=[];
 updateSaveStatusBadge('☁️ Đang kiểm tra thay đổi các tệp JSON...');
 for(const item of files){
  try{
   const content=await item.blob.text();
   JSON.parse(content);
   const result=await putJsonFileOnGitHub(item.name,content,token);
   if(result.changed)changed++;else unchanged++;
  }catch(e){failed.push(item.name+': '+e.message);console.error('Lỗi đồng bộ JSON',item.name,e);}
 }
 if(failed.length){
  updateSaveStatusBadge('⚠️ Có '+failed.length+' tệp JSON lỗi');
  alert('Kết quả: '+changed+' tệp đã cập nhật, '+unchanged+' tệp không thay đổi, '+failed.length+' tệp lỗi.\\n\\nTệp lỗi:\\n'+failed.slice(0,10).join('\\n')+(failed.length>10?'\\n...':''));
  return false;
 }
 updateSaveStatusBadge('☁️ '+changed+' tệp cập nhật, '+unchanged+' tệp không đổi');
 showToast(changed?'Đã cập nhật '+changed+' tệp JSON; bỏ qua '+unchanged+' tệp không thay đổi.':'Không có tệp JSON nào thay đổi; không cần tải lên.');
 return true;
}
async function syncCurrentBookToGitHub({askForToken=false}={}){
 if(!state.currentBookKey||!state.pdfFileName){if(askForToken)alert('Vui lòng mở PDF trước khi đồng bộ mốc.');return false;}
 let token=getGithubToken();if(!token&&askForToken){token=prompt('Nhập GitHub Personal Access Token có quyền Contents: Read and write cho blamag999/pdf-audio-sync. Token chỉ được giữ trong phiên trình duyệt hiện tại.');if(token){token=token.trim();sessionStorage.setItem(GITHUB_TOKEN_SESSION_KEY,token);}}
 if(!token){if(askForToken)alert('Chưa có GitHub token. Cần quyền Contents: Read and write.');return false;}
 const path=getCloudSyncPath(),url='https://api.github.com/repos/'+GITHUB_OWNER+'/'+GITHUB_REPO+'/contents/'+path.split('/').map(encodeURIComponent).join('/');
 const headers={'Accept':'application/vnd.github+json','Authorization':'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
 try{const content=JSON.stringify(state.pageTimestamps,null,2);const localSha=await getGitBlobSha(content);
 const old=await fetch(url+'?ref='+encodeURIComponent(GITHUB_BRANCH),{headers});let sha=null;if(old.ok)sha=(await old.json()).sha||null;else if(old.status!==404)throw Error('Không đọc được file GitHub ('+old.status+').');
 if(sha&&sha===localSha){updateSaveStatusBadge('☁️ Mốc GitHub đã mới nhất');return true;}
 const body={message:'Sync reading markers for '+getSyncStem(),content:encodeBase64Utf8(content),branch:GITHUB_BRANCH};if(sha)body.sha=sha;
 const res=await fetch(url,{method:'PUT',headers,body:JSON.stringify(body)});if(!res.ok)throw Error('GitHub từ chối lưu ('+res.status+'): '+await res.text());
 updateSaveStatusBadge('☁️ Đã đồng bộ GitHub');showToast('☁️ Đã đồng bộ mốc lên GitHub: '+path);return true;
 }catch(e){console.error(e);updateSaveStatusBadge('⚠️ Đồng bộ GitHub lỗi');if(askForToken)alert('Không thể đồng bộ. Kiểm tra token và quyền Contents: Read and write.\\n\\n'+e.message);return false;}
}
function scheduleGitHubSync(){
 if(!getGithubToken()||!state.currentBookKey||githubSyncTimer)return;
 // Chờ tối đa 1 phút kể từ thay đổi đầu tiên; không khởi động lại bộ đếm khi tiếp tục sửa.
 githubSyncTimer=setTimeout(async()=>{
  githubSyncTimer=null;
  await syncCurrentBookToGitHub();
 },60000);
}
async function reloadCurrentBookFromGitHub() {
  if (!state.pdfFileName || !state.currentBookKey) {
    showToast('Trước tiên hãy mở PDF cần đồng bộ.');
    return;
  }
  const button = dom.btnLoadFromGithub;
  if (button) { button.disabled = true; button.textContent = '⏳ Đang tải...'; }
  if (dom.btnReloadMarkers) { dom.btnReloadMarkers.disabled = true; dom.btnReloadMarkers.textContent = '…'; }
  updateSaveStatusBadge('☁️ Đang tải mốc từ GitHub...');
  try {
    const loaded = await loadCloudSyncForBook();
    if (loaded) {
      renderSyncTable();
      showToast('☁️ Đã tải mốc mới nhất từ GitHub.');
    } else {
      updateSaveStatusBadge('⚠️ Không tìm thấy JSON trên GitHub');
      showToast('Không tìm thấy JSON trên GitHub cho tên PDF này.');
    }
  } finally {
    if (button) { button.disabled = false; button.textContent = '⬇️ Tải mốc từ GitHub'; }
    if (dom.btnReloadMarkers) { dom.btnReloadMarkers.disabled = false; dom.btnReloadMarkers.textContent = '⟳'; }
  }
}

async function loadCloudSyncForBook(){
  const stems=[...new Set([getSyncStem(),state.currentBookKey].filter(Boolean))];
  for(const stem of stems){
    // Ưu tiên tên chuẩn mới, sau đó thử tên cũ có hậu tố _sync.
    for(const filename of [stem+'.json',stem+'_sync.json']){
      try{
        const url='https://raw.githubusercontent.com/'+GITHUB_OWNER+'/'+GITHUB_REPO+'/'+GITHUB_BRANCH+'/'+GITHUB_SYNC_DIR+'/'+encodeURIComponent(filename);
        const res=await fetch(url,{cache:'no-store'});
        if(!res.ok)continue;
        const data=await res.json();
        if(data&&typeof data==='object'&&!Array.isArray(data)){
          state.pageTimestamps=data;saveSyncToStorage();updatePageTimestampBadge();updateSyncCountBadge();
          updateSaveStatusBadge('☁️ Đã nạp mốc từ GitHub');return true;
        }
      }catch(e){console.warn('Không thể nạp mốc GitHub:',e);}
    }
  }
  return false;
}

// =======================================================
// RESET VÀ NẠP MỐC CHUẨN XÁC THEO TỪNG CUỐN (FIX TRIỆT ĐỂ LỖI DỮ LIỆU LẠ)
// =======================================================
async function resetAndLoadSyncForBook(bookKey, attachedJsonBlob, remoteSyncUrl = '') {
  // 1. Luôn xóa sạch toàn bộ mốc của cuốn trước đó khỏi RAM
  state.pageTimestamps = {};
  state.currentBookKey = bookKey;
  state.pageNum = 1;

  if (dom.audioElement) {
    dom.audioElement.pause();
    dom.audioElement.currentTime = 0;
  }
  if (dom.audioSeeker) dom.audioSeeker.value = 0;
  if (dom.lblAudioCurrentTime) dom.lblAudioCurrentTime.textContent = '00:00';

  dom.lblCurrentPage.textContent = '1';
  dom.lblPageTimestamp.textContent = 'Mốc: Chưa gán';
  dom.lblPageTimestamp.style.color = '#94a3b8';
  updateSaveStatusBadge('💾 Mới (Chưa có mốc)');
  updateSyncCountBadge();

  if (!bookKey) return;

  // 2. THỨ TỰ ƯU TIÊN 1: Nếu có file JSON đi kèm trong thư mục
  if (attachedJsonBlob) {
    try {
      const text = await attachedJsonBlob.text();
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        state.pageTimestamps = parsed;
        saveSyncToStorage();
        updatePageTimestampBadge();
        updateSyncCountBadge();
        updateSaveStatusBadge('💾 Đã nạp từ file .json thư mục');
        return;
      }
    } catch (e) {}
  }

  // 2a. Ưu tiên JSON đồng bộ công khai trên R2; nếu GitHub có bản mới hơn thì dùng bản GitHub.
  if (remoteSyncUrl) {
    try {
      const response = await fetch(remoteSyncUrl, { cache: 'no-store' });
      if (response.ok) {
        const parsed = await response.json();
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          state.pageTimestamps = parsed;
          saveSyncToStorage();
          updatePageTimestampBadge();
          updateSyncCountBadge();
          updateSaveStatusBadge('☁️ Đã nạp mốc từ Cloudflare R2');
          if (await loadCloudSyncForBook()) {
            updateSaveStatusBadge('☁️ Đã nạp mốc mới nhất từ GitHub');
          }
          return;
        }
      }
      console.warn('Không nạp được JSON mốc từ R2:', response.status);
    } catch (error) {
      console.warn('Không thể nạp JSON mốc từ R2 (kiểm tra URL/CORS):', error);
    }
  }

  // 2b. TU DONG TIM JSON SYNC TRONG THU MUC (dirHandle) NEU CHUA CO BLOB
  if (state.dirHandle && bookKey) {
    var jsonNames = [
      bookKey + '_sync.json',
      bookKey + '.json'
    ];
    for (var ji = 0; ji < jsonNames.length; ji++) {
      try {
        var fh = await state.dirHandle.getFileHandle(jsonNames[ji]);
        var djfile = await fh.getFile();
        var djtext = await djfile.text();
        var djparsed = JSON.parse(djtext);
        if (djparsed && typeof djparsed === 'object' && Object.keys(djparsed).length > 0) {
          state.pageTimestamps = djparsed;
          saveSyncToStorage();
          updatePageTimestampBadge();
          updateSyncCountBadge();
          updateSaveStatusBadge('Đã nạp mốc từ thư mục: ' + jsonNames[ji]);
          return;
        }
      } catch (eDir) {}
    }
  }
// 3. THỨ TỰ ƯU TIÊN 2: Kiểm tra trong bộ nhớ LocalStorage của trình duyệt
  if (await loadCloudSyncForBook()) { showToast('☁️ Đã tải mốc thời gian từ GitHub'); return; }
  const storageKey = `sync_${bookKey}`;
  try { const raw=localStorage.getItem(storageKey); if(raw){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object'&&Object.keys(parsed).length){state.pageTimestamps=parsed;updatePageTimestampBadge();updateSyncCountBadge();updateSaveStatusBadge('💾 Đã nạp từ bộ nhớ máy');return;}} } catch(e) {}

  // 5. Nếu không có mốc nào: Giữ nguyên rỗng {}
  state.pageTimestamps = {};
  updatePageTimestampBadge();
  updateSyncCountBadge();
}

// =======================================================
// XÂY DỰNG VÀ QUẢN LÝ DANH SÁCH TẬP TRUYỆN (PLAYLIST)
// =======================================================
// Danh mục trực tuyến dùng địa chỉ công khai đã cấu hình; không đặt token hay khóa bí mật trong mã nguồn.

function fileNameFromUrl(url, fallback) {
  try { return decodeURIComponent(new URL(url).pathname.split('/').pop()) || fallback; }
  catch (error) { return fallback || url; }
}

async function loadR2Catalog() {
  const button = dom.btnLoadR2Catalog;
  if (button) { button.disabled = true; button.textContent = '⏳ Đang tải sách...'; }
  dom.playlistLoading.classList.remove('hidden');
  dom.playlistItemsList.replaceChildren();
  try {
    // Catalog được đóng gói sẵn trong ứng dụng; không hỏi người dùng nhập URL.
    const catalogUrl = new URL('https://pub-763a3a5ae235415cbef15b64f7a20820.r2.dev/books.json');
    const response = await fetch(catalogUrl.href, { cache: 'no-store' });
    if (!response.ok) throw new Error('Không tải được books.json (' + response.status + ').');
    const data = await response.json();
    const entries = Array.isArray(data) ? data : (data && Array.isArray(data.books) ? data.books : null);
    if (!entries || !entries.length) throw new Error('books.json không có danh sách sách hợp lệ.');
    const stories = entries.filter(item => item && item.pdf && (item.audios || item.audio))
      .map(item => {
        const audioEntries = item.audios || item.audio || [];
        const audioList = Array.isArray(audioEntries) ? audioEntries : [audioEntries];
        const pdfUrl = typeof item.pdf === 'string' ? item.pdf : item.pdf.url;
        const syncUrl = item.sync || item.json || '';
        const urls = audioList.map(value => typeof value === 'string' ? value : value && value.url).filter(Boolean);
        if (!pdfUrl || !urls.length) return null;
        return {
          id: item.id || getBookUniqueKey(fileNameFromUrl(pdfUrl, 'book.pdf')),
          title: item.title || normalizeStoryTitle(fileNameFromUrl(pdfUrl, 'book.pdf')),
          pdf: { name: fileNameFromUrl(pdfUrl, 'book.pdf'), url: pdfUrl },
          audios: urls.map(url => ({ name: fileNameFromUrl(url, 'audio.mp3'), url })),
          json: syncUrl ? { name: fileNameFromUrl(syncUrl, 'sync.json'), url: syncUrl } : null,
          source: 'r2'
        };
      }).filter(Boolean);
    if (!stories.length) throw new Error('Danh mục books.json không có mục nào gồm PDF và MP3 hợp lệ.');
    state.playlist = stories;
    state.activeFilter = 'paired';
    state.playlistPage = 1;
    updatePlaylistBadgeCount();
    renderPlaylistView();
    dom.lblPlaylistSubtitle.textContent = stories.length + ' mục trực tuyến';
    openPlaylistModal();
    showToast('Đã tải ' + stories.length + ' sách từ R2.');
  } catch (error) {
    console.error('Không thể tải danh sách sách R2:', error);
    alert('Không thể tải danh sách sách từ R2. Kiểm tra URL, định dạng books.json và CORS. ' + error.message);
  } finally {
    dom.playlistLoading.classList.add('hidden');
    if (button) { button.disabled = false; button.textContent = '☁️ Sách trên Cloudflare R2'; }
  }
}

function getManualR2PublicBase() {
  const input = dom.r2PublicBaseInput;
  const raw = input ? input.value.trim() : '';
  if (!raw) {
    alert('Vui lòng nhập URL công khai gốc của bucket R2 trước khi xuất books.json. Ví dụ: https://pub-xxxxxxxx.r2.dev');
    input?.focus();
    return '';
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (error) {
    alert('URL R2 không hợp lệ. Hãy nhập URL đầy đủ, bắt đầu bằng https://');
    input?.focus();
    return '';
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.r2.dev') || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    alert('Hãy nhập URL gốc dạng https://pub-xxxxxxxx.r2.dev, không thêm tên tệp, đường dẫn, tham số hoặc dấu #.');
    input?.focus();
    return '';
  }
  return parsed.origin;
}

function buildR2ObjectUrl(filename, baseUrl) {
  const path = String(filename || '').split('/').map(segment => encodeURIComponent(segment)).join('/');
  return baseUrl + '/' + path;
}

function exportR2CatalogFromPlaylist() {
  const baseUrl = getManualR2PublicBase();
  if (!baseUrl) return;

  const allStories = Array.isArray(state.playlist) ? state.playlist : [];
  const pairedStories = allStories.filter(story =>
    story && story.pdf && story.pdf.name && Array.isArray(story.audios) &&
    story.audios.some(audio => audio && audio.name)
  );

  if (!pairedStories.length) {
    alert('Chưa có sách nào đủ PDF và MP3 để xuất. Hãy chọn thư mục chứa sách trước.');
    return;
  }

  const books = pairedStories.map(story => ({
    id: story.id || getBookUniqueKey(story.pdf.name),
    title: story.title || normalizeStoryTitle(story.pdf.name),
    pdf: buildR2ObjectUrl(story.pdf.name, baseUrl),
    audios: story.audios
      .filter(audio => audio && audio.name)
      .map(audio => buildR2ObjectUrl(audio.name, baseUrl)),
    sync: story.json && story.json.name
      ? buildR2ObjectUrl(story.json.name, baseUrl)
      : null
  }));

  const blob = new Blob([JSON.stringify({ books }, null, 2)], {
    type: 'application/json;charset=utf-8'
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = 'books.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

  const skippedStories = allStories.filter(story =>
    !(story && story.pdf && story.pdf.name && Array.isArray(story.audios) &&
      story.audios.some(audio => audio && audio.name))
  );
  let message = 'Đã xuất books.json gồm ' + books.length + ' sách.';
  if (skippedStories.length) {
    const details = skippedStories.map(story => {
      const hasPdf = !!(story && story.pdf && story.pdf.name);
      const hasAudio = !!(story && Array.isArray(story.audios) && story.audios.some(audio => audio && audio.name));
      const reason = !hasPdf && !hasAudio ? 'thiếu PDF và MP3' : !hasPdf ? 'thiếu PDF' : 'thiếu MP3';
      return '- ' + ((story && story.title) || (story && story.id) || 'Mục không tên') + ': ' + reason;
    });
    alert(message + '\\n\\nBỏ qua ' + skippedStories.length + ' mục chưa đủ tệp:\\n' + details.join('\\n'));
  } else {
    showToast(message);
  }
}

function buildPlaylistFromItems(rawItems) {
  const groups = {};
  const jsonItems = [];

  // Pass 1: Gom PDF va Audio truoc
  rawItems.forEach(function(item) {
    if (item.type === 'json') {
      jsonItems.push(item);
      return;
    }

    const norm = normalizeStoryTitle(item.name);
    const key = norm.toLowerCase().replace(/\s+/g, "_");

    if (!groups[key]) {
      groups[key] = {
        id: key,
        title: norm.charAt(0).toUpperCase() + norm.slice(1),
        pdf: null,
        audios: [],
        json: null
      };
    }

    if (item.type === 'pdf') {
      groups[key].pdf = item;
    } else if (item.type === 'audio') {
      const partMatch = item.name.match(/part[_\s-]*(\d+)|side[_\s-]*([ab])|disc[_\s-]*(\d+)|\b(\d+)\s*of\s*\d+/i);
      item.partLabel = partMatch
        ? (partMatch[1] ? ('Phần ' + partMatch[1]) : partMatch[2] ? ('Mặt ' + partMatch[2].toUpperCase()) : partMatch[3] ? ('Đĩa ' + partMatch[3]) : ('Phần ' + partMatch[4]))
        : null;
      groups[key].audios.push(item);
    }
  });

  // Bước 2: Gán các tệp JSON vào đúng truyện
  jsonItems.forEach(function(jItem) {
    const jNorm = normalizeStoryTitle(jItem.name).toLowerCase().replace(/\s+/g, "_");
    // 1. Khop chinh xac id
    if (groups[jNorm]) {
      groups[jNorm].json = jItem;
      return;
    }
    // 2. Tim nhom nao co id nam trong ten file json hoac nguoc lai
    for (const key of Object.keys(groups)) {
      if (jNorm.includes(key) || key.includes(jNorm)) {
        groups[key].json = jItem;
        return;
      }
    }
  });

  // Chỉ giữ nhóm có PDF hoặc âm thanh; không tạo thẻ giả từ tệp JSON mốc đọc.
  const playlistArray = Object.values(groups).filter(function(g) {
    return g.pdf || (g.audios && g.audios.length > 0);
  });

  playlistArray.forEach(function(story) {
    // Sap xep audio parts theo ten file (part 1 truoc part 2, v.v.)
    story.audios.sort(function(a, b) {
      return a.name.localeCompare(b.name, 'vi', { numeric: true });
    });
    // Gan label mac dinh neu chua co
    if (story.audios.length > 1) {
      story.audios.forEach(function(aud, i) {
        if (!aud.partLabel) aud.partLabel = 'Phần ' + (i + 1);
      });
    }
  });
  playlistArray.sort(function(a, b) {
    return a.title.localeCompare(b.title, 'vi', { numeric: true });
  });

  state.playlist = playlistArray;
  state.playlistPage = 1;
  updatePlaylistBadgeCount();
  renderPlaylistView();

  if (playlistArray.length > 0) {
    dom.lblPlaylistSubtitle = document.getElementById('lblPlaylistSubtitle');
    if (dom.lblPlaylistSubtitle) {
      dom.lblPlaylistSubtitle.textContent = 'Tìm thấy ' + playlistArray.length + ' tập truyện trong thư mục';
    }
    openPlaylistModal();
    showToast('Đã nạp danh sách ' + playlistArray.length + ' tập truyện!');
  }
}
function updatePlaylistBadgeCount() {
  const count = state.playlist.length;
  const available = count > 0;
  dom.btnOpenPlaylist.disabled = !available;
  dom.btnOpenPlaylist.setAttribute('aria-disabled', String(!available));
  dom.btnOpenPlaylist.title = available
    ? 'Mở danh sách tập trong thư mục đã chọn'
    : 'Hãy chọn thư mục trước để mở danh sách tập';
  if (available) {
    dom.lblPlaylistCount.textContent = count;
    dom.lblPlaylistCount.classList.remove('hidden');
  } else {
    dom.lblPlaylistCount.classList.add('hidden');
  }
}

function openPlaylistModal() {
  dom.playlistModal.classList.remove('hidden');
  requestAnimationFrame(() => {
    renderPlaylistView();
    const firstCard = dom.playlistItemsList.querySelector('.playlist-card');
    (firstCard || dom.btnClosePlaylist)?.focus({ preventScroll: true });
  });
}

function updatePlaylistPagination(totalPages, totalItems) {
  if (!dom.playlistPagination) return;
  dom.playlistPagination.classList.toggle('hidden', totalItems === 0);
  dom.btnPlaylistPrevPage.disabled = state.playlistPage <= 1;
  dom.btnPlaylistNextPage.disabled = state.playlistPage >= totalPages;
  state.playlistTotalPages = totalPages;
  dom.lblPlaylistPage.textContent = `Trang ${state.playlistPage} / ${totalPages} · ${totalItems} tập`;
  dom.lblPlaylistPage.setAttribute('aria-label', `Trang ${state.playlistPage} trên ${totalPages}, ${totalItems} tập`);
}

function renderPlaylistView() {
  dom.playlistItemsList.replaceChildren();
  const query = state.searchQuery.toLowerCase().trim();
  const filter = state.activeFilter;

  const filtered = state.playlist.filter(story => {
    const matchQuery = !query || story.title.toLowerCase().includes(query) ||
      (story.pdf && story.pdf.name.toLowerCase().includes(query)) ||
      (story.audios.some(a => a.name.toLowerCase().includes(query)));

    if (!matchQuery) return false;
    if (filter === 'paired') return story.pdf && story.audios.length > 0;
    if (filter === 'pdf') return !!story.pdf;
    if (filter === 'mp3') return story.audios.length > 0;
    return true;
  });

  filtered.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'vi', { sensitivity: 'base', numeric: true }));

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:30px 12px;color:#94a3b8;';
    empty.textContent = 'Không tìm thấy tập truyện nào phù hợp!';
    dom.playlistItemsList.appendChild(empty);
    state.playlistPage = 1;
    state.playlistPageSize = 0;
    updatePlaylistPagination(1, 0);
    return;
  }

  // Ước lượng số hàng theo chiều cao thực tế, sau đó giảm tiếp nếu nội dung tràn.
  const listHeight = dom.playlistItemsList.clientHeight || Math.max(240, window.innerHeight - 240);
  const compactLayout = window.innerWidth <= 560 || window.matchMedia('(orientation: portrait)').matches;
  let pageSize = Math.max(1, Math.floor(listHeight / (compactLayout ? 58 : 48)));
  let totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  state.playlistPage = Math.max(1, Math.min(state.playlistPage || 1, totalPages));

  function renderCurrentPage() {
    dom.playlistItemsList.replaceChildren();
    const pageStart = (state.playlistPage - 1) * pageSize;
    const pageStories = filtered.slice(pageStart, pageStart + pageSize);
    const pageFragment = document.createDocumentFragment();

    pageStories.forEach((story, pageOffset) => {
      const index = pageStart + pageOffset;
      const card = document.createElement('div');
      const isPlaying = (state.currentBookKey === story.id);
      card.className = `playlist-card ${isPlaying ? 'active-playing' : ''}`;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `${index + 1}. ${story.title}. Mở tập`);

      let tagsHtml = '';
      if (story.pdf) tagsHtml += `<span class="mini-badge badge-pdf">📄 ${story.pdf.name}</span>`;
      if (story.audios && story.audios.length > 0) {
        story.audios.forEach((aud) => {
          tagsHtml += `<span class="mini-badge badge-mp3">🎵 ${aud.name}</span>`;
        });
      }

      let audioPartBtnsHtml = '';
      if (story.audios && story.audios.length > 1) {
        audioPartBtnsHtml = '<div class="card-audio-parts">';
        story.audios.forEach(function(a, i) {
          const lbl = a.partLabel || ('Phần ' + (i + 1));
          audioPartBtnsHtml += '<button class="card-part-btn" data-partidx="' + i + '" title="' + a.name + '">' + lbl + '</button>';
        });
        audioPartBtnsHtml += '</div>';
      }

      let coverHtml = '';
      if (story.coverUrl) {
        coverHtml = `<img src="${story.coverUrl}" class="card-cover" alt="Bìa" loading="lazy" onerror="this.style.display='none'">`;
      }

      card.innerHTML =
        coverHtml +
        '<span class="apk-story-number">' + (index + 1) + '</span>' +
        '<div class="card-title-col">' +
          '<h4>' + (isPlaying ? '&#9654; ' : '') + story.title + '</h4>' +
          '<div class="card-tags">' + tagsHtml + '</div>' +
          audioPartBtnsHtml +
        '</div>' +
        '<button class="card-play-btn" type="button">' + (isPlaying ? 'Đang đọc' : '&#9654; Mở') + '</button>';

      function openStory(partIndex) {
        loadStoryFromPlaylist(story, partIndex || 0);
        dom.playlistModal.classList.add('hidden');
      }
      card.addEventListener('click', function(e) {
        if (e.target.closest('.card-part-btn')) return;
        openStory(0);
      });
      card.addEventListener('keydown', function(e) {
        if (e.target.closest('.card-part-btn')) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openStory(0);
        }
      });
      card.querySelectorAll('.card-part-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          openStory(parseInt(btn.getAttribute('data-partidx'), 10));
        });
      });

      pageFragment.appendChild(card);
    });
    dom.playlistItemsList.appendChild(pageFragment);

    // Một số hàng có nhiều phần âm thanh hoặc tiêu đề dài; tự giảm số mục để vừa khung.
    if (dom.playlistItemsList.clientHeight > 0 &&
        dom.playlistItemsList.scrollHeight > dom.playlistItemsList.clientHeight + 2 &&
        pageSize > 1) {
      pageSize -= 1;
      totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      state.playlistPage = Math.min(state.playlistPage, totalPages);
      renderCurrentPage();
    }
  }

  renderCurrentPage();
  state.playlistPageSize = pageSize;
  updatePlaylistPagination(totalPages, filtered.length);
}

// MỞ TRUYỆN TỪ PLAYLIST (TỰ ĐỘNG NẠP MỐC ĐÚNG CUỐN ĐÓ)
async function loadStoryFromPlaylist(story, audioPartIndex) {
  if (!story) return;

  const uniqueKey = story.id || getBookUniqueKey(story.title);
  state.currentBookKey = uniqueKey;
  state.pdfFileName = (story.pdf && story.pdf.name) ? story.pdf.name : (story.title || uniqueKey) + '.pdf';
  state.currentStoryAudios = story.audios || [];
  state.currentAudioIndex = (typeof audioPartIndex === 'number') ? audioPartIndex : 0;

  dom.lblLoadingText.textContent = 'Đang mở: ' + story.title + '...';
  dom.pdfLoadingIndicator.classList.remove('hidden');

  try {
    const jsonBlob = story.json ? story.json.blob : null;
    await resetAndLoadSyncForBook(uniqueKey, jsonBlob, story.json ? story.json.url : '');

    if (story.pdf) {
      if (story.pdf.blob) await loadPdfFromBlob(story.pdf.blob, false);
      else if (story.pdf.url) await loadPdfFromUrl(story.pdf.url, story.pdf.name, false);
    }

    loadAudioPart(state.currentAudioIndex);
    showToast('📖 Đang đọc: ' + story.title);
    renderPlaylistView();
    updateAudioPartUI();
  } catch (err) {
    console.error('Lỗi khi mở truyện từ playlist:', err);
    alert('Không thể mở truyện: ' + err.message);
  } finally {
    dom.pdfLoadingIndicator.classList.add('hidden');
  }
}

// NAP MOT PART AUDIO CU THE
function loadAudioPart(index) {
  const audios = state.currentStoryAudios;
  if (!audios || audios.length === 0) return;
  const clampedIdx = Math.max(0, Math.min(index, audios.length - 1));
  state.currentAudioIndex = clampedIdx;
  const audio = audios[clampedIdx];
  if (audio.blob) loadAudioFromBlob(audio.blob);
  else if (audio.url) loadAudioFromUrl(audio.url, audio.name);
  updateAudioPartUI();
}

function loadAudioFromUrl(url, name) {
  if (!url) return false;
  state.audioFileName = name || url.split('/').pop() || 'audio';
  dom.audioElement.pause();
  const previousUrl = dom.audioElement.dataset.objectUrl;
  if (previousUrl) {
    URL.revokeObjectURL(previousUrl);
    delete dom.audioElement.dataset.objectUrl;
  }
  dom.audioElement.playbackRate = 1.0;
  dom.audioFileName.textContent = '🎵 ' + state.audioFileName;
  dom.audioFileName.classList.remove('empty');
  if (dom.audioSeeker) dom.audioSeeker.value = 0;
  if (dom.lblAudioCurrentTime) dom.lblAudioCurrentTime.textContent = '00:00';
  dom.audioElement.src = url;
  dom.audioElement.load();
  dom.audioElement.addEventListener('loadedmetadata', () => {
    try { dom.audioElement.currentTime = 0; } catch (error) {}
    if (dom.audioSeeker) {
      dom.audioSeeker.max = Number.isFinite(dom.audioElement.duration) ? dom.audioElement.duration : 0;
      dom.audioSeeker.value = 0;
    }
  }, { once: true });
  return true;
}

// CAP NHAT UI THANH CHON AUDIO PART
function updateAudioPartUI() {
  const audios = state.currentStoryAudios;
  let container = document.getElementById('audioPartSelector');

  if (!audios || audios.length <= 1) {
    if (container) container.classList.add('hidden');
    return;
  }

  if (!container) {
    container = document.createElement('div');
    container.id = 'audioPartSelector';
    container.className = 'audio-part-selector';
    const footer = document.querySelector('.app-footer');
    if (footer) footer.insertBefore(container, footer.firstChild);
  }

  container.classList.remove('hidden');
  var html = '<span class="audio-part-label">Phan audio:</span>';
  audios.forEach(function(a, i) {
    var lbl = a.partLabel || ('Phần ' + (i + 1));
    var isActive = (i === state.currentAudioIndex) ? ' active' : '';
    html += '<button class="audio-part-btn' + isActive + '" onclick="selectAudioPart(' + i + ')" title="' + a.name + '">' + lbl + '</button>';
  });
  container.innerHTML = html;
}

// CHON AUDIO PART
window.selectAudioPart = function(index) {
  loadAudioPart(index);
  showToast('Đã chuyển sang phần ' + (index + 1));
};

// Nguồn nội dung: tệp PDF và âm thanh cục bộ; chỉ đồng bộ JSON mốc đọc qua GitHub.
// =======================================================
// SỰ KIỆN GIAO DIỆN
// =======================================================
function initEvents() {
  initIndexedDB();

  dom.btnOpenPlaylist.addEventListener('click', () => {
    if (state.playlist.length === 0) return;
    openPlaylistModal();
  });

  if (dom.btnExportR2Catalog) dom.btnExportR2Catalog.addEventListener('click', exportR2CatalogFromPlaylist);

  dom.btnClosePlaylist.addEventListener('click', () => dom.playlistModal.classList.add('hidden'));
  dom.playlistModal.addEventListener('click', (e) => {
    if (e.target === dom.playlistModal) dom.playlistModal.classList.add('hidden');
  });

  dom.txtPlaylistSearch.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    state.playlistPage = 1;
    renderPlaylistView();
  });

  function changePlaylistPage(delta) {
    const nextPage = Math.max(1, Math.min(state.playlistTotalPages, state.playlistPage + delta));
    if (nextPage === state.playlistPage) return;
    state.playlistPage = nextPage;
    renderPlaylistView();
    requestAnimationFrame(() => dom.playlistItemsList.querySelector('.playlist-card')?.focus({ preventScroll: true }));
  }
  dom.btnPlaylistPrevPage.addEventListener('click', () => changePlaylistPage(-1));
  dom.btnPlaylistNextPage.addEventListener('click', () => changePlaylistPage(1));
  dom.playlistModal.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.target.closest('button, input, select, textarea')) return;
    const card = e.target.closest('.playlist-card');
    if (!card) return;
    const cards = Array.from(dom.playlistItemsList.querySelectorAll('.playlist-card'));
    const index = cards.indexOf(card);
    if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      cards[index - 1].focus({ preventScroll: true });
    } else if (e.key === 'ArrowDown') {
      if (index < cards.length - 1) {
        e.preventDefault();
        cards[index + 1].focus({ preventScroll: true });
      } else if (state.playlistPage < state.playlistTotalPages) {
        e.preventDefault();
        changePlaylistPage(1);
      }
    } else if (e.key === 'ArrowLeft' && state.playlistPage > 1) {
      e.preventDefault();
      changePlaylistPage(-1);
    } else if (e.key === 'ArrowRight' && state.playlistPage < state.playlistTotalPages) {
      e.preventDefault();
      changePlaylistPage(1);
    }
  });
  window.addEventListener('resize', () => {
    if (!dom.playlistModal.classList.contains('hidden')) renderPlaylistView();
  });

  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      state.activeFilter = e.target.getAttribute('data-filter');
      state.playlistPage = 1;
      renderPlaylistView();
    });
  });

  dom.btnNode1FolderOnline.addEventListener('click', () => dom.node1Modal.classList.remove('hidden'));
  dom.btnToggleSettings.addEventListener('click', () => {
    const willHide = !dom.filePickerSection.classList.contains('hidden');
    dom.filePickerSection.classList.toggle('hidden', willHide);
    dom.syncBanner.classList.toggle('hidden', willHide);
    dom.btnToggleSettings.setAttribute('aria-expanded', String(!willHide));
    dom.btnToggleSettings.title = willHide
      ? 'Hiện dòng chọn tệp, tùy chọn và thanh mốc trang'
      : 'Ẩn dòng chọn tệp, tùy chọn và thanh mốc trang';
  });
  dom.btnChooseAudio.addEventListener('click', () => dom.audioFileInput.click());
  dom.btnCloseNode1Modal.addEventListener('click', () => dom.node1Modal.classList.add('hidden'));
  dom.node1Modal.addEventListener('click', (e) => {
    if (e.target === dom.node1Modal) dom.node1Modal.classList.add('hidden');
  });

  if (dom.btnLoadR2Catalog) dom.btnLoadR2Catalog.addEventListener('click', () => {
    dom.node1Modal.classList.add('hidden');
    loadR2Catalog();
  });

  dom.btnTriggerFolderPicker.addEventListener('click', () => {
    dom.node1Modal.classList.add('hidden');
    handleFolderPick();
  });
  dom.btnTriggerPdfPicker.addEventListener('click', () => {
    dom.node1Modal.classList.add('hidden');
    dom.pdfFileInput.click();
  });
  dom.folderInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length) handleFileList(files);
    e.target.value = '';
  });
  dom.pdfFileInput.addEventListener('change', handlePdfFileSelect);
  dom.audioFileInput.addEventListener('change', handleAudioFileSelect);

  dom.btnFitHeight.addEventListener('click', () => setViewMode('fit-height'));
  dom.btnTwoPages.addEventListener('click', () => setViewMode(state.viewMode === 'two-pages' ? 'fit-height' : 'two-pages'));
  if (dom.btnOpenReadMenu && dom.readOptionsMenu) {
    dom.btnOpenReadMenu.addEventListener('click', () => {
      const isOpen = !dom.readOptionsMenu.classList.contains('hidden');
      dom.readOptionsMenu.classList.toggle('hidden', isOpen);
      dom.btnOpenReadMenu.setAttribute('aria-expanded', String(!isOpen));
    });
    document.addEventListener('click', (event) => {
      if (!dom.readOptionsMenu.contains(event.target) && !dom.btnOpenReadMenu.contains(event.target)) {
        dom.readOptionsMenu.classList.add('hidden');
        dom.btnOpenReadMenu.setAttribute('aria-expanded', 'false');
      }
    });
  }
  if (dom.menuTwoPages) dom.menuTwoPages.addEventListener('click', () => {
    setViewMode(state.viewMode === 'two-pages' ? 'fit-height' : 'two-pages');
    updateReadMenuState();
  });
  if (dom.menuAutoFlip) dom.menuAutoFlip.addEventListener('click', () => {
    if (dom.btnAutoFlipToggle) dom.btnAutoFlipToggle.click();
    else {
      dom.selPageTurnMode.value = state.pageTurnMode === 'next' ? 'off' : 'next';
      dom.selPageTurnMode.dispatchEvent(new Event('change', { bubbles: true }));
    }
    updateReadMenuState();
  });
  if (dom.menuReloadMarkers) dom.menuReloadMarkers.addEventListener('click', () => {
    reloadCurrentBookFromGitHub();
    dom.readOptionsMenu.classList.add('hidden');
    dom.btnOpenReadMenu.setAttribute('aria-expanded', 'false');
  });
  if (dom.btnAutoFlipToggle) {
    dom.btnAutoFlipToggle.addEventListener('click', () => {
      const enabled = state.pageTurnMode !== 'next';
      state.pageTurnMode = enabled ? 'next' : 'off';
      dom.selPageTurnMode.value = state.pageTurnMode;
      dom.btnAutoFlipToggle.classList.toggle('active', enabled);
      dom.btnAutoFlipToggle.setAttribute('aria-pressed', String(enabled));
      dom.btnAutoFlipToggle.title = enabled ? 'Tự động lật trang: bật' : 'Tự động lật trang: tắt';
      updateReadMenuState();
      showToast(enabled ? 'Đã bật tự động lật trang theo mốc.' : 'Đã tắt tự động lật trang.');
    });
  }
  if (dom.btnReloadMarkers) dom.btnReloadMarkers.addEventListener('click', reloadCurrentBookFromGitHub);
  dom.btnZoomIn.addEventListener('click', () => changeZoom(0.15));
  dom.btnZoomOut.addEventListener('click', () => changeZoom(-0.15));

  initDragAndDrop();

dom.selPageTurnMode.value = state.pageTurnMode;
  if (dom.btnAutoFlipToggle) {
    const autoFlipOn = state.pageTurnMode === 'next';
    dom.btnAutoFlipToggle.classList.toggle('active', autoFlipOn);
    dom.btnAutoFlipToggle.setAttribute('aria-pressed', String(autoFlipOn));
  }
  dom.selPageTurnMode.addEventListener('change', (e) => {
    state.pageTurnMode = e.target.value;
    state.waitingForManualPageTurn = false;
    state.pendingManualPage = null;
    state.resumeAfterManualTurn = false;
    showToast(
      state.pageTurnMode === 'markers'
        ? 'Đến mốc trang kế tiếp, audio sẽ dừng chờ bạn lật trang; nếu không có mốc, audio tiếp tục.'
        : state.pageTurnMode === 'next'
          ? 'Audio tự động lật trang theo mốc thời gian.'
          : 'Đọc liên tục; không tự dừng hoặc tự chuyển trang.'
    );
  });
  dom.chkAutoSeekAudio.addEventListener('change', (e) => { state.autoSeekAudio = e.target.checked; });
  dom.btnPageJump.addEventListener('click', jumpToEnteredPage);
  dom.pageJumpInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') jumpToEnteredPage(); });
  dom.btnReplayPage.addEventListener('click', replayCurrentPage);
  dom.audioElement.playbackRate = 1.0;
  initPdfClickNavigation();

  dom.btnPrevPage.addEventListener('click', () => changePage(-1));
  dom.btnNextPage.addEventListener('click', () => changePage(1));

  dom.btnPinCurrentTime.addEventListener('click', pinCurrentTimeToPage);
  dom.btnSaveToFolder.addEventListener('click', saveSyncToDirectoryOrDownload);

  dom.btnPlayPause.addEventListener('click', togglePlayPause);
  dom.btnRewind5.addEventListener('click', () => {
    dom.audioElement.currentTime = Math.max(0, dom.audioElement.currentTime - 5);
  });
  dom.btnForward5.addEventListener('click', () => {
    dom.audioElement.currentTime = Math.min(dom.audioElement.duration || 0, dom.audioElement.currentTime + 5);
  });

  // Android TV remote support: IR and Bluetooth remotes that emit Android key events.
  installTvRemoteControls();
  dom.audioElement.addEventListener('timeupdate', onAudioTimeUpdate);
  dom.audioElement.addEventListener('loadedmetadata', onAudioMetadataLoaded);
  dom.audioElement.addEventListener('play', updatePlayButtonState);
  dom.audioElement.addEventListener('pause', updatePlayButtonState);
  dom.audioElement.addEventListener('ended', () => {
    updatePlayButtonState();
    onAudioEnded();
  });
  dom.audioElement.addEventListener('error', () => {
    if (!dom.audioElement.src) return;
    const mediaError = dom.audioElement.error;
    const reason = mediaError && mediaError.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
      ? 'Định dạng hoặc tệp âm thanh không được trình duyệt hỗ trợ.'
      : 'Không thể tải tệp âm thanh. Hãy thử chọn lại file MP3.';
    showToast(reason);
    updatePlayButtonState();
  });

  dom.audioSeeker.addEventListener('input', (e) => {
    dom.audioElement.currentTime = parseFloat(e.target.value);
  });

  dom.btnOpenSyncModal.addEventListener('click', openSyncModal);
  dom.btnCloseSyncModal.addEventListener('click', () => dom.syncModal.classList.add('hidden'));
  dom.syncModal.addEventListener('click', (e) => {
    if (e.target === dom.syncModal) dom.syncModal.classList.add('hidden');
  });

  dom.btnExportSync.addEventListener('click', exportSyncData);
  dom.btnSaveGithubToken.addEventListener('click', saveGithubTokenFromInput);
  dom.btnClearGithubToken.addEventListener('click', clearGithubToken);
  updateGithubTokenStatus();
  dom.btnSaveToGithubFolder.addEventListener('click', () => {
    if (state.dirHandle || (state.folderJsonFiles && state.folderJsonFiles.length)) syncAllFolderJsonToGitHub({ askForToken: true });
    else syncCurrentBookToGitHub({ askForToken: true });
  });
  dom.btnLoadFromGithub.addEventListener('click', reloadCurrentBookFromGitHub);
  dom.importSyncInput.addEventListener('change', importSyncData);
  dom.btnClearSync.addEventListener('click', clearAllSync);

  initTouchGestures();

  window.addEventListener('resize', debounce(() => {
    if (state.pdfDoc) renderCurrentSpread();
  }, 300));
}

// =======================================================
// XỬ LÝ CHỌN FILE LẺ NÚT 2 & 3
// =======================================================
async function handlePdfFileSelect(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const key = getBookUniqueKey(file.name);
  state.currentBookKey = key;
  dom.btnChooseAudio.classList.remove('hidden');
  state.pdfSelectionInProgress = true;
  state.currentStoryAudios = [];
  state.currentAudioIndex = 0;
  dom.audioElement.pause();
  dom.audioElement.removeAttribute('src');
  dom.audioElement.load();
  dom.audioFileName.textContent = '🎵 Chưa có MP3';
  dom.audioFileName.classList.add('empty');
  updateAudioPartUI();

  // Không tự mở hộp thoại MP3; người dùng chủ động bấm nút "Chọn MP3".
  try {
    await loadPdfFromBlob(file, true);
    saveBookToLibrary({
      id: key,
      pdfName: file.name,
      pdfBlob: file
    });
  } finally {
    state.pdfSelectionInProgress = false;
  }
  showToast('Đã mở PDF. Chọn file MP3 tương ứng để bắt đầu nghe.');
}

async function handleAudioFileSelect(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (files.length === 0) return;

  dom.pdfLoadingIndicator.classList.remove('hidden');
  dom.lblLoadingText.textContent = 'Đang nạp tệp âm thanh...';
  try {
  // Chuyển danh sách file thành audio items có partLabel và sắp xếp
  const audioItems = files.map(f => {
    const partMatch = f.name.match(/part[_\s-]*(\d+)|side[_\s-]*([ab])|disc[_\s-]*(\d+)|\b(\d+)\s*of\s*\d+/i);
    const partLabel = partMatch
      ? (partMatch[1] ? ('Phần ' + partMatch[1]) : partMatch[2] ? ('Mặt ' + partMatch[2].toUpperCase()) : partMatch[3] ? ('Đĩa ' + partMatch[3]) : ('Phần ' + partMatch[4]))
      : null;
    return {
      name: f.name,
      blob: f,
      type: 'audio',
      partLabel: partLabel
    };
  });

  audioItems.sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
  if (audioItems.length > 1) {
    audioItems.forEach((aud, i) => {
      if (!aud.partLabel) aud.partLabel = 'Phần ' + (i + 1);
    });
  }

  // Cập nhật danh sách audio đang mở vào state
  state.currentStoryAudios = audioItems;
  state.currentAudioIndex = 0;
  if (state.pdfDoc) dom.btnChooseAudio.classList.remove('hidden');

  // Nạp part đầu tiên và hiển thị thanh chọn part
  loadAudioPart(0);
  updateAudioPartUI();

  if (audioItems.length > 1) {
    showToast(`🎵 Đã nạp ${audioItems.length} phần âm thanh!`);
  }

  // Tìm kiếm PDF tương ứng nếu chưa mở PDF
  const key = getBookUniqueKey(files[0].name);
  if (!state.pdfDoc && !state.pdfSelectionInProgress) {
    const saved = await getBookFromLibrary(key);
    if (saved && saved.pdfBlob) {
      state.currentBookKey = key;
      await loadPdfFromBlob(saved.pdfBlob, true);
      showToast(`⚡ Đã tự động mở PDF: ${saved.pdfName}`);
    }
  }

  const currentKey = state.currentBookKey || key;
  await saveBookToLibrary({
    id: currentKey,
    audioName: audioItems[0].name,
    audioBlob: audioItems[0].blob,
    audios: audioItems
  });
  showToast(`Đã nạp ${audioItems.length} tệp âm thanh. Nhấn Play để bắt đầu nghe.`);
  } catch (error) {
    console.error('Lỗi khi nạp MP3:', error);
    showToast('Không thể nạp MP3: ' + (error && error.message ? error.message : 'Lỗi không xác định'));
  } finally {
    dom.pdfLoadingIndicator.classList.add('hidden');
  }
}

// =======================================================
// XỬ LÝ NÚT 1: CHỌN THƯ MỤC TRÊN MÁY
// =======================================================
async function handleFolderPick() {
  if ('showDirectoryPicker' in window) {
    try {
      state.dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      state.folderJsonFiles = [];
      const files = [];
      for await (const entry of state.dirHandle.values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          files.push(file);
        }
      }
      handleFileList(files);
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  dom.folderInput.click();
}

function handleFileList(files) {
  if (!files || files.length === 0) return;

  const rawItems = [];
  state.folderJsonFiles = [];
  files.forEach(f => {
    const l = f.name.toLowerCase();
    let type = 'unknown';
    if (l.endsWith('.pdf')) type = 'pdf';
    else if (l.endsWith('.mp3') || l.endsWith('.m4a') || l.endsWith('.wav') || l.endsWith('.ogg')) type = 'audio';
    else if (l.endsWith('.json')) type = 'json';

    if (type === 'json') state.folderJsonFiles.push({ name: f.name, blob: f });
    if (type !== 'unknown') {
      rawItems.push({
        name: f.name,
        blob: f,
        type: type
      });
    }
  });

  if (rawItems.length > 0) {
    buildPlaylistFromItems(rawItems);
    if (state.playlist.length > 0) {
      loadStoryFromPlaylist(state.playlist[0]);
    }
  } else {
    alert('Không tìm thấy file PDF hoặc MP3 nào trong thư mục!');
  }
}

async function loadPdfFromUrl(url, fileName, shouldResetSync = true) {
  state.pdfFileName = fileName || url.split('/').pop() || 'book.pdf';
  dom.pdfFileName.textContent = '📄 ' + state.pdfFileName;
  dom.pdfFileName.classList.remove('empty');
  dom.lblLoadingText.textContent = 'Đang tải sách từ Cloudflare R2...';
  dom.pdfLoadingIndicator.classList.remove('hidden');

  const key = state.currentBookKey || getBookUniqueKey(state.pdfFileName);
  state.currentBookKey = key;
  if (shouldResetSync) await resetAndLoadSyncForBook(key, null);

  state.pdfLoading = true;
  try {
    while (state.pageRendering) await new Promise(resolve => setTimeout(resolve, 16));
    const previousDoc = state.pdfDoc;
    state.pdfDoc = null;
    if (previousDoc && typeof previousDoc.destroy === 'function') {
      try { await previousDoc.destroy(); } catch (cleanupError) {}
    }
    [dom.pdfCanvasLeft, dom.pdfCanvasRight].forEach(canvas => {
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    });

    // PDF.js yêu cầu R2 cho phép CORS từ origin của GitHub Pages.
    const loadingTask = pdfjsLib.getDocument({ url, withCredentials: false });
    const nextDoc = await loadingTask.promise;
    state.pdfDoc = nextDoc;
    state.totalPages = nextDoc.numPages;
    state.pageNum = 1;
    dom.lblTotalPages.textContent = state.totalPages;
    dom.emptyState.classList.add('hidden');
    dom.canvasWrapper.classList.remove('hidden');
  } catch (error) {
    state.pdfDoc = null;
    throw new Error('Không tải được PDF từ R2. Hãy kiểm tra URL và CORS của bucket. ' + error.message);
  } finally {
    state.pdfLoading = false;
    dom.pdfLoadingIndicator.classList.add('hidden');
  }
  if (state.pdfDoc) renderCurrentSpread();
}

async function loadPdfFromBlob(file, shouldResetSync = true) {
  state.pdfFileName = file.name;
  dom.pdfFileName.textContent = `📄 ${file.name}`;
  dom.pdfFileName.classList.remove('empty');
  dom.lblLoadingText.textContent = 'Đang tải trang sách...';
  dom.pdfLoadingIndicator.classList.remove('hidden');

  const key = getBookUniqueKey(file.name);
  state.currentBookKey = key;

  if (shouldResetSync) {
    await resetAndLoadSyncForBook(key, null);
  }

  state.pdfLoading = true;
  try {
    // Chờ tác vụ vẽ hiện tại kết thúc trước khi giải phóng tài liệu cũ.
    while (state.pageRendering) {
      await new Promise(resolve => setTimeout(resolve, 16));
    }

    const previousDoc = state.pdfDoc;
    state.pdfDoc = null;
    if (previousDoc && typeof previousDoc.destroy === 'function') {
      try { await previousDoc.destroy(); } catch (cleanupError) {
        console.warn('Không thể giải phóng PDF cũ:', cleanupError);
      }
    }

    // Giải phóng bộ đệm ảnh của canvas cũ trước khi nạp tài liệu mới.
    [dom.pdfCanvasLeft, dom.pdfCanvasRight].forEach(canvas => {
      if (!canvas) return;
      canvas.width = 0;
      canvas.height = 0;
    });

    const typedarray = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjsLib.getDocument(typedarray);
    const nextDoc = await loadingTask.promise;
    state.pdfDoc = nextDoc;
    state.totalPages = nextDoc.numPages;
    state.pageNum = 1;

    dom.lblTotalPages.textContent = state.totalPages;
    dom.emptyState.classList.add('hidden');
    dom.canvasWrapper.classList.remove('hidden');
  } catch (error) {
    state.pdfDoc = null;
    alert('Không thể mở file PDF: ' + error.message);
  } finally {
    state.pdfLoading = false;
    dom.pdfLoadingIndicator.classList.add('hidden');
  }

  if (state.pdfDoc) renderCurrentSpread();
}

function loadAudioFromBlob(file) {
  if (!(file instanceof Blob)) {
    showToast('Tệp âm thanh không hợp lệ. Hãy chọn lại MP3.');
    return false;
  }

  state.audioFileName = file.name || 'audio';
  dom.audioElement.pause();
  dom.audioElement.playbackRate = 1.0;
  dom.audioFileName.textContent = `🎵 ${state.audioFileName}`;
  dom.audioFileName.classList.remove('empty');
  if (dom.audioSeeker) dom.audioSeeker.value = 0;
  if (dom.lblAudioCurrentTime) dom.lblAudioCurrentTime.textContent = '00:00';

  // Gán nguồn mới trước khi đặt currentTime. Sau khi chọn PDF, audio element
  // không còn nguồn; gán currentTime=0 lúc này có thể ném InvalidStateError
  // trên một số trình duyệt và làm dừng luồng xử lý chọn MP3.
  const objectUrl = URL.createObjectURL(file);
  const previousUrl = dom.audioElement.dataset.objectUrl;
  if (previousUrl) URL.revokeObjectURL(previousUrl);
  dom.audioElement.dataset.objectUrl = objectUrl;
  dom.audioElement.src = objectUrl;
  dom.audioElement.load();

  dom.audioElement.addEventListener('loadedmetadata', () => {
    try { dom.audioElement.currentTime = 0; } catch (error) {
      console.warn('Không thể đặt thời gian về đầu audio:', error);
    }
    if (dom.audioSeeker) {
      dom.audioSeeker.max = Number.isFinite(dom.audioElement.duration) ? dom.audioElement.duration : 0;
      dom.audioSeeker.value = 0;
    }
  }, { once: true });

  return true;
}

async function renderCurrentSpread(syncAudioToPage = false) {
  if (!state.pdfDoc || state.pdfLoading) return;
  if (state.pageRendering) {
    state.pageNumPending = state.pageNum;
    state.pageNumPendingSyncAudio = state.pageNumPendingSyncAudio || syncAudioToPage;
    return;
  }
  state.pageRendering = true;

  const isTwoPages = state.viewMode === 'two-pages';
  const containerW = dom.viewerContainer.clientWidth - 32;
  const containerH = dom.viewerContainer.clientHeight - 32;

  let leftPageNum = state.pageNum;
  let rightPageNum = isTwoPages && (leftPageNum + 1 <= state.totalPages) ? leftPageNum + 1 : null;

  if (isTwoPages && rightPageNum) {
    dom.lblPagePrefix.textContent = 'Trang';
    dom.lblCurrentPage.textContent = `${leftPageNum} - ${rightPageNum}`;
    dom.readerPageStatus.textContent = `Trang ${leftPageNum}–${rightPageNum} / ${state.totalPages}`;
    dom.readerPageStatus.classList.remove('hidden');
  } else {
    dom.lblPagePrefix.textContent = 'Trang';
    dom.lblCurrentPage.textContent = `${leftPageNum}`;
    dom.readerPageStatus.textContent = `Trang ${leftPageNum} / ${state.totalPages}`;
    dom.readerPageStatus.classList.remove('hidden');
  }
  updatePageTimestampBadge();

  try {
    const pageLeft = await state.pdfDoc.getPage(leftPageNum);
    const unscaledLeft = pageLeft.getViewport({ scale: 1 });

    let pageRight = null;
    let unscaledRight = null;
    if (rightPageNum) {
      pageRight = await state.pdfDoc.getPage(rightPageNum);
      unscaledRight = pageRight.getViewport({ scale: 1 });
    }

    let scale = 1.0;
    if (state.viewMode === 'fit-width') {
      scale = (containerW / unscaledLeft.width) * state.zoomScale;
      dom.pageRightWrapper.classList.add('hidden');
    } else if (state.viewMode === 'fit-height') {
      scale = (containerH / unscaledLeft.height) * state.zoomScale;
      dom.pageRightWrapper.classList.add('hidden');
    } else if (isTwoPages) {
      const combinedWidth = unscaledRight ? (unscaledLeft.width + unscaledRight.width + 16) : unscaledLeft.width;
      const maxHeight = unscaledRight ? Math.max(unscaledLeft.height, unscaledRight.height) : unscaledLeft.height;
      const scaleW = (containerW / combinedWidth);
      const scaleH = (containerH / maxHeight);
      scale = Math.min(scaleW, scaleH) * state.zoomScale;
    }

    const viewportLeft = pageLeft.getViewport({ scale: Math.max(scale, 0.4) });
    dom.pdfCanvasLeft.height = viewportLeft.height;
    dom.pdfCanvasLeft.width = viewportLeft.width;
    const ctxLeft = dom.pdfCanvasLeft.getContext('2d');
    await pageLeft.render({ canvasContext: ctxLeft, viewport: viewportLeft }).promise;

    if (isTwoPages && pageRight) {
      dom.pageRightWrapper.classList.remove('hidden');
      const viewportRight = pageRight.getViewport({ scale: Math.max(scale, 0.4) });
      dom.pdfCanvasRight.height = viewportRight.height;
      dom.pdfCanvasRight.width = viewportRight.width;
      const ctxRight = dom.pdfCanvasRight.getContext('2d');
      await pageRight.render({ canvasContext: ctxRight, viewport: viewportRight }).promise;
    } else {
      dom.pageRightWrapper.classList.add('hidden');
    }

  } catch (err) {
    console.error('Lỗi khi render trang:', err);
  } finally {
    state.pageRendering = false;
    if (state.pageNumPending !== null) {
      const pendingPage = state.pageNumPending;
      const shouldSyncPendingAudio = Boolean(state.pageNumPendingSyncAudio);
      state.pageNumPending = null;
      state.pageNumPendingSyncAudio = false;
      state.pageNum = pendingPage;
      renderCurrentSpread(shouldSyncPendingAudio);
    }
  }

  // Chỉ tua audio khi người dùng chủ động chuyển trang. Resize/xoay màn hình,
  // zoom hoặc đổi kiểu hiển thị chỉ render lại PDF, tuyệt đối không seek audio.
  if (syncAudioToPage && state.autoSeekAudio && !state.isAudioDrivenChange) {
    const rawTarget = state.pageTimestamps[leftPageNum];
    if (typeof rawTarget === 'number') {
      dom.audioElement.currentTime = rawTarget;
    } else if (rawTarget && typeof rawTarget === 'object' && typeof rawTarget.time === 'number') {
      if (rawTarget.part !== undefined && rawTarget.part !== state.currentAudioIndex && state.currentStoryAudios && state.currentStoryAudios[rawTarget.part]) {
        loadAudioPart(rawTarget.part);
        setTimeout(() => {
          dom.audioElement.currentTime = rawTarget.time;
        }, 300);
      } else {
        dom.audioElement.currentTime = rawTarget.time;
      }
    }
  }
}

function setViewMode(mode) {
  state.viewMode = mode;
  state.zoomScale = 1.0;
  updateZoomLabel();

  dom.btnFitHeight.classList.toggle('active', mode === 'fit-height');
  dom.btnTwoPages.classList.toggle('active', mode === 'two-pages');
  dom.btnTwoPages.setAttribute('aria-pressed', String(mode === 'two-pages'));
  updateReadMenuState();

  if (mode === 'two-pages') {
    dom.canvasWrapper.classList.add('two-page-mode');
  } else {
    dom.canvasWrapper.classList.remove('two-page-mode');
  }

  if (state.pdfDoc) renderCurrentSpread();
}

function changeZoom(delta) {
  const newZoom = Math.max(0.5, Math.min(3.0, state.zoomScale + delta));
  state.zoomScale = Math.round(newZoom * 100) / 100;
  updateZoomLabel();
  if (state.pdfDoc) renderCurrentSpread();
}

function updateZoomLabel() {
  dom.lblZoomLevel.textContent = `${Math.round(state.zoomScale * 100)}%`;
}

function changePage(delta) {
  if (!state.pdfDoc) return;
  const previousPage = state.pageNum;
  const step = (state.viewMode === 'two-pages') ? 2 * delta : delta;
  const newPage = state.pageNum + step;

  if (newPage >= 1 && newPage <= state.totalPages) {
    state.pageNum = newPage;
  } else if (delta > 0 && state.pageNum < state.totalPages) {
    state.pageNum = state.totalPages;
  } else if (delta < 0 && state.pageNum > 1) {
    state.pageNum = 1;
  } else {
    return;
  }

  state.isAudioDrivenChange = false;
  renderCurrentSpread(true);

  // Nếu audio đang chờ người đọc lật đến trang kế tiếp, tiếp tục tại đúng mốc.
  if (state.waitingForManualPageTurn && state.pendingManualPage !== null) {
    const reachedPendingPage = delta > 0 && state.pageNum >= state.pendingManualPage;
    if (reachedPendingPage) {
      const shouldResume = state.resumeAfterManualTurn;
      state.waitingForManualPageTurn = false;
      state.pendingManualPage = null;
      state.resumeAfterManualTurn = false;
      if (shouldResume) {
        // renderCurrentSpread có thể tua đến mốc trang; chờ cập nhật seek rồi phát tiếp.
        const resume = () => {
          dom.audioElement.removeEventListener('seeked', resume);
          dom.audioElement.play().catch(() => {});
        };
        dom.audioElement.addEventListener('seeked', resume, { once: true });
        setTimeout(() => {
          if (dom.audioElement.seeking) return;
          dom.audioElement.removeEventListener('seeked', resume);
          dom.audioElement.play().catch(() => {});
        }, 150);
      }
    }
  }
}

function updatePageTimestampBadge() {
  const ts = state.pageTimestamps[state.pageNum];
  if (typeof ts === 'number') {
    dom.lblPageTimestamp.textContent = 'Mốc: ' + formatTime(ts);
    dom.lblPageTimestamp.style.color = '#38bdf8';
  } else if (ts && typeof ts === 'object' && typeof ts.time === 'number') {
    const partTxt = (ts.part !== undefined) ? (' (Phần ' + (ts.part + 1) + ')') : '';
    dom.lblPageTimestamp.textContent = 'Mốc: ' + formatTime(ts.time) + partTxt;
    dom.lblPageTimestamp.style.color = '#38bdf8';
  } else {
    dom.lblPageTimestamp.textContent = 'Mốc: Chưa gán';
    dom.lblPageTimestamp.style.color = '#94a3b8';
  }
}
function updateSaveStatusBadge(text) {
  dom.lblSaveStatus.textContent = text;
}

// =======================================================
// GHIM MỐC & TỰ ĐỘNG GHI FILE VÀO THƯ MỤC TRÊN MÁY
// =======================================================
async function pinCurrentTimeToPage() {
  if (!state.pdfDoc) {
    alert('Vui lòng chọn file PDF trước!');
    return;
  }
  const currentTime = dom.audioElement.currentTime || 0;
  const roundedTime = Math.round(currentTime * 10) / 10;

  if (state.currentStoryAudios && state.currentStoryAudios.length > 1) {
    state.pageTimestamps[state.pageNum] = {
      time: roundedTime,
      part: state.currentAudioIndex
    };
  } else {
    state.pageTimestamps[state.pageNum] = roundedTime;
  }

  // 1. Lưu vào LocalStorage
  saveSyncToStorage();
  updatePageTimestampBadge();
  updateSyncCountBadge();

  // 2. Tự động lưu trực tiếp vào thư mục trên máy (nếu đang mở qua chọn thư mục)
  await autoSaveSyncToLocalDirectory();
  scheduleGitHubSync();

  const originalText = dom.btnPinCurrentTime.textContent;
  dom.btnPinCurrentTime.textContent = 'Đã ghim: ' + formatTime(roundedTime) + '!';
  dom.btnPinCurrentTime.style.backgroundColor = '#10b981';
  setTimeout(() => {
    dom.btnPinCurrentTime.textContent = originalText;
    dom.btnPinCurrentTime.style.backgroundColor = '';
  }, 1200);
}
// Tự động ghi thẳng file mốc .json vào thư mục máy tính
async function autoSaveSyncToLocalDirectory() {
  if (state.dirHandle && 'createWritable' in FileSystemFileHandle.prototype) {
    try {
      const fileName = getSyncFileName();
      const fileHandle = await state.dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(state.pageTimestamps, null, 2));
      await writable.close();
      updateSaveStatusBadge(`🟢 Đã tự lưu vào folder: ${fileName}`);
      return true;
    } catch (e) {
      console.log('Không thể tự động ghi vào thư mục: ', e);
    }
  }
  updateSaveStatusBadge('💾 Đã lưu vào bộ nhớ máy');
  return false;
}

function getSyncFileName() {
  const base = state.currentBookKey || 'truyen';
  return `${getSyncStem()}.json`;
}

async function saveSyncToDirectoryOrDownload() {
  if (Object.keys(state.pageTimestamps).length === 0) {
    alert('Chưa có mốc thời gian nào để lưu!');
    return;
  }
  const autoSaved = await autoSaveSyncToLocalDirectory();
  if (autoSaved) {
    showToast(`🟢 Đã lưu thẳng file mốc vào thư mục máy tính!`);
  } else {
    exportSyncData();
    showToast(`💾 Đã tải file [${getSyncFileName()}] về máy!`);
  }
}

function updatePlayButtonState() {
  const isPlaying = !dom.audioElement.paused && !dom.audioElement.ended;
  dom.playPauseIcon.textContent = isPlaying ? 'Ⅱ' : '▶';
  dom.btnPlayPause.setAttribute('aria-label', isPlaying ? 'Tạm dừng' : 'Phát');
  dom.btnPlayPause.title = isPlaying ? 'Tạm dừng' : 'Phát';
  dom.btnPlayPause.setAttribute('aria-pressed', String(isPlaying));
  dom.btnPlayPause.classList.toggle('is-playing', isPlaying);
}

async function togglePlayPause() {
  const hasAudioSource = Boolean(dom.audioElement.currentSrc || dom.audioElement.src);
  if (!hasAudioSource || !state.currentStoryAudios || state.currentStoryAudios.length === 0) {
    showToast('Chưa có MP3. Hãy chọn PDF (nếu cần), sau đó bấm “Chọn MP3” để nạp âm thanh.');
    dom.btnChooseAudio.classList.remove('hidden');
    dom.btnChooseAudio.focus({ preventScroll: true });
    return;
  }

  if (!dom.audioElement.paused && !dom.audioElement.ended) {
    dom.audioElement.pause();
    return;
  }

  try {
    // Đưa nút về trạng thái tạm dừng trong khi trình duyệt bắt đầu phát.
    await dom.audioElement.play();
  } catch (error) {
    updatePlayButtonState();
    console.error('Không thể phát âm thanh:', error);
    const message = error && error.name === 'NotAllowedError'
      ? 'Trình duyệt chặn phát âm thanh. Hãy bấm Play trực tiếp sau khi chọn MP3.'
      : error && error.name === 'NotSupportedError'
        ? 'File âm thanh không được trình duyệt hỗ trợ. Hãy chọn file MP3 khác.'
        : 'Không phát được âm thanh. Hãy kiểm tra file MP3 rồi thử lại.';
    showToast(message);
  }
}

function jumpToEnteredPage() {
  if (!state.pdfDoc) { showToast('Vui lòng mở PDF trước.'); return; }
  const raw = dom.pageJumpInput.value.trim();
  const target = Number(raw);
  if (!raw || !Number.isInteger(target) || target < 1 || target > state.totalPages) {
    showToast('Nhập số trang từ 1 đến ' + state.totalPages + '.');
    dom.pageJumpInput.focus();
    return;
  }
  state.pageNum = state.viewMode === 'two-pages' ? (target % 2 === 0 ? Math.max(1, target - 1) : target) : target;
  state.isAudioDrivenChange = false;
  state.waitingForManualPageTurn = false;
  state.pendingManualPage = null;
  state.resumeAfterManualTurn = false;
  renderCurrentSpread(true);
  dom.pageJumpInput.value = '';
}
function getCurrentPageTimestamp(page) {
  const raw = state.pageTimestamps[page];
  if (typeof raw === 'number' && Number.isFinite(raw)) return { time: raw, part: 0 };
  if (raw && typeof raw === 'object' && Number.isFinite(raw.time)) {
    return { time: raw.time, part: Number.isInteger(raw.part) ? raw.part : 0 };
  }
  return null;
}
function replayCurrentPage() {
  if (!state.pdfDoc) { showToast('Vui lòng mở PDF trước.'); return; }
  const marker = getCurrentPageTimestamp(state.pageNum);
  if (!marker) { showToast('Trang hiện tại chưa có mốc thời gian.'); return; }
  if (!dom.audioElement.src && !(state.currentStoryAudios && state.currentStoryAudios.length)) {
    showToast('Vui lòng mở tệp MP3 trước.');
    return;
  }
  const seekAndPlay = () => {
    dom.audioElement.currentTime = Math.max(0, marker.time);
    dom.audioElement.playbackRate = 1.0;
    dom.audioElement.play().catch(() => showToast('Không thể phát audio. Hãy bấm Phát để thử lại.'));
  };
  if (state.currentStoryAudios && state.currentStoryAudios.length > 1 &&
      marker.part !== state.currentAudioIndex && state.currentStoryAudios[marker.part]) {
    dom.audioElement.pause();
    dom.audioElement.addEventListener('loadedmetadata', function onReplayMetadata() {
      dom.audioElement.removeEventListener('loadedmetadata', onReplayMetadata);
      seekAndPlay();
    }, { once: true });
    loadAudioPart(marker.part);
  } else {
    seekAndPlay();
  }
}
function initPdfClickNavigation() {
  dom.canvasWrapper.addEventListener('click', (event) => {
    if (!state.pdfDoc || event.button !== 0 || event.target.tagName !== 'CANVAS') return;
    const canvas = event.target;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const direction = state.viewMode === 'two-pages'
      ? (canvas.id === 'pdfCanvasLeft' ? -1 : 1)
      : ((event.clientX - rect.left) < rect.width / 2 ? -1 : 1);
    changePage(direction);
  });
}

function onAudioMetadataLoaded() {
  const duration = dom.audioElement.duration || 0;
  dom.audioSeeker.max = duration;
  dom.lblAudioDuration.textContent = formatTime(duration);
}

function onAudioTimeUpdate() {
  const curr = dom.audioElement.currentTime;
  dom.audioSeeker.value = curr;
  dom.lblAudioCurrentTime.textContent = formatTime(curr);

  const hasPageMarkers = Object.keys(state.pageTimestamps).length > 0;
  if (!hasPageMarkers && state.pageTurnMode === 'next') {
    // Không có mốc thời gian: tự chuyển sang chế độ chờ lật trang.
    // Chế độ này chỉ dừng khi có mốc hợp lệ; vì không có mốc nên audio vẫn chạy liên tục.
    state.pageTurnMode = 'markers';
    dom.selPageTurnMode.value = 'markers';
  }
  if (!state.pdfDoc || state.pageTurnMode === 'off' || !hasPageMarkers) return;

  const currentPart = state.currentAudioIndex || 0;
  const matchesCurrentPart = (marker) =>
    !state.currentStoryAudios || state.currentStoryAudios.length <= 1 || marker.part === currentPart;
  const step = state.viewMode === 'two-pages' ? 2 : 1;
  const nextPage = state.pageNum + step;
  const nextMarker = nextPage <= state.totalPages ? getCurrentPageTimestamp(nextPage) : null;

  // Chế độ chờ lật trang: chỉ dừng nếu trang kế tiếp có mốc hợp lệ.
  // Tệp không có mốc cho trang kế tiếp sẽ tiếp tục phát bình thường.
  if (state.pageTurnMode === 'markers') {
    if (state.waitingForManualPageTurn || !nextMarker || !matchesCurrentPart(nextMarker)) return;
    if (curr >= nextMarker.time) {
      state.waitingForManualPageTurn = true;
      state.pendingManualPage = nextPage;
      state.resumeAfterManualTurn = !dom.audioElement.paused;
      dom.audioElement.currentTime = nextMarker.time;
      dom.audioElement.pause();
      showToast('Đã hết phần audio của trang này. Lật sang trang kế tiếp để đọc tiếp.');
    }
    return;
  }

  // Chế độ tự chuyển trang: chuyển đến trang có mốc khi audio chạm mốc đó.
  if (state.pageTurnMode === 'next' && nextMarker && matchesCurrentPart(nextMarker) && curr >= nextMarker.time) {
    state.isAudioDrivenChange = true;
    state.pageNum = nextPage;
    renderCurrentSpread();
    setTimeout(() => { state.isAudioDrivenChange = false; }, 400);
  }
}
function getStorageKey() {
  return `sync_${state.currentBookKey || 'default'}`;
}

function saveSyncToStorage() {
  if (!state.currentBookKey) return;
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(state.pageTimestamps));
  } catch (e) {
    console.error(e);
  }
}

function openSyncModal() {
  renderSyncTable();
  dom.syncModal.classList.remove('hidden');
}

function renderSyncTable() {
  dom.syncTableBody.innerHTML = '';
  const total = state.totalPages || 10;

  for (let p = 1; p <= total; p++) {
    const tr = document.createElement('tr');
    const rawTs = state.pageTimestamps[p];
    const hasTime = (typeof rawTs === 'number') || (rawTs && typeof rawTs === 'object' && typeof rawTs.time === 'number');
    const sec = typeof rawTs === 'number' ? rawTs : (hasTime ? rawTs.time : 0);
    const partNum = (hasTime && rawTs && rawTs.part !== undefined) ? rawTs.part : null;
    const partTxt = (partNum !== null) ? (' <span style="font-size:0.75rem;color:#38bdf8;">(Phần ' + (partNum + 1) + ')</span>') : '';

    tr.innerHTML = '<td><b>Trang ' + p + '</b></td>' +
      '<td>' + (hasTime ? (formatTime(sec) + partTxt) : '<span style="color:#64748b;">(Chưa có)</span>') + '</td>' +
      '<td>' +
        (hasTime ? ('<button class="btn-mini-play" onclick="seekAndPlayTo(' + sec + ', ' + p + ', ' + (partNum !== null ? partNum : 'null') + ')">▶ Nghe</button>') : '') +
        (hasTime ? ('<button class="btn-mini-del" onclick="deleteSync(' + p + ')">✕ Xóa</button>') : '') +
        '<button class="btn-mini-play" onclick="setManualSync(' + p + ')">✏️ Đặt</button>' +
      '</td>';
    dom.syncTableBody.appendChild(tr);
  }
}

window.seekAndPlayTo = function(seconds, page, part) {
  if (part !== null && part !== undefined && part !== state.currentAudioIndex && state.currentStoryAudios && state.currentStoryAudios[part]) {
    loadAudioPart(part);
    setTimeout(() => {
      dom.audioElement.currentTime = seconds;
      dom.audioElement.play();
    }, 300);
  } else {
    dom.audioElement.currentTime = seconds;
    dom.audioElement.play();
  }
  state.pageNum = page;
  renderCurrentSpread();
  dom.syncModal.classList.add('hidden');
};
window.deleteSync = function(page) {
  delete state.pageTimestamps[page];
  saveSyncToStorage();
  autoSaveSyncToLocalDirectory();
  scheduleGitHubSync();
  updatePageTimestampBadge();
  updateSyncCountBadge();
  renderSyncTable();
};

window.setManualSync = function(page) {
  const rawVal = state.pageTimestamps[page];
  const currentValSec = (typeof rawVal === 'number') ? rawVal : (rawVal && typeof rawVal === 'object' && typeof rawVal.time === 'number') ? rawVal.time : Math.floor(dom.audioElement.currentTime || 0);
  const input = prompt(`Nhập số giây bắt đầu cho Trang ${page} (hoặc dạng MM:SS):`, formatTime(currentValSec));
  if (!input) return;

  let seconds = 0;
  if (input.includes(':')) {
    const parts = input.split(':').map(Number);
    if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
    else if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else {
    seconds = parseFloat(input);
  }

  if (!isNaN(seconds) && seconds >= 0) {
    if (state.currentStoryAudios && state.currentStoryAudios.length > 1) {
      let partIdx = state.currentAudioIndex;
      if (rawVal && typeof rawVal === 'object' && typeof rawVal.part === 'number') {
        partIdx = rawVal.part;
      }
      const partInput = prompt(`Trang ${page} thuộc phần audio nào? (1 đến ${state.currentStoryAudios.length}):`, (partIdx + 1));
      if (partInput) {
        const parsedPart = parseInt(partInput, 10);
        if (!isNaN(parsedPart) && parsedPart >= 1 && parsedPart <= state.currentStoryAudios.length) {
          partIdx = parsedPart - 1;
        }
      }
      state.pageTimestamps[page] = {
        time: seconds,
        part: partIdx
      };
    } else {
      state.pageTimestamps[page] = seconds;
    }
    saveSyncToStorage();
    autoSaveSyncToLocalDirectory();
    scheduleGitHubSync();
    updatePageTimestampBadge();
    updateSyncCountBadge();
    renderSyncTable();
  } else {
    alert('Giá trị thời gian không hợp lệ!');
  }
};

function clearAllSync() {
  if (confirm('Bạn có chắc muốn xóa tất cả mốc đồng bộ của cuốn truyện này không?')) {
    state.pageTimestamps = {};
    saveSyncToStorage();
    autoSaveSyncToLocalDirectory();
    scheduleGitHubSync();
    updatePageTimestampBadge();
    updateSyncCountBadge();
    renderSyncTable();
  }
}

function exportSyncData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.pageTimestamps, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", getSyncFileName());
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function importSyncData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const imported = JSON.parse(event.target.result);
      if (typeof imported === 'object') {
        state.pageTimestamps = imported;
        saveSyncToStorage();
        autoSaveSyncToLocalDirectory();
        scheduleGitHubSync();
        updatePageTimestampBadge();
        updateSyncCountBadge();
        renderSyncTable();
        showToast('🎉 Nhập mốc thời gian thành công!');
      }
    } catch (err) {
      alert('File JSON không hợp lệ!');
    }
  };
  reader.readAsText(file);
}

function initDragAndDrop() {
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    dom.dropOverlay.classList.remove('hidden');
  });

  window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null || e.clientX <= 0 || e.clientY <= 0) {
      dom.dropOverlay.classList.add('hidden');
    }
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.dropOverlay.classList.add('hidden');
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      handleFileList(Array.from(dt.files));
    }
  });
}

function initTouchGestures() {
  let touchStartX = 0;
  let touchEndX = 0;

  dom.viewerContainer.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  dom.viewerContainer.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const threshold = 60;
    if (touchEndX < touchStartX - threshold) {
      changePage(1);
    }
    if (touchEndX > touchStartX + threshold) {
      changePage(-1);
    }
  }, { passive: true });
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// TỰ ĐỘNG CHUYỂN SANG PART AUDIO TIẾP THEO KHI KẾT THÚC
function onAudioEnded() {
  const audios = state.currentStoryAudios;
  if (audios && audios.length > 1 && state.currentAudioIndex < audios.length - 1) {
    const nextIdx = state.currentAudioIndex + 1;
    showToast('🎵 Tự động chuyển sang phần ' + (nextIdx + 1));
    loadAudioPart(nextIdx);
    // Tự động phát tiếp sau khi load
    setTimeout(() => {
      dom.audioElement.play().catch(() => {});
    }, 500);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initEvents();
  // Tự tải danh sách sách ngay khi mở ứng dụng.
  loadR2Catalog();
});


// Đồng bộ trạng thái hiển thị của các lựa chọn trong menu đọc sách.
function updateReadMenuState() {
  if (dom.menuTwoPages) {
    const enabled = state.viewMode === 'two-pages';
    dom.menuTwoPages.classList.toggle('is-on', enabled);
    dom.menuTwoPages.setAttribute('aria-pressed', String(enabled));
    if (dom.menuTwoPagesState) dom.menuTwoPagesState.textContent = enabled ? 'Bật' : 'Tắt';
  }
  if (dom.menuAutoFlip) {
    const enabled = state.pageTurnMode === 'next';
    dom.menuAutoFlip.classList.toggle('is-on', enabled);
    dom.menuAutoFlip.setAttribute('aria-pressed', String(enabled));
    if (dom.menuAutoFlipState) dom.menuAutoFlipState.textContent = enabled ? 'Bật' : 'Tắt';
  }
}



function installTvRemoteControls() {
  const isEditable = (target) => target instanceof Element &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"], .playlist-search-bar'));
  const isReadMenuOpen = () => dom.readOptionsMenu && !dom.readOptionsMenu.classList.contains('hidden');
  const focusableSelector = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
  const getFocusable = () => Array.from(document.querySelectorAll(focusableSelector)).filter(el =>
    el instanceof HTMLElement && el.getClientRects().length && !el.closest('.hidden, [aria-hidden="true"]') &&
    getComputedStyle(el).visibility !== 'hidden');
  const moveFocus = (direction) => {
    const current = document.activeElement;
    const candidates = getFocusable().filter(el => el !== current);
    if (!candidates.length) return false;
    if (!(current instanceof HTMLElement) || current === document.body || current === document.documentElement) {
      const first = candidates[0];
      first.focus({ preventScroll: true });
      first.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return true;
    }
    const a = current.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    const scored = candidates.map(el => {
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const dx = x - ax, dy = y - ay;
      const primary = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
      const cross = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      return { el, primary, score: primary > 1 ? primary + cross * 2.5 : Infinity };
    }).sort((x, y) => x.score - y.score);
    if (!scored.length || !Number.isFinite(scored[0].score)) return false;
    scored[0].el.focus({ preventScroll: true });
    scored[0].el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return true;
  };
  const seekAudio = (delta) => {
    const audio = dom.audioElement;
    const duration = Number.isFinite(audio.duration) ? audio.duration : Number.MAX_SAFE_INTEGER;
    audio.currentTime = Math.max(0, Math.min(duration, (audio.currentTime || 0) + delta));
  };

  // Bàn phím/remote TV: chỉ chiếm phím media toàn cục. D-pad ưu tiên điều hướng
  // focus; khi focus nằm trên vùng PDF mới dùng trái/phải để lật trang.
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isEditable(event.target)) return;
    const key = event.key;
    const code = event.keyCode;
    const playPause = ['MediaPlayPause', 'PlayPause'].includes(key) || code === 85 || code === 179;
    const play = key === 'MediaPlay' || code === 126 || code === 250;
    const pause = key === 'MediaPause' || code === 127 || code === 251;
    const rewind = ['MediaRewind', 'Rewind'].includes(key) || code === 89;
    const fastForward = ['MediaFastForward', 'FastForward'].includes(key) || code === 90;

    if (playPause) { event.preventDefault(); togglePlayPause(); return; }
    if (play) { event.preventDefault(); if (dom.audioElement.paused) togglePlayPause(); return; }
    if (pause) { event.preventDefault(); dom.audioElement.pause(); return; }
    if (rewind) { event.preventDefault(); seekAudio(-5); return; }
    if (fastForward) { event.preventDefault(); seekAudio(5); return; }

    if (key === 'Escape' || key === 'BrowserBack' || code === 4 || key === 'Backspace') {
      const playlist = document.getElementById('playlistModal');
      if (isReadMenuOpen()) {
        event.preventDefault();
        dom.readOptionsMenu.classList.add('hidden');
        dom.btnOpenReadMenu?.setAttribute('aria-expanded', 'false');
        dom.btnOpenReadMenu?.focus({ preventScroll: true });
      } else if (playlist && !playlist.classList.contains('hidden')) {
        event.preventDefault();
        document.getElementById('btnClosePlaylist')?.click();
        dom.btnOpenPlaylist?.focus({ preventScroll: true });
      }
      return;
    }
    if (isReadMenuOpen()) return;

    const directionByKey = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down'
    };
    const direction = directionByKey[key] ||
      ({ 37: 'left', 39: 'right', 38: 'up', 40: 'down' })[code];
    if (direction) {
      const active = document.activeElement;
      const onPdf = active === dom.canvasWrapper || active === dom.pdfCanvasLeft ||
        active === dom.pdfCanvasRight || active === document.body || active === document.documentElement;
      // Từ body, ưu tiên chuyển focus đến nút đầu tiên; khi đang ở điều khiển,
      // dùng điều hướng không gian; chỉ lật trang khi focus thực sự ở vùng PDF.
      if (onPdf && active !== document.body && active !== document.documentElement && (direction === 'left' || direction === 'right')) {
        event.preventDefault();
        if (!event.repeat) changePage(direction === 'left' ? -1 : 1);
        return;
      }
      if (moveFocus(direction)) event.preventDefault();
      return;
    }
    if (key === ' ' || key === 'Spacebar' || code === 32) {
      if (event.target === document.body || event.target === document.documentElement ||
          event.target === dom.canvasWrapper || event.target === dom.pdfCanvasLeft || event.target === dom.pdfCanvasRight) {
        event.preventDefault(); togglePlayPause();
      }
      return;
    }
    if ((key === 'Enter' || code === 13) &&
        (event.target === document.body || event.target === document.documentElement)) {
      const first = getFocusable()[0];
      if (first) { event.preventDefault(); first.focus({ preventScroll: true }); }
    }
  });

  // Cho phép D-pad chọn vùng PDF sau khi các nút giao diện đã được duyệt.
  if (dom.canvasWrapper && !dom.canvasWrapper.hasAttribute('tabindex')) dom.canvasWrapper.setAttribute('tabindex', '0');
}

// Xóa bộ nhớ đệm giao diện trước khi cập nhật, không xóa dữ liệu sách/mốc đọc.
async function clearReadAlongWebCachesForUpdate() {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
  }
}

// Kiểm tra bản phát hành mới nhất theo kênh OTA được người dùng chọn.
const READ_ALONG_RELEASES_API = 'https://api.github.com/repos/blamag999/read-along-android/releases?per_page=100';
const READ_ALONG_UPDATE_CHANNEL_KEY = 'readAlongUpdateChannel';

function getSelectedUpdateChannel() {
  const select = dom.updateChannelSelect;
  let saved = 'official';
  try {
    saved = localStorage.getItem(READ_ALONG_UPDATE_CHANNEL_KEY) || 'official';
  } catch (_) {}
  const channel = select?.value || saved;
  return channel === 'beta' ? 'beta' : 'official';
}

function compareReleaseVersions(a, b) {
  const parse = (value) => {
    const match = String(value || '').trim().replace(/^v/i, '')
      .match(/^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/i);
    if (!match) return null;
    return {
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
      beta: match[4] === undefined ? null : Number(match[4])
    };
  };
  const av = parse(a), bv = parse(b);
  if (!av || !bv) return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true });
  for (const key of ['major', 'minor', 'patch']) {
    if (av[key] > bv[key]) return 1;
    if (av[key] < bv[key]) return -1;
  }
  // Theo SemVer, bản stable lớn hơn mọi bản beta cùng số major.minor.patch.
  if (av.beta === null && bv.beta !== null) return 1;
  if (av.beta !== null && bv.beta === null) return -1;
  if (av.beta === null && bv.beta === null) return 0;
  return av.beta > bv.beta ? 1 : av.beta < bv.beta ? -1 : 0;
}

async function checkReadAlongUpdates() {
  const btn = dom.menuCheckUpdates;
  const channel = getSelectedUpdateChannel();
  const channelLabel = channel === 'beta' ? 'Beta' : 'Official';
  const originalLabel = btn?.querySelector('span:last-child')?.textContent || 'Kiểm tra cập nhật';
  if (btn) {
    btn.disabled = true;
    const label = btn.querySelector('span:last-child');
    if (label) label.textContent = 'Đang kiểm tra ' + channelLabel + '…';
  }
  try {
    const response = await fetch(READ_ALONG_RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('GitHub trả về HTTP ' + response.status);
    const releases = await response.json();
    if (!Array.isArray(releases)) throw new Error('Dữ liệu Release từ GitHub không hợp lệ.');

    const release = releases.find(item =>
      !item.draft &&
      (channel === 'beta' ? item.prerelease === true : item.prerelease === false) &&
      (item.assets || []).some(asset => /-android\.apk$/i.test(asset.name))
    );
    if (!release) {
      const message = channel === 'beta'
        ? 'Chưa có bản Beta kèm APK để cập nhật.'
        : 'Chưa có bản Official ổn định kèm APK để cập nhật.';
      showToast(message);
      alert(message + '\nHãy kiểm tra GitHub Releases hoặc chạy thành công workflow Build and Release.');
      return;
    }

    const asset = (release.assets || []).find(item => /-android\.apk$/i.test(item.name));
    const currentVersion = document.querySelector('meta[name="app-version"]')?.content || '0.0.0';
    const comparison = compareReleaseVersions(release.tag_name, currentVersion);
    if (comparison <= 0) {
      const message = 'Kênh ' + channelLabel + ' mới nhất là ' + release.tag_name +
        ', nhưng phiên bản hiện tại (' + currentVersion + ') không cũ hơn bản đó.';
      showToast('Không có bản ' + channelLabel + ' mới hơn để cài.');
      alert(message + '\nAndroid không cho cài đè bản có versionCode thấp hơn; nếu cần chuyển kênh xuống phiên bản cũ hơn, phải gỡ ứng dụng và cài lại (có thể mất dữ liệu cục bộ).');
      return;
    }

    const notes = String(release.body || '').replace(/[#*_\x60]/g, '').trim().slice(0, 600);
    const message = 'Kênh OTA: ' + channelLabel +
      '\nBản mới nhất: ' + release.tag_name +
      '\nPhiên bản hiện tại: ' + currentVersion +
      (notes ? '\n\nThay đổi:\n' + notes : '') +
      '\n\nTải APK mới? Android sẽ yêu cầu xác nhận cài đặt. Bản mới cần cùng khóa ký với bản đang cài để cập nhật đè.';
    if (!confirm(message)) return;
    const nativeUpdater = window.Capacitor?.Plugins?.ApkUpdater;
    if (nativeUpdater?.downloadAndInstall) {
      showToast('Đang xóa bộ nhớ đệm cũ…');
      await clearReadAlongWebCachesForUpdate();
      showToast('Đang tải APK cập nhật…');
      await nativeUpdater.downloadAndInstall({
        url: asset.browser_download_url,
        filename: asset.name
      });
    } else {
      window.location.href = asset.browser_download_url;
    }
  } catch (error) {
    console.error('Update check failed:', error);
    alert('Không thể kiểm tra cập nhật kênh ' + channelLabel + ': ' +
      (error.message || 'Lỗi mạng') + '\nHãy thử lại khi có kết nối Internet.');
  } finally {
    if (btn) {
      btn.disabled = false;
      const label = btn.querySelector('span:last-child');
      if (label) label.textContent = originalLabel;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const isNativeAndroid = Boolean(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.getPlatform?.() === 'android');
  if (dom.updateChannelSelect) {
    let savedChannel = 'official';
    try {
      savedChannel = localStorage.getItem(READ_ALONG_UPDATE_CHANNEL_KEY) || 'official';
    } catch (_) {}
    dom.updateChannelSelect.value = savedChannel === 'beta' ? 'beta' : 'official';
    dom.updateChannelSelect.addEventListener('change', () => {
      const channel = dom.updateChannelSelect.value === 'beta' ? 'beta' : 'official';
      try { localStorage.setItem(READ_ALONG_UPDATE_CHANNEL_KEY, channel); } catch (_) {}
      showToast('Đã chọn kênh OTA ' + (channel === 'beta' ? 'Beta' : 'Official') + '.');
    });
  }
  if (dom.menuCheckUpdates && isNativeAndroid) {
    dom.menuCheckUpdates.classList.remove('hidden');
    dom.menuCheckUpdates.addEventListener('click', checkReadAlongUpdates);
  }
});
