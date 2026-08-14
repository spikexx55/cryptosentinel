const BINANCE = 'https://api.binance.com/api/v3';
const CRYPTOCOMPARE = 'https://min-api.cryptocompare.com/data';
const COINGECKO = 'https://api.coingecko.com/api/v3';

const CG_IDS = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple',
  ADA: 'cardano', DOGE: 'dogecoin', AVAX: 'avalanche-2', LINK: 'chainlink'
};

// Timeout reducido a 3s para pasar rápido al siguiente proveedor si uno falla
async function fetchJson(url, timeout = 3000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { 
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }, 
      signal: controller.signal 
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

const DEFAULT = ['BTC','ETH','SOL','XRP','ADA','DOGE','AVAX','LINK'];

function fallbackCandles(symbol) {
  const base = { BTC: 103000, ETH: 3200, SOL: 190, XRP: 0.62, ADA: 0.72, DOGE: 0.17, AVAX: 35, LINK: 18 }[symbol] || 100;
  let price = base * (1 - (([...symbol].reduce((s,ch)=>s+ch.charCodeAt(0),0) % 13)/100));
  return Array.from({length:240}, (_,i)=>{ const drift = Math.sin(i/13 + symbol.charCodeAt(0)) * .011 + .001; const open = price; price *= 1 + drift; return { time: Date.now() - (239 - i)*3600000, open, high: Math.max(open,price)*1.008, low: Math.min(open,price)*.992, close: price, volume: base * (600 + (i%21)*35) }; });
}

async function candles(symbol) {
  // 1. Binance
  try {
    const rows = await fetchJson(`${BINANCE}/klines?symbol=${symbol}USDT&interval=1h&limit=240`);
    return rows.map(r=>({ time: r[0], open: +r[1], high:+r[2], low:+r[3], close:+r[4], volume:+r[5] }));
  } catch {}

  // 2. CryptoCompare (Muy fiable desde Vercel)
  try {
    const data = await fetchJson(`${CRYPTOCOMPARE}/v2/histohour?fsym=${symbol}&tsym=USD&limit=239`);
    if (data && data.Data && data.Data.Data && data.Data.Data.length > 0) {
      return data.Data.Data.map(r=>({ time: r.time * 1000, open: +r.open, high: +r.high, low: +r.low, close: +r.close, volume: +r.volumeto }));
    }
  } catch {}

  // 3. CoinGecko
  try {
    const cgId = CG_IDS[symbol] || symbol.toLowerCase();
    const data = await fetchJson(`${COINGECKO}/coins/${cgId}/ohlc?vs_currency=usd&days=10`);
    if (Array.isArray(data) && data.length > 0) {
      return data.map(r=>({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[4] * 1000 }));
    }
  } catch {}

  return fallbackCandles(symbol);
}

async function ticker(symbol) {
  // 1. Binance
  try {
    const t = await fetchJson(`${BINANCE}/ticker/24hr?symbol=${symbol}USDT`);
    return { symbol, price: +t.lastPrice, change24h: +t.priceChangePercent, volume24h: +t.quoteVolume, source: 'Binance', updatedAt: Date.now() };
  } catch {}

  // 2. CryptoCompare
  try {
    const data = await fetchJson(`${CRYPTOCOMPARE}/pricemultifull?fsyms=${symbol}&tsyms=USD`);
    if (data && data.RAW && data.RAW[symbol] && data.RAW[symbol].USD) {
      const t = data.RAW[symbol].USD;
      return { symbol, price: +t.PRICE, change24h: +t.CHANGEPCT24HOUR, volume24h: +t.VOLUME24HOURTO, source: 'CryptoCompare', updatedAt: Date.now() };
    }
  } catch {}

  // 3. CoinGecko
  try {
    const cgId = CG_IDS[symbol] || symbol.toLowerCase();
    const data = await fetchJson(`${COINGECKO}/simple/price?ids=${cgId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`);
    if (data && data[cgId]) {
      const t = data[cgId];
      return { symbol, price: +t.usd, change24h: +t.usd_24h_change, volume24h: +t.usd_24h_vol, source: 'CoinGecko', updatedAt: Date.now() };
    }
  } catch {}

  return null;
}

async function marketSnapshot(symbol) {
  const [c, t] = await Promise.all([candles(symbol), ticker(symbol).catch(()=>null)]).catch(()=>[fallbackCandles(symbol), null]);
  const price = t ? t.price : c.at(-1).close;
  const change24h = t ? t.change24h : ((price / c[0].close) - 1) * 100;
  return { symbol, price, change24h, volume24h: t? t.volume24h : c.reduce((s,it)=>s+it.volume*it.close,0), candles: c, source: t? t.source : 'fallback', updatedAt: Date.now() };
}

async function allMarkets(symbols) {
  if (!symbols) symbols = DEFAULT;
  const results = await Promise.allSettled(symbols.map(s=>marketSnapshot(s)));
  return results.filter(r=>r.status==='fulfilled').map(r=>r.value);
}

async function sentiment() {
  try { const data = await fetchJson('https://api.alternative.me/fng/?limit=1'); return { value: +data.data[0].value, label: data.data[0].value_classification, source: 'Alternative.me', isLive: true }; } catch { return { value: null, label: 'No disponible', source: null, isLive: false }; }
}

module.exports = { candles, marketSnapshot, allMarkets, sentiment };
