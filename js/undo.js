/**
 * undo.js — Undo manager (Ctrl+Z)
 * Stores full grid snapshots before each mutation.
 */
class UndoManager {
  constructor(maxHistory = 40) {
    this.maxHistory = maxHistory;
    this._history   = [];
  }

  /** Call BEFORE any mutation to save current state */
  snapshot(grid) {
    this._history.push({
      layers:       grid.layers.map(l => l.map(r => [...r])),
      activeLayer:  grid.activeLayer,
      layerNames:   [...grid.layerNames],
      layerVisible: [...grid.layerVisible],
    });
    if (this._history.length > this.maxHistory) this._history.shift();
  }

  /** Restore last snapshot into grid. Returns true if restored. */
  undo(grid) {
    if (!this._history.length) return false;
    const s = this._history.pop();
    grid.layers       = s.layers.map(l => l.map(r => [...r]));
    grid.activeLayer  = s.activeLayer;
    grid.layerNames   = [...s.layerNames];
    grid.layerVisible = [...s.layerVisible];
    return true;
  }

  canUndo() { return this._history.length > 0; }
  clear()   { this._history = []; }
}
