'use strict';

const { unauthorized } = require('./errors');

const BEARER = /^Bearer[ ]+([A-Za-z0-9._~+/-]+=*)[ ]*$/i;

function authenticate(data) {
  return (req, res, next) => {
    const match = BEARER.exec(req.get('Authorization') || '');
    const user = match ? data.findUserByToken(match[1]) : null;
    if (!user) return next(unauthorized());
    req.user = user;
    next();
  };
}

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

module.exports = { authenticate, isStaff, canViewProject };
