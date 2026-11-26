'use strict';

const crypto = require('crypto');
const fs = require('fs');

function readLog(file, logger) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((line, index) => {
    try {
      return [JSON.parse(line)];
    } catch {
      logger.error(new Error(`Skipping unreadable line ${index + 1} in ${file}`));
      return [];
    }
  });
}

function createIssueStore({ file, logger = console }) {
  const issues = new Map();
  const arrival = new Map();

  function remember(record) {
    if (!arrival.has(record.id)) arrival.set(record.id, arrival.size);
    issues.set(record.id, record);
  }

  for (const record of readLog(file, logger)) {
    if (record && typeof record.id === 'string') remember({ status: 'open', ...record });
  }

  async function append(record) {
    await fs.promises.appendFile(file, `${JSON.stringify(record)}\n`, 'utf8');
    remember(record);
    return record;
  }

  return {
    create(fields) {
      const now = new Date().toISOString();
      return append({ ...fields, id: crypto.randomUUID(), status: 'open', createdAt: now, updatedAt: now });
    },
    list() {
      return [...issues.values()].sort((a, b) => (
        b.createdAt.localeCompare(a.createdAt) || arrival.get(b.id) - arrival.get(a.id)
      ));
    },
    find(id) {
      return issues.get(id) || null;
    },
    update(id, changes, updatedBy) {
      const current = issues.get(id);
      return append({ ...current, ...changes, updatedAt: new Date().toISOString(), updatedBy });
    },
  };
}

module.exports = { createIssueStore };
