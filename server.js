const express = require("express");
const axios = require("axios");
const client = require("prom-client");

const app = express();
const PORT = process.env.PORT || 3000;

// =====================
// METRICS (Prometheus)
// =====================
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const priceGauge = new client.Gauge({
  name: "electricity_price_eur",
  help: "Current electricity price in EUR",
});

const statusGauge = new client.Gauge({
  name: "boiler_status",
  help: "Boiler ON=1 OFF=0",
});

// =====================
// CACHE (RAM)
// =====================
let cache = {
  price: null,
  timestamp: null,
};

// =====================
// CONFIG
// =====================
const THRESHOLD = 0.1; // евро
const API_URL =
  "https://dashboard.elering.ee/api/nps/price?start=&end=&fields=ee";

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
// FETCH FROM API
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

    cache.price = raw;
    cache.timestamp = new Date().toISOString();

    // метрика цены
    priceGauge.set(raw);

    log("INFO", "price_updated", { price: raw });

  } catch (err) {
    log("ERROR", "api_failure", { message: err.message });
  }
}

// =====================
// CACHE REFRESH (1 HOUR)
// =====================
setInterval(fetchPrice, 60 * 60 * 1000);
fetchPrice(); // initial

// =====================
// HEALTHCHECK
// =====================
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// =====================
// API STATUS
// =====================
app.get("/api/boiler/status", (req, res) => {
  try {
    if (!cache.price) {
      log("WARN", "empty_cache");

      statusGauge.set(0);

      return res.json({
        status: "OFF",
        current_price_eur: null,
        threshold: THRESHOLD,
      });
    }

    const status = cache.price <= THRESHOLD ? "ON" : "OFF";

    // метрика ON/OFF
    statusGauge.set(status === "ON" ? 1 : 0);

    log("INFO", "status_check", {
      price: cache.price,
      status,
    });

    res.json({
      status,
      current_price_eur: cache.price,
      threshold: THRESHOLD,
    });

  } catch (err) {
    log("ERROR", "runtime_error", { message: err.message });

    statusGauge.set(0);

    res.json({
      status: "OFF",
      current_price_eur: null,
      threshold: THRESHOLD,
    });
  }
});

// =====================
// METRICS ENDPOINT
// =====================
app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// =====================
// START SERVER
// =====================
app.listen(PORT, () => {
  log("INFO", "server_started", { port: PORT });
});
