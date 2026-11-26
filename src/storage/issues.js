'use strict';

const crypto = require('crypto');
const fs = require('fs');

function createIssueStore({ file }) {
  return {
    async create(fields) {
      const issue = { ...fields, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      await fs.promises.appendFile(file, `${JSON.stringify(issue)}\n`, 'utf8');
      return issue;
    },
  };
}

module.exports = { createIssueStore };
