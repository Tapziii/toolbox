// DOM Elements
const unitToggleBtn = document.getElementById('unit-toggle');
const altitudeVal = document.getElementById('altitude-val');
const altitudeUnit = document.getElementById('altitude-unit');
const gpsIndicator = document.getElementById('gps-indicator');
const gpsStatusDot = document.getElementById('gps-status');
const gpsText = document.getElementById('gps-text');
const timerVal = document.getElementById('timer-val');
const vspeedVal = document.getElementById('vspeed-val');
const vspeedUnit = document.getElementById('vspeed-unit');
const maxAltVal = document.getElementById('max-alt-val');
const minAltVal = document.getElementById('min-alt-val');
const maxminUnits = document.querySelectorAll('.maxmin-unit');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const historyBtn = document.getElementById('history-btn');
const historyModal = document.getElementById('history-modal');
const closeHistoryBtn = document.getElementById('close-history');
const clearHistoryBtn = document.getElementById('clear-history');
const historyList = document.getElementById('history-list');
const saveModal = document.getElementById('save-modal');
const sessionNameInput = document.getElementById('session-name-input');
const saveSessionBtn = document.getElementById('save-session-btn');
const discardSessionBtn = document.getElementById('discard-session-btn');

// State Variables
let isMetric = false; // Default to Feet
let watchId = null;
let currentAltitudeMeters = null;

// Session Variables
let isSessionActive = false;
let sessionStartTime = null;
let sessionTimerInterval = null;
let maxAltitude = -Infinity;
let minAltitude = Infinity;

// V-Speed Calculation Variables
let lastAltitude = null;
let lastTimestamp = null;
let vspeedBuffer = [];

// Constants
const M_TO_FT = 3.28084;
const VSPEED_BUFFER_SIZE = 5; // Smoothing buffer for vertical speed

// Initialize App
function init() {
  setupEventListeners();
  requestGPS();
  registerServiceWorker();
}

function setupEventListeners() {
  unitToggleBtn.addEventListener('click', () => {
    isMetric = !isMetric;
    unitToggleBtn.textContent = isMetric ? 'M' : 'FT';
    altitudeUnit.textContent = isMetric ? 'M' : 'FT';
    vspeedUnit.textContent = isMetric ? 'M/S' : 'FT/M';
    maxminUnits.forEach(el => el.textContent = isMetric ? 'M' : 'FT');
    
    updateDisplay();
    if (!historyModal.classList.contains('hidden')) {
      renderHistory();
    }
  });

  startBtn.addEventListener('click', startSession);
  stopBtn.addEventListener('click', stopSession);
  
  historyBtn.addEventListener('click', openHistory);
  closeHistoryBtn.addEventListener('click', closeHistory);
  clearHistoryBtn.addEventListener('click', clearHistory);
  
  saveSessionBtn.addEventListener('click', finalizeSaveSession);
  discardSessionBtn.addEventListener('click', discardSession);
}

// GPS Logic
function requestGPS() {
  if (!navigator.geolocation) {
    updateGPSStatus('error', 'GPS not supported');
    return;
  }

  updateGPSStatus('searching', 'Acquiring GPS...');
  
  const gpsOptions = {
    enableHighAccuracy: true,
    maximumAge: 10000,
    timeout: 10000
  };
  
  // Clear any existing watch
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
  }
  
  let hasResponded = false;
  
  // Start the GPS tracker
  try {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        hasResponded = true;
        handlePosition(pos);
      },
      (err) => {
        hasResponded = true;
        handleError(err);
      },
      gpsOptions
    );
  } catch(e) {
    updateGPSStatus('error', 'Init Error: ' + e.message);
    return;
  }
  
  // Manual fallback timeout in case the browser silently hangs (common iOS bug)
  setTimeout(() => {
    if (!hasResponded) {
      updateGPSStatus('error', 'GPS Timeout (Check Phone Settings)');
    }
  }, 12000);
}

function handlePosition(position) {
  // Try to use altitude. If altitude is null, we can't do much (device lacks barometer/3D GPS)
  let alt = position.coords.altitude;
  
  if (alt === null) {
    updateGPSStatus('error', 'No altitude data');
    return;
  }

  updateGPSStatus('active', 'GPS Active');
  currentAltitudeMeters = alt;
  
  calculateVerticalSpeed(alt, position.timestamp);
  
  if (isSessionActive) {
    updateSessionStats(alt);
  }
  
  updateDisplay();
}

function handleError(error) {
  let msg = 'GPS Error';
  switch(error.code) {
    case error.PERMISSION_DENIED: msg = 'Permission Denied'; break;
    case error.POSITION_UNAVAILABLE: msg = 'Signal Lost'; break;
    case error.TIMEOUT: msg = 'GPS Timeout'; break;
  }
  updateGPSStatus('error', msg);
}

function updateGPSStatus(status, text) {
  gpsStatusDot.className = `status-dot ${status}`;
  gpsText.textContent = text;
}

// Calculations & Logic
function calculateVerticalSpeed(currentAlt, currentTimestamp) {
  if (lastAltitude !== null && lastTimestamp !== null) {
    const deltaAlt = currentAlt - lastAltitude; // in meters
    const deltaTime = (currentTimestamp - lastTimestamp) / 1000; // in seconds
    
    // Only calculate vertical speed if enough time has passed to reduce noise
    // GPS altitude fluctuates by a few meters constantly.
    if (deltaTime >= 2.0) {
      let vSpeedMetersPerSec = deltaAlt / deltaTime;
      
      // Noise gate: if vertical speed is less than 0.5 m/s (~100 ft/min), assume stationary
      if (Math.abs(vSpeedMetersPerSec) < 0.5) {
        vSpeedMetersPerSec = 0;
      }
      
      // Add to buffer for smoothing
      vspeedBuffer.push(vSpeedMetersPerSec);
      if (vspeedBuffer.length > VSPEED_BUFFER_SIZE) {
        vspeedBuffer.shift();
      }
      
      // Update last altitude/time ONLY when we compute a new V-speed
      // This creates a rolling window instead of frame-by-frame noise
      lastAltitude = currentAlt;
      lastTimestamp = currentTimestamp;
    }
  } else {
    // Initial state
    lastAltitude = currentAlt;
    lastTimestamp = currentTimestamp;
  }
}

function getSmoothedVSpeed() {
  if (vspeedBuffer.length === 0) return 0;
  const sum = vspeedBuffer.reduce((a, b) => a + b, 0);
  return sum / vspeedBuffer.length;
}

// Display Updates
function updateDisplay() {
  if (currentAltitudeMeters === null) return;
  
  // Altitude
  const altValue = isMetric ? currentAltitudeMeters : currentAltitudeMeters * M_TO_FT;
  altitudeVal.textContent = Math.round(altValue); // Complete numbers only
  
  // V-Speed
  let vSpeed = getSmoothedVSpeed();
  if (!isMetric) {
    // Meters per second to Feet per minute
    vSpeed = vSpeed * M_TO_FT * 60;
  }
  vspeedVal.textContent = Math.round(vSpeed);
  
  // Max/Min
  if (isSessionActive) {
    if (maxAltitude !== -Infinity) {
      const maxVal = isMetric ? maxAltitude : maxAltitude * M_TO_FT;
      maxAltVal.textContent = Math.round(maxVal);
    }
    if (minAltitude !== Infinity) {
      const minVal = isMetric ? minAltitude : minAltitude * M_TO_FT;
      minAltVal.textContent = Math.round(minVal);
    }
  }
}

// Session Management
function startSession() {
  isSessionActive = true;
  startBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');
  
  sessionStartTime = Date.now();
  maxAltitude = currentAltitudeMeters !== null ? currentAltitudeMeters : -Infinity;
  minAltitude = currentAltitudeMeters !== null ? currentAltitudeMeters : Infinity;
  
  sessionTimerInterval = setInterval(updateTimer, 1000);
  updateTimer();
  updateDisplay();
}

function stopSession() {
  isSessionActive = false;
  stopBtn.classList.add('hidden');
  startBtn.classList.remove('hidden');
  
  clearInterval(sessionTimerInterval);
  
  // Only prompt to save if session was long enough
  const diff = Date.now() - sessionStartTime;
  if (diff > 1000) {
    sessionNameInput.value = '';
    saveModal.classList.remove('hidden');
  }
}

function updateSessionStats(currentAlt) {
  if (currentAlt > maxAltitude) maxAltitude = currentAlt;
  if (currentAlt < minAltitude) minAltitude = currentAlt;
}

function updateTimer() {
  if (!sessionStartTime) return;
  
  const diff = Date.now() - sessionStartTime;
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  
  const hStr = hours.toString().padStart(2, '0');
  const mStr = minutes.toString().padStart(2, '0');
  const sStr = seconds.toString().padStart(2, '0');
  
  timerVal.textContent = `${hStr}:${mStr}:${sStr}`;
}

// Service Worker Registration for PWA / Offline capability
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(registration => {
          console.log('SW registered:', registration);
        })
        .catch(error => {
          console.log('SW registration failed:', error);
        });
    });
  }
}

// History Management
function finalizeSaveSession() {
  const name = sessionNameInput.value.trim() || 'Unnamed Session';
  saveSession(name);
  saveModal.classList.add('hidden');
}

function discardSession() {
  saveModal.classList.add('hidden');
}

function saveSession(name) {
  if (!sessionStartTime) return;
  
  const diff = Date.now() - sessionStartTime;
  
  const session = {
    id: Date.now().toString(),
    name: name,
    date: new Date().toLocaleString(),
    duration: diff,
    maxAltMeters: maxAltitude !== -Infinity ? maxAltitude : null,
    minAltMeters: minAltitude !== Infinity ? minAltitude : null
  };
  
  const sessions = getSessions();
  sessions.unshift(session);
  localStorage.setItem('altimeter_sessions', JSON.stringify(sessions));
}

function getSessions() {
  try {
    return JSON.parse(localStorage.getItem('altimeter_sessions')) || [];
  } catch(e) {
    return [];
  }
}

function openHistory() {
  renderHistory();
  historyModal.classList.remove('hidden');
}

function closeHistory() {
  historyModal.classList.add('hidden');
}

function clearHistory() {
  if(confirm("Are you sure you want to clear your session history?")) {
    localStorage.removeItem('altimeter_sessions');
    renderHistory();
  }
}

function deleteSession(id) {
  if(confirm("Delete this session?")) {
    let sessions = getSessions();
    sessions = sessions.filter(s => s.id !== id);
    localStorage.setItem('altimeter_sessions', JSON.stringify(sessions));
    renderHistory();
  }
}

function renderHistory() {
  const sessions = getSessions();
  historyList.innerHTML = '';
  
  if (sessions.length === 0) {
    historyList.innerHTML = '<div class="empty-state">No past sessions found.</div>';
    return;
  }
  
  sessions.forEach(s => {
    // Formatter
    const diff = s.duration;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    const hStr = hours.toString().padStart(2, '0');
    const mStr = minutes.toString().padStart(2, '0');
    const sStr = seconds.toString().padStart(2, '0');
    
    let maxStr = '--';
    let minStr = '--';
    let unit = isMetric ? 'M' : 'FT';
    
    if (s.maxAltMeters !== null) {
      maxStr = Math.round(isMetric ? s.maxAltMeters : s.maxAltMeters * M_TO_FT);
    }
    if (s.minAltMeters !== null) {
      minStr = Math.round(isMetric ? s.minAltMeters : s.minAltMeters * M_TO_FT);
    }
    
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div class="history-header">
        <div>
          <div class="history-name">${s.name || 'Unnamed Session'}</div>
          <div class="history-date">${s.date}</div>
        </div>
        <button class="delete-btn" data-id="${s.id}">🗑️</button>
      </div>
      <div class="history-stats">
        <span>⏱️ ${hStr}:${mStr}:${sStr}</span>
        <span>🔼 ${maxStr} ${unit}</span>
        <span>🔽 ${minStr} ${unit}</span>
      </div>
    `;
    
    // Attach delete listener
    const deleteBtn = div.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', () => {
      deleteSession(s.id);
    });
    
    historyList.appendChild(div);
  });
}

// Start everything
init();
