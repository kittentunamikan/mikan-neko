/*
 * autoOpening.js —— 自动开局逻辑核心
 *
 * 导出：window.MikanAutoOpening = { start, stop, isRunning, setTimeline, getStatus }
 *
 * 依赖：
 *   - 游戏全局变量（aE, bB, bi, bD, ah, bv, ae, aS）
 *   - 游戏 API 参考：game-api-reference.md
 *
 * 时间轴格式：[{ tick: 62, percent: 95 }, { tick: 164, percent: 90 }, ...]
 */

(function() {
"use strict";

// ── 游戏接口封装（隔离压缩后的标识符） ────────────────
const G = {
  get playerId() { return window.aE?.fJ; },
  get neutralId() { return window.aE?.fW; },
  get isReplay() { return window.aE?.hi; },
  get isSingleplayer() { return window.aE?.lE; },
  get tick() { return typeof window.bi?.kr === "function" ? window.bi.kr() : 0; },
  
  isInGame() {
    return window.bD?.gv?.hk?.(1) && window.bD?.gv?.hl?.(this.playerId) && window.ah?.hN?.[this.playerId] > 0;
  },
  
  getTroops(pid) { return window.ah?.hb?.[pid] || 0; },
  getTerritories(pid) { return window.ah?.hN?.[pid] || 0; },
  
  isBorderingNeutral(pid) { return window.bv?.i5?.(pid); },
  isAttacking(pid, target) { return window.ae?.kF?.(pid, target); },
  hasAttackSlot(pid) { return window.ae?.kY?.(pid); },
  
  attack(gear, target) {
    if (typeof window.bB?.hz?.i6 !== "function") return false;
    window.__mikanAutoSending = true;
    window.bB.hz.i6(gear, target);
    window.__mikanAutoSending = false;
    return true;
  },
  
  // 百分比 → 档位（二分查找 jB）
  percentToGear(pid, pct) {
    const jB = window.bD?.gv?.jB;
    if (typeof jB !== "function") {
      // 降级：粗略换算
      return Math.max(0, Math.min(1023, Math.round(pct * 10.24) - 1));
    }
    const targetTroops = Math.round(this.getTroops(pid) * pct);
    let lo = 0, hi = 1023, best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const troops = jB(pid, mid);
      if (troops <= targetTroops) { best = mid; lo = mid + 1; }
      else { hi = mid - 1; }
    }
    return best;
  }
};

// ── 状态机 ───────────────────────────────────────────
let running = false;
let timeline = [];  // [{ tick, percent }, ...]，按 tick 升序
let lastTick = -1;
let executedIndex = -1;  // 当前已执行到的时间点索引
let statusText = "待机";
let statusTone = "";

function updateStatus(text, tone) {
  statusText = text;
  statusTone = tone || "";
}

// ── 主循环（每帧调用） ──────────────────────────────
function tick() {
  if (!running) return;
  
  const now = G.tick;
  
  // 检测新一局
  if (now < lastTick) {
    executedIndex = -1;
    updateStatus("新一局，等待开局……", "");
  }
  lastTick = now;
  
  // 安全检查
  if (G.isReplay) {
    updateStatus("回放模式，已暂停", "warn");
    running = false;
    return;
  }
  
  // 等待进入对局
  if (!G.isInGame()) {
    updateStatus(`Tick ${now} | 等待对局开始`, "");
    return;
  }
  
  const pid = G.playerId;
  const troops = G.getTroops(pid);
  const territories = G.getTerritories(pid);
  
  // 检查是否与无主地接壤
  if (!G.isBorderingNeutral(pid)) {
    updateStatus(`Tick ${now} | 兵力 ${troops} | 未接壤无主地`, "");
    return;
  }
  
  // 遍历时间轴，执行当前 tick 应该执行的指令
  for (let i = executedIndex + 1; i < timeline.length; i++) {
    const point = timeline[i];
    if (point.tick > now) break;  // 未到时间
    
    // 执行这个时间点的攻击
    const pct = point.percent / 100;
    const gear = G.percentToGear(pid, pct);
    const targetTroops = Math.round(troops * pct);
    
    // 检查攻击条件
    if (!G.hasAttackSlot(pid) && !G.isAttacking(pid, G.neutralId)) {
      updateStatus(`Tick ${now} | 无攻击名额，跳过 ${point.percent}%`, "warn");
      executedIndex = i;
      continue;
    }
    
    // 发起攻击
    if (G.attack(gear, G.neutralId)) {
      updateStatus(`Tick ${now} | 已发送 ${point.percent}% (${targetTroops} 兵)`, "on");
      executedIndex = i;
    } else {
      updateStatus(`Tick ${now} | 攻击接口调用失败`, "warn");
      running = false;
      return;
    }
  }
  
  // 所有指令执行完毕
  if (executedIndex >= timeline.length - 1) {
    updateStatus(`Tick ${now} | 兵力 ${troops} | 指令已全部执行`, "");
  } else {
    const next = timeline[executedIndex + 1];
    const remain = next.tick - now;
    updateStatus(`Tick ${now} | 兵力 ${troops} | 下一步 ${next.percent}% 在 Tick ${next.tick} (还剩 ${remain})`, "");
  }
}

// 启动定时器（60fps）
let timer = null;
function startTimer() {
  if (timer) return;
  timer = setInterval(tick, 16);
}
function stopTimer() {
  if (timer) { clearInterval(timer); timer = null; }
}

// ── 外部接口 ─────────────────────────────────────────
function start() {
  if (running) return;
  if (timeline.length === 0) {
    updateStatus("时间轴为空，无法启动", "warn");
    return;
  }
  running = true;
  lastTick = -1;
  executedIndex = -1;
  updateStatus("已启动，等待对局……", "on");
  startTimer();
}

function stop() {
  running = false;
  stopTimer();
  updateStatus("已停止", "");
}

function isRunning() {
  return running;
}

function setTimeline(arr) {
  // 格式：[{ tick, percent }, ...]
  // 自动按 tick 升序排序
  timeline = (arr || [])
    .filter(p => typeof p.tick === "number" && typeof p.percent === "number")
    .sort((a, b) => a.tick - b.tick);
  executedIndex = -1;
  updateStatus(`已加载 ${timeline.length} 个时间点`, "");
}

function getStatus() {
  return { text: statusText, tone: statusTone, running, tick: G.tick };
}

// 导出到全局
window.MikanAutoOpening = { start, stop, isRunning, setTimeline, getStatus };

})();
