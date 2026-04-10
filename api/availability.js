/**
 * GET /api/availability — MULTI-PATH DIAGNOSTIC
 * Probes multiple ST API paths to find the correct capacity endpoint.
 */

const axios = require('axios');

const ST_AUTH_URL   = 'https://auth.servicetitan.io/connect/token';
const ST_API_BASE   = 'https://api.servicetitan.io';
const TENANT_ID     = process.env.ST_TENANT_ID     || '1498628772';
const APP_KEY       = process.env.ST_APP_KEY        || process.env.ST_APP_ID || process.env.SERVICETITAN_APP_KEY;
const CLIENT_ID     = process.env.ST_CLIENT_ID      || process.env.SERVICETITAN_CLIENT_ID;
const CLIENT_SECRET = process.env.ST_CLIENT_SECRET  || process.env.SERVICETITAN_CLIENT_SECRET;

let cachedToken    = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;

  const res = await axios.post(
    ST_AUTH_URL,
    new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  cachedToken    = res.data.access_token;
  tokenExpiresAt = Date.now() + (res.data.expires_in * 1000);
  return cachedToken;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = await getAccessToken();
    const headers = { Authorization: `Bearer ${token}`, 'ST-App-Key': APP_KEY };

    // Probe multiple possible paths
    const paths = [
      `/dispatch/v2/tenant/${TENANT_ID}/capacity`,
      `/dispatch/v2/tenant/${TENANT_ID}/capacity/availability`,
      `/dispatch/v2/tenant/${TENANT_ID}/available-capacity`,
      `/jpm/v2/tenant/${TENANT_ID}/capacity`,
      `/jpm/v2/tenant/${TENANT_ID}/available-capacity`,
      `/scheduling/v2/tenant/${TENANT_ID}/capacity`,
      `/scheduling/v2/tenant/${TENANT_ID}/availability`,
      `/dispatch/v2/tenant/${TENANT_ID}/capacity?businessUnitId=6534`,
    ];

    const results = [];
    for (const path of paths) {
      try {
        const r = await axios.get(`${ST_API_BASE}${path}`, {
          headers,
          validateStatus: () => true,
          timeout: 5000,
        });
        results.push({ path, status: r.status, title: r.data?.title || null });
      } catch (e) {
        results.push({ path, status: 'error', message: e.message });
      }
    }

    return res.status(200).json({ results });

  } catch (err) {
    return res.status(200).json({
      error: err.message,
      responseData: err.response?.data || null,
    });
  }
};
