/**
 * GET /api/availability
 * ─────────────────────────────────────────────────────────────
 * Returns available dispatch capacity from ServiceTitan's
 * Adaptive Capacity API for the next 14 days.
 *
 * Query params:
 *   serviceType  (required) — hvac | plumbing | electrical
 *   startsOn     (optional) — ISO date string, defaults to today
 * ─────────────────────────────────────────────────────────────
 */

const axios = require('axios');

const ST_AUTH_URL   = 'https://auth.servicetitan.io/connect/token';
const ST_API_BASE   = 'https://api.servicetitan.io';
const TENANT_ID     = process.env.ST_TENANT_ID     || '1498628772';
const APP_KEY       = process.env.ST_APP_KEY        || process.env.ST_APP_ID || process.env.SERVICETITAN_APP_KEY;
const CLIENT_ID     = process.env.ST_CLIENT_ID      || process.env.SERVICETITAN_CLIENT_ID;
const CLIENT_SECRET = process.env.ST_CLIENT_SECRET  || process.env.SERVICETITAN_CLIENT_SECRET;

// Business Unit IDs per service type
const BU_MAP = {
  hvac:       process.env.ST_BU_HVAC,
  plumbing:   process.env.ST_BU_PLUMBING,
  electrical: process.env.ST_BU_ELECTRICAL,
};

// ── Token cache (shared across warm invocations) ─────────────
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

// ── Main handler ──────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { serviceType, startsOn } = req.query || {};

  if (!serviceType) {
    return res.status(400).json({ error: 'serviceType query param is required (hvac, plumbing, electrical)' });
  }

  const buId = BU_MAP[serviceType.toLowerCase()];
  if (!buId) {
    return res.status(400).json({ error: `Invalid serviceType: ${serviceType}. Must be hvac, plumbing, or electrical.` });
  }

  try {
    const token = await getAccessToken();

    // Date range: startsOn (or today) through +14 days
    const start = startsOn ? new Date(startsOn) : new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 14);

    const startsOnOrAfter = start.toISOString();
    const endsOnOrBefore  = end.toISOString();

    const response = await axios.get(
      `${ST_API_BASE}/dispatch/v2/tenant/${TENANT_ID}/capacity`,
      {
        params: {
          businessUnitId:   buId,
          startsOnOrAfter,
          endsOnOrBefore,
        },
        headers: {
          Authorization: `Bearer ${token}`,
          'ST-App-Key':  APP_KEY,
        },
      }
    );

    // Filter out days with no availability and build clean response
    const data = response.data?.data || response.data || [];
    const slots = (Array.isArray(data) ? data : [])
      .filter(day => day.openCapacity > 0 || day.availableHours > 0)
      .map(day => ({
        date:           day.date?.split('T')[0] || day.date,
        availableHours: day.openCapacity ?? day.availableHours ?? 0,
      }));

    return res.status(200).json({ slots });

  } catch (err) {
    const stError = err.response?.data || err.message;
    console.error('[Availability] Error:', stError);

    return res.status(500).json({ error: 'Failed to fetch availability' });
  }
};
