import { isAbort } from '../api/client.js';
import { t, translateLevel } from '../i18n/index.js';
import { el, notice, show } from './dom.js';
import { formatDateTime, formatTime } from './format.js';
import { describeError } from './messages.js';

export const ISSUE_STATUSES = ['open', 'in_progress', 'resolved'];
export const POLL_VISIBLE_MS = 10000;
export const POLL_BACKGROUND_MS = 30000;

export function countByStatus(issues) {
  const counts = { all: issues.length, open: 0, in_progress: 0, resolved: 0 };
  for (const issue of issues) if (issue.status in counts) counts[issue.status] += 1;
  return counts;
}

export function filterIssues(issues, status) {
  return status === 'all' ? issues : issues.filter((issue) => issue.status === status);
}

export function createAdminPanel(elements, { api, onOpenInViewer, onOpenCountChange }) {
  let enabled = false;
  let visible = false;
  let loaded = false;
  let issues = [];
  let filter = 'all';
  let loadError = null;
  let lastUpdated = null;
  let timer = null;
  let controller = null;
  let renderPending = false;
  const seen = new Set();
  const fresh = new Set();
  const saving = new Set();
  const rowErrors = new Map();

  const interacting = () => elements.body.contains(document.activeElement);

  function statusSelect(issue) {
    const select = el('select', {
      className: 'control control-compact',
      'aria-label': t('admin.statusLabel', { title: issue.title }),
      disabled: saving.has(issue.id),
      onChange: (event) => changeStatus(issue, event.target.value),
    }, ISSUE_STATUSES.map((status) => el('option', { value: status, text: t(`issueStatus.${status}`) })));
    select.value = issue.status;
    return el('div', { className: 'select' }, [select]);
  }

  function row(issue) {
    const error = rowErrors.get(issue.id);
    return el('tr', { className: fresh.has(issue.id) ? 'is-new' : null, dataset: { issueId: issue.id } }, [
      el('td', { 'data-label': t('admin.col.status') }, [el('div', {}, [
        statusSelect(issue),
        error ? el('p', { className: 'row-error', role: 'alert', text: describeError(error, 'admin.saveFailed') }) : null,
      ])]),
      el('td', { 'data-label': t('admin.col.issue') }, [el('div', {}, [
        el('div', { className: 'issue-heading' }, [
          el('span', { className: 'issue-title', text: issue.title }),
          fresh.has(issue.id) ? el('span', { className: 'tag-new', text: t('admin.new') }) : null,
        ]),
        el('div', { className: 'issue-meta' }, [
          el('span', { text: issue.projectName || t('admin.unknownProject') }),
          el('span', { text: issue.spaceName || t('admin.noSpace') }),
        ]),
        el('button', {
          type: 'button',
          className: 'button button-quiet open-in-3d',
          text: t('admin.openIn3d'),
          onClick: () => onOpenInViewer(issue),
        }),
      ])]),
      el('td', { 'data-label': t('admin.col.level') }, [el('span', { text: translateLevel(issue.level) })]),
      el('td', { 'data-label': t('admin.col.reportedBy') }, [el('span', { text: issue.reportedBy || '' })]),
      el('td', { 'data-label': t('admin.col.reported') }, [el('div', {}, [
        el('time', { dateTime: issue.createdAt, text: formatDateTime(issue.createdAt) }),
        issue.updatedBy ? el('p', { className: 'muted issue-changed', text: t('admin.changedBy', { name: issue.updatedBy }) }) : null,
      ])]),
    ]);
  }

  function table(rows) {
    const columns = ['status', 'issue', 'level', 'reportedBy', 'reported'];
    return el('table', { className: 'issues-table' }, [
      el('thead', {}, [el('tr', {}, columns.map((key) => el('th', { scope: 'col', text: t(`admin.col.${key}`) })))]),
      el('tbody', {}, rows.map(row)),
    ]);
  }

  function renderMeta() {
    elements.meta.replaceChildren(
      ...(lastUpdated ? [el('span', { text: t('admin.updated', { time: formatTime(lastUpdated) }) })] : []),
      el('span', { text: t('admin.autoRefresh', { seconds: POLL_VISIBLE_MS / 1000 }) }),
    );
  }

  function renderFilter() {
    const counts = countByStatus(issues);
    const options = [['all', t('admin.filterAll')], ...ISSUE_STATUSES.map((status) => [status, t(`issueStatus.${status}`)])];
    elements.filter.replaceChildren(...options.map(([value, label]) => el('button', {
      type: 'button',
      className: 'button filter-chip',
      'aria-pressed': String(filter === value),
      onClick: () => {
        filter = value;
        render();
      },
    }, [label, el('span', { className: 'chip-count', text: String(counts[value]) })])));
  }

  function renderBody() {
    elements.notice.replaceChildren();
    if (loadError) {
      elements.notice.append(notice('error', describeError(loadError, 'admin.loadFailed'), refresh));
    }
    if (!loaded) {
      elements.body.replaceChildren(...(loadError ? [] : [el('p', { className: 'muted', role: 'status', text: t('admin.loading') })]));
      return;
    }
    const visibleIssues = filterIssues(issues, filter);
    if (issues.length === 0) {
      elements.body.replaceChildren(el('p', { className: 'admin-empty', text: t('admin.empty') }));
    } else if (visibleIssues.length === 0) {
      elements.body.replaceChildren(el('p', { className: 'admin-empty', text: t('admin.emptyFilter') }));
    } else {
      elements.body.replaceChildren(table(visibleIssues));
    }
  }

  function render() {
    renderPending = false;
    renderMeta();
    renderFilter();
    renderBody();
  }

  function requestRender() {
    if (visible && interacting()) {
      renderPending = true;
      renderMeta();
      return;
    }
    render();
  }

  function notifyCount() {
    onOpenCountChange(enabled ? countByStatus(issues).open : 0);
  }

  async function refresh() {
    if (!enabled) return;
    if (controller) controller.abort();
    const current = new AbortController();
    controller = current;
    try {
      const next = await api.listIssues(current.signal);
      if (current.signal.aborted || !enabled) return;
      const baseline = !loaded;
      for (const issue of next) {
        if (baseline) seen.add(issue.id);
        else if (!seen.has(issue.id)) fresh.add(issue.id);
      }
      issues = next;
      loaded = true;
      loadError = null;
      lastUpdated = new Date();
    } catch (error) {
      if (isAbort(error) || current.signal.aborted) return;
      loadError = error;
    }
    requestRender();
    notifyCount();
  }

  function schedule() {
    clearTimeout(timer);
    if (!enabled) return;
    timer = setTimeout(async () => {
      if (!document.hidden) await refresh();
      schedule();
    }, visible ? POLL_VISIBLE_MS : POLL_BACKGROUND_MS);
  }

  async function changeStatus(issue, status) {
    saving.add(issue.id);
    rowErrors.delete(issue.id);
    render();
    try {
      const updated = await api.updateIssue(issue.id, status);
      issues = issues.map((item) => (item.id === updated.id ? updated : item));
    } catch (error) {
      if (!isAbort(error)) rowErrors.set(issue.id, error);
    } finally {
      saving.delete(issue.id);
      render();
      notifyCount();
    }
  }

  function reset() {
    clearTimeout(timer);
    if (controller) controller.abort();
    controller = null;
    loaded = false;
    issues = [];
    loadError = null;
    lastUpdated = null;
    filter = 'all';
    seen.clear();
    fresh.clear();
    saving.clear();
    rowErrors.clear();
    render();
    notifyCount();
  }

  elements.body.addEventListener('focusout', () => {
    setTimeout(() => {
      if (renderPending && !interacting()) render();
    }, 0);
  });

  document.addEventListener('visibilitychange', () => {
    if (enabled && !document.hidden) {
      refresh();
      schedule();
    }
  });

  return {
    setEnabled(value) {
      reset();
      enabled = value;
      if (enabled) {
        refresh();
        schedule();
      }
    },
    show() {
      visible = true;
      show(elements.section, true);
      render();
      refresh();
      schedule();
    },
    hide() {
      visible = false;
      for (const id of fresh) seen.add(id);
      fresh.clear();
      show(elements.section, false);
      schedule();
    },
    refresh,
    relabel: render,
  };
}
