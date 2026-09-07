'use strict';
const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts', 'docx-to-md.py');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-render-'));
let count = 0;
try {
  const create = spawnSync(python, ['-c', `
import sys
from pathlib import Path
from docx import Document
from docx.oxml import OxmlElement
from docx.shared import Inches
out = Path(sys.argv[1])
for kind in ('normal', 'nested', 'header-table', 'content-control', 'tracked', 'hyperlink', 'numbering', 'comment', 'field', 'textbox', 'footnote', 'endnote'):
    d = Document()
    d.add_paragraph('Synthetic policy text')
    if kind == 'nested':
        table = d.add_table(rows=1, cols=1)
        table.cell(0, 0).add_table(rows=1, cols=1).cell(0, 0).text = 'Important nested content'
    if kind == 'header-table':
        d.sections[0].header.add_table(rows=1, cols=1, width=Inches(1)).cell(0, 0).text = 'Important header content'
    if kind == 'content-control':
        element = OxmlElement('w:sdt')
        d.element.body.append(element)
    if kind == 'tracked':
        d.element.body.append(OxmlElement('w:ins'))
    if kind == 'hyperlink':
        d.paragraphs[0]._p.append(OxmlElement('w:hyperlink'))
    if kind == 'numbering':
        d.add_paragraph('Numbered item', style='List Number')
    tag = {'comment': 'w:commentReference', 'field': 'w:fldSimple', 'textbox': 'w:txbxContent', 'footnote': 'w:footnoteReference', 'endnote': 'w:endnoteReference'}.get(kind)
    if tag:
        d.paragraphs[0]._p.append(OxmlElement(tag))
    d.save(out / (kind + '.docx'))
`, tmp], { encoding: 'utf8' });
  assert.equal(create.status, 0, 'fixture creation requires the locked Python dependencies');
  for (const kind of ['normal', 'nested', 'header-table', 'content-control', 'tracked', 'hyperlink', 'numbering', 'comment', 'field', 'textbox', 'footnote', 'endnote']) {
    const output = path.join(tmp, kind + '.md');
    fs.writeFileSync(output, 'previous rendering');
    const result = spawnSync(python, [script, path.join(tmp, kind + '.docx'), output], { encoding: 'utf8' });
    assert.equal(result.status, kind === 'normal' ? 0 : 1, kind);
    if (kind === 'normal') {
      assert(fs.readFileSync(output, 'utf8').includes('Synthetic policy text'));
      assert(!fs.readFileSync(output, 'utf8').includes('\r'));
    } else {
      assert.equal(fs.readFileSync(output, 'utf8'), 'previous rendering', 'failed conversion preserves output');
    }
    count++;
  }
  const source = path.join(tmp, 'normal.docx');
  const original = fs.readFileSync(source);
  assert.notEqual(spawnSync(python, [script, source, source]).status, 0);
  assert.deepEqual(fs.readFileSync(source), original, 'source cannot be overwritten');
  count++;
  assert.notEqual(spawnSync(python, [script], { encoding: 'utf8' }).status, 0);
  count++;
  // The standing instruction must be checked against the authoritative policy.
  const clauseScript = path.join(root, 'scripts', 'check-clause-refs.py');
  const inspect = spawnSync(python, ['-c', `
import importlib.util, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location('clauses', sys.argv[1]); module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
assert 'managed-settings.json' in [p.name for p in module.SOURCES]
assert 'settings.json' in [p.name for p in module.SOURCES]
assert module.check_sources([Path(sys.argv[2]) / 'missing.md'], {}, {})
try:
    module.clause_index('**7.1**  original clause\\n**7.1**  duplicate clause')
    raise AssertionError('duplicate identifiers must fail')
except ValueError:
    pass
module.ROOT = Path(sys.argv[2])
reference = module.ROOT / 'reference.md'
reference.write_text('See clause 7.1', encoding='utf-8')
assert module.check_sources([reference], {'7.1': 'different provision'}, set())
reference.write_text('See clause 6.5(z)', encoding='utf-8')
assert module.check_sources([reference], {'6.5': 'Before a tool is approved'}, set(), {'6.5(a)'})
` , clauseScript, tmp], { encoding: 'utf8' });
  assert.equal(inspect.status, 0);
  count++;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`passed=${count} failed=0 (document rendering and reference checks)`);
