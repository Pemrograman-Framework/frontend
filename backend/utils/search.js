// Memecah kata kunci menjadi token (maks 6) dan membuat pola LIKE yang aman
const tokens = (q) =>
  String(q || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);

const like = (t) => '%' + t.replace(/[\\%_]/g, (m) => '\\' + m) + '%';

module.exports = { tokens, like };
