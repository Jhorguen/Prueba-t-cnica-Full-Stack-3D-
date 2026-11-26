import { ApiError, NetworkError, isAbort } from '../api/client.js';
import { el, notice, show } from './dom.js';
import { characterCount } from './format.js';
import { describeError } from './messages.js';

export const TITLE_MAX = 120;
const NO_SPACE_TEXT = 'None. Tap a room in the 3D view to attach it.';

export function validateIssueDraft({ title, level }) {
  const errors = [];
  const length = characterCount(title);
  if (length < 1 || length > TITLE_MAX) {
    errors.push({ field: 'title', message: `Enter a title of 1 to ${TITLE_MAX} characters.` });
  }
  if (!level) errors.push({ field: 'level', message: 'Choose a level.' });
  return errors;
}

export function createIssueForm(elements, { send, onClearSpace }) {
  const invalidControls = { title: elements.title, level: elements.level };
  let space = null;
  let submitting = false;
  let generation = 0;

  function setSubmitting(value) {
    submitting = value;
    elements.submit.disabled = value;
    elements.submit.textContent = value ? 'Sending…' : 'Submit issue';
  }

  function updateTitleCount() {
    const count = characterCount(elements.title.value.trim());
    elements.titleCount.textContent = `${count}/${TITLE_MAX}`;
    elements.titleCount.style.color = count > TITLE_MAX ? 'var(--danger)' : '';
  }

  function clearErrors() {
    for (const node of Object.values(elements.errors)) node.textContent = '';
    for (const control of Object.values(invalidControls)) control.removeAttribute('aria-invalid');
  }

  function showFieldErrors(errors) {
    const unplaced = [];
    for (const { field, message } of errors) {
      const node = elements.errors[field];
      if (!node) {
        unplaced.push(message);
        continue;
      }
      node.textContent = message;
      if (invalidControls[field]) invalidControls[field].setAttribute('aria-invalid', 'true');
    }
    return unplaced;
  }

  function syncSpace() {
    elements.space.textContent = space ? `${space.name} (${space.level})` : NO_SPACE_TEXT;
    show(elements.spaceClear, Boolean(space));
    elements.level.disabled = Boolean(space);
    if (space) elements.level.value = space.level;
    elements.errors.spaceId.textContent = '';
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    clearErrors();
    elements.result.replaceChildren();

    const draft = { title: elements.title.value.trim(), level: elements.level.value };
    const localErrors = validateIssueDraft(draft);
    if (localErrors.length > 0) {
      showFieldErrors(localErrors);
      return;
    }

    const current = generation;
    setSubmitting(true);
    try {
      const issue = await send({ ...draft, spaceId: space ? space.id : undefined });
      if (current !== generation) return;
      elements.result.replaceChildren(notice('ok', `Issue reported. ID: ${issue.id}`));
      elements.title.value = '';
      updateTitleCount();
    } catch (error) {
      if (current !== generation || isAbort(error)) return;
      const unplaced = error instanceof ApiError ? showFieldErrors(error.details) : [];
      const message = [describeError(error, 'The issue could not be sent.'), ...unplaced].join(' ');
      const retry = error instanceof NetworkError ? () => elements.submit.click() : null;
      elements.result.replaceChildren(notice('error', message, retry));
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
        el('option', { value: '', text: 'Choose a level…' }),
        ...levels.map((level) => el('option', { value: level, text: level })),
      );
      elements.level.value = levels.length === 1 ? levels[0] : '';
      elements.title.value = '';
      updateTitleCount();
      clearErrors();
      elements.result.replaceChildren();
      setSubmitting(false);
      syncSpace();
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
      syncSpace();
    },
    suggestLevel(level) {
      if (level && !space) elements.level.value = level;
    },
  };
}
