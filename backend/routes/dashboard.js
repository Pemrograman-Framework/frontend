const router = require('express').Router();
const pool = require('../db');
const { wrap } = require('../utils/http');

// GET /api/dashboard
router.get('/', wrap(async (req, res) => {
  const [[active]] = await pool.query(
    "SELECT COUNT(*) AS c FROM purchase_orders WHERE status IN ('pending','approved','shipping','partial')"
  );
  const [[received]] = await pool.query('SELECT IFNULL(SUM(received_good),0) AS c FROM purchase_order_items');
  const [[disc]] = await pool.query("SELECT COUNT(*) AS c FROM discrepancies WHERE status NOT IN ('resolved','closed')");
  const [users] = await pool.query('SELECT name FROM users WHERE id=?', [req.user.id]);

  res.json({
    status: 'success',
    name: users[0] ? users[0].name : '',
    stats: {
      active_po: Number(active.c),
      received_items: Number(received.c),
      discrepancies: Number(disc.c),
    },
  });
}));

module.exports = router;
