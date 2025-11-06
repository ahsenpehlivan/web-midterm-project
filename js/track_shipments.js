// js/track_shipments.js

import { STORAGE_KEYS, loadData, bootstrapSeedIfNeeded } from './utils.js';

// Seed veriyi yükle (daha önce yüklendiyse bir şey yapmaz)
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
    const eta = sh.eta_days ?? estimateEtaDays(sh.distance_km);

    // Detay kartı
    document.getElementById('resId').textContent        = sh.shipment_id || '—';
    document.getElementById('resDest').textContent      = sh.destination || '—';
    document.getElementById('resProduct').textContent   = sh.product_name || '—';
    document.getElementById('resContainer').textContent = sh.container_type || '—';
    document.getElementById('resWeight').textContent    = (sh.weight_kg ?? '—') + ' kg';
    document.getElementById('resDistance').textContent  = fmtDistance(sh.distance_km);
    document.getElementById('resEta').textContent       =
        eta + (eta > 1 ? ' days' : ' day');
    document.getElementById('resPrice').textContent     = fmtPrice(sh.price);

    const created = sh.created_at ? new Date(sh.created_at) : null;
    document.getElementById('resCreated').textContent =
        created ? created.toLocaleString('tr-TR') : '—';

    // Sağdaki özet panel
    document.getElementById('summaryShipmentId').textContent  = sh.shipment_id || '—';
    document.getElementById('summaryStatus').textContent      = sh.status || 'Pending';
    document.getElementById('summaryDestination').textContent = sh.destination || '—';
    document.getElementById('summaryDistance').textContent    = fmtDistance(sh.distance_km);
    document.getElementById('summaryEta').textContent         =
        eta + (eta > 1 ? ' days' : ' day');
    document.getElementById('summaryPrice').textContent       = fmtPrice(sh.price);

    // Status badge + timeline
    paintStatusUI(sh.status);

    errorEl.textContent = '';
    resultBox.hidden = false;
}

function paintStatusUI(statusRaw) {
    const s = String(statusRaw || '').toLowerCase();

    // Status badge rengi
    const badge = document.getElementById('resStatus');
    const cls =
        s.includes('deliver') ? 'delivered' :
        s.includes('transit') ? 'transit'   :
        s.includes('ready')   ? 'ready'     : 'pending';

    badge.className = 'status-badge ' + cls;
    badge.textContent = statusRaw || 'Pending';

    // Timeline adımları
    const order = ['created', 'ready', 'transit', 'delivered'];
    const norm =
        s.includes('deliver') ? 'delivered' :
        s.includes('transit') ? 'transit'   :
        s.includes('ready')   ? 'ready'     :
        'created'; // pending -> created seviyesinde say

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
    // ÖNEMLİ: customer.js içinde "shipment_id" ile kaydediyoruz
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

// URL paramından otomatik ID çek (home.html -> ?trackID=...)
const params = new URLSearchParams(location.search);
const preId = params.get('trackID') || params.get('id') || params.get('shipment');

if (preId) {
    input.value = preId;
    handleSearch(preId.trim());
}
