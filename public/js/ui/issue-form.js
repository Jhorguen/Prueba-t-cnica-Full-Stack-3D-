import { ApiError, NetworkError, isAbort } from '../api/client.js';
import { t } from '../i18n/index.js';
import { el, notice, show } from './dom.js';
import { characterCount } from './format.js';
import { describeError, describeFieldError } from './messages.js';

export const TITLE_MAX = 120;
const KNOWN_FIELDS = ['title', 'level', 'spaceId'];

export function validateIssueDraft({ title, level }) {
  const errors = [];
  const length = characterCount(title);
  if (length < 1 || length > TITLE_MAX) errors.push({ field: 'title' });
  if (!level) errors.push({ field: 'level' });
  return errors;
}

export function createIssueForm(elements, { send, onClearSpace }) {
  const invalidControls = { title: elements.title, level: elements.level };
  let space = null;
  let submitting = false;
  let generation = 0;
  let fieldErrors = [];
  let result = null;

  function renderSubmit() {
    elements.submit.disabled = submitting;
    elements.submit.textContent = t(submitting ? 'issue.sending' : 'issue.submit');
  }

  function setSubmitting(value) {
    submitting = value;
    renderSubmit();
  }

  function updateTitleCount() {
    const count = characterCount(elements.title.value.trim());
    elements.titleCount.textContent = `${count}/${TITLE_MAX}`;
    elements.titleCount.style.color = count > TITLE_MAX ? 'var(--color-danger)' : '';
  }

  function renderErrors() {
    for (const node of Object.values(elements.errors)) node.textContent = '';
    for (const control of Object.values(invalidControls)) control.removeAttribute('aria-invalid');
    for (const error of fieldErrors) {
      if (!KNOWN_FIELDS.includes(error.field)) continue;
      elements.errors[error.field].textContent = describeFieldError(error, { max: TITLE_MAX });
      if (invalidControls[error.field]) invalidControls[error.field].setAttribute('aria-invalid', 'true');
    }
  }

  function setFieldErrors(errors) {
    fieldErrors = errors;
    renderErrors();
  }

  function renderResult() {
    elements.result.replaceChildren(...(result ? [result()] : []));
  }

  function setResult(render) {
    result = render;
    renderResult();
  }

  function renderSpace() {
    elements.space.textContent = space ? `${space.name} (${space.level})` : t('issue.noSpace');
    elements.spaceClear.textContent = t('issue.removeSpace');
    show(elements.spaceClear, Boolean(space));
    elements.level.disabled = Boolean(space);
    if (space) elements.level.value = space.level;
  }

  function renderLevelPlaceholder() {
    if (elements.level.options[0]) elements.level.options[0].textContent = t('issue.chooseLevel');
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    setFieldErrors([]);
    setResult(null);

    const draft = { title: elements.title.value.trim(), level: elements.level.value };
    const localErrors = validateIssueDraft(draft);
    if (localErrors.length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    const current = generation;
    setSubmitting(true);
    try {
      const issue = await send({ ...draft, spaceId: space ? space.id : undefined });
      if (current !== generation) return;
      setResult(() => notice('ok', t('issue.created', { id: issue.id })));
      elements.title.value = '';
      updateTitleCount();
    } catch (error) {
      if (current !== generation || isAbort(error)) return;
      const details = error instanceof ApiError ? error.details : [];
      setFieldErrors(details);
      const unplaced = details.filter((detail) => !KNOWN_FIELDS.includes(detail.field));
      const retry = error instanceof NetworkError ? () => elements.submit.click() : null;
      setResult(() => notice(
        'error',
        [describeError(error, 'issue.sendFailed'), ...unplaced.map((detail) => describeFieldError(detail))].join(' '),
        retry,
      ));
    } finally {
      if (current === generation) setSubmitting(false);
    }
  }

  elements.title.addEventListener('input', updateTitleCount);
  elements.form.addEventListener('submit', submit);
  elements.spaceClear.addEventListener('click', onClearSpace);

  return {
    open(levels) {
      generation++;
      elements.level.replaceChildren(
        el('option', { value: '', text: t('issue.chooseLevel') }),
        ...levels.map((level) => el('option', { value: level, text: level })),
      );
      elements.level.value = levels.length === 1 ? levels[0] : '';
      elements.title.value = '';
      updateTitleCount();
      setFieldErrors([]);
      setResult(null);
      setSubmitting(false);
      renderSpace();
      show(elements.panel, true);
    },
    close() {
      generation++;
      space = null;
      setSubmitting(false);
      show(elements.panel, false);
    },
    setSpace(next) {
      space = next;
      renderSpace();
      elements.errors.spaceId.textContent = '';
    },
    suggestLevel(level) {
      if (level && !space) elements.level.value = level;
    },
    relabel() {
      renderSubmit();
      renderSpace();
      renderLevelPlaceholder();
      renderErrors();
      renderResult();
    },
  };
}
