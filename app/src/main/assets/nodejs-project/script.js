(() => {
  "use strict";

  /* ═══ 自适应布局（手机横屏）═══
     原理：JS 实时读取视口尺寸，把垂直空间按优先级比例分配
     （顶部对手区 → 中间出牌区 → 提示+按钮 → 手牌区），
     写入 CSS 变量，CSS 全部引用变量，任何分辨率都不重叠。 */
  function layoutAdaptive() {
    const root = document.documentElement;
    const isLandscapeMobile = matchMedia("(orientation: landscape) and (pointer: coarse) and (max-height: 560px)").matches;
    if (!isLandscapeMobile) return;
    const vh = window.innerHeight;
    const compact = vh <= 330;
    // 顶部对手区（头像+卡背）底部
    const topBottom = compact ? 72 : Math.round(Math.max(84, vh * 0.245));
    // 手牌区高度：视口比例，限幅
    const handH = compact ? 72 : Math.round(Math.min(112, Math.max(78, vh * 0.28)));
    // 底部区：手牌 + 间隙 + 按钮 + 提示间距 + 提示文字
    const btnH = compact ? 34 : 38;
    const tipH = compact ? 0 : 18;
    const gap = compact ? 6 : 8;
    const bottomArea = handH + 4 + gap + btnH + gap + tipH;
    // 中间出牌区
    const mid = vh - topBottom - bottomArea;
    const trickH = Math.round(Math.min(150, Math.max(compact ? 74 : 90, mid * 0.95)));
    const trickTop = Math.round(topBottom - 6 + Math.max(0, (mid - trickH) / 3));
    // 卡片尺寸微调：视口越矮牌越小
    const cardAdj = Math.round((vh - (compact ? 300 : 340)) / 12);
    root.style.setProperty("--trick-top", trickTop + "px");
    root.style.setProperty("--trick-h", trickH + "px");
    root.style.setProperty("--btn-bottom", (handH - 6) + "px");
    root.style.setProperty("--hand-h", handH + "px");
    root.style.setProperty("--card-size-adjust", cardAdj + "px");
    // 兜底修正：渲染后实测出牌区是否压到提示文字，压到则上移
    requestAnimationFrame(() => {
      const trick = document.querySelector(".trick-zone");
      const tip = document.querySelector("#selection-tip");
      if (!trick || !tip) return;
      if (getComputedStyle(tip).display === "none") return; // 极矮屏隐藏提示时无需修正
      const overlap = Math.round(trick.getBoundingClientRect().bottom - tip.getBoundingClientRect().top + 6);
      if (overlap > 0) {
        const current = parseFloat(root.style.getPropertyValue("--trick-top")) || trickTop;
        root.style.setProperty("--trick-top", Math.max(topBottom - 14, current - overlap) + "px");
      }
    });
  }
  let layoutTimer = null;
  function requestLayout() {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(layoutAdaptive, 80);
  }
  /* 出牌区内容变化（出牌/过牌）时自动重排，防止内容变高压到按钮/提示 */
  function watchTrickZone() {
    const trick = document.querySelector(".trick-zone");
    if (!trick) return;
    new MutationObserver(() => {
      if (matchMedia("(orientation: landscape) and (pointer: coarse) and (max-height: 560px)").matches) requestLayout();
    }).observe(trick, { childList: true, subtree: true, characterData: true });
  }
  window.addEventListener("resize", requestLayout);
  window.addEventListener("orientationchange", () => setTimeout(layoutAdaptive, 250));
  window.addEventListener("load", () => {
    setTimeout(layoutAdaptive, 100);
    watchTrickZone();
  });

  const SUITS = ["♠", "♥", "♣", "♦"];
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const DEFAULT_NAMES = ["牌手", "周舟", "林默", "许晏"];
  let NAMES = [...DEFAULT_NAMES];
  // AI 玩家名字库（单机模式每次开局随机取 3 个）
  const AI_NAME_POOL = ["周舟", "林默", "许晏", "阿杰", "老陈", "王芳", "张伟", "李静", "刘洋", "赵磊",
    "孙悦", "钱进", "吴迪", "郑楠", "冯军", "何平", "高翔", "林熙", "陈雨", "苏晴",
    "小马", "大龙", "阿康", "老周", "二牛", "胖虎", "大宝", "静姐", "阿珍", "老赵"];
  function randomAINames() {
    const pool = [...AI_NAME_POOL];
    const picked = [];
    for (let i = 0; i < 3; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
  }
  const LEVELS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const COMBO_NAMES = {
    single: "单张", pair: "对子", triple: "三张", fullhouse: "三带二",
    straight: "顺子", pairs: "三连对", steel: "钢板", bomb: "炸弹",
    straightflush: "同花顺", jokerbomb: "四王炸"
  };
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

  const state = {
    level: "2",
    round: 1,
    hands: [[], [], [], []],
    currentPlayer: 0,
    currentPlay: null,
    lastPlayer: null,
    passCount: 0,
    selected: new Set(),
    finishOrder: [],
    locked: false,
    sound: true,
    music: false,
    timer: null,
    resultTimer: null,
    history: [],
    teamLevels: ["2", "2"],
    teamWins: [0, 0],
    dealer: 0,
    lastAdvance: 0,
    localPlayer: 0,
    animateDeal: false,
    lan: null,
    // ── 技能模式 ──
    skillMode: false,
    skillCards: [[], [], [], []],   // 每个玩家手上的技能卡 [{id, type}]
    skipNextTurn: [false, false, false, false], // 乐不思蜀效果
    skillTarget: null,              // 待选目标的技能(交互中用)
    skillPending: null,
    // ── 技能系统扩展 (10技能) ──
    discardPile: [],                // 出牌堆: 本局所有打出的牌累积, 发新局清空
    distracted: [false, false, false, false], // 声东击西状态: 该玩家技能被锁定, 需用技能解除
    emptyFortImmunity: [false, false, false, false], // 空城计: 自己手牌≤6时本回合免疫目标型技能
    usedSkillThisTurn: false,       // 当前玩家本回合是否已用过技能(每回合最多1张)
    peekResult: null,               // 明察秋毫查看结果(仅使用者本人用)
    // ── 进贡/还贡交互 ──
    repay: null,                    // 还贡等待: { giver, receiver, received } (进贡后待还贡, 手动选牌)
    tributeLog: [],                 // 本局进贡/还贡记录 [{type, card, to}] 供顶部常驻展示
    skillLog: [],                   // 最近技能施加效果 [{name, res}] 最多4条
    headSeat: null,                 // 头游 seat(进贡展示用)
    secondSeat: null                // 二游 seat(进贡展示用)
  };

  let sfxVolume = 1;
  let bgmVolume = .7;
  let sfxPitch = 1;
  let bgmTempo = 1;
  let sfxProfile = "classic";
  let bgmTexture = "balanced";
  let aiDelay = 900;
  let autoScrollHints = true;
  let confirmRestart = true;
  let haptics = false;
  let hapticStrength = 1;
  let toastDuration = 1800;

  const el = {};
  const byId = id => document.getElementById(id);
  const seatAt = position => (state.localPlayer + position) % 4;

  function initElements() {
    ["round-number", "level-rank", "status-text", "played-by", "played-cards", "combo-label",
      "selection-tip", "player-hand", "pass-button", "hint-button", "play-button", "repay-button", "new-game-button",
      "help-button", "sound-button", "music-button", "rules-dialog", "close-rules", "confirm-rules", "result-dialog",
      "restart-dialog", "cancel-restart", "confirm-restart", "result-title", "result-copy", "ranking", "again-button", "toast", "footer-tip",
      "our-level", "their-level", "our-wins", "their-wins", "tribute-bar"
    ].forEach(id => el[id] = byId(id));
  }

  function createDeck() {
    const deck = [];
    for (let copy = 0; copy < 2; copy++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          deck.push({ id: `${copy}-${suit}-${rank}`, suit, rank, copy, joker: false });
        }
      }
      deck.push({ id: `${copy}-SJ`, suit: "", rank: "小王", copy, joker: true, big: false });
      deck.push({ id: `${copy}-BJ`, suit: "", rank: "大王", copy, joker: true, big: true });
    }
    return shuffle(deck);
  }

  function shuffle(array) {
    const a = [...array];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function rankValue(cardOrRank) {
    const rank = typeof cardOrRank === "string" ? cardOrRank : cardOrRank.rank;
    if (rank === "小王") return 15;
    if (rank === "大王") return 16;
    if (rank === state.level) return 14;
    const natural = RANKS.indexOf(rank);
    const levelIndex = RANKS.indexOf(state.level);
    return natural < levelIndex ? natural + 2 : natural + 1;
  }

  function naturalValue(rank) {
    if (rank === "A") return 14;
    if (["J", "Q", "K"].includes(rank)) return { J: 11, Q: 12, K: 13 }[rank];
    return Number(rank);
  }

  function isWild(card) {
    return !card.joker && card.suit === "♥" && card.rank === state.level;
  }

  function sortHand(hand) {
    const suitOrder = { "♦": 0, "♣": 1, "♥": 2, "♠": 3, "": 4 };
    hand.sort((a, b) => rankValue(a) - rankValue(b) || suitOrder[a.suit] - suitOrder[b.suit] || a.copy - b.copy);
  }

  function plainCombo(cards, assignedRanks = null) {
    const ranks = cards.map((c, i) => assignedRanks?.[i] || c.rank);
    const n = cards.length;
    if (!n) return null;

    const jokers = cards.filter(c => c.joker);
    if (n === 4 && jokers.length === 4) return { type: "jokerbomb", value: 99, size: 4, bombPower: 9999 };
    if (n === 2 && jokers.length === 2 && jokers[0].rank === jokers[1].rank) {
      return { type: "pair", value: rankValue(jokers[0]), size: 2 };
    }
    if (jokers.length && n > 1) return null;
    if (n === 1) return { type: "single", value: rankValue(cards[0]), size: 1 };

    const counts = new Map();
    ranks.forEach(r => counts.set(r, (counts.get(r) || 0) + 1));
    const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || naturalValue(b[0]) - naturalValue(a[0]));
    const unique = [...counts.keys()];

    if (unique.length === 1) {
      const value = rankValue(unique[0]);
      if (n === 2) return { type: "pair", value, size: n };
      if (n === 3) return { type: "triple", value, size: n };
      if (n >= 4) return { type: "bomb", value, size: n, bombPower: n * 100 + value };
    }

    if (n === 5 && groups.length === 2 && groups[0][1] === 3 && groups[1][1] === 2) {
      return { type: "fullhouse", value: rankValue(groups[0][0]), size: n };
    }

    const sequence = sequenceHigh(unique, n);
    if (n === 5 && sequence !== null) {
      const fixedSuits = cards.filter(c => !isWild(c)).map(c => c.suit);
      const sameSuit = fixedSuits.length <= 1 || fixedSuits.every(s => s === fixedSuits[0]);
      if (sameSuit) return { type: "straightflush", value: sequence, size: n, bombPower: 550 + sequence };
      return { type: "straight", value: sequence, size: n };
    }

    if (n === 6 && groups.length === 3 && groups.every(g => g[1] === 2)) {
      const high = consecutiveGroupHigh(unique, 3);
      if (high !== null) return { type: "pairs", value: high, size: n };
    }

    if (n === 6 && groups.length === 2 && groups.every(g => g[1] === 3)) {
      const high = consecutiveGroupHigh(unique, 2);
      if (high !== null) return { type: "steel", value: high, size: n };
    }
    return null;
  }

  function sequenceHigh(ranks, expected) {
    if (ranks.length !== expected || ranks.some(r => !RANKS.includes(r))) return null;
    let vals = ranks.map(naturalValue).sort((a, b) => a - b);
    if (vals.join(",") === "2,3,4,5,14") vals = [1, 2, 3, 4, 5];
    for (let i = 1; i < vals.length; i++) if (vals[i] !== vals[i - 1] + 1) return null;
    return vals.at(-1);
  }

  function consecutiveGroupHigh(ranks, expected) {
    if (ranks.length !== expected || ranks.some(r => !RANKS.includes(r))) return null;
    const vals = ranks.map(naturalValue).sort((a, b) => a - b);
    for (let i = 1; i < vals.length; i++) if (vals[i] !== vals[i - 1] + 1) return null;
    return vals.at(-1);
  }

  function detectCombo(cards) {
    if (!cards.length) return null;
    const wildIndexes = cards.map((c, i) => isWild(c) ? i : -1).filter(i => i >= 0);
    if (!wildIndexes.length || cards.length === 1) return plainCombo(cards);

    let best = null;
    const assigned = cards.map(c => c.rank);
    function test(depth) {
      if (depth === wildIndexes.length) {
        const combo = plainCombo(cards, assigned);
        if (combo && (!best || comboScore(combo) > comboScore(best))) best = combo;
        return;
      }
      for (const rank of RANKS) {
        assigned[wildIndexes[depth]] = rank;
        test(depth + 1);
      }
    }
    test(0);
    return best;
  }

  function comboScore(combo) {
    const typeScore = { single: 1, pair: 2, triple: 3, fullhouse: 4, straight: 5, pairs: 6, steel: 7, bomb: 20, straightflush: 25, jokerbomb: 40 };
    return (typeScore[combo.type] || 0) * 10000 + (combo.bombPower || 0) * 10 + combo.value;
  }

  function isBomb(combo) {
    return combo && ["bomb", "straightflush", "jokerbomb"].includes(combo.type);
  }

  function canBeat(combo, target) {
    if (!combo) return false;
    if (!target) return true;
    if (isBomb(combo) && !isBomb(target)) return true;
    if (!isBomb(combo) && isBomb(target)) return false;
    if (isBomb(combo) && isBomb(target)) return combo.bombPower > target.bombPower;
    return combo.type === target.type && combo.size === target.size && combo.value > target.value;
  }

  function cardMarkup(card, selectable = false, cardIndex = null) {
    const red = card.suit === "♥" || card.suit === "♦" || card.big;
    const levelCard = !card.joker && card.rank === state.level;
    const interactive = state.currentPlayer === state.localPlayer && !state.locked && !state.finishOrder.includes(state.localPlayer);
    const selected = selectable && state.selected.has(card.id);
    const classes = ["card", cardIndex === null ? "" : "deal-card", red ? "red" : "", card.joker ? "card-joker" : "", card.big ? "joker-big" : "", levelCard ? "level-card" : "", isWild(card) ? "wild" : "", selected ? "selected" : ""].filter(Boolean).join(" ");
    const rankText = card.joker ? (card.big ? "大王" : "小王") : card.rank;
    const center = card.joker ? (card.big ? "王" : "王") : card.suit;
    const aria = card.joker ? rankText : `${card.suit}${card.rank}${levelCard ? "，级牌" : ""}${isWild(card) ? "，逢人配" : ""}`;
    const tag = selectable ? "button" : "div";
    const attributes = selectable ? `data-card-id="${card.id}" type="button" aria-pressed="${selected}"${interactive ? "" : " disabled"}` : 'role="img"';
    const style = cardIndex === null ? "" : ` style="--card-index:${cardIndex}"`;
    return `<${tag} class="${classes}" ${attributes}${style} aria-label="${aria}">
      <span class="card-corner"><span>${card.joker ? (card.big ? "大王" : "小王") : card.rank}</span>${card.joker ? "" : `<span class="card-suit">${card.suit}</span>`}</span>
      <span class="card-center">${center}</span>
    </${tag}>`;
  }

  function renderHand() {
    const hand = state.hands[state.localPlayer];
    sortHand(hand);
    el["player-hand"].innerHTML = hand.map((card, index) => cardMarkup(card, true, state.animateDeal ? index : null)).join("");
    state.animateDeal = false;
  }

  /* ═══ 技能模式 ── 渲染技能卡按钮（升级为素材卡样式）═══ */
  const SKILL_BUTTON_CN = {
    DrawTwo: "无中生有", Steal: "顺手牵羊", Discard: "过河拆桥", Skip: "乐不思蜀", Harvest: "五谷丰登",
    Swap: "移花接木", Peek: "明察秋毫", Replace: "偷梁换柱", EmptyFort: "空城计", SoundEastWest: "声东击西"
  };
  const SKILL_DESC = {
    DrawTwo: "从出牌堆抽最多2张", Steal: "偷取目标1张随机牌", Discard: "让目标弃1张牌",
    Skip: "目标下回合被跳过", Harvest: "未出完玩家各从牌堆+1",
    Swap: "与目标随机换1张手牌", Peek: "查看目标最多3张手牌", Replace: "弃自己1张再抽1张",
    EmptyFort: "手牌≤6:本回合免疫目标技能", SoundEastWest: "锁定目标技能,逼其耗1张解除"
  };
  const SKILL_GLYPH = {
    DrawTwo: "🃏", Steal: "🫳", Discard: "✂️", Skip: "💤", Harvest: "🌾",
    Swap: "🪞", Peek: "👁️", Replace: "🔄", EmptyFort: "🏯", SoundEastWest: "🧭"
  };
  const SKILL_THEME = {
    DrawTwo: "#cda75c", Steal: "#7fb3d5", Discard: "#c07a5c", Skip: "#9b8fc4", Harvest: "#7fbf7f",
    Swap: "#8fa6a3", Peek: "#7189b6", Replace: "#b49a69", EmptyFort: "#8799a8", SoundEastWest: "#6678a5"
  };
  function renderSkills() {
    const zone = byId("skill-bar");
    if (!zone) return;
    if (!state.skillMode) { zone.classList.add("view-hidden"); return; }
    zone.classList.remove("view-hidden");
    const mine = state.skillCards[state.localPlayer] || [];
    const humanTurn = state.currentPlayer === state.localPlayer && !state.locked && !state.finishOrder.includes(state.localPlayer);
    zone.innerHTML = mine.length
      ? mine.map((skill, idx) => {
          const name = SKILL_BUTTON_CN[skill.type] || skill.type;
          const desc = SKILL_DESC[skill.type] || "";
          const glyph = SKILL_GLYPH[skill.type] || "技";
          const color = SKILL_THEME[skill.type] || "#cda75c";
          return `<button class="skill-card ${humanTurn ? "enabled" : "disabled"}" data-skill-idx="${idx}" data-skill-type="${skill.type}" type="button" style="--skill-color:${color}" aria-label="${name}">
            <span class="skill-card-glyph">${glyph}</span>
            <span class="skill-card-body">
              <span class="skill-card-name">${name}</span>
              <span class="skill-card-desc">${desc}</span>
            </span>
          </button>`; })
        .join("")
      : `<span class="skill-empty">已无技能</span>`;
    // 绑定点击（仅人类回合）
    if (humanTurn) {
      zone.querySelectorAll(".skill-card").forEach(button => {
        button.addEventListener("click", () => onSkillClick(button.dataset.skillIdx));
      });
    }
  }

  function skillIcon(type) {
    return { DrawTwo: "🎴", Steal: "🃏", Discard: "✂️", Skip: "💤", Harvest: "🌾" }[type] || "⚙";
  }

  // 人类点击技能卡
  function onSkillClick(idx) {
    if (!state.skillMode || state.currentPlayer !== state.localPlayer || state.locked) return;
    const skill = (state.skillCards[state.localPlayer] || [])[idx];
    if (!skill) return;
    // 每回合最多用1张技能
    if (state.usedSkillThisTurn) { showToast("本回合已使用过技能", "info"); return; }
    // 空城计自条件: 需手牌≤6
    if (skill.type === "EmptyFort" && state.hands[state.localPlayer].length > 6) {
      showToast("空城计需要手牌 ≤6 张才能使用", "info"); return;
    }
    // 声东击西锁定: 处于该状态的玩家出技能前需确认(确认后技能发出并解除锁定)
    if (state.distracted[state.localPlayer]) {
      showDistractDialog("你处于【声东击西】状态，使用技能将解除该状态。确认使用？",
        [{ label: "取消", primary: false, value: "cancel" }, { label: "确认", primary: true, value: "ok" }],
        () => {
          // 确认: 真正执行技能(无论是否需目标)
          if (SKILL_NEEDS_TARGET(skill.type)) {
            state.skillPending = { idx, type: skill.type };
            openSkillTargetDialog();
          } else {
            useSkill(state.localPlayer, skill.type, undefined, idx);
          }
        });
      return;
    }
    if (skill.type === "Replace") {
      // 偷梁换柱: 需自选一张弃牌
      state.skillPending = { idx, type: skill.type };
      openSkillDiscardDialog();
      return;
    }
    if (SKILL_NEEDS_TARGET(skill.type)) {
      // 需要目标：弹出对手选择
      state.skillPending = { idx, type: skill.type };
      openSkillTargetDialog();
    } else {
      useSkill(state.localPlayer, skill.type, undefined, idx);
    }
  }

  function openSkillTargetDialog() {
    const dialog = byId("skill-target-dialog");
    if (!dialog || !state.skillPending) return;
    // 目标 = 其他3名未出完玩家; 空城计免疫中的玩家不可选为目标
    const targets = [0, 1, 2, 3].filter(s => s !== state.localPlayer && !state.finishOrder.includes(s) && !state.emptyFortImmunity[s]);
    const list = byId("skill-target-list");
    if (list) {
      list.innerHTML = targets.length
        ? targets.map(s => `
        <button class="skill-target" data-seat="${s}" type="button">
          <span class="skill-target-avatar">${NAMES[s].slice(0, 1)}</span><span>${NAMES[s]}</span>
        </button>`).join("")
        : `<span class="skill-empty">无可选目标</span>`;
      list.querySelectorAll(".skill-target").forEach(btn => {
        btn.addEventListener("click", () => {
          const seat = Number(btn.dataset.seat);
          const pending = state.skillPending;
          state.skillPending = null;
          closeDialog(dialog);
          useSkill(state.localPlayer, pending.type, seat, pending.idx);
        });
      });
    }
    if (typeof dialog.showModal === "function") dialog.showModal();
    const cancel = byId("skill-target-cancel");
    if (cancel) cancel.onclick = () => { state.skillPending = null; closeDialog(dialog); };
  }

  // 声东击西提示弹窗(替代 window.confirm, 和明察秋毫同样式)
  function showDistractDialog(message, choices, onConfirm) {
    const dialog = byId("skill-distract-dialog");
    if (!dialog) { if (onConfirm && window.confirm(message)) onConfirm(); return; }
    const body = byId("skill-distract-body");
    if (body) {
      let html = `<p class="skill-distract-msg">${escapeHtml(message)}</p>`;
      if (choices && choices.length) {
        html += `<div class="modal-actions">` + choices.map(c => `<button class="game-button ${c.primary ? "primary" : "secondary"}" data-v="${c.value}">${escapeHtml(c.label)}</button>`).join("") + `</div>`;
      }
      body.innerHTML = html;
    }
    dialog.showModal?.();
    // choices 有值时绑 body 内按钮; 无值时绑底部的固定"确定"按钮
    const bindables = body ? body.querySelectorAll(".modal-actions button") : [];
    if (bindables.length) {
      bindables.forEach(btn => {
        btn.onclick = () => {
          dialog.close();
          if (btn.dataset.v !== "cancel") { if (onConfirm) onConfirm(); }
        };
      });
    } else {
      const confirm = byId("skill-distract-confirm");
      if (confirm) confirm.onclick = () => { dialog.close(); if (onConfirm) onConfirm(); };
      const cancel = byId("skill-distract-cancel");
      if (cancel) cancel.onclick = () => dialog.close();
    }
  }


  function openSkillDiscardDialog() {
    const dialog = byId("skill-discard-dialog");
    if (!dialog || !state.skillPending) return;
    const list = byId("skill-discard-list");
    if (list) {
      const cards = state.hands[state.localPlayer] || [];
      list.innerHTML = cards.length
        ? cards.map((c, i) => {
            const suitCls = c.joker ? "t-joker" : (c.suit === "♥" || c.suit === "♦") ? "t-suit-red" : "t-suit-black";
            const text = c.joker ? cardText(c) : cardText(c);
            return `<button class="skill-discard" data-i="${i}" data-id="${c.id}" type="button"><span class="peek-card ${suitCls}">${escapeHtml(text)}</span></button>`;
          }).join("")
        : `<span class="skill-empty">无牌可弃</span>`;
      list.querySelectorAll(".skill-discard").forEach(btn => {
        btn.addEventListener("click", () => {
          const cardId = btn.dataset.id;
          const pending = state.skillPending;
          state.skillPending = null;
          closeDialog(dialog);
          useSkill(state.localPlayer, pending.type, undefined, pending.idx, cardId);
        });
      });
    }
    if (typeof dialog.showModal === "function") dialog.showModal();
    const cancel = byId("skill-discard-cancel");
    if (cancel) cancel.onclick = () => { state.skillPending = null; closeDialog(dialog); };
  }


  function revealSelection() {
    if (!autoScrollHints) return;
    const card = el["player-hand"].querySelector(".selected");
    if (!card) return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.body?.classList?.contains("reduced-motion");
    card.scrollIntoView?.({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest", inline: "center" });
  }

  function renderOpponents() {
    for (let position = 1; position < 4; position++) {
      const count = state.hands[seatAt(position)].length;
      const visible = Math.min(12, Math.ceil(count / 2));
      byId(`opponent-hand-${position}`).innerHTML = Array.from({ length: visible }, () => '<i class="card-back"></i>').join("");
    }
  }

  function renderCurrentPlay() {
    if (!state.currentPlay) {
      el["played-by"].textContent = "新一轮 · 可出任意合法牌型";
      el["played-cards"].innerHTML = "";
      el["played-cards"].className = "played-cards";
      el["combo-label"].innerHTML = "";
      return;
    }
    el["played-by"].textContent = "";
    el["played-cards"].innerHTML = state.currentPlay.cards.map(c => cardMarkup(c)).join("");
    // 出牌人(按阵营着色: 队友绿/对方红) + 牌型(黄字) 合并进 combo-label
    const isAlly = (state.lastPlayer % 2) === (state.localPlayer % 2);
    const whoCls = isAlly ? "combo-who ally" : "combo-who foe";
    el["combo-label"].innerHTML = `<span class="${whoCls}">${escapeHtml(NAMES[state.lastPlayer])} 出牌</span><span class="combo-name">${escapeHtml(COMBO_NAMES[state.currentPlay.combo.type])}</span>`;
    // 给已出的牌加阵营描边 (队友绿/对方红), 与出牌人颜色一致
    el["played-cards"].className = `played-cards ${isAlly ? "ally" : "foe"}`;
  }

  function render() {
    for (let position = 0; position < 4; position++) {
      const seat = seatAt(position);
      byId(`count-${position}`).textContent = state.hands[seat].length;
      byId(`player-${position}`).classList.toggle("active", seat === state.currentPlayer && !state.locked);
      byId(`player-${position}`).classList.toggle("finished", state.finishOrder.includes(seat));
      byId(`player-${position}`).classList.toggle("dealer", seat === state.dealer);
      byId(`player-${position}`).classList.toggle("distracted", state.distracted[seat]);
      byId(`name-${position}`).textContent = NAMES[seat];
      byId(`avatar-${position}`).textContent = position === 0 ? "你" : NAMES[seat].slice(0, 1);
    }
    renderHand();
    renderOpponents();
    renderCurrentPlay();

    const humanTurn = state.currentPlayer === state.localPlayer && !state.locked && !state.finishOrder.includes(state.localPlayer);
    const selectedCombo = detectCombo(selectedCards());
    // ── 还贡等待: 轮到玩家还贡时, 只显示还贡按钮 ──
    const repayActive = !!state.repay && state.repay.receiver === state.localPlayer;
    el["repay-button"].classList.toggle("view-hidden", !repayActive);
    el["play-button"].classList.toggle("view-hidden", repayActive);
    el["hint-button"].classList.toggle("view-hidden", repayActive);
    el["pass-button"].classList.toggle("view-hidden", repayActive);
    el["play-button"].disabled = repayActive || !humanTurn || !canBeat(selectedCombo, state.currentPlay?.combo);
    el["hint-button"].disabled = repayActive || !humanTurn;
    el["pass-button"].disabled = repayActive || !humanTurn || !state.currentPlay;
    el["repay-button"].disabled = !repayActive;
    el["new-game-button"].disabled = state.locked || (state.lan && !state.lan.host);
    el["help-button"].disabled = state.locked;
    el["status-text"].textContent = state.locked ? "本局已经结束" : repayActive ? `请选择一张牌还给 ${NAMES[state.repay.giver]}` : humanTurn ? "轮到你出牌" : `${NAMES[state.currentPlayer]} 正在思考`;
    document.querySelector(".status-dot").classList.toggle("thinking", !humanTurn && !state.locked && !repayActive);
    const ourTeam = state.localPlayer % 2;
    el["our-level"].textContent = state.teamLevels[ourTeam];
    el["their-level"].textContent = state.teamLevels[1 - ourTeam];
    el["our-wins"].textContent = `${state.teamWins[ourTeam]} 胜`;
    el["their-wins"].textContent = `${state.teamWins[1 - ourTeam]} 胜`;
    renderTributeBar();
    renderSkills();
    syncLanState();
  }

  // 顶部偏左常驻展示本局进贡/还贡的牌(分头游/二游两行) + 最近技能效果
  function renderTributeBar() {
    const log = state.tributeLog;
    const slog = state.skillLog || [];
    if ((!log || !log.length) && !slog.length) { el["tribute-bar"].classList.add("view-hidden"); return; }
    el["tribute-bar"].classList.remove("view-hidden");
    // 分两行: 头游(顶级 seat0) 一行, 二游(seat1) 一行
    const rowOf = (seat) => {
      const items = log.filter(it => it.to === seat);
      if (!items.length) return "";
      const cls = seat % 2 === state.localPlayer % 2 ? "ally" : "foe";
      const chips = items.map(it => {
        const card = it.card;
        const suitCls = card.joker ? "t-joker" : (card.suit === "♥" || card.suit === "♦") ? "t-suit-red" : "t-suit-black";
        const pre = it.type === "repay" || it.repay ? "还" : "贡";
        return `<span class="t-card ${suitCls}">${pre}${escapeHtml(card.joker ? cardText(card) : cardText(card))}</span>`;
      }).join("<span class='t-arrow'>→</span>");
      return `<div class="tribute-row"><span class="t-owner ${cls}">${NAMES[seat]}</span>${chips}</div>`;
    };
    const headRow = rowOf(state.headSeat);
    const secondRow = rowOf(state.secondSeat);
    let html = headRow + secondRow;
    if (slog.length) {
      html += `<div class="skill-log">` + slog.slice(-4).map(s => `<div class="slog"><span class="sname">${escapeHtml(s.name)}</span> <span class="sres">${escapeHtml(s.res)}</span></div>`).join("") + `</div>`;
    }
    el["tribute-bar"].innerHTML = html;
  }

  // 追加一条技能效果到 skillLog(最多4条)
  function pushSkillLog(name, res) {
    if (!state.skillLog) state.skillLog = [];
    state.skillLog.push({ name, res });
    if (state.skillLog.length > 4) state.skillLog.shift();
  }

  function selectedCards() {
    return state.hands[state.localPlayer].filter(c => state.selected.has(c.id));
  }

  function updateSelectionTip() {
    const cards = selectedCards();
    const humanTurn = state.currentPlayer === state.localPlayer && !state.locked && !state.finishOrder.includes(state.localPlayer);
    if (!humanTurn) {
      el["play-button"].disabled = true;
      el["play-button"].classList.toggle("power", false);
      el["selection-tip"].classList.remove("error");
      el["selection-tip"].classList.remove("advice");
      el["selection-tip"].classList.toggle("valid", false);
      el["selection-tip"].classList.toggle("power", false);
      el["selection-tip"].textContent = state.locked ? "本局已结束" : `等待${NAMES[state.currentPlayer]}出牌`;
      return;
    }
    const combo = detectCombo(cards);
    const playable = canBeat(combo, state.currentPlay?.combo);
    const power = playable && isBomb(combo);
    el["play-button"].disabled = !humanTurn || !playable;
    el["play-button"].classList.toggle("power", power);
    el["selection-tip"].classList.remove("error");
    el["selection-tip"].classList.remove("advice");
    el["selection-tip"].classList.toggle("valid", playable);
    el["selection-tip"].classList.toggle("power", power);
    if (!cards.length) el["selection-tip"].textContent = "请选择要出的牌";
    else if (!combo) el["selection-tip"].textContent = `已选 ${cards.length} 张 · 暂不构成合法牌型`;
    else if (!canBeat(combo, state.currentPlay?.combo)) el["selection-tip"].textContent = `${COMBO_NAMES[combo.type]} · 压不过上家`;
    else el["selection-tip"].textContent = `${COMBO_NAMES[combo.type]} · ${cards.length} 张`;
  }

  function handleCardClick(event) {
    const card = event.target.closest("[data-card-id]");
    if (!card || state.currentPlayer !== state.localPlayer || state.locked) return;
    const id = card.dataset.cardId;
    if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
    card.classList.toggle("selected", state.selected.has(id));
    card.setAttribute("aria-pressed", String(state.selected.has(id)));
    updateSelectionTip();
    playSfx("select", state.selected.size);
  }

  function removeCards(player, cards) {
    const ids = new Set(cards.map(c => c.id));
    state.hands[player] = state.hands[player].filter(c => !ids.has(c.id));
  }

  function removeCard(player, cardId) {
    state.hands[player] = state.hands[player].filter(c => c.id !== cardId);
  }

  function cardText(card) {
    if (card.joker) return card.big ? "大王" : "小王";
    return `${card.suit}${card.rank}`;
  }

  /* ═══ 技能模式 ── 技能卡系统（10技能，移植自 GuanDanInOffice 并扩展）═══ */
  const SKILL_TYPES = {
    DrawTwo: "无中生有",
    Steal: "顺手牵羊",
    Discard: "过河拆桥",
    Skip: "乐不思蜀",
    Harvest: "五谷丰登",
    Swap: "移花接木",
    Peek: "明察秋毫",
    Replace: "偷梁换柱",
    EmptyFort: "空城计",
    SoundEastWest: "声东击西"
  };
  const SKILL_POOL = ["DrawTwo", "Steal", "Discard", "Skip", "Harvest", "Swap", "Peek", "Replace", "EmptyFort", "SoundEastWest"];
  // 需要选目标的技能: 顺手牵羊/过河拆桥/乐不思蜀/移花接木/明察秋毫/声东击西
  const SKILL_NEEDS_TARGET = type => ["Steal", "Discard", "Skip", "Swap", "Peek", "SoundEastWest"].includes(type);
  // 每种技能需要满足的自身条件(空城计需要手牌≤6)
  const SKILL_SELF_CONDITION = type => {
    if (type === "EmptyFort") return state.hands[state.localPlayer].length <= 6;
    return true;
  };

  // 洗技能池，每人发 2 张（保持 GuanDanInOffice 的 pool[i*2], pool[i*2+1] 逻辑）
  function dealSkillCards() {
    const pool = shuffle([...SKILL_POOL, ...SKILL_POOL]);
    state.skillCards = [[], [], [], []];
    for (let i = 0; i < 4; i++) {
      state.skillCards[i] = [pool[i * 2], pool[i * 2 + 1]].map(type => ({ id: `${type}-${i}-${Math.random().toString(36).slice(2, 6)}`, type }));
    }
  }

  // 生成一张随机牌（克制 2 副牌之外的补充牌），复用现有卡结构
  function generateRandomCard() {
    const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
    const card = { id: `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, suit, rank, copy: 2, joker: false };
    if (Math.random() < 0.05) {
      const big = Math.random() < 0.5;
      card.suit = ""; card.rank = big ? "大王" : "小王"; card.joker = true; card.big = big;
    }
    return card;
  }

  function skillTargetName(target) {
    return target === undefined ? "" : NAMES[target];
  }

  // 返回能否使用（校验回合、模式等），不会真正执行
  function canUseSkill(seat) {
    if (!state.skillMode) return false;
    if (state.locked || state.currentPlayer !== seat) return false;
    if (state.finishOrder.includes(seat)) return false;
    if (!state.skillCards[seat] || !state.skillCards[seat].length) return false;
    // 每回合最多使用 1 张技能卡
    if (state.usedSkillThisTurn && state.currentPlayer === seat) return false;
    return true;
  }

  // 执行技能效果（user 使用技能，target 为目标玩家），成功返回 true
  // 从出牌堆随机抽 n 张(有多少抽多少), 返回抽到的牌
  function drawFromDiscard(n) {
    if (!state.discardPile.length || n <= 0) return [];
    const count = Math.min(n, state.discardPile.length);
    const drawn = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * state.discardPile.length);
      drawn.push(state.discardPile.splice(idx, 1)[0]);
    }
    return drawn;
  }

  // 随机从目标手牌中取 n 张(取整张卡对象)
  function takeRandomFromHand(seat, n) {
    const hand = state.hands[seat];
    if (!hand || !hand.length || n <= 0) return [];
    const taken = [];
    for (let i = 0; i < n; i++) {
      if (!hand.length) break;
      const idx = Math.floor(Math.random() * hand.length);
      taken.push(hand.splice(idx, 1)[0]);
    }
    return taken;
  }

  function applySkill(user, type, target, cardId) {
    const hand = state.hands[user];
    if (!hand) return false;
    if (type === "DrawTwo") {
      // 无中生有：从出牌堆随机抽最多 2 张(有多少抽多少)
      const drawn = drawFromDiscard(2);
      hand.push(...drawn);
      sortHand(hand);
      showToast(`${NAMES[user]} 使用了【无中生有】${drawn.length ? `，获得 ${drawn.length} 张牌！` : "，出牌堆为空无牌可抽！"}`, drawn.length ? "success" : "info");
      pushSkillLog("无中生有", drawn.length ? `获得 ${drawn.length} 张` : "出牌堆为空");
    } else if (type === "Steal") {
      // 顺手牵羊：从目标偷 1 张随机牌
      if (target === undefined || !state.hands[target] || state.hands[target].length === 0) return false;
      const stolen = takeRandomFromHand(target, 1)[0];
      hand.push(stolen);
      sortHand(hand);
      showToast(`${NAMES[user]} 对 ${NAMES[target]} 使用了【顺手牵羊】！`, "success");
      pushSkillLog("顺手牵羊", `偷 ${cardText(stolen)}`);
    } else if (type === "Discard") {
      // 过河拆桥：目标弃 1 张随机牌(直接移出本局, 不进废弃堆)
      if (target === undefined || !state.hands[target] || state.hands[target].length === 0) return false;
      takeRandomFromHand(target, 1);
      showToast(`${NAMES[user]} 对 ${NAMES[target]} 使用了【过河拆桥】！`, "success");
      pushSkillLog("过河拆桥", `弃掉 ${NAMES[target]} 1 张`);
    } else if (type === "Skip") {
      // 乐不思蜀：目标下回合跳过
      if (target === undefined) return false;
      state.skipNextTurn[target] = true;
      showToast(`${NAMES[user]} 对 ${NAMES[target]} 使用了【乐不思蜀】，下回合被跳过！`, "success");
      pushSkillLog("乐不思蜀", `${NAMES[target]} 下回合跳过`);
    } else if (type === "Harvest") {
      // 五谷丰登：所有未出完玩家各从出牌堆获得最多1张(出牌堆不足时随机分配给若干人)
      const active = [0, 1, 2, 3].filter(s => !state.finishOrder.includes(s) && state.hands[s] && state.hands[s].length > 0);
      const available = state.discardPile.length;
      if (available > 0) {
        // 随机打乱获得顺序, 避免固定座位优势
        const order = [...active].sort(() => Math.random() - 0.5);
        const drawCount = Math.min(available, active.length);
        for (let i = 0; i < drawCount; i++) {
          const seat = order[i];
          const drawn = drawFromDiscard(1);
          if (drawn.length) {
            state.hands[seat].push(drawn[0]);
            sortHand(state.hands[seat]);
          }
        }
      }
      showToast(`${NAMES[user]} 使用了【五谷登丰】${available ? "，未出完玩家各获得牌！" : "，出牌堆为空！"}`, available ? "success" : "info");
      pushSkillLog("五谷登丰", available ? "未出完玩家各+1" : "出牌堆为空");
    } else if (type === "Swap") {
      // 移花接木：与目标随机交换 1 张手牌
      if (target === undefined || !state.hands[target] || state.hands[target].length === 0) return false;
      const myCard = takeRandomFromHand(user, 1)[0];
      const tarCard = takeRandomFromHand(target, 1)[0];
      hand.push(tarCard);
      state.hands[target].push(myCard);
      sortHand(hand);
      sortHand(state.hands[target]);
      showToast(`${NAMES[user]} 对 ${NAMES[target]} 使用了【移花接木】, 交换了 1 张牌！`, "success");
      pushSkillLog("移花接木", `与 ${NAMES[target]} 交换1张`);
    } else if (type === "Peek") {
      // 明察秋毫：查看目标最多 3 张手牌(只有使用者本人可见)
      if (target === undefined || !state.hands[target]) return false;
      const targetHand = state.hands[target];
      const count = Math.min(3, targetHand.length);
      const peeked = [...targetHand].slice(0, count).map(c => cardText(c));
      state.peekResult = { target, cards: peeked };
      showToast(`${NAMES[user]} 对 ${NAMES[target]} 使用了【明察秋毫】！`, "success");
      pushSkillLog("明察秋毫", `查看 ${NAMES[target]} ${count} 张`);
      // 弹窗展示(仅使用者), 点确定才关闭
      showPeekDialog(peeked, NAMES[target]);
    } else if (type === "Replace") {
      // 偷梁换柱：弃自己 1 张(移出本局), 再从出牌堆抽 1 张。弃牌可由玩家自选
      if (!hand.length || !state.discardPile.length) return false;
      if (cardId) {
        const idx = hand.findIndex(c => c.id === cardId);
        if (idx < 0) return false;
        hand.splice(idx, 1);
      } else {
        takeRandomFromHand(user, 1);
      }
      const drawn = drawFromDiscard(1);
      if (drawn.length) { hand.push(drawn[0]); sortHand(hand); }
      showToast(`${NAMES[user]} 使用了【偷梁换柱】！${drawn.length ? `，抽到 ${cardText(drawn[0])}` : "，出牌堆为空"}`);
      pushSkillLog("偷梁换柱", drawn.length ? `抽到 ${cardText(drawn[0])}` : "出牌堆为空");
    } else if (type === "EmptyFort") {
      // 空城计：手牌≤6时, 本回合免疫其他玩家的目标型技能
      if (state.hands[user].length > 6) return false;
      state.emptyFortImmunity[user] = true;
      showToast(`${NAMES[user]} 使用了【空城计】, 本回合免疫目标型技能！`, "success");
      pushSkillLog("空城计", "本回合免疫目标技能");
    } else if (type === "SoundEastWest") {
      // 声东击西：锁定目标技能, 逼其主动用技能解除(消耗1张)
      if (target === undefined) return false;
      if (state.distracted[target]) return false; // 已有该状态, 无效
      state.distracted[target] = true;
      showToast(`${NAMES[user]} 对 ${NAMES[target]} 使用了【声东击西】！`, "success");
      pushSkillLog("声东击西", `锁定 ${NAMES[target]}`);
      // 施放反馈弹窗(和明察秋毫同样式)
      showDistractDialog(`【声东击西】已锁定 ${NAMES[target]}！对方需用一张技能才能解除`, null, null);
    }
    return true;
  }

  function closeDialog(dialog) { if (dialog && dialog.open && typeof dialog.close === "function") dialog.close(); }

  // 明察秋毫: 展示查看到的牌(仅使用者本人), 点确定才关闭
  function showPeekDialog(cards, targetName) {
    const dialog = byId("skill-peek-dialog");
    if (!dialog) return;
    const body = byId("skill-peek-list");
    if (body) {
      body.innerHTML = (cards && cards.length)
        ? cards.map(c => `<span class="peek-card">${escapeHtml(c)}</span>`).join("")
        : `<span class="skill-empty">目标手牌为空</span>`;
    }
    const title = byId("skill-peek-title");
    if (title) title.textContent = `${targetName} 的手牌`;
    dialog.showModal?.();
    const confirm = byId("skill-peek-confirm");
    if (confirm && !confirm._bound) {
      confirm._bound = true;
      confirm.addEventListener("click", () => dialog.close());
    }
  }

  // 使用技能（人类/AI 都走这里）：消耗技能卡 + 刷新 + 同步
  function useSkill(user, type, target, cardIdx, cardId) {
    if (!state.skillMode) return false;
    // 统计技能使用（用于调试/测试）
    window.__skillLog = window.__skillLog || [];
    window.__skillLog.push({ user, type, target, time: Date.now() });
    if (window.__skillLog.length > 50) window.__skillLog.shift();
    // 非房主联机时，发 action 给房主执行
    if (state.lan && !state.lan.host) {
      sendLanAction({ type: "action", action: "skill", skill: type, target, cardIdx, cardId });
      return true;
    }
    // 声东击西锁定: 被锁定玩家用技能会被"抵消"(不结算效果, 只用来解除锁定)
    const wasDistracted = state.distracted[user];
    const ok = wasDistracted ? true : applySkill(user, type, target, cardId);
    if (ok) {
      const mine = state.skillCards[user] || [];
      const idx = cardIdx !== undefined ? cardIdx : mine.findIndex(s => s.type === type);
      if (idx >= 0) mine.splice(idx, 1);
      // 声东击西解除: 处于该状态的玩家用技能后立即解除(技能被抵消)
      let skipBanner = false;
      if (state.distracted[user]) {
        state.distracted[user] = false;
        pushSkillLog(SKILL_BUTTON_CN[type] || type, "被声东击西抵消(解除锁定)");
        skipBanner = true;
      } else if (wasDistracted) {
        pushSkillLog(SKILL_BUTTON_CN[type] || type, "被声东击西抵消(解除锁定)");
        skipBanner = true;
      }
      // 每回合最多用1张技能: 标记本回合已用技能
      state.usedSkillThisTurn = true;
      state.selected.clear();
      // 技能使用反馈：给触发技能卡加动画 + 出牌区横幅提示
      const usedSkill = document.querySelector(`.skill-card[data-skill-idx="${idx}"]`);
      if (usedSkill) {
        usedSkill.classList.add("skill-used");
        setTimeout(() => usedSkill.remove(), 450);
      }
      if (!skipBanner) {
        const trickZone = document.querySelector(".trick-zone");
        if (trickZone) {
          const banner = document.createElement("div");
          banner.className = "skill-banner";
          banner.textContent = `${NAMES[user]} 使用【${SKILL_BUTTON_CN[type] || type}】`;
          trickZone.appendChild(banner);
          setTimeout(() => banner.classList.add("show"), 30);
          setTimeout(() => { banner.classList.remove("show"); setTimeout(() => banner.remove(), 350); }, 700);
        }
      }
      render();
      updateSelectionTip();
      renderSkills();
      syncLanState();
      playSfx("skill");
    }
    return ok;
  }


  /* ═══ 进贡 / 还贡 / 抗贡（上一局结束后，下一局发牌完自动执行）═══ */
  function performTribute(prevOrder) {
    // 调试: 记录实际收到的 prevOrder 和进贡结果
    window.__lastTribute = { prevOrder: [...prevOrder], log: [] };
    if (state.round <= 1 || !prevOrder || prevOrder.length < 4) return; // 第1局不进贡
    const head = prevOrder[0];       // 头游 (seat)
    const second = prevOrder[1];     // 二游 (seat)
    const third = prevOrder[2];      // 三游 (seat)
    const last = prevOrder[3];       // 末游/下游 (seat)
    const sweep = (head % 2) === (second % 2); // 双下: 头游+二游同队(赢家包揽前二)
    state.headSeat = head;
    state.secondSeat = second;

    // ── 进贡方(输家方) & 抗贡判定 ──
    // 单下: 只有末游进贡; 双下: 三游+末游都进贡
    const givers = sweep ? [third, last] : [last];
    // 抗贡: 应进贡方合计拥有两张大王 (一人两张 或 各一张 都算)
    const giversBigJokers = givers.reduce((n, s) => n + state.hands[s].filter(c => c.joker && c.big).length, 0);
    if (giversBigJokers >= 2) {
      // 抗贡成功: 免去所有进贡还贡, 由头游(赢家)先出牌
      state.dealer = head;
      window.__lastTribute.log.push({ type: "antigong", givers, head });
      showToast(`${givers.map(s => NAMES[s]).join("、")} 合计抓两张大王，抗贡！由 ${NAMES[head]} 先出牌`, "success");
      return;
    }

    // ── 进贡牌: 每个进贡方给最大一张(逢人配红桃级牌除外) ──
    const pickTribute = seat => {
      const eligible = state.hands[seat].filter(c => !(c.suit === "♥" && c.rank === state.level));
      if (!eligible.length) return null;
      return eligible.reduce((a, b) => rankValue(b.rank) > rankValue(a.rank) ? b : a);
    };

    // ── 单下: 末游→头游 ──
    if (!sweep) {
      const tribute = pickTribute(last);
      if (!tribute) { state.dealer = last; window.__lastTribute.log.push({ type:"single", head, last, note:"no-tribute" }); return; } // 无可贡则下游先出
      removeCard(last, tribute.id);
      state.hands[head].push(tribute);
      state.hands.forEach(sortHand);
      state.tributeLog.push({ type: "tribute", card: tribute, to: head });
      // 非抗贡: 下游(末游)先出
      state.dealer = last;
      // 还贡: 头游还一张≤10(逢人配除外)给末游(拿谁牌还谁)。玩家手动选, AI 自动选最小
      window.__lastTribute.log.push({ type:"single", head, last });
      if (head === state.localPlayer) {
        state.repay = { giver: last, receiver: head, received: tribute };
        showToast(`${NAMES[last]} 向 ${NAMES[head]} 进贡 ${cardText(tribute)}，请选择一张牌还贡`, "info");
      } else {
        const repay = pickRepay(head);
        if (repay) { removeCard(head, repay.id); state.hands[last].push(repay); state.hands.forEach(sortHand); state.tributeLog.push({ type: "repay", card: repay, to: head }); }
        showToast(`${NAMES[last]} 向 ${NAMES[head]} 进贡 ${cardText(tribute)}${repay ? `，${NAMES[head]} 还 ${cardText(repay)}` : ""}`, "info");
      }
      return;
    }

    // ── 双下: 三游+末游各进贡, 头游+二游各收贡 ──
    const g1 = pickTribute(third), g2 = pickTribute(last);
    if (!g1 || !g2) { state.dealer = last; return; }
    // 贡牌按点数排序: 大给头游, 小给二游; 同点按顺时针(头游先拿)
    let big = g1, small = g2;          // big 将给头游, small 给二游
    if (rankValue(g1.rank) < rankValue(g2.rank)) { big = g2; small = g1; }
    // 确定大贡/小贡的来源(配对应还给的进贡者)
    const bigGiver = (g1 === big) ? third : last;    // 大贡来自谁 → 头游还给他
    const smallGiver = (g2 === small) ? last : third; // 小贡来自谁 → 二游还给他
    // 移除两张贡牌
    removeCard(third, g1.id); removeCard(last, g2.id);
    // 双下分配(头游拿大)
    state.hands[head].push(big);
    state.hands[second].push(small);
    state.hands.forEach(sortHand);
    state.tributeLog.push({ type: "tribute", card: big, to: head });
    state.tributeLog.push({ type: "tribute", card: small, to: second });
    // 双下出牌权: 非抗贡, 贡牌牌点较大者先出
    state.dealer = (rankValue(big.rank) >= rankValue(small.rank)) ? bigGiver : smallGiver;
    // 还贡配对: 拿谁牌还谁 — 头游还给大贡者, 二游还给小贡者。玩家手动选, AI 自动选最小
    let pending = [];
    if (head === state.localPlayer) pending.push({ receiver: head, giver: bigGiver, received: big });
    else { const r = pickRepay(head); if (r) { removeCard(head, r.id); state.hands[bigGiver].push(r); state.tributeLog.push({ type: "repay", card: r, to: head }); } }
    if (second === state.localPlayer) pending.push({ receiver: second, giver: smallGiver, received: small });
    else { const r = pickRepay(second); if (r) { removeCard(second, r.id); state.hands[smallGiver].push(r); state.tributeLog.push({ type: "repay", card: r, to: second }); } }
    state.hands.forEach(sortHand);
    // 若玩家需要还贡, 进入 repay 交互(支持逐个还)
    if (pending.length) {
      state.repay = { list: pending, index: 0, giver: pending[0].giver, receiver: pending[0].receiver, received: pending[0].received };
      const p0 = pending[0];
      showToast(`${NAMES[third]} 向 ${NAMES[head]} 进贡 ${cardText(g1)}，${NAMES[last]} 向 ${NAMES[second]} 进贡 ${cardText(g2)}，请 ${NAMES[p0.receiver]} 选择一张牌还贡`, "info");
    } else {
      showToast(`${NAMES[third]} 向 ${NAMES[head]} 进贡 ${cardText(g1)}，${NAMES[last]} 向 ${NAMES[second]} 进贡 ${cardText(g2)}`, "info");
    }
  }

  // 还贡: 从赢家手中选一张≤10的牌(逢人配红桃级牌除外), 自动选最小
  function pickRepay(seat) {
    const repayable = state.hands[seat].filter(c => !c.joker && !(c.suit === "♥" && c.rank === state.level) && naturalValue(c.rank) <= 10);
    if (!repayable.length) return null;
    return repayable.reduce((a, b) => naturalValue(b.rank) < naturalValue(a.rank) ? b : a);
  }

  function commitPlay(player, cards, combo) {
    removeCards(player, cards);
    state.currentPlay = { cards: [...cards], combo };
    state.lastPlayer = player;
    state.passCount = 0;
    // 出牌堆: 本局所有打出的牌累积(供技能抽取)
    state.discardPile.push(...cards);
    state.history.push({ player, action: "play", combo: combo.type, count: cards.length });
    playSfx(isBomb(combo) ? "bomb" : "play");

    if (!state.hands[player].length && !state.finishOrder.includes(player)) {
      state.finishOrder.push(player);
      showToast(`${NAMES[player]} 已出完，获得第 ${state.finishOrder.length} 名`, "success");
    }
    state.selected.clear();
    checkEndOrAdvance(player);
  }

  function checkEndOrAdvance(fromPlayer) {
    if (roundComplete(state.finishOrder)) {
      let next = fromPlayer;
      while (state.finishOrder.length < 4) {
        next = (next + 3) % 4;
        if (!state.finishOrder.includes(next)) state.finishOrder.push(next);
      }
      endGame();
      return;
    }
    state.currentPlayer = nextActive(fromPlayer);
    render();
    updateSelectionTip();
    if (state.currentPlayer === state.localPlayer) playSfx("turn");
    scheduleAI();
  }

  function nextActive(from) {
    let next = (from + 3) % 4;
    let guard = 0;
    while ((state.finishOrder.includes(next) || state.skipNextTurn[next]) && guard < 8) {
      // 乐不思蜀：跳过该玩家，并清除效果（被跳过后恢复正常）
      if (state.skipNextTurn[next]) {
        state.skipNextTurn[next] = false;
        if (state.currentPlay && state.lastPlayer === next) {
          // 若上家出的牌轮到被跳过的玩家，视为其不回应，继续向后
        }
      }
      next = (next + 3) % 4;
      guard++;
    }
    // 切换到新玩家回合: 重置本回合技能使用标记 + 空城计免疫
    state.usedSkillThisTurn = false;
    state.emptyFortImmunity = [false, false, false, false];
    return next;
  }

  function roundComplete(order) {
    return order.length >= 3 || (order.length >= 2 && order[0] % 2 === order[1] % 2);
  }

  function sendLanAction(payload) {
    const recover = () => {
      render();
      updateSelectionTip();
      showToast("发送失败，请检查网络后重试", "error");
    };
    try { Promise.resolve(state.lan.send(payload)).catch(recover); } catch (_) { recover(); }
  }

  function humanPlay() {
    if (state.currentPlayer !== state.localPlayer || state.locked) return;
    if (state.repay && state.repay.receiver === state.localPlayer) return; // 还贡中不能出牌
    const cards = selectedCards();
    const combo = detectCombo(cards);
    if (!combo) return invalid("这几张牌不能组成当前支持的牌型");
    if (!canBeat(combo, state.currentPlay?.combo)) return invalid("牌型或点数不够，无法压过上家");
    if (state.lan && !state.lan.host) {
      el["play-button"].disabled = true;
      sendLanAction({ type: "action", action: "play", cards: cards.map(card => card.id) });
      return;
    }
    commitPlay(state.localPlayer, cards, combo);
  }

  function humanPass() {
    if (state.currentPlayer !== state.localPlayer || state.locked || !state.currentPlay) return;
    if (state.repay && state.repay.receiver === state.localPlayer) return; // 还贡中不能不出
    state.selected.clear();
    if (state.lan && !state.lan.host) {
      el["pass-button"].disabled = true;
      sendLanAction({ type: "action", action: "pass" });
      return;
    }
    commitPass(state.localPlayer);
  }

  // 玩家手动还贡: 从手牌选一张≤10(逢人配除外)的牌还给进贡者
  function humanRepay() {
    if (!state.repay || state.repay.receiver !== state.localPlayer) return;
    const cards = selectedCards();
    const repay = state.repay;
    // 校验: 选且仅选一张, 且≤10非逢人配
    if (cards.length !== 1) return invalid("请选择一张牌用于还贡");
    const card = cards[0];
    if (card.joker || (card.suit === "♥" && card.rank === state.level)) return invalid("红桃级牌(逢人配)不能还贡");
    if (naturalValue(card.rank) > 10) return invalid("还贡的牌点数不能超过10");
    // 执行还贡: 移除自己这张, 给进贡者
    removeCard(state.localPlayer, card.id);
    state.hands[repay.giver].push(card);
    state.hands.forEach(sortHand);
    state.tributeLog.push({ type: "repay", card, to: state.localPlayer });
    // 若还有下一个待还贡(双下两个赢家都是玩家)则继续, 否则结束还贡
    if (repay.list && repay.index + 1 < repay.list.length) {
      state.repay.index++;
      state.repay.giver = repay.list[state.repay.index].giver;
      state.repay.receiver = repay.list[state.repay.index].receiver;
      state.repay.received = repay.list[state.repay.index].received;
      showToast(`请选择一张牌还给 ${NAMES[state.repay.giver]}`, "info");
    } else {
      state.repay = null;
      state.currentPlayer = state.dealer; // 还贡完成, 由下游先出牌
      showToast(`还贡完成，${NAMES[state.dealer]} 先出牌`, "success");
    }
    state.selected.clear();
    render();
    updateSelectionTip();
    scheduleAI();
  }

  function commitPass(player) {
    state.passCount++;
    state.history.push({ player, action: "pass" });
    playSfx("pass");
    const activeCount = 4 - state.finishOrder.length;
    const leaderActive = !state.finishOrder.includes(state.lastPlayer);
    const passesToReset = activeCount - (leaderActive ? 1 : 0);
    const trickLeader = state.lastPlayer;
    let next = nextActive(player);
    let reception = false;
    if (state.passCount >= passesToReset) {
      const partner = trickLeader === null ? null : (trickLeader + 2) % 4;
      if (partner !== null && state.finishOrder.includes(trickLeader) && !state.finishOrder.includes(partner)) {
        next = partner;
        reception = true;
      }
      state.currentPlay = null;
      state.lastPlayer = null;
      state.passCount = 0;
      el["footer-tip"].textContent = reception ? `${NAMES[next]} 接风领牌` : "一轮结束，重新领牌";
    } else {
      el["footer-tip"].textContent = `${NAMES[player]} 选择不出`;
    }
    state.currentPlayer = next;
    render();
    updateSelectionTip();
    if (state.currentPlayer === state.localPlayer) playSfx("turn");
    scheduleAI();
  }

  function invalid(message) {
    el["selection-tip"].textContent = message;
    el["selection-tip"].classList.remove("advice");
    el["selection-tip"].classList.add("error");
    showToast(message, "error");
    playSfx("error");
  }

  function findAIMove(hand, target, teammateLeading = false) {
    sortHand(hand);
    const candidates = [];
    const seen = new Set();
    const add = cards => {
      const key = cards.map(c => c.id).sort().join("|");
      if (seen.has(key)) return;
      seen.add(key);
      const combo = detectCombo(cards);
      if (combo && canBeat(combo, target)) candidates.push({ cards, combo });
    };

    hand.forEach(c => add([c]));
    const groups = new Map();
    hand.filter(c => !isWild(c)).forEach(c => {
      if (!groups.has(c.rank)) groups.set(c.rank, []);
      groups.get(c.rank).push(c);
    });
    const wilds = hand.filter(isWild);
    for (const cards of groups.values()) {
      for (let n = 2; n <= cards.length + wilds.length; n++) {
        const naturalCount = Math.min(cards.length, n);
        add([...cards.slice(0, naturalCount), ...wilds.slice(0, n - naturalCount)]);
      }
    }
    if (wilds.length >= 2) add(wilds.slice(0, 2));

    const jokers = hand.filter(c => c.joker);
    if (jokers.length === 4) add(jokers);

    for (const tripleRank of RANKS) {
      for (const pairRank of RANKS) {
        if (tripleRank === pairRank) continue;
        const triple = (groups.get(tripleRank) || []).slice(0, 3);
        const pair = (groups.get(pairRank) || []).slice(0, 2);
        const needed = 3 - triple.length + 2 - pair.length;
        if (needed <= wilds.length) {
          add([...triple, ...pair, ...wilds.slice(0, needed)]);
        }
      }
    }

    const addPattern = (ranks, count, suit = null) => {
      const cards = [];
      let needed = 0;
      for (const rank of ranks) {
        const matching = (groups.get(rank) || []).filter(c => !c.joker && (!suit || c.suit === suit));
        cards.push(...matching.slice(0, count));
        needed += Math.max(0, count - matching.length);
      }
      if (needed <= wilds.length) add([...cards, ...wilds.slice(0, needed)]);
    };

    const straights = [["A", "2", "3", "4", "5"]];
    for (let i = 0; i <= LEVELS.length - 5; i++) straights.push(LEVELS.slice(i, i + 5));
    for (const ranks of straights) {
      addPattern(ranks, 1);
      SUITS.forEach(suit => addPattern(ranks, 1, suit));
    }
    for (let i = 0; i <= LEVELS.length - 3; i++) addPattern(LEVELS.slice(i, i + 3), 2);
    for (let i = 0; i <= LEVELS.length - 2; i++) addPattern(LEVELS.slice(i, i + 2), 3);

    if (!candidates.length) return null;
    const bombGroups = [...groups.values()]
      .filter(cards => !cards[0]?.joker && cards.length >= 4)
      .map(cards => new Set(cards.map(card => card.id)));
    const safeCandidates = candidates.filter(candidate => isBomb(candidate.combo) || !bombGroups.some(group => {
      const used = candidate.cards.filter(card => group.has(card.id)).length;
      return used > 0 && group.size - used < 4;
    }));
    const pool = safeCandidates.length ? safeCandidates : candidates;
    pool.sort((a, b) => {
      const aBomb = isBomb(a.combo), bBomb = isBomb(b.combo);
      if (aBomb !== bBomb) return aBomb ? 1 : -1;
      if (aBomb) return a.combo.bombPower - b.combo.bombPower;
      return comboScore(a.combo) - comboScore(b.combo);
    });
    const finishing = pool.filter(candidate => candidate.cards.length === hand.length);
    if (finishing.length) return finishing[0];
    if (teammateLeading) return null;
    if (!target) {
      const nonBomb = pool.filter(c => !isBomb(c.combo));
      const shedding = nonBomb.filter(c => c.cards.length > 1).sort((a, b) => b.cards.length - a.cards.length || comboScore(a.combo) - comboScore(b.combo));
      return shedding[0] || nonBomb[0] || pool[0];
    }
    return pool[0];
  }

  // AI 技能决策（智能策略）：根据局势选择最有利的技能，而非随机
  function aiUseSkill(player) {
    if (!state.skillMode || state.locked || state.currentPlayer !== player) return false;
    const skills = state.skillCards[player] || [];
    if (!skills.length) return false;
    if (state.usedSkillThisTurn) return false; // 每回合最多1张
    const handCount = state.hands[player].length;
    const team = player % 2;
    const opponents = [0, 1, 2, 3].filter(s => s !== player && !state.finishOrder.includes(s) && s % 2 !== team);
    const teammate = [0, 1, 2, 3].find(s => s !== player && s % 2 === team && !state.finishOrder.includes(s));
    if (!opponents.length) return false;

    // 最危险对手 = 手牌最少的对手
    const mostThreat = opponents.reduce((a, b) => state.hands[a].length < state.hands[b].length ? a : b, opponents[0]);
    const threatCards = state.hands[mostThreat].length;
    // 队友(若有)手牌
    const teammateCards = teammate !== undefined ? state.hands[teammate].length : 99;
    // 出牌堆数量
    const pile = state.discardPile.length;
    // 敌对玩家拥有的技能类型(判断对手是否还有目标型技能)
    const enemyHasTargetSkill = opponents.some(s => (state.skillCards[s] || []).some(x => ["Steal", "Discard", "Skip", "Swap", "SoundEastWest"].includes(x.type)));
    // 自己被声东击西锁定: 优先用技能解除
    const selfDistracted = state.distracted[player];

    const has = type => skills.some(s => s.type === type);
    const skillOf = type => skills.find(s => s.type === type);
    // 空城计免疫的目标不能选
    const validTargets = opponents.filter(s => !state.emptyFortImmunity[s]);
    const target = validTargets.length ? validTargets.reduce((a, b) => state.hands[a].length < state.hands[b].length ? a : b, validTargets[0]) : null;

    // ── 每张技能评分 ──
    const scores = skills.map(s => {
      let score = 0;
      let bestTarget = target;
      switch (s.type) {
        case "Skip": // 乐不思蜀: 对手≤8分最高, ≤14次之
          if (threatCards <= 5) score = 100;
          else if (threatCards <= 8) score = 80;
          else if (threatCards <= 14) score = 55;
          break;
        case "Discard": // 过河拆桥: 对手牌少得分高
          if (threatCards <= 8) score = 75;
          else if (threatCards <= 14) score = 50;
          break;
        case "Steal": // 顺手牵羊: 对手≤8且自己不是太多牌
          if (threatCards <= 8 && handCount <= 15) score = 70;
          else if (threatCards <= 12) score = 45;
          break;
        case "EmptyFort": // 空城计: 自己≤6且敌方仍有望手牌类目标技能
          if (handCount <= 6 && enemyHasTargetSkill) score = 90;
          break;
        case "SoundEastWest": // 声东击西: 目标对手拥有高价值技能
          {
            const skillVals = { Skip: 100, Discard: 90, Steal: 80, DrawTwo: 70, Harvest: 60, Swap: 40, Replace: 35, Peek: 20, EmptyFort: 30, SoundEastWest: 50 };
            if (target !== null) {
              const targetVals = (state.skillCards[target] || []).map(x => skillVals[x.type] || 0);
              const targetScore = targetVals.reduce((a, b) => a + b, 0);
              if (targetScore >= 120 && threatCards >= 6 && threatCards <= 12) score = 85;
              else if (targetScore >= 90) score = 60;
            }
          }
          break;
        case "Harvest": // 五谷丰登: 队友≤8且对手≥10 或明显差距
          if (teammateCards <= 8 && threatCards >= 10) score = 60;
          else if (teammateCards <= 6 && threatCards >= 8) score = 55;
          break;
        case "DrawTwo": // 无中生有: 自己5~10且出牌堆有牌且无≤8张的对手
          if (handCount >= 5 && handCount <= 10 && pile >= 1 && threatCards > 8) score = 50;
          break;
        case "Replace": // 偷梁换柱: 自己7~15且出牌堆有牌
          if (handCount >= 7 && handCount <= 15 && pile >= 1) score = 35;
          break;
        case "Swap": // 移花接木: 自己明显少于目标
          if (target !== null && state.hands[target].length >= handCount + 4 && handCount <= 12) score = 30;
          break;
        case "Peek": // 明察秋毫: 对手≤10且无更好技能
          if (threatCards <= 10) score = 20;
          break;
      }
      // 声东击西锁定: 处在锁定状态的玩家, 用任意技能解除时加权(优先用高价值技能以外的起解除作用)
      if (selfDistracted && s.type !== "SoundEastWest") score += 25;
      // 被目标免疫时该目标不可用, 若该技能必须目标则扣分
      if (SKILL_NEEDS_TARGET(s.type) && target === null) score = -50;
      return { type: s.type, score, target: bestTarget };
    });

    // 选分数最高的
    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];
    // 最低阈值: 分数低于30不使用(避免无脑随机)
    if (best.score < 30) return false;
    const useTarget = SKILL_NEEDS_TARGET(best.type) ? (best.target !== null ? best.target : target) : undefined;
    // 空城计免疫的目标不能作为目标, 重新选
    let finalTarget = useTarget;
    if (finalTarget !== undefined && state.emptyFortImmunity[finalTarget]) return false;
    if (SKILL_NEEDS_TARGET(best.type) && finalTarget === undefined) return false;
    useSkill(player, best.type, finalTarget, skills.findIndex(s => s.type === best.type));
    return true;
  }

  function scheduleAI() {
    clearTimeout(state.timer);
    state.timer = null;
    const humanSeat = state.lan ? state.lan.humanSeats.includes(state.currentPlayer) : state.currentPlayer === state.localPlayer;
    if (state.locked || humanSeat || (state.lan && !state.lan.host) || document.hidden || el["rules-dialog"].open || el["restart-dialog"].open || byId("settings-dialog")?.open) return;
    const player = state.currentPlayer;
    state.timer = setTimeout(() => {
      if (state.locked || state.currentPlayer !== player) return;
      state.timer = null;
      // 技能模式：AI 先尝试用技能（用技能不消耗出牌机会）
      if (aiUseSkill(player)) {
        // 用技能后若仍轮到该 AI，继续出牌
        if (state.currentPlayer === player && !state.locked && !state.finishOrder.includes(player)) {
          const teammateLeading2 = state.lastPlayer !== null && state.lastPlayer % 2 === player % 2;
          const move2 = findAIMove(state.hands[player], state.currentPlay?.combo || null, teammateLeading2);
          if (move2) commitPlay(player, move2.cards, move2.combo); else if (state.currentPlay) commitPass(player);
          return;
        }
        return;
      }
      const teammateLeading = state.lastPlayer !== null && state.lastPlayer % 2 === player % 2;
      const move = findAIMove(state.hands[player], state.currentPlay?.combo || null, teammateLeading);
      if (move) commitPlay(player, move.cards, move.combo); else commitPass(player);
    }, aiDelay);
  }

  function pauseAI() {
    clearTimeout(state.timer);
    state.timer = null;
  }

  function openPausedDialog(dialog) {
    if (dialog.open) return;
    pauseAI();
    dialog.showModal();
  }

  function closePausedDialog(dialog) {
    if (dialog.open) dialog.close();
    scheduleAI();
  }

  function hint() {
    if (state.currentPlayer !== state.localPlayer || state.locked) return;
    const teammateLeading = state.lastPlayer !== null && state.lastPlayer % 2 === state.localPlayer % 2;
    const move = findAIMove(state.hands[state.localPlayer], state.currentPlay?.combo || null, teammateLeading);
    state.selected.clear();
    if (!move) {
      renderHand();
      updateSelectionTip();
      el["selection-tip"].classList.add("advice");
      if (teammateLeading) {
        el["selection-tip"].textContent = "队友领牌，建议不出";
        el["footer-tip"].textContent = "保留牌力，让队友继续领牌";
      } else {
        el["selection-tip"].textContent = "没有能压过的牌，建议不出";
        el["footer-tip"].textContent = "建议选择不出，等待下一轮";
      }
      playSfx("hint");
      return;
    }
    move.cards.forEach(c => state.selected.add(c.id));
    renderHand();
    updateSelectionTip();
    revealSelection();
    playSfx("hint");
    el["footer-tip"].textContent = `已为你选择：${COMBO_NAMES[move.combo.type]}`;
  }

  function cancelResultDialog() {
    clearTimeout(state.resultTimer);
    state.resultTimer = null;
  }

  function leaveGame() {
    pauseAI();
    cancelResultDialog();
    state.lan = null;
    state.selected.clear();
  }

  function startGame(resetMatch = false) {
    pauseAI();
    cancelResultDialog();
    clearToast();
    if (resetMatch) {
      state.round = 1;
      state.level = "2";
      state.teamLevels = ["2", "2"];
      state.teamWins = [0, 0];
      state.dealer = 0;
    }
    const deck = createDeck();
    state.hands = [[], [], [], []];
    deck.forEach((card, index) => state.hands[index % 4].push(card));
    state.hands.forEach(sortHand);
    // 技能模式：每局重新发技能卡 + 重置技能状态 + 清空出牌堆
    if (state.skillMode) {
      dealSkillCards();
      state.skipNextTurn = [false, false, false, false];
      state.skillTarget = null;
      state.skillPending = null;
      state.discardPile = [];
      state.distracted = [false, false, false, false];
      state.emptyFortImmunity = [false, false, false, false];
      state.usedSkillThisTurn = false;
      state.repay = null;
      state.tributeLog = [];
      state.skillLog = [];
      state.headSeat = null;
      state.secondSeat = null;
    } else {
      state.skillCards = [[], [], [], []];
      state.skipNextTurn = [false, false, false, false];
      state.discardPile = [];
      state.distracted = [false, false, false, false];
      state.emptyFortImmunity = [false, false, false, false];
      state.usedSkillThisTurn = false;
      state.repay = null;
      state.tributeLog = [];
      state.skillLog = [];
      state.headSeat = null;
      state.secondSeat = null;
    }
    // 上一局结束 → 下一局发牌后自动进贡/还贡/抗贡（需在 finishOrder 清空前读取）
    const prevOrder = state.finishOrder.length === 4 ? [...state.finishOrder] : null;
    state.finishOrder = [];
    if (prevOrder) performTribute(prevOrder);
    // 若需玩家还贡, 先把出牌权给还贡者; 否则按 dealer(下游) 先出
    state.currentPlayer = state.repay ? state.repay.receiver : state.dealer;
    state.currentPlay = null;
    state.lastPlayer = null;
    state.passCount = 0;
    state.selected.clear();
    state.finishOrder = [];
    state.locked = false;
    state.animateDeal = true;
    state.history = [];
    el["round-number"].textContent = state.round;
    el["level-rank"].textContent = state.level;
    el["footer-tip"].textContent = "你的搭档坐在对面";
    if (el["restart-dialog"].open) el["restart-dialog"].close();
    if (el["result-dialog"].open) el["result-dialog"].close();
    render();
    updateSelectionTip();
    playSfx("deal");
    scheduleAI();
  }

  function advanceLevel(rank, steps) {
    const index = LEVELS.indexOf(rank);
    return LEVELS[Math.min(LEVELS.length - 1, index + steps)];
  }

  function endGame() {
    state.locked = true;
    pauseAI();
    const winnerTeam = state.finishOrder[0] % 2;
    const ourWin = winnerTeam === state.localPlayer % 2;
    const teamRanks = state.finishOrder.filter(i => i % 2 === winnerTeam).map(i => state.finishOrder.indexOf(i) + 1);
    const sweep = teamRanks[0] === 1 && teamRanks[1] === 2;
    const advance = teamRanks[1] === 2 ? 3 : teamRanks[1] === 3 ? 2 : 1;
    const previousLevel = state.teamLevels[winnerTeam];
    const matchCompleted = previousLevel === "A";
    state.teamLevels[winnerTeam] = advanceLevel(previousLevel, advance);
    state.teamWins[winnerTeam]++;
    state.level = state.teamLevels[winnerTeam];
    state.dealer = state.finishOrder[0];
    state.lastAdvance = advance;
    el["result-title"].textContent = ourWin ? "我方获胜" : "对方获胜";
    el["result-copy"].textContent = matchCompleted
      ? `${ourWin ? "我方" : "对方"}打 A 成功，完成整场比赛！`
      : `${sweep ? "双下！" : `${NAMES[state.finishOrder[0]]} 获得头游。`} ${ourWin ? "我方" : "对方"}连升 ${advance} 级，下一局打 ${state.level}。`;
    renderRanking();
    state.round++;
    el["again-button"].textContent = matchCompleted ? "开始新比赛" : "继续下一局";
    el["again-button"].dataset.resetMatch = matchCompleted ? "true" : "false";
    playSfx(ourWin ? "win" : "finish");
    render();
    updateSelectionTip();
    cancelResultDialog();
    state.resultTimer = setTimeout(() => {
      state.resultTimer = null;
      el["result-dialog"].showModal();
    }, 450);
  }

  let toastTimer;
  function showToast(message, tone = "info") {
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.classList.remove("info");
    el.toast.classList.remove("success");
    el.toast.classList.remove("error");
    el.toast.classList.add(tone);
    el.toast.classList.add("show");
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), toastDuration);
  }

  function clearToast() {
    clearTimeout(toastTimer);
    toastTimer = null;
    el.toast.classList.remove("show");
    el.toast.textContent = "";
  }

  const BGM_MELODY = [196, 220, 246.94, null, 293.66, 246.94, 220, null, 196, 246.94, 293.66, 329.63, 293.66, null, 246.94, 220];
  const BGM_BASS = [98, 110, 123.47, 110];
  let audioContext = null;
  let bgmTimer = null;
  let bgmStep = 0;
  const bgmVoices = new Set();

  function getAudioContext() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      if (!audioContext) audioContext = new AudioCtx();
      if (audioContext.state === "suspended") audioContext.resume()?.catch?.(() => {});
      return audioContext;
    } catch (_) {
      return null;
    }
  }

  function playVoice(frequency, duration, volume, type = "sine", voices = null, delay = 0) {
    if (volume <= 0) return true;
    const ctx = getAudioContext();
    if (!ctx) return false;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const voice = { osc, gain };
      const now = ctx.currentTime;
      const start = now + delay;
      osc.frequency.value = frequency;
      osc.type = type;
      gain.gain.setValueAtTime(.001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + .02);
      gain.gain.exponentialRampToValueAtTime(.001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      voices?.add(voice);
      osc.addEventListener("ended", () => {
        voices?.delete(voice);
        osc.disconnect();
        gain.disconnect();
      }, { once: true });
      osc.start(start);
      osc.stop(start + duration);
      return true;
    } catch (_) {
      return false;
    }
  }

  function playSfx(kind, detail = 0) {
    if (haptics && ["bomb", "win"].includes(kind)) {
      const scale = value => Math.round(value * hapticStrength);
      window.navigator?.vibrate?.(kind === "bomb" ? scale(45) : [scale(35), scale(35), scale(70)]);
    }
    if (!state.sound) return false;
    const profile = {
      soft: { volume: .76, duration: 1.18, type: "sine" },
      classic: { volume: 1, duration: 1, type: null },
      crisp: { volume: 1.08, duration: .78, type: "square" }
    }[sfxProfile];
    const voices = {
      select: [[300 + Math.min(detail, 8) * 18, .035, .022, "sine", 0]],
      pass: [[220, .07, .018, "sine", 0]],
      hint: [[480, .06, .025, "triangle", 0], [720, .09, .018, "triangle", .045]],
      deal: [[260, .05, .018, "triangle", 0], [330, .06, .016, "triangle", .055], [410, .08, .014, "triangle", .11]],
      play: [[410, .065, .028, "triangle", 0], [620, .1, .022, "sine", .045]],
      turn: [[523.25, .07, .022, "sine", .14], [659.25, .11, .018, "sine", .21]],
      bomb: [[105, .24, .045, "sawtooth", 0], [158, .2, .035, "square", .035]],
      error: [[170, .09, .028, "square", 0], [125, .12, .022, "sawtooth", .055]],
      toggle: [[520, .07, .025, "sine", 0], [780, .08, .018, "sine", .045]],
      skill: [[440, .06, .024, "sine", 0], [660, .09, .02, "triangle", .05], [880, .12, .018, "sine", .1]],
      finish: [[220, .18, .025, "triangle", 0], [196, .24, .02, "triangle", .12]],
      win: [[392, .12, .026, "triangle", 0], [493.88, .16, .024, "triangle", .08], [587.33, .28, .022, "triangle", .17]]
    }[kind] || [];
    return voices.map(([frequency, duration, volume, type, delay]) => playVoice(frequency * sfxPitch, duration * profile.duration, volume * sfxVolume * profile.volume, profile.type || type, null, delay)).every(Boolean);
  }

  function playBGMNote() {
    if (!state.music || document.hidden) return false;
    const step = bgmStep++ % BGM_MELODY.length;
    const note = BGM_MELODY[step];
    const texture = {
      minimal: { melody: .0048, bass: 0, type: "sine" },
      balanced: { melody: .006, bass: .003, type: "triangle" },
      rich: { melody: .0065, bass: .0034, harmony: .0018, type: "triangle" }
    }[bgmTexture];
    const played = note ? playVoice(note, .85 / bgmTempo, texture.melody * bgmVolume, texture.type, bgmVoices) : false;
    const bass = texture.bass && step % 4 === 0 && playVoice(BGM_BASS[step / 4], 2.6 / bgmTempo, texture.bass * bgmVolume, "sine", bgmVoices);
    if (note && texture.harmony) playVoice(note * 1.5, .7 / bgmTempo, texture.harmony * bgmVolume, "sine", bgmVoices);
    return (!note && step % 4 !== 0) || played || Boolean(bass);
  }

  function startBGM() {
    if (!state.music || document.hidden) return false;
    if (bgmTimer) return true;
    if (!getAudioContext() || !playBGMNote()) return false;
    bgmTimer = setInterval(playBGMNote, 1050 / bgmTempo);
    return true;
  }

  function stopBGM() {
    if (bgmTimer) {
      clearInterval(bgmTimer);
      bgmTimer = null;
    }
    const now = audioContext?.currentTime || 0;
    for (const { osc, gain } of bgmVoices) {
      gain.gain.cancelScheduledValues?.(now);
      gain.gain.setValueAtTime(.001, now);
      try { osc.stop(now); } catch (_) {}
    }
    bgmVoices.clear();
  }

  function syncAudioButtons() {
    const controls = [
      [el["sound-button"], state.sound, "音效"],
      [el["music-button"], state.music, "背景音乐"]
    ];
    controls.forEach(([button, enabled, label]) => {
      button.classList.toggle("off", !enabled);
      button.setAttribute("aria-pressed", String(enabled));
      const action = `${enabled ? "关闭" : "开启"}${label}`;
      button.setAttribute("aria-label", action);
      button.setAttribute("title", action);
    });
    window.dispatchEvent?.(new CustomEvent("guandan:audio", { detail: { sound: state.sound, music: state.music, sfxVolume, bgmVolume, sfxPitch, bgmTempo } }));
  }

  function lanSnapshot() {
    return {
      level: state.level, round: state.round, hands: state.hands, currentPlayer: state.currentPlayer,
      currentPlay: state.currentPlay, lastPlayer: state.lastPlayer, passCount: state.passCount,
      finishOrder: state.finishOrder, locked: state.locked, history: state.history,
      teamLevels: state.teamLevels, teamWins: state.teamWins, dealer: state.dealer,
      lastAdvance: state.lastAdvance, names: NAMES,
      skillMode: state.skillMode, skillCards: state.skillCards, skipNextTurn: state.skipNextTurn,
      discardPile: state.discardPile, distracted: state.distracted, emptyFortImmunity: state.emptyFortImmunity,
      result: {
        title: el["result-title"].textContent, copy: el["result-copy"].textContent,
        again: el["again-button"].textContent, resetMatch: el["again-button"].dataset.resetMatch
      }
    };
  }

  function syncLanState() {
    if (state.lan?.host) Promise.resolve(state.lan.send({ type: "snapshot", revision: ++state.lan.revision, state: lanSnapshot() })).catch(() => {});
  }

  function configureLan({ seat, host, humanSeats, names, send, skillMode }) {
    pauseAI();
    state.localPlayer = seat;
    state.lan = { host, humanSeats: [...humanSeats], send, revision: 0, lastRevision: -1 };
    NAMES = [...names];
    state.selected.clear();
    state.animateDeal = !host;
    if (typeof skillMode === "boolean") state.skillMode = skillMode;
  }

  function updateLanPlayers(humanSeats, names) {
    if (!state.lan) return;
    state.lan.humanSeats = [...humanSeats];
    NAMES = [...names];
    render();
    updateSelectionTip();
    scheduleAI();
  }

  function renderRanking() {
    el.ranking.innerHTML = state.finishOrder.map((player, index) => {
      const ally = player % 2 === state.localPlayer % 2;
      return `<div class="rank-item"><b>${index + 1}</b><span class="rank-name ${ally ? "ally" : "foe"}">${escapeHtml(NAMES[player])}</span></div>`;
    }).join("");
  }

  function applyLanSnapshot(snapshot, revision) {
    if (!state.lan || state.lan.host || !Number.isSafeInteger(revision) || revision <= state.lan.lastRevision) return;
    state.lan.lastRevision = revision;
    const previousPlayer = state.currentPlayer;
    const previousHistorySize = state.history.length;
    const wasLocked = state.locked;
    if (snapshot.round !== state.round || (wasLocked && !snapshot.locked)) state.animateDeal = true;
    const fields = ["level", "round", "hands", "currentPlayer", "currentPlay", "lastPlayer", "passCount", "finishOrder", "locked", "history", "teamLevels", "teamWins", "dealer", "lastAdvance", "skillMode", "skillCards", "skipNextTurn", "discardPile", "distracted", "emptyFortImmunity"];
    fields.forEach(field => { state[field] = snapshot[field]; });
    NAMES = [...snapshot.names];
    state.selected.clear();
    el["round-number"].textContent = state.round;
    el["level-rank"].textContent = state.level;
    if (snapshot.result) {
      el["result-title"].textContent = snapshot.result.title;
      el["result-copy"].textContent = snapshot.result.copy;
      renderRanking();
      el["again-button"].textContent = state.locked ? "等待房主继续" : snapshot.result.again;
      el["again-button"].disabled = state.locked;
    }
    if (!state.locked && el["result-dialog"].open) el["result-dialog"].close();
    const firstDeal = state.animateDeal;
    render();
    updateSelectionTip();
    if (firstDeal) playSfx("deal");
    if (state.history.length > previousHistorySize) {
      const action = state.history.at(-1);
      playSfx(action.action === "pass" ? "pass" : isBomb(state.currentPlay?.combo) ? "bomb" : "play");
    }
    if (previousPlayer !== state.localPlayer && state.currentPlayer === state.localPlayer && !state.locked) playSfx("turn");
    if (!wasLocked && state.locked) playSfx(state.finishOrder[0] % 2 === state.localPlayer % 2 ? "win" : "finish");
    if (state.locked && !el["result-dialog"].open) el["result-dialog"].showModal();
  }

  function handleLanAction(player, payload) {
    if (!state.lan?.host || !state.lan.humanSeats.includes(player) || state.currentPlayer !== player || state.locked) return syncLanState();
    if (payload.action === "skill") {
      useSkill(player, payload.skill, payload.target, payload.cardIdx, payload.cardId);
      syncLanState();
      return;
    }
    if (payload.action === "pass") {
      if (state.currentPlay) commitPass(player); else syncLanState();
      return;
    }
    if (payload.action !== "play" || !Array.isArray(payload.cards)) return syncLanState();
    const ids = new Set(payload.cards);
    const cards = state.hands[player].filter(card => ids.has(card.id));
    const combo = cards.length === ids.size ? detectCombo(cards) : null;
    if (!combo || !canBeat(combo, state.currentPlay?.combo)) return syncLanState();
    commitPlay(player, cards, combo);
  }

  function setAudio(settings) {
    if (typeof settings.sfxVolume === "number") sfxVolume = Math.max(0, Math.min(1, settings.sfxVolume));
    if (typeof settings.bgmVolume === "number") bgmVolume = Math.max(0, Math.min(1, settings.bgmVolume));
    if (typeof settings.sfxPitch === "number") sfxPitch = Math.max(.5, Math.min(1.8, settings.sfxPitch));
    if (["soft", "classic", "crisp"].includes(settings.sfxProfile)) sfxProfile = settings.sfxProfile;
    const nextTexture = ["minimal", "balanced", "rich"].includes(settings.bgmTexture) ? settings.bgmTexture : bgmTexture;
    const nextTempo = typeof settings.bgmTempo === "number" ? Math.max(.5, Math.min(2, settings.bgmTempo)) : bgmTempo;
    const restartBGM = Boolean(bgmTimer) && (nextTexture !== bgmTexture || nextTempo !== bgmTempo);
    if (restartBGM) stopBGM();
    bgmTexture = nextTexture;
    bgmTempo = nextTempo;
    if (typeof settings.sound === "boolean") state.sound = settings.sound;
    if (typeof settings.music === "boolean") {
      state.music = settings.music;
      if (state.music && !startBGM()) state.music = false;
      if (!state.music) stopBGM();
    } else if (restartBGM && state.music) startBGM();
    if (el["sound-button"]) syncAudioButtons();
  }

  function setPreferences(settings) {
    if (typeof settings.aiDelay === "number") aiDelay = Math.max(100, Math.min(3000, settings.aiDelay));
    if (typeof settings.autoScrollHints === "boolean") autoScrollHints = settings.autoScrollHints;
    if (typeof settings.confirmRestart === "boolean") confirmRestart = settings.confirmRestart;
    if (typeof settings.haptics === "boolean") haptics = settings.haptics;
    if (typeof settings.hapticStrength === "number") hapticStrength = Math.max(.25, Math.min(2, settings.hapticStrength));
    if (typeof settings.toastDuration === "number") toastDuration = Math.max(600, Math.min(5000, settings.toastDuration));
  }

  window.GuandanGame = {
    pause: pauseAI,
    leave: leaveGame,
    startSingle(mode) {
      state.localPlayer = 0;
      state.lan = null;
      // 玩家自己固定为"牌手"，3 个 AI 从名字库随机取
      const aiNames = randomAINames();
      NAMES = ["牌手", ...aiNames];
      el["again-button"].disabled = false;
      state.skillMode = mode === "skill";
      startGame(true);
    },
    configureLan,
    updateLanPlayers,
    startLanGame() { if (state.lan?.host) startGame(true); },
    applyLanSnapshot,
    handleLanAction,
    previewSfx() { if (!playSfx("hint")) showToast("当前浏览器不支持音效", "error"); },
    setAudio,
    setPreferences,
    resume: scheduleAI,
    // ── 技能模式开关（由入口传入）──
    setSkillMode(on) { state.skillMode = Boolean(on); },
    getSkillMode() { return state.skillMode; },
    // ── 测试钩子(调试用) ──
    __testSkill(type, target) {
      const before = { hand: state.hands[state.localPlayer].length, pile: state.discardPile.length, tgt: target !== undefined ? state.hands[target].length : null };
      const ok = applySkill(state.localPlayer, type, target);
      return { ok, before, after: { hand: state.hands[state.localPlayer].length, pile: state.discardPile.length, tgt: target !== undefined ? state.hands[target].length : null } };
    },
    __useSkill(type, target, cardId) {
      // 走完整 useSkill 链路(含声东击西抵消)
      const idx = (state.skillCards[state.localPlayer] || []).findIndex(s => s.type === type);
      const ok = useSkill(state.localPlayer, type, target, idx, cardId);
      render();
      return { ok, distracted: state.distracted[state.localPlayer], skillLog: state.skillLog ? state.skillLog.slice(-4) : [] };
    },
    __getState() { return { hand: state.hands[state.localPlayer].length, pile: state.discardPile.length, skillMode: state.skillMode, skillLog: state.skillLog ? state.skillLog.slice(-4) : [] }; },
    __setDebug({ handCards, pileCards, distracted, emptyFortImmunity }) {
      if (handCards !== undefined) state.hands[state.localPlayer] = Array.from({length: handCards}, (_,i)=>({id:'t'+i, suit:'♠', rank:String(i), copy:2, joker:false}));
      if (pileCards !== undefined) state.discardPile = Array.from({length: pileCards}, (_,i)=>({id:'p'+i, suit:'♣', rank:String(i), copy:2, joker:false}));
      if (distracted !== undefined) state.distracted = [...distracted];
      if (emptyFortImmunity !== undefined) state.emptyFortImmunity = [...emptyFortImmunity];
    },
    __setSeatHand(seat, cards) {
      state.hands[seat] = cards.map((c, i) => ({ id: `${seat}-${c.suit}-${c.rank}-${i}`, suit: c.suit, rank: c.rank, copy: c.copy || 2, joker: c.joker, big: c.big }));
      if (cards.length) sortHand(state.hands[seat]);
    },
    __forceRender() { render(); },
    __debugState() { return {
      round: state.round, level: state.level, dealer: state.dealer,
      currentPlayer: state.currentPlayer, localPlayer: state.localPlayer,
      finishOrder: [...state.finishOrder], names: [...NAMES],
      handCounts: state.hands.map(h => h.length), discardPile: state.discardPile.length,
      skillMode: state.skillMode, locked: state.locked
    }; },
    __finishOrder(order) { state.finishOrder = [...order]; },
    __callTribute(order) {
      if (order !== undefined) state.finishOrder = [...order];
      const before = state.hands.map(h => h.length);
      performTribute([...state.finishOrder]);
      render();
      return {
        round: state.round, dealer: state.dealer,
        handBefore: before, handAfter: state.hands.map(h => h.length),
        toast: (el.toast ? el.toast.textContent : "")
      };
    },
    __readHand(seat) { return (state.hands[seat] || []).slice(0, 31).map(c => ({ id: c.id, suit: c.suit, rank: c.rank, joker: !!c.joker, big: !!c.big })); },
    __level() { return state.level; },
    __setRound(r) { state.round = r; }
  };

  function shortcutAction(event) {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return null;
    if (event.target.closest?.("button, dialog")) return null;
    if (event.key === "Enter") return "play";
    if (event.key === " ") return "pass";
    if (event.key === "h" || event.key === "H") return "hint";
    return null;
  }

  function bindEvents() {
    el["player-hand"].addEventListener("click", handleCardClick);
    el["play-button"].addEventListener("click", humanPlay);
    el["pass-button"].addEventListener("click", humanPass);
    el["repay-button"].addEventListener("click", humanRepay);
    el["hint-button"].addEventListener("click", hint);
    el["new-game-button"].addEventListener("click", () => confirmRestart ? openPausedDialog(el["restart-dialog"]) : startGame(false));
    el["cancel-restart"].addEventListener("click", () => closePausedDialog(el["restart-dialog"]));
    el["confirm-restart"].addEventListener("click", () => startGame(false));
    el["again-button"].addEventListener("click", () => startGame(el["again-button"].dataset.resetMatch === "true"));
    el["help-button"].addEventListener("click", () => openPausedDialog(el["rules-dialog"]));
    el["close-rules"].addEventListener("click", () => closePausedDialog(el["rules-dialog"]));
    el["confirm-rules"].addEventListener("click", () => closePausedDialog(el["rules-dialog"]));
    el["rules-dialog"].addEventListener("cancel", event => {
      event.preventDefault();
      closePausedDialog(el["rules-dialog"]);
    });
    el["result-dialog"].addEventListener("cancel", event => event.preventDefault());
    el["restart-dialog"].addEventListener("cancel", event => {
      event.preventDefault();
      closePausedDialog(el["restart-dialog"]);
    });
    el["sound-button"].addEventListener("click", () => {
      state.sound = !state.sound;
      syncAudioButtons();
      if (state.sound) playSfx("toggle");
      showToast(state.sound ? "音效已开启" : "音效已关闭", state.sound ? "success" : "info");
    });
    el["music-button"].addEventListener("click", () => {
      state.music = !state.music;
      let message;
      if (state.music && !startBGM()) {
        state.music = false;
        message = "当前浏览器不支持背景音乐";
      } else if (state.music) {
        message = "背景音乐已开启";
      } else {
        stopBGM();
        message = "背景音乐已关闭";
      }
      syncAudioButtons();
      showToast(message, state.music ? "success" : message.includes("不支持") ? "error" : "info");
    });
    /* 手机横屏悬浮菜单：点「菜单」展开/收起下拉面板 */
    const menuButton = document.getElementById("game-menu-button");
    const headerActions = document.getElementById("header-actions");
    if (menuButton && headerActions) {
      const closeMenu = () => {
        headerActions.classList.remove("open");
        menuButton.setAttribute("aria-expanded", "false");
      };
      menuButton.addEventListener("click", event => {
        event.stopPropagation();
        const open = headerActions.classList.toggle("open");
        menuButton.setAttribute("aria-expanded", String(open));
      });
      headerActions.addEventListener("click", event => {
        if (event.target.closest("button")) closeMenu();
      });
      document.addEventListener("click", event => {
        if (headerActions.classList.contains("open") &&
            !event.target.closest("#game-menu-button") &&
            !event.target.closest("#header-actions")) closeMenu();
      });
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        pauseAI();
        stopBGM();
      } else {
        startBGM();
        scheduleAI();
      }
    });
    document.addEventListener("keydown", event => {
      const action = shortcutAction(event);
      if (!action || state.currentPlayer !== state.localPlayer || state.locked) return;
      if (action === "play" && !el["play-button"].disabled) humanPlay();
      if (action === "pass") {
        event.preventDefault();
        if (state.currentPlay) humanPass();
      }
      if (action === "hint") hint();
    });
    syncAudioButtons();
  }

  initElements();
  bindEvents();
  startGame();
})();
