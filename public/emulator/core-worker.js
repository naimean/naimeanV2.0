// Emulator Core Preload Worker
// Fetches emulator core .data files and caches them in IndexedDB.
// Communicates via the CORE_PROGRESS / CORE_READY / CORE_ERROR message protocol.

'use strict';

// ── IndexedDB core cache ──────────────────────────────────────────────────────

var IDB_NAME    = 'emulator-cores-v1';
var IDB_VERSION = 1;
var IDB_STORE   = 'cores';
var CORES_BASE  = '/assets/retroarch/cores/';

var _db        = null;
var coreStatus = new Map(); // system → 'loading' | 'ready' | 'error'

function openDB() {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = function (e) { e.target.result.createObjectStore(IDB_STORE); };
    req.onsuccess       = function (e) { resolve(e.target.result); };
    req.onerror         = function (e) { reject(e.target.error); };
  });
}

function getDB() {
  if (_db) return Promise.resolve(_db);
  return openDB().then(function (db) { _db = db; return db; });
}

function idbGet(key) {
  return getDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      var req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
      req.onsuccess = function (e) { resolve(e.target.result || null); };
      req.onerror   = function (e) { reject(e.target.error); };
    });
  });
}

function idbPut(key, value) {
  return getDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      var req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(value, key);
      req.onsuccess = function ()    { resolve(); };
      req.onerror   = function (e) { reject(e.target.error); };
    });
  });
}

// ── Core preloader ────────────────────────────────────────────────────────────

function emit(type, system, progress, message) {
  self.postMessage({ type: type, system: system, progress: progress, message: message });
}

async function preloadCore(system) {
  // Already in memory — re-send CORE_READY immediately.
  if (coreStatus.get(system) === 'ready') {
    emit('CORE_READY', system, 1, 'Core ready');
    return;
  }
  // Already loading — let the in-flight request finish.
  if (coreStatus.get(system) === 'loading') return;

  coreStatus.set(system, 'loading');

  try {
    emit('CORE_PROGRESS', system, 0.05, 'Checking local cache\u2026');

    var cached = await idbGet(system);
    if (cached) {
      coreStatus.set(system, 'ready');
      emit('CORE_PROGRESS', system, 0.9, 'Loaded from cache');
      // Small pause so the animation has time to reach 90% before jumping to ready.
      await new Promise(function (r) { setTimeout(r, 200); });
      emit('CORE_READY', system, 1, 'Core ready');
      return;
    }

    var url = CORES_BASE + system + '-wasm.data';
    emit('CORE_PROGRESS', system, 0.1, 'Fetching core binary\u2026');

    var resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' \u2014 could not fetch core');

    var total    = parseInt(resp.headers.get('content-length') || '0', 10);
    var reader   = resp.body.getReader();
    var chunks   = [];
    var received = 0;

    for (;;) {
      var chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(chunk.value);
      received += chunk.value.length;
      var pct = total > 0 ? 0.1 + (received / total) * 0.72 : 0.45;
      var kb  = Math.round(received / 1024);
      emit('CORE_PROGRESS', system, pct,
        'Downloading\u2026 ' + kb + (total > 0 ? ' / ' + Math.round(total / 1024) + ' KB' : ' KB'));
    }

    // Assemble single ArrayBuffer from chunks.
    var full = new Uint8Array(received);
    var off  = 0;
    for (var i = 0; i < chunks.length; i++) { full.set(chunks[i], off); off += chunks[i].length; }

    emit('CORE_PROGRESS', system, 0.85, 'Caching to IndexedDB\u2026');
    try { await idbPut(system, full.buffer); } catch (idbErr) {
      // Non-fatal: private browsing mode or storage quota exceeded.
      // The core stays in the in-memory pool for this session.
      console.warn('[core-worker] IndexedDB write failed for', system, '-', idbErr && idbErr.message);
    }

    coreStatus.set(system, 'ready');
    emit('CORE_READY', system, 1, 'Core ready');

  } catch (err) {
    coreStatus.set(system, 'error');
    self.postMessage({ type: 'CORE_ERROR', system: system, message: err.message });
  }
}

// ── Message dispatcher ────────────────────────────────────────────────────────

self.onmessage = function (e) {
  var msg = e.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'PRELOAD_CORE':
      preloadCore(msg.system);
      break;

    case 'GET_CORE_STATUS':
      self.postMessage({
        type:   'CORE_STATUS',
        system: msg.system,
        status: coreStatus.get(msg.system) || 'idle'
      });
      break;
  }
};
