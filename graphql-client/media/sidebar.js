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
    collectionsVisible: true,
    schemaHeight: 200,
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
      case 'importedCollections':
        state.collections = [...state.collections, ...msg.payload];
        msg.payload.forEach(col => { state.expandedCollections[col.id] = true; });
        saveState();
        vscode.postMessage({ type: 'saveCollections', payload: state.collections });
        renderTree();
        break;
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
          },
        });
        break;
    }
  });

  // ── Init ──
  function init() {
    buildLayout();
    vscode.postMessage({ type: 'loadCollections' });
    vscode.postMessage({ type: 'loadEnvironments' });
    vscode.postMessage({ type: 'loadSchema' });
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

    // Tree container
    const tree = el('div', { className: 'tree' + (state.collectionsVisible ? '' : ' hidden'), id: 'tree' });
    app.appendChild(tree);

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
    if (!query) return collections;
    return collections.map(col => ({
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
    showModal('New Collection', 'Create a new GraphQL collection', [
      { id: 'name', label: 'Collection Name', placeholder: 'e.g. My API' },
      { id: 'folderName', label: 'Initial Folder (optional)', placeholder: 'e.g. Users' },
    ], values => {
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

  function triggerIntrospect() {
    const env = getActiveEnvironment();
    if (!env) {
      state.schemaError = 'No active environment configured';
      saveState();
      renderSchemaExplorer();
      return;
    }
    if (!env.endpoint) {
      state.schemaError = 'No endpoint configured. Set an endpoint URL in the editor first.';
      saveState();
      renderSchemaExplorer();
      return;
    }
    vscode.postMessage({
      type: 'introspectSchema',
      payload: { endpoint: env.endpoint, headers: env.headers || {} },
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
    actions.appendChild(el('button', {
      className: 'btn-icon',
      title: 'Introspect Schema',
      textContent: '\u21BB',
      onClick: e => { e.stopPropagation(); triggerIntrospect(); },
    }));
    toolbar.appendChild(actions);
    container.appendChild(toolbar);

    if (!state.schemaExpanded) return;

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
    const expanded = state[expandKey] !== false;
    const header = el('div', {
      className: 'schema-section-header',
      onClick: () => { state[expandKey] = !expanded; saveState(); renderSchemaExplorer(); },
    });
    header.appendChild(el('span', { className: 'tree-icon', textContent: expanded ? '▾' : '▸' }));
    header.appendChild(el('span', { textContent: title + ' (' + fields.length + ')' }));
    container.appendChild(header);

    if (!expanded) return;

    fields.forEach(field => {
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

  init();
})();
