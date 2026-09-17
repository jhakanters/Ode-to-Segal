// Segal House Designer - Main Logic with 3D Preview
const MODULE_SIZE = 900; // 900mm real-world
const PIXEL_PER_MM = 0.1; // 1:10 scale
const GRID_PIXEL_SIZE = MODULE_SIZE * PIXEL_PER_MM; // 90px
const CANVAS_COLS = 12;
const CANVAS_ROWS = 10;

const CANVAS_WIDTH = CANVAS_COLS * GRID_PIXEL_SIZE;
const CANVAS_HEIGHT = CANVAS_ROWS * GRID_PIXEL_SIZE;
const WALL_HEIGHT_M = 2.4; // 2.4m ceiling height

// State
let currentMode = 'exterior';
let selectedPoint = null;
let walls = [];
let openings = [];
let gridPoints = [];
let showGrid = true;

// Fabric canvas
const fabricCanvas = new fabric.Canvas('gridCanvas', {
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: '#fafafa',
  selection: false
});

// Three.js variables
let scene, camera, renderer;
let walls3DGroup, openings3DGroup, gridPoints3DGroup;
let autoRotate = true;
let rotationAngle = 0;

// ========== INITIALIZATION ==========

initThree();
initGridPoints();
drawGridLines();
setupEventListeners();
updateStats();
renderThreeScene();

// ========== THREE.JS 3D PREVIEW ==========

function initThree() {
  const container = document.getElementById('three-canvas');
  const width = container.clientWidth || 300;
  const height = container.clientHeight || 400;
  
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8e8e8);
  
  // Camera
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(15, 15, 15);
  camera.lookAt(0, 1, 0);
  
  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);
  
  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(10, 20, 10);
  directionalLight.castShadow = true;
  scene.add(directionalLight);
  
  // Groups
  walls3DGroup = new THREE.Group();
  openings3DGroup = new THREE.Group();
  gridPoints3DGroup = new THREE.Group();
  scene.add(walls3DGroup);
  scene.add(openings3DGroup);
  scene.add(gridPoints3DGroup);
  
  // Ground plane
  const groundGeometry = new THREE.PlaneGeometry(20, 20);
  const groundMaterial = new THREE.MeshPhongMaterial({ color: 0xf0f0f0, side: THREE.DoubleSide });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  scene.add(ground);
  
  // Orbit controls
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  
  const canvas3D = renderer.domElement;
  
  canvas3D.addEventListener('mousedown', () => isDragging = true);
  canvas3D.addEventListener('mouseup', () => isDragging = false);
  canvas3D.addEventListener('mouseleave', () => isDragging = false);
  canvas3D.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const deltaMove = { x: e.offsetX - previousMousePosition.x, y: e.offsetY - previousMousePosition.y };
      rotationAngle += deltaMove.x * 0.01;
      camera.position.x = Math.sin(rotationAngle) * 15;
      camera.position.z = Math.cos(rotationAngle) * 15;
      camera.lookAt(0, 1, 0);
    }
    previousMousePosition = { x: e.offsetX, y: e.offsetY };
  });
  
  canvas3D.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomSpeed = 0.01;
    camera.position.multiplyScalar(1 + e.deltaY * zoomSpeed);
    camera.lookAt(0, 1, 0);
  });
  
  window.addEventListener('resize', () => {
    const container = document.getElementById('three-canvas');
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    renderThreeScene();
  });
}

function renderThreeScene() {
  // Clear existing meshes
  while(walls3DGroup.children.length > 0) walls3DGroup.remove(walls3DGroup.children[0]);
  while(openings3DGroup.children.length > 0) openings3DGroup.remove(openings3DGroup.children[0]);
  while(gridPoints3DGroup.children.length > 0) gridPoints3DGroup.remove(gridPoints3DGroup.children[0]);
  
  // Center offset for 3D world
  const centerX = (CANVAS_COLS * GRID_PIXEL_SIZE) / 2 / PIXEL_PER_MM / 1000;
  const centerZ = (CANVAS_ROWS * GRID_PIXEL_SIZE) / 2 / PIXEL_PER_MM / 1000;
  
  function gridToWorld(col, row) {
    return {
      x: col * MODULE_SIZE / 1000 - centerX,
      z: (CANVAS_ROWS - row) * MODULE_SIZE / 1000 - centerZ
    };
  }
  
  // Render grid points
  const pointGeo = new THREE.SphereGeometry(0.08, 8, 8);
  const pointMat = new THREE.MeshBasicMaterial({ color: 0x28a745 });
  gridPoints.forEach(p => {
    const pos = gridToWorld(p.gridData.col, p.gridData.row);
    const sphere = new THREE.Mesh(pointGeo, pointMat.clone());
    sphere.position.set(pos.x, 0, pos.z);
    gridPoints3DGroup.add(sphere);
  });
  
  // Render walls and openings
  walls.forEach((wall, wallIndex) => {
    const start = gridToWorld(wall.waData.pointA.col, wall.waData.pointA.row);
    const end = gridToWorld(wall.waData.pointB.col, wall.waData.pointB.row);
    
    const length = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.z - start.z, 2));
    const angle = Math.atan2(end.z - start.z, end.x - start.x);
    
    // Wall mesh
    const wallColor = wall.waData.mode === 'exterior' ? 0x6d4aff : 0x4fc3f7;
    const wallGeometry = new THREE.BoxGeometry(length, WALL_HEIGHT_M, 0.15);
    const wallMaterial = new THREE.MeshPhongMaterial({ color: wallColor });
    const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
    
    wallMesh.position.set(
      (start.x + end.x) / 2,
      WALL_HEIGHT_M / 2,
      (start.z + end.z) / 2
    );
    wallMesh.rotation.y = -angle;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    walls3DGroup.add(wallMesh);
    
    // Render openings on this wall
    const wallOpenings = openings.filter(o => o.wallIndex === wallIndex);
    wallOpenings.forEach(opening => {
      const openingColor = opening.type === 'door' ? 0xff9800 : 0x4fc3f7;
      const openingHeight = opening.type === 'door' ? 2.1 : 1.2;
      
      const openingGeo = new THREE.BoxGeometry(opening.width, openingHeight, 0.1);
      const openingMat = new THREE.MeshPhongMaterial({ color: openingColor });
      const openingMesh = new THREE.Mesh(openingGeo, openingMat);
      
      // Position opening along wall (ratio 0-1)
      const openingRatio = opening.position;
      const openingX = start.x + (end.x - start.x) * openingRatio;
      const openingZ = start.z + (end.z - start.z) * openingRatio;
      
      openingMesh.position.set(
        openingX,
        opening.type === 'door' ? openingHeight / 2 : WALL_HEIGHT_M / 2,
        openingZ
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

// ========== FABRIC CANVAS FUNCTIONS ==========

function initGridPoints() {
  for (let col = 0; col <= CANVAS_COLS; col++) {
    for (let row = 0; row <= CANVAS_ROWS; row++) {
      const x = col * GRID_PIXEL_SIZE;
      const y = row * GRID_PIXEL_SIZE;
      
      const point = new fabric.Circle({
        left: x,
        top: y,
        radius: 4,
        fill: '#28a745',
        originX: 'center',
        originY: 'center',
        selectable: false,
        hasControls: false,
        hasBorders: false
      });
      
      point.gridData = { col, row };
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
  
  for (let col = 0; col <= CANVAS_COLS; col++) {
    const x = col * GRID_PIXEL_SIZE;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_HEIGHT);
    ctx.stroke();
  }
  
  for (let row = 0; row <= CANVAS_ROWS; row++) {
    const y = row * GRID_PIXEL_SIZE;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }
}

function findClosestPoint(x, y) {
  const tolerance = 20;
  return gridPoints.find(p => {
    const dx = Math.abs(p.left - x);
    const dy = Math.abs(p.top - y);
    return dx < tolerance && dy < tolerance;
  });
}

function createWall(pointA, pointB) {
  const line = new fabric.Line([
    pointA.left, pointA.top,
    pointB.left, pointB.top
  ], {
    stroke: currentMode === 'exterior' ? '#6d4aff' : '#4fc3f7',
    strokeWidth: 6,
    selectable: true,
    evented: true,
    strokeLinecap: 'round'
  });
  
  line.waData = {
    mode: currentMode,
    pointA: pointA.gridData,
    pointB: pointB.gridData,
    uValue: parseFloat(document.getElementById('insulationLevel')?.value || 0.35),
    id: `wall-${walls.length}-${Date.now()}`
  };
  
  // Store wall index for opening references
  line.waData.index = walls.length;
  
  walls.push(line);
  fabricCanvas.add(line);
  fabricCanvas.sendToBack(line);
  
  selectedPoint = null;
  highlightSelected(null);
  
  updateStats();
  renderThreeScene();
}

// ========== MOUSE HANDLER WITH OPENING DETECTION ==========

fabricCanvas.on('mouse:down', function(opt) {
  const evt = opt.e;
  const pointer = fabricCanvas.getPointer(evt);
  const mouseX = pointer.x;
  const mouseY = pointer.y;
  
  console.log('Mode:', currentMode, 'Click at:', mouseX, mouseY);
  
  if (currentMode === 'delete') {
    // Delete wall by clicking near endpoints
    const nearbyWall = findNearbyWall(mouseX, mouseY, 20);
    if (nearbyWall !== null) {
      const wallToRemove = walls[nearbyWall];
      // Remove all openings on this wall
      openings = openings.filter(o => o.wallIndex !== nearbyWall);
      // Renumber remaining openings
      openings = openings.map(o => ({
        ...o,
        wallIndex: o.wallIndex > nearbyWall ? o.wallIndex - 1 : o.wallIndex
      }));
      
      fabricCanvas.remove(wallToRemove);
      walls.splice(nearbyWall, 1);
      updateStats();
      renderThreeScene();
    }
    return;
  }
  
  if (currentMode === 'opening') {
    // Check if clicking on any exterior wall
    const clickedWall = findClickOnWall(mouseX, mouseY, 15);
    if (clickedWall !== null) {
      const wall = walls[clickedWall.index];
      if (wall.waData.mode !== 'exterior') {
        alert('Openings can only be added to exterior walls.');
        return;
      }
      
      // Confirm opening type
      const confirmWindow = confirm('OK for WINDOW\nCancel for DOOR');
      const openingType = confirmWindow ? 'window' : 'door';
      const openingWidth = openingType === 'door' ? 0.9 : 1.5;
      
      openings.push({
        wallIndex: clickedWall.index,
        position: clickedWall.ratio,
        type: openingType,
        width: openingWidth
      });
      
      console.log('Opening added:', openings[opens.length - 1]);
      
      updateStats();
      renderThreeScene();
      return;
    }
    return;
  }
  
  // Normal wall drawing mode
  const clickedPoint = findClosestPoint(mouseX, mouseY);
  
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

// Find closest wall to a point (within tolerance)
function findNearbyWall(x, y, tolerance) {
  for (let i = 0; i < walls.length; i++) {
    const wall = walls[i];
    const dist = pointLineDistance(x, y, wall.points[0], wall.points[1], wall.points[2], wall.points[3]);
    if (dist < tolerance) return i;
  }
  return null;
}

// Detect if mouse click is ON a wall line
function findClickOnWall(x, y, tolerance) {
  for (let i = 0; i < walls.length; i++) {
    const wall = walls[i];
    const dist = pointLineDistance(x, y, wall.points[0], wall.points[1], wall.points[2], wall.points[3]);
    
    if (dist < tolerance) {
      // Calculate ratio along the wall (0 to 1)
      const wallLenSq = Math.pow(wall.points[2] - wall.points[0], 2) + Math.pow(wall.points[3] - wall.points[1], 2);
      const distFromStartSq = Math.pow(x - wall.points[0], 2) + Math.pow(y - wall.points[1], 2);
      const wallLen = Math.sqrt(wallLenSq);
      const distFromStart = Math.sqrt(distFromStartSq);
      let ratio = wallLen > 0 ? distFromStart / wallLen : 0.5;
      
      // Clamp between 0.1 and 0.9 to prevent openings at exact endpoints
      ratio = Math.max(0.1, Math.min(0.9, ratio));
      
      return { index: i, ratio };
    }
  }
  return null;
}

function pointLineDistance(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  
  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = -1;
  
  if (len_sq !== 0) param = dot / len_sq;
  
  let xx, yy;
  
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }
  
  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

function highlightSelected(point) {
  gridPoints.forEach(p => {
    p.set('fill', p === selectedPoint ? '#ff6b6b' : '#28a745');
  });
  fabricCanvas.requestRenderAll();
}

function updateStats() {
  let exteriorLength = 0;
  let interiorLength = 0;
  let totalLength = 0;
  let totalHeatLoss = 0;
  const deltaT = 15;
  
  walls.forEach(wall => {
    const length = getWallLengthMeters(wall);
    totalLength += length;
    
    if (wall.waData.mode === 'exterior') {
      exteriorLength += length;
    } else {
      interiorLength += length;
    }
    
    totalHeatLoss += length * wall.waData.uValue * deltaT;
  });
  
  // Adjust for openings
  openings.forEach(opening => {
    const wall = walls[opening.wallIndex];
    if (wall && wall.waData.mode === 'exterior') {
      const originalU = wall.waData.uValue;
      const openingU = opening.type === 'door' ? 2.0 : 1.2;
      totalHeatLoss -= opening.width * originalU * deltaT;
      totalHeatLoss += opening.width * openingU * deltaT;
    }
  });
  
  const score = Math.max(0, 100 - (totalHeatLoss * 0.5));
  
  document.getElementById('totalLength').textContent = `${totalLength.toFixed(1)} m`;
  document.getElementById('exteriorLength').textContent = `${exteriorLength.toFixed(1)} m`;
  document.getElementById('interiorLength').textContent = `${interiorLength.toFixed(1)} m`;
  document.getElementById('openingCount').textContent = openings.length;
  document.getElementById('energyScore').textContent = Math.round(score);
  document.getElementById('heatLoss').textContent = `${totalHeatLoss.toFixed(1)} W/K`;
  
  // Update instructions dynamically
  const instructions = {
    exterior: ['Select Exterior Wall mode', 'Click first grid point', 'Click second grid point to place wall'],
    interior: ['Select Interior Wall mode', 'Click first grid point', 'Click second grid point to place wall'],
    opening: ['Select Add Opening mode', 'Click on an exterior wall line', 'OK = Window, Cancel = Door'],
    delete: ['Select Delete mode', 'Click on a wall to remove', 'ESC to exit delete mode']
  };
  document.getElementById('instructionsText').innerHTML = instructions[currentMode].map((text, i) => `<li>${text}</li>`).join('');
}

function getWallLengthMeters(wall) {
  const dx = Math.abs(wall.waData.pointA.col - wall.waData.pointB.col) * MODULE_SIZE;
  const dy = Math.abs(wall.waData.pointA.row - wall.waData.pointB.row) * MODULE_SIZE;
  return Math.sqrt(dx * dx + dy * dy) / 1000;
}

function setupEventListeners() {
  document.getElementById('modeExterior').onclick = () => setMode('exterior');
  document.getElementById('modeInterior').onclick = () => setMode('interior');
  document.getElementById('modeOpening').onclick = () => setMode('opening');
  document.getElementById('modeDelete').onclick = () => setMode('delete');
  
  document.getElementById('toggleGrid').onclick = () => {
    showGrid = !showGrid;
    fabricCanvas.backgroundColor = showGrid ? '#fafafa' : '#ffffff';
    gridPoints.forEach(p => p.set('visible', showGrid));
    fabricCanvas.requestRenderAll();
  };
  
  document.getElementById('toggle3D').onclick = () => {
    document.getElementById('three-sidebar').classList.toggle('hidden');
  };
  
  document.getElementById('autoRotate').onchange = (e) => {
    autoRotate = e.target.checked;
  };
  
  document.getElementById('clearAll').onclick = () => {
    if (confirm('Clear all walls and openings?')) {
      walls.forEach(w => fabricCanvas.remove(w));
      walls = [];
      openings = [];
      selectedPoint = null;
      highlightSelected(null);
      updateStats();
      renderThreeScene();
    }
  };
  
  document.getElementById('exportDesign').onclick = () => {
    const data = {
      walls: walls.map(w => ({
        mode: w.waData.mode,
        pointA: w.waData.pointA,
        pointB: w.waData.pointB,
        uValue: w.waData.uValue
      })),
      openings: openings,
      timestamp: Date.now(),
      gridSize: { cols: CANVAS_COLS, rows: CANVAS_ROWS },
      moduleSize: MODULE_SIZE
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `segal-design-${Date.now()}.json`;
    a.click();
  };
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      selectedPoint = null;
      highlightSelected(null);
    }
  });
}

function setMode(mode) {
  currentMode = mode;
  
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  document.getElementById(`mode${mode.charAt(0).toUpperCase() + mode.slice(1)}`).classList.add('active');
  
  selectedPoint = null;
  highlightSelected(null);
  updateStats();
}
