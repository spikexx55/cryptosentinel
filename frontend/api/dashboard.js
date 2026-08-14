const { allMarkets, sentiment } = require('./lib/market');
const indicators = require('./lib/indicators');
const { score } = require('./lib/scoring');
const { getSettings, saveSettings } = require('./configStorage');

module.exports = async (req, res) => {
  try {
    const settings = await getSettings();
    const assets = await allMarkets(settings.favorites || undefined);
    const btc = assets.find(a => a.symbol === 'BTC');
    const btcTrend = btc ? btc.candles.slice(-2).reduce((s,item,i,arr)=> i? item.close - arr[i-1].close : 0,0) : 0;
    const sent = await sentiment();
    const processed = assets.map(asset => {
      const closes = asset.candles.map(c=>c.close);
      const ind = {
        rsi: indicators.rsi(closes),
        macd: indicators.macd(closes),
        ema20: indicators.ema(closes,20),
        ema50: indicators.ema(closes,50),
        ema200: indicators.ema(closes,200),
        bollinger: indicators.bollinger(closes),
        momentum: indicators.momentum(closes),
        vwap: indicators.vwap(asset.candles),
        adx: indicators.adx(asset.candles)
      };
      const evaluation = score(ind, asset, btcTrend, sent, settings.weights || { rsi:15, macd:15, ema:15, volume:15, btcTrend:10, fearGreed:15, momentum:15 });
      return { ...asset, indicators: ind, scores: { buy: evaluation.buy, sell: evaluation.sell, reasons: evaluation.reasons }, volumeRatio: evaluation.volumeRatio };
    });
    res.setHeader('Content-Type','application/json');
    res.status(200).send(JSON.stringify({ assets: processed, sentiment: sent, settings, updatedAt: Date.now() }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
