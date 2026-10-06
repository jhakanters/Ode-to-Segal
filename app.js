// ============================================
// Segal House Designer - Energy Modeling Edition
// v3: Fixed JSON export for Grasshopper, BFS 2026:9 compliance
//     (Um + indicative Etal via degree-hour method)
// ============================================

const MODULE_SIZE = 900;
const PIXEL_PER_MM = 0.1;
const GRID_PIXEL_SIZE = 45;
const CANVAS_COLS = 20;
const CANVAS_ROWS = 15;
const WALL_HEIGHT_M = 3.0;
const WINDOW_START_HEIGHT_M = 0.8;
const WINDOW_HEIGHT_M = 1.2;
const DOOR_HEIGHT_M = 2.1;
const MAX_OPENING_WIDTH = 0.85;

const CANVAS_WIDTH = CANVAS_COLS * GRID_PIXEL_SIZE;
const CANVAS_HEIGHT = CANVAS_ROWS * GRID_PIXEL_SIZE;

// ===== BFS 2026:9 constants =====
const U_WINDOW_DOOR = 1.1;        // Table 6 Bilaga 2
const U_ROOF = 0.13;              // Table 6 Bilaga 2 (assumed)
const U_FLOOR = 0.15;             // Table 6 Bilaga 2 (assumed)
const HOT_WATER_KWH_M2 = 20;      // Table 2 Bilaga 1
const INTERNAL_GAINS_W_M2 = 3.7;  // Table 2 Bilaga 1
const VENT_FLOW_L_S_M2 = 0.35;    // Table 2 Bilaga 1
const HEATING_SEASON_H = 6500;    // Assumption, disclosed
const DH_BASE_KH = 88000;         // Degree-hours at Fgeo=1.0 (approximation)
const GAINS_UTILIZATION = 0.8;    // Assumption, disclosed
const AIR_HC_W_S_PER_L_K = 1.2;   // rho*cp ≈ 1200 J/(m³K) = 1.2 W·s/(L·K)

// State variables
let currentMode = 'exterior';
let selectedPoint = null;
let walls = [];
let openings = [];
let gridPoints = [];
let showGrid = true;
let pendingOpening = null;
let canvasScale = 1.0;
let fabricCanvas = null;

// Three.js
let scene = null, camera = null, renderer = null;
let walls3DGroup = null, openings3DGroup = null, gridPoints3DGroup = null;
let floorGroup = null, roofGroup = null;
let autoRotate = true;
let rotationAngle = 0;
let rotationSpeed = 0.005;

// ===== Swedish municipalities → Fgeo (BFS 2026:9 Bilaga 3, Table 1) =====
const MUNICIPALITIES = {
  "Ale":0.9,"Alingsås":1.0,"Alvesta":1.0,"Aneby":1.0,"Arboga":1.0,"Arjeplog":1.7,
  "Arvidsjaur":1.6,"Arvika":1.1,"Askersund":1.0,"Avesta":1.1,"Bengtsfors":1.0,
  "Berg":1.4,"Bjurholm":1.4,"Bjuv":0.8,"Boden":1.6,"Bollebygd":1.0,"Bollnäs":1.2,
  "Borgholm":0.8,"Borlänge":1.1,"Borås":1.0,"Botkyrka":1.0,"Boxholm":1.0,
  "Bromölla":0.8,"Bräcke":1.4,"Burlöv":0.8,"Båstad":0.8,"Dals-Ed":1.0,
  "Danderyd":1.0,"Degerfors":1.0,"Dorotea":1.5,"Eda":1.1,"Ekerö":1.0,"Eksjö":1.0,
  "Emmaboda":0.9,"Enköping":1.0,"Eskilstuna":1.0,"Eslöv":0.8,"Essunga":1.0,
  "Fagersta":1.1,"Falkenberg":0.8,"Falköping":1.0,"Falun":1.1,"Filipstad":1.1,
  "Finspång":1.0,"Flen":1.0,"Forshaga":1.0,"Färgelanda":1.0,"Gagnef":1.2,
  "Gislaved":1.0,"Gnesta":1.0,"Gnosjö":1.0,"Gotland":0.9,"Grums":1.0,
  "Grästorp":0.9,"Gullspång":1.0,"Gällivare":1.8,"Gävle":1.1,"Göteborg":0.9,
  "Götene":0.9,"Habo":1.0,"Hagfors":1.2,"Hallsberg":1.0,"Hallstahammar":1.0,
  "Halmstad":0.8,"Hammarö":1.0,"Haninge":1.0,"Haparanda":1.5,"Heby":1.1,
  "Hedemora":1.1,"Helsingborg":0.8,"Herrljunga":1.0,"Hjo":0.9,"Hofors":1.1,
  "Huddinge":1.0,"Hudiksvall":1.1,"Hultsfred":1.0,"Hylte":1.0,"Håbo":1.0,
  "Hällefors":1.1,"Härjedalen":1.4,"Härnösand":1.2,"Härryda":0.9,"Hässleholm":0.9,
  "Höganäs":0.8,"Högsby":0.9,"Hörby":0.9,"Höör":0.9,"Jokkmokk":1.8,"Järfälla":1.0,
  "Jönköping":1.0,"Kalix":1.5,"Kalmar":0.9,"Karlsborg":0.9,"Karlshamn":0.9,
  "Karlskoga":1.1,"Karlskrona":0.8,"Karlstad":1.0,"Katrineholm":1.0,"Kil":1.0,
  "Kinda":1.0,"Kiruna":1.8,"Klippan":0.9,"Knivsta":1.0,"Kramfors":1.3,
  "Kristianstad":0.8,"Kristinehamn":1.0,"Krokom":1.4,"Kumla":1.0,"Kungsbacka":0.9,
  "Kungsör":1.0,"Kungälv":0.9,"Kävlinge":0.8,"Köping":1.0,"Laholm":0.9,
  "Landskrona":0.8,"Laxå":1.0,"Lekeberg":1.0,"Leksand":1.2,"Lerum":0.9,
  "Lessebo":1.0,"Lidingö":1.0,"Lidköping":0.9,"Lilla Edet":0.9,"Lindesberg":1.1,
  "Linköping":0.9,"Ljungby":1.0,"Ljusdal":1.3,"Ljusnarsberg":1.1,"Lomma":0.8,
  "Ludvika":1.1,"Luleå":1.5,"Lund":0.8,"Lycksele":1.5,"Lysekil":0.9,"Malmö":0.8,
  "Malung-Sälen":1.3,"Malå":1.6,"Mariestad":0.9,"Mark":0.9,"Markaryd":0.9,
  "Mellerud":0.9,"Mjölby":1.0,"Mora":1.2,"Motala":1.0,"Mullsjö":1.0,
  "Munkedal":0.9,"Munkfors":1.1,"Mölndal":0.9,"Mönsterås":0.9,"Mörbylånga":0.8,
  "Nacka":1.0,"Nora":1.1,"Norberg":1.1,"Nordanstig":1.2,"Nordmaling":1.3,
  "Norrköping":0.9,"Norrtälje":1.0,"Norsjö":1.6,"Nybro":0.9,"Nykvarn":1.0,
  "Nyköping":1.0,"Nynäshamn":0.9,"Nässjö":1.0,"Ockelbo":1.1,"Olofström":0.9,
  "Orsa":1.2,"Orust":0.9,"Osby":0.9,"Oskarshamn":0.9,"Ovanåker":1.2,
  "Oxelösund":0.9,"Pajala":1.7,"Partille":0.9,"Perstorp":0.9,"Piteå":1.4,
  "Ragunda":1.4,"Robertsfors":1.3,"Ronneby":0.8,"Rättvik":1.2,"Sala":1.1,
  "Salem":1.0,"Sandviken":1.1,"Sigtuna":1.0,"Simrishamn":0.8,"Sjöbo":0.8,
  "Skara":1.0,"Skellefteå":1.4,"Skinnskatteberg":1.1,"Skurup":0.8,"Skövde":1.0,
  "Smedjebacken":1.1,"Sollefteå":1.4,"Sollentuna":1.0,"Solna":0.9,"Sorsele":1.7,
  "Sotenäs":0.8,"Staffanstorp":0.8,"Stenungsund":0.9,"Stockholm":1.0,
  "Storfors":1.1,"Storuman":1.6,"Strängnäs":1.0,"Strömstad":0.9,"Strömsund":1.4,
  "Sundbyberg":0.9,"Sundsvall":1.2,"Sunne":1.1,"Surahammar":1.1,"Svalöv":0.8,
  "Svedala":0.8,"Svenljunga":1.0,"Säffle":1.0,"Säter":1.1,"Sävsjö":1.0,
  "Söderhamn":1.1,"Söderköping":0.9,"Södertälje":1.0,"Sölvesborg":0.8,"Tanum":0.9,
  "Tibro":1.0,"Tidaholm":1.0,"Tierp":1.1,"Timrå":1.2,"Tingsryd":0.9,"Tjörn":0.8,
  "Tomelilla":0.8,"Torsby":1.1,"Torsås":0.9,"Tranemo":1.0,"Tranås":1.0,
  "Trelleborg":0.8,"Trollhättan":0.9,"Trosa":1.0,"Tyresö":0.9,"Täby":1.0,
  "Töreboda":1.0,"Uddevalla":0.9,"Ulricehamn":1.0,"Umeå":1.3,"Upplands-Bro":1.0,
  "Upplands-Väsby":1.0,"Uppsala":1.0,"Uppvidinge":1.0,"Vadstena":0.9,
  "Vaggeryd":1.0,"Valdemarsvik":0.9,"Vallentuna":1.0,"Vansbro":1.2,"Vara":0.9,
  "Varberg":0.8,"Vaxholm":1.0,"Vellinge":0.8,"Vetlanda":1.0,"Vilhelmina":1.6,
  "Vimmerby":1.0,"Vindeln":1.5,"Vingåker":1.0,"Vårgårda":1.0,"Vänersborg":0.9,
  "Vännäs":1.4,"Värmdö":0.9,"Värnamo":1.0,"Västervik":0.9,"Västerås":1.0,
  "Växjö":1.0,"Ydre":1.0,"Ystad":0.8,"Åmål":1.0,"Ånge":1.4,"Åre":1.5,
  "Årjäng":1.1,"Åsele":1.5,"Åstorp":0.8,"Åtvidaberg":1.0,"Älmhult":0.9,
  "Älvdalen":1.3,"Älvkarleby":1.0,"Älvsbyn":1.6,"Ängelholm":0.8,"Öckerö":0.8,
  "Ödeshög":0.9,"Örebro":1.0,"Örkelljunga":0.9,"Örnsköldsvik":1.3,
  "Östersund":1.4,"Österåker":1.0,"Östhammar":1.0,"Östra Göinge":0.9,
  "Överkalix":1.6,"Övertorneå":1.6
};

// Heating systems: (carrier weight w from Table 1 Bilaga 1, efficiency eta)
const HEATING_SYSTEMS = {
  "electric":  { label: "Electric resistance", w: 1.8, eta: 1.0 },
  "heatpump":  { label: "Heat pump (COP 3.0)", w: 1.8, eta: 3.0 },
  "district":  { label: "District heating",    w: 0.7, eta: 0.95 },
  "biofuel":   { label: "Biofuel boiler",      w: 0.6, eta: 0.85 }
};

console.log('🚀 Initializing Segal House Designer...');

// ========== INITIALIZATION ==========
function initAll() {
  if (typeof fabric === 'undefined') {
    console.error('❌ Fabric.js not loaded!');
    alert('Error: Fabric.js failed to load. Refresh the page.');
    return;
  }
  
  try {
    fabricCanvas = new fabric.Canvas('gridCanvas', {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: '#fafafa',
      selection: false,
      allowTouchScrolling: false,
      preserveObjectStacking: false
    });
  } catch (e) {
    console.error('❌ Failed to initialize Fabric canvas:', e);
    alert('Error initializing canvas. Please reload the page.');
    return;
  }
  
  initGridPoints();
  drawGridLines();
  populateLocationDropdown();
  setupEventListeners();
  attachMouseHandlers();
  updateStats();
  drawOpeningMarkers();
  loadDesignFromURL();
  
  setTimeout(() => {
    initThree();
    setTimeout(renderThreeScene, 100);
  }, 100);
  
  console.log('✅ Segal House Designer fully initialized!');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}

function populateLocationDropdown() {
  const select = document.getElementById('locationSelect');
  if (!select) return;
  Object.keys(MUNICIPALITIES).sort().forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name + ' (Fgeo ' + MUNICIPALITIES[name].toFixed(1) + ')';
    select.appendChild(option);
  });
}

// ========== ZOOM ==========
function setZoom(scale) {
  canvasScale = Math.max(0.25, Math.min(2.0, scale));
  fabricCanvas.setZoom(canvasScale);
  fabricCanvas.setViewportTransform([canvasScale, 0, 0, canvasScale, 0, 0]);
  document.getElementById('zoomLevel').textContent = Math.round(canvasScale * 100) + '%';
  fabricCanvas.requestRenderAll();
}
function zoomIn()  { setZoom(canvasScale * 1.25); }
function zoomOut() { setZoom(canvasScale / 1.25); }
function resetZoom() { setZoom(1.0); }

// ========== ENVELOPE MODEL ==========
function getWallLengthM(wall) {
  const dx = Math.abs(wall.pointA.col - wall.pointB.col) * MODULE_SIZE;
  const dy = Math.abs(wall.pointA.row - wall.pointB.row) * MODULE_SIZE;
  return Math.hypot(dx, dy) / 1000;
}

// Bounding-box footprint (accurate for rectangular plans)
function getFootprint() {
  if (walls.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  walls.forEach(wall => {
    minX = Math.min(minX, wall.pointA.col, wall.pointB.col);
    maxX = Math.max(maxX, wall.pointA.col, wall.pointB.col);
    minY = Math.min(minY, wall.pointA.row, wall.pointB.row);
    maxY = Math.max(maxY, wall.pointA.row, wall.pointB.row);
  });
  const width = (maxX - minX) * MODULE_SIZE / 1000;
  const depth = (maxY - minY) * MODULE_SIZE / 1000;
  return { width: width, depth: depth, area: width * depth };
}

// Full envelope model used by both Um and Etal
function buildEnvelopeModel() {
  const footprint = getFootprint();
  if (!footprint || footprint.area <= 0) return null;
  
  let wallArea = 0, wallUA = 0, openingArea = 0, openingUA = 0;
  
  walls.forEach((wall, idx) => {
    if (wall.mode !== 'exterior') return;
    const gross = getWallLengthM(wall) * WALL_HEIGHT_M;
    let thisOpArea = 0;
    openings.filter(o => o.wallIndex === idx).forEach(o => {
      thisOpArea += o.width * (o.type === 'door' ? DOOR_HEIGHT_M : WINDOW_HEIGHT_M);
    });
    thisOpArea = Math.min(thisOpArea, gross);
    openingArea += thisOpArea;
    openingUA += thisOpArea * U_WINDOW_DOOR;
    const netArea = gross - thisOpArea;
    wallArea += netArea;
    wallUA += netArea * wall.uValue;
  });
  
  const roofUA = footprint.area * U_ROOF;
  const floorUA = footprint.area * U_FLOOR;
  const HT = wallUA + openingUA + roofUA + floorUA;
  const envelopeArea = wallArea + openingArea + 2 * footprint.area;
  
  return {
    HT: HT,
    envelopeArea: envelopeArea,
    floorArea: footprint.area,
    openingArea: openingArea,
    wallUA: wallUA, roofUA: roofUA, floorUA: floorUA, openingUA: openingUA
  };
}

// ========== ETAL ESTIMATE (degree-hour method) ==========
function estimateEtal(model, fgeo, systemKey, hrFactor) {
  const sys = HEATING_SYSTEMS[systemKey] || HEATING_SYSTEMS.heatpump;
  const A = model.floorArea;
  
  const DH = DH_BASE_KH * fgeo;                         // Kh
  const Hv = VENT_FLOW_L_S_M2 * AIR_HC_W_S_PER_L_K * (1 - hrFactor) * A; // W/K
  const HTot = model.HT + Hv;                           // W/K
  
  let heating_kWh = (HTot * DH) / 1000;                 // W/K × Kh = Wh
  const gains_kWh = (GAINS_UTILIZATION * INTERNAL_GAINS_W_M2 * A * HEATING_SEASON_H) / 1000;
  heating_kWh = Math.max(0, heating_kWh - gains_kWh);
  
  const deliveredHeat_kWh = heating_kWh / sys.eta;
  const deliveredHW_kWh = (HOT_WATER_KWH_M2 * A) / sys.eta;
  const weighted_kWh = (deliveredHeat_kWh + deliveredHW_kWh) * sys.w;
  const etal = weighted_kWh / A;
  
  return {
    etal: etal,
    heating_kWh: heating_kWh,
    gains_kWh: gains_kWh,
    deliveredHeat_kWh: deliveredHeat_kWh,
    deliveredHW_kWh: deliveredHW_kWh,
    weighted_kWh: weighted_kWh,
    DH: DH,
    Hv: Hv,
    systemLabel: sys.label
  };
}

// Etal limit, new near-zero-energy buildings (Table 1 Bilaga 2)
function etalLimit(atemp, fgeo) {
  if (atemp < 90)  return 20 + 80 * fgeo;
  if (atemp < 130) return 19 + 76 * fgeo;
  return 18 + 72 * fgeo;
}

// ========== COMPLIANCE CHECK ==========
function checkCompliance() {
  const locationName = document.getElementById('locationSelect').value;
  const buildingType = document.getElementById('buildingType').value;
  const systemKey = document.getElementById('heatingSystem').value;
  const hrFactor = parseFloat(document.getElementById('heatRecovery').value) || 0;
  
  if (!locationName) {
    alert('Please select a municipality first.');
    return;
  }
  
  const model = buildEnvelopeModel();
  if (!model) {
    alert('Draw some exterior walls first — no building envelope found.');
    return;
  }
  
  const fgeo = MUNICIPALITIES[locationName];
  const isSingleStory = buildingType === 'single-story';
  
  // Um (2 kap. 4 §, Table 4 Bilaga 2)
  const um = model.HT / model.envelopeArea;
  const umLimit = isSingleStory ? 0.30 : 0.40;
  const umOK = um <= umLimit;
  
  // Etal estimate (2 kap. 3 §, Table 1 Bilaga 2)
  const etalRes = estimateEtal(model, fgeo, systemKey, hrFactor);
  const etalLim = etalLimit(model.floorArea, fgeo);
  const etalOK = etalRes.etal <= etalLim;
  
  const statusDiv = document.getElementById('complianceStatus');
  if (umOK && etalOK) {
    statusDiv.className = 'compliance-status pass';
    statusDiv.textContent = '✅ Indicative PASS — Um ' + um.toFixed(2) + ' ≤ ' +
      umLimit.toFixed(2) + ' W/m²K, estimated Etal ' + etalRes.etal.toFixed(0) +
      ' ≤ ' + etalLim.toFixed(0) + ' kWh/m²·yr (' + locationName + ')';
  } else if (umOK) {
    statusDiv.className = 'compliance-status partial';
    statusDiv.textContent = '⚠️ Um passes (' + um.toFixed(2) + ' ≤ ' + umLimit.toFixed(2) +
      ') but estimated Etal (' + etalRes.etal.toFixed(0) + ') exceeds the limit (' +
      etalLim.toFixed(0) + ' kWh/m²·yr) — ' + locationName;
  } else if (etalOK) {
    statusDiv.className = 'compliance-status partial';
    statusDiv.textContent = '⚠️ Estimated Etal passes (' + etalRes.etal.toFixed(0) + ' ≤ ' +
      etalLim.toFixed(0) + ') but Um (' + um.toFixed(2) + ') exceeds the limit (' +
      umLimit.toFixed(2) + ' W/m²K)';
  } else {
    statusDiv.className = 'compliance-status fail';
    statusDiv.textContent = '❌ Indicative FAIL — Um ' + um.toFixed(2) + ' > ' +
      umLimit.toFixed(2) + ' W/m²K and Etal ' + etalRes.etal.toFixed(0) + ' > ' +
      etalLim.toFixed(0) + ' kWh/m²·yr (' + locationName + ')';
  }
  
  const tbody = document.getElementById('complianceTableBody');
  tbody.innerHTML = '';
  
  const addRow = (param, value, limit, state) => {
    const tr = document.createElement('tr');
    tr.className = state;
    tr.innerHTML = '<td>' + param + '</td><td>' + value + '</td><td>' + limit +
      '</td><td>' + (state === 'pass' ? '✅' : state === 'fail' ? '❌' : '—') + '</td>';
    tbody.appendChild(tr);
  };
  
  addRow('Atemp (floor area)', model.floorArea.toFixed(1) + ' m²',
         '≥ 50 m² (1 kap. 3 §)', model.floorArea >= 50 ? 'pass' : 'fail');
  addRow('Um (2 kap. 4 §)', um.toFixed(3) + ' W/m²K',
         '≤ ' + umLimit.toFixed(2) + ' W/m²K', umOK ? 'pass' : 'fail');
  addRow('Etal estimate (2 kap. 3 §)', etalRes.etal.toFixed(0) + ' kWh/m²·yr',
         '≤ ' + etalLim.toFixed(0) + ' kWh/m²·yr', etalOK ? 'pass' : 'fail');
  addRow('Wall U-value (guideline, Table 6 Bil. 2)',
         document.getElementById('insulationLevel').value + ' W/m²K',
         '≤ 0.18 W/m²K',
         parseFloat(document.getElementById('insulationLevel').value) <= 0.18 ? 'pass' : 'fail');
  addRow('Geographic factor Fgeo (' + locationName + ')', fgeo.toFixed(1),
         'Climate ≈ ' + Math.round(etalRes.DH).toLocaleString('en-US') + ' Kh', 'info');
  
  const bd = document.getElementById('etalBreakdown');
  bd.innerHTML =
    '<strong>Etal breakdown (' + locationName + ', ' + etalRes.systemLabel +
    ', heat recovery ' + Math.round(hrFactor * 100) + '%):</strong><ul>' +
    '<li>Heat loss coefficient incl. ventilation: ' + (model.HT + etalRes.Hv).toFixed(0) + ' W/K</li>' +
    '<li>Degree-hours: ' + Math.round(etalRes.DH).toLocaleString('en-US') + ' Kh (approx.)</li>' +
    '<li>Space heating demand (incl. ventilation, minus internal gains): ' + etalRes.heating_kWh.toFixed(0) + ' kWh/yr</li>' +
    '<li>Delivered heating: ' + etalRes.deliveredHeat_kWh.toFixed(0) + ' kWh/yr</li>' +
    '<li>Delivered hot water: ' + etalRes.deliveredHW_kWh.toFixed(0) + ' kWh/yr</li>' +
    '<li>Primary-energy-weighted total: ' + etalRes.weighted_kWh.toFixed(0) + ' kWh/yr</li>' +
    '<li>Etal = weighted total / Atemp = ' + etalRes.etal.toFixed(1) + ' kWh/m²·yr vs limit ' + etalLim.toFixed(1) + '</li>' +
    '</ul>';
}

// ========== THREE.JS ==========
function initThree() {
  const container = document.getElementById('three-canvas');
  if (!container) return;
  
  const width = container.clientWidth || 400;
  const height = container.clientHeight || 300;
  
  try {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);
    
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(15, 15, 15);
    camera.lookAt(0, 1.5, 0);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.setClearColor(0xf5f5f5);
    
    container.innerHTML = '';
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
    
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    const canvas3D = renderer.domElement;
    
    canvas3D.addEventListener('mousedown', function(e) {
      isDragging = true;
      e.preventDefault();
    });
    canvas3D.addEventListener('mouseup', function() { isDragging = false; });
    canvas3D.addEventListener('mouseleave', function() { isDragging = false; });
    
    canvas3D.addEventListener('mousemove', function(e) {
      if (isDragging) {
        rotationAngle += (e.offsetX - prevMouse.x) * 0.01;
        camera.position.x = Math.sin(rotationAngle) * 15;
        camera.position.z = Math.cos(rotationAngle) * 15;
        camera.lookAt(0, 1.5, 0);
      }
      prevMouse = { x: e.offsetX, y: e.offsetY };
    });
    
    canvas3D.addEventListener('wheel', function(e) {
      e.preventDefault();
      camera.position.multiplyScalar(1 + e.deltaY * 0.01);
    });
    
    window.addEventListener('resize', function() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (camera) camera.aspect = w / h;
      if (camera) camera.updateProjectionMatrix();
      if (renderer) renderer.setSize(w, h);
      renderThreeScene();
    });
  } catch (err) {
    console.error('❌ Three.js initialization failed:', err);
  }
}

function renderThreeScene() {
  if (!scene) return;
  
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
  
  const pointGeo = new THREE.SphereGeometry(0.08, 8, 8);
  const pointMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
  gridPoints.forEach(function(p) {
    const pos = gridToWorld(p.gridData.col, p.gridData.row);
    const mesh = new THREE.Mesh(pointGeo, pointMat.clone());
    mesh.position.set(pos.x, 0, pos.z);
    gridPoints3DGroup.add(mesh);
  });
  
  walls.forEach(function(wall, wallIdx) {
    const start = gridToWorld(wall.pointA.col, wall.pointA.row);
    const end = gridToWorld(wall.pointB.col, wall.pointB.row);
    
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    const angle = Math.atan2(end.z - start.z, end.x - start.x);
    
    const wallMat = new THREE.MeshPhongMaterial({
      color: wall.mode === 'exterior' ? 0x333333 : 0x999999,
      transparent: true,
      opacity: 0.85
    });
    const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(length, WALL_HEIGHT_M, 0.15), wallMat);
    wallMesh.position.set((start.x + end.x) / 2, WALL_HEIGHT_M / 2, (start.z + end.z) / 2);
    wallMesh.rotation.y = -angle;
    wallMesh.castShadow = true;
    walls3DGroup.add(wallMesh);
    
    openings.filter(function(o) { return o.wallIndex === wallIdx; }).forEach(function(opening) {
      const ratio = opening.position;
      const ox = start.x + (end.x - start.x) * ratio;
      const oz = start.z + (end.z - start.z) * ratio;
      
      const openingHeight = opening.type === 'door' ? DOOR_HEIGHT_M : WINDOW_HEIGHT_M;
      const openingStart = opening.type === 'door' ? 0 : WINDOW_START_HEIGHT_M;
      
      const openingMat = new THREE.MeshPhongMaterial({
        color: opening.type === 'door' ? 0x666666 : 0xcccccc,
        transparent: true,
        opacity: opening.type === 'door' ? 0.6 : 0.4,
        side: THREE.DoubleSide,
        shininess: 80,
        specular: 0x444444
      });
      
      const openingMesh = new THREE.Mesh(new THREE.BoxGeometry(opening.width, openingHeight, 0.16), openingMat);
      openingMesh.position.set(ox, openingStart + openingHeight / 2, oz);
      openingMesh.rotation.y = -angle;
      openings3DGroup.add(openingMesh);
    });
  });
  
  const footprint = getFootprint();
  if (footprint && footprint.width > 0 && footprint.depth > 0) {
    const boundsMin = gridToWorld(0, CANVAS_ROWS);
    const boundsMax = gridToWorld(CANVAS_COLS, 0);
    const fw = footprint.width, fd = footprint.depth;
    const fx = (boundsMin.x + boundsMax.x) / 2;
    const fz = (boundsMin.z + boundsMax.z) / 2;
    
    const floorMat = new THREE.MeshPhongMaterial({ color: 0xe0e0e0, transparent: true, opacity: 0.9 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(fw + 1, fd + 1), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(fx, 0, fz);
    floor.receiveShadow = true;
    floorGroup.add(floor);
    
    const roofMat = new THREE.MeshPhongMaterial({ color: 0x808080, transparent: true, opacity: 0.7 });
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(fw + 1, fd + 1), roofMat);
    roof.rotation.x = Math.PI / 2;
    roof.position.set(fx, WALL_HEIGHT_M, fz);
    roofGroup.add(roof);
  }
  
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  if (autoRotate && camera) {
    rotationAngle += rotationSpeed;
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
  gridPoints = [];
  
  for (let c = 0; c <= CANVAS_COLS; c++) {
    for (let r = 0; r <= CANVAS_ROWS; r++) {
      const point = new fabric.Circle({
        left: c * GRID_PIXEL_SIZE,
        top: r * GRID_PIXEL_SIZE,
        radius: 5,
        fill: '#666666',
        stroke: '#333333',
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
  
  gridPoints.forEach(function(point) {
    fabricCanvas.sendToBack(point);
  });
  fabricCanvas.requestRenderAll();
}

function drawGridLines() {
  const ctx = fabricCanvas.getContext();
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  
  for (let c = 0; c <= CANVAS_COLS; c++) {
    const x = c * GRID_PIXEL_SIZE;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_HEIGHT);
    ctx.stroke();
  }
  for (let r = 0; r <= CANVAS_ROWS; r++) {
    const y = r * GRID_PIXEL_SIZE;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }
  
  ctx.font = 'bold 10px Arial';
  ctx.fillStyle = '#666';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  for (let c = 0; c <= CANVAS_COLS; c++) {
    ctx.fillText(c.toString(), c * GRID_PIXEL_SIZE, 5);
  }
  for (let r = 0; r <= CANVAS_ROWS; r++) {
    ctx.fillText(r.toString(), 5, r * GRID_PIXEL_SIZE);
  }
  
  // Wall length labels (computed from grid coords, not fabric objects)
  ctx.font = 'bold 11px Arial';
  ctx.fillStyle = '#333';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  walls.forEach(function(wall) {
    const len = getWallLengthM(wall);
    const midX = (wall.pointA.col + wall.pointB.col) / 2 * GRID_PIXEL_SIZE;
    const midY = (wall.pointA.row + wall.pointB.row) / 2 * GRID_PIXEL_SIZE;
    ctx.fillText(len.toFixed(1) + 'm', midX, midY);
  });
  
  fabricCanvas.requestRenderAll();
}

function getClosestGridPoint(x, y, tol) {
  tol = tol || 20;
  return gridPoints.find(function(p) {
    return Math.hypot(p.left - x, p.top - y) < tol;
  });
}

function createWall(pointA, pointB) {
  if (!pointA || !pointB) return;
  if (!fabricCanvas) return;
  
  // Force axis-aligned walls
  if (pointA.gridData.col !== pointB.gridData.col && pointA.gridData.row !== pointB.gridData.row) {
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
  
  const uValueInput = document.getElementById('insulationLevel');
  const uValue = uValueInput ? parseFloat(uValueInput.value || 0.18) : 0.18;
  
  const line = new fabric.Line([
    pointA.left, pointA.top,
    pointB.left, pointB.top
  ], {
    stroke: currentMode === 'exterior' ? '#333333' : '#999999',
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
    uValue: uValue
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

function getPointOnLine(px, py, x1, y1, x2, y2) {
  const A = px - x1, B = py - y1;
  const C = x2 - x1, D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  const param = lenSq !== 0 ? dot / lenSq : 0;
  
  let xx, yy;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  
  return { x: xx, y: yy, param: param };
}

function findWallUnderMouse(mx, my, tol) {
  tol = tol || 15;
  if (walls.length === 0) return null;
  
  for (let i = 0; i < walls.length; i++) {
    const coords = getLinePoints(walls[i]);
    if (!coords) continue;
    const closest = getPointOnLine(mx, my, coords.x1, coords.y1, coords.x2, coords.y2);
    const dist = Math.hypot(mx - closest.x, my - closest.y);
    if (dist < tol) return { wallIndex: i, ratio: closest.param };
  }
  return null;
}

function drawOpeningMarkers() {
  const existingMarkers = fabricCanvas.getObjects().filter(function(o) {
    return o.isOpeningMarker;
  });
  existingMarkers.forEach(function(o) { fabricCanvas.remove(o); });
  
  openings.forEach(function(opening) {
    const wall = walls[opening.wallIndex];
    if (!wall) return;
    const coords = getLinePoints(wall);
    if (!coords) return;
    
    const px = coords.x1 + (coords.x2 - coords.x1) * opening.position;
    const py = coords.y1 + (coords.y2 - coords.y1) * opening.position;
    
    const marker = new fabric.Circle({
      left: px,
      top: py,
      radius: opening.type === 'door' ? 8 : 6,
      fill: opening.type === 'door' ? '#666666' : '#cccccc',
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

// ========== MOUSE EVENT HANDLERS ==========
function attachMouseHandlers() {
  if (!fabricCanvas) return;
  
  fabricCanvas.on('mouse:down', function(opt) {
    if (!fabricCanvas) return;
    
    const pointer = fabricCanvas.getPointer(opt.e);
    const mx = pointer.x;
    const my = pointer.y;
    
    if (currentMode === 'delete') {
      const result = findWallUnderMouse(mx, my, 15);
      if (result) {
        const wallIdx = result.wallIndex;
        const wall = walls[wallIdx];
        fabricCanvas.remove(wall.fabricObj);
        
        openings = openings.filter(function(o) { return o.wallIndex !== wallIdx; });
        openings = openings.map(function(o) {
          return { ...o, wallIndex: o.wallIndex > wallIdx ? o.wallIndex - 1 : o.wallIndex };
        });
        
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
      if (result) openOpeningDialog(result);
      return;
    }
    
    // Wall creation (exterior/interior)
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
  
  fabricCanvas.on('mouse:move', function(opt) {
    if (currentMode === 'opening') {
      const pointer = fabricCanvas.getPointer(opt.e);
      const result = findWallUnderMouse(pointer.x, pointer.y, 15);
      fabricCanvas.defaultCursor = result ? 'pointer' : 'crosshair';
    }
  });
}

// ========== MODAL FUNCTIONS ==========
function openOpeningDialog(wallResult) {
  pendingOpening = wallResult;
  const dialog = document.getElementById('openingDialog');
  dialog.classList.remove('hidden');
  dialog.classList.add('show');
}

function closeOpeningDialog() {
  pendingOpening = null;
  const dialog = document.getElementById('openingDialog');
  dialog.classList.remove('show');
  dialog.classList.add('hidden');
}

function createOpening(type) {
  if (!pendingOpening) return;
  
  const wall = walls[pendingOpening.wallIndex];
  if (!wall || wall.mode !== 'exterior') {
    alert('Openings can only be placed on exterior walls!');
    closeOpeningDialog();
    return;
  }
  
  openings.push({
    wallIndex: pendingOpening.wallIndex,
    position: Math.max(0.15, Math.min(0.85, pendingOpening.ratio)),
    type: type,
    width: MAX_OPENING_WIDTH
  });
  
  closeOpeningDialog();
  drawOpeningMarkers();
  updateStats();
  setTimeout(renderThreeScene, 50);
}

function highlightSelected(point) {
  gridPoints.forEach(function(p) {
    p.fill = (p === selectedPoint) ? '#ff6b6b' : '#666666';
  });
  fabricCanvas.requestRenderAll();
}

// ========== STATS UPDATE ==========
function updateStats() {
  let extLen = 0, intLen = 0, totalLen = 0;
  
  walls.forEach(function(wall) {
    const len = getWallLengthM(wall);
    totalLen += len;
    if (wall.mode === 'exterior') extLen += len;
    else intLen += len;
  });
  
  const model = buildEnvelopeModel();
  const floorArea = model ? model.floorArea : 0;
  const ht = model ? model.HT : 0;
  
  const score = Math.max(0, Math.round(100 - ht * 0.3));
  
  document.getElementById('totalLength').textContent = totalLen.toFixed(1) + ' m';
  document.getElementById('exteriorLength').textContent = extLen.toFixed(1) + ' m';
  document.getElementById('interiorLength').textContent = intLen.toFixed(1) + ' m';
  document.getElementById('openingCount').textContent = openings.length;
  document.getElementById('floorArea').textContent = floorArea.toFixed(1) + ' m²';
  document.getElementById('htDisplay').textContent = model ? ht.toFixed(1) + ' W/K' : '-';
  document.getElementById('energyScore').textContent = score;
  
  const instr = {
    exterior: 'Click first point → Click second point (axis-aligned)',
    interior: 'Click first point → Click second point (axis-aligned)',
    opening: 'Click ON an exterior wall → Choose window or door',
    delete: 'Click on wall to remove'
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
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      console.error('Failed to load design from URL:', err);
    }
  }
}

function loadDesign(data) {
  walls.forEach(function(w) { fabricCanvas.remove(w.fabricObj); });
  walls = [];
  openings = [];
  selectedPoint = null;
  highlightSelected(null);
  
  function findGridPoint(col, row) {
    return gridPoints.find(function(p) {
      return p.gridData.col === col && p.gridData.row === row;
    });
  }
  
  if (data.walls && Array.isArray(data.walls)) {
    data.walls.forEach(function(wallData) {
      const pointA = findGridPoint(wallData.pointA.col, wallData.pointA.row);
      const pointB = findGridPoint(wallData.pointB.col, wallData.pointB.row);
      
      if (pointA && pointB) {
        const oldMode = currentMode;
        currentMode = wallData.mode;
        createWall(pointA, pointB);
        currentMode = oldMode;
        if (walls.length > 0 && typeof wallData.uValue === 'number') {
          walls[walls.length - 1].uValue = wallData.uValue;
        }
      }
    });
  }
  
  if (data.openings && Array.isArray(data.openings)) {
    data.openings.forEach(function(o) {
      openings.push({ ...o, width: Math.min(o.width || 0.85, MAX_OPENING_WIDTH) });
    });
  }
  
  drawOpeningMarkers();
  drawGridLines();
  updateStats();
  setTimeout(renderThreeScene, 50);
}

// FIXED EXPORT: keys match the Grasshopper parser
// (start/end for walls; wallStart/wallEnd/positionRatio/width-mm for openings)
function exportAsJSON() {
  const data = {
    version: '3.0',
    unit: 'mm',
    walls: walls.map(function(w) {
      return {
        mode: w.mode,
        uValue: w.uValue,
        start: { x: w.worldStart.x, y: w.worldStart.y },
        end:   { x: w.worldEnd.x,   y: w.worldEnd.y   }
      };
    }),
    openings: openings.map(function(o) {
      const wall = walls[o.wallIndex];
      return {
        type: o.type,
        width: o.width * 1000,
        positionRatio: o.position,
        wallStart: { x: wall.worldStart.x, y: wall.worldStart.y },
        wallEnd:   { x: wall.worldEnd.x,   y: wall.worldEnd.y   }
      };
    }),
    timestamp: Date.now()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'segal-' + Date.now() + '.json';
  a.click();
  
  return data;
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
  document.getElementById('modeExterior').onclick = function() { setMode('exterior'); };
  document.getElementById('modeInterior').onclick = function() { setMode('interior'); };
  document.getElementById('modeOpening').onclick = function() { setMode('opening'); };
  document.getElementById('modeDelete').onclick = function() { setMode('delete'); };
  
  document.getElementById('toggleGrid').onclick = function() {
    showGrid = !showGrid;
    fabricCanvas.backgroundColor = showGrid ? '#fafafa' : '#ffffff';
    gridPoints.forEach(function(p) { p.visible = showGrid; });
    fabricCanvas.requestRenderAll();
    drawGridLines();
  };
  
  document.getElementById('toggle3D').onclick = function() {
    document.getElementById('three-sidebar').classList.toggle('hidden');
    setTimeout(function() {
      if (renderer) {
        const container = document.getElementById('three-canvas');
        if (container) {
          const w = container.clientWidth;
          const h = container.clientHeight;
          if (camera) camera.aspect = w / h;
          if (camera) camera.updateProjectionMatrix();
          if (renderer) renderer.setSize(w, h);
        }
      }
    }, 100);
  };
  
  document.getElementById('autoRotate').onchange = function(e) {
    autoRotate = e.target.checked;
  };
  
  document.getElementById('clearAll').onclick = function() {
    if (confirm('Clear everything?')) {
      walls.forEach(function(w) { fabricCanvas.remove(w.fabricObj); });
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
  
  document.getElementById('exportDesign').onclick = exportAsJSON;
  document.getElementById('calculateCompliance').onclick = checkCompliance;
  
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      selectedPoint = null;
      highlightSelected(null);
      closeOpeningDialog();
    }
  });
  
  document.getElementById('windowBtn').onclick = function() { createOpening('window'); };
  document.getElementById('doorBtn').onclick = function() { createOpening('door'); };
  document.getElementById('closeDialog').onclick = closeOpeningDialog;
}

function setMode(mode) {
  currentMode = mode;
  
  document.querySelectorAll('.mode-btn').forEach(function(b) {
    b.classList.remove('active');
  });
  
  const btnId = 'mode' + mode.charAt(0).toUpperCase() + mode.slice(1);
  const btn = document.getElementById(btnId);
  if (btn) btn.classList.add('active');
  
  selectedPoint = null;
  highlightSelected(null);
  updateStats();
}

console.log('📦 app.js loaded completely — ready');
