const jwt = require('jsonwebtoken');
const pool = require('../db');
const { jwtSecret } = require('../config');

const SECRET = jwtSecret;
const COOKIE = 'ab_session';

const unauthorized = (res) =>
  res.status(401).json({ status: 'error', message: 'Sesi berakhir. Silakan login kembali.' });

// Token boleh datang dari header Authorization (aplikasi Flutter) atau cookie httpOnly (web)
function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const p = part.trim();
    if (p.startsWith(COOKIE + '=')) return decodeURIComponent(p.slice(COOKIE.length + 1));
  }
  return null;
}

async function auth(req, res, next) {
  const token = readToken(req);
  if (!token) return unauthorized(res);
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
    if (payload.purpose) throw new Error('token bukan token sesi');
  } catch (e) {
    return unauthorized(res);
  }
  try {
    // Ambil data terbaru: akun yang dihapus / dinonaktifkan langsung kehilangan akses
    const [rows] = await pool.query('SELECT id, name, role, status FROM users WHERE id=?', [payload.id]);
    const u = rows[0];
    if (!u || (u.status && u.status !== 'Aktif')) return unauthorized(res);
    req.user = { id: u.id, name: u.name, role: u.role };
    next();
  } catch (e) {
    next(e);
  }
}

// Pembatasan peran untuk aksi kelola data (web)
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user && req.user.role)) {
    return res.status(403).json({
      status: 'error',
      message: 'Akun Anda tidak memiliki izin untuk mengubah data ini. Gunakan akun Manager atau Admin.',
    });
  }
  next();
};

module.exports = auth;
module.exports.SECRET = SECRET;
module.exports.COOKIE = COOKIE;
module.exports.requireRole = requireRole;
