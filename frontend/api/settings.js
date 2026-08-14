const configHandler = require('./config');

// Redirige las peticiones (GET, PUT) de /api/settings directamente a config.js
module.exports = configHandler;
