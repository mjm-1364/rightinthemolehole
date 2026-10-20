(() => {
  "use strict";

  // ---------- Settings ----------
  const GAME_SECONDS = 30;
  const MAX_PHOTOS = 30;
  const PHOTO_SIZE = 320; // px, square crop stored on device
  const DIFFICULTY = {
    easy:   { upMin: 1100, upMax: 1600, gapMin: 500, gapMax: 1000, maxUp: 1, speedup: 0.25 },
    normal: { upMin: 750,  upMax: 1200, gapMin: 300, gapMax: 750,  maxUp: 2, speedup: 0.40 },
    hard:   { upMin: 500,  upMax: 850,  gapMin: 180, gapMax: 450,  maxUp: 3, speedup: 0.50 },
  };
  const DEFAULT_MOLE = "🐹";
  const HIT_WORDS = ["BONK!", "WHACK!", "POW!", "GOTCHA!", "BAM!"];

  // ---------- Storage (safe) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };

  // array of { src: dataURL, name: string } (older saves were plain dataURL strings)
  let photos = store.get("wam.photos", []).map((p) => (typeof p === "string" ? { src: p, name: "" } : p));
  let difficulty = store.get("wam.difficulty", "normal");
  let soundOn = store.get("wam.sound", true);
  const bestKey = () => "wam.best." + difficulty;

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const screens = { menu: $("menu"), game: $("game"), results: $("results") };
  const show = (name) => Object.entries(screens).forEach(([k, el]) => el.classList.toggle("active", k === name));

  // ---------- Audio (generated, no files) ----------
  let actx;
  function beep({ freq = 440, to = freq, dur = 0.12, type = "square", vol = 0.15 }) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(actx.destination);
      o.start(t); o.stop(t + dur);
    } catch {}
  }
  const sfx = {
    hit:   () => { beep({ freq: 220, to: 60, dur: 0.15, type: "square", vol: 0.25 }); beep({ freq: 900, to: 1400, dur: 0.08, type: "triangle", vol: 0.1 }); },
    pop:   () => beep({ freq: 300, to: 600, dur: 0.06, type: "sine", vol: 0.05 }),
    tick:  () => beep({ freq: 660, dur: 0.1, type: "sine", vol: 0.15 }),
    go:    () => beep({ freq: 880, to: 1320, dur: 0.25, type: "triangle", vol: 0.2 }),
    end:   () => { beep({ freq: 523, dur: 0.15, type: "triangle" }); setTimeout(() => beep({ freq: 392, dur: 0.15, type: "triangle" }), 160); setTimeout(() => beep({ freq: 262, dur: 0.35, type: "triangle" }), 320); },
  };
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };

  // ---------- Photo import ----------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read " + file.name)); };
      img.src = url;
    });
  }
  function cropToSquare(img) {
    const c = document.createElement("canvas");
    c.width = c.height = PHOTO_SIZE;
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    // bias crop slightly toward the top — faces are usually in the upper part of a photo
    const sx = (img.naturalWidth - s) / 2;
    const sy = Math.max(0, (img.naturalHeight - s) * 0.3);
    c.getContext("2d").drawImage(img, sx, sy, s, s, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
    return c.toDataURL("image/jpeg", 0.8);
  }
  $("photoInput").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    let skipped = 0;
    for (const f of files) {
      if (photos.length >= MAX_PHOTOS) { skipped++; continue; }
      try { photos.push({ src: cropToSquare(await loadImage(f)), name: "" }); } catch { skipped++; }
    }
    savePhotos();
    if (skipped) alert(`${skipped} photo(s) couldn't be added (limit is ${MAX_PHOTOS}, or the format isn't supported).`);
  });
  function savePhotos() {
    while (!store.set("wam.photos", photos) && photos.length) photos.pop(); // storage full: drop extras
    renderThumbs();
  }

  // ---------- Contact import (Contact Picker API: Android Chrome) ----------
  const canPickContacts = "contacts" in navigator && "select" in navigator.contacts;
  $("contactsBtn").onclick = async () => {
    if (!canPickContacts) {
      const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      alert(iOS
        ? "iPhone doesn't let websites open your contacts yet.\n\nTip: open a contact, take a screenshot of their photo, then use \"Add photos\"."
        : "This browser can't open your contacts. Try Chrome on Android, or use \"Add photos\".");
      return;
    }
    try {
      const props = await navigator.contacts.getProperties().catch(() => ["name", "icon"]);
      if (!props.includes("icon")) { alert("This phone doesn't share contact photos with apps. Use \"Add photos\" instead."); return; }
      const picked = await navigator.contacts.select(["name", "icon"], { multiple: true });
      let added = 0, noPhoto = 0, full = 0;
      for (const c of picked) {
        const icon = c.icon && c.icon[0];
        if (!icon) { noPhoto++; continue; }
        if (photos.length >= MAX_PHOTOS) { full++; continue; }
        try {
          const name = ((c.name && c.name[0]) || "").split(" ")[0];
          photos.push({ src: cropToSquare(await loadImage(icon)), name });
          added++;
        } catch { noPhoto++; }
      }
      savePhotos();
      const notes = [];
      if (noPhoto) notes.push(`${noPhoto} contact(s) had no photo`);
      if (full) notes.push(`${full} skipped (limit is ${MAX_PHOTOS})`);
      if (picked.length && notes.length) alert(`Added ${added}. ${notes.join(", ")}.`);
    } catch (err) {
      if (err && err.name !== "AbortError") alert("Couldn't open contacts: " + (err.message || err));
    }
  };
  function renderThumbs() {
    const box = $("thumbs");
    box.innerHTML = "";
    photos.forEach((p, i) => {
      const d = document.createElement("div");
      d.className = "thumb";
      d.innerHTML = `<img alt=""><button aria-label="Remove">✕</button><span></span>`;
      d.querySelector("img").src = p.src;
      d.querySelector("img").alt = p.name || `mole photo ${i + 1}`;
      d.querySelector("span").textContent = p.name;
      d.querySelector("button").onclick = () => { photos.splice(i, 1); store.set("wam.photos", photos); renderThumbs(); };
      box.appendChild(d);
    });
    $("photoCount").textContent = `(${photos.length})`;
    $("noPhotos").hidden = photos.length > 0;
    $("clearPhotos").hidden = photos.length === 0;
  }
  $("clearPhotos").onclick = () => {
    if (confirm("Remove all photos?")) { photos = []; store.set("wam.photos", photos); renderThumbs(); }
  };

  // ---------- Menu controls ----------
  function renderDifficulty() {
    document.querySelectorAll("#difficulty button").forEach((b) => b.classList.toggle("on", b.dataset.d === difficulty));
    $("bestMenu").textContent = store.get(bestKey(), 0);
  }
  $("difficulty").addEventListener("click", (e) => {
    const d = e.target.dataset.d;
    if (!d) return;
    difficulty = d; store.set("wam.difficulty", d); renderDifficulty();
  });
  function renderSound() { $("soundBtn").textContent = soundOn ? "🔊 Sound on" : "🔇 Sound off"; }
  $("soundBtn").onclick = () => { soundOn = !soundOn; store.set("wam.sound", soundOn); renderSound(); };

  // ---------- Board ----------
  const board = $("board");
  const holes = [];
  for (let i = 0; i < 9; i++) {
    const hole = document.createElement("div");
    hole.className = "hole";
    const mole = document.createElement("div");
    mole.className = "mole";
    hole.appendChild(mole);
    board.appendChild(hole);
    const h = { hole, mole, up: false, hit: false, timer: null };
    hole.addEventListener("pointerdown", (e) => { e.preventDefault(); whack(h); });
    holes.push(h);
  }

  // ---------- Game state ----------
  let state = null;
  const rand = (a, b) => a + Math.random() * (b - a);

  function setMoleFace(h) {
    if (photos.length) {
      // avoid showing the same photo twice in a row when possible
      let idx;
      do { idx = Math.floor(Math.random() * photos.length); } while (photos.length > 1 && idx === state.lastPhoto);
      state.lastPhoto = idx;
      h.mole.style.backgroundImage = `url("${photos[idx].src}")`;
      h.mole.textContent = "";
      h.name = photos[idx].name;
    } else {
      h.name = "";
      h.mole.style.backgroundImage = "";
      h.mole.textContent = DEFAULT_MOLE;
    }
  }

  function popUp() {
    if (!state || !state.running) return;
    const cfg = DIFFICULTY[difficulty];
    const progress = 1 - state.timeLeft / GAME_SECONDS;      // 0 → 1 over the round
    const speed = 1 - cfg.speedup * progress;                // gets faster
    const upCount = holes.filter((h) => h.up).length;
    const free = holes.filter((h) => !h.up && h !== state.lastHole);
    if (upCount < cfg.maxUp && free.length) {
      const h = free[Math.floor(Math.random() * free.length)];
      state.lastHole = h;
      setMoleFace(h);
      h.up = true; h.hit = false;
      h.mole.classList.remove("hit");
      h.mole.classList.add("up");
      state.shown++;
      sfx.pop();
      h.timer = setTimeout(() => hide(h, true), rand(cfg.upMin, cfg.upMax) * speed);
    }
    state.spawnTimer = setTimeout(popUp, rand(cfg.gapMin, cfg.gapMax) * speed);
  }

  function hide(h, escaped) {
    clearTimeout(h.timer);
    h.up = false;
    h.mole.classList.remove("up", "hit");
    if (escaped && state && state.running) { state.combo = 0; renderCombo(); }
  }

  function whack(h) {
    if (!state || !state.running || !h.up || h.hit) return;
    h.hit = true;
    clearTimeout(h.timer);
    state.combo++;
    state.hits++;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    const points = state.combo >= 10 ? 3 : state.combo >= 5 ? 2 : 1;
    state.score += points;
    $("score").textContent = state.score;
    renderCombo();
    h.mole.classList.add("hit");
    sfx.hit(); buzz(25);
    const word = h.name ? `BONK ${h.name.toUpperCase()}!` : HIT_WORDS[Math.floor(Math.random() * HIT_WORDS.length)];
    fx(h.hole, "fx", (points > 1 ? `+${points} ` : "") + word);
    fx(h.hole, "star", "💥");
    setTimeout(() => hide(h, false), 180);
  }

  function fx(parent, cls, text) {
    const el = document.createElement("div");
    el.className = cls; el.textContent = text;
    parent.appendChild(el);
    setTimeout(() => el.remove(), 650);
  }

  function renderCombo() {
    const c = $("combo");
    if (state.combo >= 3) {
      c.textContent = `🔥 ${state.combo} combo${state.combo >= 10 ? " ×3" : state.combo >= 5 ? " ×2" : ""}`;
      c.classList.remove("pop"); void c.offsetWidth; c.classList.add("pop");
    } else c.textContent = "";
  }

  function renderTime() {
    $("time").textContent = Math.ceil(state.timeLeft);
    const fill = $("timebarFill");
    fill.style.width = (state.timeLeft / GAME_SECONDS) * 100 + "%";
    fill.classList.toggle("low", state.timeLeft <= 5);
  }

  async function countdown() {
    const cd = $("countdown");
    cd.hidden = false;
    for (const n of ["3", "2", "1", "GO!"]) {
      if (!state) break;
      cd.innerHTML = `<span>${n}</span>`;
      n === "GO!" ? sfx.go() : sfx.tick();
      await new Promise((r) => setTimeout(r, n === "GO!" ? 450 : 700));
    }
    cd.hidden = true;
  }

  async function startGame() {
    // unlock audio on iOS (must happen in the tap handler)
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch {}
    stopGame();
    holes.forEach((h) => hide(h, false));
    state = { score: 0, combo: 0, bestCombo: 0, hits: 0, shown: 0, timeLeft: GAME_SECONDS, running: false, lastHole: null, lastPhoto: -1 };
    $("score").textContent = "0";
    $("combo").textContent = "";
    renderTime();
    show("game");
    await countdown();
    if (!state) return;
    state.running = true;
    let last = performance.now(), lastWhole = GAME_SECONDS;
    state.clock = setInterval(() => {
      const now = performance.now();
      state.timeLeft = Math.max(0, state.timeLeft - (now - last) / 1000);
      last = now;
      renderTime();
      const whole = Math.ceil(state.timeLeft);
      if (whole !== lastWhole && whole <= 5 && whole > 0) sfx.tick();
      lastWhole = whole;
      if (state.timeLeft <= 0) endGame();
    }, 100);
    popUp();
  }

  function stopGame() {
    if (!state) return;
    state.running = false;
    clearInterval(state.clock);
    clearTimeout(state.spawnTimer);
    holes.forEach((h) => hide(h, false));
  }

  function endGame() {
    const s = state;
    stopGame();
    sfx.end(); buzz([60, 40, 60]);
    const best = store.get(bestKey(), 0);
    const isBest = s.score > best;
    if (isBest) store.set(bestKey(), s.score);
    $("finalScore").textContent = s.score;
    $("newBest").hidden = !isBest;
    const acc = s.shown ? Math.round((s.hits / s.shown) * 100) : 0;
    $("stats").textContent = `${s.hits} whacked · ${acc}% accuracy · best combo ${s.bestCombo} · ${difficulty}`;
    state = s; // keep for sharing
    show("results");
  }

  $("playBtn").onclick = startGame;
  $("againBtn").onclick = startGame;
  $("quitBtn").onclick = () => { stopGame(); state = null; $("countdown").hidden = true; renderDifficulty(); show("menu"); };
  $("menuBtn").onclick = () => { state = null; renderDifficulty(); show("menu"); };
  $("shareBtn").onclick = async () => {
    const text = `I scored ${state ? state.score : 0} in Whack-a-Mole (${difficulty})! Can you beat me?`;
    const url = location.href.split("#")[0];
    try {
      if (navigator.share) await navigator.share({ title: "Whack-a-Mole", text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); alert("Copied to clipboard!"); }
    } catch {}
  };

  // pause-safe: if the app goes to background mid-game, end the round
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state && state.running) endGame();
  });

  // ---------- Init ----------
  renderThumbs();
  renderDifficulty();
  renderSound();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
