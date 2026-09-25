/**
 * imageProcessor.js — Image to dot grid converter  v4
 *
 * KEY CHANGE: Edge detection now runs at NATIVE image resolution,
 * then results are mapped to the grid. This guarantees 1-cell-wide edges.
 *
 * Old approach: scale image → grid size → Canny (blurry, thick edges)
 * New approach: Canny on full-res image → map each grid cell (any edge in region → dot)
 */
class ImageProcessor {
  constructor(grid) {
    this.grid = grid;
    this._offscreen = document.createElement('canvas');
    this._octx = this._offscreen.getContext('2d', { willReadFrequently: true });
  }

  async loadFile(file, previewCanvas) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        if (previewCanvas) {
          const pc = previewCanvas.getContext('2d');
          const pw = previewCanvas.width, ph = previewCanvas.height;
          const s  = Math.min(pw / img.width, ph / img.height);
          pc.fillStyle = '#111'; pc.fillRect(0, 0, pw, ph);
          pc.drawImage(img, (pw - img.width*s)/2, (ph - img.height*s)/2, img.width*s, img.height*s);
        }
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  /** Returns {col, row, symbol}[] without modifying grid */
  getCells(img, opts = {}) {
    const {
      mode          = 'edges',
      threshold     = 128,
      maxPoints     = 3000,
      blur          = 0,
      invert        = false,
      symbol        = '.',
      multiSymbol   = false,
      symbolPalette = '@#80X+:.',
      offsetCol     = 0,
      offsetRow     = 0,
      scaleW        = null,
      scaleH        = null,
    } = opts;

    const g   = this.grid;
    const gw  = scaleW ?? g.cols;
    const gh  = scaleH ?? g.rows;

    let rawCells;
    let pixelsForSymbol = null; // brightness at grid resolution (for multi-symbol lookup)

    if (mode === 'edges') {
      // ── Hi-res Canny: run at native image resolution ───────────────────────
      const hiW = Math.min(img.naturalWidth  || img.width,  gw * 6, 3000);
      const hiH = Math.min(img.naturalHeight || img.height, gh * 6, 3000);

      this._offscreen.width  = hiW;
      this._offscreen.height = hiH;
      const ctx = this._octx;
      ctx.clearRect(0, 0, hiW, hiH);
      ctx.drawImage(img, 0, 0, hiW, hiH);

      let hiPx = this._toGrayscale(ctx.getImageData(0, 0, hiW, hiH).data, hiW, hiH);
      hiPx = this._contrastStretch(hiPx);
      const blurPasses = Math.max(1, Math.round(blur) + 1);
      for (let b = 0; b < blurPasses; b++) hiPx = this._gaussBlur(hiPx, hiW, hiH);

      const mask = this._cannyMask(hiPx, hiW, hiH, threshold);
      rawCells = this._maskToGrid(mask, hiW, hiH, gw, gh, invert);

      // For multi-symbol: get brightness at grid resolution for palette lookup
      if (multiSymbol) {
        this._offscreen.width  = gw;
        this._offscreen.height = gh;
        ctx.clearRect(0, 0, gw, gh);
        ctx.drawImage(img, 0, 0, gw, gh);
        pixelsForSymbol = this._toGrayscale(ctx.getImageData(0, 0, gw, gh).data, gw, gh);
      }

    } else {
      // ── Brightness / Dots: scale to grid size ─────────────────────────────
      this._offscreen.width  = gw;
      this._offscreen.height = gh;
      const ctx = this._octx;
      ctx.clearRect(0, 0, gw, gh);
      ctx.drawImage(img, 0, 0, gw, gh);

      let px = this._toGrayscale(ctx.getImageData(0, 0, gw, gh).data, gw, gh);
      px = this._contrastStretch(px);
      for (let b = 0; b < Math.round(blur); b++) px = this._gaussBlur(px, gw, gh);

      if (mode === 'dots') rawCells = this._dotSample(px, gw, gh, threshold, maxPoints, invert);
      else                 rawCells = this._brightnessFill(px, gw, gh, threshold, invert);

      pixelsForSymbol = px; // reuse for symbol palette lookup
    }

    // Limit points
    if (mode !== 'dots' && rawCells.length > maxPoints)
      rawCells = this._subsample(rawCells, maxPoints);

    // Assign symbols
    const palette = multiSymbol ? [...symbolPalette] : null;

    return rawCells.map(({ col, row }) => {
      let sym = symbol;
      if (multiSymbol && palette && palette.length > 0) {
        const brightness = pixelsForSymbol
          ? (pixelsForSymbol[row * gw + col] ?? 128)
          : 128;
        const t   = brightness / 255;
        const eff = invert ? t : (1 - t);
        const idx = Math.round(eff * (palette.length - 1));
        sym = palette[Math.max(0, Math.min(palette.length - 1, idx))];
      }
      return { col: col + offsetCol, row: row + offsetRow, symbol: sym };
    });
  }

  apply(img, opts = {}) {
    const cells = this.getCells(img, opts);
    for (const { col, row, symbol } of cells) this.grid.setCell(col, row, symbol);
    return cells.length;
  }

  // ── Preprocessing ─────────────────────────────────────────────────────────

  _toGrayscale(data, w, h) {
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++)
      gray[i] = 0.299*data[i*4] + 0.587*data[i*4+1] + 0.114*data[i*4+2];
    return gray;
  }

  _contrastStretch(pixels) {
    let mn = 255, mx = 0;
    for (const v of pixels) { if (v < mn) mn = v; if (v > mx) mx = v; }
    if (mx === mn) return pixels;
    const rng = mx - mn, out = new Float32Array(pixels.length);
    for (let i = 0; i < pixels.length; i++) out[i] = (pixels[i] - mn) / rng * 255;
    return out;
  }

  _gaussBlur(pixels, w, h) {
    const k = [1,2,1, 2,4,2, 1,2,1];
    const out = new Float32Array(w * h);
    for (let y = 1; y < h-1; y++)
      for (let x = 1; x < w-1; x++) {
        let s = 0;
        for (let ky = -1; ky <= 1; ky++)
          for (let kx = -1; kx <= 1; kx++)
            s += pixels[(y+ky)*w+(x+kx)] * k[(ky+1)*3+(kx+1)];
        out[y*w+x] = s / 16;
      }
    return out;
  }

  // ── Canny at native resolution ────────────────────────────────────────────

  /**
   * Runs full Canny on full-res pixels, returns Uint8Array mask
   * (1 = strong edge, 0 = no edge).
   */
  _cannyMask(pixels, w, h, threshold) {
    // Sobel
    const gxA = new Float32Array(w * h);
    const gyA = new Float32Array(w * h);
    const mag = new Float32Array(w * h);
    for (let y = 1; y < h-1; y++) {
      for (let x = 1; x < w-1; x++) {
        const p  = (dy, dx) => pixels[(y+dy)*w+(x+dx)];
        const gx = -p(-1,-1) - 2*p(0,-1) - p(1,-1) + p(-1,1) + 2*p(0,1) + p(1,1);
        const gy = -p(-1,-1) - 2*p(-1,0) - p(-1,1) + p(1,-1) + 2*p(1,0) + p(1,1);
        const i  = y*w+x;
        gxA[i] = gx; gyA[i] = gy;
        mag[i] = Math.sqrt(gx*gx + gy*gy);
      }
    }

    // NMS — thin to 1-pixel edges at native resolution
    const nms = new Float32Array(w * h);
    for (let y = 1; y < h-1; y++) {
      for (let x = 1; x < w-1; x++) {
        const i   = y*w+x;
        const m   = mag[i];
        if (m === 0) continue;
        const ang = ((Math.atan2(gyA[i], gxA[i]) * 180 / Math.PI) % 180 + 180) % 180;
        let m1, m2;
        if      (ang <  22.5 || ang >= 157.5) { m1 = mag[y*w+(x-1)];      m2 = mag[y*w+(x+1)]; }
        else if (ang <  67.5)                 { m1 = mag[(y-1)*w+(x+1)];  m2 = mag[(y+1)*w+(x-1)]; }
        else if (ang < 112.5)                 { m1 = mag[(y-1)*w+x];      m2 = mag[(y+1)*w+x]; }
        else                                   { m1 = mag[(y-1)*w+(x-1)]; m2 = mag[(y+1)*w+(x+1)]; }
        if (m >= m1 && m >= m2) nms[i] = m;
      }
    }

    // Double threshold + hysteresis BFS
    let maxMag = 0;
    for (const v of nms) if (v > maxMag) maxMag = v;
    if (maxMag === 0) return new Uint8Array(w * h);

    const highT = (threshold / 255) * maxMag;
    const lowT  = highT * 0.35;

    const STRONG = 2, WEAK = 1;
    const edge = new Uint8Array(w * h);
    for (let i = 0; i < nms.length; i++) {
      if      (nms[i] >= highT) edge[i] = STRONG;
      else if (nms[i] >= lowT)  edge[i] = WEAK;
    }

    const queue = [];
    for (let y = 1; y < h-1; y++)
      for (let x = 1; x < w-1; x++)
        if (edge[y*w+x] === STRONG) queue.push(y*w+x);

    let qi = 0;
    while (qi < queue.length) {
      const idx = queue[qi++];
      const y0 = Math.floor(idx / w), x0 = idx % w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dy && !dx) continue;
          const ny = y0+dy, nx = x0+dx;
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
          const ni = ny*w+nx;
          if (edge[ni] === WEAK) { edge[ni] = STRONG; queue.push(ni); }
        }
      }
    }

    // Return binary mask: 1 = strong edge
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < edge.length; i++) mask[i] = edge[i] === STRONG ? 1 : 0;
    return mask;
  }

  /**
   * Map hi-res binary edge mask → grid cells.
   * For each grid cell, check if ANY edge pixel falls within its corresponding image region.
   * This guarantees 1-cell-wide edges regardless of image:grid ratio.
   */
  _maskToGrid(mask, maskW, maskH, gridW, gridH, invert) {
    const active = [];
    const scaleX = maskW / gridW;
    const scaleY = maskH / gridH;

    for (let gy = 0; gy < gridH; gy++) {
      const y0 = Math.floor(gy * scaleY);
      const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * scaleY));
      for (let gx = 0; gx < gridW; gx++) {
        const x0 = Math.floor(gx * scaleX);
        const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * scaleX));

        let hasEdge = false;
        outer:
        for (let y = y0; y < y1 && y < maskH; y++)
          for (let x = x0; x < x1 && x < maskW; x++)
            if (mask[y * maskW + x]) { hasEdge = true; break outer; }

        if (invert ? !hasEdge : hasEdge) active.push({ col: gx, row: gy });
      }
    }
    return active;
  }

  // ── Brightness / Dots modes ───────────────────────────────────────────────

  _dotSample(pixels, w, h, threshold, maxPoints, invert) {
    const cands = [];
    for (let i = 0; i < pixels.length; i++)
      if (invert ? pixels[i] < threshold : pixels[i] >= threshold) cands.push(i);
    return this._subsample(cands, maxPoints).map(i => ({ col: i % w, row: Math.floor(i / w) }));
  }

  _brightnessFill(pixels, w, h, threshold, invert) {
    const active = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (invert ? pixels[y*w+x] < threshold : pixels[y*w+x] >= threshold)
          active.push({ col: x, row: y });
    return active;
  }

  _subsample(arr, maxN) {
    if (arr.length <= maxN) return arr;
    const step = arr.length / maxN;
    return Array.from({ length: maxN }, (_, i) => arr[Math.floor(i * step)]);
  }
}
