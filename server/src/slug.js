const RESERVED = new Set(['login', 'api', 'admin', 'panel', 'health', 'logout', 'favicon', 'robots', 'sitemap', 'historial']);
function validSlug(value) {
  return typeof value === 'string' && value.length >= 2 && value.length <= 63 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && !RESERVED.has(value);
}
module.exports = { validSlug };
