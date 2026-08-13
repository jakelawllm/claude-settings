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

function scan(dir) {
  const r = spawnSync(
    'python3', [SCANNER],
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

  // 23: The conventional, non-routable UNC example in file content must be
  // allowed. Historical path-parser docstrings used exactly this form.
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

  // 24: An arbitrary UNC path must still fail — the allowance is exact-match only.
  {
    const dir = path.join(TMP, 'unc-arbitrary-rejected');
    makeRepo(dir);
    commitFileContent(dir, 'real path', 'mount \\\\corp-fs01\\ClientMatter for access\n');
    checkRejected('24 arbitrary UNC path still fails', scan(dir));
  }

  // 25: A share name that only starts with the allowed example must still fail
  // — the allowance matches the captured substring exactly, not a prefix.
  {
    const dir = path.join(TMP, 'unc-example-prefix-rejected');
    makeRepo(dir);
    commitFileContent(dir, 'lookalike share', 'mount \\\\server\\shareddrive for access\n');
    checkRejected('25 lookalike UNC share still fails', scan(dir));
  }
}

try {
  run();
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\npassed=${pass} failed=${fail}`);
  process.exit(fail ? 1 : 0);
}