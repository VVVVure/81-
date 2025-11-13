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
const shareLinkContainer = document.querySelector("#share-link");
const shareLinkText = document.querySelector("#share-link-text");
const copyLinkButton = document.querySelector("#copy-link");
const scoreboardSection = document.querySelector("#scoreboard");
const scoreboardRoom = document.querySelector("#scoreboard-room");
const scoreboardList = document.querySelector("#scoreboard-list");

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
    apiKey: "REPLACE_WITH_YOUR_API_KEY",
    authDomain: "REPLACE_WITH_YOUR_AUTH_DOMAIN",
    databaseURL: "REPLACE_WITH_YOUR_DATABASE_URL",
    projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
    storageBucket: "REPLACE_WITH_YOUR_STORAGE_BUCKET",
    messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
    appId: "REPLACE_WITH_YOUR_APP_ID",
  };

let firebaseApp = null;
let database = null;
let currentRoomCode = null;
let playerId = null;
let playerDisplayName = "";
let playersRef = null;
let playersListener = null;

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
}

function updateStartingValueDisplay(buyins) {
  const effectiveBuyins = Math.max(1, Number.isFinite(buyins) ? buyins : 1);
  startingValueEl.textContent = currencyFormatter.format(
    BASE_STACK_VALUE * effectiveBuyins
  );
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return code;

}

function getShareLink(code) {
  const url = new URL(window.location.href);
  url.hash = code;
  return url.toString();
}

async function createRoom() {
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
  createRoomButton.disabled = false;
  joinRoomButton.disabled = false;
}

async function joinRoom(codeFromInput) {
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
  createRoomButton.disabled = false;
  joinRoomButton.disabled = false;
}

async function connectToRoom(code, name) {
  const db = ensureFirebase();
  currentRoomCode = code;
  playerDisplayName = name;

  const roomRef = db.ref(`rooms/${code}`);
  playersRef = roomRef.child("players");

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
  toggleFormEnabled(true);
  scoreboardSection.hidden = false;
  scoreboardRoom.textContent = `房间号：${code}`;

  const shareLink = getShareLink(code);
  shareLinkContainer.hidden = false;
  shareLinkText.textContent = shareLink;

  if (window.location.hash !== `#${code}`) {
    window.history.replaceState(null, "", `#${code}`);
  }

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
  }
}

function setupEventHandlers() {
  chipForm.addEventListener("submit", handleCalculation);

  buyinsInput.addEventListener("input", () => {
    updateStartingValueDisplay(Number(buyinsInput.value));
  });

  createRoomButton.addEventListener("click", createRoom);
  joinRoomButton.addEventListener("click", () => joinRoom());

  copyLinkButton.addEventListener("click", async () => {
    if (!shareLinkText.textContent) {
      return;
    }
    try {
      await navigator.clipboard.writeText(shareLinkText.textContent);
      copyLinkButton.textContent = "已复制";
      setTimeout(() => {
        copyLinkButton.textContent = "复制链接";
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

function init() {
  toggleFormEnabled(false);
  updateStartingValueDisplay(Number(buyinsInput.value));
  attemptAutoJoin();
  setupEventHandlers();
}

init();