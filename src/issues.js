'use strict';

const crypto = require('crypto');

function createIssueStore() {
  const issues = [];
  return {
    create(fields) {
      const issue = { ...fields, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      issues.push(issue);
      return issue;
    },
    list: () => [...issues],
  };
}

module.exports = { createIssueStore };
