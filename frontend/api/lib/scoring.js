const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
const weighted = (parts, weights) => {
  const total = Object.values(weights).reduce((s,v)=>s+v,0) || 1;
  return Object.entries(parts).reduce((sum,[k,v])=> sum + v * (weights[k] || 0),0) / total;
};

function score(indicators, market, btcTrend, sentiment, weights){
  const { rsi, macd, ema20, ema50, ema200, momentum } = indicators;
  const averageVolume = market.candles.slice(-48).reduce((s,c)=>s + c.volume,0) / 48;
  const volume = market.candles.at(-1).volume / (averageVolume || 1);
  const buyParts = {
    rsi: rsi === null ? 50 : rsi < 35 ? 100 : rsi < 50 ? 72 : rsi > 72 ? 15 : 45,
    macd: macd?.histogram > 0 ? 85 : 20,
    ema: ema20 > ema50 && ema50 > ema200 ? 95 : ema20 > ema50 ? 70 : 20,
    volume: volume > 1.25 ? 90 : volume > .8 ? 55 : 25,
    btcTrend: btcTrend > 0 ? 75 : 30,
    fearGreed: sentiment.value < 35 ? 90 : sentiment.value < 65 ? 60 : 30,
    momentum: momentum > 0 && momentum < 8 ? 80 : momentum >= 8 ? 45 : 25
  };
  const sellParts = {
    rsi: rsi === null ? 50 : rsi > 72 ? 100 : rsi > 60 ? 70 : 15,
    macd: macd?.histogram < 0 ? 85 : 20,
    ema: ema20 < ema50 && ema50 < ema200 ? 95 : ema20 < ema50 ? 68 : 15,
    volume: volume > 1.4 && market.change24h < 0 ? 90 : 30,
    btcTrend: btcTrend < 0 ? 75 : 25,
    fearGreed: sentiment.value > 78 ? 90 : sentiment.value > 60 ? 58 : 20,
    momentum: momentum < -3 ? 85 : momentum > 10 ? 75 : 20
  };
  let buy = clamp(weighted(buyParts, weights));
  let sell = clamp(weighted(sellParts, weights));
  if (buy >= sell) sell = Math.min(sell, 100 - Math.max(0, buy - 50)); else buy = Math.min(buy, 100 - Math.max(0, sell - 50));
  return { buy, sell, reasons: { buy: buyParts, sell: sellParts }, volumeRatio: volume };
}
module.exports = { score };
