const router = require('express').Router();
const pool = require('../db');
const { wrap } = require('../utils/http');
const { tokens, like } = require('../utils/search');

async function findProducts({ q, supplierId, sort }) {
  const where = [];
  const params = [];
  if (supplierId) {
    where.push('p.supplier_id = ?');
    params.push(Number(supplierId));
  }
  // Dengan supplier terpilih cukup cocokkan nama/SKU item; tanpa supplier, nama supplier ikut dicocokkan
  const haystack = supplierId ? "CONCAT_WS(' ', p.name, p.sku)" : "CONCAT_WS(' ', p.name, p.sku, s.name)";
  for (const t of tokens(q)) {
    where.push(`${haystack} LIKE ?`);
    params.push(like(t));
  }
  const [rows] = await pool.query(
    `SELECT p.id, p.supplier_id, p.name, p.sku, p.unit, p.price, p.image_url, s.name AS supplier_name
       FROM products p JOIN suppliers s ON s.id = p.supplier_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY p.name ${sort === 'desc' ? 'DESC' : 'ASC'}`,
    params
  );
  return rows;
}

async function findSuppliers(q) {
  const where = [];
  const params = [];
  for (const t of tokens(q)) {
    where.push('name LIKE ?');
    params.push(like(t));
  }
  const [rows] = await pool.query(
    `SELECT id, name, email, phone FROM suppliers ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name`,
    params
  );
  return rows;
}

// GET /api/products?q=&supplier_id=&sort=asc|desc
router.get('/products', wrap(async (req, res) => {
  const items = await findProducts({ q: req.query.q, supplierId: req.query.supplier_id, sort: req.query.sort });
  res.json({ status: 'success', total: items.length, items });
}));

// GET /api/suppliers?q=
router.get('/suppliers', wrap(async (req, res) => {
  const items = await findSuppliers(req.query.q);
  res.json({ status: 'success', total: items.length, items });
}));

// GET /api/search?q=&type=semua|supplier|item
router.get('/search', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = ['supplier', 'item'].includes(req.query.type) ? req.query.type : 'semua';
  if (!q) return res.json({ status: 'success', items: [], suppliers: [] });
  const items = type === 'supplier' ? [] : await findProducts({ q });
  const suppliers = type === 'item' ? [] : await findSuppliers(q);
  res.json({ status: 'success', items, suppliers });
}));

module.exports = router;
