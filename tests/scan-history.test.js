#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCANNER = path.join(__dirname, '..', 'scripts', 'scan-history.py');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-'));

let pass = 0;
let fail = 0;
let skip = 0;

function check(label, cond, extra) {
  const ok = !!cond;
  ok ? ++pass : ++fail;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
}

const SHA = '0'.repeat(40);

function makeRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const opts = { cwd: dir, encoding: 'utf8' };
  spawnSync('git', ['init', '-q', '.'], opts);
  spawnSync('git', ['config', 'user.email', 't@t.invalid'], opts);
  spawnSync('git', ['config', 'user.name', 'Test'], opts);
  spawnSync('git', ['config', 'commit.gpgsign', 'false'], opts);
  fs.writeFileSync(path.join(dir, 'f.txt'), 'initial\n');
  spawnSync('git', ['add', '-A'], opts);
  spawnSync('git', ['commit', '-q', '-m', 'init'], opts);
}

function commitBody(dir, message) {
  const opts = { cwd: dir, encoding: 'utf8' };
  fs.writeFileSync(path.join(dir, 'f.txt'), 'x');
  spawnSync('git', ['add', '-A'], opts);
  spawnSync('git', ['commit', '-q', '-m', 'add', '-m', message], opts);
}

function commitFileContent(dir, message, fileContent) {
  const opts = { cwd: dir, encoding: 'utf8' };
  fs.writeFileSync(path.join(dir, 'f.txt'), fileContent);
  spawnSync('git', ['add', '-A'], opts);
  spawnSync('git', ['commit', '-q', '-m', message], opts);
}

function scan(dir, args = []) {
  const r = spawnSync(
    process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [SCANNER, ...args],
    { cwd: dir, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, error: r.error };
}

function checkAllowed(label, r) {
  check(
    label,
    !r.error && r.code === 0 && !r.stdout.includes('FOUND:'),
    r.error ? r.error.message : `rc=${r.code}`
  );
}

function checkRejected(label, r) {
  check(
    label,
    !r.error && r.code === 1 &&
      r.stdout.includes('potential disclosure(s)') && r.stdout.includes('FOUND:'),
    r.error ? r.error.message : `rc=${r.code}`
  );
}

function run() {
  const baseline = 'e25608d975ef58d31bd4ff7984eabb0622046b22';
  const historical = '29e76ac949c47104185aee0ffa16569ea6a6c862';
  const workflowDigest = '649d3a459ff0e903e237d9a8924927344be095d58ac2681cce914149ee0aeb90';
  const workflowEvidence = 'docs/policy-decisions/oauth-token-management.md';
  for (const [name, filename, content, allowed] of [
    ['report-baseline', 'docs/INTERNAL_MVP_READINESS_REPORT.md', `**Baseline:** ${baseline}`, true],
    ['report-historical', 'docs/INTERNAL_MVP_READINESS_REPORT.md', `Historical commit ${historical}`, true],
    ['checklist-baseline', 'docs/release-checklist.md', `Inherited from main at ${baseline}`, true],
    ['unreviewed-document', 'docs/unreviewed.md', `Baseline ${baseline}`, false],
    ['unreviewed-digest', 'docs/INTERNAL_MVP_READINESS_REPORT.md', `Baseline ${'1'.repeat(40)}`, false],
    ['adjacent-credential', 'docs/INTERNAL_MVP_READINESS_REPORT.md', `Baseline ${baseline}; password="super-secret-value"`, false],
    ['adjacent-entropy', 'docs/INTERNAL_MVP_READINESS_REPORT.md', `Baseline ${baseline}; extra=${'2'.repeat(40)}`, false],
    ['credential-shaped', 'docs/INTERNAL_MVP_READINESS_REPORT.md', `github_pat_${baseline}`, false],
    ['workflow-digest', workflowEvidence, `- Workflow SHA-256 (LF): ${workflowDigest}`, true],
    ['workflow-wrong-document', 'docs/unreviewed.md', `Digest ${workflowDigest}`, false],
    ['workflow-unreviewed-digest', workflowEvidence, `- Workflow SHA-256 (LF): ${'3'.repeat(64)}`, false],
    ['workflow-adjacent-credential', workflowEvidence, `Digest ${workflowDigest}; password="super-secret-value"`, false],
    ['workflow-adjacent-entropy', workflowEvidence, `Digest ${workflowDigest}; extra=${'4'.repeat(64)}`, false],
    ['workflow-credential-shaped', workflowEvidence, `github_pat_${workflowDigest}`, false],
  ]) {
    const dir = path.join(TMP, 'reviewed-sha-' + name);
    makeRepo(dir);
    const target = path.join(dir, filename);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    const opts = { cwd: dir, encoding: 'utf8' };
    spawnSync('git', ['add', '-A'], opts);
    spawnSync('git', ['commit', '-qm', 'reviewed reference regression'], opts);
    (allowed ? checkAllowed : checkRejected)(`reviewed public reference scope: ${name}`, scan(dir));
  }
  {
    const dir = path.join(TMP, 'workflow-digest-commit-message');
    makeRepo(dir);
    commitBody(dir, `Workflow digest ${workflowDigest}`);
    checkRejected('reviewed workflow digest is not exempt in commit messages', scan(dir));
  }
  const managedCommit = '9a0372a123d1f038378bb6360806c139cfed2f61';
  const managedDigests = [
    'b501ba838a7a48c4e93e5e103b8baf8f7a462bb97a51c40995764d4b61d4d462',
    '80afdbd51b7e3d3e6fe04c2e52f8dcfd3cd1e75182e7bddb9f637d8d20be0cef',
    '0630118144fe3f4304e552df6151bdc070e1507e60b1f80ef3baea3e7563b85a',
    '8b94fcccdb599de24c74a4730e387b26e41f37eab39b73f124278f25b6ae20f8',
    '15e586954d3c598fefb83c0177aaedd3604f81371efff29f66ff854a73ec4935',
    '744219f4a1ed280be44327f819185e3fd332c34dfef2e207e5a117eca9005503',
    '06df115e7d239c729452f777442b7d3e201da8149ad875eb233070407ba65094',
  ];
  const initialLog = '7a6e3c5c65e5a445cfbb8328d3f9510c0011fc077ebc9c04520df8207eea74e6';
  for (const [name, filename, content, allowed] of [
    ['managed-source-report', 'docs/INTERNAL_MVP_READINESS_REPORT.md', managedCommit, true],
    ['managed-source-remaining', 'docs/INTERNAL_MVP_REMAINING_ISSUES.md', managedCommit, true],
    ['managed-source-wrong-path', 'docs/unreviewed.md', managedCommit, false],
    ['managed-artifacts-report', 'docs/INTERNAL_MVP_READINESS_REPORT.md', [...managedDigests, initialLog].join('\n'), true],
    ['managed-artifacts-runbook', 'docs/synthetic-container-checks.md', managedDigests.join('\n'), true],
    ['initial-log-wrong-path', 'docs/synthetic-container-checks.md', initialLog, false],
    ['managed-artifact-wrong-path', 'docs/unreviewed.md', managedDigests[0], false],
    ['managed-unreviewed-digest', 'docs/synthetic-container-checks.md', '5'.repeat(64), false],
    ['managed-adjacent-credential', 'docs/INTERNAL_MVP_READINESS_REPORT.md', `${managedDigests[0]} password="super-secret-value"`, false],
    ['managed-adjacent-entropy', 'docs/INTERNAL_MVP_READINESS_REPORT.md', `${managedDigests[0]} ${'6'.repeat(64)}`, false],
    ['managed-credential-shaped', 'docs/INTERNAL_MVP_READINESS_REPORT.md', `github_pat_${managedDigests[0]}`, false],
  ]) {
    const dir = path.join(TMP, name);
    makeRepo(dir);
    const target = path.join(dir, filename);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    spawnSync('git', ['add', '-A'], { cwd: dir });
    spawnSync('git', ['commit', '-qm', 'managed reference regression'], { cwd: dir });
    (allowed ? checkAllowed : checkRejected)(name, scan(dir));
  }
  {
    const dir = path.join(TMP, 'managed-digest-commit-message');
    makeRepo(dir);
    commitBody(dir, `Manifest digest ${managedDigests[0]}`);
    checkRejected('managed digest is not exempt in commit messages', scan(dir));
  }
  // Keep index and disk independent: HEAD-to-working-tree alone misses these.
  for (const state of ['staged-restored', 'staged-deleted', 'unstaged', 'untracked']) {
    const dir = path.join(TMP, 'worktree-' + state);
    makeRepo(dir);
    const token = 'ghp_' + 'c'.repeat(30);
    const target = path.join(dir, state === 'untracked' ? 'new.txt' : 'f.txt');
    fs.writeFileSync(target, token + '\n');
    if (state.startsWith('staged-')) {
      spawnSync('git', ['add', '--', 'f.txt'], { cwd: dir });
      if (state === 'staged-deleted') fs.unlinkSync(target);
      else fs.writeFileSync(target, 'initial\n');
    }
    checkAllowed(`${state} preserves history-only default`, scan(dir));
    const result = scan(dir, ['--worktree']);
    checkRejected(`${state} is checked before commit`, result);
    check(`${state} output remains redacted`, !result.stdout.includes(token) && !result.stderr.includes(token));
    check(`${state} reports source`, result.stdout.includes(state.startsWith('staged-') ? 'index' : state === 'unstaged' ? 'worktree' : state));
  }
  for (const staged of [false, true]) {
    const dir = path.join(TMP, 'worktree-name-' + staged);
    makeRepo(dir);
    const token = 'ghp_' + 'd'.repeat(30);
    fs.writeFileSync(path.join(dir, token + '.txt'), 'ordinary content\n');
    if (staged) spawnSync('git', ['add', '-A'], { cwd: dir });
    const result = scan(dir, ['--worktree']);
    checkRejected(`${staged ? 'staged' : 'untracked'} filename is checked`, result);
    check(`${staged ? 'staged' : 'untracked'} filename is redacted`, !result.stdout.includes(token) && !result.stderr.includes(token));
  }
  {
    const dir = path.join(TMP, 'worktree-ignored-runtime');
    makeRepo(dir);
    fs.writeFileSync(path.join(dir, '.gitignore'), '.claude-orch/\n');
    fs.mkdirSync(path.join(dir, '.claude-orch'));
    fs.writeFileSync(path.join(dir, '.claude-orch', 'credentials.json'), 'password="super-secret-value"');
    checkAllowed('ignored runtime files are excluded without opening them', scan(dir, ['--worktree']));
    spawnSync('git', ['add', '-f', '--', '.claude-orch/credentials.json'], { cwd: dir });
    checkRejected('force-staged ignored runtime content remains scanned', scan(dir, ['--worktree']));
    spawnSync('git', ['reset', '-q', 'HEAD', '--', '.claude-orch/credentials.json'], { cwd: dir });
    fs.mkdirSync(path.join(dir, '.claude'));
    fs.writeFileSync(path.join(dir, '.claude', 'AGENTS.md'), 'password="super-secret-value"');
    checkRejected('nonignored .claude instructions remain scanned', scan(dir, ['--worktree']));
  }
  {
    const dir = path.join(TMP, 'worktree-unmerged');
    makeRepo(dir);
    const opts = { cwd: dir, encoding: 'utf8' };
    const base = spawnSync('git', ['rev-parse', 'HEAD'], opts).stdout.trim();
    spawnSync('git', ['checkout', '-qb', 'other'], opts);
    commitFileContent(dir, 'other change', 'other branch content\n');
    spawnSync('git', ['checkout', '-q', '--detach', base], opts);
    commitFileContent(dir, 'competing change', 'competing content\n');
    const merge = spawnSync('git', ['merge', '--no-edit', 'other'], opts);
    check('unmerged index fixture produced a real conflict', merge.status === 1);
    const result = scan(dir, ['--worktree']);
    check('unmerged index refuses an incomplete scan', result.code === 1 && result.stdout.includes('could not scan complete index and working tree'));
  }
  {
    const dir = path.join(TMP, 'worktree-subdirectory');
    makeRepo(dir);
    fs.mkdirSync(path.join(dir, 'nested'));
    fs.writeFileSync(path.join(dir, 'new.txt'), 'password="super-secret-value"');
    checkRejected('scan from a subdirectory still covers repository root', scan(path.join(dir, 'nested'), ['--worktree']));
  }
  {
    const dir = path.join(TMP, 'worktree-reviewed');
    makeRepo(dir);
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.writeFileSync(path.join(dir, 'docs', 'INTERNAL_MVP_READINESS_REPORT.md'), managedDigests.join('\n'));
    checkAllowed('untracked reviewed digests use the same exact allowances', scan(dir, ['--worktree']));
    spawnSync('git', ['add', '-A'], { cwd: dir });
    checkAllowed('staged reviewed digests use the same exact allowances', scan(dir, ['--worktree']));
  }
  {
    const dir = path.join(TMP, 'worktree-symlinks');
    makeRepo(dir);
    const outside = path.join(TMP, 'outside-fixture.txt');
    fs.writeFileSync(outside, 'password="super-secret-value"');
    try {
      fs.symlinkSync('../outside-fixture.txt', path.join(dir, 'link.txt'), 'file');
      checkAllowed('untracked symlink does not read its outside referent', scan(dir, ['--worktree']));
      spawnSync('git', ['add', '--', 'link.txt'], { cwd: dir });
      checkAllowed('staged symlink does not read its outside referent', scan(dir, ['--worktree']));
      const outsideDir = path.join(TMP, 'outside-directory');
      fs.mkdirSync(outsideDir);
      fs.writeFileSync(path.join(outsideDir, 'inside.txt'), 'password="super-secret-value"');
      fs.symlinkSync('../outside-directory', path.join(dir, 'parent-link'), 'dir');
      const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
      const probe = spawnSync(python, ['-c', "import os, runpy, sys\nm=runpy.run_path(sys.argv[1])\ntry: m['_candidate_text'](os.getcwd(), 'parent-link/inside.txt')\nexcept OSError: print('parent refused')\nelse: sys.exit(1)", SCANNER], { cwd: dir, encoding: 'utf8' });
      check('candidate reads reject symlink parents', probe.status === 0 && probe.stdout.includes('parent refused'), `rc=${probe.status}`);
      fs.symlinkSync('ghp_' + 'e'.repeat(30), path.join(dir, 'unsafe-link.txt'), 'file');
      checkRejected('symlink target text itself is scanned', scan(dir, ['--worktree']));
    } catch (err) {
      if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'ENOTSUP'].includes(err.code)) throw err;
      ++skip;
      console.log(`SKIP  symlink regressions require Windows symlink permission (${err.code})`);
    }
  }
  // Force failures below the CLI while keeping diagnostic output credential-free.
  for (const failure of ['git', 'unreadable']) {
    const dir = path.join(TMP, 'worktree-failure-' + failure);
    makeRepo(dir);
    fs.writeFileSync(path.join(dir, 'new.txt'), 'ordinary content\n');
    const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    const code = `import contextlib, io, runpy, subprocess, sys\nfrom unittest import mock\nm=runpy.run_path(sys.argv[1])\ntoken='ghp_'+'f'*30\nbuffer=io.StringIO()\n` +
      (failure === 'git'
        ? `with contextlib.redirect_stdout(buffer), mock.patch.object(m['subprocess'], 'run', side_effect=subprocess.CalledProcessError(128, ['git'], stderr=token)):\n result=m['scan_worktree']()\n`
        : `with contextlib.redirect_stdout(buffer), mock.patch.dict(m['scan_worktree'].__globals__, {'_candidate_text': mock.Mock(side_effect=PermissionError(token))}):\n result=m['scan_worktree']()\n`) +
      `assert result is None\nassert 'could not scan complete index and working tree' in buffer.getvalue()\nassert token not in buffer.getvalue()\nprint('safe failure')\n`;
    const result = spawnSync(python, ['-c', code, SCANNER], { cwd: dir, encoding: 'utf8' });
    check(`${failure} scan failure refuses a pass and redacts diagnostics`, result.status === 0 && result.stdout.includes('safe failure'), `rc=${result.status}`);
  }
  for (const kind of ['filename', 'branch', 'tag']) {
    const dir = path.join(TMP, 'metadata-' + kind);
    makeRepo(dir);
    const token = 'ghp_' + 'b'.repeat(30);
    const opts = { cwd: dir, encoding: 'utf8' };
    if (kind === 'filename') {
      fs.writeFileSync(path.join(dir, token + '.txt'), 'ordinary content');
      spawnSync('git', ['add', '-A'], opts);
      spawnSync('git', ['commit', '-qm', 'metadata regression'], opts);
    } else if (kind === 'branch') {
      spawnSync('git', ['branch', token], opts);
    } else {
      spawnSync('git', ['tag', '-a', 'synthetic-tag', '-m', token], opts);
    }
    const result = scan(dir);
    checkRejected(`${kind} disclosure detected`, result);
    check(`${kind} disclosure is redacted`, !result.stdout.includes(token));
  }
  {
    const dir = path.join(TMP, 'scanner-source-disclosure');
    makeRepo(dir);
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.writeFileSync(path.join(dir, 'scripts', 'scan-history.py'), 'password="super-secret-value"');
    spawnSync('git', ['add', '-A'], { cwd: dir });
    spawnSync('git', ['commit', '-qm', 'scanner source regression'], { cwd: dir });
    checkRejected('scanner source is not exempt', scan(dir));
  }
  {
    const dir = path.join(TMP, 'message-control-character');
    makeRepo(dir);
    commitBody(dir, '\x1epassword="super-secret-value"');
    checkRejected('commit control characters cannot hide a disclosure', scan(dir));
    const shallow = path.join(TMP, 'shallow-clone');
    const cloned = spawnSync('git', ['clone', '--depth', '1', require('url').pathToFileURL(dir).href, shallow], { encoding: 'utf8' });
    check('shallow clone fixture created', cloned.status === 0);
    const result = scan(shallow);
    check('shallow history refuses to report a full-history pass', result.code === 1 && result.stdout.includes('--unshallow'));
  }
  for (const [name, content] of [
    ['added-plus-prefix', '++password="super-secret-value"'],
    ['allowed-domain-in-secret', 'password="super-secret-example.invalid-value"'],
  ]) {
    const dir = path.join(TMP, name);
    makeRepo(dir);
    commitFileContent(dir, 'regression case', content);
    const result = scan(dir);
    checkRejected(name, result);
    check(`${name} output is redacted`, !result.stdout.includes('super-secret'));
  }
  {
    const dir = path.join(TMP, 'secret-filename');
    makeRepo(dir);
    const token = 'ghp_' + 'a'.repeat(30);
    fs.writeFileSync(path.join(dir, token + '.txt'), 'password="super-secret-value"');
    const opts = { cwd: dir, encoding: 'utf8' };
    spawnSync('git', ['add', '-A'], opts);
    spawnSync('git', ['commit', '-q', '-m', 'file location regression'], opts);
    const result = scan(dir);
    checkRejected('credential in filename still flags content', result);
    check('credential in filename is redacted', !result.stdout.includes(token));
  }
  const owner = 'octocat';
  const repo = 'hello-world';
  const urlCompare = `https://github.com/${owner}/${repo}/compare/${SHA}...${SHA}`;
  const urlCompareNoScheme = `github.com/${owner}/${repo}/compare/${SHA}...${SHA}`;
  const urlCommit = `https://github.com/${owner}/${repo}/commit/${SHA}`;

  // 01: Dependabot compare URL in commit body must be allowed.
  {
    const dir = path.join(TMP, 'compare');
    makeRepo(dir);
    commitBody(dir, `Bump actions/checkout from 1.2.3 to 1.2.4\n${urlCompare}`);
    checkAllowed('01 Dependabot compare URL allowed', scan(dir));
  }

  // 02: Dependabot commit URL in commit body must be allowed.
  {
    const dir = path.join(TMP, 'commit-url');
    makeRepo(dir);
    commitBody(dir, `Release assets from 1.2.3\nSee ${urlCommit}`);
    checkAllowed('02 Dependabot commit URL allowed', scan(dir));
  }

  // 03: Compare URL without scheme in commit body must be allowed.
  {
    const dir = path.join(TMP, 'compare-no-scheme');
    makeRepo(dir);
    commitBody(dir, `Bump deps\n${urlCompareNoScheme}`);
    checkAllowed('03 scheme-less compare URL allowed', scan(dir));
  }

  // 04: A bare 40-hex SHA outside any URL in a commit body must fail.
  {
    const dir = path.join(TMP, 'bare-sha');
    makeRepo(dir);
    commitBody(dir, `Some context ${SHA} more text`);
    checkRejected('04 bare 40-hex SHA fails without URL context', scan(dir));
  }

  // 05: A secret beside an allowed compare URL must still fail.
  {
    const dir = path.join(TMP, 'secret-beside-url');
    makeRepo(dir);
    commitBody(dir, `${urlCompare} and password="super-secret-value"`);
    checkRejected('05 secret beside allowed URL fails', scan(dir));
  }

  // 06: A private IP beside an allowed compare URL must still fail.
  {
    const dir = path.join(TMP, 'ip-beside-url');
    makeRepo(dir);
    commitBody(dir, `${urlCompare} host 10.42.1.9`);
    checkRejected('06 private IP beside allowed URL fails', scan(dir));
  }

  // 07: A SHA not part of a compare/commit URL (e.g. a bare SHA in a comment-like
  // URL segment) must fail. The SHA here appears as a "hash=" param, not in a URL.
  {
    const dir = path.join(TMP, 'sha-param');
    makeRepo(dir);
    commitBody(dir, `ref=${SHA}`);
    checkRejected('07 SHA in non-URL context fails', scan(dir));
  }

  // 08: Compare URL in FILE CONTENT (diff) must NOT be allowed — scoped to commit
  // messages only.
  {
    const dir = path.join(TMP, 'diff-url');
    makeRepo(dir);
    commitFileContent(dir, 'normal commit', `# see ${urlCompare}`);
    checkRejected('08 compare URL in diff content fails (scoped)', scan(dir));
  }

  // 09: Commit URL in FILE CONTENT (diff) must NOT be allowed.
  {
    const dir = path.join(TMP, 'diff-commit-url');
    makeRepo(dir);
    commitFileContent(dir, 'normal commit', `# reference ${urlCommit}`);
    checkRejected('09 commit URL in diff content fails (scoped)', scan(dir));
  }

  // 10: A trailing non-URI boundary after the SHA in a commit URL must be allowed.
  {
    const dir = path.join(TMP, 'trailing-boundary');
    makeRepo(dir);
    commitBody(dir, `see ${urlCommit}.`);
    checkAllowed('10 trailing period after commit URL allowed', scan(dir));
  }

  // 11: An invalid (41-hex) value beside a valid compare URL must still fail.
  {
    const dir = path.join(TMP, 'invalid-alongside');
    makeRepo(dir);
    const bad = 'g'.repeat(41);
    commitBody(dir, `${urlCompare} token=${bad}`);
    checkRejected('11 invalid 41-hex value fails alongside URL', scan(dir));
  }

  // 12: Synthetic merge commit message must still pass (regression anchor).
  {
    const dir = path.join(TMP, 'merge-commit');
    makeRepo(dir);
    commitBody(dir, `Merge ${SHA} into ${SHA}`);
    checkAllowed('12 synthetic merge commit still allowed', scan(dir));
  }

  // 13: A GitHub token in the URL owner must not be hidden by the URL allowance.
  {
    const dir = path.join(TMP, 'token-in-owner');
    makeRepo(dir);
    commitBody(dir, `https://github.com/ghp_AAAAAAAAAAAAAAAAAAAAAAAA/repo/commit/${SHA}`);
    checkRejected('13 token inside allowed URL span still fails', scan(dir));
  }

  // 14: A private IP in the URL owner must not be hidden by the URL allowance.
  {
    const dir = path.join(TMP, 'ip-in-owner');
    makeRepo(dir);
    commitBody(dir, `https://github.com/10.42.1.9/repo/commit/${SHA}`);
    checkRejected('14 private IP inside allowed URL span still fails', scan(dir));
  }

  // 15: An AWS key in the URL owner must not be hidden by the URL allowance.
  {
    const dir = path.join(TMP, 'aws-in-owner');
    makeRepo(dir);
    commitBody(dir, `https://github.com/AKIAAAAAAAAAAAAAAAAA/repo/commit/${SHA}`);
    checkRejected('15 AWS key inside allowed URL span still fails', scan(dir));
  }

  // 16: github.com as a path segment on a foreign host must not qualify.
  {
    const dir = path.join(TMP, 'foreign-host');
    makeRepo(dir);
    commitBody(dir, `https://notgithub.com/github.com/octocat/repo/commit/${SHA}`);
    checkRejected('16 foreign-host github.com path still fails', scan(dir));
  }

  // 17: An unlabelled long token in the URL owner must remain an entropy hit.
  {
    const dir = path.join(TMP, 'entropy-in-owner');
    makeRepo(dir);
    const token = 'A'.repeat(48);
    commitBody(dir, `https://github.com/${token}/repo/commit/${SHA}`);
    checkRejected('17 entropy value inside allowed URL span still fails', scan(dir));
  }

  // 18: A scheme-less github.com path in a foreign URL query must not qualify.
  {
    const dir = path.join(TMP, 'foreign-query');
    makeRepo(dir);
    commitBody(dir, `https://evil.example/?next=github.com/octocat/repo/commit/${SHA}`);
    checkRejected('18 foreign query github.com path still fails', scan(dir));
  }

  // 19: A scheme-less github.com path in a foreign URL fragment must not qualify.
  {
    const dir = path.join(TMP, 'foreign-fragment');
    makeRepo(dir);
    commitBody(dir, `https://evil.example/#github.com/octocat/repo/commit/${SHA}`);
    checkRejected('19 foreign fragment github.com path still fails', scan(dir));
  }

  // 20: Assignment and custom-scheme prefixes are not URL start boundaries.
  {
    const dir = path.join(TMP, 'foreign-prefix');
    makeRepo(dir);
    commitBody(dir, `next=github.com/octocat/repo/commit/${SHA}\n` +
      `foreign:github.com/octocat/repo/commit/${SHA}`);
    checkRejected('20 assignment/custom-scheme github.com paths still fail', scan(dir));
  }

  // 21: Long but ordinary owner/repo path segments must still be allowed.
  // The entropy class includes '/', so a slash-joined residue check would
  // falsely flag a genuine URL whose owner+repo+path exceeds 40 chars.
  {
    const dir = path.join(TMP, 'long-owner-repo');
    makeRepo(dir);
    const owner = 'a'.repeat(30);
    const repo = 'b'.repeat(30);
    commitBody(dir, `https://github.com/${owner}/${repo}/commit/${SHA}`);
    checkAllowed('21 long ordinary owner/repo path still allowed', scan(dir));
  }

  // 22: Opening delimiters inside a foreign query/fragment are not boundaries.
  {
    const dir = path.join(TMP, 'nested-foreign-delimiters');
    makeRepo(dir);
    commitBody(dir,
      `https://evil.example/?next=(github.com/octocat/repo/commit/${SHA})\n` +
      `https://evil.example/?next=(https://github.com/octocat/repo/commit/${SHA})\n` +
      `https://evil.example/?next=x;github.com/octocat/repo/commit/${SHA}\n` +
      `https://evil.example/#(github.com/octocat/repo/commit/${SHA})`
    );
    checkRejected('22 nested foreign delimiters still fail', scan(dir));
  }

  // 23: The conventional synthetic UNC example in file content is allowed.
  // Historical path-parser docstrings used exactly this form.
  {
    const dir = path.join(TMP, 'unc-example-allowed');
    makeRepo(dir);
    commitFileContent(
      dir,
      'docstring example',
      'Accepts Windows drive letters (C:\\), UNC (\\\\server\\share), and POSIX (/).\n'
    );
    checkAllowed('23 conventional UNC example allowed', scan(dir));
  }

  // 24: An arbitrary UNC path must still fail.
  {
    const dir = path.join(TMP, 'unc-arbitrary-rejected');
    makeRepo(dir);
    commitFileContent(dir, 'real path', String.raw`\\corp-fs01\ClientMatter`);
    checkRejected('24 arbitrary UNC path still fails', scan(dir));
  }

  // 25: A share name that only starts with the allowed example must still fail.
  {
    const dir = path.join(TMP, 'unc-example-prefix-rejected');
    makeRepo(dir);
    commitFileContent(dir, 'lookalike share', String.raw`\\server\shareddrive`);
    checkRejected('25 lookalike UNC share still fails', scan(dir));
  }

  // 26: A deeper path under the allowed synthetic share must still fail. The
  // scanner regex captures only server+share, so allowance must inspect suffix.
  {
    const dir = path.join(TMP, 'unc-example-deeper-rejected');
    makeRepo(dir);
    commitFileContent(dir, 'deeper path', String.raw`\\server\share\private`);
    checkRejected('26 deeper synthetic UNC path still fails', scan(dir));
  }

  // 27: A real UNC path whose share name starts with the synthetic example but
  // continues with a space must still fail.
  {
    const dir = path.join(TMP, 'unc-example-space-suffix-rejected');
    makeRepo(dir);
    commitFileContent(dir, 'space suffix', String.raw`\\server\share name\private`);
    checkRejected('27 UNC share with space suffix still fails', scan(dir));
  }

  // 28: A real UNC path whose share name starts with the synthetic example but
  // continues with @ must still fail.
  {
    const dir = path.join(TMP, 'unc-example-at-suffix-rejected');
    makeRepo(dir);
    commitFileContent(dir, 'at suffix', String.raw`\\server\share@dept\private`);
    checkRejected('28 UNC share with @ suffix still fails', scan(dir));
  }

  // 29: A real UNC path whose share name starts with the synthetic example but
  // continues with non-ASCII must still fail.
  {
    const dir = path.join(TMP, 'unc-example-unicode-suffix-rejected');
    makeRepo(dir);
    commitFileContent(dir, 'unicode suffix', String.raw`\\server\shareé\private`);
    checkRejected('29 UNC share with unicode suffix still fails', scan(dir));
  }
}

try {
  run();
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\npassed=${pass} failed=${fail} skipped=${skip}`);
  process.exit(fail ? 1 : 0);
}
