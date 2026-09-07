'use strict';
const assert = require('assert');
const { parseResult, deniedAttempt } = require('./e2e.test.js');
const success = { type: 'result', subtype: 'success', is_error: false, result: 'synthetic result' };
for (const processResult of [
  { status: 1, stdout: '' },
  { status: null, error: { code: 'ETIMEDOUT' } },
  { status: 0, stdout: '' },
  { status: 0, stdout: '{}' },
  { status: 0, stdout: JSON.stringify({ ...success, is_error: true }) },
  { status: 0, stdout: JSON.stringify({ ...success, subtype: 'error_max_turns' }) },
  { status: 0, stdout: JSON.stringify({ ...success, result: '' }) },
]) assert.throws(() => parseResult(processResult));
assert.equal(parseResult({ status: 0, stdout: JSON.stringify(success) }), success.result);
assert.equal(deniedAttempt([], 'Read', '/other'), false);
assert.equal(deniedAttempt([{ event: 'PreToolUse', tool: 'Read', target: '/other', decision: 'allow' }], 'Read', '/other'), false);
assert.equal(deniedAttempt([{ event: 'PreToolUse', tool: 'Read', target: '/own', decision: 'deny' }], 'Read', '/other'), false);
assert.equal(deniedAttempt([{ event: 'PreToolUse', tool: 'Read', target: '/other', decision: 'deny' }], 'Read', '/other'), true);
console.log('passed=12 failed=0 (offline live-harness oracles)');
