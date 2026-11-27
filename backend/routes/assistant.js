const router = require('express').Router();
const pool = require('../db');
const { wrap, httpError } = require('../utils/http');

const STATUS_LABEL = {
  pending: 'Pending Approval',
  approved: 'Disetujui',
  shipping: 'Sedang Dikirim',
  partial: 'Selesai Sebagian',
  completed: 'Selesai',
  damaged: 'Rusak',
  cancelled: 'Batal',
};
const DISC_LABEL = { submitted: 'Terkirim', reviewed: 'Ditinjau', resolved: 'Selesai', closed: 'Ditutup' };

// Menyusun ringkasan item PO: "Produk A (+1 item lain)"
async function poCards(where, params) {
  const [pos] = await pool.query(
    `SELECT po.id, po.po_number, po.status FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id ${where} ORDER BY po.ordered_at DESC LIMIT 5`,
    params
  );
  const cards = [];
  for (const po of pos) {
    const [items] = await pool.query(
      'SELECT p.name FROM purchase_order_items i JOIN products p ON p.id = i.product_id WHERE i.po_id=? ORDER BY i.id',
      [po.id]
    );
    const first = items[0] ? items[0].name : '-';
    cards.push({
      id: po.id,
      po_number: po.po_number,
      item: items.length > 1 ? `${first} (+${items.length - 1} item lain)` : first,
      status_label: STATUS_LABEL[po.status] || po.status,
    });
  }
  return cards;
}

// POST /api/assistant   { message }
// Asisten berbasis aturan sederhana yang membaca data langsung dari database.
router.post('/', wrap(async (req, res) => {
  const message = String((req.body || {}).message || '').trim();
  if (!message) throw httpError(422, 'Pesan tidak boleh kosong.');
  const low = message.toLowerCase();

  const [sups] = await pool.query('SELECT id, name FROM suppliers');
  const supplier = sups.find((s) => low.includes(s.name.toLowerCase()));

  // Nomor PO spesifik
  const poNo = message.match(/po-\d{4}(?:-\d{2})?-\d{4}/i);
  if (poNo) {
    const cards = await poCards('WHERE po.po_number = ?', [poNo[0].toUpperCase()]);
    return res.json({
      reply: cards.length ? `Berikut data untuk ${poNo[0].toUpperCase()}:` : `PO ${poNo[0].toUpperCase()} tidak ditemukan.`,
      cards,
    });
  }

  if (/pending|menunggu|persetujuan|approval/.test(low)) {
    const cards = await poCards(
      `WHERE po.status = 'pending' ${supplier ? 'AND po.supplier_id = ?' : ''}`,
      supplier ? [supplier.id] : []
    );
    const who = supplier ? ` untuk ${supplier.name}` : '';
    return res.json({
      reply: cards.length ? `Ditemukan ${cards.length} PO Pending${who}:` : `Tidak ada PO pending${who} saat ini.`,
      cards,
    });
  }

  if (/discrepancy|selisih|rusak|kurang|masalah/.test(low)) {
    const [rows] = await pool.query(
      `SELECT d.id, d.po_id, d.status, po.po_number, p.name AS product_name
         FROM discrepancies d JOIN purchase_orders po ON po.id = d.po_id
         JOIN purchase_order_items i ON i.id = d.po_item_id JOIN products p ON p.id = i.product_id
        WHERE d.status NOT IN ('resolved','closed') ORDER BY d.created_at DESC LIMIT 5`
    );
    return res.json({
      reply: rows.length ? `Ada ${rows.length} discrepancy yang belum selesai:` : 'Tidak ada discrepancy yang terbuka. Semua penerimaan aman.',
      cards: rows.map((r) => ({ id: r.po_id, po_number: r.po_number, item: r.product_name, status_label: DISC_LABEL[r.status] || r.status })),
    });
  }

  if (/audit|ringkasan|laporan|summary/.test(low)) {
    const [[a]] = await pool.query("SELECT COUNT(*) AS c FROM purchase_orders WHERE status IN ('pending','approved','shipping','partial')");
    const [[b]] = await pool.query("SELECT COUNT(*) AS c FROM purchase_orders WHERE status = 'completed'");
    const [[c]] = await pool.query("SELECT COUNT(*) AS c FROM discrepancies WHERE status NOT IN ('resolved','closed')");
    return res.json({
      reply: `Ringkasan saat ini: ${a.c} PO aktif, ${b.c} PO selesai, dan ${c.c} discrepancy terbuka.`,
      cards: [],
    });
  }

  if (/buat po|pesan|order baru/.test(low)) {
    return res.json({
      reply: 'Untuk membuat PO baru, ketuk tombol "Buat PO Baru" di bawah, pilih supplier, lalu isi kuantitas item.',
      cards: [],
    });
  }

  res.json({
    reply: 'Saya bisa membantu mengecek status PO (mis. "PO pending dari Arutala Coffee"), discrepancy receiving, atau ringkasan audit. Coba tanyakan salah satunya.',
    cards: [],
  });
}));

module.exports = router;
