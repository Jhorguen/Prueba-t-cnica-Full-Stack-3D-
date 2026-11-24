'use strict';

const fs = require('fs');
const path = require('path');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read ${file}: ${err.message}`);
  }
}

function readSpaces(dataDir, projectId) {
  const file = path.join(dataDir, 'spaces', `${projectId}.json`);
  if (!fs.existsSync(file)) return [];
  const spaces = readJson(file);
  if (!Array.isArray(spaces)) throw new Error(`${file} must contain an array`);
  return spaces;
}

function loadData(dataDir) {
  const users = readJson(path.join(dataDir, 'users.json'));
  const projects = readJson(path.join(dataDir, 'projects.json'));
  if (!Array.isArray(users)) throw new Error('users.json must contain an array');
  if (!Array.isArray(projects)) throw new Error('projects.json must contain an array');

  const usersByToken = new Map();
  for (const user of users) {
    if (typeof user.token !== 'string' || user.token.length === 0) {
      throw new Error('Every user needs a non-empty token');
    }
    usersByToken.set(user.token, user);
  }

  const projectsById = new Map();
  const spacesByProject = new Map();
  for (const project of projects) {
    projectsById.set(project.id, project);
    spacesByProject.set(project.id, readSpaces(dataDir, project.id));
  }

  return {
    findUserByToken: (token) => usersByToken.get(token) || null,
    listProjects: () => projects,
    findProject: (id) => projectsById.get(id) || null,
    listSpaces: (projectId) => spacesByProject.get(projectId) || [],
    cloudsDir: path.join(dataDir, 'clouds'),
  };
}

module.exports = { loadData };
