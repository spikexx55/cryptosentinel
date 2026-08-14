const CRYPTOCOMPARE = 'https://min-api.cryptocompare.com/data';
const BINANCE = 'https://api.binance.com/api/v3';

async function fetchJson(url, timeout = 4000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const DEFAULT = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK'];

function fallbackCandles(symbol) {
  const base = { BTC: 103000, ETH: 3200, SOL: 190, XRP: 0.62, ADA: 0.72, DOGE: 0.17, AVAX: 35, LINK: 18 }[symbol] || 100;
  let price = base;
  return Array.from({ length: 240 }, (_, i) => {
    const drift = Math.sin(i / 13 + symbol.charCodeAt(0)) * 0.011 + 0.001;
    const open = price;
    price *= 1 + drift;
    return {
      time: Date.now() - (239 - i) * 3600000,
      open,
      high: Math.max(open, price) * 1.008,
      low: Math.min(open, price) * 0.992,
      close: price,
      volume: base * 100
    };
  });
}

async function candles(symbol) {
  // 1. Probar CryptoCompare (Muy rápido)
  const ccData = await fetchJson(`${CRYPTOCOMPARE}/v2/histohour?fsym=${symbol}&tsym=USD&limit=239`);
  if (ccData && ccData.Response === 'Success' && ccData.Data && ccData.Data.Data) {
    return ccData.Data.Data.map(r => ({
      time: r.time * 1000,
      open: +r.open,
      high: +r.high,
      low: +r.low,
      close: +r.close,
      volume: +r.volumeto
    }));
  }

  // 2. Probar Binance
  const bData = await fetchJson(`${BINANCE}/klines?symbol=${symbol}USDT&interval=1h&limit=240`);
  if (Array.isArray(bData)) {
    return bData.map(r => ({
      time: r[0],
      open: +r[1],
      high: +r[2],
      low: +r[3],
      close: +r[4],
      volume: +r[5]
    }));
  }

  return fallbackCandles(symbol);
}

async function marketSnapshot(symbol, liveTicker = null) {
  const c = await candles(symbol);
  
  let price = c.at(-1).close;
  let change24h = c.length >= 24 ? ((price / c.at(-24).close) - 1) * 100 : 0;
  let volume24h = c.slice(-24).reduce((s, it) => s + (it.volume || 0), 0);
  let source = 'fallback';

  if (liveTicker) {
    price = liveTicker.price;
    change24h = liveTicker.change24h;
    volume24h = liveTicker.volume24h;
    source = liveTicker.source;
  } else if (c !== fallbackCandles(symbol)) {
    source = 'CryptoCompare';
  }

  return {
    symbol,
    price: price || 0,
    change24h: change24h || 0,
    volume24h: volume24h || 0,
    candles: c,
    source,
    updatedAt: Date.now()
  };
}

async function allMarkets(symbols = DEFAULT) {
  if (!symbols || !symbols.length) symbols = DEFAULT;

  // Traer los precios en tiempo real de todos los símbolos juntas en 1 sola llamada
  const symsStr = symbols.join(',');
  const rawCC = await fetchJson(`${CRYPTOCOMPARE}/pricemultifull?fsyms=${symsStr}&tsyms=USD`);

  const tickersMap = {};
  if (rawCC && rawCC.RAW) {
    symbols.forEach(sym => {
      if (rawCC.RAW[sym] && rawCC.RAW[sym].USD) {
        const t = rawCC.RAW[sym].USD;
        tickersMap[sym] = {
          price: +t.PRICE,
          change24h: +t.CHANGEPCT24HOUR,
          volume24h: +t.VOLUME24HOURTO,
          source: 'CryptoCompare'
        };
      }
    });
  }

  const results = await Promise.all(symbols.map(sym => marketSnapshot(sym, tickersMap[sym])));
  return results;
}

async function sentiment() {
  const data = await fetchJson('https://api.alternative.me/fng/?limit=1');
  if (data && data.data && data.data[0]) {
    return { value: +data.data[0].value, label: data.data[0].value_classification, source: 'Alternative.me', isLive: true };
  }
  return { value: 50, label: 'Neutral', source: null, isLive: false };
}

module.exports = { candles, marketSnapshot, allMarkets, sentiment };
