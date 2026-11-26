import { createApi, isAbort } from './api/client.js';
import { loadPointCloud } from './cloud/loader.js';
import { SiteViewer, LEVEL_COLORS } from './scene/viewer.js';
import { createCloudPanel } from './ui/cloud-panel.js';
import { el, notice, show } from './ui/dom.js';
import { createInspector } from './ui/inspector.js';
import { createIssueForm } from './ui/issue-form.js';
import { renderLevelFilter } from './ui/level-filter.js';
import { describeError } from './ui/messages.js';
import { renderProjectCard, renderProjectList } from './ui/projects.js';

const USERS = [
  { token: 'staff-token', label: 'Dana Ortiz · Staff' },
  { token: 'acme-token', label: 'Sam Lee · Acme Builders' },
  { token: 'brick-token', label: 'Rita Gomez · Brick & Co' },
];

const MAX_POINTS = 2000000;

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

const userSelect = $('user-select');
const projectsStatus = $('projects-status');
const projectList = $('project-list');
const levelFilter = $('level-filter');
const stage = $('stage');
const stageMessage = $('stage-message');

const projectCard = {
  card: $('project-card'),
  client: $('project-client'),
  name: $('project-name'),
  address: $('project-address'),
  status: $('project-status'),
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

function setStageMessage(content) {
  stageMessage.replaceChildren(...(content === null ? [] : [content]));
  show(stageMessage, content !== null);
}

function startViewer() {
  try {
    viewer = new SiteViewer(stage, {
      onSelect: handleSpaceSelected,
      onContextChange: (available) => setStageMessage(available ? null : notice(
        'error',
        'The browser reset the 3D view to free memory. It should come back on its own.',
        () => window.location.reload(),
      )),
    });
  } catch {
    viewer = null;
    setStageMessage(notice('error', 'This device could not start the 3D view (WebGL is not available). Project details and issue reports still work.'));
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
  return LEVEL_COLORS[index % LEVEL_COLORS.length];
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

function selectUser(token) {
  if (usersController) usersController.abort();
  closeProject();
  state.token = token;
  state.projects = [];
  renderProjects();
  if (!token) {
    projectsStatus.replaceChildren(el('p', { className: 'muted', text: 'Choose a user to see their projects.' }));
    setStageMessage('Choose a user, then a project, to see its spaces in 3D.');
    return;
  }
  setStageMessage('Choose a project to see its spaces in 3D.');
  loadProjects();
}

async function loadProjects() {
  if (usersController) usersController.abort();
  const controller = new AbortController();
  usersController = controller;
  projectsStatus.replaceChildren(el('p', { className: 'muted', text: 'Loading projects…' }));
  try {
    const projects = await api.listProjects(controller.signal);
    if (controller.signal.aborted) return;
    state.projects = Array.isArray(projects) ? projects : [];
    projectsStatus.replaceChildren();
    if (state.projects.length === 0) {
      projectsStatus.append(el('p', { className: 'muted', text: 'This user has no projects yet.' }));
    }
    renderProjects();
  } catch (error) {
    if (isAbort(error) || controller.signal.aborted) return;
    projectsStatus.replaceChildren(notice('error', describeError(error, 'Could not load the projects.'), loadProjects));
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
  setStageMessage('Loading project…');
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
      setStageMessage(spaces.length === 0 ? 'This project has no spaces recorded yet.' : null);
      cloudPanel.setAvailable(true);
    }
  } catch (error) {
    if (isAbort(error) || controller.signal.aborted) return;
    setStageMessage(notice('error', describeError(error, 'Could not open the project.'), () => openProject(id)));
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

function reportUnexpected() {
  $('cloud-status').replaceChildren(notice(
    'error',
    'Something unexpected happened. Reload the page if the view stops responding.',
    () => window.location.reload(),
  ));
}

window.addEventListener('error', reportUnexpected);
window.addEventListener('unhandledrejection', reportUnexpected);

for (const user of USERS) userSelect.append(el('option', { value: user.token, text: user.label }));
userSelect.addEventListener('change', () => selectUser(userSelect.value));
startViewer();
selectUser('');
