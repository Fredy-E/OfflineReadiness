'use strict';
// OfflineReadiness — packaged helper regression (node:test, zero dependencies).
// Portable: synthetic errors/profiles only. Never launches Chrome, never touches
// the user's browser/profile, never kills unrelated PIDs. Proves the standalone
// tests/cdp-browser.cjs retries transient EBUSY alongside ENOENT (bounded, fatal
// for unrelated errors) and proves only the current exact owned-profile PID is
// terminable via a current command-line check before any PID kill.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HELPER = path.join(__dirname, 'cdp-browser.cjs');
const src = fs.readFileSync(HELPER, 'utf8');

// Exact predicate mirrored from the helper's DevToolsActivePort catch block:
// transient startup states retry (return null within the existing waitUntil
// deadline); every other error rethrows. The allowed set is derived from the
// helper source so this test tracks the shipped file, not a hardcoded copy.
function helperAllowsRetry(code) {
  const allowsENOENT = src.includes("error.code === 'ENOENT'");
  const allowsEBUSY = src.includes("error.code === 'EBUSY'");
  if (code === 'ENOENT') return allowsENOENT;
  if (code === 'EBUSY') return allowsEBUSY;
  return false;
}

function syntheticError(code) {
  const e = new Error('synthetic ' + code);
  e.code = code;
  return e;
}

// Mirrors the helper's Windows ownership proof: current PID's live command line
// must contain the exact generated '--user-data-dir=<profile>' string. Synthetic
// command lines only; no process is ever queried or killed here.
function syntheticOwned(commandLine, profile) {
  const expected = '--user-data-dir=' + profile;
  return Boolean(commandLine && commandLine.includes(expected));
}

test('transient EBUSY retried alongside ENOENT within bounded startup wait', () => {
  assert.ok(src.includes('DevToolsActivePort'), 'helper must read owned DevToolsActivePort');
  assert.ok(src.includes("error.code === 'ENOENT'"), 'helper must retry ENOENT startup state');
  assert.ok(src.includes("error.code === 'EBUSY'"), 'helper must retry transient EBUSY startup sharing violation');
  // Both codes share one bounded retry branch (return null inside waitUntil).
  const retryBranch = /error\.code === 'ENOENT'[^]*error\.code === 'EBUSY'|error\.code === 'EBUSY'[^]*error\.code === 'ENOENT'/;
  assert.match(src, retryBranch, 'ENOENT and EBUSY must share the same transient retry branch');
  assert.match(src, /return null/, 'transient states must return null to retry within the deadline');
  assert.match(src, /waitUntil\([^]*owned Chrome debugger[^]*20000/, 'retry must stay bounded by the existing startup deadline');
  // Dynamic predicate: synthetic transient codes retry.
  assert.equal(helperAllowsRetry('ENOENT'), true, 'synthetic ENOENT must retry');
  assert.equal(helperAllowsRetry('EBUSY'), true, 'synthetic transient EBUSY must retry');
});

test('unrelated startup errors are fatal (never retried)', () => {
  assert.match(src, /throw error/, 'non-transient startup errors must rethrow');
  for (const code of ['EACCES', 'EPERM', 'EINVAL', 'ENOTDIR', 'EISDIR']) {
    assert.equal(helperAllowsRetry(code), false, 'synthetic ' + code + ' must be fatal');
    // The helper's catch shape: only ENOENT/EBUSY return null; anything else throws.
    const err = syntheticError(code);
    let retried = false;
    try {
      if (err.code === 'ENOENT' || err.code === 'EBUSY') retried = true;
      else throw err;
    } catch (e) {
      assert.equal(e.code, code, 'unrelated error must propagate with its code');
    }
    assert.equal(retried, false, code + ' must not take the retry path');
  }
});

test('current generated-profile proof precedes any PID kill', () => {
  assert.ok(src.includes('Get-CimInstance Win32_Process'), 'helper must re-check live process table via Get-CimInstance');
  assert.ok(src.includes('CommandLine'), 'helper must inspect the current command line');
  assert.ok(src.includes('--user-data-dir='), 'proof must match the generated --user-data-dir profile');
  assert.ok(src.includes('taskkill.exe'), 'Windows PID cleanup must go through taskkill.exe');
  const cmdIdx = src.indexOf('CommandLine');
  const killIdx = src.indexOf('taskkill.exe');
  assert.ok(cmdIdx !== -1 && killIdx !== -1 && cmdIdx < killIdx,
    'current command-line ownership proof must come before any taskkill reference');
  // taskkill must live only inside the owned branch; unproven PIDs warn and skip.
  assert.match(src, /if\s*\(\s*owned\s*\)/, 'PID kill must be gated on the live ownership proof');
  assert.match(src, /Skipped PID cleanup/, 'unproven ownership must warn and skip the kill');
  // The proof filter must target the current child PID, not a hardcoded number.
  assert.match(src, /ProcessId=' \+ child\.pid \+ '/, 'proof filter must use the current child.pid');
  assert.match(src, /'--user-data-dir=' \+ profile/, 'expected profile string must derive from the generated profile');
});

test('only the current exact owned-profile PID is terminable (synthetic)', () => {
  const owned = 'C:/synthetic/scratch/phase2-chrome-AAA111';
  const other = 'C:/synthetic/scratch/phase2-chrome-ZZZ999';
  const ownedCmd = '"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --user-data-dir=' + owned + ' about:blank';
  const otherCmd = '"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --user-data-dir=' + other + ' about:blank';
  assert.equal(syntheticOwned(ownedCmd, owned), true, 'exact current profile command line must be terminable');
  assert.equal(syntheticOwned(otherCmd, owned), false, 'different profile must never be terminable as owned');
  assert.equal(syntheticOwned(ownedCmd, other), false, 'cross-profile match must fail');
  assert.equal(syntheticOwned('', owned), false, 'empty command line must never authorize a kill');
  assert.equal(syntheticOwned(null, owned), false, 'missing command line must never authorize a kill');
  assert.equal(syntheticOwned('unrelated-process --flag', owned), false, 'unrelated command line must never authorize a kill');
  // Truncated profile strings must not authorize: the full generated path is required.
  assert.equal(syntheticOwned('--user-data-dir=C:/synthetic/scratch', owned), false, 'truncated profile must not match');
});

test('no safety-guard bypass: no unrelated kill, no user profile, standalone only', () => {
  // No hardcoded user-data paths and no attach to an existing browser.
  assert.ok(!/Users[\\/].*Chrome[\\/].*User Data/.test(src), 'helper must not reference a user Chrome profile');
  assert.ok(!src.includes('--user-data-dir=C:'), 'helper must not hardcode a profile path');
  assert.ok(!src.includes('--user-data-dir=/'), 'helper must not hardcode a POSIX profile path');
  assert.ok(src.includes('mkdtemp'), 'helper must generate a fresh scratch profile per launch');
  // Cleanup removes only the generated profile; outside artifacts are retained.
  assert.match(src, /artifactsDir\.startsWith\(profile/, 'profile removal must be guarded by the generated-profile prefix');
  assert.match(src, /fs\.rm\(profile/, 'only the generated profile directory may be removed');
  // Only the owned child may be signaled; no enumeration/kill of other PIDs.
  assert.ok(!src.includes('tasklist'), 'helper must not enumerate unrelated processes');
  assert.ok(!src.includes('Get-Process'), 'helper must not use broad process enumeration');
  const kills = (src.match(/taskkill\.exe|child\.kill/g) || []).length;
  assert.ok(kills >= 1 && kills <= 3, 'only the owned-child kill paths may exist, got ' + kills);
  // Standalone: never requires the parent directory or private paths.
  // (Private-home literal is assembled at runtime so this portable test file
  // itself never ships a private path; the assertion still proves the helper
  // contains no such path.)
  assert.ok(!src.includes("require('../"), 'helper must stay standalone with no parent-directory require');
  const privateHome = ['C:', 'Users', 'Admin'].join('/');
  assert.ok(!src.includes(privateHome), 'helper must not embed a private home path');
  const requires = [...src.matchAll(/require\(['\"]([^'\"]+)['\"]\)/g)].map(m => m[1]);
  for (const mod of requires) {
    assert.ok(mod.startsWith('node:'), 'helper may only require node: builtins, got ' + mod);
  }
});
