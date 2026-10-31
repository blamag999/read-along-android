'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TOP_LEVEL = new Set([
  'schemaVersion', 'configVersion', 'issuedAt', 'expiresAt',
  'features', 'readerDefaults', 'announcements'
]);
const FEATURE_KEYS = new Set([
  'showReadingStats', 'showAnnouncements', 'enableOnlineCatalog'
]);
const DEFAULT_RULES = {
  pageTurnMode: value => ['next', 'markers', 'off'].includes(value),
  viewMode: value => ['fit-height', 'fit-width', 'two-pages'].includes(value),
  autoSeekAudio: value => typeof value === 'boolean'
};

function isDateTime(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate() ||
      Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 ||
      (offsetHour !== undefined && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))) return false;
  return Number.isFinite(Date.parse(value));
}

function validateRemoteConfig(value, options = {}) {
  const errors = [];
  const add = message => errors.push(message);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, errors: ['Remote config must be a JSON object'] };
  }

  for (const key of Object.keys(value)) if (!TOP_LEVEL.has(key)) add('Unknown top-level field: ' + key);
  if (value.schemaVersion !== 1) add('schemaVersion must equal 1');
  if (!Number.isInteger(value.configVersion) || value.configVersion < 1) add('configVersion must be an integer >= 1');
  if (!isDateTime(value.issuedAt)) add('issuedAt must be a valid ISO-8601 date-time with timezone');
  if (value.expiresAt !== undefined && !isDateTime(value.expiresAt)) add('expiresAt must be a valid ISO-8601 date-time with timezone');
  if (isDateTime(value.issuedAt) && isDateTime(value.expiresAt) && Date.parse(value.expiresAt) <= Date.parse(value.issuedAt)) {
    add('expiresAt must be later than issuedAt');
  }
  if (options.now !== undefined && isDateTime(value.expiresAt) && Date.parse(value.expiresAt) <= options.now) {
    add('Remote config has expired');
  }

  if (!value.features || typeof value.features !== 'object' || Array.isArray(value.features)) {
    add('features must be an object');
  } else {
    for (const [key, flag] of Object.entries(value.features)) {
      if (!FEATURE_KEYS.has(key)) add('Unknown feature flag: ' + key);
      if (typeof flag !== 'boolean') add('Feature flag must be boolean: ' + key);
    }
  }

  if (!value.readerDefaults || typeof value.readerDefaults !== 'object' || Array.isArray(value.readerDefaults)) {
    add('readerDefaults must be an object');
  } else {
    for (const [key, setting] of Object.entries(value.readerDefaults)) {
      if (!DEFAULT_RULES[key]) add('Unknown reader default: ' + key);
      else if (!DEFAULT_RULES[key](setting)) add('Invalid reader default: ' + key);
    }
  }

  if (!Array.isArray(value.announcements) || value.announcements.length > 10) {
    add('announcements must be an array with at most 10 items');
  } else {
    const ids = new Set();
    for (const item of value.announcements) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        add('Each announcement must be an object');
        continue;
      }
      for (const key of Object.keys(item)) if (!['id', 'text', 'level'].includes(key)) add('Unknown announcement field: ' + key);
      if (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 80) add('Announcement id must contain 1–80 characters');
      else if (ids.has(item.id)) add('Announcement ids must be unique: ' + item.id);
      else ids.add(item.id);
      if (typeof item.text !== 'string' || !item.text.trim() || item.text.length > 500) add('Announcement text must contain 1–500 characters');
      if (item.level !== undefined && !['info', 'warning'].includes(item.level)) add('Announcement level must be info or warning');
    }
  }
  return { valid: errors.length === 0, errors };
}

if (require.main === module) {
  const file = process.argv[2] || path.join(__dirname, '..', 'admin', 'public', 'remote-config.json');
  let config;
  try { config = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    console.error('Remote Config JSON cannot be read: ' + error.message);
    process.exitCode = 1;
  }
  if (config !== undefined) {
    const result = validateRemoteConfig(config);
    if (!result.valid) {
      for (const error of result.errors) console.error('Remote Config: ' + error);
      process.exitCode = 1;
    } else {
      console.log('Remote Config contract valid: ' + file);
    }
  }
}

module.exports = { validateRemoteConfig };
