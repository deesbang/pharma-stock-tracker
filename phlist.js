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

  function injectResetBaseDateButton() {
    const headerActions = document.querySelector('.app-header .header-actions');
    if (!headerActions || document.getElementById('reset-base-date')) return;

    const btn = document.createElement('button');
    btn.id = 'reset-base-date';
    btn.className = 'icon-btn';
    btn.title = 'Reset Base Date';
    btn.setAttribute('aria-label', 'Reset base date for daily stock reduction calculation');
    btn.innerHTML = '<i class="fas fa-undo"></i>';

    // Insert before the Add Medication button (preserves exact position of all existing elements)
    const addBtn = els.addBtn;
    if (addBtn && addBtn.parentNode === headerActions) {
      headerActions.insertBefore(btn, addBtn);
    } else {
      headerActions.appendChild(btn);
    }

    // Wire click handler (the guard in setupEventListeners will also attach if present — harmless)
    btn.addEventListener('click', resetBaseDate);
  }

  // ==========================================
  // Daily Reduction System (Base Date)
  // ==========================================
  function normalizeToStartOfDay(d) {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  let BASE_DATE = localStorage.getItem('pharma_baseDate')
    ? normalizeToStartOfDay(localStorage.getItem('pharma_baseDate'))
    : normalizeToStartOfDay(new Date());

  function getDaysPassed() {
    const today = normalizeToStartOfDay(new Date());
    const base = normalizeToStartOfDay(BASE_DATE);
    const diffTime = today.getTime() - base.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }

  function resetBaseDate() {
    BASE_DATE = normalizeToStartOfDay(new Date());
    localStorage.setItem('pharma_baseDate', BASE_DATE.toISOString());
    renderAll();
    showToast("Base date reset to today");
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
  function changeStock(id, delta) {
    medsCollection.doc(id).update({
      adjustment: firebase.firestore.FieldValue.increment(delta)
    }).then(() => {
      showToast(delta > 0 ? `+${delta} units` : `${Math.abs(delta)} dispensed`);
    });
  }

  function restockMedication(id, amount = 30) {
    medsCollection.doc(id).update({
      adjustment: firebase.firestore.FieldValue.increment(amount)
    }).then(() => showToast(`+${amount} restocked`));
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
  // Initialization
  // ==========================================
  function init() {
    injectResetBaseDateButton();
    loadFromFirestore();
    setupTTS();
    setupEventListeners();

    updateCurrentDate();

    // Theme
    const savedTheme = localStorage.getItem('pharma_theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    els.themeLabel.textContent = savedTheme === 'light' ? 'Dark Mode' : 'Light Mode';

    console.log('%c[PharmaStock] Full version with Firebase + Daily Reduction initialized', 'color:#0ea47a');
  }

  init();
});