/**
 * Core Loading Debugger Overlay
 * --------------------------------------------
 * Provides a real-time, self-updating debug UI
 * for emulator/core loading pipelines (WASM, JS cores, etc.)
 *
 * Drop-in usage:
 *   const loader = new CoreLoaderDebugger();
 *   loader.mount(); // attach UI
 *   loader.loadCore(async () => { ... your core init ... });
 */

class CoreLoaderDebugger extends EventTarget {
  constructor(options = {}) {
    super();

    this.options = {
      containerId: options.containerId || "core-debugger",
      maxLines: options.maxLines || 200,
      showTimestamps: options.showTimestamps ?? true,
      autoScroll: options.autoScroll ?? true,
    };

    this.container = null;
    this.logBox = null;
    this.stateBox = null;

    this.state = {
      stage: "idle",
      progress: 0,
      message: "Waiting...",
    };
  }

  /* -----------------------------
   * UI MOUNT
   * ----------------------------- */
  mount() {
    if (document.getElementById(this.options.containerId)) return;

    this.container = document.createElement("div");
    this.container.id = this.options.containerId;
    this.container.style = `
      position: fixed;
      bottom: 12px;
      left: 12px;
      width: 420px;
      height: 220px;
      background: rgba(0,0,0,0.85);
      color: #00ff88;
      font-family: monospace;
      font-size: 12px;
      border: 1px solid #0f0;
      display: flex;
      flex-direction: column;
      z-index: 999999;
    `;

    this.stateBox = document.createElement("div");
    this.stateBox.style = `
      padding: 6px;
      border-bottom: 1px solid #0f0;
      color: #00ffcc;
    `;

    this.logBox = document.createElement("div");
    this.logBox.style = `
      flex: 1;
      overflow: auto;
      padding: 6px;
      white-space: pre-wrap;
    `;

    this.container.appendChild(this.stateBox);
    this.container.appendChild(this.logBox);
    document.body.appendChild(this.container);

    this.updateState("initialized", 0, "Debugger mounted");
  }

  /* -----------------------------
   * STATE UPDATE
   * ----------------------------- */
  updateState(stage, progress = 0, message = "") {
    this.state = { stage, progress, message };

    this.stateBox.textContent =
      `STAGE: ${stage.toUpperCase()} | ` +
      `PROGRESS: ${(progress * 100).toFixed(1)}% | ` +
      `${message}`;

    this.emit("state", this.state);
    this.log(`[STATE] ${stage} - ${message}`);
  }

  /* -----------------------------
   * LOGGING
   * ----------------------------- */
  log(message) {
    const line = document.createElement("div");

    const timestamp = this.options.showTimestamps
      ? `[${new Date().toLocaleTimeString()}] `
      : "";

    line.textContent = `${timestamp}${message}`;

    this.logBox.appendChild(line);

    // trim log size
    while (this.logBox.children.length > this.options.maxLines) {
      this.logBox.removeChild(this.logBox.firstChild);
    }

    if (this.options.autoScroll) {
      this.logBox.scrollTop = this.logBox.scrollHeight;
    }

    this.emit("log", message);
  }

  /* -----------------------------
   * CORE LOADER WRAPPER
   * ----------------------------- */
  async loadCore(loaderFn) {
    try {
      this.updateState("booting", 0.05, "Starting core loader");

      await this._fakeStep("Fetching core package", 0.2);
      await this._fakeStep("Decompressing core binary", 0.45);
      await this._fakeStep("Initializing runtime (WASM/JS)", 0.7);

      this.updateState("executing", 0.85, "Running core init function");

      if (loaderFn) {
        await loaderFn((stage, progress, msg) => {
          this.updateState(stage, progress, msg);
        });
      }

      this.updateState("ready", 1, "Core fully initialized");
      this.log("✔ Core is now running.");
    } catch (err) {
      this.updateState("error", 1, err.message);
      this.log(`❌ ERROR: ${err.message}`);
      throw err;
    }
  }

  /* -----------------------------
   * SIMULATED STEP (remove in real integration)
   * ----------------------------- */
  async _fakeStep(name, progress) {
    this.updateState("loading", progress, name);
    this.log(name + "...");
    await new Promise(r => setTimeout(r, 600));
  }

  /* -----------------------------
   * EVENT HELPERS
   * ----------------------------- */
  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

/* --------------------------------------------------
 * Example usage:
 * --------------------------------------------------
 *
 * const loader = new CoreLoaderDebugger();
 * loader.mount();
 *
 * loader.loadCore(async (update) => {
 *   update("init", 0.1, "Allocating memory");
 *   await new Promise(r => setTimeout(r, 500));
 *
 *   update("init", 0.5, "Loading assets");
 *   await new Promise(r => setTimeout(r, 800));
 *
 *   update("init", 0.9, "Finalizing");
 *   await new Promise(r => setTimeout(r, 400));
 * });
 *
 * --------------------------------------------------
 */

export default CoreLoaderDebugger;
