/*
 * 自动开局
 *
 * 时间表的每一步是（游戏 tick，出兵百分比）。游戏跑到那个 tick，就向无主地出兵一次，
 * 等同于你在地图上手动点一下空地。时间表在面板的文本框里，每行一步： tick 百分比
 *   62 25.98
 *   164 30.96
 * 改完点“应用”。默认带一份 9 步的时间表（只在浏览器里还没保存过设置时使用）。
 *
 * 口径（参考 CAT 客户端的源码）
 *   tick   = bi.kr() 的绝对值，也就是 CAT 面板里的 “Game tick”；tick 变小就视为新一局。
 *   百分比 = 派出的兵力占当前兵力的比例，发送前用游戏自己的 bD.gv.jB 找最接近的档位。
 *
 * 安全条件（任何一条不满足就什么都不做，每个周期都重新检查）
 
 *   2. 不是观战，对局进行中，并且自己的地块数大于 0。
 *   3. 这一步到点时确实和无主地接壤，并且有空闲的攻击名额，否则跳过这一步。
 *   4. 晚了超过 10 个 tick 的步骤直接跳过，不会补发。
 *   游戏接口对不上（比如游戏更新改了名字）时，面板会提示并自行停用。
 *
 * 面板
 *   ▼/▶（或双击标题栏）折叠 · ◐ 透明度 100%→55%→20%（20% 时内容区点击会穿透到游戏）
 *   × 隐藏（原处留一个小方块，点它恢复） · 拖动标题栏移动
 *   Alt+O 开关自动开局 · Alt+H 显示/隐藏面板
 *
 * 已知副作用
 *   游戏在会话里第一次发起攻击时，会把当时的出兵档位存进设置项 182，
 *   所以下一局滑块的初始位置可能变。
 *
 * 面板外观来自内嵌的 MikanUI（见下面一段）。如果别的脚本已经加载了 MikanUI，会直接共用。
 * 与仓库内置的“Auto opening”共用 window.__mikanAutoOpening 标记，两边同时存在时只有先加载的那个生效。
 */

/* ═════════ MikanUI（仿 ImGui 的面板库，纯界面） ═════════ */
(function () {
  'use strict';
  if (window.MikanUI) return;


  const STYLE_ID = "mikan-imgui-style";
  const FADE_LEVELS = [1, 0.55, 0.2];
  const FADE_NAMES = ["100%", "55%", "20%（穿透）"];

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function make(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  const CSS = `
  .mk-win{position:fixed;z-index:2147483646;box-sizing:border-box;background:rgba(15,15,15,.94);color:#fff;
    border:1px solid rgba(110,110,128,.5);border-radius:0;
    font:12px/1.4 "Cascadia Mono",Consolas,"SFMono-Regular",Menlo,"Microsoft YaHei","Noto Sans SC",monospace;
    opacity:var(--mk-fade,1);transition:opacity .15s;user-select:none;touch-action:none}
  .mk-win *{box-sizing:border-box}
  .mk-win:hover,.mk-win.mk-drag{opacity:1}
  .mk-win.mk-ghost{pointer-events:none}
  .mk-win.mk-ghost .mk-title{pointer-events:auto}
  .mk-win.mk-ghost:hover{pointer-events:auto}
  .mk-win.mk-hidden{display:none}
  .mk-title{display:flex;align-items:center;gap:3px;height:22px;padding:0 3px;background:#0a0a0a;cursor:move}
  .mk-win:hover .mk-title,.mk-win.mk-drag .mk-title{background:#294a7a}
  .mk-win.mk-collapsed{background:transparent}
  .mk-win.mk-collapsed .mk-title{background:rgba(0,0,0,.51)}
  .mk-win.mk-collapsed:hover .mk-title,.mk-win.mk-collapsed.mk-drag .mk-title{background:#294a7a}
  .mk-name{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  .mk-led{width:7px;height:7px;background:#808080;flex:none;margin-right:2px}
  .mk-led.on{background:#4296fa}
  .mk-led.warn{background:#ff6666}
  .mk-tbtn{flex:none;width:18px;height:18px;padding:0;border:0;border-radius:0;background:transparent;color:#fff;
    font:inherit;line-height:18px;text-align:center;cursor:pointer}
  .mk-tbtn:hover{background:rgba(66,150,250,.6)}
  .mk-body{padding:8px}
  .mk-win.mk-collapsed .mk-body{display:none}
  .mk-btn{font:inherit;color:#fff;background:rgba(66,150,250,.4);border:0;border-radius:0;padding:3px 8px;cursor:pointer}
  .mk-btn:hover{background:#4296fa}
  .mk-btn:active{background:#0f87fa}
  .mk-btn.mk-danger{background:rgba(255,102,102,.4)}
  .mk-btn.mk-danger:hover{background:#ff6666}
  .mk-check{display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer}
  .mk-box{width:14px;height:14px;background:rgba(41,74,122,.54);display:flex;align-items:center;justify-content:center;
    color:#4296fa;font-size:13px;line-height:1;font-weight:bold}
  .mk-check:hover .mk-box{background:rgba(66,150,250,.4)}
  .mk-input{font:inherit;color:#fff;background:rgba(41,74,122,.54);border:0;border-radius:0;padding:3px 4px;outline:none;user-select:text}
  .mk-input:hover{background:rgba(66,150,250,.4)}
  .mk-input:focus{background:rgba(66,150,250,.54)}
  .mk-input option{background:#0f0f0f;color:#fff}
  .mk-area{display:block;width:100%;resize:vertical;line-height:1.4}
  .mk-row{display:flex;align-items:center;gap:6px}
  .mk-grow{flex:1}
  .mk-dim{color:#808080}
  .mk-msg{min-height:16px;margin-top:6px;color:#808080}
  .mk-status{min-height:34px;margin-top:4px;line-height:1.4;color:#b0b0b0}
  .mk-status.on{color:#fff}
  .mk-status.warn{color:#ff6666}
  .mk-sep{height:1px;background:rgba(110,110,128,.5);margin:6px 0}
  .mk-handle{position:fixed;z-index:2147483646;width:12px;height:12px;background:#4296fa;opacity:.4;cursor:pointer}
  .mk-handle:hover{opacity:1}
  `;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ── 控件 ─────────────────────────────────────────────── */

  // 在输入控件上拦住键盘事件，避免触发页面（比如游戏）自己的快捷键
  function blockKeys(node) {
    ["keydown", "keyup", "keypress"].forEach(name => node.addEventListener(name, ev => ev.stopPropagation()));
  }

  // extraClass 可选："mk-danger" 红色按钮
  function button(text, title, extraClass) {
    const b = make("button", "mk-btn" + (extraClass ? " " + extraClass : ""), text);
    b.type = "button";
    if (title) b.title = title;
    return b;
  }

  // ImGui 风格复选框：返回 { el, set(v), get() }，点击逻辑由你写在 el.onclick 里
  function checkbox(label) {
    const wrap = make("label", "mk-check");
    const box = make("span", "mk-box");
    wrap.append(box, make("span", "", label));
    let on = false;
    return {
      el: wrap,
      set(v) { on = !!v; box.textContent = on ? "✓" : ""; wrap.dataset.on = on ? "1" : "0"; },
      get() { return on; }
    };
  }

  // 输入类控件。tag: "input" | "textarea" | "select"；extraClass 可选，textarea 用 "mk-area"
  function field(tag, extraClass) {
    const n = make(tag, "mk-input" + (extraClass ? " " + extraClass : ""));
    blockKeys(n);
    return n;
  }
  function select() { return field("select"); }

  // 文字。kind: "dim"（灰色）| "msg"（带上边距的提示行）
  function text(str, kind) {
    return make("div", kind === "msg" ? "mk-msg" : kind === "dim" ? "mk-dim" : "", str);
  }

  // 状态行：返回 { el, set(文字, tone) }，tone: "on"（白）| "warn"（红）| 其它（灰）
  function status() {
    const el = make("div", "mk-status");
    return {
      el,
      set(str, tone) {
        if (el.textContent !== str) el.textContent = str;
        el.className = "mk-status" + (tone === "warn" ? " warn" : tone === "on" ? " on" : "");
      }
    };
  }

  // 横排。children 里的元素用 style.flex 控制宽度，或给 class "mk-grow" 吃掉剩余空间
  function row(...children) {
    const r = make("div", "mk-row");
    r.append(...children);
    return r;
  }

  function separator() { return make("div", "mk-sep"); }

  /* ── 全局快捷键：一次显示 / 隐藏全部面板 ──────────────── */

  const registry = new Set();
  let hotkeyCode = "KeyH";
  let hotkeyHandler = null;

  function onHotkey(ev) {
    const t = document.activeElement;
    const typing = t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable);
    if (!hotkeyCode || ev.code !== hotkeyCode || !ev.altKey || ev.ctrlKey || ev.metaKey || ev.repeat || typing) return;
    const anyVisible = [...registry].some(p => !p.isHidden());
    registry.forEach(p => p.setHidden(anyVisible));
    ev.preventDefault();
  }
  function syncHotkeyListener() {
    const need = registry.size > 0 && !!hotkeyCode;
    if (need && !hotkeyHandler) {
      hotkeyHandler = onHotkey;
      document.addEventListener("keydown", hotkeyHandler, true);
    } else if (!need && hotkeyHandler) {
      document.removeEventListener("keydown", hotkeyHandler, true);
      hotkeyHandler = null;
    }
  }
  // 改键（配合 Alt）或关闭：setHotkey("KeyG")、setHotkey(null)
  function setHotkey(code) { hotkeyCode = code || null; syncHotkeyListener(); }

  /* ── 面板 ─────────────────────────────────────────────── */

  function makePanel({ id, title, width, left, top, initial, storage }) {
    injectStyle();

    // 界面状态（折叠、位置、透明度）单独存。storage:false 可关闭持久化。
    const UI_KEY = "mikanPanelUi:" + id;
    const persist = storage !== false;
    const ui = { collapsed: !!(initial && initial.collapsed), pos: (initial && initial.pos) || null, fade: 0 };
    if (persist) {
      try {
        const s = JSON.parse(localStorage.getItem(UI_KEY) || "null");
        if (s && typeof s === "object") {
          ui.collapsed = !!s.collapsed;
          ui.pos = s.pos || null;
          ui.fade = clamp(Math.round(Number(s.fade)) || 0, 0, FADE_LEVELS.length - 1);
        }
      } catch (e) { /* 读不到就用默认值 */ }
    }
    const saveUi = () => {
      if (!persist) return;
      try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* 存不了也不影响使用 */ }
    };

    const panel = make("section", "mk-win");
    panel.id = id;
    panel.style.left = left;
    panel.style.top = top;
    panel.style.width = width + "px";
    // 面板上的鼠标事件不要漏给下面的页面（比如游戏画布）
    ["mousedown", "mouseup", "touchstart", "touchend", "wheel", "click", "contextmenu"].forEach(name =>
      panel.addEventListener(name, ev => ev.stopPropagation()));

    const bar = make("div", "mk-title");
    const tbtn = glyph => { const b = make("button", "mk-tbtn", glyph); b.type = "button"; return b; };
    const arrow = tbtn("▼");
    const name = make("span", "mk-name", title);
    const led = make("span", "mk-led");
    const fadeBtn = tbtn("◐");
    const closeBtn = tbtn("×");
    bar.append(arrow, name, led, fadeBtn, closeBtn);

    const body = make("div", "mk-body");
    panel.append(bar, body);

    const handle = make("div", "mk-handle");
    handle.title = "显示「" + title + "」";
    handle.style.display = "none";
    ["mousedown", "mouseup", "click"].forEach(n => handle.addEventListener(n, ev => ev.stopPropagation()));

    let hidden = false;

    function applyCollapsed() {
      panel.classList.toggle("mk-collapsed", ui.collapsed);
      arrow.textContent = ui.collapsed ? "▶" : "▼";
      arrow.title = ui.collapsed ? "展开" : "折叠";
    }
    function applyFade() {
      panel.style.setProperty("--mk-fade", String(FADE_LEVELS[ui.fade]));
      panel.classList.toggle("mk-ghost", ui.fade === FADE_LEVELS.length - 1);
      fadeBtn.title = "透明度：" + FADE_NAMES[ui.fade] + "（点击切换）";
    }
    function setCollapsed(v) { ui.collapsed = !!v; applyCollapsed(); saveUi(); }
    function setHidden(v) {
      v = !!v;
      if (v === hidden) return;
      if (v) {
        const r = panel.getBoundingClientRect();
        handle.style.left = r.left + "px";
        handle.style.top = r.top + "px";
      }
      hidden = v;
      panel.classList.toggle("mk-hidden", hidden);
      handle.style.display = hidden ? "block" : "none";
    }

    arrow.onclick = () => setCollapsed(!ui.collapsed);
    bar.addEventListener("dblclick", ev => {
      if (!ev.target.closest("button")) setCollapsed(!ui.collapsed);
    });
    fadeBtn.onclick = () => { ui.fade = (ui.fade + 1) % FADE_LEVELS.length; applyFade(); saveUi(); };
    closeBtn.onclick = () => setHidden(true);
    handle.onclick = () => setHidden(false);

    function place(x, y) {
      panel.style.left = clamp(x, 0, Math.max(0, window.innerWidth - panel.offsetWidth)) + "px";
      panel.style.top = clamp(y, 0, Math.max(0, window.innerHeight - panel.offsetHeight)) + "px";
    }
    function restorePos() {
      if (ui.pos && Number.isFinite(ui.pos.x) && Number.isFinite(ui.pos.y)) {
        place(ui.pos.x * window.innerWidth, ui.pos.y * window.innerHeight);
      }
    }
    let drag = null;
    bar.addEventListener("pointerdown", ev => {
      if (ev.target.closest("button")) return;
      const r = panel.getBoundingClientRect();
      drag = { x: ev.clientX, y: ev.clientY, left: r.left, top: r.top };
      panel.classList.add("mk-drag");
      bar.setPointerCapture(ev.pointerId);
    });
    bar.addEventListener("pointermove", ev => {
      if (drag) place(drag.left + ev.clientX - drag.x, drag.top + ev.clientY - drag.y);
    });
    bar.addEventListener("pointerup", () => {
      if (!drag) return;
      drag = null;
      panel.classList.remove("mk-drag");
      const r = panel.getBoundingClientRect();
      ui.pos = { x: r.left / window.innerWidth, y: r.top / window.innerHeight };
      saveUi();
    });

    const api = {
      panel, body, handle,
      setTone(tone) { led.className = "mk-led" + (tone === "warn" ? " warn" : tone === "on" ? " on" : ""); },
      setCollapsed, setHidden,
      isHidden: () => hidden,
      mount() {
        document.body.append(panel, handle);
        applyCollapsed();
        applyFade();
        restorePos();
        window.addEventListener("resize", restorePos);
        registry.add(api);
        syncHotkeyListener();
      },
      unmount() {
        window.removeEventListener("resize", restorePos);
        registry.delete(api);
        syncHotkeyListener();
        panel.remove();
        handle.remove();
      }
    };
    return api;
  }

  window.MikanUI = { makePanel, button, checkbox, field, select, text, status, row, separator, injectStyle, setHotkey };
})();

/* ═════════ 自动开局 ═════════ */
(function () {
  'use strict';
  const { makePanel, checkbox, button, field, row, text, status } = window.MikanUI;

    const MAX_STEPS = 200;
    const TICK_MS = 56;   // 只用于把 tick 换算成秒来显示（按截图估算）
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const round2 = v => Math.round(v * 100) / 100;

  function parseSteps(text) {
    const out = [];
    let bad = 0;
    String(text).split(/\r?\n/).forEach(raw => {
      const line = raw.replace(/#.*$/, "").trim();
      if (!line) return;
      const m = line.match(/^(\d+(?:\.\d+)?)\s*[:,\s]\s*(\d+(?:\.\d+)?)\s*%?$/);
      if (!m) { bad++; return; }
      const t = Math.round(Number(m[1]));
      const p = Number(m[2]);
      if (!(p >= 1 && p <= 100) || t > 1000000) { bad++; return; }
      out.push({ t, p: round2(p) });
    });
    out.sort((a, b) => a.t - b.t);
    return { steps: out.slice(0, MAX_STEPS), bad };
  }

  function stepsToText(steps) {
    return steps.map(s => s.t + " " + s.p.toFixed(2)).join("\n");
  }

  function probe(bootAt, loadTimeout, needNeighbourCheck) {
    const w = window;
    const ok = w.aE && w.bB && w.bB.hz && typeof w.bB.hz.i6 === "function" &&
      w.ah && w.ah.hN && w.bD && w.bD.gv &&
      typeof w.bD.gv.hk === "function" && typeof w.bD.gv.hl === "function" &&
      (!needNeighbourCheck || (w.bv && typeof w.bv.i5 === "function"));
    if (ok) return null;
    return Date.now() - bootAt > loadTimeout ? "mismatch" : "loading";
  }

  function tickCounter() {
    try { return typeof window.bi.kr === "function" ? window.bi.kr() : null; } catch (e) { return null; }
  }

  function levelForPercent(p, me) {
    const gv = window.bD && window.bD.gv;
    const bal = window.ah && window.ah.hb && window.ah.hb[me];
    if (gv && typeof gv.jB === "function" && bal > 0) {
      const target = p / 100 * bal;
      let lo = 0, hi = 1023;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (gv.jB(me, mid) >= target) hi = mid; else lo = mid + 1;
      }
      if (lo > 0 && Math.abs(gv.jB(me, lo - 1) - target) < Math.abs(gv.jB(me, lo) - target)) lo--;
      return lo;
    }
    return clamp(Math.round(p * 10.24) - 1, 0, 1023);
  }

  function whenReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
    else fn();
  }



  const STORE = "mikanAutoOpening3";
  const LOAD_TIMEOUT = 30000;
  const MAX_ERRORS = 5;
  const CHECK_MS = 20;
  const LATE_TICKS = 10;

  // 默认时间表。只在浏览器里还没有保存过设置时使用。
  const DEFAULT_PRESET = [
    "62 25.98", "164 30.96", "259 32.52", "353 28.52", "369 35.55",
    "442 41.99", "458 45.02", "516 28.52", "529 28.52"
  ].join("\n");

  function start() {
    if (window.__mikanAutoOpening) return;
    window.__mikanAutoOpening = true;

    /* ── 设置 ───────────────────────────────────────── */
    const cfg = { enabled: true, steps: parseSteps(DEFAULT_PRESET).steps, collapsed: false, pos: null };
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || "null");
      if (saved && typeof saved === "object") {
        cfg.enabled = saved.enabled !== false;
        cfg.collapsed = !!saved.collapsed;
        cfg.pos = saved.pos || null;
        if (Array.isArray(saved.steps)) {
          cfg.steps = saved.steps
            .filter(s => s && Number.isFinite(s.t) && Number.isFinite(s.p) && s.p >= 1 && s.p <= 100)
            .map(s => ({ t: Math.max(0, Math.round(s.t)), p: round2(s.p) }))
            .sort((a, b) => a.t - b.t)
            .slice(0, MAX_STEPS);
        }
      }
    } catch (e) { /* 读不到就用默认值 */ }
    const save = () => {
      try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch (e) { /* 存不了也不影响使用 */ }
    };

    /* ── 运行状态 ───────────────────────────────────── */
    const bootAt = Date.now();
    const st = {
      sent: 0, skipped: 0, idx: 0, startAt: 0,
      wasInGame: false, lastKr: -1, errors: 0, dead: false, text: "", tone: "muted"
    };
    const setStatus = (text, tone) => { st.text = text; st.tone = tone || "muted"; };
    const secs = ticks => (ticks * TICK_MS / 1000).toFixed(1);

    function nowTick() {
      const k = tickCounter();
      if (k != null) return k;
      return Math.floor((Date.now() - st.startAt) / TICK_MS); // 没有 bi.kr 时的退路
    }
    // 从第一个“还没过期”的步骤开始，之前的步骤静默略过（比如对局进行到一半才启用）
    function seek(t) {
      for (let i = 0; i < cfg.steps.length; i++) if (cfg.steps[i].t >= t - LATE_TICKS) return i;
      return cfg.steps.length;
    }
    function startRun() {
      st.sent = 0; st.skipped = 0;
      st.startAt = Date.now();
      st.idx = seek(nowTick());
    }

    function step() {
      if (st.dead) return;
      if (!cfg.enabled) { setStatus("已关闭"); return; }

      const why = probe(bootAt, LOAD_TIMEOUT, true);
      if (why === "loading") { setStatus("等待游戏加载…"); return; }
      if (why === "mismatch") {
        st.dead = true;
        setStatus("游戏接口对不上，已停用（游戏可能更新过）", "warn");
        return;
      }

      const aE = window.aE;
      const me = aE.fJ, neutral = aE.fW;

      // 1. 必须是本地对局。联机时一律不动。
      const local = localState(aE);
      if (local !== "local") {
        st.wasInGame = false;
        setStatus(local === "conflict"
          ? "单人局标志不一致（lE 与 gIsSingleplayer），已暂停"
          : "当前不是单人局，已暂停");
        return;
      }
      if (aE.hi) { setStatus("观战中，已暂停"); return; }
      if (!Number.isInteger(me) || !Number.isInteger(neutral)) { setStatus("等待开局…"); return; }

      // 2. 对局进行中，且自己有地块
      const tiles = window.ah.hN[me] | 0;
      const inGame = !!(window.bD.gv.hk(1) && window.bD.gv.hl(me)) && tiles > 0;

      const kr = tickCounter();
      const restarted = kr != null && st.lastKr >= 0 && kr < st.lastKr;
      if (kr != null) st.lastKr = kr;

      if (!inGame) { st.wasInGame = false; setStatus("等待开局…"); return; }
      if (!st.wasInGame || restarted) { st.wasInGame = true; startRun(); }

      const t = nowTick();
      const steps = cfg.steps;
      if (!steps.length) { setStatus("还没有时间表：用录制器录一局，或在下面手写后点“应用”"); return; }

      const ae = window.ae;
      while (st.idx < steps.length && t >= steps[st.idx].t) {
        const s = steps[st.idx++];
        if (t - s.t > LATE_TICKS) { st.skipped++; continue; }
        if (!window.bv.i5(me)) { st.skipped++; continue; }       // 3. 必须和无主地接壤
        if (ae && typeof ae.kF === "function" && typeof ae.kY === "function") {
          if (!ae.kF(me, neutral) && !ae.kY(me)) { st.skipped++; continue; }
        }
        // 带上标记，录制器就不会把脚本自己发出的指令当成你的点击
        window.__mikanAutoSending = true;
        try { window.bB.hz.i6(levelForPercent(s.p, me), neutral); }
        finally { window.__mikanAutoSending = false; }
        st.sent++;
      }

      if (st.idx >= steps.length) {
        setStatus("开局完成 · 发出 " + st.sent + " 次，跳过 " + st.skipped + " 次");
      } else {
        const nx = steps[st.idx];
        setStatus("第 " + (st.idx + 1) + "/" + steps.length + " 步 · " + nx.p.toFixed(2) +
          "% · tick " + nx.t + "（现在 " + t + "，约 " + secs(Math.max(0, nx.t - t)) + " 秒后）", "on");
      }
    }

    function safeStep() {
      try {
        step();
        st.errors = 0;
      } catch (e) {
        st.errors++;
        console.error("[auto-opening]", e);
        if (st.errors >= MAX_ERRORS) {
          st.dead = true;
          setStatus("连续出错，已停用，详情见控制台", "warn");
        }
      }
      paint();
    }

    /* ── 面板（MikanUI，ImGui 风格） ─────────────────── */
    const ui = makePanel({
      id: "mikan-auto-opening", title: "自动开局", width: 244,
      left: "12px", top: "max(8px,min(332px,calc(100vh - 340px)))",
      initial: { collapsed: cfg.collapsed, pos: cfg.pos }   // 沿用旧版保存的折叠/位置
    });

    const chk = checkbox("自动开局（Alt+O）");
    const area = field("textarea", "mk-area");
    area.style.height = "110px";
    area.style.marginTop = "6px";
    area.placeholder = "每行一步：tick 百分比\n例：\n62 25.98\n164 30.96";
    area.spellcheck = false;
    area.value = stepsToText(cfg.steps);

    const applyBtn = button("应用");
    const clearBtn = button("清空");
    [applyBtn, clearBtn].forEach(b => { b.style.flex = "1"; });
    const tools = row(applyBtn, clearBtn);
    tools.style.marginTop = "6px";

    const note = text("", "msg");
    const statusLine = status();
    ui.body.append(chk.el, area, tools, note, statusLine.el);

    function paint() {
      chk.set(cfg.enabled);
      statusLine.set(st.text, st.tone);
      ui.setTone(st.tone);
    }

    chk.el.onclick = () => { cfg.enabled = !cfg.enabled; save(); safeStep(); };
    applyBtn.onclick = () => {
      const r = parseSteps(area.value);
      cfg.steps = r.steps; save();
      st.idx = st.wasInGame ? seek(nowTick()) : 0;
      area.value = stepsToText(cfg.steps);
      note.textContent = "已应用 " + r.steps.length + " 步" + (r.bad ? "，有 " + r.bad + " 行无法识别已忽略" : "");
      safeStep();
    };
    clearBtn.onclick = () => {
      cfg.steps = []; save(); st.idx = 0; area.value = ""; note.textContent = "已清空";
      safeStep();
    };

    const onKey = ev => {
      const t = document.activeElement;
      const typing = t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable);
      if (ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.repeat && ev.code === "KeyO" && !typing) {
        cfg.enabled = !cfg.enabled;
        save();
        safeStep();
        ev.preventDefault();
      }
    };
    document.addEventListener("keydown", onKey, true);

    /* ── 启动 ───────────────────────────────────────── */
    whenReady(() => {
      if (!document.body) return;
      ui.mount();
      safeStep();
      setInterval(safeStep, CHECK_MS);
    });
  }

  start();
})();
