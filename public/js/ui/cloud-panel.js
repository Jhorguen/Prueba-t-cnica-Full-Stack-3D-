import { notice, show } from './dom.js';
import { formatCount, formatMegabytes } from './format.js';
import { describeCloudError } from './messages.js';

export function describeLoadedCloud({ count, totalCount, stride }) {
  const sampled = stride > 1
    ? ` (1 of every ${stride} of ${formatCount(totalCount)} points, to keep the view fluid)`
    : '';
  return `Point cloud loaded: ${formatCount(count)} points${sampled}.`;
}

export function describeProgress(loaded, total) {
  if (!total) return formatMegabytes(loaded);
  const fraction = Math.min(1, loaded / total);
  return `${formatMegabytes(loaded)} of ${formatMegabytes(total)} (${Math.floor(fraction * 100)}%)`;
}

export function createCloudPanel(elements, { onLoad, onCancel, onToggleVisible }) {
  function setToggle(visible) {
    elements.toggle.setAttribute('aria-pressed', String(visible));
    elements.toggle.textContent = visible ? 'Hide point cloud' : 'Show point cloud';
  }

  elements.load.addEventListener('click', onLoad);
  elements.cancel.addEventListener('click', onCancel);
  elements.toggle.addEventListener('click', () => {
    const visible = elements.toggle.getAttribute('aria-pressed') !== 'true';
    setToggle(visible);
    onToggleVisible(visible);
  });

  return {
    setAvailable(available) {
      elements.load.disabled = !available;
    },

    setMode(mode, detail) {
      show(elements.load, mode === 'idle' || mode === 'cancelled');
      show(elements.progress, mode === 'loading');
      show(elements.toggle, mode === 'loaded');
      elements.status.replaceChildren();

      if (mode === 'loaded') {
        setToggle(true);
        elements.status.append(notice('ok', describeLoadedCloud(detail)));
      } else if (mode === 'cancelled') {
        elements.status.append(notice('info', 'Point cloud loading was cancelled.'));
      } else if (mode === 'error') {
        elements.status.append(notice('error', describeCloudError(detail), onLoad));
      }
    },

    setProgress(loaded, total) {
      if (total) elements.progressBar.value = Math.min(1, loaded / total);
      else elements.progressBar.removeAttribute('value');
      elements.progressText.textContent = describeProgress(loaded, total);
    },
  };
}
