// Segal House Designer - Energy Modeling Edition
const MODULE_SIZE = 900;
const PIXEL_PER_MM = 0.1;
const GRID_PIXEL_SIZE = 45;  // Smaller visual cells
const CANVAS_COLS = 20;      // More columns
const CANVAS_ROWS = 15;      // More rows
const WALL_HEIGHT_M = 3.0;
const WINDOW_START_HEIGHT_M = 0.8;
const WINDOW_HEIGHT_M = 1.2;
const DOOR_HEIGHT_M = 2.1;
const MAX_OPENING_WIDTH = 0.85;

const CANVAS_WIDTH = CANVAS_COLS * GRID_PIXEL_SIZE;  // 900px
const CANVAS_HEIGHT = CANVAS_ROWS * GRID_PIXEL_SIZE; // 675px

// State
let currentMode = 'exterior';
let selectedPoint = null;
let walls = [];
let openings = [];
let gridPoints = [];
let showGrid = true;
let pendingOpening = null;
let canvasScale = 1.0;

// Fabric canvas
const fabricCanvas = new fabric.Canvas('gridCanvas', {
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: '#fafafa',
  selection: false,
  allowTouchScrolling: false,
  preserveObjectStacking: false
});

// Three.js
let scene, camera, renderer;
let walls3DGroup, openings3DGroup, gridPoints3DGroup, floorGroup, roofGroup;
let autoRotate = true;
let rotationAngle = 0;

console.log('🚀 Initializing Segal House Designer...');

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
  setTimeout(() => {
    initThree();
  }, 100);
  initGridPoints();
  drawGridLines();
  setupEventListeners();
  updateStats();
  setTimeout(renderThreeScene, 200);
  drawOpeningMarkers();
  loadDesignFromURL();
  console.log('✅ Initialization complete!');
}

initAll();

// ========== ZOOM FUNCTIONS (FIXED) ==========
function setZoom(scale) {
  canvasScale = Math.max(0.25, Math.min(2.0, scale));
  fabricCanvas.setZoom(canvasScale);
  fabricCanvas.setViewportTransform([canvasScale, 0, 0, canvasScale, 0, 0]);
  document.getElementById('zoomLevel').textContent = Math.round(canvasScale * 100) + '%';
  fabricCanvas.requestRenderAll();
}

function zoomIn() {
  setZoom(canvasScale * 1.25);
}

function zoomOut() {
  setZoom(canvasScale / 1.25);
}

function resetZoom() {
  setZoom(1.0);
}

// ========== THREE.JS ==========
function initThree() {
  const container = document.getElementById('three-canvas');
  if (!container) {
    console.error('❌ 3D container not found!');
    return;
  }
  
  const width = container.clientWidth || 400;
  const height = container.clientHeight || 300;
  
  try {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8e8e8);
    
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(15, 15, 15);
    camera.lookAt(0, 1.5, 0);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.setClearColor(0xe8e8e8);
    
    container.innerHTML = ''; // Clear any existing content
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
    
    console.log('✅ Three.js initialized');
  } catch (err) {
    console.error('❌ Three.js initialization failed:', err);
  }
}

function renderThreeScene() {
  if (!scene) {
    console.warn('⚠️ Scene not initialized yet');
    return;
  }
  
  while(walls3DGroup && walls3DGroup.children.length) walls3DGroup.remove(walls3DGroup.children[0]);
  while(openings3DGroup && openings3DGroup.children.length) openings3DGroup.remove(openings3DGroup.children[0]);
  while(gridPoints3DGroup && gridPoints3DGroup.children.length) gridPoints3DGroup.remove(gridPoints3DGroup.children[0]);
  while(floorGroup && floorGroup.children.length) floorGroup.remove(floorGroup.children[0]);
  while(roofGroup && roofGroup.children.length) roofGroup.remove(roofGroup.children[0]);
  
  const cx = (CANVAS_COLS * GRID_PIXEL_SIZE) / 2 / PIXEL_PER_MM / 1000;
  const cz = (CANVAS_ROWS * GRID_PIXEL_SIZE) / 2 / PIXEL_PER_MM / 1000;
  
  function gridToWorld(col, row) {
    return {
      x: col * MODULE_SIZE / 1000 - cx,
      z: (CANVAS_ROWS - row) * MODULE_SIZE / 1000 - cz
    };
  }
  
  // Grid points 3D
  const pointGeo = new THREE.SphereGeometry(0.08, 8, 8);
  const pointMat = new THREE.MeshBasicMaterial({ color: 0x28a745 });
  gridPoints.forEach(p => {
    const pos = gridToWorld(p.gridData.col, p.gridData.row);
    const mesh = new THREE.Mesh(pointGeo, pointMat.clone());
    mesh.position.set(pos.x, 0, pos.z);
    gridPoints3DGroup.add(mesh);
  });
  
  // Walls 3D
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
    
    // Openings 3D
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
  
  // FLOOR
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
  
  // ROOF
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
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// ========== FABRIC FUNCTIONS ==========
function initGridPoints() {
  // Clear existing points first
  gridPoints = [];
  
  for (let c = 0; c <= CANVAS_COLS; c++) {
    for (let r = 0; r <= CANVAS_ROWS; r++) {
      const point = new fabric.Circle({
        left: c * GRID_PIXEL_SIZE,
        top: r * GRID_PIXEL_SIZE,
        radius: 5,
        fill: '#28a745',
        stroke: '#1e7e34',
        strokeWidth: 1,
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false,
        hasControls: false,
        hasBorders: false,
        opacity: 1
      });
      point.gridData = { col: c, row: r };
      point.worldPos = { x: c * MODULE_SIZE, y: r * MODULE_SIZE };
      gridPoints.push(point);
      fabricCanvas.add(point);
    }
  }
  
  // Send grid points to back
  gridPoints.forEach(point => {
    fabricCanvas.sendToBack(point);
  });
  
  fabricCanvas.requestRenderAll();
  console.log(`✅ Created ${gridPoints.length} grid points`);
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
  
  fabricCanvas.requestRenderAll();
}

function getClosestGridPoint(x, y, tol = 20) {
  return gridPoints.find(p => Math.hypot(p.left - x, p.top - y) < tol);
}

function createWall(pointA, pointB) {
  if (pointA.gridData.col !== pointB.gridData.col && pointA.gridData.row !== pointB.gridData.row) {
    console.warn('⚠️ Diagonal walls not allowed. Creating axis-aligned wall instead.');
    const dx = Math.abs(pointB.gridData.col - pointA.gridData.col);
    const dy = Math.abs(pointB.gridData.row - pointA.gridData.row);
    
    if (dx >= dy) {
      pointB.gridData.row = pointA.gridData.row;
      pointB.worldPos.y = pointA.worldPos.y;
      pointB.left = pointB.gridData.col * GRID_PIXEL_SIZE;
      pointB.top = pointA.top;
    } else {
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
  setTimeout(renderThreeScene, 50);
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
  setTimeout(renderThreeScene, 50);
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
      setTimeout(renderThreeScene, 50);
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
  setTimeout(renderThreeScene, 50);
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
    setTimeout(() => {
      if (renderer) {
        const container = document.getElementById('three-canvas');
        if (container) {
          const w = container.clientWidth;
          const h = container.clientHeight;
          if (camera) camera.aspect = w / h;
          if (camera) camera.updateProjectionMatrix();
          if (renderer) renderer.setSize(w, h);
          if (scene) animate();
        }
      }
    }, 100);
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
      setTimeout(renderThreeScene, 50);
    }
  };
  
  document.getElementById('zoomIn').onclick = zoomIn;
  document.getElementById('zoomOut').onclick = zoomOut;
  document.getElementById('resetZoom').onclick = resetZoom;
  
  document.getElementById('exportDesign').onclick = () => exportAsJSON();
  
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
