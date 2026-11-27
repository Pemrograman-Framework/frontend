const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const authMw = require('../middleware/auth');
const { SECRET, COOKIE } = authMw;
const { isProd } = require('../config');
const { wrap, httpError } = require('../utils/http');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  location: u.location,
  nama: u.name, // alias untuk tampilan web
});

// POST /api/auth/login
router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const errors = {};
  if (!email || !EMAIL_RE.test(String(email).trim())) errors.email = 'Email tidak valid. Contoh: aliyah@gmail.com.';
  if (!password || String(password).length < 8) errors.password = 'Kata sandi minimal 8 karakter.';
  if (Object.keys(errors).length) {
    return res.status(422).json({ status: 'error', message: 'Mohon perbaiki data yang ditandai merah.', errors });
  }

  const [rows] = await pool.query('SELECT * FROM users WHERE email=?', [String(email).trim().toLowerCase()]);
  const user = rows[0];
  const ok = user && (await bcrypt.compare(String(password), user.password_hash));
  if (!ok) {
    return res.status(401).json({ status: 'error', message: 'Email atau kata sandi salah.' });
  }
  if (user.status && user.status !== 'Aktif') {
    return res.status(403).json({ status: 'error', message: 'Akun Anda dinonaktifkan. Hubungi Admin.' });
  }
  const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '7d' });
  // Cookie httpOnly dipakai oleh web; aplikasi mobile memakai token di body
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 7 * 86400000, path: '/' });
  res.json({ status: 'success', token, user: publicUser(user) });
}));

// POST /api/auth/forgot  -> kirim kode OTP 4 digit
// Belum ada layanan email: kode dicetak di terminal backend. Saat NODE_ENV bukan production,
// kode juga dikembalikan di field devOtp supaya bisa dites langsung dari aplikasi.
router.post('/forgot', wrap(async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw httpError(422, 'Email tidak valid. Contoh: aliyah@gmail.com.');
  }
  const [rows] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
  const body = { status: 'success', message: 'Jika email terdaftar, kode OTP telah dikirim.' };
  if (rows.length) {
    const otp = String(Math.floor(1000 + Math.random() * 9000));
    await pool.query(
      'UPDATE users SET otp_code=?, otp_expires_at=DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id=?',
      [otp, rows[0].id]
    );
    console.log(`[OTP] ${email} -> ${otp} (berlaku 10 menit)`);
    if (process.env.NODE_ENV !== 'production') body.devOtp = otp;
  }
  res.json(body);
}));

// POST /api/auth/verify-otp
router.post('/verify-otp', wrap(async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const otp = String((req.body || {}).otp || '').trim();
  const [rows] = await pool.query(
    'SELECT id FROM users WHERE email=? AND otp_code=? AND otp_expires_at > NOW()',
    [email, otp]
  );
  if (!rows.length || otp.length !== 4) {
    throw httpError(400, 'Kode OTP salah atau sudah kedaluwarsa.');
  }
  const resetToken = jwt.sign({ id: rows[0].id, purpose: 'reset' }, SECRET, { expiresIn: '10m' });
  res.json({ status: 'success', resetToken });
}));

// POST /api/auth/reset-password
router.post('/reset-password', wrap(async (req, res) => {
  const { resetToken, password } = req.body || {};
  let payload;
  try {
    payload = jwt.verify(String(resetToken || ''), SECRET);
  } catch (e) {
    throw httpError(400, 'Sesi atur ulang password sudah habis. Ulangi dari awal.');
  }
  if (payload.purpose !== 'reset') throw httpError(400, 'Token tidak valid.');
  if (!password || String(password).length < 8) throw httpError(422, 'Gunakan minimal 8 karakter.');

  const hash = await bcrypt.hash(String(password), 10);
  await pool.query('UPDATE users SET password_hash=?, otp_code=NULL, otp_expires_at=NULL WHERE id=?', [hash, payload.id]);
  res.json({ status: 'success', message: 'Password berhasil diubah.' });
}));

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ status: 'success' });
});

// GET /api/auth/me
router.get('/me', authMw, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE id=?', [req.user.id]);
  if (!rows.length) throw httpError(401, 'Sesi berakhir. Silakan login kembali.');
  res.json({ status: 'success', user: publicUser(rows[0]) });
}));

module.exports = router;
