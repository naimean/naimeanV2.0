(() => {
  const AUTH_SESSION_API_URL = '/auth/session';
  const AUTH_DISCORD_LOGIN_PATH = '/auth/discord/login';
  const AUTH_RESULT_QUERY_PARAM = 'auth';
  const POPUP_NAME = 'naimean-discord-auth';
  const POPUP_FEATURES = 'width=520,height=720,resizable=yes,scrollbars=yes';
  const STYLE_ID = 'naimean-auth-style';
  const AUTH_CONTAINER_ID = 'discord-auth-chip';
  const LOGIN_BUTTON_ID = 'discord-auth-login';
  const USER_CONTAINER_ID = 'discord-auth-user';
  const NAME_ID = 'discord-auth-name';
  const AVATAR_ID = 'discord-auth-avatar';
  const AVATAR_IMG_ID = 'discord-auth-avatar-image';
  const DISCORD_USER_ID_PATTERN = /^\d{5,30}$/;
  const DISCORD_AVATAR_HASH_PATTERN = /^(a_)?[a-f0-9]{32}$/i;
  const WRONG_ORIGIN = 'cross-origin-auth';
  const CLOSE_FALLBACK_MS = 9000;

  let authState = { authenticated: false, user: null };
  let popupWindow = null;
  let popupWatcherId = null;
  let pendingLogin = null;
  let chipElements = null;
  const sessionListeners = new Set();

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.discord-auth-chip {
  position: fixed;
  top: 10px;
  right: 10px;
  z-index: 200;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  max-width: min(320px, calc(100vw - 16px));
  pointer-events: auto;
  font-family: 'VT323', 'IBM Plex Mono', 'Courier New', monospace;
}

.discord-auth-login-btn {
  border: 1px solid rgba(142, 240, 178, 0.9);
  border-radius: 999px;
  background: rgba(6, 14, 8, 0.8);
  color: #8ef0b2;
  font-size: 1rem;
  line-height: 1;
  padding: 5px 14px 6px;
  cursor: pointer;
  letter-spacing: 0.05em;
  text-transform: none;
  box-shadow: 0 0 14px rgba(142, 240, 178, 0.32);
}

.discord-auth-login-btn:hover,
.discord-auth-login-btn:focus-visible {
  background: rgba(28, 68, 38, 0.92);
  box-shadow: 0 0 0 2px rgba(142, 240, 178, 0.35);
  outline: none;
}

.discord-auth-user {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.discord-auth-name {
  border: 1px solid rgba(142, 240, 178, 0.9);
  border-radius: 999px;
  background: rgba(6, 14, 8, 0.82);
  color: #8ef0b2;
  padding: 4px 11px 3px;
  max-width: 17ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0.05em;
  box-shadow: 0 0 12px rgba(142, 240, 178, 0.22);
}

.discord-auth-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(142, 240, 178, 0.9);
  background: rgba(6, 14, 8, 0.82);
  color: #8ef0b2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.98rem;
  text-transform: uppercase;
  overflow: hidden;
  box-shadow: 0 0 12px rgba(142, 240, 178, 0.22);
}

.discord-auth-avatar-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
    `.trim();
    document.head.appendChild(style);
  }

  function buildChip() {
    if (chipElements) {
      return chipElements;
    }

    const container = document.createElement('div');
    container.id = AUTH_CONTAINER_ID;
    container.className = 'discord-auth-chip';
    container.setAttribute('aria-live', 'polite');

    const loginBtn = document.createElement('button');
    loginBtn.id = LOGIN_BUTTON_ID;
    loginBtn.className = 'discord-auth-login-btn';
    loginBtn.type = 'button';
    loginBtn.textContent = 'Log in';

    const userWrapper = document.createElement('div');
    userWrapper.id = USER_CONTAINER_ID;
    userWrapper.className = 'discord-auth-user';
    userWrapper.hidden = true;

    const name = document.createElement('span');
    name.id = NAME_ID;
    name.className = 'discord-auth-name';
    name.textContent = '';

    const avatar = document.createElement('span');
    avatar.id = AVATAR_ID;
    avatar.className = 'discord-auth-avatar';
    avatar.textContent = '';

    const avatarImg = document.createElement('img');
    avatarImg.id = AVATAR_IMG_ID;
    avatarImg.className = 'discord-auth-avatar-image';
    avatarImg.alt = '';
    avatarImg.hidden = true;

    avatar.appendChild(avatarImg);
    userWrapper.appendChild(name);
    userWrapper.appendChild(avatar);
    container.appendChild(loginBtn);
    container.appendChild(userWrapper);

    document.body.appendChild(container);

    chipElements = {
      container,
      loginBtn,
      userWrapper,
      name,
      avatar,
      avatarImg,
    };

    loginBtn.addEventListener('click', () => {
      startDiscordAuth({ returnToPath: getCurrentPath(), preferPopup: true });
    });

    return chipElements;
  }

  function notifySessionListeners(nextState) {
    sessionListeners.forEach((listener) => {
      try {
        listener(nextState);
      } catch (_) {}
    });
  }

  function getCurrentPath() {
    const path = window.location.pathname || '/';
    const search = window.location.search || '';
    const hash = window.location.hash || '';
    return `${path}${search}${hash}`;
  }

  function sanitizeReturnPath(rawPath) {
    const fallback = '/';
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
      return fallback;
    }
    try {
      const url = new URL(rawPath, window.location.origin);
      if (url.origin !== window.location.origin) {
        return fallback;
      }
      return `${url.pathname}${url.search}${url.hash}`;
    } catch (_) {
      return fallback;
    }
  }

  function getDisplayName(user) {
    if (!user) return '';
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

  function renderAuthChip(state = authState) {
    const els = buildChip();
    if (!els) return;
    const isAuthed = Boolean(state && state.authenticated && state.user);
    const displayName = getDisplayName(state && state.user);

    if (!isAuthed) {
      els.loginBtn.hidden = false;
      els.userWrapper.hidden = true;
      els.name.textContent = '';
      els.avatarImg.hidden = true;
      els.avatarImg.src = '';
      els.avatar.textContent = '';
      return;
    }

    const avatarUrl = getDiscordAvatarUrl(state.user);
    const safeAvatarUrl = isSafeDiscordAvatarUrl(avatarUrl) ? avatarUrl : '';

    els.loginBtn.hidden = true;
    els.userWrapper.hidden = false;
    els.name.textContent = displayName || 'user';

    if (safeAvatarUrl) {
      els.avatarImg.src = safeAvatarUrl;
      els.avatarImg.hidden = false;
      els.avatar.textContent = '';
    } else {
      els.avatarImg.src = '';
      els.avatarImg.hidden = true;
      els.avatar.textContent = (displayName || 'U').charAt(0);
    }
  }

  async function refreshAuthSession() {
    try {
      const response = await fetch(AUTH_SESSION_API_URL, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        authState = { authenticated: false, user: null };
        renderAuthChip(authState);
        notifySessionListeners(authState);
        return authState;
      }
      const payload = await response.json();
      authState = {
        authenticated: Boolean(payload && payload.authenticated),
        user: payload && payload.user ? payload.user : null,
      };
    } catch (_) {
      authState = { authenticated: false, user: null };
    }
    renderAuthChip(authState);
    notifySessionListeners(authState);
    return authState;
  }

  function clearPopupWatcher() {
    if (popupWatcherId) {
      window.clearInterval(popupWatcherId);
      popupWatcherId = null;
    }
  }

  function resolvePendingLogin(status, nextPath) {
    if (pendingLogin && typeof pendingLogin.resolve === 'function') {
      pendingLogin.resolve({
        status,
        session: authState,
        nextPath: sanitizeReturnPath(nextPath || pendingLogin.nextPath || getCurrentPath()),
      });
      pendingLogin = null;
    }
  }

  function startPopupWatcher() {
    clearPopupWatcher();
    popupWatcherId = window.setInterval(async () => {
      if (!popupWindow || popupWindow.closed) {
        clearPopupWatcher();
        popupWindow = null;
        await refreshAuthSession();
        resolvePendingLogin(authState.authenticated ? 'success' : 'closed');
      }
    }, 800);
  }

  async function startDiscordAuth(options = {}) {
    const returnToPath = sanitizeReturnPath(options.returnToPath || getCurrentPath());
    const popupReturnTo = `/auth_popup_complete.html?next=${encodeURIComponent(returnToPath)}`;
    const loginUrl = `${AUTH_DISCORD_LOGIN_PATH}?returnTo=${encodeURIComponent(popupReturnTo)}`;

    const existingSession = await refreshAuthSession();
    if (existingSession.authenticated && existingSession.user && existingSession.user.provider === 'discord') {
      return { status: 'already', session: existingSession, nextPath: returnToPath };
    }

    popupWindow = window.open(loginUrl, POPUP_NAME, POPUP_FEATURES);
    if (!popupWindow) {
      window.location.assign(loginUrl);
      return { status: 'redirect', session: existingSession, nextPath: returnToPath };
    }

    pendingLogin = { resolve: null, nextPath: returnToPath };
    const resultPromise = new Promise((resolve) => {
      pendingLogin.resolve = resolve;
    });

    startPopupWatcher();
    try {
      popupWindow.focus();
    } catch (_) {}
    return resultPromise;
  }

  async function requireDiscordAuth(options = {}) {
    const targetPath = sanitizeReturnPath(options.returnToPath || getCurrentPath());
    const current = await refreshAuthSession();
    if (current.authenticated && current.user && current.user.provider === 'discord') {
      return { status: 'already', session: current, nextPath: targetPath };
    }
    const result = await startDiscordAuth({ returnToPath: targetPath, preferPopup: true });
    const refreshed = await refreshAuthSession();
    return {
      status: result && result.status ? result.status : 'completed',
      session: refreshed,
      nextPath: targetPath,
    };
  }

  function handlePopupMessage(event) {
    if (!event || event.origin !== window.location.origin) {
      return;
    }
    const data = event.data || {};
    if (data.type !== 'naimean-auth-result') {
      return;
    }

    const status = data.status || WRONG_ORIGIN;
    const nextPath = sanitizeReturnPath(data.nextPath || getCurrentPath());
    refreshAuthSession().then(() => {
      if (popupWindow && !popupWindow.closed) {
        try { popupWindow.close(); } catch (_) {}
      }
      clearPopupWatcher();
      resolvePendingLogin(status, nextPath);
    });
  }

  function consumeAuthOutcomeFromUrl() {
    try {
      const pageUrl = new URL(window.location.href);
      const authOutcome = pageUrl.searchParams.get(AUTH_RESULT_QUERY_PARAM);
      if (!authOutcome) {
        return '';
      }
      pageUrl.searchParams.delete(AUTH_RESULT_QUERY_PARAM);
      window.history.replaceState({}, document.title, pageUrl.pathname + pageUrl.search + pageUrl.hash);
      return authOutcome.trim().toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function initAuthChip() {
    injectStyles();
    buildChip();
    refreshAuthSession().catch(() => {});
  }

  function init() {
    initAuthChip();
    window.addEventListener('message', handlePopupMessage);
    const outcome = consumeAuthOutcomeFromUrl();
    // If the user landed on the page after an OAuth redirect (fallback),
    // refresh the session so the chip renders the new state immediately.
    if (outcome) {
      refreshAuthSession().catch(() => {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.NaimeanAuth = {
    refreshSession: refreshAuthSession,
    startLogin: startDiscordAuth,
    requireDiscordAuth,
    renderAuthState: renderAuthChip,
    getSession: () => authState,
    onSessionChange: (listener) => {
      if (typeof listener === 'function') {
        sessionListeners.add(listener);
        return () => sessionListeners.delete(listener);
      }
      return () => {};
    },
  };
})();
