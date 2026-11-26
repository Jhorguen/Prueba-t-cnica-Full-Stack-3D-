import { t } from '../i18n/index.js';
import { notice, show } from './dom.js';
import { formatCount, formatMegabytes } from './format.js';
import { describeCloudError } from './messages.js';

export function describeLoadedCloud({ count, totalCount, stride }) {
  if (stride > 1) {
    return t('cloud.loadedSampled', { count: formatCount(count), stride, total: formatCount(totalCount) });
  }
  return t('cloud.loaded', { count: formatCount(count) });
}

export function describeProgress(loaded, total) {
  if (!total) return formatMegabytes(loaded);
  const fraction = Math.min(1, loaded / total);
  return t('cloud.progress', {
    loaded: formatMegabytes(loaded),
    total: formatMegabytes(total),
    percent: Math.floor(fraction * 100),
  });
}

export function createCloudPanel(elements, { onLoad, onCancel, onToggleVisible }) {
  let mode = 'idle';
  let detail = null;
  let visible = true;
  let progress = { loaded: 0, total: null };

  function render() {
    elements.load.textContent = t('cloud.load');
    elements.cancel.textContent = t('cloud.cancel');
    elements.progressBar.setAttribute('aria-label', t('cloud.progressLabel'));
    elements.toggle.setAttribute('aria-pressed', String(visible));
    elements.toggle.textContent = t(visible ? 'cloud.hide' : 'cloud.show');

    show(elements.load, mode === 'idle' || mode === 'cancelled');
    show(elements.progress, mode === 'loading');
    show(elements.toggle, mode === 'loaded');
    elements.progressText.textContent = describeProgress(progress.loaded, progress.total);

    elements.status.replaceChildren();
    if (mode === 'loaded') elements.status.append(notice('ok', describeLoadedCloud(detail)));
    else if (mode === 'cancelled') elements.status.append(notice('info', t('cloud.cancelled')));
    else if (mode === 'error') elements.status.append(notice('error', describeCloudError(detail), onLoad));
  }

  elements.load.addEventListener('click', onLoad);
  elements.cancel.addEventListener('click', onCancel);
  elements.toggle.addEventListener('click', () => {
    visible = !visible;
    render();
    onToggleVisible(visible);
  });

  return {
    setAvailable(available) {
      elements.load.disabled = !available;
    },

    setMode(nextMode, nextDetail = null) {
      mode = nextMode;
      detail = nextDetail;
      if (mode === 'loaded') visible = true;
      if (mode === 'loading') progress = { loaded: 0, total: null };
      render();
    },

    setProgress(loaded, total) {
      progress = { loaded, total };
      if (total) elements.progressBar.value = Math.min(1, loaded / total);
      else elements.progressBar.removeAttribute('value');
      elements.progressText.textContent = describeProgress(loaded, total);
    },

    relabel: render,
  };
}
