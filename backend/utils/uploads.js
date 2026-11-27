const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Menyimpan foto dari data URL (base64) ke backend/uploads. Mengembalikan nama file, atau null jika tidak ada foto.
function saveImage(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(dataUrl);
  if (!m || !TYPES[m[1].toLowerCase()]) {
    const e = new Error('Format foto tidak didukung. Gunakan JPG, PNG, atau WEBP.');
    e.status = 422;
    throw e;
  }
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX_BYTES) {
    const e = new Error('Ukuran foto maksimal 5 MB.');
    e.status = 422;
    throw e;
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `disc-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${TYPES[m[1].toLowerCase()]}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return name;
}

const exists = (name) => !!name && /^[\w.-]+$/.test(name) && fs.existsSync(path.join(UPLOAD_DIR, name));

module.exports = { saveImage, exists, UPLOAD_DIR };
