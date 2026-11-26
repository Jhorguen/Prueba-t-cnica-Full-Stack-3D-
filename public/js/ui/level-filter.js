import { t, translateLevel } from '../i18n/index.js';
import { el } from './dom.js';

export function renderLevelFilter(container, { levels, active, colorFor, onChange }) {
  const chips = [
    { level: null, label: t('levels.all') },
    ...levels.map((level) => ({ level, label: translateLevel(level), color: colorFor(level) })),
  ];
  container.replaceChildren(...chips.map(({ level, label, color }) => el('button', {
    type: 'button',
    className: 'button level-chip',
    'aria-pressed': String(active === level),
    onClick: () => onChange(level),
  }, [
    color ? el('span', { className: 'swatch', style: { background: color }, 'aria-hidden': 'true' }) : null,
    label,
  ])));
}
