import en from './en.js';
import es from './es.js';

const DICTIONARIES = { en, es };
const LOCALES = { en: 'en-US', es: 'es-CO' };
const DEFAULT_LANGUAGE = 'en';
const STORAGE_KEY = 'site-viewer:language';

export const LANGUAGES = Object.keys(DICTIONARIES);

function readStoredLanguage() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function storeLanguage(value) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value);
  } catch {
    return;
  }
}

const stored = readStoredLanguage();
let current = LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE;
const listeners = new Set();

if (typeof document !== 'undefined') document.documentElement.lang = current;

export const language = () => current;
export const locale = () => LOCALES[current];

export function t(key, params = {}) {
  const template = DICTIONARIES[current][key] ?? DICTIONARIES[DEFAULT_LANGUAGE][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

export function hasKey(key) {
  return key in DICTIONARIES[current] || key in DICTIONARIES[DEFAULT_LANGUAGE];
}

export function translateValue(prefix, value) {
  return DICTIONARIES[current][`${prefix}.${value}`] ?? value;
}

export function setLanguage(next) {
  if (!LANGUAGES.includes(next) || next === current) return;
  current = next;
  storeLanguage(next);
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  for (const listener of listeners) listener(next);
}

export function onLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function translateStatic(root) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-label]')) node.setAttribute('aria-label', t(node.dataset.i18nLabel));
}

export function dictionaryKeys(name) {
  return Object.keys(DICTIONARIES[name]);
}
