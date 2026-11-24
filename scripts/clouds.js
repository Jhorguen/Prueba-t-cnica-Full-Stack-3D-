'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GENERATOR = path.join(ROOT, 'tools', 'make-cloud.js');
const CLOUDS_DIR = path.join(ROOT, 'data', 'clouds');
const CLOUDS = [
  { id: '1201-30001', points: 2000000 },
  { id: '1201-30002', points: 400000 },
];

const cloudFile = (id) => path.join(CLOUDS_DIR, `${id}.pts`);
const generate = (...args) => execFileSync(process.execPath, [GENERATOR, ...args], { stdio: 'inherit' });

const mode = process.argv[2];

if (mode === '--truncate') {
  const { id, points } = CLOUDS[0];
  generate(id, String(points), '--truncate');
  fs.copyFileSync(path.join(CLOUDS_DIR, `${id}-truncated.pts`), cloudFile(id));
  console.log(`${id}.pts now holds the truncated file. Run "npm run clouds" to restore it.`);
} else {
  for (const { id, points } of CLOUDS) {
    if (mode === '--force' || !fs.existsSync(cloudFile(id))) generate(id, String(points));
  }
}
