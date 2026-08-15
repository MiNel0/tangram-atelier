const G = require('../geometry.js');
const Library = require('../library.js');

const safeSegment = (value) => String(value || '')
  .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
  .replace(/^[.\s-]+|[.\s-]+$/g, '')
  .replace(/[-\s]+/g, '-')
  .slice(0, 70) || 'Sans-nom';

function points(piece) {
  try {
    const result = G.points(piece);
    if (result.length < 3 || result.length > 12 || result.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 10000 || Math.abs(y) > 10000)) return null;
    return result;
  } catch { return null; }
}

const polygon = (piece, fill = /^#[0-9a-f]{6}$/i.test(piece.color) ? piece.color : '#f4a261') => {
  const vertices = points(piece);
  return vertices ? `<polygon points="${vertices.map(({ x, y }) => `${x.toFixed(4)},${y.toFixed(4)}`).join(' ')}" fill="${fill}"/>` : '';
};

function pdfHtml(content) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>
    @page { size: A4 portrait; margin: 0; }
    html,body { width:210mm; height:297mm; margin:0; overflow:hidden; background:white; }
    svg { display:block; width:210mm; height:297mm; }
    polygon { stroke:#183137; stroke-width:.25; vector-effect:non-scaling-stroke; }
  </style></head><body><svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297"><rect width="210" height="297" fill="white"/>${content}<g fill="#263e41" font-size="2.8"><line x1="15" y1="287" x2="65" y2="287" stroke="#263e41" stroke-width=".35"/><line x1="15" y1="285.5" x2="15" y2="288.5" stroke="#263e41" stroke-width=".35"/><line x1="65" y1="285.5" x2="65" y2="288.5" stroke="#263e41" stroke-width=".35"/><text x="40" y="284.5" text-anchor="middle">Contrôle 50 mm</text></g></svg></body></html>`;
}

function buildPdfJobs(records) {
  const valid = Array.isArray(records) ? records.filter(({ project } = {}) => Array.isArray(project?.composition) && project.composition.length > 0 && project.composition.length <= 100 && Number(project.side) >= 30 && Number(project.side) <= 190) : [];
  return Library.projects(valid).flatMap((group, projectIndex) => {
    const project = group.project;
    if (project.composition.some((piece) => !points(piece))) return [];
    const folder = `${String(projectIndex + 1).padStart(2, '0')} - ${safeSegment(group.name)}`;
    const side = Number(project.side);
    const x = (210 - side) / 2;
    const y = (297 - side) / 2;
    const jobs = [{
      folder, file: '01 - Rangement.pdf',
      html: pdfHtml(`<rect x="${x}" y="${y}" width="${side}" height="${side}" fill="#fdfbf3" stroke="#173f43" stroke-width=".7"/>${project.composition.map((piece) => polygon(piece)).join('')}`),
    }];
    (project.silhouettes || []).slice(0, 30).forEach((silhouette, index) => {
      const pieces = Array.isArray(silhouette.pieces) ? silhouette.pieces : [];
      if (!pieces.length || pieces.length > 100 || pieces.some((piece) => !points(piece))) return;
      jobs.push({
        folder, file: `${String(index + 2).padStart(2, '0')} - ${safeSegment(silhouette.name)} - noir.pdf`,
        html: pdfHtml(`<path d="${G.silhouettePath(pieces)}" fill="#000"/>`),
      });
    });
    return jobs;
  }).slice(0, 500);
}

module.exports = { buildPdfJobs, safeSegment };
