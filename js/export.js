/**
 * export.js — Export grid to Dota2 hero_grid_config.json
 */

class DotaExporter {
  /**
   * Build the JSON object for Dota2
   * @param {DotaGrid} grid
   * @param {object} opts
   *   configName   — string
   *   defaultSymbol — string (fallback label)
   * @returns {object} — the config object
   */
  build(grid, opts = {}) {
    const {
      configName    = 'Custom',
      defaultSymbol = '.',
    } = opts;

    const cells = grid.getAllCells();
    const categories = cells.map(({ col, row, symbol }) => {
      const { x, y } = grid.toDota(col, row);
      return {
        category_name: symbol || defaultSymbol,
        x_position: parseFloat(x.toFixed(6)),
        y_position: parseFloat(y.toFixed(6)),
        width:  30.0,
        height: 30.0,
        hero_ids: [],
      };
    });

    return {
      version: 3,
      configs: [
        {
          config_name: configName,
          categories,
        },
      ],
    };
  }

  /**
   * Trigger a browser download of the JSON file
   * @param {DotaGrid} grid
   * @param {object} opts — same as build()
   * @param {string} filename
   */
  download(grid, opts = {}, filename = 'hero_grid_config.json') {
    const data = this.build(grid, opts);
    const json = JSON.stringify(data, null, '\t');
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return data.configs[0].categories.length;
  }

  /**
   * Count active (non-null) cells across all layers
   */
  countCells(grid) {
    return grid.getAllCells().length;
  }
}
