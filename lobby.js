const playerNameInput = document.querySelector("#player-name");
const createRoomButton = document.querySelector("#create-room");
const joinRoomButton = document.querySelector("#join-room");
const roomCodeInput = document.querySelector("#room-code");
const connectionStatus = document.querySelector("#connection-status");

function setStatus(message, type = "info") {
  if (!connectionStatus) {
    return;
  }
  connectionStatus.textContent = message;
  connectionStatus.classList.toggle(
    "connection__status--error",
    type === "error"
  );
}

function sanitizeRoomCode(value) {
  return (value || "").trim().toUpperCase();
}

function goToRoom({ action, name, roomCode }) {
  sessionStorage.setItem("chipCalcAction", action);
  sessionStorage.setItem("chipCalcName", name);
  if (roomCode) {
    sessionStorage.setItem("chipCalcRoomCode", roomCode);
  } else {
    sessionStorage.removeItem("chipCalcRoomCode");
  }

  const baseUrl = new URL(window.location.href);
  baseUrl.search = "";
  baseUrl.hash = "";
  baseUrl.pathname = baseUrl.pathname.replace(/[^/]*$/, "room.html");

  if (action === "join" && roomCode) {
    baseUrl.searchParams.set("room", roomCode);
  } else if (action === "create") {
    baseUrl.searchParams.set("mode", "create");
  }

  window.location.href = baseUrl.toString();
}

createRoomButton?.addEventListener("click", () => {
  const name = playerNameInput.value.trim();
  if (!name) {
    setStatus("请输入昵称再创建房间。", "error");
    playerNameInput.focus();
    return;
  }

  goToRoom({ action: "create", name });
});

joinRoomButton?.addEventListener("click", () => {
  const name = playerNameInput.value.trim();
  const code = sanitizeRoomCode(roomCodeInput.value);

  if (!name) {
    setStatus("请输入昵称再加入房间。", "error");
    playerNameInput.focus();
    return;
  }
  if (!code) {
    setStatus("请输入房间号。", "error");
    roomCodeInput.focus();
    return;
  }

  goToRoom({ action: "join", name, roomCode: code });
});

playerNameInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    createRoomButton?.click();
  }
});

roomCodeInput?.addEventListener("input", () => {
  roomCodeInput.value = sanitizeRoomCode(roomCodeInput.value);
});

roomCodeInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    joinRoomButton?.click();
  }
});

