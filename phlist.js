// ============================================
// PharmaStock - Full Version with Firebase + Daily Reduction
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  const els = {
    grid: document.getElementById('med-grid'),
    empty: document.getElementById('empty-state'),
    search: document.getElementById('search-input'),
    clearSearch: document.getElementById('clear-search'),
    categoryFilter: document.getElementById('category-filter'),
    viewGrid: document.getElementById('view-grid'),
    viewList: document.getElementById('view-list'),
    statMeds: document.getElementById('stat-total-meds'),
    statStock: document.getElementById('stat-total-stock'),
    statLow: document.getElementById('stat-low'),
    statCritical: document.getElementById('stat-critical'),
    currentDate: document.getElementById('current-date'),
    sidebar: document.getElementById('sidebar'),
    sidebarToggle: document.getElementById('sidebar-toggle'),
    sidebarClose: document.getElementById('sidebar-close'),
    themeToggle: document.getElementById('theme-toggle'),
    themeLabel: document.getElementById('theme-label'),
    resetAll: document.getElementById('reset-all'),
    ttsVoice: document.getElementById('tts-voice'),
    ttsRate: document.getElementById('tts-rate'),
    ttsPitch: document.getElementById('tts-pitch'),
    ttsVolume: document.getElementById('tts-volume'),
    ttsRateVal: document.getElementById('tts-rate-val'),
    ttsPitchVal: document.getElementById('tts-pitch-val'),
    ttsVolumeVal: document.getElementById('tts-volume-val'),
    ttsTest: document.getElementById('tts-test'),
    addBtn: document.getElementById('add-med-btn'),
    emptyAddBtn: document.getElementById('empty-add-btn'),
    modal: document.getElementById('med-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalClose: document.getElementById('modal-close'),
    modalCancel: document.getElementById('modal-cancel'),
    modalSave: document.getElementById('modal-save'),
    fName: document.getElementById('med-name'),
    fCategory: document.getElementById('med-category'),
    fInitial: document.getElementById('med-initial'),
    fDaily: document.getElementById('med-daily'),
    fDosage: document.getElementById('med-dosage'),
    fDesc: document.getElementById('med-description'),
    fUses: document.getElementById('med-uses'),
  };

  const db = firebase.firestore();
  const medsCollection = db.collection('medications');

  let meds = [];
  let currentFilter = { search: '', category: '' };
  let currentView = 'grid';

  function injectHeaderButtons() {
    const headerActions = document.querySelector('.app-header .header-actions');
    if (!headerActions) return;

    // Reset Base Date button
    if (!document.getElementById('reset-base-date')) {
      const resetBtn = document.createElement('button');
      resetBtn.id = 'reset-base-date';
      resetBtn.className = 'icon-btn';
      resetBtn.title = 'Reset Base Date';
      resetBtn.setAttribute('aria-label', 'Reset base date for daily stock reduction calculation');
      resetBtn.innerHTML = '<i class="fas fa-undo"></i>';

      const addBtn = els.addBtn;
      if (addBtn && addBtn.parentNode === headerActions) {
        headerActions.insertBefore(resetBtn, addBtn);
      } else {
        headerActions.appendChild(resetBtn);
      }
      resetBtn.addEventListener('click', resetBaseDate);
    }

    // Global History / Activity Log button
    if (!document.getElementById('global-history-btn')) {
      const historyBtn = document.createElement('button');
      historyBtn.id = 'global-history-btn';
      historyBtn.className = 'icon-btn';
      historyBtn.title = 'Activity Log';
      historyBtn.setAttribute('aria-label', 'View stock change history log');
      historyBtn.innerHTML = '<i class="fas fa-history"></i>';

      const resetBtn = document.getElementById('reset-base-date');
      if (resetBtn && resetBtn.parentNode === headerActions) {
        headerActions.insertBefore(historyBtn, resetBtn);
      } else {
        const addBtn = els.addBtn;
        if (addBtn && addBtn.parentNode === headerActions) {
          headerActions.insertBefore(historyBtn, addBtn);
        } else {
          headerActions.appendChild(historyBtn);
        }
      }

      historyBtn.addEventListener('click', showGlobalHistory);
    }
  }

  // ==========================================
  // Daily Reduction System (Base Date) - Now Global via Firestore
  // ==========================================
  function normalizeToStartOfDay(d) {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  // Global base date loaded from Firestore (settings/baseDate)
  // This makes the daily reduction calculation consistent across all devices
  let globalBaseDate = null;

  function getDaysPassed() {
    const base = globalBaseDate || normalizeToStartOfDay(new Date());
    const today = normalizeToStartOfDay(new Date());
    const diffTime = today.getTime() - base.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }

  function listenToGlobalBaseDate() {
    db.collection('settings').doc('baseDate').onSnapshot((doc) => {
      if (doc.exists && doc.data().date) {
        const raw = doc.data().date;
        globalBaseDate = normalizeToStartOfDay(raw.toDate ? raw.toDate() : raw);
      } else {
        // No global base date set yet — default to today (will be set on first reset)
        globalBaseDate = normalizeToStartOfDay(new Date());
      }
      // Re-render so all devices see updated stock numbers immediately
      renderAll();
    }, (error) => {
      console.error("Error listening to global base date:", error);
    });
  }

  function resetBaseDate() {
    const newDate = normalizeToStartOfDay(new Date());

    db.collection('settings').doc('baseDate').set({
      date: firebase.firestore.Timestamp.fromDate(newDate)
    }).then(() => {
      showToast("Base date reset to today (synced across all devices)");
    }).catch((err) => {
      console.error("Failed to reset global base date:", err);
      showToast("Failed to reset base date");
    });
  }

  // ==========================================
  // Firebase Real-time Loading
  // ==========================================
  function loadFromFirestore() {
    medsCollection.onSnapshot((snapshot) => {
      meds = [];
      snapshot.forEach(doc => {
        meds.push({ id: doc.id, ...doc.data() });
      });
      renderAll();
    });
  }

  // ==========================================
  // Stock Calculation (with daily reduction)
  // ==========================================
function getEffectiveStock(med) {
  const days = getDaysPassed();
  const reduction = Number(med.dailyReduction) || 0;
  const base = Number(med.initialCount) || 0;
  const adj = Number(med.adjustment) || 0;
  return Math.max(0, base - (days * reduction) + adj);
}

  function getPercentRemaining(med) {
    return Math.max(0, Math.min(100, Math.round((getEffectiveStock(med) / med.initialCount) * 100)));
  }

  function getDaysLeftEstimate(med) {
    if (!med.dailyReduction || med.dailyReduction <= 0) return Infinity;
    return Math.floor(getEffectiveStock(med) / med.dailyReduction);
  }

  function getStockStatus(med) {
    const stock = getEffectiveStock(med);
    if (stock < 10) return 'critical';
    if (stock < 20) return 'low';
    return 'good';
  }

  // ==========================================
  // Stats & Rendering
  // ==========================================
  function updateStats() {
    let totalUnits = 0, low = 0, critical = 0;
    meds.forEach(med => {
      const stock = getEffectiveStock(med);
      totalUnits += stock;
      const status = getStockStatus(med);
      if (status === 'critical') critical++;
      else if (status === 'low') low++;
    });
    els.statMeds.textContent = meds.length;
    els.statStock.textContent = totalUnits.toLocaleString();
    els.statLow.textContent = low;
    els.statCritical.textContent = critical;
  }

  function updateCurrentDate() {
    if (!els.currentDate) return;
    const today = new Date();
    els.currentDate.textContent = today.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  function renderAll() {
    updateCurrentDate();
    renderCategoryFilterOptions();
    renderGrid();
    updateStats();

    // Trigger critical stock notifications (if permission granted)
    checkAndNotifyCriticalStock();
  }

  function renderCategoryFilterOptions() {
    const select = els.categoryFilter;
    if (!select) return;
    const current = select.value;
    const categories = [...new Set(meds.map(m => m.category))].sort();
    select.innerHTML = '<option value="">All Categories</option>';
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat; opt.textContent = cat;
      select.appendChild(opt);
    });
    select.value = current;
  }

  function renderGrid(filtered = null) {
    const toShow = filtered || filterMeds();
    els.grid.innerHTML = '';

    if (toShow.length === 0) {
      els.empty.style.display = 'block';
      els.grid.style.display = 'none';
      return;
    }
    els.empty.style.display = 'none';
    els.grid.style.display = 'grid';

    toShow.forEach(med => {
      const stock = getEffectiveStock(med);
      const pct = getPercentRemaining(med);
      const daysLeft = getDaysLeftEstimate(med);
      const status = getStockStatus(med);
      const isCritical = status === 'critical';
      const restockAmount = (med.name || '').toLowerCase() === 'nexium' ? 28 : 30;

      const card = document.createElement('div');
      card.className = `med-card ${status}`;
      card.dataset.id = med.id;

      card.innerHTML = `
        <div class="med-header">
          <h3 class="med-name">${med.name}</h3>
          <span class="med-category">${med.category}</span>
        </div>
        <div class="stock-visual">
          <div class="stock-number" style="color: ${isCritical ? 'var(--danger)' : 'var(--primary)'}">${stock}</div>
          <div class="stock-meta">
            <div class="stock-bar"><div class="stock-fill" style="width: ${pct}%"></div></div>
            <div class="stock-details">
              <span>${pct}% remaining</span>
              <span class="days-left">${daysLeft === Infinity ? '—' : daysLeft + ' days left'}</span>
            </div>
          </div>
        </div>
        <div class="med-body">${med.description || ''}</div>
        <div class="med-meta">
          <span class="meta-pill">${med.manufacturer}</span>
          <span class="meta-pill">${med.commonDosage}</span>
        </div>
        <div class="med-actions">
          <div class="stock-controls">
            <button data-action="minus" data-id="${med.id}">−</button>
            <span class="current-val">${stock}</span>
            <button data-action="plus" data-id="${med.id}">+</button>
            <button class="restock-btn" data-action="restock" data-id="${med.id}" data-amount="${restockAmount}">+${restockAmount}</button>
          </div>
          <button class="gbtn sm" data-action="speak" data-id="${med.id}"><i class="fas fa-volume-up"></i></button>
        </div>
      `;
      attachCardListeners(card, med);
      els.grid.appendChild(card);
    });
  }

  function attachCardListeners(card, med) {
    // Action buttons - stop propagation so card click doesn't fire
    card.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopImmediatePropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if (action === 'plus') changeStock(id, +1);
        else if (action === 'minus') changeStock(id, -1);
        else if (action === 'restock') {
          const amount = parseInt(btn.dataset.amount) || 30;
          restockMedication(id, amount);
        }
        else if (action === 'speak') speakMed(med);
      });
    });

    // Clicking anywhere on the card opens the history log
    card.addEventListener('click', () => {
      showHistoryForMed(med.id, med.name);
    });
    card.style.cursor = 'pointer';
  }

  function filterMeds() {
    const q = currentFilter.search.toLowerCase().trim();
    const cat = currentFilter.category;
    return meds.filter(m => {
      const matchSearch = !q || m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q);
      const matchCat = !cat || m.category === cat;
      return matchSearch && matchCat;
    });
  }

  function applyFilters() {
    renderGrid(filterMeds());
  }

  // ==========================================
  // Stock Updates (Firebase)
  // ==========================================
  function logStockChange(medId, type, amount) {
    const med = meds.find(m => m.id === medId);
    if (!med) return;

    db.collection('stockHistory').add({
      medId: medId,
      medName: med.name || 'Unknown',
      type: type,                    // 'dispense' | 'restock'
      amount: amount,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => {
      console.warn('[History] Failed to log stock change:', err);
    });
  }

  function changeStock(id, delta) {
    medsCollection.doc(id).update({
      adjustment: firebase.firestore.FieldValue.increment(delta)
    }).then(() => {
      logStockChange(id, delta > 0 ? 'restock' : 'dispense', delta);
      showToast(delta > 0 ? `+${delta} units` : `${Math.abs(delta)} dispensed`);
    });
  }

  function restockMedication(id, amount = 30) {
    medsCollection.doc(id).update({
      adjustment: firebase.firestore.FieldValue.increment(amount)
    }).then(() => {
      logStockChange(id, 'restock', amount);
      showToast(`+${amount} restocked`);
    });
  }

  // ==========================================
  // History Logging & Viewing
  // ==========================================
  async function fetchMedHistory(medId, limit = 100) {
    try {
      const snapshot = await db.collection('stockHistory')
        .where('medId', '==', medId)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (err) {
      console.error('Failed to fetch history:', err);
      return [];
    }
  }

  function formatHistoryTimestamp(ts) {
    if (!ts) return 'Unknown time';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function createHistoryModal(medId, medName, historyItems) {
    // Remove any existing modal
    const existing = document.getElementById('history-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'history-modal';
    modal.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.65);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999; padding: 20px;
    `;

    const content = document.createElement('div');
    content.className = 'glass-card';
    content.style.cssText = `
      width: 100%; max-width: 620px; max-height: 80vh;
      overflow: hidden; display: flex; flex-direction: column;
      border-radius: 16px;
    `;

    let html = `
      <div style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:13px; opacity:0.7;">History Log</div>
          <div style="font-size:18px; font-weight:600;">${medName}</div>
        </div>
        <button id="history-close" class="icon-btn" style="font-size:20px;">&times;</button>
      </div>
      <div style="flex:1; overflow:auto; padding: 8px 0;">
    `;

    if (!historyItems || historyItems.length === 0) {
      html += `
        <div style="padding: 40px 20px; text-align:center; opacity:0.6;">
          No history yet for this medication.<br>
          <small>Changes will appear here automatically.</small>
        </div>
      `;
    } else {
      html += '<div style="padding: 0 16px;">';
      historyItems.forEach(item => {
        const isRestock = item.type === 'restock';
        const sign = isRestock ? '+' : '';
        const color = isRestock ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)';

        html += `
          <div style="display:flex; justify-content:space-between; padding:12px 8px; border-bottom:1px solid rgba(255,255,255,0.08);">
            <div>
              <div style="font-weight:500; color:${color};">
                ${isRestock ? 'Restocked' : 'Dispensed'} 
                <span style="font-weight:600;">${sign}${item.amount}</span>
              </div>
              <div style="font-size:12px; opacity:0.6; margin-top:2px;">
                ${formatHistoryTimestamp(item.timestamp)}
              </div>
            </div>
            <div style="font-size:13px; opacity:0.5; align-self:center;">
              ${item.type}
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    html += '</div>';

    // Footer
    html += `
      <div style="padding:12px 20px; border-top:1px solid rgba(255,255,255,0.1); display:flex; gap:8px; justify-content:flex-end;">
        <button id="history-close-btn" class="gbtn ghost">Close</button>
      </div>
    `;

    content.innerHTML = html;
    modal.appendChild(content);
    document.body.appendChild(modal);

    // Close handlers
    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
    content.querySelector('#history-close')?.addEventListener('click', close);
    content.querySelector('#history-close-btn')?.addEventListener('click', close);
  }

  async function showHistoryForMed(medId, medName) {
    showToast(`Loading history for ${medName}...`, 900);

    const history = await fetchMedHistory(medId);
    createHistoryModal(medId, medName, history);
  }

  // --- Global recent activity ---
  async function fetchRecentHistory(limit = 40) {
    try {
      const snapshot = await db.collection('stockHistory')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (err) {
      console.error('Failed to fetch recent history:', err);
      return [];
    }
  }

  function createGlobalHistoryModal(historyItems) {
    const existing = document.getElementById('history-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'history-modal';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;`;

    const content = document.createElement('div');
    content.className = 'glass-card';
    content.style.cssText = `width:100%;max-width:680px;max-height:82vh;overflow:hidden;display:flex;flex-direction:column;border-radius:16px;`;

    let html = `
      <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:18px;font-weight:600;">Recent Activity Log</div>
        <button id="history-close" class="icon-btn" style="font-size:22px;">&times;</button>
      </div>
      <div style="flex:1;overflow:auto;padding:4px 0;">
    `;

    if (!historyItems.length) {
      html += `<div style="padding:50px 20px;text-align:center;opacity:0.6;">No activity logged yet.</div>`;
    } else {
      html += `<div style="padding:0 16px;">`;
      historyItems.forEach(item => {
        const isRestock = item.type === 'restock';
        const color = isRestock ? '#22c55e' : '#f87171';
        const sign = isRestock ? '+' : '';

        html += `
          <div style="display:flex;justify-content:space-between;gap:12px;padding:11px 8px;border-bottom:1px solid rgba(255,255,255,0.07);">
            <div style="min-width:0;">
              <div style="font-weight:500;">${item.medName || 'Unknown'}</div>
              <div style="font-size:12px;opacity:0.55;margin-top:1px;">${formatHistoryTimestamp(item.timestamp)}</div>
            </div>
            <div style="text-align:right;white-space:nowrap;">
              <div style="color:${color};font-weight:600;">
                ${isRestock ? 'Restocked' : 'Dispensed'} ${sign}${item.amount}
              </div>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    html += `</div>
      <div style="padding:12px 20px;border-top:1px solid rgba(255,255,255,0.1);text-align:right;">
        <button id="history-close-btn" class="gbtn ghost">Close</button>
      </div>`;

    content.innerHTML = html;
    modal.appendChild(content);
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    content.querySelector('#history-close')?.addEventListener('click', close);
    content.querySelector('#history-close-btn')?.addEventListener('click', close);
  }

  async function showGlobalHistory() {
    showToast('Loading recent activity...', 800);
    const recent = await fetchRecentHistory(40);
    createGlobalHistoryModal(recent);
  }

  // ==========================================
  // TTS
  // ==========================================
  function setupTTS() {
    if (els.ttsTest) {
      els.ttsTest.addEventListener('click', () => {
        const utterance = new SpeechSynthesisUtterance("This is a test of the pharmaceutical stock tracker.");
        speechSynthesis.speak(utterance);
      });
    }
  }

  function speakMed(med) {
    const text = `${med.name}. Current stock: ${getEffectiveStock(med)} units remaining.`;
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  // ==========================================
  // Event Listeners
  // ==========================================
  function setupEventListeners() {
    els.search?.addEventListener('input', () => {
      currentFilter.search = els.search.value;
      applyFilters();
    });

    els.themeToggle?.addEventListener('click', () => {
      const current = document.body.getAttribute('data-theme') || 'light';
      const next = current === 'light' ? 'dark' : 'light';
      document.body.setAttribute('data-theme', next);
      els.themeLabel.textContent = next === 'light' ? 'Dark Mode' : 'Light Mode';
      localStorage.setItem('pharma_theme', next);
    });

    els.sidebarToggle?.addEventListener('click', () => els.sidebar.classList.add('open'));
    els.sidebarClose?.addEventListener('click', () => els.sidebar.classList.remove('open'));

    // Enable critical stock notifications
    els.enableNotifications = document.getElementById('enable-notifications');
    els.enableNotifications?.addEventListener('click', async () => {
      const granted = await requestNotificationPermission();
      if (granted) {
        showToast('Critical stock alerts enabled!');
        els.enableNotifications.style.opacity = '0.5';
        els.enableNotifications.textContent = 'Critical Alerts Enabled';
      } else {
        showToast('Notification permission denied');
      }
    });

    els.addBtn?.addEventListener('click', () => alert("Add Medication feature coming soon!"));

    // Add Reset Base Date button functionality
    const resetDateBtn = document.getElementById('reset-base-date');
    if (resetDateBtn) {
      resetDateBtn.addEventListener('click', resetBaseDate);
    }
  }

  function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  }

  // ==========================================
  // PWA Install + Notifications (Critical Stock)
  // ==========================================
  let deferredPrompt;

  // Handle PWA install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('[PWA] Install prompt available');

    // Optional: Show an install button in the UI
    showInstallButton();
  });

  function showInstallButton() {
    // Inject a subtle install button in the header if possible
    const headerActions = document.querySelector('.app-header .header-actions');
    if (!headerActions || document.getElementById('install-app-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'install-app-btn';
    btn.className = 'icon-btn';
    btn.title = 'Install PharmaStock App';
    btn.innerHTML = '<i class="fas fa-download"></i>';

    const historyBtn = document.getElementById('global-history-btn');
    if (historyBtn) {
      headerActions.insertBefore(btn, historyBtn);
    } else {
      headerActions.appendChild(btn);
    }

    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] User install choice:', outcome);
      btn.remove();
      deferredPrompt = null;
    });
  }

  // Request notification permission + send critical alert
  async function requestNotificationPermission() {
    if (!('Notification' in window)) {
      alert('This browser does not support desktop notifications');
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  function notifyCriticalStock(med) {
    if (Notification.permission !== 'granted') return;

    const title = `⚠️ Critical Stock: ${med.name}`;
    const body = `Only ${getEffectiveStock(med)} units remaining. Immediate attention needed.`;

    try {
      new Notification(title, {
        body,
        icon: 'icons/icon-192.png',
        tag: `critical-${med.id}`,
        requireInteraction: false
      });
    } catch (err) {
      console.warn('Notification failed:', err);
    }
  }

  // Check for newly critical items and notify
  let previousCriticalIds = new Set();

  function checkAndNotifyCriticalStock() {
    if (Notification.permission !== 'granted') return;

    const currentlyCritical = meds.filter(m => getStockStatus(m) === 'critical');

    currentlyCritical.forEach(med => {
      if (!previousCriticalIds.has(med.id)) {
        notifyCriticalStock(med);
        previousCriticalIds.add(med.id);
      }
    });

    // Remove meds that are no longer critical
    previousCriticalIds = new Set(
      [...previousCriticalIds].filter(id => 
        currentlyCritical.some(m => m.id === id)
      )
    );
  }

  // ==========================================
  // Initialization
  // ==========================================
  function init() {
    injectHeaderButtons();

    // Start listening to the global base date (this makes daily reduction consistent across devices)
    listenToGlobalBaseDate();

    // Register Service Worker (required for PWA install + future push notifications)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('[PWA] Service Worker registered', reg.scope))
        .catch(err => console.warn('[PWA] Service Worker registration failed:', err));
    }

    loadFromFirestore();
    setupTTS();
    setupEventListeners();

    updateCurrentDate();

    // Theme
    const savedTheme = localStorage.getItem('pharma_theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    els.themeLabel.textContent = savedTheme === 'light' ? 'Dark Mode' : 'Light Mode';

    // Optionally prompt for notifications (user can also trigger manually)
    setTimeout(() => {
      if (Notification.permission === 'default') {
        console.log('[Notifications] User has not yet decided on notifications');
      }
    }, 8000);

    console.log('%c[PharmaStock] Full version with Firebase + Daily Reduction initialized', 'color:#0ea47a');
  }

  init();
});