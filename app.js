(() => {
  'use strict';
  const G = window.TangramGeometry;
  const Inventory = window.TangramInventory;
  const Workflow = window.TangramWorkflow;
  const Saved = window.TangramLibrary;
  const svgNS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const page = $('page');
  const piecesLayer = $('pieces');
  const selectionLayer = $('selectionOverlay');
  const guidesLayer = $('guides');
  const dimensionsLayer = $('dimensions');
  const labels = {
    triangle: 'Triangle rectangle isocèle', square: 'Carré', rectangle: 'Rectangle',
    diamond: 'Losange', parallelogram: 'Parallélogramme', trapezoid: 'Trapèze',
  };
  const classicQuantities = { triangle: 5, square: 1, rectangle: 0, diamond: 0, parallelogram: 1, trapezoid: 0 };
  const controls = {
    side: $('zoneSide'), seed: $('seed'), name: $('silhouetteName'), select: $('silhouetteSelect'),
    snapPieces: $('snapPieces'), snapGrid: $('snapGrid'),
  };
  let state = {
    side: 140, margin: 10, grid: 5, seed: 'tangram-001', quantities: { ...classicQuantities },
    composition: [], silhouettes: [], activeSilhouetteId: null, selectedId: null,
    locked: false, dirty: true, phase: 'composition', setupStep: 'size', printTarget: null, projectLibraryId: null,
  };
  let drag = null;
  let libraryDrag = null;
  let savedRecords = Saved.read();
  let libraryDirty = false;
  let driveMode = 'tangrams';
  let currentView = 'home';
  let viewHistory = [];
  const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const round = (value) => Math.round(value * 10) / 10;
  const pageSize = () => ({ width: 210, height: 297 });
  const zone = () => ({ x: (210 - state.side) / 2, y: (297 - state.side) / 2, width: state.side, height: state.side });
  const printableZone = () => ({ x: state.margin, y: state.margin, width: 210 - state.margin * 2, height: 297 - state.margin * 2 });
  const activeSilhouette = () => state.silhouettes.find((item) => item.id === state.activeSilhouetteId);
  const currentPieces = () => state.printTarget === 'composition' || state.phase === 'composition' ? state.composition : (activeSilhouette()?.pieces || []);
  const selected = () => currentPieces().find((piece) => piece.id === state.selectedId);
  const copyPieces = (pieces) => pieces.map((piece) => ({ ...piece, id: id(), sourceId: piece.sourceId || piece.id, local: piece.local.map((point) => ({ ...point })) }));

  function readQuantities(updateInputs = true) {
    const quantities = {};
    document.querySelectorAll('[data-count]').forEach((input) => {
      quantities[input.dataset.count] = Math.max(0, Math.min(100, Math.floor(Number(input.value) || 0)));
      if (updateInputs) input.value = quantities[input.dataset.count];
    });
    return quantities;
  }

  function writeQuantities(quantities) {
    document.querySelectorAll('[data-count]').forEach((input) => { input.value = quantities[input.dataset.count] || 0; });
  }

  function requestedZone() {
    const side = Math.max(30, Math.min(190, Number(controls.side.value) || state.side));
    return { x: (210 - side) / 2, y: (297 - side) / 2, width: side, height: side };
  }

  function status(message, error = false) {
    $('status').textContent = message;
    $('status').classList.toggle('error', error);
  }

  function htmlElement(name, text, className) {
    const node = document.createElement(name);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function svgElement(name, attributes = {}) {
    const node = document.createElementNS(svgNS, name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function validateComposition() {
    const requested = readQuantities(false);
    const analysis = G.analyzeTiling(requested, requestedZone());
    const panel = $('compositionValidation');
    panel.replaceChildren();
    panel.classList.toggle('invalid', !analysis.valid);
    panel.append(analysis.valid ? '✓ Combinaison valide.' : 'Combinaison impossible. Essayez :');
    analysis.suggestions.forEach((suggestion) => {
      const changes = Object.keys(labels).filter((type) => suggestion[type] !== requested[type]).map((type) => {
        const difference = suggestion[type] - requested[type];
        return `${difference > 0 ? 'Ajouter' : 'Retirer'} ${Math.abs(difference)} ${labels[type]}`;
      });
      const button = htmlElement('button', changes.join(' + '));
      button.type = 'button';
      button.addEventListener('click', () => {
        writeQuantities(suggestion);
        state.dirty = true;
        validateComposition();
      });
      panel.append(button);
    });
    $('generate').disabled = !analysis.valid || state.locked;
    return analysis.valid;
  }

  function renderPage() {
    controls.side.value = round(state.side);
    $('zoneWidth').value = state.side;
    $('zoneHeight').value = state.side;
    page.setAttribute('viewBox', '0 0 210 297');
    page.setAttribute('width', '210mm');
    page.setAttribute('height', '297mm');
    page.style.setProperty('--page-width', '210mm');
    page.style.setProperty('--page-height', '297mm');
    $('pageStyle').textContent = '@page { size: A4 portrait; margin: 0; }';
    $('pageLabel').textContent = 'A4 · 210 × 297 mm';
    $('printable').setAttribute('x', state.margin);
    $('printable').setAttribute('y', state.margin);
    $('printable').setAttribute('width', 210 - state.margin * 2);
    $('printable').setAttribute('height', 297 - state.margin * 2);
    $('minorGrid').setAttribute('width', state.grid);
    $('minorGrid').setAttribute('height', state.grid);
    $('gridPath').setAttribute('d', `M ${state.grid} 0 L 0 0 0 ${state.grid}`);
    const currentZone = zone();
    $('tangramZone').setAttribute('x', currentZone.x);
    $('tangramZone').setAttribute('y', currentZone.y);
    $('tangramZone').setAttribute('width', currentZone.width);
    $('tangramZone').setAttribute('height', currentZone.height);
    $('zoneLabel').textContent = `Carré ${round(state.side)} mm`;
  }

  function overlapIds(pieces) {
    const overlaps = new Set();
    for (let first = 0; first < pieces.length; first++) for (let second = first + 1; second < pieces.length; second++) {
      if (G.polygonsOverlap(G.points(pieces[first]), G.points(pieces[second]))) {
        overlaps.add(pieces[first].id);
        overlaps.add(pieces[second].id);
      }
    }
    return overlaps;
  }

  function appendBlackSilhouette(layer, pieces) {
    layer.append(svgElement('path', { d: G.silhouettePath(pieces), fill: '#000000', stroke: 'none', class: 'silhouette-print' }));
    const seams = G.sharedEdges(pieces, .05);
    if (seams.length) layer.append(svgElement('path', {
      d: seams.map((edge) => `M ${edge.start.x} ${edge.start.y} L ${edge.end.x} ${edge.end.y}`).join(' '),
      fill: 'none', stroke: '#000000', 'stroke-width': '.4', 'stroke-linecap': 'butt', class: 'silhouette-seams',
    }));
  }

  function renderPieces() {
    piecesLayer.replaceChildren();
    const pieces = currentPieces();
    const overlaps = state.phase === 'silhouette' && !state.printTarget ? overlapIds(pieces) : new Set();
    const printingSilhouette = state.printTarget === 'silhouette';
    if (printingSilhouette) appendBlackSilhouette(piecesLayer, pieces);
    else pieces.forEach((piece) => {
      const polygon = svgElement('polygon', {
        points: G.points(piece).map((point) => `${point.x},${point.y}`).join(' '), fill: piece.color,
        class: `piece${piece.id === state.selectedId ? ' selected' : ''}${overlaps.has(piece.id) ? ' overlap' : ''}`,
        tabindex: '0', 'data-id': piece.id,
      });
      const title = svgElement('title');
      title.textContent = piece.name;
      polygon.append(title);
      polygon.addEventListener('focus', () => select(piece.id));
      piecesLayer.append(polygon);
    });
    $('pieceCount').textContent = state.phase === 'silhouette' && !state.printTarget
      ? `${pieces.length} pièce${pieces.length === 1 ? '' : 's'} utilisée${pieces.length === 1 ? '' : 's'}`
      : `${pieces.length} pièce${pieces.length === 1 ? '' : 's'}`;
    renderSelection();
    dimensionsLayer.replaceChildren();
    renderSelectionOverlay();
  }

  function renderSelection() {
    const piece = selected();
    const enabled = state.phase === 'silhouette' && Boolean(piece);
    $('pieceFields').disabled = !enabled;
    $('selectionPanel').classList.toggle('muted', !enabled);
    $('pieceType').textContent = piece ? piece.name : 'Aucune';
    if (!piece) return;
    $('pieceName').value = piece.name;
    $('pieceX').value = round(piece.x);
    $('pieceY').value = round(piece.y);
    $('pieceWidth').value = round(piece.width);
    $('pieceHeight').value = round(piece.height);
    $('pieceRotation').value = round(piece.rotation);
    $('pieceColor').value = piece.color;
  }

  function renderSelectionOverlay() {
    selectionLayer.replaceChildren();
    const piece = selected();
    if (!piece || state.phase !== 'silhouette' || state.printTarget) return;
    const box = G.bounds(piece);
    const centerX = (box.minX + box.maxX) / 2;
    const handleY = Math.max(4, box.minY - 8);
    const toolbarWidth = 96;
    const toolbarX = Math.max(2, Math.min(210 - toolbarWidth - 2, centerX - toolbarWidth / 2));
    const toolbarY = box.minY > 27 ? box.minY - 20 : Math.min(287, box.maxY + 5);
    selectionLayer.append(
      svgElement('rect', { class: 'selection-box', x: box.minX - 1, y: box.minY - 1, width: box.maxX - box.minX + 2, height: box.maxY - box.minY + 2 }),
      svgElement('line', { class: 'rotation-stem', x1: centerX, y1: box.minY - 1, x2: centerX, y2: handleY }),
      svgElement('circle', { class: 'rotation-handle', cx: centerX, cy: handleY, r: 2.6, 'data-direct-action': 'rotate-handle', role: 'button', tabindex: '0', 'aria-label': 'Tourner la pièce' }),
    );
    const toolbar = svgElement('g', { class: 'shape-toolbar', transform: `translate(${toolbarX} ${toolbarY})` });
    toolbar.append(svgElement('rect', { class: 'toolbar-background', width: toolbarWidth, height: 9, rx: 2.5 }));
    [['rotate-left', '↶ 15°', 'Tourner de 15 degrés à gauche'], ['rotate-right', '15° ↷', 'Tourner de 15 degrés à droite'], ['rotate-left-45', '↶ 45°', 'Tourner de 45 degrés à gauche'], ['rotate-right-45', '45° ↷', 'Tourner de 45 degrés à droite'], ['flip', '⇋', 'Retourner la pièce'], ['return', '↩', 'Remettre dans la bibliothèque']].forEach(([action, label, title], index) => {
      const tool = svgElement('g', { class: 'direct-tool', transform: `translate(${index * 16} 0)`, 'data-direct-action': action, role: 'button', tabindex: '0', 'aria-label': title });
      tool.append(svgElement('rect', { width: 16, height: 9, rx: 2 }), svgElement('text', { x: 8, y: 5.8, 'text-anchor': 'middle' }));
      tool.lastChild.textContent = label;
      toolbar.append(tool);
    });
    const angle = svgElement('text', { class: 'angle-label', x: centerX + 4, y: handleY + 1.2 });
    angle.textContent = `${round(piece.rotation)}°`;
    selectionLayer.append(toolbar, angle);
  }

  function renderWorkflow() {
    const silhouette = activeSilhouette();
    const stage = Workflow.stage({ locked: state.locked, setupStep: state.setupStep, silhouetteValidated: silhouette?.validated });
    document.body.dataset.phase = state.phase;
    document.body.dataset.stage = stage;
    $('sizePanel').hidden = stage !== 'size';
    $('compositionPanel').hidden = stage !== 'composition';
    $('silhouettePanel').hidden = stage !== 'silhouette';
    $('finishPanel').hidden = stage !== 'print';
    const stages = ['size', 'composition', 'silhouette', 'print'];
    const activeIndex = stages.indexOf(stage);
    ['stepSize', 'stepComposition', 'stepSilhouette', 'stepPrint'].forEach((stepId, index) => {
      $(stepId).className = index < activeIndex ? 'done' : index === activeIndex ? 'active' : '';
    });
    $('clear').hidden = stage === 'size' && !state.composition.length;
    $('modeLabel').textContent = { size: 'Choisir la taille', composition: 'Créer la composition', silhouette: 'Créer la silhouette', print: 'Prêt à imprimer' }[stage];
    $('printSilhouette').disabled = !silhouette?.validated;
  }

  function renderSilhouetteList() {
    controls.select.replaceChildren(...state.silhouettes.map((silhouette) => {
      const option = htmlElement('option', silhouette.name);
      option.value = silhouette.id;
      option.selected = silhouette.id === state.activeSilhouetteId;
      return option;
    }));
    const silhouette = activeSilhouette();
    controls.name.value = silhouette?.name || '';
    $('deleteSilhouette').disabled = state.silhouettes.length <= 1;
  }

  function renderLibrary() {
    const silhouette = activeSilhouette();
    const remaining = Inventory.remaining(state.composition, silhouette?.pieces || []);
    const previewSize = Math.max(...state.composition.map((piece) => { const box = G.bounds(piece); return Math.max(box.maxX - box.minX, box.maxY - box.minY); }));
    $('libraryCount').textContent = `${remaining.length} disponible${remaining.length === 1 ? '' : 's'}`;
    $('pieceLibrary').replaceChildren(...remaining.map((source) => {
      const card = htmlElement('button', '', 'library-piece');
      const points = G.points(source);
      const box = G.bounds(source);
      const centerX = (box.minX + box.maxX) / 2;
      const centerY = (box.minY + box.maxY) / 2;
      const preview = svgElement('svg', { viewBox: `${centerX - previewSize / 2} ${centerY - previewSize / 2} ${previewSize} ${previewSize}`, 'aria-hidden': 'true' });
      preview.append(svgElement('polygon', { points: points.map((point) => `${point.x},${point.y}`).join(' '), fill: source.color }));
      card.type = 'button';
      card.dataset.sourceId = Inventory.key(source);
      card.title = source.name;
      card.setAttribute('aria-label', source.name);
      card.append(preview);
      return card;
    }));
  }

  function savedProject(silhouette) {
    return structuredClone({
      version: 5, generatorVersion: 2, side: state.side, seed: state.seed, quantities: state.quantities,
      composition: state.composition, locked: true, silhouettes: [{ ...silhouette, validated: false }],
    });
  }

  function persistProject() {
    if (!state.composition.length) return;
    state.projectLibraryId ||= id();
    const record = {
      id: state.projectLibraryId, name: `Tangram ${state.seed}`, updatedAt: Date.now(),
      project: structuredClone({ version: 5, generatorVersion: 2, side: state.side, seed: state.seed, quantities: state.quantities, composition: state.composition, locked: true, silhouettes: [] }),
    };
    savedRecords = Saved.upsert(savedRecords, record);
    Saved.write(savedRecords);
    Saved.put(record);
  }

  function persistSilhouette(silhouette = activeSilhouette()) {
    if (!silhouette) return;
    if (!silhouette.pieces.length) {
      if (silhouette.libraryId) { savedRecords = Saved.remove(savedRecords, silhouette.libraryId); Saved.erase(silhouette.libraryId); }
      silhouette.libraryId = null;
    } else {
      silhouette.libraryId ||= silhouette.id;
      const record = {
        id: silhouette.libraryId, name: silhouette.name, updatedAt: Date.now(), project: savedProject(silhouette),
      };
      savedRecords = Saved.upsert(savedRecords, record);
      Saved.put(record);
    }
    Saved.write(savedRecords);
    libraryDirty = false;
  }

  function previewSvg(pieces, silhouette = false) {
      const points = pieces.flatMap((piece) => { try { return G.points(piece); } catch { return []; } });
      const minX = points.length ? Math.min(...points.map((point) => point.x)) : 0;
      const minY = points.length ? Math.min(...points.map((point) => point.y)) : 0;
      const maxX = points.length ? Math.max(...points.map((point) => point.x)) : 1;
      const maxY = points.length ? Math.max(...points.map((point) => point.y)) : 1;
      const padding = Math.max(maxX - minX, maxY - minY, 1) * .08;
      const preview = svgElement('svg', { viewBox: `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`, 'aria-hidden': 'true' });
      if (silhouette) preview.append(svgElement('path', { d: G.silhouettePath(pieces), fill: '#183137' }));
      else pieces.forEach((piece) => preview.append(svgElement('polygon', { points: G.points(piece).map((point) => `${point.x},${point.y}`).join(' '), fill: piece.color, stroke: '#183137', 'stroke-width': '.35' })));
      return preview;
  }

  function silhouetteCard(record) {
      const pieces = record.project?.silhouettes?.[0]?.pieces || [];
      const card = htmlElement('article', '', 'drive-card');
      card.dataset.libraryId = record.id;
      const previewButton = htmlElement('button', '', 'drive-preview');
      previewButton.type = 'button';
      previewButton.dataset.savedAction = 'edit';
      previewButton.setAttribute('aria-label', `Modifier ${record.name}`);
      previewButton.append(previewSvg(pieces, true));
      const info = htmlElement('div', '', 'drive-card-info');
      info.append(htmlElement('strong', record.name));
      info.append(htmlElement('p', `${pieces.length} pièce${pieces.length === 1 ? '' : 's'} utilisée${pieces.length === 1 ? '' : 's'}`, 'drive-meta'));
      const actions = htmlElement('div', '', 'drive-actions');
      [['edit', 'Modifier'], ['print', 'Imprimer'], ['delete', '×']].forEach(([action, label]) => {
        const button = htmlElement('button', label);
        button.type = 'button';
        button.dataset.savedAction = action;
        button.setAttribute('aria-label', `${label} ${record.name}`);
        if (action === 'delete') button.className = 'danger';
        if (action === 'print') button.disabled = !G.inspectSilhouette(pieces, .15).valid;
        actions.append(button);
      });
      info.append(actions);
      card.append(previewButton, info);
      return card;
  }

  function projectCard(group) {
    const pieces = group.project.composition || [];
    const card = htmlElement('article', '', 'drive-card');
    card.dataset.projectId = group.id;
    const previewButton = htmlElement('button', '', 'drive-preview');
    previewButton.type = 'button';
    previewButton.dataset.projectAction = 'open';
    previewButton.setAttribute('aria-label', `Ouvrir ${group.name}`);
    previewButton.append(previewSvg(pieces));
    const info = htmlElement('div', '', 'drive-card-info');
    info.append(htmlElement('strong', group.name));
    info.append(htmlElement('p', `${round(group.project.side)} mm · ${pieces.length} pièces · ${group.project.silhouettes.length} silhouette${group.project.silhouettes.length === 1 ? '' : 's'}`, 'drive-meta'));
    const actions = htmlElement('div', '', 'drive-actions');
    [['open', 'Ouvrir'], ['print', 'Imprimer'], ['delete', '×']].forEach(([action, label]) => {
      const button = htmlElement('button', label);
      button.type = 'button';
      button.dataset.projectAction = action;
      button.setAttribute('aria-label', `${label} ${group.name}`);
      if (action === 'delete') button.className = 'danger';
      actions.append(button);
    });
    info.append(actions);
    card.append(previewButton, info);
    return card;
  }

  function renderSavedLibrary() {
    const query = ($('driveSearch').value || '').trim().toLocaleLowerCase('fr');
    const silhouettes = savedRecords.filter((record) => record.project?.silhouettes?.[0]?.pieces?.length);
    const projects = Saved.projects(savedRecords);
    $('homeTangramEmpty').hidden = projects.length > 0;
    $('homeTangrams').replaceChildren(...projects.map(projectCard));
    const recent = silhouettes.slice(0, 4);
    $('homeEmpty').hidden = recent.length > 0;
    $('homeSilhouettes').replaceChildren(...recent.map(silhouetteCard));
    const entries = driveMode === 'tangrams' ? Saved.projects(savedRecords) : silhouettes;
    const filtered = entries.filter((entry) => entry.name.toLocaleLowerCase('fr').includes(query));
    $('driveTitle').textContent = driveMode === 'tangrams' ? 'Mes tangrams' : 'Mes silhouettes';
    $('driveSubtitle').textContent = driveMode === 'tangrams' ? 'Vos compositions et leurs silhouettes.' : 'Toutes vos créations prêtes à modifier ou imprimer.';
    $('driveEmpty').hidden = filtered.length > 0;
    $('driveGrid').replaceChildren(...filtered.map((entry) => driveMode === 'tangrams' ? projectCard(entry) : silhouetteCard(entry)));
  }

  function openSavedSilhouette(record) {
    const project = validatedProject(record.project);
    const silhouette = project.silhouettes[0];
    silhouette.libraryId = record.id;
    silhouette.name = record.name;
    state = { ...state, ...project, activeSilhouetteId: silhouette.id, selectedId: null, dirty: false, phase: 'silhouette', setupStep: 'composition' };
    controls.seed.value = state.seed;
    writeQuantities(state.quantities);
    showView('editor');
    renderAll();
    status(`« ${record.name} » est ouverte dans l’éditeur.`);
  }

  function openSavedProject(group) {
    const project = validatedProject(group.project);
    project.silhouettes.forEach((silhouette, index) => { silhouette.libraryId = group.project.silhouettes[index]?.libraryId; });
    if (!project.silhouettes.length) project.silhouettes.push({ id: id(), name: 'Silhouette 1', pieces: [], validated: false });
    state = { ...state, ...project, projectLibraryId: group.projectRecordId || null, activeSilhouetteId: project.silhouettes[0].id, selectedId: null, dirty: false, locked: true, phase: 'silhouette', setupStep: 'composition' };
    controls.seed.value = state.seed;
    writeQuantities(state.quantities);
    showView('editor');
    renderAll();
    status(`${group.name} est ouvert.`);
  }

  function showView(view, mode = driveMode, remember = true) {
    if (libraryDirty) persistSilhouette();
    if (remember && (view !== currentView || mode !== driveMode)) viewHistory.push({ view: currentView, mode: driveMode });
    currentView = view;
    driveMode = mode;
    document.body.dataset.view = view;
    $('homeView').hidden = view !== 'home';
    $('driveView').hidden = view !== 'drive';
    $('editorView').hidden = view !== 'editor';
    $('navHome').classList.toggle('active', view === 'home');
    $('navTangrams').classList.toggle('active', view === 'drive' && mode === 'tangrams');
    $('navBack').hidden = view === 'home';
    renderSavedLibrary();
  }

  function goHome() {
    viewHistory = [];
    showView('home', driveMode, false);
  }

  function goBack() {
    const previous = viewHistory.pop() || { view: 'home', mode: driveMode };
    showView(previous.view, previous.mode, false);
  }

  function startNewProject() {
    state = {
      ...state, side: 140, seed: 'tangram-001', quantities: { ...classicQuantities }, composition: [], silhouettes: [],
      activeSilhouetteId: null, selectedId: null, locked: false, dirty: true, phase: 'composition', setupStep: 'size', printTarget: null, projectLibraryId: null,
    };
    controls.side.value = 140;
    controls.seed.value = state.seed;
    writeQuantities(classicQuantities);
    showView('editor');
    renderAll();
    status('Choisissez la taille, puis cliquez sur « Composition ».');
  }

  function renderSilhouetteValidation() {
    const silhouette = activeSilhouette();
    const panel = $('silhouetteValidation');
    if (!silhouette) return;
    const inspection = G.inspectSilhouette(silhouette.pieces, .15);
    const valid = inspection.valid;
    panel.classList.toggle('invalid', !valid);
    panel.textContent = inspection.overlaps ? 'Des pièces se chevauchent.' : !silhouette.pieces.length ? 'Glissez au moins une pièce sur la feuille.' : silhouette.validated ? '✓ Silhouette validée et prête à imprimer.' : '✓ Placement correct. Cliquez sur Imprimer.';
    $('printSilhouette').disabled = !silhouette.validated;
  }

  function renderAll() {
    if (libraryDirty) persistSilhouette();
    renderWorkflow();
    renderPage();
    renderPieces();
    if (state.locked) {
      renderSilhouetteList();
      renderLibrary();
      renderSilhouetteValidation();
    } else if (state.setupStep === 'composition') validateComposition();
    renderSavedLibrary();
  }

  function select(pieceId) {
    state.selectedId = pieceId;
    renderPieces();
  }

  function generateComposition() {
    if (!validateComposition()) return false;
    try {
      const seed = controls.seed.value.trim().slice(0, 80);
      if (!seed) throw new Error();
      const target = requestedZone();
      const result = G.generateTiling(readQuantities(), target, seed);
      const counters = {};
      state.composition = result.pieces.map((piece) => {
        counters[piece.type] = (counters[piece.type] || 0) + 1;
        return { ...piece, id: id(), name: `${labels[piece.type]} ${counters[piece.type]}` };
      });
      state.side = target.width;
      state.seed = seed;
      state.quantities = result.accepted;
      state.silhouettes = [];
      state.activeSilhouetteId = null;
      state.selectedId = null;
      state.projectLibraryId = null;
      state.dirty = false;
      writeQuantities(state.quantities);
      persistProject();
      renderAll();
      status(`Aperçu prêt : ${state.composition.length} pièces. Cliquez sur « Silhouette » pour continuer.`);
      return true;
    } catch {
      status('Impossible de générer cette composition.', true);
      return false;
    }
  }

  function createSilhouette(name = `Silhouette ${state.silhouettes.length + 1}`) {
    const silhouette = { id: id(), name, pieces: [], validated: false };
    state.silhouettes.push(silhouette);
    state.activeSilhouetteId = silhouette.id;
    state.selectedId = null;
    return silhouette;
  }

  function lockComposition() {
    if (state.dirty || !state.composition.length) return;
    state.locked = true;
    state.phase = 'silhouette';
    if (!state.silhouettes.length) createSilhouette();
    renderAll();
    status('Composition figée. Glissez les pièces de la bibliothèque sur la feuille.');
  }

  function unlockComposition(nextStep = 'composition') {
    if (state.silhouettes.some((silhouette) => silhouette.pieces.length) && !confirm('Revenir en arrière supprimera les silhouettes. Continuer ?')) return false;
    state.locked = false;
    state.phase = 'composition';
    state.setupStep = nextStep;
    state.silhouettes = [];
    state.activeSilhouetteId = null;
    state.selectedId = null;
    if (nextStep === 'size') { state.composition = []; state.dirty = true; }
    renderAll();
    return true;
  }

  function navigateTo(target) {
    if (target === 'size') {
      if (state.locked && !unlockComposition('size')) return;
      if (!state.locked) { state.setupStep = 'size'; state.composition = []; state.dirty = true; renderAll(); }
      status('Choisissez la taille, puis cliquez sur « Composition ».');
      return;
    }
    if (target === 'composition') {
      if (state.locked && !unlockComposition('composition')) return;
      state.side = requestedZone().width;
      state.setupStep = 'composition';
      renderAll();
      status('Générez un aperçu, puis cliquez sur « Silhouette ».');
      return;
    }
    if (target === 'silhouette') {
      if (state.locked) {
        const silhouette = activeSilhouette();
        if (silhouette) silhouette.validated = false;
        renderAll();
        status('Créez votre silhouette, puis cliquez sur « Imprimer ».');
        return;
      }
      state.side = requestedZone().width;
      state.setupStep = 'composition';
      if (!Workflow.canEnter('silhouette', { hasComposition: state.composition.length > 0, compositionDirty: state.dirty, silhouetteValid: false }) && !generateComposition()) return;
      lockComposition();
      return;
    }
    const silhouette = activeSilhouette();
    const inspection = silhouette ? G.inspectSilhouette(silhouette.pieces, .15) : { valid: false };
    const silhouetteValid = Boolean(silhouette && inspection.valid);
    if (!state.locked || !Workflow.canEnter('print', { hasComposition: state.composition.length > 0, compositionDirty: state.dirty, silhouetteValid })) {
      if (!state.locked) navigateTo('silhouette');
      status('Placez au moins une pièce sans chevauchement avant d’imprimer.', true);
      return;
    }
    validateSilhouette();
  }

  function invalidateSilhouette() {
    const silhouette = activeSilhouette();
    if (silhouette) { silhouette.validated = false; libraryDirty = true; }
  }

  function pieceSnapshot(piece) {
    return { x: piece.x, y: piece.y, rotation: piece.rotation, local: piece.local.map((point) => ({ ...point })) };
  }

  function restorePiece(piece, snapshot) {
    piece.x = snapshot.x;
    piece.y = snapshot.y;
    piece.rotation = snapshot.rotation;
    piece.local = snapshot.local.map((point) => ({ ...point }));
  }

  function settlePiece(piece, previous) {
    const others = currentPieces().filter((other) => other !== piece);
    const wasOverlapping = others.some((other) => G.polygonsOverlap(G.points(piece), G.points(other)));
    const snap = G.smartSnap(piece, controls.snapPieces.checked ? others : [], controls.snapGrid.checked ? state.grid : 0, 3.5);
    piece.x += snap.dx;
    piece.y += snap.dy;
    G.translateInside(piece, printableZone());
    const correction = G.resolveOverlap(piece, others, printableZone(), 35, .5);
    if (!correction.resolved) {
      restorePiece(piece, previous);
      status('Aucune place libre proche : la position précédente est conservée.', true);
    } else if (wasOverlapping || Math.hypot(correction.dx, correction.dy) > .1) {
      status('Chevauchement corrigé automatiquement.');
    } else if (snap.kind) status(`Aimantation ${snap.kind === 'edge' ? 'sur une arête' : snap.kind === 'vertex' ? 'sur un sommet' : 'activée'}.`);
    invalidateSilhouette();
    renderPieces();
    renderSilhouetteValidation();
    persistSilhouette();
    renderSavedLibrary();
  }

  function moveSelected(dx, dy) {
    const piece = selected();
    if (!piece) return;
    const previous = pieceSnapshot(piece);
    piece.x += dx;
    piece.y += dy;
    G.translateInside(piece, printableZone());
    settlePiece(piece, previous);
  }

  function rotateSelected(angle) {
    const piece = selected();
    if (!piece) return;
    const previous = pieceSnapshot(piece);
    piece.rotation = (piece.rotation + angle + 360) % 360;
    if (!G.translateInside(piece, printableZone())) {
      restorePiece(piece, previous);
      status('Cette rotation dépasserait la zone imprimable.', true);
      return;
    }
    settlePiece(piece, previous);
  }

  function flipSelected() {
    const piece = selected();
    if (!piece) return;
    const previous = pieceSnapshot(piece);
    G.flipPiece(piece);
    settlePiece(piece, previous);
  }

  function svgPoint(event) {
    const point = page.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(page.getScreenCTM().inverse());
  }

  function placeLibraryPiece(sourceId, point) {
    const silhouette = activeSilhouette();
    const source = state.composition.find((piece) => Inventory.key(piece) === sourceId);
    if (!silhouette || !source || !Inventory.remaining(state.composition, silhouette.pieces).includes(source)) return false;
    const piece = copyPieces([source])[0];
    const box = G.bounds(piece);
    piece.x += point.x - (box.minX + box.maxX) / 2;
    piece.y += point.y - (box.minY + box.maxY) / 2;
    if (!G.translateInside(piece, printableZone())) return false;
    const snap = G.smartSnap(piece, controls.snapPieces.checked ? silhouette.pieces : [], controls.snapGrid.checked ? state.grid : 0, 3.5);
    piece.x += snap.dx;
    piece.y += snap.dy;
    G.translateInside(piece, printableZone());
    if (!G.resolveOverlap(piece, silhouette.pieces, printableZone(), 35, .5).resolved) {
      status('Aucune place libre proche pour cette pièce.', true);
      return false;
    }
    silhouette.pieces.push(piece);
    invalidateSilhouette();
    state.selectedId = piece.id;
    renderAll();
    status('Pièce placée. Vous pouvez la déplacer, la tourner ou la retourner.');
    return true;
  }

  function returnSelectedToLibrary() {
    const silhouette = activeSilhouette();
    const piece = selected();
    if (!silhouette || !piece) return;
    silhouette.pieces = silhouette.pieces.filter((item) => item !== piece);
    invalidateSilhouette();
    state.selectedId = null;
    renderAll();
    status('Pièce remise dans la bibliothèque.');
  }

  function showGuides(piece, snap) {
    guidesLayer.replaceChildren();
    const box = G.bounds(piece);
    if (snap.guide?.type === 'edge') guidesLayer.append(svgElement('line', { class: 'edge-guide', x1: snap.guide.start.x, y1: snap.guide.start.y, x2: snap.guide.end.x, y2: snap.guide.end.y }));
    else if (snap.guide?.type === 'point') guidesLayer.append(svgElement('circle', { class: 'vertex-guide', cx: snap.guide.point.x, cy: snap.guide.point.y, r: 2.3 }));
    else if (snap.kind === 'grid') {
      guidesLayer.append(svgElement('line', { x1: box.minX, y1: 0, x2: box.minX, y2: 297 }), svgElement('line', { x1: 0, y1: box.minY, x2: 210, y2: box.minY }));
    }
    if (snap.kind) {
      const label = svgElement('text', { class: 'snap-label', x: Math.min(196, box.maxX + 3), y: Math.max(6, box.minY) });
      label.textContent = snap.kind === 'edge' ? 'Arête' : snap.kind === 'vertex' ? 'Sommet' : snap.kind === 'vertex-edge' ? 'Sommet → arête' : 'Grille';
      guidesLayer.append(label);
    }
  }

  function startDrag(event) {
    const action = event.target.closest('[data-direct-action]')?.dataset.directAction;
    if (action === 'rotate-handle' && selected() && state.phase === 'silhouette') {
      const piece = selected();
      const start = svgPoint(event);
      drag = { mode: 'rotate', pointerId: event.pointerId, piece, start, rotation: piece.rotation, center: { x: piece.x + piece.width / 2, y: piece.y + piece.height / 2 }, previous: pieceSnapshot(piece) };
      page.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (action) return;
    const polygon = event.target.closest('.piece');
    if (!polygon || state.phase !== 'silhouette' || state.printTarget) {
      if (state.phase === 'silhouette' && !state.printTarget) select(null);
      return;
    }
    select(polygon.dataset.id);
    const piece = selected();
    const start = svgPoint(event);
    drag = { mode: 'move', pointerId: event.pointerId, piece, start, x: piece.x, y: piece.y, previous: pieceSnapshot(piece) };
    page.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function continueDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const point = svgPoint(event);
    if (drag.mode === 'rotate') {
      const previous = drag.piece.rotation;
      drag.piece.rotation = G.rotationFromPointer(drag.rotation, drag.center, drag.start, point, event.shiftKey ? 15 : 1);
      if (!G.translateInside(drag.piece, printableZone())) drag.piece.rotation = previous;
      invalidateSilhouette();
      renderPieces();
      return;
    }
    drag.piece.x = drag.x + point.x - drag.start.x;
    drag.piece.y = drag.y + point.y - drag.start.y;
    G.translateInside(drag.piece, printableZone());
    const others = controls.snapPieces.checked ? currentPieces().filter((piece) => piece !== drag.piece) : [];
    const snap = G.smartSnap(drag.piece, others, controls.snapGrid.checked ? state.grid : 0, 3.5);
    drag.piece.x += snap.dx;
    drag.piece.y += snap.dy;
    G.translateInside(drag.piece, printableZone());
    invalidateSilhouette();
    renderPieces();
    showGuides(drag.piece, snap);
  }

  function stopDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = null;
    guidesLayer.replaceChildren();
    settlePiece(finished.piece, finished.previous);
  }

  function validateSilhouette() {
    const silhouette = activeSilhouette();
    if (!silhouette) return;
    const inspection = G.inspectSilhouette(silhouette.pieces, .15);
    silhouette.validated = inspection.valid;
    if (silhouette.validated) state.selectedId = null;
    renderAll();
    status(silhouette.validated ? 'Silhouette validée. Elle est prête à imprimer.' : 'Placez au moins une pièce sans chevauchement avant d’imprimer.', !silhouette.validated);
  }

  function printView(target) {
    if (target === 'silhouette' && !activeSilhouette()?.validated) {
      status('Validez la silhouette avant de l’imprimer.', true);
      return;
    }
    state.printTarget = target;
    document.body.classList.toggle('print-silhouette', target === 'silhouette');
    document.body.classList.toggle('print-composition', target === 'composition');
    renderPieces();
    const clone = page.cloneNode(true);
    clone.querySelectorAll('.screen-only,.dimensions').forEach((node) => node.remove());
    if (target === 'silhouette') clone.querySelector('#zoneLayer')?.remove();
    const title = target === 'silhouette' ? 'Silhouette noire' : 'Rangement du tangram';
    printPage(title, clone);
    finishPrint();
  }

  function printPage(title, clone) {
    const printDocument = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title><style>
      @page { size: A4 portrait; margin: 0; }
      html, body { width: 210mm; height: 297mm; margin: 0; background: white; }
      svg { display: block; width: 210mm; height: 297mm; }
      .piece { stroke: #183137; stroke-width: .25; vector-effect: non-scaling-stroke; }
      .silhouette-print { fill: #000; stroke: none; }
      .silhouette-seams { fill: none; stroke: #000; stroke-width: .4; stroke-linecap: butt; }
      .tangram-zone { fill: #fdfbf3; stroke: #173f43; stroke-width: .7; }
      .calibration { stroke: #263e41; stroke-width: .35; fill: #263e41; font-size: 2.8px; }
      .calibration text { stroke: none; }
    </style></head><body>${new XMLSerializer().serializeToString(clone)}</body></html>`;
    document.querySelector('.print-frame')?.remove();
    const printFrame = htmlElement('iframe', '', 'print-frame');
    printFrame.title = title;
    printFrame.setAttribute('aria-hidden', 'true');
    printFrame.srcdoc = printDocument;
    printFrame.addEventListener('load', () => {
      const printWindow = printFrame.contentWindow;
      printWindow.addEventListener('afterprint', () => printFrame.remove(), { once: true });
      printWindow.focus();
      printWindow.print();
    }, { once: true });
    document.body.append(printFrame);
    status('Boîte d’impression ouverte.');
  }

  function printSavedSilhouette(record) {
    const project = validatedProject(record.project);
    const pieces = project.silhouettes[0]?.pieces || [];
    if (!G.inspectSilhouette(pieces, .15).valid) return;
    const clone = page.cloneNode(true);
    clone.querySelectorAll('.screen-only,.dimensions').forEach((node) => node.remove());
    clone.querySelector('#zoneLayer')?.remove();
    const layer = clone.querySelector('#pieces');
    layer.replaceChildren();
    appendBlackSilhouette(layer, pieces);
    printPage('Silhouette noire', clone);
  }

  function printSavedComposition(group) {
    const project = validatedProject(group.project);
    const clone = page.cloneNode(true);
    clone.querySelectorAll('.screen-only,.dimensions').forEach((node) => node.remove());
    const currentZone = { x: (210 - project.side) / 2, y: (297 - project.side) / 2 };
    const zoneRect = clone.querySelector('#tangramZone');
    Object.entries({ x: currentZone.x, y: currentZone.y, width: project.side, height: project.side }).forEach(([key, value]) => zoneRect.setAttribute(key, value));
    const layer = clone.querySelector('#pieces');
    layer.replaceChildren(...project.composition.map((piece) => svgElement('polygon', {
      points: G.points(piece).map((point) => `${point.x},${point.y}`).join(' '), fill: piece.color, class: 'piece',
    })));
    printPage('Rangement du tangram', clone);
  }

  function finishPrint() {
    state.printTarget = null;
    document.body.classList.remove('print-silhouette', 'print-composition');
    renderPieces();
  }

  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveProject() {
    download('mon-tangram.json', JSON.stringify({
      version: 5, generatorVersion: 2, side: state.side, seed: state.seed, quantities: state.quantities,
      composition: state.composition, locked: state.locked, silhouettes: state.silhouettes,
    }, null, 2), 'application/json');
    status('Projet sauvegardé.');
  }

  function parsePiece(item) {
    const numeric = (value, min, max) => {
      value = Number(value);
      if (!Number.isFinite(value) || value < min || value > max) throw new Error();
      return value;
    };
    if (!labels[item?.type] || !Array.isArray(item.local) || item.local.length < 3 || item.local.length > 12) throw new Error();
    return {
      ...G.createPiece(item.type, {
        name: String(item.name || labels[item.type]).slice(0, 40),
        color: /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : '#f4a261',
        local: item.local.map((point) => ({ x: numeric(point.x, -10, 10), y: numeric(point.y, -10, 10) })),
        x: numeric(item.x, -5000, 5000), y: numeric(item.y, -5000, 5000),
        width: numeric(item.width, .1, 5000), height: numeric(item.height, .1, 5000), rotation: numeric(item.rotation, -36000, 36000),
      }),
      id: id(), sourceId: String(item.sourceId || item.id || id()).slice(0, 100),
    };
  }

  function validatedProject(raw) {
    if (!raw || ![1, 2, 3, 4, 5].includes(raw.version)) throw new Error();
    const side = Math.max(30, Math.min(190, Number(raw.side ?? raw.zoneWidth ?? 140)));
    const source = raw.composition || raw.pieces;
    if (!Array.isArray(source) || !source.length || source.length > 100) throw new Error();
    const composition = source.map(parsePiece);
    const target = { x: (210 - side) / 2, y: (297 - side) / 2, width: side, height: side };
    const verification = G.verifyTiling(composition, target);
    if (!verification.inside || verification.coverage !== 1) throw new Error();
    const quantities = Object.fromEntries(Object.keys(labels).map((type) => [type, composition.filter((piece) => piece.type === type).length]));
    const silhouettes = raw.version >= 4 && Array.isArray(raw.silhouettes) ? raw.silhouettes.slice(0, 30).map((item, index) => {
      if (!Array.isArray(item.pieces) || item.pieces.length > composition.length) throw new Error();
      const pieces = item.pieces.map(parsePiece);
      if (new Set(pieces.map((piece) => piece.sourceId)).size !== pieces.length) throw new Error();
      pieces.forEach((piece) => {
        const master = composition.find((sourcePiece) => Inventory.key(sourcePiece) === piece.sourceId);
        if (!master || piece.type !== master.type || Math.abs(G.area(G.points(piece)) - G.area(G.points(master))) > 1e-4) throw new Error();
      });
      return { id: id(), name: String(item.name || `Silhouette ${index + 1}`).slice(0, 40), pieces, validated: false };
    }) : [];
    return { side, composition, quantities, silhouettes, seed: String(raw.seed || 'projet-importe').slice(0, 80), locked: Boolean(raw.locked && silhouettes.length) };
  }

  async function loadProject(file) {
    try {
      if (!file || file.size > 1024 * 1024) throw new Error();
      const project = validatedProject(JSON.parse(await file.text()));
      state = { ...state, ...project, projectLibraryId: null, activeSilhouetteId: project.silhouettes[0]?.id || null, selectedId: null, dirty: false, phase: project.locked ? 'silhouette' : 'composition', setupStep: 'composition' };
      controls.seed.value = state.seed;
      writeQuantities(state.quantities);
      persistProject();
      state.silhouettes.forEach((silhouette) => persistSilhouette(silhouette));
      renderAll();
      status('Projet ouvert.');
    } catch {
      status('Impossible d’ouvrir ce fichier de projet.', true);
    } finally {
      $('fileInput').value = '';
    }
  }

  function exportSvg() {
    const clone = page.cloneNode(true);
    clone.querySelectorAll('.screen-only,.dimensions').forEach((node) => node.remove());
    clone.querySelectorAll('.selected,.overlap').forEach((node) => node.classList.remove('selected', 'overlap'));
    clone.setAttribute('xmlns', svgNS);
    download('mon-tangram.svg', new XMLSerializer().serializeToString(clone), 'image/svg+xml');
  }

  function markCompositionDirty() {
    state.dirty = true;
    if (state.setupStep === 'size') {
      state.side = requestedZone().width;
      renderPage();
    } else validateComposition();
  }

  $('stepSize').addEventListener('click', () => navigateTo('size'));
  $('stepComposition').addEventListener('click', () => navigateTo('composition'));
  $('stepSilhouette').addEventListener('click', () => navigateTo('silhouette'));
  $('stepPrint').addEventListener('click', () => navigateTo('print'));
  $('navBack').addEventListener('click', goBack);
  $('goHome').addEventListener('click', goHome);
  $('navHome').addEventListener('click', goHome);
  $('navTangrams').addEventListener('click', () => showView('drive', 'tangrams'));
  $('navNew').addEventListener('click', startNewProject);
  $('homeAllTangrams').addEventListener('click', () => showView('drive', 'tangrams'));
  $('homeSeeAll').addEventListener('click', () => showView('drive', 'silhouettes'));
  $('driveSearch').addEventListener('input', renderSavedLibrary);
  $('generate').addEventListener('click', generateComposition);
  $('classicPreset').addEventListener('click', () => { writeQuantities(classicQuantities); state.dirty = true; generateComposition(); });
  $('randomSeed').addEventListener('click', () => {
    const bytes = new Uint32Array(2);
    globalThis.crypto?.getRandomValues?.(bytes);
    controls.seed.value = bytes.some(Boolean) ? [...bytes].map((value) => value.toString(16)).join('-') : Date.now().toString(36);
    state.dirty = true;
    generateComposition();
  });
  controls.side.addEventListener('input', markCompositionDirty);
  controls.seed.addEventListener('input', markCompositionDirty);
  document.querySelectorAll('[data-count]').forEach((input) => input.addEventListener('input', markCompositionDirty));
  $('newSilhouette').addEventListener('click', () => { createSilhouette(); renderAll(); });
  $('deleteSilhouette').addEventListener('click', () => {
    if (state.silhouettes.length <= 1 || !confirm('Supprimer cette silhouette ?')) return;
    const removed = activeSilhouette();
    if (removed?.libraryId) { savedRecords = Saved.remove(savedRecords, removed.libraryId); Saved.write(savedRecords); Saved.erase(removed.libraryId); }
    state.silhouettes = state.silhouettes.filter((item) => item.id !== state.activeSilhouetteId);
    state.activeSilhouetteId = state.silhouettes[0].id;
    state.selectedId = null;
    renderAll();
  });
  controls.select.addEventListener('change', () => { state.activeSilhouetteId = controls.select.value; state.selectedId = null; renderAll(); });
  controls.name.addEventListener('input', () => { const silhouette = activeSilhouette(); if (silhouette) { silhouette.name = controls.name.value.slice(0, 40) || 'Sans nom'; libraryDirty = true; persistSilhouette(); renderSilhouetteList(); renderSavedLibrary(); } });
  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-saved-action]')?.dataset.savedAction;
    const recordId = event.target.closest('.drive-card')?.dataset.libraryId;
    const record = savedRecords.find((item) => item.id === recordId);
    const projectAction = event.target.closest('[data-project-action]')?.dataset.projectAction;
    const projectId = event.target.closest('.drive-card')?.dataset.projectId;
    const group = Saved.projects(savedRecords).find((item) => item.id === projectId);
    try {
      if (action === 'edit' && record) openSavedSilhouette(record);
      else if (action === 'print' && record) printSavedSilhouette(record);
      else if (action === 'delete' && record && confirm(`Supprimer « ${record.name} » de la bibliothèque ?`)) {
        if (activeSilhouette()?.libraryId === record.id) activeSilhouette().libraryId = null;
        savedRecords = Saved.remove(savedRecords, record.id);
        Saved.write(savedRecords);
        Saved.erase(record.id);
        renderSavedLibrary();
        status(`« ${record.name} » a été supprimée.`);
      } else if (projectAction === 'open' && group) openSavedProject(group);
      else if (projectAction === 'print' && group) printSavedComposition(group);
      else if (projectAction === 'delete' && group && confirm(`Supprimer « ${group.name} » et ses silhouettes ?`)) {
        savedRecords = savedRecords.filter((item) => !group.recordIds.includes(item.id));
        Saved.write(savedRecords);
        group.recordIds.forEach(Saved.erase);
        renderSavedLibrary();
      }
    } catch { status('Cet élément ne peut pas être ouvert.', true); }
  });
  $('flipPiece').addEventListener('click', flipSelected);
  page.addEventListener('click', (event) => {
    const action = event.target.closest('[data-direct-action]')?.dataset.directAction;
    if (action === 'rotate-left') rotateSelected(-15);
    else if (action === 'rotate-right') rotateSelected(15);
    else if (action === 'rotate-left-45') rotateSelected(-45);
    else if (action === 'rotate-right-45') rotateSelected(45);
    else if (action === 'flip') flipSelected();
    else if (action === 'return') returnSelectedToLibrary();
  });
  $('pieceLibrary').addEventListener('pointerdown', (event) => {
    const card = event.target.closest('.library-piece');
    if (!card) return;
    const ghost = htmlElement('div', '', 'library-drag-ghost');
    ghost.append(card.querySelector('svg').cloneNode(true));
    ghost.style.left = `${event.clientX}px`;
    ghost.style.top = `${event.clientY}px`;
    document.body.append(ghost);
    libraryDrag = { sourceId: card.dataset.sourceId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, card, ghost };
    card.classList.add('dragging');
    card.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  document.addEventListener('pointermove', (event) => {
    if (!libraryDrag || event.pointerId !== libraryDrag.pointerId) return;
    libraryDrag.ghost.style.left = `${event.clientX}px`;
    libraryDrag.ghost.style.top = `${event.clientY}px`;
    const box = page.getBoundingClientRect();
    page.classList.toggle('drop-ready', event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom);
  });
  document.addEventListener('pointerup', (event) => {
    if (!libraryDrag || event.pointerId !== libraryDrag.pointerId) return;
    const finished = libraryDrag;
    libraryDrag = null;
    finished.card.classList.remove('dragging');
    finished.ghost.remove();
    const box = page.getBoundingClientRect();
    const onPage = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (onPage) placeLibraryPiece(finished.sourceId, svgPoint(event));
    else if (Math.hypot(event.clientX - finished.startX, event.clientY - finished.startY) < 5) placeLibraryPiece(finished.sourceId, { x: 105, y: 148.5 });
    page.classList.remove('drop-ready');
  });
  document.addEventListener('pointercancel', () => { if (libraryDrag) { libraryDrag.card.classList.remove('dragging'); libraryDrag.ghost.remove(); } libraryDrag = null; page.classList.remove('drop-ready'); });
  $('resetSilhouette').addEventListener('click', () => { const silhouette = activeSilhouette(); if (silhouette) { silhouette.pieces = []; silhouette.validated = false; libraryDirty = true; state.selectedId = null; renderAll(); status('Toutes les pièces sont revenues dans la bibliothèque.'); } });
  $('printComposition').addEventListener('click', () => printView('composition'));
  $('printSilhouette').addEventListener('click', () => printView('silhouette'));
  $('print').addEventListener('click', () => printView('composition'));
  window.addEventListener('afterprint', finishPrint);
  $('save').addEventListener('click', saveProject);
  $('load').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (event) => loadProject(event.target.files[0]));
  $('exportSvg').addEventListener('click', exportSvg);
  $('clear').addEventListener('click', () => { if (!state.silhouettes.some((silhouette) => silhouette.pieces.length) || confirm('Recommencer supprimera les silhouettes. Continuer ?')) { state.locked = false; state.phase = 'composition'; state.setupStep = 'size'; state.composition = []; state.silhouettes = []; state.activeSilhouetteId = null; state.selectedId = null; writeQuantities(classicQuantities); state.dirty = true; renderAll(); status('Choisissez la taille, puis cliquez sur « Composition ».'); } });
  page.addEventListener('pointerdown', startDrag);
  page.addEventListener('pointermove', continueDrag);
  page.addEventListener('pointerup', stopDrag);
  page.addEventListener('pointercancel', stopDrag);
  document.addEventListener('keydown', (event) => {
    if (state.phase !== 'silhouette' || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    const step = event.shiftKey ? 5 : 1;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) { event.preventDefault(); moveSelected(...moves[event.key]); }
    else if (event.key.toLowerCase() === 'r') rotateSelected(-15);
    else if (event.key.toLowerCase() === 'e') rotateSelected(15);
    else if (event.key.toLowerCase() === 'f') flipSelected();
  });

  writeQuantities(classicQuantities);
  renderAll();
  showView('home');
  Saved.pull(savedRecords).then((records) => { savedRecords = records; renderSavedLibrary(); });
  status('Choisissez la taille, puis cliquez sur « Composition ».');
})();
