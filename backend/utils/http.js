// Pembungkus handler async agar error masuk ke error handler Express
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Membuat error dengan status HTTP
const httpError = (status, message, extra = {}) =>
  Object.assign(new Error(message), { status, ...extra });

module.exports = { wrap, httpError };
