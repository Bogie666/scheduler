/**
 * Shared availability core.
 * ───────────────────────────────────────────────────────────────────
 * Queries ServiceTitan's Dispatch Capacity API for a given issue and
 * returns open dispatch windows for the next N days. Used by both the
 * widget's GET /api/availability endpoint and the public MCP server,
 * so the capacity logic lives in exactly ONE place.
 *
 * Returns: { statusCode, body }.  Never throws.
 * ───────────────────────────────────────────────────────────────────
 */

const axios = require('axios');

const ST_AUTH_URL   = 'https://auth.servicetitan.io/connect/token';
const ST_API_BASE   = 'https://api.servicetitan.io';
const TENANT_ID     = process.env.ST_TENANT_ID     || '1498628772';
const APP_KEY       = process.env.ST_APP_KEY        || process.env.ST_APP_ID || process.env.SERVICETITAN_APP_KEY;
const CLIENT_ID     = process.env.ST_CLIENT_ID      || process.env.SERVICETITAN_CLIENT_ID;
const CLIENT_SECRET = process.env.ST_CLIENT_SECRET  || process.env.SERVICETITAN_CLIENT_SECRET;

// Issue → { jobTypeId, businessUnitId } for the DEFAULT (LEX) brand.
// Capacity is a scheduling-supply question; brand only shifts the BU.
const JOB_TYPE_MAP = {
  // ── HVAC ──
  'ac-not-cooling':     { jobTypeId: 460,    businessUnitId: 6534 },
  'heater-not-working': { jobTypeId: 460,    businessUnitId: 6534 },
  'strange-noises':     { jobTypeId: 460,    businessUnitId: 6534 },
  'hvac-other':         { jobTypeId: 460,    businessUnitId: 6534 },
  'hvac-maintenance':   { jobTypeId: 528,    businessUnitId: 7831 },
  'new-system':         { jobTypeId: 831156, businessUnitId: 8085 },
  // ── Plumbing ──
  'leak':               { jobTypeId: 521,    businessUnitId: 124467371 },
  'clogged-drain':      { jobTypeId: 521,    businessUnitId: 124467371 },
  'water-heater':       { jobTypeId: 521,    businessUnitId: 124467371 },
  'no-hot-water':       { jobTypeId: 521,    businessUnitId: 124467371 },
  'toilet-issue':       { jobTypeId: 521,       businessUnitId: 124467371 },
  'water-quality-test': { jobTypeId: 158642924, businessUnitId: 8085 },
  'plumbing-other':     { jobTypeId: 521,       businessUnitId: 124467371 },
  // ── Electrical ──
  'outlet-not-working': { jobTypeId: 515,    businessUnitId: 161649734 },
  'breaker-tripping':   { jobTypeId: 515,    businessUnitId: 161649734 },
  'lighting-issue':     { jobTypeId: 515,    businessUnitId: 161649734 },
  'panel-upgrade':      { jobTypeId: 515,    businessUnitId: 161649734 },
  'ceiling-fan':        { jobTypeId: 515,    businessUnitId: 161649734 },
  'electrical-other':   { jobTypeId: 515,    businessUnitId: 161649734 },
  // ── Members: HVAC Tune-Ups ──
  'members-hvac-1-system': { jobTypeId: 528,       businessUnitId: 7831 },
  'members-hvac-2-system': { jobTypeId: 161649782, businessUnitId: 7831 },
  'members-hvac-3-system': { jobTypeId: 161649821, businessUnitId: 7831 },
  'members-hvac-4-system': { jobTypeId: 161649788, businessUnitId: 7831 },
  'members-hvac-5-system': { jobTypeId: 1753588,   businessUnitId: 7831 },
  'members-hvac-6-system': { jobTypeId: 495,       businessUnitId: 7831 },
  // ── Members: Inspections ──
  'members-plumbing-inspection':   { jobTypeId: 148475761, businessUnitId: 124468396 },
  'members-electrical-inspection': { jobTypeId: 529,       businessUnitId: 455 },
};

let cachedToken    = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;
  const res = await axios.post(
    ST_AUTH_URL,
    new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  cachedToken    = res.data.access_token;
  tokenExpiresAt = Date.now() + (res.data.expires_in * 1000);
  return cachedToken;
}

function toCentralTime(ts) {
  if (!ts) return ts;
  const bare = ts.replace(/[Zz]$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
  const month = parseInt(bare.split('-')[1], 10);
  const offset = (month >= 3 && month <= 10) ? '-05:00' : '-06:00';
  return bare + offset;
}

/**
 * Core availability query.
 * @param {string} issue     issue id (e.g. 'ac-not-cooling')
 * @param {string} startsOn  optional ISO date, defaults to today
 * @param {number} days      look-ahead window, default 14
 */
async function getAvailability(issue, startsOn, days = 14) {
  if (!issue) {
    return { statusCode: 400, body: { error: 'issue is required (e.g. ac-not-cooling, leak, panel-upgrade)' } };
  }
  const mapping = JOB_TYPE_MAP[String(issue).toLowerCase()];
  if (!mapping) {
    return { statusCode: 400, body: { error: `Unknown issue: ${issue}. No job type mapping found.` } };
  }

  try {
    const token = await getAccessToken();
    const start = startsOn ? new Date(startsOn) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + days);

    const response = await axios.post(
      `${ST_API_BASE}/dispatch/v2/tenant/${TENANT_ID}/capacity`,
      {
        startsOnOrAfter: start.toISOString(),
        endsOnOrBefore:  end.toISOString(),
        businessUnitId:  mapping.businessUnitId,
        jobTypeId:       mapping.jobTypeId,
        skillBasedAvailability: true,
      },
      { headers: { Authorization: `Bearer ${token}`, 'ST-App-Key': APP_KEY, 'Content-Type': 'application/json' } }
    );

    const availabilities = response.data?.availabilities || [];
    const targetBuId = mapping.businessUnitId;
    const now = new Date();
    const dayMap = {};

    for (const window of availabilities) {
      if (!window.businessUnitIds || !window.businessUnitIds.includes(targetBuId)) continue;
      if (!window.isAvailable) continue;
      if (window.end && new Date(window.end) <= now) continue;
      const date = window.start?.split('T')[0];
      if (!date) continue;
      if (!dayMap[date]) dayMap[date] = { availableHours: 0, windows: [] };
      dayMap[date].availableHours += window.openAvailability || 0;
      dayMap[date].windows.push({ start: toCentralTime(window.start), end: toCentralTime(window.end) });
    }

    const slots = Object.entries(dayMap)
      .filter(([, info]) => info.availableHours > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, info]) => ({
        date,
        availableHours: info.availableHours,
        windows: info.windows.sort((a, b) => a.start.localeCompare(b.start)),
      }));

    return { statusCode: 200, body: { slots } };
  } catch (err) {
    const stError = err.response?.data || err.message;
    console.error('[Availability] Error:', stError);
    return { statusCode: 500, body: { error: 'Failed to fetch availability', debug: stError } };
  }
}

module.exports = { getAvailability, JOB_TYPE_MAP, getAccessToken, TENANT_ID };