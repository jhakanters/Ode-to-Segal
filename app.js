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
const U_WINDOW_DOOR = 1.1;   // Table 6 Bilaga 2
const U_ROOF = 0.13;         // Table 6 Bilaga 2 (assumed)
const U_FLOOR = 0.15;        // Table 6 Bilaga 2 (assumed)
const HOT_WATER_KWH_M2 = 20; // Table 2 Bilaga 1 (en-/tvåbostadshus)
const INTERNAL_GAINS_W_M2 = 3.7; // Table 2 Bilaga 1
const VENT_FLOW_L_S_M2 = 0.35;  // Table 2 Bilaga 1
const HEATING_SEASON_H = 6500;  // Assumption, disclosed
const DH_BASE_KH = 88000;       // Degree-hours at Fgeo=1.0 (approximation)
const GAINS_UTILIZATION = 0.8;  // Assumption, disclosed
const AIR_HC_W_S_PER_L_K = 1.2; // rho*cp ≈ 1200 J/(m³ K) = 1.2 W·s/(L·K)

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

// Heating systems: (carrier weight w, system efficiency eta)
// Weights from BFS 2026:9 Table 1 Bilaga 1
const HEATING_SYSTEMS = {
  "electric":   { label: "Electric resistance", w: 1.8, eta: 1.0 },
  "heatpump":   { label: "Heat pump (COP 3.0)", w: 1.8, eta: 3.0 },
  "district":   { label: "District heating",    w: 0.7, eta: 0.95 },
  "biofuel":    { label: "Biofuel boiler",      w: 0.6, eta: 0.85 }
};

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
// Bounding box of all walls (footprint) — accurate for rectangular plans
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

function getWallLengthM(wall) {
  const dx = Math.abs(wall.pointA.col - wall.pointB.col) * MODULE_SIZE;
  const dy = Math.abs(wall.pointA.row - wall.pointB.row) * MODULE_SIZE;
  return Math.hypot(dx, dy) / 1000;
}

// Builds the full envelope model used by both Um and Etal
// Returns: { HT (W/K), envelopeArea (m²), floorArea (m²),
//           openingArea (m²), wallUA, roofUA, floorUA, openingUA }
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
    thisOpArea = Math.min(thisOpArea, gross); // safety
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
// All simplifications disclosed in the UI disclaimer.
function estimateEtal(model, fgeo, systemKey, hrFactor) {
  const sys = HEATING_SYSTEMS[systemKey] || HEATING_SYSTEMS.heatpump;
  const A = model.floorArea;
  
  // Degree-hours for the location (approximation)
  const DH = DH_BASE_KH * fgeo; // Kh (kWh-equivalent: W/K * Kh = Wh... see below)
  
  // Ventilation heat loss coefficient (W/K)
  const Hv = VENT_FLOW_L_S_M2 * AIR_HC_W_S_PER_L_K * (1 - hrFactor) * A;
  const HTot = model.HT + Hv; // W/K
  
  // Gross heating demand (kWh): W/K * Kh = Wh → /1000
  let heating_kWh = (HTot * DH) / 1000;
  
  // Usable internal gains over the heating season (kWh)
  const gains_kWh = (GAINS_UTILIZATION * INTERNAL_GAINS_W_M2 * A * HEATING_SEASON_H) / 1000;
  heating_kWh = Math.max(0, heating_kWh - gains_kWh);
  
  // Delivered energy (heating + hot water), then primary-weighted
  const deliveredHeat_kWh = heating_kWh / sys.eta;
  const deliveredHW_kWh = (HOT_WATER_KWH_M2 * A) / sys.eta;
  const weighted_kWh = (deliveredHeat_kWh + deliveredHW_kWh) * sys.w;
  
  const etal = weighted_kWh / A;
  
  return {
    etal: etal,
    heating_kWh: heating_kWh,
    deliveredHeat_kWh: deliveredHeat_kWh,
    deliveredHW_kWh: deliveredHW_kWh,
    weighted_kWh: weighted_kWh,
    DH: DH,
    Hv: Hv,
    systemLabel: sys.label
  };
}

// Etal limit for new near-zero-energy buildings (Table 1 Bilaga 2)
function etalLimit(atemp, fgeo) {
  if (atemp < 90)       return 20 + 80 * fgeo;
  if (atemp < 130)      return 19 + 76 * fgeo;
  return 18 + 72 * fgeo;
}

// ========== COMPLIANCE CHECK ==========
function checkCompliance() {
  const locationName = document.getElementById('locationSelect').value;
  const buildingType = document.getElementById('buildingType').value;
  const systemKey = document.getElementById('heatingSystem').value;
  const hrFactor = parseFloat(document.getElementById('heatRecovery').value);
  
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
  
  // --- Um check (2 kap. 4 §, Table 4 Bilaga 2) ---
  const um = model.HT / model.envelopeArea;
  const umLimit = isSingleStory ? 0.30 : 0.40;
  const umOK = um <= umLimit;
  
  // --- Etal estimate (2 kap. 3 §, Table 1 Bilaga 2) ---
  const etalRes = estimateEtal(model, fgeo, systemKey, hrFactor);
  const etalLim = etalLimit(model.floorArea, fgeo);
  const etalOK = etalRes.etal <= etalLim;
  
  // --- Overall status ---
  const statusDiv = document.getElementById('complianceStatus');
  if (umOK && etalOK) {
    statusDiv.className = 'compliance-status pass';
    statusDiv.textContent = '✅ Indicative PASS — Um ' + um.toFixed(2) + ' ≤ ' +
      umLimit.toFixed(2) + ' W/m²K and estimated Etal ' + etalRes.etal.toFixed(0) +
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
  
  // --- Table ---
  const tbody = document.getElementById('complianceTableBody');
  tbody.innerHTML = '';
  
  const addRow = (param, value, limit, state) => {
    // state: 'pass' | 'fail' | 'info'
    const tr = document.createElement('tr');
    tr.className = state;
    tr.innerHTML =
      '<td>' + param + '</td><td>' + value + '</td><td>' + limit +
      '</td><td>' + (state === 'pass' ? '✅' : state === 'fail' ? '❌' : '—') + '</td>';
    tbody.appendChild(tr);
  };
  
  addRow('Atemp (temperate floor area)', model.floorArea.toFixed(1) + ' m²',
         '≥ 50 m² (1 kap. 3 §)', model.floorArea >= 50 ? 'pass' : 'fail');
  addRow('Um (2 kap. 4 §)', um.toFixed(3) + ' W/m²K',
         '≤ ' + umLimit.toFixed(2) + ' W/m²K', umOK ? 'pass' : 'fail');
  addRow('Etal estimate (2 kap. 3 §)', etalRes.etal.toFixed(0) + ' kWh/m²·yr',
         '≤ ' + etalLim.toFixed(0) + ' kWh/m²·yr', etalOK ? 'pass' : 'fail');
  addRow('Wall U-value (Table 6 Bil. 2)', document.getElementById('insulationLevel').value + ' W/m²K',
         '≤ 0.18 W/m²K (guideline)',
         parseFloat(document.getElementById('insulationLevel').value) <= 0.18 ? 'pass' : 'fail');
  addRow('Geographic factor Fgeo', fgeo.toFixed(1),
         (DH_BASE_KH * fgeo / 1000).toFixed(0) + ' MWh/K·yr climate approx.', 'info');
  
  // --- Etal breakdown ---
  const bd = document.getElementById('etalBreakdown');
  bd.innerHTML =
    '<strong>Etal breakdown (' + locationName + ', ' + etalRes.systemLabel +
    ', heat recovery ' + Math.round(hrFactor * 100) + '%):</strong><ul>' +
    '<li>Heat loss coefficient incl. ventilation: ' + (model.HT + etalRes.Hv).toFixed(0) + ' W/K</li>' +
    '<li>Degree-hours: ' + Math.round(etalRes.DH).toLocaleString('en-US') + ' Kh (approx.)</li>' +
    '<li>Space heating demand: ' + etalRes.heating_kWh.toFixed(0) + ' kWh/yr</li>' +
    '<li>Delivered heating: ' + etalRes.deliveredHeat
