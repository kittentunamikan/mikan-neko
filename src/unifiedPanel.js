/*
 * unifiedPanel.js —— 统一面板（三合一）
 *
 * 依赖：
 *   - window.MikanUI（mikanUI.js）
 *   - window.MikanAutoOpening（autoOpening.js）
 *
 * 包含三个标签页：
 *   1. 自动开局
 *   2. 开局录制器
 *   3. 设置
 */

(function() {
"use strict";

// 等待依赖加载
function waitForDeps(callback) {
  let tries = 0;
  const check = setInterval(() => {
    tries++;
    if (window.MikanUI && window.MikanAutoOpening) {
      clearInterval(check);
      callback();
    } else if (tries > 100) {
      clearInterval(check);
      console.error("[MikanPanel] 依赖加载超时");
    }
  }, 100);
}

waitForDeps(function() {
  const UI = window.MikanUI;
  const AO = window.MikanAutoOpening;
  
  // ── 创建面板 ──────────────────────────────────────
  const panel = UI.makePanel({
    id: "mikan-unified-panel",
    title: "Mikan 工具箱",
    width: 300,
    left: "12px",
    top: "12px"
  });
  
  // ── 创建三个标签页 ────────────────────────────────
  const tabControl = UI.tabs(["自动开局", "录制器", "设置"]);
  panel.body.appendChild(tabControl.wrap);
  
  const [autoTab, recorderTab, settingsTab] = tabControl.bodies;
  
  /* ═══════════════════════════════════════════════════════
   * Tab 1: 自动开局
   * ═══════════════════════════════════════════════════════ */
  
  const AUTO_STORAGE_KEY = "mikanAutoOpening:timeline";
  
  const timelineInput = UI.field("textarea", "mk-area");
  timelineInput.placeholder = "格式：每行 tick,百分比\n例如：\n62,95\n164,90\n259,85";
  timelineInput.rows = 8;
  timelineInput.style.fontFamily = "monospace";
  timelineInput.style.fontSize = "11px";
  
  const loadBtn = UI.button("加载时间轴");
  const saveBtn = UI.button("保存");
  const clearBtn = UI.button("清空", "", "mk-danger");
  
  const startBtn = UI.button("▶ 启动");
  const stopBtn = UI.button("⏸ 停止", "", "mk-danger");
  stopBtn.disabled = true;
  
  const autoStatus = UI.status();
  
  autoTab.append(
    UI.text("时间轴编辑", "msg"),
    timelineInput,
    UI.row(loadBtn, saveBtn, clearBtn),
    UI.separator(),
    UI.row(startBtn, stopBtn),
    autoStatus.el,
    UI.separator(),
    UI.text("格式：tick,百分比（支持 # 注释）", "dim")
  );
  
  // 逻辑
  function parseTimeline(text) {
    const lines = text.split("\n");
    const result = [];
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line || line.startsWith("#")) continue;
      
      const parts = line.split(",").map(s => s.trim());
      if (parts.length !== 2) {
        throw new Error(`第 ${i + 1} 行格式错误：「${line}」`);
      }
      
      const tick = parseInt(parts[0], 10);
      const percent = parseFloat(parts[1]);
      
      if (!Number.isFinite(tick) || tick < 0) {
        throw new Error(`第 ${i + 1} 行 tick 无效：「${parts[0]}」`);
      }
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        throw new Error(`第 ${i + 1} 行百分比无效：「${parts[1]}」`);
      }
      
      result.push({ tick, percent });
    }
    return result;
  }
  
  loadBtn.onclick = function() {
    try {
      const timeline = parseTimeline(timelineInput.value);
      if (timeline.length === 0) {
        autoStatus.set("时间轴为空", "warn");
        panel.setTone("warn");
        return;
      }
      AO.setTimeline(timeline);
      autoStatus.set(`已加载 ${timeline.length} 个时间点`, "on");
      panel.setTone("on");
    } catch (err) {
      autoStatus.set("解析失败：" + err.message, "warn");
      panel.setTone("warn");
    }
  };
  
  saveBtn.onclick = function() {
    try {
      localStorage.setItem(AUTO_STORAGE_KEY, timelineInput.value);
      autoStatus.set("已保存", "on");
    } catch (err) {
      autoStatus.set("保存失败：" + err.message, "warn");
    }
  };
  
  clearBtn.onclick = function() {
    timelineInput.value = "";
    AO.setTimeline([]);
    autoStatus.set("已清空", "");
    panel.setTone("");
  };
  
  startBtn.onclick = function() {
    AO.start();
    startBtn.disabled = true;
    stopBtn.disabled = false;
    panel.setTone("on");
  };
  
  stopBtn.onclick = function() {
    AO.stop();
    startBtn.disabled = false;
    stopBtn.disabled = true;
    panel.setTone("");
  };
  
  setInterval(function() {
    const s = AO.getStatus();
    autoStatus.set(s.text, s.tone);
    
    if (s.running) {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      panel.setTone(s.tone || "on");
    } else {
      startBtn.disabled = false;
      stopBtn.disabled = true;
      if (!s.tone) panel.setTone("");
    }
  }, 100);
  
  // 初始化：恢复本地时间轴
  try {
    const saved = localStorage.getItem(AUTO_STORAGE_KEY);
    if (saved) {
      timelineInput.value = saved;
      const timeline = parseTimeline(saved);
      AO.setTimeline(timeline);
      autoStatus.set(`已恢复 ${timeline.length} 个时间点`, "");
    }
  } catch (err) {
    console.warn("[MikanPanel] 恢复时间轴失败", err);
  }
  
  /* ═══════════════════════════════════════════════════════
   * Tab 2: 开局录制器
   * ═══════════════════════════════════════════════════════ */
  
  const REC_STORAGE_KEY = "mikanOpeningRecorder";
  const MAX_RUNS = 10;
  const MAX_STEPS = 200;
  const TICK_MS = 56;
  
  let recCfg = { auto: true, window: 700, runs: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(REC_STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      recCfg.auto = saved.auto !== false;
      recCfg.window = Math.max(50, Math.min(5000, Math.round(Number(saved.window)) || 700));
      if (Array.isArray(saved.runs)) {
        recCfg.runs = saved.runs
          .filter(r => r && Array.isArray(r.steps) && r.steps.length)
          .map(r => ({
            at: Number(r.at) || 0,
            steps: r.steps
              .filter(s => s && Number.isFinite(s.t) && Number.isFinite(s.p))
              .map(s => ({ t: Math.max(0, Math.round(s.t)), p: Math.round(s.p * 100) / 100 }))
              .slice(0, MAX_STEPS)
          }))
          .filter(r => r.steps.length)
          .slice(0, MAX_RUNS);
      }
    }
  } catch (e) {}
  
  function saveRec() {
    try { localStorage.setItem(REC_STORAGE_KEY, JSON.stringify(recCfg)); } catch (e) {}
  }
  
  function stepsToText(steps) {
    return steps.map(s => s.t + "," + s.p.toFixed(2)).join("\n");
  }
  
  function runLabel(r) {
    const d = new Date(r.at);
    const pad = n => n < 10 ? "0" + n : String(n);
    const last = r.steps.length ? r.steps[r.steps.length - 1].t : 0;
    return pad(d.getMonth() + 1) + "/" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) +
      " · " + r.steps.length + " 步 · tick " + last;
  }
  
  const recAutoBtn = UI.button("");
  recAutoBtn.style.width = "100%";
  
  const winRow = UI.row();
  winRow.style.margin = "8px 0";
  const winLabel = UI.text("录制到 tick", "dim");
  winLabel.style.flex = "1";
  const winInput = UI.field("input");
  winInput.type = "number";
  winInput.min = "50";
  winInput.max = "5000";
  winInput.value = String(recCfg.window);
  winInput.style.width = "62px";
  const winHint = UI.text("", "dim");
  winHint.style.width = "44px";
  winHint.style.fontSize = "11px";
  winRow.append(winLabel, winInput, winHint);
  
  const recSelect = UI.select();
  recSelect.style.width = "100%";
  
  const recArea = UI.field("textarea", "mk-area");
  recArea.readOnly = true;
  recArea.rows = 6;
  recArea.style.fontFamily = "monospace";
  recArea.style.fontSize = "11px";
  recArea.placeholder = "还没有录制记录";
  
  const recCopyBtn = UI.button("复制");
  const recStartBtn = UI.button("");
  const recDelBtn = UI.button("删除");
  const recClearBtn = UI.button("全清", "清空全部历史");
  
  const recNote = UI.text("", "msg");
  const recStatus = UI.status();
  
  recorderTab.append(
    recAutoBtn,
    winRow,
    recSelect,
    recArea,
    UI.row(recCopyBtn, recStartBtn, recDelBtn, recClearBtn),
    recNote,
    recStatus.el
  );
  
  let rec = { active: false, steps: [] };
  let recSel = 0;
  let recState = { wasInGame: false, lastKr: -1, text: "", tone: "" };
  
  function drawRuns() {
    recSelect.textContent = "";
    recCfg.runs.forEach((r, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = runLabel(r);
      recSelect.appendChild(o);
    });
    if (!recCfg.runs.length) {
      const o = document.createElement("option");
      o.textContent = "（暂无记录）";
      recSelect.appendChild(o);
    }
    recSel = Math.max(0, Math.min(recSel, recCfg.runs.length - 1));
    recSelect.value = String(recSel);
    recArea.value = recCfg.runs[recSel] ? stepsToText(recCfg.runs[recSel].steps) : "";
  }
  
  function paintRec() {
    recAutoBtn.textContent = recCfg.auto ? "自动录制：开" : "自动录制：关";
    recAutoBtn.style.background = recCfg.auto ? "rgba(66,150,250,.6)" : "rgba(41,74,122,.54)";
    recStartBtn.textContent = rec.active ? "停止并保存" : "开始录制";
    winHint.textContent = "≈" + Math.round(recCfg.window * TICK_MS / 1000) + " 秒";
    recStatus.set(recState.text, recState.tone);
  }
  
  function setRecStatus(text, tone) {
    recState.text = text;
    recState.tone = tone || "";
  }
  
  function tickCounter() {
    try { return typeof window.bi?.kr === "function" ? window.bi.kr() : null; } catch (e) { return null; }
  }
  
  function percentOf(lv) {
    const me = window.aE?.fJ;
    const gv = window.bD?.gv;
    const bal = window.ah?.hb?.[me];
    if (gv && typeof gv.jB === "function" && bal > 0) {
      const troops = gv.jB(me, lv);
      if (Number.isFinite(troops)) return Math.max(0, Math.min(100, troops / bal * 100));
    }
    return (lv + 1) / 10.24;
  }
  
  function onClickRec(lv, target) {
    if (!rec.active || window.__mikanAutoSending) return;
    const aE = window.aE;
    if (!aE || !aE.lE || target !== aE.fW) return;
    const t = tickCounter();
    if (t == null || rec.steps.length >= MAX_STEPS) return;
    rec.steps.push({ t: t, p: Math.round(percentOf(Math.max(0, Math.min(1023, lv | 0))) * 100) / 100 });
  }
  
  function installRecHook() {
    const hz = window.bB?.hz;
    if (!hz || hz.__mikanRecInstalled || typeof hz.i6 !== "function") return;
    const orig = hz.i6;
    hz.i6 = function(lv, target) {
      try { onClickRec(lv, target); } catch (e) {}
      return orig.apply(this, arguments);
    };
    hz.__mikanRecInstalled = true;
  }
  
  function beginRec() {
    rec.active = true;
    rec.steps = [];
    recNote.textContent = "";
  }
  
  function finishRec(reason) {
    if (!rec.active) return;
    rec.active = false;
    const steps = rec.steps;
    rec.steps = [];
    if (steps.length) {
      recCfg.runs.unshift({ at: Date.now(), steps });
      recCfg.runs = recCfg.runs.slice(0, MAX_RUNS);
      recSel = 0;
      saveRec();
      drawRuns();
      recNote.textContent = "已保存 " + steps.length + " 步" + (reason ? "（" + reason + "）" : "");
    } else {
      recNote.textContent = "这局没有记录到点击" + (reason ? "（" + reason + "）" : "");
    }
  }
  
  function recorderStep() {
    const aE = window.aE;
    if (!aE) { setRecStatus("等待游戏加载…"); return; }
    
    installRecHook();
    
    const me = aE.fJ;
    if (!aE.lE) {
      recState.wasInGame = false;
      finishRec("离开单人局");
      setRecStatus("当前不是单人局");
      return;
    }
    if (aE.hi) { setRecStatus("观战中"); return; }
    if (!Number.isInteger(me)) { setRecStatus("等待开局…"); return; }
    
    const tiles = window.ah?.hN?.[me] | 0;
    const inGame = !!(window.bD?.gv?.hk?.(1) && window.bD?.gv?.hl?.(me)) && tiles > 0;
    
    const kr = tickCounter();
    const restarted = kr != null && recState.lastKr >= 0 && kr < recState.lastKr;
    if (kr != null) recState.lastKr = kr;
    
    if (!inGame) {
      if (recState.wasInGame) finishRec("对局结束");
      recState.wasInGame = false;
      setRecStatus(recCfg.auto ? "等待单人局开局" : "自动录制已关闭");
      return;
    }
    
    if (!recState.wasInGame || restarted) {
      if (restarted) finishRec("新的一局");
      recState.wasInGame = true;
      if (recCfg.auto) beginRec();
    }
    
    if (rec.active) {
      if (kr != null && kr >= recCfg.window) {
        finishRec("到达设定 tick");
        setRecStatus("本局录制完成");
        return;
      }
      setRecStatus("录制中 · tick " + (kr == null ? "?" : kr) + " / " + recCfg.window + " · " + rec.steps.length + " 步", "on");
    } else {
      setRecStatus(recCfg.auto ? "本局录制已结束" : "点"开始录制"可从现在开始");
    }
  }
  
  recAutoBtn.onclick = function() {
    recCfg.auto = !recCfg.auto;
    saveRec();
    paintRec();
  };
  
  winInput.onchange = function() {
    const v = Math.round(Number(winInput.value));
    recCfg.window = Number.isFinite(v) ? Math.max(50, Math.min(5000, v)) : recCfg.window;
    winInput.value = String(recCfg.window);
    saveRec();
    paintRec();
  };
  
  recSelect.onchange = function() {
    recSel = Number(recSelect.value) || 0;
    recArea.value = recCfg.runs[recSel] ? stepsToText(recCfg.runs[recSel].steps) : "";
  };
  
  recStartBtn.onclick = function() {
    if (rec.active) finishRec("手动停止");
    else if (recState.wasInGame) { beginRec(); recNote.textContent = "已开始录制"; }
    else recNote.textContent = "对局还没开始";
    paintRec();
  };
  
  recDelBtn.onclick = function() {
    if (!recCfg.runs.length) return;
    recCfg.runs.splice(recSel, 1);
    saveRec();
    drawRuns();
    recNote.textContent = "已删除";
  };
  
  recClearBtn.onclick = function() {
    if (!recCfg.runs.length) return;
    recCfg.runs = [];
    saveRec();
    drawRuns();
    recNote.textContent = "已清空";
  };
  
  recCopyBtn.onclick = function() {
    const text = recArea.value;
    if (!text) { recNote.textContent = "没有可复制的内容"; return; }
    
    function fallback() {
      recArea.select();
      try { return document.execCommand("copy"); } catch (e) { return false; }
    }
    
    function done(ok) {
      recNote.textContent = ok ? "已复制 " + text.split("\n").length + " 行" : "复制失败";
    }
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => done(true), () => done(fallback()));
    } else {
      done(fallback());
    }
  };
  
  drawRuns();
  paintRec();
  setInterval(function() {
    try {
      recorderStep();
      paintRec();
    } catch (e) {
      console.error("[MikanRecorder]", e);
    }
  }, 50);
  
  /* ═══════════════════════════════════════════════════════
   * Tab 3: 设置
   * ═══════════════════════════════════════════════════════ */
  
  settingsTab.append(
    UI.text("全局设置", "msg"),
    UI.separator(),
    UI.text("面板透明度、快捷键等设置可通过标题栏按钮调整", "dim"),
    UI.separator(),
    UI.text("更多功能开发中…… 🐾", "dim")
  );
  
  /* ═══════════════════════════════════════════════════════
   * 挂载
   * ═══════════════════════════════════════════════════════ */
  
  panel.mount();
  console.log("[MikanPanel] 统一面板已加载 🍊");
});

})();