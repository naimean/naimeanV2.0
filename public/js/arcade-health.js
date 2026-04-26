// public/js/arcade-health.js
// Arcade Runtime Health Check — diagnostics only, no emulator launch.
// All vanilla JS, no dependencies.
(function () {
  'use strict';

  var EJS_PATH        = '/assets/retroarch/';
  var SYSTEMS_URL     = '/assets/arcade/systems.json';
  var MANIFEST_URL    = '/assets/roms/manifest.json';
  var CORES_BASE      = '/assets/retroarch/cores/';

  var tbody = document.getElementById('health-tbody');
  var summary = document.getElementById('health-summary');

  var passCount = 0;
  var warnCount = 0;
  var failCount = 0;

  // ── Row helpers ─────────────────────────────────────────────────────────────

  function addRow(category, name, status, detail) {
    var tr = document.createElement('tr');
    tr.className = 'row-' + status.toLowerCase();

    var tdCat    = document.createElement('td'); tdCat.textContent    = category;
    var tdName   = document.createElement('td'); tdName.textContent   = name;
    var tdStatus = document.createElement('td');
    tdStatus.className = 'status-cell status-' + status.toLowerCase();
    tdStatus.textContent = status;
    var tdDetail = document.createElement('td'); tdDetail.textContent = detail || '';

    tr.appendChild(tdCat);
    tr.appendChild(tdName);
    tr.appendChild(tdStatus);
    tr.appendChild(tdDetail);
    tbody.appendChild(tr);

    if (status === 'PASS')      { passCount++; }
    else if (status === 'WARN') { warnCount++; }
    else                        { failCount++; }

    updateSummary();
    return tr;
  }

  function updateSummary() {
    summary.textContent =
      'PASS: ' + passCount + '  WARN: ' + warnCount + '  FAIL: ' + failCount;
    summary.className = failCount > 0 ? 'summary-fail'
      : warnCount > 0 ? 'summary-warn'
      : 'summary-pass';
  }

  // ── Fetch helpers ────────────────────────────────────────────────────────────

  // Attempt HEAD; fall back to GET with Range: bytes=0-0 if HEAD is blocked.
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

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return res.json();
    });
  }

  // ── Check functions ──────────────────────────────────────────────────────────

  function checkStaticAsset(category, label, url) {
    return probeUrl(url).then(function (res) {
      var ok = res.status === 200 || res.status === 206 || res.status === 304;
      var detail = 'HTTP ' + res.status;
      addRow(category, label, ok ? 'PASS' : 'FAIL', detail);
    }).catch(function (err) {
      addRow(category, label, 'FAIL', String(err));
    });
  }

  function checkCoreData(systemId, core) {
    var url = CORES_BASE + core + '-wasm.data';
    return probeUrl(url).then(function (res) {
      var ok = res.status === 200 || res.status === 206 || res.status === 304;
      var cl = res.headers.get('content-length') || '—';
      var etag = res.headers.get('etag') || '—';
      var detail = 'HTTP ' + res.status +
        '  size=' + cl +
        '  etag=' + etag;
      addRow('CORE', systemId + '  [' + core + ']', ok ? 'PASS' : 'FAIL', detail);
    }).catch(function (err) {
      addRow('CORE', systemId + '  [' + core + ']', 'FAIL', String(err));
    });
  }

  function checkRomUrl(system, romFile) {
    var url = '/assets/roms/' + system + '/' + encodeURIComponent(romFile);
    return probeUrl(url).then(function (res) {
      var ok = res.status === 200 || res.status === 206 || res.status === 304;
      var cl = res.headers.get('content-length') || '—';
      var detail = 'HTTP ' + res.status + '  size=' + cl;
      addRow('ROM', system + ' / ' + romFile, ok ? 'PASS' : 'WARN', detail);
    }).catch(function (err) {
      addRow('ROM', system + ' / ' + romFile, 'WARN', String(err));
    });
  }

  // ── Main ─────────────────────────────────────────────────────────────────────

  (async function main() {
    // 1. Static base assets
    await Promise.all([
      checkStaticAsset('BASE', 'loader.js',        EJS_PATH + 'loader.js'),
      checkStaticAsset('BASE', 'emulator.min.js',  EJS_PATH + 'emulator.min.js'),
      checkStaticAsset('BASE', 'emulator.min.css', EJS_PATH + 'emulator.min.css'),
    ]);

    // 2. JSON configs
    var systems = null;
    var manifest = null;

    try {
      systems = await fetchJSON(SYSTEMS_URL);
      addRow('CONFIG', 'systems.json', 'PASS', Object.keys(systems).length + ' systems');
    } catch (err) {
      addRow('CONFIG', 'systems.json', 'FAIL', String(err));
    }

    try {
      manifest = await fetchJSON(MANIFEST_URL);
      addRow('CONFIG', 'manifest.json', 'PASS', Object.keys(manifest).length + ' entries');
    } catch (err) {
      addRow('CONFIG', 'manifest.json', 'FAIL', String(err));
    }

    // 3. Per-system core checks
    if (systems) {
      var coreChecks = [];
      Object.keys(systems).forEach(function (systemId) {
        var cfg = systems[systemId];
        if (!cfg || typeof cfg.core !== 'string' || !cfg.core) {
          addRow('CORE', systemId, 'WARN', 'core is null — not yet configured');
          return;
        }
        coreChecks.push(checkCoreData(systemId, cfg.core));
      });
      await Promise.all(coreChecks);
    }

    // 4. Per-ROM checks
    if (manifest) {
      var romChecks = [];
      Object.keys(manifest).forEach(function (system) {
        var roms = manifest[system];
        if (!Array.isArray(roms) || roms.length === 0) { return; }
        roms.forEach(function (romFile) {
          if (romFile && typeof romFile === 'string') {
            romChecks.push(checkRomUrl(system, romFile));
          }
        });
      });
      await Promise.all(romChecks);
    }

    // Final summary line
    var doneLine = document.createElement('tr');
    doneLine.innerHTML = '<td colspan="4" class="done-line">— CHECK COMPLETE —</td>';
    tbody.appendChild(doneLine);
  }()).catch(function (err) {
    var errRow = document.createElement('tr');
    errRow.innerHTML = '<td colspan="4" class="status-fail">FATAL ERROR: ' +
      String(err).replace(/</g, '&lt;') + '</td>';
    tbody.appendChild(errRow);
    updateSummary();
  });
}());
