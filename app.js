// Segal House Designer - Final Version with XYZ Coords & Scale
const MODULE_SIZE = 900;
const PIXEL_PER_MM = 0.1;
const GRID_PIXEL_SIZE = 90;
const CANVAS_COLS = 12;
const CANVAS_ROWS = 10;
const WALL_HEIGHT_M = 2.4;
const MAX_OPENING_WIDTH = 0.85;

const CANVAS_WIDTH = CANVAS_COLS * GRID_PIXEL_SIZE;
const CANVAS_HEIGHT = CANVAS_ROWS * GRID_PIXEL_SIZE;

// State
let currentMode = 'exterior';
let selectedPoint = null;
let walls = [];
let openings = [];
let gridPoints = [];
let showGrid = true;
let pendingOpening = null;

// Fabric canvas
const fabricCanvas = new fabric.Canvas('gridCanvas', {
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: '#fafafa',
  selection: false,
  allowTouchScrolling: false
});

// Three.js
let scene, camera, renderer;
let walls3DGroup, openings3DGroup, gridPoints3DGroup;
let autoRotate = true;
let rotationAngle = 0;

console.log('🚀 Initializing Segal House Designer...');

// ========== SAFE LINE COORDINATE ACCESS ==========
function getLinePoints(wall) {
  if (!wall || !wall.fabricObj) return null;
  const line = wall.fabricObj;
  
  if (line.x1 !== undefined && line.y1 !== undefined && 
      line.x2 !== undefined && line.y2 !== undefined) {
    return { x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 };
  }
  
  if (Array.isArray(line.points) && line.points.length >= 4) {
    return { x1: line.points[0], y1: line.points[1], x2: line.points[2], y2: line.points[3] };
  }
  
  return null;
}

// ========== INIT ==========
function initAll() {
  initThree();
  initGridPoints();
  drawGridLines();
  setupEventListeners();
  updateStats();
  renderThreeScene();
  drawOpeningMarkers();
  loadDesignFromURL();
  console.log('✅ Initialization complete!');
}

initAll();

// ========== THREE.JS ==========
function initThree() {
  const container = document.getElementById('three-canvas');
  if (!container) {
    console.error('❌ 3D container not found!');
    return;
  }
  
  const width = container.clientWidth || 400;
  const height = container.clientHeight || 300;
  
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8e8e8);
  
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(15, 15, 15);
  camera.lookAt(0, 1, 0);
  
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);
  
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(10, 20, 10);
  dirLight.castShadow = true;
  scene.add(dirLight);
  
  walls3DGroup = new THREE.Group();
  openings3DGroup = new THREE.Group();
  gridPoints3DGroup = new THREE.Group();
  
  scene.add(walls3DGroup);
  scene.add(openings3DGroup);
  scene.add(gridPoints3DGroup);
  
  // Ground plane
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshPhongMaterial({ color: 0xf0f0f0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  scene.add(ground);
  
  // Mouse controls
  let isDragging = false, prevMouse = { x: 0, y: 0 };
  const canvas3D = renderer.domElement;
  
  canvas3D.addEventListener('mousedown', () => isDragging = true);
  canvas3D.addEventListener('mouseup', () => isDragging = false);
  canvas3D.addEventListener('mouseleave', () => isDragging = false);
  canvas3D.addEventListener('mousemove', (e) => {
    if (isDragging) {
      rotationAngle += (e.offsetX - prevMouse.x) * 0.01;
      camera.position.x = Math.sin(rotationAngle) * 15;
      camera.position.z = Math.cos(rotationAngle) * 15;
      camera.lookAt(0, 1, 0);
    }
    prevMouse = { x: e.offsetX, y: e.offsetY };
  });
  
  canvas3D.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.position.multiplyScalar(1 + e.deltaY * 0.01);
  });
  
  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderThreeScene();
  });
}

function renderThreeScene() {
  while(walls3DGroup.children.length) walls3DGroup.remove(walls3DGroup.children[0]);
  while(openings3DGroup.children.length) openings3DGroup.remove(openings3DGroup.children[0]);
  while(gridPoints3DGroup.children.length) gridPoints3DGroup.remove(gridPoints3DGroup.children[0]);
  
  // Center origin
  const cx = (CANVAS_COLS * GRID_PIXEL_SIZE) / 2 / PIXEL_PER_MM / 1000;
  const cz = (CANVAS_ROWS * GRID_PIXEL_SIZE) / 2 / PIXEL_PER_MM / 1000;
  
  function gridToWorld(col, row) {
    return {
      x: col * MODULE_SIZE / 1000 - cx,
      z: (CANVAS_ROWS - row) * MODULE_SIZE / 1000 - cz
    };
  }
  
  // Grid points
  const pointGeo = new THREE.SphereGeometry(0.08, 8, 8);
  const pointMat = new THREE.MeshBasicMaterial({ color: 0x28a745 });
  gridPoints.forEach(p => {
    const pos = gridToWorld(p.gridData.col, p.gridData.row);
    const mesh = new THREE.Mesh(pointGeo, pointMat.clone());
    mesh.position.set(pos.x, 0, pos.z);
    gridPoints3DGroup.add(mesh);
  });
  
  // Walls
  walls.forEach((wall, wallIdx) => {
    const start = gridToWorld(wall.pointA.col, wall.pointA.row);
    const end = gridToWorld(wall.pointB.col, wall.pointB.row);
    
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    const angle = Math.atan2(end.z - start.z, end.x - start.x);
    
    const wallMat = new THREE.MeshPhongMaterial({
      color: wall.mode === 'exterior' ? 0x6d4aff : 0x4fc3f7
    });
    const wallMesh = new THREE.Mesh(
      new THREE.BoxGeometry(length, WALL_HEIGHT_M, 0.15),
      wallMat
    );
    wallMesh.position.set(
      (start.x + end.x) / 2,
      WALL_HEIGHT_M / 2,
      (start.z + end.z) / 2
    );
    wallMesh.rotation.y = -angle;
    wallMesh.castShadow = true;
    walls3DGroup.add(wallMesh);
    
    // Openings
    openings.filter(o => o.wallIndex === wallIdx).forEach(opening => {
      const ratio = opening.position;
      const ox = start.x + (end.x - start.x) * ratio;
      const oz = start.z + (end.z - start.z) * ratio;
      
      const openingHeight = opening.type === 'door' ? 2.1 : 1.4;
      const openingDepth = 0.16;
      
      let openingMat;
      
      if (opening.type === 'door') {
        openingMat = new THREE.MeshPhongMaterial({
          color: 0xff9800,
          side: THREE.DoubleSide
        });
      } else {
        openingMat = new THREE.MeshPhongMaterial({
          color: 0x88ccff,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
          shininess: 80,
          specular: 0x444444
        });
      }
      
      const openingMesh = new THREE.Mesh(
        new THREE.BoxGeometry(opening.width, openingHeight, openingDepth),
        openingMat
      );
      openingMesh.position.set(
        ox,
        opening.type === 'door' ? openingHeight / 2 : WALL_HEIGHT_M / 2,
        oz
      );
      openingMesh.rotation.y = -angle;
      openings3DGroup.add(openingMesh);
    });
  });
  
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  if (autoRotate) {
    rotationAngle += 0.005;
    camera.position.x = Math.sin(rotationAngle) * 15;
    camera.position.z = Math.cos(rotationAngle) * 15;
    camera.lookAt(0, 1, 0);
  }
  renderer.render(scene, camera);
}

// ========== FABRIC FUNCTIONS ==========
function initGridPoints() {
  for (let c = 0; c <= CANVAS_COLS; c++) {
    for (let r = 0; r <= CANVAS_ROWS; r++) {
      const point = new fabric.Circle({
        left: c * GRID_PIXEL_SIZE,
        top: r * GRID_PIXEL_SIZE,
        radius: 5,
        fill: '#28a745',
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false,
        hasControls: false,
        hasBorders: false
      });
      point.gridData = { col: c, row: r };
      // Store world coordinates (mm from corner)
      point.worldPos = { x: c * MODULE_SIZE, y: r * MODULE_SIZE };
      gridPoints.push(point);
      fabricCanvas.add(point);
    }
  }
}

function drawGridLines() {
  const ctx = fabricCanvas.getContext();
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  
  // Light gray grid lines
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  
  for (let c = 0; c <= CANVAS_COLS; c++) {
    const x = c * GRID_PIXEL_SIZE;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke();
  }
  for (let r = 0; r <= CANVAS_ROWS; r++) {
    const y = r * GRID_PIXEL_SIZE;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke();
  }
  
  // COLUMN NUMBERS (top)
  ctx.font = 'bold 10px Arial';
  ctx.fillStyle = '#666';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  for (let c = 0; c <= CANVAS_COLS; c++) {
    const x = c * GRID_PIXEL_SIZE;
    ctx.fillText(`${c}`, x, 5);
  }
  
  // ROW NUMBERS (left)
  for (let r = 0; r <= CANVAS_ROWS; r++) {
    const y = r * GRID_PIXEL_SIZE;
    ctx.fillText(`${r}`, 5, y);
  }
  
  // DIMENSION LINES (below grid)
  ctx.font = '11px Arial';
  ctx.fillStyle = '#6d4aff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  // Draw dimension labels at 900mm intervals
  for (let c = 0; c <= CANVAS_COLS; c++) {
    const x = c * GRID_PIXEL_SIZE;
    const label = `${c * 0.9}m`;
    ctx.fillText(label, x, CANVAS_HEIGHT + 12);
  }
  
  // Draw dimension lines at bottom
  ctx.strokeStyle = '#6d4aff';
  ctx.lineWidth = 1;
  const dimY = CANVAS_HEIGHT + 18;
  ctx.beginPath();
  ctx.moveTo(0, dimY);
  ctx.lineTo(CANVAS_WIDTH, dimY);
  ctx.stroke();
  
  // Tick marks at each grid line
  for (let c = 0; c <= CANVAS_COLS; c++) {
    const x = c * GRID_PIXEL_SIZE;
    ctx.beginPath();
    ctx.moveTo(x, dimY - 5);
    ctx.lineTo(x, dimY + 5);
    ctx.stroke();
  }
  
  // WALL LENGTH LABELS (on walls)
  walls.forEach((wall) => {
    const dx = Math.abs(wall.pointA.col - wall.pointB.col) * MODULE_SIZE;
    const dy = Math.abs(wall.pointA.row - wall.pointB.row) * MODULE_SIZE;
    const len = Math.hypot(dx, dy) / 1000;
    
    const midX = (wall.pointA.left + wall.pointB.left) / 2;
    const midY = (wall.pointA.top + wall.pointB.top) / 2;
    
    ctx.font = 'bold 11px Arial';
    ctx.fillStyle = '#6d4aff';
    ctx.fillText(`${len.toFixed(1)}m`, midX, midY);
  });
}

function getClosestGridPoint(x, y, tol = 20) {
  return gridPoints.find(p => Math.hypot(p.left - x, p.top - y) < tol);
}

function createWall(pointA, pointB) {
  const line = new fabric.Line([
    pointA.left, pointA.top,
    pointB.left, pointB.top
  ], {
    stroke: currentMode === 'exterior' ? '#6d4aff' : '#4fc3f7',
    strokeWidth: 8,
    selectable: false,
    evented: false,
    hasControls: false,
    hasBorders: false,
    lockMovementX: true,
    lockMovementY: true,
    lockRotation: true,
    lockScalingX: true,
    lockScalingY: true,
    hoverCursor: 'default'
  });
  
  const wallData = {
    fabricObj: line,
    index: walls.length,
    mode: currentMode,
    pointA: pointA.gridData,
    pointB: pointB.gridData,
    worldStart: pointA.worldPos,
    worldEnd: pointB.worldPos,
    uValue: parseFloat(document.getElementById('insulationLevel')?.value || 0.35)
  };
  
  walls.push(wallData);
  fabricCanvas.add(line);
  fabricCanvas.sendToBack(line);
  
  selectedPoint = null;
  highlightSelected(null);
  drawOpeningMarkers();
  drawGridLines();
  
  updateStats();
  renderThreeScene();
}

function getPointOnLine(px, py, x1, y1, x2, y2) {
  const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  const param = lenSq !== 0 ? dot / lenSq : 0;
  
  let xx, yy;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  
  return { x: xx, y: yy, param };
}

function findWallUnderMouse(mx, my, tol = 15) {
  if (walls.length === 0) return null;
  
  for (let i = 0; i < walls.length; i++) {
    const wall = walls[i];
    const coords = getLinePoints(wall);
    if (!coords) continue;
    
    const closest = getPointOnLine(mx, my, coords.x1, coords.y1, coords.x2, coords.y2);
    const dist = Math.hypot(mx - closest.x, my - closest.y);
    
    if (dist < tol) {
      return { wallIndex: i, ratio: closest.param };
    }
  }
  
  return null;
}

function drawOpeningMarkers() {
  fabricCanvas.getObjects()
    .filter(o => o.isOpeningMarker)
    .forEach(o => fabricCanvas.remove(o));
  
  openings.forEach((opening) => {
    const wall = walls[opening.wallIndex];
    const coords = getLinePoints(wall);
    if (!coords) return;
    
    const px = coords.x1 + (coords.x2 - coords.x1) * opening.position;
    const py = coords.y1 + (coords.y2 - coords.y1) * opening.position;
    
    const marker = new fabric.Circle({
      left: px,
      top: py,
      radius: opening.type === 'door' ? 8 : 6,
      fill: opening.type === 'door' ? '#ff9800' : '#4fc3f7',
      stroke: '#fff',
      strokeWidth: 2,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
      isOpeningMarker: true
    });
    
    fabricCanvas.add(marker);
  });
  
  fabricCanvas.requestRenderAll();
}

// ========== MODAL FUNCTIONS ==========
function openOpeningDialog(wallResult) {
  pendingOpening = wallResult;
  document.getElementById('openingDialog').classList.remove('hidden');
  document.getElementById('openingDialog').classList.add('show');
}

function closeOpeningDialog() {
  pendingOpening = null;
  document.getElementById('openingDialog').classList.remove('show');
  document.getElementById('openingDialog').classList.add('hidden');
}

function createOpening(type) {
  if (!pendingOpening) return;
  
  const wall = walls[pendingOpening.wallIndex];
  if (!wall || wall.mode !== 'exterior') {
    alert('Openings only on exterior walls!');
    closeOpeningDialog();
    return;
  }
  
  const opening = {
    wallIndex: pendingOpening.wallIndex,
    position: Math.max(0.15, Math.min(0.85, pendingOpening.ratio)),
    type: type,
    width: MAX_OPENING_WIDTH
  };
  
  openings.push(opening);
  
  closeOpeningDialog();
  drawOpeningMarkers();
  updateStats();
  renderThreeScene();
}

// ========== MOUSE EVENTS ==========
fabricCanvas.on('mouse:down', (opt) => {
  const pointer = fabricCanvas.getPointer(opt.e);
  const mx = pointer.x, my = pointer.y;
  
  if (currentMode === 'delete') {
    const result = findWallUnderMouse(mx, my, 15);
    if (result) {
      const wallIdx = result.wallIndex;
      const wall = walls[wallIdx];
      fabricCanvas.remove(wall.fabricObj);
      
      openings = openings.filter(o => o.wallIndex !== wallIdx);
      openings = openings.map(o => ({
        ...o,
        wallIndex: o.wallIndex > wallIdx ? o.wallIndex - 1 : o.wallIndex
      }));
      
      walls.splice(wallIdx, 1);
      
      drawOpeningMarkers();
      drawGridLines();
      updateStats();
      renderThreeScene();
    }
    return;
  }
  
  if (currentMode === 'opening') {
    const result = findWallUnderMouse(mx, my, 15);
    if (result) {
      openOpeningDialog(result);
    }
    return;
  }
  
  const clickedPoint = getClosestGridPoint(mx, my);
  
  if (!clickedPoint) return;
  
  if (!selectedPoint) {
    selectedPoint = clickedPoint;
    highlightSelected(clickedPoint);
  } else if (selectedPoint === clickedPoint) {
    selectedPoint = null;
    highlightSelected(null);
  } else {
    createWall(selectedPoint, clickedPoint);
  }
});

fabricCanvas.on('mouse:move', (opt) => {
  if (currentMode === 'opening') {
    const pointer = fabricCanvas.getPointer(opt.e);
    const result = findWallUnderMouse(pointer.x, pointer.y, 15);
    fabricCanvas.defaultCursor = result ? 'pointer' : 'crosshair';
  }
});

function highlightSelected(point) {
  gridPoints.forEach(p => {
    p.fill = (p === selectedPoint) ? '#ff6b6b' : '#28a745';
  });
  fabricCanvas.requestRenderAll();
}

function updateStats() {
  let extLen = 0, intLen = 0, totalLen = 0, heatLoss = 0;
  const deltaT = 15;
  
  walls.forEach(wall => {
    const dx = Math.abs(wall.pointA.col - wall.pointB.col) * MODULE_SIZE;
    const dy = Math.abs(wall.pointA.row - wall.pointB.row) * MODULE_SIZE;
    const len = Math.hypot(dx, dy) / 1000;
    totalLen += len;
    
    if (wall.mode === 'exterior') {
      extLen += len;
      heatLoss += len * wall.uValue * deltaT;
    } else {
      intLen += len;
    }
  });
  
  openings.forEach(opening => {
    const wall = walls[opening.wallIndex];
    if (wall?.mode === 'exterior') {
      const wallU = wall.uValue;
      const openingU = opening.type === 'door' ? 2.0 : 1.2;
      heatLoss -= opening.width * wallU * deltaT;
      heatLoss += opening.width * openingU * deltaT;
    }
  });
  
  const score = Math.max(0, 100 - heatLoss * 0.5);
  
  document.getElementById('totalLength').textContent = `${totalLen.toFixed(1)} m`;
  document.getElementById('exteriorLength').textContent = `${extLen.toFixed(1)} m`;
  document.getElementById('interiorLength').textContent = `${intLen.toFixed(1)} m`;
  document.getElementById('openingCount').textContent = openings.length;
  document.getElementById('energyScore').textContent = Math.round(score);
  document.getElementById('heatLoss').textContent = `${heatLoss.toFixed(1)} W/K`;
  
  const instr = {
    exterior: 'Select Exterior Wall → Click first point → Click second point',
    interior: 'Select Interior Wall → Click first point → Click second point',
    opening: 'Select Add Opening → Click ON a wall line → Choose window or door (max 850mm)',
    delete: 'Select Delete → Click on wall to remove'
  };
  document.getElementById('instructionsText').textContent = instr[currentMode];
}

// ========== LOAD/SAVE WITH X,Y COORDINATES ==========
function loadDesignFromURL() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('design');
  
  if (encoded) {
    try {
      const jsonStr = decodeURIComponent(atob(encoded));
      const data = JSON.parse(jsonStr);
      loadDesign(data);
      console.log('✅ Design loaded from URL');
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      console.error('Failed to load design from URL:', err);
    }
  }
}

function loadDesign(data) {
  walls.forEach(w => fabricCanvas.remove(w.fabricObj));
  walls = [];
  openings = [];
  
  data.walls.forEach((wallData) => {
    const pointA = gridPoints[wallData.pointA.row * (CANVAS_COLS + 1) + wallData.pointA.col];
    const pointB = gridPoints[wallData.pointB.row * (CANVAS_COLS + 1) + wallData.pointB.col];
    
    if (pointA && pointB) {
      const oldMode = currentMode;
      currentMode = wallData.mode;
      createWall(pointA, pointB);
      currentMode = oldMode;
      walls[walls.length - 1].uValue = wallData.uValue;
    }
  });
  
  data.openings.forEach(o => {
    openings.push({
      ...o,
      width: Math.min(o.width || 0.85, MAX_OPENING_WIDTH)
    });
  });
  
  drawOpeningMarkers();
  drawGridLines();
  updateStats();
  renderThreeScene();
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
  document.getElementById('modeExterior').onclick = () => setMode('exterior');
  document.getElementById('modeInterior').onclick = () => setMode('interior');
  document.getElementById('modeOpening').onclick = () => setMode('opening');
  document.getElementById('modeDelete').onclick = () => setMode('delete');
  
  document.getElementById('toggleGrid').onclick = () => {
    showGrid = !showGrid;
    fabricCanvas.backgroundColor = showGrid ? '#fafafa' : '#ffffff';
    gridPoints.forEach(p => p.visible = showGrid);
    fabricCanvas.requestRenderAll();
    drawGridLines();
  };
  
  document.getElementById('toggle3D').onclick = () => {
    const sidebar = document.getElementById('three-sidebar');
    const hideBtn = document.getElementById('hide3D');
    const showBtn = document.getElementById('show3D');
    
    sidebar.classList.toggle('hidden');
    
    if (sidebar.classList.contains('hidden')) {
      hideBtn.classList.add('hidden');
      showBtn.classList.remove('hidden');
    } else {
      hideBtn.classList.remove('hidden');
      showBtn.classList.add('hidden');
    }
  };
  
  document.getElementById('hide3D').onclick = () => {
    document.getElementById('toggle3D').click();
  };
  
  document.getElementById('show3D').onclick = () => {
    document.getElementById('toggle3D').click();
  };
  
  document.getElementById('autoRotate').onchange = (e) => autoRotate = e.target.checked;
  
  document.getElementById('clearAll').onclick = () => {
    if (confirm('Clear everything?')) {
      walls.forEach(w => fabricCanvas.remove(w.fabricObj));
      walls = [];
      openings = [];
      selectedPoint = null;
      highlightSelected(null);
      drawOpeningMarkers();
      drawGridLines();
      updateStats();
      renderThreeScene();
    }
  };
  
  document.getElementById('exportDesign').onclick = () => {
    // EXPORT WITH WORLD COORDINATES (mm)
    const data = {
      version: '1.0',
      unit: 'mm',
      moduleSize: MODULE_SIZE,
      walls: walls.map(w => ({
        mode: w.mode,
        uValue: w.uValue,
        start: { x: w.worldStart.x, y: w.worldStart.y },
        end: { x: w.worldEnd.x, y: w.worldEnd.y }
      })),
      openings: openings.map(o => {
        const wall = walls[o.wallIndex];
        const startX = wall.worldStart.x;
        const startY = wall.worldStart.y;
        const endX = wall.worldEnd.x;
        const endY = wall.worldEnd.y;
        return {
          type: o.type,
          width: o.width * 1000, // Convert m to mm
          positionRatio: o.position,
          start: { x: startX + (endX - startX) * o.position, y: startY + (endY - startY) * o.position },
          wallStart: { x: startX, y: startY },
          wallEnd: { x: endX, y: endY }
        };
      }),
      timestamp: Date.now()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `segal-${Date.now()}.json`;
    a.click();
    
    console.log('Exported with world coordinates (mm):', data);
  };
  
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      selectedPoint = null;
      highlightSelected(null);
      closeOpeningDialog();
    }
  });
  
  document.getElementById('windowBtn').onclick = () => createOpening('window');
  document.getElementById('doorBtn').onclick = () => createOpening('door');
  document.getElementById('closeDialog').onclick = closeOpeningDialog;
}

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`mode${mode.charAt(0).toUpperCase() + mode.slice(1)}`).classList.add('active');
  selectedPoint = null;
  highlightSelected(null);
  updateStats();
}
