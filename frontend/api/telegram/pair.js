const t = require('../telegram');
module.exports = async (req,res) => {
  if (req.method !== 'POST') return res.status(405).end();
  return t.pairChat(req,res);
};
