import { t, translateValue } from '../i18n/index.js';
import { el, show } from './dom.js';
import { formatDate, isMissingDate } from './format.js';

const DATE_FIELDS = ['signed', 'scan', 'estimatedDelivery', 'delivered'];

const statusText = (status) => (status ? translateValue('status', status) : t('project.unknownStatus'));
const clientName = (project) => project.client?.name || t('project.unknownClient');

export function renderProjectList(list, { projects, currentId, onOpen }) {
  list.replaceChildren(...projects.map((project) => el('li', {}, [
    el('button', {
      type: 'button',
      className: 'project-button',
      'aria-current': project.id === currentId ? 'true' : 'false',
      onClick: () => onOpen(project.id),
    }, [
      el('strong', { className: 'project-title', text: project.name }),
      el('span', { className: 'muted', text: project.address }),
      el('span', { className: 'project-meta' }, [
        el('span', { text: clientName(project) }),
        el('span', { className: 'status', text: statusText(project.status) }),
      ]),
    ]),
  ])));
}

function fact(label, value, className) {
  return [el('dt', { text: label }), el('dd', { className }, [value])];
}

function roleText(role) {
  if (role === 'primary') return t('contact.primary');
  return t('contact.other', { role });
}

function contactItem(contact) {
  return el('div', { className: 'contact' }, [
    el('strong', { text: contact.name || t('contact.unnamed') }),
    contact.role ? el('span', { className: 'muted', text: roleText(contact.role) }) : null,
    contact.email ? el('a', { href: `mailto:${contact.email}`, text: contact.email }) : null,
    contact.phone ? el('a', { href: `tel:${contact.phone.replace(/\s+/g, '')}`, text: contact.phone }) : null,
  ]);
}

export function renderProjectCard(elements, project) {
  elements.name.textContent = project.name;
  elements.address.textContent = project.address || '';

  elements.dates.replaceChildren(
    ...fact(t('project.client'), clientName(project)),
    ...fact(t('project.status'), el('span', { className: 'status', text: statusText(project.status) })),
    ...DATE_FIELDS.flatMap((key) => {
      const value = project.dates?.[key];
      return fact(t(`date.${key}`), formatDate(value), isMissingDate(value) ? 'not-recorded' : null);
    }),
  );

  const contacts = project.client?.contacts || [];
  elements.contacts.replaceChildren(
    ...(contacts.length ? [el('h3', { className: 'contacts-title', text: t(contacts.length === 1 ? 'contacts.one' : 'contacts.many') })] : []),
    ...contacts.map(contactItem),
  );
  show(elements.contacts, contacts.length > 0);
  show(elements.card, true);
}
