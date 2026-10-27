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
      // A zero-second marker on a later page is usually a missing timestamp that
      // was normalized to 0. It must not advance the reader away from the opening page.
      if (page > 1 && marker.time === 0) continue;
      if (Number.isFinite(duration) && duration > 0 && marker.time > duration + 1) continue;
      // On equal timestamps prefer the first page. Choosing the last page on a tie
      // can jump past page 1 when several missing/legacy markers default to 0.
      if (marker.time <= currentTime && (!target || marker.time > target.time)) {
        target = { page, time: marker.time, part: marker.part };
      }
    }
    return target;
  }
  function alignPage(page, viewMode) {
    return viewMode === 'two-pages' ? (page % 2 === 0 ? Math.max(1, page - 1) : page) : page;
  }
  function shouldAllowPageChange(currentPage, targetPage, allowBackwardSync) {
    return targetPage >= currentPage || allowBackwardSync === true;
  }
  root.ReadAlongPageSync = Object.freeze({ normalizeMarker, markerMatchesPart, findTargetPage, alignPage, shouldAllowPageChange });
})(window);
