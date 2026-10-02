const fs = require('node:fs/promises');
const path = require('node:path');

const dataFile = path.join(__dirname, '..', 'db.json');

async function getAll() {
  const contents = await fs.readFile(dataFile, 'utf8');
  return JSON.parse(contents);
}

module.exports = { getAll };
