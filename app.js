'use strict';
// OfflineReadiness — DOM wiring. Classic script, no modules, no fetch/XHR,
// no browser storage, no telemetry. All rendering uses textContent/createElement
// (no HTML sinks), so imported strings can never become markup.
(function () {
  var OR = window.OfflineReadiness;
  var CLS = window.OfflineReadinessClassifications;
  var SAMPLE = window.OfflineReadinessSample;

  var view = {
    built: null,
    sourceLabel: '',
    filter: 'all',
    search: '',
    issuesOnly: false,
    detailRef: null,
    importSeq: 0,
    detailOpener: null
  };

  function $(id) { return document.getElementById(id); }

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      if (props.className) node.className = props.className;
      if (props.text !== undefined && props.text !== null) node.textContent = String(props.text);
      if (props.attrs) for (var key in props.attrs) node.setAttribute(key, props.attrs[key]);
    }
    if (children) for (var index = 0; index < children.length; index += 1) {
      if (children[index]) node.appendChild(children[index]);
    }
    return node;
  }

  var errorLine = $('error-line');
  var statusLine = $('status-line');
  var sourceKind = $('source-kind');

  function showError(error) {
    // Structured errors only: code + message. Core never echoes file content.
    errorLine.textContent = (error && error.code ? error.code : 'ERROR') + ' — ' + (error && error.message ? error.message : 'Unexpected problem.');
    errorLine.hidden = false;
  }
  function clearError() { errorLine.hidden = true; errorLine.textContent = ''; }

  // ------------------------------------------------------------- import flow

  function applyImport(result, label) {
    if (!result.ok) { showError(result.error); return false; }
    var built = OR.buildState(result.value, CLS, { nowIso: new Date().toISOString() });
    if (!built.ok) { showError(built.error); return false; }
    view.built = built.value;
    view.sourceLabel = label;
    view.detailRef = null;
    clearError();
    renderAll();
    return true;
  }

  function handleFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    var token = ++view.importSeq;
    var readers = files.map(function (file) {
      return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function () { resolve({ text: String(reader.result), size: file.size }); };
        reader.onerror = function () { resolve({ readError: true, size: file.size }); };
        reader.readAsText(file);
      });
    });
    Promise.all(readers).then(function (items) {
      if (token !== view.importSeq) return; // superseded by a newer import
      if (items.some(function (item) { return item.readError; })) {
        showError({ code: 'READ_ERROR', message: 'A selected file could not be read.' });
        return;
      }
      applyImport(
        OR.importFiles(items.map(function (item) { return { text: item.text, size: item.size }; })),
        files.length === 1 ? 'Selected file (1)' : 'Selected files (' + files.length + ')'
      );
    });
  }

  // ----------------------------------------------------------------- filters

  function hasWarning(issueList, entry) {
    return issueList.some(function (issue) {
      if (issue.severity !== 'warning') return false;
      if (issue.subjectRef === entry.ref) return true;
      return entry.entityRefs.indexOf(issue.subjectRef) !== -1 || entry.deviceRefs.indexOf(issue.subjectRef) !== -1;
    });
  }

  function searchMatch(query) {
    var built = view.built;
    var byRef = {};
    built.entities.forEach(function (entity) { byRef[entity.ref] = entity; });
    built.devices.forEach(function (device) { byRef[device.ref] = device; });
    return function (entry) {
      var haystack = [entry.ref, entry.domain, entry.title || ''];
      entry.entityRefs.forEach(function (ref) {
        var entity = byRef[ref];
        if (entity) haystack.push(entity.entityId, entity.displayName || '', entity.platform);
      });
      entry.deviceRefs.forEach(function (ref) {
        var device = byRef[ref];
        if (device) haystack.push(device.displayName || '', device.manufacturer || '', device.model || '');
      });
      return haystack.join('\n').toLowerCase().indexOf(query) !== -1;
    };
  }

  function visibleEntries() {
    var list = view.built.entries.slice();
    if (view.filter !== 'all') list = list.filter(function (entry) { return entry.category === view.filter; });
    var query = view.search.trim().toLowerCase();
    if (query) list = list.filter(searchMatch(query));
    if (view.issuesOnly) list = list.filter(function (entry) { return hasWarning(view.built.issues, entry); });
    return list;
  }

  function categoryTag(category) {
    return el('span', { className: 'tag cat-' + category, text: category });
  }

  // ---------------------------------------------------------------- rendering

  function renderStats() {
    var built = view.built;
    $('stat-entries').textContent = built.entries.length;
    $('stat-entities').textContent = built.entities.length;
    $('stat-devices').textContent = built.devices.length;
    $('stat-local').textContent = built.byCategory.local;
    $('stat-cloud').textContent = built.byCategory.cloud;
    $('stat-unknown').textContent = built.byCategory.unknown;
    $('stat-custom').textContent = built.byCategory.custom;
    $('stat-issues').textContent = built.stats.issuesTotal;
    $('chip-all').textContent = 'All (' + built.entries.length + ')';
    $('chip-local').textContent = 'Local (' + built.byCategory.local + ')';
    $('chip-cloud').textContent = 'Cloud (' + built.byCategory.cloud + ')';
    $('chip-unknown').textContent = 'Unknown (' + built.byCategory.unknown + ')';
    $('chip-custom').textContent = 'Custom / unlisted (' + built.byCategory.custom + ')';
  }

  function entryCard(entry) {
    var card = el('article', { className: 'dep-card', attrs: { 'data-category': entry.category, 'data-ref': entry.ref } });
    var heading = el('h3', null, [
      el('span', { className: 'domain', text: entry.domain }),
      categoryTag(entry.category)
    ]);
    if (entry.stale) heading.appendChild(el('span', { className: 'tag warn', text: 'stale evidence' }));
    if (entry.disabledBy !== null) heading.appendChild(el('span', { className: 'tag info', text: 'disabled' }));
    if (entry.prefDisablePolling) heading.appendChild(el('span', { className: 'tag info', text: 'polling off' }));
    card.appendChild(heading);
    card.appendChild(el('p', { className: 'card-title', text: entry.title || ('Entry ' + entry.ref) }));
    var warnings = entry.issueCodes.filter(function (code) {
      return view.built.issues.some(function (issue) { return issue.code === code && issue.severity === 'warning' && issue.subjectRef === entry.ref; });
    }).length;
    var meta = entry.entityRefs.length + ' entit' + (entry.entityRefs.length === 1 ? 'y' : 'ies') +
      ' · ' + entry.deviceRefs.length + ' device' + (entry.deviceRefs.length === 1 ? '' : 's') +
      ' · ' + entry.issueCodes.length + ' entry-level issue' + (entry.issueCodes.length === 1 ? '' : 's') +
      (warnings ? ' (' + warnings + ' entry-level warning' + (warnings === 1 ? '' : 's') + ')' : '');
    card.appendChild(el('p', { className: 'card-meta', text: meta }));
    if (entry.qualifiers.length) card.appendChild(el('p', { className: 'card-meta', text: 'Qualifier: ' + entry.qualifiers.join('; ') }));
    card.appendChild(el('div', { className: 'card-actions' }, [
      el('button', { className: 'btn small card-details', attrs: { type: 'button', 'data-ref': entry.ref }, text: 'Details' })
    ]));
    return card;
  }

  function graphCard(ref, title, lines) {
    var card = el('article', { className: 'dep-card', attrs: { 'data-category': 'graph', 'data-ref': ref } });
    card.appendChild(el('h3', null, [el('span', { className: 'domain', text: title })]));
    lines.forEach(function (line) {
      var row = el('p', { className: 'card-meta' }, [el('span', { text: line.text })]);
      if (line.category) row.appendChild(document.createTextNode(' '));
      if (line.category) row.appendChild(categoryTag(line.category));
      card.appendChild(row);
    });
    card.appendChild(el('div', { className: 'card-actions' }, [
      el('button', { className: 'btn small card-details', attrs: { type: 'button', 'data-ref': ref }, text: 'Details' })
    ]));
    return card;
  }

  function renderBoard() {
    var board = $('board');
    board.textContent = '';
    var visible = visibleEntries();
    visible.forEach(function (entry) { board.appendChild(entryCard(entry)); });

    var query = view.search.trim().toLowerCase();
    var unlinked = view.built.entities.filter(function (entity) { return view.built.unlinkedEntityRefs.indexOf(entity.ref) !== -1; });
    if (query) unlinked = unlinked.filter(function (entity) {
      return (entity.entityId + ' ' + (entity.displayName || '') + ' ' + entity.platform).toLowerCase().indexOf(query) !== -1;
    });
    var showUnlinked = unlinked.length > 0 && !view.issuesOnly;
    if (showUnlinked) {
      board.appendChild(graphCard('UNLINKED', 'Unlinked entities (' + unlinked.length + ')', unlinked.map(function (entity) {
        return { text: entity.entityId + ' — ' + entity.platform, category: entity.category };
      })));
    }

    var unattributed = view.built.devices.filter(function (device) { return view.built.unattributedDeviceRefs.indexOf(device.ref) !== -1; });
    if (query) unattributed = unattributed.filter(function (device) {
      return ((device.displayName || '') + ' ' + (device.manufacturer || '') + ' ' + (device.model || '')).toLowerCase().indexOf(query) !== -1;
    });
    var showUnattributed = unattributed.length > 0 && !view.issuesOnly;
    if (showUnattributed) {
      board.appendChild(graphCard('UNATTRIBUTED', 'Unattributed devices (' + unattributed.length + ')', unattributed.map(function (device) {
        return { text: (device.displayName || device.deviceId) + ' — ' + (device.manufacturer || 'unknown maker'), category: null };
      })));
    }

    var filterBits = [];
    filterBits.push('Showing ' + visible.length + ' of ' + view.built.entries.length + ' entry groups.');
    if (view.filter !== 'all') filterBits.push('Category: ' + view.filter + '.');
    if (query) filterBits.push('Search: “' + view.search.trim() + '”.');
    if (view.issuesOnly) filterBits.push('Warnings only (entry, entity or device level).');
    if (showUnlinked) filterBits.push(unlinked.length + ' unlinked entit' + (unlinked.length === 1 ? 'y' : 'ies') + ' shown.');
    if (showUnattributed) filterBits.push(unattributed.length + ' unattributed device' + (unattributed.length === 1 ? '' : 's') + ' shown.');
    $('filter-status').textContent = filterBits.join(' ');
    var empty = $('board-empty');
    if (empty) empty.hidden = board.children.length !== 0;
    var issuesEmpty = $('issues-empty');
    if (issuesEmpty) issuesEmpty.hidden = view.built.issues.length !== 0;
    if (view.detailRef) renderDetail(view.detailRef, false);
  }

  function issueText(issue) {
    // Local display only (never used in downloads); raw ids are fine here.
    var subject = issue.subjectId || issue.subjectRef || 'import';
    switch (issue.code) {
      case 'RECORD_REJECTED': return 'A ' + issue.recordKind + ' record was skipped (' + issue.reason + ').';
      case 'DUPLICATE_ENTRY_ID': return 'Entry ' + subject + ' duplicates an earlier entry id; later record ignored.';
      case 'DUPLICATE_ENTITY_ID': return 'Entity ' + subject + ' duplicates an earlier entity id; later record ignored.';
      case 'DUPLICATE_DEVICE_ID': return 'Device ' + subject + ' duplicates an earlier device id; later record ignored.';
      case 'REFS_TRUNCATED': return 'Device ' + subject + ' had ' + issue.count + ' extra config entry references dropped (cap ' + OR.LIMITS.maxRefsPerDevice + ').';
      case 'ORPHAN_ENTITY_ENTRY': return 'Entity ' + subject + ' references a config entry not present in this import (' + (issue.missingRef || 'missing') + ').';
      case 'ORPHAN_ENTITY_DEVICE': return 'Entity ' + subject + ' references a device not present in this import (' + (issue.missingRef || 'missing') + ').';
      case 'ORPHAN_DEVICE_ENTRY': return 'Device ' + subject + ' references a config entry not present in this import (' + (issue.missingRef || 'missing') + ').';
      case 'ORPHAN_DEVICE_VIA': return 'Device ' + subject + ' is a child of a device not present in this import (' + (issue.missingRef || 'missing') + ').';
      case 'PLATFORM_DOMAIN_MISMATCH': return 'Entity ' + subject + ' has platform "' + issue.platform + '" but its config entry domain is "' + issue.entryDomain + '" — ambiguous attribution.';
      case 'UNLINKED_ENTITY': return 'Entity ' + subject + ' has no config entry or device reference; classified from its platform.';
      case 'DANGLING_ENTRY': return 'Entry ' + subject + ' is not referenced by any entity or device in this import.';
      case 'DYNAMIC_PLATFORM': return 'Entity ' + subject + ' uses the dynamic platform "' + issue.platform + '"; not evaluated.';
      case 'UNKNOWN_DOMAIN': return 'Entry ' + subject + ' uses domain "' + issue.domain + '", which is not in the bundled evidence set (custom/unlisted).';
      case 'STALE_EVIDENCE': return 'Entry ' + subject + ' uses evidence ' + issue.staleDays + ' days old (threshold ' + OR.LIMITS.staleAfterDays + ').';
      case 'ISSUES_TRUNCATED': return issue.count + ' further issues omitted from this list (cap ' + OR.LIMITS.maxIssues + '); totals stay complete.';
      default: return 'Issue recorded.';
    }
  }

  function renderIssues() {
    var tbody = $('issues-list');
    tbody.textContent = '';
    view.built.issues.forEach(function (issue) {
      tbody.appendChild(el('tr', null, [
        el('td', { text: issue.code }),
        el('td', { className: issue.severity === 'warning' ? 'sev-warning' : 'sev-info', text: issue.severity }),
        el('td', { text: issue.subjectRef || 'IMPORT' }),
        el('td', { text: issueText(issue) })
      ]));
    });
    $('issues-count').textContent = view.built.stats.issuesTotal + ' issue(s); ' + view.built.stats.issuesShown + ' shown.' +
      ' Rejected records: ' + view.built.stats.rejectedRecords + '. Duplicates: ' + view.built.stats.duplicates + '.';
  }

  function renderEvidence() {
    var tbody = $('evidence-list');
    tbody.textContent = '';
    var domains = Object.keys(view.built.evidence.domainsUsed).sort();
    domains.forEach(function (domain) {
      var item = view.built.evidence.domainsUsed[domain];
      var sourceCell = el('td');
      if (item.sourceUrl) {
        sourceCell.appendChild(el('a', { attrs: { href: item.sourceUrl, target: '_blank', rel: 'noreferrer noopener' }, text: item.sourceUrl }));
      }
      tbody.appendChild(el('tr', null, [
        el('td', { text: domain }),
        el('td', { text: item.iotClass === null ? '(none declared)' : item.iotClass }),
        el('td', { text: item.category }),
        el('td', { text: item.retrieved || '—' }),
        el('td', { text: item.stale ? 'yes' : 'no' }),
        sourceCell
      ]));
    });
    $('evidence-count').textContent = domains.length + ' domain(s) with bundled evidence; the rest are custom/unlisted or dynamic platforms.';
  }

  function renderDetail(ref, scrollTo) {
    var built = view.built;
    var pane = $('detail-pane');
    var title = $('detail-title');
    var body = $('detail-body');
    body.textContent = '';

    function kvRow(term, value) {
      return [el('dt', { text: term }), el('dd', { text: value })];
    }
    function issueListFor(refValue) {
      var list = el('ul');
      var found = false;
      built.issues.forEach(function (issue) {
        if (issue.subjectRef === refValue) {
          found = true;
          list.appendChild(el('li', { text: issue.code + ' — ' + issueText(issue) }));
        }
      });
      return found ? list : null;
    }

    if (ref === 'UNLINKED' || ref === 'UNATTRIBUTED') {
      title.textContent = ref === 'UNLINKED' ? 'Unlinked entities' : 'Unattributed devices';
      var list = el('ul');
      if (ref === 'UNLINKED') {
        built.entities.forEach(function (entity) {
          if (built.unlinkedEntityRefs.indexOf(entity.ref) === -1) return;
          var item = el('li', null, [el('span', { text: entity.entityId + ' (' + entity.platform + ', ' + entity.ref + ') ' })]);
          item.appendChild(categoryTag(entity.category));
          list.appendChild(item);
        });
        body.appendChild(el('p', { className: 'card-meta', text: 'These entities carry no config entry or device reference (YAML-configured or helper platforms). They are classified from their platform and are not attributed to any entry.' }));
      } else {
        built.devices.forEach(function (device) {
          if (built.unattributedDeviceRefs.indexOf(device.ref) === -1) return;
          list.appendChild(el('li', { text: (device.displayName || device.deviceId) + ' (' + device.ref + ')' + (device.disabledBy ? ' — disabled' : '') }));
        });
        body.appendChild(el('p', { className: 'card-meta', text: 'These devices list no config entry references in the import.' }));
      }
      body.appendChild(list);
      pane.hidden = false;
      if (scrollTo) {
        $('btn-detail-close').focus();
        pane.scrollIntoView({ block: 'nearest' });
      }
      return;
    }

    var entry = null;
    built.entries.forEach(function (item) { if (item.ref === ref) entry = item; });
    if (!entry) { pane.hidden = true; return; }
    title.textContent = entry.domain + ' — ' + entry.ref;
    var headingBits = el('p', { className: 'card-meta' }, [categoryTag(entry.category)]);
    if (entry.stale) headingBits.appendChild(el('span', { className: 'tag warn', text: 'stale evidence' }));
    body.appendChild(headingBits);

    var kv = el('dl', { className: 'kv' });
    var rows = [];
    rows = rows.concat(kvRow('Reference', entry.ref));
    rows = rows.concat(kvRow('Title', entry.title || '(untitled)'));
    rows = rows.concat(kvRow('Source', entry.source || '—'));
    rows = rows.concat(kvRow('Disabled', entry.disabledBy ? 'yes (' + entry.disabledBy + ')' : 'no'));
    rows = rows.concat(kvRow('Polling disabled', entry.prefDisablePolling ? 'yes' : 'no'));
    rows = rows.concat(kvRow('Created', entry.createdAt || '—'));
    rows = rows.concat(kvRow('Modified', entry.modifiedAt || '—'));
    rows.forEach(function (node) { kv.appendChild(node); });
    body.appendChild(kv);

    if (entry.evidence) {
      var evidence = entry.evidence;
      var block = el('div', { className: 'evidence-block' });
      block.appendChild(el('p', { text: 'iot_class: ' + (evidence.iotClass === null ? '(none declared)' : evidence.iotClass) + ' · category: ' + evidence.category + ' · reason: ' + evidence.reason }));
      block.appendChild(el('p', { text: 'Retrieved: ' + (evidence.retrieved || 'unknown') + (evidence.stale ? ' (stale — ' + evidence.staleDays + ' days)' : '') }));
      if (evidence.sourceUrl) block.appendChild(el('p', null, [el('a', { attrs: { href: evidence.sourceUrl, target: '_blank', rel: 'noreferrer noopener' }, text: evidence.sourceUrl })]));
      if (evidence.scope) block.appendChild(el('p', { text: 'Scope: ' + evidence.scope }));
      if (evidence.notes) block.appendChild(el('p', { text: evidence.notes }));
      if (evidence.qualifiers && evidence.qualifiers.length) block.appendChild(el('p', { text: 'Qualifiers: ' + evidence.qualifiers.join('; ') }));
      if (evidence.overrideNote) block.appendChild(el('p', { text: 'Policy override: ' + evidence.overrideNote }));
      body.appendChild(el('h4', { text: 'Classification evidence' }));
      body.appendChild(block);
    } else {
      body.appendChild(el('h4', { text: 'Classification evidence' }));
      body.appendChild(el('p', { className: 'card-meta', text: entry.reason === 'not_in_bundle'
        ? 'No bundled evidence for this domain — reported as custom/unlisted, never assumed local.'
        : 'Dynamic platform policy: effective locality depends on referenced sources and is not evaluated.' }));
    }

    body.appendChild(el('h4', { text: 'Entities (' + entry.entityRefs.length + ')' }));
    var entityList = el('ul');
    entry.entityRefs.forEach(function (entityRef) {
      var entity = null;
      built.entities.forEach(function (item) { if (item.ref === entityRef) entity = item; });
      if (!entity) return;
      var item = el('li', null, [el('span', { text: (entity.displayName || entity.entityId) + ' · ' + entity.entityId + ' · ' + entity.ref + ' ' })]);
      item.appendChild(categoryTag(entity.category));
      var flags = [];
      if (entity.dynamic) flags.push('dynamic');
      if (entity.disabledBy) flags.push('disabled');
      if (entity.hiddenBy) flags.push('hidden');
      if (flags.length) item.appendChild(el('span', { className: 'card-meta', text: ' (' + flags.join(', ') + ')' }));
      entityList.appendChild(item);
    });
    if (entry.entityRefs.length) body.appendChild(entityList);
    else body.appendChild(el('p', { className: 'card-meta', text: 'No entities reference this entry in the import.' }));

    body.appendChild(el('h4', { text: 'Devices (' + entry.deviceRefs.length + ')' }));
    var deviceList = el('ul');
    entry.deviceRefs.forEach(function (deviceRef) {
      var device = null;
      built.devices.forEach(function (item) { if (item.ref === deviceRef) device = item; });
      if (!device) return;
      deviceList.appendChild(el('li', { text: (device.displayName || device.deviceId) + ' · ' + [device.manufacturer, device.model].filter(Boolean).join(' / ') + ' · ' + device.ref }));
    });
    if (entry.deviceRefs.length) body.appendChild(deviceList);
    else body.appendChild(el('p', { className: 'card-meta', text: 'No devices reference this entry in the import.' }));

    var issues = issueListFor(entry.ref);
    body.appendChild(el('h4', { text: 'Issues' }));
    body.appendChild(issues || el('p', { className: 'card-meta', text: 'No issues recorded for this entry.' }));

    pane.hidden = false;
    if (scrollTo) {
      $('btn-detail-close').focus();
      pane.scrollIntoView({ block: 'nearest' });
    }
  }

  function closeDetail() {
    view.detailRef = null;
    $('detail-pane').hidden = true;
    if (view.detailOpener && document.contains(view.detailOpener)) view.detailOpener.focus();
  }

  function renderDownloads() {
    var ready = Boolean(view.built);
    $('btn-download-json').disabled = !ready;
    $('btn-download-html').disabled = !ready;
  }

  function renderAll() {
    $('board-panel').hidden = false;
    $('issues-panel').hidden = false;
    $('evidence-panel').hidden = false;
    $('download-panel').hidden = false;
    renderStats();
    renderBoard();
    renderIssues();
    renderEvidence();
    renderDownloads();
    var built = view.built;
    sourceKind.textContent = built.kind === 'snapshot'
      ? 'Source: normalized snapshot' + (built.haVersion ? ' (Home Assistant ' + built.haVersion + ')' : '') + ' · ' + view.sourceLabel
      : 'Source: registry bundle (' + built.parts.length + ' files) · ' + view.sourceLabel;
    statusLine.textContent = view.sourceLabel + ' — ' + built.entries.length + ' entries, ' + built.entities.length + ' entities, ' +
      built.devices.length + ' devices, ' + built.stats.issuesTotal + ' issue(s). Discarded before state creation: ' +
      built.stats.discarded.total + ' field slot(s) (conservative buckets, not an exact credential count: sensitive/credential-bearing ' +
      built.stats.discarded.credentials + ', unique ids ' + built.stats.discarded.uniqueIds + ', network identifiers ' +
      built.stats.discarded.networkIdentifiers + ', other ' + built.stats.discarded.other + ').';
  }

  // ------------------------------------------------------------------ wiring

  function downloadReport(format) {
    if (!view.built) return;
    var result = OR.buildReport(view.built, {
      format: format,
      includeIdentifiers: $('optin-identifiers').checked,
      generatedAtIso: new Date().toISOString()
    });
    if (!result.ok) { showError(result.error); return; }
    var blob = new Blob([result.value.text], { type: result.value.mime });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.value.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function setFilter(category) {
    view.filter = category;
    ['all', 'local', 'cloud', 'unknown', 'custom'].forEach(function (name) {
      $('chip-' + name).setAttribute('aria-pressed', name === category ? 'true' : 'false');
    });
    renderBoard();
  }

  function boot() {
    if (!OR || !CLS || !SAMPLE) {
      showError({ code: 'MISSING_DATA', message: 'The local data files failed to load. Keep index.html, core.js, app.js, data/ and fixtures/ together.' });
      return;
    }
    $('file-input').addEventListener('change', function (event) { handleFiles(event.target.files); });
    $('btn-load-sample').addEventListener('click', function () {
      applyImport(OR.importFiles([{ text: JSON.stringify(SAMPLE.snapshot) }]), 'Fictional sample loaded');
    });
    ['all', 'local', 'cloud', 'unknown', 'custom'].forEach(function (name) {
      $('chip-' + name).addEventListener('click', function () { setFilter(name); });
    });
    $('search-input').addEventListener('input', function (event) { view.search = event.target.value; renderBoard(); });
    $('issues-only').addEventListener('change', function (event) { view.issuesOnly = event.target.checked; renderBoard(); });
    $('board').addEventListener('click', function (event) {
      var target = event.target;
      if (target && target.classList && target.classList.contains('card-details')) {
        view.detailRef = target.getAttribute('data-ref');
        view.detailOpener = target;
        renderDetail(view.detailRef, true);
      }
    });
    $('btn-detail-close').addEventListener('click', closeDetail);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && view.detailRef) closeDetail();
    });
    $('btn-download-json').addEventListener('click', function () { downloadReport('json'); });
    $('btn-download-html').addEventListener('click', function () { downloadReport('html'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
