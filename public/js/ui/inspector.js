import { show } from './dom.js';
import { NOT_RECORDED, floorArea, formatArea } from './format.js';

export function createInspector(elements, { onClose }) {
  let unit = 'm2';
  let space = null;

  function render() {
    show(elements.panel, Boolean(space));
    if (!space) return;
    elements.name.textContent = space.name;
    elements.use.textContent = space.use || NOT_RECORDED;
    elements.level.textContent = space.level;
    elements.area.textContent = formatArea(floorArea(space), unit);
    elements.unitToggle.textContent = unit === 'm2' ? 'Show in ft²' : 'Show in m²';
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
  };
}
