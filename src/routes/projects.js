'use strict';

const path = require('path');
const express = require('express');
const { canViewProject } = require('../domain/access');
const { HttpError, projectNotFound } = require('../middleware/errors');
const { jsonBody } = require('../middleware/json-body');
const { sendRevalidatableJson, PRIVATE_REVALIDATE } = require('../middleware/http-cache');
const { toProjectSummary, toProjectDetail, toSpace } = require('../domain/serializers');
const { isValidProjectId, validateIssue } = require('../domain/validation');

const cloudNotFound = () => new HttpError(404, 'cloud_not_found', 'This project has no point cloud available.');

function projectsRouter(data, issues) {
  const router = express.Router();

  function resolveProject(req, res, next) {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      return next(new HttpError(400, 'invalid_id', 'Project id is malformed.'));
    }
    const project = data.findProject(id);
    if (!project || !canViewProject(req.user, project)) return next(projectNotFound());
    req.project = project;
    next();
  }

  router.get('/', (req, res) => {
    const visible = data.listProjects()
      .filter((project) => canViewProject(req.user, project))
      .map(toProjectSummary);
    sendRevalidatableJson(req, res, visible);
  });

  router.get('/:id', resolveProject, (req, res) => {
    sendRevalidatableJson(req, res, toProjectDetail(req.project, req.user));
  });

  router.get('/:id/spaces', resolveProject, (req, res) => {
    sendRevalidatableJson(req, res, data.listSpaces(req.project.id).map(toSpace));
  });

  router.get('/:id/cloud', resolveProject, (req, res, next) => {
    const fileName = req.project.cloud;
    if (typeof fileName !== 'string' || fileName !== path.basename(fileName)) {
      return next(cloudNotFound());
    }
    res.type('application/octet-stream');
    res.set({ 'Cache-Control': PRIVATE_REVALIDATE, Vary: 'Authorization' });
    res.sendFile(fileName, { root: data.cloudsDir, cacheControl: false, dotfiles: 'deny' }, (err) => {
      if (!err || res.headersSent) return;
      if (err.code === 'ENOENT' || err.code === 'EISDIR' || err.status === 404) return next(cloudNotFound());
      if (err.status === 416) {
        res.set(err.headers || {});
        return next(new HttpError(416, 'range_not_satisfiable', 'The requested byte range is not available.'));
      }
      next(err);
    });
  });

  router.post(
    '/:id/issues',
    resolveProject,
    ...jsonBody('16kb'),
    async (req, res, next) => {
      const { value, errors } = validateIssue(req.body, req.project, data.listSpaces(req.project.id));
      if (errors) {
        return next(new HttpError(400, 'validation_failed', 'The issue is not valid.', errors));
      }
      const issue = await issues.create({ ...value, projectId: req.project.id, reportedBy: req.user.name });
      res.status(201).json({
        id: issue.id,
        projectId: issue.projectId,
        title: issue.title,
        level: issue.level,
        spaceId: issue.spaceId,
        status: issue.status,
        createdAt: issue.createdAt,
      });
    },
  );

  return router;
}

module.exports = { projectsRouter };
