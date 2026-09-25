/**
 * grid.js — Grid state management
 * Manages a 2D grid of cells. Each cell stores a symbol (string) or null (empty).
 * Grid coordinates map to Dota2 JSON coordinates via step/origin.
 */

class DotaGrid {
  constructor(options = {}) {
    this.stepX   = options.stepX   ?? 14;
    this.stepY   = options.stepY   ?? 14;
    this.originX = options.originX ?? 8;
    this.originY = options.originY ?? 3;
    // Actual Dota2 hero grid pixel range (from reference JSON):
    // X: 8–1145  →  width ≈ 1160
    // Y: 3–559   →  height ≈ 570
    this.dotaW = options.dotaW ?? 1160;
    this.dotaH = options.dotaH ?? 570;

    this.cols = Math.floor((this.dotaW - this.originX) / this.stepX) + 1;
    this.rows = Math.floor((this.dotaH - this.originY) / this.stepY) + 1;

    // Layers: array of 2D arrays
    this.layers = [this._makeLayer()];
    this.activeLayer = 0;
    this.layerVisible = [true];
    this.layerNames = ['Слой 1'];
  }

  _makeLayer() {
    return Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
  }

  addLayer(name) {
    this.layers.push(this._makeLayer());
    this.layerVisible.push(true);
    this.layerNames.push(name ?? `Слой ${this.layers.length}`);
    this.activeLayer = this.layers.length - 1;
  }

  removeLayer(idx) {
    if (this.layers.length === 1) return;
    this.layers.splice(idx, 1);
    this.layerVisible.splice(idx, 1);
    this.layerNames.splice(idx, 1);
    if (this.activeLayer >= this.layers.length) {
      this.activeLayer = this.layers.length - 1;
    }
  }

  /** Get composite (merged) cell value at grid (col, row) */
  getCell(col, row) {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      if (!this.layerVisible[i]) continue;
      const v = this.layers[i][row]?.[col];
      if (v !== null && v !== undefined) return v;
    }
    return null;
  }

  /** Set cell on active layer */
  setCell(col, row, symbol) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return;
    this.layers[this.activeLayer][row][col] = symbol;
  }

  /** Get cell value from the ACTIVE layer only (not merged) */
  getActiveCell(col, row) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
    return this.layers[this.activeLayer][row][col] ?? null;
  }

  /** Clear active layer */
  clearActive() {
    this.layers[this.activeLayer] = this._makeLayer();
  }

  /** Clear all layers */
  clearAll() {
    this.layers = this.layers.map(() => this._makeLayer());
  }

  /** Convert grid (col, row) → Dota2 pixel (x, y) */
  toDota(col, row) {
    return {
      x: this.originX + col * this.stepX,
      y: this.originY + row * this.stepY,
    };
  }

  /** Convert Dota2 pixel (x, y) → grid (col, row) — rounded */
  fromDota(x, y) {
    return {
      col: Math.round((x - this.originX) / this.stepX),
      row: Math.round((y - this.originY) / this.stepY),
    };
  }

  /** Convert canvas pixel (cx, cy) → grid (col, row) */
  fromCanvas(cx, cy) {
    return {
      col: Math.floor(cx / this.stepX),
      row: Math.floor(cy / this.stepY),
    };
  }

  /** Get all non-null cells as array of {col, row, symbol} */
  getAllCells() {
    const result = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const v = this.getCell(c, r);
        if (v !== null) result.push({ col: c, row: r, symbol: v });
      }
    }
    return result;
  }

  /** Update grid parameters and resize */
  resize(opts) {
    Object.assign(this, opts);
    this.cols = Math.floor((this.dotaW - this.originX) / this.stepX) + 1;
    this.rows = Math.floor((this.dotaH - this.originY) / this.stepY) + 1;
    // Resize layers (trim or expand)
    this.layers = this.layers.map(layer => {
      const newLayer = this._makeLayer();
      for (let r = 0; r < Math.min(layer.length, this.rows); r++) {
        for (let c = 0; c < Math.min((layer[r] ?? []).length, this.cols); c++) {
          newLayer[r][c] = layer[r][c];
        }
      }
      return newLayer;
    });
  }
}
