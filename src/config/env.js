require('dotenv').config();

function text(name, fallback = '') {
  const value = process.env[name];
  if (value === undefined || String(value).trim() === '') return fallback;
  return String(value).trim();
}

function csv(name) {
  return text(name)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function clientOrigins() {
  const configured = csv('CLIENT_ORIGINS');
  if (configured.length) return configured;
  if (text('NODE_ENV') === 'production') {
    throw new Error('CLIENT_ORIGINS is required in production');
  }
  const port = text('PORT', '2130');
  return [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ];
}

module.exports = {
  text,
  csv,
  clientOrigins,
};
