(function (root) {
  'use strict';
  const key = (piece) => piece.sourceId || piece.id;
  const remaining = (composition, placed) => {
    const used = new Set(placed.map(key));
    return composition.filter((piece) => !used.has(key(piece)));
  };
  const api = { key, remaining, complete: (composition, placed) => remaining(composition, placed).length === 0 };
  root.TangramInventory = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
