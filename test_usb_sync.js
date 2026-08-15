const assert = require('node:assert/strict');
const G = require('./geometry.js');
const { buildPdfJobs, safeSegment } = require('./desktop/usb-sync.js');

const composition = G.classicTangram(140, 35, 78.5);
const records = [{
  id: 'test', name: 'Oiseau', updatedAt: 1,
  project: {
    version: 5, side: 140, seed: 'clé:/test', quantities: {}, composition,
    silhouettes: [{ name: 'Chat ?', pieces: composition.slice(0, 3) }],
  },
}];

const jobs = buildPdfJobs(records);
assert.equal(jobs.length, 2);
assert.deepEqual(jobs.map((job) => job.file), ['01 - Rangement.pdf', '02 - Chat - noir.pdf']);
assert.equal(jobs[0].folder, '01 - Tangram-clé-test');
assert.ok(jobs.every((job) => job.html.includes('@page { size: A4 portrait; margin: 0; }')));
assert.ok(jobs.every((job) => job.html.includes('width="210mm" height="297mm"')));
assert.equal(safeSegment('../CON:<test>?'), 'CON-test');
assert.deepEqual(buildPdfJobs([{ project: { composition: [] } }]), []);

console.log('Tests de synchronisation USB réussis.');
