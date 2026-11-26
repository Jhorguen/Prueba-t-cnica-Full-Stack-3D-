import { createApi, isAbort } from './api/client.js';
import { loadPointCloud } from './cloud/loader.js';
import { language, onLanguageChange, setLanguage, t, translateStatic } from './i18n/index.js';
import { SiteViewer } from './scene/viewer.js';
import { createCloudPanel } from './ui/cloud-panel.js';
import { cssToken, el, notice, show, skeletonRows } from './ui/dom.js';
import { createInspector } from './ui/inspector.js';
import { createIssueForm } from './ui/issue-form.js';
import { renderLevelFilter } from './ui/level-filter.js';
import { describeError } from './ui/messages.js';
import { renderProjectCard, renderProjectList } from './ui/projects.js';

const USERS = [
  { token: 'staff-token', name: 'Dana Ortiz' },
  { token: 'acme-token', name: 'Sam Lee', client: 'Acme Builders' },
  { token: 'brick-token', name: 'Rita Gomez', client: 'Brick & Co' },
];

const MAX_POINTS = 2000000;
const LEVEL_TOKENS = 7;
const LEVEL_PALETTE = Array.from({ length: LEVEL_TOKENS }, (_, i) => cssToken(`--level-${i + 1}`)).filter(Boolean);
const STAGE_COLOR = cssToken('--color-stage');

const $ = (id) => document.getElementById(id);

const state = {
  token: '',
  projects: [],
  projectId: null,
  project: null,
  levelFilter: null,
};

const api = createApi(() => state.token);
let viewer = null;
let usersController = null;
let projectController = null;
let cloudController = null;
let stageContent = null;
let projectsStatusContent = null;

const userSelect = $('user-select');
const languageButtons = [...document.querySelectorAll('.language-option')];
const projectsStatus = $('projects-status');
const projectList = $('project-list');
const levelFilter = $('level-filter');
const stage = $('stage');
const stageMessage = $('stage-message');

const projectCard = {
  card: $('project-card'),
  name: $('project-name'),
  address: $('project-address'),
  dates: $('project-dates'),
  contacts: $('project-contacts'),
};

const inspector = createInspector({
  panel: $('inspector'),
  name: $('inspector-name'),
  use: $('inspector-use'),
  level: $('inspector-level'),
  area: $('inspector-area'),
  unitToggle: $('unit-toggle'),
  close: $('inspector-close'),
}, { onClose: () => selectSpace(null) });

const issueForm = createIssueForm({
  panel: $('issue-panel'),
  form: $('issue-form'),
  title: $('issue-title'),
  titleCount: $('issue-title-count'),
  level: $('issue-level'),
  space: $('issue-space'),
  spaceClear: $('issue-space-clear'),
  submit: $('issue-submit'),
  result: $('issue-result'),
  errors: {
    title: $('issue-title-error'),
    level: $('issue-level-error'),
    spaceId: $('issue-space-error'),
  },
}, {
  send: (issue) => api.createIssue(state.project.id, issue, projectController.signal),
  onClearSpace: () => selectSpace(null),
});

const cloudPanel = createCloudPanel({
  load: $('cloud-load'),
  toggle: $('cloud-toggle'),
  progress: $('cloud-progress'),
  progressBar: $('cloud-progress-bar'),
  progressText: $('cloud-progress-text'),
  cancel: $('cloud-cancel'),
  status: $('cloud-status'),
}, {
  onLoad: loadCloud,
  onCancel: () => {
    cancelCloud();
    cloudPanel.setMode('cancelled');
  },
  onToggleVisible: (visible) => viewer && viewer.setPointCloudVisible(visible),
});

function paintStage() {
  const content = stageContent ? stageContent() : null;
  stageMessage.replaceChildren(...(content === null ? [] : [content]));
  show(stageMessage, content !== null);
}

function setStage(render) {
  stageContent = render;
  paintStage();
}

function paintProjectsStatus() {
  projectsStatus.replaceChildren(...(projectsStatusContent ? [projectsStatusContent()] : []));
}

function setProjectsStatus(render) {
  projectsStatusContent = render;
  paintProjectsStatus();
}

function startViewer() {
  try {
    viewer = new SiteViewer(stage, {
      palette: LEVEL_PALETTE,
      background: STAGE_COLOR,
      onSelect: handleSpaceSelected,
      onContextChange: (available) => setStage(available ? null : () => notice(
        'error',
        t('stage.contextLost'),
        () => window.location.reload(),
      )),
    });
    viewer.canvas.setAttribute('aria-label', t('stage.canvasLabel'));
  } catch {
    viewer = null;
    setStage(() => notice('error', t('stage.noWebgl')));
  }
}

function selectSpace(spaceId) {
  if (viewer) viewer.select(spaceId);
  else handleSpaceSelected(null);
}

function handleSpaceSelected(space) {
  inspector.showSpace(space);
  issueForm.setSpace(space);
}

function levelColor(level) {
  const index = Math.max(0, (state.project?.levels || []).indexOf(level));
  return LEVEL_PALETTE[index % LEVEL_PALETTE.length];
}

function renderFilter() {
  renderLevelFilter(levelFilter, {
    levels: state.project?.levels || [],
    active: state.levelFilter,
    colorFor: levelColor,
    onChange: setLevelFilter,
  });
}

function setLevelFilter(level) {
  state.levelFilter = level;
  if (viewer) viewer.setLevelFilter(level);
  renderFilter();
  issueForm.suggestLevel(level);
}

function renderProjects() {
  renderProjectList(projectList, { projects: state.projects, currentId: state.projectId, onOpen: openProject });
}

function renderUserOptions() {
  while (userSelect.options.length > 1) userSelect.remove(1);
  for (const user of USERS) {
    const label = `${user.name} (${user.client || t('role.staff')})`;
    userSelect.append(el('option', { value: user.token, text: label }));
  }
  userSelect.value = state.token;
}

function renderLanguageSwitch() {
  for (const button of languageButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.language === language()));
  }
}

function selectUser(token) {
  if (usersController) usersController.abort();
  closeProject();
  state.token = token;
  state.projects = [];
  renderProjects();
  if (!token) {
    setProjectsStatus(() => el('p', { className: 'muted', text: t('projects.chooseUser') }));
    setStage(() => t('stage.chooseUser'));
    return;
  }
  setStage(() => t('stage.chooseProject'));
  loadProjects();
}

async function loadProjects() {
  if (usersController) usersController.abort();
  const controller = new AbortController();
  usersController = controller;
  setProjectsStatus(() => el('p', { className: 'visually-hidden', text: t('projects.loading') }));
  projectList.replaceChildren(...skeletonRows(3));
  try {
    const projects = await api.listProjects(controller.signal);
    if (controller.signal.aborted) return;
    state.projects = Array.isArray(projects) ? projects : [];
    setProjectsStatus(state.projects.length === 0
      ? () => el('p', { className: 'muted', text: t('projects.empty') })
      : null);
    renderProjects();
  } catch (error) {
    if (isAbort(error) || controller.signal.aborted) return;
    projectList.replaceChildren();
    setProjectsStatus(() => notice('error', describeError(error, 'projects.loadFailed'), loadProjects));
  }
}

function closeProject() {
  cancelCloud();
  if (projectController) projectController.abort();
  projectController = null;
  state.projectId = null;
  state.project = null;
  state.levelFilter = null;
  if (viewer) {
    viewer.clearPointCloud();
    viewer.clearSpaces();
  }
  handleSpaceSelected(null);
  cloudPanel.setMode('idle');
  cloudPanel.setAvailable(false);
  levelFilter.replaceChildren();
  show(projectCard.card, false);
  issueForm.close();
}

async function openProject(id) {
  closeProject();
  const controller = new AbortController();
  projectController = controller;
  state.projectId = id;
  renderProjects();
  setStage(() => t('stage.loadingProject'));
  try {
    const [project, spaces] = await Promise.all([
      api.getProject(id, controller.signal),
      api.getSpaces(id, controller.signal),
    ]);
    if (controller.signal.aborted) return;
    state.project = project;
    renderProjectCard(projectCard, project);
    renderFilter();
    issueForm.open(project.levels || []);
    if (viewer) {
      viewer.setSpaces(spaces, project.levels || []);
      setStage(spaces.length === 0 ? () => t('stage.noSpaces') : null);
      cloudPanel.setAvailable(true);
    }
  } catch (error) {
    if (isAbort(error) || controller.signal.aborted) return;
    setStage(() => notice('error', describeError(error, 'stage.openFailed'), () => openProject(id)));
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
  cloudPanel.setMode('loading');
  cloudPanel.setProgress(0, null);

  try {
    const cloud = await loadPointCloud({
      url: api.cloudUrl(projectId),
      token: state.token,
      maxPoints: MAX_POINTS,
      signal: controller.signal,
      onProgress: cloudPanel.setProgress,
    });
    if (controller !== cloudController || state.projectId !== projectId) return;
    cloudController = null;
    viewer.setPointCloud(cloud);
    cloudPanel.setMode('loaded', cloud);
  } catch (error) {
    if (controller !== cloudController) return;
    cloudController = null;
    cloudPanel.setMode(isAbort(error) ? 'cancelled' : 'error', error);
  }
}

function relabel() {
  translateStatic(document);
  renderLanguageSwitch();
  renderUserOptions();
  paintProjectsStatus();
  renderProjects();
  paintStage();
  if (state.project) {
    renderProjectCard(projectCard, state.project);
    renderFilter();
  }
  inspector.relabel();
  issueForm.relabel();
  cloudPanel.relabel();
  if (viewer) viewer.canvas.setAttribute('aria-label', t('stage.canvasLabel'));
}

function reportUnexpected() {
  $('cloud-status').replaceChildren(notice('error', t('error.unexpected'), () => window.location.reload()));
}

window.addEventListener('error', reportUnexpected);
window.addEventListener('unhandledrejection', reportUnexpected);

for (const button of languageButtons) {
  button.addEventListener('click', () => setLanguage(button.dataset.language));
}
onLanguageChange(relabel);
userSelect.addEventListener('change', () => selectUser(userSelect.value));

translateStatic(document);
renderLanguageSwitch();
renderUserOptions();
startViewer();
selectUser('');
