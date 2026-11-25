import { createApi, ApiError, NetworkError, isAbort } from './api.js';
import { loadPointCloud } from './cloud-loader.js';
import { el, notice, show } from './dom.js';
import {
  NOT_RECORDED,
  characterCount,
  floorArea,
  formatArea,
  formatCount,
  formatDate,
  formatMegabytes,
} from './format.js';
import { SiteViewer, LEVEL_COLORS } from './viewer.js';

const USERS = [
  { token: 'staff-token', label: 'Dana Ortiz · Staff' },
  { token: 'acme-token', label: 'Sam Lee · Acme Builders' },
  { token: 'brick-token', label: 'Rita Gomez · Brick & Co' },
];

const DATE_FIELDS = [
  ['signed', 'Signed'],
  ['scan', 'Scanned'],
  ['estimatedDelivery', 'Estimated delivery'],
  ['delivered', 'Delivered'],
];

const TITLE_MAX = 120;
const MAX_POINTS = 2000000;
const NO_SPACE_TEXT = 'None. Tap a room in the 3D view to attach it.';

const $ = (id) => document.getElementById(id);

const ui = {
  userSelect: $('user-select'),
  projectsStatus: $('projects-status'),
  projectList: $('project-list'),
  projectCard: $('project-card'),
  projectClient: $('project-client'),
  projectName: $('project-name'),
  projectAddress: $('project-address'),
  projectStatus: $('project-status'),
  projectDates: $('project-dates'),
  projectContacts: $('project-contacts'),
  issuePanel: $('issue-panel'),
  issueForm: $('issue-form'),
  issueTitle: $('issue-title'),
  issueTitleCount: $('issue-title-count'),
  issueLevel: $('issue-level'),
  issueSpace: $('issue-space'),
  issueSpaceClear: $('issue-space-clear'),
  issueSubmit: $('issue-submit'),
  issueResult: $('issue-result'),
  fieldErrors: {
    title: $('issue-title-error'),
    level: $('issue-level-error'),
    spaceId: $('issue-space-error'),
  },
  levelFilter: $('level-filter'),
  cloudLoad: $('cloud-load'),
  cloudToggle: $('cloud-toggle'),
  cloudProgress: $('cloud-progress'),
  cloudProgressBar: $('cloud-progress-bar'),
  cloudProgressText: $('cloud-progress-text'),
  cloudCancel: $('cloud-cancel'),
  cloudStatus: $('cloud-status'),
  stage: $('stage'),
  stageMessage: $('stage-message'),
  inspector: $('inspector'),
  inspectorName: $('inspector-name'),
  inspectorUse: $('inspector-use'),
  inspectorLevel: $('inspector-level'),
  inspectorArea: $('inspector-area'),
  inspectorClose: $('inspector-close'),
  unitToggle: $('unit-toggle'),
};

const state = {
  token: '',
  projects: [],
  projectId: null,
  project: null,
  selectedSpace: null,
  levelFilter: null,
  unit: 'm2',
  submitting: false,
};

const api = createApi(() => state.token);
let viewer = null;
let usersController = null;
let projectController = null;
let cloudController = null;

function describeError(error, fallback) {
  if (error instanceof NetworkError) return error.message;
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your access token was rejected (HTTP 401). Choose the user again.';
    return `${error.message} (HTTP ${error.status})`;
  }
  return fallback;
}

function describeCloudError(error) {
  if (error.code === 'http') {
    return `${error.message || 'The server could not send the point cloud.'} (HTTP ${error.status})`;
  }
  return error.message || 'The point cloud could not be loaded.';
}

function setStageMessage(content) {
  if (content === null) {
    ui.stageMessage.replaceChildren();
    show(ui.stageMessage, false);
    return;
  }
  ui.stageMessage.replaceChildren(content);
  show(ui.stageMessage, true);
}

function startViewer() {
  try {
    viewer = new SiteViewer(ui.stage, {
      onSelect: handleSpaceSelected,
      onContextChange: handleContextChange,
    });
  } catch {
    viewer = null;
    setStageMessage(notice('error', 'This device could not start the 3D view (WebGL is not available). Project details and issue reports still work.'));
  }
}

function handleContextChange(available) {
  if (available) {
    setStageMessage(null);
  } else {
    setStageMessage(notice('error', 'The browser reset the 3D view to free memory. It should come back on its own.', () => window.location.reload()));
  }
}

function renderUserOptions() {
  for (const user of USERS) ui.userSelect.append(el('option', { value: user.token, text: user.label }));
}

function selectUser(token) {
  usersController?.abort();
  closeProject();
  state.token = token;
  state.projects = [];
  renderProjectList();
  if (!token) {
    ui.projectsStatus.replaceChildren(el('p', { className: 'muted', text: 'Choose a user to see their projects.' }));
    setStageMessage('Choose a user, then a project, to see its spaces in 3D.');
    return;
  }
  setStageMessage('Choose a project to see its spaces in 3D.');
  loadProjects();
}

async function loadProjects() {
  usersController?.abort();
  const controller = new AbortController();
  usersController = controller;
  ui.projectsStatus.replaceChildren(el('p', { className: 'muted', text: 'Loading projects…' }));
  try {
    const projects = await api.listProjects(controller.signal);
    if (controller.signal.aborted) return;
    state.projects = Array.isArray(projects) ? projects : [];
    ui.projectsStatus.replaceChildren();
    if (state.projects.length === 0) {
      ui.projectsStatus.append(el('p', { className: 'muted', text: 'This user has no projects yet.' }));
    }
    renderProjectList();
  } catch (error) {
    if (isAbort(error) || controller.signal.aborted) return;
    ui.projectsStatus.replaceChildren(notice('error', describeError(error, 'Could not load the projects.'), loadProjects));
  }
}

function renderProjectList() {
  ui.projectList.replaceChildren(...state.projects.map((project) => el('li', {}, [
    el('button', {
      type: 'button',
      className: 'project-button',
      'aria-current': project.id === state.projectId ? 'true' : 'false',
      onClick: () => openProject(project.id),
    }, [
      el('strong', { text: project.name }),
      el('span', { className: 'muted', text: project.address }),
      el('span', { className: 'muted', text: `${project.status} · ${project.client?.name ?? 'Unknown client'}` }),
    ]),
  ])));
}

function closeProject() {
  cancelCloud();
  projectController?.abort();
  projectController = null;
  state.projectId = null;
  state.project = null;
  state.selectedSpace = null;
  state.levelFilter = null;
  if (viewer) {
    viewer.clearPointCloud();
    viewer.clearSpaces();
  }
  setCloudUi('idle');
  ui.cloudLoad.disabled = true;
  ui.levelFilter.replaceChildren();
  show(ui.projectCard, false);
  show(ui.issuePanel, false);
  show(ui.inspector, false);
}

async function openProject(id) {
  closeProject();
  const controller = new AbortController();
  projectController = controller;
  state.projectId = id;
  renderProjectList();
  setStageMessage('Loading project…');
  try {
    const [project, spaces] = await Promise.all([
      api.getProject(id, controller.signal),
      api.getSpaces(id, controller.signal),
    ]);
    if (controller.signal.aborted) return;
    state.project = project;
    renderProjectCard();
    renderLevelFilter();
    renderIssueForm();
    if (viewer) {
      viewer.setSpaces(spaces, project.levels || []);
      setStageMessage(spaces.length === 0 ? 'This project has no spaces recorded yet.' : null);
      ui.cloudLoad.disabled = false;
    }
  } catch (error) {
    if (isAbort(error) || controller.signal.aborted) return;
    setStageMessage(notice('error', describeError(error, 'Could not open the project.'), () => openProject(id)));
  }
}

function renderProjectCard() {
  const project = state.project;
  ui.projectClient.textContent = project.client?.name || 'Unknown client';
  ui.projectName.textContent = project.name;
  ui.projectAddress.textContent = project.address || '';
  ui.projectStatus.textContent = project.status || 'Unknown status';

  ui.projectDates.replaceChildren(...DATE_FIELDS.flatMap(([key, label]) => {
    const text = formatDate(project.dates?.[key]);
    return [
      el('dt', { text: label }),
      el('dd', { text, className: text === NOT_RECORDED ? 'not-recorded' : null }),
    ];
  }));

  const contacts = project.client?.contacts || [];
  ui.projectContacts.replaceChildren(...contacts.map((contact) => el('div', { className: 'contact' }, [
    el('strong', { text: contact.name || 'Unnamed contact' }),
    contact.role ? el('span', { className: 'muted', text: ` · ${contact.role}` }) : null,
    contact.email ? el('div', {}, [el('a', { href: `mailto:${contact.email}`, text: contact.email })]) : null,
    contact.phone ? el('div', {}, [el('a', { href: `tel:${contact.phone.replace(/\s+/g, '')}`, text: contact.phone })]) : null,
  ])));

  show(ui.projectCard, true);
}

function renderLevelFilter() {
  const levels = state.project?.levels || [];
  const chips = [
    { level: null, label: 'All levels' },
    ...levels.map((level, i) => ({ level, label: level, color: LEVEL_COLORS[i % LEVEL_COLORS.length] })),
  ];
  ui.levelFilter.replaceChildren(...chips.map(({ level, label, color }) => el('button', {
    type: 'button',
    className: 'button level-chip',
    'aria-pressed': String(state.levelFilter === level),
    onClick: () => setLevelFilter(level),
  }, [
    color ? el('span', { className: 'swatch', style: { background: color }, 'aria-hidden': 'true' }) : null,
    label,
  ])));
}

function setLevelFilter(level) {
  state.levelFilter = level;
  if (viewer) viewer.setLevelFilter(level);
  renderLevelFilter();
  if (level && !state.selectedSpace) ui.issueLevel.value = level;
}

function handleSpaceSelected(space) {
  state.selectedSpace = space;
  renderInspector();
  syncIssueSpace();
}

function renderInspector() {
  const space = state.selectedSpace;
  show(ui.inspector, Boolean(space));
  if (!space) return;
  ui.inspectorName.textContent = space.name;
  ui.inspectorUse.textContent = space.use || 'Not recorded';
  ui.inspectorLevel.textContent = space.level;
  ui.inspectorArea.textContent = formatArea(floorArea(space), state.unit);
  ui.unitToggle.textContent = state.unit === 'm2' ? 'Show in ft²' : 'Show in m²';
}

function renderIssueForm() {
  const levels = state.project?.levels || [];
  ui.issueLevel.replaceChildren(
    el('option', { value: '', text: 'Choose a level…' }),
    ...levels.map((level) => el('option', { value: level, text: level })),
  );
  ui.issueLevel.value = levels.length === 1 ? levels[0] : '';
  ui.issueTitle.value = '';
  updateTitleCount();
  clearIssueErrors();
  ui.issueResult.replaceChildren();
  setSubmitting(false);
  syncIssueSpace();
  show(ui.issuePanel, true);
}

function syncIssueSpace() {
  const space = state.selectedSpace;
  ui.issueSpace.textContent = space ? `${space.name} (${space.level})` : NO_SPACE_TEXT;
  show(ui.issueSpaceClear, Boolean(space));
  ui.issueLevel.disabled = Boolean(space);
  if (space) ui.issueLevel.value = space.level;
  ui.fieldErrors.spaceId.textContent = '';
}

function updateTitleCount() {
  const count = characterCount(ui.issueTitle.value.trim());
  ui.issueTitleCount.textContent = `${count}/${TITLE_MAX}`;
  ui.issueTitleCount.style.color = count > TITLE_MAX ? 'var(--danger)' : '';
}

function clearIssueErrors() {
  for (const [field, node] of Object.entries(ui.fieldErrors)) {
    node.textContent = '';
    const control = field === 'title' ? ui.issueTitle : field === 'level' ? ui.issueLevel : null;
    if (control) control.removeAttribute('aria-invalid');
  }
}

function showFieldErrors(errors) {
  const unplaced = [];
  for (const { field, message } of errors) {
    const node = ui.fieldErrors[field];
    if (!node) {
      unplaced.push(message);
      continue;
    }
    node.textContent = message;
    if (field === 'title') ui.issueTitle.setAttribute('aria-invalid', 'true');
    if (field === 'level') ui.issueLevel.setAttribute('aria-invalid', 'true');
  }
  return unplaced;
}

function setSubmitting(submitting) {
  state.submitting = submitting;
  ui.issueSubmit.disabled = submitting;
  ui.issueSubmit.textContent = submitting ? 'Sending…' : 'Submit issue';
}

async function submitIssue(event) {
  event.preventDefault();
  if (!state.project || !projectController || state.submitting) return;
  clearIssueErrors();
  ui.issueResult.replaceChildren();

  const title = ui.issueTitle.value.trim();
  const level = ui.issueLevel.value;
  const localErrors = [];
  const length = characterCount(title);
  if (length < 1 || length > TITLE_MAX) {
    localErrors.push({ field: 'title', message: `Enter a title of 1 to ${TITLE_MAX} characters.` });
  }
  if (!level) localErrors.push({ field: 'level', message: 'Choose a level.' });
  if (localErrors.length > 0) {
    showFieldErrors(localErrors);
    return;
  }

  const { signal } = projectController;
  setSubmitting(true);
  try {
    const issue = await api.createIssue(state.project.id, {
      title,
      level,
      spaceId: state.selectedSpace ? state.selectedSpace.id : undefined,
    }, signal);
    if (signal.aborted) return;
    ui.issueResult.replaceChildren(notice('ok', `Issue reported. ID: ${issue.id}`));
    ui.issueTitle.value = '';
    updateTitleCount();
  } catch (error) {
    if (isAbort(error) || signal.aborted) return;
    const unplaced = error instanceof ApiError ? showFieldErrors(error.details) : [];
    const message = [describeError(error, 'The issue could not be sent.'), ...unplaced].join(' ');
    const retry = error instanceof NetworkError ? () => ui.issueSubmit.click() : null;
    ui.issueResult.replaceChildren(notice('error', message, retry));
  } finally {
    if (!signal.aborted) setSubmitting(false);
  }
}

function setCloudUi(mode, detail) {
  show(ui.cloudLoad, mode === 'idle' || mode === 'cancelled');
  show(ui.cloudProgress, mode === 'loading');
  show(ui.cloudToggle, mode === 'loaded');
  ui.cloudStatus.replaceChildren();

  if (mode === 'loaded') {
    ui.cloudToggle.textContent = 'Hide point cloud';
    ui.cloudToggle.setAttribute('aria-pressed', 'true');
    const sampled = detail.stride > 1
      ? ` (1 of every ${detail.stride} of ${formatCount(detail.totalCount)} points, to keep the view fluid)`
      : '';
    ui.cloudStatus.append(notice('ok', `Point cloud loaded: ${formatCount(detail.count)} points${sampled}.`));
  } else if (mode === 'cancelled') {
    ui.cloudStatus.append(notice('info', 'Point cloud loading was cancelled.'));
  } else if (mode === 'error') {
    ui.cloudStatus.append(notice('error', describeCloudError(detail), loadCloud));
  }
}

function updateProgress(loaded, total) {
  if (total) {
    const fraction = Math.min(1, loaded / total);
    ui.cloudProgressBar.value = fraction;
    ui.cloudProgressText.textContent = `${formatMegabytes(loaded)} of ${formatMegabytes(total)} (${Math.floor(fraction * 100)}%)`;
  } else {
    ui.cloudProgressBar.removeAttribute('value');
    ui.cloudProgressText.textContent = formatMegabytes(loaded);
  }
}

function cancelCloud() {
  if (!cloudController) return;
  const controller = cloudController;
  cloudController = null;
  controller.abort();
}

async function loadCloud() {
  if (!state.project || !viewer) return;
  cancelCloud();
  viewer.clearPointCloud();
  const controller = new AbortController();
  cloudController = controller;
  const projectId = state.project.id;
  setCloudUi('loading');
  updateProgress(0, null);

  try {
    const cloud = await loadPointCloud({
      url: api.cloudUrl(projectId),
      token: state.token,
      maxPoints: MAX_POINTS,
      signal: controller.signal,
      onProgress: updateProgress,
    });
    if (controller !== cloudController || state.projectId !== projectId) return;
    cloudController = null;
    viewer.setPointCloud(cloud);
    setCloudUi('loaded', cloud);
  } catch (error) {
    if (controller !== cloudController) return;
    cloudController = null;
    setCloudUi(isAbort(error) ? 'cancelled' : 'error', error);
  }
}

function bindEvents() {
  ui.userSelect.addEventListener('change', () => selectUser(ui.userSelect.value));
  ui.cloudLoad.addEventListener('click', loadCloud);
  ui.cloudCancel.addEventListener('click', () => {
    cancelCloud();
    setCloudUi('cancelled');
  });
  ui.cloudToggle.addEventListener('click', () => {
    const visible = ui.cloudToggle.getAttribute('aria-pressed') !== 'true';
    ui.cloudToggle.setAttribute('aria-pressed', String(visible));
    ui.cloudToggle.textContent = visible ? 'Hide point cloud' : 'Show point cloud';
    if (viewer) viewer.setPointCloudVisible(visible);
  });
  ui.inspectorClose.addEventListener('click', () => viewer && viewer.select(null));
  ui.issueSpaceClear.addEventListener('click', () => viewer && viewer.select(null));
  ui.unitToggle.addEventListener('click', () => {
    state.unit = state.unit === 'm2' ? 'ft2' : 'm2';
    renderInspector();
  });
  ui.issueTitle.addEventListener('input', updateTitleCount);
  ui.issueForm.addEventListener('submit', submitIssue);
}

function reportUnexpected() {
  ui.cloudStatus.replaceChildren(notice('error', 'Something unexpected happened. Reload the page if the view stops responding.', () => window.location.reload()));
}

window.addEventListener('error', reportUnexpected);
window.addEventListener('unhandledrejection', reportUnexpected);

renderUserOptions();
bindEvents();
startViewer();
selectUser('');
