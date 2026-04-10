/**
 * GET /api/availability
 * ─────────────────────────────────────────────────────────────
 * Returns available dispatch capacity from ServiceTitan's
 * Adaptive Capacity API for the next 14 days.
 *
 * Query params:
 *   issue       (required) — the specific issue ID from the widget
 *   startsOn    (optional) — ISO date string, defaults to today
 *
 * Issue → Business Unit mapping:
 *   HVAC Repair (ac-not-cooling, heater-not-working,
 *     strange-noises, hvac-other)              → ST_BU_HVAC_REPAIR
 *   HVAC Maintenance (hvac-maintenance)        → ST_BU_HVAC_MAINTENANCE
 *   HVAC Install (new-system)                  → ST_BU_HVAC_INSTALL
 *   Plumbing (all plumbing issues)             → ST_BU_PLUMBING
 *   Electrical (all electrical issues)         → ST_BU_ELECTRICAL
 * ─────────────────────────────────────────────────────────────
 */

const axios = require('axios');

const ST_AUTH_URL   = 'https://auth.servicetitan.io/connect/token';
const ST_API_BASE   = 'https://api.servicetitan.io';
const TENANT_ID     = process.env.ST_TENANT_ID     || '1498628772';
const APP_KEY       = process.env.ST_APP_KEY        || process.env.ST_APP_ID || process.env.SERVICETITAN_APP_KEY;
const CLIENT_ID     = process.env.ST_CLIENT_ID      || process.env.SERVICETITAN_CLIENT_ID;
const CLIENT_SECRET = process.env.ST_CLIENT_SECRET  || process.env.SERVICETITAN_CLIENT_SECRET;

// Issue → Business Unit ID mapping
const ISSUE_BU_MAP = {
  // HVAC Repair — BU 6534
  'ac-not-cooling':     process.env.ST_BU_HVAC_REPAIR       || '6534',
  'heater-not-working': process.env.ST_BU_HVAC_REPAIR       || '6534',
  'strange-noises':     process.env.ST_BU_HVAC_REPAIR       || '6534',
  'hvac-other':         process.env.ST_BU_HVAC_REPAIR       || '6534',
  // HVAC Maintenance — BU 7831
  'hvac-maintenance':   process.env.ST_BU_HVAC_MAINTENANCE  || '7831',
  // HVAC Install — BU 8085
  'new-system':         process.env.ST_BU_HVAC_INSTALL      || '8085',
  // Plumbing — BU 124467371
  'leak':               process.env.ST_BU_PLUMBING          || '124467371',
  'clogged-drain':      process.env.ST_BU_PLUMBING          || '124467371',
  'water-heater':       process.env.ST_BU_PLUMBING          || '124467371',
  'no-hot-water':       process.env.ST_BU_PLUMBING          || '124467371',
  'toilet-issue':       process.env.ST_BU_PLUMBING          || '124467371',
  'plumbing-other':     process.env.ST_BU_PLUMBING          || '124467371',
  // Electrical — BU 161649734
  'outlet-not-working': process.env.ST_BU_ELECTRICAL        || '161649734',
  'breaker-tripping':   process.env.ST_BU_ELECTRICAL        || '161649734',
  'lighting-issue':     process.env.ST_BU_ELECTRICAL        || '161649734',
  'panel-upgrade':      process.env.ST_BU_ELECTRICAL        || '161649734',
  'ceiling-fan':        process.env.ST_BU_ELECTRICAL        || '161649734',
  'electrical-other':   process.env.ST_BU_ELECTRICAL        || '161649734',
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

  const { issue, startsOn } = req.query || {};

  if (!issue) {
    return res.status(400).json({ error: 'issue query param is required (e.g. ac-not-cooling, leak, panel-upgrade)' });
  }

  const buId = ISSUE_BU_MAP[issue.toLowerCase()];
  if (!buId) {
    return res.status(400).json({ error: `Unknown issue: ${issue}. No business unit mapping found.` });
  }

  try {
    const token = await getAccessToken();

    // ── Diagnostic: test bare path with no query params ────────
    const testUrl = `${ST_API_BASE}/dispatch/v2/tenant/${TENANT_ID}/capacity`;
    console.log('[Availability] Testing URL:', testUrl);
    const testRes = await axios.get(testUrl, {
      headers: { Authorization: `Bearer ${token}`, 'ST-App-Key': APP_KEY },
      validateStatus: () => true, // don't throw on non-2xx
    });
    console.log('[Availability] Bare path status:', testRes.status);
    console.log('[Availability] Bare path body:', JSON.stringify(testRes.data));

    // Return diagnostic result temporarily
    return res.status(200).json({
      _diagnostic: {
        url: testUrl,
        status: testRes.status,
        body: testRes.data,
        tenantId: TENANT_ID,
        appKey: APP_KEY ? `${APP_KEY.substring(0, 6)}...` : 'MISSING',
      }
    });
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

    return res.status(200).json({ slots, _debug: { rawCount: (Array.isArray(data) ? data : []).length, buId, sample: (Array.isArray(data) ? data : []).slice(0, 2) } });

  } catch (err) {
    const stError = err.response?.data || err.message;
    console.error('[Availability] Error:', stError);

    return res.status(500).json({ error: 'Failed to fetch availability', debug: stError });
  }
};
