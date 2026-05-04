const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// =====================
// CONFIG
// =====================
const THRESHOLD = 0.1; // €/kWh
const API_URL =
  "https://dashboard.elering.ee/api/nps/price?start=&end=&fields=ee";

// =====================
// MEMORY CACHE
// =====================
let cache = {
  price: null,
  timestamp: null,
};

// история для Grafana
let history = [];

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
// VALIDATION
// =====================
function isValidPrice(price) {
  return typeof price === "number" && isFinite(price);
}

// =====================
// FETCH PRICE
// =====================
async function fetchPrice() {
  try {
    const res = await axios.get(API_URL);

    const raw =
      res.data?.data?.ee?.[0]?.price ??
      res.data?.data?.[0]?.price;

    if (!isValidPrice(raw)) {
      throw new Error("Invalid price from API");
    }

    // convert €/MWh → €/kWh
    const price = raw / 1000;

    cache.price = price;
    cache.timestamp = new Date().toISOString();

    // add to history
    history.push({
      time: cache.timestamp,
      value: price,
    });

    // limit memory
    if (history.length > 500) history.shift();

    log("INFO", "price_updated", { price });

  } catch (err) {
    log("ERROR", "api_failure", { message: err.message });
  }
}

// =====================
// INIT REFRESH
// =====================
setInterval(fetchPrice, 60 * 1000); // каждую минуту
fetchPrice();

// =====================
// HEALTHCHECK
// =====================
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// =====================
// CURRENT STATUS (Grafana Stat)
// =====================
app.get("/api/boiler/status", (req, res) => {
  if (!cache.price) {
    return res.json({
      current_price_eur: null,
      threshold: THRESHOLD,
      status: "UNKNOWN",
    });
  }

  const status = cache.price <= THRESHOLD ? "ON" : "OFF";

  res.json({
    current_price_eur: cache.price,
    threshold: THRESHOLD,
    status,
  });
});

// =====================
// HISTORY (Grafana Time series)
// =====================
app.get("/api/boiler/history", (req, res) => {
  res.json(history);
});

// =====================
// START SERVER
// =====================
app.listen(PORT, () => {
  log("INFO", "server_started", { port: PORT });
});
