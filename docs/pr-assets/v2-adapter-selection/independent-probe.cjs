const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = '/home/hermes/projects/orch8-adapter-selection';
const req = createRequire(root + '/package.json');
const ts = req('typescript');
const source = fs.readFileSync(root + '/packages/daemon/src/adapter/registry.ts', 'utf8');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject });
const resolve = exportsObject.resolveAdapter;
const claude = { type: 'claude_local' }, codex = { type: 'codex_local' };
let accesses = [];
const map = new Proxy({ claude_local: claude, codex_local: codex }, {
  get(target, key) { accesses.push(String(key)); return target[key]; },
  has() { throw new Error('Membership lookup is forbidden'); }
});
const invalid = [...new Set(['', ' ', '\n', 'unknown', 'custom', 'CLAUDE_LOCAL', 'claude_local ', 'codex_local\0', '__proto__', ...Object.getOwnPropertyNames(Object.prototype)])];
for (const value of invalid) {
  accesses = [];
  assert.throws(() => resolve(value, map), /Unsupported adapter type/);
  assert.deepEqual(accesses, [], `Registry accessed for ${JSON.stringify(value)}`);
}
for (const [value, expected, key] of [[null, claude, 'claude_local'], [undefined, claude, 'claude_local'], ['claude_local', claude, 'claude_local'], ['codex_local', codex, 'codex_local']]) {
  accesses = [];
  assert.equal(resolve(value, map), expected);
  assert.deepEqual(accesses, [key]);
}
console.log(JSON.stringify({ success: true, rejectedWithoutRegistryAccess: invalid.length, exactAndLegacyChecks: 4, invalid }, null, 2));
