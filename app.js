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
  activeFilter: 'paired', // Mặc định chỉ hiện mục đủ PDF và audio
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
  timestampSpread: false,
  ignoreCanvasTapUntil: 0,
  pendingManualBackwardMarker: null,
  zoomScale: 1.0,

  // MULTI-AUDIO STATE
  currentAudioIndex: 0,   // Phần âm thanh đang phát trong currentStoryAudios
  currentStoryAudios: [], // Danh sách các phần âm thanh của truyện đang mở
  pdfSelectionInProgress: false,
  sessionRestorePending: false,
  lastSessionSaveAt: 0,
  lastAudioObservedTime: null,
  allowBackwardAudioSync: false,
  pendingBackwardSeek: null
};

// =======================================================
// INDEXEDDB THƯ VIỆN SÁCH (CÁCH LY DỮ LIỆU TỪNG CUỐN)
// =======================================================
const READING_SESSION_KEY = 'read_along_reading_session_v1';
const FAVORITES_KEY = 'read_along_favorites_v1';

function readJsonStorage(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value == null ? fallback : value; }
  catch (_) { return fallback; }
}
function getFavoriteBooks() {
  const value = readJsonStorage(FAVORITES_KEY, []);
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}
function toggleFavoriteBook(bookId) {
  if (!bookId) return;
  const favorites = getFavoriteBooks();
  const next = favorites.includes(bookId) ? favorites.filter(id => id !== bookId) : [...favorites, bookId];
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch (_) {}
  renderPlaylistView();
}
function getReadingSessionStorageKey(bookKey) {
  return READING_SESSION_KEY + ':' + encodeURIComponent(bookKey);
}
function getReadingSessionRecordForBook(bookKey) {
  if (!bookKey) return { bookKey, current: null, history: [] };
  const stored = readJsonStorage(getReadingSessionStorageKey(bookKey), null);
  if (stored && stored.bookKey === bookKey && stored.current) {
    return {
      bookKey,
      current: stored.current,
      history: Array.isArray(stored.history) ? stored.history.filter(item => item && item.bookKey === bookKey).slice(0, 2) : []
    };
  }
  // Migrate both the previous single-session format and an earlier direct session value.
  const legacy = stored && stored.bookKey === bookKey ? stored : readJsonStorage(READING_SESSION_KEY, null);
  if (legacy && legacy.bookKey === bookKey && !legacy.current) {
    const migrated = { bookKey, current: legacy, history: [] };
    try { localStorage.setItem(getReadingSessionStorageKey(bookKey), JSON.stringify(migrated)); } catch (_) {}
    return migrated;
  }
  return { bookKey, current: null, history: [] };
}
function getReadingSessionForBook(bookKey) {
  return getReadingSessionRecordForBook(bookKey).current;
}
function getReadingCheckpointLabel(session, index) {
  const time = formatTime(session.audioTime || 0);
  const stamp = Number.isFinite(session.updatedAt)
    ? new Date(session.updatedAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';
  return (index === 0 ? 'Mới nhất' : 'Trước đó') + ' · Trang ' + session.page + ' · ' + time + (stamp ? ' · ' + stamp : '');
}

async function closeCurrentBook() {
  if (!state.pdfDoc && !state.currentBookKey) return;
  saveReadingSession(true);
  dom.audioElement.pause();
  state.waitingForManualPageTurn = false;
  state.pendingManualPage = null;
  state.resumeAfterManualTurn = false;
  state.sessionRestorePending = false;
  state.timestampSpread = false;
  state.pdfLoading = true;
  try {
    while (state.pageRendering) await new Promise(resolve => setTimeout(resolve, 16));
    const previousDoc = state.pdfDoc;
    state.pdfDoc = null;
    if (previousDoc && typeof previousDoc.destroy === 'function') {
      try { await previousDoc.destroy(); } catch (error) { console.warn('Không giải phóng được PDF:', error); }
    }
    [dom.pdfCanvasLeft, dom.pdfCanvasRight].forEach(canvas => {
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    });
  } finally {
    state.pdfLoading = false;
  }
  const objectUrl = dom.audioElement.dataset.objectUrl;
  if (objectUrl) { URL.revokeObjectURL(objectUrl); delete dom.audioElement.dataset.objectUrl; }
  dom.audioElement.removeAttribute('src');
  dom.audioElement.load();
  state.currentBookKey = '';
  state.pdfFileName = '';
  state.audioFileName = '';
  state.currentStoryAudios = [];
  state.currentAudioIndex = 0;
  state.pageTimestamps = {};
  state.pageNum = 1;
  state.totalPages = 0;
  state.lastSessionSaveAt = 0;
  state.lastAudioObservedTime = null;
  state.audioLoadRequestId = (state.audioLoadRequestId || 0) + 1;
  state.pageNumPending = null;
  state.pageNumPendingSyncAudio = false;
  state.pendingBackwardSeek = null;
  state.pendingManualBackwardMarker = null;
  state.allowBackwardAudioSync = false;
  state.isAudioDrivenChange = false;
  dom.canvasWrapper.classList.add('hidden');
  dom.canvasWrapper.classList.remove('two-page-mode');
  dom.emptyState.classList.remove('hidden');
  dom.readerPageStatus.classList.add('hidden');
  dom.btnChooseAudio.classList.add('hidden');
  dom.pdfFileName.textContent = '📄 Chưa có PDF';
  dom.pdfFileName.classList.add('empty');
  dom.audioFileName.textContent = '🎵 Chưa có audio';
  dom.audioFileName.classList.add('empty');
  dom.lblCurrentPage.textContent = '0';
  dom.lblTotalPages.textContent = '0';
  updateAudioPartUI();
  updateReadingCheckpointsUI();
  updatePageTimestampBadge();
  updateSyncCountBadge();
  showToast('Đã đóng sách và lưu vị trí đọc.');
  if (state.playlist.length) openPlaylistModal();
}

function requestCloseBook() {
  if (!state.pdfDoc) return;
  const title = state.pdfFileName || 'sách hiện tại';
  if (!window.confirm('Bạn có muốn đóng ' + title + ' không?\nVị trí đọc và thời gian audio sẽ được lưu để lần sau tiếp tục.')) return;
  closeCurrentBook();
}

function stopAudioForBackground() {
  if (!state.pdfDoc && dom.audioElement.paused) return;
  saveReadingSession(true);
  if (!dom.audioElement.paused) dom.audioElement.pause();
  state.waitingForManualPageTurn = false;
  state.pendingManualPage = null;
  state.resumeAfterManualTurn = false;
  state.sessionRestorePending = false;
  window.__raDiagRecord?.('audio.background.stop', {
    page: state.pageNum,
    time: Number.isFinite(dom.audioElement.currentTime) ? dom.audioElement.currentTime : 0,
    reason: 'app-left-foreground'
  });
}

function handleAppBack() {
  const openOverlays = Array.from(document.querySelectorAll('.modal-overlay:not(.hidden)'));
  if (openOverlays.length) {
    openOverlays[openOverlays.length - 1].classList.add('hidden');
    return;
  }
  if (dom.readOptionsMenu && !dom.readOptionsMenu.classList.contains('hidden')) {
    dom.readOptionsMenu.classList.add('hidden');
    dom.btnOpenReadMenu?.setAttribute('aria-expanded', 'false');
    return;
  }
  if (state.pdfDoc) {
    requestCloseBook();
    return;
  }
  if (!window.confirm('Bạn có muốn thoát ứng dụng Read Along không?')) return;
  const appLifecycle = window.Capacitor?.Plugins?.AppLifecycle;
  if (appLifecycle?.exitApp) {
    appLifecycle.exitApp().catch(error => {
      console.error('Không thể thoát ứng dụng:', error);
      showToast('Không thể đóng ứng dụng. Hãy thử nút Back của Android lần nữa.');
    });
  } else {
    window.close();
  }
}

function updateReadingCheckpointsUI() {
  if (!dom.readingCheckpointSelect || !dom.btnRestoreReadingCheckpoint) return;
  const record = getReadingSessionRecordForBook(state.currentBookKey);
  const checkpoints = [record.current, ...record.history].filter(Boolean).slice(0, 3);
  dom.readingCheckpointSelect.innerHTML = '';
  checkpoints.forEach((checkpoint, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = getReadingCheckpointLabel(checkpoint, index);
    dom.readingCheckpointSelect.appendChild(option);
  });
  const available = checkpoints.length > 0 && Boolean(state.pdfDoc);
  dom.readingCheckpointSelect.disabled = !available;
  dom.btnRestoreReadingCheckpoint.disabled = !available;
  dom.readingCheckpointSelect.classList.toggle('hidden', !available);
  dom.btnRestoreReadingCheckpoint.classList.toggle('hidden', !available);
  dom.readingCheckpointMenuGroup?.classList.toggle('hidden', !available);
}
function saveReadingSession(force = false) {
  if (!state.currentBookKey || !state.pdfDoc) return;
  const now = Date.now();
  if (!force && now - state.lastSessionSaveAt < 5000) return;
  state.lastSessionSaveAt = now;
  const session = {
    bookKey: state.currentBookKey, page: state.pageNum, audioIndex: state.currentAudioIndex,
    audioTime: Number.isFinite(dom.audioElement.currentTime) ? Math.max(0, dom.audioElement.currentTime) : 0,
    viewMode: state.viewMode, zoomScale: state.zoomScale, pageTurnMode: state.pageTurnMode,
    autoSeekAudio: state.autoSeekAudio, updatedAt: now
  };
  const record = getReadingSessionRecordForBook(state.currentBookKey);
  const previous = record.current;
  const movedBackward = previous && session.audioIndex === previous.audioIndex &&
    session.page === previous.page && session.audioTime < (previous.audioTime || 0) - 3;
  const jumpedPosition = previous && (session.page !== previous.page ||
    session.audioIndex !== previous.audioIndex ||
    (session.page === previous.page && session.audioIndex === previous.audioIndex &&
      Math.abs(session.audioTime - (previous.audioTime || 0)) >= 30) || movedBackward);
  const history = [...record.history];
  if (jumpedPosition && previous &&
      !(history[0] && history[0].page === previous.page && history[0].audioIndex === previous.audioIndex &&
        Math.abs((history[0].audioTime || 0) - (previous.audioTime || 0)) < 3)) {
    history.unshift(previous);
  }
  const nextRecord = { bookKey: state.currentBookKey, current: session, history: history.slice(0, 2) };
  try {
    localStorage.setItem(getReadingSessionStorageKey(state.currentBookKey), JSON.stringify(nextRecord));
  } catch (_) {}
  updateReadingCheckpointsUI();
}
function restoreSelectedReadingCheckpoint() {
  if (!state.currentBookKey || !state.pdfDoc || !dom.readingCheckpointSelect) return;
  const index = Number.parseInt(dom.readingCheckpointSelect.value, 10);
  if (!Number.isInteger(index) || index < 0 || index > 2) return;
  const record = getReadingSessionRecordForBook(state.currentBookKey);
  const checkpoints = [record.current, ...record.history].filter(Boolean).slice(0, 3);
  const selected = checkpoints[index];
  if (!selected) return;

  // Keep the position being replaced as a recovery point before restoring an older one.
  const history = [record.current, ...record.history].filter(item => item && item !== selected);
  const restored = { ...selected, updatedAt: Date.now() };
  try {
    localStorage.setItem(getReadingSessionStorageKey(state.currentBookKey), JSON.stringify({
      bookKey: state.currentBookKey, current: restored, history: history.slice(0, 2)
    }));
  } catch (_) {}

  state.timestampSpread = false;
  state.pageNum = Number.isInteger(restored.page) ? Math.max(1, Math.min(state.totalPages, restored.page)) : 1;
  state.currentAudioIndex = Number.isInteger(restored.audioIndex) ? restored.audioIndex : 0;
  state.viewMode = ['fit-height', 'fit-width', 'two-pages'].includes(restored.viewMode) ? restored.viewMode : state.viewMode;
  state.zoomScale = Number.isFinite(restored.zoomScale) ? Math.max(0.5, Math.min(3, restored.zoomScale)) : state.zoomScale;
  state.pageTurnMode = ['next', 'markers', 'off'].includes(restored.pageTurnMode) ? restored.pageTurnMode : state.pageTurnMode;
  state.autoSeekAudio = typeof restored.autoSeekAudio === 'boolean' ? restored.autoSeekAudio : state.autoSeekAudio;
  state.sessionRestorePending = true;
  state.lastSessionSaveAt = 0;
  dom.canvasWrapper.classList.toggle('two-page-mode', state.viewMode === 'two-pages');
  dom.btnFitHeight?.classList.toggle('active', state.viewMode === 'fit-height');
  dom.btnTwoPages?.classList.toggle('active', state.viewMode === 'two-pages');
  if (dom.selPageTurnMode) dom.selPageTurnMode.value = state.pageTurnMode;
  if (dom.chkAutoSeekAudio) dom.chkAutoSeekAudio.checked = state.autoSeekAudio;
  updateZoomLabel();
  updateReadMenuState();
  renderCurrentSpread();
  if (state.currentStoryAudios[state.currentAudioIndex]) {
    loadAudioPart(state.currentAudioIndex, { restoreSession: true });
  } else {
    state.sessionRestorePending = false;
    dom.audioElement.pause();
  }
  updateReadingCheckpointsUI();
  showToast('Đã khôi phục mốc đọc đã chọn. Audio không tự phát.');
}
function restoreReadingSessionForCurrentBook() {
  const session = getReadingSessionForBook(state.currentBookKey);
  if (!session) return null;
  const resumeLabel = 'Trang ' + (session.page || 1) + ' · ' + formatTime(session.audioTime || 0);
  const shouldResume = window.confirm('Sách này có vị trí đọc đã lưu (' + resumeLabel + ').\nBạn có muốn tiếp tục từ vị trí gần nhất không?\nChọn “Không” để bắt đầu từ đầu; bạn vẫn có thể chọn một trong ba mốc đọc đã lưu sau khi mở sách.');
  if (!shouldResume) {
    state.sessionRestorePending = false;
    state.timestampSpread = false;
    updateReadingCheckpointsUI();
    showToast('Đã mở sách từ đầu. Bạn vẫn có thể khôi phục một mốc đọc đã lưu.');
    return null;
  }
  state.timestampSpread = false;
  if (Number.isInteger(session.page) && session.page >= 1 && session.page <= state.totalPages) state.pageNum = session.page;
  if (['fit-height', 'fit-width', 'two-pages'].includes(session.viewMode)) {
    state.viewMode = session.viewMode;
    dom.canvasWrapper.classList.toggle('two-page-mode', state.viewMode === 'two-pages');
    dom.btnFitHeight?.classList.toggle('active', state.viewMode === 'fit-height');
    dom.btnTwoPages?.classList.toggle('active', state.viewMode === 'two-pages');
    dom.btnTwoPages?.setAttribute('aria-pressed', String(state.viewMode === 'two-pages'));
  }
  if (Number.isFinite(session.zoomScale)) state.zoomScale = Math.max(0.5, Math.min(3, session.zoomScale));
  if (['next', 'markers', 'off'].includes(session.pageTurnMode)) state.pageTurnMode = session.pageTurnMode;
  if (typeof session.autoSeekAudio === 'boolean') state.autoSeekAudio = session.autoSeekAudio;
  if (dom.selPageTurnMode) dom.selPageTurnMode.value = state.pageTurnMode;
  if (dom.chkAutoSeekAudio) dom.chkAutoSeekAudio.checked = state.autoSeekAudio;
  updateZoomLabel();
  updateReadMenuState();
  state.sessionRestorePending = true;
  updateReadingCheckpointsUI();
  return session;
}
function applyPendingAudioSessionRestore() {
  if (!state.sessionRestorePending) return;
  const session = getReadingSessionForBook(state.currentBookKey);
  if (!session) { state.sessionRestorePending = false; return; }
  if (Number.isInteger(session.audioIndex) && state.currentStoryAudios[session.audioIndex] && session.audioIndex !== state.currentAudioIndex) {
    const nextIndex = session.audioIndex;
    state.sessionRestorePending = false;
    loadAudioPart(nextIndex, { restoreSession: true });
    return;
  }
  state.sessionRestorePending = false;
  if (Number.isFinite(session.audioTime) && session.audioTime > 0) {
    try { dom.audioElement.currentTime = Math.min(session.audioTime, Number.isFinite(dom.audioElement.duration) ? dom.audioElement.duration : session.audioTime); } catch (_) {}
  }
  dom.audioElement.pause();
  saveReadingSession(true);
  showToast('Đã khôi phục vị trí đọc gần nhất. Nhấn Phát để tiếp tục nghe.');
}

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

function getBookUniqueKey(pdfName, audioName) {
  return window.ReadAlongCatalogPlaylist.getBookUniqueKey(pdfName, audioName);
}

function normalizeStoryTitle(filename) {
  return window.ReadAlongCatalogPlaylist.normalizeStoryTitle(filename);
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
  btnOpenReadMenu: document.getElementById('btnOpenReadMenu'),
  readOptionsMenu: document.getElementById('readOptionsMenu'),
  menuTwoPages: document.getElementById('menuTwoPages'),
  menuAutoFlip: document.getElementById('menuAutoFlip'),
  menuCheckUpdates: document.getElementById('menuCheckUpdates'),
  chkBetaOta: document.getElementById('chkBetaOta'),
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

  btnNode1FolderOnline: document.getElementById('btnNode1FolderOnline'),
  menuToggleSettings: document.getElementById('menuToggleSettings'),
  menuOpenSyncModal: document.getElementById('menuOpenSyncModal'),
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
  touchCenterIcon: document.getElementById('touchCenterIcon'),
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

  btnCloseSyncModal: document.getElementById('btnCloseSyncModal'),
  syncModal: document.getElementById('syncModal'),
  syncTableBody: document.getElementById('syncTableBody'),
  btnExportSync: document.getElementById('btnExportSync'),
  importSyncInput: document.getElementById('importSyncInput'),
  btnClearSync: document.getElementById('btnClearSync'),
  toastMessage: document.getElementById('toastMessage'),
  readingCheckpointSelect: document.getElementById('readingCheckpointSelect'),
  btnRestoreReadingCheckpoint: document.getElementById('btnRestoreReadingCheckpoint'),
  readingCheckpointMenuGroup: document.getElementById('readingCheckpointMenuGroup'),
  touchControlHints: document.querySelector('.touch-control-hints')
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
  dom.toastMessage.textContent = String(msg ?? '');
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

// =======================================================
// RESET VÀ NẠP MỐC CHUẨN XÁC THEO TỪNG CUỐN (FIX TRIỆT ĐỂ LỖI DỮ LIỆU LẠ)
// =======================================================
async function resetAndLoadSyncForBook(bookKey, attachedJsonBlob, remoteSyncUrl = '') {
  // Marker source order: attached book JSON, its public R2 companion JSON, local folder JSON, then localStorage.
  // R2 marker JSON is a read-only companion asset for the book/audio; marker edits remain local until exported as JSON.
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

  // 2a. Nạp file JSON marker đi kèm sách trên R2.
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
          updateSaveStatusBadge('☁️ Đã nạp mốc đọc');
          return;
        }
      }
      console.warn('Không nạp được tệp mốc trực tuyến:', response.status);
    } catch (error) {
      console.warn('Không thể nạp tệp mốc trực tuyến (kiểm tra địa chỉ và quyền truy cập):', error);
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

const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  'mp3', 'm4a', 'm4b', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac'
]);

function isSupportedAudioFileName(name) {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return Boolean(match && SUPPORTED_AUDIO_EXTENSIONS.has(match[1]));
}

function fileNameFromUrl(url, fallback) {
  try { return decodeURIComponent(new URL(url).pathname.split('/').pop()) || fallback; }
  catch (error) { return fallback || String(url || ''); }
}

function isSafeHttpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch (_) {
    return false;
  }
}

const READ_ALONG_R2_HOST = 'pub-763a3a5ae235415cbef15b64f7a20820.r2.dev';
function isReadAlongR2Url(value) {
  if (!isSafeHttpsUrl(value)) return false;
  try {
    const url = new URL(value);
    return url.hostname === READ_ALONG_R2_HOST && !url.port;
  } catch (_) {
    return false;
  }
}

async function loadR2Catalog() {
  const button = dom.btnLoadR2Catalog;
  if (button) { button.disabled = true; button.textContent = '⏳ Đang tải sách...'; }
  dom.playlistLoading.classList.remove('hidden');
  dom.playlistItemsList.replaceChildren();
  try {
    // Đọc manifest công khai trực tiếp từ R2; không phụ thuộc Pages Functions/API trung gian.
    const catalogUrl = 'https://pub-763a3a5ae235415cbef15b64f7a20820.r2.dev/books.json';
    const response = await fetch(catalogUrl, { cache: 'no-store', mode: 'cors' });
    if (!response.ok) throw new Error('Không tải được books.json (' + response.status + ').');

    const data = await response.json();
    const stories = window.ReadAlongCatalogPlaylist.mapRemoteCatalog(data, {
      isAllowedUrl: isReadAlongR2Url,
      fileNameFromUrl
    });

    state.playlist = stories;
    state.activeFilter = 'paired';
    state.playlistPage = 1;
    updatePlaylistBadgeCount();
    renderPlaylistView();
    if (dom.lblPlaylistSubtitle) dom.lblPlaylistSubtitle.textContent = stories.length + ' mục trực tuyến';
    openPlaylistModal();
    showToast('Đã tải ' + stories.length + ' sách trực tiếp từ books.json.');
  } catch (error) {
    console.error('Không thể tải books.json từ R2:', error);
    alert('Không thể tải danh sách truyện từ books.json. ' + error.message);
  } finally {
    dom.playlistLoading.classList.add('hidden');
    if (button) { button.disabled = false; button.textContent = '☁️ Truyện trực tuyến'; }
  }
}

function buildPlaylistFromItems(rawItems) {
  const playlistArray = window.ReadAlongCatalogPlaylist.buildPlaylistFromFiles(rawItems);
  state.playlist = playlistArray;
  state.playlistPage = 1;
  updatePlaylistBadgeCount();
  renderPlaylistView();

  if (playlistArray.length > 0) {
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
  const favorites = getFavoriteBooks();
  const filtered = window.ReadAlongCatalogPlaylist.filterPlaylist(state.playlist, {
    query: state.searchQuery,
    filter: state.activeFilter,
    favorites
  });

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

  // Derive page size from the actual visible list height; card measurements below
  // shrink it further when titles/audio-part controls make rows taller than expected.
  const availableHeight = dom.playlistItemsList.clientHeight || Math.max(180, window.innerHeight * 0.48);
  const hasMultiPartStories = filtered.some(story => Array.isArray(story.audios) && story.audios.length > 1);
  let pageSize = window.ReadAlongPlaylistLayout.calculatePageSize(
    availableHeight, hasMultiPartStories ? 78 : 48, filtered.length
  );
  let totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  state.playlistPage = window.ReadAlongPlaylistLayout.clampPage(state.playlistPage, totalPages);

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

      // Dữ liệu catalog từ xa không đáng tin cậy: dùng textContent thay vì ghép HTML.
      if (isSafeHttpsUrl(story.coverUrl)) {
        const cover = document.createElement('img');
        cover.className = 'card-cover';
        cover.alt = 'Bìa';
        cover.loading = 'lazy';
        cover.src = story.coverUrl;
        cover.addEventListener('error', () => { cover.style.display = 'none'; }, { once: true });
        card.appendChild(cover);
      }

      const number = document.createElement('span');
      number.className = 'apk-story-number';
      number.textContent = String(index + 1);
      card.appendChild(number);

      const titleCol = document.createElement('div');
      titleCol.className = 'card-title-col';
      const title = document.createElement('h4');
      title.textContent = (isPlaying ? '▶ ' : '') + String(story.title || 'Không có tiêu đề');
      titleCol.appendChild(title);

      const tags = document.createElement('div');
      tags.className = 'card-tags';
      if (story.pdf) {
        const pdfTag = document.createElement('span');
        pdfTag.className = 'mini-badge badge-pdf';
        pdfTag.textContent = '📄 ' + String(story.pdf.name || 'PDF');
        tags.appendChild(pdfTag);
      }
      (Array.isArray(story.audios) ? story.audios : []).forEach((aud) => {
        const audioTag = document.createElement('span');
        audioTag.className = 'mini-badge badge-mp3';
        audioTag.textContent = '🎵 ' + String(aud.name || 'Audio');
        tags.appendChild(audioTag);
      });
      titleCol.appendChild(tags);

      if (story.audios && story.audios.length > 1) {
        const partButtons = document.createElement('div');
        partButtons.className = 'card-audio-parts';
        story.audios.forEach((audio, partIndex) => {
          const partButton = document.createElement('button');
          partButton.type = 'button';
          partButton.className = 'card-part-btn';
          partButton.dataset.partidx = String(partIndex);
          partButton.title = String(audio.name || '');
          partButton.textContent = String(audio.partLabel || ('Phần ' + (partIndex + 1)));
          partButtons.appendChild(partButton);
        });
        titleCol.appendChild(partButtons);
      }
      card.appendChild(titleCol);

      const favoriteButton = document.createElement('button');
      const isFavorite = favorites.includes(story.id);
      favoriteButton.className = 'card-favorite-btn';
      favoriteButton.type = 'button';
      favoriteButton.textContent = isFavorite ? '★' : '☆';
      favoriteButton.title = isFavorite ? 'Bỏ khỏi yêu thích' : 'Thêm vào yêu thích';
      favoriteButton.setAttribute('aria-label', favoriteButton.title);
      favoriteButton.setAttribute('aria-pressed', String(isFavorite));
      favoriteButton.addEventListener('click', (event) => { event.stopPropagation(); toggleFavoriteBook(story.id); });
      card.appendChild(favoriteButton);

      const playButton = document.createElement('button');
      playButton.className = 'card-play-btn';
      playButton.type = 'button';
      playButton.textContent = isPlaying ? 'Đang đọc' : '▶ Mở';
      card.appendChild(playButton);

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

  }

  renderCurrentPage();
  let fitAttempts = 0;
  while (dom.playlistItemsList.clientHeight > 0 &&
         dom.playlistItemsList.scrollHeight > dom.playlistItemsList.clientHeight + 2 &&
         pageSize > 1 && fitAttempts < 20) {
    pageSize -= 1;
    totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    state.playlistPage = window.ReadAlongPlaylistLayout.clampPage(state.playlistPage, totalPages);
    renderCurrentPage();
    fitAttempts += 1;
  }
  state.playlistPageSize = pageSize;
  updatePlaylistPagination(totalPages, filtered.length);
}

// MỞ TRUYỆN TỪ PLAYLIST (TỰ ĐỘNG NẠP MỐC ĐÚNG CUỐN ĐÓ)
async function loadStoryFromPlaylist(story, audioPartIndex) {
  if (!story) return;

  const uniqueKey = story.id || getBookUniqueKey(story.title);
  // Persist and pause the outgoing book before changing any book/audio state.
  saveReadingSession(true);
  if (state.currentBookKey && state.currentBookKey !== uniqueKey) dom.audioElement.pause();
  state.lastSessionSaveAt = 0;
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
function loadAudioPart(index, options = {}) {
  const audios = state.currentStoryAudios;
  if (!audios || audios.length === 0) return;
  const clampedIdx = Math.max(0, Math.min(index, audios.length - 1));
  const requestId = (state.audioLoadRequestId || 0) + 1;
  state.audioLoadRequestId = requestId;
  state.currentAudioIndex = clampedIdx;
  const audio = audios[clampedIdx];

  // Switching parts always loads the new source paused first. If the user was
  // listening, resume only after the new source has metadata; otherwise preserve pause.
  if (options.restoreSession === true || state.sessionRestorePending) {
    dom.audioElement.addEventListener('loadedmetadata', function restoreSelectedPart() {
      dom.audioElement.removeEventListener('loadedmetadata', restoreSelectedPart);
      if (state.audioLoadRequestId !== requestId || state.currentAudioIndex !== clampedIdx) return;
      // Let the source's own loadedmetadata handler finish resetting time first.
      setTimeout(() => {
        if (state.audioLoadRequestId === requestId && state.currentAudioIndex === clampedIdx) {
          applyPendingAudioSessionRestore();
        }
      }, 0);
    });
  }

  if (options.resumePlayback === true) {
    dom.audioElement.addEventListener('loadedmetadata', function resumeSelectedPart() {
      dom.audioElement.removeEventListener('loadedmetadata', resumeSelectedPart);
      if (state.audioLoadRequestId !== requestId || state.currentAudioIndex !== clampedIdx) return;
      dom.audioElement.play().catch((error) => {
        console.warn('Không thể tự phát phần audio mới:', error);
        showToast('Đã chuyển phần audio nhưng chưa thể tự phát. Hãy bấm Play để thử lại.');
        updatePlayButtonState();
      });
    });
  }

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
  container.replaceChildren();
  const label = document.createElement('span');
  label.className = 'audio-part-label';
  label.textContent = 'Phần audio:';
  container.appendChild(label);
  audios.forEach(function(a, i) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'audio-part-btn' + (i === state.currentAudioIndex ? ' active' : '');
    button.title = String(a.name || '');
    button.textContent = String(a.partLabel || ('Phần ' + (i + 1)));
    button.addEventListener('click', () => window.selectAudioPart(i));
    container.appendChild(button);
  });
}

// CHON AUDIO PART
window.selectAudioPart = function(index) {
  if (!Number.isInteger(index) || !state.currentStoryAudios || !state.currentStoryAudios[index]) return;
  if (index === state.currentAudioIndex) return;

  // Preserve the transport intent: playing -> continue playing after source load;
  // paused -> switch source but remain paused.
  const shouldResume = !dom.audioElement.paused && !dom.audioElement.ended;
  loadAudioPart(index, { resumePlayback: shouldResume });
  showToast('Đã chuyển sang phần ' + (index + 1) + (shouldResume ? ' — tiếp tục phát' : ' — đang tạm dừng'));
};

// Nguồn danh mục trực tuyến: ứng dụng đọc trực tiếp books.json và các URL asset công khai trên R2.
// =======================================================
// SỰ KIỆN GIAO DIỆN
// =======================================================
function initEvents() {
  initIndexedDB();

  dom.btnOpenPlaylist.addEventListener('click', () => {
    if (state.playlist.length === 0) return;
    openPlaylistModal();
  });


  dom.btnClosePlaylist.addEventListener('click', () => dom.playlistModal.classList.add('hidden'));
  dom.playlistModal.addEventListener('click', (e) => {
    if (e.target === dom.playlistModal) dom.playlistModal.classList.add('hidden');
  });

  dom.txtPlaylistSearch.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    state.playlistPage = 1;
    renderPlaylistView();
  });

  function focusPlaylistCard(card) {
    if (!card) return;
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function changePlaylistPage(delta) {
    const nextPage = Math.max(1, Math.min(state.playlistTotalPages, state.playlistPage + delta));
    if (nextPage === state.playlistPage) return;
    state.playlistPage = nextPage;
    renderPlaylistView();
    requestAnimationFrame(() => focusPlaylistCard(dom.playlistItemsList.querySelector('.playlist-card')));
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
      focusPlaylistCard(cards[index - 1]);
    } else if (e.key === 'ArrowUp' && index === 0 && state.playlistPage > 1) {
      e.preventDefault();
      changePlaylistPage(-1);
      requestAnimationFrame(() => {
        const previousCards = dom.playlistItemsList.querySelectorAll('.playlist-card');
        focusPlaylistCard(previousCards[previousCards.length - 1]);
      });
    } else if (e.key === 'ArrowDown') {
      if (index < cards.length - 1) {
        e.preventDefault();
        focusPlaylistCard(cards[index + 1]);
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
  dom.menuToggleSettings.addEventListener('click', () => {
    const willHide = !dom.filePickerSection.classList.contains('hidden');
    dom.filePickerSection.classList.toggle('hidden', willHide);
    dom.syncBanner.classList.toggle('hidden', willHide);
    dom.menuToggleSettings.setAttribute('aria-expanded', String(!willHide));
    dom.menuToggleSettings.querySelector('span:last-child').textContent = willHide
      ? 'Hiện chọn tệp và tùy chọn'
      : 'Ẩn chọn tệp và tùy chọn';
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
  dom.btnRestoreReadingCheckpoint?.addEventListener('click', restoreSelectedReadingCheckpoint);
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
  dom.audioElement.addEventListener('timeupdate', () => saveReadingSession(false));
  dom.audioElement.addEventListener('seeking', () => {
    const targetTime = Number.isFinite(dom.audioElement.currentTime) ? dom.audioElement.currentTime : 0;
    const previousTime = state.lastAudioObservedTime;
    // Chỉ ghi nhận ý định tua lùi; chưa cấp quyền đồng bộ lùi khi seek còn chạy.
    state.pendingBackwardSeek = Number.isFinite(previousTime) && targetTime < previousTime - 0.25
      ? { from: previousTime, target: targetTime }
      : null;
    state.allowBackwardAudioSync = false;
  });
  dom.audioElement.addEventListener('seeked', () => {
    const actualTime = Number.isFinite(dom.audioElement.currentTime) ? dom.audioElement.currentTime : 0;
    const pending = state.pendingBackwardSeek;
    // Xác nhận seek đã hoàn tất đúng đích trước khi cho phép đổi trang lùi.
    state.allowBackwardAudioSync = Boolean(pending && window.ReadAlongPageSync.isConfirmedBackwardSeek(
      pending.from, pending.target, actualTime));
    state.pendingBackwardSeek = null;
    state.lastAudioObservedTime = actualTime;
  });
  dom.audioElement.addEventListener('pause', () => saveReadingSession(true));
  window.addEventListener('pagehide', stopAudioForBackground);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAudioForBackground(); });
  window.addEventListener('readalong-user-leave', stopAudioForBackground);
  window.addEventListener('readalong-back-pressed', handleAppBack);
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
      : 'Không thể tải tệp âm thanh. Hãy kiểm tra định dạng/codec hoặc chọn file audio khác.';
    showToast(reason);
    updatePlayButtonState();
  });

  dom.audioSeeker.addEventListener('input', (e) => {
    dom.audioElement.currentTime = parseFloat(e.target.value);
  });

  dom.menuOpenSyncModal.addEventListener('click', () => {
    dom.readOptionsMenu.classList.add('hidden');
    dom.btnOpenReadMenu.setAttribute('aria-expanded', 'false');
    openSyncModal();
  });
  dom.btnCloseSyncModal.addEventListener('click', () => dom.syncModal.classList.add('hidden'));
  dom.syncModal.addEventListener('click', (e) => {
    if (e.target === dom.syncModal) dom.syncModal.classList.add('hidden');
  });

  dom.btnExportSync.addEventListener('click', exportSyncData);
  dom.importSyncInput.addEventListener('change', importSyncData);
  dom.btnClearSync.addEventListener('click', clearAllSync);

  initTouchGestures();

  // Xoay màn hình chỉ thay đổi kích thước vùng vẽ; không pause/load/seek audio.
  const rerenderAfterViewportChange = debounce(() => {
    if (state.pdfDoc) renderCurrentSpread(false);
  }, 300);
  window.addEventListener('resize', rerenderAfterViewportChange);
  window.addEventListener('orientationchange', rerenderAfterViewportChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', rerenderAfterViewportChange);
  }
}

// =======================================================
// XỬ LÝ CHỌN FILE LẺ NÚT 2 & 3
// =======================================================
async function handlePdfFileSelect(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const key = getBookUniqueKey(file.name);
  saveReadingSession(true);
  if (state.currentBookKey && state.currentBookKey !== key) dom.audioElement.pause();
  state.lastSessionSaveAt = 0;
  state.currentBookKey = key;
  dom.btnChooseAudio.classList.remove('hidden');
  state.pdfSelectionInProgress = true;
  state.currentStoryAudios = [];
  state.currentAudioIndex = 0;
  dom.audioElement.pause();
  dom.audioElement.removeAttribute('src');
  dom.audioElement.load();
  dom.audioFileName.textContent = '🎵 Chưa có audio';
  dom.audioFileName.classList.add('empty');
  updateAudioPartUI();

  // Không tự mở hộp thoại chọn audio; người dùng chủ động bấm nút "Chọn audio".
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
  showToast('Đã mở PDF. Chọn file audio tương ứng để bắt đầu nghe.');
}

async function handleAudioFileSelect(e) {
  const selectedFiles = Array.from(e.target.files || []);
  e.target.value = '';
  if (selectedFiles.length === 0) return;
  const files = selectedFiles.filter(file => isSupportedAudioFileName(file.name));
  const skippedCount = selectedFiles.length - files.length;
  if (files.length === 0) {
    showToast('Định dạng audio chưa được hỗ trợ. Dùng MP3, M4A/M4B, AAC, WAV, OGG/Opus hoặc FLAC.');
    return;
  }
  if (skippedCount > 0) showToast('Đã bỏ qua ' + skippedCount + ' file có định dạng chưa hỗ trợ.');

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
    showToast('Đã tải audio.');
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
  showToast('Đã tải audio. Nhấn Phát để nghe.');
  } catch (error) {
    console.error('Lỗi khi nạp audio:', error);
    showToast('Không thể nạp audio: ' + (error && error.message ? error.message : 'Lỗi không xác định'));
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
  const unsupportedWmaCount = files.filter(file => /\.wma$/i.test(file.name)).length;
  state.folderJsonFiles = [];
  files.forEach(f => {
    const l = f.name.toLowerCase();
    let type = 'unknown';
    if (l.endsWith('.pdf')) type = 'pdf';
    else if (isSupportedAudioFileName(l)) type = 'audio';
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
    if (unsupportedWmaCount > 0) showToast('Đã bỏ qua ' + unsupportedWmaCount + ' file WMA. Android WebView không phát WMA trực tiếp; hãy chuyển sang MP3 hoặc M4A.');
    if (state.playlist.length > 0) {
      loadStoryFromPlaylist(state.playlist[0]);
    }
  } else {
    alert('Không tìm thấy file PDF hoặc audio được hỗ trợ nào trong thư mục!');
  }
}

async function loadPdfFromUrl(url, fileName, shouldResetSync = true) {
  state.pdfFileName = fileName || url.split('/').pop() || 'book.pdf';
  dom.pdfFileName.textContent = '📄 ' + state.pdfFileName;
  dom.pdfFileName.classList.remove('empty');
  dom.lblLoadingText.textContent = 'Đang tải truyện trực tuyến...';
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
    restoreReadingSessionForCurrentBook();
    dom.lblTotalPages.textContent = state.totalPages;
    dom.emptyState.classList.add('hidden');
    dom.canvasWrapper.classList.remove('hidden');
  } catch (error) {
    state.pdfDoc = null;
    throw new Error('Không tải được PDF trực tuyến. Hãy kiểm tra địa chỉ tệp và quyền truy cập. ' + error.message);
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

  const key = state.currentBookKey || getBookUniqueKey(file.name);
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
    restoreReadingSessionForCurrentBook();

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
    showToast('Tệp âm thanh không hợp lệ. Hãy chọn lại file audio được hỗ trợ.');
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
  // trên một số trình duyệt và làm dừng luồng xử lý chọn audio.
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

function isTwoPageLayout() {
  return state.viewMode === 'two-pages' || state.timestampSpread === true;
}

async function renderCurrentSpread(syncAudioToPage = false) {
  if (!state.pdfDoc || state.pdfLoading) return;
  if (state.pageRendering) {
    state.pageNumPending = state.pageNum;
    state.pageNumPendingSyncAudio = state.pageNumPendingSyncAudio || syncAudioToPage;
    return;
  }
  state.pageRendering = true;

  const isTwoPages = isTwoPageLayout();
  dom.canvasWrapper.classList.toggle('two-page-mode', isTwoPages);
  const containerW = dom.viewerContainer.clientWidth - 32;
  const containerH = dom.viewerContainer.clientHeight - 32;

  let leftPageNum = state.pageNum;
  let rightPageNum = isTwoPages && (leftPageNum + 1 <= state.totalPages) ? leftPageNum + 1 : null;
  window.__raDiagRecord?.('pdf.render.start', { page: leftPageNum });

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

  let renderSucceeded = false;
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
    if (!isTwoPages && state.viewMode === 'fit-width') {
      scale = (containerW / unscaledLeft.width) * state.zoomScale;
      dom.pageRightWrapper.classList.add('hidden');
    } else if (!isTwoPages && state.viewMode === 'fit-height') {
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
    renderSucceeded = true;
    window.__raDiagRecord?.('pdf.render.end', { page: leftPageNum });

  } catch (err) {
    window.__raDiagRecord?.('pdf.render.error', {
      page: leftPageNum,
      errorName: err?.name || 'Error',
      errorMessage: err?.message || String(err)
    });
    console.error('Lỗi khi render trang:', err);
  } finally {
    state.pageRendering = false;
    requestAnimationFrame(updateTouchControlBounds);
    if (state.pageNumPending !== null) {
      const pendingPage = state.pageNumPending;
      const shouldSyncPendingAudio = Boolean(state.pageNumPendingSyncAudio);
      state.pageNumPending = null;
      state.pageNumPendingSyncAudio = false;
      state.pageNum = pendingPage;
      renderCurrentSpread(shouldSyncPendingAudio);
    }
  }

  // Chỉ tua audio nếu render thành công và vẫn tương ứng với trang đang chọn.
  // Render cũ hoàn tất muộn sau resize không được kéo audio về mốc trang cũ.
  if (renderSucceeded && syncAudioToPage && state.pageNum === leftPageNum &&
      state.autoSeekAudio && !state.isAudioDrivenChange) {
    const rawTarget = state.pendingManualBackwardMarker || state.pageTimestamps[leftPageNum];
    state.pendingManualBackwardMarker = null;
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

  saveReadingSession(true);
  if (state.pdfDoc) renderCurrentSpread();
}

function changeZoom(delta) {
  const newZoom = Math.max(0.5, Math.min(3.0, state.zoomScale + delta));
  state.zoomScale = Math.round(newZoom * 100) / 100;
  saveReadingSession(true);
  updateZoomLabel();
  if (state.pdfDoc) renderCurrentSpread();
}

function updateZoomLabel() {
  dom.lblZoomLevel.textContent = `${Math.round(state.zoomScale * 100)}%`;
}

function changePage(delta) {
  if (!state.pdfDoc) return;
  const previousPage = state.pageNum;
  const step = isTwoPageLayout() ? 2 * delta : delta;
  const requestedPage = state.pageNum + step;
  let newPage = requestedPage;
  state.pendingManualBackwardMarker = null;

  if (delta < 0 && requestedPage >= 1) {
    const previous = window.ReadAlongPageSync.resolvePreviousMarkedSpread({
      pageTimestamps: state.pageTimestamps,
      targetPage: Math.min(state.totalPages, requestedPage + (step === -2 ? 1 : 0)),
      totalPages: state.totalPages,
      currentPart: state.currentAudioIndex || 0,
      audioCount: state.currentStoryAudios?.length || 0,
      duration: dom.audioElement.duration
    });
    if (previous) {
      newPage = state.viewMode === 'two-pages'
        ? window.ReadAlongPageSync.alignPage(previous.markerPage, 'two-pages')
        : previous.startPage;
      state.pendingManualBackwardMarker = previous.marker;
      state.timestampSpread = state.viewMode === 'two-pages' ? false : previous.spread;
    } else {
      state.timestampSpread = false;
    }
  } else if (state.viewMode !== 'two-pages') {
    state.timestampSpread = false;
  }

  if (newPage >= 1 && newPage <= state.totalPages) {
    state.pageNum = newPage;
  } else if (delta > 0 && state.pageNum < state.totalPages) {
    state.pageNum = state.totalPages;
    state.timestampSpread = false;
  } else if (delta < 0 && state.pageNum > 1) {
    state.pageNum = 1;
    state.timestampSpread = false;
  } else {
    return;
  }

  state.isAudioDrivenChange = false;
  saveReadingSession(true);
  window.__raDiagRecord?.('page.turn.manual', {
    fromPage: previousPage,
    toPage: state.pageNum,
    time: Number.isFinite(dom.audioElement.currentTime) ? dom.audioElement.currentTime : 0,
    reason: 'manual-navigation',
    mode: state.pageTurnMode
  });
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

// Local JSON export naming is self-contained; no remote marker sync module is required.
function getSyncFileName() {
  const base = state.currentBookKey || 'truyen';
  return `${base.replace(/\.[^/.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'truyen'}.json`;
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
  if (dom.touchCenterIcon) dom.touchCenterIcon.textContent = isPlaying ? 'Ⅱ' : '▶';
}

async function togglePlayPause() {
  const hasAudioSource = Boolean(dom.audioElement.currentSrc || dom.audioElement.src);
  if (!hasAudioSource || !state.currentStoryAudios || state.currentStoryAudios.length === 0) {
    showToast('Chưa có audio. Hãy chọn PDF (nếu cần), sau đó bấm “Chọn audio” để nạp âm thanh.');
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
    window.__raDiagRecord?.('audio.play.failure', {
      page: state.pageNum,
      time: Number.isFinite(dom.audioElement.currentTime) ? dom.audioElement.currentTime : 0,
      errorName: error?.name || 'Error',
      errorMessage: error?.message || String(error)
    });
    updatePlayButtonState();
    console.error('Không thể phát âm thanh:', error);
    const message = error && error.name === 'NotAllowedError'
      ? 'Trình duyệt chặn phát âm thanh. Hãy bấm Play trực tiếp sau khi chọn audio.'
      : error && error.name === 'NotSupportedError'
        ? 'Định dạng hoặc codec audio này không được trình duyệt hỗ trợ. Hãy chọn file audio khác (M4A, AAC, WAV, OGG/Opus hoặc FLAC).'
        : 'Không phát được âm thanh. Hãy kiểm tra định dạng và codec của file audio rồi thử lại.';
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
  state.timestampSpread = false;
  state.pageNum = state.viewMode === 'two-pages' ? (target % 2 === 0 ? Math.max(1, target - 1) : target) : target;
  state.isAudioDrivenChange = false;
  state.waitingForManualPageTurn = false;
  state.pendingManualPage = null;
  state.resumeAfterManualTurn = false;
  renderCurrentSpread(true);
  dom.pageJumpInput.value = '';
}
function getCurrentPageTimestamp(page) {
  return window.ReadAlongPageSync.normalizeMarker((state.pageTimestamps || {})[page]);
}
function waitForAudioMetadata(audio, timeoutMs = 15000) {
  if (audio.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timeoutId;
    const cleanup = () => {
      clearTimeout(timeoutId);
      audio.removeEventListener('loadedmetadata', onReady);
      audio.removeEventListener('error', onError);
    };
    const onReady = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('Audio không tải được metadata.')); };
    audio.addEventListener('loadedmetadata', onReady);
    audio.addEventListener('error', onError);
    timeoutId = setTimeout(() => { cleanup(); reject(new Error('Hết thời gian chờ audio tải metadata.')); }, timeoutMs);
    if (audio.readyState >= 1) onReady();
  });
}

async function replayCurrentPage() {
  if (!state.pdfDoc) { showToast('Vui lòng mở PDF trước.'); return; }
  const page = state.pageNum;
  const marker = getCurrentPageTimestamp(page);
  window.__raDiagRecord?.('page.replay', {
    page, time: Number.isFinite(dom.audioElement.currentTime) ? dom.audioElement.currentTime : 0,
    targetTime: marker ? marker.time : -1, part: marker ? marker.part : state.currentAudioIndex,
    reason: marker ? 'marker-found' : 'marker-missing'
  });
  if (!marker) { showToast('Trang này chưa có mốc thời gian.'); return; }
  if (!dom.audioElement.currentSrc && !(state.currentStoryAudios && state.currentStoryAudios.length)) {
    showToast('Chưa có audio.'); return;
  }
  try {
    if (state.currentStoryAudios && state.currentStoryAudios.length > 1 &&
        marker.part !== state.currentAudioIndex && state.currentStoryAudios[marker.part]) {
      dom.audioElement.pause();
      loadAudioPart(marker.part);
    }
    await waitForAudioMetadata(dom.audioElement);
    if (page !== state.pageNum) return;
    const duration = dom.audioElement.duration;
    dom.audioElement.currentTime = Math.min(Math.max(0, marker.time),
      Number.isFinite(duration) ? duration : marker.time);
    await dom.audioElement.play();
  } catch (error) {
    window.__raDiagRecord?.('page.replay.error', {
      page, time: Number.isFinite(dom.audioElement.currentTime) ? dom.audioElement.currentTime : 0,
      targetTime: marker.time, part: marker.part,
      errorName: error?.name || 'Error', errorMessage: error?.message || String(error)
    });
    console.warn('Không thể đọc lại trang:', error);
    showToast('Không thể đọc lại trang. Hãy thử bấm Phát.');
  }
}

function getRenderedPdfBounds() {
  const canvases = [dom.pdfCanvasLeft, dom.pdfCanvasRight].filter(canvas => {
    if (!canvas || !canvas.width || !canvas.height) return false;
    const page = canvas.closest('.canvas-page');
    return page && !page.classList.contains('hidden');
  });
  const rects = canvases.map(canvas => canvas.getBoundingClientRect())
    .filter(rect => rect.width > 0 && rect.height > 0);
  if (!rects.length) return null;
  const left = Math.min(...rects.map(rect => rect.left));
  const top = Math.min(...rects.map(rect => rect.top));
  const right = Math.max(...rects.map(rect => rect.right));
  const bottom = Math.max(...rects.map(rect => rect.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function updateTouchControlBounds() {
  if (!dom.canvasWrapper || !dom.touchControlHints) return;
  const bounds = getRenderedPdfBounds();
  const wrapper = dom.canvasWrapper.getBoundingClientRect();
  if (!bounds || !wrapper.width || !wrapper.height) {
    dom.touchControlHints.style.visibility = 'hidden';
    return;
  }
  dom.touchControlHints.style.visibility = 'visible';
  dom.touchControlHints.style.left = (bounds.left - wrapper.left) + 'px';
  dom.touchControlHints.style.top = (bounds.top - wrapper.top) + 'px';
  dom.touchControlHints.style.width = bounds.width + 'px';
  dom.touchControlHints.style.height = bounds.height + 'px';
}

function initPdfClickNavigation() {
  dom.canvasWrapper.addEventListener('click', (event) => {
    if (!state.pdfDoc || event.button !== 0 || event.target.tagName !== 'CANVAS') return;
    if (Date.now() < state.ignoreCanvasTapUntil) return;
    const bounds = getRenderedPdfBounds();
    if (!bounds || !bounds.width || event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) return;
    const position = (event.clientX - bounds.left) / bounds.width;
    if (position < 0.25) changePage(-1);
    else if (position > 0.75) changePage(1);
    else togglePlayPause();
  });
}

function onAudioMetadataLoaded() {
  const duration = dom.audioElement.duration || 0;
  dom.audioSeeker.max = duration;
  dom.lblAudioDuration.textContent = formatTime(duration);
}

function onAudioTimeUpdate() {
  const audio = dom.audioElement;
  const curr = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;

  dom.audioSeeker.value = curr;
  dom.lblAudioCurrentTime.textContent = formatTime(curr);
  // Bỏ qua timeupdate trung gian trong lúc seek; chỉ đồng bộ sau sự kiện seeked.
  if (audio.seeking) return;
  const allowBackwardSync = state.allowBackwardAudioSync === true;
  state.allowBackwardAudioSync = false;
  state.lastAudioObservedTime = curr;
  const markers = state.pageTimestamps || {};
  if (!state.pdfDoc || state.pageTurnMode === 'off' || !Object.keys(markers).length) return;

  const currentPart = state.currentAudioIndex || 0;
  const audioCount = Array.isArray(state.currentStoryAudios) ? state.currentStoryAudios.length : 0;
  const markerMatchesPart = marker => window.ReadAlongPageSync.markerMatchesPart(
    marker, currentPart, audioCount
  );
  const step = state.viewMode === 'two-pages' ? 2 : 1;

  if (state.pageTurnMode === 'markers') {
    const nextPage = state.pageNum + step;
    const nextMarker = nextPage <= state.totalPages ? getCurrentPageTimestamp(nextPage) : null;
    if (state.waitingForManualPageTurn || !nextMarker || !markerMatchesPart(nextMarker)) {
      if (!state.waitingForManualPageTurn && nextPage <= state.totalPages) {
        window.__raDiagRecord?.('page.turn.no-marker', {
          page: state.pageNum, toPage: nextPage, time: curr, part: currentPart,
          mode: state.pageTurnMode,
          reason: !nextMarker ? 'missing-next-marker' : 'marker-in-different-audio-part'
        });
      }
      return;
    }
    if (curr >= nextMarker.time) {
      state.waitingForManualPageTurn = true;
      state.pendingManualPage = nextPage;
      state.resumeAfterManualTurn = !audio.paused;
      window.__raDiagRecord?.('page.turn.waiting', {
        fromPage: state.pageNum, toPage: nextPage, time: curr,
        targetTime: nextMarker.time, part: currentPart,
        mode: state.pageTurnMode, reason: 'next-marker-reached'
      });
      audio.currentTime = nextMarker.time;
      audio.pause();
      showToast('Đến cuối trang. Lật trang để tiếp tục.');
    }
    return;
  }

  const nextPageForDiagnostics = state.pageNum + step;
  if (nextPageForDiagnostics <= state.totalPages) {
    const nextMarker = getCurrentPageTimestamp(nextPageForDiagnostics);
    if (!nextMarker || !markerMatchesPart(nextMarker)) {
      window.__raDiagRecord?.('page.turn.no-marker', {
        page: state.pageNum, toPage: nextPageForDiagnostics, time: curr,
        part: currentPart, mode: state.pageTurnMode,
        reason: !nextMarker ? 'missing-next-marker' : 'marker-in-different-audio-part'
      });
    }
  }

  const target = window.ReadAlongPageSync.findTargetPage({
    pageTimestamps: markers,
    totalPages: state.totalPages,
    currentTime: curr,
    currentPart,
    audioCount,
    duration: audio.duration
  });
  if (!target) return;

  const wasTwoPageLayout = isTwoPageLayout();
  let alignedPage;
  if (state.viewMode === 'two-pages') {
    state.timestampSpread = false;
    alignedPage = window.ReadAlongPageSync.alignPage(target.page, 'two-pages');
  } else {
    const spread = window.ReadAlongPageSync.resolveTimestampSpread({
      pageTimestamps: markers, page: target.page, totalPages: state.totalPages,
      currentPart, audioCount
    });
    state.timestampSpread = spread.spread;
    alignedPage = spread.startPage;
  }
  if (alignedPage === state.pageNum && wasTwoPageLayout === isTwoPageLayout()) return;

  // A stale timeupdate must never undo a manual page turn. Backward alignment is
  // permitted only after an actual backward media seek (including an intentional replay).
  if (!window.ReadAlongPageSync.shouldAllowPageChange(state.pageNum, alignedPage, allowBackwardSync)) {
    window.__raDiagRecord?.('page.turn.ignored-stale-marker', {
      fromPage: state.pageNum, toPage: alignedPage, time: curr,
      targetTime: target.time, part: currentPart,
      mode: state.pageTurnMode, reason: 'backward-page-without-backward-seek'
    });
    return;
  }

  const previousPage = state.pageNum;
  state.isAudioDrivenChange = true;
  state.pageNum = alignedPage;
  saveReadingSession(true);
  window.__raDiagRecord?.('page.turn.auto', {
    fromPage: previousPage, toPage: alignedPage, time: curr,
    targetTime: target.time, part: currentPart,
    mode: state.pageTurnMode, reason: 'audio-marker'
  });
  renderCurrentSpread();
  requestAnimationFrame(() => { state.isAudioDrivenChange = false; });
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
  dom.syncTableBody.replaceChildren();
  const total = state.totalPages || 10;

  for (let p = 1; p <= total; p++) {
    const tr = document.createElement('tr');
    const rawTs = state.pageTimestamps[p];
    const hasTime = (typeof rawTs === 'number' && Number.isFinite(rawTs) && rawTs >= 0) ||
      (rawTs && typeof rawTs === 'object' && typeof rawTs.time === 'number' && Number.isFinite(rawTs.time) && rawTs.time >= 0);
    const sec = typeof rawTs === 'number' ? rawTs : (hasTime ? rawTs.time : 0);
    const partNum = (hasTime && rawTs && Number.isInteger(rawTs.part) && rawTs.part >= 0) ? rawTs.part : null;

    const pageCell = document.createElement('td');
    const pageBold = document.createElement('b');
    pageBold.textContent = 'Trang ' + p;
    pageCell.appendChild(pageBold);
    tr.appendChild(pageCell);

    const timeCell = document.createElement('td');
    const timeLabel = document.createElement('span');
    timeLabel.textContent = hasTime
      ? formatTime(sec) + (partNum !== null ? ' (Phần ' + (partNum + 1) + ')' : '')
      : '(Chưa có)';
    if (!hasTime) timeLabel.style.color = '#64748b';
    if (partNum !== null) {
      timeLabel.style.fontSize = '0.75rem';
      timeLabel.style.color = '#38bdf8';
    }
    timeCell.appendChild(timeLabel);
    tr.appendChild(timeCell);

    const actionsCell = document.createElement('td');
    if (hasTime) {
      const playButton = document.createElement('button');
      playButton.type = 'button';
      playButton.className = 'btn-mini-play';
      playButton.textContent = '▶ Nghe';
      playButton.addEventListener('click', () => window.seekAndPlayTo(sec, p, partNum));
      actionsCell.appendChild(playButton);

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'btn-mini-del';
      deleteButton.textContent = '✕ Xóa';
      deleteButton.addEventListener('click', () => window.deleteSync(p));
      actionsCell.appendChild(deleteButton);
    }
    const setButton = document.createElement('button');
    setButton.type = 'button';
    setButton.className = 'btn-mini-play';
    setButton.textContent = '✏️ Đặt';
    setButton.addEventListener('click', () => window.setManualSync(p));
    actionsCell.appendChild(setButton);
    tr.appendChild(actionsCell);
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
  let touchStartY = 0;
  let touchStartedOnPdf = false;
  dom.canvasWrapper.addEventListener('touchstart', (event) => {
    const touch = event.changedTouches[0];
    touchStartedOnPdf = event.target.tagName === 'CANVAS' && Boolean(getRenderedPdfBounds());
    if (!touchStartedOnPdf) return;
    touchStartX = touch.screenX;
    touchStartY = touch.screenY;
  }, { passive: true });
  dom.canvasWrapper.addEventListener('touchend', (event) => {
    if (!touchStartedOnPdf) return;
    touchStartedOnPdf = false;
    const touch = event.changedTouches[0];
    const deltaX = touch.screenX - touchStartX;
    const deltaY = touch.screenY - touchStartY;
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
    state.ignoreCanvasTapUntil = Date.now() + 450;
    changePage(deltaX < 0 ? 1 : -1);
  }, { passive: true });
  window.addEventListener('resize', updateTouchControlBounds);
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(updateTouchControlBounds);
    [dom.canvasWrapper, dom.pdfCanvasLeft, dom.pdfCanvasRight].forEach(node => {
      if (node) observer.observe(node);
    });
  }
  requestAnimationFrame(updateTouchControlBounds);
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
      event.preventDefault();
      handleAppBack();
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

// Dọn đúng cache shell của Read Along và unregister đúng service worker của ứng dụng.
// Không đụng tới localStorage/sessionStorage, thư viện tải về hoặc dữ liệu đọc của người dùng.
async function clearReadAlongWebCachesForUpdate() {
  const result = { deletedCaches: 0, unregisteredWorkers: 0, errors: [] };

  if (window.caches && typeof window.caches.keys === 'function') {
    try {
      const keys = await window.caches.keys();
      const appCaches = keys.filter(key => /^read-along-shell-/i.test(key));
      const deleted = await Promise.allSettled(appCaches.map(key => window.caches.delete(key)));
      for (const item of deleted) {
        if (item.status === 'fulfilled' && item.value) result.deletedCaches++;
        else if (item.status === 'rejected') result.errors.push(String(item.reason?.message || item.reason || 'Cache deletion failed'));
      }
    } catch (error) {
      result.errors.push(String(error?.message || error || 'Cache API unavailable'));
    }
  }

  if (navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function') {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const appWorkerPath = new URL('./sw.js', window.location.href).pathname;
      const appRegistrations = registrations.filter(registration => {
        const worker = registration.active || registration.waiting || registration.installing;
        if (!worker?.scriptURL) return false;
        try {
          const script = new URL(worker.scriptURL);
          return script.origin === window.location.origin && script.pathname === appWorkerPath;
        } catch (_) { return false; }
      });
      const removed = await Promise.allSettled(appRegistrations.map(registration => registration.unregister()));
      for (const item of removed) {
        if (item.status === 'fulfilled' && item.value) result.unregisteredWorkers++;
        else if (item.status === 'rejected') result.errors.push(String(item.reason?.message || item.reason || 'Service worker unregister failed'));
      }
    } catch (error) {
      result.errors.push(String(error?.message || error || 'Service worker API unavailable'));
    }
  }

  return result;
}

// Kiểm tra bản phát hành mới nhất theo kênh OTA được người dùng chọn.
const READ_ALONG_OTA_API = 'https://read-along-admin.pages.dev/api/readalong-admin/ota';
const READ_ALONG_UPDATE_CHANNEL_KEY = 'readAlongUpdateChannel';

function getSelectedUpdateChannel() {
  let saved = 'official';
  try {
    saved = localStorage.getItem(READ_ALONG_UPDATE_CHANNEL_KEY) || 'official';
  } catch (_) {}
  const selected = dom.chkBetaOta ? (dom.chkBetaOta.checked ? 'beta' : 'official') : saved;
  return selected === 'beta' ? 'beta' : 'official';
}

function isValidReleaseVersion(value) {
  return /^v?\d+\.\d+\.\d+(?:-beta\.\d+)?$/i.test(String(value || '').trim());
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
  if (av.beta === null && bv.beta !== null) return 1;
  if (av.beta !== null && bv.beta === null) return -1;
  if (av.beta === null && bv.beta === null) return 0;
  return av.beta > bv.beta ? 1 : av.beta < bv.beta ? -1 : 0;
}

async function checkReadAlongUpdates() {
  const btn = dom.menuCheckUpdates;
  const channel = getSelectedUpdateChannel();
  const channelLabel = channel === 'beta' ? 'Beta' : 'Official';
  const label = btn?.querySelector('span:last-child');
  const originalLabel = label?.textContent || 'Kiểm tra cập nhật';
  if (btn) {
    btn.disabled = true;
    if (label) label.textContent = 'Đang kiểm tra ' + channelLabel + '…';
  }

  try {
    const latestUrl = READ_ALONG_OTA_API + '/latest?channel=' + encodeURIComponent(channel);
    const response = await fetch(latestUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    let manifest;
    try { manifest = await response.json(); }
    catch { throw new Error('Máy chủ OTA trả về dữ liệu không hợp lệ.'); }
    if (!response.ok) {
      if (response.status === 404) {
        showToast(channel === 'beta' ? 'Chưa có bản Beta để cập nhật.' : 'Chưa có bản Official để cập nhật.');
        return;
      }
      throw new Error(manifest.error || 'Máy chủ OTA trả về HTTP ' + response.status);
    }

    const expectedFilename = 'read-along-v' + String(manifest?.version || '') + '-android.apk';
    if (!manifest || manifest.schemaVersion !== 1 || manifest.channel !== channel ||
        !isValidReleaseVersion(manifest.version) ||
        !Number.isSafeInteger(manifest.versionCode) || manifest.versionCode < 1 ||
        manifest.filename !== expectedFilename ||
        !Number.isSafeInteger(manifest.size) || manifest.size < 1024 || manifest.size > 250 * 1024 * 1024 ||
        typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
        typeof manifest.notes !== 'string' || typeof manifest.mandatory !== 'boolean') {
      throw new Error('Manifest OTA không hợp lệ hoặc không đầy đủ.');
    }

    const currentVersion = document.querySelector('meta[name="app-version"]')?.content || '0.0.0';
    const currentVersionCode = Number(document.querySelector('meta[name="app-version-code"]')?.content || 0);
    if (compareReleaseVersions(manifest.version, currentVersion) <= 0 ||
        manifest.versionCode <= currentVersionCode) {
      const message = 'Kênh ' + channelLabel + ' mới nhất là ' + manifest.version +
        ' (versionCode ' + manifest.versionCode + '), ứng dụng hiện tại là ' +
        currentVersion + ' (versionCode ' + currentVersionCode + ').';
      showToast('Không có bản ' + channelLabel + ' mới hơn để cài.');
      alert(message + '\nKhông cài bản có versionName hoặc versionCode thấp hơn; APK cũng phải cùng khóa ký.');
      return;
    }

    // Construct the fixed backend URL locally. Never trust a storage URL from the manifest.
    const downloadUrl = READ_ALONG_OTA_API + '/download?channel=' +
      encodeURIComponent(channel) + '&version=' + encodeURIComponent(manifest.version);
    const notes = String(manifest.notes || '').trim().slice(0, 400);
    const message = (notes ? notes + '\n\n' : '') +
      'Tải và cài đặt bản cập nhật? Android có thể yêu cầu xác nhận.';
    if (!confirm(message)) return;

    const nativeUpdater = window.Capacitor?.Plugins?.ApkUpdater;
    if (nativeUpdater?.downloadAndInstall) {
      showToast('Đang dọn cache ứng dụng cũ…');
      const cleanup = await clearReadAlongWebCachesForUpdate();
      if (cleanup.errors.length) {
        console.warn('Một phần cache/service worker chưa được dọn:', cleanup.errors);
        showToast('Không dọn được toàn bộ cache cũ; vẫn tiếp tục cập nhật.');
      } else {
        showToast('Đã dọn cache cũ. Đang tải bản cập nhật…');
      }
      await nativeUpdater.downloadAndInstall({
        url: downloadUrl,
        filename: manifest.filename,
        expectedSize: manifest.size,
        sha256: manifest.sha256
      });
    } else {
      window.location.href = downloadUrl;
    }
  } catch (error) {
    console.error('Update check failed:', error);
    alert('Không thể kiểm tra/cài đặt cập nhật kênh ' + channelLabel + ': ' +
      (error.message || 'Lỗi mạng') + '\nHãy thử lại khi có kết nối Internet.');
  } finally {
    if (btn) {
      btn.disabled = false;
      const currentLabel = btn.querySelector('span:last-child');
      if (currentLabel) currentLabel.textContent = originalLabel;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const isNativeAndroid = Boolean(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.getPlatform?.() === 'android');

  const versionMeta = document.querySelector('meta[name="app-version"]');
  if (document.getElementById('installedAppVersion')) {
    document.getElementById('installedAppVersion').textContent = versionMeta?.content || 'Không xác định';
  }

  if (dom.chkBetaOta) {
    let savedChannel = 'official';
    try {
      savedChannel = localStorage.getItem(READ_ALONG_UPDATE_CHANNEL_KEY) || 'official';
    } catch (_) {}
    dom.chkBetaOta.checked = savedChannel === 'beta';
    dom.chkBetaOta.addEventListener('change', () => {
      const channel = dom.chkBetaOta.checked ? 'beta' : 'official';
      try { localStorage.setItem(READ_ALONG_UPDATE_CHANNEL_KEY, channel); } catch (_) {}
      showToast('Đã chọn kênh OTA ' + (channel === 'beta' ? 'Beta' : 'Official') + '.');
    });
  }

  if (dom.menuCheckUpdates && isNativeAndroid) {
    dom.menuCheckUpdates.classList.remove('hidden');
    dom.menuCheckUpdates.addEventListener('click', checkReadAlongUpdates);
  }
});


// =======================================================

// Final batch checkpoint: per-book three-position reading recovery is enabled.
