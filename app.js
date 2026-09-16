// Segal House Designer - Grid-based wall drawing
const MODULE_SIZE = 900; // 900mm real-world size
const PIXEL_PER_MM = 0.1; // 1:10 scale (90px per module)
const GRID_PIXEL_SIZE = MODULE_SIZE * PIXEL_PER_MM; // 90 pixels
const CANVAS_COLS = 12; // Number of columns
const CANVAS_ROWS = 10; // Number of rows

const CANVAS_WIDTH = CANVAS_COLS * GRID_PIXEL_SIZE;
const CANVAS_HEIGHT = CANVAS_ROWS * GRID_PIXEL_SIZE;

// State
let currentMode = 'exterior'; // 'exterior', 'interior', 'delete'
let selectedPoint = null; // First clicked point
let walls = []; // Array of wall segments
let gridPoints = []; // All grid point objects
let showGrid = true;

// Fabric canvas setup
const fabricCanvas = new fabric.Canvas('gridCanvas', {
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: '#fafafa'
});

// Initialize
initGridPoints();
drawGridLines();
drawAllWalls();
updateStats();
setupEventListeners();

// Create grid points
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
        hoverCursor: 'pointer',
        hasControls: false,
        hasBorders: false
      });
      
      point.gridData = { col, row };
      gridPoints.push(point);
      fabricCanvas.add(point);
    }
  }
}

// Draw grid lines (background)
function drawGridLines() {
  const ctx = fabricCanvas.getContext();
  
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  
  // Light grid
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

// Find closest grid point to coordinates
function findClosestPoint(x, y) {
  const tolerance = 20; // pixels
  
  return gridPoints.find(p => {
    const dx = Math.abs(p.left - x);
    const dy = Math.abs(p.top - y);
    return dx < tolerance && dy < tolerance;
  });
}

// Create a wall segment between two points
function createWall(pointA, pointB) {
  const line = new fabric.Line([
    pointA.left, pointA.top,
    pointB.left, pointB.top
  ], {
    stroke: currentMode === 'exterior' ? '#6d4aff' : '#4fc3f7',
    strokeWidth: 6,
    selectable: true,
    evented: true
  });
  
  line.waData = {
    mode: currentMode,
    pointA: pointA.gridData,
    pointB: pointB.gridData,
    uValue: parseFloat(document.getElementById('insulationLevel').value),
    id: `wall-${Date.now()}`
  };
  
  walls.push(line);
  fabricCanvas.add(line);
  
  // Reset selection
  selectedPoint = null;
  highlightSelected(null);
  
  updateStats();
}

// Place or delete wall on click
fabricCanvas.on('mouse:down', function(opt) {
  const evt = opt.e;
  const pointer = fabricCanvas.getPointer(evt);
  const clickedPoint = findClosestPoint(pointer.x, pointer.y);
  
  if (!clickedPoint) return;
  
  if (currentMode === 'delete') {
    // Check if clicking on a wall near this point
    const nearbyWall = walls.find(w => {
      const distA = Math.sqrt(
        Math.pow(w.waData.pointA.col - clickedPoint.gridData.col, 2) +
        Math.pow(w.waData.pointA.row - clickedPoint.gridData.row, 2)
      );
      const distB = Math.sqrt(
        Math.pow(w.waData.pointB.col - clickedPoint.gridData.col, 2) +
        Math.pow(w.waData.pointB.row - clickedPoint.gridData.row, 2)
      );
      return distA < 1 || distB < 1; // Adjacent or same point
    });
    
    if (nearbyWall) {
      fabricCanvas.remove(nearbyWall);
      walls = walls.filter(w => w !== nearbyWall);
      updateStats();
    }
    return;
  }
  
  // Drawing mode
  if (!selectedPoint) {
    // First click
    selectedPoint = clickedPoint;
    highlightSelected(clickedPoint);
  } else if (selectedPoint === clickedPoint) {
    // Clicked same point - cancel
    selectedPoint = null;
    highlightSelected(null);
  } else {
    // Second click - create wall
    createWall(selectedPoint, clickedPoint);
  }
});

// Highlight selected starting point
function highlightSelected(point) {
  gridPoints.forEach(p => {
    p.set('fill', p === selectedPoint ? '#ff6b6b' : '#28a745');
  });
}

// Render all walls
function drawAllWalls() {
  // We're using fabric objects, so walls render automatically
  fabricCanvas.renderAll();
}

// Calculate wall length in meters
function getWallLengthMeters(wall) {
  const dx = Math.abs(wall.waData.pointA.col - wall.waData.pointB.col) * MODULE_SIZE;
  const dy = Math.abs(wall.waData.pointA.row - wall.waData.pointB.row) * MODULE_SIZE;
  const lengthMm = Math.sqrt(dx * dx + dy * dy);
  return lengthMm / 1000; // Convert to meters
}

// Update statistics sidebar
function updateStats() {
  let exteriorLength = 0;
  let interiorLength = 0;
  let totalLength = 0;
  let totalHeatLoss = 0;
  
  const deltaT = 15; // Indoor-outdoor temp difference (°C)
  
  walls.forEach(wall => {
    const length = getWallLengthMeters(wall);
    totalLength += length;
    
    if (wall.waData.mode === 'exterior') {
      exteriorLength += length;
    } else {
      interiorLength += length;
    }
    
    // Heat loss = length × U-value × ΔT × 1m height (simplified)
    totalHeatLoss += length * wall.waData.uValue * deltaT;
  });
  
  // Energy score (lower heat loss = higher score)
  const score = Math.max(0, 100 - (totalHeatLoss * 0.5));
  
  document.getElementById('totalLength').textContent = `${totalLength.toFixed(1)} m`;
  document.getElementById('exteriorLength').textContent = `${exteriorLength.toFixed(1)} m`;
  document.getElementById('interiorLength').textContent = `${interiorLength.toFixed(1)} m`;
  document.getElementById('energyScore').textContent = Math.round(score);
  document.getElementById('heatLoss').textContent = `${totalHeatLoss.toFixed(1)} W/K`;
}

// Event listeners
function setupEventListeners() {
  // Mode buttons
  document.getElementById('modeExterior').onclick = () => {
    setMode('exterior');
  };
  
  document.getElementById('modeInterior').onclick = () => {
    setMode('interior');
  };
  
  document.getElementById('modeDelete').onclick = () => {
    setMode('delete');
  };
  
  // Insulation selector
  document.getElementById('insulationLevel').onchange = () => {
    // Update existing walls if desired (optional)
  };
  
  // Toggle grid visibility
  document.getElementById('toggleGrid').onclick = () => {
    showGrid = !showGrid;
    fabricCanvas.backgroundColor = showGrid ? '#fafafa' : '#ffffff';
    gridPoints.forEach(p => p.set('visible', showGrid));
    fabricCanvas.requestRenderAll();
  };
  
  // Clear all
  document.getElementById('clearAll').onclick = () => {
    if (confirm('Clear all walls?')) {
      walls.forEach(w => fabricCanvas.remove(w));
      walls = [];
      selectedPoint = null;
      highlightSelected(null);
      updateStats();
    }
  };
  
  // Export design
  document.getElementById('exportDesign').onclick = () => {
    const data = {
      walls: walls.map(w => ({
        mode: w.waData.mode,
        pointA: w.waData.pointA,
        pointB: w.waData.pointB,
        uValue: w.waData.uValue
      })),
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
  
  // ESC to cancel selection
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selectedPoint) {
      selectedPoint = null;
      highlightSelected(null);
    }
  });
}

// Set current drawing mode
function setMode(mode) {
  currentMode = mode;
  
  // Update button states
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  document.getElementById(`mode${mode.charAt(0).toUpperCase() + mode.slice(1)}`).classList.add('active');
  
  // Cancel any pending wall
  selectedPoint = null;
  highlightSelected(null);
}
