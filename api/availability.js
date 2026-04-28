/**
 * GET /api/availability
 * ─────────────────────────────────────────────────────────────
 * Returns available dispatch capacity from ServiceTitan's
 * Dispatch Capacity API (POST) for the next 14 days.
 *
 * Query params:
 *   issue    (required) — the specific issue ID from the widget
 *   startsOn (optional) — ISO date string, defaults to today
 *
 * Issue → Job Type + Business Unit mapping:
 *   HVAC Repair  → jobTypeId 460,  BU 6534
 *   HVAC Maint   → jobTypeId 528,  BU 7831
 *   HVAC Install → jobTypeId 831156, BU 8085
 *   Plumbing     → jobTypeId 521,  BU 124467371
 *   Electrical   → jobTypeId 509,  BU 161649734
 *   Elec Estimate→ jobTypeId 462,  BU 161649734
 * ─────────────────────────────────────────────────────────────
 */

const axios = require('axios');

const ST_AUTH_URL   = 'https://auth.servicetitan.io/connect/token';
const ST_API_BASE   = 'https://api.servicetitan.io';
const TENANT_ID     = process.env.ST_TENANT_ID     || '1498628772';
const APP_KEY       = process.env.ST_APP_KEY        || process.env.ST_APP_ID || process.env.SERVICETITAN_APP_KEY;
const CLIENT_ID     = process.env.ST_CLIENT_ID      || process.env.SERVICETITAN_CLIENT_ID;
const CLIENT_SECRET = process.env.ST_CLIENT_SECRET  || process.env.SERVICETITAN_CLIENT_SECRET;

// Issue → { jobTypeId, businessUnitId }
const JOB_TYPE_MAP = {
  // ── HVAC ──────────────────────────────────────────────────
  'ac-not-cooling':     { jobTypeId: 460,    businessUnitId: 6534 },
  'heater-not-working': { jobTypeId: 460,    businessUnitId: 6534 },
  'strange-noises':     { jobTypeId: 460,    businessUnitId: 6534 },
  'hvac-other':         { jobTypeId: 460,    businessUnitId: 6534 },
  'hvac-maintenance':   { jobTypeId: 528,    businessUnitId: 7831 },
  'new-system':         { jobTypeId: 831156, businessUnitId: 8085 },
  // ── Plumbing ──────────────────────────────────────────────
  'leak':               { jobTypeId: 521,    businessUnitId: 124467371 },
  'clogged-drain':      { jobTypeId: 521,    businessUnitId: 124467371 },
  'water-heater':       { jobTypeId: 521,    businessUnitId: 124467371 },
  'no-hot-water':       { jobTypeId: 521,    businessUnitId: 124467371 },
  'toilet-issue':       { jobTypeId: 521,    businessUnitId: 124467371 },
  'plumbing-other':     { jobTypeId: 521,    businessUnitId: 124467371 },
  // ── Electrical ────────────────────────────────────────────
  'outlet-not-working': { jobTypeId: 515,    businessUnitId: 161649734 },
  'breaker-tripping':   { jobTypeId: 515,    businessUnitId: 161649734 },
  'lighting-issue':     { jobTypeId: 515,    businessUnitId: 161649734 },
  'panel-upgrade':      { jobTypeId: 515,    businessUnitId: 161649734 },
  'ceiling-fan':        { jobTypeId: 515,    businessUnitId: 161649734 },
  'electrical-other':   { jobTypeId: 515,    businessUnitId: 161649734 },
  // ── Members: HVAC Tune-Ups (by system count) ─────────────
  'members-hvac-1-system': { jobTypeId: 528,       businessUnitId: 7831 },
  'members-hvac-2-system': { jobTypeId: 161649782, businessUnitId: 7831 },
  'members-hvac-3-system': { jobTypeId: 161649821, businessUnitId: 7831 },
  'members-hvac-4-system': { jobTypeId: 161649788, businessUnitId: 7831 },
  'members-hvac-5-system': { jobTypeId: 1753588,   businessUnitId: 7831 },
  'members-hvac-6-system': { jobTypeId: 495,       businessUnitId: 7831 },
  // ── Members: Inspections ──────────────────────────────────
  'members-plumbing-inspection':   { jobTypeId: 148475761, businessUnitId: 124468396 },
  'members-electrical-inspection': { jobTypeId: 529,       businessUnitId: 455 },
};

// ── Token cache ──────────────────────────────────────────────
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

// ── Main handler ─────────────────────────────────────────────
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

  const mapping = JOB_TYPE_MAP[issue.toLowerCase()];
  if (!mapping) {
    return res.status(400).json({ error: `Unknown issue: ${issue}. No job type mapping found.` });
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

    // ST Dispatch Capacity API uses POST (not GET)
    const response = await axios.post(
      `${ST_API_BASE}/dispatch/v2/tenant/${TENANT_ID}/capacity`,
      {
        startsOnOrAfter,
        endsOnOrBefore,
        businessUnitId:        mapping.businessUnitId,
        jobTypeId:             mapping.jobTypeId,
        skillBasedAvailability: false,
        args:                  {},
      },
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          'ST-App-Key':   APP_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    // Parse response — ST returns time windows grouped by BU per day.
    // Each entry has: start, end, businessUnitIds[], openAvailability, isAvailable
    // We need to:
    //  1. Filter to windows that include our target BU
    //  2. Group by date
    //  3. Sum openAvailability across windows for each date
    //  4. Only return dates with availability > 0
    const availabilities = response.data?.availabilities || [];
    const targetBuId = mapping.businessUnitId;

    const dayMap = {};
    for (const window of availabilities) {
      // Only count windows that include our business unit
      if (!window.businessUnitIds || !window.businessUnitIds.includes(targetBuId)) continue;
      if (!window.isAvailable) continue;

      const date = window.start?.split('T')[0];
      if (!date) continue;

      if (!dayMap[date]) {
        dayMap[date] = 0;
      }
      dayMap[date] += window.openAvailability || 0;
    }

    const slots = Object.entries(dayMap)
      .filter(([, hours]) => hours > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, availableHours]) => ({ date, availableHours }));

    return res.status(200).json({ slots });

  } catch (err) {
    const stError = err.response?.data || err.message;
    console.error('[Availability] Error:', stError);

    return res.status(500).json({ error: 'Failed to fetch availability', debug: stError });
  }
};
