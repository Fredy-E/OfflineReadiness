# OfflineReadiness

<!-- prototype-status:start -->
> **Experimental concept prototype — idea exploration only.**
> This is a work-in-progress concept/demo, not a finished product or production-ready release. Implemented features and local tests demonstrate the prototype only; they do not establish real-world reliability, complete functionality, or hardware compatibility. Features may change or remain unfinished.

See [PROTOTYPE.md](PROTOTYPE.md) for publication status and verification limits.
<!-- prototype-status:end -->

A read-only **Home Assistant dependency evidence report**, built from selected
registry metadata you import yourself. Open `index.html` from disk — no server,
no build step, no CDN, no install, no network, no telemetry, no browser
storage.

It maps your config entries, entities and devices to **dated, cited
classification evidence** (bundled from actual Home Assistant manifests),
surfaces the reference graph (orphans, duplicates, dangling entries, unlinked
entities), and exports shareable reports that are **redacted by default**.

It is **not** a whole-house offline-safe certification, and it computes **no
aggregate score**. “Local” means the integration’s own communication is
declared local — it does not mean the device works without internet.

## Run it

1. Open `index.html` in any modern browser (double-click; `file://` works).
2. Click **Load fictional sample** for the built-in synthetic demo, **or**
   choose JSON files:

   - **Normalized snapshot** — one JSON file with schema
     `offline-readiness.snapshot/1` (see `docs/snapshot-contract.md`), or
   - **Registry bundle** — the three `.storage` exports from your Home
     Assistant configuration folder, selected together in one multi-file pick:
     `core.config_entries`, `core.entity_registry`, `core.device_registry`.
     (Copy them out read-only; this tool never talks to Home Assistant.)

3. Filter the board (Local / Cloud / Unknown / Custom-unlisted), search,
   open **Details** for any entry to see its evidence (manifest class, source
   URL, retrieval date, scope, qualifiers), then download the report.

The built-in sample is fictional, synthetic demo data — not from a real home.

## What the report contains

- Every config entry with its category, `iot_class` evidence and provenance.
- Entities and devices grouped under their entry, with platform, refs and
  per-record issues; unlinked entities and unattributed devices surfaced.
- Reference issues: orphan refs, duplicates, dangling entries, ambiguous
  platform/domain attribution, truncated ref lists, rejected records, stale
  evidence — all explicit, none guessed.
- Downloads: a self-contained **script-free HTML** report and a **valid JSON**
  report (`offline-readiness.report/1`). Both are **redacted by default**
  (names and identifiers ordinalized: Entry C01, Entity E01, Device D01;
  arbitrary source labels omitted). Known Home Assistant source enums
  (`user`, `discovery`, …) and device `manufacturer`/`model` remain as
  product/acquisition metadata — review them before sharing. The explicit
  opt-in includes original names and identifiers — and still never secrets:
  credential-bearing config entry `data`/`options`, device connection/serial/URL
  fields and unknown fields are discarded at import and can never appear in any
  report.

## Privacy

Imported content is parsed in this page. The app makes **no data/API
requests**, writes nothing to `localStorage`/`sessionStorage`, and discards
credential-bearing and unneeded fields *before* any state is created (counts
are shown; values never survive). Error messages never echo imported content.

## Supported inputs and limits (summary)

Normalized snapshots (`offline-readiness.snapshot/1`) and the three `.storage`
registry exports only. Explicit errors — never guesses — for backups, archives
(`.zip`/`.tar`/`.gz`), YAML, automations/scripts and unknown JSON. Templates
are never evaluated. A valid registry export may contain zero records (a fresh
home) and still join the other files; an import whose exports together hold no
records at all is refused with `EMPTY_INPUT`. Limits: 8 MiB per file, 8 files,
5,000 entries / 20,000 entities / 10,000 devices, 200-char display strings,
32 refs per device, 500 issues listed, evidence stale after 180 days. The full
contract, allowlists and error codes are in
[`docs/snapshot-contract.md`](docs/snapshot-contract.md).

## Bundled classification evidence

`data/classifications.json` (mirrored by the classic-script wrapper
`data/classifications.js` so the page needs no `fetch`) contains 34 curated
domains with the **actual `iot_class` read from each integration manifest** of
`home-assistant/core` tag `2026.10.1`, retrieved **2026-10-11**, each with its
source URL, retrieval date and scope. Classes present: 7 × `local_polling`,
16 × `local_push`, 4 × `cloud_push`, 3 × `cloud_polling`, 3 × `calculated`,
1 × missing (`input_boolean`).

Policy highlights: `assumed_state`/`calculated` map to **unknown**; the
`template` and `group` platforms are **dynamic → unknown** (never evaluated);
domains outside the bundle are **custom/unlisted — never assumed local**; and
**mqtt** is deliberately **unknown** (`configured_broker_locality_unverified`)
because its broker endpoint is user-configured and cannot be verified from
bundled evidence. The exact mapping table and quotes are in
[`docs/snapshot-contract.md`](docs/snapshot-contract.md) and
[`docs/verification.md`](docs/verification.md).

How this differs from the public [Home Assistant integrations
page](https://www.home-assistant.io/integrations/): that page lists IoT class
per integration (with class/version filters) for the catalog as a whole. This
tool instead maps **your own imported registry graph** onto that class
taxonomy with dated per-domain provenance, flags your unmapped/custom domains
and graph issues, and exports a redacted, shareable evidence report. It adds
no ratings or scores.

## Tests

Zero-dependency unit suite plus a real-Chrome browser suite (no Playwright, no
installs — a small CDP helper drives an owned headless Chrome):

```bash
node --test tests/core.test.cjs   # 43 tests (303 assertions)
node tests/browser.cjs            # 14 cases (93 assertions)
```

Browser artifacts default to `tests/evidence/` relative to this folder. Set
`OFFLINE_READINESS_EVIDENCE_DIR` to redirect a run without overwriting preserved evidence.

The browser suite needs a Node with the built-in `WebSocket` global (the CDP
helper requires it explicitly; verified on Node 26.7.0) and a local Chrome.
Exact results, evidence paths and honest limitations:
[`docs/verification.md`](docs/verification.md).

## Honest limitations

- Physical devices and runtime offline behavior were **not** tested; the
  report is metadata evidence only.
- “Local” is the integration’s declared model; firmware updates, apps,
  accounts and cloud features are out of scope.
- Domains outside the 34-domain bundle are reported as custom/unlisted.
- Bundled evidence is tied to the dated tag (`2026.10.1`, retrieved
  `2026-10-11`); the imported Home Assistant version is displayed but **never
  compared** against it — a mismatch is not automatically flagged. Registry
  `version`/`minor_version` fields are tolerated, not certified.
- Classification is a **domain-name lookup** against the named core manifests:
  a custom integration that shadows a bundled domain (for example a custom
  `hue` fork) still shows the bundled evidence — installed code is not
  inspected.
- Device `via` references are **direct links only**; cycles are not detected
  and references are not resolved transitively.
- Device `manufacturer`/`model` and known source enums stay in redacted
  reports as product/acquisition metadata — review them before sharing.
- Hardware/runtime verification is out of scope by design.

## License

MIT — see [`LICENSE`](LICENSE).
