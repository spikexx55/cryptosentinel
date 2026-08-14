const url = require('url');
const dashboard = require('./dashboard');
const configHandler = require('./configHandler');
const telegram = require('./telegram');

module.exports = async (req, res) => {
  const p = url.parse(req.url).pathname;

  if (p === '/api/dashboard' && req.method === 'GET') return dashboard(req, res);
  if (p === '/api/config') return configHandler(req, res);
  
  // Manda cualquier endpoint que empiece por /api/telegram a telegram.js
  if (p.startsWith('/api/telegram')) return telegram(req, res);

  res.statusCode = 404; 
  res.end('Not found');
};
