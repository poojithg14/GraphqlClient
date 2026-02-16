// @ts-nocheck
(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  let state = vscode.getState() || {
    collections: [],
    expandedCollections: {},
    expandedFolders: {},
    searchQuery: '',
    selectedRequestId: null,
    schema: null,
    schemaExpanded: true,
    schemaQueriesExpanded: true,
    schemaMutationsExpanded: true,
    schemaLoading: false,
    schemaError: null,
    environments: null,
    activeEnvFilter: 'local',
    collectionsVisible: true,
    schemaHeight: 200,
    impactReport: null,
    impactExpanded: true,
    schemaSearch: '',
  };

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

  // ── Messages from extension host ──
  window.addEventListener('message', e => {
    const msg = e.data;
    switch (msg.type) {
      case 'collectionsLoaded':
        state.collections = msg.payload;
        saveState();
        renderTree();
        break;
      case 'importedCollections': {
        const imported = msg.payload;
        state.collections = [...state.collections, ...imported];
        imported.forEach(col => { state.expandedCollections[col.id] = true; });
        saveState();
        vscode.postMessage({ type: 'saveCollections', payload: state.collections });
        renderTree();
        break;
      }
      case 'environmentsLoaded':
        state.environments = msg.payload;
        saveState();
        break;
      case 'schemaIntrospecting':
        state.schemaLoading = true;
        state.schemaError = null;
        saveState();
        renderSchemaExplorer();
        break;
      case 'schemaLoaded':
        state.schema = msg.payload;
        state.schemaLoading = false;
        state.schemaError = null;
        saveState();
        renderSchemaExplorer();
        break;
      case 'schemaError':
        state.schemaLoading = false;
        state.schemaError = msg.payload.error;
        saveState();
        renderSchemaExplorer();
        break;
      case 'operationGenerated':
        vscode.postMessage({
          type: 'openRequest',
          payload: {
            id: generateId('req'),
            name: msg.payload.name,
            type: msg.payload.type,
            query: msg.payload.query,
            variables: msg.payload.variables,
            headers: {},
            returnTypeName: msg.payload.returnTypeName,
            availableFields: msg.payload.availableFields,
            operationArgs: msg.payload.operationArgs,
            source: 'schema-explorer',
          },
        });
        break;
      case 'impactReportReady':
      case 'impactReportLoaded':
        state.impactReport = msg.payload;
        saveState();
        renderImpactReport();
        break;
      case 'autoHealComplete':
        showToast('Healed ' + msg.payload.healed + ' of ' + msg.payload.total + ' queries');
        vscode.postMessage({ type: 'loadCollections' });
        break;
      case 'nlResult':
        if (msg.payload.warning) {
          showToast(msg.payload.warning);
        }
        if (msg.payload.query) {
          var nlPayload = {
            id: generateId('req'),
            name: 'NL Generated',
            type: msg.payload.query.trim().startsWith('mutation') ? 'mutation' : 'query',
            query: msg.payload.query,
            variables: msg.payload.variables || '{}',
            headers: {},
          };
          nlPayload.source = 'nl-input';
          if (msg.payload.returnTypeName !== undefined) nlPayload.returnTypeName = msg.payload.returnTypeName;
          if (msg.payload.availableFields) nlPayload.availableFields = msg.payload.availableFields;
          if (msg.payload.operationArgs) nlPayload.operationArgs = msg.payload.operationArgs;
          vscode.postMessage({ type: 'openRequest', payload: nlPayload });
        }
        break;
      case 'aiConfigLoaded':
        // handled silently
        break;
      case 'predictedImpactReady':
        renderPredictedImpact(msg.payload);
        break;
      case 'sdlParseError':
        showSchemaPreviewError(msg.payload.error);
        break;
    }
  });

  // ── Init ──
  function init() {
    buildLayout();
    vscode.postMessage({ type: 'loadCollections' });
    vscode.postMessage({ type: 'loadEnvironments' });
    vscode.postMessage({ type: 'loadSchema' });
    vscode.postMessage({ type: 'loadImpactReport' });
  }

  function buildLayout() {
    const app = $('#app');
    app.innerHTML = '';

    // Toolbar
    const toolbar = el('div', { className: 'toolbar' });
    const collapseBtn = el('button', {
      className: 'btn-icon', title: 'Toggle Collections',
      textContent: state.collectionsVisible ? '\u25BE' : '\u25B8',
      onClick: () => {
        state.collectionsVisible = !state.collectionsVisible;
        saveState();
        buildLayout();
      },
    });
    toolbar.appendChild(collapseBtn);
    toolbar.appendChild(el('span', { className: 'toolbar-title', textContent: 'Collections' }));

    const actions = el('div', { className: 'toolbar-actions' });
    actions.appendChild(el('button', {
      className: 'btn-icon', title: 'New Collection', textContent: '+',
      onClick: () => showNewCollectionDialog(),
    }));
    actions.appendChild(el('button', {
      className: 'btn-icon', title: 'Import', innerHTML: '&#x2B07;',
      onClick: () => vscode.postMessage({ type: 'importCollection' }),
    }));
    actions.appendChild(el('button', {
      className: 'btn-icon', title: 'Export', innerHTML: '&#x2B06;',
      onClick: () => vscode.postMessage({ type: 'exportCollections', payload: state.collections }),
    }));
    toolbar.appendChild(actions);
    app.appendChild(toolbar);

    // Search
    const search = el('div', { className: 'sidebar-search' + (state.collectionsVisible ? '' : ' hidden') });
    const searchInput = el('input', {
      className: 'input', type: 'text', placeholder: 'Search requests...',
      value: state.searchQuery || '',
      onInput: e => { state.searchQuery = e.target.value; saveState(); renderTree(); },
    });
    search.appendChild(searchInput);
    app.appendChild(search);

    // NL Input bar
    const nlBar = el('div', { className: 'nl-bar' + (state.collectionsVisible ? '' : ' hidden') });
    const nlInput = el('input', {
      className: 'input', type: 'text',
      placeholder: 'Describe what you need...',
    });

    // Autocomplete dropdown
    const nlDropdown = el('div', { className: 'nl-dropdown hidden' });
    let nlActiveIndex = -1;
    let nlBlurTimeout = null;
    const NL_INTENTS = ['get', 'list', 'create', 'update', 'delete'];

    function getNLRootFields(intent) {
      if (!state.schema) return [];
      var items = [];

      // Determine which root types to include based on intent
      var showQueries = !intent || intent === 'list' || intent === 'get' || intent === 'unknown';
      var showMutations = !intent || intent === 'create' || intent === 'update' || intent === 'delete';

      if (showQueries && state.schema.queryType && state.schema.queryType.fields) {
        state.schema.queryType.fields.forEach(function(f) {
          items.push({ label: f.name, hint: f.type ? f.type.name || '' : '', group: 'Queries' });
        });
      }

      if (showMutations && state.schema.mutationType && state.schema.mutationType.fields) {
        var mutationFields = state.schema.mutationType.fields;
        // Filter mutations by intent prefix patterns
        if (intent === 'create') {
          mutationFields = mutationFields.filter(function(f) {
            var lower = f.name.toLowerCase();
            return lower.startsWith('create') || lower.startsWith('add') || lower.startsWith('new');
          });
        } else if (intent === 'update') {
          mutationFields = mutationFields.filter(function(f) {
            var lower = f.name.toLowerCase();
            return lower.startsWith('update') || lower.startsWith('edit') || lower.startsWith('modify');
          });
        } else if (intent === 'delete') {
          mutationFields = mutationFields.filter(function(f) {
            var lower = f.name.toLowerCase();
            return lower.startsWith('delete') || lower.startsWith('remove');
          });
        }
        mutationFields.forEach(function(f) {
          items.push({ label: f.name, hint: f.type ? f.type.name || '' : '', group: 'Mutations' });
        });
      }

      return items;
    }

    function renderNLDropdown(items) {
      nlDropdown.innerHTML = '';
      nlActiveIndex = -1;
      if (items.length === 0) {
        nlDropdown.classList.add('hidden');
        return;
      }
      var lastGroup = null;
      items.forEach(function(item, idx) {
        // Insert group header when group changes
        if (item.group && item.group !== lastGroup) {
          lastGroup = item.group;
          nlDropdown.appendChild(el('div', { className: 'nl-dropdown-group', textContent: item.group }));
        }
        var div = el('div', { className: 'nl-dropdown-item' });
        div.appendChild(el('span', { textContent: item.label }));
        if (item.hint) div.appendChild(el('span', { className: 'nl-dropdown-hint', textContent: item.hint }));
        div.addEventListener('mousedown', function(e) {
          e.preventDefault();
          selectNLSuggestion(item);
        });
        nlDropdown.appendChild(div);
      });
      nlDropdown.classList.remove('hidden');
    }

    function selectNLSuggestion(item) {
      var tokens = nlInput.value.split(/\s+/);
      if (tokens.length <= 1) {
        nlInput.value = item.label + ' ';
      } else {
        tokens[tokens.length - 1] = item.label;
        nlInput.value = tokens.join(' ') + ' ';
      }
      nlInput.focus();
      updateNLSuggestions();
    }

    function updateNLSuggestions() {
      var val = nlInput.value;
      var tokens = val.split(/\s+/).filter(function(t) { return t.length > 0; });
      var items = [];

      if (tokens.length === 0) {
        // Empty input — show all intents
        items = NL_INTENTS.map(function(intent) {
          return { label: intent, hint: 'intent' };
        });
      } else if (tokens.length === 1) {
        var partial = tokens[0].toLowerCase();
        var matchedIntent = NL_INTENTS.indexOf(partial) >= 0;
        if (matchedIntent) {
          // Full intent typed — show root fields filtered by intent
          items = getNLRootFields(partial).slice(0, 20);
        } else {
          // Partial intent — filter intents
          var filtered = NL_INTENTS.filter(function(i) { return i.startsWith(partial); });
          if (filtered.length > 0) {
            items = filtered.map(function(intent) {
              return { label: intent, hint: 'intent' };
            });
          } else {
            // Not matching any intent — show root fields filtered by partial
            var fields = getNLRootFields(null);
            var stripped = partial.endsWith('s') ? partial.slice(0, -1) : null;
            items = fields.filter(function(f) {
              var lower = f.label.toLowerCase();
              return lower.startsWith(partial) || lower.includes(partial) || (stripped && (lower.startsWith(stripped) || lower.includes(stripped)));
            }).slice(0, 20);
          }
        }
      } else {
        // Multiple tokens — if first token is a known intent, show root fields filtered by last token
        var firstToken = tokens[0].toLowerCase();
        if (NL_INTENTS.indexOf(firstToken) >= 0) {
          var partial = (tokens[tokens.length - 1] || '').toLowerCase();
          var fields = getNLRootFields(firstToken);
          // Skip connecting words for matching
          if (NL_CONNECTING_WORDS.indexOf(partial) >= 0) {
            items = fields.slice(0, 20);
          } else {
            var stripped = partial.endsWith('s') ? partial.slice(0, -1) : null;
            items = fields.filter(function(f) {
              var lower = f.label.toLowerCase();
              return lower.startsWith(partial) || lower.includes(partial) || (stripped && (lower.startsWith(stripped) || lower.includes(stripped)));
            }).slice(0, 20);
          }
          // If already selected a valid field (exact match), hide dropdown
          if (tokens.length >= 2) {
            var fieldToken = tokens[tokens.length - 1].toLowerCase();
            var exactMatch = fields.some(function(f) { return f.label.toLowerCase() === fieldToken; });
            if (exactMatch) items = [];
          }
        }
      }

      renderNLDropdown(items);
    }

    function navigateNLDropdown(dir) {
      var items = nlDropdown.querySelectorAll('.nl-dropdown-item');
      if (items.length === 0) return;
      if (nlActiveIndex >= 0 && nlActiveIndex < items.length) items[nlActiveIndex].classList.remove('active');
      nlActiveIndex += dir;
      if (nlActiveIndex < 0) nlActiveIndex = items.length - 1;
      if (nlActiveIndex >= items.length) nlActiveIndex = 0;
      items[nlActiveIndex].classList.add('active');
      items[nlActiveIndex].scrollIntoView({ block: 'nearest' });
    }

    nlInput.addEventListener('input', updateNLSuggestions);
    nlInput.addEventListener('focus', updateNLSuggestions);
    nlInput.addEventListener('blur', function() {
      nlBlurTimeout = setTimeout(function() { nlDropdown.classList.add('hidden'); }, 150);
    });

    nlInput.addEventListener('keydown', function(e) {
      var dropdownVisible = !nlDropdown.classList.contains('hidden');
      if (e.key === 'ArrowDown' && dropdownVisible) {
        e.preventDefault();
        navigateNLDropdown(1);
        return;
      }
      if (e.key === 'ArrowUp' && dropdownVisible) {
        e.preventDefault();
        navigateNLDropdown(-1);
        return;
      }
      if (e.key === 'Escape' && dropdownVisible) {
        e.preventDefault();
        nlDropdown.classList.add('hidden');
        return;
      }
      if (e.key === 'Enter') {
        if (dropdownVisible && nlActiveIndex >= 0) {
          e.preventDefault();
          var items = nlDropdown.querySelectorAll('.nl-dropdown-item');
          if (items[nlActiveIndex]) {
            items[nlActiveIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          }
          return;
        }
        if (nlInput.value.trim()) {
          nlDropdown.classList.add('hidden');
          var nlText = stripConnectingWords(nlInput.value.trim());
          vscode.postMessage({ type: 'nlToGraphql', payload: { input: nlText, mode: 'rule' } });
          nlInput.value = '';
        }
      }
    });

    nlBar.appendChild(nlInput);
    nlBar.appendChild(nlDropdown);
    const nlSubmitBtn = el('button', {
      className: 'btn-icon nl-mode-btn',
      title: 'Generate',
      textContent: '\u26A1',
      onClick: function() {
        if (nlInput.value.trim()) {
          nlDropdown.classList.add('hidden');
          var nlText = stripConnectingWords(nlInput.value.trim());
          vscode.postMessage({ type: 'nlToGraphql', payload: { input: nlText, mode: 'rule' } });
          nlInput.value = '';
        }
      },
    });
    nlBar.appendChild(nlSubmitBtn);
    app.appendChild(nlBar);

    // Tree container
    const tree = el('div', { className: 'tree' + (state.collectionsVisible ? '' : ' hidden'), id: 'tree' });
    app.appendChild(tree);

    // Impact Report section
    const impactEl = el('div', { id: 'impact-report' });
    app.appendChild(impactEl);

    // Resize handle (only visible when collections are visible)
    if (state.collectionsVisible) {
      const handle = el('div', { className: 'resize-handle' });
      app.appendChild(handle);
      setupResizeHandle(handle);
    }

    // Schema Explorer
    const schemaEl = el('div', { id: 'schema-explorer' });
    if (!state.collectionsVisible) {
      schemaEl.style.flex = '1';
    } else {
      schemaEl.style.height = state.schemaHeight + 'px';
      schemaEl.style.flexShrink = '0';
    }
    app.appendChild(schemaEl);

    renderTree();
    renderImpactReport();
    renderSchemaExplorer();
  }

  function setupResizeHandle(handle) {
    let startY = 0;
    let startHeight = 0;

    function onMouseMove(e) {
      const delta = startY - e.clientY;
      const newHeight = Math.max(80, startHeight + delta);
      state.schemaHeight = newHeight;
      const schemaEl = $('#schema-explorer');
      if (schemaEl) {
        schemaEl.style.height = newHeight + 'px';
      }
    }

    function onMouseUp() {
      saveState();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      handle.classList.remove('active');
      document.body.style.userSelect = '';
    }

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      startY = e.clientY;
      startHeight = state.schemaHeight;
      handle.classList.add('active');
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // ── Tree ──
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
        className: 'btn-icon', title: 'New Request', textContent: '+',
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
            className: 'btn-icon', title: 'New Request', textContent: '+',
            onClick: e => { e.stopPropagation(); showNewRequestDialog(col.id, folder.id); },
          }));
          folderItem.appendChild(fActions);
          tree.appendChild(folderItem);

          if (fExpanded) {
            folder.requests.forEach(req => {
              const isActive = state.selectedRequestId === req.id;
              const reqItem = el('div', {
                className: 'tree-item request' + (isActive ? ' selected' : ''),
                onClick: () => {
                  state.selectedRequestId = req.id;
                  saveState();
                  renderTree();
                  vscode.postMessage({ type: 'openRequest', payload: req });
                },
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
    let filtered = collections;
    if (!query) return filtered;
    return filtered.map(col => ({
      ...col,
      folders: col.folders.map(f => ({
        ...f,
        requests: f.requests.filter(r => r.name.toLowerCase().includes(query)),
      })).filter(f => f.requests.length > 0),
    })).filter(c => c.folders.length > 0);
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
    setTimeout(() => document.addEventListener('click', closeContextMenu, { once: true }));
  }

  function closeContextMenu() {
    if (contextMenu) { contextMenu.remove(); contextMenu = null; }
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
      persistAndRender();
    });
  }

  function deleteCollection(colId) {
    state.collections = state.collections.filter(c => c.id !== colId);
    persistAndRender();
  }

  function deleteFolder(colId, folderId) {
    state.collections = state.collections.map(c =>
      c.id === colId ? { ...c, folders: c.folders.filter(f => f.id !== folderId) } : c
    );
    persistAndRender();
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
    persistAndRender();
  }

  function duplicateRequest(colId, folderId, req) {
    const dup = {
      id: generateId('req'), name: req.name + ' (copy)', type: req.type,
      query: req.query, variables: req.variables, headers: { ...req.headers },
    };
    state.collections = state.collections.map(c =>
      c.id === colId ? {
        ...c,
        folders: c.folders.map(f =>
          f.id === folderId ? { ...f, requests: [...f.requests, dup] } : f
        ),
      } : c
    );
    persistAndRender();
  }

  function persistAndRender() {
    saveState();
    vscode.postMessage({ type: 'saveCollections', payload: state.collections });
    renderTree();
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
        field.options.forEach(opt => select.appendChild(el('option', { value: opt.value, textContent: opt.label })));
        if (field.value) select.value = field.value;
        inputs[field.id] = select;
        fieldEl.appendChild(select);
      } else {
        const input = el('input', {
          className: 'input', type: field.type || 'text',
          placeholder: field.placeholder || '', value: field.value || '',
        });
        inputs[field.id] = input;
        fieldEl.appendChild(input);
      }
      modal.appendChild(fieldEl);
    });

    const actions = el('div', { className: 'modal-actions' });
    actions.appendChild(el('button', { className: 'btn btn-secondary', textContent: 'Cancel', onClick: () => overlay.remove() }));
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
    const firstInput = Object.values(inputs)[0];
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }

  function showNewCollectionDialog() {
    const fields = [
      { id: 'name', label: 'Collection Name', placeholder: 'e.g. My API' },
      { id: 'folderName', label: 'Initial Folder (optional)', placeholder: 'e.g. Users' },
    ];

    showModal('New Collection', 'Create a new GraphQL collection', fields, values => {
      if (!values.name) return;
      const folders = [];
      if (values.folderName) folders.push({ id: generateId('folder'), name: values.folderName, requests: [] });
      const col = { id: generateId('col'), name: values.name, folders };
      state.collections.push(col);
      state.expandedCollections[col.id] = true;
      if (folders.length > 0) state.expandedFolders[folders[0].id] = true;
      persistAndRender();
    });
  }

  function showNewRequestDialog(colId, folderId) {
    const col = state.collections.find(c => c.id === colId);
    if (!col) return;

    const overlay = el('div', { className: 'modal-overlay' });
    const modal = el('div', { className: 'modal' });
    modal.appendChild(el('div', { className: 'modal-title', textContent: 'New Request' }));
    modal.appendChild(el('div', { className: 'modal-desc', textContent: 'Add a request to ' + col.name }));

    // Name
    const nameField = el('div', { className: 'modal-field' });
    nameField.appendChild(el('label', { textContent: 'Request Name' }));
    const nameInput = el('input', { className: 'input', type: 'text', placeholder: 'e.g. GetUsers, CreateUser' });
    nameField.appendChild(nameInput);
    modal.appendChild(nameField);

    // Type
    const typeField = el('div', { className: 'modal-field' });
    typeField.appendChild(el('label', { textContent: 'Type' }));
    const typeSelect = el('select', { className: 'select' });
    [{ v: 'query', l: 'Query' }, { v: 'mutation', l: 'Mutation' }, { v: 'subscription', l: 'Subscription' }].forEach(
      o => typeSelect.appendChild(el('option', { value: o.v, textContent: o.l }))
    );
    typeField.appendChild(typeSelect);
    modal.appendChild(typeField);

    // Folder (if needed)
    let folderSelect = null, folderInput = null;
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
    modal.appendChild(el('label', { textContent: 'Preview', style: { display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' } }));
    const previewBox = el('div', {
      className: 'code-highlight',
      style: {
        background: 'var(--vscode-editor-background)',
        border: '1px solid var(--vscode-input-border, var(--vscode-widget-border))',
        borderRadius: '3px', padding: '8px 10px', maxHeight: '160px', overflow: 'auto',
        marginBottom: '12px', fontSize: '12px', lineHeight: '1.5', whiteSpace: 'pre',
      },
    });
    modal.appendChild(previewBox);

    function updatePreview() {
      const name = nameInput.value.trim() || 'MyOperation';
      const generated = generateQueryTemplate(typeSelect.value, name);
      previewBox.innerHTML = highlightGraphQL(generated.query);
    }
    nameInput.addEventListener('input', updatePreview);
    typeSelect.addEventListener('change', updatePreview);
    updatePreview();

    // Actions
    const actions = el('div', { className: 'modal-actions' });
    actions.appendChild(el('button', { className: 'btn btn-secondary', textContent: 'Cancel', onClick: () => overlay.remove() }));
    actions.appendChild(el('button', {
      className: 'btn btn-primary', textContent: 'Create',
      onClick: () => {
        const name = nameInput.value.trim();
        if (!name) return;
        const generated = generateQueryTemplate(typeSelect.value, name);
        const req = {
          id: generateId('req'), name, type: typeSelect.value,
          query: generated.query, variables: generated.variables, headers: {},
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
              ...c, folders: c.folders.map(f =>
                f.id === targetFolderId ? { ...f, requests: [...f.requests, req] } : f
              ),
            } : c
          );
        }

        state.expandedCollections[colId] = true;
        overlay.remove();
        persistAndRender();
        // Open in editor panel
        state.selectedRequestId = req.id;
        saveState();
        renderTree();
        vscode.postMessage({ type: 'openRequest', payload: req });
      },
    }));
    modal.appendChild(actions);
    overlay.appendChild(modal);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    setTimeout(() => nameInput.focus(), 50);
  }

  function showRenameDialog(kind, item, colId, folderId) {
    showModal('Rename ' + kind.charAt(0).toUpperCase() + kind.slice(1), '', [
      { id: 'name', label: 'Name', value: item.name },
    ], values => {
      if (!values.name) return;
      if (kind === 'collection') {
        state.collections = state.collections.map(c => c.id === item.id ? { ...c, name: values.name } : c);
      } else if (kind === 'folder') {
        state.collections = state.collections.map(c =>
          c.id === colId ? { ...c, folders: c.folders.map(f => f.id === item.id ? { ...f, name: values.name } : f) } : c
        );
      } else if (kind === 'request') {
        state.collections = state.collections.map(c =>
          c.id === colId ? {
            ...c, folders: c.folders.map(f =>
              f.id === folderId ? { ...f, requests: f.requests.map(r => r.id === item.id ? { ...r, name: values.name } : r) } : f
            ),
          } : c
        );
      }
      persistAndRender();
    });
  }

  // ── Query Template Generation ──
  function generateQueryTemplate(type, name) {
    const opName = name.replace(/[^a-zA-Z0-9_]/g, '');
    const lower = name.toLowerCase();
    const p = detectPattern(lower, type);
    if (type === 'mutation') return buildMutation(opName, p);
    if (type === 'subscription') return buildSubscription(opName, p);
    return buildQuery(opName, p);
  }

  function detectPattern(lower, type) {
    const r = { entity: '', isList: false, isByID: false, isCreate: false, isUpdate: false, isDelete: false };
    const stripped = lower
      .replace(/^(get|fetch|list|find|search|load|create|add|new|insert|update|edit|modify|patch|delete|remove|destroy|on|subscribe\s*to?\s*)/i, '')
      .replace(/^(all|every|many|single|one)\s*/i, '').trim();
    if (stripped.endsWith('s') && !stripped.endsWith('ss') && !stripped.endsWith('us') && stripped.length > 3) {
      r.entity = stripped.charAt(0).toUpperCase() + stripped.slice(1, -1); r.isList = true;
    } else {
      r.entity = stripped.charAt(0).toUpperCase() + stripped.slice(1);
    }
    if (!r.entity) r.entity = 'Item';
    if (/^(get|fetch|find|load)/.test(lower) && !r.isList) r.isByID = true;
    if (/^(list|all|search|find\s*all|fetch\s*all)/.test(lower)) r.isList = true;
    if (/^(create|add|new|insert)/.test(lower)) r.isCreate = true;
    if (/^(update|edit|modify|patch)/.test(lower)) r.isUpdate = true;
    if (/^(delete|remove|destroy)/.test(lower)) r.isDelete = true;
    return r;
  }

  function buildQuery(opName, p) {
    const e = p.entity.charAt(0).toLowerCase() + p.entity.slice(1);
    if (p.isList) {
      return {
        query: 'query ' + opName + '($first: Int, $after: String) {\n  ' + e + 's(first: $first, after: $after) {\n    nodes {\n      id\n      name\n      createdAt\n    }\n    pageInfo {\n      hasNextPage\n      endCursor\n    }\n    totalCount\n  }\n}',
        variables: JSON.stringify({ first: 10, after: null }, null, 2),
      };
    }
    if (p.isByID) {
      return {
        query: 'query ' + opName + '($id: ID!) {\n  ' + e + '(id: $id) {\n    id\n    name\n    email\n    createdAt\n    updatedAt\n  }\n}',
        variables: JSON.stringify({ id: "" }, null, 2),
      };
    }
    return { query: 'query ' + opName + ' {\n  ' + e + ' {\n    id\n    name\n  }\n}', variables: '{}' };
  }

  function buildMutation(opName, p) {
    const e = p.entity.charAt(0).toLowerCase() + p.entity.slice(1);
    const it = p.entity + 'Input';
    if (p.isCreate) return { query: 'mutation ' + opName + '($input: Create' + it + '!) {\n  create' + p.entity + '(input: $input) {\n    id\n    name\n    createdAt\n  }\n}', variables: JSON.stringify({ input: { name: "", email: "" } }, null, 2) };
    if (p.isUpdate) return { query: 'mutation ' + opName + '($id: ID!, $input: Update' + it + '!) {\n  update' + p.entity + '(id: $id, input: $input) {\n    id\n    name\n    updatedAt\n  }\n}', variables: JSON.stringify({ id: "", input: { name: "" } }, null, 2) };
    if (p.isDelete) return { query: 'mutation ' + opName + '($id: ID!) {\n  delete' + p.entity + '(id: $id) {\n    id\n    success\n  }\n}', variables: JSON.stringify({ id: "" }, null, 2) };
    return { query: 'mutation ' + opName + '($input: ' + it + '!) {\n  ' + e + '(input: $input) {\n    id\n    name\n    createdAt\n  }\n}', variables: JSON.stringify({ input: { name: "" } }, null, 2) };
  }

  function buildSubscription(opName, p) {
    const e = p.entity.charAt(0).toLowerCase() + p.entity.slice(1);
    return { query: 'subscription ' + opName + ' {\n  ' + e + 'Changed {\n    id\n    name\n    updatedAt\n    __typename\n  }\n}', variables: '{}' };
  }

  // ── Schema Explorer ──
  function getActiveEnvironment() {
    if (!state.environments) return null;
    const env = state.environments.envs[state.environments.active];
    return env || null;
  }

  function getActiveEndpoint() {
    const env = getActiveEnvironment();
    return env ? env.endpoint : '';
  }

  function triggerIntrospect(endpointOverride) {
    const env = getActiveEnvironment();
    const endpoint = endpointOverride || (env ? env.endpoint : '');

    if (!endpoint) {
      // Show inline endpoint input instead of error
      state.schemaError = null;
      state.showEndpointInput = true;
      saveState();
      renderSchemaExplorer();
      return;
    }

    // If user entered an endpoint, save it to the active environment
    if (endpointOverride && env) {
      env.endpoint = endpointOverride;
      if (!env.headers) env.headers = {};
      if (!env.headers['Content-Type']) env.headers['Content-Type'] = 'application/json';
      vscode.postMessage({ type: 'saveEnvironments', payload: state.environments });
    }

    state.showEndpointInput = false;
    saveState();

    const headers = env ? (env.headers || {}) : {};
    vscode.postMessage({
      type: 'introspectSchema',
      payload: { endpoint, headers },
    });
  }

  function renderSchemaExplorer() {
    const container = $('#schema-explorer');
    if (!container) return;
    container.innerHTML = '';

    // Header toolbar
    const toolbar = el('div', { className: 'schema-toolbar' });
    const headerRow = el('div', { className: 'schema-header-row' });
    headerRow.appendChild(el('span', {
      className: 'tree-icon', textContent: state.schemaExpanded ? '▾' : '▸',
    }));
    headerRow.appendChild(el('span', { className: 'toolbar-title', textContent: 'Schema Explorer' }));
    headerRow.addEventListener('click', () => {
      state.schemaExpanded = !state.schemaExpanded;
      saveState();
      renderSchemaExplorer();
    });
    toolbar.appendChild(headerRow);

    const actions = el('div', { className: 'toolbar-actions' });
    actions.appendChild(el('button', {
      className: 'btn-icon',
      title: 'Expand Schema',
      textContent: '\u2197',
      onClick: e => {
        e.stopPropagation();
        state.collectionsVisible = false;
        saveState();
        buildLayout();
      },
    }));
    if (state.schema) {
      actions.appendChild(el('button', {
        className: 'btn-icon',
        title: 'Preview Schema Change',
        textContent: '\u0394',
        onClick: e => { e.stopPropagation(); showSchemaPreviewModal(); },
      }));
    }
    actions.appendChild(el('button', {
      className: 'btn-icon',
      title: 'Introspect Schema',
      textContent: '\u21BB',
      onClick: e => { e.stopPropagation(); triggerIntrospect(); },
    }));
    toolbar.appendChild(actions);
    container.appendChild(toolbar);

    if (!state.schemaExpanded) return;

    // Schema search input (shown when schema is loaded)
    if (state.schema) {
      var searchWrap = el('div', { className: 'schema-search' });
      var schemaSearchInput = el('input', {
        className: 'input schema-search-input', type: 'text',
        placeholder: 'Filter schemas...',
        value: state.schemaSearch || '',
        onInput: function(e) {
          state.schemaSearch = e.target.value;
          var cursorPos = e.target.selectionStart;
          saveState();
          renderSchemaExplorer();
          // Restore focus after re-render
          var restored = document.querySelector('.schema-search-input');
          if (restored) {
            restored.focus();
            restored.selectionStart = restored.selectionEnd = cursorPos;
          }
        },
      });
      searchWrap.appendChild(schemaSearchInput);
      container.appendChild(searchWrap);
    }

    // Loading state
    if (state.schemaLoading) {
      container.appendChild(el('div', { className: 'schema-status' }, [
        el('span', { className: 'schema-spinner', textContent: '\u21BB' }),
        el('span', { textContent: ' Introspecting schema...' }),
      ]));
      return;
    }

    // Error state
    if (state.schemaError) {
      container.appendChild(el('div', { className: 'schema-error', textContent: state.schemaError }));
    }

    // Endpoint input state (shown when no endpoint configured)
    if (state.showEndpointInput || (!state.schema && !getActiveEndpoint())) {
      const inputWrap = el('div', { className: 'schema-empty' });
      inputWrap.appendChild(el('div', { textContent: 'Enter a GraphQL endpoint to get started' }));
      const endpointInput = el('input', {
        className: 'input', type: 'text',
        placeholder: 'e.g. http://localhost:4000/graphql',
        style: { width: '100%', marginTop: '6px' },
      });
      endpointInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && endpointInput.value.trim()) {
          triggerIntrospect(endpointInput.value.trim());
        }
      });
      inputWrap.appendChild(endpointInput);
      inputWrap.appendChild(el('button', {
        className: 'btn btn-primary schema-introspect-btn',
        textContent: 'Introspect',
        style: { marginTop: '6px' },
        onClick: function() {
          if (endpointInput.value.trim()) {
            triggerIntrospect(endpointInput.value.trim());
          }
        },
      }));
      container.appendChild(inputWrap);
      setTimeout(function() { endpointInput.focus(); }, 50);
      return;
    }

    // Empty state
    if (!state.schema) {
      container.appendChild(el('div', { className: 'schema-empty' }, [
        el('div', { textContent: 'No schema loaded' }),
        el('button', {
          className: 'btn btn-primary schema-introspect-btn',
          textContent: 'Introspect Schema',
          onClick: () => triggerIntrospect(),
        }),
      ]));
      return;
    }

    // Schema loaded — show queries and mutations
    const schema = state.schema;

    if (schema.queryType && schema.queryType.fields.length > 0) {
      renderSchemaSection(container, 'Queries', schema.queryType.fields, 'query', 'schemaQueriesExpanded');
    }

    if (schema.mutationType && schema.mutationType.fields.length > 0) {
      renderSchemaSection(container, 'Mutations', schema.mutationType.fields, 'mutation', 'schemaMutationsExpanded');
    }

    // Fetched-at info
    if (schema.fetchedAt) {
      const date = new Date(schema.fetchedAt);
      container.appendChild(el('div', {
        className: 'schema-fetched-at',
        textContent: 'Fetched ' + date.toLocaleString(),
      }));
    }
  }

  function renderSchemaSection(container, title, fields, operationType, expandKey) {
    var searchFilter = (state.schemaSearch || '').toLowerCase();
    var filteredFields = searchFilter
      ? fields.filter(function(f) { return f.name.toLowerCase().includes(searchFilter); })
      : fields;

    const expanded = state[expandKey] !== false;
    const header = el('div', {
      className: 'schema-section-header',
      onClick: () => { state[expandKey] = !expanded; saveState(); renderSchemaExplorer(); },
    });
    header.appendChild(el('span', { className: 'tree-icon', textContent: expanded ? '▾' : '▸' }));
    header.appendChild(el('span', { textContent: title + ' (' + filteredFields.length + ')' }));
    container.appendChild(header);

    if (!expanded) return;

    filteredFields.forEach(field => {
      const item = el('div', {
        className: 'schema-field-item',
        onClick: () => {
          vscode.postMessage({
            type: 'generateOperation',
            payload: { operationType, fieldName: field.name },
          });
        },
      });
      item.appendChild(el('span', {
        className: 'tree-badge ' + operationType,
        textContent: operationType === 'query' ? 'Q' : 'M',
      }));
      item.appendChild(el('span', { className: 'schema-field-name', textContent: field.name }));
      if (field.args && field.args.length > 0) {
        item.appendChild(el('span', {
          className: 'schema-field-args',
          textContent: '(' + field.args.length + ')',
        }));
      }
      container.appendChild(item);
    });
  }

  // ── Syntax Highlighting (for preview) ──
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

  // ── Impact Report ──
  function renderImpactReport() {
    var container = $('#impact-report');
    if (!container) return;
    container.innerHTML = '';

    if (!state.impactReport) return;

    var report = state.impactReport;

    // Header
    var header = el('div', {
      className: 'impact-header',
      onClick: function() { state.impactExpanded = !state.impactExpanded; saveState(); renderImpactReport(); },
    });
    header.appendChild(el('span', { className: 'tree-icon', textContent: state.impactExpanded ? '\u25BE' : '\u25B8' }));
    header.appendChild(el('span', { className: 'toolbar-title', textContent: 'Impact Analysis' }));

    // Summary badges
    var badges = el('div', { className: 'impact-badges' });
    if (report.brokenCount > 0) badges.appendChild(el('span', { className: 'impact-badge broken', textContent: report.brokenCount + ' broken' }));
    if (report.affectedCount > 0) badges.appendChild(el('span', { className: 'impact-badge affected', textContent: report.affectedCount + ' affected' }));
    badges.appendChild(el('span', { className: 'impact-badge safe', textContent: report.safeCount + ' safe' }));
    header.appendChild(badges);

    // Fix All button
    var fixableEntries = report.entries.filter(function(e) { return e.autoFixAvailable; });
    if (fixableEntries.length > 0) {
      header.appendChild(el('button', {
        className: 'btn-icon', title: 'Fix All', textContent: '\u2692',
        onClick: function(e) {
          e.stopPropagation();
          var healEntries = fixableEntries.map(function(entry) {
            var fixes = [];
            entry.brokenFields.forEach(function(f) {
              if (f.changeType === 'renamed' && f.suggestedReplacement && f.confidence > 0.7) {
                fixes.push({ oldField: f.fieldName, newField: f.suggestedReplacement, lineNumber: 0 });
              } else if (f.changeType === 'removed') {
                fixes.push({ oldField: f.fieldName, newField: '', lineNumber: 0 });
              }
            });
            return { requestId: entry.requestId, collectionId: '', folderId: '', fixes: fixes };
          });
          vscode.postMessage({ type: 'autoHealAll', payload: { entries: healEntries } });
        },
      }));
    }

    container.appendChild(header);

    if (!state.impactExpanded) return;

    // Entries
    var body = el('div', { className: 'impact-body' });
    report.entries.forEach(function(entry) {
      if (entry.status === 'safe') return; // Only show broken/affected

      var item = el('div', {
        className: 'impact-item ' + entry.status,
        style: { cursor: 'pointer' },
        onClick: (function(entryRef) {
          return function() {
            // Find the matching request in collections and open it
            for (var ci = 0; ci < state.collections.length; ci++) {
              var col = state.collections[ci];
              for (var fi = 0; fi < col.folders.length; fi++) {
                var folder = col.folders[fi];
                for (var ri = 0; ri < folder.requests.length; ri++) {
                  var req = folder.requests[ri];
                  if (req.id === entryRef.requestId) {
                    state.selectedRequestId = req.id;
                    saveState();
                    renderTree();
                    vscode.postMessage({ type: 'openRequest', payload: req });
                    return;
                  }
                }
              }
            }
          };
        })(entry),
      });
      var nameRow = el('div', { className: 'impact-item-header' });
      nameRow.appendChild(el('span', { className: 'impact-status-dot ' + entry.status }));
      nameRow.appendChild(el('span', { className: 'impact-name', textContent: entry.requestName }));
      nameRow.appendChild(el('span', { className: 'impact-location', textContent: entry.collectionName + ' / ' + entry.folderName }));

      // Per-entry fix button
      if (entry.autoFixAvailable) {
        nameRow.appendChild(el('button', {
          className: 'btn-icon', title: 'Apply Fix', textContent: '\u2692',
          onClick: function(e) {
            e.stopPropagation();
            var fixes = [];
            entry.brokenFields.forEach(function(f) {
              if (f.changeType === 'renamed' && f.suggestedReplacement && f.confidence > 0.7) {
                fixes.push({ oldField: f.fieldName, newField: f.suggestedReplacement, lineNumber: 0 });
              } else if (f.changeType === 'removed') {
                fixes.push({ oldField: f.fieldName, newField: '', lineNumber: 0 });
              }
            });
            vscode.postMessage({
              type: 'autoHealQuery',
              payload: { requestId: entry.requestId, collectionId: '', folderId: '', fixes: fixes },
            });
          },
        }));
      }

      item.appendChild(nameRow);

      // Broken fields detail
      if (entry.brokenFields.length > 0) {
        var details = el('div', { className: 'impact-details' });
        entry.brokenFields.forEach(function(f) {
          var detail = el('div', { className: 'impact-field-change' });
          detail.appendChild(el('span', { textContent: f.typeName + '.' + f.fieldName }));
          if (f.changeType === 'renamed' && f.suggestedReplacement) {
            detail.appendChild(el('span', { className: 'impact-arrow', textContent: ' \u2192 ' + f.suggestedReplacement }));
          } else {
            detail.appendChild(el('span', { className: 'impact-change-type', textContent: ' (' + f.changeType + ')' }));
          }
          details.appendChild(detail);
        });
        item.appendChild(details);
      }

      body.appendChild(item);
    });

    // Summary
    body.appendChild(el('div', {
      className: 'schema-fetched-at',
      textContent: 'Analyzed ' + new Date(report.timestamp).toLocaleString(),
    }));

    container.appendChild(body);
  }

  // ── Schema Preview Modal (Feature B) ──
  var schemaPreviewOverlay = null;

  function showSchemaPreviewModal() {
    if (schemaPreviewOverlay) schemaPreviewOverlay.remove();

    var overlay = el('div', { className: 'modal-overlay' });
    var modal = el('div', { className: 'modal schema-preview-modal' });
    modal.appendChild(el('div', { className: 'modal-title', textContent: 'Preview Schema Change' }));
    modal.appendChild(el('div', { className: 'modal-desc', textContent: 'Paste a new schema (SDL or JSON introspection) to see predicted impact on your queries.' }));

    var textarea = el('textarea', {
      className: 'input schema-preview-textarea',
      placeholder: 'type Query {\n  users: [User!]!\n}\n\ntype User {\n  id: ID!\n  name: String!\n}\n\n— or paste JSON introspection result —',
    });
    modal.appendChild(textarea);

    var resultContainer = el('div', { id: 'schema-preview-result' });
    modal.appendChild(resultContainer);

    var actions = el('div', { className: 'modal-actions' });
    actions.appendChild(el('button', { className: 'btn btn-secondary', textContent: 'Close', onClick: function() { overlay.remove(); schemaPreviewOverlay = null; } }));
    actions.appendChild(el('button', {
      className: 'btn btn-primary', textContent: 'Analyze Impact',
      onClick: function() {
        var text = textarea.value.trim();
        if (!text) return;
        resultContainer.innerHTML = '';
        resultContainer.appendChild(el('div', { className: 'schema-status', textContent: 'Analyzing...' }));
        vscode.postMessage({ type: 'previewSchemaImpact', payload: { schemaText: text } });
      },
    }));
    modal.appendChild(actions);
    overlay.appendChild(modal);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) { overlay.remove(); schemaPreviewOverlay = null; } });
    document.body.appendChild(overlay);
    schemaPreviewOverlay = overlay;
    setTimeout(function() { textarea.focus(); }, 50);
  }

  function renderPredictedImpact(report) {
    var container = schemaPreviewOverlay ? schemaPreviewOverlay.querySelector('#schema-preview-result') : null;
    if (!container) return;
    container.innerHTML = '';

    // Summary badges
    var badges = el('div', { className: 'impact-badges', style: { marginBottom: '8px', marginTop: '8px' } });
    badges.appendChild(el('span', { className: 'impact-badge', textContent: 'Predicted Impact', style: { background: 'rgba(55,148,255,0.2)', color: '#3794ff' } }));
    if (report.brokenCount > 0) badges.appendChild(el('span', { className: 'impact-badge broken', textContent: report.brokenCount + ' broken' }));
    if (report.affectedCount > 0) badges.appendChild(el('span', { className: 'impact-badge affected', textContent: report.affectedCount + ' affected' }));
    badges.appendChild(el('span', { className: 'impact-badge safe', textContent: report.safeCount + ' safe' }));
    container.appendChild(badges);

    // Diff summary
    if (report.diff) {
      container.appendChild(el('div', { className: 'schema-fetched-at', textContent: report.diff.summary }));
    }

    // Entries
    report.entries.forEach(function(entry) {
      if (entry.status === 'safe') return;
      var item = el('div', { className: 'impact-item ' + entry.status });
      var nameRow = el('div', { className: 'impact-item-header' });
      nameRow.appendChild(el('span', { className: 'impact-status-dot ' + entry.status }));
      nameRow.appendChild(el('span', { className: 'impact-name', textContent: entry.requestName }));
      nameRow.appendChild(el('span', { className: 'impact-location', textContent: entry.collectionName + ' / ' + entry.folderName }));
      item.appendChild(nameRow);

      if (entry.brokenFields.length > 0) {
        var details = el('div', { className: 'impact-details' });
        entry.brokenFields.forEach(function(f) {
          var detail = el('div', { className: 'impact-field-change' });
          detail.appendChild(el('span', { textContent: f.typeName + '.' + f.fieldName }));
          if (f.changeType === 'renamed' && f.suggestedReplacement) {
            detail.appendChild(el('span', { className: 'impact-arrow', textContent: ' \u2192 ' + f.suggestedReplacement }));
          } else {
            detail.appendChild(el('span', { className: 'impact-change-type', textContent: ' (' + f.changeType + ')' }));
          }
          details.appendChild(detail);
        });
        item.appendChild(details);
      }
      container.appendChild(item);
    });

    // Pre-heal button
    var fixableEntries = report.entries.filter(function(e) { return e.autoFixAvailable; });
    if (fixableEntries.length > 0) {
      container.appendChild(el('button', {
        className: 'btn btn-primary', textContent: 'Pre-Heal All (' + fixableEntries.length + ')',
        style: { marginTop: '8px' },
        onClick: function() {
          var healEntries = fixableEntries.map(function(entry) {
            var fixes = [];
            entry.brokenFields.forEach(function(f) {
              if (f.changeType === 'renamed' && f.suggestedReplacement && f.confidence > 0.7) {
                fixes.push({ oldField: f.fieldName, newField: f.suggestedReplacement, lineNumber: 0 });
              } else if (f.changeType === 'removed') {
                fixes.push({ oldField: f.fieldName, newField: '', lineNumber: 0 });
              }
            });
            return { requestId: entry.requestId, collectionId: '', folderId: '', fixes: fixes };
          });
          vscode.postMessage({ type: 'preHealAll', payload: { entries: healEntries } });
        },
      }));
    }
  }

  function showSchemaPreviewError(error) {
    var container = schemaPreviewOverlay ? schemaPreviewOverlay.querySelector('#schema-preview-result') : null;
    if (!container) return;
    container.innerHTML = '';
    container.appendChild(el('div', { className: 'schema-error', textContent: error }));
  }

  // ── NL Helpers ──
  var NL_CONNECTING_WORDS = ['of', 'all', 'the', 'a', 'an', 'some', 'my'];
  function stripConnectingWords(text) {
    return text.split(/\s+/).filter(function(w) {
      return NL_CONNECTING_WORDS.indexOf(w.toLowerCase()) === -1;
    }).join(' ');
  }

  // ── Toast ──
  function showToast(message) {
    var existing = document.querySelector('.sidebar-toast');
    if (existing) existing.remove();
    var toast = el('div', { className: 'sidebar-toast', textContent: message });
    document.body.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 2500);
  }

  init();
})();
