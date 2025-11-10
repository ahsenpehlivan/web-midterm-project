# web-midterm-project


(async () => {
  // === Proje localStorage anahtarları ===
  const STORAGE_KEYS = {
    META: 'APP_META',
    ROUTES: 'ROUTE_DISTANCES',
    RATES: 'CONTAINER_RATES',
    FLEET: 'FLEET_DATA',
    INVENTORY: 'INVENTORY_DATA',
    FINANCIALS: 'FINANCIALS',
    SHIPMENTS: 'SHIPMENTS',
    CONTAINERS: 'CONTAINERS'
  };

  // === Yardımcı fonksiyonlar ===
  const loadData = (key, fb=[]) => JSON.parse(localStorage.getItem(key) || JSON.stringify(fb));
  const saveData = (key, val) => localStorage.setItem(key, JSON.stringify(val));

  // === JSON seedleri yükle (gerekirse) ===
  async function bootstrapSeedIfNeeded() {
    const already = localStorage.getItem(STORAGE_KEYS.META);
    if (already) return;
    const [meta, routes, rates, fleet, inventory, fin] = await Promise.all([
      fetch('./seed/app_meta.json').then(r=>r.json()),
      fetch('./seed/routes.json').then(r=>r.json()),
      fetch('./seed/container_rates.json').then(r=>r.json()),
      fetch('./seed/fleet.json').then(r=>r.json()),
      fetch('./seed/inventory.json').then(r=>r.json()),
      fetch('./seed/financial_schema.json').then(r=>r.json())
    ]);
    localStorage.setItem(STORAGE_KEYS.META, JSON.stringify(meta));
    localStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(routes));
    localStorage.setItem(STORAGE_KEYS.RATES, JSON.stringify(rates));
    localStorage.setItem(STORAGE_KEYS.FLEET, JSON.stringify(fleet));
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inventory));
    localStorage.setItem(STORAGE_KEYS.FINANCIALS, JSON.stringify(fin));
    localStorage.setItem(STORAGE_KEYS.SHIPMENTS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.CONTAINERS, JSON.stringify([]));
  }

  await bootstrapSeedIfNeeded();

  // === Mesafe & fiyat bulma ===
  function findDistanceKmFromRoutes(input) {
    const routes = loadData(STORAGE_KEYS.ROUTES, []);
    const keyCity = input.split(',')[0].trim().toLowerCase();
    const match = routes.find(r => r.city.toLowerCase() === keyCity);
    return match ? match.distance_km : 1000;
  }

  function getRatePerKm(containerType) {
    const rates = loadData(STORAGE_KEYS.RATES, []);
    const match = rates.find(r => r.type.toLowerCase() === containerType.toLowerCase());
    return match ? match.price_per_km : 5;
  }

  // === Dummy shipment oluştur ===
  const destinations = ["İstanbul, TR", "Ankara, TR", "İzmir, TR", "Berlin, DE", "Paris, FR"];
  const categories = ["Fresh", "Frozen", "Organic"];
  const containerTypes = ["Small", "Medium", "Large"];

  const inventory = loadData(STORAGE_KEYS.INVENTORY, []);
  const shipments = loadData(STORAGE_KEYS.SHIPMENTS, []);
  const fin = loadData(STORAGE_KEYS.FINANCIALS, { revenue: 0, expenses: 0, tax_rate: 0.2 });

  const created = [];

  for (let i = 0; i < 5; i++) {
    const dest = destinations[Math.floor(Math.random() * destinations.length)];
    const cat = categories[Math.floor(Math.random() * categories.length)];
    const cont = containerTypes[Math.floor(Math.random() * containerTypes.length)];
    const dist = findDistanceKmFromRoutes(dest);
    const rate = getRatePerKm(cont);
    const weight = Math.floor(Math.random() * 1000) + 200;
    const price = dist * rate;
    const eta = Math.ceil(dist / 800);
    const id = `TW-${Date.now().toString().slice(-6)}-${i}`;

    const newShipment = {
      shipment_id: id,
      destination: dest,
      product_name: `${cat} Blueberries`,
      product_category: `${cat} Blueberries`,
      container_type: cont,
      weight_kg: weight,
      distance_km: dist,
      rate_per_km: rate,
      price,
      eta_days: eta,
      status: "Pending",
      created_at: new Date().toISOString()
    };
    shipments.push(newShipment);
    created.push(newShipment);

    // Envanterden düş
    const inv = inventory.find(x => x.category === cat);
    if (inv) {
      inv.quantity_kg = Math.max(0, inv.quantity_kg - weight);
      inv.status = inv.quantity_kg < inv.min_stock ? "Low" : "OK";
    }

    fin.revenue += price;
  }

  saveData(STORAGE_KEYS.SHIPMENTS, shipments);
  saveData(STORAGE_KEYS.INVENTORY, inventory);
  saveData(STORAGE_KEYS.FINANCIALS, fin);

  console.table(created.map(s => ({
    ID: s.shipment_id,
    Destination: s.destination,
    Container: s.container_type,
    Weight: s.weight_kg,
    Price: s.price
  })));

  alert(`✅ ${created.length} dummy shipments created. Sayfayı yenileyip admin panelde görebilirsin.`);
})();
