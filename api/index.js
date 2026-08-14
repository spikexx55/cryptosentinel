// Vercel serverless entry: route dispatcher
const url = require('url');
const dashboard = require('./dashboard');
const configHandler = require('./configHandler');
const telegram = require('./telegram');
const alertHandler = require('./telegram/alert');

module.exports = async (req, res) => {
  const p = url.parse(req.url).pathname;

  // 1. Endpoint para las Alertas automáticas de Telegram
  if (p === '/api/telegram/alert' && req.method === 'POST') {
    return alertHandler(req, res);
  }

  // 2. Dashboard y Configuración
  if (p === '/api/dashboard' && req.method === 'GET') return dashboard(req, res);
  if (p === '/api/config') return configHandler(req, res);

  // 3. Resto de acciones de Telegram (token, pair, test)
  if (p.startsWith('/api/telegram')) return telegram(req, res);

  // 4. Ruta no encontrada
  res.statusCode = 404; 
  res.end('Not found');
};
