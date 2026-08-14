const url = require('url');
const dashboard = require('./dashboard');
const configHandler = require('./configHandler');
const telegramHandler = require('./telegram');

module.exports = async (req, res) => {
  const p = url.parse(req.url).pathname;

  if (p === '/api/dashboard' && req.method === 'GET') return dashboard(req, res);
  if (p === '/api/config') return configHandler(req, res);
  
  // Captura /api/telegram, /api/telegram/alert, /api/telegram/token, /api/telegram/test, etc.
  if (p.startsWith('/api/telegram')) {
    return telegramHandler(req, res);
  }

  res.statusCode = 404; 
  res.end('Not found');
};
