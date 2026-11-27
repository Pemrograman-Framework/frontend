# Anna Brew – Web + Backend (satu project)

Web (Next.js) dan backend (Express + MySQL) sekarang berada di satu project. Backend yang sama juga dipakai aplikasi mobile Flutter AnnaBrew.

## Cara menjalankan (3 langkah)
1. Nyalakan **MySQL** di XAMPP (Start).
2. Buka terminal di folder ini lalu: `npm install`
3. Jalankan: `npm run dev`  (atau klik dua kali `JALANKAN.bat` di Windows)

Web: http://localhost:3000   API: http://localhost:4000

Saat pertama kali jalan, backend otomatis membuat database `anna_brew`, tabel, dan data contoh. Tidak perlu import SQL. Pengaturan database ada di `backend/.env` (default XAMPP: user `root`, tanpa password).

## Akun
| Email | Password | Role | Keterangan |
|---|---|---|---|
| ayupatricia@gmail.com | Anna2026! | Manager | Login web (bisa ubah data) |
| aliyah@gmail.com | password123 | Staff Gudang | Login mobile; di web hanya bisa melihat |
| helixa@gmail.com | password123 | Staff | |

Akun baru dari halaman Kelola User mendapat password awal `Anna2026!` (ubah lewat `DEFAULT_USER_PASSWORD` di `backend/.env`). Hanya Manager/Admin yang boleh menambah/ubah/hapus data di web.

## Aplikasi mobile
Di `frontend/anna_brew/lib/config.dart` (project Flutter) alamat backend: emulator `http://10.0.2.2:4000`, HP fisik `http://IP-KOMPUTER:4000`.

## Perintah
- `npm run dev` web + API sekaligus  · `npm run dev:web` / `npm run dev:api` terpisah
- `npm run setup` jalankan ulang penyiapan database
- `npm run set-password -- email passwordBaru` ganti password akun
- `npm run build` lalu `npm start` untuk produksi

## Catatan
- Perubahan di web (supplier, produk, user, status PO, discrepancy) tersimpan ke MySQL dan langsung terlihat di aplikasi mobile, begitu juga sebaliknya (muat ulang halaman).
- PPN 11% otomatis, sama dengan aplikasi mobile.
- Lupa password di web masih simulasi (tidak ada layanan email); di mobile kode OTP tampil di terminal backend.
