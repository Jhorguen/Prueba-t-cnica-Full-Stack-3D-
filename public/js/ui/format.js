export const NOT_RECORDED = 'Not recorded';

const SQUARE_FEET_PER_SQUARE_METRE = 10.7639;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const dateFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export function formatDate(value) {
  if (typeof value !== 'string' || value.trim() === '') return NOT_RECORDED;
  const date = new Date(ISO_DAY.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

export function floorArea(space) {
  return space.w * space.d;
}

export function formatArea(squareMetres, unit) {
  if (unit === 'ft2') return `${numberFormat.format(squareMetres * SQUARE_FEET_PER_SQUARE_METRE)} ft²`;
  return `${numberFormat.format(squareMetres)} m²`;
}

export function formatMegabytes(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function formatCount(value) {
  return value.toLocaleString('en-US');
}

export function characterCount(text) {
  return [...text].length;
}
