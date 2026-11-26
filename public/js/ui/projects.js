import { el, show } from './dom.js';
import { NOT_RECORDED, formatDate } from './format.js';

const DATE_FIELDS = [
  ['signed', 'Signed'],
  ['scan', 'Scanned'],
  ['estimatedDelivery', 'Estimated delivery'],
  ['delivered', 'Delivered'],
];

export function renderProjectList(list, { projects, currentId, onOpen }) {
  list.replaceChildren(...projects.map((project) => el('li', {}, [
    el('button', {
      type: 'button',
      className: 'project-button',
      'aria-current': project.id === currentId ? 'true' : 'false',
      onClick: () => onOpen(project.id),
    }, [
      el('strong', { text: project.name }),
      el('span', { className: 'muted', text: project.address }),
      el('span', { className: 'muted', text: `${project.status} · ${project.client?.name ?? 'Unknown client'}` }),
    ]),
  ])));
}

function contactItem(contact) {
  return el('div', { className: 'contact' }, [
    el('strong', { text: contact.name || 'Unnamed contact' }),
    contact.role ? el('span', { className: 'muted', text: ` · ${contact.role}` }) : null,
    contact.email ? el('div', {}, [el('a', { href: `mailto:${contact.email}`, text: contact.email })]) : null,
    contact.phone ? el('div', {}, [el('a', { href: `tel:${contact.phone.replace(/\s+/g, '')}`, text: contact.phone })]) : null,
  ]);
}

export function renderProjectCard(elements, project) {
  elements.client.textContent = project.client?.name || 'Unknown client';
  elements.name.textContent = project.name;
  elements.address.textContent = project.address || '';
  elements.status.textContent = project.status || 'Unknown status';

  elements.dates.replaceChildren(...DATE_FIELDS.flatMap(([key, label]) => {
    const text = formatDate(project.dates?.[key]);
    return [
      el('dt', { text: label }),
      el('dd', { text, className: text === NOT_RECORDED ? 'not-recorded' : null }),
    ];
  }));

  elements.contacts.replaceChildren(...(project.client?.contacts || []).map(contactItem));
  show(elements.card, true);
}
