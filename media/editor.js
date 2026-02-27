// @ts-nocheck
(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  let state = vscode.getState() || {
    openTabs: [],
    activeTabId: null,
    environments: { active: 'local', envs: {} },
    history: [],
    queryCost: null,
    securityResult: null,
    sharedHeaders: [],
  };
  if (!state.sharedHeaders) state.sharedHeaders = [];
  if (!state.securityResult) state.securityResult = null;

  let tabStates = {};
  let isLoading = false;

  // Signal to the extension host that the webview is ready
  vscode.postMessage({ type: 'webviewReady' });
  let contextMenu = null;

  function saveState() { vscode.setState(state); }
  function $(sel) { return document.querySelector(sel); }

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null) continue;
        if (k === 'className') e.className = v;
        else if (k === 'textContent') e.textContent = v;
        else if (k === 'innerHTML') e.innerHTML = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k === 'value') e.value = v;
        else e.setAttribute(k, v);
      }
    }
    if (children) {
      if (typeof children === 'string') e.textContent = children;
      else if (Array.isArray(children)) children.forEach(c => { if (c) e.appendChild(c); });
      else e.appendChild(children);
    }
    return e;
  }

  // ── Messages from extension host ──
  window.addEventListener('message', e => {
    const msg = e.data;
    switch (msg.type) {
      case 'openRequest':
        handleOpenRequest(msg.payload);
        break;
      case 'environmentsLoaded':
        state.environments = msg.payload;
        saveState();
        renderStatusBar();
        renderEditor();
        break;
      case 'historyLoaded':
        state.history = msg.payload;
        saveState();
        break;
      case 'secretsList':
        break;
      case 'queryResult':
        isLoading = false;
        handleQueryResult(msg.payload);
        break;
      case 'queryError':
        isLoading = false;
        handleQueryError(msg.payload);
        break;
      case 'saveConfirmed':
        showSaveToast();
        if (state.activeTabId && tabStates[state.activeTabId]) {
          const ts = tabStates[state.activeTabId];
          ts.initialQuery = ts.query;
          ts.initialVariables = ts.variables;
          ts.initialHeaderEntries = ts.headerEntries.map(e => ({ ...e }));
          syncDirtyState();
          renderTabs();
        }
        break;
      case 'promptSaveToCollection':
        showSaveToCollectionDialog(msg.payload);
        break;
      case 'collectionsLoaded':
        // Used by save-to-collection dialog refresh
        break;
      case 'queryCostResult':
        state.queryCost = msg.payload;
        saveState();
        renderCostBadge();
        break;
      case 'sharedHeadersLoaded':
        state.sharedHeaders = msg.payload || [];
        saveState();
        break;
      case 'securityResult':
        state.securityResult = msg.payload;
        saveState();
        renderSecurityBadge();
        break;
      case 'performanceAnomaly':
        showPerformanceAlert(msg.payload);
        break;
      case 'performanceStatsLoaded':
        // handled silently
        break;
      case 'provenanceLoaded':
        if (state.activeTabId && tabStates[state.activeTabId]) {
          tabStates[state.activeTabId].provenance = msg.payload;
          if (tabStates[state.activeTabId].responseSubTab === 'provenance') renderEditor();
        }
        break;
      case 'nlResult':
        break;
    }
  });

  // ── Init ──
  function init() {
    const app = $('#app');
    app.innerHTML = '';
    app.appendChild(el('div', { className: 'tabs-bar', id: 'tabs-bar' }));
    app.appendChild(el('div', { id: 'editor-content', style: { flex: '1', display: 'flex', flexDirection: 'column', overflow: 'hidden' } }));
    app.appendChild(el('div', { className: 'status-bar', id: 'status-bar' }));

    vscode.postMessage({ type: 'loadEnvironments' });
    vscode.postMessage({ type: 'loadHistory' });
    vscode.postMessage({ type: 'loadSharedHeaders' });

    renderTabs();
    renderEditor();
    renderStatusBar();
  }

  // ── Open Request (from sidebar) ──
  function handleOpenRequest(req) {
    if (!state.openTabs.find(t => t.id === req.id)) {
      state.openTabs.push({ id: req.id, name: req.name, type: req.type });
    }
    state.activeTabId = req.id;

    if (!tabStates[req.id]) {
      // Build initial argValues from variables JSON
      const argValues = {};
      const operationArgs = req.operationArgs || [];
      try {
        const parsed = JSON.parse(req.variables || '{}');
        for (const arg of operationArgs) {
          argValues[arg.name] = parsed[arg.name] !== undefined ? String(parsed[arg.name]) : '';
        }
      } catch {}

      const initialQuery = req.query || '';
      const initialVariables = req.variables || '{}';
      const headerEntries = headersToEntries(req.headers || {});
      const initialHeaderEntries = headerEntries.map(e => ({ ...e }));

      tabStates[req.id] = {
        request: req,
        query: initialQuery,
        variables: initialVariables,
        headerEntries: headerEntries,
        initialQuery: initialQuery,
        initialVariables: initialVariables,
        initialHeaderEntries: initialHeaderEntries,
        response: null,
        responseTime: null,
        activeSubTab: 'query',
        responseSubTab: 'response',
        returnTypeName: req.returnTypeName || null,
        availableFields: req.availableFields || [],
        selectedFields: parseQueryFields(initialQuery),
        expandedObjectFields: {},
        operationArgs: operationArgs,
        argValues: argValues,
        bottomPanelExpanded: true,
      };
    }

    saveState();
    renderTabs();
    renderEditor();

    // Provenance: track creation if new request
    if (!tabStates[req.id].provenanceTracked) {
      tabStates[req.id].provenanceTracked = true;
      var origin = req.source === 'schema-explorer' ? 'schema-explorer' : req.source === 'nl-input' ? 'nl-input' : 'manual';
      trackProvenanceEntry('created', 'Request opened: ' + req.name, { origin: origin, querySnapshot: req.query || '' });
    }
  }

  // ── Tabs ──
  function renderTabs() {
    const tabsBar = $('#tabs-bar');
    if (!tabsBar) return;
    tabsBar.innerHTML = '';

    state.openTabs.forEach(tab => {
      const isActive = tab.id === state.activeTabId;
      const tabEl = el('div', {
        className: 'tab' + (isActive ? ' active' : ''),
        onClick: () => {
          state.activeTabId = tab.id;
          saveState();
          renderTabs();
          renderEditor();
        },
      });
      tabEl.appendChild(el('span', { className: 'tree-badge ' + tab.type, textContent: tab.type.charAt(0).toUpperCase() }));
      const ts = tabStates[tab.id];
      const dirty = ts && isTabDirty(ts);
      tabEl.appendChild(el('span', { textContent: tab.name }));
      if (dirty) tabEl.appendChild(el('span', { className: 'tab-dirty-dot', textContent: '\u25CF' }));
      tabEl.appendChild(el('button', {
        className: 'btn-icon close-btn', innerHTML: '&times;',
        onClick: e => { e.stopPropagation(); closeTab(tab.id); },
      }));
      tabsBar.appendChild(tabEl);
    });
  }

  function isTabDirty(ts) {
    return ts.query !== ts.initialQuery ||
      ts.variables !== ts.initialVariables ||
      !headerEntriesEqual(ts.headerEntries, ts.initialHeaderEntries);
  }

  function closeTab(tabId) {
    const ts = tabStates[tabId];
    if (ts && isTabDirty(ts)) {
      showCloseTabDialog(tabId, ts);
    } else {
      doCloseTab(tabId);
    }
  }

  function doCloseTab(tabId) {
    state.openTabs = state.openTabs.filter(t => t.id !== tabId);
    delete tabStates[tabId];
    if (state.activeTabId === tabId) {
      if (state.openTabs.length > 0) {
        state.activeTabId = state.openTabs[state.openTabs.length - 1].id;
      } else {
        state.activeTabId = null;
      }
    }
    saveState();
    syncDirtyState();
    renderTabs();
    renderEditor();
  }

  function showCloseTabDialog(tabId, ts) {
    const tabInfo = state.openTabs.find(t => t.id === tabId);
    const name = tabInfo ? tabInfo.name : 'this request';

    const overlay = el('div', { className: 'modal-overlay' });
    const modal = el('div', { className: 'modal' });
    modal.appendChild(el('div', { className: 'modal-title', textContent: 'Unsaved Changes' }));
    modal.appendChild(el('div', { className: 'modal-desc', textContent: 'Save changes to "' + name + '"?' }));

    const actions = el('div', { className: 'close-dialog-actions' });
    actions.appendChild(el('button', {
      className: 'btn btn-primary', textContent: 'Save',
      onClick: () => {
        overlay.remove();
        saveTabRequest(tabId);
        doCloseTab(tabId);
      },
    }));
    actions.appendChild(el('button', {
      className: 'btn btn-secondary', textContent: "Don't Save",
      onClick: () => { overlay.remove(); doCloseTab(tabId); },
    }));
    actions.appendChild(el('button', {
      className: 'btn btn-secondary', textContent: 'Cancel',
      onClick: () => overlay.remove(),
    }));
    modal.appendChild(actions);
    overlay.appendChild(modal);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function saveTabRequest(tabId) {
    const ts = tabStates[tabId];
    if (!ts) return;

    vscode.postMessage({
      type: 'saveRequest',
      payload: {
        requestId: tabId,
        updates: { query: ts.query, variables: ts.variables, headers: entriesToHeaders(ts.headerEntries) },
      },
    });
  }

  function syncDirtyState() {
    const dirtyTabs = [];
    for (const tab of state.openTabs) {
      const ts = tabStates[tab.id];
      if (ts && isTabDirty(ts)) {
        dirtyTabs.push({
          id: tab.id,
          name: tab.name,
          type: tab.type,
          query: ts.query,
          variables: ts.variables,
          headers: entriesToHeaders(ts.headerEntries),
        });
      }
    }
    vscode.postMessage({ type: 'dirtyState', payload: dirtyTabs });
  }

  // ── Editor ──
  function renderEditor() {
    const content = $('#editor-content');
    if (!content) return;
    content.innerHTML = '';

    if (!state.activeTabId) {
      content.appendChild(el('div', { className: 'welcome' }, [
        el('div', { className: 'welcome-icon', textContent: '{ }' }),
        el('div', { className: 'welcome-text', textContent: 'GraphQL CLNT' }),
        el('div', { className: 'welcome-hint', textContent: 'Select a request from the sidebar to get started' }),
      ]));
      return;
    }

    const ts = tabStates[state.activeTabId];
    if (!ts) return;

    // Normalize sub-tab (removed variables/fields tabs)
    if (ts.activeSubTab !== 'query' && ts.activeSubTab !== 'headers') {
      ts.activeSubTab = 'query';
    }

    // Query validation
    const queryError = validateQuery(ts.query);
    const canRun = !queryError && !isLoading;

    // Endpoint bar
    const env = state.environments.envs[state.environments.active];
    const endpoint = env ? env.endpoint : '';

    const endpointBar = el('div', { className: 'endpoint-bar' });
    const opType = detectOperationType(ts.query);
    const opClass = opType.toLowerCase() === 'mutation' ? 'op-mutation' : opType.toLowerCase() === 'subscription' ? 'op-subscription' : 'op-query';
    endpointBar.appendChild(el('span', {
      className: 'op-badge ' + opClass,
      textContent: opType,
    }));
    endpointBar.appendChild(el('input', {
      className: 'input', type: 'text', value: endpoint, placeholder: 'Enter GraphQL endpoint URL (e.g. http://localhost:4000/graphql)',
      onInput: e => {
        if (state.environments.envs[state.environments.active]) {
          state.environments.envs[state.environments.active].endpoint = e.target.value;
          saveState();
        }
      },
    }));
    // Cost badge
    const costBadge = el('span', { className: 'cost-badge cost-low', textContent: '...' });
    if (state.queryCost) {
      costBadge.className = 'cost-badge cost-' + state.queryCost.riskLevel;
      costBadge.textContent = state.queryCost.riskLevel.toUpperCase() + ' ' + state.queryCost.totalCost;
      costBadge.title = state.queryCost.explanation.join('\n');
    }
    costBadge.addEventListener('click', () => {
      if (state.queryCost) showCostTooltip(costBadge, state.queryCost);
    });
    endpointBar.appendChild(costBadge);

    // Security badge
    const secBadge = el('span', { className: 'security-badge security-safe', textContent: '...' });
    if (state.securityResult) {
      secBadge.className = 'security-badge security-' + state.securityResult.level;
      secBadge.textContent = state.securityResult.level.toUpperCase() + ' ' + state.securityResult.score;
      secBadge.title = state.securityResult.summary;
    }
    secBadge.addEventListener('click', () => {
      if (state.securityResult) showSecurityTooltip(secBadge, state.securityResult);
    });
    endpointBar.appendChild(secBadge);

    endpointBar.appendChild(el('button', {
      className: 'btn btn-run',
      textContent: isLoading ? 'Running...' : '▶ Run',
      disabled: (!canRun) ? 'disabled' : undefined,
      onClick: () => {
        if (state.queryCost && (state.queryCost.riskLevel === 'high' || state.queryCost.riskLevel === 'critical')) {
          showCostWarning(state.queryCost, () => executeQuery());
        } else {
          executeQuery();
        }
      },
    }));
    endpointBar.appendChild(el('button', {
      className: 'btn btn-secondary', textContent: 'Save',
      onClick: () => saveCurrentRequest(),
    }));
    content.appendChild(endpointBar);

    // Trigger cost + security calculation
    requestCostCalculation(ts.query);
    requestSecurityAnalysis(ts.query);

    // Query error bar
    if (queryError) {
      content.appendChild(el('div', { className: 'query-error-bar', textContent: queryError }));
    }

    // Editor split
    const split = el('div', { className: 'editor-split' });

    // Left panel (query/headers only)
    const leftPanel = el('div', { className: 'editor-panel' });
    const leftSubTabs = el('div', { className: 'sub-tabs' });
    ['query', 'headers'].forEach(tab => {
      leftSubTabs.appendChild(el('button', {
        className: 'sub-tab' + (ts.activeSubTab === tab ? ' active' : ''),
        textContent: tab.charAt(0).toUpperCase() + tab.slice(1),
        onClick: () => { ts.activeSubTab = tab; renderEditor(); },
      }));
    });
    leftPanel.appendChild(leftSubTabs);

    const leftContent = el('div', { className: 'panel-content', style: { display: 'flex', flexDirection: 'column' } });
    if (ts.activeSubTab === 'query') {
      leftContent.appendChild(buildCodeEditor(ts.query, 'graphql', val => {
        ts.query = val;
        syncDirtyState();
        renderTabs();
        requestCostCalculation(val);
        requestSecurityAnalysis(val);
        // Live-update error bar + run button without full re-render
        const existingErr = content.querySelector('.query-error-bar');
        const newErr = validateQuery(val);
        if (newErr && !existingErr) {
          const errBar = el('div', { className: 'query-error-bar', textContent: newErr });
          content.insertBefore(errBar, split);
        } else if (newErr && existingErr) {
          existingErr.textContent = newErr;
        } else if (!newErr && existingErr) {
          existingErr.remove();
        }
        const runBtn = endpointBar.querySelector('.btn-run');
        if (runBtn) runBtn.disabled = !!newErr || isLoading;
        // Two-way sync: re-parse query text to update field checkboxes
        ts.selectedFields = parseQueryFields(val);
        rerenderBottomPanel(ts);
      }));
      // Bottom panel with fields + args
      const bottomPanel = buildQueryBottomPanel(ts);
      if (bottomPanel) leftContent.appendChild(bottomPanel);
    } else {
      leftContent.appendChild(buildHeadersEditor(ts));
    }
    leftPanel.appendChild(leftContent);

    // Right panel (response/history/diff)
    const rightPanel = el('div', { className: 'editor-panel' });
    const rightSubTabs = el('div', { className: 'sub-tabs' });
    ['response', 'history', 'provenance'].forEach(tab => {
      var tabBtn = el('button', {
        className: 'sub-tab' + (ts.responseSubTab === tab ? ' active' : ''),
        onClick: () => {
          ts.responseSubTab = tab;
          if (tab === 'provenance') {
            vscode.postMessage({ type: 'loadProvenance', payload: { requestId: state.activeTabId } });
          }
          renderEditor();
        },
      });

      if (tab === 'response' && ts.responseTime != null) {
        tabBtn.appendChild(el('span', { textContent: 'Response (' }));
        tabBtn.appendChild(el('span', { textContent: ts.responseTime + 'ms', title: 'Response Time' }));
        if (ts.statusCode) {
          tabBtn.appendChild(el('span', { textContent: ' | ' }));
          tabBtn.appendChild(el('span', { textContent: String(ts.statusCode), title: 'Status Code' }));
        }
        if (ts.responseSize) {
          tabBtn.appendChild(el('span', { textContent: ' | ' }));
          tabBtn.appendChild(el('span', { textContent: formatBytes(ts.responseSize), title: 'Response Size' }));
        }
        tabBtn.appendChild(el('span', { textContent: ')' }));
      } else {
        tabBtn.textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
      }

      rightSubTabs.appendChild(tabBtn);
    });
    rightPanel.appendChild(rightSubTabs);

    const rightContent = el('div', { className: 'panel-content' });
    if (ts.responseSubTab === 'response') {
      rightContent.appendChild(buildResponseViewer(ts.response));
    } else if (ts.responseSubTab === 'provenance') {
      rightContent.appendChild(buildProvenanceViewer(state.activeTabId, ts));
    } else {
      rightContent.appendChild(buildHistoryViewer());
    }
    rightPanel.appendChild(rightContent);

    split.appendChild(leftPanel);
    split.appendChild(rightPanel);
    content.appendChild(split);
  }

  // ── Code Editor ──
  function buildCodeEditor(value, language, onChange) {
    const wrap = el('div', { className: 'code-editor-wrap' });
    const container = el('div', { className: 'code-editor-container' });

    const lines = value.split('\n');
    const lineCount = Math.max(lines.length, 20);
    const lineNums = el('div', { className: 'line-numbers' });
    for (let i = 1; i <= lineCount; i++) lineNums.appendChild(el('div', { textContent: String(i) }));

    const inner = el('div', { className: 'code-editor-inner' });
    const highlight = el('div', { className: 'code-highlight' });
    highlight.innerHTML = highlightCode(value, language);

    const textarea = el('textarea', {
      className: 'code-textarea', value: value,
      spellcheck: 'false', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off',
    });

    let lastValueOnFocus = value;
    textarea.addEventListener('focus', () => {
      lastValueOnFocus = textarea.value;
    });
    textarea.addEventListener('blur', () => {
      if (language === 'graphql' && textarea.value !== lastValueOnFocus) {
        trackProvenanceEntry('manual-edit', 'Query edited manually');
      }
    });
    textarea.addEventListener('input', () => {
      const val = textarea.value;
      onChange(val);
      highlight.innerHTML = highlightCode(val, language);
      updateLineNumbers(lineNums, val);
    });

    textarea.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        textarea.dispatchEvent(new Event('input'));
      }
    });

    textarea.addEventListener('scroll', () => {
      highlight.scrollTop = textarea.scrollTop;
      highlight.scrollLeft = textarea.scrollLeft;
      lineNums.scrollTop = textarea.scrollTop;
    });

    inner.appendChild(highlight);
    inner.appendChild(textarea);
    container.appendChild(lineNums);
    container.appendChild(inner);
    wrap.appendChild(container);
    return wrap;
  }

  function updateLineNumbers(lineNums, value) {
    const lines = value.split('\n');
    const lineCount = Math.max(lines.length, 20);
    lineNums.innerHTML = '';
    for (let i = 1; i <= lineCount; i++) lineNums.appendChild(el('div', { textContent: String(i) }));
  }

  // ── Syntax Highlighting ──
  function highlightCode(code, language) {
    if (language === 'graphql') return highlightGraphQL(code);
    if (language === 'json') return highlightJSON(code);
    return escapeHtml(code);
  }

  function highlightGraphQL(code) {
    return code.split('\n').map(line => {
      line = line.replace(/(#.*)$/g, '<span class="syn-comment">$1</span>');
      line = line.replace(/\b(query|mutation|subscription|fragment|on|type|interface|union|enum|scalar|input|extend|implements|directive|schema|true|false|null)\b/g, '<span class="syn-keyword">$1</span>');
      line = line.replace(/\b(ID|String|Int|Float|Boolean)\b/g, '<span class="syn-type">$1</span>');
      line = line.replace(/(\$\w+)/g, '<span class="syn-variable">$1</span>');
      line = line.replace(/(@\w+)/g, '<span class="syn-directive">$1</span>');
      line = line.replace(/("(?:[^"\\]|\\.)*")(?![^<]*>)/g, '<span class="syn-string">$1</span>');
      line = line.replace(/\b(\d+(?:\.\d+)?)(?![^<]*>)\b/g, '<span class="syn-number">$1</span>');
      return line;
    }).join('\n');
  }

  function highlightJSON(code) {
    return code.split('\n').map(line => {
      line = line.replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, '<span class="json-key">$1</span>$2');
      line = line.replace(/(:\s*)("(?:[^"\\]|\\.)*")(?![^<]*>)/g, '$1<span class="json-string">$2</span>');
      line = line.replace(/(:\s*)(\d+(?:\.\d+)?)(?![^<]*>)/g, '$1<span class="json-number">$2</span>');
      line = line.replace(/(:\s*)(true|false|null)\b(?![^<]*>)/g, '$1<span class="json-boolean">$2</span>');
      return line;
    }).join('\n');
  }

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Headers Editor ──
  function buildHeaderRowEl(entries, idx, rowsContainer, onChange) {
    const entry = entries[idx];
    const row = el('div', { className: 'header-row' + (entry.enabled ? '' : ' disabled') });

    const cb = el('input', { type: 'checkbox' });
    cb.checked = entry.enabled;
    cb.addEventListener('change', () => {
      entry.enabled = cb.checked;
      row.className = 'header-row' + (entry.enabled ? '' : ' disabled');
      if (onChange) onChange();
    });
    row.appendChild(cb);

    const keyInput = el('input', {
      className: 'header-key-input', type: 'text', value: entry.key,
      placeholder: 'Header name',
    });
    keyInput.addEventListener('input', () => {
      entry.key = keyInput.value;
      if (onChange) onChange();
    });
    row.appendChild(keyInput);

    const valInput = el('input', {
      className: 'header-value-input', type: 'text', value: entry.value,
      placeholder: 'Value',
    });
    valInput.addEventListener('input', () => {
      entry.value = valInput.value;
      if (onChange) onChange();
    });
    row.appendChild(valInput);

    const delBtn = el('button', {
      className: 'header-delete-btn', textContent: '\u00D7',
      onClick: () => {
        entries.splice(idx, 1);
        if (onChange) onChange();
        rebuildRows(entries, rowsContainer, onChange);
      },
    });
    row.appendChild(delBtn);
    return row;
  }

  function rebuildRows(entries, rowsContainer, onChange) {
    rowsContainer.innerHTML = '';
    entries.forEach((_, idx) => {
      rowsContainer.appendChild(buildHeaderRowEl(entries, idx, rowsContainer, onChange));
    });
  }

  function buildHeadersEditor(ts) {
    const wrap = el('div', { className: 'headers-editor' });
    const rowsContainer = el('div', { className: 'headers-rows' });

    const onChange = () => { syncDirtyState(); renderTabs(); };
    rebuildRows(ts.headerEntries, rowsContainer, onChange);
    wrap.appendChild(rowsContainer);

    const actions = el('div', { className: 'headers-actions' });
    actions.appendChild(el('button', {
      className: 'btn btn-secondary', textContent: '+ New header',
      onClick: () => {
        ts.headerEntries.push({ key: '', value: '', enabled: true });
        const newRow = buildHeaderRowEl(ts.headerEntries, ts.headerEntries.length - 1, rowsContainer, onChange);
        rowsContainer.appendChild(newRow);
        const ki = newRow.querySelector('.header-key-input');
        if (ki) ki.focus();
      },
    }));
    actions.appendChild(el('button', {
      className: 'btn-link', textContent: 'Set shared headers',
      onClick: () => showSharedHeadersModal(),
    }));
    wrap.appendChild(actions);
    return wrap;
  }

  // ── Shared Headers Modal ──
  function showSharedHeadersModal() {
    const entries = (state.sharedHeaders || []).map(e => ({ ...e }));
    if (entries.length === 0 || (entries[entries.length - 1].key || entries[entries.length - 1].value)) {
      entries.push({ key: '', value: '', enabled: true });
    }

    const overlay = el('div', { className: 'modal-overlay' });
    const modal = el('div', { className: 'modal', style: { maxWidth: '560px' } });
    modal.appendChild(el('div', { className: 'modal-title', textContent: 'Shared Headers' }));
    modal.appendChild(el('div', { className: 'modal-desc', textContent: 'These headers are automatically included in every request.' }));

    const rowsContainer = el('div', { className: 'headers-rows', style: { maxHeight: '300px', overflow: 'auto' } });
    rebuildRows(entries, rowsContainer, null);
    modal.appendChild(rowsContainer);

    modal.appendChild(el('button', {
      className: 'btn btn-secondary', textContent: '+ New header',
      style: { marginTop: '8px' },
      onClick: () => {
        entries.push({ key: '', value: '', enabled: true });
        const newRow = buildHeaderRowEl(entries, entries.length - 1, rowsContainer, null);
        rowsContainer.appendChild(newRow);
        const ki = newRow.querySelector('.header-key-input');
        if (ki) ki.focus();
      },
    }));

    const actions = el('div', { className: 'modal-actions' });
    actions.appendChild(el('button', {
      className: 'btn btn-secondary', textContent: 'Cancel',
      onClick: () => overlay.remove(),
    }));
    actions.appendChild(el('button', {
      className: 'btn btn-primary', textContent: 'Save',
      onClick: () => {
        const toSave = entries.filter(e => e.key.trim() || e.value.trim());
        state.sharedHeaders = toSave;
        saveState();
        vscode.postMessage({ type: 'saveSharedHeaders', payload: toSave });
        overlay.remove();
      },
    }));
    modal.appendChild(actions);
    overlay.appendChild(modal);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // ── Response Viewer ──
  function buildResponseViewer(response) {
    if (isLoading) {
      return el('div', { className: 'loading-state' }, [
        el('div', { className: 'spinner' }),
        el('div', { textContent: 'Executing query...' }),
      ]);
    }
    if (!response) {
      return el('div', { className: 'empty-state' }, [
        el('div', { textContent: '{ }', style: { fontSize: '32px', marginBottom: '4px' } }),
        el('div', { textContent: 'Run a query to see results' }),
      ]);
    }

    const wrapper = el('div', { style: { overflow: 'auto', height: '100%' } });
    if (response.errors) {
      const errBox = el('div', { className: 'response-errors' });
      errBox.appendChild(el('div', { className: 'error-title', textContent: 'Errors' }));
      response.errors.forEach(err => {
        errBox.appendChild(el('div', { className: 'error-msg', textContent: err.message || String(err) }));
        if (err.path) errBox.appendChild(el('div', { className: 'error-path', textContent: 'at ' + err.path.join('.') }));
      });
      wrapper.appendChild(errBox);
    }
    const content = el('div', { className: 'response-content' });
    content.innerHTML = formatJSON(response, 0);
    wrapper.appendChild(content);
    return wrapper;
  }

  function formatJSON(obj, indent) {
    const spaces = '  '.repeat(indent);
    const nextSpaces = '  '.repeat(indent + 1);
    if (obj === null) return '<span class="json-null">null</span>';
    if (obj === undefined) return '<span class="json-null">undefined</span>';
    if (typeof obj === 'boolean') return '<span class="json-boolean">' + obj + '</span>';
    if (typeof obj === 'number') return '<span class="json-number">' + obj + '</span>';
    if (typeof obj === 'string') return '<span class="json-string">"' + escapeHtml(obj) + '"</span>';
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      let r = '[\n';
      obj.forEach((item, i) => {
        r += nextSpaces + formatJSON(item, indent + 1);
        if (i < obj.length - 1) r += ',';
        r += '\n';
      });
      return r + spaces + ']';
    }
    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) return '{}';
      let r = '{\n';
      keys.forEach((key, i) => {
        r += nextSpaces + '<span class="json-key">"' + escapeHtml(key) + '"</span>: ' + formatJSON(obj[key], indent + 1);
        if (i < keys.length - 1) r += ',';
        r += '\n';
      });
      return r + spaces + '}';
    }
    return escapeHtml(String(obj));
  }

  // ── History Viewer ──
  function buildHistoryViewer() {
    if (!state.history || state.history.length === 0) {
      return el('div', { className: 'empty-state' }, [
        el('div', { textContent: 'No history yet' }),
        el('div', { textContent: 'Execute a query to see it here', style: { fontSize: '11px' } }),
      ]);
    }
    const list = el('div', { className: 'history-list' });
    state.history.forEach(entry => {
      const item = el('div', { className: 'history-item', onClick: () => loadHistoryEntry(entry) });
      const nameRow = el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } });
      nameRow.appendChild(el('span', { className: 'history-name', textContent: entry.requestName }));
      nameRow.appendChild(el('span', {
        className: 'history-status ' + (entry.success ? 'success' : 'error'),
        textContent: entry.success ? 'OK' : 'ERR',
      }));
      item.appendChild(nameRow);
      const meta = el('div', { className: 'history-meta' });
      meta.appendChild(el('span', { textContent: entry.responseTime + 'ms' }));
      meta.appendChild(el('span', { textContent: entry.environment }));
      meta.appendChild(el('span', { textContent: formatTimestamp(entry.timestamp) }));
      item.appendChild(meta);
      list.appendChild(item);
    });
    return list;
  }

  function loadHistoryEntry(entry) {
    if (!state.activeTabId) return;
    const ts = tabStates[state.activeTabId];
    if (!ts) return;
    ts.query = entry.query;
    ts.variables = JSON.stringify(entry.variables || {}, null, 2);
    ts.response = entry.response;
    ts.responseTime = entry.responseTime;
    renderEditor();
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  }

  function formatTimestamp(isoString) {
    try { return new Date(isoString).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
    catch { return isoString; }
  }

  // ── Query Execution ──
  function executeQuery() {
    if (!state.activeTabId) return;
    const ts = tabStates[state.activeTabId];
    if (!ts) return;

    const env = state.environments.envs[state.environments.active];
    const endpoint = env ? env.endpoint : '';

    if (!endpoint) {
      // Focus the endpoint input instead of showing an error
      const endpointInput = document.querySelector('.endpoint-bar .input');
      if (endpointInput) {
        endpointInput.focus();
        endpointInput.placeholder = 'Please enter a GraphQL endpoint URL first';
      }
      return;
    }

    let envHeaders = {};
    if (env && env.headers) envHeaders = { ...env.headers };
    const sharedHeaders = entriesToHeaders(state.sharedHeaders || []);
    const customHeaders = entriesToHeaders(ts.headerEntries);

    isLoading = true;
    renderEditor();

    vscode.postMessage({
      type: 'executeQuery',
      payload: {
        query: ts.query,
        variables: ts.variables,
        headers: { ...envHeaders, ...sharedHeaders, ...customHeaders },
        endpoint: endpoint,
        requestId: state.activeTabId,
      },
    });
  }

  function handleQueryResult(payload) {
    if (!state.activeTabId) return;
    const ts = tabStates[state.activeTabId];
    if (!ts) return;

    ts.response = payload.data;
    ts.responseTime = payload.responseTime;
    ts.statusCode = payload.statusCode || null;
    ts.responseSize = payload.responseSize || null;
    ts.responseSubTab = 'response';

    const hasErrors = payload.data && typeof payload.data === 'object' && payload.data.errors;
    const entry = {
      id: Date.now(),
      requestId: state.activeTabId,
      requestName: ts.request ? ts.request.name : 'Unknown',
      query: ts.query,
      variables: safeParseJSON(ts.variables),
      response: payload.data,
      responseTime: payload.responseTime,
      timestamp: new Date().toISOString(),
      environment: state.environments.active,
      success: !hasErrors,
    };
    state.history = [entry, ...state.history].slice(0, 50);
    saveState();
    vscode.postMessage({ type: 'saveHistory', payload: state.history });
    renderEditor();
  }

  function handleQueryError(payload) {
    if (!state.activeTabId) return;
    const ts = tabStates[state.activeTabId];
    if (!ts) return;

    ts.response = { errors: [{ message: payload.error }] };
    ts.responseTime = payload.responseTime;
    ts.responseSubTab = 'response';

    const entry = {
      id: Date.now(),
      requestId: state.activeTabId,
      requestName: ts.request ? ts.request.name : 'Unknown',
      query: ts.query,
      variables: safeParseJSON(ts.variables),
      response: { errors: [{ message: payload.error }] },
      responseTime: payload.responseTime,
      timestamp: new Date().toISOString(),
      environment: state.environments.active,
      success: false,
    };
    state.history = [entry, ...state.history].slice(0, 50);
    saveState();
    vscode.postMessage({ type: 'saveHistory', payload: state.history });
    renderEditor();
  }

  function safeParseJSON(str) {
    try { return JSON.parse(str || '{}'); } catch { return {}; }
  }

  // ── Header Entry Utilities ──
  function headersToEntries(headers) {
    const entries = [];
    for (const [key, value] of Object.entries(headers || {})) {
      entries.push({ key, value, enabled: true });
    }
    return entries;
  }

  function entriesToHeaders(entries) {
    const result = {};
    for (const e of entries) {
      if (e.enabled && e.key.trim()) result[e.key.trim()] = e.value;
    }
    return result;
  }

  function headerEntriesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].key !== b[i].key || a[i].value !== b[i].value || a[i].enabled !== b[i].enabled) return false;
    }
    return true;
  }

  // ── Save Request ──
  function saveCurrentRequest() {
    if (!state.activeTabId) return;
    const ts = tabStates[state.activeTabId];
    if (!ts) return;

    vscode.postMessage({
      type: 'saveRequest',
      payload: {
        requestId: state.activeTabId,
        updates: { query: ts.query, variables: ts.variables, headers: entriesToHeaders(ts.headerEntries) },
      },
    });
  }

  function showSaveToast() {
    const existing = document.querySelector('.save-toast');
    if (existing) existing.remove();
    const toast = el('div', { className: 'save-toast', textContent: 'Request saved' });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  function showSaveToCollectionDialog(collections) {
    if (!state.activeTabId) return;
    const ts = tabStates[state.activeTabId];
    if (!ts) return;

    const overlay = el('div', { className: 'modal-overlay' });
    const modal = el('div', { className: 'modal' });
    modal.appendChild(el('div', { className: 'modal-title', textContent: 'Save to Collection' }));
    modal.appendChild(el('div', { className: 'modal-desc', textContent: 'This request is not yet saved. Choose a collection and folder.' }));

    // Request name
    const nameField = el('div', { className: 'modal-field' });
    nameField.appendChild(el('label', { textContent: 'Request Name' }));
    const nameInput = el('input', {
      className: 'input', type: 'text',
      value: ts.request ? ts.request.name : 'Untitled Request',
    });
    nameField.appendChild(nameInput);
    modal.appendChild(nameField);

    // Collection dropdown
    const colField = el('div', { className: 'modal-field' });
    colField.appendChild(el('label', { textContent: 'Collection' }));
    const colSelect = el('select', { className: 'select' });
    collections.forEach(col => {
      colSelect.appendChild(el('option', { value: col.id, textContent: col.name }));
    });
    colSelect.appendChild(el('option', { value: '__new__', textContent: '+ New Collection' }));
    colField.appendChild(colSelect);
    modal.appendChild(colField);

    // New collection name (hidden by default)
    const newColField = el('div', { className: 'modal-field hidden' });
    newColField.appendChild(el('label', { textContent: 'Collection Name' }));
    const newColInput = el('input', { className: 'input', type: 'text', placeholder: 'e.g. My API' });
    newColField.appendChild(newColInput);
    modal.appendChild(newColField);

    // Folder dropdown
    const folderField = el('div', { className: 'modal-field' });
    folderField.appendChild(el('label', { textContent: 'Folder' }));
    const folderSelect = el('select', { className: 'select' });
    modal.appendChild(folderField);

    // New folder name (hidden by default)
    const newFolderField = el('div', { className: 'modal-field hidden' });
    newFolderField.appendChild(el('label', { textContent: 'Folder Name' }));
    const newFolderInput = el('input', { className: 'input', type: 'text', placeholder: 'e.g. Queries' });
    newFolderField.appendChild(newFolderInput);
    modal.appendChild(newFolderField);

    function updateFolderOptions() {
      folderSelect.innerHTML = '';
      const selectedColId = colSelect.value;
      if (selectedColId === '__new__') {
        newColField.classList.remove('hidden');
        // New collection needs a new folder
        folderSelect.appendChild(el('option', { value: '__new__', textContent: '+ New Folder' }));
        newFolderField.classList.remove('hidden');
      } else {
        newColField.classList.add('hidden');
        const col = collections.find(c => c.id === selectedColId);
        if (col) {
          col.folders.forEach(f => {
            folderSelect.appendChild(el('option', { value: f.id, textContent: f.name }));
          });
        }
        folderSelect.appendChild(el('option', { value: '__new__', textContent: '+ New Folder' }));
        newFolderField.classList.add('hidden');
      }
      folderField.appendChild(folderSelect);
    }

    colSelect.addEventListener('change', updateFolderOptions);
    folderSelect.addEventListener('change', () => {
      if (folderSelect.value === '__new__') {
        newFolderField.classList.remove('hidden');
      } else {
        newFolderField.classList.add('hidden');
      }
    });

    updateFolderOptions();

    // Actions
    const actions = el('div', { className: 'modal-actions' });
    actions.appendChild(el('button', { className: 'btn btn-secondary', textContent: 'Cancel', onClick: () => overlay.remove() }));
    actions.appendChild(el('button', {
      className: 'btn btn-primary', textContent: 'Save',
      onClick: () => {
        const reqName = nameInput.value.trim();
        if (!reqName) return;

        const isNewCol = colSelect.value === '__new__';
        const isNewFolder = folderSelect.value === '__new__';

        if (isNewCol && !newColInput.value.trim()) return;
        if (isNewFolder && !newFolderInput.value.trim()) return;

        vscode.postMessage({
          type: 'saveNewRequest',
          payload: {
            collectionId: isNewCol ? '' : colSelect.value,
            folderId: isNewFolder ? '' : folderSelect.value,
            newCollectionName: isNewCol ? newColInput.value.trim() : '',
            newFolderName: isNewFolder ? newFolderInput.value.trim() : '',
            request: {
              id: state.activeTabId,
              name: reqName,
              type: ts.request ? ts.request.type : 'query',
              query: ts.query,
              variables: ts.variables,
              headers: entriesToHeaders(ts.headerEntries),
            },
          },
        });

        overlay.remove();
      },
    }));
    modal.appendChild(actions);
    overlay.appendChild(modal);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    setTimeout(() => nameInput.focus(), 50);
  }

  // ── Status Bar ──
  function renderStatusBar() {
    const bar = $('#status-bar');
    if (!bar) return;
    bar.innerHTML = '';

    const left = el('div', { className: 'status-left' });
    const right = el('div', { className: 'status-right' });

    const envKey = state.environments.active || 'dev';
    const envItem = el('div', { className: 'status-item', onClick: () => showEnvironmentSelector() });
    envItem.appendChild(el('span', { className: 'env-dot ' + envKey }));
    const envConfig = state.environments.envs[envKey];
    envItem.appendChild(el('span', { textContent: envConfig ? envConfig.name : envKey }));
    left.appendChild(envItem);

    bar.appendChild(left);
    bar.appendChild(right);
  }

  // ── Environment Selector ──
  function showEnvironmentSelector() {
    closeContextMenu();
    const envKeys = Object.keys(state.environments.envs);
    if (envKeys.length === 0) return;
    const menu = el('div', { className: 'context-menu' });
    menu.style.left = '10px';
    menu.style.bottom = '26px';
    menu.style.top = 'auto';
    envKeys.forEach(key => {
      menu.appendChild(el('div', {
        className: 'context-menu-item',
        textContent: (key === state.environments.active ? '✓ ' : '  ') + (state.environments.envs[key].name || key),
        onClick: () => {
          state.environments.active = key;
          saveState();
          vscode.postMessage({ type: 'saveEnvironments', payload: state.environments });
          closeContextMenu();
          renderStatusBar();
          renderEditor();
        },
      }));
    });
    document.body.appendChild(menu);
    contextMenu = menu;
    setTimeout(() => document.addEventListener('click', closeContextMenu, { once: true }));
  }

  function closeContextMenu() {
    if (contextMenu) { contextMenu.remove(); contextMenu = null; }
  }

  // ── Operation Type Detection ──
  function detectOperationType(queryText) {
    const match = queryText.match(/^\s*(query|mutation|subscription)/m);
    if (match) {
      return match[1].charAt(0).toUpperCase() + match[1].slice(1);
    }
    return 'Query';
  }

  // ── Query Validation ──
  function validateQuery(queryText) {
    const trimmed = queryText.trim();
    if (!trimmed) return 'Query is empty';
    if (!/^\s*(query|mutation|subscription|\{)/m.test(trimmed)) return 'Missing query/mutation/subscription keyword';
    const opens = (trimmed.match(/\{/g) || []).length;
    const closes = (trimmed.match(/\}/g) || []).length;
    if (opens !== closes) return 'Unbalanced braces: ' + opens + ' opening, ' + closes + ' closing';
    // Detect empty selection sets: { } with only whitespace inside
    if (/\{\s*\}/.test(trimmed)) return 'Empty selection set — select at least one sub-field';
    return null;
  }

  // ── Argument Validation ──
  function validateArgValue(value, typeName, required) {
    if (!value && required) return '*Required';
    if (!value) return null;
    // Strip NON_NULL marker and list wrappers for checking
    const base = typeName.replace(/[!\[\]]/g, '').trim();
    if (base === 'Int') {
      if (!/^-?\d+$/.test(value)) return 'Must be integer';
    } else if (base === 'Float') {
      if (!/^-?\d+(\.\d+)?$/.test(value)) return 'Must be number';
    } else if (base === 'Boolean') {
      if (value !== 'true' && value !== 'false') return 'Must be true/false';
    }
    return null;
  }

  // ── Query Bottom Panel (Fields + Args) ──
  function buildQueryBottomPanel(ts) {
    // Migrate old array-based selectedFields to object tree
    if (Array.isArray(ts.selectedFields)) {
      const obj = {};
      for (const name of ts.selectedFields) obj[name] = true;
      ts.selectedFields = obj;
    }
    if (!ts.expandedObjectFields) ts.expandedObjectFields = {};

    const hasFields = ts.availableFields && ts.availableFields.length > 0;
    const hasArgs = ts.operationArgs && ts.operationArgs.length > 0;
    if (!hasFields && !hasArgs) return null;

    const panel = el('div', { className: 'query-bottom-panel' });

    // Collapsible header
    const header = el('div', {
      className: 'query-bottom-panel-header',
      onClick: () => { ts.bottomPanelExpanded = !ts.bottomPanelExpanded; renderEditor(); },
    });
    header.appendChild(el('span', { className: 'tree-icon', textContent: ts.bottomPanelExpanded ? '\u25BE' : '\u25B8' }));
    header.appendChild(el('span', { textContent: 'Fields & Arguments' }));
    panel.appendChild(header);

    if (!ts.bottomPanelExpanded) return panel;

    const body = el('div', { className: 'query-bottom-panel-body' });

    // Fields section (recursive)
    if (hasFields) {
      body.appendChild(el('div', {
        className: 'fields-header',
        textContent: 'Return Fields' + (ts.returnTypeName ? ' (' + ts.returnTypeName + ')' : ''),
      }));

      renderFieldList(ts.availableFields, ts.selectedFields, '', 0, body, ts);
    }

    // Arguments section
    if (hasArgs) {
      body.appendChild(el('div', {
        className: 'fields-header',
        style: { marginTop: hasFields ? '8px' : '0' },
        textContent: 'Arguments',
      }));

      ts.operationArgs.forEach(arg => {
        const row = el('div', { className: 'arg-row' });
        row.appendChild(el('span', { className: 'arg-label', textContent: arg.name }));

        const currentVal = ts.argValues[arg.name] || '';
        const input = el('input', {
          className: 'arg-input', type: 'text', value: currentVal,
          placeholder: arg.required ? 'required' : 'optional',
        });

        const errorSpan = el('span', { className: 'arg-error' });
        const validationErr = validateArgValue(currentVal, arg.type, arg.required);
        if (validationErr) {
          input.className += ' error';
          errorSpan.textContent = validationErr;
        }

        input.addEventListener('input', () => {
          ts.argValues[arg.name] = input.value;
          syncVariablesFromArgs(ts);
          syncDirtyState();
          renderTabs();
          const err = validateArgValue(input.value, arg.type, arg.required);
          if (err) {
            input.classList.add('error');
            errorSpan.textContent = err;
          } else {
            input.classList.remove('error');
            errorSpan.textContent = '';
          }
        });

        input.addEventListener('blur', () => {
          const err = validateArgValue(input.value, arg.type, arg.required);
          if (err) {
            input.classList.add('error');
            errorSpan.textContent = err;
          } else {
            input.classList.remove('error');
            errorSpan.textContent = '';
          }
        });

        row.appendChild(input);
        row.appendChild(el('span', { className: 'arg-type', textContent: arg.type }));
        row.appendChild(errorSpan);
        body.appendChild(row);
      });
    }

    panel.appendChild(body);
    return panel;
  }

  /** Re-render only the bottom panel body, preserving scroll position */
  function rerenderBottomPanel(ts) {
    var oldBody = document.querySelector('.query-bottom-panel-body');
    if (!oldBody) return;

    var newBody = el('div', { className: 'query-bottom-panel-body' });
    var hasFields = ts.availableFields && ts.availableFields.length > 0;
    var hasArgs = ts.operationArgs && ts.operationArgs.length > 0;

    if (hasFields) {
      newBody.appendChild(el('div', {
        className: 'fields-header',
        textContent: 'Return Fields' + (ts.returnTypeName ? ' (' + ts.returnTypeName + ')' : ''),
      }));
      renderFieldList(ts.availableFields, ts.selectedFields, '', 0, newBody, ts);
    }

    if (hasArgs) {
      newBody.appendChild(el('div', {
        className: 'fields-header',
        style: { marginTop: hasFields ? '8px' : '0' },
        textContent: 'Arguments',
      }));

      ts.operationArgs.forEach(function(arg) {
        var row = el('div', { className: 'arg-row' });
        row.appendChild(el('span', { className: 'arg-label', textContent: arg.name }));

        var currentVal = ts.argValues[arg.name] || '';
        var input = el('input', {
          className: 'arg-input', type: 'text', value: currentVal,
          placeholder: arg.required ? 'required' : 'optional',
        });

        var errorSpan = el('span', { className: 'arg-error' });
        var validationErr = validateArgValue(currentVal, arg.type, arg.required);
        if (validationErr) {
          input.className += ' error';
          errorSpan.textContent = validationErr;
        }

        input.addEventListener('input', function() {
          ts.argValues[arg.name] = input.value;
          syncVariablesFromArgs(ts);
          syncDirtyState();
          renderTabs();
          var err = validateArgValue(input.value, arg.type, arg.required);
          if (err) { input.classList.add('error'); errorSpan.textContent = err; }
          else { input.classList.remove('error'); errorSpan.textContent = ''; }
        });

        row.appendChild(input);
        row.appendChild(el('span', { className: 'arg-type', textContent: arg.type }));
        row.appendChild(errorSpan);
        newBody.appendChild(row);
      });
    }

    // Also update the code editor textarea in-place
    var textarea = document.querySelector('.code-textarea');
    if (textarea && textarea.value !== ts.query) {
      textarea.value = ts.query;
      var highlight = document.querySelector('.code-highlight');
      if (highlight) highlight.innerHTML = highlightCode(ts.query, 'graphql');
      var lineNums = document.querySelector('.line-numbers');
      if (lineNums) updateLineNumbers(lineNums, ts.query);
    }

    oldBody.replaceWith(newBody);
  }

  /** Recursive field list renderer for hierarchical field tree */
  function renderFieldList(availableFields, selectionNode, parentPath, depth, container, ts) {
    availableFields.forEach(field => {
      const fullPath = parentPath ? parentPath + '.' + field.name : field.name;
      const hasSubFields = field.hasSubFields && field.subFields && field.subFields.length > 0;
      const isSelected = selectionNode.hasOwnProperty(field.name);
      const isExpanded = !!ts.expandedObjectFields[fullPath];

      const row = el('div', { className: 'field-row' + (isSelected ? ' selected' : '') });

      // Indentation
      if (depth > 0) {
        row.appendChild(el('span', { className: 'field-indent', style: { width: (depth * 16) + 'px' } }));
      }

      // Expand/collapse arrow for object fields
      if (hasSubFields) {
        const expandBtn = el('button', {
          className: 'field-expand-btn',
          textContent: isExpanded ? '\u25BE' : '\u25B8',
          onClick: (e) => {
            e.stopPropagation();
            ts.expandedObjectFields[fullPath] = !ts.expandedObjectFields[fullPath];
            rerenderBottomPanel(ts);
          },
        });
        row.appendChild(expandBtn);
      } else {
        row.appendChild(el('span', { className: 'field-expand-spacer' }));
      }

      // Checkbox toggle
      const toggle = el('button', {
        className: 'field-toggle',
        textContent: isSelected ? '\u2713' : '+',
        onClick: () => {
          if (isSelected) {
            delete selectionNode[field.name];
            trackProvenanceEntry('field-removed', 'Removed field: ' + field.name, { fieldName: field.name });
          } else {
            if (hasSubFields) {
              selectionNode[field.name] = {};
              ts.expandedObjectFields[fullPath] = true;
            } else {
              selectionNode[field.name] = true;
            }
            trackProvenanceEntry('field-added', 'Added field: ' + field.name, { fieldName: field.name });
          }
          regenerateQuery(ts);
          rerenderBottomPanel(ts);
        },
      });
      row.appendChild(toggle);
      row.appendChild(el('span', { className: 'field-name', textContent: field.name }));
      row.appendChild(el('span', { className: 'field-type', textContent: field.type }));
      container.appendChild(row);

      // Render sub-fields if expanded and selected
      if (hasSubFields && isExpanded) {
        const subSelection = (typeof selectionNode[field.name] === 'object' && selectionNode[field.name] !== null)
          ? selectionNode[field.name]
          : {};
        // If we toggled expand but haven't selected, use a temporary empty selection for display
        if (!isSelected) {
          // Show sub-fields as unselected
          renderFieldList(field.subFields, {}, fullPath, depth + 1, container, ts);
        } else {
          renderFieldList(field.subFields, subSelection, fullPath, depth + 1, container, ts);
        }
      }
    });
  }

  // ── Sync variables JSON from arg inputs ──
  function syncVariablesFromArgs(ts) {
    if (!ts.operationArgs || ts.operationArgs.length === 0) return;
    const vars = {};
    for (const arg of ts.operationArgs) {
      const raw = ts.argValues[arg.name] || '';
      const base = arg.type.replace(/[!\[\]]/g, '').trim();
      if (raw === '') {
        vars[arg.name] = null;
      } else if (base === 'Int') {
        const n = parseInt(raw, 10);
        vars[arg.name] = isNaN(n) ? raw : n;
      } else if (base === 'Float') {
        const n = parseFloat(raw);
        vars[arg.name] = isNaN(n) ? raw : n;
      } else if (base === 'Boolean') {
        vars[arg.name] = raw === 'true';
      } else {
        vars[arg.name] = raw;
      }
    }
    ts.variables = JSON.stringify(vars, null, 2);
  }

  function regenerateQuery(ts) {
    // Extract operation signature: everything up to the inner selection set
    const match = ts.query.match(/^([\s\S]*?\{[\s\S]*?\{)\s*[\s\S]*?\}\s*\}$/);
    if (!match) return;

    const prefix = match[1];
    const selectionTree = ts.selectedFields;
    const hasAny = typeof selectionTree === 'object' && Object.keys(selectionTree).length > 0;
    const fieldText = hasAny ? buildFieldLines(selectionTree, 4) : '    __typename';
    ts.query = prefix + '\n' + fieldText + '\n  }\n}';
  }

  /** Recursively build field lines from the hierarchical selection tree */
  function buildFieldLines(selectionTree, indent) {
    const spaces = ' '.repeat(indent);
    const lines = [];
    for (const key of Object.keys(selectionTree)) {
      const val = selectionTree[key];
      if (val === true) {
        lines.push(spaces + key);
      } else if (typeof val === 'object' && val !== null) {
        const nested = buildFieldLines(val, indent + 2);
        // Always emit the block — empty {} triggers validation error
        lines.push(spaces + key + ' {');
        if (nested.trim()) {
          lines.push(nested);
        }
        lines.push(spaces + '}');
      }
    }
    return lines.join('\n');
  }

  // ── Cost Badge ──
  let costDebounce = null;
  function requestCostCalculation(query) {
    clearTimeout(costDebounce);
    costDebounce = setTimeout(() => {
      vscode.postMessage({ type: 'calculateQueryCost', payload: { query } });
    }, 500);
  }

  function renderCostBadge() {
    const badge = document.querySelector('.cost-badge');
    if (!badge || !state.queryCost) return;
    const cost = state.queryCost;
    badge.className = 'cost-badge cost-' + cost.riskLevel;
    badge.textContent = cost.riskLevel.toUpperCase() + ' ' + cost.totalCost;
    badge.title = cost.explanation.join('\n');
  }

  function showCostTooltip(badge, cost) {
    // Remove existing
    const existing = document.querySelector('.cost-tooltip');
    if (existing) { existing.remove(); return; }

    const tooltip = el('div', { className: 'cost-tooltip' });
    cost.explanation.forEach(function(line) {
      tooltip.appendChild(el('div', { className: 'cost-tooltip-item', textContent: line }));
    });
    badge.style.position = 'relative';
    badge.appendChild(tooltip);
    setTimeout(function() { document.addEventListener('click', function() { tooltip.remove(); }, { once: true }); });
  }

  function showCostWarning(cost, onProceed) {
    const overlay = el('div', { className: 'modal-overlay' });
    const modal = el('div', { className: 'modal' });
    modal.appendChild(el('div', { className: 'modal-title', textContent: 'High Cost Query Warning' }));
    modal.appendChild(el('div', { className: 'cost-warning', textContent: cost.riskLevel.toUpperCase() + ' risk — Cost: ' + cost.totalCost }));
    modal.appendChild(el('div', { className: 'modal-desc', textContent: cost.explanation.join('. ') }));

    const actions = el('div', { className: 'modal-actions' });
    actions.appendChild(el('button', { className: 'btn btn-secondary', textContent: 'Cancel', onClick: function() { overlay.remove(); } }));
    actions.appendChild(el('button', { className: 'btn btn-primary', textContent: 'Run Anyway', onClick: function() { overlay.remove(); onProceed(); } }));
    modal.appendChild(actions);
    overlay.appendChild(modal);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // ── Security Badge ──
  let securityDebounce = null;
  function requestSecurityAnalysis(query) {
    clearTimeout(securityDebounce);
    securityDebounce = setTimeout(() => {
      vscode.postMessage({ type: 'analyzeQuerySecurity', payload: { query } });
    }, 500);
  }

  function renderSecurityBadge() {
    const badge = document.querySelector('.security-badge');
    if (!badge || !state.securityResult) return;
    const sec = state.securityResult;
    badge.className = 'security-badge security-' + sec.level;
    badge.textContent = sec.level.toUpperCase() + ' ' + sec.score;
    badge.title = sec.summary;
  }

  function showSecurityTooltip(badge, sec) {
    var existing = document.querySelector('.security-tooltip');
    if (existing) { existing.remove(); return; }

    var tooltip = el('div', { className: 'security-tooltip' });
    tooltip.appendChild(el('div', { style: { fontWeight: '600', marginBottom: '4px' }, textContent: 'Security Score: ' + sec.score + '/100' }));
    if (sec.issues.length === 0) {
      tooltip.appendChild(el('div', { textContent: 'No issues detected' }));
    } else {
      sec.issues.forEach(function(issue) {
        var row = el('div', { className: 'security-issue-row' });
        var sevClass = issue.severity === 'critical' ? 'security-sev-critical' : issue.severity === 'warning' ? 'security-sev-warning' : 'security-sev-info';
        row.appendChild(el('span', { className: 'security-sev ' + sevClass, textContent: issue.severity.toUpperCase() }));
        row.appendChild(el('span', { textContent: issue.message }));
        tooltip.appendChild(row);
      });
    }
    badge.style.position = 'relative';
    badge.appendChild(tooltip);
    setTimeout(function() { document.addEventListener('click', function() { tooltip.remove(); }, { once: true }); });
  }

  // ── Performance Alert ──
  function showPerformanceAlert(anomaly) {
    // Remove existing alert if any
    var existing = document.querySelector('.performance-alert');
    if (existing) existing.remove();

    var alertClass = anomaly.ratio > 3 ? 'performance-alert critical' : 'performance-alert warning';
    var alert = el('div', { className: alertClass });
    var content = el('div', { style: { flex: '1' } });
    content.appendChild(el('strong', { textContent: 'Performance Anomaly Detected' }));
    content.appendChild(el('div', { textContent: anomaly.message, style: { fontSize: '11px', marginTop: '2px' } }));
    if (anomaly.schemaCorrelation && anomaly.schemaCorrelationMessage) {
      content.appendChild(el('div', { textContent: anomaly.schemaCorrelationMessage, style: { fontSize: '11px', opacity: '0.8', marginTop: '2px' } }));
    }
    alert.appendChild(content);
    alert.appendChild(el('button', {
      className: 'btn-icon', textContent: '\u00D7', title: 'Dismiss',
      onClick: function() { alert.remove(); },
    }));

    // Insert at top of response panel
    var rightPanel = document.querySelectorAll('.editor-panel')[1];
    if (rightPanel) {
      var panelContent = rightPanel.querySelector('.panel-content');
      if (panelContent) panelContent.insertBefore(alert, panelContent.firstChild);
    }
  }

  // ── Provenance Viewer ──
  function buildProvenanceViewer(requestId, ts) {
    if (!ts.provenance || !ts.provenance.entries || ts.provenance.entries.length === 0) {
      return el('div', { className: 'empty-state' }, [
        el('div', { textContent: 'No provenance data' }),
        el('div', { textContent: 'Query changes will be tracked here', style: { fontSize: '11px' } }),
      ]);
    }

    var timeline = el('div', { className: 'provenance-timeline' });
    var entries = ts.provenance.entries.slice().reverse(); // newest first
    entries.forEach(function(entry) {
      var item = el('div', { className: 'provenance-entry' });
      var actionClass = 'provenance-action provenance-' + entry.action;
      item.appendChild(el('span', { className: actionClass, textContent: entry.action }));
      item.appendChild(el('span', { className: 'provenance-detail', textContent: entry.detail }));
      if (entry.origin) {
        item.appendChild(el('span', { className: 'provenance-origin', textContent: entry.origin }));
      }
      item.appendChild(el('span', { className: 'provenance-time', textContent: formatTimestamp(entry.timestamp) }));
      timeline.appendChild(item);
    });
    return timeline;
  }

  // ── Provenance Tracking Hooks ──
  function trackProvenanceEntry(action, detail, opts) {
    if (!state.activeTabId) return;
    var entry = {
      timestamp: new Date().toISOString(),
      action: action,
      detail: detail,
    };
    if (opts && opts.origin) entry.origin = opts.origin;
    if (opts && opts.querySnapshot) entry.querySnapshot = opts.querySnapshot;
    if (opts && opts.fieldName) entry.fieldName = opts.fieldName;
    vscode.postMessage({
      type: 'addProvenanceEntry',
      payload: { requestId: state.activeTabId, entry: entry },
    });
  }

  /** Parse query text to build a hierarchical selection tree for selectedFields */
  function parseQueryFields(queryText) {
    if (!queryText || !queryText.trim()) return {};
    // Find the innermost selection set of the root field
    // Pattern: operationType Name(...) { rootField(...) { ...fields... } }
    const outerMatch = queryText.match(/\{\s*\w+[^{]*\{([\s\S]*)\}\s*\}$/);
    if (!outerMatch) return {};
    const innerBody = outerMatch[1];
    return parseSelectionSet(innerBody);
  }

  /** Recursively parse a selection set body into a tree */
  function parseSelectionSet(body) {
    const tree = {};
    let i = 0;
    const trimmed = body.trim();
    const len = trimmed.length;

    while (i < len) {
      // Skip whitespace and commas
      while (i < len && /[\s,]/.test(trimmed[i])) i++;
      if (i >= len) break;

      // Skip comments
      if (trimmed[i] === '#') {
        while (i < len && trimmed[i] !== '\n') i++;
        continue;
      }

      // Read field name (may include aliases like alias: fieldName, but we keep it simple)
      let name = '';
      while (i < len && /[a-zA-Z0-9_]/.test(trimmed[i])) {
        name += trimmed[i];
        i++;
      }
      if (!name) { i++; continue; }

      // Skip whitespace
      while (i < len && /\s/.test(trimmed[i])) i++;

      // Check for arguments: skip (...)
      if (i < len && trimmed[i] === '(') {
        let depth = 1;
        i++;
        while (i < len && depth > 0) {
          if (trimmed[i] === '(') depth++;
          else if (trimmed[i] === ')') depth--;
          i++;
        }
        // Skip whitespace after args
        while (i < len && /\s/.test(trimmed[i])) i++;
      }

      // Check for sub-selection set { ... }
      if (i < len && trimmed[i] === '{') {
        let depth = 1;
        i++;
        const start = i;
        while (i < len && depth > 0) {
          if (trimmed[i] === '{') depth++;
          else if (trimmed[i] === '}') depth--;
          i++;
        }
        const subBody = trimmed.substring(start, i - 1);
        tree[name] = parseSelectionSet(subBody);
      } else {
        tree[name] = true;
      }
    }
    return tree;
  }

  init();
})();
