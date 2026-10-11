# OfflineReadiness — input contract

Version: tool 0.1.0 · snapshot schema `offline-readiness.snapshot/1` · report schema `offline-readiness.report/1`

This document is the exact contract the implementation in `core.js` enforces. It
covers the two supported inputs (a normalized snapshot, or the three Home
Assistant `.storage` registry exports joined in one selection), the field
allowlists, the caps, and the explicit errors for everything that is **not**
supported. The tool is a read-only dependency **evidence** report; it is not a
whole-house offline-safe certification and never emits a score.

Everything below was implemented and exercised by the test suites recorded in
`docs/verification.md`.

---

## 1. Normalized snapshot (`offline-readiness.snapshot/1`)

One JSON file:

```json
{
  "schema": "offline-readiness.snapshot/1",
  "haVersion": "2026.9.2",            // required, 1–40 chars
  "generatedAt": "2026-10-05T09:30:00Z", // optional
  "entries":  [ /* entry records */ ],
  "entities": [ /* entity records */ ],
  "devices":  [ /* device records */ ]
}
```

`entries`, `entities` and `devices` are required arrays. A snapshot whose raw
arrays are all empty is rejected (`EMPTY_INPUT`); a snapshot whose records are
all rejected still parses, so the rejections stay visible as issues. Unknown
top-level keys are discarded and counted.

### Entry records

| Field | Required | Rules |
|---|---|---|
| `entryId` | yes | `[A-Za-z0-9_.:-]{1,200}` |
| `domain` | yes | `[a-z0-9_]{1,64}` |
| `title` | no | display string, control chars stripped, capped at 200 |
| `source` | no | `[a-z_]{0,40}` (e.g. `user`, `zeroconf`, `import`) |
| `disabledBy` | no | `[a-z_]{0,40}` or null |
| `prefDisableNewEntities`, `prefDisablePolling` | no | boolean (default false) |
| `createdAt`, `modifiedAt` | no | ISO-shaped string ≤ 40 chars, or epoch seconds/milliseconds number |

### Entity records

| Field | Required | Rules |
|---|---|---|
| `entityId` | yes | `domain.object_id` with `[a-z0-9_]` parts, ≤ 200 chars |
| `platform` | yes | `[a-z0-9_]{1,64}` |
| `configEntryId`, `deviceId` | no | identifier pattern or null |
| `name`, `originalName` | no | display strings, capped at 200 (display prefers `name`, then `originalName`) |
| `disabledBy`, `hiddenBy` | no | `[a-z_]{0,40}` or null |
| `createdAt`, `modifiedAt` | no | as above |

### Device records

| Field | Required | Rules |
|---|---|---|
| `deviceId` | yes | `[A-Za-z0-9_.:-]{1,200}` |
| `configEntries` | no | array of identifiers, capped at **32** (extra refs dropped, `REFS_TRUNCATED` issue, count kept) |
| `manufacturer`, `model`, `name`, `nameByUser` | no | display strings, capped at 200 |
| `entryType` | no | `[a-z_]{0,40}` |
| `disabledBy` | no | `[a-z_]{0,40}` |
| `viaDeviceId` | no | identifier pattern or null |
| `swVersion`, `hwVersion` | no | printable ASCII ≤ 64 chars |
| `createdAt`, `modifiedAt` | no | as above |

**Discarded from any record before state creation** (counted, values never
read): every key not in the tables above — including `data`, `options`,
`subentries`, `unique_id`, `capabilities`, `connections`, `serial_number`,
`configuration_url`, `identifiers`, `area_id`, `labels` and unknown keys. The
counts are surfaced as `stats.discarded` (total, credentials, uniqueIds,
networkIdentifiers, other). Counted fields are *field slots* (key presence),
whether or not the value is empty.

---

## 2. Registry bundle (native `.storage` exports)

Select the three files together in one multi-file pick:

| File | Storage key | Version (as of home-assistant/core 2026.10.1) | Required |
|---|---|---|---|
| `core.config_entries` | `core.config_entries` | major 1 / minor 5 | always |
| `core.entity_registry` | `core.entity_registry` | major 1 / minor 23 | always |
| `core.device_registry` | `core.device_registry` | major 3 / minor 4 | when any entity references a device |

The `key` field is verified when present; a file declaring a different key is
rejected (`UNSUPPORTED_SCHEMA`). Keyless files with the right `data` shape are
accepted. Two files of the same kind are rejected (`DUPLICATE_KIND`); a
snapshot mixed with registry files is rejected (`UNSUPPORTED_INPUT`); an
incomplete bundle is rejected (`MISSING_REGISTRY`) naming the missing kind.

**Zero-record components and aggregate emptiness.** A `.storage` export whose
array is empty (a fresh home, or a home with no devices yet) is a valid
component and may join nonempty metadata from the other exports. Emptiness is
judged on the aggregate: only an import whose selected exports together hold
no records is refused, with an explicit `EMPTY_INPUT` (“The selected registry
exports contain no records.”). Records that fail validation remain visible as
`RECORD_REJECTED` issues with counts and fixed reason codes — raw values never
survive.

**Version fields are descriptive, not certification.** The adapters verify the
storage `key` (when present) and the required `data` shape only; `version` and
`minor_version` values are tolerated, not checked. The versions in the table
above describe the live storage format at the bundled tag, not a validation
rule.

### Field mapping (storage → normalized)

**Config entries** — kept: `entry_id`, `domain`, `title`, `source`,
`disabled_by`, `pref_disable_new_entities`, `pref_disable_polling`,
`created_at`, `modified_at`. Discarded: `data`, `options`, `subentries`,
`unique_id`, `discovery_keys`, `version`, `minor_version`, and any unknown key.

**Entities** — kept: `entity_id`, `platform`, `config_entry_id`, `device_id`,
`name`, `original_name`, `disabled_by`, `hidden_by`, `created_at`,
`modified_at`. Discarded: `unique_id`, `previous_unique_id`, `aliases`,
`aliases_v2`, `area_id`, `categories`, `capabilities`, `config_subentry_id`,
`device_class`, `entity_category`, `icon`, `id`, `has_entity_name`, `labels`,
`object_id_base`, `options`, `original_device_class`, `original_icon`,
`suggested_object_id`, `supported_features`, `translation_key`,
`unit_of_measurement`, and any unknown key.

**Devices** — kept: `id`, `config_entry_id` (new single-entry form),
`config_entries` (legacy array form), `primary_config_entry` (deprecated
duplicate), `via_device_id`, `manufacturer`, `model`, `name`, `name_by_user`,
`entry_type`, `disabled_by`, `sw_version`, `hw_version`, `created_at`,
`modified_at`. Discarded: `connections`, `identifiers`, `serial_number`,
`configuration_url`, `area_id`, `labels`, `model_id`, `config_subentry_id`,
`composite_device_id`, `composite_primary_config_entry`, `split_at`,
`has_composite_identifiers`, and any unknown key.

Timestamps: entity/config-entry exports store ISO strings (kept as-is when the
shape validates); device exports store epoch seconds (converted to ISO). Both
are accepted; anything else is dropped.

**Direct references only.** Device `via_device_id` links are recorded as direct
references (resolved when the parent is present, flagged `ORPHAN_DEVICE_VIA`
when it is not). Cycles (self or mutual) are not detected and references are
not resolved transitively.

---

## 3. Explicitly unsupported (structured errors, never guessed)

| Input | Code |
|---|---|
| Non-JSON text (YAML, `configuration.yaml`, `automations.yaml`, `---` docs) | `UNSUPPORTED_INPUT` (YAML-looking) or `NOT_JSON` |
| Malformed JSON | `NOT_JSON` |
| ZIP / gzip / tar archives (magic bytes) | `UNSUPPORTED_INPUT` |
| Binary / non-UTF-8 content (NUL or replacement characters) | `NOT_TEXT` |
| Full/encrypted backup lookalikes (`backups`, `home_assistant`, `supervisor` keys) | `UNSUPPORTED_INPUT` |
| Automations/scripts (`trigger` + `action` arrays) | `UNSUPPORTED_INPUT` |
| JSON arrays / primitives / unrecognized objects | `UNSUPPORTED_INPUT` |
| Unknown snapshot schema version | `UNSUPPORTED_SCHEMA` |

Templates and automations are never evaluated. Entities on the dynamic
platforms `template` and `group` are classified `unknown` with an explicit
dynamic reason (see the classifications policy).

---

## 4. Caps (fail closed, counts only in messages)

| Limit | Value | Behavior |
|---|---|---|
| Bytes per file | 8,388,608 (8 MiB) | `LIMIT_EXCEEDED` |
| Files per import | 8 | `TOO_MANY_FILES` |
| Entries / entities / devices | 5,000 / 20,000 / 10,000 | `LIMIT_EXCEEDED` |
| Display string length | 200 chars | truncated, counted (`stats.truncated.displayFields`) |
| Refs per device | 32 | dropped, `REFS_TRUNCATED` issue |
| Issues listed | 500 | first 499 + `ISSUES_TRUNCATED`; totals stay complete |
| Evidence staleness | 180 days | `stale` flag + `STALE_EVIDENCE` issue |

All error messages contain fixed text, counts, limits and ordinals only —
imported content (including file names) never appears in an error.

---

## 5. Classification policy (bundled evidence)

Bundled in `data/classifications.json` (mirrored byte-identically by the
classic-script wrapper `data/classifications.js`): 34 domains, each with the
actual `iot_class` read from the manifest fetched from `home-assistant/core`
tag `2026.10.1` on 2026-10-11, its source URL, retrieval date and scope.

| iot_class | Category | Reason |
|---|---|---|
| `local_polling`, `local_push` | local | the class name |
| `cloud_polling`, `cloud_push` | cloud | the class name |
| `assumed_state` | unknown | `assumed_state` (no source class is inferred) |
| `calculated` | unknown | `calculated_no_direct_communication` |
| missing | unknown | `missing_iot_class` (e.g. `input_boolean`) |
| unrecognized value | unknown | `unrecognized_iot_class` |
| `template`, `group` platforms/domains | unknown | `dynamic_template` / `dynamic_group` (never evaluated) |
| domain not in the bundle | custom | `not_in_bundle` — never assumed local |

Per-domain policy overrides exist in the data: **mqtt** is reported `unknown`
with reason `configured_broker_locality_unverified` — the manifest declares
`local_push`, but the broker endpoint is user-configured and its locality
cannot be verified here.

Classification is a **domain-name lookup** against the bundled core manifests.
A custom integration that reuses a bundled domain (for example a custom `hue`
fork) would still receive the bundled classification; installed code is not
inspected, and the evidence applies to the named core manifest, not to
installed custom code.

“Local” means the integration’s declared communication model. It does not mean
the entry works without internet.

---

## 6. Security and privacy invariants

- Credential-bearing fields (config entry `data`/`options`/`subentries`,
  device `connections`/`serial_number`/`configuration_url`/`identifiers`,
  entity `unique_id` and friends) are discarded **before** state creation and
  are counted only. They can never appear in state, the DOM, error text,
  console output, browser storage or any report — redacted or opt-in. Discard
  buckets are conservative field-slot counts over the keys discarded at import
  (any record `options` slot counts in the sensitive bucket) — they are not an
  exact credential count.
- The page writes nothing to `localStorage`/`sessionStorage` and works with
  both blocked (proved in the browser suite).
- Reports are redacted by default: names and identifiers are ordinalized
  (`Entry C01`, `Entity E01`, `Device D01`). Config-entry `source` values
  matching the known Home Assistant source enum — the `SOURCE_*` constants of
  the retained `config_entries.py` at the bundled tag: `bluetooth`, `dhcp`,
  `discovery`, `esphome`, `hardware`, `hassio`, `homekit`, `import`,
  `integration_discovery`, `mqtt`, `ssdp`, `system`, `usb`, `user`,
  `zeroconf`, `ignore`, `reauth`, `reconfigure` — remain as nonpersonal
  acquisition provenance. Any other `source` string is treated as an
  identifier: omitted (`null`) in redacted reports and included only with the
  explicit opt-in. Device `manufacturer`/`model` remain as product metadata —
  review them before sharing. The explicit opt-in includes the original names
  and identifiers from normalized state — never secrets.
- The imported Home Assistant version (snapshot `haVersion`) is displayed for
  context only and is never compared with the bundled evidence tag; a mismatch
  is not automatically flagged.
- Error objects carry `code`, `message` and small numeric/enum details only.
- No template, automation or script is evaluated; no archive is extracted.

---

## 7. Determinism

`buildReport` output is a pure function of (state, options): identical state
and `generatedAtIso` produce byte-identical JSON and HTML (asserted in the
unit suite). Ordinals are assigned in input order; the evidence table is
sorted by domain.
