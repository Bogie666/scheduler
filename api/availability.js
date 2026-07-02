/**
 * GET /api/availability
 * ─────────────────────────────────────────────────────────────
 * Returns available dispatch capacity from ServiceTitan's
 * Dispatch Capacity API (POST) for the next 14 days, for the
 * selected brand (Lyons, Lex ETX).
 *
 * Query params:
 *   issue    (required) — the specific issue ID from the widget
 *   brand    (optional) — brand key; defaults to DEFAULT_BRAND
 *   startsOn (optional) — ISO date string, defaults to today
 *
 * Issue → Job Type + Business Unit mapping is per-brand and lives
 * in api/_brands.js.
 * ─────────────────────────────────────────────────────────────
 */

const axios = require('axios');
const { resolveBrandKey, getBrand, getAccessToken, stHeaders } = require('./_brands');

// ── Main handler ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Brand');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { issue, startsOn } = req.query || {};

  if (!issue) {
    return res.status(400).json({ error: 'issue query param is required (e.g. ac-not-cooling, leak, panel-upgrade)' });
  }

  const brand   = getBrand(resolveBrandKey(req));
  const mapping = brand.jobTypeMap[issue.toLowerCase()];
  if (!mapping || mapping.jobTypeId == null || mapping.businessUnitId == null) {
    return res.status(400).json({ error: `Unknown or unconfigured issue "${issue}" for brand "${brand.key}". No job type mapping found.` });
  }

  try {
    const token = await getAccessToken(brand);

    // Date range: startsOn (or today) through +14 days
    const start = startsOn ? new Date(startsOn) : new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 14);

    const startsOnOrAfter = start.toISOString();
    const endsOnOrBefore  = end.toISOString();

    // ST Dispatch Capacity API uses POST (not GET)
    const response = await axios.post(
      `${brand.apiBase}/dispatch/v2/tenant/${brand.tenantId}/capacity`,
      {
        startsOnOrAfter,
        endsOnOrBefore,
        businessUnitId:        mapping.businessUnitId,
        jobTypeId:             mapping.jobTypeId,
        skillBasedAvailability: true,
      },
      { headers: stHeaders(brand, token) }
    );

    // Parse response — ST returns time windows in the tenant's local
    // timezone (Central) but without an offset. The Jobs API interprets
    // bare timestamps as UTC, so we append the CT offset here to make
    // timestamps unambiguous throughout the system.
    const availabilities = response.data?.availabilities || [];
    const targetBuId = mapping.businessUnitId;
    const now = new Date();

    // ST Capacity API returns times that represent the tenant's local
    // timezone (Central) but may tag them with Z or no offset. Strip
    // any existing suffix and apply the correct CT offset so timestamps
    // are unambiguous when passed to the Jobs API.
    function toCentralTime(ts) {
      if (!ts) return ts;
      // Strip trailing Z or existing offset (e.g. +00:00, -05:00)
      const bare = ts.replace(/[Zz]$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
      const month = parseInt(bare.split('-')[1], 10);
      const offset = (month >= 3 && month <= 10) ? '-05:00' : '-06:00';
      return bare + offset;
    }

    const dayMap = {};
    for (const window of availabilities) {
      if (!window.businessUnitIds || !window.businessUnitIds.includes(targetBuId)) continue;
      if (!window.isAvailable) continue;
      if (window.end && new Date(window.end) <= now) continue;

      const date = window.start?.split('T')[0];
      if (!date) continue;

      if (!dayMap[date]) {
        dayMap[date] = { availableHours: 0, windows: [] };
      }
      dayMap[date].availableHours += window.openAvailability || 0;
      dayMap[date].windows.push({
        start: toCentralTime(window.start),
        end:   toCentralTime(window.end),
      });
    }

    const slots = Object.entries(dayMap)
      .filter(([, info]) => info.availableHours > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, info]) => ({
        date,
        availableHours: info.availableHours,
        windows: info.windows.sort((a, b) => a.start.localeCompare(b.start)),
      }));

    return res.status(200).json({ brand: brand.key, slots });

  } catch (err) {
    const stError = err.response?.data || err.message;
    console.error(`[Availability:${brand.key}] Error:`, stError);

    return res.status(500).json({ error: 'Failed to fetch availability', debug: stError });
  }
};
