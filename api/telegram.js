// Al estar en api/telegram.js, configStorage está en la misma carpeta (./configStorage)
const { getSettings, saveSettings } = require('./configStorage');

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => {
      try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

async function telegramRequest(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await res.json();
  if (!res.ok || !j.ok) throw new Error(j.description || `Telegram error ${res.status}`);
  return j.result;
}

async function saveToken(req, res) {
  try {
    const { token } = await readBody(req);
    if (!token) return res.status(400).json({ error: 'Token requerido' });
    const settings = await getSettings();
    settings.botToken = token;
    await saveSettings(settings, 'Save Telegram token');
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function pairChat(req, res) {
  try {
    const settings = await getSettings();
    if (!settings?.botToken) return res.status(400).json({ error: 'Bot token no configurado' });
    const updates = await telegramRequest(settings.botToken, 'getUpdates', { limit: 20 });
    const msg = [...updates].reverse().map(u => u.message).find(m => m?.chat?.type === 'private');
    if (!msg) return res.status(400).json({ error: 'No se encontró chat privado. Abre el bot en Telegram y envía /start' });
    settings.chatId = String(msg.chat.id);
    await saveSettings(settings, 'Pair Telegram chat');
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function sendTest(req, res) {
  try {
    const settings = await getSettings();
    if (!settings?.botToken) return res.status(400).json({ error: 'Bot token no configurado' });
    if (!settings?.chatId) return res.status(400).json({ error: 'Chat no vinculado' });
    await telegramRequest(settings.botToken, 'sendMessage', { chat_id: settings.chatId, text: '✅ Crypto Sentinel: conexión con Telegram verificada.' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function sendAlert(req, res) {
  try {
    const settings = await getSettings();
    if (!settings?.botToken || !settings?.chatId) return res.status(400).json({ error: 'Telegram no configurado' });

    const { symbol, action, score, price, reason } = await readBody(req);
    const isBuy = action === 'BUY';
    const emoji = isBuy ? '🚀' : '⚠️';
    const title = isBuy ? 'OPORTUNIDAD DE COMPRA' : 'ALERTA DE VENTA (TU CARTERA)';

    const text = `${emoji} *${title}*\n\n` +
                 `• *Activo:* ${symbol}/USD\n` +
                 `• *Precio:* $${price}\n` +
                 `• *Score:* ${score}/100\n` +
                 `• *Motivo:* ${reason || 'Umbral superado'}\n\n` +
                 `_Crypto Sentinel_`;

    await telegramRequest(settings.botToken, 'sendMessage', {
      chat_id: settings.chatId,
      text,
      parse_mode: 'Markdown'
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// Router interno tolerante a subrutas
module.exports = async function handler(req, res) {
  const path = req.url || '';
  
  if (path.includes('alert')) return sendAlert(req, res);
  if (path.includes('token')) return saveToken(req, res);
  if (path.includes('pair')) return pairChat(req, res);
  if (path.includes('test')) return sendTest(req, res);
  
  return res.status(404).json({ error: `Ruta de Telegram no encontrada: ${path}` });
};
