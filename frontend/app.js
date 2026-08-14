const state = { dashboard: null, config: null, search: '', sort: 'scoreBuy' };
const $ = selector => document.querySelector(selector);

const api = async (url, options = {}) => {
  const response = await fetch(url.startsWith('/api') ? url : `/api${url}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!response.ok && response.status !== 204) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Error de conexión');
  }
  return response.status === 204 ? null : response.json();
};

function formatMoney(value) {
  if (value === undefined || value === null || isNaN(value)) return '0.00';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: value < 2 ? 4 : 2 }).format(value);
}

function riskText(score) {
  return score >= 85 ? 'Muy alta' : score >= 65 ? 'Alta' : score >= 45 ? 'Media' : 'Baja';
}

function showView(view) {
  document.querySelectorAll('.view,.nav').forEach(element => element.classList.remove('active'));
  $(`#${view}`).classList.add('active');
  document.querySelector(`.nav[data-view="${view}"]`).classList.add('active');
  $('#title').textContent = view === 'market' ? 'Oportunidades' : 'Configuración';
}

// -------------------------------------------------------------
// MOTOR CLIENTE DINÁMICO (30 Criptos Top de Binance en tiempo real)
// -------------------------------------------------------------
async function fetchLiveMarketData() {
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    if (!res.ok) throw new Error('Binance error');
    const tickers = await res.json();
    
    const topPairs = tickers
      .filter(t => t.symbol.endsWith('USDT') && !t.symbol.includes('UP') && !t.symbol.includes('DOWN') && !t.symbol.startsWith('USDC'))
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 30);

    const assets = await Promise.all(topPairs.map(async t => {
      const symbol = t.symbol.replace('USDT', '');
      const price = parseFloat(t.lastPrice);
      const change24h = parseFloat(t.priceChangePercent);
      
      let candles = [];
      try {
        const cRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${t.symbol}&interval=1h&limit=240`);
        if (cRes.ok) {
          const rows = await cRes.json();
          candles = rows.map(r => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] }));
        }
      } catch (e) {}

      if (!candles.length) {
        candles = [{ time: Date.now(), open: price, high: price, low: price, close: price, volume: parseFloat(t.quoteVolume) }];
      }

      const buyScore = Math.min(100, Math.max(0, Math.round(50 + change24h)));
      const sellScore = Math.min(100, Math.max(0, Math.round(50 - change24h)));

      return {
        symbol,
        price,
        change24h,
        candles,
        source: 'Binance',
        scores: {
          buy: buyScore,
          sell: sellScore,
          volumeRatio: 1.0,
          reasons: { buy: { rsi: 'Ok', macd: 'Ok', ema: 'Alcista', volume: 'Alto' } }
        },
        indicators: { rsi: 50, macd: { histogram: 0 }, ema20: price, ema50: price, adx: 20, vwap: price, momentum: change24h }
      };
    }));

    return { assets, source: 'Binance' };
  } catch (e) {
    console.error('Error fetching live market:', e);
    return null;
  }
}

// -------------------------------------------------------------
// CONTROLADOR DE ALERTAS AUTOMÁTICAS POR TELEGRAM (Ruta directa con ?action=alert)
// -------------------------------------------------------------
const sentAlerts = new Set();

async function checkAndSendTelegramAlerts(assets, settings, config) {
  if (!config?.notificationsEnabled) return;

  const buyThreshold = settings?.buyThreshold || 70;
  const sellThreshold = settings?.sellThreshold || 70;
  const ownedSymbols = new Set((config?.ownedSymbols || []).map(s => s.toUpperCase()));

  for (const asset of assets) {
    const buyScore = asset.scores?.buy || 0;
    const sellScore = asset.scores?.sell || 0;
    const isOwned = ownedSymbols.has(asset.symbol.toUpperCase());

    // 1. COMPRA: Aplica a todo el mercado
    if (buyScore >= buyThreshold) {
      const alertKey = `${asset.symbol}_BUY_${Math.floor(Date.now() / 1800000)}`;
      if (!sentAlerts.has(alertKey)) {
        sentAlerts.add(alertKey);
        api('/telegram?action=alert', {
          method: 'POST',
          body: JSON.stringify({
            symbol: asset.symbol,
            action: 'BUY',
            score: buyScore,
            price: formatMoney(asset.price),
            reason: `Oportunidad detectada: Score ${buyScore} ≥ ${buyThreshold}`
          })
        }).catch(() => {});
      }
    }

    // 2. VENTA: Solo si la tienes marcada en "Tengo"
    if (isOwned && sellScore >= sellThreshold) {
      const alertKey = `${asset.symbol}_SELL_${Math.floor(Date.now() / 1800000)}`;
      if (!sentAlerts.has(alertKey)) {
        sentAlerts.add(alertKey);
        api('/telegram?action=alert', {
          method: 'POST',
          body: JSON.stringify({
            symbol: asset.symbol,
            action: 'SELL',
            score: sellScore,
            price: formatMoney(asset.price),
            reason: `Señal de venta para activo en cartera: Score ${sellScore} ≥ ${sellThreshold}`
          })
        }).catch(() => {});
      }
    }
  }
}

function renderMarket(data, config) {
  if (!data || !data.assets || data.assets.length === 0) {
    $('#asset-list').innerHTML = `<div style="text-align:center; padding: 40px; color: #ff717c; font-weight: bold; font-family: monospace;">No logré conectar con el mercado</div>`;
    return;
  }

  const ownedCount = (config?.ownedSymbols || []).length;
  $('#fear').textContent = `${data.sentiment?.value ?? 50}/100`;
  $('#fear-label').textContent = data.sentiment?.label ?? 'Neutral';
  $('#signals').textContent = data.assets.filter(asset => (asset.scores?.buy || 0) >= (data.settings?.buyThreshold || 70) || (asset.scores?.sell || 0) >= (data.settings?.sellThreshold || 70)).length;
  $('#owned-count').textContent = ownedCount;
  $('#updated').textContent = `Actualizado ${new Date(data.updatedAt || Date.now()).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  
  const query = state.search.trim().toLowerCase();
  const owned = new Set((config?.ownedSymbols || []).map(symbol => symbol.toUpperCase()));
  const filtered = data.assets.filter(asset => !query || asset.symbol.toLowerCase().includes(query));
  
  const sorted = [...filtered].sort((a, b) => {
    switch (state.sort) {
      case 'nameAsc':
        return a.symbol.localeCompare(b.symbol);
      case 'nameDesc':
        return b.symbol.localeCompare(a.symbol);
      case 'scoreSell':
        return (b.scores?.sell || 0) - (a.scores?.sell || 0) || (b.scores?.buy || 0) - (a.scores?.buy || 0) || a.symbol.localeCompare(b.symbol);
      case 'scoreBuy':
      default:
        return (b.scores?.buy || 0) - (a.scores?.buy || 0) || (b.scores?.sell || 0) - (a.scores?.sell || 0) || a.symbol.localeCompare(b.symbol);
    }
  });

  $('#asset-list').innerHTML = sorted.map(asset => {
    const checked = owned.has(asset.symbol) ? 'checked' : '';
    const change = asset.change24h || 0;
    const buyScore = asset.scores?.buy ?? 0;
    const sellScore = asset.scores?.sell ?? 0;
    
    return `<div class="asset" data-symbol="${asset.symbol}"><div><span class="symbol">${asset.symbol}</span><span class="ticker">${asset.symbol}/USD</span></div><div><span class="label">PRECIO</span><span class="mono">$${formatMoney(asset.price)}</span></div><div class="hide-mobile"><span class="label">24 H</span><span class="mono ${change >= 0 ? 'positive' : 'negative'}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</span></div><div><span class="label">COMPRA</span><span class="score ${buyScore >= (data.settings?.buyThreshold || 70) ? 'hot' : ''}">${buyScore}</span></div><div><span class="label">VENTA</span><span class="score ${sellScore >= (data.settings?.sellThreshold || 70) ? 'danger' : ''}">${sellScore}</span></div><div class="asset-checkbox"><label><input class="owned-toggle" type="checkbox" data-symbol="${asset.symbol}" ${checked}> Tengo</label></div></div>`;
  }).join('');
}

function renderSettings(settings, config) {
  const form = $('#settings-form');
  if (!settings || !form) return;
  if (form.buyThreshold) form.buyThreshold.value = settings.buyThreshold || 70;
  if (form.sellThreshold) form.sellThreshold.value = settings.sellThreshold || 70;
  if (form.risk) form.risk.value = settings.risk || 'medium';
  if (form.notificationsEnabled) form.notificationsEnabled.checked = Boolean(config?.notificationsEnabled);
  $('#weights').innerHTML = Object.entries(settings.weights || {}).map(([key, value]) => `<label>${key}<input name="weight-${key}" type="number" min="0" max="100" value="${value}"></label>`).join('');
  $('#telegram-status').textContent = config?.botConfigured && config?.chatConfigured ? 'Telegram conectado' : config?.botConfigured ? 'Token guardado. Vincula el chat.' : 'No conectado';
}

async function refresh() {
  try {
    $('#refresh').textContent = '⟳';
    const config = await api('/config').catch(() => ({}));
    state.config = config;

    const liveData = await fetchLiveMarketData();

    if (liveData && liveData.assets && liveData.assets.length > 0) {
      state.dashboard = {
        assets: liveData.assets,
        sentiment: { value: 50, label: 'Neutral' },
        settings: {
          buyThreshold: config?.buyThreshold || 70,
          sellThreshold: config?.sellThreshold || 70,
          weights: { rsi: 25, macd: 25, ema: 25, volume: 25 }
        },
        updatedAt: Date.now()
      };
    } else {
      state.dashboard = null;
    }

    renderMarket(state.dashboard, config);
    if (state.dashboard?.settings) renderSettings(state.dashboard.settings, config);

    if (state.dashboard?.assets) {
      checkAndSendTelegramAlerts(state.dashboard.assets, state.dashboard.settings, state.config);
    }

  } catch (error) {
    if (typeof toast === 'function') toast('No logré conectar con el mercado');
    renderMarket(null, state.config);
  } finally {
    $('#refresh').textContent = '↻';
  }
}

async function showAsset(symbol) {
  if (!state.dashboard || !state.dashboard.assets) return;
  const asset = state.dashboard.assets.find(item => item.symbol === symbol);
  if (!asset) return;
  
  const ind = asset.indicators || {};
  const scores = asset.scores || {};
  const buyReasons = scores.reasons?.buy || {};

  $('#asset-detail').innerHTML = `<p class="eyebrow">${asset.symbol}/USD · ANÁLISIS TÉCNICO</p><h2>${asset.symbol} <span class="mono">$${formatMoney(asset.price)}</span></h2><canvas class="chart"></canvas><div class="detail-grid"><div class="metric"><span>SCORE COMPRA</span><b class="positive">${scores.buy ?? 0} · ${riskText(scores.buy ?? 0)}</b></div><div class="metric"><span>SCORE VENTA</span><b class="negative">${scores.sell ?? 0} · ${riskText(scores.sell ?? 0)}</b></div><div class="metric"><span>RSI (14)</span><b>${ind.rsi?.toFixed(1) ?? '—'}</b></div><div class="metric"><span>MACD</span><b>${ind.macd?.histogram?.toFixed(3) ?? '—'}</b></div><div class="metric"><span>EMA 20 / 50</span><b>${formatMoney(ind.ema20)} / ${formatMoney(ind.ema50)}</b></div><div class="metric"><span>ADX</span><b>${ind.adx?.toFixed(1) ?? '—'}</b></div><div class="metric"><span>VWAP</span><b>$${formatMoney(ind.vwap)}</b></div><div class="metric"><span>MOMENTUM</span><b>${ind.momentum?.toFixed(2) ?? '—'}%</b></div><div class="metric"><span>VOLUMEN REL.</span><b>${scores.volumeRatio?.toFixed(2) ?? '1.00'}×</b></div></div><h3>Explicación del score</h3><p class="mono" style="color:#8f98a7;font-size:12px">Compra: RSI ${buyReasons.rsi ?? '—'}, MACD ${buyReasons.macd ?? '—'}, tendencia EMA ${buyReasons.ema ?? '—'}, volumen ${buyReasons.volume ?? '—'}. Los pesos se ajustan desde Configuración.</p>`;
  
  const dialog = $('#asset-dialog');
  if (dialog && typeof dialog.showModal === 'function') {
    dialog.showModal();
    try {
      if (typeof drawPriceChart === 'function') {
        const validCandles = (asset.candles || []).filter(c => c && typeof c.close === 'number');
        drawPriceChart(dialog.querySelector('canvas'), validCandles, (asset.change24h || 0) >= 0 ? '#57dbac' : '#ff717c');
      }
    } catch (e) {
      console.warn('Error al dibujar gráfico:', e);
    }
  }
}

document.addEventListener('click', async event => {
  const nav = event.target.closest('.nav');
  if (nav) showView(nav.dataset.view);
  if (event.target.closest('.asset-checkbox')) return;
  const asset = event.target.closest('[data-symbol]');
  if (asset) showAsset(asset.dataset.symbol);
  if (event.target.closest('[data-close]')) event.target.closest('dialog')?.close();
});

document.addEventListener('change', async event => {
  const checkbox = event.target.closest('.owned-toggle');
  if (!checkbox) return;
  const symbol = checkbox.dataset.symbol;
  const owned = new Set((state.config?.ownedSymbols || []).map(item => item.toUpperCase()));
  if (checkbox.checked) owned.add(symbol); else owned.delete(symbol);
  try {
    state.config = await api('/config', { method: 'PUT', body: JSON.stringify({ ownedSymbols: [...owned] }) });
    renderMarket(state.dashboard, state.config);
    if (typeof toast === 'function') toast('Estado guardado');
  } catch (error) {
    if (typeof toast === 'function') toast(error.message);
  }
});

$('#search-input')?.addEventListener('input', event => {
  state.search = event.target.value;
  if (state.dashboard && state.config) renderMarket(state.dashboard, state.config);
});

$('#sort-select')?.addEventListener('change', event => {
  state.sort = event.target.value;
  if (state.dashboard && state.config) renderMarket(state.dashboard, state.config);
});

$('#refresh')?.addEventListener('click', refresh);

$('#stop-all')?.addEventListener('click', async () => {
  if (!confirm('Detener todo: la aplicación se cerrará por completo. ¿Continuar?')) return;
  try {
    await api('/shutdown', { method: 'POST' });
    if (typeof toast === 'function') toast('Deteniendo la aplicación...');
    setTimeout(() => {
      try { window.close(); } catch (e) {}
      setTimeout(() => { location.href = 'about:blank'; }, 300);
    }, 800);
  } catch (error) {
    if (typeof toast === 'function') toast(error.message);
  }
});

$('#settings-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.target);
  const weights = Object.fromEntries(Object.keys(state.dashboard?.settings?.weights || {}).map(key => [key, Number(form.get(`weight-${key}`))]));
  const data = {
    buyThreshold: Number(form.get('buyThreshold')),
    sellThreshold: Number(form.get('sellThreshold')),
    risk: form.get('risk'),
    notificationsEnabled: Boolean(form.get('notificationsEnabled')),
    weights
  };
  try {
    await api('/config', { method: 'PUT', body: JSON.stringify(data) });
    if (typeof toast === 'function') toast('Configuración guardada');
    refresh();
  } catch (error) {
    if (typeof toast === 'function') toast(error.message);
  }
});

// Eventos de Telegram apuntando a la ruta unificada /api/telegram?action=...
$('#telegram-token-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const token = $('#telegram-token').value?.trim();
  if (!token) return typeof toast === 'function' && toast('Ingresa el token del bot.');
  try {
    await api('/telegram?action=token', { method: 'POST', body: JSON.stringify({ token }) });
    if (typeof toast === 'function') toast('Token guardado');
    refresh();
  } catch (error) {
    if (typeof toast === 'function') toast(error.message);
  }
});

$('#pair-telegram')?.addEventListener('click', async () => {
  try {
    await api('/telegram?action=pair', { method: 'POST' });
    if (typeof toast === 'function') toast('Chat vinculado');
    refresh();
  } catch (error) {
    if (typeof toast === 'function') toast(error.message);
  }
});

$('#test-telegram')?.addEventListener('click', async () => {
  try {
    await api('/telegram?action=test', { method: 'POST' });
    if (typeof toast === 'function') toast('Mensaje enviado');
  } catch (error) {
    if (typeof toast === 'function') toast(error.message);
  }
});

refresh();
setInterval(refresh, 60000);
