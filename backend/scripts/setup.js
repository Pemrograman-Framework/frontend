// Menyiapkan database: membuat tabel (jika belum ada), menambah kolom baru, lalu mengisi data contoh.
// Jalankan:  npm run setup      (server juga menjalankannya otomatis saat npm start)
const { bootstrap } = require('../database/bootstrap');

bootstrap()
  .then((r) => {
    if (!r.ok) {
      console.log('\nTabel yang sudah ada di database "' + (process.env.DB_NAME || 'anna_brew') + '" belum cocok dengan yang dibutuhkan backend:');
      console.log(r.problems.join('\n'));
      console.log('\nData TIDAK diubah. Pilihan:');
      console.log('  1) Pakai database baru: ubah DB_NAME di backend/.env (mis. anna_brew_app), lalu jalankan lagi.');
      console.log('  2) Atau tambahkan kolom di atas lewat phpMyAdmin.\n');
      process.exit(1);
    }
    console.log('\nSetup selesai.');
  })
  .catch((e) => {
    console.error('Setup gagal:', e.message);
    console.error('Pastikan MySQL di XAMPP sudah menyala (Start) dan isi backend/.env sudah benar.');
    process.exit(1);
  });
