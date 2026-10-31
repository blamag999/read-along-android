/* Start Remote Config fetch without blocking reader startup or applying settings. */
(function (root) {
  'use strict';
  const service = root.ReadAlongRemoteConfig;
  if (!service || typeof service.createClient !== 'function') return;
  const client = service.createClient();
  root.ReadAlongRemoteConfigReady = client.load().then(result => {
    root.ReadAlongRemoteConfigState = result;
    return result;
  }).catch(error => {
    const result = { config: client.getDefaults(), source: 'default', error: error && error.message ? error.message : 'Remote Config unavailable' };
    root.ReadAlongRemoteConfigState = result;
    return result;
  });
})(typeof window !== 'undefined' ? window : globalThis);
