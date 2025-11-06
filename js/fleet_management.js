// js/fleet_management.js

import {
  STORAGE_KEYS,
  loadData,
  saveData,
  bootstrapSeedIfNeeded,
  recomputeFinancials
} from './utils.js';

function fmtCurrency(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ₺';
}

function fmtKg(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('tr-TR') + ' kg';
}

function fmtKm(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('tr-TR') + ' km';
}

// Masraf formülleri
function calcTruckExpense(truck, distanceKm) {
  if (!truck || !distanceKm || distanceKm <= 0) return 0;

  const fuelPerKm = Number(truck.fuel_per_km ?? 0);
  const driver    = Number(truck.driver_cost ?? 0);
  const maint     = Number(truck.maintenance ?? 0);

  return fuelPerKm * distanceKm + driver + maint;
}

function calcShipExpense(ship, distanceKm) {
  if (!ship || !distanceKm || distanceKm <= 0) return 0;

  const fuelPerKm = Number(ship.fuel_per_km ?? 0);
  const crew      = Number(ship.crew_cost ?? 0);
  const maint     = Number(ship.maintenance ?? 0);

  return fuelPerKm * distanceKm + crew + maint;
}

// Destination stringinden ülke kodunu al (ör: "Berlin, DE")
function getCountryCodeFromDestination(dest) {
  if (!dest) return '';
  const parts = String(dest).split(',');
  if (parts.length < 2) return '';
  return parts[1].trim().toUpperCase();
}

// TR → TR = domestic (truck), yoksa international (ship)
function isDomesticShipment(shipment) {
  const dest = shipment?.destination || '';
  const countryCode = getCountryCodeFromDestination(dest);
  return countryCode === 'TR';
}

document.addEventListener('DOMContentLoaded', () => {
  (async () => {
    await bootstrapSeedIfNeeded();

    const shipmentSelect = document.getElementById('fleetShipment');
    const noShipmentsMsg = document.getElementById('noShipmentsMsg');
    const fleetModeBadge = document.getElementById('fleetModeBadge');

    const truckBlock     = document.getElementById('truckBlock');
    const shipBlock      = document.getElementById('shipBlock');
    const truckSelect    = document.getElementById('truckSelect');
    const shipSelect     = document.getElementById('shipSelect');

    const calcBtn        = document.getElementById('calcFleetBtn');
    const saveBtn        = document.getElementById('saveFleetBtn');
    const fleetError     = document.getElementById('fleetError');

    // Summary alanları
    const sumShipmentId  = document.getElementById('sumShipmentId');
    const sumStatus      = document.getElementById('sumStatus');
    const sumMode        = document.getElementById('sumMode');
    const sumDestination = document.getElementById('sumDestination');
    const sumProduct     = document.getElementById('sumProduct');
    const sumContainer   = document.getElementById('sumContainer');
    const sumWeight      = document.getElementById('sumWeight');
    const sumDistance    = document.getElementById('sumDistance');
    const sumTruckExp    = document.getElementById('sumTruckExpense');
    const sumShipExp     = document.getElementById('sumShipExpense');
    const sumTotalExp    = document.getElementById('sumTotalExpense');

    const truckExpenseEl = document.getElementById('truckExpense');
    const shipExpenseEl  = document.getElementById('shipExpense');

    // ✅ Assignments tablosu body
    const assignmentsBody = document.getElementById('fleetAssignmentsBody');

    // Veriler
    let fleetData     = loadData(STORAGE_KEYS.FLEET, { ships: [], trucks: [] });
    let shipmentsAll  = loadData(STORAGE_KEYS.SHIPMENTS, []);
    let currentShip   = null;

    // UI yardımcıları
    function showError(msg) {
      fleetError.textContent = msg || '';
    }

    // ✅ SADECE PENDING shipment’lar listeleniyor
    function fillShipmentOptions() {
      shipmentSelect.innerHTML =
        '<option value="">Select a shipment</option>';

      const pendingShipments = (shipmentsAll || []).filter(
        sh => (sh.status || 'Pending') === 'Pending'
      );

      if (!pendingShipments.length) {
        noShipmentsMsg.textContent =
          'There is no pending shipment to assign fleet.';
        shipmentSelect.disabled = true;
        calcBtn.disabled = true;
        saveBtn.disabled = true;
        truckSelect.disabled = true;
        shipSelect.disabled = true;
        return;
      }

      noShipmentsMsg.textContent = '';
      shipmentSelect.disabled = false;
      calcBtn.disabled = false;
      saveBtn.disabled = false;
      truckSelect.disabled = false;
      shipSelect.disabled = false;

      pendingShipments.forEach((sh) => {
        const opt = document.createElement('option');
        opt.value = sh.shipment_id;
        const status = sh.status || 'Pending';
        opt.textContent =
          `${sh.shipment_id} — ${sh.destination || ''} (${sh.weight_kg || 0} kg, ${sh.container_type || ''}, ${status})`;
        shipmentSelect.appendChild(opt);
      });
    }

    // ✅ Sadece status'ü Idle olan araçlar seçilebiliyor
    function fillFleetOptions() {
      truckSelect.innerHTML = '<option value="">Select truck</option>';
      shipSelect.innerHTML  = '<option value="">Select ship</option>';

      (fleetData.trucks || [])
        .filter(tr => (tr.status || 'Idle') === 'Idle')
        .forEach(tr => {
          const opt = document.createElement('option');
          opt.value = tr.id;
          opt.textContent = `${tr.name}`;
          truckSelect.appendChild(opt);
        });

      (fleetData.ships || [])
        .filter(sh => (sh.status || 'Idle') === 'Idle')
        .forEach(sh => {
          const opt = document.createElement('option');
          opt.value = sh.id;
          opt.textContent = `${sh.name}`;
          shipSelect.appendChild(opt);
        });
    }

    function findTruckById(id) {
      return (fleetData.trucks || []).find(t => String(t.id) === String(id));
    }

    function findShipById(id) {
      return (fleetData.ships || []).find(s => String(s.id) === String(id));
    }

    function updateModeUI() {
      if (!currentShip) {
        fleetModeBadge.textContent = '';
        truckBlock.style.display = 'none';
        shipBlock.style.display  = 'none';
        return;
      }

      const domestic   = isDomesticShipment(currentShip);
      const distanceKm = Number(currentShip.distance_km || 0);

      if (domestic) {
        fleetModeBadge.textContent =
          `Mode: Domestic (TR → TR). Vehicle must be a Truck. Distance: ${fmtKm(distanceKm)}.`;
        truckBlock.style.display = '';
        shipBlock.style.display  = 'none';
        truckSelect.value = '';
      } else {
        fleetModeBadge.textContent =
          `Mode: International (TR → Abroad). Vehicle must be a Ship. Distance: ${fmtKm(distanceKm)}.`;
        truckBlock.style.display = 'none';
        shipBlock.style.display  = '';
        shipSelect.value = '';
      }
    }

    function updateSummary() {
      if (!currentShip) {
        sumShipmentId.textContent  = '—';
        sumStatus.textContent      = '—';
        sumMode.textContent        = '—';
        sumDestination.textContent = '—';
        sumProduct.textContent     = '—';
        sumContainer.textContent   = '—';
        sumWeight.textContent      = '—';
        sumDistance.textContent    = '—';
        sumTruckExp.textContent    = '—';
        sumShipExp.textContent     = '—';
        sumTotalExp.textContent    = '—';
        return;
      }

      const domestic = isDomesticShipment(currentShip);
      const modeText = domestic ? 'Domestic (Truck)' : 'International (Ship)';

      sumShipmentId.textContent  = currentShip.shipment_id || '—';
      sumStatus.textContent      = currentShip.status || 'Pending';
      sumMode.textContent        = modeText;
      sumDestination.textContent = currentShip.destination || '—';
      sumProduct.textContent     = currentShip.product_name || '—';
      sumContainer.textContent   = currentShip.container_type || '—';
      sumWeight.textContent      = fmtKg(currentShip.weight_kg);
      sumDistance.textContent    = fmtKm(currentShip.distance_km);

      if (currentShip.truck_expense != null) {
        sumTruckExp.textContent = fmtCurrency(currentShip.truck_expense);
      } else {
        sumTruckExp.textContent = '—';
      }

      if (currentShip.ship_expense != null) {
        sumShipExp.textContent = fmtCurrency(currentShip.ship_expense);
      } else {
        sumShipExp.textContent = '—';
      }

      if (currentShip.fleet_total_expense != null) {
        sumTotalExp.textContent = fmtCurrency(currentShip.fleet_total_expense);
      } else {
        sumTotalExp.textContent = '—';
      }
    }

    function onShipmentChange() {
      const id = shipmentSelect.value;
      if (!id) {
        currentShip = null;
        updateModeUI();
        updateSummary();
        truckExpenseEl.textContent = '—';
        shipExpenseEl.textContent  = '—';
        showError('');
        return;
      }

      currentShip = shipmentsAll.find(sh => String(sh.shipment_id) === String(id));

      truckExpenseEl.textContent = '—';
      shipExpenseEl.textContent  = '—';

      updateModeUI();
      updateSummary();
      showError('');
    }

    function handleCalculate() {
      if (!currentShip) {
        showError('Please select a shipment first.');
        return;
      }

      const domestic   = isDomesticShipment(currentShip);
      const distanceKm = Number(currentShip.distance_km || 0);

      if (distanceKm <= 0) {
        showError('Distance is not defined for this shipment.');
        return;
      }

      let truckExp = 0;
      let shipExp  = 0;

      if (domestic) {
        const truckId = truckSelect.value;
        if (!truckId) {
          showError('Please select a truck.');
          return;
        }
        const truck = findTruckById(truckId);
        truckExp = calcTruckExpense(truck, distanceKm);
        truckExpenseEl.textContent = fmtCurrency(truckExp);
        shipExpenseEl.textContent  = '—';
      } else {
        const shipId = shipSelect.value;
        if (!shipId) {
          showError('Please select a ship.');
          return;
        }
        const ship = findShipById(shipId);
        shipExp = calcShipExpense(ship, distanceKm);
        shipExpenseEl.textContent  = fmtCurrency(shipExp);
        truckExpenseEl.textContent = '—';
      }

      const total = truckExp + shipExp;

      sumTruckExp.textContent = truckExp ? fmtCurrency(truckExp) : '—';
      sumShipExp.textContent  = shipExp ? fmtCurrency(shipExp) : '—';
      sumTotalExp.textContent = fmtCurrency(total);

      showError('');
    }

    // ✅ Assignments tablosunu dolduran fonksiyon
    function refreshAssignmentsTable() {
      if (!assignmentsBody) return;

      assignmentsBody.innerHTML = '';

      const trucks = fleetData.trucks || [];
      const ships  = fleetData.ships || [];

      // Truck veya ship atanmış tüm shipmentler
      const assignedShipments = (shipmentsAll || []).filter(
        sh => sh.truck_id || sh.ship_id
      );

      if (!assignedShipments.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 6;
        td.textContent = 'No fleet assignments yet.';
        td.style.textAlign = 'center';
        tr.appendChild(td);
        assignmentsBody.appendChild(tr);
        return;
      }

      assignedShipments.forEach(sh => {
        const tr = document.createElement('tr');

        const domestic = isDomesticShipment(sh);
        const modeText = domestic ? 'Domestic (Truck)' : 'International (Ship)';

        let vehicleType = '—';
        let vehicleName = '—';
        let vehicleStatus = '—';

        if (sh.truck_id) {
          vehicleType = 'Truck';
          const t = trucks.find(tk => String(tk.id) === String(sh.truck_id));
          vehicleName   = t?.name || '—';
          vehicleStatus = t?.status || '—';
        } else if (sh.ship_id) {
          vehicleType = 'Ship';
          const s = ships.find(sp => String(sp.id) === String(sh.ship_id));
          vehicleName   = s?.name || '—';
          vehicleStatus = s?.status || '—';
        }

        const tdVehicleType = document.createElement('td');
        tdVehicleType.textContent = vehicleType;

        const tdVehicleName = document.createElement('td');
        tdVehicleName.textContent = vehicleName;

        const tdShipmentId = document.createElement('td');
        tdShipmentId.textContent = sh.shipment_id || '—';

        const tdDestination = document.createElement('td');
        tdDestination.textContent = sh.destination || '—';

        const tdMode = document.createElement('td');
        tdMode.textContent = modeText;

        const tdVehStatus = document.createElement('td');
        tdVehStatus.textContent = vehicleStatus || '—';

        tr.appendChild(tdVehicleType);
        tr.appendChild(tdVehicleName);
        tr.appendChild(tdShipmentId);
        tr.appendChild(tdDestination);
        tr.appendChild(tdMode);
        tr.appendChild(tdVehStatus);

        assignmentsBody.appendChild(tr);
      });
    }

    function handleSave() {
      if (!currentShip) {
        showError('Please select a shipment first.');
        return;
      }

      const domestic   = isDomesticShipment(currentShip);
      const distanceKm = Number(currentShip.distance_km || 0);

      if (distanceKm <= 0) {
        showError('Distance is not defined for this shipment.');
        return;
      }

      // Shipments'ı yeniden oku
      const allShipments = loadData(STORAGE_KEYS.SHIPMENTS, []);
      const idx = allShipments.findIndex(
        sh => String(sh.shipment_id) === String(currentShip.shipment_id)
      );
      if (idx === -1) {
        showError('Shipment not found in storage.');
        return;
      }

      const prev     = allShipments[idx];
      const oldFleet = Number(prev.fleet_total_expense || 0);

      // Fleet'i de yeniden oku (güncel status için)
      const fleetRaw = loadData(STORAGE_KEYS.FLEET, { ships: [], trucks: [] });
      let truckExp = 0;
      let shipExp  = 0;
      let total    = 0;

      if (domestic) {
        const truckId = truckSelect.value;
        if (!truckId) {
          showError('Please select a truck.');
          return;
        }

        const trucksArr = fleetRaw.trucks || [];
        const tIdx = trucksArr.findIndex(t => String(t.id) === String(truckId));
        if (tIdx === -1) {
          showError('Truck not found.');
          return;
        }

        const truck = trucksArr[tIdx];

        // ✅ Araç sadece Idle ise atanabilir
        if ((truck.status || 'Idle') !== 'Idle') {
          showError('This truck is already in transport.');
          return;
        }

        truckExp = calcTruckExpense(truck, distanceKm);
        total    = truckExp;

        // Shipment üzerinde güncelle
        prev.truck_id      = truckId;
        prev.truck_name    = truck?.name || '';
        prev.truck_expense = truckExp;

        prev.ship_id       = null;
        prev.ship_name     = '';
        prev.ship_expense  = 0;

        // Truck status -> In Transit
        truck.status = 'In Transit';
        trucksArr[tIdx] = truck;
        fleetRaw.trucks = trucksArr;
      } else {
        const shipId = shipSelect.value;
        if (!shipId) {
          showError('Please select a ship.');
          return;
        }

        const shipsArr = fleetRaw.ships || [];
        const sIdx = shipsArr.findIndex(s => String(s.id) === String(shipId));
        if (sIdx === -1) {
          showError('Ship not found.');
          return;
        }

        const ship = shipsArr[sIdx];

        // ✅ Araç sadece Idle ise atanabilir
        if ((ship.status || 'Idle') !== 'Idle') {
          showError('This ship is already in transport.');
          return;
        }

        shipExp = calcShipExpense(ship, distanceKm);
        total   = shipExp;

        prev.ship_id       = shipId;
        prev.ship_name     = ship?.name || '';
        prev.ship_expense  = shipExp;

        prev.truck_id      = null;
        prev.truck_name    = '';
        prev.truck_expense = 0;

        // Ship status -> In Transit
        ship.status = 'In Transit';
        shipsArr[sIdx] = ship;
        fleetRaw.ships = shipsArr;
      }

      prev.fleet_total_expense = total;
      prev.transport_mode      = domestic ? 'Domestic-Truck' : 'International-Ship';
      prev.status              = 'Ready for Transport';

      allShipments[idx] = prev;
      saveData(STORAGE_KEYS.SHIPMENTS, allShipments);
      saveData(STORAGE_KEYS.FLEET, fleetRaw);

      // Finansal gider güncelle
      const fin = loadData(STORAGE_KEYS.FINANCIALS, {
        revenue: 0,
        expenses: 0,
        tax_rate: 0.2,
        tax: 0,
        profit_after_tax: 0
      });

      fin.expenses = (fin.expenses || 0) - oldFleet + total;
      saveData(STORAGE_KEYS.FINANCIALS, fin);
      recomputeFinancials();

      // Local değişkenleri güncelle
      shipmentsAll = allShipments;
      fleetData    = fleetRaw;
      currentShip  = prev;

      // UI’yi yenile: bu shipment artık Pending değil, listeden düşmeli
      fillShipmentOptions();
      fillFleetOptions();
      refreshAssignmentsTable();   // ✅ tabloyu yenile

      shipmentSelect.value = '';
      currentShip = null;

      updateModeUI();
      updateSummary();
      truckExpenseEl.textContent = '—';
      shipExpenseEl.textContent  = '—';

      showError('');
      alert('Fleet assigned and vehicle status updated successfully.');
    }

    // Init
    fillShipmentOptions();
    fillFleetOptions();
    refreshAssignmentsTable();  // ✅ sayfa açılışında da doldur
    updateModeUI();
    updateSummary();

    shipmentSelect.addEventListener('change', onShipmentChange);
    calcBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleCalculate();
    });
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleSave();
    });
  })();
});
