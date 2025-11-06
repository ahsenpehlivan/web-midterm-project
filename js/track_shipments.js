// js/track_shipments.js

import { STORAGE_KEYS, loadData, bootstrapSeedIfNeeded } from './utils.js';

await bootstrapSeedIfNeeded();

const form      = document.getElementById('trackForm');
const input     = document.getElementById('trackId');
const errorEl   = document.getElementById('trackError');
const resultBox = document.getElementById('trackResult');

function fmtPrice(n) {
    const v = Number(n) || 0;
    return v.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ₺';
}

function fmtDistance(km) {
    const v = Number(km) || 0;
    return v.toLocaleString('tr-TR') + ' km';
}

function estimateEtaDays(distanceKm) {
    const d = Number(distanceKm) || 0;
    return Math.max(1, Math.ceil(d / 800));
}

function showError(msg) {
    errorEl.textContent = msg;
    resultBox.hidden = true;
}

function fillUI(sh) {
    const weightKg = Number(sh.weight_kg);
    const distanceKm = Number(sh.distance_km);
    const price = Number(sh.price);
    const eta = Number.isFinite(sh.eta_days) ? Number(sh.eta_days) : estimateEtaDays(distanceKm);
    const validEta = Number.isFinite(eta) && eta > 0 ? eta : 1;

    document.getElementById('resId').textContent        = sh.shipment_id || '—';
    document.getElementById('resDest').textContent      = sh.destination || '—';
    document.getElementById('resProduct').textContent   = sh.product_name || '—';
    document.getElementById('resContainer').textContent = sh.container_type || '—';
    document.getElementById('resWeight').textContent    = 
        Number.isFinite(weightKg) && weightKg > 0 ? `${weightKg.toLocaleString('tr-TR')} kg` : '—';
    document.getElementById('resDistance').textContent  = 
        Number.isFinite(distanceKm) && distanceKm > 0 ? fmtDistance(distanceKm) : '—';
    document.getElementById('resEta').textContent       =
        Number.isFinite(validEta) ? `${validEta} ${validEta > 1 ? 'days' : 'day'}` : '—';
    document.getElementById('resPrice').textContent     = 
        Number.isFinite(price) && price >= 0 ? fmtPrice(price) : '—';

    const created = sh.created_at ? new Date(sh.created_at) : null;
    document.getElementById('resCreated').textContent =
        created && !isNaN(created.getTime()) ? created.toLocaleString('tr-TR') : '—';

    document.getElementById('summaryShipmentId').textContent  = sh.shipment_id || '—';
    document.getElementById('summaryStatus').textContent      = sh.status || 'Pending';
    document.getElementById('summaryDestination').textContent = sh.destination || '—';
    document.getElementById('summaryDistance').textContent    = 
        Number.isFinite(distanceKm) && distanceKm > 0 ? fmtDistance(distanceKm) : '—';
    document.getElementById('summaryEta').textContent         =
        Number.isFinite(validEta) ? `${validEta} ${validEta > 1 ? 'days' : 'day'}` : '—';
    document.getElementById('summaryPrice').textContent       = 
        Number.isFinite(price) && price >= 0 ? fmtPrice(price) : '—';

    paintStatusUI(sh.status);

    errorEl.textContent = '';
    resultBox.hidden = false;
}

function paintStatusUI(statusRaw) {
    const s = String(statusRaw || '').toLowerCase();

    const badge = document.getElementById('resStatus');
    const cls =
        s.includes('deliver') ? 'delivered' :
        s.includes('transit') ? 'transit'   :
        s.includes('ready')   ? 'ready'     : 'pending';

    badge.className = 'status-badge ' + cls;
    badge.textContent = statusRaw || 'Pending';

    const order = ['created', 'ready', 'transit', 'delivered'];
    const norm =
        s.includes('deliver') ? 'delivered' :
        s.includes('transit') ? 'transit'   :
        s.includes('ready')   ? 'ready'     :
        'created';

    const idx = order.indexOf(norm);

    const steps = [
        document.getElementById('st-created').closest('.tl-step'),
        document.getElementById('st-ready').closest('.tl-step'),
        document.getElementById('st-transit').closest('.tl-step'),
        document.getElementById('st-delivered').closest('.tl-step'),
    ];

    steps.forEach((el, i) => {
        el.classList.remove('is-active', 'is-done');
        if (i < idx) {
            el.classList.add('is-done');
        } else if (i === idx) {
            el.classList.add('is-active');
        }
    });
}

function findShipment(id) {
  const all = loadData(STORAGE_KEYS.SHIPMENTS, []);
  return all.find(sh => String(sh.shipment_id) === String(id));
}

function handleSearch(id) {
    if (!id) {
        showError('Please enter a Shipment ID.');
        return;
    }
    const sh = findShipment(id);
    if (!sh) {
        showError(`No shipment found for: ${id}`);
    } else {
        fillUI(sh);
    }
}

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = input.value.trim();
    handleSearch(id);
});

const params = new URLSearchParams(location.search);
const preId = params.get('trackID') || params.get('id') || params.get('shipment');

if (preId) {
    input.value = preId;
    handleSearch(preId.trim());
}
