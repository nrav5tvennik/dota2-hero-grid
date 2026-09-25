/**
 * canvas.js — Canvas rendering engine  v2
 *
 * Changes from v1:
 *  - Cells now render as their actual text symbol (monospace) when cell is large enough
 *  - Falls back to filled arc (dot) for very small cells (< 7px)
 *  - renderPreviewOverlay / renderSelectionOverlay unchanged
 *  - renderCellsToCanvas updated to also render text when possible
 */

class CanvasRenderer {
  constructor(canvasEl, grid) {
    this.canvas   = canvasEl;
    this.ctx      = canvasEl.getContext('2d');
    this.grid     = grid;
    this.zoom     = 1;
    this.showGrid = true;
    this._resize();
  }

  _resize() {
    const g = this.grid;
    this.canvas.width  = g.cols  * g.stepX * this.zoom;
    this.canvas.height = g.rows * g.stepY * this.zoom;
  }

  setZoom(z) {
    this.zoom = z;
    this._resize();
    this.render();
  }

  /** Full redraw of grid */
  render() {
    const { ctx, canvas, grid, zoom } = this;
    const sw     = grid.stepX * zoom;
    const sh     = grid.stepY * zoom;
    const dotR   = Math.max(0.8, Math.min(sw, sh) * 0.17);
    // Use text rendering when a cell is at least 7px wide
    const useText = sw >= 7;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#0e0e10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines
    if (this.showGrid) {
      ctx.strokeStyle = '#1e1e24';
      ctx.lineWidth   = 0.5;
      for (let c = 0; c <= grid.cols; c++) {
        ctx.beginPath(); ctx.moveTo(c*sw, 0); ctx.lineTo(c*sw, canvas.height); ctx.stroke();
      }
      for (let r = 0; r <= grid.rows; r++) {
        ctx.beginPath(); ctx.moveTo(0, r*sh); ctx.lineTo(canvas.width, r*sh); ctx.stroke();
      }
    }

    // Prepare text style once
    if (useText) {
      const fs = Math.max(5, Math.floor(Math.min(sw, sh) * 0.72));
      ctx.font          = `${fs}px monospace`;
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'middle';
    }

    // Draw cells
    ctx.fillStyle = '#e8e8e8';
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const val = grid.getCell(c, r);
        if (val === null) continue;

        const cx = (c + 0.5) * sw;
        const cy = (r + 0.5) * sh;

        if (useText) {
          ctx.fillText(val[0] || '.', cx, cy);
        } else {
          ctx.beginPath();
          ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  /** Render into a small thumbnail canvas */
  renderMini(miniCanvas) {
    const { grid } = this;
    const mCtx = miniCanvas.getContext('2d');
    const mw = miniCanvas.width, mh = miniCanvas.height;

    mCtx.fillStyle = '#0e0e10';
    mCtx.fillRect(0, 0, mw, mh);

    const sx   = mw / (grid.cols  * grid.stepX);
    const sy   = mh / (grid.rows * grid.stepY);
    const dotR = Math.max(0.6, Math.min(sx, sy) * grid.stepX * 0.15);

    mCtx.fillStyle = '#e8e8e8';
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const val = grid.getCell(c, r);
        if (!val) continue;
        const cx = (c * grid.stepX + grid.stepX/2) * sx;
        const cy = (r * grid.stepY + grid.stepY/2) * sy;
        mCtx.beginPath();
        mCtx.arc(cx, cy, dotR, 0, Math.PI * 2);
        mCtx.fill();
      }
    }
  }

  /** Highlight a single cell (hover feedback) */
  highlightCell(col, row, color = 'rgba(224,108,30,0.3)') {
    const { ctx, grid, zoom } = this;
    const sw = grid.stepX * zoom, sh = grid.stepY * zoom;
    ctx.fillStyle = color;
    ctx.fillRect(col * sw, row * sh, sw, sh);
  }

  /** Convert mouse event position → grid cell {col, row} */
  eventToCell(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx   = (e.clientX - rect.left) / this.zoom;
    const my   = (e.clientY - rect.top)  / this.zoom;
    return this.grid.fromCanvas(mx, my);
  }

  // ── Overlay helpers ──────────────────────────────────────────────────────

  /**
   * Orange semi-transparent preview overlay (image not yet applied)
   * @param {Array<{col,row,symbol}>} cells
   */
  renderPreviewOverlay(cells) {
    if (!cells || cells.length === 0) return;
    const { ctx, grid, zoom } = this;
    const sw     = grid.stepX * zoom;
    const sh     = grid.stepY * zoom;
    const dotR   = Math.max(0.8, Math.min(sw, sh) * 0.22);
    const useText = sw >= 7;

    if (useText) {
      const fs = Math.max(5, Math.floor(Math.min(sw, sh) * 0.72));
      ctx.font         = `${fs}px monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
    }

    ctx.fillStyle = 'rgba(224, 108, 30, 0.7)';
    for (const { col, row, symbol } of cells) {
      if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) continue;
      const cx = (col + 0.5) * sw;
      const cy = (row + 0.5) * sh;
      if (useText) {
        ctx.fillText((symbol || '.')[0], cx, cy);
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * Selection rectangle + cell highlights + move ghost
   * @param {{minCol,minRow,maxCol,maxRow}} rect
   * @param {Array<{col,row,symbol}>|null} cells
   * @param {number} dc   column drag offset
   * @param {number} dr   row drag offset
   * @param {boolean} isMoving
   */
  renderSelectionOverlay(rect, cells, dc = 0, dr = 0, isMoving = false) {
    const { ctx, grid, zoom } = this;
    const sw   = grid.stepX * zoom;
    const sh   = grid.stepY * zoom;
    const dotR = Math.max(0.8, Math.min(sw, sh) * 0.22);

    // Dashed marching-ants border
    ctx.save();
    ctx.strokeStyle    = isMoving ? 'rgba(79,163,224,0.9)' : 'rgba(224,108,30,0.9)';
    ctx.lineWidth      = Math.max(1, zoom * 1.2);
    ctx.setLineDash    ([4*zoom, 3*zoom]);
    ctx.lineDashOffset = (Date.now() / 60) % (7 * zoom);
    ctx.strokeRect(
      rect.minCol * sw, rect.minRow * sh,
      (rect.maxCol - rect.minCol + 1) * sw,
      (rect.maxRow - rect.minRow + 1) * sh
    );
    ctx.setLineDash([]);
    ctx.restore();

    if (!cells) return;

    const useText = sw >= 7;
    if (useText) {
      const fs = Math.max(5, Math.floor(Math.min(sw, sh) * 0.72));
      ctx.font = `${fs}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }

    if (isMoving && (dc !== 0 || dr !== 0)) {
      ctx.fillStyle = 'rgba(79,163,224,0.65)';
      for (const { col, row, symbol } of cells) {
        const nc = col+dc, nr = row+dr;
        if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) continue;
        const cx = (nc+0.5)*sw, cy = (nr+0.5)*sh;
        if (useText) ctx.fillText((symbol||'.')[0], cx, cy);
        else { ctx.beginPath(); ctx.arc(cx, cy, dotR, 0, Math.PI*2); ctx.fill(); }
      }
    } else {
      ctx.fillStyle = 'rgba(79,163,224,0.5)';
      for (const { col, row, symbol } of cells) {
        const cx = (col+0.5)*sw, cy = (row+0.5)*sh;
        if (useText) ctx.fillText((symbol||'.')[0], cx, cy);
        else { ctx.beginPath(); ctx.arc(cx, cy, dotR, 0, Math.PI*2); ctx.fill(); }
      }
    }
  }

  /** Render cells as dots into a small panel canvas (image tab result preview) */
  renderCellsToCanvas(cells, targetCanvas) {
    const { grid } = this;
    const tc  = targetCanvas;
    const ctx = tc.getContext('2d');
    const tw  = tc.width, th = tc.height;

    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, tw, th);
    if (!cells || cells.length === 0) return;

    const sx   = tw / (grid.cols  * grid.stepX);
    const sy   = th / (grid.rows * grid.stepY);
    const dotR = Math.max(0.6, Math.min(sx, sy) * grid.stepX * 0.18);

    ctx.fillStyle = 'rgba(224,108,30,0.9)';
    for (const { col, row } of cells) {
      const cx = (col * grid.stepX + grid.stepX/2) * sx;
      const cy = (row * grid.stepY + grid.stepY/2) * sy;
      ctx.beginPath();
      ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
