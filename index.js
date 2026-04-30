const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

let priceCache = null;
const THRESHOLD = 0.10;

// Получение цен
async function fetchPrices() {
  const now = new Date();
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const response = await axios.get(
    "https://dashboard.elering.ee/api/nps/price",
    {
      params: {
        start: now.toISOString(),
        end: end.toISOString(),
        fields: "ee"
      }
    }
  );

  return response.data.data.ee;
}

// Обновление cache
async function updateCache() {
  try {
    const data = await fetchPrices();
    priceCache = data;

    console.log(`[INFO] ts=${new Date().toISOString()} cache_updated=true`);
  } catch (err) {
    console.error(`[ERROR] ts=${new Date().toISOString()} message=${err.message}`);
  }
}

// Запуск cache
setInterval(updateCache, 60 * 60 * 1000);
updateCache();

// Получение текущей цены
function getCurrentPrice() {
  if (!priceCache) return null;

  const hour = new Date().getUTCHours();
  const entry = priceCache[hour];

  if (!entry || typeof entry.price !== 'number' || !isFinite(entry.price)) {
    return null;
  }

  return entry.price;
}

// Логика
function decide(price) {
  if (price === null) return "OFF";
  return price <= THRESHOLD ? "ON" : "OFF";
}

// API
app.get('/api/boiler/status', (req, res) => {
  try {
    const price = getCurrentPrice();

    if (price === null) {
      return res.json({
        status: "OFF",
        current_price_eur: 0,
        threshold: THRESHOLD
      });
    }

    const status = decide(price);

    console.log(`[INFO] ts=${new Date().toISOString()} price_eur=${price} status=${status}`);

    res.json({
      status,
      current_price_eur: price,
      threshold: THRESHOLD
    });

  } catch (err) {
    console.error(`[ERROR] ts=${new Date().toISOString()} message=${err.message}`);

    res.status(500).json({ error: "Internal error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});