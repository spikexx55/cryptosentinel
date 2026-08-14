const fs = require('fs');
const fetch = global.fetch || require('node-fetch');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // owner/repo
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

function repoApi(path) {
  return `https://api.github.com/repos/${GITHUB_REPO}/contents/${encodeURIComponent(path)}`;
}

async function getFileFromRepo(path) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) throw new Error('GITHUB_TOKEN or GITHUB_REPO not configured');
  const url = repoApi(path) + `?ref=${GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3.raw' } });
  if (!res.ok) throw new Error(`GitHub GET failed ${res.status}`);
  const text = await res.text();
  const metaRes = await fetch(url, { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' } });
  const meta = await metaRes.json();
  return { content: text, sha: meta.sha };
}

async function putFileToRepo(path, content, message) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) throw new Error('GITHUB_TOKEN or GITHUB_REPO not configured');
  const url = repoApi(path);
  const encoded = Buffer.from(content).toString('base64');
  // need sha of existing file
  const metaRes = await fetch(url + `?ref=${GITHUB_BRANCH}`, { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' } });
  const meta = await metaRes.json();
  const sha = meta.sha;
  const body = {
    message: message || `Update ${path}`,
    content: encoded,
    branch: GITHUB_BRANCH,
    sha
  };
  const res = await fetch(url, { method: 'PUT', headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub PUT failed ${res.status}: ${txt}`);
  }
  return await res.json();
}

async function readLocal(path) {
  return fs.readFileSync(path, 'utf8');
}

async function writeLocal(path, content) {
  return fs.writeFileSync(path, content, 'utf8');
}

module.exports = { getFileFromRepo, putFileToRepo, readLocal, writeLocal };
