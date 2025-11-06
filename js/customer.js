import {
  STORAGE_KEYS,
  loadData,
  saveData,
  bootstrapSeedIfNeeded,
  findDistanceKmFromRoutes,
  getRatePerKm,
  recomputeFinancials,
  normalizeText
} from './utils.js';

function initDestinationCombo() {
  const input = document.getElementById('destination');
  const sugg  = document.getElementById('destSuggestions');
  if (!input || !sugg) return;

  const field = input.closest('.form-group') || input.parentElement;
  if (field && getComputedStyle(field).position === 'static') {
    field.style.position = 'relative';
  }

  const routes = loadData(STORAGE_KEYS.ROUTES, []);

  const items = routes
    .map(r => (r && r.city) ? `${r.city}, ${r.country}` : null)
    .filter(Boolean);

  let activeIndex = -1;
  let filtered = [];

  function render(list) {
    sugg.innerHTML = '';
    if (!list.length) {
      sugg.hidden = true;
      activeIndex = -1;
      return;
    }
    list.forEach((text, idx) => {
      const div = document.createElement('div');
      div.className = 'combo-item';
      div.role = 'option';
      div.id = `dest-opt-${idx}`;
      div.textContent = text;

      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = text;
        sugg.hidden = true;
        activeIndex = -1;
      });

      sugg.appendChild(div);
    });
    sugg.hidden = false;
    activeIndex = -1;
  }

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const q = normalizeText(input.value);
      if (!q) {
        render(items.slice(0, 10));
      } else {
        filtered = items
          .filter(x => normalizeText(x).includes(q))
          .slice(0, 12);
        render(filtered);
      }
    }, 60);
  });

  input.addEventListener('focus', () => {
    const q = normalizeText(input.value);
    if (!q) {
      render(items.slice(0, 10));
    } else {
      filtered = items
        .filter(x => normalizeText(x).includes(q))
        .slice(0, 12);
      render(filtered);
    }
  });

  input.addEventListener('keydown', (e) => {
    const options = [...sugg.querySelectorAll('.combo-item')];
    if (sugg.hidden || !options.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % options.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + options.length) % options.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && options[activeIndex]) {
        options[activeIndex].dispatchEvent(new MouseEvent('mousedown'));
      } else {
        sugg.hidden = true;
      }
      return;
    } else if (e.key === 'Escape') {
      sugg.hidden = true;
      activeIndex = -1;
      return;
    } else {
      return;
    }

    options.forEach((el, i) =>
      el.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false')
    );

    const el = options[activeIndex];
    if (el) {
      const rect = el.getBoundingClientRect();
      const parentRect = sugg.getBoundingClientRect();
      if (rect.top < parentRect.top) el.scrollIntoView({ block: 'nearest' });
      if (rect.bottom > parentRect.bottom) el.scrollIntoView({ block: 'nearest' });
    }
  });

  document.addEventListener('click', (e) => {
    if (!sugg.hidden && !sugg.contains(e.target) && e.target !== input) {
      sugg.hidden = true;
      activeIndex = -1;
    }
  });
}


function initFileUpload() {
  const input   = document.getElementById('shipmentPhoto');
  const nameEl  = document.getElementById('fileName');
  const prevBox = document.getElementById('uploadPreview');
  const imgEl   = document.getElementById('uploadImg');

  if (!input || !nameEl || !prevBox || !imgEl) return;

  let lastURL = null;

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) {
      nameEl.textContent = 'No file selected';
      prevBox.hidden = true;
      if (lastURL) URL.revokeObjectURL(lastURL);
      lastURL = null;
      return;
    }

    const isImage  = /^image\/(png|jpe?g|webp)$/i.test(file.type);
    const isOkSize = file.size <= 3 * 1024 * 1024; // 3 MB

    if (!isImage) {
      alert('Please upload a jpg or png image.');
      input.value = '';
      return;
    }
    if (!isOkSize) {
      alert('Image must be smaller than 3 MB.');
      input.value = '';
      return;
    }

    nameEl.textContent = file.name;

    if (lastURL) URL.revokeObjectURL(lastURL);
    lastURL = URL.createObjectURL(file);
    imgEl.src = lastURL;
    prevBox.hidden = false;
  });
}


function initContainerTypes() {
  const rates = loadData(STORAGE_KEYS.RATES, []);
  if (!rates || !rates.length) return;

  const pills = document.querySelectorAll('.option-pill');
  pills.forEach(pill => {
    const input = pill.querySelector('input[type="radio"]');
    const span  = pill.querySelector('span');
    if (!input || !span) return;

    const raw = String(input.value || '').toLowerCase();  // small / medium / large
    const typeTitle = raw.charAt(0).toUpperCase() + raw.slice(1); // Small vs small

    const rate = rates.find(r => String(r.type || '').toLowerCase() === raw);
    if (rate) {
      span.textContent = `${typeTitle} (${rate.capacity_kg} kg)`;
    } else {
      span.textContent = typeTitle;
    }
  });
}


function initProductCategories() {
  const categorySelect = document.getElementById('productCategory');
  if (!categorySelect) return;

  const inventory = loadData(STORAGE_KEYS.INVENTORY, []);

  if (!inventory || !inventory.length) return;

  categorySelect.innerHTML = '';

  inventory.forEach((item) => {
    const base  = item.category ?? 'Unknown';
    const label = `${base} Blueberries`; // Fresh → Fresh Blueberries
    const option = document.createElement('option');
    option.value = label;
    option.textContent = label;
    categorySelect.appendChild(option);
  });
}


function readPhotoAsDataURL(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function estimateEtaDays(distanceKm) {
  if (!distanceKm || distanceKm <= 0) return 1;
  return Math.max(1, Math.ceil(distanceKm / 800));
}

function generateShipmentId() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substr(2, 4).toUpperCase();

  return `TW-${y}${m}${d}-${rand}`;
}


function getSelectedContainerType() {
  const checked = document.querySelector('input[name="containerSize"]:checked');
  if (!checked) return '';
  const raw = String(checked.value || '').toLowerCase(); // small
  return raw.charAt(0).toUpperCase() + raw.slice(1);    // Small
}


async function handleSubmitShipment() {
  await handleCreateShipment();

  const rawDraft = sessionStorage.getItem('PENDING_SHIPMENT');
  if (!rawDraft) {
    alert('Please calculate price first.');
    return;
  }

  const draft = JSON.parse(rawDraft);
  const shipmentId = generateShipmentId();

  const shipments = loadData(STORAGE_KEYS.SHIPMENTS, []);
  const newShipment = {
    shipment_id: shipmentId,
    status: 'Pending',
    ...draft
  };
  shipments.push(newShipment);
  saveData(STORAGE_KEYS.SHIPMENTS, shipments);

  const inventory = loadData(STORAGE_KEYS.INVENTORY, []);
  const invIndex = inventory.findIndex(
    (item) => `${item.category} Blueberries` === draft.product_category
  );
  if (invIndex >= 0) {
    const oldQty = Number(inventory[invIndex].quantity_kg || 0);
    inventory[invIndex].quantity_kg = Math.max(0, oldQty - draft.weight_kg);
    if (inventory[invIndex].quantity_kg < inventory[invIndex].min_stock) {
      inventory[invIndex].status = 'Low';
    } else {
      inventory[invIndex].status = 'OK';
    }
    saveData(STORAGE_KEYS.INVENTORY, inventory);
  }

  const fin = loadData(STORAGE_KEYS.FINANCIALS, {
    revenue: 0, expenses: 0, tax_rate: 0.2
  });
  fin.revenue = (fin.revenue || 0) + draft.price;
  saveData(STORAGE_KEYS.FINANCIALS, fin);
  recomputeFinancials();

  const card = document.getElementById('shipmentCreatedCard');
  const idText = document.getElementById('createdShipmentId');
  const copyBtn = document.getElementById('copyShipmentIdBtn');

  if (card && idText && copyBtn) {
    idText.textContent = shipmentId;
    card.hidden = false;

    copyBtn.onclick = () => {
      navigator.clipboard.writeText(shipmentId)
        .then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
        });
    };
  }

  const summaryShipmentIdEl = document.getElementById('summaryShipmentId');
  if (summaryShipmentIdEl) summaryShipmentIdEl.textContent = shipmentId;

  const form = document.querySelector('.shipment-form');
  if (form) form.reset();
  const originInput = document.getElementById('origin');
  if (originInput) originInput.value = 'Muğla';
  const smallRadio = document.querySelector('input[name="containerSize"][value="small"]');
  if (smallRadio) smallRadio.checked = true;
}

async function handleCreateShipment() {
  const destinationInput = document.getElementById('destination');
  const productNameInput = document.getElementById('productName');
  const categorySelect   = document.getElementById('productCategory');
  const weightInput      = document.getElementById('weight');
  const detailsInput     = document.getElementById('shipmentDetails');
  const photoInput       = document.getElementById('shipmentPhoto');

  const capacityAlertEl  = document.getElementById('capacityAlert');
  const summaryDistanceEl= document.getElementById('summaryDistance');
  const summaryEtaEl     = document.getElementById('summaryEta');
  const summaryPriceEl   = document.getElementById('summaryPrice');

  if (!destinationInput || !categorySelect || !weightInput) {
    alert('Required form elements are missing.');
    return;
  }

  const destination     = destinationInput.value.trim();
  const productName     = productNameInput?.value.trim() || '';
  const productCategory = categorySelect.value;
  const containerType   = getSelectedContainerType();
  const weight          = Number(weightInput.value || 0);
  const details         = detailsInput?.value.trim() || '';
  const photoFile       = photoInput?.files?.[0] || null;

  if (!Number.isFinite(weight) || weight < 1) {
    alert('Please enter a valid weight of at least 1 kg.');
    if (capacityAlertEl) capacityAlertEl.textContent = '';
    if (summaryDistanceEl) summaryDistanceEl.textContent = '—';
    if (summaryEtaEl) summaryEtaEl.textContent = '—';
    if (summaryPriceEl) summaryPriceEl.textContent = '—';
    return;
  }

  if (!destination || !containerType || !productCategory) {
    alert('Please fill in all required fields.');
    return;
  }

  const distanceKm = findDistanceKmFromRoutes(destination);
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    alert('Route not found for selected destination. Please select a city from the suggestions list.');
    if (capacityAlertEl) capacityAlertEl.textContent = '';
    if (summaryDistanceEl) summaryDistanceEl.textContent = '—';
    if (summaryEtaEl) summaryEtaEl.textContent = '—';
    if (summaryPriceEl) summaryPriceEl.textContent = '—';
    return;
  }

  const ratePerKm    = getRatePerKm(containerType);
  const price        = Number(distanceKm) * Number(ratePerKm);
  const etaDays      = estimateEtaDays(distanceKm);
  const photoDataURL = await readPhotoAsDataURL(photoFile);

  const rates = loadData(STORAGE_KEYS.RATES, []);
  const rateInfo = rates.find(
    r => String(r.type || '').toLowerCase() === containerType.toLowerCase()
  );
  
  if (rateInfo && capacityAlertEl) {
    const capacity = Number(rateInfo.capacity_kg || 0);
    if (weight > capacity) {
      capacityAlertEl.textContent =
        'There is not enough space in the selected container for this weight.';
      if (summaryDistanceEl) summaryDistanceEl.textContent = '—';
      if (summaryEtaEl) summaryEtaEl.textContent = '—';
      if (summaryPriceEl) summaryPriceEl.textContent = '—';
      return;
    } else {
      capacityAlertEl.textContent = '';
    }
  }

  const draft = {
    destination,
    product_name: productName,
    product_category: productCategory,
    container_type: containerType,
    weight_kg: weight,
    distance_km: distanceKm,
    rate_per_km: ratePerKm,
    price,
    eta_days: etaDays,
    details,
    photo_data_url: photoDataURL,
    created_at: new Date().toISOString()
  };

  sessionStorage.setItem('PENDING_SHIPMENT', JSON.stringify(draft));

  if (summaryDistanceEl) {
    summaryDistanceEl.textContent =
      `${distanceKm.toLocaleString('tr-TR')} km`;
  }
  if (summaryEtaEl) {
    summaryEtaEl.textContent =
      `${etaDays} day${etaDays > 1 ? 's' : ''}`;
  }
  if (summaryPriceEl) {
    summaryPriceEl.textContent =
      `${price.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`;
  }
}




document.addEventListener('DOMContentLoaded', () => {
  (async () => {
    await bootstrapSeedIfNeeded();

    initDestinationCombo();
    initProductCategories();
    initContainerTypes();
    initFileUpload();

    const calcBtn = document.getElementById('calculatePriceBtn');
    if (calcBtn) {
      calcBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleCreateShipment();
      });
    }

    const form = document.querySelector('.shipment-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSubmitShipment();
      });
    }
  })();
});

