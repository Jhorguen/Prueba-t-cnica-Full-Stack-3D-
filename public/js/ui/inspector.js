import { t, translateLevel, translateValue } from '../i18n/index.js';
import { show } from './dom.js';
import { floorArea, formatArea } from './format.js';

export function createInspector(elements, { onClose }) {
  let unit = 'm2';
  let space = null;

  function render() {
    show(elements.panel, Boolean(space));
    if (!space) return;
    elements.name.textContent = space.name;
    elements.use.textContent = space.use ? translateValue('use', space.use) : t('date.notRecorded');
    elements.level.textContent = translateLevel(space.level);
    elements.area.textContent = formatArea(floorArea(space), unit);
    elements.unitToggle.textContent = t(unit === 'm2' ? 'inspector.showFeet' : 'inspector.showMetres');
  }

  elements.unitToggle.addEventListener('click', () => {
    unit = unit === 'm2' ? 'ft2' : 'm2';
    render();
  });
  elements.close.addEventListener('click', onClose);

  return {
    showSpace(next) {
      space = next;
      render();
    },
    relabel: render,
  };
}
