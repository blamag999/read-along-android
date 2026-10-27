/* Responsive playlist pagination helpers, independent from story rendering. */
(function (root) {
  'use strict';
  function calculatePageSize(availableHeight, estimatedRowHeight, itemCount) {
    const count = Math.max(0, Math.floor(Number(itemCount) || 0));
    if (!count) return 0;
    const height = Math.max(1, Number(availableHeight) || 1);
    const rowHeight = Math.max(36, Number(estimatedRowHeight) || 48);
    return Math.max(1, Math.min(count, Math.floor(height / rowHeight)));
  }
  function clampPage(page, totalPages) {
    return Math.max(1, Math.min(Math.floor(Number(page) || 1), Math.max(1, Math.floor(Number(totalPages) || 1)));
  }
  root.ReadAlongPlaylistLayout = Object.freeze({ calculatePageSize, clampPage });
})(window);
