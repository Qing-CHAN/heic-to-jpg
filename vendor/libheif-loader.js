/* MyHeicGo engine loader — fetch with integrity check + CDN fallback.
   Replaces a plain <script> tag because long 2MB responses from
   GitHub Pages get truncated on some networks (GFW / proxies), which
   silently breaks the engine. */
(function () {
  'use strict';
  var SHIM_HEAD = 'var module={exports:{}};var exports=module.exports;';
  var SHIM_TAIL = ';window.libheifLocal=window.libheifLocal||module.exports;';

  var base = '/vendor/';
  try { base = new URL('.', document.currentScript.src).href; } catch (e) {}

  var SOURCES = [
    base + 'libheif-bundle.js?v=4',
    'https://cdn.jsdelivr.net/npm/libheif-js@1.23.5/libheif-wasm/libheif-bundle.js',
    'https://unpkg.com/libheif-js@1.23.5/libheif-wasm/libheif-bundle.js'
  ];
  var TIMEOUT_MS = 120000;

  function attempt(i) {
    if (i >= SOURCES.length) {
      console.error('[MyHeicGo] all engine sources failed');
      window.libheifFailed = true;
      return;
    }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
    fetch(SOURCES[i], ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var cl = +(r.headers.get('Content-Length') || 0);
        return r.arrayBuffer().then(function (buf) {
          if (cl && buf.byteLength !== cl) {
            throw new Error('truncated ' + buf.byteLength + '/' + cl);
          }
          return buf;
        });
      })
      .then(function (buf) {
        if (timer) clearTimeout(timer);
        var blob = new Blob([SHIM_HEAD, buf, SHIM_TAIL], { type: 'application/javascript' });
        var s = document.createElement('script');
        s.src = URL.createObjectURL(blob);
        s.onload = function () { URL.revokeObjectURL(s.src); };
        document.head.appendChild(s);
      })
      .catch(function (e) {
        if (timer) clearTimeout(timer);
        console.warn('[MyHeicGo] engine source failed:', SOURCES[i], e && (e.message || e));
        attempt(i + 1);
      });
  }

  window.__mhgLoadEngine = function () { attempt(0); };

  attempt(0);
})();
