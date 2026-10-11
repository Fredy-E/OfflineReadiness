'use strict';
// OfflineReadiness — browser suite. Real Chrome via the dependency-free CDP
// helper (tests/cdp-browser.cjs); one owned headless instance, fresh scratch
// profile, never the user's browser. Every case asserts zero page/console
// errors and zero HTTP(S) requests; the whole session is asserted clean again
// at the end. Downloads are real files written by Chrome and are kept as
// evidence. Fixtures are fictional; secret canaries must never surface.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launch } = require('./cdp-browser.cjs');

const ROOT = path.resolve(__dirname, '..');
// Keep reruns portable and preserve previously captured evidence.
const EVIDENCE = process.env.OFFLINE_READINESS_EVIDENCE_DIR || path.join(ROOT, 'tests', 'evidence');
const ART = path.join(EVIDENCE, 'browser');
const SHOTS = path.join(EVIDENCE, 'screenshots');
const DOWNLOADS = path.join(EVIDENCE, 'downloads');
const INDEX = path.join(ROOT, 'index.html');
const fixture = (...parts) => path.join(ROOT, 'fixtures', ...parts);

const results = [];
let page;

async function saveDownload(downloaded, name) {
  fs.mkdirSync(DOWNLOADS, { recursive: true });
  const target = path.join(DOWNLOADS, name);
  fs.writeFileSync(target, downloaded.bytes);
  return target;
}

async function runCase(name, fn) {
  const errorStart = page.errors.length;
  const requestStart = page.requests.length;
  try {
    await page.goto(INDEX);
    await fn();
    const caseErrors = page.errors.slice(errorStart);
    const caseRequests = page.requests.slice(requestStart);
    assert.deepEqual(caseErrors, [], name + ': page/console errors');
    assert.deepEqual(caseRequests, [], name + ': unexpected HTTP(S) requests');
    results.push({ name, status: 'pass', errors: [], requests: [] });
    console.log('PASS ' + name);
  } catch (error) {
    const caseErrors = page.errors.slice(errorStart);
    const caseRequests = page.requests.slice(requestStart);
    results.push({ name, status: 'fail', message: error.message, errors: caseErrors, requests: caseRequests });
    console.error('FAIL ' + name + '\n' + error.stack);
    await page.screenshot(path.join(ART, name.replace(/\W+/g, '-') + '-failure.png')).catch(() => {});
  }
}

const bodyHasCanary = () => page.evaluate('document.body.textContent.includes("CANARY")');
const storageEmpty = () => page.evaluate('window.localStorage.length === 0 && window.sessionStorage.length === 0');
const stats = () => page.evaluate('[...document.querySelectorAll(".stat-num")].map(n => n.textContent).join(",")');
const countCards = selector => page.evaluate('document.querySelectorAll(' + JSON.stringify(selector) + ').length');

// Real Enter key press through the browser input pipeline. The shared helper's
// key() sends raw key events without a text payload, which moves focus but does
// not trigger a button's default activation; the CDP "keyDown with text" form
// does. Sent via the helper's public command surface — cdp-browser.cjs itself
// stays an untouched copy.
async function pressEnter() {
  const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await page.command('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown', text: '\r', unmodifiedText: '\r' }, base));
  await page.command('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
}

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  page = await launch({ artifactsDir: ART });
  try {

    await runCase('sample-board-filters-detail', async () => {
      await page.click('#btn-load-sample');
      await page.waitFor('document.querySelectorAll("#board .dep-card").length === 12', 'sample board cards');
      assert.equal(await stats(), '10,14,6,5,3,1,1,11', 'sample stats strip');
      assert.match(await page.evaluate('document.querySelector("#source-kind").textContent'), /normalized snapshot \(Home Assistant 2026\.9\.2-fictional\)/);
      assert.equal(await countCards('#issues-list tr'), 11);
      assert.equal(await countCards('#evidence-list tr'), 9);

      // Category chips filter entry cards; graph cards stay visible.
      await page.click('#chip-cloud');
      await page.waitFor('document.querySelectorAll(\'#board .dep-card[data-category="cloud"]\').length === 3', 'cloud filter');
      assert.equal(await countCards('#board .dep-card[data-category="local"]'), 0);
      assert.match(await page.evaluate('document.querySelector("#filter-status").textContent'), /Category: cloud/);
      await page.click('#chip-custom');
      await page.waitFor('document.querySelectorAll(\'#board .dep-card[data-category="custom"]\').length === 1', 'custom filter');
      await page.click('#chip-all');
      await page.waitFor('document.querySelectorAll(\'#board .dep-card[data-category="cloud"]\').length === 3', 'all filter restored');

      // Search narrows to matching groups.
      await page.fill('#search-input', 'tuya');
      await page.waitFor('document.querySelectorAll("#board .dep-card[data-category]").length === 1', 'search narrowed');
      assert.equal(await countCards('#board .dep-card[data-ref="C03"]'), 1);
      await page.fill('#search-input', '');
      await page.waitFor('document.querySelectorAll("#board .dep-card[data-ref^=\'C\']").length === 10', 'search cleared');

      // Warnings-only keeps groups whose entities/devices carry warnings.
      await page.check('#issues-only', true);
      await page.waitFor('document.querySelectorAll("#board .dep-card[data-ref^=\'C\']").length === 1', 'issues-only narrowed');
      assert.match(await page.evaluate('document.querySelector("#board .dep-card").textContent'), /esphome/);
      await page.check('#issues-only', false);
      await page.waitFor('document.querySelectorAll("#board .dep-card[data-ref^=\'C\']").length === 10', 'issues-only cleared');

      // Drill-down shows evidence provenance; Escape closes and restores focus.
      await page.click('#board .dep-card[data-ref="C04"] .card-details');
      await page.waitFor('!document.querySelector("#detail-pane").hidden', 'detail open');
      assert.match(await page.evaluate('document.querySelector("#detail-title").textContent'), /mqtt — C04/);
      const detailText = await page.evaluate('document.querySelector("#detail-body").textContent');
      assert.match(detailText, /local_push/, 'evidence shows the real manifest class');
      assert.match(detailText, /broker endpoint is user-configured/, 'mqtt qualifier shown');
      assert.match(await page.evaluate('document.querySelector("#detail-body a").href'), /home-assistant\/core\/2026\.10\.1\/homeassistant\/components\/mqtt\/manifest\.json/);
      await page.key('Escape');
      await page.waitFor('document.querySelector("#detail-pane").hidden', 'detail closed');
      assert.match(await page.evaluate('document.activeElement.className'), /card-details/, 'focus returned to opener');

      await page.click('#board .dep-card[data-ref="UNLINKED"] .card-details');
      await page.waitFor('!document.querySelector("#detail-pane").hidden', 'unlinked detail');
      assert.match(await page.evaluate('document.querySelector("#detail-body").textContent'), /light\.computed_lamp/);
      await page.key('Escape');

      await page.screenshot(path.join(SHOTS, 'board-desktop.png'));
      assert.equal(await bodyHasCanary(), false);
    });

    await runCase('import-normalized-snapshot', async () => {
      await page.setInputFiles('#file-input', fixture('snapshots', 'canary-snapshot.json'));
      await page.waitFor('document.querySelector("#status-line").textContent.includes("2 entries")', 'snapshot import');
      assert.equal(await stats(), '2,2,1,2,0,0,0,0', 'canary snapshot stats (hue + esphome local)');
      assert.equal(await bodyHasCanary(), false, 'canary must not reach the DOM');
      assert.equal(await storageEmpty(), true, 'no browser storage writes');
      assert.equal(await page.evaluate('document.querySelector("#error-line").hidden'), true);
    });

    await runCase('import-registry-bundle', async () => {
      await page.setInputFiles('#file-input', [
        fixture('registries', 'core.config_entries.json'),
        fixture('registries', 'core.entity_registry.json'),
        fixture('registries', 'core.device_registry.json')
      ]);
      await page.waitFor('document.querySelector("#source-kind").textContent.includes("registry bundle (3 files)")', 'bundle import');
      assert.equal(await stats(), '5,7,7,2,1,1,1,7', 'registry bundle stats');
      assert.equal(await bodyHasCanary(), false, 'registry canaries must not reach the DOM');
      assert.equal(await countCards('#issues-list tr'), 7, 'mismatch, orphans, unlinked, dangling, custom');
      await page.click('#board .dep-card[data-ref="C01"] .card-details');
      await page.waitFor('!document.querySelector("#detail-pane").hidden', 'registry detail');
      assert.match(await page.evaluate('document.querySelector("#detail-body").textContent'), /Fictional hall lamp/);
      await page.key('Escape');
      assert.equal(await storageEmpty(), true);
    });

    await runCase('invalid-and-unsupported-inputs', async () => {
      const expectError = async (file, code) => {
        await page.setInputFiles('#file-input', file);
        await page.waitFor('!document.querySelector("#error-line").hidden', 'error visible for ' + code);
        const text = await page.evaluate('document.querySelector("#error-line").textContent');
        assert.match(text, new RegExp(code), 'expected ' + code + ' for ' + path.basename(file));
        assert.equal(await bodyHasCanary(), false, 'error text must not echo content (' + code + ')');
      };
      await expectError(fixture('snapshots', 'invalid-syntax.json'), 'NOT_JSON');
      await expectError(fixture('snapshots', 'unsupported-backup-lookalike.json'), 'UNSUPPORTED_INPUT');
      await expectError(fixture('snapshots', 'unsupported-automation.json'), 'UNSUPPORTED_INPUT');
      await expectError(fixture('snapshots', 'unsupported-yaml.txt'), 'UNSUPPORTED_INPUT');
      await expectError(fixture('snapshots', 'unsupported-archive.bin'), 'UNSUPPORTED_INPUT');
      // Incomplete bundle is refused with the missing kind named.
      await page.setInputFiles('#file-input', [fixture('registries', 'core.config_entries.json'), fixture('registries', 'core.entity_registry.json')]);
      await page.waitFor('!document.querySelector("#error-line").hidden', 'missing registry error');
      assert.match(await page.evaluate('document.querySelector("#error-line").textContent'), /MISSING_REGISTRY/);
      // Recovery: a valid import afterwards works.
      await page.setInputFiles('#file-input', fixture('snapshots', 'racing-a.json'));
      await page.waitFor('document.querySelector("#status-line").textContent.includes("3 entries")', 'recovery import');
      assert.equal(await page.evaluate('document.querySelector("#error-line").hidden'), true, 'error cleared on success');
    });

    await runCase('racing-imports-last-wins', async () => {
      await page.setInputFiles('#file-input', fixture('snapshots', 'racing-a.json'));
      await page.setInputFiles('#file-input', fixture('snapshots', 'racing-b.json'));
      await page.waitFor('document.querySelector("#source-kind").textContent.includes("racing-b")', 'racing-b applied');
      await new Promise(resolve => setTimeout(resolve, 400));
      assert.match(await page.evaluate('document.querySelector("#source-kind").textContent'), /racing-b/, 'no stale flicker back to racing-a');
      assert.match(await page.evaluate('document.querySelector("#status-line").textContent'), /5 entries/);
      const downloaded = await page.download('#btn-download-json');
      await saveDownload(downloaded, 'racing-b-report.json');
      const report = JSON.parse(downloaded.text);
      assert.equal(report.source.haVersion, 'racing-b', 'report must reflect the latest import only');
      assert.equal(report.counts.entries, 5);
    });

    await runCase('downloads-redacted-default', async () => {
      await page.click('#btn-load-sample');
      await page.waitFor('document.querySelectorAll("#board .dep-card").length === 12', 'sample for downloads');
      const json = await page.download('#btn-download-json');
      await saveDownload(json, 'redacted-report.json');
      assert.equal(json.suggestedFilename, 'offline-readiness-report.json');
      const parsed = JSON.parse(json.text);
      assert.equal(parsed.redacted, true);
      assert.equal(parsed.counts.entries, 10);
      assert.ok(parsed.entries[0].label === 'Entry C01');
      const mqttEvidence = parsed.evidence.find(item => item.domain === 'mqtt');
      assert.ok(mqttEvidence, 'mqtt evidence present in report');
      assert.deepEqual(mqttEvidence.qualifiers, ['broker endpoint is user-configured'], 'mqtt qualifier travels into the JSON report');
      assert.ok(!json.text.includes('Fictional Hue Bridge'), 'no titles in redacted report');
      assert.ok(!json.text.includes('01JFICT'), 'no entry ids in redacted report');
      assert.ok(!json.text.includes('light.hall_lamp'), 'no entity ids in redacted report');
      assert.ok(!json.text.includes('fict-dev-001'), 'no device ids in redacted report');
      assert.equal(await bodyHasCanary(), false);

      const html = await page.download('#btn-download-html');
      await saveDownload(html, 'redacted-report.html');
      assert.equal(html.suggestedFilename, 'offline-readiness-report.html');
      assert.ok(html.text.startsWith('<!DOCTYPE html>'));
      assert.ok(!/<script/i.test(html.text), 'HTML report must be script-free');
      assert.ok(!/<img/i.test(html.text) && !/<link/i.test(html.text), 'HTML report must be self-contained');
      assert.ok(!html.text.includes('Fictional Hue Bridge'), 'no titles in redacted HTML');
      assert.ok(html.text.includes('Entry C01'));
      assert.ok(html.text.includes('home-assistant/core/2026.10.1'), 'evidence URL present');
    });

    await runCase('downloads-opt-in-never-secrets', async () => {
      await page.setInputFiles('#file-input', fixture('snapshots', 'canary-snapshot.json'));
      await page.waitFor('document.querySelector("#status-line").textContent.includes("2 entries")', 'canary snapshot');
      const redacted = await page.download('#btn-download-json');
      assert.ok(!redacted.text.includes('light.canary_entity'), 'redacted default hides entity ids');
      await page.check('#optin-identifiers', true);
      const optIn = await page.download('#btn-download-json');
      await saveDownload(optIn, 'optin-report.json');
      assert.equal(optIn.suggestedFilename, 'offline-readiness-report-with-identifiers.json');
      const parsed = JSON.parse(optIn.text);
      assert.equal(parsed.redacted, false);
      assert.ok(optIn.text.includes('light.canary_entity'), 'opt-in includes entity ids');
      assert.ok(optIn.text.includes('Canary entity'), 'opt-in includes names');
      assert.ok(!optIn.text.includes('CANARY'), 'opt-in must still never include discarded fields');
      const html = await page.download('#btn-download-html');
      await saveDownload(html, 'optin-report.html');
      assert.ok(html.text.includes('Canary entity'));
      assert.ok(!html.text.includes('CANARY'));
      assert.ok(!/<script/i.test(html.text));
      assert.equal(await bodyHasCanary(), false);
    });

    await runCase('keyboard-focus-and-activation', async () => {
      const ringBefore = await page.evaluate('getComputedStyle(document.querySelector("#file-label")).outlineStyle');
      assert.equal(ringBefore, 'none', 'no ring before focusing');
      await page.key('Tab');
      await page.waitFor('document.activeElement && document.activeElement.id === "file-input"', 'file input focused');
      await page.waitFor('getComputedStyle(document.querySelector("#file-label")).outlineStyle === "solid"', 'label ring visible');
      const ring = await page.evaluate('parseFloat(getComputedStyle(document.querySelector("#file-label")).outlineWidth)');
      assert.ok(ring >= 2, 'focus ring at least 2px, got ' + ring);
      await page.key('Tab');
      await page.waitFor('document.activeElement && document.activeElement.id === "btn-load-sample"', 'sample button focused');
      await pressEnter();
      await page.waitFor('document.querySelectorAll("#board .dep-card").length === 12', 'keyboard sample load');
      await page.key('Tab');
      await page.waitFor('document.activeElement && document.activeElement.id === "chip-all"', 'chip-all focused');
      await page.key('Tab');
      await page.waitFor('document.activeElement && document.activeElement.id === "chip-local"', 'chip-local focused');
      const chipOutline = await page.evaluate('getComputedStyle(document.querySelector("#chip-local")).outlineStyle');
      assert.equal(chipOutline, 'solid', 'chip focus ring visible');
      await pressEnter();
      await page.waitFor('document.querySelector("#chip-local").getAttribute("aria-pressed") === "true"', 'chip toggled by keyboard');
      await page.waitFor('document.querySelectorAll(\'#board .dep-card[data-category="local"]\').length === 5', 'local filter by keyboard');
      await page.key('Escape');
    });

    await runCase('mobile-320-390-long-strings', async () => {
      await page.setInputFiles('#file-input', fixture('snapshots', 'long-strings-snapshot.json'));
      await page.waitFor('document.querySelector("#status-line").textContent.includes("3 entries")', 'long strings loaded');
      for (const width of [390, 320]) {
        await page.viewport(width, 844);
        const overflow = await page.evaluate('Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth');
        assert.ok(overflow <= 1, 'body overflow at ' + width + 'px: ' + overflow);
      }
      await page.screenshot(path.join(SHOTS, 'mobile-320-board.png'));
      await page.click('#board .dep-card[data-ref="C01"] .card-details');
      await page.waitFor('!document.querySelector("#detail-pane").hidden', 'detail on mobile');
      for (const width of [320, 390]) {
        await page.viewport(width, 844);
        const overflow = await page.evaluate('Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth');
        assert.ok(overflow <= 1, 'body overflow with detail open at ' + width + 'px: ' + overflow);
      }
      await page.screenshot(path.join(SHOTS, 'mobile-320-detail.png'));
      await page.viewport(1440, 1000);
      await page.click('#btn-load-sample');
      await page.waitFor('document.querySelectorAll("#board .dep-card").length === 12', 'sample for shot');
      await page.viewport(390, 844);
      const overflowSample = await page.evaluate('Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth');
      assert.ok(overflowSample <= 1, 'sample overflow at 390px: ' + overflowSample);
      await page.screenshot(path.join(SHOTS, 'mobile-390-sample.png'));
      await page.viewport(1440, 1000);
    });

    await runCase('storage-blocked-still-works', async () => {
      await page.click('#btn-load-sample');
      await page.waitFor('document.querySelectorAll("#board .dep-card").length === 12', 'sample loaded');
      assert.equal(await storageEmpty(), true);
      await page.evaluate('(() => { const fail = () => { throw new DOMException("blocked for test", "SecurityError"); }; Object.defineProperty(window, "localStorage", { configurable: true, get: fail }); Object.defineProperty(window, "sessionStorage", { configurable: true, get: fail }); return true; })()');
      // Observable import under blocked storage: canary snapshot (2 entries)…
      await page.setInputFiles('#file-input', fixture('snapshots', 'canary-snapshot.json'));
      await page.waitFor('document.querySelector("#status-line").textContent.includes("2 entries")', 'import with storage blocked');
      assert.equal(await stats(), '2,2,1,2,0,0,0,0');
      // …then back to the sample (10 entries) — full pipeline without storage.
      await page.click('#btn-load-sample');
      await page.waitFor('document.querySelector("#status-line").textContent.includes("10 entries")', 'reimport with storage blocked');
      assert.equal(await stats(), '10,14,6,5,3,1,1,11');
    });

    await runCase('empty-selected-components-fresh-home', async () => {
      // A fresh home: one config entry, zero entities, zero devices — the three
      // .storage exports selected together must import without per-file EMPTY_INPUT.
      const freshFiles = [
        fixture('registries', 'fresh-core.config_entries.json'),
        fixture('registries', 'empty-core.entity_registry.json'),
        fixture('registries', 'empty-core.device_registry.json')
      ];
      await page.setInputFiles('#file-input', freshFiles);
      await page.waitFor('document.querySelector("#source-kind").textContent.includes("registry bundle (3 files)")', 'fresh-home bundle import');
      assert.equal(await stats(), '1,0,0,1,0,0,0,1', 'fresh-home stats (hue local, dangling entry)');
      assert.equal(await page.evaluate('document.querySelector("#error-line").hidden'), true, 'no error for empty components');
      assert.equal(await bodyHasCanary(), false, 'discarded entry data canary must not reach the DOM');
      assert.equal(await storageEmpty(), true);
      await page.screenshot(path.join(SHOTS, 'fresh-home-board.png'));

      // A fully empty bundle is still an explicit EMPTY_INPUT error.
      await page.setInputFiles('#file-input', [
        fixture('registries', 'empty-core.config_entries.json'),
        fixture('registries', 'empty-core.entity_registry.json'),
        fixture('registries', 'empty-core.device_registry.json')
      ]);
      await page.waitFor('!document.querySelector("#error-line").hidden', 'all-empty bundle error');
      const errorText = await page.evaluate('document.querySelector("#error-line").textContent');
      assert.match(errorText, /EMPTY_INPUT/);
      assert.match(errorText, /no records/, 'aggregate emptiness message');
      assert.equal(await bodyHasCanary(), false);

      // Recovery: the fresh-home bundle imports again after the error.
      await page.setInputFiles('#file-input', freshFiles);
      await page.waitFor('document.querySelector("#status-line").textContent.includes("1 entries")', 'fresh-home recovery');
      assert.equal(await page.evaluate('document.querySelector("#error-line").hidden'), true, 'error cleared after recovery');
    });

    await runCase('source-labels-default-optin-downloads', async () => {
      const label = 'fiction_private_source_label';
      await page.setInputFiles('#file-input', fixture('snapshots', 'source-label-snapshot.json'));
      await page.waitFor('document.querySelector("#status-line").textContent.includes("2 entries")', 'source-label snapshot');

      const defaultJson = await page.download('#btn-download-json');
      await saveDownload(defaultJson, 'source-labels-default.json');
      const parsed = JSON.parse(defaultJson.text);
      assert.equal(parsed.entries[0].source, 'user', 'known source enum retained in default JSON');
      assert.equal(parsed.entries[1].source, null, 'arbitrary source label omitted from default JSON');
      assert.equal(defaultJson.text.includes(label), false, 'arbitrary source label absent from default JSON');
      const defaultHtml = await page.download('#btn-download-html');
      await saveDownload(defaultHtml, 'source-labels-default.html');
      assert.ok(defaultHtml.text.includes('source: user'), 'known source enum retained in default HTML');
      assert.equal(defaultHtml.text.includes(label), false, 'arbitrary source label absent from default HTML');

      await page.check('#optin-identifiers', true);
      const optInJson = await page.download('#btn-download-json');
      await saveDownload(optInJson, 'source-labels-optin.json');
      assert.equal(JSON.parse(optInJson.text).entries[1].source, label, 'opt-in includes the selected source identifier');
      const optInHtml = await page.download('#btn-download-html');
      await saveDownload(optInHtml, 'source-labels-optin.html');
      assert.ok(optInHtml.text.includes(label), 'opt-in HTML includes the selected source identifier');
      assert.equal(await bodyHasCanary(), false);
      assert.equal(await storageEmpty(), true);
    });

    await runCase('keyboard-320-390-activation', async () => {
      for (const width of [320, 390]) {
        await page.viewport(width, 844);
        await page.goto(INDEX);
        await page.key('Tab');
        await page.waitFor('document.activeElement && document.activeElement.id === "file-input"', 'file input focused at ' + width);
        await page.waitFor('getComputedStyle(document.querySelector("#file-label")).outlineStyle === "solid"', 'label ring visible at ' + width);
        const ring = await page.evaluate('parseFloat(getComputedStyle(document.querySelector("#file-label")).outlineWidth)');
        assert.ok(ring >= 2, 'focus ring at least 2px at ' + width + ', got ' + ring);
        await page.key('Tab');
        await page.waitFor('document.activeElement && document.activeElement.id === "btn-load-sample"', 'sample button focused at ' + width);
        await pressEnter();
        await page.waitFor('document.querySelectorAll("#board .dep-card").length === 12', 'keyboard sample load at ' + width);
        const filterText = await page.evaluate('document.querySelector("#filter-status").textContent');
        assert.match(filterText, /3 unlinked entities shown/, 'plural unlinked entities grammar');
        assert.match(filterText, /1 unattributed device shown/, 'singular unattributed device grammar');
        assert.ok(await page.evaluate('document.querySelector("#board").textContent.includes("entry-level issue")'), 'cards label entry-level issue counts');
        const overflow = await page.evaluate('Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth');
        assert.ok(overflow <= 1, 'body overflow at ' + width + 'px after keyboard load: ' + overflow);
        await page.screenshot(path.join(SHOTS, 'keyboard-' + width + '-board.png'));
      }
      await page.viewport(1440, 1000);
    });

    // Final whole-session gates: no errors and no HTTP(S) requests anywhere.
    page.assertClean();
    results.push({ name: 'whole-session-zero-errors-zero-requests', status: 'pass', errors: [], requests: [] });
    console.log('PASS whole-session-zero-errors-zero-requests');
  } catch (error) {
    results.push({ name: 'suite-harness', status: 'fail', message: error.message });
    console.error('SUITE FAILURE\n' + error.stack);
  } finally {
    try {
      fs.writeFileSync(path.join(ART, 'browser-results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), chrome: 'owned headless instance', results }, null, 2));
    } catch (writeError) { console.error('results write: ' + writeError.message); }
    await page.close();
  }
  const failed = results.filter(item => item.status === 'fail');
  console.log(JSON.stringify({ cases: results.length, pass: results.length - failed.length, fail: failed.length }));
  if (!results.length || failed.length) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
