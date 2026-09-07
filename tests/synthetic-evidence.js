'use strict';

// Offline test helper only. Never edit or supply real deployment evidence here.
// The checked-in synthetic examples retain stable, illustrative dates; tests
// copy them to a temporary root with dates relative to a single UTC test day.
const fs = require('fs');
const path = require('path');
const os = require('os');

const SOURCE = path.join(__dirname, '..', 'test-fixtures', 'docs');
const UTC_DAY = new Date().toISOString().slice(0, 10);

function shiftedDate(days, day = UTC_DAY) {
  const timestamp = new Date(`${day}T00:00:00.000Z`);
  timestamp.setUTCDate(timestamp.getUTCDate() + days);
  return timestamp.toISOString().slice(0, 10);
}

function dateFixture(text, day = UTC_DAY) {
  return text.replaceAll('2026-08-04', shiftedDate(-1, day))
    .replaceAll('2026-11-02', shiftedDate(89, day))
    .replaceAll('2027-08-04', shiftedDate(364, day));
}

function copyEvidence(destination, day = UTC_DAY) {
  const root = path.resolve(destination);
  // This helper must never rewrite checked-in or real evidence. Each caller
  // supplies a fresh directory inside the system temporary directory.
  let existingParent = root;
  while (!fs.existsSync(existingParent)) existingParent = path.dirname(existingParent);
  const canonicalRoot = path.join(fs.realpathSync(existingParent), path.relative(existingParent, root));
  const relative = path.relative(fs.realpathSync(os.tmpdir()), canonicalRoot);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('synthetic evidence destination must be inside the system temporary directory');
  }
  if (fs.existsSync(path.join(root, 'docs'))) {
    throw new Error('synthetic evidence docs destination already exists');
  }
  function copyTree(source, target) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const from = path.join(source, entry.name);
      const to = path.join(target, entry.name);
      if (entry.isDirectory()) copyTree(from, to);
      else if (entry.isFile()) fs.writeFileSync(to, dateFixture(fs.readFileSync(from, 'utf8'), day), { flag: 'wx' });
      else throw new Error('unexpected non-file synthetic fixture');
    }
  }
  copyTree(SOURCE, path.join(root, 'docs'));
}

module.exports = { UTC_DAY, shiftedDate, dateFixture, copyEvidence };

if (require.main === module) {
  if (process.argv.length !== 3) throw new Error('Usage: node tests/synthetic-evidence.js <fresh-temporary-evidence-root>');
  copyEvidence(process.argv[2]);
  console.log('Created temporary synthetic test evidence; this is not deployment approval.');
}
