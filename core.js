'use strict';
// OfflineReadiness core — pure logic, no DOM, no network, no storage.
// Reads selected Home Assistant registry metadata (or a normalized snapshot)
// and produces a read-only dependency evidence report. It is NOT a whole-house
// offline-safe certification and never emits an aggregate score.
//
// Loads both ways: browser global (window.OfflineReadiness) and CommonJS
// (module.exports), so the Node tests drive the exact code the page runs.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.OfflineReadiness = api;
})(typeof self !== 'undefined' ? self : this, function () {

  const VERSION = '0.1.0';
  const SCHEMAS = {
    snapshot: 'offline-readiness.snapshot/1',
    classifications: 'offline-readiness.classifications/1',
    report: 'offline-readiness.report/1'
  };
  const LIMITS = {
    maxBytesPerFile: 8388608,
    maxFilesPerImport: 8,
    maxEntries: 5000,
    maxEntities: 20000,
    maxDevices: 10000,
    maxRefsPerDevice: 32,
    maxStringLength: 200,
    maxIdentifierLength: 200,
    maxVersionLength: 40,
    maxIssues: 500,
    maxSearchLength: 120,
    staleAfterDays: 180
  };

  const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,200}$/;
  const DOMAIN_PATTERN = /^[a-z0-9_]{1,64}$/;
  const ENTITY_ID_PATTERN = /^[a-z0-9_]+\.[a-z0-9_]+$/;
  const SOURCE_PATTERN = /^[a-z_]{0,40}$/;
  const ENTRY_TYPE_PATTERN = /^[a-z_]{0,40}$/;
  // Known config-entry source enum values, read from the retained core source
  // at the bundled tag (evidence/OfflineReadiness/retrieval/source/config_entries.py,
  // SOURCE_* constants). They are nonpersonal acquisition provenance and may
  // appear in redacted reports. Any other source string is an arbitrary label
  // (an identifier): it is omitted from redacted reports and only included by
  // the explicit identifier opt-in.
  const KNOWN_SOURCE_ENUMS = new Set([
    'bluetooth', 'dhcp', 'discovery', 'esphome', 'hardware', 'hassio',
    'homekit', 'import', 'integration_discovery', 'mqtt', 'ssdp', 'system',
    'usb', 'user', 'zeroconf', 'ignore', 'reauth', 'reconfigure'
  ]);
  const VERSION_TEXT_PATTERN = /^[ -~]{0,64}$/;
  const TIMESTAMP_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9:.,+\-Z ]{0,30}$/;

  const CATEGORY_BY_CLASS = {
    local_polling: 'local',
    local_push: 'local',
    cloud_polling: 'cloud',
    cloud_push: 'cloud',
    assumed_state: 'unknown',
    calculated: 'unknown'
  };

  const SEVERITY = {
    RECORD_REJECTED: 'warning',
    DUPLICATE_ENTRY_ID: 'warning',
    DUPLICATE_ENTITY_ID: 'warning',
    DUPLICATE_DEVICE_ID: 'warning',
    REFS_TRUNCATED: 'warning',
    ORPHAN_ENTITY_ENTRY: 'warning',
    ORPHAN_ENTITY_DEVICE: 'warning',
    ORPHAN_DEVICE_ENTRY: 'warning',
    ORPHAN_DEVICE_VIA: 'warning',
    PLATFORM_DOMAIN_MISMATCH: 'warning',
    ISSUES_TRUNCATED: 'warning',
    UNLINKED_ENTITY: 'info',
    DANGLING_ENTRY: 'info',
    DYNAMIC_PLATFORM: 'info',
    UNKNOWN_DOMAIN: 'info',
    STALE_EVIDENCE: 'info'
  };

  // ------------------------------------------------------------------ utils

  function ok(value) { return { ok: true, value }; }
  function err(code, message, detail) {
    const error = { code, message };
    if (detail !== undefined) error.detail = detail;
    return { ok: false, error };
  }
  function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }
  function byteLength(text) {
    let bytes = 0;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.codePointAt(index);
      if (code > 0xFFFF) index += 1;
      bytes += code <= 0x7F ? 1 : code <= 0x7FF ? 2 : code <= 0xFFFF ? 3 : 4;
    }
    return bytes;
  }
  function stripControl(text) {
    return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  }
  function makeCounters() {
    return {
      discarded: { total: 0, credentials: 0, uniqueIds: 0, networkIdentifiers: 0, other: 0 },
      truncated: { displayFields: 0, refs: 0 },
      rejectedRecords: 0
    };
  }
  function mergeCounters(target, source) {
    target.discarded.total += source.discarded.total;
    target.discarded.credentials += source.discarded.credentials;
    target.discarded.uniqueIds += source.discarded.uniqueIds;
    target.discarded.networkIdentifiers += source.discarded.networkIdentifiers;
    target.discarded.other += source.discarded.other;
    target.truncated.displayFields += source.truncated.displayFields;
    target.truncated.refs += source.truncated.refs;
    target.rejectedRecords += source.rejectedRecords;
    return target;
  }
  function discardedBucket(key) {
    if (key === 'data' || key === 'options' || key === 'subentries') return 'credentials';
    if (key === 'unique_id' || key === 'unique_ids' || key === 'previous_unique_id') return 'uniqueIds';
    if (key === 'connections' || key === 'serial_number' || key === 'configuration_url' || key === 'identifiers') return 'networkIdentifiers';
    return 'other';
  }
  function countDiscards(raw, allowed, counters) {
    for (const key of Object.keys(raw)) {
      if (allowed.has(key)) continue;
      counters.discarded.total += 1;
      counters.discarded[discardedBucket(key)] += 1;
    }
  }
  // Display strings: control characters stripped, capped, counted.
  function displayString(value, counters) {
    if (typeof value !== 'string') return null;
    let text = stripControl(value);
    if (text.length === 0) return null;
    if (text.length > LIMITS.maxStringLength) {
      text = text.slice(0, LIMITS.maxStringLength);
      counters.truncated.displayFields += 1;
    }
    return text;
  }
  // Version-ish short strings (hw/sw version): capped, printable-ASCII only.
  function versionString(value, counters) {
    if (typeof value !== 'string') return null;
    const text = stripControl(value);
    if (text.length === 0) return null;
    if (text.length > 64) { counters.truncated.displayFields += 1; return text.slice(0, 64); }
    if (!VERSION_TEXT_PATTERN.test(text)) return null;
    return text;
  }
  // Timestamps: ISO-ish strings kept as-is (validated shape); epoch numbers
  // (devices store epoch seconds) converted to ISO. Anything else dropped.
  function timestampValue(value) {
    if (typeof value === 'string') {
      const text = stripControl(value);
      if (text.length <= 40 && TIMESTAMP_PATTERN.test(text)) return text;
      return null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const millis = value < 1e12 ? value * 1000 : value;
      const date = new Date(millis);
      if (Number.isNaN(date.getTime())) return null;
      return date.toISOString();
    }
    return null;
  }
  function patternOrNull(value, pattern) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return null;
    const text = stripControl(value);
    if (!pattern.test(text)) return null;
    return text;
  }
  function boolOr(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
  }

  // -------------------------------------------------------- input pre-check

  // Shared gate. Every rejection message is fixed text or counts only —
  // imported content never appears in errors.
  function precheckText(text) {
    if (typeof text !== 'string') return err('INVALID_ARGUMENT', 'Input must be a text string.');
    let body = text;
    if (body.charCodeAt(0) === 0xFEFF) body = body.slice(1);
    if (body.includes('\u0000') || body.includes('\uFFFD')) {
      return err('NOT_TEXT', 'This file is not readable text (binary or non-UTF-8 content). Supported inputs are JSON files only.');
    }
    if (body.startsWith('PK\u0003\u0004') || body.startsWith('PK\u0005\u0006') || body.startsWith('PK\u0007\u0008')) {
      return err('UNSUPPORTED_INPUT', 'This looks like a ZIP archive. Archives (.zip/.tar/.gz) and full/encrypted backups are not supported — export the three .storage JSON registry files or a normalized snapshot.');
    }
    if (body.startsWith('\u001F\u008B')) {
      return err('UNSUPPORTED_INPUT', 'This looks like a GZip archive. Archives are not supported — export the .storage JSON registry files or a normalized snapshot.');
    }
    if (body.slice(257, 262) === 'ustar') {
      return err('UNSUPPORTED_INPUT', 'This looks like a TAR archive. Archives are not supported — export the .storage JSON registry files or a normalized snapshot.');
    }
    const trimmed = body.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return ok({ parsed: JSON.parse(trimmed) });
      } catch (parseError) {
        return err('NOT_JSON', 'This file is not valid JSON. YAML, archives and encrypted backups are not supported — export the three .storage registry files or a normalized snapshot JSON.');
      }
    }
    const firstLine = trimmed.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#')) || '';
    if (/^[\w-]+\s*:/.test(firstLine) || trimmed.startsWith('---')) {
      return err('UNSUPPORTED_INPUT', 'This looks like a YAML file (for example configuration.yaml or automations.yaml). YAML and dynamic automation templates are not supported — export the three .storage JSON registry files or a normalized snapshot.');
    }
    return err('NOT_JSON', 'This file is not valid JSON. YAML, archives and encrypted backups are not supported — export the three .storage registry files or a normalized snapshot JSON.');
  }

  function detectJsonKind(text) {
    const pre = precheckText(text);
    if (!pre.ok) return pre;
    const parsed = pre.value.parsed;
    if (!isPlainObject(parsed)) {
      return err('UNSUPPORTED_INPUT', 'The JSON root must be an object. Arrays and primitives are not supported.');
    }
    if (typeof parsed.schema === 'string' && parsed.schema.startsWith('offline-readiness.snapshot/')) {
      if (parsed.schema !== SCHEMAS.snapshot) {
        return err('UNSUPPORTED_SCHEMA', 'Unsupported snapshot schema version. This tool supports ' + SCHEMAS.snapshot + '.');
      }
      return ok({ kind: 'snapshot' });
    }
    if (parsed.key === 'core.config_entries') return ok({ kind: 'config_entries' });
    if (parsed.key === 'core.entity_registry') return ok({ kind: 'entity_registry' });
    if (parsed.key === 'core.device_registry') return ok({ kind: 'device_registry' });
    const data = parsed.data;
    if (isPlainObject(data)) {
      if (Array.isArray(data.entries)) return ok({ kind: 'config_entries' });
      if (Array.isArray(data.entities)) return ok({ kind: 'entity_registry' });
      if (Array.isArray(data.devices)) return ok({ kind: 'device_registry' });
    }
    if (hasOwn(parsed, 'backups') || hasOwn(parsed, 'home_assistant') || hasOwn(parsed, 'supervisor')) {
      return err('UNSUPPORTED_INPUT', 'This looks like a Home Assistant backup. Full and encrypted backups are not supported — export the three .storage JSON registry files or a normalized snapshot.');
    }
    if (Array.isArray(parsed.trigger) && Array.isArray(parsed.action)) {
      return err('UNSUPPORTED_INPUT', 'This looks like an automation or script. Dynamic automation templates are not evaluated or imported.');
    }
    return err('UNSUPPORTED_INPUT', 'Unrecognized JSON. Supported inputs: a normalized snapshot (' + SCHEMAS.snapshot + ') or the .storage exports core.config_entries, core.entity_registry and core.device_registry.');
  }

  // ------------------------------------------------------- record normalize

  const SNAPSHOT_ENTRY_FIELDS = new Set(['entryId', 'domain', 'title', 'source', 'disabledBy', 'prefDisableNewEntities', 'prefDisablePolling', 'createdAt', 'modifiedAt']);
  const SNAPSHOT_ENTITY_FIELDS = new Set(['entityId', 'platform', 'configEntryId', 'deviceId', 'name', 'originalName', 'disabledBy', 'hiddenBy', 'createdAt', 'modifiedAt']);
  const SNAPSHOT_DEVICE_FIELDS = new Set(['deviceId', 'configEntries', 'manufacturer', 'model', 'name', 'nameByUser', 'entryType', 'disabledBy', 'viaDeviceId', 'swVersion', 'hwVersion', 'createdAt', 'modifiedAt']);

  function reject(rejected, recordKind, reason) {
    rejected.push({ recordKind, reason });
  }

  function normalizeEntry(raw, counters, rejected) {
    if (!isPlainObject(raw)) { reject(rejected, 'entry', 'missing_required'); counters.rejectedRecords += 1; return null; }
    if (typeof raw.entryId !== 'string' || raw.entryId.length === 0) { reject(rejected, 'entry', 'missing_required'); counters.rejectedRecords += 1; return null; }
    if (!ID_PATTERN.test(raw.entryId)) { reject(rejected, 'entry', 'invalid_identifier'); counters.rejectedRecords += 1; return null; }
    if (typeof raw.domain !== 'string' || raw.domain.length === 0) { reject(rejected, 'entry', 'missing_required'); counters.rejectedRecords += 1; return null; }
    if (!DOMAIN_PATTERN.test(raw.domain)) { reject(rejected, 'entry', 'invalid_field'); counters.rejectedRecords += 1; return null; }
    const record = {
      entryId: raw.entryId,
      domain: raw.domain,
      title: displayString(raw.title, counters),
      source: patternOrNull(raw.source, SOURCE_PATTERN),
      disabledBy: patternOrNull(raw.disabledBy, SOURCE_PATTERN),
      prefDisableNewEntities: boolOr(raw.prefDisableNewEntities, false),
      prefDisablePolling: boolOr(raw.prefDisablePolling, false),
      createdAt: timestampValue(raw.createdAt),
      modifiedAt: timestampValue(raw.modifiedAt)
    };
    countDiscards(raw, SNAPSHOT_ENTRY_FIELDS, counters);
    return record;
  }

  function normalizeEntity(raw, counters, rejected) {
    if (!isPlainObject(raw)) { reject(rejected, 'entity', 'missing_required'); counters.rejectedRecords += 1; return null; }
    if (typeof raw.entityId !== 'string' || raw.entityId.length === 0) { reject(rejected, 'entity', 'missing_required'); counters.rejectedRecords += 1; return null; }
    if (!ENTITY_ID_PATTERN.test(raw.entityId) || raw.entityId.length > LIMITS.maxIdentifierLength) { reject(rejected, 'entity', 'invalid_identifier'); counters.rejectedRecords += 1; return null; }
    if (typeof raw.platform !== 'string' || raw.platform.length === 0) { reject(rejected, 'entity', 'missing_required'); counters.rejectedRecords += 1; return null; }
    if (!DOMAIN_PATTERN.test(raw.platform)) { reject(rejected, 'entity', 'invalid_field'); counters.rejectedRecords += 1; return null; }
    const record = {
      entityId: raw.entityId,
      platform: raw.platform,
      configEntryId: patternOrNull(raw.configEntryId, ID_PATTERN) || null,
      deviceId: patternOrNull(raw.deviceId, ID_PATTERN) || null,
      name: displayString(raw.name, counters),
      originalName: displayString(raw.originalName, counters),
      disabledBy: patternOrNull(raw.disabledBy, SOURCE_PATTERN),
      hiddenBy: patternOrNull(raw.hiddenBy, SOURCE_PATTERN),
      createdAt: timestampValue(raw.createdAt),
      modifiedAt: timestampValue(raw.modifiedAt)
    };
    countDiscards(raw, SNAPSHOT_ENTITY_FIELDS, counters);
    return record;
  }

  function normalizeDevice(raw, counters, rejected, events) {
    if (!isPlainObject(raw)) { reject(rejected, 'device', 'missing_required'); counters.rejectedRecords += 1; return null; }
    if (typeof raw.deviceId !== 'string' || raw.deviceId.length === 0) { reject(rejected, 'device', 'missing_required'); counters.rejectedRecords += 1; return null; }
    if (!ID_PATTERN.test(raw.deviceId)) { reject(rejected, 'device', 'invalid_identifier'); counters.rejectedRecords += 1; return null; }
    let refs = [];
    if (raw.configEntries !== undefined && raw.configEntries !== null) {
      if (!Array.isArray(raw.configEntries)) { reject(rejected, 'device', 'invalid_field'); counters.rejectedRecords += 1; return null; }
      for (const ref of raw.configEntries) {
        if (typeof ref === 'string' && ID_PATTERN.test(ref)) refs.push(ref);
      }
      if (refs.length > LIMITS.maxRefsPerDevice) {
        const dropped = refs.length - LIMITS.maxRefsPerDevice;
        refs = refs.slice(0, LIMITS.maxRefsPerDevice);
        counters.truncated.refs += dropped;
        events.push({ recordKind: 'device', reason: 'refs_truncated', id: raw.deviceId, count: dropped });
      }
    }
    const record = {
      deviceId: raw.deviceId,
      configEntries: refs,
      manufacturer: displayString(raw.manufacturer, counters),
      model: displayString(raw.model, counters),
      name: displayString(raw.name, counters),
      nameByUser: displayString(raw.nameByUser, counters),
      entryType: patternOrNull(raw.entryType, ENTRY_TYPE_PATTERN),
      disabledBy: patternOrNull(raw.disabledBy, SOURCE_PATTERN),
      viaDeviceId: patternOrNull(raw.viaDeviceId, ID_PATTERN) || null,
      swVersion: versionString(raw.swVersion, counters),
      hwVersion: versionString(raw.hwVersion, counters),
      createdAt: timestampValue(raw.createdAt),
      modifiedAt: timestampValue(raw.modifiedAt)
    };
    countDiscards(raw, SNAPSHOT_DEVICE_FIELDS, counters);
    return record;
  }

  function capCheck(label, count, limit) {
    if (count > limit) {
      return err('LIMIT_EXCEEDED', label + ' count ' + count + ' exceeds the limit of ' + limit + '. Split the export or trim the snapshot.');
    }
    return null;
  }

  // ------------------------------------------------------- normalized input

  function parseSnapshot(text) {
    const detected = detectJsonKind(text);
    if (!detected.ok) return detected;
    const pre = precheckText(text);
    const parsed = pre.value.parsed;
    const counters = makeCounters();
    const rejected = [];
    const events = [];
    if (typeof parsed.haVersion !== 'string' || parsed.haVersion.length < 1 || parsed.haVersion.length > LIMITS.maxVersionLength) {
      return err('INVALID_FIELD', 'haVersion must be a string of 1-' + LIMITS.maxVersionLength + ' characters.');
    }
    for (const field of ['entries', 'entities', 'devices']) {
      if (!Array.isArray(parsed[field])) return err('INVALID_FIELD', 'The snapshot must contain "' + field + '" as an array.');
    }
    const over = capCheck('entries', parsed.entries.length, LIMITS.maxEntries) ||
      capCheck('entities', parsed.entities.length, LIMITS.maxEntities) ||
      capCheck('devices', parsed.devices.length, LIMITS.maxDevices);
    if (over) return over;
    const entries = [];
    const entities = [];
    const devices = [];
    for (const raw of parsed.entries) { const record = normalizeEntry(raw, counters, rejected); if (record) entries.push(record); }
    for (const raw of parsed.entities) { const record = normalizeEntity(raw, counters, rejected); if (record) entities.push(record); }
    for (const raw of parsed.devices) { const record = normalizeDevice(raw, counters, rejected, events); if (record) devices.push(record); }
    // Unknown top-level keys are discarded and counted (values never read).
    countDiscards(parsed, new Set(['schema', 'haVersion', 'generatedAt', 'entries', 'entities', 'devices']), counters);
    // Empty means the raw arrays carried no records at all; a snapshot whose
    // records were all rejected still parses so the rejections stay visible.
    if (parsed.entries.length + parsed.entities.length + parsed.devices.length === 0) {
      return err('EMPTY_INPUT', 'The snapshot contains no usable records.');
    }
    const generatedAt = timestampValue(parsed.generatedAt);
    return ok({
      kind: 'snapshot',
      haVersion: parsed.haVersion,
      generatedAt,
      entries,
      entities,
      devices,
      rejected,
      events,
      stats: counters
    });
  }

  // -------------------------------------------------------- registry inputs

  function parseRegistryData(text, expectedKey) {
    const pre = precheckText(text);
    if (!pre.ok) return pre;
    const parsed = pre.value.parsed;
    if (!isPlainObject(parsed)) return err('UNSUPPORTED_INPUT', 'The JSON root must be an object.');
    if (typeof parsed.key === 'string' && parsed.key !== expectedKey) {
      return err('UNSUPPORTED_SCHEMA', 'This file declares a different registry key. Expected the "' + expectedKey + '" export.');
    }
    if (!isPlainObject(parsed.data)) return err('UNSUPPORTED_SCHEMA', 'This file does not look like the "' + expectedKey + '" .storage export.');
    return ok({ parsed });
  }

  function parseConfigEntriesExport(text) {
    const base = parseRegistryData(text, 'core.config_entries');
    if (!base.ok) return base;
    const data = base.value.parsed.data;
    if (!Array.isArray(data.entries)) return err('UNSUPPORTED_SCHEMA', 'The export must contain data.entries as an array.');
    const over = capCheck('entries', data.entries.length, LIMITS.maxEntries);
    if (over) return over;
    const counters = makeCounters();
    const rejected = [];
    const entries = [];
    const allowed = new Set(['entry_id', 'domain', 'title', 'source', 'disabled_by', 'pref_disable_new_entities', 'pref_disable_polling', 'created_at', 'modified_at']);
    for (const raw of data.entries) {
      if (!isPlainObject(raw) || typeof raw.entry_id !== 'string' || !ID_PATTERN.test(raw.entry_id) || typeof raw.domain !== 'string' || !DOMAIN_PATTERN.test(raw.domain)) {
        reject(rejected, 'entry', 'missing_required');
        counters.rejectedRecords += 1;
        continue;
      }
      const record = {
        entryId: raw.entry_id,
        domain: raw.domain,
        title: displayString(raw.title, counters),
        source: patternOrNull(raw.source, SOURCE_PATTERN),
        disabledBy: patternOrNull(raw.disabled_by, SOURCE_PATTERN),
        prefDisableNewEntities: boolOr(raw.pref_disable_new_entities, false),
        prefDisablePolling: boolOr(raw.pref_disable_polling, false),
        createdAt: timestampValue(raw.created_at),
        modifiedAt: timestampValue(raw.modified_at)
      };
      countDiscards(raw, allowed, counters);
      entries.push(record);
    }
    // A zero-record export is a valid component (for example a fresh home).
    // importFiles rejects only an aggregate whose exports hold no records.
    return ok({ kind: 'config_entries', entries, rejected, events: [], stats: counters, rawCount: data.entries.length });
  }

  function parseEntityRegistryExport(text) {
    const base = parseRegistryData(text, 'core.entity_registry');
    if (!base.ok) return base;
    const data = base.value.parsed.data;
    if (!Array.isArray(data.entities)) return err('UNSUPPORTED_SCHEMA', 'The export must contain data.entities as an array.');
    const over = capCheck('entities', data.entities.length, LIMITS.maxEntities);
    if (over) return over;
    const counters = makeCounters();
    const rejected = [];
    const entities = [];
    const allowed = new Set(['entity_id', 'platform', 'config_entry_id', 'device_id', 'name', 'original_name', 'disabled_by', 'hidden_by', 'created_at', 'modified_at']);
    for (const raw of data.entities) {
      if (!isPlainObject(raw) || typeof raw.entity_id !== 'string' || !ENTITY_ID_PATTERN.test(raw.entity_id) || typeof raw.platform !== 'string' || !DOMAIN_PATTERN.test(raw.platform)) {
        reject(rejected, 'entity', 'missing_required');
        counters.rejectedRecords += 1;
        continue;
      }
      const record = {
        entityId: raw.entity_id,
        platform: raw.platform,
        configEntryId: patternOrNull(raw.config_entry_id, ID_PATTERN) || null,
        deviceId: patternOrNull(raw.device_id, ID_PATTERN) || null,
        name: displayString(raw.name, counters),
        originalName: displayString(raw.original_name, counters),
        disabledBy: patternOrNull(raw.disabled_by, SOURCE_PATTERN),
        hiddenBy: patternOrNull(raw.hidden_by, SOURCE_PATTERN),
        createdAt: timestampValue(raw.created_at),
        modifiedAt: timestampValue(raw.modified_at)
      };
      countDiscards(raw, allowed, counters);
      entities.push(record);
    }
    // A zero-record export is a valid component; see importFiles for the
    // aggregate emptiness rule.
    return ok({ kind: 'entity_registry', entities, rejected, events: [], stats: counters, rawCount: data.entities.length });
  }

  function parseDeviceRegistryExport(text) {
    const base = parseRegistryData(text, 'core.device_registry');
    if (!base.ok) return base;
    const data = base.value.parsed.data;
    if (!Array.isArray(data.devices)) return err('UNSUPPORTED_SCHEMA', 'The export must contain data.devices as an array.');
    const over = capCheck('devices', data.devices.length, LIMITS.maxDevices);
    if (over) return over;
    const counters = makeCounters();
    const rejected = [];
    const events = [];
    const devices = [];
    const allowed = new Set(['id', 'config_entry_id', 'config_entries', 'primary_config_entry', 'via_device_id', 'manufacturer', 'model', 'name', 'name_by_user', 'entry_type', 'disabled_by', 'sw_version', 'hw_version', 'created_at', 'modified_at']);
    for (const raw of data.devices) {
      if (!isPlainObject(raw) || typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id)) {
        reject(rejected, 'device', 'missing_required');
        counters.rejectedRecords += 1;
        continue;
      }
      // 2026.10 core stores a single config_entry_id; older exports stored a
      // config_entries array; primary_config_entry is a deprecated duplicate.
      let refs = [];
      if (Array.isArray(raw.config_entries)) {
        refs = raw.config_entries.filter(ref => typeof ref === 'string' && ID_PATTERN.test(ref));
      } else if (typeof raw.config_entry_id === 'string' && ID_PATTERN.test(raw.config_entry_id)) {
        refs = [raw.config_entry_id];
      }
      if (refs.length > LIMITS.maxRefsPerDevice) {
        const dropped = refs.length - LIMITS.maxRefsPerDevice;
        refs = refs.slice(0, LIMITS.maxRefsPerDevice);
        counters.truncated.refs += dropped;
        events.push({ recordKind: 'device', reason: 'refs_truncated', id: raw.id, count: dropped });
      }
      const record = {
        deviceId: raw.id,
        configEntries: refs,
        manufacturer: displayString(raw.manufacturer, counters),
        model: displayString(raw.model, counters),
        name: displayString(raw.name, counters),
        nameByUser: displayString(raw.name_by_user, counters),
        entryType: patternOrNull(raw.entry_type, ENTRY_TYPE_PATTERN),
        disabledBy: patternOrNull(raw.disabled_by, SOURCE_PATTERN),
        viaDeviceId: patternOrNull(raw.via_device_id, ID_PATTERN) || null,
        swVersion: versionString(raw.sw_version, counters),
        hwVersion: versionString(raw.hw_version, counters),
        createdAt: timestampValue(raw.created_at),
        modifiedAt: timestampValue(raw.modified_at)
      };
      countDiscards(raw, allowed, counters);
      devices.push(record);
    }
    // A zero-record export is a valid component; see importFiles for the
    // aggregate emptiness rule.
    return ok({ kind: 'device_registry', devices, rejected, events, stats: counters, rawCount: data.devices.length });
  }

  // ------------------------------------------------------------ importFiles

  function importFiles(files) {
    if (!Array.isArray(files)) return err('INVALID_ARGUMENT', 'files must be an array of {text, size} entries.');
    if (files.length === 0) return err('EMPTY_INPUT', 'No files were provided.');
    if (files.length > LIMITS.maxFilesPerImport) {
      return err('TOO_MANY_FILES', files.length + ' files provided; at most ' + LIMITS.maxFilesPerImport + ' are supported.');
    }
    const kinds = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!isPlainObject(file) || typeof file.text !== 'string') return err('INVALID_ARGUMENT', 'file ' + (index + 1) + ' must provide text.');
      const size = typeof file.size === 'number' ? file.size : byteLength(file.text);
      if (size > LIMITS.maxBytesPerFile) {
        return err('LIMIT_EXCEEDED', 'file ' + (index + 1) + ' is ' + size + ' bytes; the limit is ' + LIMITS.maxBytesPerFile + ' bytes.', { file: index + 1 });
      }
      const detected = detectJsonKind(file.text);
      if (!detected.ok) {
        const error = detected.error;
        if (error.detail === undefined) error.detail = { file: index + 1 };
        return detected;
      }
      kinds.push(detected.value.kind);
    }
    if (kinds.includes('snapshot')) {
      if (files.length > 1) {
        return err('UNSUPPORTED_INPUT', 'A normalized snapshot cannot be combined with registry exports. Import either one snapshot or the registry files.');
      }
      const parsed = parseSnapshot(files[0].text);
      if (!parsed.ok) return parsed;
      return ok({
        kind: 'snapshot',
        snapshot: { haVersion: parsed.value.haVersion, generatedAt: parsed.value.generatedAt, entries: parsed.value.entries, entities: parsed.value.entities, devices: parsed.value.devices },
        parts: [{ kind: 'snapshot' }],
        rejected: parsed.value.rejected,
        events: parsed.value.events,
        stats: parsed.value.stats
      });
    }
    const counts = { config_entries: 0, entity_registry: 0, device_registry: 0 };
    for (const kind of kinds) {
      counts[kind] += 1;
      if (counts[kind] > 1) {
        return err('DUPLICATE_KIND', 'Two files of kind ' + kind + ' were provided; each registry kind may appear once.');
      }
    }
    const missing = [];
    if (!counts.config_entries) missing.push('config_entries');
    if (!counts.entity_registry) missing.push('entity_registry');
    if (missing.length) {
      return err('MISSING_REGISTRY', 'The registry bundle is incomplete: missing ' + missing.join(' and ') + '. Select all three .storage exports (core.config_entries, core.entity_registry, core.device_registry).');
    }
    const stats = makeCounters();
    const rejected = [];
    const events = [];
    let entries = [];
    let entities = [];
    let devices = [];
    let rawRecords = 0;
    for (let index = 0; index < files.length; index += 1) {
      const kind = kinds[index];
      const parsed = kind === 'config_entries' ? parseConfigEntriesExport(files[index].text)
        : kind === 'entity_registry' ? parseEntityRegistryExport(files[index].text)
          : parseDeviceRegistryExport(files[index].text);
      if (!parsed.ok) return parsed;
      mergeCounters(stats, parsed.value.stats);
      for (const item of parsed.value.rejected) rejected.push(item);
      for (const item of parsed.value.events || []) events.push(item);
      rawRecords += typeof parsed.value.rawCount === 'number' ? parsed.value.rawCount : 0;
      if (kind === 'config_entries') entries = parsed.value.entries;
      if (kind === 'entity_registry') entities = parsed.value.entities;
      if (kind === 'device_registry') devices = parsed.value.devices;
    }
    // Emptiness is an aggregate property: valid zero-record component exports
    // may join nonempty metadata (fresh or device-less homes), but an import
    // whose exports together hold no records at all is an explicit EMPTY_INPUT.
    // Records that fail validation remain visible as rejected-record counts.
    if (rawRecords === 0) {
      return err('EMPTY_INPUT', 'The selected registry exports contain no records. Select at least one export with records, or import a normalized snapshot.');
    }
    const usesDevices = entities.some(entity => entity.deviceId !== null);
    if (usesDevices && !counts.device_registry) {
      return err('MISSING_REGISTRY', 'Entities reference devices but the device registry was not provided. Select core.device_registry as well.');
    }
    const over = capCheck('entries', entries.length, LIMITS.maxEntries) ||
      capCheck('entities', entities.length, LIMITS.maxEntities) ||
      capCheck('devices', devices.length, LIMITS.maxDevices);
    if (over) return over;
    return ok({
      kind: 'registry_bundle',
      snapshot: { haVersion: null, generatedAt: null, entries, entities, devices },
      parts: kinds.map(kind => ({ kind })),
      rejected,
      events,
      stats
    });
  }

  // ---------------------------------------------------------- classification

  function classificationFor(domain, cls, nowIso) {
    const policy = isPlainObject(cls.policy) ? cls.policy : {};
    const staleAfterDays = typeof policy.staleAfterDays === 'number' ? policy.staleAfterDays : LIMITS.staleAfterDays;
    const dynamicDomains = isPlainObject(policy.dynamicDomains) ? policy.dynamicDomains : {};
    if (hasOwn(dynamicDomains, domain)) {
      return {
        category: 'unknown',
        iotClass: null,
        reason: 'dynamic_' + domain,
        dynamic: true,
        qualifiers: [],
        stale: false,
        staleDays: null,
        evidence: null,
        dynamicNote: String(dynamicDomains[domain])
      };
    }
    const table = isPlainObject(cls.entries) ? cls.entries : {};
    if (!hasOwn(table, domain)) {
      return { category: 'custom', iotClass: null, reason: 'not_in_bundle', dynamic: false, qualifiers: [], stale: false, staleDays: null, evidence: null };
    }
    const source = table[domain];
    const retrieved = typeof source.retrieved === 'string' ? source.retrieved : null;
    let stale = false;
    let staleDays = null;
    if (retrieved && typeof nowIso === 'string') {
      const retrievedMs = Date.parse(retrieved + 'T00:00:00Z');
      const nowMs = Date.parse(nowIso);
      if (!Number.isNaN(retrievedMs) && !Number.isNaN(nowMs)) {
        staleDays = Math.floor((nowMs - retrievedMs) / 86400000);
        stale = staleDays > staleAfterDays;
      }
    }
    const iotClass = typeof source.iotClass === 'string' ? source.iotClass : null;
    let category;
    let reason;
    if (isPlainObject(source.override) && typeof source.override.category === 'string') {
      category = source.override.category;
      reason = typeof source.override.reason === 'string' ? source.override.reason : 'override';
    } else if (iotClass === null) {
      category = 'unknown';
      reason = 'missing_iot_class';
    } else if (hasOwn(CATEGORY_BY_CLASS, iotClass)) {
      category = CATEGORY_BY_CLASS[iotClass];
      reason = iotClass === 'assumed_state' ? 'assumed_state'
        : iotClass === 'calculated' ? 'calculated_no_direct_communication'
          : iotClass;
    } else {
      category = 'unknown';
      reason = 'unrecognized_iot_class';
    }
    const evidence = {
      domain,
      name: typeof source.name === 'string' ? source.name : null,
      iotClass,
      integrationType: typeof source.integrationType === 'string' ? source.integrationType : null,
      category,
      reason,
      sourceUrl: typeof source.sourceUrl === 'string' ? source.sourceUrl : null,
      retrieved,
      scope: typeof source.scope === 'string' ? source.scope : null,
      notes: typeof source.notes === 'string' ? source.notes : null,
      qualifiers: Array.isArray(source.qualifiers) ? source.qualifiers.slice() : [],
      overrideNote: isPlainObject(source.override) && typeof source.override.overrideNote === 'string' ? source.override.overrideNote : null,
      stale,
      staleDays
    };
    return { category, iotClass, reason, dynamic: false, qualifiers: evidence.qualifiers, stale, staleDays, evidence };
  }

  function classifyDomain(domain, cls, options) {
    if (typeof domain !== 'string' || domain.length === 0) return err('INVALID_ARGUMENT', 'domain must be a non-empty string.');
    if (!isPlainObject(cls)) return err('INVALID_ARGUMENT', 'classifications data must be an object.');
    if (cls.schema !== SCHEMAS.classifications) return err('UNSUPPORTED_SCHEMA', 'Unsupported classifications schema. This tool supports ' + SCHEMAS.classifications + '.');
    const nowIso = isPlainObject(options) && typeof options.nowIso === 'string' ? options.nowIso : new Date().toISOString();
    return ok(classificationFor(domain, cls, nowIso));
  }

  // -------------------------------------------------------------- buildState

  function deepFreeze(value) {
    if (value && (typeof value === 'object') && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const key of Object.keys(value)) deepFreeze(value[key]);
    }
    return value;
  }

  function buildDisclaimers(cls, staleAfterDays) {
    const source = isPlainObject(cls.source) ? cls.source : {};
    return [
      'Read-only dependency evidence report built from selected Home Assistant registry metadata. It is not a whole-house offline-safe certification.',
      'Local means the integration\u2019s own device communication is declared local by its manifest iot_class. It does not mean the entry works without internet \u2014 firmware, apps, accounts and cloud features are out of scope.',
      'No aggregate offline score is computed; counts are record counts, not safety ratings.',
      'Bundled classification evidence: retrieved ' + (source.retrieved || 'unknown') + ' from ' + (source.repository || 'unknown') + (source.ref ? ' (' + source.ref + ')' : '') + '. Evidence older than ' + staleAfterDays + ' days is flagged stale.',
      'MQTT entities depend on a user-configured broker; the broker\u2019s locality cannot be verified from bundled evidence, so MQTT is reported as unknown.',
      'Entities without a config entry reference (YAML-configured or helpers) are classified from their platform and marked unlinked.',
      'Evidence is tied to the bundled tag and retrieval date above; the imported Home Assistant version is shown for context and is not compared with it, and registry version/minor_version fields are tolerated rather than certified.',
      'Classification is a domain-name lookup against the named core manifests \u2014 a custom integration that reuses a bundled domain would still show that bundled evidence, and installed code was not inspected.',
      'Device via references are direct links only; cycles are not detected and references are not resolved transitively.',
      'Device manufacturer/model and known source enums stay in redacted reports as product/acquisition metadata; review them before sharing.'
    ];
  }

  function buildState(imported, cls, options) {
    if (!isPlainObject(imported) || !isPlainObject(imported.snapshot) || !Array.isArray(imported.snapshot.entries)) {
      return err('INVALID_ARGUMENT', 'buildState expects the value produced by importFiles or parseSnapshot.');
    }
    if (!isPlainObject(cls)) return err('INVALID_ARGUMENT', 'classifications data must be an object.');
    if (cls.schema !== SCHEMAS.classifications) return err('UNSUPPORTED_SCHEMA', 'Unsupported classifications schema. This tool supports ' + SCHEMAS.classifications + '.');
    const nowIso = isPlainObject(options) && typeof options.nowIso === 'string' ? options.nowIso : new Date().toISOString();
    const staleAfterDays = isPlainObject(cls.policy) && typeof cls.policy.staleAfterDays === 'number' ? cls.policy.staleAfterDays : LIMITS.staleAfterDays;
    const snapshot = imported.snapshot;

    const issues = [];
    const seenEntry = new Map();
    const seenEntity = new Map();
    const seenDevice = new Map();
    const entryById = new Map();
    const entityById = new Map();
    const deviceById = new Map();
    const entries = [];
    const entities = [];
    const devices = [];
    let duplicates = 0;

    function pad(number) { return String(number).padStart(2, '0'); }
    function addIssue(code, fields) {
      issues.push(Object.assign({ code, severity: SEVERITY[code] || 'info' }, fields));
    }

    for (const item of imported.rejected || []) {
      addIssue('RECORD_REJECTED', { subjectRef: 'IMPORT', subjectId: null, recordKind: item.recordKind, reason: item.reason });
    }

    for (const record of snapshot.entries) {
      if (seenEntry.has(record.entryId)) {
        duplicates += 1;
        addIssue('DUPLICATE_ENTRY_ID', { subjectRef: 'IMPORT', subjectId: record.entryId });
        continue;
      }
      const classification = classificationFor(record.domain, cls, nowIso);
      const entry = {
        ref: 'C' + pad(entries.length + 1),
        entryId: record.entryId,
        domain: record.domain,
        title: record.title,
        source: record.source,
        disabledBy: record.disabledBy,
        prefDisableNewEntities: record.prefDisableNewEntities,
        prefDisablePolling: record.prefDisablePolling,
        createdAt: record.createdAt,
        modifiedAt: record.modifiedAt,
        category: classification.category,
        iotClass: classification.iotClass,
        reason: classification.reason,
        qualifiers: classification.qualifiers,
        stale: classification.stale,
        staleDays: classification.staleDays,
        evidence: classification.evidence,
        entityRefs: [],
        deviceRefs: [],
        issueCodes: []
      };
      entries.push(entry);
      seenEntry.set(record.entryId, entry);
      entryById.set(record.entryId, entry);
      if (classification.category === 'custom') {
        addIssue('UNKNOWN_DOMAIN', { subjectRef: entry.ref, subjectId: entry.entryId, domain: entry.domain });
      }
      if (classification.stale) {
        addIssue('STALE_EVIDENCE', { subjectRef: entry.ref, subjectId: entry.entryId, domain: entry.domain, staleDays: classification.staleDays });
      }
    }

    for (const record of snapshot.entities) {
      if (seenEntity.has(record.entityId)) {
        duplicates += 1;
        addIssue('DUPLICATE_ENTITY_ID', { subjectRef: 'IMPORT', subjectId: record.entityId });
        continue;
      }
      const classification = classificationFor(record.platform, cls, nowIso);
      const entryRef = record.configEntryId !== null && entryById.has(record.configEntryId) ? entryById.get(record.configEntryId).ref : null;
      // deviceRef is resolved after the device pass (devices may appear later).
      const deviceRef = null;
      const entity = {
        ref: 'E' + pad(entities.length + 1),
        entityId: record.entityId,
        platform: record.platform,
        name: record.name,
        originalName: record.originalName,
        displayName: record.name || record.originalName || null,
        configEntryId: record.configEntryId,
        deviceId: record.deviceId,
        disabledBy: record.disabledBy,
        hiddenBy: record.hiddenBy,
        createdAt: record.createdAt,
        modifiedAt: record.modifiedAt,
        entryRef,
        deviceRef,
        category: classification.category,
        iotClass: classification.iotClass,
        reason: classification.reason,
        dynamic: classification.dynamic,
        stale: classification.stale,
        staleDays: classification.staleDays,
        issueCodes: []
      };
      entities.push(entity);
      seenEntity.set(record.entityId, entity);
      entityById.set(record.entityId, entity);
      if (record.configEntryId !== null && !entryById.has(record.configEntryId)) {
        addIssue('ORPHAN_ENTITY_ENTRY', { subjectRef: entity.ref, subjectId: entity.entityId, missingRef: record.configEntryId });
      }
      if (record.configEntryId === null && record.deviceId === null) {
        addIssue('UNLINKED_ENTITY', { subjectRef: entity.ref, subjectId: entity.entityId });
      }
      if (entryRef !== null && record.platform !== entryById.get(record.configEntryId).domain) {
        addIssue('PLATFORM_DOMAIN_MISMATCH', { subjectRef: entity.ref, subjectId: entity.entityId, platform: record.platform, entryDomain: entryById.get(record.configEntryId).domain });
      }
      if (classification.dynamic) {
        addIssue('DYNAMIC_PLATFORM', { subjectRef: entity.ref, subjectId: entity.entityId, platform: record.platform, reason: classification.reason });
      }
    }

    for (const record of snapshot.devices) {
      if (seenDevice.has(record.deviceId)) {
        duplicates += 1;
        addIssue('DUPLICATE_DEVICE_ID', { subjectRef: 'IMPORT', subjectId: record.deviceId });
        continue;
      }
      const entryRefs = [];
      for (const ref of record.configEntries) {
        if (entryById.has(ref)) entryRefs.push(entryById.get(ref).ref);
        else addIssue('ORPHAN_DEVICE_ENTRY', { subjectRef: 'D' + pad(devices.length + 1), subjectId: record.deviceId, missingRef: ref });
      }
      const viaRef = null; // resolved after all devices are registered
      const device = {
        ref: 'D' + pad(devices.length + 1),
        deviceId: record.deviceId,
        configEntries: record.configEntries,
        entryRefs,
        viaDeviceId: record.viaDeviceId,
        viaRef,
        manufacturer: record.manufacturer,
        model: record.model,
        name: record.name,
        nameByUser: record.nameByUser,
        displayName: record.nameByUser || record.name || null,
        entryType: record.entryType,
        disabledBy: record.disabledBy,
        swVersion: record.swVersion,
        hwVersion: record.hwVersion,
        createdAt: record.createdAt,
        modifiedAt: record.modifiedAt,
        categoryLabel: 'unattributed',
        issueCodes: []
      };
      devices.push(device);
      seenDevice.set(record.deviceId, device);
      deviceById.set(record.deviceId, device);
    }

    // Second sweeps: devices and entities may reference records that appear
    // later in the input, so references resolve only after all passes.
    for (const device of devices) {
      if (device.viaDeviceId !== null) {
        if (deviceById.has(device.viaDeviceId)) device.viaRef = deviceById.get(device.viaDeviceId).ref;
        else addIssue('ORPHAN_DEVICE_VIA', { subjectRef: device.ref, subjectId: device.deviceId, missingRef: device.viaDeviceId });
      }
    }
    for (const entity of entities) {
      if (entity.deviceId !== null) {
        if (deviceById.has(entity.deviceId)) entity.deviceRef = deviceById.get(entity.deviceId).ref;
        else addIssue('ORPHAN_ENTITY_DEVICE', { subjectRef: entity.ref, subjectId: entity.entityId, missingRef: entity.deviceId });
      }
    }

    for (const event of imported.events || []) {
      if (event.reason === 'refs_truncated') {
        const target = deviceById.get(event.id);
        addIssue('REFS_TRUNCATED', { subjectRef: target ? target.ref : 'IMPORT', subjectId: event.id, count: event.count });
      }
    }

    // Back-references, dangling entries, device rollups.
    for (const entry of entries) {
      for (const entity of entities) {
        if (entity.entryRef === entry.ref) entry.entityRefs.push(entity.ref);
      }
      for (const device of devices) {
        if (device.entryRefs.includes(entry.ref)) entry.deviceRefs.push(device.ref);
      }
      if (entry.entityRefs.length === 0 && entry.deviceRefs.length === 0) {
        addIssue('DANGLING_ENTRY', { subjectRef: entry.ref, subjectId: entry.entryId, domain: entry.domain });
      }
    }
    for (const device of devices) {
      const categories = new Set();
      for (const entryRef of device.entryRefs) {
        const entry = entries.find(item => item.ref === entryRef);
        if (entry) categories.add(entry.category);
      }
      device.categoryLabel = categories.size === 0 ? 'unattributed' : categories.size === 1 ? [...categories][0] : 'mixed';
    }
    const unlinkedEntityRefs = entities.filter(entity => entity.configEntryId === null && entity.deviceId === null).map(entity => entity.ref);
    const unattributedDeviceRefs = devices.filter(device => device.entryRefs.length === 0).map(device => device.ref);

    // Attach issue codes to their records (for UI badges).
    for (const issue of issues) {
      if (!issue.subjectRef || issue.subjectRef === 'IMPORT') continue;
      for (const list of [entries, entities, devices]) {
        const record = list.find(item => item.ref === issue.subjectRef);
        if (record) { record.issueCodes.push(issue.code); break; }
      }
    }

    // Cap the visible issue list with a marker; totals stay honest.
    const issuesTotal = issues.length;
    let shown = issues;
    if (issues.length > LIMITS.maxIssues) {
      shown = issues.slice(0, LIMITS.maxIssues - 1);
      shown.push({ code: 'ISSUES_TRUNCATED', severity: SEVERITY.ISSUES_TRUNCATED, subjectRef: 'IMPORT', subjectId: null, count: issues.length - (LIMITS.maxIssues - 1) });
    }

    const byCategory = { local: 0, cloud: 0, unknown: 0, custom: 0 };
    for (const entry of entries) byCategory[entry.category] += 1;

    const domainsUsed = Object.create(null);
    for (const entry of entries) {
      if (entry.evidence && !domainsUsed[entry.domain]) domainsUsed[entry.domain] = Object.assign({}, entry.evidence);
    }
    for (const entity of entities) {
      const classification = classificationFor(entity.platform, cls, nowIso);
      if (classification.evidence && !domainsUsed[entity.platform]) domainsUsed[entity.platform] = Object.assign({}, classification.evidence);
    }

    const stats = {
      discarded: {
        total: (imported.stats && imported.stats.discarded.total) || 0,
        credentials: (imported.stats && imported.stats.discarded.credentials) || 0,
        uniqueIds: (imported.stats && imported.stats.discarded.uniqueIds) || 0,
        networkIdentifiers: (imported.stats && imported.stats.discarded.networkIdentifiers) || 0,
        other: (imported.stats && imported.stats.discarded.other) || 0
      },
      truncated: {
        displayFields: (imported.stats && imported.stats.truncated.displayFields) || 0,
        refs: (imported.stats && imported.stats.truncated.refs) || 0
      },
      rejectedRecords: (imported.stats && imported.stats.rejectedRecords) || 0,
      duplicates,
      issuesTotal,
      issuesShown: shown.length
    };

    const state = {
      kind: imported.kind,
      haVersion: snapshot.haVersion,
      generatedAt: snapshot.generatedAt,
      nowIso,
      parts: (imported.parts || []).map(part => ({ kind: part.kind })),
      entries,
      entities,
      devices,
      unlinkedEntityRefs,
      unattributedDeviceRefs,
      issues: shown,
      byCategory,
      evidence: { domainsUsed },
      stats,
      disclaimers: buildDisclaimers(cls, staleAfterDays)
    };
    return ok(deepFreeze(state));
  }

  // ----------------------------------------------------------------- reports

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function reasonText(reason) {
    if (reason === 'missing_required') return 'a required field is missing';
    if (reason === 'invalid_identifier') return 'an identifier has an invalid format';
    if (reason === 'invalid_field') return 'a field has an invalid format';
    if (reason === 'refs_truncated') return 'extra references were dropped';
    return 'the record is incomplete';
  }

  function issueDetail(issue, includeIdentifiers) {
    const subject = includeIdentifiers ? (issue.subjectId || issue.subjectRef || 'IMPORT') : (issue.subjectRef || 'IMPORT');
    const missing = issue.missingRef || null;
    switch (issue.code) {
      case 'RECORD_REJECTED':
        return 'An ' + issue.recordKind + ' record was skipped: ' + reasonText(issue.reason) + '.';
      case 'DUPLICATE_ENTRY_ID':
        return 'Entry ' + subject + ' duplicates an earlier entry id; the later record was ignored.';
      case 'DUPLICATE_ENTITY_ID':
        return 'Entity ' + subject + ' duplicates an earlier entity id; the later record was ignored.';
      case 'DUPLICATE_DEVICE_ID':
        return 'Device ' + subject + ' duplicates an earlier device id; the later record was ignored.';
      case 'REFS_TRUNCATED':
        return 'Device ' + subject + ' listed ' + issue.count + ' extra config entry references that were dropped (cap ' + LIMITS.maxRefsPerDevice + ').';
      case 'ORPHAN_ENTITY_ENTRY':
        return 'Entity ' + subject + ' references a config entry that is not present in this import' + (includeIdentifiers && missing ? ' (' + missing + ')' : '') + '.';
      case 'ORPHAN_ENTITY_DEVICE':
        return 'Entity ' + subject + ' references a device that is not present in this import' + (includeIdentifiers && missing ? ' (' + missing + ')' : '') + '.';
      case 'ORPHAN_DEVICE_ENTRY':
        return 'Device ' + subject + ' references a config entry that is not present in this import' + (includeIdentifiers && missing ? ' (' + missing + ')' : '') + '.';
      case 'ORPHAN_DEVICE_VIA':
        return 'Device ' + subject + ' is a child of a device that is not present in this import' + (includeIdentifiers && missing ? ' (' + missing + ')' : '') + '.';
      case 'PLATFORM_DOMAIN_MISMATCH':
        return 'Entity ' + subject + ' has platform "' + issue.platform + '" but its config entry is for domain "' + issue.entryDomain + '" \u2014 attribution is ambiguous.';
      case 'UNLINKED_ENTITY':
        return 'Entity ' + subject + ' has no config entry or device reference; it was classified from its platform.';
      case 'DANGLING_ENTRY':
        return 'Entry ' + subject + ' is not referenced by any entity or device in this import.';
      case 'DYNAMIC_PLATFORM':
        return 'Entity ' + subject + ' uses a dynamic platform (' + issue.platform + '); its effective locality depends on referenced sources and is not evaluated.';
      case 'UNKNOWN_DOMAIN':
        return 'Entry ' + subject + ' uses domain "' + issue.domain + '" which is not in the bundled evidence set \u2014 treated as custom/unlisted.';
      case 'STALE_EVIDENCE':
        return 'Entry ' + subject + ' uses evidence that is ' + issue.staleDays + ' days old (stale threshold ' + LIMITS.staleAfterDays + ' days).';
      case 'ISSUES_TRUNCATED':
        return issue.count + ' further issues were omitted from this list (cap ' + LIMITS.maxIssues + '); totals remain complete.';
      default:
        return 'Issue recorded.';
    }
  }

  function buildReportData(state, includeIdentifiers, generatedAtIso) {
    const redacted = !includeIdentifiers;
    const entryLabel = entry => redacted ? 'Entry ' + entry.ref : (entry.title || 'Entry ' + entry.ref);
    const entityLabel = entity => redacted ? 'Entity ' + entity.ref : (entity.displayName || 'Entity ' + entity.ref);
    const deviceLabel = device => redacted ? 'Device ' + device.ref : (device.displayName || 'Device ' + device.ref);

    const entries = state.entries.map(entry => {
      // Known Home Assistant source enums are nonpersonal acquisition
      // provenance and stay in redacted reports; any other source label is an
      // identifier and is omitted unless the opt-in includes identifiers.
      const sourceKnown = entry.source !== null && KNOWN_SOURCE_ENUMS.has(entry.source);
      const item = {
        ref: entry.ref,
        label: entryLabel(entry),
        domain: entry.domain,
        category: entry.category,
        iotClass: entry.iotClass,
        reason: entry.reason,
        stale: entry.stale,
        source: includeIdentifiers || sourceKnown ? entry.source : null,
        disabled: entry.disabledBy !== null,
        prefDisablePolling: entry.prefDisablePolling,
        entityRefs: entry.entityRefs.slice(),
        deviceRefs: entry.deviceRefs.slice(),
        issues: entry.issueCodes.slice()
      };
      if (includeIdentifiers) item.entryId = entry.entryId;
      return item;
    });
    const entities = state.entities.map(entity => {
      const item = {
        ref: entity.ref,
        label: entityLabel(entity),
        platform: entity.platform,
        category: entity.category,
        reason: entity.reason,
        dynamic: entity.dynamic,
        stale: entity.stale,
        entryRef: entity.entryRef,
        deviceRef: entity.deviceRef,
        disabled: entity.disabledBy !== null,
        hidden: entity.hiddenBy !== null,
        issues: entity.issueCodes.slice()
      };
      if (includeIdentifiers) item.entityId = entity.entityId;
      return item;
    });
    const devices = state.devices.map(device => {
      const item = {
        ref: device.ref,
        label: deviceLabel(device),
        manufacturer: device.manufacturer,
        model: device.model,
        entryType: device.entryType,
        categoryLabel: device.categoryLabel,
        entryRefs: device.entryRefs.slice(),
        viaRef: device.viaRef,
        disabled: device.disabledBy !== null,
        issues: device.issueCodes.slice()
      };
      if (includeIdentifiers) item.deviceId = device.deviceId;
      return item;
    });
    const issues = state.issues.map(issue => ({
      code: issue.code,
      severity: issue.severity,
      subject: includeIdentifiers ? (issue.subjectId || issue.subjectRef || 'IMPORT') : (issue.subjectRef || 'IMPORT'),
      detail: issueDetail(issue, includeIdentifiers)
    }));
    const evidence = Object.keys(state.evidence.domainsUsed).sort().map(domain => Object.assign({}, state.evidence.domainsUsed[domain]));
    return {
      schema: SCHEMAS.report,
      generatedAt: generatedAtIso,
      tool: { name: 'OfflineReadiness', version: VERSION },
      redacted,
      redaction: {
        mode: redacted ? 'ordinalized' : 'identifiers-included',
        identifiersOrdinalized: redacted,
        namesOrdinalized: redacted,
        sourceLabels: redacted
          ? 'Known Home Assistant source enums (for example user, discovery, zeroconf) are kept as nonpersonal acquisition provenance; any other source label is an identifier and is omitted in this mode.'
          : 'Source labels are included with the other identifiers.',
        secretsPolicy: 'Credential-bearing config entry data/options and device connection/serial/URL fields are discarded at import time and cannot appear in any report, redacted or not. Discard buckets are conservative field-slot counts (for example any record options slot counts as sensitive), not an exact credential count.'
      },
      source: {
        kind: state.kind,
        haVersion: state.haVersion,
        snapshotGeneratedAt: state.generatedAt,
        parts: state.parts.map(part => part.kind)
      },
      disclaimers: state.disclaimers.slice(),
      counts: {
        entries: state.entries.length,
        entities: state.entities.length,
        devices: state.devices.length,
        issues: state.stats.issuesTotal,
        byCategory: Object.assign({}, state.byCategory)
      },
      stats: {
        discarded: Object.assign({}, state.stats.discarded),
        truncated: Object.assign({}, state.stats.truncated),
        rejectedRecords: state.stats.rejectedRecords,
        duplicates: state.stats.duplicates
      },
      evidence,
      entries,
      entities,
      devices,
      unlinked: {
        entities: state.entities.filter(entity => state.unlinkedEntityRefs.includes(entity.ref)).map(entity => ({ ref: entity.ref, label: entityLabel(entity), platform: entity.platform, category: entity.category, reason: entity.reason })),
        devices: state.devices.filter(device => state.unattributedDeviceRefs.includes(device.ref)).map(device => ({ ref: device.ref, label: deviceLabel(device), categoryLabel: device.categoryLabel }))
      },
      issues
    };
  }

  function htmlReport(data) {
    const rows = [];
    const h = value => escapeHtml(value);
    rows.push('<!DOCTYPE html>');
    rows.push('<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">');
    rows.push('<title>OfflineReadiness report \u2014 Home Assistant dependency evidence</title>');
    rows.push('<style>body{font:14px/1.5 "Segoe UI",system-ui,sans-serif;background:#0b1524;color:#dce6f8;margin:0;padding:24px}h1{font-size:22px}h2{font-size:16px;margin-top:28px;border-bottom:1px solid #263957;padding-bottom:6px}table{border-collapse:collapse;width:100%;margin:10px 0}th,td{border:1px solid #263957;padding:6px 8px;text-align:left;vertical-align:top;font-size:13px}th{background:#14213a}code{font-family:Consolas,monospace;font-size:12px}.badge{display:inline-block;border:1px solid #315488;border-radius:999px;padding:1px 8px;font-size:12px;margin-left:6px}.muted{color:#95a8c8}.warn{color:#ffcf7a}ul{margin:6px 0 6px 18px;padding:0}li{margin:2px 0}</style>');
    rows.push('</head><body>');
    rows.push('<h1>OfflineReadiness \u2014 Home Assistant dependency evidence report</h1>');
    rows.push('<p class="muted">Generated ' + h(data.generatedAt) + ' \u00b7 tool v' + h(data.tool.version) + ' \u00b7 mode: ' + (data.redacted ? 'redacted (names and identifiers ordinalized; non-enum source labels omitted)' : 'identifiers included') + ' \u00b7 source: ' + h(data.source.kind) + (data.source.haVersion ? ' (Home Assistant ' + h(data.source.haVersion) + ')' : '') + '</p>');
    rows.push('<p class="warn">This is a read-only evidence report, not a whole-house offline-safe certification. No aggregate score is computed.</p>');
    rows.push('<h2>Disclaimers</h2><ul>');
    for (const item of data.disclaimers) rows.push('<li>' + h(item) + '</li>');
    rows.push('</ul>');
    rows.push('<h2>Summary</h2><table><tr><th>Entries</th><th>Entities</th><th>Devices</th><th>Issues</th><th>Local</th><th>Cloud</th><th>Unknown</th><th>Custom</th></tr>');
    rows.push('<tr><td>' + data.counts.entries + '</td><td>' + data.counts.entities + '</td><td>' + data.counts.devices + '</td><td>' + data.counts.issues + '</td><td>' + data.counts.byCategory.local + '</td><td>' + data.counts.byCategory.cloud + '</td><td>' + data.counts.byCategory.unknown + '</td><td>' + data.counts.byCategory.custom + '</td></tr></table>');
    rows.push('<p class="muted">Discarded before state creation (counts only; conservative field-slot buckets, not an exact credential count): ' + data.stats.discarded.total + ' field slots \u2014 sensitive/credential-bearing ' + data.stats.discarded.credentials + ', unique ids ' + data.stats.discarded.uniqueIds + ', network identifiers ' + data.stats.discarded.networkIdentifiers + ', other unneeded ' + data.stats.discarded.other + '. Truncated display fields: ' + data.stats.truncated.displayFields + '.</p>');
    rows.push('<h2>Classification evidence</h2><table><tr><th>Domain</th><th>iot_class</th><th>Category</th><th>Reason</th><th>Retrieved</th><th>Stale</th><th>Source</th></tr>');
    for (const item of data.evidence) {
      rows.push('<tr><td>' + h(item.domain) + '</td><td>' + h(item.iotClass === null ? '(none declared)' : item.iotClass) + '</td><td>' + h(item.category) + '</td><td>' + h(item.reason) + '</td><td>' + h(item.retrieved || '') + '</td><td>' + (item.stale ? 'yes' : 'no') + '</td><td>' + (item.sourceUrl ? '<a href="' + h(item.sourceUrl) + '">' + h(item.sourceUrl) + '</a>' : '') + '</td></tr>');
      if (item.notes) rows.push('<tr><td colspan="7" class="muted">' + h(item.notes) + '</td></tr>');
    }
    rows.push('</table>');
    rows.push('<h2>Entries</h2>');
    for (const entry of data.entries) {
      rows.push('<h3>' + h(entry.label) + ' <span class="badge">' + h(entry.domain) + '</span> <span class="badge">' + h(entry.category) + '</span>' + (entry.stale ? ' <span class="badge warn">stale evidence</span>' : '') + (entry.disabled ? ' <span class="badge">disabled</span>' : '') + '</h3>');
      rows.push('<p class="muted">iot_class: ' + h(entry.iotClass === null ? '(none declared)' : entry.iotClass) + ' \u00b7 reason: ' + h(entry.reason) + (entry.source ? ' \u00b7 source: ' + h(entry.source) : '') + '</p>');
      if (entry.entityRefs.length) rows.push('<p>Entities: ' + entry.entityRefs.map(ref => h(ref)).join(', ') + '</p>');
      if (entry.deviceRefs.length) rows.push('<p>Devices: ' + entry.deviceRefs.map(ref => h(ref)).join(', ') + '</p>');
      if (entry.issues.length) rows.push('<p class="warn">Issues: ' + entry.issues.map(code => h(code)).join(', ') + '</p>');
    }
    rows.push('<h2>Entities</h2><table><tr><th>Ref</th><th>Label</th><th>Platform</th><th>Category</th><th>Dynamic</th><th>Entry</th><th>Device</th><th>Issues</th></tr>');
    for (const entity of data.entities) {
      rows.push('<tr><td>' + h(entity.ref) + '</td><td>' + h(entity.label) + '</td><td>' + h(entity.platform) + '</td><td>' + h(entity.category) + '</td><td>' + (entity.dynamic ? 'yes' : 'no') + '</td><td>' + h(entity.entryRef || '\u2014') + '</td><td>' + h(entity.deviceRef || '\u2014') + '</td><td>' + h(entity.issues.join(', ')) + '</td></tr>');
    }
    rows.push('</table>');
    rows.push('<h2>Devices</h2><table><tr><th>Ref</th><th>Label</th><th>Manufacturer</th><th>Model</th><th>Entries</th><th>Category</th><th>Issues</th></tr>');
    for (const device of data.devices) {
      rows.push('<tr><td>' + h(device.ref) + '</td><td>' + h(device.label) + '</td><td>' + h(device.manufacturer || '') + '</td><td>' + h(device.model || '') + '</td><td>' + h(device.entryRefs.join(', ')) + '</td><td>' + h(device.categoryLabel) + '</td><td>' + h(device.issues.join(', ')) + '</td></tr>');
    }
    rows.push('</table>');
    if (data.unlinked.entities.length || data.unlinked.devices.length) {
      rows.push('<h2>Unlinked</h2><ul>');
      for (const entity of data.unlinked.entities) rows.push('<li>' + h(entity.label) + ' (platform ' + h(entity.platform) + ', ' + h(entity.category) + ')</li>');
      for (const device of data.unlinked.devices) rows.push('<li>' + h(device.label) + ' (unattributed device)</li>');
      rows.push('</ul>');
    }
    rows.push('<h2>Issues</h2><table><tr><th>Code</th><th>Severity</th><th>Subject</th><th>Detail</th></tr>');
    for (const issue of data.issues) {
      rows.push('<tr><td>' + h(issue.code) + '</td><td>' + h(issue.severity) + '</td><td>' + h(issue.subject) + '</td><td>' + h(issue.detail) + '</td></tr>');
    }
    rows.push('</table>');
    rows.push('<footer class="muted"><p>Generated locally by OfflineReadiness from imported metadata. The page made no network requests; this file is self-contained and script-free.</p></footer>');
    rows.push('</body></html>');
    return rows.join('\n');
  }

  function buildReport(state, options) {
    if (!isPlainObject(state) || !Array.isArray(state.entries) || !Array.isArray(state.entities) || !Array.isArray(state.devices) || !Array.isArray(state.issues)) {
      return err('INVALID_ARGUMENT', 'buildReport expects the state produced by buildState.');
    }
    const opts = isPlainObject(options) ? options : {};
    const format = opts.format === undefined ? 'json' : opts.format;
    if (format !== 'json' && format !== 'html') return err('INVALID_ARGUMENT', 'format must be "json" or "html".');
    const includeIdentifiers = opts.includeIdentifiers === true;
    const generatedAtIso = typeof opts.generatedAtIso === 'string' ? opts.generatedAtIso : new Date().toISOString();
    const data = buildReportData(state, includeIdentifiers, generatedAtIso);
    if (format === 'json') {
      return ok({
        filename: includeIdentifiers ? 'offline-readiness-report-with-identifiers.json' : 'offline-readiness-report.json',
        mime: 'application/json',
        text: JSON.stringify(data, null, 2)
      });
    }
    return ok({
      filename: includeIdentifiers ? 'offline-readiness-report-with-identifiers.html' : 'offline-readiness-report.html',
      mime: 'text/html',
      text: htmlReport(data)
    });
  }

  // ------------------------------------------------------------------- api

  return {
    VERSION,
    SCHEMAS,
    LIMITS,
    detectJsonKind,
    parseSnapshot,
    parseConfigEntriesExport,
    parseEntityRegistryExport,
    parseDeviceRegistryExport,
    importFiles,
    buildState,
    buildReport,
    classifyDomain
  };
});
