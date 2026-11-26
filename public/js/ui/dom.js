import { t } from '../i18n/index.js';

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'className') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function notice(kind, message, onRetry) {
  return el('div', { className: `notice notice-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, [
    el('p', { text: message }),
    onRetry ? el('button', { type: 'button', className: 'button', text: t('notice.retry'), onClick: onRetry }) : null,
  ]);
}

export function show(node, visible) {
  node.hidden = !visible;
}

export function cssToken(name, element = document.documentElement) {
  return getComputedStyle(element).getPropertyValue(name).trim();
}

export function skeletonRows(count) {
  return Array.from({ length: count }, () => el('li', { className: 'skeleton', 'aria-hidden': 'true' }, [
    el('span', { className: 'skeleton-line' }),
    el('span', { className: 'skeleton-line' }),
  ]));
}
