// Power button and blackout overlay toggle logic
document.addEventListener('DOMContentLoaded', function() {
  const FINAL_PREFIX = 'C:\\Naimean\\';
  const FINAL_UNLOCK_VALUES = new Set([
    'C:\\Naimean\\please',
    'C:\\Naimean\\Please'
  ]);
  const POWER_BUTTON_COOLDOWN_MS = 5000;
  const MINI_GAME_START_COMMANDS = new Set(['play', 'game', 'start']);
  const ARCADE_COMMANDS = new Set(['arcade', 'emulator', 'games']);
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
  const emailAuthOverlay = document.getElementById('email-auth-overlay');
  const emailAuthForm = document.getElementById('email-auth-form');
  const emailAuthTitle = document.getElementById('email-auth-title');
  const emailAuthEmailInput = document.getElementById('email-auth-email');
  const emailAuthUsernameField = document.getElementById('email-auth-username-field');
  const emailAuthUsernameInput = document.getElementById('email-auth-username');
  const emailAuthPasswordInput = document.getElementById('email-auth-password');
  const emailAuthError = document.getElementById('email-auth-error');
  const emailAuthSubmit = document.getElementById('email-auth-submit');
  const emailAuthCancel = document.getElementById('email-auth-cancel');
  const discordAuthLoginBtn = document.getElementById('discord-auth-login');
  const discordAuthUser = document.getElementById('discord-auth-user');
  const discordAuthName = document.getElementById('discord-auth-name');
  const discordAuthAvatar = document.getElementById('discord-auth-avatar');
  const discordAuthAvatarImage = document.getElementById('discord-auth-avatar-image');
  const arcadeOverlay = document.getElementById('arcade-overlay');
  const arcadePicker = document.getElementById('arcade-picker');
  const arcadePlayer = document.getElementById('arcade-player');
  const arcadeSystemSelect = document.getElementById('arcade-system');
  const arcadeGameList = document.getElementById('arcade-game-list');
  const arcadeLaunchBtn = document.getElementById('arcade-launch-btn');
  const arcadeCloseBtn = document.getElementById('arcade-close-btn');
  const arcadeBackBtn = document.getElementById('arcade-back-btn');
  const arcadeFullscreenBtn = document.getElementById('arcade-fullscreen-btn');
  const arcadeNowPlaying = document.getElementById('arcade-now-playing');
  const BOOT_LOCKED_PREFIX = 'C:\\Naimean\\User\\';
  const BOOT_DEFAULT_SUFFIX = 'Arcade';
  const BOOT_DEFAULT_VALUE = `${BOOT_LOCKED_PREFIX}${BOOT_DEFAULT_SUFFIX}`;
  const BOOT_PREFIX = BOOT_LOCKED_PREFIX;
  const BOOT_WHITEBOARD_AND_CAPEX_AND_SNOW_VISIBILITY = {
    showDiscordButton: false,
    showWhiteboardButton: true,
    showCapExButton: true,
    showSnowButton: true
  };
  const BOOT_ROLE_VISIBILITY_BY_USER = {
    RCA: BOOT_WHITEBOARD_AND_CAPEX_AND_SNOW_VISIBILITY
  };
  const wrongAudio = new Audio('assets/audio/wrong.v20260424.mp3');
  wrongAudio.preload = 'auto';
  wrongAudio.load();
  let screenOn = false;
  let puzzleSolved = false;
  let prankRunning = false;
  let joinDiscordWorkflowRunning = false;
  let powerButtonCooldownUntil = 0;
  let bootScreenUnlockAt = 0;
  const BOOT_SCREEN_SUBMIT_DELAY_MS = 3000;
  let hintRevealProgress = 0;
  let lastPointerPosition = null;
  let miniGameActive = false;
  let miniGameTarget = 0;
  let miniGameAttempts = 0;
  const EJS_CDN_BASE = 'https://cdn.emulatorjs.org/stable/data/';
  let arcadeManifest = null;
  let arcadeSelectedGame = null;
  let arcadeFullscreen = false;
  const ROCK_ROLL_CONTINUATION_KEY = 'naimean-rock-roll-continuation';
  const ROCK_ROLL_CONTINUATION_PENDING_KEY = 'naimean-rock-roll-continuation-pending';
  const LOCAL_RICKROLL_COUNT_KEY = 'naimean-rickroll-count-fallback';
  const INDEX_FADE_IN_KEY = 'naimean-index-fade-in';
  const RICKROLL_COUNTER_FALLBACK_BASE_URLS = [
    'https://naimean.com',
    'https://www.naimean.com',
    'https://barrelrollcounter-worker.naimean.workers.dev'
  ];
  const RICKROLL_COUNT_TIMEOUT_MS = 8000;
  const DISCORD_WIDGET_ID = '1487898909224341534';
  const DISCORD_WIDGET_API_URL = `https://discord.com/api/guilds/${DISCORD_WIDGET_ID}/widget.json`;
  const DISCORD_INVITE_RESOLVE_TIMEOUT_MS = 2000;
  const DISCORD_FALLBACK_INVITE_URL = 'https://discord.gg/kTkD7N3JN';
  const DISCORD_OVERLAY_DISPLAY_DURATION_MS = 5000;
  const POWER_ON_DISCORD_OVERLAY_DISPLAY_DURATION_MS = 2500;
  const DISCORD_INVITE_REDIRECT_PENDING_KEY = 'naimean-discord-invite-redirect-pending';
  const JOIN_DISCORD_WORKFLOW_PENDING_KEY = 'naimean-join-discord-workflow-pending';
  const POWER_ON_AUTH_PENDING_KEY = 'naimean-power-on-auth-pending';
  const JOIN_DISCORD_GATE_HOLD_MS = 1200;
  const JOIN_DISCORD_PLEASE_SCREEN_HOLD_MS = 1200;
  const PRANK_REDIRECT_MAX_WAIT_MS = 10000;
  const TOOL_POPUP_TIMEOUT_MS = 10000;
  const RICKROLL_COUNT_UNAVAILABLE_TEXT = '--';
  const WHITEBOARD_URL = '/go/whiteboard';
  const CAP_EX_URL = '/go/capex';
  const SNOW_URL = '/go/snow';
  const AUTH_SESSION_API_URL = '/auth/session';
  const AUTH_DISCORD_LOGIN_PATH = '/auth/discord/login';
  const AUTH_LOGOUT_API_URL = '/auth/logout';
  const AUTH_REGISTER_API_URL = '/auth/register';
  const AUTH_EMAIL_LOGIN_API_URL = '/auth/emaillogin';
  const AUTH_REGISTER_COMMANDS = new Set(['register', 'signup']);
  const AUTH_EMAIL_LOGIN_COMMANDS = new Set(['emaillogin', 'email-login']);
  const AUTH_RESULT_QUERY_PARAM = 'auth';
  // Discord user IDs are numeric snowflakes and avatar hashes are 32 hex chars with optional animated `a_` prefix.
  const DISCORD_USER_ID_PATTERN = /^\d{5,30}$/;
  const DISCORD_AVATAR_HASH_PATTERN = /^(a_)?[a-f0-9]{32}$/i;
  const createUnauthenticatedSession = () => ({ authenticated: false, user: null });
  let authSession = createUnauthenticatedSession();

  function isDiscordSession(session) {
    return Boolean(session && session.authenticated && session.user && session.user.provider === 'discord');
  }

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
    } catch (_error) {
      // If URL parsing/history update fails, continue without auth callback messaging.
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
    for (const baseUrl of RICKROLL_COUNTER_FALLBACK_BASE_URLS) {
      candidates.push(`${baseUrl}${pathname}`);
    }
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
        'assets/images/commodore64.v20260424.jpg'
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

  async function fetchRickrollIncrementCount(urls, options = {}) {
    return fetchRickrollCount(urls, { ...options, method: 'POST' });
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
      const remoteCount = await fetchRickrollIncrementCount(RICKROLL_COUNT_API_URLS, {
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

  function persistRockRollTransitionState() {
    if (!prankVideo) {
      return;
    }

    try {
      const playbackState = {
        currentTime: 0,
        volume: 1,
        savedAt: Date.now()
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
    if (Object.prototype.hasOwnProperty.call(BOOT_ROLE_VISIBILITY_BY_USER, normalizedUser)) {
      return true;
    }
    // A user who is already authenticated (via email or Discord) is always
    // recognised for their own session username so they can pass the boot screen.
    if (authSession && authSession.authenticated && authSession.user) {
      const sessionUser = (authSession.user.username || '').trim().toUpperCase();
      if (sessionUser && sessionUser === normalizedUser) {
        return true;
      }
    }
    return false;
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
  }

  function getReturnToPath() {
    const pathname = window.location.pathname || '/';
    const search = window.location.search || '';
    const hash = window.location.hash || '';
    return `${pathname}${search}${hash}`;
  }

  function beginDiscordLogin() {
    const returnTo = getReturnToPath();
    if (window.NaimeanAuth && typeof window.NaimeanAuth.startLogin === 'function') {
      window.NaimeanAuth.startLogin({ returnToPath: returnTo, preferPopup: true });
      return;
    }
    window.location.assign(`${AUTH_DISCORD_LOGIN_PATH}?returnTo=${encodeURIComponent(returnTo)}`);
  }

  function getSessionDisplayName(user) {
    if (!user) {
      return '';
    }
    return (user.displayName || user.username || user.id || 'user').trim();
  }

  function getDiscordAvatarUrl(user) {
    if (!user || user.provider !== 'discord') {
      return '';
    }
    const userId = typeof user.id === 'string' ? user.id.trim() : '';
    const avatarHash = typeof user.avatar === 'string' ? user.avatar.trim() : '';
    if (!DISCORD_USER_ID_PATTERN.test(userId) || !DISCORD_AVATAR_HASH_PATTERN.test(avatarHash)) {
      return '';
    }
    // Discord uses an `a_` hash prefix for animated avatars.
    const extension = avatarHash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${extension}?size=64`;
  }

  function isSafeDiscordAvatarUrl(url) {
    if (typeof url !== 'string' || !url) {
      return false;
    }
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'cdn.discordapp.com') {
        return false;
      }
      const avatarPathMatch = parsedUrl.pathname.match(/^\/avatars\/([^/]+)\/([^/.]+)\.(png|gif)$/i);
      if (!avatarPathMatch) {
        return false;
      }
      const [, userId, avatarHash] = avatarPathMatch;
      if (!DISCORD_USER_ID_PATTERN.test(userId) || !DISCORD_AVATAR_HASH_PATTERN.test(avatarHash)) {
        return false;
      }
      const queryEntries = Array.from(parsedUrl.searchParams.entries());
      return queryEntries.length === 1
        && queryEntries[0][0] === 'size'
        && queryEntries[0][1] === '64';
    } catch (_) {
      return false;
    }
  }

  function renderDiscordAuthChip() {
    if (window.NaimeanAuth && typeof window.NaimeanAuth.renderAuthState === 'function') {
      window.NaimeanAuth.renderAuthState(authSession);
      return;
    }
    if (!discordAuthLoginBtn || !discordAuthUser || !discordAuthName || !discordAuthAvatar || !discordAuthAvatarImage) {
      return;
    }

    if (!authSession || !authSession.authenticated || !authSession.user) {
      discordAuthLoginBtn.hidden = false;
      discordAuthUser.hidden = true;
      discordAuthName.textContent = '';
      discordAuthAvatar.textContent = '';
      discordAuthAvatarImage.src = '';
      discordAuthAvatarImage.hidden = true;
      return;
    }

    const displayName = getSessionDisplayName(authSession.user);
    const avatarUrl = getDiscordAvatarUrl(authSession.user);
    const safeAvatarUrl = isSafeDiscordAvatarUrl(avatarUrl)
      ? avatarUrl
      : '';
    discordAuthName.textContent = displayName || 'user';
    discordAuthLoginBtn.hidden = true;
    discordAuthUser.hidden = false;
    if (safeAvatarUrl) {
      discordAuthAvatarImage.src = safeAvatarUrl;
      discordAuthAvatarImage.hidden = false;
      discordAuthAvatar.textContent = '';
    } else {
      discordAuthAvatarImage.src = '';
      discordAuthAvatarImage.hidden = true;
      discordAuthAvatar.textContent = (displayName || 'U').charAt(0);
    }
  }

  async function refreshAuthSession() {
    if (window.NaimeanAuth && typeof window.NaimeanAuth.refreshSession === 'function') {
      authSession = await window.NaimeanAuth.refreshSession();
      return authSession;
    }
    try {
      const response = await fetch(AUTH_SESSION_API_URL, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        authSession = createUnauthenticatedSession();
        renderDiscordAuthChip();
        return authSession;
      }
      const payload = await response.json();
      authSession = {
        authenticated: Boolean(payload && payload.authenticated),
        user: payload && payload.user ? payload.user : null,
      };
      renderDiscordAuthChip();
      return authSession;
    } catch (_) {
      authSession = createUnauthenticatedSession();
      renderDiscordAuthChip();
      return authSession;
    }
  }

  // Pre-fills the boot input with the authenticated user's username so they
  // are recognised by the bedroom switcher without typing anything.
  function applySessionToBootInput() {
    if (!bootInput || !authSession || !authSession.authenticated || !authSession.user) {
      return;
    }
    const username = authSession.user.username;
    if (!username) {
      return;
    }
    bootInput.value = `${BOOT_PREFIX}${username}`;
    updateBootQuickLinkVisibility();
  }

  function appendAuthStatusMessage() {
    const user = authSession && authSession.user;
    const displayName = getSessionDisplayName(user);
    if (authSession && authSession.authenticated) {
      appendShoutboxMessage(`AUTH> Signed in as ${displayName}.`);
      appendShoutboxMessage('AUTH> Type C:\\Naimean\\logout to sign out.');
      return;
    }
    appendShoutboxMessage('AUTH> Not signed in.');
    appendShoutboxMessage('AUTH> Type C:\\Naimean\\login to sign in with Discord.');
    appendShoutboxMessage('AUTH> Type C:\\Naimean\\register to create an email account.');
    appendShoutboxMessage('AUTH> Type C:\\Naimean\\emaillogin to sign in with email.');
  }

  function appendAuthOutcomeMessage() {
    if (!pendingAuthOutcome) {
      return;
    }

    if (pendingAuthOutcome === 'success') {
      if (authSession.authenticated) {
        appendShoutboxMessage('AUTH> Discord sign-in succeeded.');
      } else {
        appendShoutboxMessage('AUTH> Discord sign-in completed, but session initialization failed. Type C:\\Naimean\\login to try again.');
      }
      return;
    }

    const fallback = 'AUTH> Discord sign-in did not complete. Type C:\\Naimean\\login to try again.';
    const authErrors = {
      expired: 'AUTH> Discord sign-in expired. Type C:\\Naimean\\login to try again.',
      state: 'AUTH> Discord sign-in verification failed. Type C:\\Naimean\\login to retry.',
      token: 'AUTH> Could not complete Discord sign-in. Type C:\\Naimean\\login to retry.',
      profile: 'AUTH> Could not read your Discord profile. Type C:\\Naimean\\login to retry.',
      not_configured: 'AUTH> Discord sign-in is not configured yet.',
    };
    appendShoutboxMessage(authErrors[pendingAuthOutcome] || fallback);
  }

  async function showAuthStatusInShoutbox() {
    await refreshAuthSession();
    appendAuthStatusMessage();
  }

  async function requireDiscordSession(returnToPath) {
    const targetPath = typeof returnToPath === 'string' && returnToPath.trim()
      ? returnToPath
      : getReturnToPath();
    if (window.NaimeanAuth && typeof window.NaimeanAuth.requireDiscordAuth === 'function') {
      try {
        const result = await window.NaimeanAuth.requireDiscordAuth({ returnToPath: targetPath });
        // When the popup was blocked the auth library falls back to a full-page
        // redirect.  Return null so callers know NOT to clear their sessionStorage
        // pending keys — the page is navigating away and resumePowerOnAuthIfNeeded
        // (or resumeJoinDiscordWorkflowIfNeeded) will pick up where we left off
        // once the OAuth flow returns the user to this page.
        if (result && result.status === 'redirect') {
          return null;
        }
        if (result && result.session) {
          authSession = result.session;
        } else {
          authSession = await refreshAuthSession();
        }
      } catch (_) {
        beginDiscordLogin();
        return false;
      }
      renderDiscordAuthChip();
      return isDiscordSession(authSession);
    }

    const session = await refreshAuthSession();
    if (isDiscordSession(session)) {
      return true;
    }
    beginDiscordLogin();
    return false;
  }

  function setJoinDiscordWorkflowPending(isPending) {
    try {
      if (isPending) {
        window.sessionStorage.setItem(JOIN_DISCORD_WORKFLOW_PENDING_KEY, '1');
        return;
      }
      window.sessionStorage.removeItem(JOIN_DISCORD_WORKFLOW_PENDING_KEY);
    } catch (_) {}
  }

  function consumeJoinDiscordWorkflowPending() {
    try {
      const isPending = window.sessionStorage.getItem(JOIN_DISCORD_WORKFLOW_PENDING_KEY) === '1';
      window.sessionStorage.removeItem(JOIN_DISCORD_WORKFLOW_PENDING_KEY);
      return isPending;
    } catch (_) {
      return false;
    }
  }

  function setPowerOnAuthPending(isPending) {
    try {
      if (isPending) {
        window.sessionStorage.setItem(POWER_ON_AUTH_PENDING_KEY, '1');
        return;
      }
      window.sessionStorage.removeItem(POWER_ON_AUTH_PENDING_KEY);
    } catch (_) {}
  }

  function consumePowerOnAuthPending() {
    try {
      const isPending = window.sessionStorage.getItem(POWER_ON_AUTH_PENDING_KEY) === '1';
      window.sessionStorage.removeItem(POWER_ON_AUTH_PENDING_KEY);
      return isPending;
    } catch (_) {
      return false;
    }
  }

  function powerOnScreen() {
    if (screenOn) {
      return;
    }

    if (powerBtn) {
      powerBtn.classList.add('on');
    }
    if (powerLight) {
      powerLight.style.background = '#222';
      powerLight.style.boxShadow = 'none';
    }
    if (shadowLayer) {
      shadowLayer.classList.add('hidden');
    }
    if (bootScreen) {
      bootScreen.classList.remove('visible');
    }
    if (shoutboxContainer) {
      shoutboxContainer.classList.remove('visible');
    }

    screenOn = true;
    powerButtonCooldownUntil = Date.now() + POWER_BUTTON_COOLDOWN_MS;
  }

  async function continueJoinDiscordWorkflow() {
    if (prankRunning) {
      return false;
    }

    if (!screenOn) {
      powerOnScreen();
      await playStaticTransition();
      showBlueNedryGateScreen();
      await delay(JOIN_DISCORD_GATE_HOLD_MS);
    }

    if (!puzzleSolved) {
      await runNedryGateSequence();
    }

    return true;
  }

  async function beginJoinDiscordWorkflow() {
    if (joinDiscordWorkflowRunning || prankRunning) {
      return false;
    }

    joinDiscordWorkflowRunning = true;
    try {
      const session = await refreshAuthSession();
      if (!isDiscordSession(session)) {
        setJoinDiscordWorkflowPending(true);
        const hasDiscordAuth = await requireDiscordSession(getReturnToPath());
        if (hasDiscordAuth !== true) {
          // null = redirect in progress (keep pending key); false = auth cancelled
          if (hasDiscordAuth === false) {
            setJoinDiscordWorkflowPending(false);
          }
          return false;
        }
      }

      setJoinDiscordWorkflowPending(false);
      return await continueJoinDiscordWorkflow();
    } finally {
      joinDiscordWorkflowRunning = false;
    }
  }

  async function resumeJoinDiscordWorkflowIfNeeded() {
    if (!consumeJoinDiscordWorkflowPending()) {
      return;
    }

    if (!isDiscordSession(authSession)) {
      return;
    }

    await continueJoinDiscordWorkflow();
  }

  async function resumePowerOnAuthIfNeeded() {
    if (!consumePowerOnAuthPending()) {
      return;
    }

    if (!isDiscordSession(authSession)) {
      return;
    }

    powerOnScreen();
    await playStaticTransition();
    showBlueNedryGateScreen();
  }

  async function openProtectedTool(toolPath) {
    const popup = window.open('', '_blank', 'noopener');
    const popupCloseTimeout = popup
      ? setTimeout(function() {
          if (popup && !popup.closed) {
            popup.close();
          }
        }, TOOL_POPUP_TIMEOUT_MS)
      : null;
    if (popup && popup.document) {
      popup.document.title = 'Opening tool…';
      popup.document.body.textContent = 'Checking your session…';
    }
    const session = await refreshAuthSession();
    if (!session || !session.authenticated) {
      if (popupCloseTimeout) {
        clearTimeout(popupCloseTimeout);
      }
      if (popup && !popup.closed) {
        popup.close();
      }
      beginDiscordLogin();
      return;
    }

    if (popupCloseTimeout) {
      clearTimeout(popupCloseTimeout);
    }
    if (popup && !popup.closed) {
      popup.location = toolPath;
      return;
    }

    window.location.assign(toolPath);
  }

  // ─── Email auth form ──────────────────────────────────────────────────────
  // 'register' mode shows the username field; 'emaillogin' mode hides it.

  let emailAuthMode = 'register'; // 'register' | 'emaillogin'

  function showEmailAuthForm(mode) {
    if (!emailAuthOverlay || !emailAuthForm) {
      return;
    }
    emailAuthMode = mode === 'emaillogin' ? 'emaillogin' : 'register';
    if (emailAuthTitle) {
      emailAuthTitle.textContent = emailAuthMode === 'emaillogin' ? 'EMAIL SIGN-IN' : 'REGISTER';
    }
    if (emailAuthUsernameField) {
      emailAuthUsernameField.style.display = emailAuthMode === 'register' ? '' : 'none';
    }
    if (emailAuthError) {
      emailAuthError.textContent = '';
    }
    if (emailAuthEmailInput) {
      emailAuthEmailInput.value = '';
    }
    if (emailAuthUsernameInput) {
      emailAuthUsernameInput.value = '';
    }
    if (emailAuthPasswordInput) {
      emailAuthPasswordInput.value = '';
    }
    if (emailAuthSubmit) {
      emailAuthSubmit.disabled = false;
    }
    emailAuthOverlay.classList.add('visible');
    if (emailAuthEmailInput) {
      emailAuthEmailInput.focus();
    }
  }

  function hideEmailAuthForm() {
    if (!emailAuthOverlay) {
      return;
    }
    emailAuthOverlay.classList.remove('visible');
    if (shoutboxInput) {
      shoutboxInput.focus();
    }
  }

  if (emailAuthCancel) {
    emailAuthCancel.addEventListener('click', hideEmailAuthForm);
  }

  if (emailAuthForm) {
    emailAuthForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!emailAuthEmailInput || !emailAuthPasswordInput || !emailAuthError || !emailAuthSubmit) {
        return;
      }

      const email = emailAuthEmailInput.value.trim();
      const password = emailAuthPasswordInput.value;
      const username = emailAuthUsernameInput ? emailAuthUsernameInput.value.trim() : '';

      emailAuthError.textContent = '';
      emailAuthSubmit.disabled = true;

      try {
        const isRegister = emailAuthMode === 'register';
        const body = isRegister
          ? { email, username, password }
          : { email, password };
        const response = await fetch(
          isRegister ? AUTH_REGISTER_API_URL : AUTH_EMAIL_LOGIN_API_URL,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(body),
          },
        );
        const payload = await response.json();
        if (!response.ok) {
          emailAuthError.textContent = (payload && payload.error) || 'Something went wrong. Please try again.';
          emailAuthSubmit.disabled = false;
          return;
        }
        // Success — refresh session and pre-populate boot input.
        hideEmailAuthForm();
        await refreshAuthSession();
        applySessionToBootInput();
        renderDiscordAuthChip();
        const action = emailAuthMode === 'register' ? 'Account created.' : 'Signed in.';
        appendShoutboxMessage(`AUTH> ${action} Welcome, ${payload.username}.`);
        appendShoutboxMessage('AUTH> Your username has been loaded into the boot switcher.');
        appendShoutboxMessage('AUTH> Type C:\\Naimean\\logout to sign out.');
      } catch (_) {
        emailAuthError.textContent = 'Network error. Please try again.';
        emailAuthSubmit.disabled = false;
      }
    });
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

    if (AUTH_REGISTER_COMMANDS.has(command)) {
      showEmailAuthForm('register');
      return true;
    }

    if (AUTH_EMAIL_LOGIN_COMMANDS.has(command)) {
      showEmailAuthForm('emaillogin');
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
      renderDiscordAuthChip();
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

    await delay(POWER_ON_DISCORD_OVERLAY_DISPLAY_DURATION_MS);

    if (discordOverlay) {
      discordOverlay.classList.remove('visible');
      discordOverlay.setAttribute('aria-hidden', 'true');
    }

    const session = await refreshAuthSession();
    if (!isDiscordSession(session)) {
      setPowerOnAuthPending(true);
      const hasDiscordAuth = await requireDiscordSession(getReturnToPath());
      // null  → full-page OAuth redirect is in progress; keep the pending key so
      //          resumePowerOnAuthIfNeeded can restore this flow after the page reloads.
      // false → auth was explicitly cancelled/failed; clear the pending key and bail.
      // true  → popup auth succeeded in-place; clear the pending key and continue.
      if (hasDiscordAuth !== true) {
        if (hasDiscordAuth === false) {
          setPowerOnAuthPending(false);
        }
        return;
      }
      // Clear the marker now that the popup flow completed in-place successfully.
      setPowerOnAuthPending(false);
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
      applySessionToBootInput();
      bootInput.focus();
      selectBootEditableSuffix();
    }
    if (bootSubmit) {
      bootSubmit.style.display = 'inline-flex';
      bootSubmit.disabled = true;
    }
    if (bootInlineSubmit) {
      bootInlineSubmit.style.display = 'inline-flex';
      bootInlineSubmit.disabled = true;
    }
    if (bootQuickLinks) {
      bootQuickLinks.style.display = 'none';
    }
    updateBootQuickLinkVisibility();
    if (bootScreen) {
      bootScreen.classList.add('visible');
    }
    bootScreenUnlockAt = Date.now() + BOOT_SCREEN_SUBMIT_DELAY_MS;
    setTimeout(function() {
      if (bootSubmit) bootSubmit.disabled = false;
      if (bootInlineSubmit) bootInlineSubmit.disabled = false;
    }, BOOT_SCREEN_SUBMIT_DELAY_MS);
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
      return instantInvite || DISCORD_FALLBACK_INVITE_URL;
    } catch (_) {
      return DISCORD_FALLBACK_INVITE_URL;
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

    prankVideo.currentTime = 0;
    // Fire-and-forget: same reasoning as runPleaseSequence — don't await play()
    // so a hanging Promise can't block the redirect.
    prankVideo.play().catch(() => {});

    incrementRickrollCount();
    await waitForVideoToEnd(prankVideo, PRANK_REDIRECT_MAX_WAIT_MS);
    persistRockRollTransitionState();
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

    prankVideo.currentTime = 0;
    // Fire-and-forget: do not await play() — on some browsers (e.g. after a popup
    // auth flow where there is no active user gesture) the Promise can stay pending
    // indefinitely instead of rejecting, which would block the redirect.  The
    // rockroll continuation on chapel.html will pick up where the video left off
    // (or retry on first user interaction if autoplay is still blocked there).
    prankVideo.play().catch(() => {});

    incrementRickrollCount();
    await waitForVideoToEnd(prankVideo, PRANK_REDIRECT_MAX_WAIT_MS);
    persistRockRollTransitionState();
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
    returnBypassBtn.addEventListener('click', async function() {
      const session = await refreshAuthSession();
      if (!isDiscordSession(session)) {
        playWrongSound();
        const authResult = await requireDiscordSession(getReturnToPath());
        if (authResult === true) {
          fadeToChapel();
        }
        return;
      }
      fadeToChapel();
    });
  }

  document.addEventListener('keydown', async function(e) {
    if (e.key === 'Escape' && arcadeFullscreen) {
      exitArcadeFullscreen();
      return;
    }
    if (e.key === 'Enter' && !screenOn) {
      const active = document.activeElement;
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'BUTTON' || active.tagName === 'TEXTAREA');
      if (!isInput) {
        const session = await refreshAuthSession();
        if (!isDiscordSession(session)) {
          playWrongSound();
          const authResult = await requireDiscordSession(getReturnToPath());
          if (authResult === true) {
            try {
              window.sessionStorage.setItem('naimean-skip-discord-redirect', '1');
            } catch (_) {}
            fadeToChapel();
          }
          return;
        }
        try {
          window.sessionStorage.setItem('naimean-skip-discord-redirect', '1');
        } catch (_) {}
        fadeToChapel();
      }
    }
  });

  document.addEventListener('pointerdown', primeWrongAudio, { once: true });

  if (bootWhiteboardBtn) {
    bootWhiteboardBtn.addEventListener('click', async function() {
      await openProtectedTool(WHITEBOARD_URL);
    });
  }

  if (bootCapExBtn) {
    bootCapExBtn.addEventListener('click', async function() {
      await openProtectedTool(CAP_EX_URL);
    });
  }

  if (bootSnowBtn) {
    bootSnowBtn.addEventListener('click', async function() {
      await openProtectedTool(SNOW_URL);
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
    // Eagerly refresh the session so the boot input is pre-populated if the
    // user is already signed in from a previous visit.
    refreshAuthSession().then(function () {
      applySessionToBootInput();
      renderDiscordAuthChip();
      resumePowerOnAuthIfNeeded().catch(function () {});
      resumeJoinDiscordWorkflowIfNeeded().catch(function () {});
    }).catch(function () {});
  }

  if (discordAuthLoginBtn) {
    discordAuthLoginBtn.addEventListener('click', function () {
      beginDiscordLogin();
    });
  }

  if (window.NaimeanAuth && typeof window.NaimeanAuth.onSessionChange === 'function') {
    window.NaimeanAuth.onSessionChange(function(nextSession) {
      authSession = nextSession && typeof nextSession === 'object'
        ? {
            authenticated: Boolean(nextSession.authenticated),
            user: nextSession.user || null,
          }
        : createUnauthenticatedSession();
      if (authSession.authenticated) {
        applySessionToBootInput();
      } else {
        resetBootInput();
        updateBootQuickLinkVisibility();
      }
      renderDiscordAuthChip();
    });
  }

  renderDiscordAuthChip();

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
        // Require auth before the power-off prank (rickroll path)
        const powOffSession = await refreshAuthSession();
        if (!isDiscordSession(powOffSession)) {
          playWrongSound();
          beginJoinDiscordWorkflow();
          return;
        }
        // Turn off: rickroll them instead
        runPowerOffPrank();
      }
    });

    function getBootInputSuffix() {
      const inputValue = bootInput ? bootInput.value : '';
      return inputValue.startsWith(BOOT_PREFIX)
        ? inputValue.slice(BOOT_PREFIX.length).trim().toLowerCase()
        : '';
    }

    if (bootInlineSubmit) {
      bootInlineSubmit.addEventListener('click', function() {
        if (Date.now() < bootScreenUnlockAt) {
          return;
        }
        if (screenOn && !puzzleSolved) {
          if (ARCADE_COMMANDS.has(getBootInputSuffix())) {
            openArcade();
            return;
          }
          playWrongSound();
        }
      });
    }

    if (bootForm && bootVideo && bootSubmit) {
      bootForm.addEventListener('submit', function(e) {
        e.preventDefault();
        if (Date.now() < bootScreenUnlockAt) {
          return;
        }
        if (screenOn && !puzzleSolved) {
          if (ARCADE_COMMANDS.has(getBootInputSuffix())) {
            openArcade();
            return;
          }
          beginJoinDiscordWorkflow();
        }
      });
    }

    // ─── Arcade overlay ─────────────────────────────────────────────────────

    function showArcadePicker() {
      if (arcadePicker) {
        arcadePicker.style.display = '';
      }
      if (arcadePlayer) {
        arcadePlayer.style.display = 'none';
      }
    }

    function showArcadePlayer() {
      if (arcadePicker) {
        arcadePicker.style.display = 'none';
      }
      if (arcadePlayer) {
        arcadePlayer.style.display = 'flex';
      }
    }

    function stopEmulator() {
      var ejsLoaderScript = document.getElementById('emulatorjs-loader');
      if (ejsLoaderScript) {
        ejsLoaderScript.remove();
      }
      var gameContainer = document.getElementById('game');
      if (gameContainer) {
        gameContainer.innerHTML = '';
      }
      // Keys based on the EmulatorJS stable API; update if the library version changes.
      var ejsKeys = ['EJS_player', 'EJS_core', 'EJS_gameUrl', 'EJS_pathtodata',
        'EJS_startOnLoaded', 'EJS_emulator', 'EJS_Buttons', 'EJS_gameID',
        'EJS_width', 'EJS_height'];
      ejsKeys.forEach(function(k) {
        try { delete window[k]; } catch (_) {}
      });
    }

    function populateArcadeGameList() {
      if (!arcadeGameList || !arcadeSystemSelect) {
        return;
      }
      var system = arcadeSystemSelect.value;
      var games = Array.isArray(arcadeManifest && arcadeManifest[system])
        ? arcadeManifest[system]
        : [];
      arcadeSelectedGame = null;
      if (arcadeLaunchBtn) {
        arcadeLaunchBtn.disabled = true;
      }
      arcadeGameList.innerHTML = '';
      if (games.length === 0) {
        var msg = document.createElement('div');
        msg.className = 'arcade-no-games';
        msg.textContent = 'NO ROMS FOUND FOR ' + system.toUpperCase()
          + '. ADD ROMS TO /ASSETS/ROMS/' + system.toUpperCase()
          + '/ AND UPDATE MANIFEST.JSON.';
        arcadeGameList.appendChild(msg);
        return;
      }
      games.forEach(function(game) {
        if (!game) {
          return;
        }
        // Support both {name, file} objects and plain filename strings.
        if (typeof game === 'string') {
          game = { name: game.replace(/\.[^.]+$/, ''), file: game };
        }
        if (typeof game.name !== 'string' || typeof game.file !== 'string') {
          return;
        }
        var btn = document.createElement('button');
        btn.className = 'arcade-game-item';
        btn.textContent = game.name;
        btn.type = 'button';
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', 'false');
        btn.addEventListener('click', function() {
          var allItems = arcadeGameList.querySelectorAll('.arcade-game-item');
          allItems.forEach(function(b) {
            b.classList.remove('selected');
            b.setAttribute('aria-selected', 'false');
          });
          btn.classList.add('selected');
          btn.setAttribute('aria-selected', 'true');
          arcadeSelectedGame = game;
          if (arcadeLaunchBtn) {
            arcadeLaunchBtn.disabled = false;
          }
          launchGame(system, game.file, game.name);
        });
        arcadeGameList.appendChild(btn);
      });
    }

    function launchGame(system, file, name) {
      stopEmulator();
      showArcadePlayer();
      if (arcadeNowPlaying) {
        arcadeNowPlaying.textContent = name;
      }
      window.EJS_player = '#game';
      window.EJS_core = system;
      window.EJS_gameUrl = '/assets/roms/' + system + '/' + encodeURIComponent(file);
      window.EJS_pathtodata = EJS_CDN_BASE;
      window.EJS_startOnLoaded = true;
      var script = document.createElement('script');
      script.id = 'emulatorjs-loader';
      script.src = EJS_CDN_BASE + 'loader.js';
      document.head.appendChild(script);
    }

    function exitArcadeFullscreen() {
      if (!arcadeFullscreen || !arcadeOverlay) {
        return;
      }
      arcadeFullscreen = false;
      arcadeOverlay.classList.remove('fullscreen');
      if (arcadeFullscreenBtn) {
        arcadeFullscreenBtn.textContent = 'FULLSCREEN';
        arcadeFullscreenBtn.setAttribute('aria-label', 'Toggle fullscreen');
      }
    }

    function toggleArcadeFullscreen() {
      if (!arcadeOverlay) {
        return;
      }
      arcadeFullscreen = !arcadeFullscreen;
      arcadeOverlay.classList.toggle('fullscreen', arcadeFullscreen);
      if (arcadeFullscreenBtn) {
        arcadeFullscreenBtn.textContent = arcadeFullscreen ? 'EXIT FS' : 'FULLSCREEN';
        arcadeFullscreenBtn.setAttribute('aria-label',
          arcadeFullscreen ? 'Exit fullscreen' : 'Toggle fullscreen');
      }
      setTimeout(function() {
        window.dispatchEvent(new Event('resize'));
      }, 50);
    }

    async function loadArcadeManifest() {
      if (arcadeManifest !== null) {
        return arcadeManifest;
      }
      try {
        var res = await fetch('/assets/roms/manifest.json', { cache: 'no-cache' });
        if (!res.ok) {
          arcadeManifest = {};
          return arcadeManifest;
        }
        arcadeManifest = await res.json();
      } catch (err) {
        console.warn('Failed to load arcade manifest:', err);
        arcadeManifest = {};
      }
      return arcadeManifest;
    }

    function openArcade() {
      if (!arcadeOverlay) {
        return;
      }
      showArcadePicker();
      arcadeOverlay.classList.add('visible');
      arcadeOverlay.setAttribute('aria-hidden', 'false');
      loadArcadeManifest().then(function() {
        populateArcadeGameList();
      }).catch(function(err) {
        console.warn('Failed to load arcade manifest:', err);
        populateArcadeGameList();
      });
    }

    function closeArcade() {
      if (!arcadeOverlay) {
        return;
      }
      exitArcadeFullscreen();
      stopEmulator();
      arcadeOverlay.classList.remove('visible');
      arcadeOverlay.setAttribute('aria-hidden', 'true');
      if (shoutboxInput) {
        shoutboxInput.focus();
      }
    }

    if (arcadeCloseBtn) {
      arcadeCloseBtn.addEventListener('click', function() {
        closeArcade();
      });
    }

    if (arcadeSystemSelect) {
      arcadeSystemSelect.addEventListener('change', function() {
        arcadeSelectedGame = null;
        if (arcadeLaunchBtn) {
          arcadeLaunchBtn.disabled = true;
        }
        populateArcadeGameList();
      });
    }

    if (arcadeLaunchBtn) {
      arcadeLaunchBtn.addEventListener('click', function() {
        if (!arcadeSelectedGame || !arcadeSystemSelect) {
          return;
        }
        launchGame(arcadeSystemSelect.value, arcadeSelectedGame.file, arcadeSelectedGame.name);
      });
    }

    if (arcadeBackBtn) {
      arcadeBackBtn.addEventListener('click', function() {
        stopEmulator();
        showArcadePicker();
        populateArcadeGameList();
      });
    }

    if (arcadeFullscreenBtn) {
      arcadeFullscreenBtn.addEventListener('click', function() {
        toggleArcadeFullscreen();
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

        if (text.startsWith(FINAL_PREFIX)) {
          const cmd = text.slice(FINAL_PREFIX.length).trim().toLowerCase();
          if (ARCADE_COMMANDS.has(cmd)) {
            resetFinalInput();
            openArcade();
            return;
          }
        }

        playWrongSound();
        resetFinalInput();
      });
    }
  }
});
const zeldaSecretAudio = new Audio('assets/audio/zelda-secret.v20260424.mp3');
zeldaSecretAudio.preload = 'auto';
zeldaSecretAudio.volume = 0.5;

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
