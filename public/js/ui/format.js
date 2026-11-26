import { locale, t } from '../i18n/index.js';

const SQUARE_FEET_PER_SQUARE_METRE = 10.7639;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const formatters = new Map();

function formatter(kind, factory) {
  const key = `${kind}:${locale()}`;
  if (!formatters.has(key)) formatters.set(key, factory(locale()));
  return formatters.get(key);
}

const dateFormat = () => formatter('date', (l) => new Intl.DateTimeFormat(l, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
}));

const areaFormat = () => formatter('area', (l) => new Intl.NumberFormat(l, { maximumFractionDigits: 1 }));

const megabyteFormat = () => formatter('megabytes', (l) => new Intl.NumberFormat(l, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
}));

export function isMissingDate(value) {
  return typeof value !== 'string' || value.trim() === '';
}

export function formatDate(value) {
  if (isMissingDate(value)) return t('date.notRecorded');
  const date = new Date(ISO_DAY.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? value : dateFormat().format(date);
}

export function floorArea(space) {
  return space.w * space.d;
}

export function formatArea(squareMetres, unit) {
  if (unit === 'ft2') return `${areaFormat().format(squareMetres * SQUARE_FEET_PER_SQUARE_METRE)} ft²`;
  return `${areaFormat().format(squareMetres)} m²`;
}

export function formatMegabytes(bytes) {
  return `${megabyteFormat().format(bytes / 1048576)} MB`;
}

export function formatCount(value) {
  return value.toLocaleString(locale());
}

export function characterCount(text) {
  return [...text].length;
}
