// Endpoint untuk web (frontend-main). Data database relasional diubah ke bentuk yang dipakai tampilan web:
//   GET    /api/data                      -> { pos, suppliers, products, users, discrepancies }
//   POST   /api/data/:collection          -> tambah data, mengembalikan { item }
//   PUT    /api/data/:collection/:id      -> ubah data, mengembalikan { item }
//   DELETE /api/data/:collection/:id      -> hapus data
// :collection = pos | suppliers | products | users | discrepancies
const router = require('express').Router();
const uploads = require('../utils/uploads');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { requireRole } = require('../middleware/auth');
const { wrap, httpError } = require('../utils/http');
const { defaultUserPassword } = require('../config');

const MANAGERS = ['Admin', 'Manager'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAX_RATE = 0.11; // PPN 11% otomatis, sama dengan aplikasi mobile

// ---------------------------------------------------------------- format
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const two = (n) => String(n).padStart(2, '0');
const toDate = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmtDate = (v) => {
  const d = toDate(v);
  return d ? `${two(d.getDate())} ${BULAN[d.getMonth()]} ${d.getFullYear()}` : '-';
};
const fmtDateTime = (v) => {
  const d = toDate(v);
  return d ? `${fmtDate(d)}, ${two(d.getHours())}:${two(d.getMinutes())}` : '-';
};
const isoDate = (v) => {
  const d = toDate(v);
  return d ? `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}` : '';
};
const str = (v, max = 255) => String(v == null ? '' : v).trim().slice(0, max);
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

// ---------------------------------------------------------------- status
const PO_TO_WEB = {
  pending: 'Menunggu Konfirmasi',
  approved: 'Sedang Dikirim',
  shipping: 'Sedang Dikirim',
  partial: 'Sedang Dikirim',
  completed: 'Selesai',
  damaged: 'Selesai',
  cancelled: 'Ditolak',
};
const WEB_TO_PO = {
  'Menunggu Konfirmasi': 'pending',
  'Sedang Dikirim': 'shipping',
  Selesai: 'completed',
  Ditolak: 'cancelled',
};
const DISC_TO_WEB = { submitted: 'Menunggu Review', reviewed: 'Menunggu Review', resolved: 'Selesai', closed: 'Ditutup' };
const WEB_TO_DISC = { 'Menunggu Review': 'reviewed', Selesai: 'resolved', Ditutup: 'closed' };

const poWebStatus = (row) => {
  const d = toDate(row.expected_at);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (['approved', 'shipping'].includes(row.status) && d && d < today) return 'Overdue';
  return PO_TO_WEB[row.status] || row.status;
};

// ---------------------------------------------------------------- pembaca data
const supplierOut = (r) => ({
  id: r.id,
  kode: r.code || 'SUP-' + String(r.id).padStart(3, '0'),
  nama: r.name,
  email: r.email || '',
  tel: r.phone || '',
  kota: r.city || '',
  alamat: r.address || '',
  st: r.status || 'Aktif',
});

const productOut = (r) => ({
  id: r.id,
  sku: r.sku,
  nama: r.name,
  kategori: r.category || 'Green Bean',
  supplier: r.supplier_name,
  stok: Number(r.stock || 0),
  harga: Number(r.price || 0),
  unit: r.unit || 'kg',
});

const userOut = (r) => ({
  id: r.id,
  nama: r.name,
  email: r.email,
  lokasi: r.location || '',
  role: r.role,
  st: r.status || 'Aktif',
  gabung: fmtDate(r.created_at),
});

async function loadSuppliers() {
  const [rows] = await pool.query('SELECT * FROM suppliers ORDER BY id DESC');
  return rows.map(supplierOut);
}

async function loadProducts() {
  const [rows] = await pool.query(
    'SELECT p.*, s.name AS supplier_name FROM products p JOIN suppliers s ON s.id = p.supplier_id ORDER BY p.id DESC'
  );
  return rows.map(productOut);
}

async function loadUsers() {
  const [rows] = await pool.query('SELECT id, name, email, location, role, status, created_at FROM users ORDER BY id');
  return rows.map(userOut);
}

async function loadPos(onlyNumber) {
  const [pos] = await pool.query(
    `SELECT po.*, s.name AS supplier_name FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
      ${onlyNumber ? 'WHERE po.po_number = ?' : ''} ORDER BY po.ordered_at DESC, po.id DESC`,
    onlyNumber ? [onlyNumber] : []
  );
  if (!pos.length) return [];
  const ids = pos.map((p) => p.id);
  const [items] = await pool.query(
    `SELECT i.po_id, i.quantity, i.unit_price, p.name, p.sku, p.unit
       FROM purchase_order_items i JOIN products p ON p.id = i.product_id WHERE i.po_id IN (?) ORDER BY i.id`,
    [ids]
  );
  const [logs] = await pool.query(
    `SELECT l.po_id, l.action, l.note, l.created_at, u.name AS who
       FROM purchase_order_logs l LEFT JOIN users u ON u.id = l.user_id WHERE l.po_id IN (?) ORDER BY l.id`,
    [ids]
  );
  return pos.map((p) => ({
    id: p.po_number,
    sup: p.supplier_name,
    tgl: fmtDate(p.ordered_at),
    due: fmtDate(p.expected_at),
    dueDate: isoDate(p.expected_at),
    st: poWebStatus(p),
    eta: p.expected_at ? fmtDate(p.expected_at) : '-',
    items: items
      .filter((i) => i.po_id === p.id)
      .map((i) => ({ n: i.name, s: i.sku, q: Number(i.quantity), p: Number(i.unit_price), u: i.unit })),
    logs: logs
      .filter((l) => l.po_id === p.id)
      .map((l) => ({ t: l.note || l.action, who: l.who || 'Sistem', ts: fmtDateTime(l.created_at) })),
    subtotal: Number(p.subtotal),
    tax: Number(p.tax),
    total: Number(p.total),
  }));
}

async function loadDiscrepancies(onlyNumber) {
  const [rows] = await pool.query(
    `SELECT d.*, po.po_number, s.name AS supplier_name, p.name AS product_name, p.unit, i.unit_price, u.name AS reporter
       FROM discrepancies d
       JOIN purchase_orders po ON po.id = d.po_id
       JOIN suppliers s ON s.id = po.supplier_id
       JOIN purchase_order_items i ON i.id = d.po_item_id
       JOIN products p ON p.id = i.product_id
       LEFT JOIN users u ON u.id = d.reported_by
      ${onlyNumber ? 'WHERE d.disc_number = ?' : ''}
      ORDER BY d.created_at DESC, d.id DESC`,
    onlyNumber ? [onlyNumber] : []
  );
  return rows.map((d) => ({
    id: d.disc_number,
    po: d.po_number,
    sup: d.supplier_name,
    jenis: d.type,
    tgl: fmtDate(d.created_at),
    st: DISC_TO_WEB[d.status] || d.status,
    desc: d.description || '',
    rugi: d.loss != null ? Number(d.loss) : Number(d.qty_problem) * Number(d.unit_price),
    qty: d.qty_label || `${d.qty_problem} ${d.unit}`,
    by: d.reported_label || d.reporter || '-',
    foto: uploads.exists(d.photo_name) ? '/uploads/' + d.photo_name : null,
  }));
}

// GET /api/data
router.get('/', wrap(async (req, res) => {
  const [pos, suppliers, products, users, discrepancies] = await Promise.all([
    loadPos(),
    loadSuppliers(),
    loadProducts(),
    loadUsers(),
    loadDiscrepancies(),
  ]);
  res.json({ pos, suppliers, products, users, discrepancies });
}));

// ---------------------------------------------------------------- supplier
const duplicate = (e, message) => {
  if (e && e.code === 'ER_DUP_ENTRY') throw httpError(409, message);
  throw e;
};

function readSupplier(b) {
  const nama = str(b.nama, 150);
  const email = str(b.email, 150);
  if (!nama) throw httpError(422, 'Nama supplier wajib diisi.');
  if (email && !EMAIL_RE.test(email)) throw httpError(422, 'Format email tidak valid.');
  return {
    name: nama,
    code: str(b.kode, 30),
    email,
    phone: str(b.tel, 40),
    city: str(b.kota, 100),
    address: str(b.alamat, 255),
    status: b.st === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
  };
}

const suppliers = {
  async create(b) {
    const s = readSupplier(b);
    try {
      const code = s.code || (await nextSupplierCode());
      const [r] = await pool.query(
        'INSERT INTO suppliers (name,email,phone,address,code,city,status) VALUES (?,?,?,?,?,?,?)',
        [s.name, s.email, s.phone, s.address, code, s.city, s.status]
      );
      return supplierOut((await pool.query('SELECT * FROM suppliers WHERE id=?', [r.insertId]))[0][0]);
    } catch (e) {
      return duplicate(e, 'Kode supplier sudah dipakai.');
    }
  },
  async update(id, b) {
    const s = readSupplier(b);
    const [r] = await pool.query(
      'UPDATE suppliers SET name=?, email=?, phone=?, address=?, code=?, city=?, status=? WHERE id=?',
      [s.name, s.email, s.phone, s.address, s.code || null, s.city, s.status, id]
    );
    if (!r.affectedRows) throw httpError(404, 'Supplier tidak ditemukan.');
    return supplierOut((await pool.query('SELECT * FROM suppliers WHERE id=?', [id]))[0][0]);
  },
  async remove(id) {
    const [[used]] = await pool.query(
      'SELECT (SELECT COUNT(*) FROM products WHERE supplier_id=?) + (SELECT COUNT(*) FROM purchase_orders WHERE supplier_id=?) AS c',
      [id, id]
    );
    if (used.c > 0) throw httpError(409, 'Supplier tidak dapat dihapus karena masih dipakai oleh produk atau PO. Ubah statusnya menjadi Nonaktif.');
    const [r] = await pool.query('DELETE FROM suppliers WHERE id=?', [id]);
    if (!r.affectedRows) throw httpError(404, 'Supplier tidak ditemukan.');
  },
};

async function nextSupplierCode() {
  const [[r]] = await pool.query(
    "SELECT IFNULL(MAX(CAST(SUBSTRING(code, 5) AS UNSIGNED)), 0) + 1 AS n FROM suppliers WHERE code LIKE 'SUP-%'"
  );
  return 'SUP-' + String(r.n).padStart(3, '0');
}

// ---------------------------------------------------------------- produk
async function readProduct(b) {
  const nama = str(b.nama, 150);
  const sku = str(b.sku, 50);
  const harga = num(b.harga);
  const stok = num(b.stok);
  if (!nama) throw httpError(422, 'Nama produk wajib diisi.');
  if (!sku) throw httpError(422, 'SKU wajib diisi.');
  if (!(harga >= 0)) throw httpError(422, 'Harga tidak valid.');
  if (!(stok >= 0)) throw httpError(422, 'Stok tidak valid.');
  const [sup] = await pool.query('SELECT id FROM suppliers WHERE name=?', [str(b.supplier, 150)]);
  if (!sup.length) throw httpError(422, 'Supplier tidak ditemukan.');
  return { supplier_id: sup[0].id, name: nama, sku, category: str(b.kategori, 60) || 'Green Bean', price: harga, stock: stok };
}

const productById = async (id) =>
  productOut((await pool.query('SELECT p.*, s.name AS supplier_name FROM products p JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=?', [id]))[0][0]);

const products = {
  async create(b) {
    const p = await readProduct(b);
    try {
      const [r] = await pool.query(
        'INSERT INTO products (supplier_id,name,sku,unit,price,category,stock) VALUES (?,?,?,?,?,?,?)',
        [p.supplier_id, p.name, p.sku, 'kg', p.price, p.category, p.stock]
      );
      return await productById(r.insertId);
    } catch (e) {
      return duplicate(e, 'SKU sudah dipakai produk lain.');
    }
  },
  async update(id, b) {
    const p = await readProduct(b);
    try {
      const [r] = await pool.query(
        'UPDATE products SET supplier_id=?, name=?, sku=?, price=?, category=?, stock=? WHERE id=?',
        [p.supplier_id, p.name, p.sku, p.price, p.category, p.stock, id]
      );
      if (!r.affectedRows) throw httpError(404, 'Produk tidak ditemukan.');
      return await productById(id);
    } catch (e) {
      return duplicate(e, 'SKU sudah dipakai produk lain.');
    }
  },
  async remove(id) {
    const [[used]] = await pool.query('SELECT COUNT(*) AS c FROM purchase_order_items WHERE product_id=?', [id]);
    if (used.c > 0) throw httpError(409, 'Produk tidak dapat dihapus karena sudah dipakai pada PO.');
    const [r] = await pool.query('DELETE FROM products WHERE id=?', [id]);
    if (!r.affectedRows) throw httpError(404, 'Produk tidak ditemukan.');
  },
};

// ---------------------------------------------------------------- user
function readUser(b) {
  const nama = str(b.nama, 100);
  const email = str(b.email, 150).toLowerCase();
  if (!nama) throw httpError(422, 'Nama wajib diisi.');
  if (!EMAIL_RE.test(email)) throw httpError(422, 'Format email tidak valid.');
  return {
    name: nama,
    email,
    location: str(b.lokasi, 100),
    role: str(b.role, 60) || 'Staff',
    status: b.st === 'Nonaktif' ? 'Nonaktif' : 'Aktif',
  };
}

const userById = async (id) =>
  userOut((await pool.query('SELECT id, name, email, location, role, status, created_at FROM users WHERE id=?', [id]))[0][0]);

const users = {
  async create(b) {
    const u = readUser(b);
    const hash = await bcrypt.hash(defaultUserPassword, 10);
    try {
      const [r] = await pool.query(
        'INSERT INTO users (name,email,password_hash,role,location,status) VALUES (?,?,?,?,?,?)',
        [u.name, u.email, hash, u.role, u.location, u.status]
      );
      return await userById(r.insertId);
    } catch (e) {
      return duplicate(e, 'Email sudah terdaftar.');
    }
  },
  async update(id, b, req) {
    const u = readUser(b);
    if (Number(id) === req.user.id && u.status === 'Nonaktif') throw httpError(409, 'Anda tidak dapat menonaktifkan akun sendiri.');
    if (Number(id) === req.user.id && !MANAGERS.includes(u.role)) throw httpError(409, 'Anda tidak dapat menurunkan peran akun sendiri.');
    try {
      const [r] = await pool.query('UPDATE users SET name=?, email=?, location=?, role=?, status=? WHERE id=?', [
        u.name, u.email, u.location, u.role, u.status, id,
      ]);
      if (!r.affectedRows) throw httpError(404, 'User tidak ditemukan.');
      return await userById(id);
    } catch (e) {
      return duplicate(e, 'Email sudah terdaftar.');
    }
  },
  async remove(id, req) {
    if (Number(id) === req.user.id) throw httpError(409, 'Anda tidak dapat menghapus akun sendiri.');
    const [r] = await pool.query('DELETE FROM users WHERE id=?', [id]);
    if (!r.affectedRows) throw httpError(404, 'User tidak ditemukan.');
  },
};

// ---------------------------------------------------------------- purchase order
const nextSeq = async (conn, table, col) => {
  const [[r]] = await conn.query(
    `SELECT IFNULL(MAX(CAST(SUBSTRING_INDEX(${col}, '-', -1) AS UNSIGNED)), 0) + 1 AS next FROM ${table} FOR UPDATE`
  );
  return r.next;
};

const pos = {
  // body: { sup, dueDate, items: [{ s: sku, q: jumlah }] }
  async create(b, req) {
    const supName = str(b.sup, 150);
    const items = Array.isArray(b.items) ? b.items : [];
    if (!supName) throw httpError(422, 'Supplier wajib dipilih.');
    if (!items.length) throw httpError(422, 'Minimal 1 item harus ditambahkan.');
    const qty = new Map();
    for (const it of items) {
      const q = num(it.q);
      if (!it.s || !Number.isInteger(q) || q <= 0) throw httpError(422, 'Jumlah harus berupa bilangan bulat lebih dari 0.');
      qty.set(String(it.s), (qty.get(String(it.s)) || 0) + q);
    }
    const due = toDate(b.dueDate);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [sups] = await conn.query('SELECT id, status FROM suppliers WHERE name=?', [supName]);
      if (!sups.length) throw httpError(422, 'Supplier tidak ditemukan.');
      if (sups[0].status === 'Nonaktif') throw httpError(422, 'Supplier sedang nonaktif.');
      const [prods] = await conn.query('SELECT id, sku, price FROM products WHERE supplier_id=? AND sku IN (?)', [sups[0].id, [...qty.keys()]]);
      if (prods.length !== qty.size) throw httpError(422, 'Ada produk yang bukan milik supplier terpilih.');

      let subtotal = 0;
      for (const p of prods) subtotal += p.price * qty.get(p.sku);
      const tax = Math.round(subtotal * TAX_RATE);

      const now = new Date();
      const seq = await nextSeq(conn, 'purchase_orders', 'po_number');
      const poNumber = `PO-${now.getFullYear()}-${two(now.getMonth() + 1)}-${String(seq).padStart(4, '0')}`;
      const expected = due || new Date(now.getTime() + 7 * 86400000);

      const [r] = await conn.query(
        `INSERT INTO purchase_orders (po_number, supplier_id, created_by, status, subtotal, tax, total, ordered_at, expected_at)
         VALUES (?, ?, ?, 'pending', ?, ?, ?, NOW(), ?)`,
        [poNumber, sups[0].id, req.user.id, subtotal, tax, subtotal + tax, expected]
      );
      for (const p of prods) {
        const q = qty.get(p.sku);
        await conn.query(
          'INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
          [r.insertId, p.id, q, p.price, p.price * q]
        );
      }
      await conn.query('INSERT INTO purchase_order_logs (po_id, user_id, action, note) VALUES (?, ?, ?, ?)', [
        r.insertId, req.user.id, 'created', 'PO Dibuat — Menunggu Konfirmasi',
      ]);
      await conn.commit();
      return (await loadPos(poNumber))[0];
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  },

  // body: { st, logs: [{ t }] } -> st = status tampilan web, logs = catatan aktivitas BARU saja
  async update(number, b, req) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query('SELECT * FROM purchase_orders WHERE po_number=? FOR UPDATE', [number]);
      if (!rows.length) throw httpError(404, 'PO tidak ditemukan.');
      const po = rows[0];

      const wanted = WEB_TO_PO[b.st];
      if (b.st && wanted && b.st !== poWebStatus(po)) {
        if (!['pending', 'approved', 'shipping'].includes(po.status)) throw httpError(409, 'Status PO ini tidak dapat diubah.');
        await conn.query('UPDATE purchase_orders SET status=? WHERE id=?', [wanted, po.id]);
      }

      const logs = Array.isArray(b.logs) ? b.logs.slice(0, 10) : [];
      for (const l of logs) {
        const text = str(l && l.t, 255);
        if (!text) continue;
        const action = /disetujui/i.test(text) ? 'approved' : /ditolak/i.test(text) ? 'rejected' : 'note';
        await conn.query('INSERT INTO purchase_order_logs (po_id, user_id, action, note) VALUES (?, ?, ?, ?)', [po.id, req.user.id, action, text]);
      }
      await conn.commit();
      return (await loadPos(number))[0];
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  },
};

// ---------------------------------------------------------------- discrepancy
const discrepancies = {
  async update(number, b) {
    const status = WEB_TO_DISC[b.st];
    if (!status) throw httpError(422, 'Status tidak valid.');
    const [[cur]] = await pool.query('SELECT status FROM discrepancies WHERE disc_number=?', [number]);
    if (!cur) throw httpError(404, 'Laporan tidak ditemukan.');
    // "Menunggu Review" mencakup submitted dan reviewed: jangan ubah bila sudah salah satunya
    if (DISC_TO_WEB[cur.status] !== b.st) {
      await pool.query('UPDATE discrepancies SET status=? WHERE disc_number=?', [status, number]);
    }
    return (await loadDiscrepancies(number))[0];
  },
};

// ---------------------------------------------------------------- routing
// Aturan: semua akun boleh membaca dan membuat PO; mengubah master data/user/PO/discrepancy khusus Manager & Admin.
const HANDLERS = {
  suppliers: { handler: suppliers, id: Number, guard: { create: MANAGERS, update: MANAGERS, remove: MANAGERS } },
  products: { handler: products, id: Number, guard: { create: MANAGERS, update: MANAGERS, remove: MANAGERS } },
  users: { handler: users, id: Number, guard: { create: MANAGERS, update: MANAGERS, remove: MANAGERS } },
  pos: { handler: pos, id: String, guard: { create: null, update: MANAGERS } },
  discrepancies: { handler: discrepancies, id: String, guard: { update: MANAGERS } },
};

function route(method, action) {
  return (req, res, next) => {
    const cfg = HANDLERS[req.params.collection];
    const fn = cfg && cfg.handler[action];
    if (!fn) return next(httpError(cfg ? 405 : 404, cfg ? 'Aksi ini tidak tersedia untuk data tersebut.' : 'Data tidak ditemukan.'));
    const roles = cfg.guard[action];
    const run = () =>
      Promise.resolve()
        .then(async () => {
          const id = req.params.id == null ? undefined : cfg.id(req.params.id);
          if (action === 'remove') {
            await fn(id, req);
            return res.json({ status: 'success' });
          }
          const item = action === 'create' ? await fn(req.body || {}, req) : await fn(id, req.body || {}, req);
          res.status(action === 'create' ? 201 : 200).json({ status: 'success', item });
        })
        .catch(next);
    if (roles) return requireRole(...roles)(req, res, run);
    return run();
  };
}

router.post('/:collection', route('post', 'create'));
router.put('/:collection/:id', route('put', 'update'));
router.delete('/:collection/:id', route('delete', 'remove'));

module.exports = router;
