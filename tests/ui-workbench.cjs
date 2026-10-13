'use strict';
// OfflineReadiness — workbench UI regression (new shell).
// Proves portfolio-preview-1 shell, family tokens, masthead/experimental state,
// grouped import actions, board empty-state, focus, print/reduced-motion and
// responsive containment. Real owned headless Chrome via tests/cdp-browser.cjs.
// Evidence/screenshots redirect via OFFLINE_READINESS_EVIDENCE_DIR.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launch } = require('./cdp-browser.cjs');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE = process.env.OFFLINE_READINESS_EVIDENCE_DIR || path.join(ROOT, 'tests', 'evidence');
const ART = path.join(EVIDENCE, 'browser');
const SHOTS = path.join(EVIDENCE, 'screenshots');
const INDEX = path.join(ROOT, 'index.html');
const results = [];
let page;

async function runCase(name, fn) {
  const e0 = page.errors.length;
  const r0 = page.requests.length;
  try {
    await page.goto(INDEX);
    await fn();
    assert.deepEqual(page.errors.slice(e0), [], name + ': page/console errors');
    assert.deepEqual(page.requests.slice(r0), [], name + ': unexpected HTTP(S) requests');
    results.push({ name, status: 'pass' });
    console.log('PASS ' + name);
  } catch (error) {
    results.push({ name, status: 'fail', message: error.message });
    console.error('FAIL ' + name + '\n' + error.stack);
    await page.screenshot(path.join(ART, name.replace(/\W+/g, '-') + '-failure.png')).catch(() => {});
  }
}

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  page = await launch({ artifactsDir: ART });
  try {
    await runCase('workbench-shell-tokens-notice', async () => {
      await page.viewport(1280, 900);
      const shell = await page.evaluate('!!document.querySelector(\'[data-ui-revision="portfolio-preview-1"]\')');
      assert.equal(shell, true, 'principal shell carries data-ui-revision=portfolio-preview-1');
      const tokens = await page.evaluate(`(() => {
        const s = getComputedStyle(document.documentElement);
        return ['--ui-bg','--ui-surface','--ui-ink','--ui-muted','--ui-accent','--ui-border','--ui-radius'].map(k => s.getPropertyValue(k).trim());
      })()`);
      assert.ok(tokens.every(t => t.length > 0), 'all family tokens non-empty, got ' + JSON.stringify(tokens));
      const notice = await page.evaluate(`(() => {
        const n = document.getElementById('prototype-notice');
        if (!n) return null;
        const r = n.getBoundingClientRect();
        const s = getComputedStyle(n);
        return { text: n.textContent, top: r.top, bottom: r.bottom, visible: r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 };
      })()`);
      assert.ok(notice && notice.visible, 'prototype notice visible');
      assert.match(notice.text, /Experimental concept prototype — idea exploration only\./);
      assert.match(notice.text, /not a finished|not finished/i);
      assert.match(notice.text, /production-ready/i);
      assert.ok(notice.bottom <= 900, 'notice within first 900px desktop, bottom=' + notice.bottom);
      const mast = await page.evaluate('document.querySelector(".site-head h1")?.textContent || ""');
      assert.match(mast, /OfflineReadiness/);
      const badges = await page.evaluate('document.querySelector(".site-head")?.textContent || ""');
      assert.match(badges, /Offline · no network/);
      assert.match(badges, /Evidence report · no score/);
      // Grouped import: snapshot / sample / actions regions present.
      for (const sel of ['#import-panel', '#file-input', '#btn-load-sample', '#status-line', '#source-kind']) {
        assert.equal(await page.evaluate(`!!document.querySelector(${JSON.stringify(sel)})`), true, 'missing ' + sel);
      }
      const groups = await page.evaluate('document.querySelectorAll("#import-panel .import-card").length');
      assert.ok(groups >= 3, 'import panel grouped into >=3 cards, got ' + groups);
      // Stylesheet carries responsive + accessibility + print hooks.
      const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
      assert.match(css, /prefers-color-scheme/);
      assert.match(css, /prefers-reduced-motion/);
      assert.match(css, /@media print/);
      assert.match(css, /:focus-visible/);
    });

    await runCase('workbench-board-sample-emptystate', async () => {
      await page.viewport(1280, 900);
      await page.click('#btn-load-sample');
      await page.waitFor('document.querySelectorAll("#board .dep-card").length === 12', 'sample 12 cards');
      // Compact category summaries reflect the real sample.
      const stats = await page.evaluate('[...document.querySelectorAll(".stat-num")].map(n => n.textContent).join(",")');
      assert.equal(stats, '10,14,6,5,3,1,1,11');
      // Empty state on a search with no match (not a .dep-card, honest text).
      await page.fill('#search-input', 'zzzz-no-such-domain-zzz');
      await page.waitFor('!document.querySelector("#board-empty")?.hidden', 'empty state visible');
      const emptyText = await page.evaluate('document.querySelector("#board-empty")?.textContent || ""');
      assert.match(emptyText, /No entry groups match/i);
      assert.equal(await page.evaluate('document.querySelectorAll("#board .dep-card").length'), 0);
      const filterText = await page.evaluate('document.querySelector("#filter-status").textContent');
      assert.match(filterText, /Showing 0 of 10/);
      await page.screenshot(path.join(SHOTS, 'workbench-empty.png'));
      // Recovery clears the empty state.
      await page.fill('#search-input', '');
      await page.waitFor('document.querySelectorAll("#board .dep-card").length === 12', 'board restored');
      assert.equal(await page.evaluate('document.querySelector("#board-empty").hidden'), true);
      // Detail open/close keeps focus behavior.
      await page.click('#board .dep-card[data-ref="C04"] .card-details');
      await page.waitFor('!document.querySelector("#detail-pane").hidden', 'detail open');
      await page.key('Escape');
      await page.waitFor('document.querySelector("#detail-pane").hidden', 'detail closed');
    });

    await runCase('workbench-focus-mobile-containment', async () => {
      await page.viewport(1280, 900);
      await page.goto(INDEX);
      await page.key('Tab');
      await page.waitFor('document.activeElement && document.activeElement.id === "file-input"', 'file input focused');
      await page.waitFor('getComputedStyle(document.querySelector("#file-label")).outlineStyle === "solid"', 'label ring');
      const w = await page.evaluate('parseFloat(getComputedStyle(document.querySelector("#file-label")).outlineWidth)');
      assert.ok(w >= 2, 'ring >=2px, got ' + w);
      await page.click('#btn-load-sample');
      await page.waitFor('document.querySelectorAll("#board .dep-card").length === 12', 'sample');
      for (const width of [390, 320]) {
        await page.viewport(width, 844);
        const ov = await page.evaluate('Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth');
        assert.ok(ov <= 1, 'overflow at ' + width + 'px: ' + ov);
      }
      await page.viewport(300, 844);
      const ov300 = await page.evaluate('Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth');
      assert.ok(ov300 <= 1, 'overflow at 300px proxy: ' + ov300);
      await page.screenshot(path.join(SHOTS, 'workbench-mobile-320.png'));
      await page.viewport(1280, 900);
      await page.screenshot(path.join(SHOTS, 'workbench-desktop.png'));
      assert.equal(await page.evaluate('window.localStorage.length === 0 && window.sessionStorage.length === 0'), true);
    });

    await runCase('workbench-reviewfix-light-pressed-AA', async () => {
      await page.viewport(1280, 900);
      await page.command('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-color-scheme', value: 'light' }] });
      await page.click('#btn-load-sample');
      await page.waitFor('document.querySelectorAll("#board .dep-card").length === 12', 'sample 12');
      const luminance = (rgb) => {
        const v = rgb.slice(0, 3).map((n) => n / 255).map((n) => (n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)));
        return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
      };
      const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
      for (const category of ['local', 'cloud', 'unknown', 'custom']) {
        await page.click('#chip-' + category);
        const pair = await page.evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify('#chip-' + category)});
          const parse = (v) => (v.match(/[\\d.]+/g) || []).map(Number);
          const fg = parse(getComputedStyle(el).color);
          let node = el, bg = null;
          while (node) { const c = parse(getComputedStyle(node).backgroundColor); if (c.length === 3 || c[3] === 1) { bg = c; break; } node = node.parentElement; }
          return { fg, bg };
        })()`);
        const ratio = contrast(pair.fg, pair.bg);
        assert.ok(ratio >= 4.5, 'light pressed ' + category + ' ratio=' + ratio + ' ' + JSON.stringify(pair));
      }
      await page.command('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    });

    await runCase('workbench-reviewfix-scroll-focus-print-meta', async () => {
      await page.viewport(1280, 900);
      const meta = await page.evaluate('document.querySelector("meta[name=color-scheme]")?.content || ""');
      assert.match(meta, /light/);
      assert.match(meta, /dark/);
      const wrappers = await page.evaluate('[...document.querySelectorAll(".table-scroll")].map((n) => ({ tab: n.tabIndex, role: n.getAttribute("role"), label: n.getAttribute("aria-label") }))');
      assert.ok(wrappers.length >= 2, 'two scroll regions, got ' + JSON.stringify(wrappers));
      for (const w of wrappers) {
        assert.equal(w.tab, 0, 'scroll region tabindex=0, got ' + JSON.stringify(w));
        assert.equal(w.role, 'region', 'scroll region role=region, got ' + JSON.stringify(w));
        assert.ok(w.label && w.label.length > 8, 'scroll region useful label, got ' + JSON.stringify(w));
      }
      await page.click('#btn-load-sample');
      await page.waitFor('document.querySelectorAll("#board .dep-card").length === 12', 'sample 12');
      // Filter-status intentionally counts entry groups, not graph cards.
      const filterText = await page.evaluate('document.querySelector("#filter-status").textContent');
      assert.match(filterText, /Showing 10 of 10/);
      assert.equal(await page.evaluate('document.querySelectorAll("#board .dep-card").length'), 12);
      await page.click('#board .dep-card[data-ref="C04"] .card-details');
      await page.waitFor('!document.querySelector("#detail-pane").hidden', 'detail open');
      assert.equal(await page.evaluate('document.activeElement.id'), 'btn-detail-close', 'focus moves to close button');
      await page.screenshot(path.join(SHOTS, 'workbench-detail-focused.png'));
      await page.key('Escape');
      await page.waitFor('document.querySelector("#detail-pane").hidden', 'detail closed');
      assert.ok(await page.evaluate('document.activeElement && document.activeElement.matches(".card-details")'), 'Escape returns focus to opener');
      const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
      assert.ok(!css.includes('.skip-link'), 'dead skip-link CSS removed');
      assert.match(css, /--evidence-bg/);
      await page.click('#board .dep-card[data-ref="C04"] .card-details');
      await page.waitFor('!document.querySelector("#detail-pane").hidden', 'detail reopen');
      await page.command('Emulation.setEmulatedMedia', { media: 'print', features: [{ name: 'prefers-color-scheme', value: 'light' }] });
      const evidence = await page.evaluate(`(() => {
        const el = document.querySelector('.evidence-block');
        if (!el) return null;
        const parse = (v) => (v.match(/[\\d.]+/g) || []).map(Number);
        const fg = parse(getComputedStyle(el).color);
        let node = el, bg = null;
        while (node) { const c = parse(getComputedStyle(node).backgroundColor); if (c.length === 3 || c[3] === 1) { bg = c; break; } node = node.parentElement; }
        return { fg, bg };
      })()`);
      assert.ok(evidence && evidence.bg, 'evidence pair present, got ' + JSON.stringify(evidence));
      const lum = (rgb) => {
        const v = rgb.slice(0, 3).map((n) => n / 255).map((n) => (n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)));
        return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
      };
      const cr = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
      assert.ok(lum(evidence.bg) > 0.9, 'paper evidence bg light, got ' + JSON.stringify(evidence));
      assert.ok(cr(evidence.fg, evidence.bg) >= 4.5, 'paper evidence AA, got ' + JSON.stringify(evidence) + ' ratio=' + cr(evidence.fg, evidence.bg));
      await page.command('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
      // First-Tab contract preserved: file input focused with label ring.
      await page.goto(INDEX);
      await page.key('Tab');
      await page.waitFor('document.activeElement && document.activeElement.id === "file-input"', 'file input focused');
    });

    page.assertClean();
    results.push({ name: 'whole-session-zero-errors-zero-requests', status: 'pass' });
    console.log('PASS whole-session-zero-errors-zero-requests');
  } catch (error) {
    results.push({ name: 'suite-harness', status: 'fail', message: error.message });
    console.error('SUITE FAILURE\n' + error.stack);
  } finally {
    try { fs.writeFileSync(path.join(ART, 'ui-workbench-results.json'), JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)); } catch {}
    await page.close();
  }
  const failed = results.filter(r => r.status === 'fail');
  console.log(JSON.stringify({ cases: results.length, pass: results.length - failed.length, fail: failed.length }));
  if (!results.length || failed.length) process.exitCode = 1;
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
