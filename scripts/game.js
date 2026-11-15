import { LEVELS } from "./levels.js";
import { sdk } from "./sdk.js";
import { store_get, store_set } from "./storage.js";

const COLS = 4;
const LEVEL_STORAGE_KEY = "alphabetRouteLevel";
const PROGRESS_STORAGE_KEY = "alphabetRouteProgress";
const TUTORIAL_STORAGE_KEY = "alphabetRouteTutorialSeen";

function validLevelIndex(value) {
  return Number.isInteger(value) && value >= 0 && value < LEVELS.length;
}

function loadLevelIndex() {
  const saved = Number(store_get(LEVEL_STORAGE_KEY));
  return validLevelIndex(saved) ? saved : 0;
}

let levelIndex = loadLevelIndex();
const savedProgress = store_get(PROGRESS_STORAGE_KEY);
let unlockedLevel = Math.max(
  levelIndex,
  validLevelIndex(savedProgress?.unlockedLevel)
    ? savedProgress.unlockedLevel
    : 0,
);
let earnedStars =
  savedProgress?.stars && typeof savedProgress.stars === "object"
    ? { ...savedProgress.stars }
    : {};
let tutorialSeen = Boolean(
  savedProgress?.tutorialSeen ||
    store_get(TUTORIAL_STORAGE_KEY) ||
    unlockedLevel > 0 ||
    Object.keys(earnedStars).length > 0,
);

let B = LEVELS[levelIndex].tiles;
const isW = (i) => /^[A-Z]$/.test(B[i]);
const val = (i) =>
  isW(i) ? 1 : B[i] === "★" ? 2 : B[i] === "+" ? 1 : B[i] === "-" ? -1 : 0;
let W = B.map((s, i) => i)
  .filter(isW)
  .sort((a, b) => B[a].localeCompare(B[b]));

const nb = (i) => {
  const r = Math.floor(i / COLS),
    c = i % COLS,
    o = [];
  if (r > 0) o.push(i - COLS);
  if (r < 4) o.push(i + COLS);
  if (c > 0) o.push(i - 1);
  if (c < COLS - 1) o.push(i + 1);
  return o;
};

let path = [],
  bestPath = [],
  bestR = 1,
  showBest = false,
  bestRouteUnlockedForLevel = false,
  last = -1,
  failed = false,
  activePointer = null,
  pointerClick = false,
  muted = false,
  systemAudioEnabled = sdk.isAudioEnabled(),
  ac,
  isPaused = false,
  timerWasRunning = false,
  timerStartedAt = null,
  timerElapsed = 0,
  timerInterval = null;

function solve() {
  const used = Array(B.length).fill(0),
    p = [W[0]],
    solution = LEVELS[levelIndex].solution,
    solutionScore = solution.reduce((score, tile) => score + val(tile), 0);
  used[W[0]] = 1;
  let br = solutionScore / (solution.length - 1),
    bs = solutionScore,
    bp = solution.slice(),
    visited = 0;
  (function go(h, k, s, m) {
    if (visited++ >= 50000) return;
    if (k === W.length) {
      const r = s / m;
      if (r > br + 1e-9 || (Math.abs(r - br) < 1e-9 && s > bs)) {
        br = r;
        bs = s;
        bp = p.slice();
      }
      return;
    }
    for (const n of nb(h)) {
      if (visited >= 50000) return;
      if (used[n] || (isW(n) && n !== W[k])) continue;
      used[n] = 1;
      p.push(n);
      go(n, k + (n === W[k] ? 1 : 0), s + val(n), m + 1);
      p.pop();
      used[n] = 0;
    }
  })(W[0], 1, val(W[0]), 0);
  bestPath = bp;
  bestR = br;
}

const $ = (id) => document.getElementById(id);
const board = $("board"),
  route = $("route"),
  fx = $("fx"),
  labelMeasure = document.createElement("canvas").getContext("2d");

function fitWordLabels() {
  board.querySelectorAll(".wd").forEach((label) => {
    const tile = label.parentElement,
      width = tile.clientWidth,
      height = tile.clientHeight,
      styles = getComputedStyle(label),
      maxFontSize = Math.min(width * 0.26, height * 0.62);
    labelMeasure.font = `${styles.fontWeight} 100px ${styles.fontFamily}`;
    const textWidth = labelMeasure.measureText(label.textContent).width;
    const fontSize = Math.min(maxFontSize, (width * 0.86 * 100) / textWidth);
    label.style.fontSize = `${fontSize}px`;
  });
}

B.forEach((s, i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.i = i;
  b.dataset.p = (Math.floor(i / COLS) + (i % COLS)) % 2 ? "b" : "a";
  b.setAttribute(
    "aria-label",
    "Tile " +
      i +
      ", " +
      (isW(i)
        ? "letter " + s
        : s === "+"
          ? "coin"
          : s === "-"
            ? "ring, minus one"
            : s === "★"
              ? "star, plus two"
              : "blank"),
  );
  b.onpointerdown = (event) => {
    if (isPaused || activePointer !== null || event.button !== 0) return;
    event.preventDefault();
    activePointer = event.pointerId;
    pointerClick = true;
    tap(i, b);
  };
  b.onclick = (event) => {
    if (isPaused) return;
    if (event.detail > 0 && pointerClick) {
      pointerClick = false;
      return;
    }
    pointerClick = false;
    tap(i, b);
  };
  board.appendChild(b);
});

board.onpointermove = (event) => {
  if (isPaused || event.pointerId !== activePointer) return;
  const tile = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest(".t");
  if (!tile || !board.contains(tile)) return;
  const i = Number(tile.dataset.i);
  if (path[path.length - 1] !== i) tap(i, tile);
};

const stopSliding = (event) => {
  if (event.pointerId === activePointer) activePointer = null;
};
addEventListener("pointerup", stopSliding);
addEventListener("pointercancel", stopSliding);

function updateSoundUI() {
  const isSoundActive = !muted && systemAudioEnabled;
  const btn = $("snd");
  if (!btn) return;
  const label = isSoundActive ? "Sound on" : "Sound off";
  const labelEl = btn.querySelector(".btn-label");
  if (labelEl) labelEl.textContent = label;
  btn.setAttribute("aria-label", label);
  btn.title = label;
}

// Respect platform audio preference changes
sdk.onAudioEnabledChange((enabled) => {
  systemAudioEnabled = Boolean(enabled);
  if (!systemAudioEnabled) {
    if (ac && ac.state === "running") {
      ac.suspend().catch(() => {});
    }
  } else if (!muted && ac && ac.state === "suspended") {
    ac.resume().catch(() => {});
  }
  updateSoundUI();
});

function tone(f, d = 0.12, type = "triangle", v = 0.12) {
  if (muted || !systemAudioEnabled || isPaused) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") {
      ac.resume().catch(() => {});
    }
    const o = ac.createOscillator(),
      g = ac.createGain(),
      t = ac.currentTime;
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    o.stop(t + d);
  } catch (e) {}
}

const buzz = (p) => {
  try {
    navigator.vibrate && navigator.vibrate(p);
  } catch (e) {}
};

function done() {
  return W.every((word) => path.includes(word));
}

function renderTimer() {
  const elapsed =
    timerElapsed + (timerStartedAt === null ? 0 : Date.now() - timerStartedAt);
  const totalSeconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  $("timer").textContent =
    String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

function startTimer() {
  if (timerStartedAt !== null || isPaused) return;
  timerStartedAt = Date.now();
  renderTimer();
  timerInterval = setInterval(renderTimer, 1000);
}

function stopTimer() {
  if (timerStartedAt !== null) {
    timerElapsed += Date.now() - timerStartedAt;
    timerStartedAt = null;
  }
  clearInterval(timerInterval);
  timerInterval = null;
  renderTimer();
}

function resetTimer() {
  stopTimer();
  timerElapsed = 0;
  renderTimer();
}

function handlePause() {
  isPaused = true;
  activePointer = null;
  if (timerStartedAt !== null) {
    timerWasRunning = true;
    stopTimer();
  } else {
    timerWasRunning = false;
  }
  if (ac && ac.state === "running") {
    ac.suspend().catch(() => {});
  }
}

function handleResume() {
  isPaused = false;
  if (timerWasRunning && !done() && !failed) {
    startTimer();
  }
  if (systemAudioEnabled && !muted && ac && ac.state === "suspended") {
    ac.resume().catch(() => {});
  }
}

// Lifecycle hooks for platform pause/resume
sdk.onPause(handlePause);
sdk.onResume(handleResume);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    handlePause();
  } else {
    handleResume();
  }
});

let tt;
function toast(t) {
  const el = $("toast");
  el.textContent = t;
  el.hidden = false;
  clearTimeout(tt);
  tt = setTimeout(() => (el.hidden = true), 1500);
}

function bad(el, t) {
  if (t) toast(t);
  tone(150, 0.15, "square", 0.07);
  buzz(30);
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
}

function pop(i, v) {
  if (!v) return;
  const s = document.createElement("span");
  s.className = "pp " + (v > 0 ? "g" : "r");
  s.textContent = v > 0 ? `+${v}` : "\u22121";
  s.style.left = (i % COLS) * 25 + 12.5 + "%";
  s.style.top = Math.floor(i / COLS) * 20 + 3 + "%";
  fx.appendChild(s);
  setTimeout(() => s.remove(), 800);
}

function setBestRouteVisible(visible) {
  showBest = visible;
  const button = $("show");
  const isAd = sdk.hasRewardedAd() && !bestRouteUnlockedForLevel;
  const label = showBest
    ? "Hide best"
    : isAd
      ? "Best found [Ad]"
      : "Best found";
  button.querySelector(".btn-label").textContent = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(showBest));
  button.title = label;
  draw();
}

function tap(i, el) {
  if (isPaused) return;
  if (showBest) setBestRouteVisible(false);
  if (failed) return;
  startTimer();
  const at = path.indexOf(i);
  if (path.length === 0) {
    if (!isW(i)) return bad(el, "Choose a letter to start.");
    path.push(i);
    last = i;
    draw();
    tone(420, 0.1);
    return;
  }
  if (at > 0) {
    path = path.slice(0, at + 1);
    $("win").hidden = true;
    tone(300, 0.06);
    return draw();
  }
  if (at === 0 || done())
    return bad(el, done() ? "Route complete. Undo or reset." : "");
  if (!nb(path[path.length - 1]).includes(i)) return bad(el);
  path.push(i);
  last = i;
  pop(i, val(i));
  const v = val(i);
  tone(
    v < 0 ? 190 : 420 + path.length * 28,
    v < 0 ? 0.2 : 0.1,
    v < 0 ? "sawtooth" : "triangle",
    v < 0 ? 0.08 : 0.12,
  );
  if (v > 0) setTimeout(() => tone(880, 0.08, "square", 0.04), 60);
  buzz(v < 0 ? [20, 40, 20] : 10);
  draw();
  if (done()) {
    stopTimer();
    const letterPath = path.filter(isW);
    if (!letterPath.every((letter, index) => letter === W[index])) {
      failed = true;
      $("fail").hidden = false;
      tone(150, 0.15, "square", 0.07);
      buzz(30);
    } else {
      setTimeout(win, 450);
    }
  }
}

function win() {
  if (!done()) return;
  stopTimer();
  const sc = path.reduce((a, i) => a + val(i), 0),
    r = sc / (path.length - 1),
    pct = Math.max(0, Math.round((r / bestR) * 100)),
    n = pct >= 100 ? 3 : pct >= 70 ? 2 : 1;
  $("wr").textContent = r.toFixed(2);
  if (levelIndex === LEVELS.length - 1) {
    $("wp").textContent = `${pct}% of best route! All ${LEVELS.length} levels completed!`;
    $("next").textContent = "Play from Level 1";
  } else {
    $("wp").textContent = pct + "% of the best route found";
    $("next").textContent = "Next level";
  }
  $("stars").innerHTML = [0, 1, 2]
    .map((k) => '<span class="st' + (k < n ? " on" : "") + '"></span>')
    .join("");
  earnedStars[levelIndex] = Math.max(earnedStars[levelIndex] || 0, n);
  unlockedLevel = Math.max(
    unlockedLevel,
    Math.min(levelIndex + 1, LEVELS.length - 1),
  );
  renderLevelTray();
  saveProgress();
  $("win").hidden = false;
  [523, 659, 784, 1047].forEach((f, k) =>
    setTimeout(() => tone(f, 0.18, "triangle", 0.12), k * 110),
  );
  buzz([30, 50, 30, 50, 60]);
}

async function saveProgress() {
  const totalStars = Object.values(earnedStars).reduce((a, b) => a + b, 0);
  try {
    await store_set(PROGRESS_STORAGE_KEY, {
      unlockedLevel,
      stars: earnedStars,
      totalStars,
      tutorialSeen: true,
    });
    // Report score to platform engagement
    await sdk.score(totalStars);
  } catch (error) {
    console.error("Could not save level stars.", error);
    toast("Could not save level stars.");
  }
}

async function markTutorialSeen() {
  if (!tutorialSeen) {
    tutorialSeen = true;
    try {
      await store_set(TUTORIAL_STORAGE_KEY, true);
      await saveProgress();
    } catch (e) {
      console.warn("Could not save tutorialSeen state:", e);
    }
  }
}

const pts = (p) =>
  p
    .map((i) => (i % COLS) * 100 + 50 + "," + (Math.floor(i / COLS) * 100 + 50))
    .join(" ");

function draw() {
  $("current-level").textContent =
    levelIndex + 1 + " " + LEVELS[levelIndex].difficulty;
  $("prompt").textContent = path.length
    ? "Collect every letter in alphabetical order."
    : "";
  [...board.children]
    .filter((e) => e.tagName === "BUTTON")
    .forEach((el, i) => {
      const s = B[i],
        at = path.indexOf(i),
        bi = showBest ? bestPath.indexOf(i) : -1;
      el.setAttribute(
        "aria-label",
        "Tile " +
          i +
          ", " +
          (isW(i)
            ? "letter " + s
            : s === "+"
              ? "coin"
              : s === "-"
                ? "ring, minus one"
                : s === "★"
                  ? "star, plus two"
                  : "blank"),
      );
      el.className =
        "t " +
        el.dataset.p +
        (isW(i) ? " w" : "") +
        (at >= 0 ? " on" : "") +
        (at === path.length - 1 ? " head" : "") +
        (i === last && at > 0 ? " pop" : "");
      el.innerHTML =
        (isW(i)
          ? '<span class="wd">' + s + "</span>"
          : s === "+"
            ? '<span class="d"></span>'
            : s === "-"
              ? '<span class="o"></span>'
              : s === "★"
                ? '<span class="d2" aria-hidden="true">★</span>'
                : "") +
        (at >= 0 ? '<span class="n">' + (at + 1) + "</span>" : "") +
        (bi >= 0 ? '<span class="bn">' + (bi + 1) + "</span>" : "");
    });
  fitWordLabels();
  last = -1;
  route.innerHTML =
    (path.length > 1
      ? '<polyline class="ro" points="' +
        pts(path) +
        '"/><polyline class="ri" points="' +
        pts(path) +
        '"/>'
      : "") +
    (showBest
      ? '<polyline class="bp-outline" points="' +
        pts(bestPath) +
        '"/><polyline class="bp" points="' +
        pts(bestPath) +
        '"/>'
      : "");
  const sc = path.reduce((a, i) => a + val(i), 0),
    mv = Math.max(0, path.length - 1);
  $("sc").textContent = sc;
  $("mv").textContent = mv;
  $("pm").textContent = mv ? (sc / mv).toFixed(2) : "0.00";
  const collectedLetters = path.filter(isW).length;
  $("progress").setAttribute("aria-valuemax", W.length);
  $("progress").setAttribute("aria-valuenow", collectedLetters);
  $("progress-count").textContent = `${collectedLetters} / ${W.length}`;
  $("progress-fill").style.width = `${(collectedLetters / W.length) * 100}%`;
}

function renderLevelTray() {
  const list = $("level-list");
  list.replaceChildren();
  for (let index = 0; index <= unlockedLevel; index++) {
    const button = document.createElement("button");
    const stars = earnedStars[index] || 0;
    button.type = "button";
    button.className = "level-choice" + (index === levelIndex ? " current" : "");
    button.setAttribute(
      "aria-label",
      `Level ${index + 1}, ${stars} of 3 stars${index === levelIndex ? ", current level" : ""}`,
    );
    button.setAttribute("aria-current", index === levelIndex ? "page" : "false");
    button.innerHTML =
      '<span class="level-choice-number">' +
      (index + 1) +
      '</span><span class="level-choice-stars" aria-hidden="true">' +
      [0, 1, 2]
        .map((star) => '<span class="tray-star' + (star < stars ? " earned" : "") + '">★</span>')
        .join("") +
      "</span>";
    button.onclick = () => selectLevel(index);
    list.appendChild(button);
  }
}

function setLevel(index) {
  resetTimer();
  levelIndex = index;
  bestRouteUnlockedForLevel = false;
  showBest = false;
  B = LEVELS[levelIndex].tiles;
  W = B.map((s, i) => i)
    .filter(isW)
    .sort((a, b) => B[a].localeCompare(B[b]));
  path = [];
  failed = false;
  $("win").hidden = true;
  $("fail").hidden = true;
  solve();
  setBestRouteVisible(false);
  draw();
  renderLevelTray();
}

function toggleLevelTray(open) {
  const drawer = $("level-drawer"),
    button = $("level-toggle"),
    tray = $("level-tray");
  const expanded = open ?? !drawer.classList.contains("open");
  drawer.classList.toggle("open", expanded);
  button.setAttribute("aria-expanded", String(expanded));
  tray.inert = !expanded;
}

async function selectLevel(index) {
  if (!validLevelIndex(index) || index > unlockedLevel) return;
  try {
    await store_set(LEVEL_STORAGE_KEY, index);
  } catch (error) {
    console.error("Could not save selected level.", error);
    toast("Could not save selected level.");
    return;
  }
  setLevel(index);
  toggleLevelTray(false);
}

$("undo").onclick = () => {
  if (isPaused || failed) return;
  if (path.length > 1) path.pop();
  else if (path.length === 1) path = [];
  $("win").hidden = true;
  tone(300, 0.06);
  draw();
};

$("reset").onclick = $("again").onclick = () => {
  if (isPaused) return;
  resetTimer();
  path = [];
  failed = false;
  $("win").hidden = true;
  $("fail").hidden = true;
  tone(260, 0.08);
  draw();
};

$("retry").onclick = $("reset").onclick;

$("next").onclick = async () => {
  if (isPaused) return;
  const isLastLevel = levelIndex === LEVELS.length - 1;
  const nextLevel = (levelIndex + 1) % LEVELS.length;

  // Interstitial ad break every 5 levels if supported
  if (!isLastLevel && (levelIndex + 1) % 5 === 0 && sdk.isPlayables) {
    handlePause();
    await sdk.requestInterstitialAd();
    handleResume();
  }

  await selectLevel(nextLevel);
};

$("level-toggle").onclick = () => {
  if (isPaused) return;
  toggleLevelTray($("level-toggle").getAttribute("aria-expanded") !== "true");
};

$("help").onclick = () => {
  $("tutorial").hidden = false;
  $("start").focus();
};

$("start").onclick = () => {
  $("tutorial").hidden = true;
  markTutorialSeen();
  $("help").focus();
};

$("show").onclick = async () => {
  if (isPaused) return;
  if (showBest) {
    setBestRouteVisible(false);
    return;
  }

  // If rewarded ads are available and not yet watched for this level
  if (!bestRouteUnlockedForLevel && sdk.hasRewardedAd()) {
    handlePause();
    toast("Loading ad...");
    const rewarded = await sdk.requestRewardedAd("reveal-best-route");
    handleResume();
    if (rewarded) {
      bestRouteUnlockedForLevel = true;
      setBestRouteVisible(true);
      toast("Best route unlocked!");
    } else {
      toast("Complete the ad to reveal best route.");
    }
  } else {
    bestRouteUnlockedForLevel = true;
    setBestRouteVisible(true);
  }
};

$("snd").onclick = () => {
  muted = !muted;
  updateSoundUI();
  if (!muted && systemAudioEnabled) {
    tone(520, 0.08);
  }
};

// Keyboard accessibility: Escape closes modal or level drawer
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!$("tutorial").hidden) {
      $("start").click();
      return;
    }
    const drawer = $("level-drawer");
    if (drawer && drawer.classList.contains("open")) {
      toggleLevelTray(false);
      return;
    }
  }
});

const stg = $("stage");
function fit() {
  const r = stg.getBoundingClientRect();
  board.style.width =
    Math.max(120, Math.min(r.width - 28, (r.height - 28) * 0.8)) + "px";
  fitWordLabels();
}

addEventListener("resize", fit);
if (window.ResizeObserver) new ResizeObserver(fit).observe(stg);
document.fonts.ready.then(fitWordLabels);

solve();
draw();
renderLevelTray();
fit();
updateSoundUI();
setBestRouteVisible(false);

// Signal to YouTube Playables that first frame (loading screen) has rendered
requestAnimationFrame(() => {
  sdk.firstFrame();
});

// Dismiss loading screen when assets/fonts are ready and notify YouTube Playables gameReady
async function dismissLoadingScreen() {
  const loadingScreen = $("loading-screen");
  const loadingBarFill = $("loading-bar-fill");

  if (loadingBarFill) {
    loadingBarFill.style.width = "100%";
  }

  await Promise.all([
    document.fonts ? document.fonts.ready : Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 650)),
  ]);

  if (loadingScreen) {
    loadingScreen.classList.add("fade-out");
    setTimeout(() => {
      loadingScreen.hidden = true;
      sdk.ready();
      if (!tutorialSeen) {
        $("tutorial").hidden = false;
        $("start").focus();
      }
    }, 400);
  } else {
    sdk.ready();
    if (!tutorialSeen) {
      $("tutorial").hidden = false;
      $("start").focus();
    }
  }
}

dismissLoadingScreen();
