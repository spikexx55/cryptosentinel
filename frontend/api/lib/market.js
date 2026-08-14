const BINANCE = 'https://api.binance.com/api/v3';

async function fetchJson(url, timeout = 9000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
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
  try {
    const rows = await fetchJson(`${BINANCE}/klines?symbol=${symbol}USDT&interval=1h&limit=240`);
    return rows.map(r=>({ time: r[0], open: +r[1], high:+r[2], low:+r[3], close:+r[4], volume:+r[5] }));
  } catch { return fallbackCandles(symbol); }
}

async function ticker(symbol) {
  try {
    const t = await fetchJson(`${BINANCE}/ticker/24hr?symbol=${symbol}USDT`);
    return { symbol, price: +t.lastPrice, change24h: +t.priceChangePercent, volume24h: +t.quoteVolume, source: 'Binance', updatedAt: Date.now() };
  } catch (e) {
    return null;
  }
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
