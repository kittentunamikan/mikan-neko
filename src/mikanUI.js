/*
 * MikanUI —— 仿 Dear ImGui 默认深色主题的小面板（全局变量版）
 *
 * 没有任何依赖，不碰游戏，只用 DOM。样式是注入的一个 <style id="mikan-imgui-style">，
 * 类名都以 mk- 开头，不会影响页面原有样式。
 *
 * ── 导出 ─────────────────────────────────────────────
 *   window.MikanUI = {
 *     makePanel, button, checkbox, field, select, text, status, row, separator,
 *     injectStyle, setHotkey
 *   }
 */

(function() {
"use strict";

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
.mk-tabs{margin:-8px -8px 8px -8px}
.mk-tabs-head{display:flex;border-bottom:1px solid rgba(110,110,128,.5);background:rgba(0,0,0,.3)}
.mk-tab-btn{flex:1;font:inherit;color:#b0b0b0;background:transparent;border:0;border-bottom:2px solid transparent;padding:8px 4px;cursor:pointer;transition:all .15s}
.mk-tab-btn:hover{color:#fff;background:rgba(66,150,250,.15)}
.mk-tab-btn.mk-active{color:#4296fa;border-bottom-color:#4296fa}
.mk-tab-body{padding:8px;display:none}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

/* ── 控件 ─────────────────────────────────────────────── */

function blockKeys(node) {
  ["keydown", "keyup", "keypress"].forEach(name => node.addEventListener(name, ev => ev.stopPropagation()));
}

function button(text, title, extraClass) {
  const b = make("button", "mk-btn" + (extraClass ? " " + extraClass : ""), text);
  b.type = "button";
  if (title) b.title = title;
  return b;
}

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

function field(tag, extraClass) {
  const n = make(tag, "mk-input" + (extraClass ? " " + extraClass : ""));
  blockKeys(n);
  return n;
}
function select() { return field("select"); }

function text(str, kind) {
  return make("div", kind === "msg" ? "mk-msg" : kind === "dim" ? "mk-dim" : "", str);
}

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

function row(...children) {
  const r = make("div", "mk-row");
  r.append(...children);
  return r;
}

function separator() { return make("div", "mk-sep"); }

// 标签页
function tabs(labels) {
  const wrap = make("div", "mk-tabs");
  const heads = make("div", "mk-tabs-head");
  const bodies = [];
  let active = 0;
  
  const btns = labels.map((label, i) => {
    const btn = make("button", "mk-tab-btn", label);
    btn.type = "button";
    btn.dataset.index = i;
    heads.appendChild(btn);
    
    const body = make("div", "mk-tab-body");
    body.style.display = i === 0 ? "block" : "none";
    bodies.push(body);
    
    btn.onclick = () => {
      if (active === i) return;
      btns[active].classList.remove("mk-active");
      bodies[active].style.display = "none";
      active = i;
      btns[active].classList.add("mk-active");
      bodies[active].style.display = "block";
    };
    
    return btn;
  });
  
  btns[0].classList.add("mk-active");
  wrap.append(heads, ...bodies);
  
  return { wrap, bodies, setActive: (i) => { if (btns[i]) btns[i].click(); } };
}

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
function setHotkey(code) { hotkeyCode = code || null; syncHotkeyListener(); }

/* ── 面板 ─────────────────────────────────────────────── */

function makePanel({ id, title, width, left, top, initial, storage }) {
  injectStyle();

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

/* ── 导出到全局 ───────────────────────────────────────── */
window.MikanUI = {
  makePanel, button, checkbox, field, select, text, status, row, separator, tabs,
  injectStyle, setHotkey
};

})();
