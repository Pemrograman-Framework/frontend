// Memuat file .env milik folder backend, di mana pun perintah dijalankan
// (dari folder backend maupun dari root project web).
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

module.exports = {
  port: Number(process.env.PORT || 4000),
  isProd: process.env.NODE_ENV === 'production',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  // Password awal untuk akun yang dibuat dari halaman Kelola User (web)
  defaultUserPassword: process.env.DEFAULT_USER_PASSWORD || 'Anna2026!',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
