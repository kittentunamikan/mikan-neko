// Runtime access uses the exposed game objects after the client patch loads.

const STORE = "fx_auto_opening";
const PANEL_ID = "fx-auto-opening-panel";
const CHECK_MS = 20;
const LATE_TICKS = 10;
const MAX_STEPS = 200;

const defaults = {
  enabled: false,
  transparentHeader: false,
  collapsed: false,
  steps: [
    { t: 62, p: 25.98 },
    { t: 164, p: 30.96 },
    { t: 259, p: 32.52 }
  ]
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round2 = value => Math.round(value * 100) / 100;

function parseSteps(text) {
  const parsed = [];
  String(text).split(/\r?\n/).forEach(raw => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const match = line.match(/^(\d+(?:\.\d+)?)\s*[:,\s]\s*(\d+(?:\.\d+)?)\s*%?$/);
    if (!match) return;
    const tick = Math.round(Number(match[1]));
    const percent = Number(match[2]);
    if (tick < 0 || tick > 1000000 || percent < 1 || percent > 100) return;
    parsed.push({ t: tick, p: round2(percent) });
  });
  parsed.sort((a, b) => a.t - b.t);
  return parsed.slice(0, MAX_STEPS);
}

function stepsToText(steps) {
  return steps.map(step => `${step.t} ${step.p.toFixed(2)}`).join("\n");
}

function cloneDefaults() {
  return { ...defaults, steps: defaults.steps.map(step => ({ ...step })) };
}

function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (!saved || typeof saved !== "object") return cloneDefaults();
    return {
      ...defaults,
      ...saved,
      steps: Array.isArray(saved.steps) ? parseSteps(stepsToText(saved.steps)) : defaults.steps
    };
  } catch {
    return cloneDefaults();
  }
}

function saveConfig(config) {
  localStorage.setItem(STORE, JSON.stringify(config));
}

function gameApi() {
  const w = window;
  if (!w.aE || !w.ah || !w.bB?.hz || typeof w.bB.hz.i6 !== "function") return null;
  if (!w.bv || typeof w.bv.i5 !== "function") return null;
  if (!w.bD?.gv || typeof w.bD.gv.hk !== "function" || typeof w.bD.gv.hl !== "function") return null;
  return w;
}

function tickOf(w) {
  try {
    return typeof w.bi?.kr === "function" ? w.bi.kr() : null;
  } catch {
    return null;
  }
}

function levelForPercent(w, percent, player) {
  const balance = w.ah?.hb?.[player];
  const gv = w.bD?.gv;
  if (balance > 0 && typeof gv?.jB === "function") {
    const target = percent / 100 * balance;
    let low = 0;
    let high = 1023;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (gv.jB(player, mid) >= target) high = mid;
      else low = mid + 1;
    }
    if (low > 0 && Math.abs(gv.jB(player, low - 1) - target) < Math.abs(gv.jB(player, low) - target)) low--;
    return low;
  }
  return clamp(Math.round(percent * 10.24) - 1, 0, 1023);
}

function hasFreeAttack(w, player, neutral) {
  const attack = w.ae;
  if (!attack || typeof attack.kF !== "function" || typeof attack.kY !== "function") return true;
  return attack.kF(player, neutral) || attack.kY(player);
}

function isSingleplayer(w) {
  return w.aE.lE === true && w.aE.hi !== true;
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

class AutoOpening {
  constructor() {
    this.config = loadConfig();
    this.state = { index: 0, lastTick: -1, wasInGame: false, sent: 0, skipped: 0, status: "Idle", tone: "muted" };
    this.timer = 0;
    this.panel = null;
    this.body = null;
    this.status = null;
    this.toggleButton = null;
    this.header = null;
    this.mount();
  }

  mount() {
    if (document.getElementById(PANEL_ID)) return;
    this.panel = makeElement("section", "fx-auto-opening");
    this.panel.id = PANEL_ID;
    this.header = makeElement("header", "fx-auto-opening-header");
    const title = makeElement("strong", "fx-auto-opening-title", "Auto opening");
    const collapse = makeElement("button", "fx-auto-opening-icon", "-");
    collapse.type = "button";
    collapse.title = "Collapse";
    collapse.addEventListener("click", () => this.setCollapsed(!this.config.collapsed));
    this.header.append(title, collapse);

    this.body = makeElement("div", "fx-auto-opening-body");
    this.toggleButton = makeElement("button", "fx-auto-opening-wide");
    this.toggleButton.type = "button";
    this.toggleButton.addEventListener("click", () => {
      this.config.enabled = !this.config.enabled;
      saveConfig(this.config);
      if (!this.config.enabled) this.stop("Stopped by user");
    });

    const options = makeElement("div", "fx-auto-opening-options");
    const transparency = makeElement("label", "fx-auto-opening-check", "Transparent header");
    const transparencyInput = document.createElement("input");
    transparencyInput.type = "checkbox";
    transparencyInput.checked = this.config.transparentHeader;
    transparencyInput.addEventListener("change", () => {
      this.config.transparentHeader = transparencyInput.checked;
      saveConfig(this.config);
      this.applyStyle();
    });
    transparency.append(transparencyInput);
    options.append(transparency);

    const editor = document.createElement("textarea");
    editor.className = "fx-auto-opening-editor";
    editor.spellcheck = false;
    editor.value = stepsToText(this.config.steps);
    editor.title = "One step per line: tick percentage";
    const apply = makeElement("button", "fx-auto-opening-small", "Apply schedule");
    apply.type = "button";
    apply.addEventListener("click", () => {
      this.config.steps = parseSteps(editor.value);
      editor.value = stepsToText(this.config.steps);
      this.state.index = 0;
      saveConfig(this.config);
      this.setStatus(`${this.config.steps.length} steps loaded`, "muted");
    });

    this.status = makeElement("div", "fx-auto-opening-status");
    this.body.append(this.toggleButton, options, editor, apply, this.status);
    this.panel.append(this.header, this.body);
    document.body.append(this.panel);
    this.enableDragging(collapse);
    this.setCollapsed(this.config.collapsed, false);
    this.applyStyle();
    this.timer = window.setInterval(() => this.step(), CHECK_MS);
  }
  enableDragging(collapseButton) {
    let drag = null;
    this.header.addEventListener("pointerdown", event => {
      if (event.target === collapseButton || event.target.closest("button")) return;
      const rect = this.panel.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      this.header.setPointerCapture(event.pointerId);
    });
    this.header.addEventListener("pointermove", event => {
      if (!drag) return;
      const left = clamp(drag.left + event.clientX - drag.x, 0, Math.max(0, innerWidth - this.panel.offsetWidth));
      const top = clamp(drag.top + event.clientY - drag.y, 0, Math.max(0, innerHeight - this.panel.offsetHeight));
      this.panel.style.left = `${left}px`;
      this.panel.style.top = `${top}px`;
      this.panel.style.bottom = "auto";
    });
    this.header.addEventListener("pointerup", () => { drag = null; });
    this.header.addEventListener("pointercancel", () => { drag = null; });
  }

  applyStyle() {
    this.panel.classList.toggle("fx-auto-opening-transparent", this.config.transparentHeader);
  }


  setCollapsed(value, persist = true) {
    this.config.collapsed = value;
    this.panel.classList.toggle("fx-auto-opening-collapsed", value);
    this.header.querySelector("button").textContent = value ? "+" : "-";
    this.body.hidden = value;
    if (persist) saveConfig(this.config);
  }

  setStatus(text, tone = "muted") {
    this.state.status = text;
    this.state.tone = tone;
    if (this.status) {
      this.status.textContent = text;
      this.status.dataset.tone = tone;
    }
  }

  stop(reason) {
    this.config.enabled = false;
    saveConfig(this.config);
    this.setStatus(reason, "muted");
  }

  resetRun() {
    this.state.index = 0;
    this.state.sent = 0;
    this.state.skipped = 0;
  }

  step() {
    const w = gameApi();
    if (!w) {
      this.setStatus("Waiting for game API");
      return;
    }
    if (!this.config.enabled) {
      this.setStatus("Disabled");
      this.toggleButton.textContent = "Start auto opening";
      return;
    }
    this.toggleButton.textContent = "Stop auto opening";
    if (!isSingleplayer(w)) {
      this.setStatus("Paused: local singleplayer only");
      return;
    }

    const player = w.aE.fJ;
    const neutral = w.aE.fW;
    const tick = tickOf(w);
    const playing = Number.isInteger(player) && Number.isInteger(neutral) &&
      w.bD.gv.hk(1) && w.bD.gv.hl(player) && (w.ah.hN[player] | 0) > 0;
    if (!playing || tick === null) {
      this.state.wasInGame = false;
      this.setStatus("Waiting for local game");
      return;
    }
    if (!this.state.wasInGame || (this.state.lastTick >= 0 && tick < this.state.lastTick)) this.resetRun();
    this.state.wasInGame = true;
    this.state.lastTick = tick;

    while (this.state.index < this.config.steps.length && tick >= this.config.steps[this.state.index].t) {
      const step = this.config.steps[this.state.index++];
      if (tick - step.t > LATE_TICKS || !w.bv.i5(player) || !hasFreeAttack(w, player, neutral)) {
        this.state.skipped++;
        continue;
      }
      w.__fxAutoOpeningSending = true;
      try {
        w.bB.hz.i6(levelForPercent(w, step.p, player), neutral);
        this.state.sent++;
      } finally {
        w.__fxAutoOpeningSending = false;
      }
    }

    if (this.state.index >= this.config.steps.length) {
      this.setStatus(`Complete: ${this.state.sent} sent, ${this.state.skipped} skipped`, "on");
      return;
    }
    const next = this.config.steps[this.state.index];
    this.setStatus(`Next: ${next.p.toFixed(2)}% at tick ${next.t} (now ${tick})`, "on");
  }
}

const autoOpening = new AutoOpening();
export default autoOpening;
