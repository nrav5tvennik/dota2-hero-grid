/**
 * tools.js — Drawing tools
 * Pen, Eraser, Line, Rectangle, Circle, Fill (flood), SelectionTool
 */

class DrawingTools {
  constructor(grid, renderer) {
    this.grid     = grid;
    this.renderer = renderer;
    this.tool     = 'pen';
    this.symbol   = '.';
    this.brushSize = 1;

    // State for shape tools
    this._startCell = null;
    this._previewCells = [];
    this._painting = false;
  }

  setTool(name) { this.tool = name; }
  setSymbol(s)  { this.symbol = s || '.'; }
  setBrush(n)   { this.brushSize = Math.max(1, parseInt(n)); }

  /** Called on mousedown */
  onDown(col, row) {
    this._painting = true;
    this._startCell = { col, row };
    if (this.tool === 'pen' || this.tool === 'eraser') {
      this._applyBrush(col, row);
      this.renderer.render();
    } else if (this.tool === 'fill') {
      this._floodFill(col, row);
      this.renderer.render();
    }
  }

  /** Called on mousemove while painting */
  onMove(col, row) {
    if (!this._painting) return;
    if (this.tool === 'pen' || this.tool === 'eraser') {
      this._applyBrush(col, row);
      this.renderer.render();
    } else if (['line', 'rect', 'circle'].includes(this.tool)) {
      // Preview shape
      this.renderer.render();
      this._previewShape(col, row);
    }
  }

  /** Called on mouseup */
  onUp(col, row) {
    if (!this._painting) return;
    this._painting = false;
    if (['line', 'rect', 'circle'].includes(this.tool)) {
      this._commitShape(this._startCell.col, this._startCell.row, col, row);
      this.renderer.render();
    }
    this._startCell = null;
    this._previewCells = [];
  }

  _applyBrush(col, row) {
    const r = Math.floor(this.brushSize / 2);
    const symbol = this.tool === 'eraser' ? null : this.symbol;
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        this.grid.setCell(col + dc, row + dr, symbol);
      }
    }
  }

  _previewShape(endCol, endRow) {
    const cells = this._shapeCells(
      this._startCell.col, this._startCell.row, endCol, endRow
    );
    const ctx = this.renderer.ctx;
    const g   = this.renderer.grid;
    const z   = this.renderer.zoom;
    const sw  = g.stepX * z;
    const sh  = g.stepY * z;
    const dotR = Math.max(1, Math.min(sw, sh) * 0.22);

    ctx.fillStyle = 'rgba(224,108,30,0.7)';
    for (const { col, row } of cells) {
      const cx = (col + 0.5) * sw;
      const cy = (row + 0.5) * sh;
      ctx.beginPath();
      ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _commitShape(sc, sr, ec, er) {
    const cells = this._shapeCells(sc, sr, ec, er);
    for (const { col, row } of cells) {
      this.grid.setCell(col, row, this.symbol);
    }
  }

  _shapeCells(sc, sr, ec, er) {
    if (this.tool === 'line')   return this._lineCells(sc, sr, ec, er);
    if (this.tool === 'rect')   return this._rectCells(sc, sr, ec, er);
    if (this.tool === 'circle') return this._circleCells(sc, sr, ec, er);
    return [];
  }

  /** Bresenham line */
  _lineCells(c0, r0, c1, r1) {
    const cells = [];
    let dc = Math.abs(c1 - c0), sc = c0 < c1 ? 1 : -1;
    let dr = -Math.abs(r1 - r0), sr = r0 < r1 ? 1 : -1;
    let err = dc + dr;
    let c = c0, r = r0;
    while (true) {
      cells.push({ col: c, row: r });
      if (c === c1 && r === r1) break;
      const e2 = 2 * err;
      if (e2 >= dr) { err += dr; c += sc; }
      if (e2 <= dc) { err += dc; r += sr; }
    }
    return cells;
  }

  /** Rectangle outline */
  _rectCells(sc, sr, ec, er) {
    const cells = [];
    const minC = Math.min(sc, ec), maxC = Math.max(sc, ec);
    const minR = Math.min(sr, er), maxR = Math.max(sr, er);
    for (let c = minC; c <= maxC; c++) {
      cells.push({ col: c, row: minR });
      cells.push({ col: c, row: maxR });
    }
    for (let r = minR + 1; r < maxR; r++) {
      cells.push({ col: minC, row: r });
      cells.push({ col: maxC, row: r });
    }
    return cells;
  }

  /** Circle outline (Bresenham) */
  _circleCells(sc, sr, ec, er) {
    const cells = [];
    const radiusC = Math.abs(ec - sc);
    const radiusR = Math.abs(er - sr);
    const radius  = Math.round(Math.sqrt(radiusC * radiusC + radiusR * radiusR));
    const cx = sc, cy = sr;

    const add = (dc, dr) => {
      cells.push({ col: cx + dc, row: cy + dr });
      cells.push({ col: cx - dc, row: cy + dr });
      cells.push({ col: cx + dc, row: cy - dr });
      cells.push({ col: cx - dc, row: cy - dr });
      cells.push({ col: cx + dr, row: cy + dc });
      cells.push({ col: cx - dr, row: cy + dc });
      cells.push({ col: cx + dr, row: cy - dc });
      cells.push({ col: cx - dr, row: cy - dc });
    };

    let x = 0, y = radius, d = 3 - 2 * radius;
    add(x, y);
    while (x <= y) {
      if (d < 0) d += 4 * x + 6;
      else { d += 4 * (x - y) + 10; y--; }
      x++;
      add(x, y);
    }
    // Deduplicate
    const seen = new Set();
    return cells.filter(({ col, row }) => {
      const key = `${col},${row}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }

  /** Flood fill (4-connected) */
  _floodFill(startCol, startRow) {
    const grid = this.grid;
    const targetVal = grid.getCell(startCol, startRow);
    const fillVal   = this.symbol;
    if (targetVal === fillVal) return;

    const stack = [{ col: startCol, row: startRow }];
    const visited = new Set();

    while (stack.length) {
      const { col, row } = stack.pop();
      if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) continue;
      const key = `${col},${row}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const cv = grid.getCell(col, row);
      if (cv !== targetVal) continue;

      grid.setCell(col, row, fillVal);
      stack.push({ col: col + 1, row });
      stack.push({ col: col - 1, row });
      stack.push({ col, row: row + 1 });
      stack.push({ col, row: row - 1 });
    }
  }
}

/**
 * SelectionTool — rectangle selection + move
 *
 * States: 'idle' → 'selecting' → 'selected' → 'moving' → 'selected'
 *
 * Usage:
 *   onDown(col, row)  — called on mousedown
 *   onMove(col, row)  — called on mousemove (with mouse held)
 *   onUp(col, row)    — called on mouseup
 *   deselect()        — clear selection
 *   deleteSelected()  — delete selected cells
 *   getCursor(col, row) — returns CSS cursor name
 */
class SelectionTool {
  constructor(grid, renderer) {
    this.grid     = grid;
    this.renderer = renderer;

    this.state    = 'idle';    // 'idle' | 'selecting' | 'selected' | 'moving'
    this.rect     = null;      // {minCol, minRow, maxCol, maxRow}
    this.cells    = [];        // [{col, row, symbol}]
    this._start   = null;      // drag start grid cell
    this._moveStart = null;    // move drag start cell
    this.moveOffset = { dc: 0, dr: 0 };

    // Animation frame for marching ants
    this._animFrame = null;
  }

  /** Returns cursor CSS string based on current state and hover position */
  getCursor(col, row) {
    if (this.state === 'moving') return 'grabbing';
    if (this.state === 'selected' && this._inRect(col, row)) return 'move';
    return 'crosshair';
  }

  onDown(col, row) {
    if (this.state === 'selected' || this.state === 'moving') {
      if (this._inRect(col, row)) {
        // Start moving
        this.state      = 'moving';
        this._moveStart = { col, row };
        this.moveOffset = { dc: 0, dr: 0 };
        this._redraw();
        return;
      }
      // Click outside → deselect and start new selection
      this.deselect(false);
    }
    // Start selection
    this.state  = 'selecting';
    this._start = { col, row };
    this.rect   = { minCol: col, minRow: row, maxCol: col, maxRow: row };
    this._redraw();
  }

  onMove(col, row) {
    if (this.state === 'selecting') {
      this.rect = {
        minCol: Math.min(this._start.col, col),
        minRow: Math.min(this._start.row, row),
        maxCol: Math.max(this._start.col, col),
        maxRow: Math.max(this._start.row, row),
      };
      this._redraw();
    } else if (this.state === 'moving') {
      this.moveOffset = {
        dc: col - this._moveStart.col,
        dr: row - this._moveStart.row,
      };
      this._redraw();
    }
  }

  onUp(col, row) {
    if (this.state === 'selecting') {
      this.rect = {
        minCol: Math.min(this._start.col, col),
        minRow: Math.min(this._start.row, row),
        maxCol: Math.max(this._start.col, col),
        maxRow: Math.max(this._start.row, row),
      };
      // Capture cells from ACTIVE LAYER ONLY (not merged)
      // Using getActiveCell() prevents reading content from other layers
      this.cells = [];
      for (let r = this.rect.minRow; r <= this.rect.maxRow; r++) {
        for (let c = this.rect.minCol; c <= this.rect.maxCol; c++) {
          const sym = this.grid.getActiveCell(c, r);
          if (sym !== null) this.cells.push({ col: c, row: r, symbol: sym });
        }
      }
      this.state = 'selected';
      this._startMarchingAnts();
      this._redraw();
      return this.cells.length;

    } else if (this.state === 'moving') {
      this._commitMove();
      this.state      = 'selected';
      this.moveOffset = { dc: 0, dr: 0 };
      this._redraw();
    }
    return 0;
  }

  /** Commit the move: erase original positions, write to new positions */
  _commitMove() {
    const { dc, dr } = this.moveOffset;
    if (dc === 0 && dr === 0) return;

    // Clear original
    for (const { col, row } of this.cells) {
      this.grid.setCell(col, row, null);
    }
    // Write to new positions and update cells array
    const newCells = [];
    for (const { col, row, symbol } of this.cells) {
      const nc = col + dc, nr = row + dr;
      this.grid.setCell(nc, nr, symbol);
      newCells.push({ col: nc, row: nr, symbol });
    }
    this.cells = newCells;

    // Update selection rect
    this.rect = {
      minCol: this.rect.minCol + dc,
      minRow: this.rect.minRow + dr,
      maxCol: this.rect.maxCol + dc,
      maxRow: this.rect.maxRow + dr,
    };
  }

  deselect(redraw = true) {
    this.state      = 'idle';
    this.rect       = null;
    this.cells      = [];
    this.moveOffset = { dc: 0, dr: 0 };
    this._stopMarchingAnts();
    if (redraw) this.renderer.render();
  }

  deleteSelected() {
    if (this.state !== 'selected') return;
    for (const { col, row } of this.cells) {
      this.grid.setCell(col, row, null);
    }
    this.deselect(true);
  }

  _inRect(col, row) {
    if (!this.rect) return false;
    return col >= this.rect.minCol && col <= this.rect.maxCol &&
           row >= this.rect.minRow && row <= this.rect.maxRow;
  }

  _redraw() {
    this.renderer.render();
    if (this.rect) {
      const isMoving = this.state === 'moving';
      this.renderer.renderSelectionOverlay(
        this.rect,
        this.state !== 'selecting' ? this.cells : null,
        this.moveOffset.dc,
        this.moveOffset.dr,
        isMoving
      );
    }
  }

  _startMarchingAnts() {
    this._stopMarchingAnts();
    const tick = () => {
      if (this.state === 'selected' || this.state === 'moving') {
        this._redraw();
        this._animFrame = requestAnimationFrame(tick);
      }
    };
    this._animFrame = requestAnimationFrame(tick);
  }

  _stopMarchingAnts() {
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
  }
}
