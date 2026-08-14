// Vercel serverless entry: route dispatcher
const url = require('url');
const dashboard = require('./dashboard');
const configHandler = require('./configHandler');
const telegram = require('./telegram');
const alertHandler = require('./telegram/alert');

app.post('/api/telegram/alert', alertHandler);

module.exports = async (req, res) => {
  const p = url.parse(req.url).pathname;
  if (p === '/api/dashboard' && req.method === 'GET') return dashboard(req, res);
  if (p === '/api/config') return configHandler(req, res);
  if (p.startsWith('/api/telegram')) return telegram(req, res);
  res.statusCode = 404; res.end('Not found');
};
