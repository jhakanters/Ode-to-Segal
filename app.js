// Segal House Designer - Energy Modeling Edition
const MODULE_SIZE = 900;
const PIXEL_PER_MM = 0.1;
const GRID_PIXEL_SIZE = 90;
const CANVAS_COLS = 12;
const CANVAS_ROWS = 10;
const WALL_HEIGHT_M = 3.0;  // 3 meters
const WINDOW_START_HEIGHT_M = 0.8;
const WINDOW_HEIGHT_M = 1.2;
const DOOR_HEIGHT_M = 2.1;
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
let walls3DGroup, openings3DGroup, gridPoints3DGroup, floorGroup, roofGroup;
let autoRotate = true;
let rotationAngle = 0;

console.log('🚀 Initializing Segal House Designer (Energy Mode)...');

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
  camera.lookAt(0, 1.5, 0);
  
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
  floorGroup = new THREE.Group();
  roofGroup = new THREE.Group();
  
  scene.add(walls3DGroup);
  scene.add(openings3DGroup);
  scene.add(gridPoints3DGroup);
  scene.add(floorGroup);
  scene.add(roofGroup);
  
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
      camera.lookAt(0, 1.5, 0);
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
  while(floorGroup.children.length) floorGroup.remove(floorGroup.children[0]);
  while(roofGroup.children.length) roofGroup.remove(roofGroup.children[0]);
  
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
      color: wall.mode === 'exterior' ? 0x6d4aff : 0x4fc3f7,
      transparent: true,
      opacity: 0.85
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
      
      const openingHeight = opening.type === 'door' ? DOOR_HEIGHT_M : WINDOW_HEIGHT_M;
      const openingStart = opening.type === 'door' ? 0 : WINDOW_START_HEIGHT_M;
      
      let openingMat;
      if (opening.type === 'door') {
        openingMat = new THREE.MeshPhongMaterial({
          color: 0xff9800,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.6
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
        new THREE.BoxGeometry(opening.width, openingHeight, 0.16),
        openingMat
      );
      openingMesh.position.set(
        ox,
        openingStart + openingHeight / 2,
        oz
      );
      openingMesh.rotation.y = -angle;
      openings3DGroup.add(openingMesh);
    });
  });
  
  // FLOOR - Create from wall bounds
  if (walls.length > 0) {
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    walls.forEach(wall => {
      const start = gridToWorld(wall.pointA.col, wall.pointA.row);
      const end = gridToWorld(wall.pointB.col, wall.pointB.row);
      minX = Math.min(minX, start.x, end.x);
      maxX = Math.max(maxX, start.x, end.x);
      minZ = Math.min(minZ, start.z, end.z);
      maxZ = Math.max(maxZ, start.z, end.z);
    });
    
    const floorWidth = maxX - minX;
    const floorDepth = maxZ - minZ;
    
    if (floorWidth > 0 && floorDepth > 0) {
      const floorMat = new THREE.MeshPhongMaterial({ color: 0xd2b48c, transparent: true, opacity: 0.9 });
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorWidth + 1, floorDepth + 1), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
      floor.receiveShadow = true;
      floorGroup.add(floor);
    }
  }
  
  // ROOF - Same as floor but at ceiling height
  if (walls.length > 0) {
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    walls.forEach(wall => {
      const start = gridToWorld(wall.pointA.col, wall.pointA.row);
      const end = gridToWorld(wall.pointB.col, wall.pointB.row);
      minX = Math.min(minX, start.x, end.x);
      maxX = Math.max(maxX, start.x, end.x);
      minZ = Math.min(minZ, start.z, end.z);
      maxZ = Math.max(maxZ, start.z, end.z);
    });
    
    const roofWidth = maxX - minX;
    const roofDepth = maxZ - minZ;
    
    if (roofWidth > 0 && roofDepth > 0) {
      const roofMat = new THREE.MeshPhongMaterial({ color: 0x8b4513, transparent: true, opacity: 0.7 });
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(roofWidth + 1, roofDepth + 1), roofMat);
      roof.rotation.x = Math.PI / 2;
      roof.position.set((minX + maxX) / 2, WALL_HEIGHT_M, (minZ + maxZ) / 2);
      roofGroup.add(roof);
    }
  }
  
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  if (autoRotate) {
    rotationAngle += 0.005;
    camera.position.x = Math.sin(rotationAngle) * 15;
    camera.position.z = Math.cos(rotationAngle) * 15;
    camera.lookAt(0, 1.5, 0);
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
      point.worldPos = { x: c * MODULE_SIZE, y: r * MODULE_SIZE };
      gridPoints.push(point);
      fabricCanvas.add(point);
    }
  }
}

function drawGridLines() {
  const ctx = fabricCanvas.getContext();
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  
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
  
  ctx.font = 'bold 10px Arial';
  ctx.fillStyle = '#666';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  for (let c = 0; c <= CANVAS_COLS; c++) {
    const x = c * GRID_PIXEL_SIZE;
    ctx.fillText(`${c}`, x, 5);
  }
  
  for (let r = 0; r <= CANVAS_ROWS; r++) {
    const y = r * GRID_PIXEL_SIZE;
    ctx.fillText(`${r}`, 5, y);
  }
  
  ctx.font = 'bold 11px Arial';
  ctx.fillStyle = '#6d4aff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  walls.forEach((wall) => {
    const dx = Math.abs(wall.pointA.col - wall.pointB.col) * MODULE_SIZE;
    const dy = Math.abs(wall.pointA.row - wall.pointB.row) * MODULE_SIZE;
    const len = Math.hypot(dx, dy) / 1000;
    
    const midX = (wall.pointA.left + wall.pointB.left) / 2;
    const midY = (wall.pointA.top + wall.pointB.top) / 2;
    
    ctx.fillText(`${len.toFixed(1)}m`, midX, midY);
  });
}

function getClosestGridPoint(x, y, tol = 20) {
  return gridPoints.find(p => Math.hypot(p.left - x, p.top - y) < tol);
}

function createWall(pointA, pointB) {
  // ENFORCE AXIS-ALIGNED ONLY (horizontal or vertical)
  if (pointA.gridData.col !== pointB.gridData.col && pointA.gridData.row !== pointB.gridData.row) {
    console.warn('⚠️ Diagonal walls not allowed. Creating axis-aligned wall instead.');
    // Snap to nearest axis - prefer longer segment
    const dx = Math.abs(pointB.gridData.col - pointA.gridData.col);
    const dy = Math.abs(pointB.gridData.row - pointA.gridData.row);
    
    if (dx >= dy) {
      // Horizontal - snap y
      pointB.gridData.row = pointA.gridData.row;
      pointB.worldPos.y = pointA.worldPos.y;
      pointB.left = pointB.gridData.col * GRID_PIXEL_SIZE;
      pointB.top = pointA.top;
    } else {
      // Vertical - snap x
      pointB.gridData.col = pointA.gridData.col;
      pointB.worldPos.x = pointA.worldPos.x;
      pointB.left = pointA.left;
      pointB.top = pointB.gridData.row * GRID_PIXEL_SIZE;
    }
  }
  
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
      heatLoss += len * WALL_HEIGHT_M * wall.uValue * deltaT;
    } else {
      intLen += len;
    }
  });
  
  openings.forEach(opening => {
    const wall = walls[opening.wallIndex];
    if (wall?.mode === 'exterior') {
      const wallU = wall.uValue;
      const openingU = opening.type === 'door' ? 2.0 : 1.2;
      const openingArea = opening.width * (opening.type === 'door' ? DOOR_HEIGHT_M : WINDOW_HEIGHT_M);
      heatLoss -= opening.width * WALL_HEIGHT_M * wallU * deltaT;
      heatLoss += openingArea * openingU * deltaT;
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
    exterior: 'Select Exterior Wall → Click first point → Click second point (axis-aligned only)',
    interior: 'Select Interior Wall → Click first point → Click second point (axis-aligned only)',
    opening: 'Select Add Opening → Click ON a wall → Choose window (0.8-2.0m) or door (0-2.1m)',
    delete: 'Select Delete → Click on wall to remove'
  };
  document.getElementById('instructionsText').textContent = instr[currentMode];
}

// ========== LOAD/SAVE ==========
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

// ========== FINAL FIXED GBXML EXPORT ==========
function exportAsGbXML() {
  const TOTAL_Y = CANVAS_ROWS * MODULE_SIZE;
  
  // Calculate bounding box for floor area
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  walls.forEach(wall => {
    const x1 = wall.worldStart.x / 1000;
    const z1 = (TOTAL_Y - wall.worldStart.y) / 1000;
    const x2 = wall.worldEnd.x / 1000;
    const z2 = (TOTAL_Y - wall.worldEnd.y) / 1000;
    minX = Math.min(minX, x1, x2);
    maxX = Math.max(maxX, x1, x2);
    minZ = Math.min(minZ, z1, z2);
    maxZ = Math.max(maxZ, z1, z2);
  });
  
  const floorArea = (maxX - minX) * (maxZ - minZ) || 0;
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<gbXML xmlns="http://www.gbxml.org/schema/gbXML" 
       useSIUnitsForResults="true" temperatureUnit="Celsius" 
       lengthUnit="Meter" areaUnit="SquareMeters" volumeUnit="CubicMeter">
  
  <Name>Segal House</Name>
  <TemperatureUnit>Celsius</TemperatureUnit>
  <LengthUnit>Meter</LengthUnit>
  <AreaUnit>SquareMeters</AreaUnit>
  
  <Location>
    <Latitude>51.5074</Latitude>
    <Longitude>-0.1278</Longitude>
  </Location>
  
  <Materials>
    <Material id="mat_wall" materialType="Opaque">
      <Name>Concrete Block Wall</Name>
      <UValue>0.35</UValue>
      <Absorptance>0.8</Absorptance>
      <Emittance>0.9</Emittance>
    </Material>
    <Material id="mat_window" materialType="Glazing">
      <Name>Double Glazing</Name>
      <UValue>1.2</UValue>
      <SHGC>0.62</SHGC>
      <VisibleTransmittance>0.7</VisibleTransmittance>
    </Material>
    <Material id="mat_door" materialType="Opaque">
      <Name>Solid Door</Name>
      <UValue>2.0</UValue>
    </Material>
    <Material id="mat_floor" materialType="Opaque">
      <Name>Floor Slab</Name>
      <UValue>0.25</UValue>
    </Material>
    <Material id="mat_roof" materialType="Opaque">
      <Name>Roof Slab</Name>
      <UValue>0.35</UValue>
    </Material>
  </Materials>
  
  <ThermalZones>
    <ThermalZone id="zone_residential">
      <Name>Residential Zone</Name>
    </ThermalZone>
  </ThermalZones>
  
  <Spaces>
    <Space id="space_main">
      <Name>Main Space</Name>
      <ThermalZoneId>zone_residential</ThermalZoneId>
      <FloorArea>${floorArea.toFixed(2)}</FloorArea>
      <CeilingHeight>${WALL_HEIGHT_M}</CeilingHeight>
      <Volume>${(floorArea * WALL_HEIGHT_M).toFixed(2)}</Volume>
    </Space>
  </Spaces>
  
  <Surfaces>`;
  
  // Generate walls with CORRECT vertex ordering
  walls.forEach((wall, i) => {
    const start = wall.worldStart;
    const end = wall.worldEnd;
    
    const x1 = start.x / 1000;
    const y1 = (TOTAL_Y - start.y) / 1000;
    const x2 = end.x / 1000;
    const y2 = (TOTAL_Y - end.y) / 1000;
    
    const length = Math.hypot(x2 - x1, y2 - y1);
    const height = WALL_HEIGHT_M;
    
    // Azimuth from NORTH, clockwise
    let angle = Math.atan2(y2 - y1, x2 - x1);
    let azimuth = (90 - angle * 180 / Math.PI) % 360;
    if (azimuth < 0) azimuth += 360;
    
    const isExterior = wall.mode === 'exterior';
    const surfaceType = isExterior ? 'Wall' : 'InteriorWall';
    
    // Four vertices: BOTTOM-RIGHT, BOTTOM-LEFT, TOP-LEFT, TOP-RIGHT
    // Counter-clockwise when viewed from OUTSIDE (normal points INSIDE)
    // Start bottom-right, go counter-clockwise
    const p1 = { x: x1, y: y1, z: 0 };
    const p2 = { x: x2, y: y2, z: 0 };
    const p3 = { x: x2, y: y2, z: height };
    const p4 = { x: x1, y: y1, z: height };
    
    const adjSpace = isExterior ? 'outdoors' : 'space_main';
    const adjObjectType = isExterior ? 'Outdoors' : 'Ground';
    
    xml += `
    <Surface id="surf_wall_${i}" surfaceType="${surfaceType}" 
             adjacentSpaceId="${adjSpace}" adjacentSpaceId2="${adjSpace}"
             buildingSurfaceType="Vertical" aboveGrade="true">
      <Name>Wall_${i}_${wall.mode}</Name>
      <Area>${(length * height).toFixed(2)}</Area>
      <Azimuth>${azimuth.toFixed(0)}</Azimuth>
      <Tilt>90</Tilt>
      <Vertices>
        <Vertex><Coordinates x="${p1.x.toFixed(3)}" y="${p1.y.toFixed(3)}" z="${p1.z.toFixed(3)}"/></Vertex>
        <Vertex><Coordinates x="${p2.x.toFixed(3)}" y="${p2.y.toFixed(3)}" z="${p2.z.toFixed(3)}"/></Vertex>
        <Vertex><Coordinates x="${p3.x.toFixed(3)}" y="${p3.y.toFixed(3)}" z="${p3.z.toFixed(3)}"/></Vertex>
        <Vertex><Coordinates x="${p4.x.toFixed(3)}" y="${p4.y.toFixed(3)}" z="${p4.z.toFixed(3)}"/></Vertex>
      </Vertices>
      <ConstructionId>mat_wall</ConstructionId>
    </Surface>`;
  });
  
  // Floors
  if (maxX > minX && maxZ > minZ) {
    xml += `
    <Surface id="surf_floor" surfaceType="Slab" adjacentSpaceId="space_main" 
             buildingSurfaceType="Horizontal" aboveGrade="false">
      <Name>Floor</Name>
      <Area>${floorArea.toFixed(2)}</Area>
      <Azimuth>0</Azimuth>
      <Tilt>0</Tilt>
      <Vertices>
        <Vertex><Coordinates x="${minX.toFixed(3)}" y="${minZ.toFixed(3)}" z="0"/></Vertex>
        <Vertex><Coordinates x="${maxX.toFixed(3)}" y="${minZ.toFixed(3)}" z="0"/></Vertex>
        <Vertex><Coordinates x="${maxX.toFixed(3)}" y="${maxZ.toFixed(3)}" z="0"/></Vertex>
        <Vertex><Coordinates x="${minX.toFixed(3)}" y="${maxZ.toFixed(3)}" z="0"/></Vertex>
      </Vertices>
      <ConstructionId>mat_floor</ConstructionId>
    </Surface>`;
  }
  
  // Roofs
  if (maxX > minX && maxZ > minZ) {
    xml += `
    <Surface id="surf_roof" surfaceType="Roof" adjacentSpaceId="space_main"
             buildingSurfaceType="Horizontal" aboveGrade="true">
      <Name>Roof</Name>
      <Area>${floorArea.toFixed(2)}</Area>
      <Azimuth>0</Azimuth>
      <Tilt>0</Tilt>
      <Vertices>
        <Vertex><Coordinates x="${minX.toFixed(3)}" y="${minZ.toFixed(3)}" z="${WALL_HEIGHT_M.toFixed(1)}"/></Vertex>
        <Vertex><Coordinates x="${minX.toFixed(3)}" y="${maxZ.toFixed(3)}" z="${WALL_HEIGHT_M.toFixed(1)}"/></Vertex>
        <Vertex><Coordinates x="${maxX.toFixed(3)}" y="${maxZ.toFixed(3)}" z="${WALL_HEIGHT_M.toFixed(1)}"/></Vertex>
        <Vertex><Coordinates x="${maxX.toFixed(3)}" y="${minZ.toFixed(3)}" z="${WALL_HEIGHT_M.toFixed(1)}"/></Vertex>
      </Vertices>
      <ConstructionId>mat_roof</ConstructionId>
    </Surface>`;
  }
  
  xml += `
  </Surfaces>
  
  <SubSurfaces>`;  // Note: OpenStudio calls openings "SubSurfaces"
  
  // Openings - MUST be on the same plane as parent wall
  openings.forEach((opening, i) => {
    const wallIdx = opening.wallIndex;
    const wall = walls[wallIdx];
    if (!wall) return;
    
    const start = wall.worldStart;
    const end = wall.worldEnd;
    
    const x1 = start.x / 1000;
    const y1 = (TOTAL_Y - start.y) / 1000;
    const x2 = end.x / 1000;
    const y2 = (TOTAL_Y - end.y) / 1000;
    
    const ratio = Math.max(0.15, Math.min(0.85, opening.position));
    const pw = x1 + (x2 - x1) * ratio;  // Center point on wall
    const ph = y1 + (y2 - y1) * ratio;
    
    const width = opening.width;  // meters
    const height = opening.type === 'door' ? DOOR_HEIGHT_M : WINDOW_HEIGHT_M;
    const baseZ = opening.type === 'door' ? 0 : WINDOW_START_HEIGHT_M;
    
    const surfaceId = `surf_wall_${wallIdx}`;
    const type = opening.type === 'window' ? 'Window' : 'Door';
    const materialId = opening.type === 'window' ? 'mat_window' : 'mat_door';
    
    // SubSurface vertices MUST lie ON the wall plane
    // 4 corners of the opening, all at same distance from wall origin
    const hw = width / 2;  // Half-width
    
    xml += `
    <SubSurface id="sub_${type}_${i}" subSurfaceType="${type}" parentSurfaceId="${surfaceId}">
      <Name>${type}_${i}</Name>
      <Area>${(width * height).toFixed(2)}</Area>
      <Width>${width.toFixed(2)}</Width>
      <Height>${height.toFixed(2)}</Height>
      <FrameAndDivider>
        <FrameType>Unknown</FrameType>
        <FrameDepth unit="Meters">0.1</FrameDepth>
        <DividerDepth unit="Meters">0.1</DividerDepth>
      </FrameAndDivider>
      <GlassLayers>${opening.type === 'window' ? 'Double' : 'Single'}</GlassLayers>
      <UValue>${opening.type === 'window' ? 1.2 : 2.0}</UValue>
      ${opening.type === 'window' ? `<SHGC>0.62</SHGC><VisibleTransmittance>0.7</VisibleTransmittance>` : ''}
      <ConstructionId>${materialId}</ConstructionId>
      <Vertices>
        <Vertex><Coordinates x="${(pw - hw).toFixed(3)}" y="${ph.toFixed(3)}" z="${baseZ.toFixed(2)}"/></Vertex>
        <Vertex><Coordinates x="${(pw + hw).toFixed(3)}" y="${ph.toFixed(3)}" z="${baseZ.toFixed(2)}"/></Vertex>
        <Vertex><Coordinates x="${(pw + hw).toFixed(3)}" y="${ph.toFixed(3)}" z="${(baseZ + height).toFixed(2)}"/></Vertex>
        <Vertex><Coordinates x="${(pw - hw).toFixed(3)}" y="${ph.toFixed(3)}" z="${(baseZ + height).toFixed(2)}"/></Vertex>
      </Vertices>
    </SubSurface>`;
  });
  
  xml += `
  </SubSurfaces>
  
</gbXML>`;
  
  const blob = new Blob([xml], { type: 'text/xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `segal-openstudio-${Date.now().toString().slice(-6)}.xml`;
  a.click();
  
  console.log('✅ Fixed OpenStudio gbXML exported!');
}

function generateWallsXml(TOTAL_Y) {
  let xml = '';
  const spaceRef = 'space_interior';
  
  walls.forEach((wall, i) => {
    const start = wall.worldStart;
    const end = wall.worldEnd;
    
    // Convert mm to meters and flip Y axis for standard coordinates
    const x1 = start.x / 1000;
    const y1 = (TOTAL_Y - start.y) / 1000;
    const x2 = end.x / 1000;
    const y2 = (TOTAL_Y - end.y) / 1000;
    
    const length = Math.hypot(x2 - x1, y2 - y1);
    const thickness = 0.15;
    const height = WALL_HEIGHT_M; // 3.0m
    
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    const centerZ = height / 2;
    
    // Calculate wall angle (azimuth from north, clockwise)
    let angle = Math.atan2(y2 - y1, x2 - x1);
    let azimuth = (90 - angle * 180 / Math.PI) % 360;
    if (azimuth < 0) azimuth += 360;
    
    // Determine surface type
    const isExterior = wall.mode === 'exterior';
    const surfaceType = isExterior ? 'Wall' : 'InterzonalWall';
    const adjSpace = isExterior ? 'outdoors' : spaceRef;
    const adjObjectType = isExterior ? 'Outdoors' : 'Ground';
    
    // Material assignment
    const materialId = isExterior ? 'wall_concrete' : 'wall_concrete';
    
    // Calculate vertex order for proper normal direction (clockwise when viewed from outside)
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    
    // Build four vertices of the wall (bottom-left, bottom-right, top-right, top-left)
    // Normal should point INWARD to the space (gbXML convention)
    const p1x = x1, p1y = y1, p1z = 0;           // Bottom start
    const p2x = x2, p2y = y2, p2z = 0;          // Bottom end
    const p3x = x2, p3y = y2, p3z = height;     // Top end
    const p4x = x1, p4y = y1, p4z = height;     // Top start
    
    xml += `
    <Surface id="surface_${i}" surfaceType="${surfaceType}" 
             adjacentSpaceId="${adjSpace}" adjacentSpaceId2="${adjSpace}"
             builtInDaylightSensor="false" constructionId="${materialId}">
      <Name>${wall.mode === 'exterior' ? 'Exterior' : 'Interior'} Wall ${i}</Name>
      <Area unit="SquareMeters">${(length * height).toFixed(2)}</Area>
      <Azimuth>${azimuth.toFixed(0)}</Azimuth>
      <Tilt>90</Tilt>
      <CADObjectID>Wall_${i}</CADObjectID>
      <Vertices>
        <Vertex>
          <Coordinates x="${p1x.toFixed(3)}" y="${p1y.toFixed(3)}" z="${p1z.toFixed(3)}"/>
        </Vertex>
        <Vertex>
          <Coordinates x="${p2x.toFixed(3)}" y="${p2y.toFixed(3)}" z="${p2z.toFixed(3)}"/>
        </Vertex>
        <Vertex>
          <Coordinates x="${p3x.toFixed(3)}" y="${p3y.toFixed(3)}" z="${p3z.toFixed(3)}"/>
        </Vertex>
        <Vertex>
          <Coordinates x="${p4x.toFixed(3)}" y="${p4y.toFixed(3)}" z="${p4z.toFixed(3)}"/>
        </Vertex>
      </Vertices>
    </Surface>`;
  });
  
  return xml;
}

function generateOpeningsXml() {
  let xml = '';
  
  openings.forEach((opening, i) => {
    const wallIdx = opening.wallIndex;
    const wall = walls[wallIdx];
    
    if (!wall) {
      console.warn(`Opening ${i} references non-existent wall ${wallIdx}`);
      return;
    }
    
    const start = wall.worldStart;
    const end = wall.worldEnd;
    const TOTAL_Y = CANVAS_ROWS * MODULE_SIZE;
    
    // Convert to meters
    const x1 = start.x / 1000;
    const y1 = (TOTAL_Y - start.y) / 1000;
    const x2 = end.x / 1000;
    const y2 = (TOTAL_Y - end.y) / 1000;
    
    // Position along wall
    const ratio = Math.max(0.15, Math.min(0.85, opening.position));
    const px = x1 + (x2 - x1) * ratio;
    const py = y1 + (y2 - y1) * ratio;
    
    const width = opening.width; // Already in meters (0.85)
    const openingHeight = opening.type === 'door' ? DOOR_HEIGHT_M : WINDOW_HEIGHT_M;
    const openingBase = opening.type === 'door' ? 0 : WINDOW_START_HEIGHT_M;
    const openingCenterZ = openingBase + openingHeight / 2;
    
    const surfaceId = `surface_${wallIdx}`;
    const openingType = opening.type === 'window' ? 'Window' : 'Door';
    const materialId = opening.type === 'window' ? 'glazing_double' : 'door_solid';
    
    xml += `
    <Opening id="opening_${i}" openingType="${openingType}" attachedSurfaceId="${surfaceId}">
      <Name>${openingType}_${i}</Name>
      <Area unit="SquareMeters">${(width * openingHeight).toFixed(2)}</Area>
      <Height>${openingHeight.toFixed(2)}</Height>
      <Width>${width.toFixed(2)}</Width>
      <DistanceFromFloor>${openingBase.toFixed(2)}</DistanceFromFloor>
      <DistanceFromEdge>${ratio.toFixed(2)}</DistanceFromEdge>
      <FractionOfAreaInSurface>${(width * openingHeight / (getWallLength(wall) * WALL_HEIGHT_M)).toFixed(3)}</FractionOfAreaInSurface>
      <FrameAndDivider>
        <FrameType>Unknown</FrameType>
      </FrameAndDivider>
      <GlassLayers>
        ${opening.type === 'window' ? '<GlassLayer>Double</GlassLayer>' : ''}
      </GlassLayers>
      <UValue>${opening.type === 'window' ? 1.2 : 2.0}</UValue>
      <SHGC>${opening.type === 'window' ? 0.62 : 0}</SHGC>
      <VisibleTransmittance>${opening.type === 'window' ? 0.7 : 0}</VisibleTransmittance>
      <CADMaterialId>${materialId}</CADMaterialId>
      <Vertices>
        <Vertex>
          <Coordinates x="${px.toFixed(3)}" y="${py.toFixed(3)}" z="${openingBase.toFixed(2)}"/>
        </Vertex>
        <Vertex>
          <Coordinates x="${px.toFixed(3)}" y="${py.toFixed(3)}" z="${(openingBase + openingHeight).toFixed(2)}"/>
        </Vertex>
        <Vertex>
          <Coordinates x="${px.toFixed(3)}" y="${py.toFixed(3)}" z="${(openingBase + openingHeight).toFixed(2)}"/>
        </Vertex>
        <Vertex>
          <Coordinates x="${px.toFixed(3)}" y="${py.toFixed(3)}" z="${openingBase.toFixed(2)}"/>
        </Vertex>
      </Vertices>
    </Opening>`;
  });
  
  return xml;
}

function getWallLength(wall) {
  const dx = Math.abs(wall.pointA.col - wall.pointB.col) * MODULE_SIZE;
  const dy = Math.abs(wall.pointA.row - wall.pointB.row) * MODULE_SIZE;
  return Math.hypot(dx, dy) / 1000;
}

function exportAsJSON() {
  const TOTAL_Y = CANVAS_ROWS * MODULE_SIZE;
  
  const data = {
    version: '2.0',
    unit: 'mm',
    walls: walls.map(w => ({
      mode: w.mode,
      uValue: w.uValue,
      start: { x: w.worldStart.x, y: TOTAL_Y - w.worldStart.y },
      end: { x: w.worldEnd.x, y: TOTAL_Y - w.worldEnd.y }
    })),
    openings: openings.map(o => {
      const wall = walls[o.wallIndex];
      return {
        type: o.type,
        width: o.width * 1000,
        positionRatio: o.position,
        wallStart: { x: wall.worldStart.x, y: TOTAL_Y - wall.worldStart.y },
        wallEnd: { x: wall.worldEnd.x, y: TOTAL_Y - wall.worldEnd.y }
      };
    }),
    timestamp: Date.now()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `segal-${Date.now()}.json`;
  a.click();
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
    document.getElementById('three-sidebar').classList.toggle('hidden');
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
  
  document.getElementById('exportDesign').onclick = () => exportAsJSON();
  document.getElementById('exportGbxML').onclick = () => exportAsGbXML();
  
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

function getWallLength(wall) {
  const dx = Math.abs(wall.pointA.col - wall.pointB.col) * MODULE_SIZE;
  const dy = Math.abs(wall.pointA.row - wall.pointB.row) * MODULE_SIZE;
  return Math.hypot(dx, dy) / 1000;
}
