(function() {
  'use strict';

  const STORAGE_KEY = 'figma_dom_editor_layout';
  const CANVAS_W = 1200;
  const CANVAS_H = 800;
  const MIN_W = 40;
  const MIN_H = 30;
  const MOVE_STEP = 5;

  const PALETTE = ['#0d99ff', '#18a058', '#ffb800', '#f24822', '#9747ff', '#ff6b9d', '#14b8a6', '#ff7f50'];
  const TOOL_ICONS = {
    rect: '□', circle: '○', ellipse: '⬭', diamond: '◇', 
    crescent: '☽', image: '🖼', freedraw: '✎', text: 'T'
  };
  const TOOL_LABELS = {
    rect: 'Rectangle', circle: 'Circle', ellipse: 'Ellipse', diamond: 'Diamond',
    crescent: 'Crescent', image: 'Image', freedraw: 'Free Drawing', text: 'Text'
  };

  const state = {
    elements: [],
    selectedIds: new Set(),
    counter: 0,
    activeTool: 'rect',
    freedrawColor: '#ffffff',
    freedrawSize: 5
  };

  let dragging = false;
  let resizing = false;
  let freedrawing = false;
  let startX = 0, startY = 0;
  let elStartX = 0, elStartY = 0;
  let elStartW = 0, elStartH = 0;
  let handle = '';
  let currentStroke = null;
  let currentStrokeEl = null;

  let canvas, layersList, layersEmpty, propsContent, propsEmpty, selectionInfo, toast;
  let shapeDropdownMenu, selectSameMenu, replaceBtn, lockBtn;
  let imageFileInput, replaceModal, replaceTextarea;
  let pendingImageCallback = null;

  function init() {
    canvas = document.getElementById('canvas');
    layersList = document.getElementById('layersList');
    layersEmpty = document.getElementById('layersEmpty');
    propsContent = document.getElementById('propsContent');
    propsEmpty = document.getElementById('propsEmpty');
    selectionInfo = document.getElementById('selectionInfo');
    toast = document.getElementById('toast');
    shapeDropdownMenu = document.getElementById('shapeDropdownMenu');
    selectSameMenu = document.getElementById('selectSameMenu');
    replaceBtn = document.getElementById('replaceBtn');
    lockBtn = document.getElementById('lockBtn');
    imageFileInput = document.getElementById('imageFileInput');
    replaceModal = document.getElementById('replaceModal');
    replaceTextarea = document.getElementById('replaceTextarea');

    if (!canvas) {
      console.error('Canvas element not found');
      return;
    }

    const shapeToolBtn = document.getElementById('shapeToolBtn');
    const selectSameBtn = document.getElementById('selectSameBtn');
    const addTextBtn = document.getElementById('addText');
    const saveBtn = document.getElementById('saveBtn');
    const loadBtn = document.getElementById('loadBtn');
    const clearBtn = document.getElementById('clearBtn');
    const exportJsonBtn = document.getElementById('exportJsonBtn');
    const exportHtmlBtn = document.getElementById('exportHtmlBtn');
    const moveUpBtn = document.getElementById('moveUpBtn');
    const moveDownBtn = document.getElementById('moveDownBtn');
    const replaceModalClose = document.getElementById('replaceModalClose');
    const replaceModalCancel = document.getElementById('replaceModalCancel');
    const replaceModalOk = document.getElementById('replaceModalOk');

    if (shapeToolBtn) shapeToolBtn.addEventListener('click', toggleShapeDropdown);
    if (selectSameBtn) selectSameBtn.addEventListener('click', toggleSelectSameDropdown);
    
    if (shapeDropdownMenu) {
      shapeDropdownMenu.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => selectTool(item.dataset.tool));
      });
    }

    if (selectSameMenu) {
      selectSameMenu.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => handleSelectSame(item.dataset.select));
      });
    }

    if (addTextBtn) addTextBtn.addEventListener('click', () => addElement('text'));
    if (saveBtn) saveBtn.addEventListener('click', saveToStorage);
    if (loadBtn) loadBtn.addEventListener('click', loadFromStorage);
    if (clearBtn) clearBtn.addEventListener('click', clearAll);
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', exportJSON);
    if (exportHtmlBtn) exportHtmlBtn.addEventListener('click', exportHTML);
    if (moveUpBtn) moveUpBtn.addEventListener('click', moveUp);
    if (moveDownBtn) moveDownBtn.addEventListener('click', moveDown);
    
    if (replaceBtn) replaceBtn.addEventListener('click', handleReplace);
    if (lockBtn) lockBtn.addEventListener('click', handleLock);

    if (imageFileInput) imageFileInput.addEventListener('change', handleImageUpload);

    if (replaceModalClose) replaceModalClose.addEventListener('click', closeReplaceModal);
    if (replaceModalCancel) replaceModalCancel.addEventListener('click', closeReplaceModal);
    if (replaceModalOk) replaceModalOk.addEventListener('click', confirmReplaceText);
    if (replaceModal) {
      const backdrop = replaceModal.querySelector('.modal-backdrop');
      if (backdrop) backdrop.addEventListener('click', closeReplaceModal);
    }

    canvas.addEventListener('mousedown', onCanvasDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', closeDropdownsOnClickOutside);

    loadFromStorage();
    updateToolUI();
  }

  function toggleShapeDropdown(e) {
    e.stopPropagation();
    if (shapeDropdownMenu) shapeDropdownMenu.classList.toggle('open');
    if (selectSameMenu) selectSameMenu.classList.remove('open');
  }

  function toggleSelectSameDropdown(e) {
    e.stopPropagation();
    if (selectSameMenu) selectSameMenu.classList.toggle('open');
    if (shapeDropdownMenu) shapeDropdownMenu.classList.remove('open');
  }

  function closeDropdownsOnClickOutside(e) {
    if (shapeDropdownMenu && !e.target.closest('#shapeToolDropdown')) {
      shapeDropdownMenu.classList.remove('open');
    }
    if (selectSameMenu && !e.target.closest('#selectSameDropdown')) {
      selectSameMenu.classList.remove('open');
    }
  }

  function selectTool(tool) {
    state.activeTool = tool;
    if (shapeDropdownMenu) shapeDropdownMenu.classList.remove('open');
    updateToolUI();
    
    if (tool === 'freedraw') {
      if (canvas) canvas.classList.add('freedraw-mode');
    } else {
      if (canvas) canvas.classList.remove('freedraw-mode');
      addElement(tool);
    }
  }

  function updateToolUI() {
    const iconEl = document.getElementById('shapeToolIcon');
    const labelEl = document.getElementById('shapeToolLabel');
    if (iconEl) iconEl.textContent = TOOL_ICONS[state.activeTool] || '□';
    if (labelEl) labelEl.textContent = TOOL_LABELS[state.activeTool] || 'Shape';
    
    if (shapeDropdownMenu) {
      shapeDropdownMenu.querySelectorAll('.dropdown-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tool === state.activeTool);
      });
    }
  }

  function createElementObj(type) {
    state.counter++;
    const id = 'el_' + state.counter;
    const offset = (state.elements.length % 8) * 25;
    const color = PALETTE[state.elements.length % PALETTE.length];

    const defaults = {
      rect: { w: 160, h: 110 },
      circle: { w: 120, h: 120 },
      ellipse: { w: 160, h: 100 },
      diamond: { w: 120, h: 120 },
      crescent: { w: 120, h: 120 },
      image: { w: 200, h: 150 },
      text: { w: 200, h: 50 },
      freedraw: { w: 0, h: 0 }
    };

    const size = defaults[type] || { w: 120, h: 80 };

    return {
      id,
      type,
      x: 60 + offset,
      y: 60 + offset,
      width: size.w,
      height: size.h,
      rotation: 0,
      zIndex: state.elements.length + 1,
      styles: { background: type === 'text' ? 'transparent' : color },
      text: type === 'text' ? 'Double click to edit' : '',
      locked: false,
      imageSrc: '',
      drawPoints: [],
      drawColor: state.freedrawColor,
      drawSize: state.freedrawSize
    };
  }

  function addElement(type) {
    if (type === 'freedraw') return;
    
    const obj = createElementObj(type);
    state.elements.push(obj);
    renderElement(obj);
    rebuildLayers();
    selectElement(obj.id, false);
    autoSave();
  }

  function renderElement(obj) {
    const el = document.createElement('div');
    el.id = obj.id;
    el.className = 'design-el ' + obj.type + (obj.type === 'image' ? ' image-el' : '');
    if (obj.locked) el.classList.add('locked');

    applyStyles(el, obj);
    renderElementContent(el, obj);

    ['nw', 'ne', 'sw', 'se'].forEach(pos => {
      const h = document.createElement('div');
      h.className = 'resize-handle ' + pos;
      h.dataset.action = 'resize';
      h.dataset.handle = pos;
      el.appendChild(h);
    });

    const lockInd = document.createElement('div');
    lockInd.className = 'lock-indicator';
    lockInd.textContent = '🔒';
    el.appendChild(lockInd);

    if (canvas) canvas.appendChild(el);
  }

  function renderElementContent(el, obj) {
    el.querySelectorAll('.shape-inner, .text-content, img, .image-placeholder, .draw-dot').forEach(c => c.remove());

    switch (obj.type) {
      case 'rect':
      case 'circle':
      case 'ellipse':
        const inner = document.createElement('div');
        inner.className = 'shape-inner';
        inner.style.background = obj.styles.background;
        el.insertBefore(inner, el.firstChild);
        break;

      case 'diamond':
        const dInner = document.createElement('div');
        dInner.className = 'shape-inner';
        dInner.style.background = obj.styles.background;
        el.insertBefore(dInner, el.firstChild);
        break;

      case 'crescent':
        const cInner = document.createElement('div');
        cInner.className = 'shape-inner';
        cInner.style.background = obj.styles.background;
        const mask = document.createElement('div');
        mask.className = 'crescent-mask';
        cInner.appendChild(mask);
        el.insertBefore(cInner, el.firstChild);
        break;

      case 'image':
        if (obj.imageSrc) {
          const img = document.createElement('img');
          img.src = obj.imageSrc;
          img.alt = 'Image';
          el.insertBefore(img, el.firstChild);
        } else {
          const placeholder = document.createElement('div');
          placeholder.className = 'image-placeholder';
          placeholder.textContent = 'Click to upload image';
          el.insertBefore(placeholder, el.firstChild);
        }
        break;

      case 'text':
        const span = document.createElement('span');
        span.className = 'text-content';
        span.textContent = obj.text;
        el.insertBefore(span, el.firstChild);
        el.addEventListener('dblclick', onTextDblClick);
        break;

      case 'freedraw':
        obj.drawPoints.forEach(pt => {
          const dot = document.createElement('div');
          dot.className = 'draw-dot';
          dot.style.left = pt.x + 'px';
          dot.style.top = pt.y + 'px';
          dot.style.width = obj.drawSize + 'px';
          dot.style.height = obj.drawSize + 'px';
          dot.style.background = obj.drawColor;
          el.appendChild(dot);
        });
        break;
    }
  }

  function applyStyles(el, obj) {
    el.style.left = obj.x + 'px';
    el.style.top = obj.y + 'px';
    el.style.width = obj.width + 'px';
    el.style.height = obj.height + 'px';
    el.style.zIndex = obj.zIndex;
    el.style.transform = 'rotate(' + obj.rotation + 'deg)';
  }

  function updateElementDOM(obj) {
    const el = document.getElementById(obj.id);
    if (!el) return;
    
    applyStyles(el, obj);
    el.classList.toggle('locked', obj.locked);

    const inner = el.querySelector('.shape-inner');
    if (inner && obj.styles.background) {
      inner.style.background = obj.styles.background;
    }

    if (obj.type === 'text') {
      const span = el.querySelector('.text-content');
      if (span) span.textContent = obj.text;
    }

    if (obj.type === 'image') {
      const img = el.querySelector('img');
      const placeholder = el.querySelector('.image-placeholder');
      if (obj.imageSrc) {
        if (placeholder) placeholder.remove();
        if (!img) {
          const newImg = document.createElement('img');
          newImg.src = obj.imageSrc;
          newImg.alt = 'Image';
          el.insertBefore(newImg, el.querySelector('.resize-handle'));
        } else {
          img.src = obj.imageSrc;
        }
      }
    }

    if (obj.type === 'freedraw') {
      renderElementContent(el, obj);
    }
  }

  function renderAll() {
    if (canvas) canvas.querySelectorAll('.design-el').forEach(el => el.remove());
    state.elements.forEach(obj => renderElement(obj));
    state.selectedIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add(state.selectedIds.size > 1 ? 'multi-selected' : 'selected');
    });
  }

  function selectElement(id, addToSelection) {
    if (!addToSelection) {
      state.selectedIds.forEach(sid => {
        const prev = document.getElementById(sid);
        if (prev) prev.classList.remove('selected', 'multi-selected');
      });
      state.selectedIds.clear();
    }

    if (id) {
      state.selectedIds.add(id);
      const el = document.getElementById(id);
      if (el) el.classList.add(state.selectedIds.size > 1 ? 'multi-selected' : 'selected');
    }

    if (state.selectedIds.size > 1) {
      state.selectedIds.forEach(sid => {
        const el = document.getElementById(sid);
        if (el) {
          el.classList.remove('selected');
          el.classList.add('multi-selected');
        }
      });
    }

    updateSelectionInfo();
    updatePropertiesUI();
    rebuildLayers();
    updateToolbarButtons();
  }

  function deselect() {
    state.selectedIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('selected', 'multi-selected');
    });
    state.selectedIds.clear();
    updateSelectionInfo();
    updatePropertiesUI();
    rebuildLayers();
    updateToolbarButtons();
  }

  function updateSelectionInfo() {
    if (!selectionInfo) return;
    if (state.selectedIds.size === 0) {
      selectionInfo.textContent = 'No selection';
    } else if (state.selectedIds.size === 1) {
      const obj = getObj([...state.selectedIds][0]);
      selectionInfo.textContent = obj ? (TOOL_LABELS[obj.type] || obj.type) + ' selected' : 'Selected';
    } else {
      selectionInfo.textContent = state.selectedIds.size + ' elements selected';
    }
  }

  function updateToolbarButtons() {
    const hasSelection = state.selectedIds.size > 0;
    const singleSelection = state.selectedIds.size === 1;
    
    if (singleSelection) {
      const obj = getObj([...state.selectedIds][0]);
      const canReplace = obj && (obj.type === 'text' || obj.type === 'image') && !obj.locked;
      if (replaceBtn) replaceBtn.disabled = !canReplace;
      if (lockBtn) {
        const icon = lockBtn.querySelector('.btn-icon');
        if (icon) icon.textContent = obj && obj.locked ? '🔒' : '🔓';
      }
    } else {
      if (replaceBtn) replaceBtn.disabled = true;
      if (lockBtn) {
        const icon = lockBtn.querySelector('.btn-icon');
        if (icon) icon.textContent = '🔓';
      }
    }
    
    if (lockBtn) lockBtn.disabled = !hasSelection;
  }

  function getObj(id) {
    return state.elements.find(e => e.id === id);
  }

  function getPrimarySelection() {
    if (state.selectedIds.size === 0) return null;
    return getObj([...state.selectedIds][0]);
  }

  function removeSelectedElements() {
    const ids = [...state.selectedIds];
    ids.forEach(id => {
      const idx = state.elements.findIndex(e => e.id === id);
      if (idx !== -1) {
        state.elements.splice(idx, 1);
        const el = document.getElementById(id);
        if (el) el.remove();
      }
    });
    state.selectedIds.clear();
    rebuildLayers();
    updatePropertiesUI();
    updateSelectionInfo();
    updateToolbarButtons();
    autoSave();
  }

  function onCanvasDown(e) {
    const target = e.target;

    if (target === canvas) {
      if (state.activeTool === 'freedraw') {
        startFreeDraw(e);
      } else {
        deselect();
      }
      return;
    }

    const action = target.dataset.action;

    if (action === 'resize') {
      const obj = getPrimarySelection();
      if (obj && !obj.locked) {
        resizing = true;
        handle = target.dataset.handle;
        startX = e.clientX;
        startY = e.clientY;
        elStartX = obj.x;
        elStartY = obj.y;
        elStartW = obj.width;
        elStartH = obj.height;
      }
      e.preventDefault();
      return;
    }

    const designEl = target.closest('.design-el');
    if (designEl) {
      const obj = getObj(designEl.id);
      
      if (obj && obj.type === 'image' && !obj.imageSrc && !obj.locked) {
        pendingImageCallback = (dataUrl) => {
          obj.imageSrc = dataUrl;
          updateElementDOM(obj);
          autoSave();
        };
        if (imageFileInput) imageFileInput.click();
        return;
      }

      const isAlreadySelected = state.selectedIds.has(designEl.id);
      
      if (e.shiftKey) {
        if (isAlreadySelected) {
          state.selectedIds.delete(designEl.id);
          designEl.classList.remove('selected', 'multi-selected');
        } else {
          selectElement(designEl.id, true);
        }
      } else if (!isAlreadySelected) {
        selectElement(designEl.id, false);
      }

      if (obj && !obj.locked && state.selectedIds.has(designEl.id)) {
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        
        state.selectedIds.forEach(id => {
          const o = getObj(id);
          if (o) {
            o._startX = o.x;
            o._startY = o.y;
          }
        });
      }
      e.preventDefault();
    }
  }

  function startFreeDraw(e) {
    if (!canvas) return;
    freedrawing = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    state.counter++;
    const id = 'el_' + state.counter;
    
    currentStroke = {
      id,
      type: 'freedraw',
      x: 0,
      y: 0,
      width: CANVAS_W,
      height: CANVAS_H,
      rotation: 0,
      zIndex: state.elements.length + 1,
      styles: { background: 'transparent' },
      text: '',
      locked: false,
      imageSrc: '',
      drawPoints: [{ x, y }],
      drawColor: state.freedrawColor,
      drawSize: state.freedrawSize
    };

    currentStrokeEl = document.createElement('div');
    currentStrokeEl.id = id;
    currentStrokeEl.className = 'design-el freedraw';
    currentStrokeEl.style.left = '0px';
    currentStrokeEl.style.top = '0px';
    currentStrokeEl.style.width = CANVAS_W + 'px';
    currentStrokeEl.style.height = CANVAS_H + 'px';
    currentStrokeEl.style.zIndex = currentStroke.zIndex;
    canvas.appendChild(currentStrokeEl);

    addDot(currentStrokeEl, x, y);
  }

  function addDot(container, x, y) {
    const dot = document.createElement('div');
    dot.className = 'draw-dot';
    dot.style.left = x + 'px';
    dot.style.top = y + 'px';
    dot.style.width = state.freedrawSize + 'px';
    dot.style.height = state.freedrawSize + 'px';
    dot.style.background = state.freedrawColor;
    container.appendChild(dot);
  }

  function onMouseMove(e) {
    if (freedrawing && currentStroke && currentStrokeEl && canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(CANVAS_W, e.clientX - rect.left));
      const y = Math.max(0, Math.min(CANVAS_H, e.clientY - rect.top));
      
      const last = currentStroke.drawPoints[currentStroke.drawPoints.length - 1];
      const dist = Math.sqrt((x - last.x) ** 2 + (y - last.y) ** 2);
      
      if (dist > 2) {
        currentStroke.drawPoints.push({ x, y });
        addDot(currentStrokeEl, x, y);
      }
      return;
    }

    if (dragging && state.selectedIds.size > 0) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      state.selectedIds.forEach(id => {
        const obj = getObj(id);
        if (!obj || obj.locked) return;

        let nx = (obj._startX || 0) + dx;
        let ny = (obj._startY || 0) + dy;

        nx = Math.max(0, Math.min(CANVAS_W - obj.width, nx));
        ny = Math.max(0, Math.min(CANVAS_H - obj.height, ny));

        obj.x = nx;
        obj.y = ny;
        updateElementDOM(obj);
      });
      return;
    }

    if (resizing && state.selectedIds.size === 1) {
      const obj = getPrimarySelection();
      if (!obj || obj.locked) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let nx = obj.x, ny = obj.y, nw = obj.width, nh = obj.height;

      const maintainAspect = obj.type === 'circle';

      if (handle.includes('e')) {
        nw = Math.max(MIN_W, elStartW + dx);
      }
      if (handle.includes('w')) {
        const pw = elStartW - dx;
        if (pw >= MIN_W) {
          nw = pw;
          nx = elStartX + dx;
        }
      }
      if (handle.includes('s')) {
        nh = Math.max(MIN_H, elStartH + dy);
      }
      if (handle.includes('n')) {
        const ph = elStartH - dy;
        if (ph >= MIN_H) {
          nh = ph;
          ny = elStartY + dy;
        }
      }

      if (maintainAspect) {
        const size = Math.max(nw, nh);
        nw = size;
        nh = size;
      }

      nx = Math.max(0, nx);
      ny = Math.max(0, ny);
      nw = Math.min(nw, CANVAS_W - nx);
      nh = Math.min(nh, CANVAS_H - ny);

      obj.x = nx;
      obj.y = ny;
      obj.width = nw;
      obj.height = nh;
      updateElementDOM(obj);
      updatePropertiesUI();
    }
  }

  function onMouseUp() {
    if (freedrawing && currentStroke) {
      if (currentStroke.drawPoints.length > 1) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        currentStroke.drawPoints.forEach(pt => {
          minX = Math.min(minX, pt.x);
          minY = Math.min(minY, pt.y);
          maxX = Math.max(maxX, pt.x);
          maxY = Math.max(maxY, pt.y);
        });

        const padding = currentStroke.drawSize;
        currentStroke.x = minX - padding;
        currentStroke.y = minY - padding;
        currentStroke.width = maxX - minX + padding * 2;
        currentStroke.height = maxY - minY + padding * 2;

        currentStroke.drawPoints = currentStroke.drawPoints.map(pt => ({
          x: pt.x - currentStroke.x,
          y: pt.y - currentStroke.y
        }));

        state.elements.push(currentStroke);
        
        if (currentStrokeEl) currentStrokeEl.remove();
        renderElement(currentStroke);
        rebuildLayers();
        selectElement(currentStroke.id, false);
        autoSave();
      } else {
        if (currentStrokeEl) currentStrokeEl.remove();
      }
      
      currentStroke = null;
      currentStrokeEl = null;
      freedrawing = false;
      return;
    }

    if (dragging || resizing) {
      autoSave();
    }
    dragging = false;
    resizing = false;
  }

  function onKeyDown(e) {
    const tag = document.activeElement.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || document.activeElement.isContentEditable) {
      return;
    }

    if (state.selectedIds.size === 0) return;

    const unlockedIds = [...state.selectedIds].filter(id => {
      const obj = getObj(id);
      return obj && !obj.locked;
    });

    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        removeSelectedElements();
        e.preventDefault();
        break;
      case 'ArrowUp':
        unlockedIds.forEach(id => {
          const obj = getObj(id);
          if (obj) {
            obj.y = Math.max(0, obj.y - MOVE_STEP);
            updateElementDOM(obj);
          }
        });
        autoSave();
        e.preventDefault();
        break;
      case 'ArrowDown':
        unlockedIds.forEach(id => {
          const obj = getObj(id);
          if (obj) {
            obj.y = Math.min(CANVAS_H - obj.height, obj.y + MOVE_STEP);
            updateElementDOM(obj);
          }
        });
        autoSave();
        e.preventDefault();
        break;
      case 'ArrowLeft':
        unlockedIds.forEach(id => {
          const obj = getObj(id);
          if (obj) {
            obj.x = Math.max(0, obj.x - MOVE_STEP);
            updateElementDOM(obj);
          }
        });
        autoSave();
        e.preventDefault();
        break;
      case 'ArrowRight':
        unlockedIds.forEach(id => {
          const obj = getObj(id);
          if (obj) {
            obj.x = Math.min(CANVAS_W - obj.width, obj.x + MOVE_STEP);
            updateElementDOM(obj);
          }
        });
        autoSave();
        e.preventDefault();
        break;
    }
  }

  function onTextDblClick(e) {
    const el = e.currentTarget;
    const obj = getObj(el.id);
    if (!obj || obj.type !== 'text' || obj.locked) return;

    const span = el.querySelector('.text-content');
    if (!span) return;

    span.contentEditable = true;
    span.focus();

    const range = document.createRange();
    range.selectNodeContents(span);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    function onBlur() {
      span.contentEditable = false;
      obj.text = span.textContent.trim() || 'Double click to edit';
      updatePropertiesUI();
      autoSave();
      span.removeEventListener('blur', onBlur);
    }

    span.addEventListener('blur', onBlur);
    span.addEventListener('keydown', function onEnter(ke) {
      if (ke.key === 'Enter' && !ke.shiftKey) {
        ke.preventDefault();
        span.blur();
      }
    });
  }

  function handleReplace() {
    if (state.selectedIds.size !== 1) return;
    const obj = getPrimarySelection();
    if (!obj || obj.locked) return;

    if (obj.type === 'text') {
      if (replaceTextarea) replaceTextarea.value = obj.text;
      if (replaceModal) replaceModal.classList.remove('hidden');
      if (replaceTextarea) replaceTextarea.focus();
    } else if (obj.type === 'image') {
      pendingImageCallback = (dataUrl) => {
        obj.imageSrc = dataUrl;
        updateElementDOM(obj);
        autoSave();
        showToast('Image replaced', 'success');
      };
      if (imageFileInput) imageFileInput.click();
    }
  }

  function closeReplaceModal() {
    if (replaceModal) replaceModal.classList.add('hidden');
  }

  function confirmReplaceText() {
    const obj = getPrimarySelection();
    if (obj && obj.type === 'text') {
      obj.text = (replaceTextarea ? replaceTextarea.value : '') || 'Double click to edit';
      updateElementDOM(obj);
      updatePropertiesUI();
      autoSave();
      showToast('Text replaced', 'success');
    }
    closeReplaceModal();
  }

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(ev) {
      if (pendingImageCallback) {
        pendingImageCallback(ev.target.result);
        pendingImageCallback = null;
      }
    };
    reader.readAsDataURL(file);
    if (imageFileInput) imageFileInput.value = '';
  }

  function handleLock() {
    state.selectedIds.forEach(id => {
      const obj = getObj(id);
      if (obj) {
        obj.locked = !obj.locked;
        updateElementDOM(obj);
      }
    });
    rebuildLayers();
    updatePropertiesUI();
    updateToolbarButtons();
    autoSave();
  }

  function handleSelectSame(mode) {
    if (selectSameMenu) selectSameMenu.classList.remove('open');
    
    if (state.selectedIds.size === 0) {
      showToast('Select an element first', 'error');
      return;
    }

    const primary = getPrimarySelection();
    if (!primary) return;

    if (mode === 'type') {
      const targetType = primary.type;
      state.elements.forEach(obj => {
        if (obj.type === targetType) {
          state.selectedIds.add(obj.id);
        }
      });
    } else if (mode === 'fill') {
      const targetFill = primary.styles.background;
      state.elements.forEach(obj => {
        if (obj.styles.background === targetFill) {
          state.selectedIds.add(obj.id);
        }
      });
    }

    state.selectedIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('selected');
        el.classList.add('multi-selected');
      }
    });

    updateSelectionInfo();
    updatePropertiesUI();
    rebuildLayers();
    showToast(state.selectedIds.size + ' elements selected', 'success');
  }

  function updatePropertiesUI() {
    if (!propsContent || !propsEmpty) return;
    
    if (state.selectedIds.size === 0) {
      propsContent.innerHTML = '';
      propsEmpty.classList.remove('hidden');
      return;
    }

    propsEmpty.classList.add('hidden');

    if (state.selectedIds.size > 1) {
      renderMultiSelectProps();
      return;
    }

    const obj = getPrimarySelection();
    if (!obj) {
      propsContent.innerHTML = '';
      propsEmpty.classList.remove('hidden');
      return;
    }

    if (obj.locked) {
      propsContent.innerHTML = '<div class="props-info">🔒 Element is locked</div><div class="props-section"><div class="props-section-title">Info</div><div class="props-row"><div class="props-field"><span class="props-label">Type</span><span style="color:var(--text)">' + (TOOL_LABELS[obj.type] || obj.type) + '</span></div></div></div>';
      return;
    }

    let html = '<div class="props-section"><div class="props-section-title">Position</div><div class="props-row"><div class="props-field"><label class="props-label">X</label><input type="number" class="props-input" id="propX" value="' + Math.round(obj.x) + '"></div><div class="props-field"><label class="props-label">Y</label><input type="number" class="props-input" id="propY" value="' + Math.round(obj.y) + '"></div></div></div>';
    
    html += '<div class="props-section"><div class="props-section-title">Size</div><div class="props-row"><div class="props-field"><label class="props-label">Width</label><input type="number" class="props-input" id="propW" value="' + obj.width + '" min="' + MIN_W + '"></div><div class="props-field"><label class="props-label">Height</label><input type="number" class="props-input" id="propH" value="' + obj.height + '" min="' + MIN_H + '"></div></div></div>';
    
    html += '<div class="props-section"><div class="props-section-title">Transform</div><div class="props-field"><label class="props-label">Rotation (°)</label><input type="number" class="props-input" id="propRot" value="' + obj.rotation + '" min="0" max="360"></div></div>';

    if (obj.type !== 'image' && obj.type !== 'freedraw') {
      html += '<div class="props-section"><div class="props-section-title">Fill</div><div class="props-field"><label class="props-label">Background</label><input type="color" class="props-input" id="propBg" value="' + (obj.styles.background || '#0d99ff') + '"></div></div>';
    }

    if (obj.type === 'text') {
      html += '<div class="props-section"><div class="props-section-title">Content</div><div class="props-field"><label class="props-label">Text</label><textarea class="props-input" id="propText" rows="3">' + obj.text + '</textarea></div></div>';
    }

    if (obj.type === 'freedraw') {
      html += '<div class="props-section"><div class="props-section-title">Stroke</div><div class="props-row"><div class="props-field"><label class="props-label">Color</label><input type="color" class="props-input" id="propDrawColor" value="' + obj.drawColor + '"></div><div class="props-field"><label class="props-label">Size</label><input type="number" class="props-input" id="propDrawSize" value="' + obj.drawSize + '" min="1" max="50"></div></div></div>';
    }

    propsContent.innerHTML = html;
    bindPropsHandlers(obj);
  }

  function renderMultiSelectProps() {
    const count = state.selectedIds.size;
    
    propsContent.innerHTML = '<div class="props-info">' + count + ' elements selected</div><div class="props-section"><div class="props-section-title">Shared Properties</div><div class="props-field"><label class="props-label">Background</label><input type="color" class="props-input" id="propBgMulti" value="#0d99ff"></div><div class="props-field" style="margin-top:10px"><label class="props-label">Rotation (°)</label><input type="number" class="props-input" id="propRotMulti" value="0" min="0" max="360"></div></div>';

    const bgMulti = document.getElementById('propBgMulti');
    const rotMulti = document.getElementById('propRotMulti');

    if (bgMulti) {
      bgMulti.addEventListener('input', function(e) {
        state.selectedIds.forEach(id => {
          const obj = getObj(id);
          if (obj && !obj.locked && obj.type !== 'image' && obj.type !== 'freedraw') {
            obj.styles.background = e.target.value;
            updateElementDOM(obj);
          }
        });
        autoSave();
      });
    }

    if (rotMulti) {
      rotMulti.addEventListener('change', function(e) {
        const val = parseInt(e.target.value) || 0;
        state.selectedIds.forEach(id => {
          const obj = getObj(id);
          if (obj && !obj.locked) {
            obj.rotation = Math.max(0, Math.min(360, val));
            updateElementDOM(obj);
          }
        });
        autoSave();
      });
    }
  }

  function bindPropsHandlers(obj) {
    const propX = document.getElementById('propX');
    const propY = document.getElementById('propY');
    const propW = document.getElementById('propW');
    const propH = document.getElementById('propH');
    const propRot = document.getElementById('propRot');
    const propBg = document.getElementById('propBg');
    const propText = document.getElementById('propText');
    const propDrawColor = document.getElementById('propDrawColor');
    const propDrawSize = document.getElementById('propDrawSize');

    if (propX) propX.addEventListener('change', function(e) {
      applyPropertyChange(obj, 'x', parseInt(e.target.value) || 0);
    });

    if (propY) propY.addEventListener('change', function(e) {
      applyPropertyChange(obj, 'y', parseInt(e.target.value) || 0);
    });

    if (propW) propW.addEventListener('change', function(e) {
      applyPropertyChange(obj, 'width', Math.max(MIN_W, parseInt(e.target.value) || MIN_W));
    });

    if (propH) propH.addEventListener('change', function(e) {
      applyPropertyChange(obj, 'height', Math.max(MIN_H, parseInt(e.target.value) || MIN_H));
    });

    if (propRot) propRot.addEventListener('change', function(e) {
      let v = parseInt(e.target.value) || 0;
      v = Math.max(0, Math.min(360, v));
      applyPropertyChange(obj, 'rotation', v);
    });

    if (propBg) propBg.addEventListener('input', function(e) {
      obj.styles.background = e.target.value;
      updateElementDOM(obj);
      autoSave();
    });

    if (propText) propText.addEventListener('input', function(e) {
      obj.text = e.target.value || 'Double click to edit';
      updateElementDOM(obj);
      autoSave();
    });

    if (propDrawColor) propDrawColor.addEventListener('input', function(e) {
      obj.drawColor = e.target.value;
      updateElementDOM(obj);
      autoSave();
    });

    if (propDrawSize) propDrawSize.addEventListener('change', function(e) {
      obj.drawSize = Math.max(1, Math.min(50, parseInt(e.target.value) || 5));
      updateElementDOM(obj);
      autoSave();
    });
  }

  function applyPropertyChange(obj, prop, val) {
    if (prop === 'x') val = Math.max(0, Math.min(CANVAS_W - obj.width, val));
    if (prop === 'y') val = Math.max(0, Math.min(CANVAS_H - obj.height, val));
    if (prop === 'width') val = Math.min(val, CANVAS_W - obj.x);
    if (prop === 'height') val = Math.min(val, CANVAS_H - obj.y);

    obj[prop] = val;
    updateElementDOM(obj);
    autoSave();
  }

  function rebuildLayers() {
    if (!layersList || !layersEmpty) return;
    
    layersList.innerHTML = '';

    if (state.elements.length === 0) {
      layersEmpty.classList.remove('hidden');
      return;
    }

    layersEmpty.classList.add('hidden');

    const sorted = [...state.elements].sort((a, b) => b.zIndex - a.zIndex);

    sorted.forEach(obj => {
      const isSelected = state.selectedIds.has(obj.id);
      const isMulti = state.selectedIds.size > 1;
      
      const item = document.createElement('div');
      item.className = 'layer-item';
      if (isSelected) item.classList.add(isMulti ? 'multi-selected' : 'selected');
      item.dataset.id = obj.id;

      const icon = document.createElement('div');
      icon.className = 'layer-icon';
      icon.textContent = TOOL_ICONS[obj.type] || '?';

      const info = document.createElement('div');
      info.className = 'layer-info';

      const name = document.createElement('div');
      name.className = 'layer-name';
      if (obj.type === 'text') {
        name.textContent = obj.text.substring(0, 20) || 'Text';
      } else {
        name.textContent = TOOL_LABELS[obj.type] || obj.type;
      }

      const meta = document.createElement('div');
      meta.className = 'layer-meta';
      meta.textContent = Math.round(obj.width) + ' × ' + Math.round(obj.height);

      info.appendChild(name);
      info.appendChild(meta);
      item.appendChild(icon);
      item.appendChild(info);

      if (obj.locked) {
        const lock = document.createElement('span');
        lock.className = 'layer-lock';
        lock.textContent = '🔒';
        item.appendChild(lock);
      }

      item.addEventListener('click', function(e) {
        if (e.shiftKey) {
          if (state.selectedIds.has(obj.id)) {
            state.selectedIds.delete(obj.id);
          } else {
            selectElement(obj.id, true);
          }
          rebuildLayers();
          updateSelectionInfo();
          updatePropertiesUI();
        } else {
          selectElement(obj.id, false);
        }
      });

      layersList.appendChild(item);
    });
  }

  function moveUp() {
    if (state.selectedIds.size !== 1) return;
    const obj = getPrimarySelection();
    if (!obj) return;

    const maxZ = Math.max(...state.elements.map(e => e.zIndex));
    if (obj.zIndex < maxZ) {
      const higher = state.elements.find(e => e.zIndex === obj.zIndex + 1);
      if (higher) {
        higher.zIndex--;
        updateElementDOM(higher);
      }
      obj.zIndex++;
      updateElementDOM(obj);
      rebuildLayers();
      autoSave();
    }
  }

  function moveDown() {
    if (state.selectedIds.size !== 1) return;
    const obj = getPrimarySelection();
    if (!obj) return;

    if (obj.zIndex > 1) {
      const lower = state.elements.find(e => e.zIndex === obj.zIndex - 1);
      if (lower) {
        lower.zIndex++;
        updateElementDOM(lower);
      }
      obj.zIndex--;
      updateElementDOM(obj);
      rebuildLayers();
      autoSave();
    }
  }

  function showToast(msg, type) {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'toast visible ' + (type || 'success');
    setTimeout(function() {
      toast.classList.remove('visible');
      setTimeout(function() { toast.classList.add('hidden'); }, 200);
    }, 2000);
  }

  function autoSave() {
    try {
      const data = state.elements.map(function(obj) {
        return {
          id: obj.id,
          type: obj.type,
          x: obj.x,
          y: obj.y,
          width: obj.width,
          height: obj.height,
          rotation: obj.rotation,
          zIndex: obj.zIndex,
          styles: { background: obj.styles.background },
          text: obj.text,
          locked: obj.locked,
          imageSrc: obj.imageSrc,
          drawPoints: obj.drawPoints,
          drawColor: obj.drawColor,
          drawSize: obj.drawSize
        };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Auto-save failed:', e);
    }
  }

  function saveToStorage() {
    autoSave();
    showToast('Saved to localStorage', 'success');
  }

  function loadFromStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return;

      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return;

      state.elements = [];
      state.selectedIds.clear();
      state.counter = 0;

      parsed.forEach(function(obj) {
        const num = parseInt(obj.id.replace('el_', ''));
        if (num > state.counter) state.counter = num;
        
        obj.drawPoints = obj.drawPoints || [];
        obj.drawColor = obj.drawColor || '#ffffff';
        obj.drawSize = obj.drawSize || 5;
        obj.imageSrc = obj.imageSrc || '';
        obj.locked = obj.locked || false;
        
        state.elements.push(obj);
      });

      renderAll();
      rebuildLayers();
      updatePropertiesUI();
      updateToolbarButtons();

      if (parsed.length > 0) {
        showToast('Loaded ' + parsed.length + ' elements', 'success');
      }
    } catch (e) {
      console.error('Load failed:', e);
      showToast('Failed to load', 'error');
    }
  }

  function clearAll() {
    if (canvas) canvas.querySelectorAll('.design-el').forEach(function(el) { el.remove(); });
    state.elements = [];
    state.selectedIds.clear();
    state.counter = 0;

    localStorage.removeItem(STORAGE_KEY);

    rebuildLayers();
    updatePropertiesUI();
    updateSelectionInfo();
    updateToolbarButtons();
    showToast('Canvas cleared', 'success');
  }

  function exportJSON() {
    const data = state.elements.map(function(obj) {
      return {
        id: obj.id,
        type: obj.type,
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
        rotation: obj.rotation,
        zIndex: obj.zIndex,
        styles: obj.styles,
        text: obj.text,
        locked: obj.locked,
        imageSrc: obj.imageSrc,
        drawPoints: obj.drawPoints,
        drawColor: obj.drawColor,
        drawSize: obj.drawSize
      };
    });

    const json = JSON.stringify(data, null, 2);
    download('design.json', json, 'application/json');
    showToast('Exported JSON', 'success');
  }

  function exportHTML() {
    let els = '';
    const sorted = [...state.elements].sort((a, b) => a.zIndex - b.zIndex);

    sorted.forEach(function(obj) {
      const baseStyles = [
        'position: absolute',
        'left: ' + obj.x + 'px',
        'top: ' + obj.y + 'px',
        'width: ' + obj.width + 'px',
        'height: ' + obj.height + 'px',
        'z-index: ' + obj.zIndex,
        'transform: rotate(' + obj.rotation + 'deg)'
      ];

      let content = '';
      let extraStyles = [];

      switch (obj.type) {
        case 'rect':
          extraStyles.push('background: ' + obj.styles.background, 'border-radius: 4px');
          break;
        case 'circle':
        case 'ellipse':
          extraStyles.push('background: ' + obj.styles.background, 'border-radius: 9999px');
          break;
        case 'diamond':
          content = '<div style="width:100%;height:100%;background:' + obj.styles.background + ';transform:rotate(45deg)"></div>';
          break;
        case 'crescent':
          content = '<div style="position:relative;width:100%;height:100%;background:' + obj.styles.background + ';border-radius:9999px;overflow:hidden"><div style="position:absolute;width:85%;height:85%;background:#fff;border-radius:9999px;top:-10%;left:25%"></div></div>';
          break;
        case 'image':
          if (obj.imageSrc) {
            content = '<img src="' + obj.imageSrc + '" style="width:100%;height:100%;object-fit:cover">';
          }
          extraStyles.push('overflow: hidden');
          break;
        case 'text':
          extraStyles.push(
            'display: flex',
            'align-items: center',
            'padding: 8px 12px',
            'font-family: system-ui, sans-serif',
            'font-size: 16px',
            'color: #1a1a1a'
          );
          content = obj.text;
          break;
        case 'freedraw':
          obj.drawPoints.forEach(function(pt) {
            content += '<div style="position:absolute;left:' + pt.x + 'px;top:' + pt.y + 'px;width:' + obj.drawSize + 'px;height:' + obj.drawSize + 'px;background:' + obj.drawColor + ';border-radius:50%"></div>';
          });
          extraStyles.push('overflow: visible');
          break;
      }

      const allStyles = baseStyles.concat(extraStyles).join('; ');
      els += '    <div style="' + allStyles + '">' + content + '</div>\n';
    });

    const html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Exported Design</title>\n</head>\n<body style="margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #1e1e1e;">\n  <div style="position: relative; width: ' + CANVAS_W + 'px; height: ' + CANVAS_H + 'px; background: #ffffff; border-radius: 2px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">\n' + els + '  </div>\n</body>\n</html>';

    download('design.html', html, 'text/html');
    showToast('Exported HTML', 'success');
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
