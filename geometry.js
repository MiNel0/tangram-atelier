(function (root) {
  const templates = {
    triangle: [[0, 0], [1, 1], [0, 1]],
    square: [[0, 0], [1, 0], [1, 1], [0, 1]],
    rectangle: [[0, 0], [1, 0], [1, 1], [0, 1]],
    diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
    parallelogram: [[0.25, 0], [1, 0], [0.75, 1], [0, 1]],
    trapezoid: [[0.25, 0], [0.75, 0], [1, 1], [0, 1]],
  };
  const supported = Object.keys(templates);

  function positive(value, fallback) {
    const number = Number(value ?? fallback);
    if (!Number.isFinite(number) || number <= 0) throw new Error('Dimensions must be positive');
    return number;
  }

  function createPiece(type, options = {}) {
    if (!templates[type]) throw new Error(`Unknown shape: ${type}`);
    return {
      type,
      name: options.name || type,
      x: Number(options.x ?? 20),
      y: Number(options.y ?? 20),
      width: positive(options.width, 40),
      height: positive(options.height, type === 'rectangle' ? 25 : 40),
      rotation: Number(options.rotation ?? 0),
      color: options.color || '#f4a261',
      local: options.local || templates[type].map(([x, y]) => ({ x, y })),
    };
  }

  function points(piece) {
    const angle = piece.rotation * Math.PI / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const cx = piece.x + piece.width / 2;
    const cy = piece.y + piece.height / 2;
    return piece.local.map((point) => {
      const x = piece.x + point.x * piece.width - cx;
      const y = piece.y + point.y * piece.height - cy;
      return {
        x: Math.round((cx + x * cosine - y * sine) * 1e6) / 1e6,
        y: Math.round((cy + x * sine + y * cosine) * 1e6) / 1e6,
      };
    });
  }

  function silhouettePath(pieces) {
    return pieces.map((piece) => {
      const polygon = points(piece);
      return `M ${polygon.map((point) => `${point.x} ${point.y}`).join(' L ')} Z`;
    }).join(' ');
  }

  function sharedEdges(pieces, tolerance = .01) {
    const polygons = pieces.map(points);
    const shared = [];
    for (let first = 0; first < polygons.length; first++) for (let second = first + 1; second < polygons.length; second++) {
      const a = polygons[first];
      const b = polygons[second];
      for (let ai = 0; ai < a.length; ai++) for (let bi = 0; bi < b.length; bi++) {
        const start = a[ai];
        const finish = a[(ai + 1) % a.length];
        const bStart = b[bi];
        const bFinish = b[(bi + 1) % b.length];
        const dx = finish.x - start.x;
        const dy = finish.y - start.y;
        const length = Math.hypot(dx, dy);
        if (length <= tolerance) continue;
        const distance = (point) => Math.abs((point.x - start.x) * dy - (point.y - start.y) * dx) / length;
        if (distance(bStart) > tolerance || distance(bFinish) > tolerance) continue;
        const projection = (point) => ((point.x - start.x) * dx + (point.y - start.y) * dy) / length;
        const overlapStart = Math.max(0, Math.min(projection(bStart), projection(bFinish)));
        const overlapEnd = Math.min(length, Math.max(projection(bStart), projection(bFinish)));
        if (overlapEnd - overlapStart <= tolerance) continue;
        const pointAt = (distanceAlong) => ({
          x: Math.round((start.x + dx * distanceAlong / length) * 1e6) / 1e6,
          y: Math.round((start.y + dy * distanceAlong / length) * 1e6) / 1e6,
        });
        shared.push({ start: pointAt(overlapStart), end: pointAt(overlapEnd) });
      }
    }
    return shared;
  }

  function area(polygon) {
    return Math.abs(polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0)) / 2;
  }

  function bounds(piece) {
    const polygon = points(piece);
    return {
      minX: Math.min(...polygon.map((point) => point.x)),
      maxX: Math.max(...polygon.map((point) => point.x)),
      minY: Math.min(...polygon.map((point) => point.y)),
      maxY: Math.max(...polygon.map((point) => point.y)),
    };
  }

  function clampPiece(piece, zone) {
    positive(zone.width);
    positive(zone.height);
    let box = bounds(piece);
    const boxWidth = box.maxX - box.minX;
    const boxHeight = box.maxY - box.minY;
    const scale = Math.min(1, zone.width / boxWidth, zone.height / boxHeight);
    if (scale < 1) {
      const cx = piece.x + piece.width / 2;
      const cy = piece.y + piece.height / 2;
      piece.width *= scale;
      piece.height *= scale;
      piece.x = cx - piece.width / 2;
      piece.y = cy - piece.height / 2;
      box = bounds(piece);
    }
    if (box.minX < zone.x) piece.x += zone.x - box.minX;
    if (box.maxX > zone.x + zone.width) piece.x -= box.maxX - zone.x - zone.width;
    if (box.minY < zone.y) piece.y += zone.y - box.minY;
    if (box.maxY > zone.y + zone.height) piece.y -= box.maxY - zone.y - zone.height;
    return piece;
  }

  function translateInside(piece, zone) {
    positive(zone.width);
    positive(zone.height);
    const box = bounds(piece);
    if (box.maxX - box.minX > zone.width || box.maxY - box.minY > zone.height) return false;
    if (box.minX < zone.x) piece.x += zone.x - box.minX;
    if (box.maxX > zone.x + zone.width) piece.x -= box.maxX - zone.x - zone.width;
    if (box.minY < zone.y) piece.y += zone.y - box.minY;
    if (box.maxY > zone.y + zone.height) piece.y -= box.maxY - zone.y - zone.height;
    return true;
  }

  function flipPiece(piece) {
    piece.local = piece.local.map((point) => ({ x: 1 - point.x, y: point.y }));
    return piece;
  }

  function rotationFromPointer(startRotation, center, start, current, snap = 1) {
    const angle = (point) => Math.atan2(point.x - center.x, center.y - point.y) * 180 / Math.PI;
    const rotation = startRotation + angle(current) - angle(start);
    return (Math.round(rotation / snap) * snap % 360 + 360) % 360;
  }

  function snapOffset(piece, others, grid = 0, threshold = 2) {
    const source = points(piece);
    const targets = others.flatMap(points);
    let bestX;
    let bestY;
    source.forEach((from) => targets.forEach((to) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      if (Math.abs(dx) <= threshold && (bestX === undefined || Math.abs(dx) < Math.abs(bestX))) bestX = dx;
      if (Math.abs(dy) <= threshold && (bestY === undefined || Math.abs(dy) < Math.abs(bestY))) bestY = dy;
    }));
    return {
      dx: bestX ?? (grid ? Math.round(piece.x / grid) * grid - piece.x : 0),
      dy: bestY ?? (grid ? Math.round(piece.y / grid) * grid - piece.y : 0),
    };
  }

  function smartSnap(piece, others, grid = 0, threshold = 3) {
    const source = points(piece);
    const box = bounds(piece);
    const nearby = others.filter((other) => {
      const otherBox = bounds(other);
      return otherBox.maxX >= box.minX - threshold * 2 && otherBox.minX <= box.maxX + threshold * 2 && otherBox.maxY >= box.minY - threshold * 2 && otherBox.minY <= box.maxY + threshold * 2;
    });
    const targets = nearby.map((other) => points(other));
    const candidates = [];
    const freeAfter = (dx, dy) => {
      const moved = { ...piece, x: piece.x + dx, y: piece.y + dy };
      return !others.some((other) => polygonsOverlap(points(moved), points(other)));
    };
    const add = (dx, dy, kind, guide, penalty) => {
      const distance = Math.hypot(dx, dy);
      if (distance <= threshold * 1.42 && freeAfter(dx, dy)) candidates.push({ dx, dy, kind, guide, score: distance + penalty });
    };
    source.forEach((from) => targets.forEach((polygon) => polygon.forEach((to) => {
      if (Math.hypot(to.x - from.x, to.y - from.y) <= threshold) add(to.x - from.x, to.y - from.y, 'vertex', { type: 'point', point: to }, .15);
    })));
    source.forEach((from) => targets.forEach((polygon) => polygon.forEach((start, index) => {
      const end = polygon[(index + 1) % polygon.length];
      const closest = closestPointOnSegment(from, start, end);
      if (Math.hypot(closest.x - from.x, closest.y - from.y) <= threshold) add(closest.x - from.x, closest.y - from.y, 'vertex-edge', { type: 'edge', start, end }, .3);
    })));
    source.forEach((sourceStart, sourceIndex) => {
      const sourceEnd = source[(sourceIndex + 1) % source.length];
      targets.forEach((polygon) => polygon.forEach((targetStart, targetIndex) => {
        const targetEnd = polygon[(targetIndex + 1) % polygon.length];
        const length = Math.hypot(targetEnd.x - targetStart.x, targetEnd.y - targetStart.y);
        const sourceLength = Math.hypot(sourceEnd.x - sourceStart.x, sourceEnd.y - sourceStart.y);
        const direction = { x: (targetEnd.x - targetStart.x) / length, y: (targetEnd.y - targetStart.y) / length };
        const sourceDirection = { x: (sourceEnd.x - sourceStart.x) / sourceLength, y: (sourceEnd.y - sourceStart.y) / sourceLength };
        if (Math.abs(direction.x * sourceDirection.y - direction.y * sourceDirection.x) > .035) return;
        const normal = { x: -direction.y, y: direction.x };
        const perpendicular = (targetStart.x - sourceStart.x) * normal.x + (targetStart.y - sourceStart.y) * normal.y;
        if (Math.abs(perpendicular) > threshold) return;
        const project = (point) => point.x * direction.x + point.y * direction.y;
        const sourceProjection = [project(sourceStart), project(sourceEnd)].sort((a, b) => a - b);
        const targetProjection = [project(targetStart), project(targetEnd)].sort((a, b) => a - b);
        let tangent = 0;
        if (sourceProjection[1] < targetProjection[0]) tangent = targetProjection[0] - sourceProjection[1];
        else if (targetProjection[1] < sourceProjection[0]) tangent = targetProjection[1] - sourceProjection[0];
        if (Math.abs(tangent) > threshold) return;
        add(normal.x * perpendicular + direction.x * tangent, normal.y * perpendicular + direction.y * tangent, 'edge', { type: 'edge', start: targetStart, end: targetEnd }, 0);
      }));
    });
    if (grid) add(Math.round(piece.x / grid) * grid - piece.x, Math.round(piece.y / grid) * grid - piece.y, 'grid', null, .6);
    return candidates.sort((first, second) => first.score - second.score)[0] || { dx: 0, dy: 0, kind: null, guide: null };
  }

  function resolveOverlap(piece, others, zone, maxDistance = 30, step = .5) {
    const original = { x: piece.x, y: piece.y };
    const box = bounds(piece);
    const nearby = others.filter((other) => {
      const otherBox = bounds(other);
      return otherBox.maxX >= box.minX - maxDistance && otherBox.minX <= box.maxX + maxDistance && otherBox.maxY >= box.minY - maxDistance && otherBox.minY <= box.maxY + maxDistance;
    });
    const free = (candidate) => !nearby.some((other) => polygonsOverlap(points(candidate), points(other)));
    if (free(piece)) return { resolved: true, dx: 0, dy: 0, snapped: null };
    for (let radius = step; radius <= maxDistance; radius += step) {
      for (let index = 0; index < 32; index++) {
        const angle = index * Math.PI / 16;
        const candidate = { ...piece, x: original.x + Math.cos(angle) * radius, y: original.y + Math.sin(angle) * radius };
        if (!translateInside(candidate, zone) || !free(candidate)) continue;
        const snap = smartSnap(candidate, nearby, 0, 2.5);
        candidate.x += snap.dx;
        candidate.y += snap.dy;
        if (!translateInside(candidate, zone) || !free(candidate)) continue;
        piece.x = candidate.x;
        piece.y = candidate.y;
        return { resolved: true, dx: piece.x - original.x, dy: piece.y - original.y, snapped: snap.kind };
      }
    }
    return { resolved: false, dx: 0, dy: 0, snapped: null };
  }

  function polygonsOverlap(first, second, epsilon = 1e-7) {
    return [first, second].every((polygon) => polygon.every((point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      const axis = { x: -(next.y - point.y), y: next.x - point.x };
      const project = (shape) => shape.map((vertex) => vertex.x * axis.x + vertex.y * axis.y);
      const a = project(first);
      const b = project(second);
      return Math.max(...a) > Math.min(...b) + epsilon && Math.max(...b) > Math.min(...a) + epsilon;
    }));
  }

  function pointSegmentDistance(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
    return Math.hypot(point.x - start.x - ratio * dx, point.y - start.y - ratio * dy);
  }

  function closestPointOnSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
    return { x: start.x + ratio * dx, y: start.y + ratio * dy };
  }

  function polygonDistance(first, second) {
    if (polygonsOverlap(first, second)) return 0;
    const distances = [];
    const measure = (vertices, edges) => vertices.forEach((point) => edges.forEach((start, index) => {
      distances.push(pointSegmentDistance(point, start, edges[(index + 1) % edges.length]));
    }));
    measure(first, second);
    measure(second, first);
    return Math.min(...distances);
  }

  function inspectSilhouette(pieces, tolerance = 0.75) {
    if (!pieces.length) return { valid: false, overlaps: false, connected: false };
    const polygons = pieces.map(points);
    let overlaps = false;
    const links = polygons.map(() => []);
    for (let first = 0; first < polygons.length; first++) {
      for (let second = first + 1; second < polygons.length; second++) {
        if (polygonsOverlap(polygons[first], polygons[second])) overlaps = true;
        if (polygonDistance(polygons[first], polygons[second]) <= tolerance) {
          links[first].push(second);
          links[second].push(first);
        }
      }
    }
    const visited = new Set([0]);
    const queue = [0];
    while (queue.length) links[queue.shift()].forEach((index) => {
      if (!visited.has(index)) { visited.add(index); queue.push(index); }
    });
    const connected = visited.size === pieces.length;
    return { valid: !overlaps, overlaps, connected };
  }

  function randomFor(seed) {
    let value = 2166136261;
    for (const character of String(seed)) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
    return () => {
      value += 0x6D2B79F5;
      let mixed = value;
      mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
      return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffle(items, random) {
    for (let index = items.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [items[index], items[other]] = [items[other], items[index]];
    }
    return items;
  }

  function splitRegion(region, count, random) {
    if (count === 1) return [region];
    const weights = Array.from({ length: count }, () => 0.75 + random() * 0.5);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = region.width >= region.height ? region.x : region.y;
    return weights.map((weight, index) => {
      const last = index === weights.length - 1;
      if (region.width >= region.height) {
        const width = last ? region.x + region.width - cursor : region.width * weight / total;
        const result = { x: cursor, y: region.y, width, height: region.height };
        cursor += width;
        return result;
      }
      const height = last ? region.y + region.height - cursor : region.height * weight / total;
      const result = { x: region.x, y: cursor, width: region.width, height };
      cursor += height;
      return result;
    });
  }

  function buildMotifs(quantities) {
    const requested = {};
    const accepted = Object.fromEntries(supported.map((type) => [type, 0]));
    supported.forEach((type) => {
      const count = Number(quantities[type] || 0);
      if (!Number.isInteger(count) || count < 0 || count > 100) throw new Error('Invalid quantity');
      requested[type] = count;
    });

    const left = { ...requested };
    const fixed = [];
    const flexible = [];
    const take = (kind, ratio, used, target) => {
      target.push({ kind, ratio });
      Object.entries(used).forEach(([type, count]) => { left[type] -= count; accepted[type] += count; });
    };

    while (left.triangle >= 5 && left.square >= 1 && left.parallelogram >= 1) {
      take('classic', 1, { triangle: 5, square: 1, parallelogram: 1 }, fixed);
    }
    while (left.diamond >= 1 && left.triangle >= 4) take('diamond', 1, { diamond: 1, triangle: 4 }, fixed);
    while (left.parallelogram >= 1 && left.triangle >= 2) take('parallelogram', 2, { parallelogram: 1, triangle: 2 }, fixed);
    while (left.square >= 1) take('square', 1, { square: 1 }, fixed);
    while (left.triangle >= 2) take('triangles', 1, { triangle: 2 }, fixed);
    while (left.rectangle >= 1) take('rectangle', 0, { rectangle: 1 }, flexible);
    while (left.trapezoid >= 2) take('trapezoids', 0, { trapezoid: 2 }, flexible);

    const excluded = Object.fromEntries(supported.map((type) => [type, requested[type] - accepted[type]]));
    if (!fixed.length && !flexible.length) throw new Error('No exact tiling');
    return { accepted, excluded, fixed, flexible };
  }

  function layoutMotifs(fixed, flexible, zone, random) {
    shuffle(fixed, random);
    shuffle(flexible, random);
    const fixedRects = [];
    const flexibleRegions = [];
    const sumRatio = fixed.reduce((sum, motif) => sum + motif.ratio, 0);
    const sumInverse = fixed.reduce((sum, motif) => sum + 1 / motif.ratio, 0);
    const epsilon = 1e-7;

    const horizontal = (height, y = zone.y) => {
      let x = zone.x;
      fixed.forEach((motif) => {
        const width = motif.ratio * height;
        fixedRects.push({ motif, rect: { x, y, width, height } });
        x += width;
      });
      return x;
    };
    const vertical = (width) => {
      let y = zone.y;
      fixed.forEach((motif) => {
        const height = width / motif.ratio;
        fixedRects.push({ motif, rect: { x: zone.x, y, width, height } });
        y += height;
      });
      return y;
    };

    if (!fixed.length) flexibleRegions.push(zone);
    else if (!flexible.length) {
      if (Math.abs(sumRatio * zone.height - zone.width) < epsilon) horizontal(zone.height);
      else if (Math.abs(sumInverse * zone.width - zone.height) < epsilon) vertical(zone.width);
      else throw new Error('No exact tiling');
    } else if (sumRatio * zone.height < zone.width - epsilon) {
      const endX = horizontal(zone.height);
      flexibleRegions.push({ x: endX, y: zone.y, width: zone.x + zone.width - endX, height: zone.height });
    } else if (zone.height / sumInverse < zone.width - epsilon) {
      const fixedWidth = zone.height / sumInverse;
      vertical(fixedWidth);
      flexibleRegions.push({ x: zone.x + fixedWidth, y: zone.y, width: zone.width - fixedWidth, height: zone.height });
    } else if (zone.width / sumRatio < zone.height - epsilon) {
      const fixedHeight = zone.width / sumRatio;
      horizontal(fixedHeight);
      flexibleRegions.push({ x: zone.x, y: zone.y + fixedHeight, width: zone.width, height: zone.height - fixedHeight });
    } else if (flexible.length >= 2) {
      const fixedHeight = Math.min(zone.height * 0.5, zone.width / (sumRatio + 0.5));
      const endX = horizontal(fixedHeight);
      flexibleRegions.push(
        { x: endX, y: zone.y, width: zone.x + zone.width - endX, height: fixedHeight },
        { x: zone.x, y: zone.y + fixedHeight, width: zone.width, height: zone.height - fixedHeight },
      );
    } else throw new Error('No exact tiling');

    const flexibleRects = [];
    if (flexibleRegions.length === 1) {
      splitRegion(flexibleRegions[0], flexible.length, random).forEach((rect, index) => flexibleRects.push({ motif: flexible[index], rect }));
    } else if (flexibleRegions.length === 2) {
      flexibleRects.push({ motif: flexible[0], rect: flexibleRegions[0] });
      splitRegion(flexibleRegions[1], flexible.length - 1, random).forEach((rect, index) => flexibleRects.push({ motif: flexible[index + 1], rect }));
    }
    return [...fixedRects, ...flexibleRects];
  }

  function motifPieces(motif, rect, random) {
    const { x, y, width: width, height: height } = rect;
    const palette = ['#457b9d', '#2a9d8f', '#e9c46a', '#e76f51', '#f4a261', '#84a98c', '#b56576', '#6d597a'];
    const make = (type, vertices) => fromVertices(type, type, vertices, palette[Math.floor(random() * palette.length)]);
    if (motif.kind === 'classic') return seededClassicTangram(width, x, y, random);
    if (motif.kind === 'square') return [createPiece('square', { x, y, width, height, color: palette[Math.floor(random() * palette.length)] })];
    if (motif.kind === 'rectangle') return [createPiece('rectangle', { x, y, width, height, color: palette[Math.floor(random() * palette.length)] })];
    if (motif.kind === 'triangles') {
      return random() < 0.5
        ? [make('triangle', [[x, y], [x + width, y], [x + width, y + height]]), make('triangle', [[x, y], [x + width, y + height], [x, y + height]])]
        : [make('triangle', [[x, y], [x + width, y], [x, y + height]]), make('triangle', [[x + width, y], [x + width, y + height], [x, y + height]])];
    }
    if (motif.kind === 'diamond') {
      const cx = x + width / 2;
      const cy = y + height / 2;
      return [
        make('diamond', [[cx, y], [x + width, cy], [cx, y + height], [x, cy]]),
        make('triangle', [[x, y], [cx, y], [x, cy]]),
        make('triangle', [[cx, y], [x + width, y], [x + width, cy]]),
        make('triangle', [[x + width, cy], [x + width, y + height], [cx, y + height]]),
        make('triangle', [[cx, y + height], [x, y + height], [x, cy]]),
      ];
    }
    if (motif.kind === 'parallelogram') {
      const inset = height;
      return [
        make('triangle', [[x, y], [x + inset, y], [x, y + height]]),
        make('parallelogram', [[x + inset, y], [x + width, y], [x + width - inset, y + height], [x, y + height]]),
        make('triangle', [[x + width, y], [x + width, y + height], [x + width - inset, y + height]]),
      ];
    }
    if (motif.kind === 'trapezoids') {
      const top = x + width * (0.35 + random() * 0.15);
      const bottom = x + width * (0.65 - random() * 0.15);
      return [
        make('trapezoid', [[x, y], [top, y], [bottom, y + height], [x, y + height]]),
        make('trapezoid', [[top, y], [x + width, y], [x + width, y + height], [bottom, y + height]]),
      ];
    }
    throw new Error('Unknown motif');
  }

  function verifyTiling(pieces, zone) {
    const zoneArea = zone.width * zone.height;
    const pieceArea = pieces.reduce((sum, piece) => sum + area(points(piece)), 0);
    const inside = pieces.flatMap(points).every((point) => point.x >= zone.x - 1e-6 && point.x <= zone.x + zone.width + 1e-6 && point.y >= zone.y - 1e-6 && point.y <= zone.y + zone.height + 1e-6);
    return { coverage: Math.round(pieceArea / zoneArea * 1e9) / 1e9, inside };
  }

  function generateTiling(quantities, zone, seed) {
    positive(zone.width);
    positive(zone.height);
    const random = randomFor(seed);
    const plan = buildMotifs(quantities);
    const placements = layoutMotifs(plan.fixed, plan.flexible, zone, random);
    const pieces = placements.flatMap(({ motif, rect }) => motifPieces(motif, rect, random));
    const verification = verifyTiling(pieces, zone);
    if (!verification.inside || verification.coverage !== 1) throw new Error('No exact tiling');
    return { pieces, accepted: plan.accepted, excluded: plan.excluded, verification };
  }

  function analyzeTiling(quantities, zone) {
    const requested = Object.fromEntries(supported.map((type) => [type, Number(quantities[type] || 0)]));
    const candidates = new Map();
    const add = (quantities) => {
      try {
        const result = generateTiling(quantities, zone, 'validation');
        const candidate = result.accepted;
        if (!Object.values(candidate).some(Boolean)) return;
        const key = supported.map((type) => candidate[type]).join(',');
        if (key === supported.map((type) => requested[type]).join(',')) return;
        candidates.set(key, {
          quantities: candidate,
          distance: supported.reduce((sum, type) => sum + Math.abs(candidate[type] - requested[type]), 0),
        });
      } catch { /* combinaison inutilisable */ }
    };
    try {
      const direct = generateTiling(requested, zone, 'validation');
      if (!Object.values(direct.excluded).some(Boolean)) return { valid: true, suggestions: [] };
      add(direct.accepted);
    } catch { /* chercher une combinaison proche */ }
    supported.forEach((type) => {
      for (let difference = 1; difference <= 5; difference++) {
        if (requested[type] >= difference) add({ ...requested, [type]: requested[type] - difference });
        if (requested[type] + difference <= 100) add({ ...requested, [type]: requested[type] + difference });
      }
    });
    add({ triangle: 5, square: 1, parallelogram: 1 });
    add({ rectangle: 1 });
    return {
      valid: false,
      suggestions: [...candidates.values()].sort((a, b) => a.distance - b.distance).slice(0, 3).map(({ quantities }) => quantities),
    };
  }

  function fromVertices(name, type, vertices, color) {
    const xs = vertices.map(([x]) => x);
    const ys = vertices.map(([, y]) => y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    return createPiece(type, {
      name, x, y, width, height, color,
      local: vertices.map(([vx, vy]) => ({ x: (vx - x) / width, y: (vy - y) / height })),
    });
  }

  function classicTangram(side, x = 0, y = 0) {
    side = positive(side);
    const scale = side / 4;
    const make = (name, type, vertices, color) => fromVertices(name, type,
      vertices.map(([vx, vy]) => [x + vx * scale, y + vy * scale]), color);
    return [
      make('Grand triangle 1', 'triangle', [[4, 4], [4, 0], [2, 2]], '#457b9d'),
      make('Grand triangle 2', 'triangle', [[0, 4], [4, 4], [2, 2]], '#2a9d8f'),
      make('Triangle moyen', 'triangle', [[0, 0], [2, 0], [0, 2]], '#e9c46a'),
      make('Carré', 'square', [[2, 0], [3, 1], [2, 2], [1, 1]], '#e76f51'),
      make('Parallélogramme', 'parallelogram', [[0, 2], [0, 4], [1, 3], [1, 1]], '#f4a261'),
      make('Petit triangle 1', 'triangle', [[4, 0], [2, 0], [3, 1]], '#84a98c'),
      make('Petit triangle 2', 'triangle', [[1, 1], [2, 2], [1, 3]], '#b56576'),
    ];
  }

  function seededClassicTangram(side, x, y, random) {
    const pieces = classicTangram(side, x, y);
    const variant = Math.floor(random() * 8);
    const quarterTurns = variant % 4;
    const reflected = variant >= 4;
    const center = { x: x + side / 2, y: y + side / 2 };
    const colors = shuffle(pieces.map((piece) => piece.color), random);
    return pieces.map((piece, index) => {
      const vertices = points(piece).map((point) => {
        let dx = point.x - center.x;
        let dy = point.y - center.y;
        if (reflected) dx = -dx;
        for (let turn = 0; turn < quarterTurns; turn++) [dx, dy] = [-dy, dx];
        return [center.x + dx, center.y + dy];
      });
      return fromVertices(piece.name, piece.type, vertices, colors[index]);
    });
  }

  const api = { analyzeTiling, area, bounds, clampPiece, classicTangram, createPiece, flipPiece, generateTiling, inspectSilhouette, points, polygonsOverlap, resolveOverlap, rotationFromPointer, sharedEdges, silhouettePath, smartSnap, snapOffset, translateInside, verifyTiling };
  root.TangramGeometry = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
