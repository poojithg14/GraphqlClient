// @ts-nocheck
/* eslint-disable */

/**
 * GraphQL CLNT — VS Code Webview UI
 * Plain HTML/CSS/JS, zero framework dependencies
 */

(function () {
  'use strict';

  // ── VS Code API ──
  const vscode = acquireVsCodeApi();

  // ── State ──
  let state = vscode.getState() || {
    collections: [],
    environments: { active: 'dev', envs: {} },
    history: [],
    secretKeys: [],
    openTabs: [],
    activeTabId: null,
    activeRequest: null,
    expandedCollections: {},
    expandedFolders: {},
    sidebarWidth: 260,
    searchQuery: '',
  };

  // Per-tab editor state (not persisted in vscode state to avoid bloat)
  let tabStates = {};
  let isLoading = false;
  let contextMenu = null;

  // ── Helpers ──
  function saveState() { vscode.setState(state); }

  function $(sel, parent) { return (parent || document).querySelector(sel); }
  function $$(sel, parent) { return Array.from((parent || document).querySelectorAll(sel)); }

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'className') e.className = v;
        else if (k === 'textContent') e.textContent = v;
        else if (k === 'innerHTML') e.innerHTML = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
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

  function generateId(prefix) { return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7); }

  // ── Message Handling ──
  window.addEventListener('message', e => {
    const msg = e.data;
    switch (msg.type) {
      case 'collectionsLoaded':
        state.collections = msg.payload;
        saveState();
        renderSidebar();
        renderStatusBar();
        break;
      case 'environmentsLoaded':
        state.environments = msg.payload;
        saveState();
        renderStatusBar();
        break;
      case 'historyLoaded':
        state.history = msg.payload;
        saveState();
        renderHistory();
        break;
      case 'secretsList':
        state.secretKeys = msg.payload;
        saveState();
        break;
      case 'queryResult':
        isLoading = false;
        handleQueryResult(msg.payload);
        break;
      case 'queryError':
        isLoading = false;
        handleQueryError(msg.payload);
        break;
      case 'importedCollections':
        handleImportedCollections(msg.payload);
        break;
      case 'exportDone':
        break;
      case 'secretsResolved':
        break;
    }
  });

  // ── Init ──
  function init() {
    buildLayout();
    // Request data from extension host
    vscode.postMessage({ type: 'loadCollections' });
    vscode.postMessage({ type: 'loadEnvironments' });
    vscode.postMessage({ type: 'loadHistory' });
    vscode.postMessage({ type: 'listSecrets' });
    // Restore open tabs
    if (state.activeTabId) {
      renderTabs();
      renderEditor();
    }
  }

  // ── Build Main Layout ──
  function buildLayout() {
    const app = $('#app');
    app.innerHTML = '';

    const layout = el('div', { className: 'app-layout' });
    const sidebar = el('div', { className: 'sidebar', id: 'sidebar' });
    sidebar.style.width = state.sidebarWidth + 'px';

    const resizeHandle = el('div', { className: 'resize-handle', id: 'resize-handle' });
    const editorArea = el('div', { className: 'editor-area', id: 'editor-area' });

    layout.appendChild(sidebar);
    layout.appendChild(resizeHandle);
    layout.appendChild(editorArea);

    const statusBar = el('div', { className: 'status-bar', id: 'status-bar' });

    app.appendChild(layout);
    app.appendChild(statusBar);

    setupResize(resizeHandle, sidebar);
    renderSidebar();
    renderEditorArea();
    renderStatusBar();
  }

  // ── Resize Handle ──
  function setupResize(handle, sidebar) {
    let startX, startW;
    handle.addEventListener('mousedown', e => {
      startX = e.clientX;
      startW = sidebar.offsetWidth;
      handle.classList.add('active');
      const onMove = e2 => {
        const w = Math.min(450, Math.max(180, startW + e2.clientX - startX));
        sidebar.style.width = w + 'px';
        state.sidebarWidth = w;
      };
      const onUp = () => {
        handle.classList.remove('active');
        saveState();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ── Sidebar ──
  function renderSidebar() {
    const sidebar = $('#sidebar');
    if (!sidebar) return;
    sidebar.innerHTML = '';

    // Toolbar
    const toolbar = el('div', { className: 'toolbar' });
    toolbar.appendChild(el('span', { className: 'toolbar-title', textContent: 'Collections' }));
    const actions = el('div', { className: 'toolbar-actions' });
    actions.appendChild(el('button', {
      className: 'btn-icon', title: 'New Collection', innerHTML: '&#x2795;',
      onClick: () => showNewCollectionDialog(),
    }));
    actions.appendChild(el('button', {
      className: 'btn-icon', title: 'Import', innerHTML: '&#x1F4E5;',
      onClick: () => vscode.postMessage({ type: 'importCollection' }),
    }));
    actions.appendChild(el('button', {
      className: 'btn-icon', title: 'Export', innerHTML: '&#x1F4E4;',
      onClick: () => vscode.postMessage({ type: 'exportCollections', payload: state.collections }),
    }));
    toolbar.appendChild(actions);
    sidebar.appendChild(toolbar);

    // Search
    const search = el('div', { className: 'sidebar-search' });
    const searchInput = el('input', {
      className: 'input', type: 'text', placeholder: 'Search requests...',
      value: state.searchQuery || '',
      onInput: e => { state.searchQuery = e.target.value; saveState(); renderTree(); },
    });
    search.appendChild(searchInput);
    sidebar.appendChild(search);

    // Tree
    const tree = el('div', { className: 'tree', id: 'tree' });
    sidebar.appendChild(tree);
    renderTree();
  }

  function renderTree() {
    const tree = $('#tree');
    if (!tree) return;
    tree.innerHTML = '';

    const query = (state.searchQuery || '').toLowerCase();
    const filtered = filterCollections(state.collections, query);

    if (filtered.length === 0) {
      tree.appendChild(el('div', { className: 'empty-state' }, [
        el('div', { textContent: state.collections.length === 0 ? 'No collections yet' : 'No matching requests' }),
        state.collections.length === 0
          ? el('button', { className: 'btn btn-primary', textContent: 'Create Collection', onClick: () => showNewCollectionDialog() })
          : null,
      ]));
      return;
    }

    filtered.forEach(col => {
      const expanded = state.expandedCollections[col.id] !== false;
      const colItem = el('div', {
        className: 'tree-item collection',
        onClick: () => { state.expandedCollections[col.id] = !expanded; saveState(); renderTree(); },
        onContextmenu: e => { e.preventDefault(); showCollectionContextMenu(e, col); },
      });
      colItem.appendChild(el('span', { className: 'tree-icon', textContent: expanded ? '▾' : '▸' }));
      colItem.appendChild(el('span', { className: 'tree-label', textContent: col.name }));
      const colActions = el('div', { className: 'tree-actions' });
      colActions.appendChild(el('button', {
        className: 'btn-icon', title: 'New Request', innerHTML: '+',
        onClick: e => { e.stopPropagation(); showNewRequestDialog(col.id); },
      }));
      colItem.appendChild(colActions);
      tree.appendChild(colItem);

      if (expanded) {
        col.folders.forEach(folder => {
          const fExpanded = state.expandedFolders[folder.id] !== false;
          const folderItem = el('div', {
            className: 'tree-item folder',
            onClick: () => { state.expandedFolders[folder.id] = !fExpanded; saveState(); renderTree(); },
            onContextmenu: e => { e.preventDefault(); showFolderContextMenu(e, col, folder); },
          });
          folderItem.appendChild(el('span', { className: 'tree-icon', textContent: fExpanded ? '▾' : '▸' }));
          folderItem.appendChild(el('span', { className: 'tree-label', textContent: folder.name }));
          const fActions = el('div', { className: 'tree-actions' });
          fActions.appendChild(el('button', {
            className: 'btn-icon', title: 'New Request', innerHTML: '+',
            onClick: e => { e.stopPropagation(); showNewRequestDialog(col.id, folder.id); },
          }));
          folderItem.appendChild(fActions);
          tree.appendChild(folderItem);

          if (fExpanded) {
            folder.requests.forEach(req => {
              const isActive = state.activeTabId === req.id;
              const reqItem = el('div', {
                className: 'tree-item request' + (isActive ? ' selected' : ''),
                onClick: () => openRequest(req),
                onContextmenu: e => { e.preventDefault(); showRequestContextMenu(e, col, folder, req); },
              });
              reqItem.appendChild(el('span', { className: 'tree-badge ' + req.type, textContent: req.type.charAt(0).toUpperCase() }));
              reqItem.appendChild(el('span', { className: 'tree-label', textContent: req.name }));
              tree.appendChild(reqItem);
            });
          }
        });
      }
    });
  }

  function filterCollections(collections, query) {
    if (!query) return collections;
    return collections.map(col => ({
      ...col,
      folders: col.folders.map(f => ({
        ...f,
        requests: f.requests.filter(r => r.name.toLowerCase().includes(query)),
      })).filter(f => f.requests.length > 0),
    })).filter(c => c.folders.length > 0);
  }

  // ── Open Request ──
  function openRequest(req) {
    // Add to open tabs if not already open
    if (!state.openTabs.find(t => t.id === req.id)) {
      state.openTabs.push({ id: req.id, name: req.name, type: req.type });
    }
    state.activeTabId = req.id;
    state.activeRequest = { ...req };

    // Initialize tab state if needed
    if (!tabStates[req.id]) {
      tabStates[req.id] = {
        query: req.query || '',
        variables: req.variables || '{}',
        headers: JSON.stringify(req.headers || {}, null, 2),
        response: null,
        responseTime: null,
        activeSubTab: 'query',
        responseSubTab: 'response',
      };
    }

    saveState();
    renderTree();
    renderTabs();
    renderEditor();
  }

  function closeTab(tabId) {
    state.openTabs = state.openTabs.filter(t => t.id !== tabId);
    delete tabStates[tabId];
    if (state.activeTabId === tabId) {
      if (state.openTabs.length > 0) {
        const last = state.openTabs[state.openTabs.length - 1];
        state.activeTabId = last.id;
        // Find the request to restore activeRequest
        const req = findRequestById(last.id);
        state.activeRequest = req || null;
      } else {
        state.activeTabId = null;
        state.activeRequest = null;
      }
    }
    saveState();
    renderTabs();
    renderEditor();
    renderTree();
  }

  function findRequestById(id) {
    for (const col of state.collections) {
      for (const folder of col.folders) {
        for (const req of folder.requests) {
          if (req.id === id) return req;
        }
      }
    }
    return null;
  }

  // ── Editor Area ──
  function renderEditorArea() {
    const area = $('#editor-area');
    if (!area) return;
    area.innerHTML = '';

    const tabsBar = el('div', { className: 'tabs-bar', id: 'tabs-bar' });
    const editorContent = el('div', { id: 'editor-content', style: { flex: '1', display: 'flex', flexDirection: 'column', overflow: 'hidden' } });

    area.appendChild(tabsBar);
    area.appendChild(editorContent);

    renderTabs();
    renderEditor();
  }

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
          const req = findRequestById(tab.id);
          state.activeRequest = req || null;
          saveState();
          renderTabs();
          renderEditor();
          renderTree();
        },
      });

      const badge = el('span', { className: 'tree-badge ' + tab.type, textContent: tab.type.charAt(0).toUpperCase() });
      const label = el('span', { textContent: tab.name });
      const closeBtn = el('button', {
        className: 'btn-icon close-btn',
        innerHTML: '&times;',
        onClick: e => { e.stopPropagation(); closeTab(tab.id); },
      });

      tabEl.appendChild(badge);
      tabEl.appendChild(label);
      tabEl.appendChild(closeBtn);
      tabsBar.appendChild(tabEl);
    });
  }

  function renderEditor() {
    const content = $('#editor-content');
    if (!content) return;
    content.innerHTML = '';

    if (!state.activeTabId) {
      content.appendChild(el('div', { className: 'welcome' }, [
        el('div', { className: 'welcome-icon', textContent: '{ }' }),
        el('div', { className: 'welcome-text', textContent: 'GraphQL CLNT' }),
        el('div', { className: 'welcome-hint', textContent: 'Open or create a request to get started' }),
      ]));
      return;
    }

    const ts = tabStates[state.activeTabId];
    if (!ts) {
      // Try to restore from the request
      const req = findRequestById(state.activeTabId);
      if (req) {
        tabStates[state.activeTabId] = {
          query: req.query || '',
          variables: req.variables || '{}',
          headers: JSON.stringify(req.headers || {}, null, 2),
          response: null,
          responseTime: null,
          activeSubTab: 'query',
          responseSubTab: 'response',
        };
      } else {
        return;
      }
    }

    const tabState = tabStates[state.activeTabId];

    // Endpoint bar
    const env = state.environments.envs[state.environments.active];
    const endpoint = env ? env.endpoint : 'http://localhost:4000/graphql';

    const endpointBar = el('div', { className: 'endpoint-bar' });
    const methodLabel = el('span', {
      className: 'tree-badge ' + (state.activeRequest ? state.activeRequest.type : 'query'),
      textContent: 'POST',
      style: { fontWeight: '600', fontSize: '11px' },
    });
    const endpointInput = el('input', {
      className: 'input', type: 'text', value: endpoint, placeholder: 'Endpoint URL',
      onInput: e => {
        if (state.environments.envs[state.environments.active]) {
          state.environments.envs[state.environments.active].endpoint = e.target.value;
          saveState();
        }
      },
    });
    const runBtn = el('button', {
      className: 'btn btn-run',
      textContent: isLoading ? 'Running...' : '▶ Run',
      disabled: isLoading ? 'disabled' : undefined,
      onClick: () => executeQuery(),
    });
    const saveBtn = el('button', {
      className: 'btn btn-secondary',
      textContent: 'Save',
      onClick: () => saveCurrentRequest(),
    });

    endpointBar.appendChild(methodLabel);
    endpointBar.appendChild(endpointInput);
    endpointBar.appendChild(runBtn);
    endpointBar.appendChild(saveBtn);
    content.appendChild(endpointBar);

    // Editor split
    const split = el('div', { className: 'editor-split' });

    // Left panel (query editor)
    const leftPanel = el('div', { className: 'editor-panel' });
    const leftSubTabs = el('div', { className: 'sub-tabs' });
    ['query', 'variables', 'headers'].forEach(tab => {
      leftSubTabs.appendChild(el('button', {
        className: 'sub-tab' + (tabState.activeSubTab === tab ? ' active' : ''),
        textContent: tab.charAt(0).toUpperCase() + tab.slice(1),
        onClick: () => { tabState.activeSubTab = tab; renderEditor(); },
      }));
    });
    leftPanel.appendChild(leftSubTabs);

    const leftContent = el('div', { className: 'panel-content' });
    if (tabState.activeSubTab === 'query') {
      leftContent.appendChild(buildCodeEditor(tabState.query, 'graphql', val => { tabState.query = val; }));
    } else if (tabState.activeSubTab === 'variables') {
      leftContent.appendChild(buildCodeEditor(tabState.variables, 'json', val => { tabState.variables = val; }));
    } else {
      leftContent.appendChild(buildCodeEditor(tabState.headers, 'json', val => { tabState.headers = val; }));
    }
    leftPanel.appendChild(leftContent);

    // Right panel (response)
    const rightPanel = el('div', { className: 'editor-panel' });
    const rightSubTabs = el('div', { className: 'sub-tabs' });
    ['response', 'history'].forEach(tab => {
      rightSubTabs.appendChild(el('button', {
        className: 'sub-tab' + (tabState.responseSubTab === tab ? ' active' : ''),
        textContent: tab.charAt(0).toUpperCase() + tab.slice(1) + (tab === 'response' && tabState.responseTime != null ? ` (${tabState.responseTime}ms)` : ''),
        onClick: () => { tabState.responseSubTab = tab; renderEditor(); },
      }));
    });
    rightPanel.appendChild(rightSubTabs);

    const rightContent = el('div', { className: 'panel-content' });
    if (tabState.responseSubTab === 'response') {
      rightContent.appendChild(buildResponseViewer(tabState.response));
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

    // Line numbers
    const lines = value.split('\n');
    const lineCount = Math.max(lines.length, 20);
    const lineNums = el('div', { className: 'line-numbers' });
    for (let i = 1; i <= lineCount; i++) {
      lineNums.appendChild(el('div', { textContent: String(i) }));
    }

    // Editor inner
    const inner = el('div', { className: 'code-editor-inner' });

    // Highlight overlay
    const highlight = el('div', { className: 'code-highlight' });
    highlight.innerHTML = highlightCode(value, language);

    // Textarea
    const textarea = el('textarea', {
      className: 'code-textarea',
      value: value,
      spellcheck: 'false',
      autocomplete: 'off',
      autocorrect: 'off',
      autocapitalize: 'off',
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

    // Sync scroll
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
    for (let i = 1; i <= lineCount; i++) {
      lineNums.appendChild(el('div', { textContent: String(i) }));
    }
  }

  // ── Syntax Highlighting ──
  function highlightCode(code, language) {
    if (language === 'graphql') return highlightGraphQL(code);
    if (language === 'json') return highlightJSON(code);
    return escapeHtml(code);
  }

  function highlightGraphQL(code) {
    return code.split('\n').map(line => {
      // Comments
      line = line.replace(/(#.*)$/g, '<span class="syn-comment">$1</span>');

      // Keywords
      line = line.replace(
        /\b(query|mutation|subscription|fragment|on|type|interface|union|enum|scalar|input|extend|implements|directive|schema|true|false|null)\b/g,
        '<span class="syn-keyword">$1</span>'
      );

      // Types
      line = line.replace(
        /\b(ID|String|Int|Float|Boolean)\b/g,
        '<span class="syn-type">$1</span>'
      );

      // Variables
      line = line.replace(
        /(\$\w+)/g,
        '<span class="syn-variable">$1</span>'
      );

      // Directives
      line = line.replace(
        /(@\w+)/g,
        '<span class="syn-directive">$1</span>'
      );

      // Strings (avoid double-processing spans)
      line = line.replace(
        /("(?:[^"\\]|\\.)*")(?![^<]*>)/g,
        '<span class="syn-string">$1</span>'
      );

      // Numbers (avoid inside spans)
      line = line.replace(
        /\b(\d+(?:\.\d+)?)(?![^<]*>)\b/g,
        '<span class="syn-number">$1</span>'
      );

      return line;
    }).join('\n');
  }

  function highlightJSON(code) {
    return code.split('\n').map(line => {
      // Keys
      line = line.replace(
        /("(?:[^"\\]|\\.)*")(\s*:)/g,
        '<span class="json-key">$1</span>$2'
      );

      // String values (after colon, not already wrapped)
      line = line.replace(
        /(:\s*)("(?:[^"\\]|\\.)*")(?![^<]*>)/g,
        '$1<span class="json-string">$2</span>'
      );

      // Numbers
      line = line.replace(
        /(:\s*)(\d+(?:\.\d+)?)(?![^<]*>)/g,
        '$1<span class="json-number">$2</span>'
      );

      // Booleans and null
      line = line.replace(
        /(:\s*)(true|false|null)\b(?![^<]*>)/g,
        '$1<span class="json-boolean">$2</span>'
      );

      return line;
    }).join('\n');
  }

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

    // Show errors if present
    if (response.errors) {
      const errBox = el('div', { className: 'response-errors' });
      errBox.appendChild(el('div', { className: 'error-title', textContent: 'Errors' }));
      response.errors.forEach(err => {
        errBox.appendChild(el('div', { className: 'error-msg', textContent: err.message || String(err) }));
        if (err.path) {
          errBox.appendChild(el('div', { className: 'error-path', textContent: 'at ' + err.path.join('.') }));
        }
      });
      wrapper.appendChild(errBox);
    }

    // Show formatted data
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
      let result = '[\n';
      obj.forEach((item, i) => {
        result += nextSpaces + formatJSON(item, indent + 1);
        if (i < obj.length - 1) result += ',';
        result += '\n';
      });
      result += spaces + ']';
      return result;
    }

    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) return '{}';
      let result = '{\n';
      keys.forEach((key, i) => {
        result += nextSpaces + '<span class="json-key">"' + escapeHtml(key) + '"</span>: ' + formatJSON(obj[key], indent + 1);
        if (i < keys.length - 1) result += ',';
        result += '\n';
      });
      result += spaces + '}';
      return result;
    }

    return escapeHtml(String(obj));
  }

  // ── History Viewer ──
  function buildHistoryViewer() {
    const list = el('div', { className: 'history-list' });

    if (!state.history || state.history.length === 0) {
      return el('div', { className: 'empty-state' }, [
        el('div', { textContent: 'No history yet' }),
        el('div', { textContent: 'Execute a query to see it here', style: { fontSize: '11px' } }),
      ]);
    }

    state.history.forEach(entry => {
      const item = el('div', {
        className: 'history-item',
        onClick: () => loadHistoryEntry(entry),
      });
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

  function formatTimestamp(isoString) {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  }

  // ── History Renderer (called separately) ──
  function renderHistory() {
    // History is rendered inline in the editor right panel
    // It will be updated next time renderEditor is called
  }

  // ── Query Execution ──
  function executeQuery() {
    if (!state.activeTabId) return;
    const ts = tabStates[state.activeTabId];
    if (!ts) return;

    const env = state.environments.envs[state.environments.active];
    const endpoint = env ? env.endpoint : 'http://localhost:4000/graphql';

    // Merge environment headers with custom headers
    let envHeaders = {};
    if (env && env.headers) {
      envHeaders = { ...env.headers };
    }

    let customHeaders = {};
    try {
      const parsed = JSON.parse(ts.headers || '{}');
      customHeaders = parsed;
    } catch {
      // Invalid JSON, ignore
    }

    const mergedHeaders = { ...envHeaders, ...customHeaders };

    isLoading = true;
    renderEditor();

    vscode.postMessage({
      type: 'executeQuery',
      payload: {
        query: ts.query,
        variables: ts.variables,
        headers: mergedHeaders,
        endpoint: endpoint,
      },
    });
  }

  function handleQueryResult(payload) {
    if (!state.activeTabId) return;
    const ts = tabStates[state.activeTabId];
    if (!ts) return;

    ts.response = payload.data;
    ts.responseTime = payload.responseTime;
    ts.responseSubTab = 'response';

    // Add to history
    const hasErrors = payload.data && typeof payload.data === 'object' && payload.data.errors;
    const entry = {
      id: Date.now(),
      requestId: state.activeTabId,
      requestName: state.activeRequest ? state.activeRequest.name : 'Unknown',
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
      requestName: state.activeRequest ? state.activeRequest.name : 'Unknown',
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

  // ── Save Request ──
  function saveCurrentRequest() {
    if (!state.activeTabId || !state.activeRequest) return;
    const ts = tabStates[state.activeTabId];
    if (!ts) return;

    let parsedHeaders = {};
    try { parsedHeaders = JSON.parse(ts.headers || '{}'); } catch { /* ignore */ }

    const updates = {
      query: ts.query,
      variables: ts.variables,
      headers: parsedHeaders,
    };

    // Deep update collections
    state.collections = state.collections.map(col => ({
      ...col,
      folders: col.folders.map(folder => ({
        ...folder,
        requests: folder.requests.map(req =>
          req.id === state.activeTabId ? { ...req, ...updates } : req
        ),
      })),
    }));

    saveState();
    vscode.postMessage({ type: 'saveCollections', payload: state.collections });
  }

  // ── Import ──
  function handleImportedCollections(imported) {
    state.collections = [...state.collections, ...imported];
    imported.forEach(col => { state.expandedCollections[col.id] = true; });
    saveState();
    vscode.postMessage({ type: 'saveCollections', payload: state.collections });
    renderSidebar();
    renderStatusBar();
  }

  // ── Status Bar ──
  function renderStatusBar() {
    const bar = $('#status-bar');
    if (!bar) return;
    bar.innerHTML = '';

    const left = el('div', { className: 'status-left' });
    const right = el('div', { className: 'status-right' });

    // Left: collection/request count
    let reqCount = 0;
    state.collections.forEach(c => c.folders.forEach(f => { reqCount += f.requests.length; }));
    left.appendChild(el('div', { className: 'status-item', textContent: state.collections.length + ' Collections · ' + reqCount + ' Requests' }));

    // Right: environment selector
    const envKey = state.environments.active || 'dev';
    const envItem = el('div', {
      className: 'status-item',
      onClick: () => showEnvironmentSelector(),
    });
    envItem.appendChild(el('span', { className: 'env-dot ' + envKey }));
    const envConfig = state.environments.envs[envKey];
    envItem.appendChild(el('span', { textContent: envConfig ? envConfig.name : envKey }));
    right.appendChild(envItem);

    // Right: secrets
    right.appendChild(el('div', {
      className: 'status-item',
      textContent: '🔑 Secrets',
      onClick: () => showSetSecretDialog(),
    }));

    bar.appendChild(left);
    bar.appendChild(right);
  }

  // ── Context Menus ──
  function showContextMenu(x, y, items) {
    closeContextMenu();
    const menu = el('div', { className: 'context-menu' });
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    items.forEach(item => {
      if (item.separator) {
        menu.appendChild(el('div', { className: 'context-menu-separator' }));
      } else {
        menu.appendChild(el('div', {
          className: 'context-menu-item' + (item.destructive ? ' destructive' : ''),
          textContent: item.label,
          onClick: () => { closeContextMenu(); item.action(); },
        }));
      }
    });

    document.body.appendChild(menu);
    contextMenu = menu;

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', closeContextMenu, { once: true });
    });
  }

  function closeContextMenu() {
    if (contextMenu) {
      contextMenu.remove();
      contextMenu = null;
    }
  }

  function showCollectionContextMenu(e, col) {
    showContextMenu(e.clientX, e.clientY, [
      { label: 'New Folder', action: () => addFolderToCollection(col) },
      { label: 'Rename', action: () => showRenameDialog('collection', col) },
      { separator: true },
      { label: 'Delete', destructive: true, action: () => deleteCollection(col.id) },
    ]);
  }

  function showFolderContextMenu(e, col, folder) {
    showContextMenu(e.clientX, e.clientY, [
      { label: 'New Request', action: () => showNewRequestDialog(col.id, folder.id) },
      { label: 'Rename', action: () => showRenameDialog('folder', folder, col.id) },
      { separator: true },
      { label: 'Delete', destructive: true, action: () => deleteFolder(col.id, folder.id) },
    ]);
  }

  function showRequestContextMenu(e, col, folder, req) {
    showContextMenu(e.clientX, e.clientY, [
      { label: 'Duplicate', action: () => duplicateRequest(col.id, folder.id, req) },
      { label: 'Rename', action: () => showRenameDialog('request', req, col.id, folder.id) },
      { separator: true },
      { label: 'Delete', destructive: true, action: () => deleteRequest(col.id, folder.id, req.id) },
    ]);
  }

  // ── Collection CRUD ──
  function addFolderToCollection(col) {
    showModal('New Folder', 'Add a folder to ' + col.name, [
      { id: 'folderName', label: 'Folder Name', placeholder: 'e.g. Users' },
    ], values => {
      if (!values.folderName) return;
      const folder = { id: generateId('folder'), name: values.folderName, requests: [] };
      state.collections = state.collections.map(c =>
        c.id === col.id ? { ...c, folders: [...c.folders, folder] } : c
      );
      state.expandedCollections[col.id] = true;
      state.expandedFolders[folder.id] = true;
      saveState();
      vscode.postMessage({ type: 'saveCollections', payload: state.collections });
      renderSidebar();
    });
  }

  function deleteCollection(colId) {
    state.collections = state.collections.filter(c => c.id !== colId);
    // Close tabs for requests in this collection
    const reqIds = new Set();
    state.collections.forEach(c => c.folders.forEach(f => f.requests.forEach(r => reqIds.add(r.id))));
    state.openTabs = state.openTabs.filter(t => reqIds.has(t.id) || !findDeletedRequestId(colId, t.id));
    saveState();
    vscode.postMessage({ type: 'saveCollections', payload: state.collections });
    renderSidebar();
    renderStatusBar();
  }

  function findDeletedRequestId(colId, reqId) {
    // Simply returns true - we'll filter later
    return true;
  }

  function deleteFolder(colId, folderId) {
    state.collections = state.collections.map(c =>
      c.id === colId ? { ...c, folders: c.folders.filter(f => f.id !== folderId) } : c
    );
    saveState();
    vscode.postMessage({ type: 'saveCollections', payload: state.collections });
    renderSidebar();
    renderStatusBar();
  }

  function deleteRequest(colId, folderId, reqId) {
    state.collections = state.collections.map(c =>
      c.id === colId ? {
        ...c,
        folders: c.folders.map(f =>
          f.id === folderId ? { ...f, requests: f.requests.filter(r => r.id !== reqId) } : f
        ),
      } : c
    );
    closeTab(reqId);
    saveState();
    vscode.postMessage({ type: 'saveCollections', payload: state.collections });
    renderSidebar();
    renderStatusBar();
  }

  function duplicateRequest(colId, folderId, req) {
    const dup = {
      id: generateId('req'),
      name: req.name + ' (copy)',
      type: req.type,
      query: req.query,
      variables: req.variables,
      headers: { ...req.headers },
    };
    state.collections = state.collections.map(c =>
      c.id === colId ? {
        ...c,
        folders: c.folders.map(f =>
          f.id === folderId ? { ...f, requests: [...f.requests, dup] } : f
        ),
      } : c
    );
    saveState();
    vscode.postMessage({ type: 'saveCollections', payload: state.collections });
    renderSidebar();
  }

  // ── Dialogs ──
  function showModal(title, description, fields, onSubmit) {
    const overlay = el('div', { className: 'modal-overlay' });
    const modal = el('div', { className: 'modal' });

    modal.appendChild(el('div', { className: 'modal-title', textContent: title }));
    if (description) modal.appendChild(el('div', { className: 'modal-desc', textContent: description }));

    const inputs = {};
    fields.forEach(field => {
      const fieldEl = el('div', { className: 'modal-field' });
      fieldEl.appendChild(el('label', { textContent: field.label }));

      if (field.type === 'select') {
        const select = el('select', { className: 'select' });
        field.options.forEach(opt => {
          select.appendChild(el('option', { value: opt.value, textContent: opt.label }));
        });
        if (field.value) select.value = field.value;
        inputs[field.id] = select;
        fieldEl.appendChild(select);
      } else {
        const input = el('input', {
          className: 'input',
          type: field.type || 'text',
          placeholder: field.placeholder || '',
          value: field.value || '',
        });
        inputs[field.id] = input;
        fieldEl.appendChild(input);
      }

      modal.appendChild(fieldEl);
    });

    const actions = el('div', { className: 'modal-actions' });
    actions.appendChild(el('button', {
      className: 'btn btn-secondary', textContent: 'Cancel',
      onClick: () => overlay.remove(),
    }));
    actions.appendChild(el('button', {
      className: 'btn btn-primary', textContent: 'Create',
      onClick: () => {
        const values = {};
        for (const [k, v] of Object.entries(inputs)) values[k] = v.value;
        overlay.remove();
        onSubmit(values);
      },
    }));
    modal.appendChild(actions);

    overlay.appendChild(modal);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    // Focus first input
    const firstInput = Object.values(inputs)[0];
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }

  function showNewCollectionDialog() {
    showModal('New Collection', 'Create a new GraphQL collection', [
      { id: 'name', label: 'Collection Name', placeholder: 'e.g. My API' },
      { id: 'folderName', label: 'Initial Folder (optional)', placeholder: 'e.g. Users' },
    ], values => {
      if (!values.name) return;
      const folders = [];
      if (values.folderName) {
        folders.push({ id: generateId('folder'), name: values.folderName, requests: [] });
      }
      const col = { id: generateId('col'), name: values.name, folders: folders };
      state.collections.push(col);
      state.expandedCollections[col.id] = true;
      if (folders.length > 0) state.expandedFolders[folders[0].id] = true;
      saveState();
      vscode.postMessage({ type: 'saveCollections', payload: state.collections });
      renderSidebar();
      renderStatusBar();
    });
  }

  function showNewRequestDialog(colId, folderId) {
    const col = state.collections.find(c => c.id === colId);
    if (!col) return;

    const overlay = el('div', { className: 'modal-overlay' });
    const modal = el('div', { className: 'modal', style: { minWidth: '520px', maxWidth: '600px' } });

    modal.appendChild(el('div', { className: 'modal-title', textContent: 'New Request' }));
    modal.appendChild(el('div', { className: 'modal-desc', textContent: 'Add a request to ' + col.name }));

    // Name field
    const nameField = el('div', { className: 'modal-field' });
    nameField.appendChild(el('label', { textContent: 'Request Name' }));
    const nameInput = el('input', { className: 'input', type: 'text', placeholder: 'e.g. GetUsers, CreateUser, OnMessageAdded' });
    nameField.appendChild(nameInput);
    modal.appendChild(nameField);

    // Type field
    const typeField = el('div', { className: 'modal-field' });
    typeField.appendChild(el('label', { textContent: 'Type' }));
    const typeSelect = el('select', { className: 'select' });
    [{ value: 'query', label: 'Query' }, { value: 'mutation', label: 'Mutation' }, { value: 'subscription', label: 'Subscription' }].forEach(opt => {
      typeSelect.appendChild(el('option', { value: opt.value, textContent: opt.label }));
    });
    typeField.appendChild(typeSelect);
    modal.appendChild(typeField);

    // Folder field (if needed)
    let folderSelect = null;
    let folderInput = null;
    if (!folderId && col.folders.length > 0) {
      const ff = el('div', { className: 'modal-field' });
      ff.appendChild(el('label', { textContent: 'Folder' }));
      folderSelect = el('select', { className: 'select' });
      col.folders.forEach(f => folderSelect.appendChild(el('option', { value: f.id, textContent: f.name })));
      ff.appendChild(folderSelect);
      modal.appendChild(ff);
    } else if (!folderId && col.folders.length === 0) {
      const ff = el('div', { className: 'modal-field' });
      ff.appendChild(el('label', { textContent: 'Folder Name' }));
      folderInput = el('input', { className: 'input', type: 'text', placeholder: 'e.g. Queries' });
      ff.appendChild(folderInput);
      modal.appendChild(ff);
    }

    // Live preview
    const previewLabel = el('label', { textContent: 'Preview', style: { display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' } });
    modal.appendChild(previewLabel);
    const previewBox = el('div', {
      className: 'code-highlight',
      style: {
        background: 'var(--vscode-editor-background)',
        border: '1px solid var(--vscode-input-border, var(--vscode-widget-border))',
        borderRadius: '3px',
        padding: '8px 10px',
        maxHeight: '180px',
        overflow: 'auto',
        marginBottom: '12px',
        fontSize: '12px',
        lineHeight: '1.5',
        whiteSpace: 'pre',
      },
    });
    modal.appendChild(previewBox);

    function updatePreview() {
      const name = nameInput.value.trim() || 'MyOperation';
      const type = typeSelect.value;
      const generated = generateQueryTemplate(type, name);
      previewBox.innerHTML = highlightGraphQL(generated.query);
    }

    nameInput.addEventListener('input', updatePreview);
    typeSelect.addEventListener('change', updatePreview);
    updatePreview();

    // Actions
    const actions = el('div', { className: 'modal-actions' });
    actions.appendChild(el('button', {
      className: 'btn btn-secondary', textContent: 'Cancel',
      onClick: () => overlay.remove(),
    }));
    actions.appendChild(el('button', {
      className: 'btn btn-primary', textContent: 'Create',
      onClick: () => {
        const name = nameInput.value.trim();
        if (!name) return;
        const type = typeSelect.value;
        const generated = generateQueryTemplate(type, name);

        const req = {
          id: generateId('req'),
          name: name,
          type: type,
          query: generated.query,
          variables: generated.variables,
          headers: {},
        };

        let targetFolderId = folderId || (folderSelect ? folderSelect.value : null);

        if (!targetFolderId && folderInput && folderInput.value.trim()) {
          const newFolder = { id: generateId('folder'), name: folderInput.value.trim(), requests: [req] };
          state.collections = state.collections.map(c =>
            c.id === colId ? { ...c, folders: [...c.folders, newFolder] } : c
          );
          state.expandedFolders[newFolder.id] = true;
        } else if (targetFolderId) {
          state.collections = state.collections.map(c =>
            c.id === colId ? {
              ...c,
              folders: c.folders.map(f =>
                f.id === targetFolderId ? { ...f, requests: [...f.requests, req] } : f
              ),
            } : c
          );
        }

        state.expandedCollections[colId] = true;
        overlay.remove();
        saveState();
        vscode.postMessage({ type: 'saveCollections', payload: state.collections });
        renderSidebar();
        renderStatusBar();
        openRequest(req);
      },
    }));
    modal.appendChild(actions);

    overlay.appendChild(modal);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    setTimeout(() => nameInput.focus(), 50);
  }

  /**
   * Generates an Apollo-style query/mutation/subscription template with
   * sensible variable definitions, fields, and matching variables JSON
   * based on the operation name.
   */
  function generateQueryTemplate(type, name) {
    const opName = name.replace(/[^a-zA-Z0-9_]/g, '');

    // Detect intent from name to generate contextual fields
    const lower = name.toLowerCase();
    const patterns = detectOperationPattern(lower, type);

    if (type === 'mutation') {
      return buildMutationTemplate(opName, patterns);
    }
    if (type === 'subscription') {
      return buildSubscriptionTemplate(opName, patterns);
    }
    return buildQueryTemplate(opName, patterns);
  }

  function detectOperationPattern(lower, type) {
    // Detect common CRUD patterns from the name
    const result = { entity: '', action: '', isList: false, isByID: false, isCreate: false, isUpdate: false, isDelete: false };

    // Extract entity name — strip common prefixes
    const stripped = lower
      .replace(/^(get|fetch|list|find|search|load|create|add|new|insert|update|edit|modify|patch|delete|remove|destroy|on|subscribe\s*to?\s*)/i, '')
      .replace(/^(all|every|many|single|one)\s*/i, '')
      .trim();

    // Pluralization heuristic
    if (stripped.endsWith('s') && !stripped.endsWith('ss') && !stripped.endsWith('us') && stripped.length > 3) {
      result.entity = stripped.charAt(0).toUpperCase() + stripped.slice(1, -1);
      result.isList = true;
    } else {
      result.entity = stripped.charAt(0).toUpperCase() + stripped.slice(1);
    }

    if (!result.entity) result.entity = 'Item';

    // Detect action
    if (/^(get|fetch|find|load)/.test(lower) && !result.isList) { result.isByID = true; }
    if (/^(list|all|search|find\s*all|fetch\s*all)/.test(lower)) { result.isList = true; }
    if (/^(create|add|new|insert)/.test(lower)) { result.isCreate = true; }
    if (/^(update|edit|modify|patch)/.test(lower)) { result.isUpdate = true; }
    if (/^(delete|remove|destroy)/.test(lower)) { result.isDelete = true; }

    // For subscriptions
    if (type === 'subscription' && !result.entity) {
      result.entity = 'Event';
    }

    return result;
  }

  function buildQueryTemplate(opName, p) {
    const entityLower = p.entity.charAt(0).toLowerCase() + p.entity.slice(1);

    if (p.isList) {
      const plural = entityLower + 's';
      return {
        query:
          'query ' + opName + '($first: Int, $after: String) {\n' +
          '  ' + plural + '(first: $first, after: $after) {\n' +
          '    nodes {\n' +
          '      id\n' +
          '      name\n' +
          '      createdAt\n' +
          '    }\n' +
          '    pageInfo {\n' +
          '      hasNextPage\n' +
          '      endCursor\n' +
          '    }\n' +
          '    totalCount\n' +
          '  }\n' +
          '}',
        variables: JSON.stringify({ first: 10, after: null }, null, 2),
      };
    }

    if (p.isByID) {
      return {
        query:
          'query ' + opName + '($id: ID!) {\n' +
          '  ' + entityLower + '(id: $id) {\n' +
          '    id\n' +
          '    name\n' +
          '    email\n' +
          '    createdAt\n' +
          '    updatedAt\n' +
          '  }\n' +
          '}',
        variables: JSON.stringify({ id: "" }, null, 2),
      };
    }

    // Generic query
    return {
      query:
        'query ' + opName + ' {\n' +
        '  ' + entityLower + ' {\n' +
        '    id\n' +
        '    name\n' +
        '  }\n' +
        '}',
      variables: '{}',
    };
  }

  function buildMutationTemplate(opName, p) {
    const entityLower = p.entity.charAt(0).toLowerCase() + p.entity.slice(1);
    const inputType = p.entity + 'Input';

    if (p.isCreate) {
      return {
        query:
          'mutation ' + opName + '($input: Create' + inputType + '!) {\n' +
          '  create' + p.entity + '(input: $input) {\n' +
          '    id\n' +
          '    name\n' +
          '    createdAt\n' +
          '  }\n' +
          '}',
        variables: JSON.stringify({
          input: { name: "", email: "" }
        }, null, 2),
      };
    }

    if (p.isUpdate) {
      return {
        query:
          'mutation ' + opName + '($id: ID!, $input: Update' + inputType + '!) {\n' +
          '  update' + p.entity + '(id: $id, input: $input) {\n' +
          '    id\n' +
          '    name\n' +
          '    updatedAt\n' +
          '  }\n' +
          '}',
        variables: JSON.stringify({
          id: "", input: { name: "" }
        }, null, 2),
      };
    }

    if (p.isDelete) {
      return {
        query:
          'mutation ' + opName + '($id: ID!) {\n' +
          '  delete' + p.entity + '(id: $id) {\n' +
          '    id\n' +
          '    success\n' +
          '  }\n' +
          '}',
        variables: JSON.stringify({ id: "" }, null, 2),
      };
    }

    // Generic mutation
    return {
      query:
        'mutation ' + opName + '($input: ' + inputType + '!) {\n' +
        '  ' + entityLower + '(input: $input) {\n' +
        '    id\n' +
        '    name\n' +
        '    createdAt\n' +
        '  }\n' +
        '}',
      variables: JSON.stringify({
        input: { name: "" }
      }, null, 2),
    };
  }

  function buildSubscriptionTemplate(opName, p) {
    const entityLower = p.entity.charAt(0).toLowerCase() + p.entity.slice(1);

    return {
      query:
        'subscription ' + opName + ' {\n' +
        '  ' + entityLower + 'Changed {\n' +
        '    id\n' +
        '    name\n' +
        '    updatedAt\n' +
        '    __typename\n' +
        '  }\n' +
        '}',
      variables: '{}',
    };
  }

  function showRenameDialog(kind, item, colId, folderId) {
    showModal('Rename ' + kind.charAt(0).toUpperCase() + kind.slice(1), '', [
      { id: 'name', label: 'Name', value: item.name },
    ], values => {
      if (!values.name) return;
      if (kind === 'collection') {
        state.collections = state.collections.map(c =>
          c.id === item.id ? { ...c, name: values.name } : c
        );
      } else if (kind === 'folder') {
        state.collections = state.collections.map(c =>
          c.id === colId ? {
            ...c,
            folders: c.folders.map(f => f.id === item.id ? { ...f, name: values.name } : f),
          } : c
        );
      } else if (kind === 'request') {
        state.collections = state.collections.map(c =>
          c.id === colId ? {
            ...c,
            folders: c.folders.map(f =>
              f.id === folderId ? {
                ...f,
                requests: f.requests.map(r => r.id === item.id ? { ...r, name: values.name } : r),
              } : f
            ),
          } : c
        );
        // Update open tab name
        state.openTabs = state.openTabs.map(t => t.id === item.id ? { ...t, name: values.name } : t);
      }
      saveState();
      vscode.postMessage({ type: 'saveCollections', payload: state.collections });
      renderSidebar();
      renderTabs();
    });
  }

  // ── Environment Selector ──
  function showEnvironmentSelector() {
    const envKeys = Object.keys(state.environments.envs);
    showContextMenu(
      document.body.offsetWidth - 200,
      document.body.offsetHeight - 22 - (envKeys.length * 28 + 10),
      envKeys.map(key => ({
        label: (key === state.environments.active ? '✓ ' : '  ') + (state.environments.envs[key].name || key),
        action: () => {
          state.environments.active = key;
          saveState();
          vscode.postMessage({ type: 'saveEnvironments', payload: state.environments });
          renderStatusBar();
          renderEditor();
        },
      })),
    );
  }

  // ── Set Secret Dialog ──
  function showSetSecretDialog() {
    const overlay = el('div', { className: 'modal-overlay' });
    const modal = el('div', { className: 'modal' });

    modal.appendChild(el('div', { className: 'modal-title', textContent: 'Manage Secrets' }));
    modal.appendChild(el('div', { className: 'modal-desc', textContent: 'Secrets are stored securely in your OS keychain. Use ${secret:KEY} to reference them.' }));

    const keyField = el('div', { className: 'modal-field' });
    keyField.appendChild(el('label', { textContent: 'Secret Key' }));
    const keyInput = el('input', {
      className: 'input', type: 'text', placeholder: 'e.g. API_TOKEN',
      onInput: e => { e.target.value = e.target.value.toUpperCase().replace(/\s/g, '_'); },
    });
    keyField.appendChild(keyInput);
    modal.appendChild(keyField);

    const valField = el('div', { className: 'modal-field' });
    valField.appendChild(el('label', { textContent: 'Secret Value' }));
    const valInput = el('input', { className: 'input', type: 'password', placeholder: 'Enter secret value' });
    valField.appendChild(valInput);
    modal.appendChild(valField);

    // Badges for existing secrets
    const badgeContainer = el('div', { className: 'secret-badges', id: 'secret-badges' });
    state.secretKeys.forEach(key => {
      const badge = el('span', { className: 'secret-badge' });
      badge.appendChild(el('span', { textContent: key }));
      badge.appendChild(el('span', {
        className: 'remove-btn', textContent: '×',
        onClick: () => {
          vscode.postMessage({ type: 'deleteSecret', payload: { key } });
          state.secretKeys = state.secretKeys.filter(k => k !== key);
          badge.remove();
        },
      }));
      badgeContainer.appendChild(badge);
    });
    modal.appendChild(badgeContainer);

    const actions = el('div', { className: 'modal-actions' });
    actions.appendChild(el('button', {
      className: 'btn btn-secondary', textContent: 'Close',
      onClick: () => overlay.remove(),
    }));
    actions.appendChild(el('button', {
      className: 'btn btn-primary', textContent: 'Save Secret',
      onClick: () => {
        const key = keyInput.value.trim();
        const value = valInput.value;
        if (key && value) {
          vscode.postMessage({ type: 'setSecret', payload: { key, value } });
          if (!state.secretKeys.includes(key)) {
            state.secretKeys.push(key);
            const badge = el('span', { className: 'secret-badge' });
            badge.appendChild(el('span', { textContent: key }));
            badge.appendChild(el('span', {
              className: 'remove-btn', textContent: '×',
              onClick: () => {
                vscode.postMessage({ type: 'deleteSecret', payload: { key } });
                state.secretKeys = state.secretKeys.filter(k => k !== key);
                badge.remove();
              },
            }));
            badgeContainer.appendChild(badge);
          }
          keyInput.value = '';
          valInput.value = '';
        }
      },
    }));
    modal.appendChild(actions);

    overlay.appendChild(modal);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    setTimeout(() => keyInput.focus(), 50);
  }

  // ── Start ──
  init();
})();
