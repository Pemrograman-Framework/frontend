const router = require('express').Router();
const { saveImage } = require('../utils/uploads');
const pool = require('../db');
const { wrap, httpError } = require('../utils/http');
const { tokens, like } = require('../utils/search');

// PO yang lewat tanggal perkiraan tiba dan belum diterima ditampilkan sebagai "overdue"
const DISPLAY =
  "CASE WHEN po.status IN ('approved','shipping') AND po.expected_at < CURDATE() THEN 'overdue' ELSE po.status END";
const ACTIVE = ['pending', 'approved', 'shipping', 'partial'];
const FILTERS = { selesai: ['completed'], rusak: ['damaged'], proses: ACTIVE, batal: ['cancelled'] };
const ISSUE_TYPES = ['Kerusakan Barang', 'Barang Kurang', 'Salah Barang'];

async function loadPo(db, id) {
  const [rows] = await db.query(
    `SELECT po.id, po.po_number, po.status, ${DISPLAY} AS display_status, po.subtotal, po.tax, po.total,
            po.ordered_at, po.expected_at, s.id AS supplier_id, s.name AS supplier_name, s.email AS supplier_email
       FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = ?`,
    [id]
  );
  if (!rows.length) return null;
  const [items] = await db.query(
    `SELECT i.id, i.product_id, p.name AS product_name, p.sku, p.unit, i.quantity, i.unit_price,
            i.subtotal, i.received_good, i.received_damaged
       FROM purchase_order_items i JOIN products p ON p.id = i.product_id
      WHERE i.po_id = ? ORDER BY i.id`,
    [id]
  );
  return { ...rows[0], items };
}

const nextSeq = async (conn, table, col) => {
  const [[r]] = await conn.query(
    `SELECT IFNULL(MAX(CAST(SUBSTRING_INDEX(${col}, '-', -1) AS UNSIGNED)), 0) + 1 AS next FROM ${table} FOR UPDATE`
  );
  return r.next;
};

// GET /api/purchase-orders?filter=semua|selesai|proses|rusak|batal&q=   (riwayat PO)
router.get('/', wrap(async (req, res) => {
  const where = [];
  const params = [];
  const statuses = FILTERS[String(req.query.filter || '').toLowerCase()];
  if (statuses) {
    where.push('po.status IN (?)');
    params.push(statuses);
  }
  for (const t of tokens(req.query.q)) {
    where.push("CONCAT_WS(' ', po.po_number, s.name) LIKE ?");
    params.push(like(t));
  }
  const [items] = await pool.query(
    `SELECT po.id, po.po_number, po.status, ${DISPLAY} AS display_status, po.total, po.ordered_at, s.name AS supplier_name
       FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY po.ordered_at DESC, po.id DESC`,
    params
  );
  res.json({ status: 'success', items });
}));

// GET /api/purchase-orders/receiving   (PO aktif yang siap diterima)
router.get('/receiving', wrap(async (req, res) => {
  const [items] = await pool.query(
    `SELECT po.id, po.po_number, po.status, ${DISPLAY} AS display_status, po.ordered_at, po.expected_at, s.name AS supplier_name
       FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.status IN ('approved','shipping','partial')
      ORDER BY po.ordered_at DESC, po.id DESC`
  );
  res.json({ status: 'success', items });
}));

// GET /api/purchase-orders/:id
router.get('/:id(\\d+)', wrap(async (req, res) => {
  const po = await loadPo(pool, Number(req.params.id));
  if (!po) throw httpError(404, 'PO tidak ditemukan.');
  res.json({ status: 'success', po });
}));

// POST /api/purchase-orders   { supplier_id, items: [{ product_id, quantity }] }
router.post('/', wrap(async (req, res) => {
  const { supplier_id: supplierId, items } = req.body || {};
  if (!supplierId) throw httpError(422, 'Supplier wajib dipilih.');
  if (!Array.isArray(items) || !items.length) throw httpError(422, 'Minimal 1 item harus ditambahkan.');

  const qty = new Map();
  for (const it of items) {
    const pid = Number(it.product_id);
    const q = Number(it.quantity);
    if (!pid || !Number.isInteger(q) || q <= 0) throw httpError(422, 'Kuantitas harus berupa bilangan bulat lebih dari 0.');
    qty.set(pid, (qty.get(pid) || 0) + q);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [sups] = await conn.query('SELECT id FROM suppliers WHERE id=?', [supplierId]);
    if (!sups.length) throw httpError(422, 'Supplier tidak ditemukan.');

    const ids = [...qty.keys()];
    const [prods] = await conn.query('SELECT id, price FROM products WHERE supplier_id=? AND id IN (?)', [supplierId, ids]);
    if (prods.length !== ids.length) throw httpError(422, 'Ada item yang bukan milik supplier terpilih.');

    let subtotal = 0;
    for (const p of prods) subtotal += p.price * qty.get(p.id);
    const tax = Math.round(subtotal * 0.11); // PPN 11% otomatis
    const total = subtotal + tax;

    const now = new Date();
    const seq = await nextSeq(conn, 'purchase_orders', 'po_number');
    const poNumber = `PO-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;
    const expected = new Date(now.getTime() + 7 * 86400000);

    const [r] = await conn.query(
      `INSERT INTO purchase_orders (po_number, supplier_id, created_by, status, subtotal, tax, total, ordered_at, expected_at)
       VALUES (?, ?, ?, 'shipping', ?, ?, ?, NOW(), ?)`,
      [poNumber, supplierId, req.user.id, subtotal, tax, total, expected]
    );
    for (const p of prods) {
      const q = qty.get(p.id);
      await conn.query(
        'INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
        [r.insertId, p.id, q, p.price, p.price * q]
      );
    }
    await conn.query('INSERT INTO purchase_order_logs (po_id, user_id, action, note) VALUES (?, ?, ?, ?)', [
      r.insertId, req.user.id, 'created', 'PO dibuat dan dikirim ke supplier',
    ]);
    await conn.commit();
    res.status(201).json({ status: 'success', po: await loadPo(pool, r.insertId) });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// PATCH /api/purchase-orders/:id/status   { status: approved|shipping|cancelled }
router.patch('/:id(\\d+)/status', wrap(async (req, res) => {
  const next = String((req.body || {}).status || '');
  if (!['approved', 'shipping', 'cancelled'].includes(next)) throw httpError(422, 'Status tidak valid.');
  const [rows] = await pool.query('SELECT status FROM purchase_orders WHERE id=?', [req.params.id]);
  if (!rows.length) throw httpError(404, 'PO tidak ditemukan.');
  if (!['pending', 'approved', 'shipping'].includes(rows[0].status)) throw httpError(409, 'Status PO ini tidak dapat diubah.');
  await pool.query('UPDATE purchase_orders SET status=? WHERE id=?', [next, req.params.id]);
  await pool.query('INSERT INTO purchase_order_logs (po_id, user_id, action, note) VALUES (?, ?, ?, ?)', [
    req.params.id, req.user.id, 'status', `Status diubah menjadi ${next}`,
  ]);
  res.json({ status: 'success', po: await loadPo(pool, Number(req.params.id)) });
}));

// POST /api/purchase-orders/:id/receive
// { items: [{ item_id, good, damaged }], discrepancy?: { item_id, type, description, photo_name } }
router.post('/:id(\\d+)/receive', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { items, discrepancy } = req.body || {};
  if (!Array.isArray(items) || !items.length) throw httpError(422, 'Data penerimaan kosong.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [pos] = await conn.query(
      'SELECT po.id, po.po_number, s.name AS supplier_name, po.status FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.id=? FOR UPDATE',
      [id]
    );
    if (!pos.length) throw httpError(404, 'PO tidak ditemukan.');
    const po = pos[0];
    if (!['approved', 'shipping', 'partial'].includes(po.status)) {
      throw httpError(409, 'PO ini tidak dapat diterima pada status saat ini.');
    }

    const [dbItems] = await conn.query(
      `SELECT i.id, i.quantity, i.received_good, i.received_damaged, p.name AS product_name, p.unit
         FROM purchase_order_items i JOIN products p ON p.id = i.product_id WHERE i.po_id = ?`,
      [id]
    );
    const byId = new Map(dbItems.map((r) => [r.id, r]));

    const summary = [];
    for (const it of items) {
      const row = byId.get(Number(it.item_id));
      if (!row) throw httpError(422, 'Item tidak termasuk dalam PO ini.');
      const good = Number(it.good);
      const damaged = Number(it.damaged || 0);
      if (!Number.isInteger(good) || !Number.isInteger(damaged) || good < 0 || damaged < 0) {
        throw httpError(422, `Jumlah untuk ${row.product_name} tidak valid.`);
      }
      const remaining = row.quantity - row.received_good - row.received_damaged;
      if (good + damaged > remaining) {
        throw httpError(422, `Jumlah ${row.product_name} melebihi sisa pesanan (${remaining}).`);
      }
      if (good + damaged === 0) continue;
      await conn.query(
        'UPDATE purchase_order_items SET received_good = received_good + ?, received_damaged = received_damaged + ? WHERE id = ?',
        [good, damaged, row.id]
      );
      row.received_good += good;
      row.received_damaged += damaged;
      summary.push({ item_id: row.id, product_name: row.product_name, unit: row.unit, ordered: remaining, good, damaged });
    }
    if (!summary.length) throw httpError(422, 'Tidak ada jumlah yang diterima.');

    const allDone = dbItems.every((r) => r.received_good + r.received_damaged >= r.quantity);
    const anyDamaged = dbItems.some((r) => r.received_damaged > 0);
    const newStatus = allDone ? (anyDamaged ? 'damaged' : 'completed') : 'partial';
    await conn.query('UPDATE purchase_orders SET status=? WHERE id=?', [newStatus, id]);

    let disc = null;
    if (discrepancy) {
      const target = summary.find((s) => s.item_id === Number(discrepancy.item_id));
      if (!target || target.damaged <= 0) throw httpError(422, 'Laporan masalah harus mengacu pada item yang bermasalah.');
      const type = ISSUE_TYPES.includes(discrepancy.type) ? discrepancy.type : ISSUE_TYPES[0];
      const savedPhoto = saveImage(discrepancy.photo_data);
      const seq = await nextSeq(conn, 'discrepancies', 'disc_number');
      const discNumber = `DISC-${new Date().getFullYear()}-${String(seq).padStart(3, '0')}`;
      await conn.query(
        `INSERT INTO discrepancies (disc_number, po_id, po_item_id, type, qty_problem, qty_good, description, photo_name, status, reported_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?)`,
        [discNumber, id, target.item_id, type, target.damaged, target.good,
         String(discrepancy.description || '').slice(0, 500), savedPhoto || String(discrepancy.photo_name || '').slice(0, 200), req.user.id]
      );
      disc = { disc_number: discNumber, type, qty_problem: target.damaged, qty_good: target.good, product_name: target.product_name, unit: target.unit, ordered: target.ordered };
    }

    await conn.query('INSERT INTO purchase_order_logs (po_id, user_id, action, note) VALUES (?, ?, ?, ?)', [
      id, req.user.id, 'received', disc ? `Diterima dengan discrepancy ${disc.disc_number}` : 'Barang diterima',
    ]);
    await conn.commit();

    res.json({
      status: 'success',
      po_number: po.po_number,
      supplier_name: po.supplier_name,
      po_status: newStatus,
      received_at: new Date().toISOString(),
      items: summary,
      discrepancy: disc,
    });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

module.exports = router;
