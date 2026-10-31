/* Pure marker-source validation and conflict resolution. Not wired into the reader yet. */
(function (root) {
  'use strict';

  const LEGACY_SOURCE_ORDER = ['r2', 'github', 'folder', 'localStorage'];
  const SOURCE_ORDER = ['localStorage', 'r2', 'github', 'folder'];

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
    if (!m) return false;
    const [, year, month, day, hour, minute, second] = m.map(Number);
    return month >= 1 && month <= 12 && day >= 1 &&
      day <= new Date(Date.UTC(year, month, 0)).getUTCDate() &&
      hour <= 23 && minute <= 59 && second <= 59;
  }

  function validMarker(value, audioCount) {
    let time, part;
    if (typeof value === 'number') {
      time = value;
      part = 0;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      time = value.time;
      part = value.part === undefined ? 0 : value.part;
      if (Object.keys(value).some(key => key !== 'time' && key !== 'part')) return false;
    } else return false;
    if (!Number.isFinite(time) || time < 0 || !Number.isInteger(part) || part < 0) return false;
    if (Number.isInteger(audioCount) && audioCount > 0 && part >= audioCount) return false;
    return true;
  }

  function validMarkerMap(markers, options) {
    if (!markers || typeof markers !== 'object' || Array.isArray(markers)) return false;
    return Object.entries(markers).every(([page, value]) =>
      /^[1-9]\d*$/.test(page) && Number.isSafeInteger(Number(page)) &&
      validMarker(value, options && options.audioCount));
  }

  function classify(data, options) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const keys = Object.keys(data);
    const envelopeKeys = ['schemaVersion', 'revision', 'updatedAt', 'sourceId', 'markers'];
    const looksVersioned = keys.some(key => envelopeKeys.includes(key));
    if (looksVersioned) {
      if (keys.some(key => !envelopeKeys.includes(key)) ||
          data.schemaVersion !== 1 ||
          !Number.isSafeInteger(data.revision) || data.revision < 1 ||
          !validDate(data.updatedAt) ||
          typeof data.sourceId !== 'string' || !data.sourceId.trim() || data.sourceId.length > 100 ||
          !validMarkerMap(data.markers, options)) return null;
      return { kind: 'versioned', revision: data.revision, updatedAt: Date.parse(data.updatedAt), sourceId: data.sourceId, markers: data.markers };
    }
    if (!keys.length || !validMarkerMap(data, options)) return null;
    return { kind: 'legacy', markers: data };
  }

  function stableMarkers(markers) {
    return JSON.stringify(Object.keys(markers).sort((a, b) => Number(a) - Number(b)).reduce((out, key) => {
      out[key] = markers[key];
      return out;
    }, {}));
  }

  function sourceRank(source, order) {
    const list = Array.isArray(order) ? order : SOURCE_ORDER;
    const index = list.indexOf(source);
    return index < 0 ? list.length : index;
  }

  function resolve(candidates, options) {
    const opts = options || {};
    const list = (Array.isArray(candidates) ? candidates : []).map((item, index) => ({
      source: item && typeof item.source === 'string' ? item.source : '',
      data: item && item.data,
      index
    })).filter(item => item.source && classify(item.data, opts));

    if (opts.explicitImport === true) {
      const imported = list.find(item => item.source === 'import');
      if (!imported) return { status: 'empty', selected: null, markers: {}, conflict: false };
      return { status: 'selected', selected: imported.source, markers: classify(imported.data, opts).markers, conflict: false, kind: classify(imported.data, opts).kind };
    }

    const versioned = list.filter(item => classify(item.data, opts).kind === 'versioned');
    if (versioned.length) {
      const maxRevision = Math.max(...versioned.map(item => classify(item.data, opts).revision));
      const newest = versioned.filter(item => classify(item.data, opts).revision === maxRevision);
      const distinct = new Set(newest.map(item => stableMarkers(classify(item.data, opts).markers)));
      if (distinct.size > 1) {
        const selected = newest.slice().sort((a, b) =>
          sourceRank(a.source, opts.conflictSourceOrder || SOURCE_ORDER) -
          sourceRank(b.source, opts.conflictSourceOrder || SOURCE_ORDER) || a.index - b.index)[0];
        return { status: 'conflict', selected: selected.source, markers: classify(selected.data, opts).markers, conflict: true, revision: maxRevision, persist: false };
      }
      const selected = newest.slice().sort((a, b) =>
        classify(b.data, opts).updatedAt - classify(a.data, opts).updatedAt ||
        sourceRank(a.source, opts.sourceOrder || SOURCE_ORDER) - sourceRank(b.source, opts.sourceOrder || SOURCE_ORDER) ||
        a.index - b.index)[0];
      return { status: 'selected', selected: selected.source, markers: classify(selected.data, opts).markers, conflict: false, kind: 'versioned', revision: maxRevision, persist: true };
    }

    // Preserve the exact historical legacy fallback order; no freshness is inferred.
    const legacy = list.filter(item => classify(item.data, opts).kind === 'legacy');
    let selected = null;
    for (const source of LEGACY_SOURCE_ORDER) {
      const match = legacy.find(item => item.source === source);
      if (match) selected = match;
      if (source === 'github' && selected) break;
    }
    if (!selected) selected = legacy.find(item => item.source === 'localStorage') || null;
    if (!selected) return { status: 'empty', selected: null, markers: {}, conflict: false };
    return { status: 'selected', selected: selected.source, markers: classify(selected.data, opts).markers, conflict: false, kind: 'legacy', persist: false };
  }

  root.ReadAlongMarkerResolver = Object.freeze({ classify, validMarkerMap, resolve });
})(typeof window !== 'undefined' ? window : globalThis);
