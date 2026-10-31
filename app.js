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
  dom.pdfFileName.textContent = '📖 Chưa có sách';
  dom.pdfFileName.classList.add('empty');
  dom.audioFileName.textContent = '🎵 Chưa có âm thanh';
  dom.audioFileName.classList.add('empty');
  dom.lblCurrentPage.textContent = '0';
  dom.lblTotalPages.textContent = '0';
  updateAudioPartUI();
  updateReadingCheckpointsUI();
  showToast('Đã đóng sách và lưu vị trí đọc.');
  if (state.playlist.length) openPlaylistModal();
}

function requestCloseBook() {
  if (!state.pdfDoc) return;
  const title = state.pdfFileName || 'sách hiện tại';
  if (!window.confirm('Đóng sách “' + title + '”?')) return;
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
    dom.readOptionsMenu.setAttribute('aria-hidden', 'true');
    dom.btnOpenReadMenu?.setAttribute('aria-expanded', 'false');
    return;
  }
  if (state.pdfDoc) {
    requestCloseBook();
    return;
  }
  if (!window.confirm('Bạn muốn thoát Read Along?')) return;
  const appLifecycle = window.Capacitor?.Plugins?.AppLifecycle;
  if (appLifecycle?.exitApp) {
    appLifecycle.exitApp().catch(error => {
      console.error('Không thể thoát ứng dụng:', error);
      showToast('Không thể thoát ứng dụng. Hãy nhấn Back lần nữa.');
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
    updatedAt: now
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
  state.viewMode = 'fit-height';
  state.zoomScale = Number.isFinite(restored.zoomScale) ? Math.max(0.5, Math.min(3, restored.zoomScale)) : state.zoomScale;
  state.pageTurnMode = 'next'; // Auto page-turn is always enabled; legacy off values are normalized.
  
  state.sessionRestorePending = true;
  state.lastSessionSaveAt = 0;
  dom.canvasWrapper.classList.remove('two-page-mode');
  renderCurrentSpread();
  if (state.currentStoryAudios[state.currentAudioIndex]) {
    loadAudioPart(state.currentAudioIndex, { restoreSession: true });
  } else {
    state.sessionRestorePending = false;
    dom.audioElement.pause();
  }
  updateReadingCheckpointsUI();
  showToast('Đã khôi phục mốc đọc. Âm thanh không tự phát.');
}
function restoreReadingSessionForCurrentBook() {
  const session = getReadingSessionForBook(state.currentBookKey);
  if (!session) return null;
  const resumeLabel = 'Trang ' + (session.page || 1) + ' · ' + formatTime(session.audioTime || 0);
  const shouldResume = window.confirm('Tiếp tục xem: ' + resumeLabel + '?');
  if (!shouldResume) {
    state.sessionRestorePending = false;
    state.timestampSpread = false;
    updateReadingCheckpointsUI();
    showToast('Đã mở sách từ đầu. Bạn vẫn có thể khôi phục một mốc đọc đã lưu.');
    return null;
  }
  state.timestampSpread = false;
  if (Number.isInteger(session.page) && session.page >= 1 && session.page <= state.totalPages) state.pageNum = session.page;
  state.viewMode = 'fit-height';
  dom.canvasWrapper.classList.remove('two-page-mode');
  if (Number.isFinite(session.zoomScale)) state.zoomScale = Math.max(0.5, Math.min(3, session.zoomScale));
  state.pageTurnMode = 'next'; // Auto page-turn is always enabled; legacy off values are normalized.
  
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
  showToast('Đã khôi phục vị trí đọc. Nhấn Phát để nghe.');
}

// DOM ELEMENTS
const dom = {
  btnOpenReadMenu: document.getElementById('btnOpenReadMenu'),
  readOptionsMenu: document.getElementById('readOptionsMenu'),
  menuCheckUpdates: document.getElementById('menuCheckUpdates'),
  chkBetaOta: document.getElementById('chkBetaOta'),
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



  pdfFileName: document.getElementById('pdfFileName'),
  audioFileName: document.getElementById('audioFileName'),
  syncBanner: document.getElementById('syncBanner'),



  viewerContainer: document.getElementById('viewerContainer'),
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

// =======================================================
// RESET VÀ NẠP MỐC CHUẨN XÁC THEO TỪNG CUỐN (FIX TRIỆT ĐỂ LỖI DỮ LIỆU LẠ)
// =======================================================
async function resetAndLoadSyncForBook(bookKey, remoteSyncUrl = '') {
  // Marker source order: public R2 companion JSON, then legacy localStorage fallback (read-only).
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

  if (!bookKey) return;

  // 2a. Nạp file JSON marker đi kèm sách trên R2.
  if (remoteSyncUrl) {
    try {
      const response = await fetch(remoteSyncUrl, { cache: 'no-store' });
      if (response.ok) {
        const parsed = await response.json();
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          state.pageTimestamps = parsed;
          saveSyncToStorage();
                                  return;
        }
      }
      console.warn('Không nạp được tệp mốc trực tuyến:', response.status);
    } catch (error) {
      console.warn('Không thể nạp tệp mốc trực tuyến (kiểm tra địa chỉ và quyền truy cập):', error);
    }
  }

// 3. THỨ TỰ ƯU TIÊN 2: Kiểm tra trong bộ nhớ LocalStorage của trình duyệt
  const storageKey = `sync_${bookKey}`;
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length) {
      state.pageTimestamps = parsed;
      return;
    }
  } catch (_) {}

  // 5. Nếu không có mốc nào: Giữ nguyên rỗng {}
  state.pageTimestamps = {};
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
  if (state.catalogLoading) return;
  state.catalogLoading = true;
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
    showToast('Đã tải thư viện sách (' + stories.length + ' cuốn).');
  } catch (error) {
    console.error('Không thể tải books.json từ R2:', error);
    alert('Không tải được thư viện sách. Vui lòng thử lại.');
  } finally {
    dom.playlistLoading.classList.add('hidden');
    state.catalogLoading = false;
  }
}

function updatePlaylistBadgeCount() {
  // Count is the number of books currently available in the loaded library/catalog.
  const count = state.playlist.length;
  // Keep the primary Library action available so it can retry a failed initial catalog load.
  dom.btnOpenPlaylist.disabled = false;
  dom.btnOpenPlaylist.setAttribute('aria-disabled', 'false');
  dom.btnOpenPlaylist.title = count > 0
    ? 'Mở thư viện sách (' + count + ' cuốn)'
    : 'Tải hoặc thử tải lại thư viện sách.';
  dom.btnOpenPlaylist.setAttribute('aria-label', 'Thư viện sách, ' + count + ' cuốn');
  dom.lblPlaylistCount.textContent = String(count);
  dom.lblPlaylistCount.classList.remove('hidden');
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
        pdfTag.textContent = '📖 ' + String(story.pdf.name || 'Sách');
        tags.appendChild(pdfTag);
      }
      (Array.isArray(story.audios) ? story.audios : []).forEach((aud) => {
        const audioTag = document.createElement('span');
        audioTag.className = 'mini-badge badge-mp3';
        audioTag.textContent = '🎵 ' + String(aud.name || 'Âm thanh');
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
    await resetAndLoadSyncForBook(uniqueKey, story.json ? story.json.url : '');

    if (story.pdf) {
      if (!story.pdf.url) throw new Error('Sách chưa có địa chỉ PDF trực tuyến hợp lệ.');
      await loadPdfFromUrl(story.pdf.url, story.pdf.name, false);
    }

    loadAudioPart(state.currentAudioIndex);
    showToast('Đang đọc: ' + story.title);
    renderPlaylistView();
    updateAudioPartUI();
  } catch (err) {
    console.error('Lỗi khi mở truyện từ playlist:', err);
    alert('Không mở được sách. Vui lòng kiểm tra tệp sách và âm thanh.');
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
        showToast('Đã chuyển phần âm thanh. Nhấn Phát để tiếp tục.');
        updatePlayButtonState();
      });
    });
  }

  if (!audio.url) { showToast('Phần âm thanh chưa có địa chỉ trực tuyến hợp lệ.'); return; }
  loadAudioFromUrl(audio.url, audio.name);
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
  label.textContent = 'Phần âm thanh:';
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
  showToast('Đã chuyển sang phần âm thanh ' + (index + 1) + (shouldResume ? ' — tiếp tục phát' : ' — đang tạm dừng'));
};

// Nguồn danh mục trực tuyến: ứng dụng đọc trực tiếp books.json và các URL asset công khai trên R2.
// =======================================================
// SỰ KIỆN GIAO DIỆN
// =======================================================
function initEvents() {

  dom.btnOpenPlaylist.addEventListener('click', () => {
    if (state.playlist.length > 0) openPlaylistModal();
    else loadR2Catalog();
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

  if (dom.btnOpenReadMenu && dom.readOptionsMenu) {
    dom.btnOpenReadMenu.addEventListener('click', () => {
      const isOpen = !dom.readOptionsMenu.classList.contains('hidden');
      dom.readOptionsMenu.classList.toggle('hidden', isOpen);
      dom.btnOpenReadMenu.setAttribute('aria-expanded', String(!isOpen));
      dom.readOptionsMenu.setAttribute('aria-hidden', String(isOpen));
      if (!isOpen) dom.readOptionsMenu.querySelector('button:not([disabled])')?.focus();
    });
    document.addEventListener('click', (event) => {
      if (!dom.readOptionsMenu.contains(event.target) && !dom.btnOpenReadMenu.contains(event.target)) {
        dom.readOptionsMenu.classList.add('hidden');
        dom.readOptionsMenu.setAttribute('aria-hidden', 'true');
        dom.btnOpenReadMenu.setAttribute('aria-expanded', 'false');
      }
    });
  }

  dom.btnPageJump.addEventListener('click', jumpToEnteredPage);
  dom.btnRestoreReadingCheckpoint?.addEventListener('click', restoreSelectedReadingCheckpoint);
  dom.pageJumpInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') jumpToEnteredPage(); });
  dom.btnReplayPage.addEventListener('click', replayCurrentPage);
  dom.audioElement.playbackRate = 1.0;
  initPdfClickNavigation();

  dom.btnPrevPage.addEventListener('click', () => changePage(-1));
  dom.btnNextPage.addEventListener('click', () => changePage(1));


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
      ? 'Định dạng âm thanh không được hỗ trợ.'
      : 'Không tải được âm thanh. Hãy kiểm tra tệp và thử lại.';
    showToast(reason);
    updatePlayButtonState();
  });

  dom.audioSeeker.addEventListener('input', (e) => {
    dom.audioElement.currentTime = parseFloat(e.target.value);
  });

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
    console.error('Không tải được sách trực tuyến:', error);
    throw new Error('Không tải được sách trực tuyến. Hãy kiểm tra kết nối hoặc chọn tệp khác.');
  } finally {
    state.pdfLoading = false;
    dom.pdfLoadingIndicator.classList.add('hidden');
  }
  if (state.pdfDoc) renderCurrentSpread();
}

function isTwoPageLayout() {
  return state.timestampSpread === true;
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
      !state.isAudioDrivenChange) {
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

function changeZoom(delta) {
  const newZoom = Math.max(0.5, Math.min(3.0, state.zoomScale + delta));
  state.zoomScale = Math.round(newZoom * 100) / 100;
  saveReadingSession(true);
  if (state.pdfDoc) renderCurrentSpread();
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
      newPage = previous.startPage;
      state.pendingManualBackwardMarker = previous.marker;
      state.timestampSpread = previous.spread;
    } else {
      state.timestampSpread = false;
    }
  } else {
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
    showToast('Chưa có âm thanh. Hãy chọn tệp âm thanh trước.');
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
      ? 'Trình duyệt chưa cho phép phát. Hãy nhấn Phát để thử lại.'
      : error && error.name === 'NotSupportedError'
        ? 'Định dạng âm thanh không được hỗ trợ. Hãy chọn tệp khác.'
        : 'Không phát được âm thanh. Hãy kiểm tra tệp và thử lại.';
    showToast(message);
  }
}

function jumpToEnteredPage() {
  if (!state.pdfDoc) { showToast('Vui lòng mở sách trước.'); return; }
  const raw = dom.pageJumpInput.value.trim();
  const target = Number(raw);
  if (!raw || !Number.isInteger(target) || target < 1 || target > state.totalPages) {
    showToast('Nhập số trang từ 1 đến ' + state.totalPages + '.');
    dom.pageJumpInput.focus();
    return;
  }
  state.timestampSpread = false;
  state.pageNum = target;
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
  if (!state.pdfDoc) { showToast('Vui lòng mở sách trước.'); return; }
  const page = state.pageNum;
  const marker = getCurrentPageTimestamp(page);
  window.__raDiagRecord?.('page.replay', {
    page, time: Number.isFinite(dom.audioElement.currentTime) ? dom.audioElement.currentTime : 0,
    targetTime: marker ? marker.time : -1, part: marker ? marker.part : state.currentAudioIndex,
    reason: marker ? 'marker-found' : 'marker-missing'
  });
  if (!marker) { showToast('Trang này chưa có mốc thời gian.'); return; }
  if (!dom.audioElement.currentSrc && !(state.currentStoryAudios && state.currentStoryAudios.length)) {
    showToast('Chưa có âm thanh để đọc lại trang.'); return;
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
    showToast('Không thể phát lại trang này. Hãy thử nhấn Phát.');
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
  const step = 1;

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
      showToast('Đã đến cuối trang. Lật trang để tiếp tục.');
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
  const spread = window.ReadAlongPageSync.resolveTimestampSpread({
    pageTimestamps: markers, page: target.page, totalPages: state.totalPages,
    currentPart, audioCount
  });
  state.timestampSpread = spread.spread;
  const alignedPage = spread.startPage;
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
    showToast('Đã tự động chuyển sang phần âm thanh ' + (nextIdx + 1) + '.');
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
        showToast('Hiện chưa có bản cập nhật Read Along trên kênh ' + channelLabel + '.');
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
      showToast('Bạn đang sử dụng phiên bản Read Along mới nhất.');
      return;
    }

    // Construct the fixed backend URL locally. Never trust a storage URL from the manifest.
    const downloadUrl = READ_ALONG_OTA_API + '/download?channel=' +
      encodeURIComponent(channel) + '&version=' + encodeURIComponent(manifest.version);
    const notes = String(manifest.notes || '').trim().slice(0, 400);
    const message = 'Có bản cập nhật Read Along ' + manifest.version + '.\n\n' +
      (notes ? notes + '\n\n' : '') +
      'Tải và cài đặt ngay?\nAndroid sẽ hiển thị bước xác nhận cài đặt.';
    if (!confirm(message)) return;

    const nativeUpdater = window.Capacitor?.Plugins?.ApkUpdater;
    if (nativeUpdater?.downloadAndInstall) {
      showToast('Đang dọn cache ứng dụng cũ…');
      const cleanup = await clearReadAlongWebCachesForUpdate();
      if (cleanup.errors.length) {
        console.warn('Một phần cache/service worker chưa được dọn:', cleanup.errors);
        showToast('Không thể dọn hết dữ liệu tạm. Vẫn tiếp tục cập nhật.');
      }
      showToast('Đang tải bản cập nhật Read Along…\nVui lòng không đóng ứng dụng.');
      await nativeUpdater.downloadAndInstall({
        url: downloadUrl,
        filename: manifest.filename,
        expectedSize: manifest.size,
        sha256: manifest.sha256
      });
    } else {
      showToast('Đang tải bản cập nhật Read Along…');
      window.location.href = downloadUrl;
    }
  } catch (error) {
    console.error('Update check failed:', error);
    alert('Không thể kiểm tra hoặc cài đặt cập nhật.\nVui lòng kiểm tra kết nối Internet và thử lại.');
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
