const { getSettings, saveSettings } = require('./configStorage');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const settings = await getSettings();
      return res.status(200).json(settings);
    }
    if (req.method === 'PUT') {
      const body = await new Promise((resolve, reject) => { let data=''; req.on('data', chunk=>data+=chunk); req.on('end', ()=>resolve(JSON.parse(data))); req.on('error', reject); });
      const current = await getSettings();
      const next = { ...current, ...body, weights: { ...current.weights, ...(body.weights || {}) } };
      const result = await saveSettings(next, 'Update settings from Vercel');
      return res.status(200).json(next);
    }
    res.setHeader('Allow','GET,PUT');
    res.status(405).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
