const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

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
// ENDPOINT
// =====================
app.get("/api/boiler/status", (req, res) => {
  try {
    if (!cache.price) {
      log("WARN", "empty_cache");
      return res.json({
        status: "OFF",
        current_price_eur: null,
        threshold: THRESHOLD,
      });
    }

    const status = cache.price <= THRESHOLD ? "ON" : "OFF";

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

    res.json({
      status: "OFF",
      current_price_eur: null,
      threshold: THRESHOLD,
    });
  }
});

// =====================
app.listen(PORT, () => {
  log("INFO", "server_started", { port: PORT });
});
