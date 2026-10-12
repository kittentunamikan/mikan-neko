const STORE = "fx_auto_opening";
const CHECK_MS = 20;
const LATE_TICKS = 10;
const MAX_STEPS = 200;

const defaults = {
  enabled: false,
  steps: [{ t: 62, p: 25.98 }, { t: 164, p: 30.96 }, { t: 259, p: 32.52 }]
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round2 = value => Math.round(value * 100) / 100;
const cloneDefaults = () => ({ ...defaults, steps: defaults.steps.map(step => ({ ...step })) });

function parseSteps(text) {
  const result = [];
  String(text).split(/\r?\n/).forEach(raw => {
    const line = raw.replace(/#.*$/, "").trim();
    const match = line.match(/^(\d+(?:\.\d+)?)\s*[:,\s]\s*(\d+(?:\.\d+)?)\s*%?$/);
    if (!match) return;
    const tick = Math.round(Number(match[1]));
    const percent = Number(match[2]);
    if (tick >= 0 && tick <= 1000000 && percent >= 1 && percent <= 100) result.push({ t: tick, p: round2(percent) });
  });
  return result.sort((a, b) => a.t - b.t).slice(0, MAX_STEPS);
}

const stepsToText = steps => steps.map(step => `${step.t} ${step.p.toFixed(2)}`).join("\n");

function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (!saved || typeof saved !== "object") return cloneDefaults();
    return { ...defaults, ...saved, steps: Array.isArray(saved.steps) ? parseSteps(stepsToText(saved.steps)) : cloneDefaults().steps };
  } catch { return cloneDefaults(); }
}

const saveConfig = config => localStorage.setItem(STORE, JSON.stringify(config));

function gameApi() {
  const w = window;
  if (!w.aE || !w.ah || !w.bB?.hz || typeof w.bB.hz.i6 !== "function") return null;
  if (!w.bv || typeof w.bv.i5 !== "function") return null;
  if (!w.bD?.gv || typeof w.bD.gv.hk !== "function" || typeof w.bD.gv.hl !== "function") return null;
  return w;
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

class AutoOpening {
  constructor() {
    this.config = loadConfig();
    this.state = { index: 0, lastTick: -1, wasInGame: false, sent: 0, skipped: 0, status: "Stopped", tone: "muted" };
    window.setInterval(() => {
      this.step();
      this.syncCatPanel();
      this.updateCatPanel();
    }, CHECK_MS);
  }

  setEnabled(enabled) {
    this.config.enabled = Boolean(enabled);
    saveConfig(this.config);
    if (!enabled) this.state.status = "Stopped";
  }

  setSteps(value) {
    this.config.steps = Array.isArray(value) ? value : parseSteps(value);
    this.state.index = 0;
    saveConfig(this.config);
    return this.config.steps.slice();
  }

  getStepsText() { return stepsToText(this.config.steps); }
  getSnapshot() {
    return { ...this.state, enabled: this.config.enabled, steps: this.config.steps.slice() };
  }

  syncCatPanel() {
    if (!window.__fx?.settings?.showAutoOpening) {
      this.catControls?.box.remove();
      this.catControls = null;
      return;
    }
    const panel = document.getElementById("frontier-scout");
    if (!panel) return;
    const existing = panel.querySelector("[data-fx-auto-opening-controls]");
    if (existing) {
      if (this.catControls?.box === existing) return;
      existing.remove();
    }
    const groups = [...panel.querySelectorAll("details")];
    const opening = groups.find(group => group.querySelector("summary")?.textContent.includes("Opening card"));
    if (!opening) return;
    const body = opening.querySelector("div");
    if (!body) return;
    const box = document.createElement("div");
    box.dataset.fxAutoOpeningControls = "1";
    box.style.cssText = "margin-top:8px;padding-top:8px;border-top:1px solid #49625c";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "Start auto opening";
    toggle.style.cssText = "width:100%;padding:6px;background:#243d34;color:white;border:1px solid #8aad94;cursor:pointer";
    const schedule = document.createElement("textarea");
    schedule.value = this.getStepsText();
    schedule.title = "One step per line: tick percentage";
    schedule.style.cssText = "display:block;box-sizing:border-box;width:100%;height:70px;margin-top:6px;background:#122620;color:white;border:1px solid #719280;padding:5px;font:12px monospace";
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "Apply auto schedule";
    apply.style.cssText = "width:100%;margin-top:5px;padding:5px;background:#243d34;color:white;border:1px solid #8aad94;cursor:pointer";
    const status = document.createElement("small");
    status.style.cssText = "display:block;min-height:18px;margin-top:5px;color:#b7c8bc";
    toggle.onclick = () => this.setEnabled(!this.config.enabled);
    apply.onclick = () => { this.setSteps(schedule.value); };
    box.append(toggle, schedule, apply, status);
    body.append(box);
    panel.dataset.fxAutoOpening = "1";
    this.catControls = { panel, box, toggle, schedule, status };
  }

  updateCatPanel() {
    const controls = this.catControls;
    if (!controls || !controls.box.isConnected) { this.catControls = null; return; }
    const snapshot = this.getSnapshot();
    controls.toggle.textContent = snapshot.enabled ? "Stop auto opening" : "Start auto opening";
    controls.status.textContent = snapshot.status;
    controls.status.style.color = snapshot.tone === "on" ? "#b9f2c9" : "#b7c8bc";
  }

  stop
  stop(reason = "Stopped") {
    this.setEnabled(false);
    this.state.status = reason;
  }

  resetRun() {
    this.state.index = 0;
    this.state.sent = 0;
    this.state.skipped = 0;
  }

  step() {
    const w = gameApi();
    if (!w) return;
    if (!w.__fx?.settings?.showAutoOpening) {
      this.stop("Disabled in FX settings");
      return;
    }
    if (!this.config.enabled) {
      this.state.status = "Stopped";
      this.state.tone = "muted";
      return;
    }
    if (w.aE.lE !== true || w.aE.hi === true) {
      this.state.status = "Paused: local singleplayer only";
      this.state.tone = "muted";
      return;
    }

    const player = w.aE.fJ;
    const neutral = w.aE.fW;
    const tick = typeof w.bi?.kr === "function" ? w.bi.kr() : null;
    const playing = Number.isInteger(player) && Number.isInteger(neutral) && w.bD.gv.hk(1) && w.bD.gv.hl(player) && (w.ah.hN[player] | 0) > 0;
    if (!playing || tick === null) {
      this.state.wasInGame = false;
      this.state.status = "Waiting for local game";
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

    if (this.state.index >= this.config.steps.length) this.state.status = `Complete: ${this.state.sent} sent, ${this.state.skipped} skipped`;
    else {
      const next = this.config.steps[this.state.index];
      this.state.status = `Next: ${next.p.toFixed(2)}% at tick ${next.t} (now ${tick})`;
    }
    this.state.tone = "on";
  }
}

const autoOpening = new AutoOpening();
export default autoOpening;
