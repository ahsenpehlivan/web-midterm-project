import {
  STORAGE_KEYS,
  loadData,
  saveData,
  bootstrapSeedIfNeeded,
  recomputeFinancials
} from './utils.js';

await bootstrapSeedIfNeeded();

const pendingBody      = document.getElementById('pendingShipmentsBody');
const containersBody   = document.getElementById('containersBody');
const btnOptimize      = document.getElementById('btnOptimize');

const statPendingEl    = document.getElementById('statPendingShipments');
const statContainersEl = document.getElementById('statContainers');
const statWeightEl     = document.getElementById('statTotalWeight');
const statCostEl       = document.getElementById('statTotalCost');

function fmtNumber(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}

function fmtKg(n) {
  return fmtNumber(n) + ' kg';
}

function fmtPrice(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ₺';
}

function generateContainerId() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substr(2, 3).toUpperCase();
  return `CT-${y}${m}${d}-${rand}`;
}

function getAllShipments() {
  return loadData(STORAGE_KEYS.SHIPMENTS, []) || [];
}

function getPendingShipments() {
  const all = getAllShipments();
  return all.filter(s => String(s.status || '').toLowerCase() === 'pending');
}

function getAllContainers() {
  return loadData(STORAGE_KEYS.CONTAINERS, []) || [];
}

function getRateInfoForType(containerType) {
  const rates = loadData(STORAGE_KEYS.RATES, []);
  return rates.find(
    r => String(r.type || '').toLowerCase() === String(containerType || '').toLowerCase()
  ) || null;
}

// Cost = fuel_per_km * distance + crew_cost + maintenance
function computeContainerCost(container) {
  const fleet = loadData(STORAGE_KEYS.FLEET, { ships: [], trucks: [] });
  const ship = (fleet && Array.isArray(fleet.ships) && fleet.ships.length > 0) 
    ? fleet.ships[0] 
    : null;
  
  if (!ship) return 0;

  const distance = Number(container.distance_km || 0);
  const fuelPerKm = Number(ship.fuel_per_km || 0);
  const crew = Number(ship.crew_cost || 0);
  const maint = Number(ship.maintenance || 0);

  const fuelCost = fuelPerKm * distance;
  const total = fuelCost + crew + maint;
  return Math.max(0, Math.round(total));
}

function renderPendingTable(pendingShipments) {
  if (!pendingBody) return;

  if (!pendingShipments.length) {
    pendingBody.innerHTML = `
      <tr>
        <td colspan="5" class="admin-table-empty">
          No pending shipments found.
        </td>
      </tr>
    `;
    return;
  }

  pendingBody.innerHTML = pendingShipments.map(s => `
    <tr>
      <td>${s.shipment_id}</td>
      <td>${s.destination}</td>
      <td>${s.container_type}</td>
      <td>${fmtKg(s.weight_kg)}</td>
      <td>${s.status}</td>
    </tr>
  `).join('');
}

function renderContainersTable(containers) {
  if (!containersBody) return;

  if (!containers.length) {
    containersBody.innerHTML = `
      <tr>
        <td colspan="6" class="admin-table-empty">
          No containers yet. Click “Optimize Containers”.
        </td>
      </tr>
    `;
    return;
  }

  containersBody.innerHTML = containers.map(c => `
    <tr>
      <td>${c.container_id}</td>
      <td>${c.destination}</td>
      <td>${c.container_type}</td>
      <td>${fmtKg(c.used_kg)} / ${fmtKg(c.capacity_kg)}</td>
      <td>${fmtKg(c.remaining_kg)}</td>
      <td>${fmtPrice(c.transport_cost)}</td>
    </tr>
  `).join('');
}

function renderSummary(pendingShipments, containers) {
  const pendingCount   = pendingShipments.length;
  const containerCount = containers.length;
  const totalUsedWeight = containers.reduce(
    (sum, c) => sum + (Number(c.used_kg) || 0), 0
  );
  const totalCost = containers.reduce(
    (sum, c) => sum + (Number(c.transport_cost) || 0), 0
  );

  if (statPendingEl)    statPendingEl.textContent    = fmtNumber(pendingCount);
  if (statContainersEl) statContainersEl.textContent = fmtNumber(containerCount);
  if (statWeightEl)     statWeightEl.textContent     = fmtKg(totalUsedWeight);
  if (statCostEl)       statCostEl.textContent       = fmtPrice(totalCost);
}

function optimizeContainersForPending() {
  const shipments = getAllShipments();
  const pending = shipments.filter(
    s => String(s.status || '').toLowerCase() === 'pending'
  );

  if (!pending.length) {
    alert('There are no pending shipments to optimize.');
    return {
      updatedShipments: shipments,
      newContainers: [],
    };
  }

  const groups = new Map();
  for (const s of pending) {
    const key = `${s.destination}__${s.container_type}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(s);
  }

  const createdContainers = [];

  for (const [key, groupShipments] of groups.entries()) {
    if (!groupShipments.length) continue;

    const containerType = groupShipments[0].container_type;
    const rateInfo = getRateInfoForType(containerType);
    const capacity = Number.isFinite(rateInfo?.capacity_kg) ? Number(rateInfo.capacity_kg) : 0;

    if (!capacity || capacity <= 0) {
      continue;
    }

    const sorted = [...groupShipments]
      .filter(s => {
        const w = Number(s.weight_kg);
        return Number.isFinite(w) && w > 0;
      })
      .sort(
        (a, b) => (Number(b.weight_kg) || 0) - (Number(a.weight_kg) || 0)
      );

    if (!sorted.length) continue;

    const containersForGroup = [];
    const any = groupShipments[0];
    const distanceKm = Number.isFinite(any.distance_km) ? Number(any.distance_km) : 0;

    for (const shipment of sorted) {
      const weight = Number(shipment.weight_kg);
      if (!Number.isFinite(weight) || weight <= 0 || weight > capacity) {
        continue;
      }

      let placed = false;
      for (const cont of containersForGroup) {
        const newUsed = cont.used_kg + weight;
        if (newUsed <= cont.capacity_kg) {
          cont.used_kg = newUsed;
          cont.remaining_kg = cont.capacity_kg - cont.used_kg;
          cont.shipment_ids.push(shipment.shipment_id);
          placed = true;
          break;
        }
      }

      if (!placed) {
        const newContainer = {
          container_id: generateContainerId(),
          destination: shipment.destination,
          container_type: containerType,
          capacity_kg: capacity,
          used_kg: weight,
          remaining_kg: capacity - weight,
          shipment_ids: [shipment.shipment_id],
          distance_km: distanceKm,
          transport_cost: 0,
          status: 'Ready for Transport',
          created_at: new Date().toISOString(),
        };
        containersForGroup.push(newContainer);
      }
    }

    for (const cont of containersForGroup) {
      cont.transport_cost = computeContainerCost(cont);
    }

    createdContainers.push(...containersForGroup);
  }

  const usedShipmentIds = new Set(
    createdContainers.flatMap(c => c.shipment_ids)
  );

  const updatedShipments = shipments.map(s => {
    if (usedShipmentIds.has(s.shipment_id)) {
      return { ...s, status: 'Ready for Transport' };
    }
    return s;
  });

  return {
    updatedShipments,
    newContainers: createdContainers,
  };
}

function handleClickOptimize() {
  const { updatedShipments, newContainers } = optimizeContainersForPending();

  if (!newContainers.length) {
    const allShipments = getAllShipments();
    const containers = getAllContainers();
    const pendingNow = allShipments.filter(
      s => String(s.status || '').toLowerCase() === 'pending'
    );
    renderPendingTable(pendingNow);
    renderContainersTable(containers);
    renderSummary(pendingNow, containers);
    return;
  }

  saveData(STORAGE_KEYS.SHIPMENTS, updatedShipments);

  const existingContainers = getAllContainers();
  const allContainers = [...existingContainers, ...newContainers];
  saveData(STORAGE_KEYS.CONTAINERS, allContainers);

  const totalExpenses = allContainers.reduce(
    (sum, c) => sum + (Number(c.transport_cost) || 0),
    0
  );
  const fin = loadData(STORAGE_KEYS.FINANCIALS, {
    revenue: 0,
    expenses: 0,
    tax_rate: 0.2,
  });
  fin.expenses = totalExpenses;
  saveData(STORAGE_KEYS.FINANCIALS, fin);
  recomputeFinancials();

  const pendingNow = updatedShipments.filter(
    s => String(s.status || '').toLowerCase() === 'pending'
  );
  renderPendingTable(pendingNow);
  renderContainersTable(allContainers);
  renderSummary(pendingNow, allContainers);

}

function handleClickReset() {
  if (!confirm('Are you sure you want to reset all container optimizations?')) return;

  const shipments = getAllShipments().map(s => ({
    ...s,
    status: 'Pending'
  }));
  saveData(STORAGE_KEYS.SHIPMENTS, shipments);

  saveData(STORAGE_KEYS.CONTAINERS, []);

  const fin = loadData(STORAGE_KEYS.FINANCIALS, {
    revenue: 0,
    expenses: 0,
    tax_rate: 0.2
  });
  fin.expenses = 0;
  saveData(STORAGE_KEYS.FINANCIALS, fin);
  recomputeFinancials();

  renderPendingTable(shipments);
  renderContainersTable([]);
  renderSummary(shipments, []);

  alert('Optimization data has been reset.');
}

function initAdmin() {
  const shipments = getAllShipments();
  const containers = getAllContainers();
  const pending = shipments.filter(
    s => String(s.status || '').toLowerCase() === 'pending'
  );

  renderPendingTable(pending);
  renderContainersTable(containers);
  renderSummary(pending, containers);

  if (btnOptimize) {
    btnOptimize.addEventListener('click', handleClickOptimize);
  }

  const btnReset = document.getElementById('btnReset');
  if (btnReset) {
    btnReset.addEventListener('click', handleClickReset);
  }
    const btnSystemReset = document.getElementById('btnSystemReset');
  if (btnSystemReset) {
    btnSystemReset.addEventListener('click', () => {
      resetAllData();
    });
  }
}

function computeInventoryStatus(item) {
  const qty = Number.isFinite(item.quantity_kg) ? Number(item.quantity_kg) : 0;
  const min = Number.isFinite(item.min_stock) ? Number(item.min_stock) : 0;
  return qty <= min ? 'Low' : 'OK';
}

function renderInventoryTable(items) {
  const body = document.getElementById('inventoryTableBody');
  if (!body) return;

  if (!items || !items.length) {
    body.innerHTML = `
      <tr>
        <td colspan="4" class="admin-table-empty">
          No inventory data found.
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = items.map((item) => {
    const status = computeInventoryStatus(item);
    const badgeClass = status === 'Low' ? 'inv-badge low' : 'inv-badge ok';
    const badgeText  = status === 'Low' ? 'Low ⚠️' : 'OK ✅';

    return `
      <tr>
        <td>${item.category || '—'} Blueberries</td>
        <td>${(Number(item.quantity_kg || 0)).toLocaleString('tr-TR')} kg</td>
        <td>${(Number(item.min_stock || 0)).toLocaleString('tr-TR')} kg</td>
        <td><span class="${badgeClass}">${badgeText}</span></td>
      </tr>
    `;
  }).join('');
}

function renderInventorySummary(items) {
  const totalEl = document.getElementById('invTotalKg');
  const okEl    = document.getElementById('invOkCount');
  const lowEl   = document.getElementById('invLowCount');
  const alertEl = document.getElementById('invAlerts');

  if (!totalEl && !okEl && !lowEl && !alertEl) return;

  let totalKg = 0;
  let okCount = 0;
  let lowCount = 0;

  items.forEach((item) => {
    const qty = Number.isFinite(item.quantity_kg) ? Number(item.quantity_kg) : 0;
    const status = computeInventoryStatus(item);
    totalKg += Math.max(0, qty);
    if (status === 'Low') lowCount++;
    else okCount++;
  });

  if (totalEl) totalEl.textContent = totalKg.toLocaleString('tr-TR') + ' kg';
  if (okEl)    okEl.textContent    = okCount.toString();
  if (lowEl)   lowEl.textContent   = lowCount.toString();

  if (alertEl) {
    if (!lowCount) {
      alertEl.textContent = 'All good. No low-stock items.';
      alertEl.classList.remove('has-alert');
    } else {
      const lowItems = items
        .filter((i) => computeInventoryStatus(i) === 'Low')
        .map((i) => `${i.category} blueberries`)
        .join(', ');
      alertEl.textContent =
        `${lowItems} stock running low — please restock.`;
      alertEl.classList.add('has-alert');
    }
  }
}

function fillInventoryCategorySelect(items) {
  const select = document.getElementById('invCategorySelect');
  if (!select) return;

  if (!items || !items.length) {
    select.innerHTML = `<option value="">No categories</option>`;
    return;
  }

  select.innerHTML = items.map((item) => `
    <option value="${item.category}">
      ${item.category} Blueberries
    </option>
  `).join('');
}

function initInventoryDashboard() {
  const tableBody = document.getElementById('inventoryTableBody');
  const summaryEl = document.getElementById('invTotalKg');
  if (!tableBody && !summaryEl) return;

  let inventory = loadData(STORAGE_KEYS.INVENTORY, []) || [];

  let updated = inventory.map((item) => ({
    ...item,
    status: computeInventoryStatus(item),
  }));
  saveData(STORAGE_KEYS.INVENTORY, updated);

  renderInventoryTable(updated);
  renderInventorySummary(updated);
  fillInventoryCategorySelect(updated);

  const btnAdd   = document.getElementById('btnInvAdd');
  const select   = document.getElementById('invCategorySelect');
  const amountEl = document.getElementById('invAddAmount');

  if (btnAdd && select && amountEl) {
    btnAdd.addEventListener('click', () => {
      const category = select.value;
      const delta    = Number(amountEl.value || 0);

      if (!category) {
        alert('Please select a category.');
        return;
      }
      if (!Number.isFinite(delta) || delta <= 0) {
        alert('Please enter a positive amount in kg.');
        return;
      }

      let inv = loadData(STORAGE_KEYS.INVENTORY, []) || [];
      inv = inv.map((item) => {
        if (item.category === category) {
          const current = Number(item.quantity_kg || 0);
          const newQty = Math.max(0, current + delta);
          return { ...item, quantity_kg: newQty };
        }
        return item;
      });

      const invUpdated = inv.map((item) => ({
        ...item,
        status: computeInventoryStatus(item),
      }));

      saveData(STORAGE_KEYS.INVENTORY, invUpdated);
      renderInventoryTable(invUpdated);
      renderInventorySummary(invUpdated);
      fillInventoryCategorySelect(invUpdated);

      amountEl.value = '';

      alert(`Stock updated: ${category} +${delta} kg`);
    });
  }
}

function renderFinancialSummary(fin) {
  const revEl  = document.getElementById('finRevenue');
  if (!revEl) return;

  const expEl  = document.getElementById('finExpenses');
  const netEl  = document.getElementById('finNetIncome');
  const taxEl  = document.getElementById('finTax');
  const patEl  = document.getElementById('finProfit');
  const rateEl = document.getElementById('finTaxRate');

  const revenue  = Number(fin.revenue || 0);
  const expenses = Number(fin.expenses || 0);
  const net      = Number(fin.net_income || 0);
  const tax      = Number(fin.tax || 0);
  const pat      = Number(fin.profit_after_tax || 0);
  const rate     = Number(fin.tax_rate || 0.2) * 100;

  revEl.textContent = fmtPrice(revenue);
  if (expEl)  expEl.textContent  = fmtPrice(expenses);
  if (netEl)  netEl.textContent  = fmtPrice(net);
  if (taxEl)  taxEl.textContent  = fmtPrice(tax);
  if (patEl)  patEl.textContent  = fmtPrice(pat);
  if (rateEl) rateEl.textContent =
    rate.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' %';

  if (netEl) {
    netEl.classList.toggle('fin-negative', net < 0);
    netEl.classList.toggle('fin-positive', net > 0);
  }
  if (patEl) {
    patEl.classList.toggle('fin-negative', pat < 0);
    patEl.classList.toggle('fin-positive', pat > 0);
  }

  const infoEl = document.getElementById('finInfoNote');
  if (infoEl) {
    const totalShipments = (loadData(STORAGE_KEYS.SHIPMENTS, []) || []).length;
    infoEl.textContent =
      `Based on ${totalShipments} shipment(s) and all optimized containers.`;
  }
}

function renderFinancialRevenueTable(shipments) {
  const body = document.getElementById('finRevenueBody');
  if (!body) return;

  if (!shipments.length) {
    body.innerHTML = `
      <tr>
        <td colspan="6" class="admin-table-empty">
          No shipments created yet.
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = shipments.map((sh) => `
    <tr>
      <td>${sh.shipment_id || '—'}</td>
      <td>${sh.destination || '—'}</td>
      <td>${sh.container_type || '—'}</td>
      <td>${fmtKg(sh.weight_kg)}</td>
      <td>${fmtPrice(sh.price)}</td>
      <td>${sh.status || '—'}</td>
    </tr>
  `).join('');
}

function renderFinancialExpensesTable(containers) {
  const body = document.getElementById('finExpensesBody');
  if (!body) return;

  if (!containers.length) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="admin-table-empty">
          No container expenses yet. Run “Optimize Containers” first.
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = containers.map((c) => `
    <tr>
      <td>${c.container_id || '—'}</td>
      <td>${c.destination || '—'}</td>
      <td>${c.container_type || '—'}</td>
      <td>${fmtKg(c.used_kg)} / ${fmtKg(c.capacity_kg)}</td>
      <td>${fmtPrice(c.transport_cost)}</td>
    </tr>
  `).join('');
}

function initFinancialDashboard() {
  const root = document.getElementById('finDashboardRoot');
  if (!root) return;

  const fin = recomputeFinancials();

  const shipments  = loadData(STORAGE_KEYS.SHIPMENTS, [])   || [];
  const containers = loadData(STORAGE_KEYS.CONTAINERS, [])  || [];

  renderFinancialSummary(fin);
  renderFinancialRevenueTable(shipments);
  renderFinancialExpensesTable(containers);

  const btnDownloadReport = document.getElementById('btnDownloadReport');
  if (btnDownloadReport) {
    btnDownloadReport.addEventListener('click', exportFinancialReport);
  }
}

function exportFinancialReport() {
  window.print();
}

async function resetAllData() {
  if (!confirm("⚠️ All system data will be reset to initial JSON seed. Continue?")) {
    return;
  }

  Object.values(STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });

  await bootstrapSeedIfNeeded();

  alert("✅ System data has been reset to initial seed JSON.");
  location.reload();
}

initAdmin();
initInventoryDashboard();
initFinancialDashboard();

