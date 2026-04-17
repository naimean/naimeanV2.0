// Power button and blackout overlay toggle logic
document.addEventListener('DOMContentLoaded', function() {
  const DISCORD_URL = 'https://discord.gg/fvj4UrTpdp';
  const FINAL_PREFIX = 'C:\\Naimean\\';
  const FINAL_UNLOCK_VALUES = new Set([
    'C:\\Naimean\\please',
    'C:\\Naimean\\Please'
  ]);
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
  const bootInput = document.getElementById('boot-input');
  const bootForm = document.getElementById('boot-form');
  const bootVideo = document.getElementById('boot-video');
  const bootSubmit = document.getElementById('boot-submit');
  const returnBypassBtn = document.getElementById('return-bypass-btn');
  const c64Screen = document.querySelector('.c64-screen');
  const shoutboxForm = document.getElementById('shoutbox-form');
  const shoutboxInput = document.getElementById('shoutbox-input');
  const shoutboxHintShell = document.getElementById('shoutbox-hint-shell');
  const messages = document.getElementById('messages');
  const prankVideoOverlay = document.getElementById('prank-video-overlay');
  const prankVideo = document.getElementById('prank-video');
  const wrongAudio = new Audio('assets/wrong.mp3');
  wrongAudio.preload = 'auto';
  wrongAudio.load();
  let screenOn = false;
  let puzzleSolved = false;
  let prankRunning = false;
  let hintRevealProgress = 0;
  let lastPointerPosition = null;

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

  function resetInteractiveState() {
    if (shoutboxInput) {
      shoutboxInput.disabled = false;
    }

    resetFinalInput();
    resetHintReveal();
  }

  function playStaticTransition() {
    return new Promise((resolve) => {
      const overlay = document.getElementById('static-overlay');
      const vid = document.getElementById('static-video');
      if (!overlay || !vid) { resolve(); return; }
      overlay.classList.add('visible');
      vid.currentTime = 0;
      vid.play().catch(() => {});
      const onEnd = () => {
        overlay.classList.remove('visible');
        resolve();
      };
      vid.addEventListener('ended', onEnd, { once: true });
      vid.addEventListener('error', onEnd, { once: true });
      setTimeout(() => { overlay.classList.remove('visible'); resolve(); }, 4000);
    });
  }

  async function runPowerOffPrank() {
    if (prankRunning) return;
    prankRunning = true;

    const powerOffAudio = new Audio('assets/power-button.mp3');
    powerOffAudio.play().catch(() => {});

    await playStaticTransition();

    if (bootScreen) bootScreen.classList.remove('visible');
    if (shoutboxContainer) shoutboxContainer.classList.add('visible');
    if (prankVideoOverlay) prankVideoOverlay.classList.add('visible');

    try {
      prankVideo.currentTime = 0;
      await prankVideo.play();
    } catch (_) {}

    await delay(5000);
    window.location.assign(DISCORD_URL);
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

    playZeldaSecretSound();
    await new Promise((resolve) => {
      const onEnd = () => { zeldaSecretAudio.removeEventListener('ended', onEnd); zeldaSecretAudio.removeEventListener('error', onEnd); resolve(); };
      zeldaSecretAudio.addEventListener('ended', onEnd, { once: true });
      zeldaSecretAudio.addEventListener('error', onEnd, { once: true });
      setTimeout(resolve, 8000); // fallback cap
    });
    await delay(500);
    await playStaticTransition();

    shoutboxContainer.classList.add('visible');
    prankVideoOverlay.classList.add('visible');

    try {
      prankVideo.currentTime = 0;
      await prankVideo.play();
    } catch (_) {
      // Continue to redirect even if autoplay is blocked.
    }

    await delay(5000);
    window.location.assign(DISCORD_URL);
  }

  if (returnBypassBtn) {
    returnBypassBtn.addEventListener('click', function() {
      window.location.assign(DISCORD_URL);
    });
  }

  document.addEventListener('pointerdown', primeWrongAudio, { once: true });

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
        shoutboxContainer.classList.remove('visible');
        screenOn = true;
        await delay(700);
        bootScreen.classList.add('visible');
        if (bootInput) bootInput.focus();
      } else {
        // Turn off: rickroll them instead
        runPowerOffPrank();
      }
    });

    if (bootForm && bootInput && bootVideo && bootSubmit) {
      bootForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (screenOn && !puzzleSolved) {
          // Hide form controls and play static, then the newman-gate video.
          bootInput.style.display = 'none';
          bootSubmit.style.display = 'none';
          await playStaticTransition();
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
          }

          // Transition to input prompt (with native blinking caret) instead of a Discord screen.
          bootScreen.classList.remove('visible');
          await playStaticTransition();
          shoutboxContainer.classList.add('visible');
          if (shoutboxInput) {
            resetFinalInput();
            shoutboxInput.focus();
          }
          puzzleSolved = true;
        }
      });
    }

    if (shoutboxForm && shoutboxInput && messages) {
      shoutboxForm.addEventListener('submit', function(e) {
        e.preventDefault();

        const text = shoutboxInput.value.trim();
        if (!text) {
          return;
        }

        if (FINAL_UNLOCK_VALUES.has(text)) {
          runPleaseSequence();
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
  zeldaSecretAudio.currentTime = 0;
  zeldaSecretAudio.play().catch(() => {
    // If the mp3 file is missing, fall back to a short chime sequence.
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [783.99, 987.77, 1174.66, 1567.98];
    const start = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.14, start + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.14 + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start + i * 0.14);
      osc.stop(start + i * 0.14 + 0.13);
    });
  });
}

function addMessage(msg, messagesContainer) {
  const div = document.createElement('div');
  div.textContent = msg;
  div.className = 'c64-message';
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
