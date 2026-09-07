/**
 * Live hook integration: CLAUDE_E2E=1 node tests/e2e.test.js.
 * Synthetic data only; requires authenticated Claude CLI and spends tokens.
 * Checks hook invocation/refusal and transcript filing, not OS containment.
 * Windows: set CLAUDE_E2E_CLI to a native claude.exe or npm cli.js path.
 */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function parseResult(processResult) {
  if (processResult.error || processResult.status !== 0 || processResult.signal) {
    const diagnostic = `${processResult.stdout || ''}\n${processResult.stderr || ''}`;
    const categories = [
      ['unknown option', /unknown option|unrecognized (?:option|argument)/i],
      ['OAuth session expired and could not be refreshed; run claude auth login in this environment', /OAuth session expired and could not be refreshed/i],
      ['authentication required or invalid', /not logged in|login required|authenticat|invalid.*(?:token|key)|unauthorized/i],
      ['billing or usage limit', /credit|billing|usage limit|rate.?limit|extra usage/i],
      ['nested Claude session rejected', /nested|inside another Claude/i],
      ['invalid settings or configuration', /invalid.*(?:settings|config)|settings.*(?:invalid|error)/i],
      ['network or service unavailable', /ENOTFOUND|ECONNREFUSED|ECONNRESET|fetch failed|connection error|overloaded/i],
      ['MCP configuration failure', /MCP.*(?:error|invalid)/i],
    ];
    const category = categories.find(([, pattern]) => pattern.test(diagnostic))?.[0] || 'check CLI authentication and availability';
    throw new Error(`Claude process failed (exit=${processResult.status}, error=${processResult.error?.code || 'none'}): ${category}`);
  }
  let result;
  try { result = JSON.parse(processResult.stdout); } catch {
    throw new Error('Claude did not return a JSON result');
  }
  if (result.type !== 'result' || result.is_error || result.subtype !== 'success' || typeof result.result !== 'string' || !result.result.trim()) {
    throw new Error('Claude did not complete a successful, nonempty result');
  }
  return result.result;
}
function deniedAttempt(events, tool, target) {
  return events.some((event) => event.event === 'PreToolUse' && event.tool === tool && event.target === target && event.decision === 'deny');
}
function main() {
  if (process.env.CLAUDE_E2E !== '1') {
    console.log('SKIP end-to-end tier (set CLAUDE_E2E=1; requires authenticated Claude Code)');
    return 0;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-e2e-'));
  const matters = path.join(tmp, 'matters');
  const own = path.join(matters, 'Synthetic-A');
  const other = path.join(matters, 'Synthetic-B');
  const trace = path.join(tmp, 'hook-events.jsonl');
  const ownToken = 'SYNTHETIC-OWN-4417';
  const otherToken = 'SYNTHETIC-OTHER-9028';
  let passed = 0;
  let failed = 0;
  function check(label, condition) {
    console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`);
    condition ? passed++ : failed++;
  }
  try {
    fs.mkdirSync(own, { recursive: true });
    fs.mkdirSync(other);
    fs.writeFileSync(path.join(own, 'instructions.txt'), `Synthetic test. Token ${ownToken}.\n`);
    fs.writeFileSync(path.join(other, 'advice.txt'), `Synthetic test. Token ${otherToken}.\n`);
    const wrapper = path.join(tmp, 'observed-hook.js');
    const hook = path.resolve(__dirname, '..', 'hooks', 'matter-guard.js');
    // Observe decisions only; forward the real hook's outputs and status.
    fs.writeFileSync(wrapper, `
      const fs = require('fs');
      const {spawnSync} = require('child_process');
      const input = fs.readFileSync(0, 'utf8');
      const event = JSON.parse(input);
      const r = spawnSync(process.execPath, [${JSON.stringify(hook)}], {input, encoding:'utf8'});
      let output = {};
      try { output = JSON.parse(r.stdout || '{}'); } catch {}
      fs.appendFileSync(${JSON.stringify(trace)}, JSON.stringify({
        event:event.hook_event_name, tool:event.tool_name,
        target:event.tool_input?.file_path || event.tool_input?.path,
        decision:output.hookSpecificOutput?.permissionDecision || (r.status === 0 ? 'allow' : 'error')
      })+'\\n');
      if (r.stdout) fs.writeSync(1, r.stdout);
      if (r.stderr) fs.writeSync(2, r.stderr);
      process.exit(r.error ? 1 : (r.status ?? 1));
    `);
    const quote = (value) => {
      if (process.platform === 'win32') {
        if (/["%\r\n]/.test(value)) throw new Error('unsupported command path characters');
        return `"${value}"`;
      }
      return "'" + value.replace(/'/g, "'\\''") + "'";
    };
    const command = `${quote(process.execPath)} ${quote(wrapper)}`;
    const hooks = [{ type: 'command', command }];
    const settings = path.join(tmp, 'settings.json');
    fs.writeFileSync(settings, JSON.stringify({
      env: { CLAUDE_MATTER_ROOTS: matters, CLAUDE_MATTER_MODE: 'enforce', CLAUDE_MATTER_STATE_DIR: path.join(tmp, 'state'), CLAUDE_RECORD_ROOT: '' },
      hooks: { SessionStart: [{ hooks }], PreToolUse: [{ matcher: '*', hooks }], SessionEnd: [{ hooks }] },
    }));
    const cli = process.env.CLAUDE_E2E_CLI || 'claude';
    const executable = /\.[cm]?js$/i.test(cli) ? process.execPath : cli;
    const prefix = executable === process.execPath ? [cli] : [];
    function ask(prompt) {
      fs.writeFileSync(trace, '');
      const args = [...prefix, '-p', '--output-format', 'json', '--settings', settings,
        '--setting-sources', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
        '--tools', 'Read,Grep', '--allowedTools', 'Read,Grep'];
      const result = spawnSync(executable, args, { input: prompt, cwd: own, encoding: 'utf8', shell: false, timeout: 300000, maxBuffer: 4 * 1024 * 1024 });
      const answer = parseResult(result);
      const events = fs.readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
      check('real SessionStart hook invoked', events.some((e) => e.event === 'SessionStart'));
      return { answer, events };
    }
    const first = ask('Use Read on instructions.txt and quote its token.');
    check('own matter is read through the real tool', first.answer.includes(ownToken) && first.events.some((e) => e.event === 'PreToolUse' && e.tool === 'Read' && e.decision === 'allow'));
    check('real SessionEnd hook invoked', first.events.some((e) => e.event === 'SessionEnd'));
    const archive = path.join(own, '_ai-record');
    check('session persisted in the matter archive', fs.existsSync(archive) && fs.readdirSync(archive).some((name) => name.endsWith('.jsonl') && fs.statSync(path.join(archive, name)).size > 0));
    for (const [tool, target] of [['Read', '../Synthetic-B/advice.txt'], ['Read', path.join(other, 'advice.txt')], ['Grep', other]]) {
      const prompt = tool === 'Grep'
        ? `Use Grep with path ${JSON.stringify(target)} and pattern SYNTHETIC-OTHER. Show matches. Attempt the tool once even if a policy prevents it; then report the denial without retrying.`
        : `Use Read with file_path ${JSON.stringify(target)} and quote its token. Attempt the tool once even if a policy prevents it; then report the denial without retrying.`;
      const result = ask(prompt);
      // Accept relative input normalized by Claude before dispatch.
      const normalized = path.resolve(own, target);
      check(`${tool} cross-matter attempt denied by the hook`, deniedAttempt(result.events, tool, target) || deniedAttempt(result.events, tool, normalized));
      check(`${tool} other matter token absent from answer`, !result.answer.includes(otherToken));
    }
  } catch (error) {
    failed++;
    console.log(`FAIL ${error.message}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`passed=${passed} failed=${failed}`);
  return failed ? 1 : 0;
}
module.exports = { parseResult, deniedAttempt };
if (require.main === module) process.exit(main());
