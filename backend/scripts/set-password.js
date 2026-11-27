// Mengatur password user.  Pemakaian: npm run set-password -- email@contoh.com passwordBaru
require('../config');
const bcrypt = require('bcryptjs');
const pool = require('../db');

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.log('Pemakaian: npm run set-password -- <email> <password minimal 8 karakter>');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  const [r] = await pool.query('UPDATE users SET password_hash=? WHERE email=?', [hash, email.toLowerCase()]);
  console.log(r.affectedRows ? 'Password diperbarui.' : 'User dengan email itu tidak ditemukan.');
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
