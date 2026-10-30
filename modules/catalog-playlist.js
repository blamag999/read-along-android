/* Pure catalog and playlist domain logic. No DOM, storage, network or app state. */
(function (root) {
  'use strict';

  function getBookUniqueKey(pdfName, audioName) {
    const name = pdfName || audioName || 'unnamed';
    return name.toLowerCase()
      .replace(/\.[^/.]+$/, '')
      .replace(/^[xX]22/g, '')
      .replace(/[_\-\s,\.]+/g, '_')
      .trim();
  }

  function normalizeStoryTitle(filename) {
    if (!filename) return '';
    return filename
      .replace(/\.[^/.]+$/, '')
      .replace(/^[xX]22/g, '')
      .replace(/[_\-]+/g, ' ')
      .replace(/\bread[\s_-]*along\b/gi, '')
      .replace(/\bbook\b/gi, '')
      .replace(/\bside[\s_-]*[0-9]+\b/gi, '')
      .replace(/\bpart[\s_-]*[0-9]+\b/gi, '')
      .replace(/[,\.]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function mapRemoteCatalog(data, options) {
    if (!data || !Array.isArray(data.books)) {
      throw new Error('books.json không đúng cấu trúc { books: [...] }.');
    }
    const isAllowedUrl = options && options.isAllowedUrl;
    const fileNameFromUrl = options && options.fileNameFromUrl;
    if (typeof isAllowedUrl !== 'function' || typeof fileNameFromUrl !== 'function') {
      throw new Error('Thiếu bộ kiểm tra URL hoặc bộ lấy tên tệp.');
    }

    const toAsset = (value, fallbackName) => {
      if (typeof value === 'string') {
        if (!isAllowedUrl(value)) return null;
        return { name: fileNameFromUrl(value, fallbackName), url: value, key: '' };
      }
      if (value && typeof value === 'object' && isAllowedUrl(value.url)) {
        return {
          name: String(value.name || fileNameFromUrl(value.url, fallbackName)),
          url: value.url,
          key: value.key || ''
        };
      }
      return null;
    };

    return data.books.map(item => {
      if (!item || typeof item !== 'object') return null;
      const pdf = toAsset(item.pdf, 'book.pdf');
      const audios = (Array.isArray(item.audios) ? item.audios : [])
        .map(audio => toAsset(audio, 'audio.mp3'))
        .filter(Boolean)
        .map(audio => ({ ...audio, partLabel: null }));
      const json = toAsset(item.sync || item.json, 'sync.json');
      if (!pdf && !audios.length) return null;
      return {
        id: String(item.id || (pdf ? getBookUniqueKey(pdf.name) : getBookUniqueKey(audios[0].name))),
        title: String(item.title || (pdf ? normalizeStoryTitle(pdf.name) : normalizeStoryTitle(audios[0].name))),
        pdf,
        audios,
        json,
        coverUrl: '',
        source: 'r2-books-json'
      };
    }).filter(Boolean);
  }

  function parsePartLabel(filename) {
    const match = filename.match(/part[_\s-]*(\d+)|side[_\s-]*([ab])|disc[_\s-]*(\d+)|\b(\d+)\s*of\s*\d+/i);
    if (!match) return null;
    if (match[1]) return 'Phần ' + match[1];
    if (match[2]) return 'Mặt ' + match[2].toUpperCase();
    if (match[3]) return 'Đĩa ' + match[3];
    return 'Phần ' + match[4];
  }

  function buildPlaylistFromFiles(rawItems) {
    const groups = Object.create(null);
    const jsonItems = [];
    (Array.isArray(rawItems) ? rawItems : []).forEach(item => {
      if (!item || typeof item.name !== 'string') return;
      if (item.type === 'json') {
        jsonItems.push(item);
        return;
      }
      if (item.type !== 'pdf' && item.type !== 'audio') return;
      const title = normalizeStoryTitle(item.name);
      const key = title.toLowerCase().replace(/\s+/g, '_');
      if (!groups[key]) {
        groups[key] = {
          id: key,
          title: title.charAt(0).toUpperCase() + title.slice(1),
          pdf: null,
          audios: [],
          json: null
        };
      }
      if (item.type === 'pdf') groups[key].pdf = item;
      else groups[key].audios.push({ ...item, partLabel: item.partLabel || parsePartLabel(item.name) });
    });

    jsonItems.forEach(item => {
      const normalized = normalizeStoryTitle(item.name).toLowerCase().replace(/\s+/g, '_');
      if (groups[normalized]) {
        groups[normalized].json = item;
        return;
      }
      for (const key of Object.keys(groups)) {
        if (normalized && (normalized.includes(key) || key.includes(normalized))) {
          groups[key].json = item;
          return;
        }
      }
    });

    const stories = Object.values(groups).filter(story => story.pdf || story.audios.length > 0);
    stories.forEach(story => {
      story.audios.sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }));
      if (story.audios.length > 1) {
        story.audios.forEach((audio, index) => {
          if (!audio.partLabel) audio.partLabel = 'Phần ' + (index + 1);
        });
      }
    });
    return stories.sort((a, b) =>
      a.title.localeCompare(b.title, 'vi', { numeric: true })
    );
  }

  function filterPlaylist(stories, options) {
    const query = String(options && options.query || '').toLowerCase().trim();
    const filter = options && options.filter || 'all';
    const favorites = new Set(Array.isArray(options && options.favorites) ? options.favorites : []);
    return (Array.isArray(stories) ? stories : []).filter(story => {
      const title = String(story.title || '').toLowerCase();
      const pdfName = story.pdf ? String(story.pdf.name || '').toLowerCase() : '';
      const audios = Array.isArray(story.audios) ? story.audios : [];
      const matchQuery = !query || title.includes(query) || pdfName.includes(query) ||
        audios.some(audio => String(audio.name || '').toLowerCase().includes(query));
      if (!matchQuery) return false;
      if (filter === 'favorites') return favorites.has(story.id);
      if (filter === 'paired') return Boolean(story.pdf && audios.length > 0);
      if (filter === 'pdf') return Boolean(story.pdf);
      if (filter === 'mp3') return audios.length > 0;
      return true;
    }).sort((a, b) =>
      String(a.title || '').localeCompare(String(b.title || ''), 'vi', { sensitivity: 'base', numeric: true })
    );
  }

  root.ReadAlongCatalogPlaylist = Object.freeze({
    getBookUniqueKey,
    normalizeStoryTitle,
    mapRemoteCatalog,
    buildPlaylistFromFiles,
    filterPlaylist
  });
})(window);
