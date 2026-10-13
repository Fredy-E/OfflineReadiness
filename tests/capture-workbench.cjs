'use strict';
// Workbench final captures: real owned Chrome, redirected evidence dir.
// Exercises sample/12 cards, imports/errors/exports, light+dark, focus,
// print emulation, 320/390/300 containment. Writes screenshots + print PDF.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launch } = require('./cdp-browser.cjs');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE = process.env.OFFLINE_READINESS_EVIDENCE_DIR || path.join(ROOT, 'tests', 'evidence');
const SHOTS = path.join(EVIDENCE, 'screenshots');
const ART = path.join(EVIDENCE, 'browser');
const INDEX = path.join(ROOT, 'index.html');
const fixture = (...p) => path.join(ROOT, 'fixtures', ...p);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(ART, { recursive: true });
  const page = await launch({ artifactsDir: ART });
  const out = {};
  try {
    await page.viewport(1280, 900);
    await page.goto(INDEX);
    // Clean state.
    await page.screenshot(path.join(SHOTS, 'final-01-clean.png'));
    // Sample: 12 cards.
    await page.click('#btn-load-sample');
    await page.waitFor('document.querySelectorAll("#board .dep-card").length === 12', 'sample 12');
    out.stats = await page.evaluate('[...document.querySelectorAll(".stat-num")].map(n=>n.textContent).join(",")');
    assert.equal(out.stats, '10,14,6,5,3,1,1,11');
    await page.screenshot(path.join(SHOTS, 'final-02-sample-dark.png'));
    // Detail open.
    await page.click('#board .dep-card[data-ref="C04"] .card-details');
    await page.waitFor('!document.querySelector("#detail-pane").hidden', 'detail');
    await page.screenshot(path.join(SHOTS, 'final-03-detail.png'));
    await page.key('Escape');
    // Light theme.
    await page.command('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await new Promise(r => setTimeout(r, 300));
    out.lightBg = await page.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--ui-bg").trim()');
    await page.screenshot(path.join(SHOTS, 'final-04-sample-light.png'));
    await page.command('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    // Exports (real downloads, kept in ART).
    const j = await page.download('#btn-download-json');
    fs.writeFileSync(path.join(ART, 'final-redacted.json'), j.bytes);
    const h = await page.download('#btn-download-html');
    fs.writeFileSync(path.join(ART, 'final-redacted.html'), h.bytes);
    out.jsonRedacted = JSON.parse(j.text).redacted === true;
    out.htmlScriptFree = !/<script/i.test(h.text);
    // Error path.
    await page.setInputFiles('#file-input', fixture('snapshots', 'invalid-syntax.json'));
    await page.waitFor('!document.querySelector("#error-line").hidden', 'error');
    out.errorCode = await page.evaluate('document.querySelector("#error-line").textContent');
    assert.match(out.errorCode, /NOT_JSON/);
    await page.screenshot(path.join(SHOTS, 'final-05-error.png'));
    // Recovery + empty state.
    await page.click('#btn-load-sample');
    await page.waitFor('document.querySelectorAll("#board .dep-card").length === 12', 'recovery');
    await page.fill('#search-input', 'zzzz-no-such-domain-zzz');
    await page.waitFor('!document.querySelector("#board-empty")?.hidden', 'empty');
    await page.screenshot(path.join(SHOTS, 'final-06-empty.png'));
    await page.fill('#search-input', '');
    await page.waitFor('document.querySelectorAll("#board .dep-card").length === 12', 'restored');
    // Focus ring.
    await page.goto(INDEX);
    await page.key('Tab');
    await page.waitFor('document.activeElement && document.activeElement.id === "file-input"', 'focus');
    out.focusRing = await page.evaluate('getComputedStyle(document.querySelector("#file-label")).outlineStyle + "/" + getComputedStyle(document.querySelector("#file-label")).outlineWidth');
    // Mobile containment.
    await page.click('#btn-load-sample');
    await page.waitFor('document.querySelectorAll("#board .dep-card").length === 12', 'sample2');
    out.overflow = {};
    for (const w of [390, 320, 300]) {
      await page.viewport(w, 844);
      out.overflow[w] = await page.evaluate('Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth');
      assert.ok(out.overflow[w] <= 1, 'overflow at ' + w);
    }
    await page.viewport(390, 844);
    await page.screenshot(path.join(SHOTS, 'final-07-mobile-390.png'));
    await page.viewport(320, 844);
    await page.screenshot(path.join(SHOTS, 'final-08-mobile-320.png'));
    await page.viewport(1280, 900);
    // Print emulation + PDF.
    await page.command('Emulation.setEmulatedMedia', { media: 'print' });
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot(path.join(SHOTS, 'final-09-print-emulation.png'));
    const pdf = await page.command('Page.printToPDF', { printBackground: false });
    fs.writeFileSync(path.join(SHOTS, 'final-10-print.pdf'), Buffer.from(pdf.data, 'base64'));
    await page.command('Emulation.setEmulatedMedia', { media: 'screen' });
    page.assertClean();
    out.clean = true;
    out.storageEmpty = await page.evaluate('window.localStorage.length === 0 && window.sessionStorage.length === 0');
    fs.writeFileSync(path.join(ART, 'final-captures.json'), JSON.stringify({ checkedAt: new Date().toISOString(), out }, null, 2));
    console.log(JSON.stringify({ pass: true, out }));
  } finally { await page.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
