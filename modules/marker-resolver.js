/* Pure marker-source validation and conflict resolution. Not wired into the reader yet. */
(function (root) {
  'use strict';
  const SOURCE_ORDER = ['localStorage', 'r2', 'github', 'folder'];

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
    if (!m) return false;
    const [, year, month, day, hour, minute, second] = m.map(Number);
    return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && hour <= 23 && minute <= 59 && second <= 59;
  }
  function validMarker(value, audioCount) {
    let time, part;
    if (typeof value === 'number') { time = value; part = 0; }
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      time = value.time; part = value.part === undefined ? 0 : value.part;
      if (Object.keys(value).some(key => key !== 'time' && key !== 'part')) return false;
    } else return false;
    return Number.isFinite(time) && time >= 0 && Number.isInteger(part) && part >= 0 &&
      !(Number.isInteger(audioCount) && audioCount > 0 && part >= audioCount);
  }
  function validMarkerMap(markers, options) {
    if (!markers || typeof markers !== 'object' || Array.isArray(markers)) return false;
    return Object.entries(markers).every(([page, value]) =>
      /^[1-9]\d*$/.test(page) && Number.isSafeInteger(Number(page)) && validMarker(value, options && options.audioCount));
  }
  function classify(data, options) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const keys = Object.keys(data);
    const required = ['schemaVersion', 'revision', 'updatedAt', 'sourceId', 'markers'];
    if (keys.some(key => required.includes(key))) {
      if (keys.some(key => !required.includes(key)) || data.schemaVersion !== 1 ||
          !Number.isSafeInteger(data.revision) || data.revision < 1 || !validDate(data.updatedAt) ||
          typeof data.sourceId !== 'string' || !data.sourceId.trim() || data.sourceId.length > 100 ||
          !validMarkerMap(data.markers, options)) return null;
      return { kind: 'versioned', revision: data.revision, updatedAt: Date.parse(data.updatedAt), markers: data.markers };
    }
    if (!keys.length || !validMarkerMap(data, options)) return null;
    return { kind: 'legacy', markers: data };
  }
  function canonical(markers) {
    return JSON.stringify(Object.keys(markers).sort((a, b) => Number(a) - Number(b)).reduce((out, key) => {
      out[key] = markers[key]; return out;
    }, {}));
  }
  function resolve(candidates, options) {
    const opts = options || {};
    const list = (Array.isArray(candidates) ? candidates : []).map((item, index) => ({
      source: item && typeof item.source === 'string' ? item.source : '', data: item && item.data, index
    })).filter(item => item.source && classify(item.data, opts));
    if (opts.explicitImport === true) {
      const imported = list.find(item => item.source === 'import');
      if (!imported) return { status: 'invalid-import', selected: null, markers: null, conflict: false };
      const parsed = classify(imported.data, opts);
      return { status: 'selected', selected: 'import', markers: parsed.markers, conflict: false, kind: parsed.kind };
    }
    const parsedVersioned = list.map(item => ({ ...item, parsed: classify(item.data, opts) })).filter(item => item.parsed.kind === 'versioned');
    if (parsedVersioned.length) {
      const revision = Math.max(...parsedVersioned.map(item => item.parsed.revision));
      const newest = parsedVersioned.filter(item => item.parsed.revision === revision);
      if (new Set(newest.map(item => canonical(item.parsed.markers))).size > 1) {
        const order = opts.conflictSourceOrder || SOURCE_ORDER;
        const selected = newest.slice().sort((a, b) => (order.indexOf(a.source) < 0 ? order.length : order.indexOf(a.source)) -
          (order.indexOf(b.source) < 0 ? order.length : order.indexOf(b.source)) || a.index - b.index)[0];
        return { status: 'conflict', selected: selected.source, markers: selected.parsed.markers, conflict: true, revision, persist: false };
      }
      const order = opts.sourceOrder || SOURCE_ORDER;
      const selected = newest.slice().sort((a, b) => b.parsed.updatedAt - a.parsed.updatedAt ||
        (order.indexOf(a.source) < 0 ? order.length : order.indexOf(a.source)) -
        (order.indexOf(b.source) < 0 ? order.length : order.indexOf(b.source)) || a.index - b.index)[0];
      return { status: 'selected', selected: selected.source, markers: selected.parsed.markers, conflict: false, kind: 'versioned', revision, persist: true };
    }
    const legacy = list.filter(item => classify(item.data, opts).kind === 'legacy');
    const find = source => legacy.find(item => item.source === source) || null;
    // Historical order: R2 then GitHub replacement; otherwise folder, GitHub, localStorage.
    const r2 = find('r2');
    const selected = r2 ? (find('github') || r2) : (find('folder') || find('github') || find('localStorage'));
    if (!selected) return { status: 'empty', selected: null, markers: {}, conflict: false };
    return { status: 'selected', selected: selected.source, markers: classify(selected.data, opts).markers, conflict: false, kind: 'legacy', persist: false };
  }
  root.ReadAlongMarkerResolver = Object.freeze({ classify, validMarkerMap, resolve });
})(typeof window !== 'undefined' ? window : globalThis);
