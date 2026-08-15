(function (root) {
  'use strict';
  const stage = ({ locked, setupStep, silhouetteValidated }) => locked
    ? (silhouetteValidated ? 'print' : 'silhouette')
    : (setupStep === 'composition' ? 'composition' : 'size');
  const canEnter = (target, { hasComposition, compositionDirty, silhouetteValid }) => target === 'silhouette'
    ? hasComposition && !compositionDirty
    : target === 'print' ? silhouetteValid : true;
  const api = { stage, canEnter };
  root.TangramWorkflow = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
