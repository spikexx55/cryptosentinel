const { getSettings } = require('../lib/configStorage'); // Ajusta la ruta a configStorage si tu carpeta lib está en otro nivel

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  // Asegurar respuesta JSON
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const settings = await getSettings();

    // Comprobar que Telegram esté configurado
    if (!settings?.botToken || !settings?.chatId) {
      return res.status(400).json({ error: 'Telegram no está completamente vinculado.' });
    }

    const { symbol, action, score, price, reason } = await readBody(req);

    if (!symbol || !action) {
      return res.status(400).json({ error: 'Faltan parámetros de la alerta.' });
    }

    const isBuy = action === 'BUY';
    const emoji = isBuy ? '🚀' : '⚠️';
    const title = isBuy ? 'OPORTUNIDAD DE COMPRA' : 'ALERTA DE VENTA (EN CARTERA)';

    const text = `${emoji} *${title}*\n\n` +
                 `• *Activo:* ${symbol}/USD\n` +
                 `• *Precio:* $${price}\n` +
                 `• *Score:* ${score}/100\n` +
                 `• *Motivo:* ${reason || 'Umbral superado'}\n\n` +
                 `_Crypto Sentinel_`;

    const response = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: settings.chatId,
        text,
        parse_mode: 'Markdown'
      })
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.description || 'Error al comunicarse con Telegram');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
