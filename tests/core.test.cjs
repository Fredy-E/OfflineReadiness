'use strict';
// OfflineReadiness — core unit suite (node:test, zero dependencies).
// Drives the same core.js the browser runs. Fixtures are fictional.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const OR = require('../core.js');

const ROOT = path.resolve(__dirname, '..');
const fixture = (...parts) => fs.readFileSync(path.join(ROOT, 'fixtures', ...parts), 'utf8');
const sample = require('../fixtures/fictional-sample.js');
const classifications = require('../data/classifications.js');

function expectOk(result, label) {
  assert.equal(result && result.ok, true, (label || 'result') + ' should be ok, got ' + JSON.stringify(result && result.error));
  return result.value;
}
function expectError(result, code, label) {
  assert.equal(result && result.ok, false, (label || 'result') + ' should fail');
  assert.equal(result.error.code, code, (label || 'result') + ' expected ' + code + ', got ' + JSON.stringify(result.error));
  return result.error;
}
const countIssues = (state, code) => state.issues.filter(issue => issue.code === code).length;
function noCanary(text, where) {
  assert.ok(!String(text).includes('CANARY'), 'canary leaked into ' + where);
}
function importText(text, size) {
  return expectOk(OR.importFiles([{ text, size }]), 'importFiles');
}
function stateFromFixtureText(text, nowIso) {
  return expectOk(OR.buildState(importText(text), classifications, { nowIso: nowIso || '2026-10-15T00:00:00Z' }), 'buildState');
}
function walk(value, visit, trail) {
  visit(value, trail || '');
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, visit, (trail || '') + '[' + index + ']'));
  else if (value && typeof value === 'object') for (const key of Object.keys(value)) walk(value[key], visit, (trail || '') + '.' + key);
}

// ---------------------------------------------------------------------------
// Module surface
// ---------------------------------------------------------------------------

test('module exposes the documented surface', () => {
  assert.equal(OR.VERSION, '0.1.0');
  assert.equal(OR.SCHEMAS.snapshot, 'offline-readiness.snapshot/1');
  assert.equal(OR.SCHEMAS.classifications, 'offline-readiness.classifications/1');
  assert.equal(OR.SCHEMAS.report, 'offline-readiness.report/1');
  assert.equal(OR.LIMITS.maxBytesPerFile, 8388608);
  assert.equal(OR.LIMITS.maxFilesPerImport, 8);
  assert.equal(OR.LIMITS.maxEntries, 5000);
  assert.equal(OR.LIMITS.maxEntities, 20000);
  assert.equal(OR.LIMITS.maxDevices, 10000);
  assert.equal(OR.LIMITS.maxRefsPerDevice, 32);
  assert.equal(OR.LIMITS.maxStringLength, 200);
  assert.equal(OR.LIMITS.maxIssues, 500);
  assert.equal(OR.LIMITS.staleAfterDays, 180);
  for (const fn of ['detectJsonKind', 'parseSnapshot', 'parseConfigEntriesExport', 'parseEntityRegistryExport', 'parseDeviceRegistryExport', 'importFiles', 'buildState', 'buildReport', 'classifyDomain']) {
    assert.equal(typeof OR[fn], 'function', 'missing function ' + fn);
  }
});

test('classification wrapper mirrors classifications.json exactly', () => {
  const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'classifications.json'), 'utf8'));
  assert.equal(JSON.stringify(json), JSON.stringify(classifications));
  assert.equal(json.schema, 'offline-readiness.classifications/1');
  assert.equal(Object.keys(json.entries).length, 34);
  assert.equal(json.entries.hue.iotClass, 'local_push');
  assert.equal(json.entries.mqtt.override.category, 'unknown');
  assert.equal(json.entries.input_boolean.iotClass, null);
  assert.equal(json.entries.group.iotClass, 'calculated');
  assert.equal(json.source.ref, '2026.10.1');
  assert.equal(json.source.retrieved, '2026-10-11');
});

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

test('detects each supported input kind', () => {
  assert.equal(expectOk(OR.detectJsonKind(fixture('snapshots', 'racing-a.json'))).kind, 'snapshot');
  assert.equal(expectOk(OR.detectJsonKind(fixture('registries', 'core.config_entries.json'))).kind, 'config_entries');
  assert.equal(expectOk(OR.detectJsonKind(fixture('registries', 'core.entity_registry.json'))).kind, 'entity_registry');
  assert.equal(expectOk(OR.detectJsonKind(fixture('registries', 'core.device_registry.json'))).kind, 'device_registry');
});

test('rejects binary, YAML, malformed, backup and automation inputs explicitly', () => {
  const archive = fs.readFileSync(path.join(ROOT, 'fixtures', 'snapshots', 'unsupported-archive.bin'));
  expectError(OR.detectJsonKind(archive.toString('latin1')), 'UNSUPPORTED_INPUT', 'archive magic');
  const yaml = fixture('snapshots', 'unsupported-yaml.txt');
  expectError(OR.detectJsonKind(yaml), 'UNSUPPORTED_INPUT', 'yaml text');
  const malformed = expectError(OR.detectJsonKind(fixture('snapshots', 'invalid-syntax.json')), 'NOT_JSON', 'malformed json');
  expectError(OR.detectJsonKind(fixture('snapshots', 'unsupported-backup-lookalike.json')), 'UNSUPPORTED_INPUT', 'backup lookalike');
  expectError(OR.detectJsonKind(fixture('snapshots', 'unsupported-automation.json')), 'UNSUPPORTED_INPUT', 'automation lookalike');
  expectError(OR.detectJsonKind('[1,2,3]'), 'UNSUPPORTED_INPUT', 'json array');
  expectError(OR.detectJsonKind('{"hello":"world"}'), 'UNSUPPORTED_INPUT', 'unknown json object');
  const nul = '{"schema":"offline-readiness.snapshot/1"\u0000}';
  expectError(OR.detectJsonKind(nul), 'NOT_TEXT', 'nul bytes');
  noCanary(JSON.stringify(malformed), 'NOT_JSON error');
});

test('rejects unknown snapshot schema versions explicitly', () => {
  const bad = JSON.stringify({ schema: 'offline-readiness.snapshot/2', haVersion: 'x', entries: [], entities: [], devices: [] });
  expectError(OR.detectJsonKind(bad), 'UNSUPPORTED_SCHEMA');
  expectError(OR.parseSnapshot(bad), 'UNSUPPORTED_SCHEMA');
});

test('error objects never echo imported content', () => {
  const cases = [
    OR.detectJsonKind(fixture('snapshots', 'invalid-syntax.json')),
    OR.detectJsonKind(fixture('snapshots', 'unsupported-backup-lookalike.json')),
    OR.detectJsonKind(fixture('snapshots', 'unsupported-archive.bin').replace(/[^\x20-\x7e\n]/g, '')),
    OR.parseSnapshot('{"schema":"offline-readiness.snapshot/1","haVersion":"CANARY_ECHO_PROBE"}'),
    OR.importFiles([{ text: fixture('snapshots', 'invalid-syntax.json') }]),
    OR.importFiles([{ text: fixture('snapshots', 'racing-a.json'), size: OR.LIMITS.maxBytesPerFile + 1 }])
  ];
  for (const result of cases) {
    assert.equal(result.ok, false);
    noCanary(JSON.stringify(result.error), 'error object');
    assert.equal(typeof result.error.code, 'string');
    assert.equal(typeof result.error.message, 'string');
  }
});

// ---------------------------------------------------------------------------
// Normalized snapshot parsing
// ---------------------------------------------------------------------------

test('parses the fictional sample with exact counts', () => {
  const parsed = expectOk(OR.parseSnapshot(JSON.stringify(sample.snapshot)));
  assert.equal(parsed.kind, 'snapshot');
  assert.equal(parsed.haVersion, '2026.9.2-fictional');
  assert.equal(parsed.entries.length, 10);
  assert.equal(parsed.entities.length, 14);
  assert.equal(parsed.devices.length, 6);
});

test('discards unknown fields with counts and never keeps canaries in state', () => {
  const parsed = expectOk(OR.parseSnapshot(fixture('snapshots', 'canary-snapshot.json')));
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entities.length, 2);
  assert.equal(parsed.devices.length, 1);
  noCanary(JSON.stringify(parsed), 'parsed snapshot');
  assert.equal(parsed.stats.discarded.total, 10);
  assert.equal(parsed.stats.discarded.credentials, 2);
  assert.equal(parsed.stats.discarded.uniqueIds, 2);
  assert.equal(parsed.stats.discarded.networkIdentifiers, 3);
  assert.equal(parsed.stats.discarded.other, 3);
});

test('truncates display strings at the cap and counts truncations', () => {
  const parsed = expectOk(OR.parseSnapshot(fixture('snapshots', 'long-strings-snapshot.json')));
  assert.equal(parsed.entries[0].title.length, 200);
  assert.equal(parsed.entries[1].title.length, 200);
  assert.equal(parsed.entities[0].originalName.length, 200);
  assert.equal(parsed.entities[0].entityId.length, 126);
  assert.equal(parsed.devices[0].model.length, 200);
  assert.equal(parsed.devices[0].manufacturer.length, 150);
  assert.equal(parsed.stats.truncated.displayFields, 4);
});

test('rejects malformed records visibly without dropping the file', () => {
  const text = JSON.stringify({
    schema: 'offline-readiness.snapshot/1',
    haVersion: '2026.9.2-fictional',
    entries: [{ entryId: '01JTEST000000000000000001', domain: 'bad domain!', title: 'x' }, { entryId: '01JTEST000000000000000002', domain: 'hue' }],
    entities: [{ entityId: '<bad>', platform: 'hue' }, { entityId: 'light.ok', platform: 'hue' }],
    devices: [{ deviceId: 'dev-ok' }]
  });
  const parsed = expectOk(OR.parseSnapshot(text));
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entities.length, 1);
  assert.equal(parsed.devices.length, 1);
  assert.equal(parsed.stats.rejectedRecords, 2);
  assert.equal(parsed.rejected.length, 2);
  assert.equal(parsed.rejected[0].recordKind, 'entry');
  assert.equal(parsed.rejected[0].reason, 'invalid_field');
  assert.equal(parsed.rejected[1].recordKind, 'entity');
  assert.equal(parsed.rejected[1].reason, 'invalid_identifier');
});

test('missing required fields reject the record, missing arrays reject the file', () => {
  const missingDomain = JSON.stringify({
    schema: 'offline-readiness.snapshot/1', haVersion: 'x', entries: [{ entryId: '01JTEST000000000000000001' }], entities: [], devices: []
  });
  const parsed = expectOk(OR.parseSnapshot(missingDomain));
  assert.equal(parsed.entries.length, 0);
  assert.equal(parsed.rejected[0].reason, 'missing_required');
  const missingArray = JSON.stringify({ schema: 'offline-readiness.snapshot/1', haVersion: 'x', entries: [] });
  expectError(OR.parseSnapshot(missingArray), 'INVALID_FIELD');
  const badHa = JSON.stringify({ schema: 'offline-readiness.snapshot/1', haVersion: 'x'.repeat(41), entries: [], entities: [], devices: [] });
  expectError(OR.parseSnapshot(badHa), 'INVALID_FIELD');
  const empty = JSON.stringify({ schema: 'offline-readiness.snapshot/1', haVersion: 'x', entries: [], entities: [], devices: [] });
  expectError(OR.parseSnapshot(empty), 'EMPTY_INPUT');
});

test('prototype-named values and keys never pollute or crash', () => {
  const state = stateFromFixtureText(fixture('snapshots', 'hostile-snapshot.json'));
  assert.ok(!('polluted' in {}), 'Object.prototype polluted');
  assert.equal(Object.prototype.polluted, undefined);
  const protoEntry = state.entries.find(entry => entry.entryId === '__proto__');
  assert.ok(protoEntry, 'entryId __proto__ must survive as a value');
  const constructorEntry = state.entries.find(entry => entry.domain === 'constructor');
  assert.equal(constructorEntry.category, 'custom');
  const protoDomain = state.entries.find(entry => entry.domain === '__proto__');
  assert.equal(protoDomain.category, 'custom');
  assert.ok(state.entities.some(entity => entity.entityId === 'light.__proto__'));
  assert.ok(state.devices.some(device => device.deviceId === '__proto__'));
});

// ---------------------------------------------------------------------------
// Native registry adapters
// ---------------------------------------------------------------------------

test('config entries adapter normalizes the real storage shape and discards credentials', () => {
  const parsed = expectOk(OR.parseConfigEntriesExport(fixture('registries', 'core.config_entries.json')));
  assert.equal(parsed.kind, 'config_entries');
  assert.equal(parsed.entries.length, 5);
  const hue = parsed.entries[0];
  assert.equal(hue.entryId, '01JREG00000000000000000001');
  assert.equal(hue.domain, 'hue');
  assert.equal(hue.title, 'Fictional Hue bridge (registry)');
  assert.equal(hue.source, 'user');
  assert.equal(hue.disabledBy, null);
  assert.equal(hue.prefDisablePolling, false);
  const custom = parsed.entries[4];
  assert.equal(custom.disabledBy, 'user');
  assert.equal(custom.prefDisableNewEntities, true);
  noCanary(JSON.stringify(parsed), 'config entries parse');
  assert.equal(parsed.stats.discarded.total, 35);
  assert.equal(parsed.stats.discarded.credentials, 15);
  assert.equal(parsed.stats.discarded.uniqueIds, 5);
  assert.equal(parsed.stats.discarded.other, 15);
});

test('entity registry adapter normalizes the real storage shape', () => {
  const parsed = expectOk(OR.parseEntityRegistryExport(fixture('registries', 'core.entity_registry.json')));
  assert.equal(parsed.kind, 'entity_registry');
  assert.equal(parsed.entities.length, 7);
  const first = parsed.entities[0];
  assert.equal(first.entityId, 'light.fictional_hall');
  assert.equal(first.platform, 'hue');
  assert.equal(first.configEntryId, '01JREG00000000000000000001');
  assert.equal(first.deviceId, 'fictregdev0001');
  assert.equal(first.originalName, 'Fictional hall lamp');
  assert.equal(first.name, null);
  assert.equal(parsed.entities[6].name, 'Fictional unlinked sensor');
  assert.equal(parsed.entities[6].configEntryId, null);
  noCanary(JSON.stringify(parsed), 'entity registry parse');
  assert.equal(parsed.stats.discarded.uniqueIds, 14);
});

test('device registry adapter handles new single entry id, legacy arrays and epoch timestamps', () => {
  const parsed = expectOk(OR.parseDeviceRegistryExport(fixture('registries', 'core.device_registry.json')));
  assert.equal(parsed.kind, 'device_registry');
  assert.equal(parsed.devices.length, 7);
  assert.deepEqual(parsed.devices[0].configEntries, ['01JREG00000000000000000001']);
  assert.equal(parsed.devices[0].manufacturer, 'Signify (fictional)');
  assert.equal(parsed.devices[0].entryType, null);
  assert.match(parsed.devices[0].createdAt, /^\d{4}-\d{2}-\d{2}T/, 'epoch float must become an ISO string');
  assert.deepEqual(parsed.devices[3].configEntries, ['01JREG00000000000000000004'], 'legacy config_entries array');
  assert.equal(parsed.devices[3].nameByUser, 'Fictional legacy name');
  assert.deepEqual(parsed.devices[6].configEntries, []);
  noCanary(JSON.stringify(parsed), 'device registry parse');
  assert.equal(parsed.stats.discarded.networkIdentifiers, 28);
});

test('adapters reject a wrong registry kind and accept a keyless shaped file', () => {
  expectError(OR.parseEntityRegistryExport(fixture('registries', 'core.config_entries.json')), 'UNSUPPORTED_SCHEMA');
  expectError(OR.parseConfigEntriesExport(fixture('registries', 'core.device_registry.json')), 'UNSUPPORTED_SCHEMA');
  const keyless = JSON.parse(fixture('registries', 'core.entity_registry.json'));
  delete keyless.key;
  const parsed = expectOk(OR.parseEntityRegistryExport(JSON.stringify(keyless)));
  assert.equal(parsed.entities.length, 7);
});

// ---------------------------------------------------------------------------
// importFiles (joining)
// ---------------------------------------------------------------------------

test('joins the three registry exports and accepts a single snapshot', () => {
  // A lone registry file cannot build a report: the bundle must be complete.
  expectError(OR.importFiles([{ text: fixture('registries', 'core.config_entries.json') }]), 'MISSING_REGISTRY', 'single registry file');
  const joined = expectOk(OR.importFiles([
    { text: fixture('registries', 'core.config_entries.json') },
    { text: fixture('registries', 'core.entity_registry.json') },
    { text: fixture('registries', 'core.device_registry.json') }
  ]), 'trio join');
  assert.equal(joined.kind, 'registry_bundle');
  assert.deepEqual(joined.parts.map(part => part.kind).sort(), ['config_entries', 'device_registry', 'entity_registry']);
  assert.equal(joined.snapshot.entries.length, 5);
  assert.equal(joined.snapshot.entities.length, 7);
  assert.equal(joined.snapshot.devices.length, 7);
  assert.equal(joined.snapshot.haVersion, null);
  const single = importText(fixture('snapshots', 'racing-a.json'));
  assert.equal(single.kind, 'snapshot');
});

test('device registry is optional when no entity references a device', () => {
  const entityRegistry = JSON.parse(fixture('registries', 'core.entity_registry.json'));
  for (const entity of entityRegistry.data.entities) entity.device_id = null;
  const joined = expectOk(OR.importFiles([
    { text: fixture('registries', 'core.config_entries.json') },
    { text: JSON.stringify(entityRegistry) }
  ]), 'entity-only join');
  assert.equal(joined.kind, 'registry_bundle');
  assert.equal(joined.snapshot.devices.length, 0);
  assert.equal(joined.snapshot.entities.length, 7);
});

test('join errors: missing registry, duplicate kind, mixed inputs, too many files, oversize', () => {
  expectError(OR.importFiles([
    { text: fixture('registries', 'core.config_entries.json') },
    { text: fixture('registries', 'core.entity_registry.json') }
  ]), 'MISSING_REGISTRY', 'device refs present but device registry missing');
  expectError(OR.importFiles([
    { text: fixture('registries', 'core.config_entries.json') },
    { text: fixture('registries', 'core.config_entries.json') },
    { text: fixture('registries', 'core.entity_registry.json') }
  ]), 'DUPLICATE_KIND');
  expectError(OR.importFiles([
    { text: fixture('snapshots', 'racing-a.json') },
    { text: fixture('registries', 'core.config_entries.json') }
  ]), 'UNSUPPORTED_INPUT', 'mixed snapshot and registry');
  const many = [];
  for (let index = 0; index < 9; index += 1) many.push({ text: fixture('registries', 'core.config_entries.json') });
  expectError(OR.importFiles(many), 'TOO_MANY_FILES');
  expectError(OR.importFiles([{ text: fixture('snapshots', 'racing-a.json'), size: OR.LIMITS.maxBytesPerFile + 1 }]), 'LIMIT_EXCEEDED');
  expectError(OR.importFiles([]), 'EMPTY_INPUT');
});

test('accepts valid empty registry components; only a fully empty bundle is EMPTY_INPUT', () => {
  // Mirrors the frozen parent gate (parent-qa/OfflineReadiness/registry-source-regression.test.cjs).
  const id = '01JFICTION000000000000000001';
  const record = { entry_id: id, domain: 'hue', title: 'Fiction Entry', source: 'user' };
  const registry = (key, field, rows) => ({ text: JSON.stringify({ key, version: key === 'core.device_registry' ? 3 : 1, minor_version: 0, data: { [field]: rows } }) });
  const entries = rows => registry('core.config_entries', 'entries', rows);
  const entities = rows => registry('core.entity_registry', 'entities', rows);
  const devices = rows => registry('core.device_registry', 'devices', rows);
  const permutations = [
    ['nonempty entries plus two valid empty registries', [entries([record]), entities([]), devices([])]],
    ['entity metadata plus valid empty entries/devices', [entries([]), entities([{ entity_id: 'light.fiction', platform: 'hue' }]), devices([])]],
    ['device metadata plus valid empty entries/entities', [entries([]), entities([]), devices([{ id: 'fiction-device', config_entries: [], name: 'Fiction Device' }])]]
  ];
  for (const [label, files] of permutations) {
    const joined = expectOk(OR.importFiles(files), label);
    assert.equal(joined.kind, 'registry_bundle', label);
  }
  const first = expectOk(OR.importFiles(permutations[0][1]), 'entries-only metadata');
  assert.equal(first.snapshot.entries.length, 1);
  assert.equal(first.snapshot.entities.length, 0);
  assert.equal(first.snapshot.devices.length, 0);
  const second = expectOk(OR.importFiles(permutations[1][1]), 'entities-only metadata');
  assert.equal(second.snapshot.entities.length, 1);
  const third = expectOk(OR.importFiles(permutations[2][1]), 'devices-only metadata');
  assert.equal(third.snapshot.devices.length, 1);
  const empty = expectError(OR.importFiles([entries([]), entities([]), devices([])]), 'EMPTY_INPUT', 'fully empty bundle');
  assert.match(empty.message, /no records/i);
  assert.equal(empty.message.includes('usable'), false, 'aggregate emptiness message must not imply per-file corruption');
});

test('zero-record component exports parse standalone as valid components', () => {
  const emptyConfig = expectOk(OR.parseConfigEntriesExport(fixture('registries', 'empty-core.config_entries.json')), 'empty config entries');
  assert.equal(emptyConfig.entries.length, 0);
  assert.equal(emptyConfig.kind, 'config_entries');
  const emptyEntities = expectOk(OR.parseEntityRegistryExport(fixture('registries', 'empty-core.entity_registry.json')), 'empty entity registry');
  assert.equal(emptyEntities.entities.length, 0);
  const emptyDevices = expectOk(OR.parseDeviceRegistryExport(fixture('registries', 'empty-core.device_registry.json')), 'empty device registry');
  assert.equal(emptyDevices.devices.length, 0);
});

test('a component whose only records are malformed still imports with visible rejections', () => {
  const malformed = {
    text: JSON.stringify({
      key: 'core.config_entries', version: 1, minor_version: 5,
      data: { entries: [{ entry_id: 'bad id!', domain: 'hue', title: 'CANARY_MALFORMED_0001', data: { token: 'CANARY_MALFORMED_0002' } }] }
    })
  };
  const joined = expectOk(OR.importFiles([
    malformed,
    { text: fixture('registries', 'empty-core.entity_registry.json') },
    { text: fixture('registries', 'empty-core.device_registry.json') }
  ]), 'malformed-only bundle');
  assert.equal(joined.rejected.length, 1);
  assert.equal(joined.rejected[0].recordKind, 'entry');
  assert.equal(joined.rejected[0].reason, 'missing_required');
  noCanary(JSON.stringify(joined), 'malformed-only import');
  const state = expectOk(OR.buildState(joined, classifications, { nowIso: '2026-10-15T00:00:00Z' }), 'malformed-only state');
  assert.equal(countIssues(state, 'RECORD_REJECTED'), 1);
  assert.equal(state.stats.rejectedRecords, 1);
  noCanary(JSON.stringify(state), 'malformed-only state');
});

test('fresh-home and empty registry fixtures join through importFiles', () => {
  const files = [
    { text: fixture('registries', 'fresh-core.config_entries.json') },
    { text: fixture('registries', 'empty-core.entity_registry.json') },
    { text: fixture('registries', 'empty-core.device_registry.json') }
  ];
  const joined = expectOk(OR.importFiles(files), 'fresh-home bundle');
  assert.equal(joined.kind, 'registry_bundle');
  assert.equal(joined.snapshot.entries.length, 1);
  assert.equal(joined.snapshot.entities.length, 0);
  assert.equal(joined.snapshot.devices.length, 0);
  assert.equal(joined.snapshot.entries[0].source, 'user');
  noCanary(JSON.stringify(joined), 'fresh-home import');
  const state = expectOk(OR.buildState(joined, classifications, { nowIso: '2026-10-15T00:00:00Z' }));
  assert.equal(countIssues(state, 'DANGLING_ENTRY'), 1);
  const allEmpty = expectError(OR.importFiles([
    { text: fixture('registries', 'empty-core.config_entries.json') },
    { text: fixture('registries', 'empty-core.entity_registry.json') },
    { text: fixture('registries', 'empty-core.device_registry.json') }
  ]), 'EMPTY_INPUT', 'all-empty fixtures');
  assert.match(allEmpty.message, /no records/i);
});

test('collection caps fail closed with counts, never content', () => {
  const entries = [];
  for (let index = 0; index < 5001; index += 1) entries.push({ entryId: '01JCAP' + String(index).padStart(17, '0'), domain: 'hue' });
  const text = JSON.stringify({ schema: 'offline-readiness.snapshot/1', haVersion: 'x', entries, entities: [], devices: [] });
  const error = expectError(OR.parseSnapshot(text), 'LIMIT_EXCEEDED');
  assert.match(error.message, /5001/);
  assert.match(error.message, /5000/);
  const entities = [];
  for (let index = 0; index < 20001; index += 1) entities.push({ entityId: 'sensor.cap_' + index, platform: 'hue' });
  const text2 = JSON.stringify({ schema: 'offline-readiness.snapshot/1', haVersion: 'x', entries: [], entities, devices: [] });
  expectError(OR.parseSnapshot(text2), 'LIMIT_EXCEEDED');
});

// ---------------------------------------------------------------------------
// buildState: classification, evidence, graph, issues
// ---------------------------------------------------------------------------

test('classifies domains from bundled evidence with exact categories', () => {
  const state = stateFromFixtureText(JSON.stringify(sample.snapshot));
  const byDomain = Object.fromEntries(state.entries.map(entry => [entry.domain, entry]));
  assert.equal(byDomain.hue.category, 'local');
  assert.equal(byDomain.hue.iotClass, 'local_push');
  assert.equal(byDomain.tuya.category, 'cloud');
  assert.equal(byDomain.mqtt.category, 'unknown');
  assert.equal(byDomain.mqtt.reason, 'configured_broker_locality_unverified');
  assert.equal(byDomain.met.category, 'cloud');
  assert.equal(byDomain.my_custom_thing.category, 'custom');
  assert.equal(byDomain.my_custom_thing.reason, 'not_in_bundle');
  assert.deepEqual(state.byCategory, { local: 5, cloud: 3, unknown: 1, custom: 1 });
});

test('maps calculated, missing, dynamic and injected classes conservatively', () => {
  const text = JSON.stringify({
    schema: 'offline-readiness.snapshot/1',
    haVersion: 'x',
    entries: [
      { entryId: '01JMAP000000000000000001', domain: 'group', title: 'g' },
      { entryId: '01JMAP000000000000000002', domain: 'sun', title: 's' },
      { entryId: '01JMAP000000000000000003', domain: 'template', title: 't' },
      { entryId: '01JMAP000000000000000004', domain: 'input_boolean', title: 'i' },
      { entryId: '01JMAP000000000000000005', domain: 'hue', title: 'h' }
    ],
    entities: [],
    devices: []
  });
  const state = stateFromFixtureText(text);
  const byDomain = Object.fromEntries(state.entries.map(entry => [entry.domain, entry]));
  assert.equal(byDomain.group.category, 'unknown');
  assert.equal(byDomain.group.reason, 'dynamic_group');
  assert.equal(byDomain.sun.category, 'unknown');
  assert.equal(byDomain.sun.reason, 'calculated_no_direct_communication');
  assert.equal(byDomain.template.category, 'unknown');
  assert.equal(byDomain.template.reason, 'dynamic_template');
  assert.equal(byDomain.input_boolean.category, 'unknown');
  assert.equal(byDomain.input_boolean.reason, 'missing_iot_class');
  assert.equal(byDomain.hue.category, 'local');

  const injected = JSON.parse(JSON.stringify(classifications));
  injected.entries['fictional_assumed'] = { name: 'Assumed', integrationType: null, iotClass: 'assumed_state', sourceUrl: 'https://example.invalid/m', retrieved: '2026-10-11', scope: 'x', notes: 'y' };
  injected.entries['fictional_weird'] = { name: 'Weird', integrationType: null, iotClass: 'quantum_polling', sourceUrl: 'https://example.invalid/m', retrieved: '2026-10-11', scope: 'x', notes: 'y' };
  const assumed = expectOk(OR.classifyDomain('fictional_assumed', injected, { nowIso: '2026-10-15T00:00:00Z' }));
  assert.equal(assumed.category, 'unknown');
  assert.equal(assumed.reason, 'assumed_state');
  const weird = expectOk(OR.classifyDomain('fictional_weird', injected, { nowIso: '2026-10-15T00:00:00Z' }));
  assert.equal(weird.category, 'unknown');
  assert.equal(weird.reason, 'unrecognized_iot_class');
});

test('dynamic platforms mark entities unknown without evaluating templates', () => {
  const state = stateFromFixtureText(JSON.stringify(sample.snapshot));
  const templateEntity = state.entities.find(entity => entity.entityId === 'light.computed_lamp');
  assert.equal(templateEntity.dynamic, true);
  assert.equal(templateEntity.category, 'unknown');
  assert.equal(templateEntity.reason, 'dynamic_template');
  const groupEntity = state.entities.find(entity => entity.entityId === 'sensor.grouped_temperature');
  assert.equal(groupEntity.dynamic, true);
  assert.equal(groupEntity.reason, 'dynamic_group');
  const hueEntity = state.entities.find(entity => entity.entityId === 'light.hall_lamp');
  assert.equal(hueEntity.category, 'local');
  assert.equal(hueEntity.dynamic, false);
});

test('staleness is computed against the provided clock', () => {
  const fresh = expectOk(OR.classifyDomain('hue', classifications, { nowIso: '2026-10-15T00:00:00Z' }));
  assert.equal(fresh.stale, false);
  assert.equal(fresh.staleDays, 4);
  const old = expectOk(OR.classifyDomain('hue', classifications, { nowIso: '2027-05-01T00:00:00Z' }));
  assert.equal(old.stale, true);
  assert.ok(old.staleDays > 180);
  const injected = JSON.parse(JSON.stringify(classifications));
  injected.entries.hue.retrieved = '2020-01-01';
  const staleState = stateFromFixtureText(JSON.stringify(sample.snapshot), '2026-10-15T00:00:00Z');
  const injectedState = expectOk(OR.buildState(importText(JSON.stringify(sample.snapshot)), injected, { nowIso: '2026-10-15T00:00:00Z' }));
  assert.ok(injectedState.entries.find(entry => entry.domain === 'hue').stale);
  assert.equal(staleState.entries.find(entry => entry.domain === 'hue').stale, false);
  assert.equal(countIssues(injectedState, 'STALE_EVIDENCE'), 1);
});

test('evidence provenance travels with each classification', () => {
  const state = stateFromFixtureText(JSON.stringify(sample.snapshot));
  const hue = state.evidence.domainsUsed.hue;
  assert.equal(hue.sourceUrl, 'https://raw.githubusercontent.com/home-assistant/core/2026.10.1/homeassistant/components/hue/manifest.json');
  assert.equal(hue.retrieved, '2026-10-11');
  assert.match(hue.scope, /manifest/);
  assert.equal(hue.stale, false);
  const mqtt = state.evidence.domainsUsed.mqtt;
  assert.equal(mqtt.iotClass, 'local_push');
  assert.equal(mqtt.category, 'unknown');
  assert.deepEqual(mqtt.qualifiers, ['broker endpoint is user-configured']);
  assert.equal(state.evidence.domainsUsed.my_custom_thing, undefined);
  assert.equal(state.evidence.domainsUsed.input_boolean, undefined);
});

test('graph issues for the duplicate-refs fixture are exact', () => {
  const state = stateFromFixtureText(fixture('snapshots', 'duplicate-refs.json'));
  assert.equal(state.entries.length, 3);
  assert.equal(state.entities.length, 5);
  assert.equal(state.devices.length, 3);
  assert.equal(countIssues(state, 'DUPLICATE_ENTRY_ID'), 1);
  assert.equal(countIssues(state, 'DUPLICATE_ENTITY_ID'), 1);
  assert.equal(countIssues(state, 'DUPLICATE_DEVICE_ID'), 1);
  assert.equal(countIssues(state, 'PLATFORM_DOMAIN_MISMATCH'), 1);
  assert.equal(countIssues(state, 'ORPHAN_ENTITY_ENTRY'), 1);
  assert.equal(countIssues(state, 'ORPHAN_ENTITY_DEVICE'), 1);
  assert.equal(countIssues(state, 'UNLINKED_ENTITY'), 1);
  assert.equal(countIssues(state, 'ORPHAN_DEVICE_ENTRY'), 1);
  assert.equal(countIssues(state, 'ORPHAN_DEVICE_VIA'), 1);
  assert.equal(countIssues(state, 'DANGLING_ENTRY'), 2);
  assert.equal(countIssues(state, 'UNKNOWN_DOMAIN'), 0);
  assert.equal(state.byCategory.local, 2);
  assert.equal(state.byCategory.unknown, 1);
  assert.equal(state.unlinkedEntityRefs.length, 1);
});

test('graph issues for the hostile fixture are exact and refs are capped', () => {
  const state = stateFromFixtureText(fixture('snapshots', 'hostile-snapshot.json'));
  assert.equal(countIssues(state, 'RECORD_REJECTED'), 3);
  assert.equal(countIssues(state, 'DUPLICATE_ENTITY_ID'), 1);
  assert.equal(countIssues(state, 'ORPHAN_ENTITY_ENTRY'), 1);
  assert.equal(countIssues(state, 'ORPHAN_ENTITY_DEVICE'), 1);
  // The via reference points at the device whose id is literally "__proto__",
  // which exists — so it resolves (D02) and is NOT an orphan.
  assert.equal(countIssues(state, 'ORPHAN_DEVICE_VIA'), 0);
  const child = state.devices.find(device => device.deviceId === '01JHOSTDEV00000000000001');
  assert.equal(child.viaRef, 'D02');
  assert.equal(countIssues(state, 'REFS_TRUNCATED'), 1);
  assert.equal(countIssues(state, 'DANGLING_ENTRY'), 3);
  assert.equal(countIssues(state, 'UNKNOWN_DOMAIN'), 2);
  assert.equal(countIssues(state, 'PLATFORM_DOMAIN_MISMATCH'), 0);
  const capped = state.devices.find(device => device.ref === 'D03');
  assert.equal(capped.configEntries.length, 32);
});

test('sample graph: orphan, unlinked, dangling, dynamic and unattributed are surfaced', () => {
  const state = stateFromFixtureText(JSON.stringify(sample.snapshot));
  assert.equal(countIssues(state, 'ORPHAN_ENTITY_ENTRY'), 1);
  assert.equal(countIssues(state, 'UNLINKED_ENTITY'), 3);
  assert.equal(countIssues(state, 'DYNAMIC_PLATFORM'), 2);
  assert.equal(countIssues(state, 'ORPHAN_DEVICE_VIA'), 1);
  assert.equal(countIssues(state, 'DANGLING_ENTRY'), 3);
  assert.equal(countIssues(state, 'UNKNOWN_DOMAIN'), 1);
  assert.equal(state.unlinkedEntityRefs.length, 3);
  assert.deepEqual(state.unlinkedEntityRefs, ['E11', 'E12', 'E14']);
  assert.deepEqual(state.unattributedDeviceRefs, ['D05']);
  const ghost = state.entities.find(entity => entity.entityId === 'sensor.ghost_probe');
  assert.equal(ghost.entryRef, null);
  const issue = state.issues.find(item => item.code === 'ORPHAN_ENTITY_ENTRY');
  assert.equal(issue.severity, 'warning');
  assert.equal(issue.subjectRef, ghost.ref);
  assert.equal(issue.subjectId, 'sensor.ghost_probe');
  assert.equal(issue.missingRef, '01JFICT00000000000000MISSING');
  const device = state.devices.find(item => item.ref === 'D01');
  assert.equal(device.categoryLabel, 'local');
  const unattributed = state.devices.find(item => item.ref === 'D05');
  assert.equal(unattributed.categoryLabel, 'unattributed');
});

test('state is deeply frozen and leaves the classifications input untouched', () => {
  const before = JSON.stringify(classifications);
  const state = stateFromFixtureText(JSON.stringify(sample.snapshot));
  assert.equal(JSON.stringify(classifications), before, 'classifications input must not be mutated');
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.entries));
  assert.ok(Object.isFrozen(state.entries[0]));
  assert.ok(Object.isFrozen(state.issues));
  assert.throws(() => { state.entries[0].domain = 'changed'; }, TypeError);
  assert.throws(() => { state.issues.push({}); }, TypeError);
});

test('issues are capped with a visible truncation marker', () => {
  const entities = [];
  for (let index = 0; index < 520; index += 1) {
    entities.push({ entityId: 'sensor.orphan_' + index, platform: 'hue', configEntryId: 'missing-' + index });
  }
  const text = JSON.stringify({ schema: 'offline-readiness.snapshot/1', haVersion: 'x', entries: [], entities, devices: [] });
  const state = stateFromFixtureText(text);
  assert.equal(state.issues.length, 500);
  assert.equal(state.issues[state.issues.length - 1].code, 'ISSUES_TRUNCATED');
  assert.equal(state.stats.issuesTotal, 520);
  assert.equal(state.stats.issuesShown, 500);
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

test('JSON report is valid, redacted by default and carries provenance', () => {
  const state = stateFromFixtureText(JSON.stringify(sample.snapshot));
  const report = expectOk(OR.buildReport(state, { format: 'json', generatedAtIso: '2026-10-15T12:00:00Z' }));
  assert.equal(report.mime, 'application/json');
  assert.equal(report.filename, 'offline-readiness-report.json');
  const parsed = JSON.parse(report.text);
  assert.equal(parsed.schema, 'offline-readiness.report/1');
  assert.equal(parsed.generatedAt, '2026-10-15T12:00:00Z');
  assert.equal(parsed.redacted, true);
  assert.equal(parsed.redaction.identifiersOrdinalized, true);
  assert.equal(parsed.counts.entries, 10);
  assert.equal(parsed.counts.issues, 11);
  assert.deepEqual(parsed.counts.byCategory, { local: 5, cloud: 3, unknown: 1, custom: 1 });
  assert.ok(parsed.disclaimers.length >= 4);
  const hue = parsed.evidence.find(item => item.domain === 'hue');
  assert.match(hue.sourceUrl, /home-assistant\/core\/2026\.10\.1/);
  assert.equal(hue.retrieved, '2026-10-11');
  assert.equal(parsed.entries.length, 10);
  assert.equal(parsed.entries[0].ref, 'C01');
  assert.equal(parsed.entries[0].label, 'Entry C01');
  const text = report.text;
  assert.ok(!text.includes('Fictional Hue Bridge'), 'redacted report must not include titles');
  assert.ok(!text.includes('01JFICT'), 'redacted report must not include entry ids');
  assert.ok(!text.includes('light.hall_lamp'), 'redacted report must not include entity ids');
  assert.ok(!text.includes('fict-dev-001'), 'redacted report must not include device ids');
  walk(parsed, (value, trail) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      assert.ok(!('score' in value) && !('offlineScore' in value) && !('rating' in value), 'no aggregate score at ' + trail);
    }
  });
  assert.ok(parsed.issues.some(item => item.code === 'ORPHAN_ENTITY_ENTRY'));
  const orphanIssue = parsed.issues.find(item => item.code === 'ORPHAN_ENTITY_ENTRY');
  assert.ok(orphanIssue.detail.includes('E13'), 'redacted detail references the ordinal');
  assert.ok(!orphanIssue.detail.includes('sensor.ghost_probe'), 'redacted detail must not include raw ids');
});

test('JSON report with identifiers included is complete and still secret-free', () => {
  const state = stateFromFixtureText(fixture('snapshots', 'canary-snapshot.json'));
  const report = expectOk(OR.buildReport(state, { format: 'json', includeIdentifiers: true, generatedAtIso: '2026-10-15T12:00:00Z' }));
  assert.equal(report.filename, 'offline-readiness-report-with-identifiers.json');
  const parsed = JSON.parse(report.text);
  assert.equal(parsed.redacted, false);
  assert.equal(parsed.redaction.mode, 'identifiers-included');
  assert.ok(report.text.includes('light.canary_entity'));
  assert.ok(report.text.includes('Canary entity'));
  noCanary(report.text, 'opt-in JSON report');
  const sampleState = stateFromFixtureText(JSON.stringify(sample.snapshot));
  const sampleReport = expectOk(OR.buildReport(sampleState, { format: 'json', includeIdentifiers: true, generatedAtIso: '2026-10-15T12:00:00Z' }));
  assert.ok(sampleReport.text.includes('Fictional Hue Bridge (hallway)'));
  assert.ok(sampleReport.text.includes('01JFICT000000000000000001'));
});

test('report generation is deterministic for a fixed clock', () => {
  const state = stateFromFixtureText(JSON.stringify(sample.snapshot));
  const first = expectOk(OR.buildReport(state, { format: 'json', generatedAtIso: '2026-10-15T12:00:00Z' }));
  const second = expectOk(OR.buildReport(state, { format: 'json', generatedAtIso: '2026-10-15T12:00:00Z' }));
  assert.equal(first.text, second.text);
  const firstHtml = expectOk(OR.buildReport(state, { format: 'html', generatedAtIso: '2026-10-15T12:00:00Z' }));
  const secondHtml = expectOk(OR.buildReport(state, { format: 'html', generatedAtIso: '2026-10-15T12:00:00Z' }));
  assert.equal(firstHtml.text, secondHtml.text);
});

test('HTML report is self-contained, script-free and escaped', () => {
  const state = stateFromFixtureText(JSON.stringify(sample.snapshot));
  const report = expectOk(OR.buildReport(state, { format: 'html', generatedAtIso: '2026-10-15T12:00:00Z' }));
  assert.equal(report.mime, 'text/html');
  assert.equal(report.filename, 'offline-readiness-report.html');
  assert.ok(report.text.startsWith('<!DOCTYPE html>'));
  assert.ok(report.text.trimEnd().endsWith('</html>'));
  assert.ok(!/<script/i.test(report.text), 'no scripts allowed');
  assert.ok(!/<link[^>]+href/i.test(report.text), 'no external stylesheets');
  assert.ok(!/<img/i.test(report.text), 'no images');
  assert.ok(!report.text.includes('Fictional Hue Bridge'), 'redacted HTML must not include titles');
  assert.ok(report.text.includes('Entry C01'));
  assert.ok(report.text.includes('home-assistant/core/2026.10.1'));

  const hostileState = stateFromFixtureText(fixture('snapshots', 'hostile-snapshot.json'));
  const hostileReport = expectOk(OR.buildReport(hostileState, { format: 'html', includeIdentifiers: true, generatedAtIso: '2026-10-15T12:00:00Z' }));
  assert.ok(!/<img src=x/i.test(hostileReport.text), 'hostile name must be escaped');
  assert.ok(hostileReport.text.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!hostileReport.text.includes('<script>alert'), 'hostile title must be escaped');
  assert.ok(hostileReport.text.includes('&lt;script&gt;alert(&#39;hostile title&#39;)&lt;/script&gt;') || hostileReport.text.includes('&lt;script&gt;alert'));
});

test('invalid report arguments fail with structured errors', () => {
  const state = stateFromFixtureText(JSON.stringify(sample.snapshot));
  expectError(OR.buildReport(state, { format: 'pdf' }), 'INVALID_ARGUMENT');
  expectError(OR.buildState(null, classifications), 'INVALID_ARGUMENT');
  expectError(OR.buildState(importText(JSON.stringify(sample.snapshot)), null), 'INVALID_ARGUMENT');
  expectError(OR.classifyDomain('', classifications), 'INVALID_ARGUMENT');
  expectError(OR.classifyDomain('hue', { schema: 'wrong' }), 'UNSUPPORTED_SCHEMA');
});

test('default reports keep known source enums and omit arbitrary source labels', () => {
  // Mirrors the frozen parent gate (parent-qa/OfflineReadiness/registry-source-regression.test.cjs).
  const snapshot = source => JSON.stringify({
    schema: 'offline-readiness.snapshot/1',
    haVersion: '2026.10.1',
    entries: [{ entryId: '01JSRC000000000000000001', domain: 'hue', title: 'Fiction Entry', source }],
    entities: [],
    devices: []
  });
  const label = 'fiction_private_source_label';
  const knownState = expectOk(OR.buildState(importText(snapshot('user')), classifications, { nowIso: '2026-10-11T12:00:00Z' }));
  const knownJson = JSON.parse(expectOk(OR.buildReport(knownState, { format: 'json', generatedAtIso: '2026-10-11T12:00:00Z' })).text);
  assert.equal(knownJson.entries[0].source, 'user', 'known enum retained in default JSON');
  const knownHtml = expectOk(OR.buildReport(knownState, { format: 'html', generatedAtIso: '2026-10-11T12:00:00Z' }));
  assert.ok(knownHtml.text.includes('source: user'), 'known enum retained in default HTML');

  const labelState = expectOk(OR.buildState(importText(snapshot(label)), classifications, { nowIso: '2026-10-11T12:00:00Z' }));
  const labelJson = expectOk(OR.buildReport(labelState, { format: 'json', generatedAtIso: '2026-10-11T12:00:00Z' }));
  assert.equal(JSON.parse(labelJson.text).entries[0].source, null, 'non-enum source label omitted from default JSON');
  assert.equal(labelJson.text.includes(label), false, 'non-enum source label absent from default JSON text');
  const labelHtml = expectOk(OR.buildReport(labelState, { format: 'html', generatedAtIso: '2026-10-11T12:00:00Z' }));
  assert.equal(labelHtml.text.includes(label), false, 'non-enum source label absent from default HTML text');

  const optInJson = expectOk(OR.buildReport(labelState, { format: 'json', includeIdentifiers: true, generatedAtIso: '2026-10-11T12:00:00Z' }));
  assert.equal(JSON.parse(optInJson.text).entries[0].source, label, 'opt-in includes the selected source identifier');
  const optInHtml = expectOk(OR.buildReport(labelState, { format: 'html', includeIdentifiers: true, generatedAtIso: '2026-10-11T12:00:00Z' }));
  assert.ok(optInHtml.text.includes(label), 'opt-in HTML includes the selected source identifier');
  noCanary(labelJson.text, 'default source-label JSON');
  noCanary(labelHtml.text, 'default source-label HTML');
});

test('every retained HA config-entry source constant is kept in default reports', () => {
  // SOURCE_* constants of the retained core source at the bundled tag
  // (evidence/OfflineReadiness/retrieval/source/config_entries.py, home-assistant/core 2026.10.1).
  const enumSources = ['bluetooth', 'dhcp', 'discovery', 'esphome', 'hardware', 'hassio', 'homekit', 'import', 'integration_discovery', 'mqtt', 'ssdp', 'system', 'usb', 'user', 'zeroconf', 'ignore', 'reauth', 'reconfigure'];
  const entries = enumSources.map((source, index) => ({ entryId: '01JENUM' + String(index).padStart(17, '0'), domain: 'hue', title: 'e' + index, source }));
  const text = JSON.stringify({ schema: 'offline-readiness.snapshot/1', haVersion: '2026.10.1', entries, entities: [], devices: [] });
  const state = expectOk(OR.buildState(importText(text), classifications, { nowIso: '2026-10-11T12:00:00Z' }));
  const report = JSON.parse(expectOk(OR.buildReport(state, { format: 'json', generatedAtIso: '2026-10-11T12:00:00Z' })).text);
  assert.equal(report.entries.length, enumSources.length);
  for (let index = 0; index < enumSources.length; index += 1) {
    assert.equal(report.entries[index].source, enumSources[index], 'enum source kept: ' + enumSources[index]);
  }
});

test('report wording labels discard buckets as conservative, not a credential count', () => {
  const state = stateFromFixtureText(fixture('snapshots', 'canary-snapshot.json'));
  const json = JSON.parse(expectOk(OR.buildReport(state, { format: 'json', generatedAtIso: '2026-10-15T12:00:00Z' })).text);
  assert.ok(/conservative/i.test(json.redaction.secretsPolicy), 'JSON policy says conservative');
  assert.ok(/not an exact credential count/i.test(json.redaction.secretsPolicy), 'JSON policy says not an exact credential count');
  const html = expectOk(OR.buildReport(state, { format: 'html', generatedAtIso: '2026-10-15T12:00:00Z' }));
  assert.ok(/conservative field-slot buckets, not an exact credential count/i.test(html.text), 'HTML discard line says conservative');
  assert.equal(/credentials \d/.test(html.text), false, 'HTML must not present a bare credential count');
});

test('end-to-end canary sweep: state and both report formats in both modes', () => {
  const registryFiles = [
    fixture('registries', 'core.config_entries.json'),
    fixture('registries', 'core.entity_registry.json'),
    fixture('registries', 'core.device_registry.json')
  ];
  const joined = expectOk(OR.importFiles(registryFiles.map(text => ({ text }))), 'canary trio join');
  const state = expectOk(OR.buildState(joined, classifications, { nowIso: '2026-10-15T00:00:00Z' }));
  noCanary(JSON.stringify(state), 'state');
  for (const format of ['json', 'html']) {
    for (const includeIdentifiers of [false, true]) {
      const report = expectOk(OR.buildReport(state, { format, includeIdentifiers, generatedAtIso: '2026-10-15T12:00:00Z' }));
      noCanary(report.text, format + ' report (includeIdentifiers=' + includeIdentifiers + ')');
    }
  }
  const single = stateFromFixtureText(fixture('snapshots', 'canary-snapshot.json'));
  for (const format of ['json', 'html']) {
    for (const includeIdentifiers of [false, true]) {
      const report = expectOk(OR.buildReport(single, { format, includeIdentifiers, generatedAtIso: '2026-10-15T12:00:00Z' }));
      noCanary(report.text, format + ' single report (includeIdentifiers=' + includeIdentifiers + ')');
    }
  }
});
