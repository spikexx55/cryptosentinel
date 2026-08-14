const { getFileFromRepo, putFileToRepo, readLocal, writeLocal } = require('./_github');
const path = require('path');

const SETTINGS_PATH = process.env.SETTINGS_PATH || 'data/settings.json';
const LOCAL_PATH = path.join(__dirname, '..', SETTINGS_PATH);

async function getSettings() {
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO) {
    try {
      const { content } = await getFileFromRepo(SETTINGS_PATH);
      return JSON.parse(content);
    } catch (e) {
      console.warn('Could not read settings from GitHub:', e.message);
    }
  }
  // fallback to local file
  try {
    const text = await readLocal(LOCAL_PATH);
    return JSON.parse(text);
  } catch (e) {
    console.warn('Could not read local settings:', e.message);
    return {};
  }
}

async function saveSettings(newSettings, message) {
  const content = JSON.stringify(newSettings, null, 2);
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO) {
    return await putFileToRepo(SETTINGS_PATH, content, message || 'Update settings via web');
  }
  // attempt local write (useful for local testing; serverless won't persist)
  try {
    await writeLocal(LOCAL_PATH, content);
    return { ok: true, note: 'Wrote to local file (non-persistent on serverless runtimes)' };
  } catch (e) {
    throw new Error('Cannot persist settings: no GITHUB_TOKEN and local write failed: ' + e.message);
  }
}

module.exports = { getSettings, saveSettings };
