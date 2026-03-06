const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function appendJsonLine(filePath, obj) {
  ensureDir(path.dirname(filePath));
  const line = `${JSON.stringify(obj)}\n`;
  fs.appendFileSync(filePath, line, 'utf8');
}

module.exports = {
  ensureDir,
  appendJsonLine,
};
