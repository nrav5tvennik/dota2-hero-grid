/**
 * shapes.js — Shape presets for DotaArt
 * All methods return Array<{col, row, symbol}> without modifying the grid.
 *
 * Shapes:
 *  rect(col, row, w, h, sym)   — rectangle outline with separate symbols per part
 *  rectFill(col, row, w, h, sym) — filled rectangle
 *  diamond(col, row, r, sym)  — diamond (rhombus) outline
 *  diamondFill(col, row, r, sym) — filled diamond
 *  triangleUp(col, row, size, sym)   — upward triangle outline
 *  triangleDown(col, row, size, sym) — downward triangle outline
 *  star(col, row, r, sym) — 4-point star outline
 *  cross(col, row, r, sym) — plus-sign cross
 */
class ShapePresets {

  /**
   * Rectangle outline.
   * @param {number} col  top-left column
   * @param {number} row  top-left row
   * @param {number} w    width  in cells (≥ 2)
   * @param {number} h    height in cells (≥ 2)
   * @param {{corner,horiz,vert}} sym
   */
  static rect(col, row, w, h, sym = {}) {
    const { corner = '+', horiz = '-', vert = '|' } = sym;
    const cells = [];
    w = Math.max(2, w); h = Math.max(2, h);

    for (let x = 0; x < w; x++) {
      // Top row
      cells.push({ col: col+x, row, symbol: (x === 0 || x === w-1) ? corner : horiz });
      // Bottom row
      if (h > 1)
        cells.push({ col: col+x, row: row+h-1, symbol: (x === 0 || x === w-1) ? corner : horiz });
    }
    for (let y = 1; y < h-1; y++) {
      cells.push({ col,       row: row+y, symbol: vert });
      cells.push({ col: col+w-1, row: row+y, symbol: vert });
    }
    return cells;
  }

  /**
   * Filled rectangle.
   */
  static rectFill(col, row, w, h, symbol = '.') {
    const cells = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        cells.push({ col: col+x, row: row+y, symbol });
    return cells;
  }

  /**
   * Double-line rectangle (like ╔═╗ ║ ╚═╝).
   */
  static rectDouble(col, row, w, h) {
    const sym = { corner: '╬', horiz: '═', vert: '║' };
    // Use actual box-drawing chars for corners
    const cells = ShapePresets.rect(col, row, w, h, sym);
    // Fix corners
    for (const c of cells) {
      if (c.col === col          && c.row === row)       c.symbol = '╔';
      if (c.col === col+w-1      && c.row === row)       c.symbol = '╗';
      if (c.col === col          && c.row === row+h-1)   c.symbol = '╚';
      if (c.col === col+w-1      && c.row === row+h-1)   c.symbol = '╝';
    }
    return cells;
  }

  /**
   * Diamond (rhombus) outline.
   * @param {number} col  center column
   * @param {number} row  center row
   * @param {number} r    radius in cells
   * @param {string} symbol
   */
  static diamond(col, row, r, symbol = '*') {
    const cells = [];
    r = Math.max(1, r);
    for (let dy = -r; dy <= r; dy++) {
      const xr = r - Math.abs(dy);
      if (xr === 0) {
        cells.push({ col, row: row+dy, symbol });
      } else {
        cells.push({ col: col - xr, row: row+dy, symbol });
        cells.push({ col: col + xr, row: row+dy, symbol });
      }
    }
    return cells;
  }

  /**
   * Filled diamond.
   */
  static diamondFill(col, row, r, symbol = '*') {
    const cells = [];
    r = Math.max(1, r);
    for (let dy = -r; dy <= r; dy++) {
      const xr = r - Math.abs(dy);
      for (let dx = -xr; dx <= xr; dx++)
        cells.push({ col: col+dx, row: row+dy, symbol });
    }
    return cells;
  }

  /**
   * Upward triangle outline (▲).
   * @param {number} col  tip column (center)
   * @param {number} row  tip row (top)
   * @param {number} size half-base width
   * @param {string} symbol
   */
  static triangleUp(col, row, size, symbol = '*') {
    const cells = [];
    size = Math.max(1, size);
    for (let y = 0; y <= size; y++) {
      const xr = y;
      if (y === size) {
        // Base: full row
        for (let x = -xr; x <= xr; x++) cells.push({ col: col+x, row: row+y, symbol });
      } else {
        // Left and right edges
        cells.push({ col: col - xr, row: row+y, symbol });
        if (xr > 0) cells.push({ col: col + xr, row: row+y, symbol });
      }
    }
    return cells;
  }

  /**
   * Downward triangle outline (▼).
   */
  static triangleDown(col, row, size, symbol = '*') {
    const cells = [];
    size = Math.max(1, size);
    for (let y = 0; y <= size; y++) {
      const xr = size - y;
      if (y === 0) {
        // Top base: full row
        for (let x = -xr; x <= xr; x++) cells.push({ col: col+x, row: row+y, symbol });
      } else {
        cells.push({ col: col - xr, row: row+y, symbol });
        if (xr > 0) cells.push({ col: col + xr, row: row+y, symbol });
      }
    }
    return cells;
  }

  /**
   * 4-point star.
   */
  static star(col, row, r, symbol = '*') {
    const cells = new Map();
    const add = (c, ro) => cells.set(`${c},${ro}`, { col: c, row: ro, symbol });
    r = Math.max(2, r);
    // Cross bars
    for (let i = -r; i <= r; i++) {
      add(col+i, row);
      add(col, row+i);
    }
    // Diagonal fill (inner diamond half-r)
    const inner = Math.floor(r / 2);
    for (let d = -inner; d <= inner; d++) {
      const xr = inner - Math.abs(d);
      for (let dx = -xr; dx <= xr; dx++) add(col+dx, row+d);
    }
    return [...cells.values()];
  }

  /**
   * Plus/cross.
   */
  static cross(col, row, r, symbol = '+') {
    const cells = [];
    r = Math.max(1, r);
    for (let i = -r; i <= r; i++) {
      cells.push({ col: col+i, row, symbol });
      if (i !== 0) cells.push({ col, row: row+i, symbol });
    }
    return cells;
  }
}
