'use strict';

const { isStaff } = require('./auth');

const DATE_FIELDS = ['signed', 'scan', 'estimatedDelivery', 'delivered'];

const textOrNull = (value) => (typeof value === 'string' && value.length > 0 ? value : null);

function toProjectSummary(project) {
  return {
    id: project.id,
    name: project.name,
    address: project.address,
    status: project.status,
    client: { name: project.client?.name ?? null },
  };
}

function toContact(contact, user) {
  const result = { role: contact.role ?? null, name: contact.name ?? null };
  if (isStaff(user)) {
    result.email = textOrNull(contact.email);
    result.phone = textOrNull(contact.phone);
  }
  return result;
}

function toProjectDetail(project, user) {
  const dates = {};
  for (const field of DATE_FIELDS) dates[field] = textOrNull(project.dates?.[field]);
  const contacts = Array.isArray(project.client?.contacts) ? project.client.contacts : [];
  return {
    ...toProjectSummary(project),
    client: {
      name: project.client?.name ?? null,
      contacts: contacts.map((contact) => toContact(contact, user)),
    },
    dates,
    levels: Array.isArray(project.levels) ? [...project.levels] : [],
  };
}

function toSpace(space) {
  return {
    id: space.id,
    name: space.name,
    level: space.level,
    use: space.use,
    x: space.x,
    y: space.y,
    z: space.z,
    w: space.w,
    d: space.d,
    h: space.h,
  };
}

module.exports = { toProjectSummary, toProjectDetail, toSpace };
