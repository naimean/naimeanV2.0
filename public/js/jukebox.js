(() => {
  const els = {
    shell: document.getElementById("jukeboxShell"),
    appleMusicBtn: document.getElementById("appleMusicBtn"),
    spotifyBtn: document.getElementById("spotifyBtn"),
    connectAppleBtn: document.getElementById("connectAppleBtn"),
    statusText: document.getElementById("statusText"),
    searchPanel: document.getElementById("searchPanel"),
    searchInput: document.getElementById("searchInput"),
    searchBtn: document.getElementById("searchBtn"),
    songResults: document.getElementById("songResults"),
    wrongAudio: document.getElementById("wrongAudio"),
    albumArt: document.getElementById("albumArt"),
    tickerText: document.getElementById("tickerText"),
    trackTitle: document.getElementById("trackTitle"),
    trackArtist: document.getElementById("trackArtist")
  };

  const JukeboxUI = {
    setStatus(message) {
      els.statusText.textContent = message;
    },

    showAppleConnect() {
      els.connectAppleBtn.classList.remove("hidden");
      els.searchPanel.classList.add("hidden");
    },

    showSearch() {
      els.connectAppleBtn.classList.add("hidden");
      els.searchPanel.classList.remove("hidden");
    },

    setNowPlaying(track) {
      const title = track?.attributes?.name || "Unknown Track";
      const artist = track?.attributes?.artistName || "Unknown Artist";
      const artwork = track?.attributes?.artwork?.url
        ? track.attributes.artwork.url.replace("{w}", "300").replace("{h}", "300")
        : "/assets/jukebox-placeholder.png";

      els.albumArt.src = artwork;
      els.trackTitle.textContent = title;
      els.trackArtist.textContent = artist;
      els.tickerText.textContent = `NOW PLAYING :: ${title} // ${artist} :: `;
    },

    setPlaying(isPlaying) {
      document.body.classList.toggle("is-playing", Boolean(isPlaying));
    },

    renderSongs(songs) {
      els.songResults.innerHTML = "";
      if (!songs.length) {
        els.songResults.innerHTML = "<p>No songs found.</p>";
        return;
      }

      for (const song of songs) {
        const title = song?.attributes?.name || "Unknown Track";
        const artist = song?.attributes?.artistName || "Unknown Artist";
        const artwork = song?.attributes?.artwork?.url
          ? song.attributes.artwork.url.replace("{w}", "160").replace("{h}", "160")
          : "/assets/jukebox-placeholder.png";

        const card = document.createElement("article");
        card.className = "song-card";
        card.innerHTML = `
          <img alt="">
          <div>
            <div class="song-card-title"></div>
            <div class="song-card-artist"></div>
            <button type="button">Play</button>
          </div>
        `;
        card.querySelector("img").setAttribute("src", artwork);
        card.querySelector(".song-card-title").textContent = title;
        card.querySelector(".song-card-artist").textContent = artist;
        card.querySelector("button").addEventListener("click", () => {
          AppleMusicProvider.playSong(song);
        });

        els.songResults.appendChild(card);
      }
    },

    spotifyTrap() {
      els.shell.classList.remove("warning-glow");
      void els.shell.offsetWidth;
      els.shell.classList.add("warning-glow");
      els.tickerText.textContent = "SPOTIFY TUNNEL NOT BUILT YET :: WRONG PIPE, BROTHER :: ";
      this.setStatus("Spotify tunnel not built yet.");
    }
  };

  const SpotifyProviderPlaceholder = {
    activate() {
      try {
        els.wrongAudio.currentTime = 0;
        els.wrongAudio.play();
      } catch (error) {
        console.warn("Could not play wrong.mp3", error);
      }
      JukeboxUI.spotifyTrap();
    }
  };

  const AppleMusicProvider = {
    music: null,
    ready: false,

    async select() {
      JukeboxUI.setStatus("Apple Music selected.");
      JukeboxUI.showAppleConnect();
    },

    async init() {
      // NAIMEAN_APPLE_MUSIC_DEVELOPER_TOKEN must be injected by the edge Worker
      // (src/index.js) via HTML transformation before serving this page.
      // Never hardcode the token here — it must remain server-side only.
      const token = window.NAIMEAN_APPLE_MUSIC_DEVELOPER_TOKEN;
      if (!token) {
        JukeboxUI.setStatus("Apple Music developer token missing. Add token injection on the Worker side.");
        return false;
      }

      if (!window.MusicKit) {
        JukeboxUI.setStatus("MusicKit JS did not load.");
        return false;
      }

      if (this.ready && this.music) {
        return true;
      }

      await window.MusicKit.configure({
        developerToken: token,
        app: {
          name: "Naimean Jukebox",
          build: "0.1.0"
        }
      });

      this.music = window.MusicKit.getInstance();
      this.ready = true;
      this.attachEvents();
      return true;
    },

    attachEvents() {
      if (!this.music || !this.music.addEventListener) return;
      try {
        this.music.addEventListener("playbackStateDidChange", () => {
          const state = this.music.playerState;
          JukeboxUI.setPlaying(String(state).toLowerCase().includes("playing"));
        });
      } catch (error) {
        console.warn("Playback listener not available", error);
      }
    },

    async authorize() {
      const ok = await this.init();
      if (!ok) return;

      try {
        await this.music.authorize();
        JukeboxUI.setStatus("Apple Music connected. Search the catalog.");
        JukeboxUI.showSearch();
      } catch (error) {
        console.error(error);
        JukeboxUI.setStatus("Apple Music authorization failed or was cancelled.");
      }
    },

    async search(term) {
      const ok = await this.init();
      if (!ok) return;

      const cleanTerm = String(term || "").trim();
      if (!cleanTerm) {
        JukeboxUI.setStatus("Type something to search.");
        return;
      }

      try {
        JukeboxUI.setStatus(`Searching Apple Music for "${cleanTerm}"...`);
        const results = await this.music.api.search(cleanTerm, {
          types: ["songs"],
          limit: 8,
          storefront: "us"
        });
        const songs = results?.songs?.data || [];
        JukeboxUI.renderSongs(songs);
        JukeboxUI.setStatus(`Found ${songs.length} song result(s).`);
      } catch (error) {
        console.error(error);
        JukeboxUI.setStatus("Apple Music search failed.");
      }
    },

    async playSong(song) {
      const ok = await this.init();
      if (!ok) return;

      try {
        JukeboxUI.setNowPlaying(song);
        JukeboxUI.setStatus("Loading track...");
        await this.music.setQueue({ song: song.id });
        await this.music.play();
        JukeboxUI.setPlaying(true);
        JukeboxUI.setStatus("Playing.");
      } catch (error) {
        console.error(error);
        JukeboxUI.setPlaying(false);
        JukeboxUI.setStatus("Playback failed. Confirm Apple Music authorization/subscription.");
      }
    }
  };

  function wireEvents() {
    els.appleMusicBtn.addEventListener("click", () => AppleMusicProvider.select());
    els.spotifyBtn.addEventListener("click", () => SpotifyProviderPlaceholder.activate());
    els.connectAppleBtn.addEventListener("click", () => AppleMusicProvider.authorize());
    els.searchBtn.addEventListener("click", () => AppleMusicProvider.search(els.searchInput.value));
    els.searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        AppleMusicProvider.search(els.searchInput.value);
      }
    });
  }

  wireEvents();
})();
