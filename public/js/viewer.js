import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const LEVEL_COLORS = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1', '#edc948', '#76b7b2'];

const TAP_MAX_MOVE_PX = 8;
const TAP_MAX_MS = 600;
const LEVEL_MARGIN_M = 0.05;
const POINT_SIZE_M = 0.035;

const OPACITY = {
  idle: 0.28,
  selected: 0.6,
  idleWithCloud: 0.08,
  selectedWithCloud: 0.35,
};

export class SiteViewer {
  constructor(container, { onSelect, onContextChange }) {
    this.container = container;
    this.onSelect = onSelect;
    this.onContextChange = onContextChange;
    this.levelColors = new Map();
    this.meshes = [];
    this.points = null;
    this.selectedId = null;
    this.levelFilter = null;
    this.levelRanges = new Map();
    this.renderQueued = false;
    this.pointers = new Map();
    this.multiTouchGesture = false;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.localClippingEnabled = true;
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-label', '3D view of the project spaces');
    container.append(this.canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1d2129');
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x404858, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(30, 60, 20);
    this.scene.add(sun);

    this.world = new THREE.Group();
    this.world.rotation.x = -Math.PI / 2;
    this.scene.add(this.world);
    this.spaceGroup = new THREE.Group();
    this.world.add(this.spaceGroup);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
    this.camera.position.set(30, 25, 30);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => this.requestRender());

    this.raycaster = new THREE.Raycaster();
    this.clipBelow = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.clipAbove = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

    this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    this.canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0) this.multiTouchGesture = false;
    });
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.onContextChange(false);
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.onContextChange(true);
      this.requestRender();
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  requestRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  setSpaces(spaces, levels) {
    this.clearSpaces();
    this.levelColors = new Map(levels.map((level, i) => [level, LEVEL_COLORS[i % LEVEL_COLORS.length]]));
    this.levelRanges = new Map();

    for (const space of spaces) {
      const color = new THREE.Color(this.colorForLevel(space.level));
      const geometry = new THREE.BoxGeometry(space.w, space.d, space.h);
      const material = new THREE.MeshLambertMaterial({
        color,
        transparent: true,
        opacity: OPACITY.idle,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(space.x + space.w / 2, space.y + space.d / 2, space.z + space.h / 2);
      mesh.userData.space = space;

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: color.clone().lerp(new THREE.Color('#ffffff'), 0.35) }),
      );
      edges.raycast = () => {};
      mesh.add(edges);
      mesh.userData.edges = edges;

      this.spaceGroup.add(mesh);
      this.meshes.push(mesh);

      const range = this.levelRanges.get(space.level) || { min: Infinity, max: -Infinity };
      range.min = Math.min(range.min, space.z);
      range.max = Math.max(range.max, space.z + space.h);
      this.levelRanges.set(space.level, range);
    }

    this.selectedId = null;
    this.levelFilter = null;
    this.applyLevelFilter();
    this.frameAll();
  }

  colorForLevel(level) {
    return this.levelColors.get(level) || LEVEL_COLORS[LEVEL_COLORS.length - 1];
  }

  clearSpaces() {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.userData.edges.geometry.dispose();
      mesh.userData.edges.material.dispose();
      this.spaceGroup.remove(mesh);
    }
    this.meshes = [];
    this.selectedId = null;
    this.requestRender();
  }

  frameAll() {
    const box = new THREE.Box3().setFromObject(this.spaceGroup);
    if (box.isEmpty()) {
      this.requestRender();
      return;
    }
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = (radius / Math.sin(fov / 2)) * 1.1;
    const direction = new THREE.Vector3(1, 0.8, 1.3).normalize();
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.camera.near = Math.max(0.05, distance / 500);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.update();
    this.requestRender();
  }

  setLevelFilter(level) {
    this.levelFilter = level;
    if (level && this.selectedId) {
      const selected = this.meshes.find((m) => m.userData.space.id === this.selectedId);
      if (selected && selected.userData.space.level !== level) this.select(null);
    }
    this.applyLevelFilter();
  }

  applyLevelFilter() {
    for (const mesh of this.meshes) {
      mesh.visible = !this.levelFilter || mesh.userData.space.level === this.levelFilter;
    }
    if (this.points) {
      const range = this.levelFilter && this.levelRanges.get(this.levelFilter);
      if (range) {
        this.clipBelow.constant = -(range.min - LEVEL_MARGIN_M);
        this.clipAbove.constant = range.max + LEVEL_MARGIN_M;
        this.points.material.clippingPlanes = [this.clipBelow, this.clipAbove];
      } else {
        this.points.material.clippingPlanes = [];
      }
      this.points.material.needsUpdate = true;
    }
    this.refreshMaterials();
  }

  select(spaceId) {
    this.selectedId = spaceId;
    this.refreshMaterials();
    const mesh = this.meshes.find((m) => m.userData.space.id === spaceId);
    this.onSelect(mesh ? mesh.userData.space : null);
  }

  refreshMaterials() {
    const withCloud = Boolean(this.points && this.points.visible);
    for (const mesh of this.meshes) {
      const selected = mesh.userData.space.id === this.selectedId;
      if (withCloud) mesh.material.opacity = selected ? OPACITY.selectedWithCloud : OPACITY.idleWithCloud;
      else mesh.material.opacity = selected ? OPACITY.selected : OPACITY.idle;
      mesh.material.emissive.set(selected ? '#ffffff' : '#000000');
      mesh.material.emissiveIntensity = selected ? 0.25 : 0;
      mesh.userData.edges.material.color.set(
        selected ? '#ffffff' : new THREE.Color(this.colorForLevel(mesh.userData.space.level)).lerp(new THREE.Color('#ffffff'), 0.35),
      );
    }
    this.requestRender();
  }

  setPointCloud({ positions, colors }) {
    this.clearPointCloud();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
    geometry.computeBoundingSphere();
    const material = new THREE.PointsMaterial({ size: POINT_SIZE_M, sizeAttenuation: true, vertexColors: true });
    this.points = new THREE.Points(geometry, material);
    this.points.raycast = () => {};
    this.world.add(this.points);
    this.applyLevelFilter();
  }

  setPointCloudVisible(visible) {
    if (!this.points) return;
    this.points.visible = visible;
    this.refreshMaterials();
  }

  clearPointCloud() {
    if (!this.points) return;
    this.world.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.points = null;
    this.refreshMaterials();
  }

  handlePointerDown(event) {
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, time: performance.now() });
    if (this.pointers.size > 1) this.multiTouchGesture = true;
  }

  handlePointerUp(event) {
    const start = this.pointers.get(event.pointerId);
    const wasMultiTouch = this.multiTouchGesture;
    this.pointers.delete(event.pointerId);
    if (this.pointers.size === 0) this.multiTouchGesture = false;
    if (!start || wasMultiTouch || event.button > 0) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > TAP_MAX_MOVE_PX || performance.now() - start.time > TAP_MAX_MS) return;
    this.pick(event.clientX, event.clientY);
  }

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.meshes.filter((m) => m.visible), false)[0];
    this.select(hit ? hit.object.userData.space.id : null);
  }
}
