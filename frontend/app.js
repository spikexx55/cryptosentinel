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
function renderMarket(data, config) {
  const ownedCount = (config?.ownedSymbols || []).length;
  $('#fear').textContent = `${data.sentiment.value}/100`;
  $('#fear-label').textContent = data.sentiment.label;
  $('#signals').textContent = data.assets.filter(asset => asset.scores.buy >= data.settings.buyThreshold || asset.scores.sell >= data.settings.sellThreshold).length;
  $('#owned-count').textContent = ownedCount;
  $('#updated').textContent = `Actualizado ${new Date(data.updatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
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
        return b.scores.sell - a.scores.sell || b.scores.buy - a.scores.buy || a.symbol.localeCompare(b.symbol);
      case 'scoreBuy':
      default:
        return b.scores.buy - a.scores.buy || b.scores.sell - a.scores.sell || a.symbol.localeCompare(b.symbol);
    }
  });
  $('#asset-list').innerHTML = sorted.map(asset => {
    const checked = owned.has(asset.symbol) ? 'checked' : '';
    return `<div class="asset" data-symbol="${asset.symbol}"><div><span class="symbol">${asset.symbol}</span><span class="ticker">${asset.symbol}/USD</span></div><div><span class="label">PRECIO</span><span class="mono">$${formatMoney(asset.price)}</span></div><div class="hide-mobile"><span class="label">24 H</span><span class="mono ${asset.change24h >= 0 ? 'positive' : 'negative'}">${asset.change24h >= 0 ? '+' : ''}${asset.change24h.toFixed(2)}%</span></div><div><span class="label">COMPRA</span><span class="score ${asset.scores.buy >= data.settings.buyThreshold ? 'hot' : ''}">${asset.scores.buy}</span></div><div><span class="label">VENTA</span><span class="score ${asset.scores.sell >= data.settings.sellThreshold ? 'danger' : ''}">${asset.scores.sell}</span></div><div class="asset-checkbox"><label><input class="owned-toggle" type="checkbox" data-symbol="${asset.symbol}" ${checked}> Tengo</label></div></div>`;
  }).join('');
}
function renderSettings(settings, config) {
  const form = $('#settings-form');
  form.buyThreshold.value = settings.buyThreshold;
  form.sellThreshold.value = settings.sellThreshold;
  form.risk.value = settings.risk;
  form.notificationsEnabled.checked = Boolean(config?.notificationsEnabled);
  $('#weights').innerHTML = Object.entries(settings.weights).map(([key, value]) => `<label>${key}<input name="weight-${key}" type="number" min="0" max="100" value="${value}"></label>`).join('');
  $('#telegram-status').textContent = config?.botConfigured && config?.chatConfigured ? 'Telegram conectado' : config?.botConfigured ? 'Token guardado. Vincula el chat.' : 'No conectado';
}
async function refresh() {
  try {
    $('#refresh').textContent = '⟳';
    const [data, config] = await Promise.all([api('/dashboard'), api('/config')]);
    state.dashboard = data;
    state.config = config;
    renderMarket(data, config);
    renderSettings(data.settings, config);
  } catch (error) {
    toast(error.message);
  } finally {
    $('#refresh').textContent = '↻';
  }
}
async function showAsset(symbol) {
  const asset = state.dashboard.assets.find(item => item.symbol === symbol);
  if (!asset) return;
  const ind = asset.indicators;
  $('#asset-detail').innerHTML = `<p class="eyebrow">${asset.symbol}/USD · ANÁLISIS TÉCNICO</p><h2>${asset.symbol} <span class="mono">$${formatMoney(asset.price)}</span></h2><canvas class="chart"></canvas><div class="detail-grid"><div class="metric"><span>SCORE COMPRA</span><b class="positive">${asset.scores.buy} · ${riskText(asset.scores.buy)}</b></div><div class="metric"><span>SCORE VENTA</span><b class="negative">${asset.scores.sell} · ${riskText(asset.scores.sell)}</b></div><div class="metric"><span>RSI (14)</span><b>${ind.rsi?.toFixed(1) ?? '—'}</b></div><div class="metric"><span>MACD</span><b>${ind.macd?.histogram?.toFixed(3) ?? '—'}</b></div><div class="metric"><span>EMA 20 / 50</span><b>${formatMoney(ind.ema20)} / ${formatMoney(ind.ema50)}</b></div><div class="metric"><span>ADX</span><b>${ind.adx?.toFixed(1) ?? '—'}</b></div><div class="metric"><span>VWAP</span><b>$${formatMoney(ind.vwap)}</b></div><div class="metric"><span>MOMENTUM</span><b>${ind.momentum?.toFixed(2) ?? '—'}%</b></div><div class="metric"><span>VOLUMEN REL.</span><b>${asset.scores.volumeRatio.toFixed(2)}×</b></div></div><h3>Explicación del score</h3><p class="mono" style="color:#8f98a7;font-size:12px">Compra: RSI ${asset.scores.reasons.buy.rsi}, MACD ${asset.scores.reasons.buy.macd}, tendencia EMA ${asset.scores.reasons.buy.ema}, volumen ${asset.scores.reasons.buy.volume}. Los pesos se ajustan desde Configuración.</p>`;
  const dialog = $('#asset-dialog');
  dialog.showModal();
  drawPriceChart(dialog.querySelector('canvas'), asset.candles, asset.change24h >= 0 ? '#57dbac' : '#ff717c');
}

document.addEventListener('click', async event => {
  const nav = event.target.closest('.nav');
  if (nav) showView(nav.dataset.view);
  if (event.target.closest('.asset-checkbox')) return;
  const asset = event.target.closest('[data-symbol]');
  if (asset) showAsset(asset.dataset.symbol);
  if (event.target.closest('[data-close]')) event.target.closest('dialog').close();
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
    toast('Estado guardado');
  } catch (error) {
    toast(error.message);
  }
});

$('#search-input').addEventListener('input', event => {
  state.search = event.target.value;
  if (state.dashboard && state.config) renderMarket(state.dashboard, state.config);
});

$('#sort-select').addEventListener('change', event => {
  state.sort = event.target.value;
  if (state.dashboard && state.config) renderMarket(state.dashboard, state.config);
});

$('#refresh').addEventListener('click', refresh);

$('#stop-all').addEventListener('click', async () => {
  if (!confirm('Detener todo: la aplicación se cerrará por completo. ¿Continuar?')) return;
  try {
    await api('/shutdown', { method: 'POST' });
    toast('Deteniendo la aplicación...');
    // Allow server to shutdown and then attempt to close the window/tab
    setTimeout(() => {
      try { window.close(); } catch (e) { /* ignored */ }
      // as a fallback, navigate to about:blank
      setTimeout(() => { location.href = 'about:blank'; }, 300);
    }, 800);
  } catch (error) {
    toast(error.message);
  }
});

$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.target);
  const weights = Object.fromEntries(Object.keys(state.dashboard.settings.weights).map(key => [key, Number(form.get(`weight-${key}`))]));
  const data = {
    buyThreshold: Number(form.get('buyThreshold')),
    sellThreshold: Number(form.get('sellThreshold')),
    risk: form.get('risk'),
    notificationsEnabled: Boolean(form.get('notificationsEnabled')),
    weights
  };
  try {
    await api('/settings', { method: 'PUT', body: JSON.stringify(data) });
    toast('Configuración guardada');
    refresh();
  } catch (error) {
    toast(error.message);
  }
});

$('#telegram-token-form').addEventListener('submit', async event => {
  event.preventDefault();
  const token = $('#telegram-token').value.trim();
  if (!token) return toast('Ingresa el token del bot.');
  try {
    await api('/telegram/token', { method: 'POST', body: JSON.stringify({ token }) });
    toast('Token guardado');
    refresh();
  } catch (error) {
    toast(error.message);
  }
});

$('#pair-telegram').addEventListener('click', async () => {
  try {
    await api('/telegram/pair', { method: 'POST' });
    toast('Chat vinculado');
    refresh();
  } catch (error) {
    toast(error.message);
  }
});

$('#test-telegram').addEventListener('click', async () => {
  try {
    await api('/telegram/test', { method: 'POST' });
    toast('Mensaje enviado');
  } catch (error) {
    toast(error.message);
  }
});

refresh();
setInterval(refresh, 60000);
