/**
 * app.js — Main controller v4
 * New: Ctrl+Z undo, number inputs on sliders, text live preview, Canny edges
 */
(function () {
  'use strict';

  // ── Modules ───────────────────────────────────────────────────────────────
  // dotaW=1160, dotaH=570 are the defaults from grid.js
  // (calibrated from reference hero_grid_config.json: X 8–1145, Y 3–559)
  const grid      = new DotaGrid({ stepX: 14, stepY: 14, originX: 8, originY: 3 });
  const renderer  = new CanvasRenderer(document.getElementById('main-canvas'), grid);
  const drawTools = new DrawingTools(grid, renderer);
  const selTool   = new SelectionTool(grid, renderer);
  const imgProc   = new ImageProcessor(grid);
  const txtRend   = new TextRenderer(grid);
  const exporter  = new DotaExporter();
  const undoMgr   = new UndoManager(40);
  const miniCanvas = document.getElementById('mini-preview');

  let currentTab    = 'image';
  let activeTool    = 'pen';
  let loadedImage   = null;
  let previewCells  = null;   // image preview overlay cells
  let textPreviewCells = null; // text preview overlay cells
  let previewLive   = true;
  let isDrawing     = false;
  let previewTimer  = null;
  let textPrevTimer = null;

  const mainCanvas = document.getElementById('main-canvas');

  // ── Auto-create number inputs next to every range slider ─────────────────
  document.querySelectorAll('input[type="range"]').forEach(range => {
    const num = document.createElement('input');
    num.type      = 'number';
    num.className = 'slider-num';
    num.min       = range.min;
    num.max       = range.max;
    num.step      = range.step || 1;
    num.value     = range.value;

    const wrapper = document.createElement('div');
    wrapper.className = 'slider-row';
    range.parentNode.replaceChild(wrapper, range);
    wrapper.appendChild(range);
    wrapper.appendChild(num);

    // Keep in sync
    range.addEventListener('input', () => { num.value = range.value; });
    num.addEventListener('change', () => {
      const v = Math.max(+range.min, Math.min(+range.max, +num.value || 0));
      range.value = v;
      num.value   = v;
      range.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  // ── Init render ───────────────────────────────────────────────────────────
  renderer.render();
  updateStatus();

  // ── Tab switching ─────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById('tab-' + currentTab).classList.add('active');

      if (currentTab !== 'image') { previewCells = null; }
      if (currentTab !== 'text')  { textPreviewCells = null; }
      if (currentTab !== 'draw')  { selTool.deselect(false); }
      redraw();
    });
  });

  // ── Zoom / grid ───────────────────────────────────────────────────────────
  document.getElementById('zoom-select').addEventListener('change', e => {
    renderer.setZoom(parseFloat(e.target.value));
    redraw();
  });
  document.getElementById('show-grid').addEventListener('change', e => {
    renderer.showGrid = e.target.checked;
    redraw();
  });

  // ── Canvas mouse ──────────────────────────────────────────────────────────
  const coordsBar = document.getElementById('coords-bar');

  // ── Preview-drag helpers ──────────────────────────────────────────────────
  let dragPreview = null;
  // { type:'image'|'shape'|'text', startCol, startRow, startValX, startValY }

  /** Bounding box of a cells array */
  function cellsBBox(cells) {
    if (!cells || !cells.length) return null;
    let minCol = Infinity, minRow = Infinity, maxCol = -Infinity, maxRow = -Infinity;
    for (const { col, row } of cells) {
      if (col < minCol) minCol = col; if (col > maxCol) maxCol = col;
      if (row < minRow) minRow = row; if (row > maxRow) maxRow = row;
    }
    return { minCol, minRow, maxCol, maxRow };
  }
  function inBBox(col, row, bb) {
    return bb && col >= bb.minCol && col <= bb.maxCol && row >= bb.minRow && row <= bb.maxRow;
  }

  /** Set a slider + its paired number input, dispatch input event */
  function setSliderVal(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    const v = Math.max(+el.min, Math.min(+el.max, Math.round(val)));
    el.value = v;
    const num = el.closest('.slider-row')?.querySelector('.slider-num');
    if (num) num.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Try to start a preview drag. Returns true if drag started. */
  function tryStartDrag(col, row) {
    if (currentTab === 'image' && previewCells) {
      dragPreview = {
        type: 'image',
        startCol: col, startRow: row,
        startValX: parseInt(document.getElementById('img-offset-x').value) || 0,
        startValY: parseInt(document.getElementById('img-offset-y').value) || 0,
      };
      mainCanvas.style.cursor = 'grabbing';
      return true;
    }
    if (currentTab === 'text' && textPreviewCells) {
      dragPreview = {
        type: 'text',
        startCol: col, startRow: row,
        startValX: parseInt(document.getElementById('text-pos-x').value) || 0,
        startValY: parseInt(document.getElementById('text-pos-y').value) || 0,
      };
      mainCanvas.style.cursor = 'grabbing';
      return true;
    }
    if (currentTab === 'draw' && shapePrevCells) {
      const bb = cellsBBox(shapePrevCells);
      if (inBBox(col, row, bb)) {
        dragPreview = {
          type: 'shape',
          startCol: col, startRow: row,
          startValX: parseInt(document.getElementById('shape-pos-x').value) || 0,
          startValY: parseInt(document.getElementById('shape-pos-y').value) || 0,
        };
        mainCanvas.style.cursor = 'grabbing';
        return true;
      }
    }
    return false;
  }

  /** Apply delta to the dragged preview */
  function applyDrag(col, row) {
    if (!dragPreview) return;
    const dc = col - dragPreview.startCol;
    const dr = row - dragPreview.startRow;

    if (dragPreview.type === 'image') {
      setSliderVal('img-offset-x', dragPreview.startValX + dc * grid.stepX);
      setSliderVal('img-offset-y', dragPreview.startValY + dr * grid.stepY);
      schedulePreview();

    } else if (dragPreview.type === 'text') {
      setSliderVal('text-pos-x', dragPreview.startValX + dc * grid.stepX);
      setSliderVal('text-pos-y', dragPreview.startValY + dr * grid.stepY);
      scheduleTextPreview();

    } else if (dragPreview.type === 'shape') {
      const nx = Math.max(0, dragPreview.startValX + dc);
      const ny = Math.max(0, dragPreview.startValY + dr);
      // Update sliders
      const sx = document.getElementById('shape-pos-x');
      const sy = document.getElementById('shape-pos-y');
      if (sx) { sx.value = Math.min(+sx.max, nx); document.getElementById('shape-x-val').textContent = sx.value; }
      if (sy) { sy.value = Math.min(+sy.max, ny); document.getElementById('shape-y-val').textContent = sy.value; }
      // Also update paired number inputs
      [['shape-pos-x','shape-x-val'],['shape-pos-y','shape-y-val']].forEach(([rid]) => {
        const r = document.getElementById(rid);
        const num = r?.closest('.slider-row')?.querySelector('.slider-num');
        if (num && r) num.value = r.value;
      });
      shapePrevCells = getShapeCells();
      redraw();
    }
  }

  // ── Mouse events ──────────────────────────────────────────────────────────
  mainCanvas.addEventListener('mousedown', e => {
    const { col, row } = renderer.eventToCell(e);

    // Try to start a preview drag first (works in all tabs)
    if (tryStartDrag(col, row)) return;

    // Normal draw-tab tools
    if (currentTab !== 'draw') return;
    if (activeTool === 'select') {
      selTool.onDown(col, row);
      updateSelInfo();
    } else {
      undoMgr.snapshot(grid);
      isDrawing = true;
      drawTools.onDown(col, row);
      updateStatus();
    }
  });

  mainCanvas.addEventListener('mousemove', e => {
    const { col, row } = renderer.eventToCell(e);
    const { x, y } = grid.toDota(col, row);
    coordsBar.textContent = `x: ${x}, y: ${y} | ячейка: (${col}, ${row})`;

    // Handle preview drag (all tabs)
    if (dragPreview) { applyDrag(col, row); return; }

    // Cursor hints for draggable previews
    if (currentTab === 'image' && previewCells) {
      mainCanvas.style.cursor = 'grab'; return;
    }
    if (currentTab === 'text' && textPreviewCells) {
      mainCanvas.style.cursor = 'grab'; return;
    }
    if (currentTab === 'draw' && shapePrevCells && inBBox(col, row, cellsBBox(shapePrevCells))) {
      mainCanvas.style.cursor = 'grab';
    } else if (currentTab === 'draw') {
      mainCanvas.style.cursor = 'crosshair';
    }

    if (currentTab !== 'draw') return;

    if (activeTool === 'select') {
      mainCanvas.style.cursor = selTool.getCursor(col, row);
      if (selTool.state === 'selecting' || selTool.state === 'moving') {
        selTool.onMove(col, row);
        updateSelInfo();
      }
    } else {
      if (!isDrawing) { redraw(); renderer.highlightCell(col, row); return; }
      drawTools.onMove(col, row);
      updateStatus();
    }
  });

  mainCanvas.addEventListener('mouseup', e => {
    // End preview drag
    if (dragPreview) {
      dragPreview = null;
      mainCanvas.style.cursor = currentTab === 'draw' ? 'crosshair' : 'grab';
      return;
    }

    if (currentTab !== 'draw') { isDrawing = false; return; }
    const { col, row } = renderer.eventToCell(e);
    if (activeTool === 'select') {
      selTool.onUp(col, row);
      updateSelInfo();
      updateStatus();
    } else {
      if (!isDrawing) return;
      isDrawing = false;
      drawTools.onUp(col, row);
      renderMini();
      updateStatus();
    }
  });

  mainCanvas.addEventListener('mouseleave', e => {
    coordsBar.textContent = 'x: —, y: —';
    if (dragPreview) { dragPreview = null; }
    if (currentTab === 'draw' && activeTool !== 'select' && isDrawing) {
      isDrawing = false;
      const { col, row } = renderer.eventToCell(e);
      drawTools.onUp(col, row);
      renderMini();
    }
    if (!isDrawing) redraw();
  });

  // ── Keyboard: Ctrl+Z undo ─────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    // Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (undoMgr.undo(grid)) {
        redraw();
        renderMini();
        updateStatus();
        mainCanvas.classList.remove('undo-flash');
        void mainCanvas.offsetWidth; // reflow
        mainCanvas.classList.add('undo-flash');
        showToast('↩ Отменено');
      }
      return;
    }
    // Selection tool shortcuts
    if (activeTool === 'select') {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        undoMgr.snapshot(grid);
        selTool.deleteSelected();
        updateSelInfo(); renderMini(); updateStatus();
      }
      if (e.key === 'Escape') { selTool.deselect(); updateSelInfo(); }
    }
  });

  // ── Draw tool buttons ─────────────────────────────────────────────────────
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTool = btn.dataset.tool;
      const isSel = activeTool === 'select';
      document.getElementById('selection-info').style.display = isSel ? 'block' : 'none';
      mainCanvas.style.cursor = 'crosshair';
      if (!isSel) { selTool.deselect(false); redraw(); drawTools.setTool(activeTool); }
    });
  });

  document.getElementById('draw-symbol').addEventListener('input', e => {
    drawTools.setSymbol(e.target.value || '.');
  });
  document.getElementById('draw-brush').addEventListener('input', e => {
    document.getElementById('brush-val').textContent = e.target.value;
    drawTools.setBrush(e.target.value);
  });

  // ── Image tab ─────────────────────────────────────────────────────────────
  const imgRangeIds = [
    'img-threshold','img-points','img-blur',
    'img-offset-x','img-offset-y','img-scale-w','img-scale-h'
  ];
  imgRangeIds.forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      if (previewLive && loadedImage) schedulePreview();
    });
  });

  ['img-mode','img-invert','img-symbol','img-symbol-palette'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => { if (previewLive && loadedImage) schedulePreview(); });
    el.addEventListener('input',  () => { if (previewLive && loadedImage) schedulePreview(); });
  });

  document.getElementById('img-multi-symbol').addEventListener('change', e => {
    const on = e.target.checked;
    document.getElementById('single-symbol-opts').style.display = on ? 'none' : 'block';
    document.getElementById('multi-symbol-opts').style.display  = on ? 'block' : 'none';
    if (previewLive && loadedImage) schedulePreview();
  });

  document.getElementById('preview-live').addEventListener('change', e => {
    previewLive = e.target.checked;
    if (previewLive && loadedImage) schedulePreview();
    else { previewCells = null; redraw(); }
  });

  document.getElementById('img-upload').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    loadedImage = await imgProc.loadFile(file, document.getElementById('preview-src'));
    document.getElementById('preview-result-wrap').style.display = 'block';
    if (previewLive) schedulePreview();
  });

  document.getElementById('btn-apply-image').addEventListener('click', () => {
    if (!loadedImage) { alert('Сначала загрузи изображение!'); return; }
    undoMgr.snapshot(grid);
    const count = imgProc.apply(loadedImage, getImageOpts());
    previewCells = null;
    redraw(); renderMini(); updateStatus();
    showToast(`Применено ${count} точек`);
  });

  function getImageOpts() {
    const multi    = document.getElementById('img-multi-symbol').checked;
    const scaleWPct = parseInt(document.getElementById('img-scale-w').value) / 100;
    const scaleHPct = parseInt(document.getElementById('img-scale-h').value) / 100;
    return {
      mode:          document.getElementById('img-mode').value,
      threshold:     parseInt(document.getElementById('img-threshold').value),
      maxPoints:     parseInt(document.getElementById('img-points').value),
      blur:          parseFloat(document.getElementById('img-blur').value),
      invert:        document.getElementById('img-invert').checked,
      symbol:        document.getElementById('img-symbol').value || '.',
      multiSymbol:   multi,
      symbolPalette: document.getElementById('img-symbol-palette').value || '@#80X+:.',
      offsetCol:     Math.round(parseInt(document.getElementById('img-offset-x').value) / grid.stepX),
      offsetRow:     Math.round(parseInt(document.getElementById('img-offset-y').value) / grid.stepY),
      scaleW:        Math.max(5, Math.round(grid.cols  * scaleWPct)),
      scaleH:        Math.max(5, Math.round(grid.rows * scaleHPct)),
    };
  }

  function schedulePreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      if (!loadedImage) return;
      previewCells = imgProc.getCells(loadedImage, getImageOpts());
      renderer.renderCellsToCanvas(previewCells, document.getElementById('preview-result'));
      redraw();
    }, 260);
  }

  // ── Text tab + live preview ───────────────────────────────────────────────
  function getTextOpts() {
    return {
      text:     document.getElementById('text-input').value,
      scale:    parseInt(document.getElementById('font-scale').value),
      spacing:  Math.round(parseInt(document.getElementById('font-spacing').value) / grid.stepX),
      symbol:   document.getElementById('text-symbol').value || '.',
      startCol: Math.round(parseInt(document.getElementById('text-pos-x').value) / grid.stepX),
      startRow: Math.round(parseInt(document.getElementById('text-pos-y').value) / grid.stepY),
    };
  }

  function scheduleTextPreview() {
    if (textPrevTimer) clearTimeout(textPrevTimer);
    textPrevTimer = setTimeout(() => {
      const o = getTextOpts();
      if (!o.text.trim()) { textPreviewCells = null; redraw(); return; }
      textPreviewCells = txtRend.getCells(o.text, o.startCol, o.startRow, o.symbol, o.scale, o.spacing);
      redraw();
    }, 150);
  }

  ['text-input','font-scale','font-spacing','text-pos-x','text-pos-y','text-symbol'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      if (currentTab === 'text') scheduleTextPreview();
    });
  });

  // Update display values for text sliders (old span approach removed, now number inputs handle it)
  [['font-scale','font-scale-val'],['font-spacing','font-spacing-val'],
   ['text-pos-x','text-x-val'],['text-pos-y','text-y-val']].forEach(([id, valId]) => {
    const el = document.getElementById(id);
    const vEl = document.getElementById(valId);
    if (el && vEl) el.addEventListener('input', e => { vEl.textContent = e.target.value; });
  });

  document.getElementById('btn-apply-text').addEventListener('click', () => {
    const o = getTextOpts();
    if (!o.text.trim()) { alert('Введи текст!'); return; }
    undoMgr.snapshot(grid);
    txtRend.render(o.text, o.startCol, o.startRow, o.symbol, o.scale, o.spacing);
    textPreviewCells = null;
    redraw(); renderMini(); updateStatus();
    showToast('Текст добавлен');
  });

  // ── Shape presets ─────────────────────────────────────────────────────────
  let shapePrevCells = null;
  let shapePrevTimer = null;

  /** Shapes that use radius (not width/height) */
  const RADIUS_SHAPES = new Set(['diamond','diamond-fill','star','cross','triangle-up','triangle-down']);
  /** Shapes that use custom rect symbols */
  const RECT_SHAPES   = new Set(['rect','rect-fill','rect-double']);

  function updateShapeUI() {
    const type   = document.getElementById('shape-type').value;
    const isRect = RECT_SHAPES.has(type);
    const isRad  = RADIUS_SHAPES.has(type);
    document.getElementById('shape-rect-sym').style.display  = (type === 'rect' || type === 'rect-double') ? 'block' : 'none';
    document.getElementById('shape-sym-simple').style.display = !isRect ? 'block' : 'none';
    document.getElementById('shape-size-wh').style.display   = !isRad  ? 'block' : 'none';
    document.getElementById('shape-size-r').style.display    = isRad   ? 'block' : 'none';
  }

  function getShapeCells() {
    const type = document.getElementById('shape-type').value;
    const col  = parseInt(document.getElementById('shape-pos-x').value);
    const row  = parseInt(document.getElementById('shape-pos-y').value);
    const w    = parseInt(document.getElementById('shape-w').value);
    const h    = parseInt(document.getElementById('shape-h').value);
    const r    = parseInt(document.getElementById('shape-r').value);
    const sym  = {
      corner: document.getElementById('shape-corner').value || '+',
      horiz:  document.getElementById('shape-horiz').value  || '-',
      vert:   document.getElementById('shape-vert').value   || '|',
    };
    const simpleSym = document.getElementById('shape-symbol').value || '*';

    switch (type) {
      case 'rect':         return ShapePresets.rect(col, row, w, h, sym);
      case 'rect-fill':    return ShapePresets.rectFill(col, row, w, h, simpleSym);
      case 'rect-double':  return ShapePresets.rectDouble(col, row, w, h);
      case 'diamond':      return ShapePresets.diamond(col, row, r, simpleSym);
      case 'diamond-fill': return ShapePresets.diamondFill(col, row, r, simpleSym);
      case 'triangle-up':  return ShapePresets.triangleUp(col, row, r, simpleSym);
      case 'triangle-down':return ShapePresets.triangleDown(col, row, r, simpleSym);
      case 'star':         return ShapePresets.star(col, row, r, simpleSym);
      case 'cross':        return ShapePresets.cross(col, row, r, simpleSym);
      default:             return [];
    }
  }

  function scheduleShapePreview() {
    if (shapePrevTimer) clearTimeout(shapePrevTimer);
    shapePrevTimer = setTimeout(() => {
      if (currentTab !== 'draw') return;
      shapePrevCells = getShapeCells();
      redraw();
    }, 80);
  }

  // Wire all shape controls to live preview
  ['shape-type','shape-corner','shape-horiz','shape-vert','shape-symbol'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => { updateShapeUI(); scheduleShapePreview(); });
    document.getElementById(id)?.addEventListener('input',  () => { scheduleShapePreview(); });
  });
  ['shape-w','shape-h','shape-r','shape-pos-x','shape-pos-y'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', e => {
      const val = e.target.value;
      const valId = { 'shape-w':'shape-w-val','shape-h':'shape-h-val','shape-r':'shape-r-val',
                      'shape-pos-x':'shape-x-val','shape-pos-y':'shape-y-val' }[id];
      if (valId) document.getElementById(valId).textContent = val;
      scheduleShapePreview();
    });
  });

  // Place shape button
  document.getElementById('btn-place-shape').addEventListener('click', () => {
    const cells = getShapeCells();
    if (!cells.length) return;
    undoMgr.snapshot(grid);
    for (const { col, row, symbol } of cells) grid.setCell(col, row, symbol);
    shapePrevCells = null;
    redraw(); renderMini(); updateStatus();
    showToast(`Размещено ${cells.length} ячеек`);
  });

  // Init shape UI
  updateShapeUI();
  scheduleShapePreview();

  // ── Grid settings ─────────────────────────────────────────────────────────
  [['grid-step-x','stepX'],['grid-step-y','stepY'],
   ['grid-origin-x','originX'],['grid-origin-y','originY']].forEach(([id, prop]) => {
    document.getElementById(id).addEventListener('input', e => {
      const val = parseInt(e.target.value);
      grid.resize({ [prop]: val });
      renderer._resize();
      updateSliderBounds();
      redraw(); updateStatus();
      // Warn about large grids
      if ((prop === 'stepX' || prop === 'stepY') && val < 7) {
        const cells = grid.cols * grid.rows;
        if (cells > 30000) showToast(`⚠ ${grid.cols}×${grid.rows} = ${cells.toLocaleString()} ячеек — JSON будет большим`);
      }
    });
  });

  // Canvas pixel dimensions (dotaW / dotaH)
  document.getElementById('canvas-dota-w').addEventListener('input', e => {
    const v = parseInt(e.target.value);
    document.getElementById('canvas-w-val').textContent = v;
    grid.resize({ dotaW: v });
    renderer._resize();
    updateSliderBounds();
    redraw(); updateStatus();
  });
  document.getElementById('canvas-dota-h').addEventListener('input', e => {
    const v = parseInt(e.target.value);
    document.getElementById('canvas-h-val').textContent = v;
    grid.resize({ dotaH: v });
    renderer._resize();
    updateSliderBounds();
    redraw(); updateStatus();
  });

  /**
   * Sync all position/size slider max values with the current grid dimensions.
   * Called after any grid resize (step, origin, dotaW, dotaH changes).
   */
  function updateSliderBounds() {
    const cols = grid.cols;
    const rows = grid.rows;
    const dotaW = grid.dotaW;
    const dotaH = grid.dotaH;

    // Helper: update max of a range input (and clamp current value)
    function setMax(id, newMax) {
      const el = document.getElementById(id);
      if (!el) return;
      el.max = newMax;
      if (+el.value > newMax) {
        el.value = newMax;
        const num = el.closest('.slider-row')?.querySelector('.slider-num');
        if (num) { num.max = newMax; num.value = newMax; }
      } else {
        const num = el.closest('.slider-row')?.querySelector('.slider-num');
        if (num) num.max = newMax;
      }
    }

    // Shape position: in cell units
    setMax('shape-pos-x', Math.max(0, cols - 1));
    setMax('shape-pos-y', Math.max(0, rows - 1));

    // Shape size: in cell units
    setMax('shape-w', cols);
    setMax('shape-h', rows);
    setMax('shape-r', Math.floor(Math.min(cols, rows) / 2));

    // Image offset: in pixels
    setMax('img-offset-x', dotaW);
    setMax('img-offset-y', dotaH);

    // Text position: in pixels
    setMax('text-pos-x', Math.max(0, dotaW - grid.stepX));
    setMax('text-pos-y', Math.max(0, dotaH - grid.stepY));

    // Refresh shape preview after bounds update
    if (typeof shapePrevCells !== 'undefined' && currentTab === 'draw') {
      shapePrevCells = getShapeCells();
      redraw();
    }
  }

  // ── Layers ────────────────────────────────────────────────────────────────
  document.getElementById('btn-add-layer').addEventListener('click', () => {
    grid.addLayer(); refreshLayerUI(); renderer.render();
  });

  function refreshLayerUI() {
    const list = document.getElementById('layers-list');
    list.innerHTML = '';
    grid.layerNames.forEach((name, i) => {
      const div = document.createElement('div');
      div.className = 'layer-item' + (i === grid.activeLayer ? ' active' : '');
      div.innerHTML = `
        <span class="layer-vis">${grid.layerVisible[i] ? '👁' : '🙈'}</span>
        <span class="layer-name">${name}</span>
        <button class="layer-del">✕</button>`;
      div.addEventListener('click', () => { grid.activeLayer = i; refreshLayerUI(); });
      div.querySelector('.layer-vis').addEventListener('click', ev => {
        ev.stopPropagation();
        grid.layerVisible[i] = !grid.layerVisible[i];
        redraw(); refreshLayerUI();
      });
      div.querySelector('.layer-del').addEventListener('click', ev => {
        ev.stopPropagation();
        grid.removeLayer(i); refreshLayerUI(); redraw();
      });
      list.appendChild(div);
    });
  }

  // ── Export / Clear ────────────────────────────────────────────────────────
  document.getElementById('btn-export').addEventListener('click', () => {
    const configName    = document.getElementById('export-name').value || 'Custom';
    const defaultSymbol = document.getElementById('default-symbol').value || '.';
    const count = exporter.download(grid, { configName, defaultSymbol });
    showToast(`Экспортировано ${count} категорий`);
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('Очистить всё?')) return;
    undoMgr.snapshot(grid);
    grid.clearAll();
    previewCells = null; textPreviewCells = null;
    selTool.deselect(false);
    redraw(); renderMini(); updateStatus();
  });

  // ── Core helpers ──────────────────────────────────────────────────────────
  function redraw() {
    renderer.render();
    // Image preview overlay
    if (previewCells && currentTab === 'image')
      renderer.renderPreviewOverlay(previewCells);
    // Text preview overlay
    if (textPreviewCells && currentTab === 'text')
      renderer.renderPreviewOverlay(textPreviewCells);
    // Shape preview overlay (always visible in draw tab)
    if (shapePrevCells && currentTab === 'draw')
      renderer.renderPreviewOverlay(shapePrevCells);
    // Selection overlay
    if (activeTool === 'select' && selTool.rect) {
      renderer.renderSelectionOverlay(
        selTool.rect,
        selTool.state !== 'selecting' ? selTool.cells : null,
        selTool.moveOffset.dc, selTool.moveOffset.dr,
        selTool.state === 'moving'
      );
    }
  }

  function updateStatus() {
    const count = exporter.countCells(grid);
    document.getElementById('status-bar').textContent =
      `Холст ${grid.cols}×${grid.rows} · ${count} точек`;
  }

  function updateSelInfo() {
    const el  = document.getElementById('selection-info');
    const cnt = document.getElementById('sel-count');
    if (activeTool !== 'select') { el.style.display = 'none'; return; }
    el.style.display = 'block';
    cnt.textContent  = selTool.state === 'selecting' ? '...' : `${selTool.cells.length} яч.`;
  }

  function renderMini() { renderer.renderMini(miniCanvas); }

  function showToast(msg) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:#e06c1e;color:#fff;padding:8px 18px;border-radius:6px;font-size:13px;' +
      'font-weight:600;z-index:9999;pointer-events:none;box-shadow:0 2px 12px rgba(0,0,0,.5)';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  refreshLayerUI();
  renderMini();
  updateSliderBounds(); // set correct slider maxima for initial grid dimensions
  console.log('DotaArt ready. Ctrl+Z = undo (%d levels max)', undoMgr.maxHistory);

})();
