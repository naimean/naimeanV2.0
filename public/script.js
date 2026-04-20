// Power button and blackout overlay toggle logic
document.addEventListener('DOMContentLoaded', function() {
  const FINAL_PREFIX = 'C:\\Naimean\\';
  const FINAL_UNLOCK_VALUES = new Set([
    'C:\\Naimean\\please',
    'C:\\Naimean\\Please'
  ]);
  const POWER_BUTTON_COOLDOWN_MS = 5000;
  const MINI_GAME_START_COMMANDS = new Set(['play', 'game', 'start']);
  const AUTH_LOGIN_COMMANDS = new Set(['login', 'signin', 'discord']);
  const AUTH_LOGOUT_COMMANDS = new Set(['logout', 'signout']);
  const MINI_GAME_MIN_GUESS = 1;
  const MINI_GAME_MAX_GUESS = 9;
  const MINI_GAME_MAX_ATTEMPTS = 5;
  const MINI_GAME_RANGE_ERROR_MSG = `GAME> Enter a whole number from ${MINI_GAME_MIN_GUESS} to ${MINI_GAME_MAX_GUESS}.`;
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function waitForVideoToEnd(video, maxWaitMs) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener('ended', finish);
        video.removeEventListener('error', finish);
        video.removeEventListener('abort', finish);
        resolve();
      };

      video.addEventListener('ended', finish, { once: true });
      video.addEventListener('error', finish, { once: true });
      video.addEventListener('abort', finish, { once: true });
      setTimeout(finish, maxWaitMs);
    });
  }

  const powerBtn = document.getElementById('power-btn');
  const powerLight = document.getElementById('power-light');
  const shoutboxContainer = document.getElementById('shoutbox-container');
  const bootScreen = document.getElementById('boot-screen');
  const shadowLayer = document.getElementById('shadow-layer');
  const discordOverlay = document.getElementById('discord-overlay');
  const bootInput = document.getElementById('boot-input');
  const bootForm = document.getElementById('boot-form');
  const bootVideo = document.getElementById('boot-video');
  const bootSubmit = document.getElementById('boot-submit');
  const bootInlineSubmit = document.getElementById('boot-inline-submit');
  const bootQuickLinks = document.getElementById('boot-quick-links');
  const bootWhiteboardBtn = document.getElementById('boot-whiteboard-btn');
  const bootCapExBtn = document.getElementById('boot-capex-btn');
  const bootSnowBtn = document.getElementById('boot-snow-btn');
  const returnBypassBtn = document.getElementById('return-bypass-btn');
  const discordRickrollCounter = document.getElementById('discord-rickroll-counter');
  const c64Screen = document.querySelector('.c64-screen');
  const c64Wrapper = document.querySelector('.c64-wrapper');
  const c64Image = document.querySelector('.c64-img');
  const shoutboxForm = document.getElementById('shoutbox-form');
  const shoutboxInput = document.getElementById('shoutbox-input');
  const shoutboxMessages = document.getElementById('messages');
  const shoutboxHintShell = document.getElementById('shoutbox-hint-shell');
  const prankVideoOverlay = document.getElementById('prank-video-overlay');
  const prankVideo = document.getElementById('prank-video');
  const BOOT_LOCKED_PREFIX = 'C:\\Naimean\\User\\';
  const BOOT_DEFAULT_SUFFIX = 'Admin';
  const BOOT_DEFAULT_VALUE = `${BOOT_LOCKED_PREFIX}${BOOT_DEFAULT_SUFFIX}`;
  const BOOT_PREFIX = BOOT_LOCKED_PREFIX;
  const BOOT_WHITEBOARD_AND_CAPEX_VISIBILITY = {
    showDiscordButton: false,
    showWhiteboardButton: true,
    showCapExButton: true,
    showSnowButton: false
  };
  const BOOT_WHITEBOARD_AND_CAPEX_AND_SNOW_VISIBILITY = {
    showDiscordButton: false,
    showWhiteboardButton: true,
    showCapExButton: true,
    showSnowButton: true
  };
  const BOOT_ROLE_VISIBILITY_BY_USER = {
    ADMIN: { showDiscordButton: true,  showWhiteboardButton: false, showCapExButton: false, showSnowButton: false },
    RCA:   { showDiscordButton: false, showWhiteboardButton: true,  showCapExButton: false, showSnowButton: false },
    MAD:   { showDiscordButton: false, showWhiteboardButton: true,  showCapExButton: true,  showSnowButton: true  },
    JV:    BOOT_WHITEBOARD_AND_CAPEX_AND_SNOW_VISIBILITY,
    KB:    BOOT_WHITEBOARD_AND_CAPEX_AND_SNOW_VISIBILITY,
    JY:    BOOT_WHITEBOARD_AND_CAPEX_AND_SNOW_VISIBILITY,
    RD:    BOOT_WHITEBOARD_AND_CAPEX_AND_SNOW_VISIBILITY,
    JS:    BOOT_WHITEBOARD_AND_CAPEX_AND_SNOW_VISIBILITY,
    JD:    BOOT_WHITEBOARD_AND_CAPEX_AND_SNOW_VISIBILITY,
    DL:    BOOT_WHITEBOARD_AND_CAPEX_VISIBILITY,
    EW:    BOOT_WHITEBOARD_AND_CAPEX_VISIBILITY,
    RAD:   { showDiscordButton: false, showWhiteboardButton: false, showCapExButton: false, showSnowButton: false },
    SED:   { showDiscordButton: false, showWhiteboardButton: false, showCapExButton: false, showSnowButton: false }
  };
  const wrongAudio = new Audio('assets/wrong.mp3');
  wrongAudio.preload = 'auto';
  wrongAudio.load();
  let screenOn = false;
  let puzzleSolved = false;
  let prankRunning = false;
  let powerButtonCooldownUntil = 0;
  let hintRevealProgress = 0;
  let lastPointerPosition = null;
  let miniGameActive = false;
  let miniGameTarget = 0;
  let miniGameAttempts = 0;
  const ROCK_ROLL_CONTINUATION_KEY = 'naimean-rock-roll-continuation';
  const ROCK_ROLL_CONTINUATION_PENDING_KEY = 'naimean-rock-roll-continuation-pending';
  const LOCAL_RICKROLL_COUNT_KEY = 'naimean-rickroll-count-fallback';
  const INDEX_FADE_IN_KEY = 'naimean-index-fade-in';
  const LEGACY_RICKROLL_COUNTER_BASE_URL = 'https://barrelrollcounter-worker.naimean.workers.dev';
  const RICKROLL_COUNT_TIMEOUT_MS = 8000;
  const DISCORD_WIDGET_ID = '1487898909224341534';
  const DISCORD_WIDGET_API_URL = `https://discord.com/api/guilds/${DISCORD_WIDGET_ID}/widget.json`;
  const DISCORD_INVITE_RESOLVE_TIMEOUT_MS = 2000;
  const DISCORD_OVERLAY_DISPLAY_DURATION_MS = 5000;
  const DISCORD_INVITE_REDIRECT_PENDING_KEY = 'naimean-discord-invite-redirect-pending';
  const PRANK_REDIRECT_DELAY_MS = 5000;
  const RICKROLL_COUNT_UNAVAILABLE_TEXT = '--';
  const AUTH_SESSION_API_URL = '/auth/session';
  const AUTH_DISCORD_LOGIN_PATH = '/auth/discord/login';
  const AUTH_LOGOUT_API_URL = '/auth/logout';
  const AUTH_RESULT_QUERY_PARAM = 'auth';
  const WHITEBOARD_URL = 'https://whiteboard.cloud.microsoft/me/whiteboards/p/c3BvOmh0dHBzOi8vcmVjb3ZlcnlvY2EtbXkuc2hhcmVwb2ludC5jb20vcGVyc29uYWwvanlhbWFtb3RvX3JlY292ZXJ5Y29hX2NvbQ%3D%3D/b!JAozP9NiJUiopo4tHC_mia8ih9rBB_BJuDHqlIhdrMR7ZnPtQaRFRYzWdkPa-N26/01KVGIHGKPDXSBM3SGFBGYGXQECIZHFEFE';
  const CAP_EX_URL = 'https://app.smartsheet.com/b/form/70b07591b76a4289bc6f5d5e1aabac91?';
  const SNOW_URL = 'https://recoverycoa.service-now.com/now/nav/ui/classic/params/target/incident_list.do?sysparm_query=stateNOT%20IN6%2C7%2C8%5Eassigned_to%3D7fc866ea1b1d7110153886a7624bcbc0&sysparm_first_row=1&sysparm_view=';
  const createUnauthenticatedSession = () => ({ authenticated: false, user: null });
  let authSession = createUnauthenticatedSession();

  function consumeAuthOutcomeFromUrl() {
    try {
      const pageUrl = new URL(window.location.href);
      const authOutcome = pageUrl.searchParams.get(AUTH_RESULT_QUERY_PARAM);
      if (!authOutcome) {
        return '';
      }

      pageUrl.searchParams.delete(AUTH_RESULT_QUERY_PARAM);
      const nextPath = pageUrl.pathname + pageUrl.search + pageUrl.hash;
      window.history.replaceState({}, document.title, nextPath);
      return authOutcome.trim().toLowerCase();
    } catch (_) {
      return '';
    }
  }

  const pendingAuthOutcome = consumeAuthOutcomeFromUrl();

  function buildRickrollApiUrls(pathname) {
    const candidates = [];
    try {
      if (window.location && window.location.origin) {
        candidates.push(new URL(pathname, window.location.origin).toString());
      }
    } catch (_) {}
    candidates.push(`${LEGACY_RICKROLL_COUNTER_BASE_URL}${pathname}`);
    const urls = Array.from(new Set(candidates));
    if (window.NaimeanDiag) {
      window.NaimeanDiag.log('endpoints ' + pathname + ': ' + urls.join(', '));
    }
    return urls;
  }

  const RICKROLL_COUNT_API_URLS = buildRickrollApiUrls('/increment');
  const RICKROLL_COUNT_READ_API_URLS = buildRickrollApiUrls('/get');

  function appendNoCacheParam(url) {
    try {
      const requestUrl = new URL(url);
      requestUrl.searchParams.set('t', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      return requestUrl.toString();
    } catch (_) {
      return url;
    }
  }

  function markBaseImageMissing() {
    if (c64Wrapper) {
      c64Wrapper.classList.add('base-image-missing');
    }
  }

  if (c64Image) {
    const baseImageCandidates = Array.from(
      new Set([
        c64Image.getAttribute('src'),
        'assets/commodore64.jpg',
        'assets/commodore64.jpeg',
        'assets/commodore64.png'
      ].filter(Boolean))
    );
    let baseImageCandidateIndex = Math.max(baseImageCandidates.indexOf(c64Image.getAttribute('src')), 0);

    function tryNextBaseImage() {
      while (baseImageCandidateIndex + 1 < baseImageCandidates.length) {
        baseImageCandidateIndex += 1;
        const nextSource = baseImageCandidates[baseImageCandidateIndex];
        if (nextSource && c64Image.getAttribute('src') !== nextSource) {
          c64Image.setAttribute('src', nextSource);
          return true;
        }
      }
      return false;
    }

    c64Image.addEventListener('error', function() {
      if (!tryNextBaseImage()) {
        markBaseImageMissing();
      }
    });

    if (c64Image.complete && c64Image.naturalWidth === 0) {
      if (!tryNextBaseImage()) {
        markBaseImageMissing();
      }
    }
  }

  function consumeIndexFadeInFlag() {
    try {
      const shouldFadeIn = window.sessionStorage.getItem(INDEX_FADE_IN_KEY) === '1';
      if (shouldFadeIn) {
        window.sessionStorage.removeItem(INDEX_FADE_IN_KEY);
      }
      return shouldFadeIn;
    } catch (_) {
      return false;
    }
  }

  function runIndexFadeInIfNeeded() {
    if (!consumeIndexFadeInFlag()) {
      return;
    }

    const overlay = document.getElementById('page-fade-overlay');
    if (!overlay) {
      return;
    }

    // Make the overlay fully visible immediately so the subsequent class removal
    // always fades from black to transparent instead of briefly animating toward black.
    overlay.style.transition = 'none';
    overlay.classList.add('visible');
    void overlay.offsetHeight;
    overlay.style.transition = '';

    requestAnimationFrame(function() {
      overlay.classList.remove('visible');
    });
  }

  function normalizeRickrollCount(value) {
    const parsedCount = Number(value);
    if (!Number.isFinite(parsedCount) || parsedCount < 0) {
      return null;
    }
    return Math.floor(parsedCount);
  }

  function updateDiscordRickrollCounterDisplay(count) {
    if (!discordRickrollCounter) {
      return;
    }

    const normalizedCount = normalizeRickrollCount(count);
    discordRickrollCounter.textContent = normalizedCount === null
      ? RICKROLL_COUNT_UNAVAILABLE_TEXT
      : String(normalizedCount).padStart(2, '0');
  }

  function readLocalRickrollCount() {
    try {
      const rawValue = window.localStorage.getItem(LOCAL_RICKROLL_COUNT_KEY);
      const parsedCount = normalizeRickrollCount(rawValue);
      return parsedCount === null ? 0 : parsedCount;
    } catch (_) {
      return 0;
    }
  }

  function writeLocalRickrollCount(count) {
    const normalizedCount = normalizeRickrollCount(count);
    if (normalizedCount === null) {
      return;
    }

    try {
      window.localStorage.setItem(LOCAL_RICKROLL_COUNT_KEY, String(normalizedCount));
    } catch (_) {}
  }

  async function fetchRickrollCount(urls, options = {}) {
    const candidateUrls = Array.isArray(urls) ? urls : [urls];
    let lastError = null;

    for (const candidateUrl of candidateUrls) {
      const requestUrl = appendNoCacheParam(candidateUrl);
      if (window.NaimeanDiag) { window.NaimeanDiag.log('try: ' + requestUrl); }
      try {
        const response = await fetch(requestUrl, {
          method: 'GET',
          cache: 'no-store',
          ...options
        });

        if (!response.ok) {
          if (window.NaimeanDiag) { window.NaimeanDiag.log('fail(' + response.status + '): ' + requestUrl); }
          throw new Error('Failed to fetch rickroll count');
        }

        const responseText = await response.text();
        let remoteCount = normalizeRickrollCount(responseText);
        if (remoteCount === null) {
          try {
            const payload = JSON.parse(responseText);
            remoteCount = normalizeRickrollCount(payload && payload.value);
          } catch (_) {}
        }
        if (remoteCount === null) {
          if (window.NaimeanDiag) { window.NaimeanDiag.log('invalid payload: ' + requestUrl); }
          throw new Error('Received invalid rickroll count');
        }

        if (window.NaimeanDiag) { window.NaimeanDiag.log('ok: ' + requestUrl + ' \u2192 ' + remoteCount); }
        return remoteCount;
      } catch (err) {
        lastError = err;
      }
    }

    throw new Error(`All rickroll count endpoints failed${lastError && lastError.message ? `: ${lastError.message}` : ''}`);
  }

  function setDiscordRickrollCounterVisible(isVisible) {
    if (!discordRickrollCounter) {
      return;
    }

    discordRickrollCounter.style.display = isVisible ? '' : 'none';
  }

  async function renderDiscordRickrollCount() {
    if (!discordRickrollCounter) {
      return;
    }

    // Always wait for the network before showing a value so that incognito
    // windows (where localStorage is empty) show the real persisted count
    // instead of a misleading 0.
    try {
      const remoteCount = await fetchRickrollCount(RICKROLL_COUNT_READ_API_URLS);
      const nextCount = remoteCount;
      writeLocalRickrollCount(nextCount);
      updateDiscordRickrollCounterDisplay(nextCount);
      if (window.NaimeanDiag) {
        window.NaimeanDiag.set('remote count', nextCount);
        window.NaimeanDiag.set('count src', 'remote');
        window.NaimeanDiag.set('local count', nextCount);
      }
    } catch (_) {
      // Network failed – fall back to the locally cached value only when it
      // is a real previously-seen count (> 0).  If there is no cached value
      // (e.g. incognito, first visit) show the unavailable placeholder so
      // the display is never misleadingly stuck at 0.
      const localCount = readLocalRickrollCount();
      if (window.NaimeanDiag) {
        window.NaimeanDiag.set('local count', localCount);
        window.NaimeanDiag.set('count src', 'local (fallback)');
      }
      updateDiscordRickrollCounterDisplay(localCount > 0 ? localCount : null);
    }
  }

  async function incrementRickrollCount() {
    const localCountBeforeIncrement = readLocalRickrollCount();

    let controller = null;
    if (typeof AbortController === 'function') {
      try {
        controller = new AbortController();
      } catch (_) {
        controller = null;
      }
    }
    let timeoutId = null;
    let requestSettled = false;

    if (controller) {
      timeoutId = setTimeout(() => {
        if (!requestSettled) {
          controller.abort();
        }
      }, RICKROLL_COUNT_TIMEOUT_MS);
    }

    try {
      const remoteCount = await fetchRickrollCount(RICKROLL_COUNT_API_URLS, {
        keepalive: true,
        signal: controller ? controller.signal : undefined
      });
      const nextCount = remoteCount;
      writeLocalRickrollCount(nextCount);
      updateDiscordRickrollCounterDisplay(nextCount);
      if (window.NaimeanDiag) {
        window.NaimeanDiag.set('remote count', nextCount);
        window.NaimeanDiag.set('local count', nextCount);
        window.NaimeanDiag.log('increment: confirmed \u2192 ' + nextCount);
      }
      return nextCount;
    } catch (error) {
      const incrementErrorSuffix = error && error.message ? ` (${error.message})` : '';
      if (window.NaimeanDiag) { window.NaimeanDiag.log('increment: failed remote increment, resyncing from read endpoint' + incrementErrorSuffix); }
      try {
        const syncedCount = await fetchRickrollCount(RICKROLL_COUNT_READ_API_URLS);
        writeLocalRickrollCount(syncedCount);
        updateDiscordRickrollCounterDisplay(syncedCount);
        if (window.NaimeanDiag) {
          window.NaimeanDiag.set('remote count', syncedCount);
          window.NaimeanDiag.set('local count', syncedCount);
          window.NaimeanDiag.log('increment: resynced \u2192 ' + syncedCount);
        }
        return syncedCount;
      } catch (resyncError) {
        updateDiscordRickrollCounterDisplay(localCountBeforeIncrement);
        const resyncErrorSuffix = resyncError && resyncError.message ? ` (${resyncError.message})` : '';
        if (window.NaimeanDiag) { window.NaimeanDiag.log('increment: failed read-endpoint resync, keeping ' + localCountBeforeIncrement + resyncErrorSuffix); }
        return localCountBeforeIncrement;
      }
    } finally {
      requestSettled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  function persistRockRollPlaybackState() {
    if (!prankVideo) {
      return;
    }

    try {
      const playbackState = {
        currentTime: Number.isFinite(prankVideo.currentTime) && prankVideo.currentTime >= 0 ? prankVideo.currentTime : 0,
        volume: Number.isFinite(prankVideo.volume) ? prankVideo.volume : 1
      };
      window.sessionStorage.setItem(ROCK_ROLL_CONTINUATION_KEY, JSON.stringify(playbackState));
      window.sessionStorage.setItem(ROCK_ROLL_CONTINUATION_PENDING_KEY, '1');
    } catch (_) {}
  }

  renderDiscordRickrollCount();
  runIndexFadeInIfNeeded();

  function primeWrongAudio() {
    wrongAudio.muted = true;
    wrongAudio.play().then(() => {
      wrongAudio.pause();
      wrongAudio.currentTime = 0;
      wrongAudio.muted = false;
    }).catch(() => {
      wrongAudio.muted = false;
    });
  }

  function playWrongSound() {
    wrongAudio.currentTime = 0;
    wrongAudio.play().catch(() => {});
  }

  function placeFinalCursorAtEnd() {
    if (!shoutboxInput) {
      return;
    }

    const end = shoutboxInput.value.length;
    shoutboxInput.setSelectionRange(end, end);
  }

  function placeBootCursorAtEnd() {
    if (!bootInput) {
      return;
    }

    const end = bootInput.value.length;
    bootInput.setSelectionRange(end, end);
  }

  function selectBootEditableSuffix() {
    if (!bootInput) {
      return;
    }

    const prefixLen = BOOT_PREFIX.length;
    const end = bootInput.value.length;
    bootInput.focus();
    bootInput.setSelectionRange(prefixLen, end);
  }

  function resetBootInput() {
    if (!bootInput) {
      return;
    }

    bootInput.value = BOOT_DEFAULT_VALUE;
    selectBootEditableSuffix();
  }

  function updateBootQuickLinkVisibility() {
    if (!bootInput) {
      return;
    }

    const inputValue = bootInput.value;
    const currentUser = inputValue.startsWith(BOOT_PREFIX)
      ? inputValue.slice(BOOT_PREFIX.length)
      : '';
    const normalizedUser = currentUser.trim().toUpperCase();
    const visibility = BOOT_ROLE_VISIBILITY_BY_USER[normalizedUser] || {
      showDiscordButton: true,
      showWhiteboardButton: false,
      showCapExButton: false,
      showSnowButton: false
    };
    const { showDiscordButton, showWhiteboardButton, showCapExButton, showSnowButton } = visibility;

    if (bootSubmit) {
      bootSubmit.style.visibility = showDiscordButton ? 'visible' : 'hidden';
      bootSubmit.style.pointerEvents = showDiscordButton ? 'auto' : 'none';
    }

    if (bootWhiteboardBtn) {
      bootWhiteboardBtn.style.display = showWhiteboardButton ? 'inline-flex' : 'none';
    }

    if (bootCapExBtn) {
      bootCapExBtn.style.display = showCapExButton ? 'inline-flex' : 'none';
    }

    if (bootSnowBtn) {
      bootSnowBtn.style.display = showSnowButton ? 'inline-flex' : 'none';
    }

    if (bootQuickLinks) {
      bootQuickLinks.style.display = (showWhiteboardButton || showCapExButton || showSnowButton) ? 'inline-flex' : 'none';
    }
  }

  function getNormalizedBootUser() {
    if (!bootInput) {
      return '';
    }

    const inputValue = bootInput.value;
    if (!inputValue.startsWith(BOOT_PREFIX)) {
      return '';
    }

    return inputValue.slice(BOOT_PREFIX.length).trim().toUpperCase();
  }

  function isKnownBootUser(normalizedUser) {
    return Object.prototype.hasOwnProperty.call(BOOT_ROLE_VISIBILITY_BY_USER, normalizedUser);
  }

  function resetFinalInput() {
    if (!shoutboxInput) {
      return;
    }

    shoutboxInput.value = FINAL_PREFIX;
    placeFinalCursorAtEnd();
  }

  function setHintReveal(progress) {
    if (!shoutboxHintShell) {
      return;
    }

    hintRevealProgress = Math.max(0, Math.min(1, progress));
    shoutboxHintShell.style.setProperty('--hint-reveal', hintRevealProgress.toFixed(3));
    shoutboxHintShell.classList.toggle('is-revealed', hintRevealProgress >= 1);
  }

  function resetHintReveal() {
    lastPointerPosition = null;
    setHintReveal(0);
  }

  function revealHintFully() {
    setHintReveal(1);
  }

  function handleHintWaggle(event) {
    if (!shoutboxHintShell || !shoutboxContainer || !shoutboxContainer.classList.contains('visible')) {
      return;
    }

    const currentPosition = { x: event.clientX, y: event.clientY };
    if (lastPointerPosition) {
      const distance = Math.hypot(
        currentPosition.x - lastPointerPosition.x,
        currentPosition.y - lastPointerPosition.y
      );

      if (distance > 2) {
        setHintReveal(hintRevealProgress + Math.min(distance / 260, 0.16));
      }
    }

    lastPointerPosition = currentPosition;
  }

  function setBootScreenPoweringOff(isPoweringOff) {
    if (!bootScreen) {
      return;
    }

    bootScreen.classList.toggle('is-powering-off', isPoweringOff);
  }

  function appendShoutboxMessage(message) {
    if (!shoutboxMessages) {
      return;
    }

    const line = document.createElement('div');
    line.textContent = message;
    shoutboxMessages.appendChild(line);
    shoutboxMessages.scrollTop = shoutboxMessages.scrollHeight;
  }

  function resetShoutboxMessages() {
    if (!shoutboxMessages) {
      return;
    }

    shoutboxMessages.textContent = '';
    appendShoutboxMessage('SYSTEM> Access granted.');
    appendShoutboxMessage('SYSTEM> Type C:\\Naimean\\play to launch mini-game mode.');
    appendShoutboxMessage('SYSTEM> You can still type C:\\Naimean\\please at any time.');
  }

  function getReturnToPath() {
    const pathname = window.location.pathname || '/';
    const search = window.location.search || '';
    const hash = window.location.hash || '';
    return `${pathname}${search}${hash}`;
  }

  function beginDiscordLogin() {
    const returnTo = encodeURIComponent(getReturnToPath());
    window.location.assign(`${AUTH_DISCORD_LOGIN_PATH}?returnTo=${returnTo}`);
  }

  async function refreshAuthSession() {
    try {
      const response = await fetch(AUTH_SESSION_API_URL, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        authSession = createUnauthenticatedSession();
        return authSession;
      }
      const payload = await response.json();
      authSession = {
        authenticated: Boolean(payload && payload.authenticated),
        user: payload && payload.user ? payload.user : null,
      };
      return authSession;
    } catch (_) {
      authSession = createUnauthenticatedSession();
      return authSession;
    }
  }

  function appendAuthStatusMessage() {
    const displayName = authSession && authSession.user
      ? (authSession.user.displayName || authSession.user.username || authSession.user.id || 'Discord user')
      : '';
    if (authSession && authSession.authenticated) {
      appendShoutboxMessage(`AUTH> Signed in as ${displayName}.`);
      appendShoutboxMessage('AUTH> Type C:\\Naimean\\logout to sign out.');
      return;
    }
    appendShoutboxMessage('AUTH> Not signed in. Type C:\\Naimean\\login to sign in with Discord.');
  }

  function appendAuthOutcomeMessage() {
    if (!pendingAuthOutcome) {
      return;
    }

    if (pendingAuthOutcome === 'success') {
      if (authSession.authenticated) {
        appendShoutboxMessage('AUTH> Discord sign-in succeeded.');
      } else {
        appendShoutboxMessage('AUTH> Discord sign-in returned, but no active session was detected.');
      }
      return;
    }

    const fallback = 'AUTH> Discord sign-in did not complete. Type C:\\Naimean\\login to try again.';
    const authErrors = {
      missing: fallback,
      expired: 'AUTH> Discord sign-in expired. Type C:\\Naimean\\login to try again.',
      state: 'AUTH> Discord sign-in security check failed. Type C:\\Naimean\\login to retry.',
      token: 'AUTH> Discord token exchange failed. Type C:\\Naimean\\login to retry.',
      profile: 'AUTH> Could not read your Discord profile. Type C:\\Naimean\\login to retry.',
      not_configured: 'AUTH> Discord sign-in is not configured yet.',
    };
    appendShoutboxMessage(authErrors[pendingAuthOutcome] || fallback);
  }

  async function showAuthStatusInShoutbox() {
    await refreshAuthSession();
    appendAuthStatusMessage();
  }

  async function handleAuthCommand(text) {
    if (!text.startsWith(FINAL_PREFIX)) {
      return false;
    }

    const command = text.slice(FINAL_PREFIX.length).trim().toLowerCase();
    if (!command) {
      return false;
    }

    if (AUTH_LOGIN_COMMANDS.has(command)) {
      appendShoutboxMessage('AUTH> Redirecting to Discord sign-in...');
      beginDiscordLogin();
      return true;
    }

    if (AUTH_LOGOUT_COMMANDS.has(command)) {
      try {
        await fetch(AUTH_LOGOUT_API_URL, {
          method: 'POST',
          credentials: 'same-origin',
        });
      } catch (_) {}
      authSession = createUnauthenticatedSession();
      appendShoutboxMessage('AUTH> Signed out.');
      appendShoutboxMessage('AUTH> Type C:\\Naimean\\login to sign back in.');
      return true;
    }

    return false;
  }

  function startMiniGame() {
    miniGameActive = true;
    miniGameAttempts = 0;
    miniGameTarget = getRandomNumber(MINI_GAME_MIN_GUESS, MINI_GAME_MAX_GUESS);

    appendShoutboxMessage('GAME> Guess the hidden number (1-9).');
    appendShoutboxMessage(`GAME> You have ${MINI_GAME_MAX_ATTEMPTS} attempts.`);
    appendShoutboxMessage('GAME> Submit your guess as C:\\Naimean\\<number>.');
  }

  function handleMiniGameCommand(text) {
    if (!text.startsWith(FINAL_PREFIX)) {
      return false;
    }

    const command = text.slice(FINAL_PREFIX.length).trim();
    if (!command) {
      return false;
    }

    const normalizedCommand = command.toLowerCase();
    if (MINI_GAME_START_COMMANDS.has(normalizedCommand)) {
      startMiniGame();
      return true;
    }

    if (!miniGameActive) {
      return false;
    }

    const guess = Number(command);
    if (!/^\d+$/.test(command) || guess < MINI_GAME_MIN_GUESS || guess > MINI_GAME_MAX_GUESS) {
      appendShoutboxMessage(MINI_GAME_RANGE_ERROR_MSG);
      return true;
    }

    miniGameAttempts += 1;
    if (guess === miniGameTarget) {
      miniGameActive = false;
      appendShoutboxMessage(`GAME> ${guess} is correct. You win.`);
      appendShoutboxMessage('GAME> Type C:\\Naimean\\play to replay.');
      return true;
    }

    const attemptsRemaining = MINI_GAME_MAX_ATTEMPTS - miniGameAttempts;
    if (attemptsRemaining <= 0) {
      miniGameActive = false;
      appendShoutboxMessage(`GAME> Out of attempts. The number was ${miniGameTarget}.`);
      appendShoutboxMessage('GAME> Type C:\\Naimean\\play to try again.');
      return true;
    }

    appendShoutboxMessage(`GAME> ${guess} is too ${guess < miniGameTarget ? 'low' : 'high'}. ${attemptsRemaining} attempts left.`);
    return true;
  }

  function getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async function runNedryGateSequence() {
    setBootScreenPoweringOff(false);
    if (bootScreen) {
      bootScreen.classList.add('visible');
    }
    if (bootInput) {
      bootInput.style.display = 'none';
    }
    if (bootSubmit) {
      bootSubmit.style.display = 'none';
    }
    if (bootInlineSubmit) {
      bootInlineSubmit.style.display = 'none';
    }
    if (bootQuickLinks) {
      bootQuickLinks.style.display = 'none';
    }
    setDiscordRickrollCounterVisible(false);
    if (bootVideo) {
      bootVideo.style.display = 'block';
      try {
        bootVideo.currentTime = 0;
        await bootVideo.play();
        const waitMs = Number.isFinite(bootVideo.duration) && bootVideo.duration > 0
          ? Math.ceil(bootVideo.duration * 1000) + 2000
          : 12000;
        await waitForVideoToEnd(bootVideo, waitMs);
      } catch (_) {
        // If autoplay/playback fails, continue to the prompt instead of hanging.
      } finally {
        bootVideo.pause();
        bootVideo.style.display = 'none';
        setDiscordRickrollCounterVisible(true);
      }
    }

    if (bootScreen) {
      bootScreen.classList.remove('visible');
    }
    if (shoutboxContainer) {
      shoutboxContainer.classList.add('visible');
    }
    await playStaticTransition();
    if (shoutboxInput) {
      miniGameActive = false;
      miniGameTarget = 0;
      miniGameAttempts = 0;
      resetShoutboxMessages();
      await showAuthStatusInShoutbox();
      appendAuthOutcomeMessage();
      resetFinalInput();
      shoutboxInput.focus();
    }
    puzzleSolved = true;
  }

  async function runInitialPowerOnSequence() {
    if (discordOverlay) {
      discordOverlay.classList.add('visible');
      discordOverlay.setAttribute('aria-hidden', 'false');
    }

    await delay(3000);

    if (discordOverlay) {
      discordOverlay.classList.remove('visible');
      discordOverlay.setAttribute('aria-hidden', 'true');
    }

    await playStaticTransition();
    showBlueNedryGateScreen();
  }

  function showBlueNedryGateScreen() {
    setBootScreenPoweringOff(false);
    setDiscordRickrollCounterVisible(true);
    if (bootVideo) {
      bootVideo.pause();
      bootVideo.currentTime = 0;
      bootVideo.style.display = 'none';
    }
    if (bootInput) {
      bootInput.style.display = 'inline-block';
      resetBootInput();
      bootInput.focus();
      selectBootEditableSuffix();
    }
    if (bootSubmit) {
      bootSubmit.style.display = 'inline-flex';
    }
    if (bootInlineSubmit) {
      bootInlineSubmit.style.display = 'inline-flex';
    }
    if (bootQuickLinks) {
      bootQuickLinks.style.display = 'none';
    }
    updateBootQuickLinkVisibility();
    if (bootScreen) {
      bootScreen.classList.add('visible');
    }
  }

  function playStaticTransition() {
    return new Promise((resolve) => {
      const STATIC_CLIP_SECONDS = 0.75;
      const STATIC_CLIP_MS = Math.round(STATIC_CLIP_SECONDS * 1000);
      const MIN_STATIC_CLIP_MS = 200;
      const METADATA_LOAD_TIMEOUT_MS = 4000;
      const overlay = document.getElementById('static-overlay');
      const vid = document.getElementById('static-video');
      if (!overlay || !vid) { resolve(); return; }
      let settled = false;
      let endTimer = null;
      let metadataHandler = null;

      const scheduleFinish = (ms) => {
        if (endTimer) {
          clearTimeout(endTimer);
        }
        endTimer = setTimeout(finish, ms);
      };

      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (endTimer) {
          clearTimeout(endTimer);
        }
        if (metadataHandler) {
          vid.removeEventListener('loadedmetadata', metadataHandler);
          metadataHandler = null;
        }
        vid.pause();
        overlay.classList.remove('visible');
        resolve();
      };

      const startRandomClip = () => {
        const duration = Number.isFinite(vid.duration) ? vid.duration : 0;
        if (duration > STATIC_CLIP_SECONDS) {
          const maxStart = duration - STATIC_CLIP_SECONDS;
          vid.currentTime = Math.random() * maxStart;
          scheduleFinish(STATIC_CLIP_MS);
        } else {
          vid.currentTime = 0;
          if (duration > 0) {
            const remainingMs = Math.ceil(duration * 1000);
            scheduleFinish(Math.min(remainingMs, STATIC_CLIP_MS));
          } else {
            scheduleFinish(MIN_STATIC_CLIP_MS);
          }
        }

        vid.play().catch(() => {
          finish();
        });
      };

      overlay.classList.add('visible');
      vid.addEventListener('ended', finish, { once: true });
      vid.addEventListener('error', finish, { once: true });

      if (Number.isFinite(vid.duration) && vid.duration > 0) {
        startRandomClip();
      } else {
        metadataHandler = () => {
          if (settled) {
            return;
          }
          vid.removeEventListener('loadedmetadata', metadataHandler);
          metadataHandler = null;
          startRandomClip();
        };
        vid.addEventListener('loadedmetadata', metadataHandler);
        vid.load();
        scheduleFinish(METADATA_LOAD_TIMEOUT_MS);
      }
    });
  }

  function playVideoOverlay(overlay, video, maxWaitMs) {
    return new Promise((resolve) => {
      if (!overlay || !video) {
        resolve();
        return;
      }

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        overlay.classList.remove('visible');
        video.pause();
        video.removeEventListener('ended', finish);
        video.removeEventListener('error', finish);
        video.removeEventListener('abort', finish);
        resolve();
      };

      overlay.classList.add('visible');
      video.currentTime = 0;
      video.addEventListener('ended', finish, { once: true });
      video.addEventListener('error', finish, { once: true });
      video.addEventListener('abort', finish, { once: true });
      video.play().catch(() => {
        finish();
      });
      setTimeout(finish, maxWaitMs);
    });
  }

  async function resolveDiscordInviteUrl() {
    let controller = null;
    if (typeof AbortController === 'function') {
      try {
        controller = new AbortController();
      } catch (_) {
        controller = null;
      }
    }

    let timeoutId = null;
    if (controller) {
      timeoutId = setTimeout(() => {
        controller.abort();
      }, DISCORD_INVITE_RESOLVE_TIMEOUT_MS);
    }

    try {
      const response = await fetch(DISCORD_WIDGET_API_URL, {
        method: 'GET',
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });

      if (!response.ok) {
        return null;
      }

      const payload = await response.json();
      const instantInvite = typeof payload?.instant_invite === 'string'
        ? payload.instant_invite.trim()
        : '';
      return instantInvite || null;
    } catch (_) {
      return null;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async function serveDiscordInviteIfPossible() {
    const inviteUrl = await resolveDiscordInviteUrl();
    if (inviteUrl) {
      window.open(inviteUrl, '_blank', 'noopener,noreferrer');
      return true;
    }

    if (discordOverlay) {
      discordOverlay.classList.add('visible');
      discordOverlay.setAttribute('aria-hidden', 'false');
      await delay(DISCORD_OVERLAY_DISPLAY_DURATION_MS);
      discordOverlay.classList.remove('visible');
      discordOverlay.setAttribute('aria-hidden', 'true');
      return true;
    }

    return false;
  }

  async function runPowerOffPrank() {
    if (prankRunning) return;
    prankRunning = true;
    setBootScreenPoweringOff(true);

    if (bootInput) {
      bootInput.blur();
    }

    const powerOffOverlay = document.getElementById('power-off-overlay');
    const powerOffVideo = document.getElementById('power-off-video');

    await playVideoOverlay(powerOffOverlay, powerOffVideo, 10000);

    await playStaticTransition();

    if (bootScreen) bootScreen.classList.remove('visible');
    if (shoutboxContainer) shoutboxContainer.classList.add('visible');
    if (prankVideoOverlay) prankVideoOverlay.classList.add('visible');

    try {
      prankVideo.currentTime = 0;
      await prankVideo.play();
    } catch (_) {}

    await delay(PRANK_REDIRECT_DELAY_MS);
    await incrementRickrollCount();
    persistRockRollPlaybackState();
    window.location.assign('chapel.html');
  }

  async function runPleaseSequence() {
    if (prankRunning || !shoutboxContainer || !prankVideoOverlay || !prankVideo) {
      return;
    }

    prankRunning = true;
    if (shoutboxInput) {
      shoutboxInput.disabled = true;
      shoutboxInput.blur();
    }

    // Let the audio cue play in parallel so the prank video appears immediately.
    playZeldaSecretSound().catch(() => {});
    await playStaticTransition();

    shoutboxContainer.classList.add('visible');
    prankVideoOverlay.classList.add('visible');

    try {
      prankVideo.currentTime = 0;
      await prankVideo.play();
    } catch (_) {
      // Continue to redirect even if autoplay is blocked.
    }

    await delay(PRANK_REDIRECT_DELAY_MS);
    await incrementRickrollCount();
    persistRockRollPlaybackState();
    try {
      window.sessionStorage.setItem(DISCORD_INVITE_REDIRECT_PENDING_KEY, '1');
    } catch (_) {}
    window.location.assign('chapel.html');
  }

  function fadeToChapel() {
    const overlay = document.getElementById('page-fade-overlay');
    if (!overlay) { window.location.assign('chapel.html'); return; }
    overlay.classList.add('visible');
    setTimeout(function() {
      window.location.assign('chapel.html');
    }, 900);
  }

  if (returnBypassBtn) {
    returnBypassBtn.addEventListener('click', function() {
      fadeToChapel();
    });
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !screenOn) {
      const active = document.activeElement;
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'BUTTON' || active.tagName === 'TEXTAREA');
      if (!isInput) {
        try {
          window.sessionStorage.setItem('naimean-skip-discord-redirect', '1');
        } catch (_) {}
        fadeToChapel();
      }
    }
  });

  document.addEventListener('pointerdown', primeWrongAudio, { once: true });

  if (bootWhiteboardBtn) {
    bootWhiteboardBtn.addEventListener('click', function() {
      window.open(WHITEBOARD_URL, '_blank', 'noopener,noreferrer');
    });
  }

  if (bootCapExBtn) {
    bootCapExBtn.addEventListener('click', function() {
      window.open(CAP_EX_URL, '_blank', 'noopener,noreferrer');
    });
  }

  if (bootSnowBtn) {
    bootSnowBtn.addEventListener('click', function() {
      window.open(SNOW_URL, '_blank', 'noopener,noreferrer');
    });
  }


  if (bootInput) {
    bootInput.addEventListener('focus', selectBootEditableSuffix);
    bootInput.addEventListener('click', selectBootEditableSuffix);
    bootInput.addEventListener('keydown', function(e) {
      const prefixLen = BOOT_PREFIX.length;
      const selStart = bootInput.selectionStart;
      const selEnd = bootInput.selectionEnd;
      if (e.key === 'Backspace' && selStart <= prefixLen && selStart === selEnd) {
        e.preventDefault();
      }
      if (e.key === 'Delete' && selStart < prefixLen && selStart === selEnd) {
        e.preventDefault();
      }
      if (selStart < prefixLen && selEnd > selStart && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault();
      }
    });
    bootInput.addEventListener('input', function() {
      if (!bootInput.value.startsWith(BOOT_PREFIX)) {
        resetBootInput();
        return;
      }
      updateBootQuickLinkVisibility();
    });
    resetBootInput();
    updateBootQuickLinkVisibility();
  }

  if (shoutboxInput) {
    shoutboxInput.addEventListener('focus', placeFinalCursorAtEnd);
    shoutboxInput.addEventListener('click', placeFinalCursorAtEnd);
    shoutboxInput.addEventListener('keydown', function(e) {
      const prefixLen = FINAL_PREFIX.length;
      const selStart = shoutboxInput.selectionStart;
      const selEnd = shoutboxInput.selectionEnd;
      // Block Backspace/Delete if it would eat into the prefix
      if (e.key === 'Backspace' && selStart <= prefixLen && selStart === selEnd) {
        e.preventDefault();
      }
      if (e.key === 'Delete' && selStart < prefixLen && selStart === selEnd) {
        e.preventDefault();
      }
      // Block any selection that includes the prefix from being deleted/replaced
      if (selStart < prefixLen && selEnd > selStart && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault();
      }
    });
    shoutboxInput.addEventListener('input', function() {
      // Restore prefix if it was somehow removed
      if (!shoutboxInput.value.startsWith(FINAL_PREFIX)) {
        shoutboxInput.value = FINAL_PREFIX;
        const end = shoutboxInput.value.length;
        shoutboxInput.setSelectionRange(end, end);
      }
    });
    resetFinalInput();
  }

  if (c64Screen) {
    c64Screen.addEventListener('mousemove', handleHintWaggle);
    c64Screen.addEventListener('mouseleave', function() {
      lastPointerPosition = null;
    });
  }

  if (shoutboxHintShell) {
    shoutboxHintShell.addEventListener('click', revealHintFully);
    shoutboxHintShell.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        revealHintFully();
      }
    });
    resetHintReveal();
  }

    if (powerBtn && powerLight && shoutboxContainer && bootScreen && shadowLayer) {
      powerBtn.style.display = 'flex';
      powerBtn.addEventListener('click', async function() {
      if (!screenOn) {
        // Turn on: green button, fade shadow, play static, show boot screen
        powerBtn.classList.add('on');
        powerLight.style.background = '#222';
        powerLight.style.boxShadow = 'none';
        shadowLayer.classList.add('hidden');
        if (bootScreen) {
          bootScreen.classList.remove('visible');
        }
        shoutboxContainer.classList.remove('visible');
        screenOn = true;
        powerButtonCooldownUntil = Date.now() + POWER_BUTTON_COOLDOWN_MS;
        await runInitialPowerOnSequence();
      } else {
        if (Date.now() < powerButtonCooldownUntil) {
          return;
        }
        // Turn off: rickroll them instead
        runPowerOffPrank();
      }
    });

    if (bootForm && bootVideo && bootSubmit) {
      bootForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (screenOn && !puzzleSolved) {
          const normalizedUser = getNormalizedBootUser();
          if (!isKnownBootUser(normalizedUser)) {
            playWrongSound();
            resetBootInput();
            updateBootQuickLinkVisibility();
            return;
          }
          await runNedryGateSequence();
        }
      });
    }

    if (shoutboxForm && shoutboxInput) {
      shoutboxForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const text = shoutboxInput.value.trim();
        if (!text) {
          return;
        }

        if (FINAL_UNLOCK_VALUES.has(text)) {
          runPleaseSequence();
          return;
        }

        if (await handleAuthCommand(text)) {
          resetFinalInput();
          return;
        }

        if (handleMiniGameCommand(text)) {
          resetFinalInput();
          return;
        }

        playWrongSound();
        resetFinalInput();
      });
    }
  }
});
const zeldaSecretAudio = new Audio('assets/zelda-secret.mp3');
zeldaSecretAudio.preload = 'auto';

function playZeldaSecretSound() {
  return new Promise((resolve) => {
    const AUDIO_END_PADDING_MS = 250;
    const SYNTH_END_PADDING_MS = 50;
    const DEFAULT_AUDIO_FALLBACK_DURATION_MS = 8000;
    let settled = false;
    let fallbackTimer = null;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      zeldaSecretAudio.removeEventListener('ended', finish);
      zeldaSecretAudio.removeEventListener('error', finish);
      resolve();
    };

    zeldaSecretAudio.currentTime = 0;
    zeldaSecretAudio.addEventListener('ended', finish, { once: true });
    zeldaSecretAudio.addEventListener('error', finish, { once: true });

    fallbackTimer = setTimeout(finish, DEFAULT_AUDIO_FALLBACK_DURATION_MS);

    zeldaSecretAudio.play().then(() => {
      const durationMs = Number.isFinite(zeldaSecretAudio.duration) && zeldaSecretAudio.duration > 0
        ? Math.ceil(zeldaSecretAudio.duration * 1000) + AUDIO_END_PADDING_MS
        : DEFAULT_AUDIO_FALLBACK_DURATION_MS;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      fallbackTimer = setTimeout(finish, durationMs);
    }).catch(() => {
      // If the mp3 file is missing, fall back to a short chime sequence.
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const notes = [783.99, 987.77, 1174.66, 1567.98];
        const notePeakGain = 0.14;
        const noteSpacingSeconds = 0.14;
        const noteAttackSeconds = 0.02;
        const noteLengthSeconds = 0.13;
        const noteSequenceDurationSeconds = ((notes.length - 1) * noteSpacingSeconds) + noteLengthSeconds;
        const start = ctx.currentTime;
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, start + i * noteSpacingSeconds);
          gain.gain.exponentialRampToValueAtTime(notePeakGain, start + i * noteSpacingSeconds + noteAttackSeconds);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + i * noteSpacingSeconds + noteLengthSeconds);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start + i * noteSpacingSeconds);
          osc.stop(start + i * noteSpacingSeconds + noteLengthSeconds);
        });
        if (fallbackTimer) {
          clearTimeout(fallbackTimer);
        }
        fallbackTimer = setTimeout(finish, Math.ceil(noteSequenceDurationSeconds * 1000) + SYNTH_END_PADDING_MS);
      } catch (_) {
        finish();
      }
    });
  });
}
