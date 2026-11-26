'use strict';

function isStaff(user) {
  return user.role === 'staff';
}

function canViewProject(user, project) {
  if (isStaff(user)) return true;
  return user.role === 'client'
    && typeof user.account === 'string'
    && user.account.length > 0
    && project.account === user.account;
}

module.exports = { isStaff, canViewProject };
