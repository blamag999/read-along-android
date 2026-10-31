/* Pure PDF/audio timestamp helpers. Keep synchronization rules isolated from UI and media controls. */
(function (root) {
  'use strict';
  function normalizeMarker(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
      return { time: raw, part: 0 };
    }
    if (raw && typeof raw === 'object' && Number.isFinite(raw.time) && raw.time >= 0) {
      return {
        time: raw.time,
        part: Number.isInteger(raw.part) && raw.part >= 0 ? raw.part : 0
      };
    }
    return null;
  }
  function markerMatchesPart(marker, currentPart, audioCount) {
    if (!marker || !Number.isFinite(marker.time) || marker.time < 0) return false;
    return audioCount <= 1 || marker.part === currentPart;
  }
  function findTargetPage(options) {
    const markers = options.pageTimestamps || {};
    const totalPages = Math.max(0, Number(options.totalPages) || 0);
    const currentTime = Number(options.currentTime);
    const currentPart = Math.max(0, Number(options.currentPart) || 0);
    const audioCount = Math.max(0, Number(options.audioCount) || 0);
    const duration = Number(options.duration);
    if (!Number.isFinite(currentTime) || currentTime < 0) return null;
    let target = null;
    for (let page = 1; page <= totalPages; page += 1) {
      const marker = normalizeMarker(markers[page]);
      if (!marker || !markerMatchesPart(marker, currentPart, audioCount)) continue;
      // Zero is a valid timestamp. When page 1 has no marker, a page-2 marker
      // at 0 seconds must align the reader to page 2 as soon as audio starts.
      if (Number.isFinite(duration) && duration > 0 && marker.time > duration + 1) continue;
      // On equal timestamps prefer the first page. Choosing the last page on a tie
      // can jump past page 1 when several missing/legacy markers default to 0.
      if (marker.time <= currentTime && (!target || marker.time > target.time)) {
        target = { page, time: marker.time, part: marker.part };
      }
    }
    return target;
  }
  function resolveTimestampSpread(options) {
    const opts = options || {};
    const markers = opts.pageTimestamps || {};
    const page = Math.max(1, Number(opts.page) || 1);
    const totalPages = Math.max(0, Number(opts.totalPages) || 0);
    const currentPart = Math.max(0, Number(opts.currentPart) || 0);
    const audioCount = Math.max(0, Number(opts.audioCount) || 0);
    const marker = normalizeMarker(markers[page]);
    if (!marker || !markerMatchesPart(marker, currentPart, audioCount)) {
      return { startPage: page, endPage: page, spread: false, reason: 'target-marker-missing' };
    }
    const neighborPage = page % 2 === 0 ? page - 1 : page + 1;
    if (neighborPage < 1 || neighborPage > totalPages) {
      return { startPage: page, endPage: page, spread: false, reason: 'no-adjacent-page' };
    }
    const neighbor = normalizeMarker(markers[neighborPage]);
    if (neighbor && markerMatchesPart(neighbor, currentPart, audioCount)) {
      return { startPage: page, endPage: page, spread: false, reason: 'both-pages-have-markers' };
    }
    const startPage = page % 2 === 0 ? page - 1 : page;
    return { startPage, endPage: Math.min(totalPages, startPage + 1), spread: startPage + 1 <= totalPages, reason: 'adjacent-page-marker-missing' };
  }
  function resolvePreviousMarkedSpread(options) {
    const opts = options || {};
    const markers = opts.pageTimestamps || {};
    const targetPage = Math.max(1, Math.min(
      Math.max(1, Number(opts.totalPages) || 1),
      Number(opts.targetPage) || 1
    ));
    const currentPart = Math.max(0, Number(opts.currentPart) || 0);
    const audioCount = Math.max(0, Number(opts.audioCount) || 0);
    const duration = Number(opts.duration);
    for (let page = targetPage; page >= 1; page -= 1) {
      const marker = normalizeMarker(markers[page]);
      if (!marker || !markerMatchesPart(marker, currentPart, audioCount)) continue;
      if (Number.isFinite(duration) && duration > 0 && marker.time > duration + 1) continue;
      const spread = resolveTimestampSpread({ ...opts, page });
      return {
        ...spread,
        markerPage: page,
        marker: { time: marker.time, part: marker.part }
      };
    }
    return null;
  }

  function isConfirmedBackwardSeek(previousTime, targetTime, actualTime) {
    return Number.isFinite(previousTime) && Number.isFinite(targetTime) && Number.isFinite(actualTime) &&
      previousTime > targetTime + 0.25 && Math.abs(actualTime - targetTime) <= 1.25;
  }
  function alignPage(page, viewMode) {
    return viewMode === 'two-pages' ? (page % 2 === 0 ? Math.max(1, page - 1) : page) : page;
  }
  function shouldAllowPageChange(currentPage, targetPage, allowBackwardSync) {
    return targetPage >= currentPage || allowBackwardSync === true;
  }
  root.ReadAlongPageSync = Object.freeze({ normalizeMarker, markerMatchesPart, findTargetPage, resolveTimestampSpread, resolvePreviousMarkedSpread, isConfirmedBackwardSeek, alignPage, shouldAllowPageChange });
})(window);

// Manual backward navigation resolves to the nearest valid prior marker and its spread.
