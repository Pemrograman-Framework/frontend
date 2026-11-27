const router = require('express').Router();
const pool = require('../db');
const { wrap } = require('../utils/http');

// GET /api/discrepancies
router.get('/', wrap(async (req, res) => {
  const [items] = await pool.query(
    `SELECT d.id, d.disc_number, d.type, d.qty_problem, d.qty_good, d.description, d.photo_name, d.status, d.created_at,
            po.po_number, s.name AS supplier_name, p.name AS product_name, p.unit
       FROM discrepancies d
       JOIN purchase_orders po ON po.id = d.po_id
       JOIN suppliers s ON s.id = po.supplier_id
       JOIN purchase_order_items i ON i.id = d.po_item_id
       JOIN products p ON p.id = i.product_id
      ORDER BY d.created_at DESC, d.id DESC`
  );
  res.json({ status: 'success', items });
}));

module.exports = router;
