// public/arcade-preloader.js
// Boot animation + core preload for the arcade player.
// Exposes window.ArcadePreloader = { run(opts) }.
// All code is vanilla JS with no dependencies.
(function () {
  'use strict';

  var BOOT_LINE_DELAY_MS = 200;
  var PRELOAD_TIMEOUT_MS = 30000;

  function appendBootLine(el, text, extraClass) {
    if (!el) { return null; }
    var line = document.createElement('div');
    line.className = 'ap-boot-line' + (extraClass ? ' ' + extraClass : '');
    line.textContent = text;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
    return line;
  }

  function resolveAfter(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function fetchJSON(path) {
    return fetch(path, { cache: 'default' }).then(function (res) {
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return res.json();
    });
  }

  // Fetch the file and fully read the response body so that the browser HTTP
  // cache stores the content.  EmulatorJS will then get a cache hit when it
  // later requests the same URL.
  function preloadCoreData(url) {
    return new Promise(function (resolve, reject) {
      var controller = null;
      try { controller = new AbortController(); } catch (_) {}
      var timeoutId = setTimeout(function () {
        if (controller) { controller.abort(); }
        reject(new Error('timeout'));
      }, PRELOAD_TIMEOUT_MS);

      fetch(url, {
        method: 'GET',
        cache: 'default',
        signal: controller ? controller.signal : undefined,
      }).then(function (res) {
        clearTimeout(timeoutId);
        if (!res.ok) {
          reject(new Error('HTTP ' + res.status));
          return null;
        }
        // Drain the body so the browser caches the full response.
        return res.arrayBuffer().then(function () { resolve(); });
      }).catch(function (err) {
        clearTimeout(timeoutId);
        reject(err);
      });
    });
  }

  // Run the arcade boot animation and core preload for the given system.
  //
  // opts:
  //   system         (string)  — EJS system key, e.g. "nes"
  //   systemsJsonPath (string) — URL for systems.json
  //   coresBasePath  (string)  — prefix for core .data files
  //   bootEl         (Element) — container to append boot lines into
  //
  // Returns a Promise that resolves to { label } once both the animation and
  // any applicable preload have finished.
  // Rejects only for programming errors; network/fetch failures are reported
  // via boot-line messages and then resolve normally.
  function run(opts) {
    var system = opts.system || '';
    var systemsJsonPath = opts.systemsJsonPath || '/assets/arcade/systems.json';
    var coresBasePath   = opts.coresBasePath   || '/assets/retroarch/cores/';
    var bootEl          = opts.bootEl          || null;

    return new Promise(function (resolve) {
      (async function () {
        // ── Step 1: fetch systems.json ───────────────────────────────────────
        var systemsConfig = null;
        try {
          systemsConfig = await fetchJSON(systemsJsonPath);
        } catch (_) {
          appendBootLine(bootEl, 'SYSTEMS CONFIG UNAVAILABLE — SKIPPING', 'ap-boot-status');
        }

        var config    = systemsConfig && systemsConfig[system] ? systemsConfig[system] : null;
        var label     = config && config.label ? config.label : system.toUpperCase();
        var core      = config && typeof config.core === 'string' && config.core ? config.core : null;
        var rawLines  = config && Array.isArray(config.bootLines) && config.bootLines.length
          ? config.bootLines
          : ['** ' + label + ' **', 'LOADING CORE...'];

        // ── Step 2: start core preload immediately (in background) ───────────
        var preloadDone    = false;
        var preloadSuccess = false;
        var preloadError   = null;
        var preloadPromise = null;

        if (core) {
          var coreUrl = coresBasePath + core + '-wasm.data';
          preloadPromise = preloadCoreData(coreUrl).then(function () {
            preloadDone    = true;
            preloadSuccess = true;
          }).catch(function (err) {
            preloadDone    = true;
            preloadError   = err;
          });
        }

        // ── Step 3: boot animation (runs concurrently with preload) ──────────
        for (var i = 0; i < rawLines.length; i++) {
          await resolveAfter(BOOT_LINE_DELAY_MS);
          appendBootLine(bootEl, rawLines[i], '');
        }

        // ── Step 4: wait for preload to finish; show result ──────────────────
        if (core && preloadPromise) {
          var statusLine;
          if (!preloadDone) {
            statusLine = appendBootLine(bootEl, 'CACHING ' + core.toUpperCase() + ' CORE...', 'ap-boot-status');
            await preloadPromise;
          }

          if (preloadSuccess) {
            var okText = 'CACHE: ' + core.toUpperCase() + ' CORE OK';
            if (statusLine) {
              statusLine.textContent = okText;
            } else {
              appendBootLine(bootEl, okText, 'ap-boot-status');
            }
          } else {
            var errDetail = preloadError && preloadError.name === 'AbortError'
              ? 'timeout'
              : (preloadError && preloadError.message ? preloadError.message : 'unavailable');
            var missText = 'CACHE: ' + core.toUpperCase() + ' MISS (' + errDetail + ')';
            if (statusLine) {
              statusLine.textContent = missText;
              statusLine.className = 'ap-boot-line ap-boot-status';
            } else {
              appendBootLine(bootEl, missText, 'ap-boot-status');
            }
            appendBootLine(bootEl, 'CONTINUING WITHOUT CACHE', 'ap-boot-status');
          }
        }

        await resolveAfter(BOOT_LINE_DELAY_MS);
        appendBootLine(bootEl, 'READY.', 'ap-boot-ready');

        resolve({ label: label });
      }()).catch(function (err) {
        // Unexpected error in the async flow — surface it and still resolve.
        appendBootLine(bootEl, 'PRELOADER ERROR: ' + (err && err.message ? err.message : String(err)), 'ap-boot-error');
        resolve({ label: system.toUpperCase() });
      });
    });
  }

  window.ArcadePreloader = { run: run };
}());
