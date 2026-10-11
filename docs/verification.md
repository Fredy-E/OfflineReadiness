# OfflineReadiness — verification record

Standalone-portable record. No owner-home absolute path is shipped in this
document: all handles below are relative to the standalone package root or to
the documented workspace-local evidence tree. Workspace-local evidence is
workspace-local only and is not included in the standalone package.

Historical builder execution was 2026-10-11 on the build machine. Everything
below is copied from the recorded workspace-local logs; relative handles are
given for each artifact. This document describes **what was actually verified**
and, equally importantly, **what was not**.

Tool version 0.1.0 · report schema `offline-readiness.report/1` · snapshot
schema `offline-readiness.snapshot/1`.

Evidence handles (workspace-local, not included in the standalone package):
`evidence/OfflineReadiness/`

Source handles (standalone package):
`work/OfflineReadiness/`

Current baseline (cited from recorded parent evidence, not re-executed in this
doc-only correction): unit 43/43
(`parent-qa/OfflineReadiness/post-fix-round-2/full-core.log`), frozen
registry-source gate 6/6
(`parent-qa/OfflineReadiness/post-fix-round-2/frozen-node-gates.log`), browser
14/14 (`parent-qa/OfflineReadiness/post-fix-round-2/full-browser.log`), cached
classification cross-check 381 checks / 0 fails
(`parent-qa/OfflineReadiness/post-fix-round-2/classification-cross-check.log`),
35 source files. The historical 36-test / 11-case rows in section 2 are the
preserved builder history and are not the current tree; the current tree runs
43 unit tests and 14 browser cases. This correction performed no new browser
run, no new retrieval, and contacted no Home Assistant instance.

## 1. Environment

- Windows 11 (ARM64 host), bash (MSYS) terminal; Node v26.7.0, npm 11.19.0.
- Browser: local Chrome, headless, owned instance per suite run
  (`Mozilla/5.0 (Windows NT 10.0; Win64; x64) … HeadlessChrome/154.0.0.0 …`,
  recorded in `browser/05-chrome-version.log`). Never the owner’s browser
  profile; each launch uses a fresh scratch profile.
- **No installations were performed.** No Playwright; the browser suites drive
  Chrome through `tests/cdp-browser.cjs`, a byte-identical copy (sha256
  `3db68b5bcb1d2d5b2aabd12dce2cceb1bfda08cce9d547957d0f407315305c67`) of the
  parent-provided, smoke-verified helper.
- No Home Assistant instance was contacted; no credentials or owner data were
  read; the repository was not committed or published.

## 2. Historical builder commands, counts and exit codes (exact — preserved history, superseded baseline)

Historical builder runs, from the standalone source root. The 36-test /
11-case counts below are the preserved original history; the current tree runs
43 unit tests and 14 browser cases as cited above.

| # | Command | Result | Exit | Log (workspace-local relative handle, not included in the standalone package) |
|---|---|---|---|---|
| RED 1 | `node --test tests/core.test.cjs` (no `core.js` yet) | tests 1 / pass 0 / fail 1 | **1** | `evidence/OfflineReadiness/red/01-core-red-missing-module.log` |
| RED 2 | `node --test tests/core.test.cjs` (skeleton: full API, `NOT_IMPLEMENTED`) | tests 35 / pass 3 / fail 32 | **1** | `evidence/OfflineReadiness/red/02-core-red-skeleton.log` |
| GREEN 1 | `node --test tests/core.test.cjs` (first implementation pass) | tests 36 / pass 27 / fail 9 | 1 | `evidence/OfflineReadiness/green/01-core-green-first-pass.log` |
| GREEN 2 | same, after ordering/EMPTY_INPUT fixes | tests 36 / pass 32 / fail 4 | 1 | `evidence/OfflineReadiness/green/02-core-green-second-pass.log` |
| GREEN 3 | same, after test-arithmetic corrections | tests 36 / pass 36 / fail 0 | **0** | `evidence/OfflineReadiness/green/03-core-green-third-pass.log` |
| FINAL | `node --test tests/core.test.cjs` | tests 36 / pass 36 / fail 0 / skipped 0 / todo 0 | **0** | `evidence/OfflineReadiness/green/04-core-green-final.log` |
| RED | `node tests/browser.cjs` (first run) | cases 11 / pass 9 / fail 2 | **1** | `evidence/OfflineReadiness/browser/01-browser-first-run.log` |
| GREEN | `node tests/browser.cjs` (after harness fixes) | cases 11 / pass 11 / fail 0 | **0** | `evidence/OfflineReadiness/browser/02-browser-second-run.log` |
| FINAL | `node tests/browser.cjs` | cases 11 / pass 11 / fail 0 | **0** | `evidence/OfflineReadiness/browser/03-browser-final.log` |
| FINAL | `npm test` (package script) | tests 36 / pass 36 / fail 0 | **0** | `evidence/OfflineReadiness/green/05-npm-test.log` |
| FINAL | `npm run test:browser` (package script) | cases 11 / pass 11 / fail 0 | **0** | `evidence/OfflineReadiness/browser/06-npm-test-browser.log` |
| probe | downloaded HTML report opened from `file://` | 0 scripts, 0 requests, 0 errors | 0 | `evidence/OfflineReadiness/browser/04-report-open-check.log` |

Assertion volume: `tests/core.test.cjs` — 36 tests / 266 `assert` calls;
`tests/browser.cjs` — 11 cases / 69 `assert` calls. No test is skipped.

Machine-readable browser results: `browser/browser-results.json`.
RED-run failure screenshots (kept as evidence):
`browser/keyboard-focus-and-activation-failure.png`,
`browser/storage-blocked-still-works-failure.png`.

The RED 2 log proves the suite fails on assertions before implementation; the
GREEN 1→3 logs show the narrow implementation cycles. The two real defects
found and fixed during the cycles (via the failing assertions, not by luck):

1. **Reference resolution order** — entities were resolved before devices, so
   every entity device reference read as an orphan. Fixed with post-pass
   resolution sweeps (unit tests: exact orphan counts on the duplicate-refs and
   hostile fixtures, plus a resolved `viaRef` pointing at a device whose id is
   literally `__proto__`).
2. **EMPTY_INPUT semantics** — a snapshot whose records were all rejected was
   reported as empty instead of surfacing the rejections. Now only raw-empty
   inputs are `EMPTY_INPUT`; rejected records stay visible as issues.

The browser RED run found two harness defects (raw `Enter` key events without
a text payload do not activate a focused button; an unobservable wait in the
storage-blocked case). Both were fixed in the suite; `tests/cdp-browser.cjs`
was not modified.

## 3. Browser suite cases (all passing)

Each case asserts zero page/console errors and zero HTTP(S) requests for its
window; the whole session is asserted clean again at the end.

1. `sample-board-filters-detail` — fictional sample loads (stats
   `10,14,6,5,3,1,1,11`); category chips filter entry cards (cloud→3,
   custom→1); search narrows to the tuya entry; “warnings only” keeps the one
   group with warnings (esphome); drill-down shows `local_push`, the MQTT
   qualifier and the real manifest URL; Escape closes the pane and returns
   focus to the opener; no canary in the DOM.
2. `import-normalized-snapshot` — canary-laden snapshot imports (stats
   `2,2,1,2,0,0,0,0`); canary absent from DOM; browser storage empty.
3. `import-registry-bundle` — the three `.storage` exports joined from one
   multi-file pick (stats `5,7,7,2,1,1,1,7`, 7 issue rows); canaries absent;
   entity detail renders.
4. `invalid-and-unsupported-inputs` — malformed JSON → `NOT_JSON`; backup
   lookalike, automation lookalike, YAML text and a ZIP-magic file →
   `UNSUPPORTED_INPUT`; incomplete bundle → `MISSING_REGISTRY`; error text
   never contains the canary; a valid import afterwards recovers and clears
   the error.
5. `racing-imports-last-wins` — two imports fired back-to-back: the final
   state and the downloaded JSON report both reflect only the second
   (`racing-b`), with no flicker back after 400 ms.
6. `downloads-redacted-default` — real Chrome downloads; JSON parses,
   `redacted: true`, no titles/ids anywhere; HTML report starts with
   `<!DOCTYPE html>`, contains no `<script`/`<img`/`<link`, includes
   `Entry C01` and the evidence URL.
7. `downloads-opt-in-never-secrets` — redacted download hides entity ids; the
   opt-in download (JSON and HTML) includes original names/ids and still
   contains **zero** canaries.
8. `keyboard-focus-and-activation` — Tab reaches the hidden file input with a
   ≥2px focus ring on its visible label; Enter (real key event) loads the
   sample; Tab reaches the chips with visible rings; Enter toggles the Local
   chip and filters the board.
9. `mobile-320-390-long-strings` — maximal legal strings fixture: body
   overflow ≤ 1px at 390 and 320, including with the detail pane open.
10. `storage-blocked-still-works` — imports run with `localStorage` and
    `sessionStorage` getters throwing; full pipeline unaffected.
11. `whole-session-zero-errors-zero-requests` — final whole-session gate:
    `errors: []`, `requests: []` across all navigations.

## 4. Artifacts produced (workspace-local relative handles, not included in the standalone package)

Screenshots (fictional data only), `evidence/OfflineReadiness/screenshots/`:
`board-desktop.png`, `mobile-320-board.png`, `mobile-320-detail.png`,
`mobile-390-sample.png`, `report-html-redacted.png`.

Actually downloaded reports, `evidence/OfflineReadiness/downloads/`:
`redacted-report.json`, `redacted-report.html`, `optin-report.json`,
`optin-report.html`, `racing-b-report.json` (plus the raw Chrome download
copies in `evidence/OfflineReadiness/browser/offline-readiness-report*.{json,html}`).

Spot checks (executed): redacted JSON parses with `redacted: true`, 10
entries, 11 issues, 9 evidence domains; opt-in JSON has `redacted: false`,
contains `entityId`, contains **no** `CANARY`; the racing report’s
`source.haVersion` is `racing-b`; the HTML report is script-free and starts
with `<!DOCTYPE html>`.

## 5. Classification evidence provenance (retrieved, not invented)

All fetched 2026-10-11 from `home-assistant/core` **tag 2026.10.1** (release
published 2026-10-10T16:14:23Z; recorded in
`retrieval/home-assistant-core-release.json`). Raw files, HTTP statuses and
sha256 hashes: `retrieval/manifests/retrieval-log.txt` — 34 retained manifest
files plus 1 `google_cast` 404 request (35 retrieval records) — and
`retrieval/source/`.

Bundled set: **34 domains** — actual `iot_class` counts: `local_push` 16,
`local_polling` 7, `cloud_push` 4, `cloud_polling` 3, `calculated` 3,
no `iot_class` declared 1 (`input_boolean`). Generator (reproducible):
`retrieval/build-classifications.cjs` + `retrieval/build-classifications.log`.
The generated `data/classifications.json` and the classic-script wrapper
`data/classifications.js` are byte-equal in content (asserted by a unit test).

IoT class definitions quoted verbatim from
`https://developers.home-assistant.io/docs/creating_integration_manifest/`
(retrieved 2026-10-11; extracted text in `retrieval/extracted/manifest-doc.txt`),
section “IoT class … The following IoT classes are accepted in the manifest:”:

- `assumed_state` — “We are unable to get the state of the device. Best we can do is to assume the state based on our last command.”
- `cloud_polling` — “The integration of this device happens via the cloud and requires an active internet connection. Polling the state means that an update might be noticed later.”
- `cloud_push` — “Integration of this device happens via the cloud and requires an active internet connection. Home Assistant will be notified as soon as a new state is available.”
- `local_polling` — “Offers direct communication with device. Polling the state means that an update might be noticed later.”
- `local_push` — “Offers direct communication with device. Home Assistant will be notified as soon as a new state is available.”
- `calculated` — “The integration does not handle communication on its own, but provides a calculated result.”

Registry storage shapes were verified against the actual core source at the
same tag (`retrieval/source/*.py`, hashes in the retrieval log):

- `homeassistant/config_entries.py` — `STORAGE_KEY`/`STORAGE_VERSION` (lines
  137–139, key `core.config_entries`, version 1/5); `ConfigEntry.as_dict`
  (lines 1303–1322) shows the stored fields including `data`, `options`,
  `subentries` (all discarded by this tool).
- `homeassistant/helpers/entity_registry.py` — storage constants (lines
  89–91, key `core.entity_registry`, version 1/23);
  `as_storage_fragment` (lines 436–473) lists stored fields including
  `unique_id`, `capabilities`, `aliases`, `labels`, `options` (all discarded).
- `homeassistant/helpers/device_registry.py` — storage constants (lines
  81–83, key `core.device_registry`, version **3**/4); `BaseDeviceEntry`
  (lines 400–421) stores a single `config_entry_id` (the legacy
  `config_entries` set is a deprecated shim); `as_storage_fragment` (lines
  633–666) includes `connections`, `identifiers`, `serial_number`,
  `configuration_url`, `primary_config_entry` (all discarded; the legacy
  array form and the deprecated duplicate are accepted and normalized).

Bounded differentiation, from the actual docs: the public integrations page
(`https://www.home-assistant.io/integrations/`, retrieved 2026-10-11;
`retrieval/extracted/integrations-page.txt`) offers an IoT Class filter
listing “Local Push, Local Polling, Cloud Push, Cloud Polling, Assumed State,
Calculated, Configurable” for the catalog. Note: **Configurable** appears on
that page but is not among the manifest-accepted classes quoted above, and no
bundled domain uses it. This tool does not rate or score integrations; it maps
an imported registry graph onto the same class taxonomy with dated provenance,
explicit unknowns and redacted exports. No competitor or demand claims are
made.

Cached-rerun distinction (no new network fetch in any rerun): the 381-check
verifier (`review/OfflineReadiness/probes/verify-classifications.cjs`) is
filesystem-only. It re-compares the bundled `data/classifications.*` against
the retained `evidence/OfflineReadiness/retrieval/` files and the earlier
reviewer's retained `review/OfflineReadiness/out/live/` bytes; a
`live ... == retained` label in its log means cached bytes matched, not that
this correction performed a new public fetch. The only public primary-doc
retrieval is the original 2026-10-11 fetch recorded in
`evidence/OfflineReadiness/retrieval/` (release tag 2026.10.1 above). Snapshot
dependency classification is a dated domain-name lookup against those 34
retained manifests plus conservative unknown/custom policy; it is
declared-model evidence, never measured offline or whole-home proof. Product
metadata (manufacturer/model and known Home Assistant source enums) remains in
exports by disclosed policy; arbitrary non-enum source-label privacy (omitted
as `null` in default reports, restored only in explicit opt-in reports) is a
separate privacy rule and is not the strict provenance enum.

## 6. Security checks actually executed

- **Canary sweeps**: canaries placed in config entry `data`/`options`/
  `subentries`/`unique_id`, entity `unique_id`/`capabilities`/`aliases`/
  `labels`/`options`, device `connections`/`serial_number`/
  `configuration_url` (including `user:pass@` URLs)/`identifiers`/nested
  unknown keys, and an unknown top-level key. Asserted absent from: normalized
  state (`JSON.stringify`), the DOM after imports, error text for malformed/
  oversized/unsupported inputs, console errors, and all four report variants
  (JSON/HTML × redacted/opt-in) — in unit tests and in the browser suite with
  real downloads.
- **Prototype safety**: `__proto__`/`constructor` as record ids, domains,
  platforms and object keys; `Object.prototype` pollution asserted absent;
  classification lookups for `constructor`/`__proto__`/`hasOwnProperty` return
  `custom` without touching the prototype chain; a device `via` reference to a
  device whose id is literally `__proto__` resolves correctly.
- **Error hygiene**: every error object is `{code, message}` with
  numeric/enum details only; messages contain no imported content and no file
  names (files are referenced by ordinal).
- **No storage**: storage asserted empty after imports; full pipeline rerun
  with both storage getters throwing.
- **No network**: per-case and whole-session zero HTTP(S) request gates.
- **Report purity**: HTML report contains no `<script>`, `<img>` or `<link>`;
  hostile names (`<img … onerror=…>`, `<script>…`) are escaped in opt-in
  reports; JSON reports always parse.

## 7. What is NOT verified (honest limits)

- **No physical Home Assistant or devices were involved.** Hardware behavior
  and runtime offline operation were not tested; the tool reports metadata
  evidence only.
- **Stale-evidence UI badge**: staleness is computed from the viewing clock
  and the bundle is current, so the browser suite shows the retrieved date,
  not a stale badge. Stale behavior (`stale`, `staleDays`, `STALE_EVIDENCE`)
  is exercised in the unit suite with injected clocks (2027 viewing dates;
  a 2020 retrieved date).
- **Dynamic platforms** are reported unknown by policy; templates are never
  evaluated (asserted), so no template logic is verified — by design.
- The 320 px mobile checks assert body-overflow containment, not pixel-perfect
  rendering; screenshots are attached as evidence.
- Known narrow-screen squeeze: at 320 px the detail data tables can look
  squeezed in still screenshots, but `.table-scroll { overflow-x: auto; }`
  (`style.css`) keeps them horizontally scrollable by design; the
  `mobile-320-390-long-strings` and `keyboard-320-390-activation` cases assert
  body overflow ≤ 1 px only. Those overflow checks do not prove full content
  readability at narrow widths. No UI change was made for this doc-only
  correction and no mobile hardware was tested.
- Long-lived behavior, non-Chromium engines, and other operating systems are
  untested in this run.

## 8. Fix round 1 — bounded usability/privacy/documentation closures (2026-10-11)

Parent ruling and frozen gate: `parent-qa/REVIEW-DISPOSITIONS-ROUND1.md` and
`parent-qa/OfflineReadiness/registry-source-regression.test.cjs` (6 cases;
2 pass / 4 fail before the fix, 6/6 after). All corrections stay inside
`work/OfflineReadiness`; new evidence is under
`evidence/OfflineReadiness/fix-round-1/`; the original evidence folders were
not overwritten. No network, no Home Assistant connection, no installs.

### What changed

- `core.js` — registry-bundle emptiness is now an **aggregate** rule: valid
  zero-record component exports (a fresh home) join nonempty metadata; only a
  bundle whose exports together hold no records is `EMPTY_INPUT` (message
  updated; rejected-record visibility and all caps unchanged). Redacted
  reports keep known Home Assistant source enums (the 18 `SOURCE_*` constants
  read from the retained `retrieval/source/config_entries.py`) and omit
  arbitrary non-enum source labels (`null`; the opt-in includes them). Four
  new report disclaimers (version not compared; domain-name shadowing; direct
  `via` links only; product metadata remains) and conservative
  discard-bucket wording.
- `app.js` — card counts labeled “entry-level”; warnings-only filter status
  names entry/entity/device level; singular/plural for unlinked entities and
  unattributed devices; conservative discard wording on the status line.
- `index.html` — filter label, board hint, download note, and about-section
  limitations (empty components, version tolerance, shadowing, via cycles,
  product metadata).
- `tests/core.test.cjs` — 7 new tests (mixed-empty permutations incl. the
  parent-gate equivalents, standalone zero-record components, malformed-only
  component, fresh-home fixtures, source-enum default/opt-in JSON+HTML, all 18
  enum constants, conservative wording).
- `tests/browser.cjs` — 3 new cases plus the MQTT-qualifier assertion;
  artifact root can be redirected via `OFFLINE_READINESS_EVIDENCE_DIR`
  (default unchanged, so historical runs keep their paths).
- New fictional fixtures: `fixtures/registries/fresh-core.config_entries.json`,
  `fixtures/registries/empty-core.{config_entries,entity_registry,device_registry}.json`,
  `fixtures/snapshots/source-label-snapshot.json`.
- `README.md`, `docs/snapshot-contract.md`, this file — disclosures.

### Commands, counts and exit codes (exact; logs in fix-round-1/)

| Step | Command | Result | Exit | Log |
|---|---|---|---|---|
| RED | `node --test tests/core.test.cjs` (new tests, before core patch) | tests 43 / pass 37 / fail 6 | 1 | `red/01-core-red-fix-round-1.log` |
| RED | `node tests/browser.cjs` (new cases, before patches) | cases 14 / pass 12 / fail 2 | 1 | `red/02-browser-red-fix-round-1.log` |
| GREEN | `node --test tests/core.test.cjs` (after core patch) | tests 43 / pass 43 / fail 0 | 0 | `green/01-core-green-after-core-patch.log` |
| GREEN | `node tests/browser.cjs` (after all patches) | cases 14 / pass 14 / fail 0 | 0 | `green/02-browser-green-after-fixes.log` |
| GREEN | `node tests/browser.cjs` (final, incl. new screenshots) | cases 14 / pass 14 / fail 0 | 0 | `green/03-browser-green-final.log` |
| GREEN | `node --test tests/core.test.cjs` (final) | tests 43 / pass 43 / fail 0 | 0 | `green/04-core-green-final.log` |
| GATE | frozen parent gate (after core patch) | tests 6 / pass 6 / fail 0 | 0 | `gate/01-parent-registry-source-gate-run.log` |
| GATE | frozen parent gate (final) | tests 6 / pass 6 / fail 0 | 0 | `gate/03-parent-registry-source-gate-final.log` |
| GATE | `node review/OfflineReadiness/probes/verify-classifications.cjs` (read-only rerun) | checks 381 / fails 0 | 0 | `gate/02-parent-classification-cross-check-rerun.log` |
| GATE | same, final (after documentation edits) | checks 381 / fails 0 | 0 | `gate/04-parent-classification-cross-check-final.log` |

New browser cases: `empty-selected-components-fresh-home` (fresh home imports;
all-empty bundle shows an explicit `EMPTY_INPUT`; recovery), `source-labels-
default-optin-downloads` (real Chrome downloads: default JSON/HTML keep `user`
and omit `fiction_private_source_label`; the opt-in includes it; saved as
`downloads/source-labels-{default,optin}.{json,html}`), and `keyboard-320-390-
activation` (Tab focus ring ≥ 2 px + Enter activation + body overflow ≤ 1 px
at 320 and 390; screenshots `screenshots/keyboard-{320,390}-board.png`). The
redacted-download case also asserts the MQTT qualifier travels into the
report; new screenshot `screenshots/fresh-home-board.png` shows the fresh-home
import with the conservative discard wording.

### Historical note (superseded expectation)

The stage-1 reviewer's preserved adversarial probe
(`review/OfflineReadiness/probes/adversarial-core.cjs`, case A16) recorded the
previous per-file `EMPTY_INPUT` quirk for empty registry files. That
expectation is intentionally superseded by the new permanent tests and the
frozen parent gate; the probe file was left unmodified and is not required to
pass.

`tests/cdp-browser.cjs` remains byte-identical to the shared helper (sha256
`3db68b5bcb1d2d5b2aabd12dce2cceb1bfda08cce9d547957d0f407315305c67`).

The limitations in section 7 are unchanged: still no physical hardware, no
Home Assistant instance, no credentials, synthetic fixtures only.

## 9. Package-correction round 1 — doc-only standalone-portability correction (2026-10-11)

Scope: only `work/OfflineReadiness/docs/verification.md` changed. No runtime,
classification data, test, helper, fixture, README, or contract bytes changed.
`tests/cdp-browser.cjs` remains byte-identical to the shared helper (sha256
`3db68b5bcb1d2d5b2aabd12dce2cceb1bfda08cce9d547957d0f407315305c67`).

What changed in this file: removed owner-home absolute paths, converted all
handles to relative workspace-local / standalone-package handles, marked the
section-2 36-test / 11-case table as preserved builder history, cited the
current 43-test / 14-case / 6-gate / 381-check baseline from recorded parent
evidence without claiming a new run, distinguished the filesystem-only cached
classification rerun from the original 2026-10-11 public retrieval, separated
snapshot classification from measured offline/whole-home proof, kept
product-metadata versus source-label privacy wording, kept all historical
limits, and added the narrow-screen table-squeeze note. No UI was changed.

Fresh confirmation in this correction: only `npm test` (unit) was re-executed;
result tests 43 / pass 43 / fail 0, exit 0; log is workspace-local only at
`evidence/OfflineReadiness/package-correction-round-1/npm-test.log` and is not
included in the standalone package. No browser suite, no retrieval, no Home
Assistant contact, no install, and no whole cross-tool gate were re-executed
for this doc-only correction; browser/retrieval/HA facts above are cited from
the recorded logs named in the current-baseline box.
