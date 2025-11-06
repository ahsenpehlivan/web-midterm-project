export const STORAGE_KEYS = {
  META:        'APP_META',
  ROUTES:      'ROUTE_DISTANCES',
  RATES:       'CONTAINER_RATES',
  FLEET:       'FLEET_DATA',
  INVENTORY:   'INVENTORY_DATA',
  FINANCIALS:  'FINANCIALS',
  SHIPMENTS:   'SHIPMENTS',
  CONTAINERS:  'CONTAINERS'
};


export async function bootstrapSeedIfNeeded() {
  const already = localStorage.getItem(STORAGE_KEYS.META);
  if (already) return;

  const [meta, routes, rates, fleet, inventory, finSchema] = await Promise.all([
    fetch('./seed/app_meta.json').then(r => r.json()),
    fetch('./seed/routes.json').then(r => r.json()),
    fetch('./seed/container_rates.json').then(r => r.json()),
    fetch('./seed/fleet.json').then(r => r.json()),
    fetch('./seed/inventory.json').then(r => r.json()),
    fetch('./seed/financial_schema.json').then(r => r.json())
  ]);

  localStorage.setItem(STORAGE_KEYS.META,       JSON.stringify(meta));
  localStorage.setItem(STORAGE_KEYS.ROUTES,     JSON.stringify(routes));
  localStorage.setItem(STORAGE_KEYS.RATES,      JSON.stringify(rates));
  localStorage.setItem(STORAGE_KEYS.FLEET,      JSON.stringify(fleet));
  localStorage.setItem(STORAGE_KEYS.INVENTORY,  JSON.stringify(inventory));
  localStorage.setItem(STORAGE_KEYS.FINANCIALS, JSON.stringify(finSchema));

  localStorage.setItem(STORAGE_KEYS.SHIPMENTS,  JSON.stringify([]));
  localStorage.setItem(STORAGE_KEYS.CONTAINERS, JSON.stringify([]));
}


export function loadData(key, fallback = null) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { 
    return JSON.parse(raw); 
  } catch { 
    return fallback; 
  }
}

export function saveData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function normalizeText(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replaceAll("ı","i").replaceAll("ğ","g").replaceAll("ü","u")
    .replaceAll("ş","s").replaceAll("ö","o").replaceAll("ç","c");
}


export function findDistanceKmFromRoutes(input) {
  const routes = loadData(STORAGE_KEYS.ROUTES, []);
  const key = String(input).trim();

  let match = routes.find(r => `${r.city}, ${r.country}` === key);

  if (!match) {
    const normKeyCity = normalizeText(key.split(',')[0] || '');
    match = routes.find(r => normalizeText(r.city) === normKeyCity);
  }

  return match ? match.distance_km : -1;
}

export function getRatePerKm(containerType) {
  const rates = loadData(STORAGE_KEYS.RATES, []);
  const m = rates.find(
    c => String(c.type || '').toLowerCase() === String(containerType || '').toLowerCase()
  );
  if (!m) return 0;
  const price = m.price_per_km ?? m.rate_per_km ?? m.pricePerKm;
  return Number(price) || 0;
}


export function recomputeFinancials() {
  const fin = loadData(STORAGE_KEYS.FINANCIALS, { revenue:0, expenses:0, tax_rate:0.2 });
  fin.net_income = (fin.revenue || 0) - (fin.expenses || 0);
  fin.tax = Math.max(0, (fin.net_income || 0) * (fin.tax_rate || 0.2));
  fin.profit_after_tax = (fin.net_income || 0) - (fin.tax || 0);
  saveData(STORAGE_KEYS.FINANCIALS, fin);
  return fin;
}
