// public/js/arcade-health.js
// Arcade Runtime Health Check — diagnostics only, no emulator launch.
// All vanilla JS, no dependencies.
(function () {
  'use strict';

  var EJS_PATH        = '/assets/retroarch/';
  var SYSTEMS_URL     = '/assets/arcade/systems.json';
  var MANIFEST_URL    = '/assets/roms/manifest.json';
  var CORES_BASE      = '/assets/retroarch/cores/';

  // NES-specific core and ROM files to test in detail.
  // EJS 4.x bundles everything into a single {core}-wasm.data file; there are
  // no separate fceumm_libretro.js/.wasm files at runtime.
  var NES_CORE_FILE = 'fceumm-wasm.data';
  var NES_ROMS = [
    { label: 'Super Mario Bros 2', path: '/assets/roms/nes/Super%20Mario%20Bros%202%20%28U%29%20%28PRG%201%29.nes' },
    { label: 'Legend of Zelda (zip)', path: '/assets/roms/nes/Legend%20of%20Zelda%2C%20The%20%28USA%29%20%28Rev%201%29.zip' },
  ];

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

  // ── Detailed NES diagnostic section ─────────────────────────────────────────
  // Injected above the general health table.

  function buildNesSection() {
    var wrap = document.querySelector('.table-wrap');
    if (!wrap) { return; }

    var section = document.createElement('div');
    section.style.cssText = 'padding: 12px 0 4px; border-bottom: 1px solid #2a2a2a; margin-bottom: 4px;';
    section.innerHTML =
      '<div style="padding: 6px 14px 8px; font-size: 12px; letter-spacing: 0.1em; color: rgba(142,240,178,0.7);">' +
      '&#9658; NES CORE DIAGNOSTIC (fceumm / fceumm-wasm.data)</div>' +
      '<div style="overflow-x:auto;"><table id="nes-detail-table" style="width:100%;border-collapse:collapse;">' +
      '<thead><tr>' +
      '<th style="text-align:left;padding:4px 14px;color:rgba(142,240,178,0.5);font-size:11px;border-bottom:1px solid #2a2a2a;">URL</th>' +
      '<th style="text-align:left;padding:4px 14px;color:rgba(142,240,178,0.5);font-size:11px;border-bottom:1px solid #2a2a2a;">HTTP</th>' +
      '<th style="text-align:left;padding:4px 14px;color:rgba(142,240,178,0.5);font-size:11px;border-bottom:1px solid #2a2a2a;">CONTENT-TYPE</th>' +
      '<th style="text-align:left;padding:4px 14px;color:rgba(142,240,178,0.5);font-size:11px;border-bottom:1px solid #2a2a2a;">CONTENT-LENGTH</th>' +
      '<th style="text-align:left;padding:4px 14px;color:rgba(142,240,178,0.5);font-size:11px;border-bottom:1px solid #2a2a2a;">CACHE-CONTROL</th>' +
      '<th style="text-align:left;padding:4px 14px;color:rgba(142,240,178,0.5);font-size:11px;border-bottom:1px solid #2a2a2a;">ETAG</th>' +
      '<th style="text-align:left;padding:4px 14px;color:rgba(142,240,178,0.5);font-size:11px;border-bottom:1px solid #2a2a2a;">TIME (ms)</th>' +
      '<th style="text-align:left;padding:4px 14px;color:rgba(142,240,178,0.5);font-size:11px;border-bottom:1px solid #2a2a2a;">RESULT</th>' +
      '</tr></thead>' +
      '<tbody id="nes-detail-tbody"></tbody>' +
      '</table></div>';

    wrap.parentNode.insertBefore(section, wrap);
  }

  function addNesDetailRow(url, httpStatus, ct, cl, cc, etag, timeMs, pass, fail, warn) {
    var nteBody = document.getElementById('nes-detail-tbody');
    if (!nteBody) { return; }

    var result  = fail  ? 'FAIL' : warn ? 'WARN' : 'PASS';
    var color   = fail  ? '#f66' : warn ? '#f5c842' : '#8ef0b2';
    var rowStyle = 'border-bottom:1px solid rgba(142,240,178,0.06);font-size:12px;';
    var tdStyle  = 'padding:5px 14px;white-space:pre;';

    var tr = document.createElement('tr');
    tr.style.cssText = rowStyle;
    tr.innerHTML = [
      '<td style="' + tdStyle + 'color:rgba(142,240,178,0.6);">' + escHtmlLocal(url) + '</td>',
      '<td style="' + tdStyle + '">' + escHtmlLocal(String(httpStatus)) + '</td>',
      '<td style="' + tdStyle + '">' + escHtmlLocal(ct || '\u2014') + '</td>',
      '<td style="' + tdStyle + '">' + escHtmlLocal(cl || '\u2014') + '</td>',
      '<td style="' + tdStyle + '">' + escHtmlLocal(cc || '\u2014') + '</td>',
      '<td style="' + tdStyle + '">' + escHtmlLocal(etag || '\u2014') + '</td>',
      '<td style="' + tdStyle + '">' + escHtmlLocal(timeMs !== null ? timeMs + ' ms' : '\u2014') + '</td>',
      '<td style="' + tdStyle + 'font-weight:bold;color:' + color + ';">' + result + '</td>',
    ].join('');
    nteBody.appendChild(tr);

    if (result === 'PASS')      { passCount++; }
    else if (result === 'WARN') { warnCount++; }
    else                        { failCount++; }
    updateSummary();
  }

  function escHtmlLocal(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Fetch a URL with timing; return response + elapsed milliseconds.
  function timedFetch(url, opts) {
    var t0 = Date.now();
    return fetch(url, opts || {}).then(function (res) {
      return { res: res, ms: Date.now() - t0 };
    });
  }

  // Check a single NES core or ROM URL with full header detail.
  // isCoreData=true enables stricter size checks (> 1 MB required).
  function checkNesDetailUrl(url, isCoreData) {
    return timedFetch(url, { method: 'HEAD', cache: 'no-store' }).then(function (data) {
      var res   = data.res;
      var ms    = data.ms;
      var http  = res.status;
      var ct    = res.headers.get('content-type') || '';
      var cl    = res.headers.get('content-length') || '';
      var cc    = res.headers.get('cache-control') || '';
      var etag  = res.headers.get('etag') || '';
      var clNum = parseInt(cl, 10);

      var fail = false;
      var warn = false;

      if (http === 405 || http === 501) {
        // HEAD blocked — retry with Range GET
        return timedFetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, cache: 'no-store' })
          .then(function (data2) {
            var res2 = data2.res;
            var ms2  = data2.ms;
            ct   = res2.headers.get('content-type') || ct;
            cl   = res2.headers.get('content-length') || cl;
            cc   = res2.headers.get('cache-control') || cc;
            etag = res2.headers.get('etag') || etag;
            http = res2.status;
            clNum = parseInt(cl, 10);

            if (http !== 200 && http !== 206 && http !== 304) { fail = true; }
            if (ct && ct.toLowerCase().includes('text/html'))  { fail = true; }
            if (isCoreData && clNum > 0 && clNum < 1024 * 1024) { warn = true; }

            addNesDetailRow(url, http, ct, cl, cc, etag, ms2, !fail && !warn, fail, warn);
          });
      }

      if (http !== 200 && http !== 206 && http !== 304) { fail = true; }
      if (ct && ct.toLowerCase().includes('text/html'))  { fail = true; }
      if (isCoreData && clNum > 0 && clNum < 1024 * 1024) { warn = true; }

      addNesDetailRow(url, http, ct, cl, cc, etag, ms, !fail && !warn, fail, warn);
    }).catch(function (err) {
      addNesDetailRow(url, 'ERR', '', '', '', '', null, false, true, false);
    });
  }

  // ── General check functions ──────────────────────────────────────────────────

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
      var ct = (res.headers.get('content-type') || '').toLowerCase();
      var ok = (res.status === 200 || res.status === 206 || res.status === 304)
        && !ct.includes('text/html');
      var cl   = res.headers.get('content-length') || '\u2014';
      var etag = res.headers.get('etag') || '\u2014';
      var detail = 'HTTP ' + res.status +
        '  ct=' + (ct || '\u2014') +
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
      var cl = res.headers.get('content-length') || '\u2014';
      var detail = 'HTTP ' + res.status + '  size=' + cl;
      addRow('ROM', system + ' / ' + romFile, ok ? 'PASS' : 'WARN', detail);
    }).catch(function (err) {
      addRow('ROM', system + ' / ' + romFile, 'WARN', String(err));
    });
  }

  // ── Main ─────────────────────────────────────────────────────────────────────

  (async function main() {
    // 0. Build the NES detail section above the general table
    buildNesSection();

    // 0a. Detailed NES core file checks (HEAD with full headers + fail-on-html)
    await checkNesDetailUrl(CORES_BASE + NES_CORE_FILE, true);

    // 0b. Detailed NES ROM checks
    for (var ri = 0; ri < NES_ROMS.length; ri++) {
      await checkNesDetailUrl(NES_ROMS[ri].path, false);
    }

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
