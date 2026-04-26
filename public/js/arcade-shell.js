// public/js/arcade-shell.js
// Persistent Arcade Shell — state-machine driven emulator environment.
// Exposes window.NaimeanArcade for external access.
// All vanilla JS, no dependencies.
(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────

  var EJS_PATH        = '/assets/retroarch/';
  var SYSTEMS_URL     = '/assets/arcade/systems.json';
  var MANIFEST_URL    = '/assets/roms/manifest.json';
  var CORES_BASE      = '/assets/retroarch/cores/';

  var BOOT_LINE_DELAY_MS  = 180;
  var TIMEOUT_WARN_10_MS  = 10000;
  var TIMEOUT_WARN_30_MS  = 30000;
  var TIMEOUT_FAIL_60_MS  = 60000;
  var MAX_DEBUG_LOG_LINES = 50;

  // ── State machine states ───────────────────────────────────────────────────

  var STATES = {
    IDLE:             'IDLE',
    BOOTING_SYSTEM:   'BOOTING_SYSTEM',
    PREFETCHING_CORE: 'PREFETCHING_CORE',
    CORE_READY:       'CORE_READY',
    ROM_PICKER:       'ROM_PICKER',
    LAUNCHING_ROM:    'LAUNCHING_ROM',
    RUNNING:          'RUNNING',
    ERROR:            'ERROR',
  };

  // ── Internal state ─────────────────────────────────────────────────────────

  var currentState     = STATES.IDLE;
  var selectedSystem   = null;   // { id, label, core, bootLines }
  var selectedRom      = null;   // { file, name }
  var systemsConfig    = null;
  var romManifest      = null;
  var timeoutHandles   = [];
  var loaderScript     = null;
  var debugLog         = [];
  var debugVisible     = false;

  // ── DOM refs ───────────────────────────────────────────────────────────────

  var elBarTitle     = document.getElementById('bar-title');
  var elBtnFs        = document.getElementById('btn-fs');
  var elBtnRestart   = document.getElementById('btn-restart');
  var elBtnBack      = document.getElementById('btn-back');
  var elBtnSys       = document.getElementById('btn-change-system');
  var elBtnDebug     = document.getElementById('btn-debug');
  var elTimeoutBanner = document.getElementById('timeout-banner');
  var elDebugPanel   = document.getElementById('debug-panel');
  var elDebugState   = document.getElementById('debug-state');
  var elDebugLogList = document.getElementById('debug-log-list');

  var screens = {
    system: document.getElementById('screen-system'),
    boot:   document.getElementById('screen-boot'),
    picker: document.getElementById('screen-picker'),
    game:   document.getElementById('screen-game'),
    error:  document.getElementById('screen-error'),
  };

  var elSystemGrid   = document.getElementById('system-grid');
  var elBootContent  = document.getElementById('boot-content');
  var elPickerHeader = document.getElementById('picker-header');
  var elRomList      = document.getElementById('rom-list');
  var elGameWrap     = document.getElementById('game-wrap');
  var elErrorTitle   = document.getElementById('error-title');
  var elErrorTable   = document.getElementById('error-table');
  var elErrorFix     = document.getElementById('error-fix');
  var elErrorRetry   = document.getElementById('error-retry-btn');

  // ── Debug / logging ────────────────────────────────────────────────────────

  function dbgLog(msg) {
    var ts = new Date().toISOString().slice(11, 23);
    debugLog.push('[' + ts + '] ' + msg);
    if (debugLog.length > MAX_DEBUG_LOG_LINES) {
      debugLog.shift();
    }
    renderDebugLog();
    console.log('[NaimeanArcade]', msg);
  }

  function renderDebugLog() {
    if (!elDebugLogList) { return; }
    elDebugLogList.innerHTML = '';
    debugLog.forEach(function (line) {
      var li = document.createElement('li');
      li.textContent = line;
      elDebugLogList.appendChild(li);
    });
    if (elDebugPanel && elDebugPanel.classList.contains('visible')) {
      elDebugPanel.scrollTop = elDebugPanel.scrollHeight;
    }
  }

  // ── State transitions ──────────────────────────────────────────────────────

  function setState(newState) {
    dbgLog('STATE ' + currentState + ' → ' + newState);
    currentState = newState;
    if (elDebugState) {
      elDebugState.textContent = 'STATE: ' + newState;
    }
  }

  // ── Screen switching ───────────────────────────────────────────────────────

  function showScreen(name) {
    Object.keys(screens).forEach(function (k) {
      if (screens[k]) {
        screens[k].classList.toggle('active', k === name);
      }
    });
  }

  // ── Bar helpers ────────────────────────────────────────────────────────────

  function setBarTitle(text) {
    if (elBarTitle) { elBarTitle.textContent = '\u25BA ' + text; }
    document.title = text + ' \u2013 ARCADE';
  }

  function setButtonVisibility(restart, back, sys) {
    if (elBtnRestart) { elBtnRestart.style.display = restart ? '' : 'none'; }
    if (elBtnBack)    { elBtnBack.style.display    = back    ? '' : 'none'; }
    if (elBtnSys)     { elBtnSys.style.display     = sys     ? '' : 'none'; }
  }

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  function fetchJSON(url) {
    return fetch(url, { cache: 'default' }).then(function (res) {
      if (!res.ok) { throw new Error('HTTP ' + res.status + ' loading ' + url); }
      return res.json();
    });
  }

  // HEAD probe with GET Range fallback
  function probeUrl(url) {
    return fetch(url, { method: 'HEAD', cache: 'no-store' }).then(function (res) {
      if (res.status === 405 || res.status === 501) {
        return fetch(url, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
          cache: 'no-store',
        });
      }
      return res;
    });
  }

  // Fully download a URL into the browser cache
  function warmUrl(url) {
    return fetch(url, { cache: 'default' }).then(function (res) {
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return res.arrayBuffer();
    });
  }

  // ── Asset warmup ───────────────────────────────────────────────────────────

  function warmBaseEmulatorAssets() {
    dbgLog('warming base EmulatorJS assets');
    var paths = [
      EJS_PATH + 'loader.js',
      EJS_PATH + 'emulator.min.js',
      EJS_PATH + 'emulator.min.css',
    ];
    return Promise.all(paths.map(function (p) {
      return fetch(p, { cache: 'default' }).then(function (res) {
        if (!res.ok) { throw new Error(p + ' HTTP ' + res.status); }
        return res.text();
      }).then(function () {
        dbgLog('warmed ' + p);
      }).catch(function (err) {
        dbgLog('WARN warm failed: ' + p + ' — ' + err.message);
      });
    }));
  }

  function preloadSystemCore(system) {
    if (!system || !system.core) {
      dbgLog('no core configured for ' + (system && system.id));
      return Promise.resolve({ cached: false, reason: 'no-core' });
    }
    var url = CORES_BASE + system.core + '-wasm.data';
    dbgLog('prefetching core ' + system.core + ' from ' + url);
    return warmUrl(url).then(function () {
      dbgLog('core ' + system.core + ' cached OK');
      return { cached: true };
    }).catch(function (err) {
      dbgLog('WARN core cache miss: ' + err.message);
      return { cached: false, reason: err.message };
    });
  }

  function verifyCoreAvailable(system) {
    if (!system || !system.core) {
      return Promise.resolve({ ok: false, reason: 'no-core' });
    }
    var url = CORES_BASE + system.core + '-wasm.data';
    return probeUrl(url).then(function (res) {
      var ok = res.status === 200 || res.status === 206 || res.status === 304;
      return { ok: ok, status: res.status, url: url };
    }).catch(function (err) {
      return { ok: false, reason: err.message, url: url };
    });
  }

  function verifyRomAvailable(system, romFile) {
    var url = '/assets/roms/' + system + '/' + encodeURIComponent(romFile);
    return probeUrl(url).then(function (res) {
      var ok = res.status === 200 || res.status === 206 || res.status === 304;
      return { ok: ok, status: res.status, url: url };
    }).catch(function (err) {
      return { ok: false, reason: err.message, url: url };
    });
  }

  // ── Boot animation ─────────────────────────────────────────────────────────

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function appendBootLine(text, extraClass) {
    var line = document.createElement('div');
    line.className = 'boot-line' + (extraClass ? ' ' + extraClass : '');
    line.textContent = text;
    if (elBootContent) {
      elBootContent.appendChild(line);
      elBootContent.scrollTop = elBootContent.scrollHeight;
    }
    return line;
  }

  async function runBootAnimation(system, corePreloadPromise) {
    if (elBootContent) { elBootContent.innerHTML = ''; }

    var bootLines = system.bootLines || ['** ' + system.label + ' **', 'LOADING...'];

    // Animate boot lines concurrently with core preload
    for (var i = 0; i < bootLines.length; i++) {
      await delay(BOOT_LINE_DELAY_MS);
      appendBootLine(bootLines[i], '');
    }

    // Wait for core preload and show result
    var preloadResult = await corePreloadPromise;
    if (preloadResult && preloadResult.cached) {
      appendBootLine('CORE CACHED OK.', 'boot-line-dim');
    } else if (system.core) {
      var reason = preloadResult && preloadResult.reason ? preloadResult.reason : 'unavailable';
      appendBootLine('CACHE MISS (' + reason + ') — CONTINUING', 'boot-line-dim');
    }

    await delay(BOOT_LINE_DELAY_MS);
    appendBootLine('CORE READY.', 'boot-line-ready');
    await delay(BOOT_LINE_DELAY_MS);
  }

  // ── Timeout handling ───────────────────────────────────────────────────────

  function clearTimeouts() {
    timeoutHandles.forEach(function (id) { clearTimeout(id); });
    timeoutHandles = [];
    if (elTimeoutBanner) {
      elTimeoutBanner.classList.remove('visible');
      elTimeoutBanner.textContent = '';
    }
  }

  function startLaunchTimeouts(onTimeout60) {
    clearTimeouts();
    timeoutHandles.push(setTimeout(function () {
      dbgLog('timeout 10s — still loading core');
      if (elTimeoutBanner) {
        elTimeoutBanner.textContent = 'Still loading core\u2026 (10 s)';
        elTimeoutBanner.classList.add('visible');
      }
    }, TIMEOUT_WARN_10_MS));

    timeoutHandles.push(setTimeout(function () {
      dbgLog('timeout 30s — core loading unusually long');
      if (elTimeoutBanner) {
        elTimeoutBanner.textContent = 'Core load taking unusually long\u2026 (30 s)';
      }
    }, TIMEOUT_WARN_30_MS));

    timeoutHandles.push(setTimeout(function () {
      dbgLog('timeout 60s — showing recoverable error');
      if (typeof onTimeout60 === 'function') { onTimeout60(); }
    }, TIMEOUT_FAIL_60_MS));
  }

  // ── EmulatorJS launch ──────────────────────────────────────────────────────

  function destroyEmulator() {
    clearTimeouts();
    if (loaderScript && loaderScript.parentNode) {
      loaderScript.parentNode.removeChild(loaderScript);
      loaderScript = null;
    }
    // Reset globals
    ['EJS_player','EJS_core','EJS_gameUrl','EJS_pathtodata',
     'EJS_startOnLoaded','EJS_onLoadState','EJS_onLoadError','EJS_emulator'].forEach(function (k) {
      try { delete window[k]; } catch (_) {}
    });
    if (elGameWrap) {
      // Clear and recreate #game element
      elGameWrap.innerHTML = '';
      var newGame = document.createElement('div');
      newGame.id = 'game';
      elGameWrap.appendChild(newGame);
    }
  }

  function launchEmulatorDOM(sys, romFile) {
    destroyEmulator();

    var gameEl = document.getElementById('game');
    if (!gameEl) {
      showError({
        title: 'LAUNCH ERROR',
        system: sys.id, core: sys.core || '(none)', rom: romFile,
        url: '', httpStatus: '',
        msg: '#game element missing after recreate',
        fix: 'Reload the page and try again.',
      });
      return;
    }

    var romUrl = '/assets/roms/' + sys.id + '/' + encodeURIComponent(romFile);

    window.EJS_player        = '#game';
    window.EJS_core          = sys.id;
    window.EJS_gameUrl       = romUrl;
    window.EJS_pathtodata    = EJS_PATH;
    window.EJS_startOnLoaded = true;

    window.EJS_onLoadError = function (e) {
      clearTimeouts();
      var msg = (e && e.error && e.error.message) || (e && e.message) || String(e) || 'Unknown error';
      dbgLog('EJS_onLoadError: ' + msg);
      showError(buildErrorContext(sys, romFile, romUrl, '', msg, classifyError(msg, sys, romFile)));
    };

    startLaunchTimeouts(function () {
      showError(buildErrorContext(sys, romFile, romUrl, '', 'Timed out after 60 seconds.', 'Core failed to load within 60 s. The .data file may be missing from R2 or the network is slow.'));
    });

    loaderScript = document.createElement('script');
    loaderScript.src = EJS_PATH + 'loader.js';
    loaderScript.onerror = function () {
      clearTimeouts();
      var msg = 'loader.js not found at ' + EJS_PATH;
      dbgLog(msg);
      showError(buildErrorContext(sys, romFile, romUrl, '', msg, 'EmulatorJS base files are missing from /assets/retroarch/. Re-run the download/upload scripts.'));
    };
    document.head.appendChild(loaderScript);

    setState(STATES.RUNNING);
    setBarTitle(romFile.replace(/\.[^.]+$/, '').toUpperCase());
    setButtonVisibility(true, false, true);
    showScreen('game');
  }

  // ── Error helpers ──────────────────────────────────────────────────────────

  function buildErrorContext(sys, romFile, url, httpStatus, msg, fix) {
    return {
      title: 'ARCADE ERROR',
      system:     sys ? sys.id : '—',
      core:       sys ? (sys.core || '(null)') : '—',
      rom:        romFile || '—',
      url:        url || '—',
      httpStatus: httpStatus || '—',
      msg:        msg || 'Unknown error',
      fix:        fix || 'Check the arcade health page: /arcade-health.html',
    };
  }

  function classifyError(msg, sys, romFile) {
    var m = msg.toLowerCase();
    if (!sys || !sys.core)           { return 'System core is not configured. Set a valid core in systems.json.'; }
    if (m.includes('wasm') || m.includes('eval')) {
      return 'Your browser may be blocking WebAssembly or eval(). Check CSP or browser settings.';
    }
    if (m.includes('html') || m.includes('text/html')) {
      return 'The core .data file URL returned HTML — the file is likely missing from R2 storage.';
    }
    if (m.includes('timeout') || m.includes('timed')) {
      return 'Core .data download timed out. Verify the file exists at ' + CORES_BASE + (sys && sys.core ? sys.core + '-wasm.data' : '');
    }
    if (!romFile)  { return 'No ROM file was selected or the ROM is missing from the manifest.'; }
    return 'Check /arcade-health.html for detailed diagnostics.';
  }

  function showError(ctx) {
    clearTimeouts();
    setState(STATES.ERROR);
    setBarTitle('ERROR');
    setButtonVisibility(false, false, true);

    if (elErrorTitle)  { elErrorTitle.textContent  = '\u26A0 ' + (ctx.title || 'ERROR'); }
    if (elErrorTable) {
      elErrorTable.innerHTML = [
        '<span class="error-key">System:    </span>' + escHtml(ctx.system),
        '<span class="error-key">Core:      </span>' + escHtml(ctx.core),
        '<span class="error-key">ROM:       </span>' + escHtml(ctx.rom),
        '<span class="error-key">URL:       </span>' + escHtml(ctx.url),
        '<span class="error-key">HTTP:      </span>' + escHtml(ctx.httpStatus),
        '<span class="error-key">Message:   </span>' + escHtml(ctx.msg),
      ].join('\n');
    }
    if (elErrorFix)    { elErrorFix.textContent    = '\u25B6 ' + (ctx.fix || ''); }
    if (elErrorRetry) {
      elErrorRetry.onclick = function () {
        if (selectedSystem && selectedRom) {
          launchRom(selectedSystem, selectedRom.file);
        } else if (selectedSystem) {
          goToRomPicker(selectedSystem);
        } else {
          goToSystemPicker();
        }
      };
    }
    showScreen('error');
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Navigation flows ───────────────────────────────────────────────────────

  function goToSystemPicker() {
    destroyEmulator();
    setState(STATES.IDLE);
    setBarTitle('ARCADE');
    setButtonVisibility(false, false, false);
    selectedSystem = null;
    selectedRom    = null;
    renderSystemPicker();
    showScreen('system');
  }

  function renderSystemPicker() {
    if (!elSystemGrid) { return; }
    elSystemGrid.innerHTML = '';
    if (!systemsConfig) { return; }
    Object.keys(systemsConfig).forEach(function (id) {
      var cfg = systemsConfig[id];
      var roms = romManifest && Array.isArray(romManifest[id]) ? romManifest[id] : [];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'system-btn';
      var labelEl = document.createElement('span');
      labelEl.className = 'sys-label';
      labelEl.textContent = cfg.label || id.toUpperCase();
      var metaEl = document.createElement('span');
      metaEl.className = 'sys-meta';
      var coreText = cfg.core ? cfg.core : 'no core';
      var romCount = roms.filter(function(r){ return r && typeof r === 'string'; }).length;
      metaEl.textContent = coreText + (romCount ? '  \u2022  ' + romCount + ' ROM' + (romCount !== 1 ? 'S' : '') : '');
      btn.appendChild(labelEl);
      btn.appendChild(metaEl);
      btn.addEventListener('click', function () { startSystem(id); });
      elSystemGrid.appendChild(btn);
    });
  }

  async function startSystem(systemId) {
    var cfg = systemsConfig && systemsConfig[systemId];
    if (!cfg) {
      dbgLog('unknown system: ' + systemId);
      return;
    }
    selectedSystem = {
      id:        systemId,
      label:     cfg.label || systemId.toUpperCase(),
      core:      typeof cfg.core === 'string' && cfg.core ? cfg.core : null,
      bootLines: Array.isArray(cfg.bootLines) ? cfg.bootLines : [],
    };
    selectedRom = null;

    setState(STATES.BOOTING_SYSTEM);
    setBarTitle(selectedSystem.label);
    setButtonVisibility(false, true, false);
    showScreen('boot');

    // Start core prefetch immediately; run boot animation in parallel
    setState(STATES.PREFETCHING_CORE);
    var corePreloadPromise = preloadSystemCore(selectedSystem);

    await runBootAnimation(selectedSystem, corePreloadPromise);

    setState(STATES.CORE_READY);
    await goToRomPicker(selectedSystem);
  }

  async function goToRomPicker(system) {
    setState(STATES.ROM_PICKER);
    setBarTitle(system.label + ' \u2014 SELECT ROM');
    setButtonVisibility(false, true, false);

    var roms = [];
    if (romManifest && Array.isArray(romManifest[system.id])) {
      roms = romManifest[system.id].filter(function (r) { return r && typeof r === 'string'; });
    }

    if (elPickerHeader) {
      elPickerHeader.textContent = '\u25BA ' + system.label + ' \u2014 SELECT ROM';
    }
    if (elRomList) {
      elRomList.innerHTML = '';
      if (roms.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'rom-empty';
        empty.textContent = 'NO ROMS AVAILABLE FOR THIS SYSTEM.';
        elRomList.appendChild(empty);
      } else {
        roms.forEach(function (romFile) {
          var displayName = romFile.replace(/\.[^.]+$/, '');
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'rom-item';
          btn.textContent = displayName;
          btn.addEventListener('click', function () { launchRom(system, romFile); });
          elRomList.appendChild(btn);
        });
      }
    }
    showScreen('picker');
  }

  async function launchRom(system, romFile) {
    selectedRom = { file: romFile, name: romFile.replace(/\.[^.]+$/, '') };
    setState(STATES.LAUNCHING_ROM);
    dbgLog('launching ' + system.id + ' / ' + romFile);

    // Verify ROM availability
    var romCheck = await verifyRomAvailable(system.id, romFile);
    if (!romCheck.ok) {
      showError(buildErrorContext(system, romFile, romCheck.url, String(romCheck.status || ''),
        'ROM not found (HTTP ' + (romCheck.status || romCheck.reason || '?') + ')',
        'Check that the ROM file exists under public/assets/roms/' + system.id + '/'));
      return;
    }

    launchEmulatorDOM(system, romFile);
  }

  // ── Button handlers ────────────────────────────────────────────────────────

  if (elBtnBack) {
    elBtnBack.addEventListener('click', function () {
      if (currentState === STATES.RUNNING || currentState === STATES.ERROR) {
        destroyEmulator();
        if (selectedSystem) {
          goToRomPicker(selectedSystem);
        } else {
          goToSystemPicker();
        }
      } else if (currentState === STATES.ROM_PICKER || currentState === STATES.CORE_READY) {
        goToSystemPicker();
      } else {
        goToSystemPicker();
      }
    });
  }

  if (elBtnSys) {
    elBtnSys.addEventListener('click', function () {
      destroyEmulator();
      goToSystemPicker();
    });
  }

  if (elBtnRestart) {
    elBtnRestart.addEventListener('click', function () {
      if (window.EJS_emulator && typeof window.EJS_emulator.restart === 'function') {
        window.EJS_emulator.restart();
      } else if (selectedSystem && selectedRom) {
        launchRom(selectedSystem, selectedRom.file);
      }
    });
  }

  if (elBtnFs) {
    elBtnFs.addEventListener('click', function () {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(function () {});
      } else {
        document.documentElement.requestFullscreen().catch(function () {});
      }
    });
    document.addEventListener('fullscreenchange', function () {
      if (elBtnFs) {
        elBtnFs.textContent = document.fullscreenElement ? 'EXIT FS' : 'FULLSCREEN';
      }
    });
  }

  if (elBtnDebug) {
    elBtnDebug.addEventListener('click', function () {
      debugVisible = !debugVisible;
      if (elDebugPanel) {
        elDebugPanel.classList.toggle('visible', debugVisible);
      }
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !document.fullscreenElement) {
      if (currentState === STATES.RUNNING) {
        destroyEmulator();
        if (selectedSystem) { goToRomPicker(selectedSystem); }
      }
    }
  });

  // ── Public API ─────────────────────────────────────────────────────────────

  window.NaimeanArcade = {
    get state() { return currentState; },
    log: function (msg) { dbgLog(String(msg)); },
    reset: function () { goToSystemPicker(); },
    launch: function (systemId, romFile) {
      if (!systemsConfig || !systemsConfig[systemId]) {
        dbgLog('launch(): unknown system ' + systemId);
        return;
      }
      var cfg = systemsConfig[systemId];
      selectedSystem = {
        id:        systemId,
        label:     cfg.label || systemId.toUpperCase(),
        core:      typeof cfg.core === 'string' && cfg.core ? cfg.core : null,
        bootLines: Array.isArray(cfg.bootLines) ? cfg.bootLines : [],
      };
      launchRom(selectedSystem, romFile);
    },
  };

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  (async function boot() {
    dbgLog('arcade-shell boot');
    setBarTitle('ARCADE');
    setButtonVisibility(false, false, false);
    showScreen('system');

    // Warm base EmulatorJS assets in the background
    warmBaseEmulatorAssets();

    // Load configs
    try {
      systemsConfig = await fetchJSON(SYSTEMS_URL);
      dbgLog('systems.json loaded — ' + Object.keys(systemsConfig).length + ' systems');
    } catch (err) {
      dbgLog('WARN systems.json failed: ' + err.message);
    }

    try {
      romManifest = await fetchJSON(MANIFEST_URL);
      dbgLog('manifest.json loaded');
    } catch (err) {
      dbgLog('WARN manifest.json failed: ' + err.message);
    }

    renderSystemPicker();
  }()).catch(function (err) {
    dbgLog('FATAL boot error: ' + (err && err.message ? err.message : String(err)));
  });
}());
