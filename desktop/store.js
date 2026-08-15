const fs = require('node:fs');
const path = require('node:path');

class LibraryStore {
  constructor(file) { this.file = file; }

  read() {
    try {
      const records = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(records) ? records : [];
    } catch { return []; }
  }

  write(records) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(records, null, 2), 'utf8');
    fs.renameSync(temporary, this.file);
  }

  upsert(record) {
    if (!record || typeof record.id !== 'string' || !record.project || typeof record.project !== 'object') throw new Error('Sauvegarde invalide');
    const records = [record, ...this.read().filter((item) => item.id !== record.id)]
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, 100);
    this.write(records);
  }

  remove(id) { this.write(this.read().filter((item) => item.id !== id)); }
}

module.exports = { LibraryStore };
