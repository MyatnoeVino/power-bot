const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

let cache = {
  price: null,
  timestamp: null,
};

const THRESHOLD = 0.1;

const API_URL =
  "https://dashboard.elering.ee/api/nps/price?start=&end=&fields=ee";

function log(level, message, data = {}) {
  console.log(
    `[${level}] service=power-bot ${message}` +
      Object.entries(data).map(([k, v]) => ` ${k}=${v}`).join("")
  );
}

function isValidPrice(price) {
  return typeof price === "number" && isFinite(price);
}

async function fetchPrice() {
  try {
    const res = await axios.get(API_URL, { timeout: 5000 });

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

// initial fetch
fetchPrice();

// refresh every hour
setInterval(fetchPrice, 60 * 60 * 1000);

app.get("/api/boiler/status", (req, res) => {
  if (!cache.price) {
    return res.json({
      status: "OFF",
      current_price_eur: null,
      threshold: THRESHOLD,
    });
  }

  const status = cache.price <= THRESHOLD ? "ON" : "OFF";

  res.json({
    status,
    current_price_eur: cache.price,
    threshold: THRESHOLD,
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  log("INFO", "server_started", { port: PORT });
});
