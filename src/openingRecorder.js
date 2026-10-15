/*
 * 这是什么
 *   一个只读的记录器：你在单人局里照自己的节奏手动点空地扩张，
 *   它把每一次点击记成一行“tick 百分比”，例如：
 *       62 25.98
 *       164 30.96
 *   默认每局开局自动开始录，录到设定的 tick 就自动保存。
 *   最近 10 局都会留着，可以切换、复制、删除。
 *   复制出来的文本直接粘贴进“单人自动开局”的文本框，点“应用”即可。
 *
 * 数据从哪来（都参考 CAT 客户端的源码）
 *   tick   = bi.kr()，也就是 CAT 面板里显示的 “Game tick”，用绝对值。
 *   百分比 = bD.gv.jB(玩家, 档位) ÷ 当前兵力 × 100，
 *            即这次点击实际派出的兵力占当时兵力的比例，
 *            和游戏滑块上显示的 “200 (28%)” 是同一个口径。
 *   接口缺失时，百分比退回 (档位+1)/10.24 的估算。
 *
 * 它做什么、不做什么
 *   · 临时包住游戏的出兵入口 bB.hz.i6，只在你点击时读取参数，然后原样交给游戏。
 *   · 只记录“单人局（aE.lE 为真）里点向无主地”的点击；联机不录，打别人也不录。
 *   · 脚本自己（自动开局）发出的指令带有标记，不会被当成你的点击记进去。
 *   · 从不发送任何指令，不改任何游戏数据。
 */
(function () {
  'use strict';
  if (window.__mikanOpeningRecorder) return;
  window.__mikanOpeningRecorder = true;

  var STORE = 'mikanOpeningRecorder';
  var MAX_RUNS = 10;
  var MAX_STEPS = 200;
  var CHECK_MS = 50;
  var LOAD_TIMEOUT = 30000;
  var MAX_ERRORS = 5;
  var TICK_MS = 56;           // 只用于把 tick 换算成秒来显示

  var C = {
    ink: '#2a1b12', inkSoft: '#3a281b', line: '#6b4a32',
    text: '#f7ead8', muted: '#b69a80', mikan: '#f29a2e', mikanDeep: '#c4731a',
    warn: '#e5735a'
  };

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function round2(v) { return Math.round(v * 100) / 100; }
  function two(n) { return n < 10 ? '0' + n : String(n); }

  /* ── 设置与历史 ───────────────────────────────────── */
  var cfg = { auto: true, window: 700, runs: [], collapsed: false, pos: null };
  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && typeof saved === 'object') {
      cfg.auto = saved.auto !== false;
      cfg.window = clamp(Math.round(Number(saved.window)) || cfg.window, 50, 5000);
      cfg.collapsed = !!saved.collapsed;
      cfg.pos = saved.pos || null;
      if (Array.isArray(saved.runs)) {
        cfg.runs = saved.runs
          .filter(function (r) { return r && Array.isArray(r.steps) && r.steps.length; })
          .map(function (r) {
            return {
              at: Number(r.at) || 0,
              steps: r.steps
                .filter(function (s) { return s && Number.isFinite(s.t) && Number.isFinite(s.p); })
                .map(function (s) { return { t: Math.max(0, Math.round(s.t)), p: round2(s.p) }; })
                .slice(0, MAX_STEPS)
            };
          })
          .filter(function (r) { return r.steps.length; })
          .slice(0, MAX_RUNS);
      }
    }
  } catch (e) { /* 读不到就用默认值 */ }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch (e) { /* 存不了也不影响使用 */ }
  }

  function stepsToText(steps) {
    return steps.map(function (s) { return s.t + ' ' + s.p.toFixed(2); }).join('\n');
  }
  function runLabel(r) {
    var d = new Date(r.at);
    var last = r.steps.length ? r.steps[r.steps.length - 1].t : 0;
    return two(d.getMonth() + 1) + '/' + two(d.getDate()) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()) +
      ' · ' + r.steps.length + ' 步 · 到 tick ' + last;
  }

  /* ── 游戏接口 ─────────────────────────────────────── */
  var bootAt = Date.now();

  function probe() {
    var w = window;
    var ok = w.aE && w.bB && w.bB.hz && typeof w.bB.hz.i6 === 'function' &&
      w.ah && w.ah.hN && w.bD && w.bD.gv &&
      typeof w.bD.gv.hk === 'function' && typeof w.bD.gv.hl === 'function';
    if (ok) return null;
    return Date.now() - bootAt > LOAD_TIMEOUT ? 'mismatch' : 'loading';
  }
  function tickCounter() {
    try { return typeof window.bi.kr === 'function' ? window.bi.kr() : null; } catch (e) { return null; }
  }
  // 这个档位实际派出的兵力占当前兵力的百分比
  function percentOf(lv) {
    var me = window.aE.fJ;
    var gv = window.bD && window.bD.gv;
    var bal = window.ah && window.ah.hb && window.ah.hb[me];
    if (gv && typeof gv.jB === 'function' && bal > 0) {
      var troops = gv.jB(me, lv);
      if (Number.isFinite(troops)) return clamp(troops / bal * 100, 0, 100);
    }
    return (lv + 1) / 10.24;
  }

  /* ── 录制 ─────────────────────────────────────────── */
  var rec = { active: false, steps: [] };
  var st = { wasInGame: false, lastKr: -1, errors: 0, dead: false, text: '', tone: 'muted' };
  var sel = 0;

  function onClick(lv, target) {
    if (!rec.active || window.__mikanAutoSending) return;
    var aE = window.aE;
    if (!aE || !aE.lE || target !== aE.fW) return;
    var t = tickCounter();
    if (t == null || rec.steps.length >= MAX_STEPS) return;
    rec.steps.push({ t: t, p: round2(percentOf(clamp(lv | 0, 0, 1023))) });
  }

  // 每个 hz 对象只包一次；游戏换了新对象时会重新包
  function install() {
    var hz = window.bB && window.bB.hz;
    if (!hz || hz.__mikanRecInstalled || typeof hz.i6 !== 'function') return;
    var orig = hz.i6;
    hz.i6 = function (lv, target) {
      try { onClick(lv, target); } catch (e) { /* 记录出错不能影响游戏本身 */ }
      return orig.apply(this, arguments);
    };
    hz.__mikanRecInstalled = true;
  }

  function begin() {
    rec.active = true;
    rec.steps = [];
    note.textContent = '';
  }
  function finish(reason) {
    if (!rec.active) return;
    rec.active = false;
    var steps = rec.steps;
    rec.steps = [];
    if (steps.length) {
      cfg.runs.unshift({ at: Date.now(), steps: steps });
      cfg.runs = cfg.runs.slice(0, MAX_RUNS);
      sel = 0;
      save();
      drawRuns();
      note.textContent = '已保存 ' + steps.length + ' 步' + (reason ? '（' + reason + '）' : '');
    } else {
      note.textContent = '这局没有记录到点击' + (reason ? '（' + reason + '）' : '');
    }
  }

  function step() {
    if (st.dead) return;

    var why = probe();
    if (why === 'loading') { setStatus('等待游戏加载…'); return; }
    if (why === 'mismatch') {
      st.dead = true;
      setStatus('游戏接口对不上，脚本已停用（游戏可能更新过）', 'warn');
      return;
    }
    install();

    var aE = window.aE;
    var me = aE.fJ;

    if (!aE.lE) {
      st.wasInGame = false;
      finish('离开单人局');
      setStatus('当前不是单人局，不录制');
      return;
    }
    if (aE.hi) { setStatus('观战中，不录制'); return; }
    if (!Number.isInteger(me)) { setStatus('等待开局…'); return; }

    var tiles = window.ah.hN[me] | 0;
    var inGame = !!(window.bD.gv.hk(1) && window.bD.gv.hl(me)) && tiles > 0;

    var kr = tickCounter();
    var restarted = kr != null && st.lastKr >= 0 && kr < st.lastKr;
    if (kr != null) st.lastKr = kr;

    if (!inGame) {
      if (st.wasInGame) finish('对局结束');
      st.wasInGame = false;
      setStatus(cfg.auto ? '等待单人局开局，会自动开始录制' : '自动录制已关闭');
      return;
    }
    if (!st.wasInGame || restarted) {
      if (restarted) finish('新的一局');
      st.wasInGame = true;
      if (cfg.auto) begin();
    }

    if (rec.active) {
      if (kr != null && kr >= cfg.window) { finish('到达设定 tick'); setStatus('本局录制完成'); return; }
      setStatus('录制中 · tick ' + (kr == null ? '?' : kr) + ' / ' + cfg.window + ' · 已记录 ' + rec.steps.length + ' 步', 'on');
    } else {
      setStatus(cfg.auto ? '本局录制已结束' : '没有在录制，点“开始录制”可从现在开始');
    }
  }

  function safeStep() {
    try {
      step();
      st.errors = 0;
    } catch (e) {
      st.errors++;
      console.error('[mikan-opening-recorder]', e);
      if (st.errors >= MAX_ERRORS) {
        st.dead = true;
        rec.active = false;
        setStatus('连续出错，脚本已停用，详情见控制台', 'warn');
      }
    }
    paint();
  }

  /* ── 面板 ─────────────────────────────────────────── */
  function el(tag, css, text) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = text;
    return n;
  }
  function btn(text, css, title) {
    var b = el('button', 'font:inherit;cursor:pointer;color:' + C.text + ';background:' + C.inkSoft +
      ';border:1px solid ' + C.line + ';border-radius:3px;padding:5px 8px;' + (css || ''), text);
    b.type = 'button';
    if (title) b.title = title;
    return b;
  }
  function setStatus(text, tone) { st.text = text; st.tone = tone || 'muted'; }

  var panel = el('section',
    'position:fixed;left:268px;top:max(8px,min(332px,calc(100vh - 340px)));z-index:2147483646;width:252px;' +
    'background:' + C.ink + ';color:' + C.text + ';border:1px solid ' + C.line + ';border-radius:6px;' +
    'font:13px/1.35 system-ui,-apple-system,"Segoe UI","Noto Sans SC",sans-serif;' +
    'box-shadow:0 6px 20px rgba(0,0,0,.55);user-select:none;touch-action:none');
  panel.id = 'mikan-opening-recorder';
  ['mousedown', 'mouseup', 'touchstart', 'touchend', 'wheel', 'click', 'contextmenu'].forEach(function (name) {
    panel.addEventListener(name, function (ev) { ev.stopPropagation(); });
  });

  var bar = el('div', 'display:flex;align-items:center;gap:6px;padding:7px 8px;cursor:move;' +
    'border-bottom:1px solid ' + C.line);
  var dot = el('span', 'width:8px;height:8px;border-radius:50%;background:' + C.muted + ';flex:none');
  var title = el('span', 'flex:1;font-weight:600', '开局录制器');
  var foldBtn = btn('−', 'font-size:15px;line-height:1;padding:2px 8px', '折叠');
  bar.append(dot, title, foldBtn);

  var body = el('div', 'padding:8px');
  var autoBtn = btn('', 'width:100%;font-weight:600;padding:7px 8px');

  var winRow = el('label', 'display:flex;align-items:center;gap:6px;margin:8px 0');
  var winName = el('span', 'flex:1;color:' + C.muted, '录制到 tick');
  var winInput = el('input', 'width:62px;font:inherit;color:' + C.text + ';background:' + C.ink +
    ';border:1px solid ' + C.line + ';border-radius:3px;padding:4px 5px');
  winInput.type = 'number'; winInput.min = '50'; winInput.max = '5000'; winInput.value = String(cfg.window);
  var winHint = el('span', 'width:44px;font-size:11px;color:' + C.muted);
  winRow.append(winName, winInput, winHint);

  var select = el('select', 'width:100%;box-sizing:border-box;font:12px inherit;color:' + C.text +
    ';background:' + C.ink + ';border:1px solid ' + C.line + ';border-radius:3px;padding:5px');
  var area = el('textarea', 'display:block;box-sizing:border-box;width:100%;height:96px;resize:vertical;' +
    'margin-top:6px;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:' + C.text +
    ';background:' + C.ink + ';border:1px solid ' + C.line + ';border-radius:3px;padding:6px;user-select:text');
  area.readOnly = true;
  area.spellcheck = false;
  area.placeholder = '还没有录制记录';
  [winInput, select, area].forEach(function (n) {
    ['keydown', 'keyup', 'keypress'].forEach(function (name) {
      n.addEventListener(name, function (ev) { ev.stopPropagation(); });
    });
  });

  var tools = el('div', 'display:flex;gap:6px;margin-top:6px');
  var copyBtn = btn('复制', 'flex:1;font-size:12px;padding:5px 4px');
  var recBtn = btn('', 'flex:1.4;font-size:12px;padding:5px 4px');
  var delBtn = btn('删除', 'flex:1;font-size:12px;padding:5px 4px');
  var clearBtn = btn('全清', 'flex:1;font-size:12px;padding:5px 4px', '清空全部历史');
  tools.append(copyBtn, recBtn, delBtn, clearBtn);

  var note = el('div', 'margin-top:6px;font-size:12px;color:' + C.muted + ';min-height:16px');
  var statusLine = el('div', 'margin-top:4px;font-size:12px;line-height:1.4;color:' + C.muted + ';min-height:34px');

  body.append(autoBtn, winRow, select, area, tools, note, statusLine);
  panel.append(bar, body);

  function drawRuns() {
    select.textContent = '';
    cfg.runs.forEach(function (r, i) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = runLabel(r);
      select.appendChild(o);
    });
    if (!cfg.runs.length) {
      var o = document.createElement('option');
      o.textContent = '（暂无记录）';
      select.appendChild(o);
    }
    sel = clamp(sel, 0, Math.max(0, cfg.runs.length - 1));
    select.value = String(sel);
    area.value = cfg.runs[sel] ? stepsToText(cfg.runs[sel].steps) : '';
  }

  function paint() {
    autoBtn.textContent = cfg.auto ? '自动录制：开' : '自动录制：关';
    autoBtn.style.background = cfg.auto ? C.mikanDeep : C.inkSoft;
    autoBtn.style.borderColor = cfg.auto ? C.mikan : C.line;
    recBtn.textContent = rec.active ? '停止并保存' : '开始录制';
    recBtn.style.borderColor = rec.active ? C.warn : C.line;
    winHint.textContent = '≈' + Math.round(cfg.window * TICK_MS / 1000) + ' 秒';
    if (statusLine.textContent !== st.text) statusLine.textContent = st.text;
    statusLine.style.color = st.tone === 'warn' ? C.warn : st.tone === 'on' ? C.text : C.muted;
    dot.style.background = st.tone === 'warn' ? C.warn : st.tone === 'on' ? C.mikan : C.muted;
  }

  autoBtn.onclick = function () { cfg.auto = !cfg.auto; save(); safeStep(); };
  winInput.onchange = function () {
    var v = Math.round(Number(winInput.value));
    cfg.window = clamp(Number.isFinite(v) ? v : cfg.window, 50, 5000);
    winInput.value = String(cfg.window);
    save(); paint();
  };
  select.onchange = function () {
    sel = Number(select.value) || 0;
    area.value = cfg.runs[sel] ? stepsToText(cfg.runs[sel].steps) : '';
  };
  recBtn.onclick = function () {
    if (rec.active) finish('手动停止');
    else if (st.wasInGame) { begin(); note.textContent = '已从当前 tick 开始录制'; }
    else note.textContent = '对局还没开始';
    safeStep();
  };
  delBtn.onclick = function () {
    if (!cfg.runs.length) return;
    cfg.runs.splice(sel, 1); save(); drawRuns(); note.textContent = '已删除';
  };
  clearBtn.onclick = function () {
    if (!cfg.runs.length) return;
    cfg.runs = []; save(); drawRuns(); note.textContent = '已清空全部记录';
  };
  copyBtn.onclick = function () {
    var text = area.value;
    if (!text) { note.textContent = '没有可复制的内容'; return; }
    function fallback() {
      area.select();
      try { return document.execCommand('copy'); } catch (e) { return false; }
    }
    function done(ok) {
      note.textContent = ok ? '已复制 ' + text.split('\n').length + ' 行' : '复制失败，请手动选中文本框内容';
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallback()); });
    } else {
      done(fallback());
    }
  };

  function setCollapsed(v) {
    cfg.collapsed = v;
    body.style.display = v ? 'none' : 'block';
    foldBtn.textContent = v ? '+' : '−';
    foldBtn.title = v ? '展开' : '折叠';
    save();
  }
  foldBtn.onclick = function () { setCollapsed(!cfg.collapsed); };

  var drag = null;
  bar.addEventListener('pointerdown', function (ev) {
    if (ev.target.closest('button')) return;
    var r = panel.getBoundingClientRect();
    drag = { x: ev.clientX, y: ev.clientY, left: r.left, top: r.top };
    bar.setPointerCapture(ev.pointerId);
  });
  bar.addEventListener('pointermove', function (ev) {
    if (drag) place(drag.left + ev.clientX - drag.x, drag.top + ev.clientY - drag.y);
  });
  bar.addEventListener('pointerup', function () {
    if (!drag) return;
    drag = null;
    var r = panel.getBoundingClientRect();
    cfg.pos = { x: r.left / innerWidth, y: r.top / innerHeight };
    save();
  });
  function place(left, top) {
    panel.style.left = clamp(left, 0, Math.max(0, innerWidth - panel.offsetWidth)) + 'px';
    panel.style.top = clamp(top, 0, Math.max(0, innerHeight - panel.offsetHeight)) + 'px';
  }
  function restorePos() {
    if (cfg.pos && Number.isFinite(cfg.pos.x) && Number.isFinite(cfg.pos.y)) {
      place(cfg.pos.x * innerWidth, cfg.pos.y * innerHeight);
    }
  }

  function mount() {
    if (!document.body) return;
    document.body.appendChild(panel);
    drawRuns();
    setCollapsed(cfg.collapsed);
    restorePos();
    window.addEventListener('resize', restorePos);
    safeStep();
    setInterval(safeStep, CHECK_MS);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
