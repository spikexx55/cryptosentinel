const { getSettings, saveSettings } = require('./configStorage');
const url = require('url');

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

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const parsedUrl = url.parse(req.url, true);
    // Lee la acción desde ?action=xxx o de la URL
    const action = parsedUrl.query.action || parsedUrl.pathname.split('/').pop();
    const settings = await getSettings();

    // 1. TOKEN
    if (action === 'token') {
      const { token } = await readBody(req);
      if (!token) return res.status(400).json({ error: 'Token requerido' });
      settings.botToken = token;
      await saveSettings(settings, 'Save Telegram token');
      return res.status(200).json({ ok: true });
    }

    // 2. PAIR / VINCULAR
    if (action === 'pair') {
      if (!settings?.botToken) return res.status(400).json({ error: 'Bot token no configurado' });
      const updates = await telegramRequest(settings.botToken, 'getUpdates', { limit: 20 });
      const msg = [...updates].reverse().map(u => u.message).find(m => m?.chat?.type === 'private');
      if (!msg) return res.status(400).json({ error: 'Abre el bot en Telegram y manda /start' });
      settings.chatId = String(msg.chat.id);
      await saveSettings(settings, 'Pair Telegram chat');
      return res.status(200).json({ ok: true });
    }

    // 3. TEST / PRUEBA
    if (action === 'test') {
      if (!settings?.botToken) return res.status(400).json({ error: 'Bot token no configurado' });
      if (!settings?.chatId) return res.status(400).json({ error: 'Chat no vinculado' });
      await telegramRequest(settings.botToken, 'sendMessage', { chat_id: settings.chatId, text: '✅ Crypto Sentinel: conexión con Telegram verificada.' });
      return res.status(200).json({ ok: true });
    }

    // 4. ALERT / ALERTA
    if (action === 'alert') {
      if (!settings?.botToken || !settings?.chatId) return res.status(400).json({ error: 'Telegram no configurado' });
      const { symbol, action: act, score, price, reason } = await readBody(req);
      const isBuy = act === 'BUY';
      const emoji = isBuy ? '🚀' : '⚠️';
      const title = isBuy ? 'OPORTUNIDAD DE COMPRA' : 'ALERTA DE VENTA (TU CARTERA)';
      const text = `${emoji} *${title}*\n\n• *Activo:* ${symbol}/USD\n• *Precio:* $${price}\n• *Score:* ${score}/100\n• *Motivo:* ${reason || 'Umbral superado'}\n\n_Crypto Sentinel_`;

      await telegramRequest(settings.botToken, 'sendMessage', { chat_id: settings.chatId, text, parse_mode: 'Markdown' });
      return res.status(200).json({ ok: true });
    }

    return res.status(404).json({ error: `Accion desconocida: ${action}` });

  } catch (e) {
    return res.status(500).json({ error: `Error interno: ${e.message}` });
  }
};
