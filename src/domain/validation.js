'use strict';

const PROJECT_ID = /^\d{4}-\d{5}$/;
const ISSUE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TITLE_MAX = 120;
const ISSUE_STATUSES = ['open', 'in_progress', 'resolved'];

const isValidProjectId = (id) => typeof id === 'string' && PROJECT_ID.test(id);
const isValidIssueId = (id) => typeof id === 'string' && ISSUE_ID.test(id);

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateIssue(body, project, spaces) {
  if (!isPlainObject(body)) {
    return { errors: [{ field: 'body', message: 'Body must be a JSON object.' }] };
  }

  const errors = [];
  const { title, level, spaceId } = body;

  let cleanTitle = null;
  if (typeof title !== 'string') {
    errors.push({ field: 'title', message: 'Title is required and must be text.' });
  } else {
    cleanTitle = title.trim();
    const length = [...cleanTitle].length;
    if (length < 1 || length > TITLE_MAX) {
      errors.push({ field: 'title', message: `Title must be between 1 and ${TITLE_MAX} characters.` });
    }
  }

  const levels = Array.isArray(project.levels) ? project.levels : [];
  if (typeof level !== 'string' || !levels.includes(level)) {
    errors.push({ field: 'level', message: 'Level must be one of the project levels.' });
  }

  let space = null;
  if (spaceId !== undefined && spaceId !== null) {
    space = typeof spaceId === 'string' ? spaces.find((s) => s.id === spaceId) : undefined;
    if (!space) {
      errors.push({ field: 'spaceId', message: 'Space does not exist in this project.' });
    } else if (typeof level === 'string' && space.level !== level) {
      errors.push({ field: 'spaceId', message: 'Space is not on the selected level.' });
    }
  }

  if (errors.length > 0) return { errors };
  return { value: { title: cleanTitle, level, spaceId: space ? space.id : null } };
}

function validateIssueUpdate(body) {
  if (!isPlainObject(body)) {
    return { errors: [{ field: 'body', message: 'Body must be a JSON object.' }] };
  }
  if (!ISSUE_STATUSES.includes(body.status)) {
    return { errors: [{ field: 'status', message: `Status must be one of: ${ISSUE_STATUSES.join(', ')}.` }] };
  }
  return { value: { status: body.status } };
}

module.exports = {
  isValidProjectId,
  isValidIssueId,
  validateIssue,
  validateIssueUpdate,
  TITLE_MAX,
  ISSUE_STATUSES,
};
