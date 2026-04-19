/**
 * Naimean Diagnostics Console
 *
 * A lightweight, floating terminal-style panel for diagnosing the rickroll
 * tracker endpoint resolution and counter sync across devices.
 *
 * Activation (any one is sufficient):
 *   - Add ?diag=1 to the URL
 *   - Run NaimeanDiag.toggle() from the browser console
 *   - Press Ctrl+Shift+D
 *   - Set localStorage['naimean-diag'] = '1' and reload
 *
 * Public API (window.NaimeanDiag):
 *   .log(msg)         – Append a timestamped line to the log section
 *   .set(key, value)  – Update a key-value row in the state section
 *   .del(key)         – Remove a key-value row from the state section
 *   .toggle()         – Show or hide the panel
 *   .isActive()       – Return true when the panel is currently visible
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'naimean-diag';
  var MAX_LOG_LINES = 60;

  var state = {};
  var logLines = [];
  var panelEl = null;
  var stateTableEl = null;
  var logListEl = null;
  var bodyEl = null;
  var minBtn = null;
  var minimized = false;
  var visible = false;

  function isActivated() {
    try {
      var search = window.location && window.location.search;
      if (search && new URLSearchParams(search).get('diag') === '1') {
        localStorage.setItem(STORAGE_KEY, '1');
        return true;
      }
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function persistActivated(val) {
    try {
      if (val) {
        localStorage.setItem(STORAGE_KEY, '1');
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (_) {}
  }

  function ts() {
    var d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map(function (n) { return String(n).padStart(2, '0'); })
      .join(':');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderState() {
    if (!stateTableEl) { return; }
    var keys = Object.keys(state);
    var html = '';
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      html += '<div class="ndiag-row">'
        + '<span class="ndiag-key">' + escapeHtml(k) + '</span>'
        + '<span class="ndiag-val">' + escapeHtml(String(state[k])) + '</span>'
        + '</div>';
    }
    stateTableEl.innerHTML = html;
  }

  function renderLog() {
    if (!logListEl) { return; }
    var html = '';
    for (var i = 0; i < logLines.length; i++) {
      html += '<div class="ndiag-log-line">' + escapeHtml(logLines[i]) + '</div>';
    }
    logListEl.innerHTML = html;
    logListEl.scrollTop = logListEl.scrollHeight;
  }

  function injectStyles() {
    if (document.getElementById('naimean-diag-style')) { return; }
    var style = document.createElement('style');
    style.id = 'naimean-diag-style';
    style.textContent = [
      '#naimean-diag-panel{',
        'position:fixed;bottom:12px;left:12px;z-index:2147483647;',
        'width:310px;max-width:calc(100vw - 24px);',
        'background:rgba(6,8,10,0.96);',
        'border:1px solid #1a5c30;border-radius:4px;',
        'font-family:"IBM Plex Mono","Courier New",monospace;font-size:11px;line-height:1.5;',
        'color:#8ef0b2;',
        'box-shadow:0 0 14px rgba(0,0,0,0.8),0 0 0 1px rgba(142,240,178,0.07);',
        'pointer-events:auto;',
      '}',
      '.ndiag-header{',
        'display:flex;align-items:center;justify-content:space-between;',
        'padding:4px 8px;',
        'border-bottom:1px solid #1a5c30;',
        'background:rgba(8,24,14,0.99);',
        'border-radius:4px 4px 0 0;',
        'cursor:default;',
      '}',
      '.ndiag-title{font-size:10px;letter-spacing:0.18em;color:#c8ffd9;font-weight:700;}',
      '.ndiag-controls{display:flex;gap:4px;}',
      '.ndiag-btn{',
        'background:none;border:1px solid #1a5c30;color:#8ef0b2;',
        'width:18px;height:18px;cursor:pointer;font-size:13px;line-height:1;',
        'padding:0;display:flex;align-items:center;justify-content:center;border-radius:2px;',
      '}',
      '.ndiag-btn:hover{background:rgba(142,240,178,0.1);color:#c8ffd9;}',
      '.ndiag-body{padding:6px 8px 8px;}',
      '.ndiag-section-label{font-size:9px;letter-spacing:0.2em;color:#4aa870;margin-bottom:2px;}',
      '.ndiag-section-label-log{margin-top:6px;}',
      '.ndiag-state{border-bottom:1px solid #0d3320;padding-bottom:4px;min-height:4px;}',
      '.ndiag-row{display:flex;gap:6px;padding:1px 0;}',
      '.ndiag-key{color:#4aa870;min-width:100px;flex-shrink:0;}',
      '.ndiag-val{color:#c8ffd9;word-break:break-all;}',
      '.ndiag-log{max-height:140px;overflow-y:auto;margin-top:2px;',
        'scrollbar-width:thin;scrollbar-color:#1a5c30 transparent;}',
      '.ndiag-log::-webkit-scrollbar{width:4px;}',
      '.ndiag-log::-webkit-scrollbar-thumb{background:#1a5c30;border-radius:2px;}',
      '.ndiag-log-line{font-size:10px;color:#6bca96;padding:0.5px 0;word-break:break-all;}',
      '#naimean-diag-panel.ndiag-minimized .ndiag-body{display:none;}',
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function createPanel() {
    injectStyles();
    var el = document.createElement('div');
    el.id = 'naimean-diag-panel';
    el.setAttribute('role', 'complementary');
    el.setAttribute('aria-label', 'Naimean diagnostics console');
    el.innerHTML = '<div class="ndiag-header">'
      + '<span class="ndiag-title">NAIMEAN DIAG</span>'
      + '<span class="ndiag-controls">'
      + '<button class="ndiag-btn" id="ndiag-min" title="Minimize" aria-label="Minimize">&#8211;</button>'
      + '<button class="ndiag-btn" id="ndiag-close" title="Close (Ctrl+Shift+D)" aria-label="Close">&#215;</button>'
      + '</span>'
      + '</div>'
      + '<div class="ndiag-body" id="ndiag-body">'
      + '<div class="ndiag-section-label">STATE</div>'
      + '<div class="ndiag-state" id="ndiag-state"></div>'
      + '<div class="ndiag-section-label ndiag-section-label-log">LOG</div>'
      + '<div class="ndiag-log" id="ndiag-log"></div>'
      + '</div>';

    document.body.appendChild(el);

    stateTableEl = el.querySelector('#ndiag-state');
    logListEl = el.querySelector('#ndiag-log');
    bodyEl = el.querySelector('#ndiag-body');
    minBtn = el.querySelector('#ndiag-min');

    el.querySelector('#ndiag-close').addEventListener('click', function () {
      toggle(false);
    });

    minBtn.addEventListener('click', function () {
      minimized = !minimized;
      el.classList.toggle('ndiag-minimized', minimized);
      minBtn.innerHTML = minimized ? '&#43;' : '&#8211;';
      minBtn.setAttribute('title', minimized ? 'Restore' : 'Minimize');
    });

    return el;
  }

  function show() {
    if (!panelEl) {
      panelEl = createPanel();
    }
    panelEl.style.display = '';
    renderState();
    renderLog();
  }

  function hide() {
    if (panelEl) {
      panelEl.style.display = 'none';
    }
  }

  function toggle(force) {
    visible = (force !== undefined) ? !!force : !visible;
    persistActivated(visible);
    if (visible) {
      if (document.body) {
        show();
      } else {
        document.addEventListener('DOMContentLoaded', show);
      }
    } else {
      hide();
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  var NaimeanDiag = {
    log: function (msg) {
      logLines.push(ts() + ' ' + msg);
      if (logLines.length > MAX_LOG_LINES) {
        logLines.splice(0, logLines.length - MAX_LOG_LINES);
      }
      if (visible && logListEl) {
        renderLog();
      }
    },

    set: function (key, value) {
      state[key] = value;
      if (visible && stateTableEl) {
        renderState();
      }
    },

    del: function (key) {
      delete state[key];
      if (visible && stateTableEl) {
        renderState();
      }
    },

    toggle: function () {
      toggle();
    },

    isActive: function () {
      return visible;
    }
  };

  window.NaimeanDiag = NaimeanDiag;

  // ── Keyboard shortcut (Ctrl+Shift+D) ───────────────────────────────────────

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && !e.altKey && e.key === 'D') {
      e.preventDefault();
      toggle();
    }
  });

  // ── Auto-init ───────────────────────────────────────────────────────────────

  function logPageInfo() {
    var ua = navigator.userAgent || '';
    var isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
    NaimeanDiag.set('page', document.title || window.location.pathname);
    NaimeanDiag.set('device', isMobile ? 'mobile' : 'desktop');
    NaimeanDiag.set('origin', window.location.origin);
    NaimeanDiag.set('viewport', window.innerWidth + '\xd7' + window.innerHeight);
    NaimeanDiag.log('page loaded: ' + (document.title || window.location.pathname));
    NaimeanDiag.log('origin: ' + window.location.origin);
    NaimeanDiag.log('viewport: ' + window.innerWidth + '\xd7' + window.innerHeight);
    NaimeanDiag.log('ua: ' + ua.substring(0, 72) + (ua.length > 72 ? '\u2026' : ''));
  }

  if (isActivated()) {
    if (document.body) {
      toggle(true);
    } else {
      document.addEventListener('DOMContentLoaded', function () { toggle(true); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', logPageInfo);
  } else {
    logPageInfo();
  }
}());
