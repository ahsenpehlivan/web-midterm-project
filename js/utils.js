//Storage anahtarları
export const STORAGE_KEYS = {
  META:        'APP_META',
  ROUTES:      'ROUTE_DISTANCES',
  RATES:       'CONTAINER_RATES',
  FLEET:       'FLEET_DATA',
  INVENTORY:   'INVENTORY_DATA',
  FINANCIALS:  'FINANCIALS',
  SHIPMENTS:   'SHIPMENTS',   // runtime veriler (uygulama içinde oluşan)
  CONTAINERS:  'CONTAINERS'   // runtime veriler (optimizasyon sonucu)
};


// İlk açılışta seed veriyi localStorage'a yükle
export async function bootstrapSeedIfNeeded() {
  const already = localStorage.getItem(STORAGE_KEYS.META);
  if (already) return; // daha önce hydrate edilmiş

  // Bu path'ler sayfanın URL'ine göre çalışır (home.html / create_shipment.html ile aynı kökten)
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

  // runtime koleksiyonları boş başlat
  localStorage.setItem(STORAGE_KEYS.SHIPMENTS,  JSON.stringify([]));
  localStorage.setItem(STORAGE_KEYS.CONTAINERS, JSON.stringify([]));
}


// verileri localStorage'dan okumak için fonk.
export function loadData(key, fallback = null) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { 
    return JSON.parse(raw); 
  } catch { 
    return fallback; 
  }
}

// verileri localStorage'a yazmak için fonksiyon
export function saveData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// metin normalizasyonu yapar
export function normalizeText(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replaceAll("ı","i").replaceAll("ğ","g").replaceAll("ü","u")
    .replaceAll("ş","s").replaceAll("ö","o").replaceAll("ç","c");
}


// Mesafeyi routes tablosundan bulur.
// Önce "Şehir, KOD" ile dener, bulamazsa sadece şehir adına göre bakar.
export function findDistanceKmFromRoutes(input) {
  const routes = loadData(STORAGE_KEYS.ROUTES, []);
  const key = String(input).trim();

  // Tam eşleşme: "Berlin, DE"
  let match = routes.find(r => `${r.city}, ${r.country}` === key);

  if (!match) {
    // Fallback: sadece şehir adı ile eşle
    const normKeyCity = normalizeText(key.split(',')[0] || '');
    match = routes.find(r => normalizeText(r.city) === normKeyCity);
  }

  return match ? match.distance_km : -1; // bulunmazsa -1 döner
}

// konteyner km başı ücret bulma
export function getRatePerKm(containerType) {
  const rates = loadData(STORAGE_KEYS.RATES, []);
  const m = rates.find(
    c => String(c.type || '').toLowerCase() === String(containerType || '').toLowerCase()
  );
  if (!m) return 0;
  const price = m.price_per_km ?? m.rate_per_km ?? m.pricePerKm;
  return Number(price) || 0;
}


// Finans türetmeleri
export function recomputeFinancials() {
  const fin = loadData(STORAGE_KEYS.FINANCIALS, { revenue:0, expenses:0, tax_rate:0.2 });
  fin.net_income = (fin.revenue || 0) - (fin.expenses || 0);               // net = gelir - gider
  fin.tax = Math.max(0, (fin.net_income || 0) * (fin.tax_rate || 0.2));    // zararda vergi yok
  fin.profit_after_tax = (fin.net_income || 0) - (fin.tax || 0);
  saveData(STORAGE_KEYS.FINANCIALS, fin);
  return fin;
}

// Export/Import (admin raporları için)
export function downloadJson(filename, dataObj) {
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; 
  a.download = filename; 
  a.click();
  URL.revokeObjectURL(url);
}
