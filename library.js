(function (root) {
  'use strict';
  const storageKey = 'tangram-library-v1';
  const migrationKey = 'tangram-shared-library-v1';
  const upsert = (records, record) => [record, ...records.filter((item) => item.id !== record.id)]
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, 100);
  const remove = (records, id) => records.filter((item) => item.id !== id);
  const duplicate = (records, id, newId, updatedAt) => {
    const source = records.find((item) => item.id === id);
    if (!source) return records;
    const copy = JSON.parse(JSON.stringify(source));
    copy.id = newId;
    copy.name = `${source.name} copie`;
    copy.updatedAt = updatedAt;
    if (copy.project?.silhouettes?.[0]) copy.project.silhouettes[0].name = copy.name;
    return upsert(records, copy);
  };
  const read = (storage = root.localStorage) => {
    try {
      const records = JSON.parse(storage.getItem(storageKey) || '[]');
      return Array.isArray(records) ? records.filter((item) => item && typeof item.id === 'string' && item.project) : [];
    } catch { return []; }
  };
  const write = (records, storage = root.localStorage) => {
    try { storage.setItem(storageKey, JSON.stringify(records)); return true; } catch { return false; }
  };
  const merge = (local, remote) => {
    const records = new Map();
    [...local, ...remote].forEach((record) => {
      const current = records.get(record.id);
      if (!current || Number(record.updatedAt || 0) >= Number(current.updatedAt || 0)) records.set(record.id, record);
    });
    return [...records.values()].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, 100);
  };
  const sharedRecords = (local, remote, migrated) => migrated ? remote : merge(local, remote);
  const put = async (record) => {
    try {
      const response = await root.fetch('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) });
      return response.ok;
    } catch { return false; }
  };
  const erase = async (id) => {
    try { return (await root.fetch(`/api/library/${encodeURIComponent(id)}`, { method: 'DELETE' })).ok; } catch { return false; }
  };
  const pull = async (local, storage = root.localStorage) => {
    try {
      const response = await root.fetch('/api/library');
      if (!response.ok) return local;
      const remote = await response.json();
      if (!Array.isArray(remote)) return local;
      const migrated = storage.getItem(migrationKey) === '1';
      const records = sharedRecords(local, remote, migrated);
      write(records, storage);
      if (!migrated) {
        await Promise.all(records.filter((record) => !remote.some((item) => item.id === record.id && Number(item.updatedAt || 0) >= Number(record.updatedAt || 0))).map(put));
        storage.setItem(migrationKey, '1');
      }
      return records;
    } catch { return local; }
  };
  const projects = (records) => {
    const groups = new Map();
    records.forEach((record) => {
      const project = record.project || {};
      const composition = (project.composition || []).map(({ id, name, sourceId, ...piece }) => piece);
      const key = JSON.stringify([project.side, project.seed, project.quantities, composition]);
      if (!groups.has(key)) groups.set(key, {
        id: record.id, name: `Tangram ${project.seed || ''}`.trim(), updatedAt: record.updatedAt,
        recordIds: [], projectRecordId: null, project: { ...JSON.parse(JSON.stringify(project)), silhouettes: [] },
      });
      const group = groups.get(key);
      group.updatedAt = Math.max(group.updatedAt || 0, record.updatedAt || 0);
      group.recordIds.push(record.id);
      if (!(project.silhouettes || []).length) group.projectRecordId = record.id;
      (project.silhouettes || []).forEach((silhouette) => group.project.silhouettes.push({ ...JSON.parse(JSON.stringify(silhouette)), libraryId: record.id }));
    });
    return [...groups.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  };
  const api = { duplicate, erase, merge, projects, pull, put, read, remove, sharedRecords, storageKey, upsert, write };
  root.TangramLibrary = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
