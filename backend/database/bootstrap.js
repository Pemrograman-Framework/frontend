// Menyiapkan database otomatis: buat database + tabel, tambah kolom baru bila perlu (migrasi),
// lalu isi data contoh SATU KALI. Dipakai oleh `npm run setup` dan dijalankan juga saat `npm start`.
require('../config');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const DB = process.env.DB_NAME || 'anna_brew';
const SEED_KEY = 'seed_v2';

// Kolom yang dibutuhkan backend pada tiap tabel
const EXPECTED = {
  users: ['id', 'name', 'email', 'password_hash', 'role', 'location', 'status', 'otp_code', 'otp_expires_at'],
  suppliers: ['id', 'name', 'email', 'phone', 'address', 'code', 'city', 'status'],
  products: ['id', 'supplier_id', 'name', 'sku', 'unit', 'price', 'image_url', 'category', 'stock'],
  purchase_orders: ['id', 'po_number', 'supplier_id', 'created_by', 'status', 'subtotal', 'tax', 'total', 'ordered_at', 'expected_at'],
  purchase_order_items: ['id', 'po_id', 'product_id', 'quantity', 'unit_price', 'subtotal', 'received_good', 'received_damaged'],
  purchase_order_logs: ['id', 'po_id', 'user_id', 'action', 'note', 'created_at'],
  discrepancies: ['id', 'disc_number', 'po_id', 'po_item_id', 'type', 'qty_problem', 'qty_good', 'description', 'photo_name', 'status', 'reported_by', 'loss', 'qty_label', 'reported_label', 'created_at'],
};

// Kolom tambahan untuk web. Ditambahkan otomatis bila tabel lama belum punya (data tidak berubah).
const MIGRATIONS = {
  users: [['status', "VARCHAR(20) NOT NULL DEFAULT 'Aktif'"]],
  suppliers: [
    ['code', 'VARCHAR(30) NULL'],
    ['city', 'VARCHAR(100) NULL'],
    ['status', "VARCHAR(20) NOT NULL DEFAULT 'Aktif'"],
  ],
  products: [
    ['category', "VARCHAR(60) NOT NULL DEFAULT 'Green Bean'"],
    ['stock', 'DECIMAL(14,2) NOT NULL DEFAULT 0'],
  ],
  discrepancies: [
    ['loss', 'DECIMAL(14,2) NULL'],
    ['qty_label', 'VARCHAR(100) NULL'],
    ['reported_label', 'VARCHAR(100) NULL'],
  ],
};

const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
const at = (n, h = 9, m = 15) => {
  const d = day(n);
  d.setHours(h, m, 0, 0);
  return d;
};

// ---------------------------------------------------------------- Data contoh
const SUPPLIERS = [
  // Mobile
  ['Kopi Mandailing Mandiri', 'sales@mandailingkopi.com', '0812-1111-0001', 'Medan, Sumatra Utara'],
  ['Gayo Highlands Exporters', 'order@gayohighlands.id', '0812-1111-0002', 'Takengon, Aceh'],
  ['Equator Roast Supply', 'hello@equatorroast.id', '0812-1111-0003', 'Jakarta'],
  ['Kopi Flores Mandiri Group', 'sales@kopiflores.id', '0812-1111-0004', 'Bajawa, Nusa Tenggara Timur'],
  ['Arutala Coffee', 'po@arutalacoffee.id', '0812-1111-0005', 'Bandung, Jawa Barat'],
  ['PT Kopi Mandiri Sejahtera', 'cs@kopimandiri.co.id', '0812-1111-0006', 'Lampung'],
  ['CV Gayo Roasted Beans', 'info@gayoroasted.id', '0812-1111-0007', 'Takengon, Aceh'],
  ['Sinar Kemasan Indonesia', 'sales@sinarkemasan.id', '0812-1111-0008', 'Bekasi, Jawa Barat'],
  // Web
  ['Java Estate Group', 'hello@javaestate.co.id', '+62 812-9901-4451', 'Bandung, Jawa Barat'],
  ['Toraja Highland Roasters', 'sales@torajahighland.com', '+62 853-2210-908', 'Makassar, Sulawesi Selatan'],
  ['Aceh Gayo Farms', 'info@acehgayofarms.com', '+62 811-4091-889', 'Takengon, Aceh'],
  ['Bali Kintamani Growers', 'growers@kintamanibali.org', '+62 831-2290-4100', 'Kintamani, Bali', 'Nonaktif'],
  ['Sumatra Coffee Labs', 'contact@sumatracoffeelabs.com', '+62 811-3442-122', 'Medan, Sumatra Utara'],
  ['Flores Bajawa Estate', 'order@floresbajawa.id', '+62 812-7000-1010', 'Bajawa, Nusa Tenggara Timur'],
  ['Mandailing Natal Growers', 'sales@mandailingnatal.id', '+62 812-7000-2020', 'Panyabungan, Sumatra Utara'],
];

// supplier, nama, sku, unit, harga, kategori, stok
const PRODUCTS = [
  ['Kopi Mandailing Mandiri', 'Green Beans Arabica Gayo', 'KG-BEA-01', 'kg', 95000, 'Green Bean', 850],
  ['Kopi Mandailing Mandiri', 'Specialty Roasted Beans Toraja', 'KG-RST-04', 'kg', 150000, 'Roasted Bean', 120],
  ['Kopi Flores Mandiri Group', 'Flores Bajawa Beans 1kg', 'BE-BAJ-1000', 'unit', 185000, 'Roasted Bean', 64],
  ['Kopi Flores Mandiri Group', 'Flores Manggarai Beans 1kg', 'BE-MGR-1000', 'unit', 175000, 'Roasted Bean', 52],
  ['Gayo Highlands Exporters', 'Coffee Filter Paper (Brown)', 'PK-FLT-01', 'pack', 38000, 'Kemasan', 300],
  ['Gayo Highlands Exporters', 'Roasted Espresso Blend Coffee', 'BG-ESP-01', 'bag', 85000, 'Roasted Bean', 210],
  ['Gayo Highlands Exporters', 'Takeaway Cup Paper Double Wall', 'CP-DBL-01', 'pcs', 1200, 'Kemasan', 5000],
  ['Equator Roast Supply', 'Kraft Pouch 500g', 'PK-KRF-05', 'pcs', 2500, 'Kemasan', 4000],
  ['Arutala Coffee', 'Arabica Mandheling (20kg)', 'AR-MDH-20', 'sak', 1900000, 'Green Bean', 18],
  ['PT Kopi Mandiri Sejahtera', 'Green Beans Robusta Lampung', 'KG-ROB-02', 'kg', 90000, 'Green Bean', 400],
  ['CV Gayo Roasted Beans', 'Roasted Beans Gayo Premium', 'KG-GYO-09', 'kg', 195500, 'Roasted Bean', 75],
  ['Sinar Kemasan Indonesia', 'Paper Cup 8oz', 'CP-8OZ-01', 'pcs', 1250, 'Kemasan', 8000],
  ['Aceh Gayo Farms', 'Arabika Gayo Grade 1', 'SKU-001', 'kg', 95000, 'Green Bean', 850],
  ['Sumatra Coffee Labs', 'Robusta Sumatra Bulk', 'SKU-002', 'kg', 62000, 'Green Bean', 1240],
  ['Toraja Highland Roasters', 'Toraja Kalosi Espresso', 'SKU-003', 'kg', 148000, 'Roasted Bean', 45],
  ['Bali Kintamani Growers', 'Kintamani Natural Process', 'SKU-004', 'kg', 112000, 'Green Bean', 320],
  ['Java Estate Group', 'Java Preanger Washed', 'SKU-005', 'kg', 88500, 'Green Bean', 670],
  ['Flores Bajawa Estate', 'Kopi Arabika Bajawa', 'KPI-A-010', 'kg', 122000, 'Green Bean', 500],
  ['Mandailing Natal Growers', 'Kopi Mandailing Grade 1', 'KPI-A-020', 'kg', 98000, 'Green Bean', 450],
  ['Toraja Highland Roasters', 'Kopi Arabika Toraja Grade A', 'KPI-A-001', 'kg', 15000, 'Green Bean', 2500],
  ['Toraja Highland Roasters', 'Kopi Robusta Toraja Medium Roast', 'KPI-R-007', 'kg', 14000, 'Roasted Bean', 1700],
];

// PO contoh dari aplikasi mobile. status: DB. ordered/expected: selisih hari dari hari ini.
const MOBILE_POS = [
  { no: 'PO-2026-03-0145', sup: 'Gayo Highlands Exporters', status: 'shipping', ordered: -1, expected: 3,
    items: [['PK-FLT-01', 50], ['BG-ESP-01', 120], ['CP-DBL-01', 1000]] },
  { no: 'PO-2026-03-0142', sup: 'Kopi Mandailing Mandiri', status: 'partial', ordered: -3, expected: 2,
    items: [['KG-BEA-01', 300, 200]] },
  { no: 'PO-2026-03-0139', sup: 'Equator Roast Supply', status: 'shipping', ordered: -9, expected: -2,
    items: [['PK-KRF-05', 2000]] },
  { no: 'PO-2026-0892', sup: 'Arutala Coffee', status: 'pending', ordered: -1, expected: 6,
    items: [['AR-MDH-20', 1]] },
  { no: 'PO-2026-0089', sup: 'PT Kopi Mandiri Sejahtera', status: 'completed', ordered: -40, expected: -35, noTax: true,
    items: [['KG-ROB-02', 50, 50]] },
  { no: 'PO-2026-0091', sup: 'CV Gayo Roasted Beans', status: 'shipping', ordered: -4, expected: 5, noTax: true,
    items: [['KG-GYO-09', 40]] },
  { no: 'PO-2026-0085', sup: 'Sinar Kemasan Indonesia', status: 'damaged', ordered: -45, expected: -40, noTax: true,
    items: [['CP-8OZ-01', 1000, 900, 100]] },
];

// PO contoh dari web. Tanggal dibuat relatif terhadap hari ini supaya status "Overdue" tetap masuk akal.
const WEB_POS = [
  { no: 'PO-2026-0050', sup: 'Flores Bajawa Estate', status: 'pending', ordered: 0, expected: 0, items: [['KPI-A-010', 500, 0, 0, 122000]] },
  { no: 'PO-2026-0049', sup: 'Mandailing Natal Growers', status: 'pending', ordered: -1, expected: 2, items: [['KPI-A-020', 450, 0, 0, 98000]] },
  { no: 'PO-2026-0048', sup: 'Sumatra Coffee Labs', status: 'completed', ordered: -2, expected: -2, items: [['SKU-002', 2500, 2500, 0, 16363]] },
  { no: 'PO-2026-0047', sup: 'Java Estate Group', status: 'shipping', ordered: -4, expected: 1, items: [['SKU-005', 12000, 0, 0, 9280]] },
  { no: 'PO-2026-0046', sup: 'Toraja Highland Roasters', status: 'pending', ordered: -8, expected: -1,
    items: [['KPI-A-001', 2500, 0, 0, 15000], ['KPI-R-007', 1700, 0, 0, 14000]] },
  { no: 'PO-2026-0045', sup: 'Aceh Gayo Farms', status: 'shipping', ordered: -11, expected: -6, items: [['SKU-001', 1500, 0, 0, 19393]] },
  { no: 'PO-2026-0044', sup: 'Bali Kintamani Growers', status: 'completed', ordered: -14, expected: -8, items: [['SKU-004', 3000, 3000, 0, 16666]] },
  { no: 'PO-2026-0043', sup: 'Java Estate Group', status: 'completed', ordered: -16, expected: -11, items: [['SKU-005', 2000, 2000, 0, 88500]] },
  { no: 'PO-2026-0042', sup: 'Aceh Gayo Farms', status: 'completed', ordered: -18, expected: -12, items: [['SKU-001', 800, 800, 0, 95000]] },
  { no: 'PO-2026-0041', sup: 'Toraja Highland Roasters', status: 'completed', ordered: -20, expected: -14, items: [['SKU-003', 300, 300, 0, 148000]] },
  { no: 'PO-2026-0040', sup: 'Sumatra Coffee Labs', status: 'completed', ordered: -23, expected: -17, items: [['SKU-002', 1000, 1000, 0, 62000]] },
];

// id, po, jenis, selisih hari, status DB, deskripsi, kerugian, label qty, jumlah bermasalah, pelapor
const WEB_DISCREPANCIES = [
  ['DISC-0024', 'PO-2026-0048', 'Kekurangan Barang', -1, 'submitted',
    'Biji kopi Robusta Sumatra yang diterima kurang sebanyak 5 karung (total kekurangan 250 Kg) dari jumlah yang tertera di surat jalan dan dokumen PO. Kondisi segel kontainer luar dalam keadaan baik, kemungkinan kesalahan packing dari supplier.',
    4500000, '5 karung / 250 Kg', 250, 'Rian (Staff Gudang)'],
  ['DISC-0023', 'PO-2026-0045', 'Kerusakan Barang', -6, 'resolved',
    'Sebagian karung basah akibat kebocoran atap kontainer saat pengiriman.', 3200000, '3 karung / 150 Kg', 150, 'Rian (Staff Gudang)'],
  ['DISC-0022', 'PO-2026-0044', 'Salah Item', -11, 'closed',
    'Item yang dikirim adalah Natural Process, bukan Honey Process sesuai PO.', 1800000, '2 karung / 100 Kg', 100, 'Dewi (QC)'],
  ['DISC-0021', 'PO-2026-0041', 'Kekurangan Barang', -16, 'resolved',
    'Jumlah roasted bean kurang 10 Kg dari surat jalan.', 1480000, '10 Kg', 10, 'Rian (Staff Gudang)'],
];

// nama, email, lokasi, role, password, tanggal bergabung
const USERS = [
  ['Aliyah Putri', 'aliyah@gmail.com', 'Kantor Pusat', 'Staff Gudang', 'password123', null],
  ['Ayu Patricia', 'ayupatricia@gmail.com', 'Medan', 'Manager', 'Anna2026!', '2025-01-05 09:00:00'],
  ['Helixa Jaya Cipta Rusyandi', 'helixa@gmail.com', 'Bandung', 'Staff', 'password123', '2025-01-05 09:00:00'],
];

// ---------------------------------------------------------------- Proses
async function bootstrap(log = console.log) {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
    decimalNumbers: true,
  });

  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    await conn.query(`USE \`${DB}\``);
    await conn.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

    const columnsOf = async (table) => {
      const [rows] = await conn.query(
        'SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?',
        [DB, table]
      );
      return new Set(rows.map((r) => r.c));
    };

    // Migrasi: tambah kolom baru yang belum ada di tabel lama
    for (const [table, cols] of Object.entries(MIGRATIONS)) {
      const have = await columnsOf(table);
      for (const [col, def] of cols) {
        if (!have.has(col)) {
          await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}`);
          log(`Migrasi: kolom ${table}.${col} ditambahkan.`);
        }
      }
    }

    // Periksa apakah tabel yang sudah ada punya semua kolom yang dibutuhkan
    const problems = [];
    for (const [table, cols] of Object.entries(EXPECTED)) {
      const have = await columnsOf(table);
      const missing = cols.filter((c) => !have.has(c));
      if (missing.length) problems.push(`  - ${table}: kolom belum ada -> ${missing.join(', ')}`);
    }
    if (problems.length) return { ok: false, problems };

    await conn.query("UPDATE suppliers SET code = CONCAT('SUP-', LPAD(id, 3, '0')) WHERE code IS NULL OR code = ''");

    const [[marker]] = await conn.query('SELECT COUNT(*) AS c FROM app_meta WHERE meta_key=?', [SEED_KEY]);
    if (marker.c === 0) {
      await seed(conn, log);
      await conn.query('INSERT INTO app_meta (meta_key, meta_value) VALUES (?, ?)', [SEED_KEY, new Date().toISOString()]);
    }
    return { ok: true };
  } finally {
    await conn.end();
  }
}

async function seed(conn, log) {
  const one = async (sql, params) => (await conn.query(sql, params))[0][0];
  const ins = async (sql, params) => (await conn.query(sql, params))[0].insertId;

  // --- Users (dilewati bila email sudah ada) ---
  const userId = {};
  for (const [name, email, location, role, pw, joined] of USERS) {
    const ex = await one('SELECT id FROM users WHERE email=?', [email]);
    if (ex) {
      userId[email] = ex.id;
      continue;
    }
    const hash = await bcrypt.hash(pw, 10);
    userId[email] = await ins(
      'INSERT INTO users (name,email,password_hash,role,location,status,created_at) VALUES (?,?,?,?,?,?,?)',
      [name, email, hash, role, location, 'Aktif', joined || new Date()]
    );
    log(`Akun contoh: ${email} / ${pw}`);
  }
  const author = userId['ayupatricia@gmail.com'];
  const warehouse = userId['aliyah@gmail.com'];

  // --- Suppliers ---
  const sup = {};
  for (const [name, email, phone, city, status] of SUPPLIERS) {
    const ex = await one('SELECT id FROM suppliers WHERE name=?', [name]);
    if (ex) {
      sup[name] = ex.id;
      continue;
    }
    const nextCode = (await one("SELECT IFNULL(MAX(CAST(SUBSTRING(code, 5) AS UNSIGNED)), 0) + 1 AS n FROM suppliers WHERE code LIKE 'SUP-%'", [])).n;
    sup[name] = await ins(
      'INSERT INTO suppliers (name,email,phone,address,code,city,status) VALUES (?,?,?,?,?,?,?)',
      [name, email, phone, city, 'SUP-' + String(nextCode).padStart(3, '0'), city, status || 'Aktif']
    );
  }

  // --- Products ---
  const prod = {};
  const price = {};
  for (const [supName, name, sku, unit, harga, category, stock] of PRODUCTS) {
    const ex = await one('SELECT id, price FROM products WHERE sku=?', [sku]);
    if (ex) {
      prod[sku] = ex.id;
      price[sku] = ex.price;
      continue;
    }
    prod[sku] = await ins(
      'INSERT INTO products (supplier_id,name,sku,unit,price,category,stock) VALUES (?,?,?,?,?,?,?)',
      [sup[supName], name, sku, unit, harga, category, stock]
    );
    price[sku] = harga;
  }

  // --- Purchase order ---
  const makePo = async (po, createdBy, webStyle) => {
    if (await one('SELECT id FROM purchase_orders WHERE po_number=?', [po.no])) return;
    // item: [sku, qty, good, damaged, hargaKhusus]
    const lines = po.items.map(([sku, qty, good = 0, bad = 0, special]) => {
      const unitPrice = special || price[sku];
      return { sku, qty, good, bad, unitPrice, sub: unitPrice * qty };
    });
    const subtotal = lines.reduce((a, l) => a + l.sub, 0);
    const tax = po.noTax ? 0 : Math.round(subtotal * 0.11);
    const poId = await ins(
      'INSERT INTO purchase_orders (po_number,supplier_id,created_by,status,subtotal,tax,total,ordered_at,expected_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [po.no, sup[po.sup], createdBy, po.status, subtotal, tax, subtotal + tax, at(po.ordered), day(po.expected)]
    );
    for (const l of lines) {
      await ins(
        'INSERT INTO purchase_order_items (po_id,product_id,quantity,unit_price,subtotal,received_good,received_damaged) VALUES (?,?,?,?,?,?,?)',
        [poId, prod[l.sku], l.qty, l.unitPrice, l.sub, l.good, l.bad]
      );
    }
    const addLog = (action, note, who, when) =>
      conn.query('INSERT INTO purchase_order_logs (po_id,user_id,action,note,created_at) VALUES (?,?,?,?,?)', [poId, who, action, note, when]);
    if (webStyle) {
      await addLog('created', 'PO Dibuat — ' + (po.status === 'pending' ? 'Menunggu Konfirmasi' : 'Disetujui'), createdBy, at(po.ordered));
      if (po.status !== 'pending') await addLog('approved', 'PO Disetujui', createdBy, at(po.ordered, 10, 5));
      if (po.status === 'completed') await addLog('received', 'Barang diterima lengkap', createdBy, at(po.expected, 14, 30));
    } else {
      await addLog('created', 'Data contoh', createdBy, at(po.ordered));
    }
  };
  for (const po of MOBILE_POS) await makePo(po, warehouse, false);
  for (const po of WEB_POS) await makePo(po, author, true);

  // --- Discrepancy ---
  for (const [no, poNo, type, when, status, desc, loss, qtyLabel, qtyProblem, by] of WEB_DISCREPANCIES) {
    if (await one('SELECT id FROM discrepancies WHERE disc_number=?', [no])) continue;
    const po = await one('SELECT id FROM purchase_orders WHERE po_number=?', [poNo]);
    if (!po) continue;
    const item = await one('SELECT id, quantity FROM purchase_order_items WHERE po_id=? ORDER BY id LIMIT 1', [po.id]);
    if (!item) continue;
    await ins(
      `INSERT INTO discrepancies
         (disc_number,po_id,po_item_id,type,qty_problem,qty_good,description,photo_name,status,reported_by,loss,qty_label,reported_label,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [no, po.id, item.id, type, qtyProblem, Math.max(item.quantity - qtyProblem, 0), desc, null, status, author, loss, qtyLabel, by, at(when, 11, 0)]
    );
  }
  log('Data contoh supplier, produk, PO, dan discrepancy sudah dimasukkan.');
}

module.exports = { bootstrap };
