/**
 * GET /api/availability — DIAGNOSTIC MODE
 * Tests the ST Dispatch Capacity API path and returns raw results.
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

    // Test bare path — no query params
    const testUrl = `${ST_API_BASE}/dispatch/v2/tenant/${TENANT_ID}/capacity`;
    const testRes = await axios.get(testUrl, {
      headers: { Authorization: `Bearer ${token}`, 'ST-App-Key': APP_KEY },
      validateStatus: () => true,
    });

    return res.status(200).json({
      diagnostic: {
        url: testUrl,
        httpStatus: testRes.status,
        body: testRes.data,
        tenantId: TENANT_ID,
        appKey: APP_KEY ? `${APP_KEY.substring(0, 8)}...` : 'MISSING',
        clientId: CLIENT_ID ? `${CLIENT_ID.substring(0, 8)}...` : 'MISSING',
        tokenOk: !!token,
      }
    });

  } catch (err) {
    return res.status(200).json({
      diagnostic: {
        error: err.message,
        responseData: err.response?.data || null,
        responseStatus: err.response?.status || null,
        tenantId: TENANT_ID,
        appKey: APP_KEY ? `${APP_KEY.substring(0, 8)}...` : 'MISSING',
        clientId: CLIENT_ID ? `${CLIENT_ID.substring(0, 8)}...` : 'MISSING',
      }
    });
  }
};
