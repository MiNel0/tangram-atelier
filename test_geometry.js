const assert = require('node:assert/strict');
const G = require('./geometry.js');
const Inventory = require('./inventory.js');
const Workflow = require('./workflow.js');
const Library = require('./library.js');

const saved = Library.upsert([], { id: 'chat', name: 'Chat', updatedAt: 1 });
assert.deepEqual(saved.map((item) => item.id), ['chat']);
assert.equal(Library.upsert(saved, { id: 'chat', name: 'Chat modifié', updatedAt: 2 })[0].name, 'Chat modifié');
assert.deepEqual(Library.remove(saved, 'chat'), []);
const copied = Library.duplicate(saved, 'chat', 'chat-copy', 3);
assert.equal(copied[0].id, 'chat-copy');
assert.equal(copied[0].name, 'Chat copie');
const sourceWithProject = [{ id: 'bird', name: 'Oiseau', updatedAt: 1, project: { silhouettes: [{ name: 'Oiseau' }] } }];
const copiedProject = Library.duplicate(sourceWithProject, 'bird', 'bird-copy', 4)[0];
assert.notEqual(copiedProject.project, sourceWithProject[0].project);
assert.equal(copiedProject.project.silhouettes[0].name, 'Oiseau copie');
assert.equal(sourceWithProject[0].project.silhouettes[0].name, 'Oiseau');
const mergedLibrary = Library.merge(
  [{ id: 'local', updatedAt: 1, project: {} }, { id: 'same', name: 'Ancien', updatedAt: 2, project: {} }],
  [{ id: 'remote', updatedAt: 3, project: {} }, { id: 'same', name: 'Récent', updatedAt: 4, project: {} }],
);
assert.deepEqual(mergedLibrary.map((item) => item.id), ['same', 'remote', 'local']);
assert.equal(mergedLibrary[0].name, 'Récent');
assert.deepEqual(Library.sharedRecords([{ id: 'supprimé', updatedAt: 1 }], [], true), []);
assert.equal(Library.sharedRecords([{ id: 'à-migrer', updatedAt: 1 }], [], false).length, 1);

const groupedProjects = Library.projects([
  { id: 'chat', name: 'Chat', updatedAt: 2, project: { side: 140, seed: 'classique', quantities: { triangle: 5 }, composition: [{ id: 'a' }], silhouettes: [{ name: 'Chat' }] } },
  { id: 'bateau', name: 'Bateau', updatedAt: 3, project: { side: 140, seed: 'classique', quantities: { triangle: 5 }, composition: [{ id: 'nouvel-id' }], silhouettes: [{ name: 'Bateau' }] } },
  { id: 'maison', name: 'Maison', updatedAt: 1, project: { side: 120, seed: 'autre', quantities: { triangle: 5 }, composition: [{ id: 'b' }], silhouettes: [{ name: 'Maison' }] } },
]);
assert.equal(groupedProjects.length, 2);
assert.equal(groupedProjects[0].project.silhouettes.length, 2);
assert.deepEqual(groupedProjects[0].recordIds.sort(), ['bateau', 'chat']);

assert.equal(Workflow.stage({ locked: false, setupStep: 'size' }), 'size');
assert.equal(Workflow.stage({ locked: false, setupStep: 'composition' }), 'composition');
assert.equal(Workflow.stage({ locked: true, silhouetteValidated: false }), 'silhouette');
assert.equal(Workflow.stage({ locked: true, silhouetteValidated: true }), 'print');
assert.equal(Workflow.canEnter('silhouette', { hasComposition: false, compositionDirty: true, silhouetteValid: false }), false);
assert.equal(Workflow.canEnter('silhouette', { hasComposition: true, compositionDirty: false, silhouetteValid: false }), true);
assert.equal(Workflow.canEnter('print', { hasComposition: true, compositionDirty: false, silhouetteValid: false }), false);
assert.equal(Workflow.canEnter('print', { hasComposition: true, compositionDirty: false, silhouetteValid: true }), true);

const librarySources = [{ id: 'triangle' }, { id: 'square' }];
const placedFromLibrary = [{ sourceId: 'triangle' }];
assert.deepEqual(Inventory.remaining(librarySources, placedFromLibrary).map((piece) => piece.id), ['square']);
assert.equal(Inventory.complete(librarySources, placedFromLibrary), false);
assert.equal(Inventory.complete(librarySources, [{ sourceId: 'triangle' }, { sourceId: 'square' }]), true);
assert.deepEqual(Inventory.remaining([{ id: 'new-id', sourceId: 'saved-id' }], [{ sourceId: 'saved-id' }]), []);
const pieces = G.classicTangram(120, 45, 70);
assert.equal(pieces.length, 7);
assert.equal(Math.round(pieces.reduce((sum, piece) => sum + G.area(G.points(piece)), 0)), 120 * 120);

const allPoints = pieces.flatMap(G.points);
assert.equal(Math.min(...allPoints.map((point) => point.x)), 45);
assert.equal(Math.max(...allPoints.map((point) => point.x)), 165);
assert.equal(Math.min(...allPoints.map((point) => point.y)), 70);
assert.equal(Math.max(...allPoints.map((point) => point.y)), 190);

const square = G.createPiece('square', { x: 10, y: 20, width: 30, height: 30, rotation: 90 });
const rotated = G.points(square);
assert.deepEqual(rotated[0], { x: 40, y: 20 });
assert.equal(Math.round(G.area(rotated)), 900);

assert.throws(() => G.createPiece('triangle', { width: 0, height: 20 }), /positive/);

const zone = { x: 10, y: 20, width: 120, height: 80 };
const outside = G.createPiece('square', { x: -40, y: 100, width: 60, height: 60, rotation: 45 });
G.clampPiece(outside, zone);
assert.ok(G.points(outside).every((point) => point.x >= zone.x - 1e-6 && point.x <= zone.x + zone.width + 1e-6));
assert.ok(G.points(outside).every((point) => point.y >= zone.y - 1e-6 && point.y <= zone.y + zone.height + 1e-6));

const translatedInside = G.createPiece('square', { x: -5, y: 0, width: 10, height: 10 });
assert.equal(G.translateInside(translatedInside, { x: 0, y: 0, width: 20, height: 20 }), true);
assert.equal(translatedInside.x, 0);
const tooLargeToRotate = G.createPiece('square', { x: 10, y: 10, width: 100, height: 100, rotation: 45 });
assert.equal(G.translateInside(tooLargeToRotate, { x: 0, y: 0, width: 120, height: 120 }), false);
assert.equal(tooLargeToRotate.width, 100);

const snapTarget = G.createPiece('square', { x: 21.5, y: 0, width: 10, height: 10 });
const snapNeighbour = G.createPiece('square', { x: 0, y: 0, width: 20, height: 20 });
assert.equal(G.snapOffset(snapTarget, [snapNeighbour], 5, 3).dx, -1.5);

const edgeTarget = G.createPiece('square', { x: 0, y: 0, width: 10, height: 10 });
const edgeMover = G.createPiece('square', { x: 12, y: 0, width: 10, height: 10 });
const edgeSnap = G.smartSnap(edgeMover, [edgeTarget], 0, 3);
assert.equal(edgeSnap.kind, 'edge');
assert.equal(edgeSnap.guide.type, 'edge');
assert.equal(edgeSnap.dx, -2);
edgeMover.x += edgeSnap.dx;
edgeMover.y += edgeSnap.dy;
assert.equal(G.polygonsOverlap(G.points(edgeMover), G.points(edgeTarget)), false);

const overlapTarget = G.createPiece('square', { x: 0, y: 0, width: 10, height: 10 });
const overlapMover = G.createPiece('square', { x: 8, y: 0, width: 10, height: 10 });
const resolved = G.resolveOverlap(overlapMover, [overlapTarget], { x: -20, y: -20, width: 60, height: 60 }, 5, .5);
assert.equal(resolved.resolved, true);
assert.equal(G.polygonsOverlap(G.points(overlapMover), G.points(overlapTarget)), false);
assert.ok(Math.hypot(resolved.dx, resolved.dy) <= 3);

const trappedMover = G.createPiece('square', { x: 0, y: 0, width: 10, height: 10 });
assert.equal(G.resolveOverlap(trappedMover, [overlapTarget], { x: 0, y: 0, width: 10, height: 10 }, 2, .5).resolved, false);
assert.equal(trappedMover.x, 0);

const flipped = G.createPiece('triangle', { x: 0, y: 0, width: 10, height: 10 });
const beforeFlip = G.points(flipped);
G.flipPiece(flipped);
assert.equal(G.area(G.points(flipped)), G.area(beforeFlip));
assert.notDeepEqual(G.points(flipped), beforeFlip);

assert.equal(G.rotationFromPointer(30, { x: 0, y: 0 }, { x: 0, y: -10 }, { x: 10, y: 0 }, 1), 120);
assert.equal(G.rotationFromPointer(4, { x: 0, y: 0 }, { x: 0, y: -10 }, { x: 9.9, y: -1 }, 15), 90);

const touching = [
  G.createPiece('square', { x: 0, y: 0, width: 10, height: 10 }),
  G.createPiece('square', { x: 10, y: 0, width: 10, height: 10 }),
];
assert.equal(G.polygonsOverlap(G.points(touching[0]), G.points(touching[1])), false);
assert.equal(G.inspectSilhouette(touching).valid, true);

const silhouettePath = G.silhouettePath(touching);
assert.equal((silhouettePath.match(/M /g) || []).length, 2);
assert.equal((silhouettePath.match(/ Z/g) || []).length, 2);
assert.deepEqual(G.sharedEdges(touching), [{ start: { x: 10, y: 0 }, end: { x: 10, y: 10 } }]);
touching[1].x = 9;
assert.equal(G.inspectSilhouette(touching).overlaps, true);
touching[1].x = 30;
assert.equal(G.inspectSilhouette(touching).connected, false);
assert.equal(G.inspectSilhouette(touching).valid, true);

const classicTiling = G.generateTiling({ triangle: 5, square: 1, parallelogram: 1 }, { x: 10, y: 20, width: 100, height: 100 }, 'classique');
assert.equal(classicTiling.pieces.length, 7);
assert.deepEqual(classicTiling.accepted, { triangle: 5, square: 1, rectangle: 0, diamond: 0, parallelogram: 1, trapezoid: 0 });
assert.equal(classicTiling.verification.coverage, 1);
assert.equal(classicTiling.verification.inside, true);

const validAnalysis = G.analyzeTiling({ triangle: 5, square: 1, parallelogram: 1 }, { x: 0, y: 0, width: 100, height: 100 });
assert.equal(validAnalysis.valid, true);
assert.deepEqual(validAnalysis.suggestions, []);

const missingTriangle = G.analyzeTiling({ triangle: 4, square: 1, parallelogram: 1 }, { x: 0, y: 0, width: 100, height: 100 });
assert.equal(missingTriangle.valid, false);
assert.ok(missingTriangle.suggestions.some((quantities) => quantities.triangle === 5 && quantities.square === 1 && quantities.parallelogram === 1));

const loneTrapezoid = G.analyzeTiling({ trapezoid: 1 }, { x: 0, y: 0, width: 100, height: 100 });
assert.ok(loneTrapezoid.suggestions.some((quantities) => quantities.trapezoid === 2));

const classicSeedA = G.generateTiling({ triangle: 5, square: 1, parallelogram: 1 }, { x: 10, y: 20, width: 100, height: 100 }, 'd77e6659-2736f3cc');
const classicSeedB = G.generateTiling({ triangle: 5, square: 1, parallelogram: 1 }, { x: 10, y: 20, width: 100, height: 100 }, '91a6e808-cbc969d5');
assert.notDeepEqual(classicSeedA.pieces.map(G.points), classicSeedB.pieces.map(G.points));

const quantities = { triangle: 4, square: 1, rectangle: 2, diamond: 1, parallelogram: 0, trapezoid: 2 };
const tiledA = G.generateTiling(quantities, zone, 'graine-demo');
const tiledB = G.generateTiling(quantities, zone, 'graine-demo');
const tiledC = G.generateTiling(quantities, zone, 'autre-graine');
assert.deepEqual(tiledA, tiledB);
assert.notDeepEqual(tiledA.pieces, tiledC.pieces);
assert.equal(tiledA.pieces.length, 10);
assert.equal(tiledA.verification.coverage, 1);
assert.equal(tiledA.verification.inside, true);

const excluded = G.generateTiling({ trapezoid: 3 }, zone, 'impair');
assert.equal(excluded.accepted.trapezoid, 2);
assert.equal(excluded.excluded.trapezoid, 1);
assert.equal(excluded.verification.coverage, 1);

assert.throws(() => G.generateTiling({ square: 1, rectangle: 1 }, { x: 0, y: 0, width: 100, height: 100 }, 'impossible'), /No exact tiling/);
console.log('Tests géométriques réussis.');
