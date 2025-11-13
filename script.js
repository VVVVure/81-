const chipForm = document.querySelector("#chip-form");
const resultsSection = document.querySelector("#results");
const totalChipsEl = document.querySelector("#total-chips");
const totalValueEl = document.querySelector("#total-value");
const breakdownList = document.querySelector("#breakdown");
const startingValueEl = document.querySelector("#starting-value");
const netDeltaEl = document.querySelector("#net-delta");
const netDeltaLabelEl = document.querySelector("#net-delta-label");
const netDeltaValueEl = document.querySelector("#net-delta-value");
const buyinsInput = document.querySelector("#buyins");
const playerNameInput = document.querySelector("#player-name");
const createRoomButton = document.querySelector("#create-room");
const joinRoomButton = document.querySelector("#join-room");
const roomCodeInput = document.querySelector("#room-code");
const connectionStatus = document.querySelector("#connection-status");
const connectionCard = document.querySelector("#connection-card");
const calculatorCard = document.querySelector("#calculator-card");
const scoreboardSection = document.querySelector("#scoreboard");
const scoreboardRoom = document.querySelector("#scoreboard-room");
const scoreboardList = document.querySelector("#scoreboard-list");
const connectionHint = document.querySelector("#connection-hint");
const copyRoomCodeButton = document.querySelector("#copy-room-code");
const bankForm = document.querySelector("#bank-form");
const bankHandsInput = document.querySelector("#bank-hands");
const recordBuyinButton = document.querySelector("#record-buyin");
const bankHandValueEl = document.querySelector("#bank-hand-value");
const bankLogCard = document.querySelector("#bank-log-card");
const bankLogList = document.querySelector("#bank-log-list");
const bankLogEmpty = document.querySelector("#bank-log-empty");
const bankTotalEl = document.querySelector("#bank-total");

const STARTING_STACK = {
  black: 5,
  blue: 5,
  white: 8,
  red: 10,
};

const currencyFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
});

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const BASE_STACK_VALUE = Object.entries(STARTING_STACK).reduce(
  (total, [chip, count]) => {
    const input = chipForm.elements.namedItem(chip);
    if (!input) {
      return total;
    }
    const faceValue = Number(input.dataset.value);
    return total + count * faceValue;
  },
  0
);

const firebaseConfig =
  window.FIREBASE_CONFIG || {
    apiKey: "AIzaSyB7YKIRQxUsalxXpJvLmDLEBs481FeCADU",
    authDomain: "chips-counting-f34a0.firebaseapp.com",
    databaseURL: "https://chips-counting-f34a0-default-rtdb.firebaseio.com",
    projectId: "chips-counting-f34a0",
    storageBucket: "chips-counting-f34a0.firebasestorage.app",
    messagingSenderId: "770413220260",
    appId: "1:770413220260:web:5c5165e821c00d06e77131",
    measurementId: "G-1ZZRND8ZYM",
  };

let firebaseApp = null;
let database = null;
let currentRoomCode = null;
let playerId = null;
let playerDisplayName = "";
let playersRef = null;
let playersListener = null;
let bankLogsRef = null;
let bankLogsListener = null;

function ensureFirebase() {
  if (
    !firebaseConfig ||
    firebaseConfig.apiKey === "REPLACE_WITH_YOUR_API_KEY"
  ) {
    throw new Error("请先在 script.js 中填写 Firebase 配置信息。");
  }
  if (!firebase.apps.length) {
    firebaseApp = firebase.initializeApp(firebaseConfig);
    database = firebase.database();
  } else {
    firebaseApp = firebase.app();
    database = firebase.database();
  }
  return database;
}

function setStatus(message, type = "info") {
  connectionStatus.textContent = message;
  connectionStatus.classList.toggle(
    "connection__status--error",
    type === "error"
  );
}

function toggleFormEnabled(enabled) {
  if (calculatorCard) {
    calculatorCard.hidden = !enabled;
  }
  if (connectionCard && enabled) {
    connectionCard.hidden = true;
  }
  if (bankForm) {
    bankForm.hidden = !enabled;
  }
  if (enabled) {
    chipForm.removeAttribute("data-disabled");
  } else {
    chipForm.setAttribute("data-disabled", "");
  }
  Array.from(chipForm.elements).forEach((el) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) {
      el.disabled = !enabled && el.type !== "submit";
    }
  });
  if (bankHandsInput) {
    bankHandsInput.disabled = !enabled;
  }
  if (recordBuyinButton) {
    recordBuyinButton.disabled = !enabled;
  }
}

function updateStartingValueDisplay(buyins) {
  const effectiveBuyins = Math.max(1, Number.isFinite(buyins) ? buyins : 1);
  startingValueEl.textContent = currencyFormatter.format(
    BASE_STACK_VALUE * effectiveBuyins
  );
}

function updateBankHandValue() {
  if (bankHandValueEl) {
    bankHandValueEl.textContent = currencyFormatter.format(BASE_STACK_VALUE);
  }
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return code;
}

async function createRoom() {
  if (!createRoomButton) {
    return;
  }
  try {
    ensureFirebase();
  } catch (error) {
    setStatus(error.message, "error");
    return;
  }
  const name = playerNameInput.value.trim();
  if (!name) {
    setStatus("请输入昵称再创建房间。", "error");
    playerNameInput.focus();
    return;
  }

  setStatus("正在创建房间…");
  createRoomButton.disabled = true;
  joinRoomButton.disabled = true;

  try {
    const db = ensureFirebase();
    let code = generateRoomCode();
    let attempts = 0;

    while (attempts < 5) {
      // eslint-disable-next-line no-await-in-loop
      const snapshot = await db.ref(`rooms/${code}`).get();
      if (!snapshot.exists()) {
        break;
      }
      code = generateRoomCode();
      attempts += 1;
    }

    const roomRef = db.ref(`rooms/${code}`);
    await roomRef.set({
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      baseStackValue: BASE_STACK_VALUE,
    });

    await connectToRoom(code, name);
    setStatus(`房间创建成功，当前房间号：${code}`);
  } catch (error) {
    console.error("创建房间失败", error);
    setStatus(
      error?.message || "创建房间失败，请稍后重试。",
      "error"
    );
  } finally {
    createRoomButton.disabled = false;
    joinRoomButton.disabled = false;
  }
}

async function joinRoom(codeFromInput) {
  if (!joinRoomButton) {
    return;
  }
  try {
    ensureFirebase();
  } catch (error) {
    setStatus(error.message, "error");
    return;
  }
  const name = playerNameInput.value.trim();
  if (!name) {
    setStatus("请输入昵称再加入房间。", "error");
    playerNameInput.focus();
    return;
  }

  const code = (codeFromInput || roomCodeInput.value || "").trim().toUpperCase();
  if (!code) {
    setStatus("请先输入房间号。", "error");
    roomCodeInput.focus();
    return;
  }

  setStatus(`正在加入房间 ${code}…`);
  createRoomButton.disabled = true;
  joinRoomButton.disabled = true;

  try {
    const db = ensureFirebase();
    const roomRef = db.ref(`rooms/${code}`);
    const snapshot = await roomRef.get();
    if (!snapshot.exists()) {
      setStatus("房间不存在，请确认房间号是否正确。", "error");
      createRoomButton.disabled = false;
      joinRoomButton.disabled = false;
      return;
    }

    await connectToRoom(code, name);
    setStatus(`已加入房间：${code}`);
  } catch (error) {
    console.error("加入房间失败", error);
    setStatus(
      error?.message || "加入房间失败，请稍后重试。",
      "error"
    );
  } finally {
    createRoomButton.disabled = false;
    joinRoomButton.disabled = false;
  }
}

async function connectToRoom(code, name) {
  const db = ensureFirebase();
  currentRoomCode = code;
  playerDisplayName = name;

  const roomRef = db.ref(`rooms/${code}`);
  playersRef = roomRef.child("players");
  if (bankLogsRef && bankLogsListener) {
    bankLogsRef.off("value", bankLogsListener);
  }
  bankLogsRef = roomRef.child("bankLogs");

  const newPlayerRef = playersRef.push();
  playerId = newPlayerRef.key;

  await newPlayerRef.set({
    name,
    buyins: Number(buyinsInput.value) || 1,
    counts: STARTING_STACK,
    totalChips: 0,
    totalValue: 0,
    startingValue: BASE_STACK_VALUE,
    netDelta: 0,
    updatedAt: firebase.database.ServerValue.TIMESTAMP,
  });

  newPlayerRef.onDisconnect().remove();

  subscribeToPlayers();
  subscribeToBankLogs();
  toggleFormEnabled(true);
  scoreboardSection.hidden = false;
  scoreboardRoom.textContent = `房间号：${code}`;
  if (scoreboardRoom) {
    scoreboardRoom.dataset.room = code;
  }
  if (copyRoomCodeButton) {
    copyRoomCodeButton.hidden = false;
    copyRoomCodeButton.dataset.room = code;
    copyRoomCodeButton.textContent = "复制房间号";
  }

  if (window.location.hash !== `#${code}`) {
    window.history.replaceState(null, "", `#${code}`);
  }

  sessionStorage.removeItem("chipCalcName");
  sessionStorage.removeItem("chipCalcRoomCode");

  chipForm.reset();
  buyinsInput.value = "1";
  updateStartingValueDisplay(1);
  resultsSection.hidden = true;
}

function subscribeToPlayers() {
  if (!playersRef) {
    return;
  }
  if (playersListener) {
    playersRef.off("value", playersListener);
  }
  playersListener = (snapshot) => {
    const players = snapshot.val() || {};
    renderScoreboard(players);
  };
  playersRef.on("value", playersListener);
}

function subscribeToBankLogs() {
  if (!bankLogsRef) {
    return;
  }
  if (bankLogsListener) {
    bankLogsRef.off("value", bankLogsListener);
  }
  bankLogsListener = (snapshot) => {
    renderBankLogs(snapshot.val());
  };
  bankLogsRef.on("value", bankLogsListener);
}

async function syncPlayerData(payload) {
  if (!playersRef || !playerId) {
    return;
  }
  await playersRef.child(playerId).update({
    ...payload,
    updatedAt: firebase.database.ServerValue.TIMESTAMP,
  });
}

function renderScoreboard(playersMap) {
  const players = Object.entries(playersMap).map(([key, value]) => ({
    id: key,
    ...value,
  }));

  if (players.length === 0) {
    scoreboardList.innerHTML = "<li>房间内暂时没有玩家数据。</li>";
    return;
  }

  players.sort((a, b) => b.netDelta - a.netDelta);

  scoreboardList.innerHTML = "";
  players.forEach((player) => {
    const li = document.createElement("li");
    li.className = "scoreboard__item";

    const nameEl = document.createElement("span");
    nameEl.className = "scoreboard__name";
    nameEl.textContent =
      player.id === playerId ? `${player.name}（我）` : player.name;

    const valueEl = document.createElement("span");
    valueEl.className = "scoreboard__value";
    const net =
      typeof player.netDelta === "number" ? player.netDelta : Number(player.netDelta) || 0;
    let valueClass = "scoreboard__value--even";
    let prefix = "持平";
    if (net > 0) {
      valueClass = "scoreboard__value--win";
      prefix = "赢得";
    } else if (net < 0) {
      valueClass = "scoreboard__value--loss";
      prefix = "需补";
    }
    valueEl.classList.add(valueClass);
    valueEl.textContent = `${prefix} ${currencyFormatter.format(Math.abs(net))}`;

    const summaryEl = document.createElement("span");
    summaryEl.className = "scoreboard__summary";
    summaryEl.textContent = `总价值 ${
      player.totalValue
        ? currencyFormatter.format(player.totalValue)
        : currencyFormatter.format(0)
    } · 买入 ${
      player.startingValue
        ? currencyFormatter.format(player.startingValue)
        : currencyFormatter.format(0)
    } · 筹码 ${player.totalChips || 0} 枚`;

    li.appendChild(nameEl);
    li.appendChild(valueEl);
    li.appendChild(summaryEl);
    scoreboardList.appendChild(li);
  });
}

function renderBankLogs(logMap) {
  if (!bankLogCard || !bankLogList || !bankTotalEl) {
    return;
  }

  const logs = Object.entries(logMap || {}).map(([key, value]) => ({
    id: key,
    ...value,
    createdAt: value?.createdAt || 0,
    hands: Number(value?.hands) || 0,
    totalValue:
      typeof value?.totalValue === "number"
        ? value.totalValue
        : Number(value?.totalValue) || 0,
  }));

  if (!logs.length) {
    bankLogCard.hidden = true;
    bankLogList.innerHTML = "";
    bankTotalEl.textContent = `总计 ${currencyFormatter.format(0)}`;
    if (bankLogEmpty) {
      bankLogEmpty.hidden = false;
    }
    return;
  }

  logs.sort((a, b) => b.createdAt - a.createdAt);

  bankLogCard.hidden = false;
  bankLogList.innerHTML = "";
  let totalValue = 0;

  logs.forEach((log) => {
    const effectiveValue =
      log.totalValue || log.hands * BASE_STACK_VALUE || 0;
    totalValue += effectiveValue;

    const li = document.createElement("li");
    li.className = "bank__item";

    const who = document.createElement("span");
    who.className = "bank__who";
    who.textContent = log.name || "玩家";

    const details = document.createElement("span");
    details.className = "bank__details";
    details.textContent = `${log.hands} 手 · ${currencyFormatter.format(
      effectiveValue
    )}`;

    const time = document.createElement("span");
    time.className = "bank__time";
    if (log.createdAt) {
      time.textContent = dateTimeFormatter.format(new Date(log.createdAt));
    } else {
      time.textContent = "";
    }

    li.appendChild(who);
    li.appendChild(details);
    li.appendChild(time);
    bankLogList.appendChild(li);
  });

  bankTotalEl.textContent = `总计 ${currencyFormatter.format(totalValue)}`;
  if (bankLogEmpty) {
    bankLogEmpty.hidden = true;
  }
}

function renderBreakdown(items) {
  breakdownList.innerHTML = "";

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "result__item";

    const labelWrapper = document.createElement("span");
    labelWrapper.className = "chip-label";

    const dot = document.createElement("span");
    dot.className = `chip-dot chip-dot--${item.key}`;
    labelWrapper.appendChild(dot);

    const labelText = document.createElement("strong");
    labelText.textContent = `${item.label.replace(/\(.+\)/, "").trim()}`;
    labelWrapper.appendChild(labelText);

    const detail = document.createElement("span");
    detail.textContent = `${item.count} 枚 × ¥${Number(item.faceValue).toFixed(2)}`;
    labelWrapper.appendChild(detail);

    const value = document.createElement("span");
    value.className = "result__value";
    value.textContent = currencyFormatter.format(item.subtotal);

    li.appendChild(labelWrapper);
    li.appendChild(value);
    breakdownList.appendChild(li);
  });
}

async function recordBankBuyIn() {
  if (!bankLogsRef) {
    setStatus("尚未连接房间，无法记录银行买入。", "error");
    return;
  }
  const rawHands = Number(bankHandsInput?.value);
  const hands = Number.isFinite(rawHands) ? Math.floor(rawHands) : 0;
  if (!hands || hands < 1) {
    setStatus("请输入正确的买入手数（至少 1 手）。", "error");
    bankHandsInput?.focus();
    return;
  }

  const totalValue = hands * BASE_STACK_VALUE;

  try {
    await bankLogsRef.push({
      playerId,
      name: playerDisplayName || playerNameInput?.value || "玩家",
      hands,
      totalValue,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
    });

    const currentBuyins = Math.max(
      1,
      Number(buyinsInput.value) || 1
    ) + hands;
    buyinsInput.value = currentBuyins.toString();
    updateStartingValueDisplay(currentBuyins);
    await syncPlayerData({
      name: playerDisplayName || playerNameInput?.value || "玩家",
      buyins: currentBuyins,
      startingValue: BASE_STACK_VALUE * currentBuyins,
    });

    setStatus(`已记录银行买入 ${hands} 手。`);
    if (bankHandsInput) {
      bankHandsInput.value = "1";
    }
  } catch (error) {
    console.error("记录银行买入失败", error);
    setStatus("记录银行买入失败，请稍后重试。", "error");
  }
}

function handleCalculation(event) {
  event.preventDefault();
  const formData = new FormData(chipForm);

  const breakdown = [];
  let grandTotal = 0;
  let chipCount = 0;
  const buyins = Math.max(1, Number(formData.get("buyins")));
  const startingValue = BASE_STACK_VALUE * buyins;

  const counts = {};

  formData.forEach((value, key) => {
    if (key === "buyins") {
      return;
    }
    const input = chipForm.elements.namedItem(key);
    if (!input) {
      return;
    }
    const faceValue = Number(input.dataset.value);
    const count = Math.max(0, Number(value));

    if (!Number.isFinite(count)) {
      return;
    }

    counts[key] = count;
    const subtotal = count * faceValue;

    const labelElement = input.closest(".form__row")?.querySelector("label");

    breakdown.push({
      key,
      label: labelElement ? labelElement.textContent : key,
      count,
      faceValue,
      subtotal,
    });

    grandTotal += subtotal;
    chipCount += count;
  });

  totalChipsEl.textContent = chipCount.toString();
  totalValueEl.textContent = currencyFormatter.format(grandTotal);
  startingValueEl.textContent = currencyFormatter.format(startingValue);

  const netDelta = grandTotal - startingValue;
  const netState =
    netDelta > 0 ? "win" : netDelta < 0 ? "loss" : "neutral";
  netDeltaEl.dataset.state = netState;
  const label =
    netState === "win" ? "赢得" : netState === "loss" ? "需补" : "持平";
  netDeltaLabelEl.textContent = `当前盈亏（${label}）`;
  netDeltaValueEl.textContent = currencyFormatter.format(Math.abs(netDelta));

  renderBreakdown(breakdown);

  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

  syncPlayerData({
    name: playerDisplayName,
    buyins,
    counts,
    totalChips: chipCount,
    totalValue: grandTotal,
    startingValue,
    netDelta,
  });
}

function attemptAutoJoin() {
  const hash = window.location.hash.replace("#", "").trim();
  if (hash.length >= 4) {
    roomCodeInput.value = hash.toUpperCase();
    setStatus("请输入昵称后点击加入房间。");
  }
}

function setupEventHandlers() {
  chipForm?.addEventListener("submit", handleCalculation);

  buyinsInput?.addEventListener("input", () => {
    updateStartingValueDisplay(Number(buyinsInput.value));
  });

  createRoomButton?.addEventListener("click", createRoom);
  joinRoomButton?.addEventListener("click", () => joinRoom());

  recordBuyinButton?.addEventListener("click", recordBankBuyIn);
  bankHandsInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      recordBankBuyIn();
    }
  });

  copyRoomCodeButton?.addEventListener("click", async () => {
    const code = copyRoomCodeButton.dataset.room || scoreboardRoom?.dataset.room;
    if (!code) {
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      copyRoomCodeButton.textContent = "已复制";
      setTimeout(() => {
        copyRoomCodeButton.textContent = "复制房间号";
      }, 2000);
    } catch (error) {
      console.error("复制失败", error);
    }
  });

  window.addEventListener("beforeunload", () => {
    if (playersRef && playerId) {
      playersRef.child(playerId).remove();
    }
  });
}

function getRoomCodeFromURL() {
  const params = new URLSearchParams(window.location.search);
  const param = params.get("room");
  if (param) {
    return param.trim().toUpperCase();
  }
  const hash = window.location.hash.replace("#", "").trim();
  if (hash) {
    return hash.toUpperCase();
  }
  return "";
}

function attemptAutoConnect() {
  if (!createRoomButton || !joinRoomButton) {
    return;
  }

  const action = sessionStorage.getItem("chipCalcAction");
  const storedName = sessionStorage.getItem("chipCalcName") || "";
  const storedRoom = sessionStorage.getItem("chipCalcRoomCode") || "";
  const roomFromURL = getRoomCodeFromURL();

  if (storedName) {
    playerNameInput.value = storedName;
  }

  if (roomFromURL && roomCodeInput) {
    roomCodeInput.value = roomFromURL;
  } else if (storedRoom && roomCodeInput) {
    roomCodeInput.value = storedRoom;
  }

  if (action === "create") {
    sessionStorage.removeItem("chipCalcAction");
    setStatus("正在创建房间…");
    createRoom();
  } else if (action === "join") {
    sessionStorage.removeItem("chipCalcAction");
    const targetRoom = roomCodeInput?.value || storedRoom || roomFromURL;
    if (targetRoom) {
      joinRoom(targetRoom);
    } else {
      setStatus("未找到房间号，请确认链接或返回首页重新进入。", "error");
    }
  } else if (roomFromURL) {
    setStatus("请输入昵称并点击加入房间。");
    if (connectionHint) {
      connectionHint.textContent = `房间号 ${roomFromURL} 已填写，请输入昵称后加入。`;
    }
  }
}

function init() {
  if (!chipForm || !buyinsInput) {
    return;
  }
  toggleFormEnabled(false);
  updateBankHandValue();
  updateStartingValueDisplay(Number(buyinsInput.value));
  attemptAutoJoin();
  attemptAutoConnect();
  setupEventHandlers();
}

init();