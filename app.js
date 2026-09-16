// Segal House Designer - Core Logic
const SEGMENT_SIZE = 90; // 900mm represented as 90px (1:10 scale)
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 900;

let canvas = new fabric.Canvas('gridCanvas', {
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: '#fafafa'
});

// Track all placed modules for energy calculation
let modules = [];

// Initialize
drawGrid();
setupEventListeners();
updateEnergyStats();

function drawGrid() {
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  
  for (let x = 0; x <= CANVAS_WIDTH; x += SEGMENT_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_HEIGHT);
    ctx.stroke();
  }
  
  for (let y = 0; y <= CANVAS_HEIGHT; y += SEGMENT_SIZE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }
}

function snapToGrid(value) {
  return Math.round(value / SEGMENT_SIZE) * SEGMENT_SIZE;
}

function addModule(type, uValue, color) {
  const x = snapToGrid(Math.random() * (CANVAS_WIDTH - SEGMENT_SIZE)) + SEGMENT_SIZE;
  const y = snapToGrid(Math.random() * (CANVAS_HEIGHT - SEGMENT_SIZE)) + SEGMENT_SIZE;
  
  const rect = new fabric.Rect({
    left: x,
    top: y,
    width: SEGMENT_SIZE,
    height: SEGMENT_SIZE,
    fill: color,
    opacity: 0.7,
    selectable: true
  });
  
  canvas.add(rect);
  
  modules.push({
    id: `${type}-${modules.length}`,
    type: type,
    uValue: uValue,
    area: 0.81 // m² per module (0.9m × 0.9m)
  });
  
  updateEnergyStats();
}

function setupEventListeners() {
  document.getElementById('addWall').onclick = () => addModule('wall', 0.18, '#6d4aff');
  document.getElementById('addWindow').onclick = () => addModule('window', 1.2, '#4fc3f7');
  document.getElementById('addDoor').onclick = () => addModule('door', 2.0, '#ff9800');
  
  document.getElementById('clearCanvas').onclick = () => {
    canvas.clear();
    modules = [];
    drawGrid();
    updateEnergyStats();
  };
  
  document.getElementById('exportDesign').onclick = () => {
    const data = JSON.stringify(modules, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'design.json';
    a.click();
  };
  
  // Snap-to-grid when moving objects
  canvas.on('object:moving', function(options) {
    const obj = options.target;
    obj.set({
      left: snapToGrid(obj.left),
      top: snapToGrid(obj.top)
    });
  });
  
  // Delete key support
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete') {
      const activeObj = canvas.getActiveObject();
      if (activeObj) {
        modules = modules.filter(m => m.fabricId !== activeObj.id);
        canvas.remove(activeObj);
        updateEnergyStats();
      }
    }
  });
}

function updateEnergyStats() {
  const deltaT = 15; // Indoor-outdoor temp difference (°C)
  let totalLoss = 0;
  
  modules.forEach(m => {
    totalLoss += m.area * m.uValue * deltaT;
  });
  
  const score = Math.max(0, 100 - (totalLoss * 2));
  
  document.getElementById('moduleCount').textContent = `Modules: ${modules.length}`;
  document.getElementById('energyScore').textContent = `Score: ${Math.round(score)}`;
  document.getElementById('heatLoss').textContent = `Heat Loss: ${totalLoss.toFixed(1)} W/K`;
}
