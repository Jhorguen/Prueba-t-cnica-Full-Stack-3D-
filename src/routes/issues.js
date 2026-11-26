'use strict';

const express = require('express');
const { isStaff } = require('../domain/access');
const { toIssue } = require('../domain/serializers');
const { isValidIssueId, validateIssueUpdate } = require('../domain/validation');
const { HttpError } = require('../middleware/errors');
const { sendRevalidatableJson } = require('../middleware/http-cache');
const { jsonBody } = require('../middleware/json-body');

function issuesRouter(data, issues) {
  const router = express.Router();

  function requireStaff(req, res, next) {
    if (!isStaff(req.user)) return next(new HttpError(403, 'forbidden', 'Only staff can see issue reports.'));
    next();
  }

  function resolveIssue(req, res, next) {
    const { issueId } = req.params;
    if (!isValidIssueId(issueId)) return next(new HttpError(400, 'invalid_id', 'Issue id is malformed.'));
    const issue = issues.find(issueId);
    if (!issue) return next(new HttpError(404, 'issue_not_found', 'Issue not found.'));
    req.issue = issue;
    next();
  }

  function present(issue) {
    const project = data.findProject(issue.projectId);
    const space = issue.spaceId ? data.listSpaces(issue.projectId).find((s) => s.id === issue.spaceId) : null;
    return toIssue(issue, { projectName: project?.name, spaceName: space?.name });
  }

  router.use(requireStaff);

  router.get('/', (req, res) => {
    sendRevalidatableJson(req, res, issues.list().map(present));
  });

  router.patch('/:issueId', resolveIssue, ...jsonBody('4kb'), async (req, res, next) => {
    const { value, errors } = validateIssueUpdate(req.body);
    if (errors) return next(new HttpError(400, 'validation_failed', 'The change is not valid.', errors));
    const updated = await issues.update(req.issue.id, value, req.user.name);
    res.json(present(updated));
  });

  return router;
}

module.exports = { issuesRouter };
