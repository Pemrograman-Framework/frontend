const { port, clientOrigins } = require('./config');
const express = require('express');
const cors = require('cors');
const auth = require('./middleware/auth');

const app = express();
// Web (Next.js) memakai cookie, jadi CORS harus menyebut origin secara eksplisit.
// Origin dari localhost / jaringan lokal diizinkan; aplikasi mobile tidak mengirim Origin sama sekali.
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/;
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || clientOrigins.includes(origin) || LOCAL.test(origin)),
  credentials: true,
}));
app.use(express.json({ limit: '12mb' }));
// Foto bukti discrepancy (nama file acak, hanya <img> yang memakainya)
app.use('/uploads', express.static(require('./utils/uploads').UPLOAD_DIR));

// API pertama (cek server hidup)
app.get('/', (req, res) => {
  res.json({ status: 'success', message: 'Backend Anna Brew Berjalan' });
});

// Publik: login, lupa password
app.use('/api/auth', require('./routes/auth'));

// Semua route di bawah ini wajib membawa token JWT
app.use('/api', auth);
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api', require('./routes/catalog')); // /products, /suppliers, /search
app.use('/api/purchase-orders', require('./routes/purchaseOrders'));
app.use('/api/discrepancies', require('./routes/discrepancies'));
app.use('/api/assistant', require('./routes/assistant'));
app.use('/api/data', require('./routes/data')); // data untuk web

app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Endpoint tidak ditemukan.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    status: 'error',
    message: status >= 500 ? 'Terjadi kesalahan pada server.' : err.message,
    ...(err.errors ? { errors: err.errors } : {}),
  });
});

const { bootstrap } = require('./database/bootstrap');

// Siapkan database (tabel, kolom baru, data contoh) lalu nyalakan server
bootstrap()
  .then((r) => {
    if (!r.ok) {
      console.error('Tabel di database belum cocok dengan yang dibutuhkan backend:\n' + r.problems.join('\n'));
      console.error('Jalankan: npm run setup  (atau ganti DB_NAME di backend/.env dengan nama database baru).');
      process.exit(1);
    }
    app.listen(port, '0.0.0.0', () => console.log(`Server berjalan di http://localhost:${port}`));
  })
  .catch((e) => {
    console.error('Gagal menyiapkan database:', e.message);
    console.error('Pastikan MySQL di XAMPP sudah Start dan isi backend/.env sudah benar.');
    process.exit(1);
  });
