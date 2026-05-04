const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// =====================
// CONFIG
// =====================
const THRESHOLD = 0.1;

const API_URL =
  "https://dashboard.elering.ee/api/nps/price?start=&end=&fields=ee";

// =====================
// MEMORY STORAGE (для Grafana графика)
// =====================
let history = [];

// максимум точек в памяти
const MAX_HISTORY = 200;

// =====================
// LOGGING
// =====================
function log(level, message, data = {}) {
  console.log(
    `[${level}] service=power-bot ${message} ${Object.entries(data)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")}`
  );
}

// =====================
// FETCH PRICE
// =====================
async function fetchPrice() {
  try {
    const res = await axios.get(API_URL);

    const price =
      res.data?.data?.ee?.[0]?.price ??
      res.data?.data?.[0]?.price;

    if (typeof price !== "number") {
      throw new Error("Invalid price");
    }

    // сохраняем в историю
    history.push({
      time: new Date().toISOString(),
      value: price,
    });

    // ограничиваем память
    if (history.length > MAX_HISTORY) {
      history.shift();
    }

    log("INFO", "price_updated", { price });

  } catch (err) {
    log("ERROR", "api_error", { message: err.message });
  }
}

// =====================
// REFRESH EVERY 1 MIN
// =====================
setInterval(fetchPrice, 60 * 1000);
fetchPrice();

// =====================
// HEALTHCHECK
// =====================
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// =====================
// CURRENT STATUS (для boiler)
// =====================
app.get("/api/boiler/status", (req, res) => {
  const last = history[history.length - 1];

  if (!last) {
    return res.json({
      status: "OFF",
      current_price_eur: null,
      threshold: THRESHOLD,
    });
  }

  const status = last.value <= THRESHOLD ? "ON" : "OFF";

  res.json({
    status,
    current_price_eur: last.value,
    threshold: THRESHOLD,
  });
});

// =====================
// 📊 HISTORY FOR GRAFANA (ВАЖНО)
// =====================
app.get("/api/boiler/history", (req, res) => {
  res.json(history);
});

// =====================
app.listen(PORT, () => {
  log("INFO", "server_started", { port: PORT });
});
