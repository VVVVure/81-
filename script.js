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

function updateStartingValueDisplay(buyins) {
  const effectiveBuyins = Math.max(1, Number.isFinite(buyins) ? buyins : 1);
  startingValueEl.textContent = currencyFormatter.format(
    BASE_STACK_VALUE * effectiveBuyins
  );
}

updateStartingValueDisplay(Number(buyinsInput.value));

buyinsInput.addEventListener("input", () => {
  updateStartingValueDisplay(Number(buyinsInput.value));
});

chipForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(chipForm);

  const breakdown = [];
  let grandTotal = 0;
  let chipCount = 0;
  const buyins = Math.max(1, Number(formData.get("buyins")));
  const startingValue = BASE_STACK_VALUE * buyins;

  formData.forEach((value, key) => {
    if (key === "buyins") {
      return;
    }
    const input = chipForm.elements.namedItem(key);
    const faceValue = Number(input.dataset.value);
    const count = Math.max(0, Number(value));

    if (!Number.isFinite(count)) {
      return;
    }

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
});

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

