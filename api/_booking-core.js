/**
 * Shared multi-brand booking core.
 * ───────────────────────────────────────────────────────────────────
 * Creates an unassigned job on the ServiceTitan dispatch board for any
 * brand (lex / etx / lyons). All brands share ONE tenant; only the
 * Business Unit changes per brand (see api/_brands.js).
 *
 * Flow:
 *   1. Find existing customer by phone, or create a new one
 *   2. Find a matching location, or create a new one
 *   3. Create an unassigned job (no technicianId) in the brand's BU
 *   4. PATCH the job's referral custom field if a code was provided
 * ───────────────────────────────────────────────────────────────────
 */

const axios = require('axios');
const { resolveIssue } = require('./_brands');

const ST_AUTH_URL = 'https://auth.servicetitan.io/connect/token';
const ST_API_BASE = 'https://api.servicetitan.io';
const TENANT_ID     = process.env.ST_TENANT_ID     || '1498628772';
const APP_KEY       = process.env.ST_APP_KEY        || process.env.ST_APP_ID || process.env.SERVICETITAN_APP_KEY;
const CLIENT_ID     = process.env.ST_CLIENT_ID      || process.env.SERVICETITAN_CLIENT_ID;
const CLIENT_SECRET = process.env.ST_CLIENT_SECRET  || process.env.SERVICETITAN_CLIENT_SECRET;

const REFERRAL_FIELD_TYPE_ID = 406119323;

// ── Token cache ────────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;
  const res = await axios.post(
    ST_AUTH_URL,
    new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  cachedToken = res.data.access_token;
  tokenExpiresAt = Date.now() + (res.data.expires_in * 1000);
  return cachedToken;
}

function stHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'ST-App-Key': APP_KEY, 'Content-Type': 'application/json' };
}

// ── Customer ───────────────────────────────────────────────────────
async function findCustomerByPhone(token, phone) {
  const { data } = await axios.get(
    `${ST_API_BASE}/crm/v2/tenant/${TENANT_ID}/customers`,
    { params: { phone }, headers: stHeaders(token) }
  );
  return data?.data?.[0] || null;
}

async function createCustomer(token, { firstName, lastName, phone, email }) {
  const contacts = [{ type: 'Phone', value: phone }];
  if (email) contacts.push({ type: 'Email', value: email });
  const { data } = await axios.post(
    `${ST_API_BASE}/crm/v2/tenant/${TENANT_ID}/customers`,
    { name: `${firstName} ${lastName}`, type: 'Residential', contacts },
    { headers: stHeaders(token) }
  );
  return data;
}

// ── Location ───────────────────────────────────────────────────────
async function getCustomerLocations(token, customerId) {
  const { data } = await axios.get(
    `${ST_API_BASE}/crm/v2/tenant/${TENANT_ID}/locations`,
    { params: { customerId }, headers: stHeaders(token) }
  );
  return data?.data || [];
}

function findMatchingLocation(locations, street, zip) {
  const normalizedStreet = street.trim().toLowerCase();
  return locations.find(loc => {
    const locStreet = (loc.address?.street || '').trim().toLowerCase();
    const locZip = loc.address?.zip || '';
    return locStreet === normalizedStreet && locZip === zip;
  }) || null;
}

async function createLocation(token, customerId, { firstName, lastName, address, city, zip }) {
  const { data } = await axios.post(
    `${ST_API_BASE}/crm/v2/tenant/${TENANT_ID}/locations`,
    { customerId, name: `${firstName} ${lastName}`,
      address: { street: address, city, state: 'TX', zip, country: 'US' } },
    { headers: stHeaders(token) }
  );
  return data;
}

// ── Job ────────────────────────────────────────────────────────────
async function createJob(token, { customerId, locationId, businessUnitId, jobTypeId, summary, body, start, end, campaignId }) {
  const { data } = await axios.post(
    `${ST_API_BASE}/jpm/v2/tenant/${TENANT_ID}/jobs`,
    {
      customerId, locationId, businessUnitId, jobTypeId,
      priority: 'Normal', summary, body: body || summary, campaignId,
      appointments: [{ start, end, arrivalWindowStart: start, arrivalWindowEnd: end }],
    },
    { headers: stHeaders(token) }
  );
  return data;
}

/**
 * Marketing attribution → a readable block appended to the job's body.
 *
 * The Google Ads click ID (gclid / gbraid / wbraid) is the piece that
 * matters: pulling it back out of ServiceTitan alongside the job's sold
 * revenue is what powers offline conversion import, so Google Ads can
 * optimize toward jobs that actually close instead of raw form fills.
 */
function formatAttribution(attribution) {
  if (!attribution || typeof attribution !== 'object') return '';
  const fields = [
    ['gclid',        'GCLID'],
    ['gbraid',       'GBRAID'],
    ['wbraid',       'WBRAID'],
    ['msclkid',      'MSCLKID'],
    ['utm_source',   'Source'],
    ['utm_medium',   'Medium'],
    ['utm_campaign', 'Campaign'],
    ['utm_term',     'Term'],
    ['utm_content',  'Content'],
    ['ga_client_id', 'GA Client ID'],
    ['landing_page', 'Landing Page'],
    ['referrer',     'Referrer'],
  ];
  const lines = fields
    .filter(([key]) => typeof attribution[key] === 'string' && attribution[key].trim())
    .map(([key, label]) => `${label}: ${String(attribution[key]).trim().slice(0, 500)}`);

  return lines.length ? `\n\n--- Marketing Attribution ---\n${lines.join('\n')}` : '';
}

async function patchJobReferralCode(token, jobId, referralCode) {
  await axios.patch(
    `${ST_API_BASE}/jpm/v2/tenant/${TENANT_ID}/jobs/${jobId}`,
    { customFields: [{ typeId: REFERRAL_FIELD_TYPE_ID, value: referralCode }] },
    { headers: stHeaders(token) }
  );
}

/**
 * Brand-aware booking core, transport-independent.
 * ───────────────────────────────────────────────────────────────────
 * Given a plain fields object + brandKey, this runs the full customer →
 * location → job → referral flow against ServiceTitan and returns a
 * structured result. Both the widget HTTP handlers (createBookingHandler)
 * and the public MCP server (api/mcp.js) call this, so the ST integration
 * lives in exactly ONE place and can never drift between surfaces.
 *
 * Returns: { statusCode, body } — body is the JSON payload to send back.
 * Never throws; all failures are mapped to a statusCode + body.
 *
 * Options:
 *   dryRun  — validate + resolve routing but do NOT create anything in ST.
 *             Used by the MCP so an assistant can confirm a booking is
 *             well-formed and routable before committing a real job.
 */
async function performBooking(fields, brandKey, opts = {}) {
  const {
    issue, issueDetails, firstName, lastName, phone, email,
    address, city, zip, preferredDate, preferredTime,
    windowStart, windowEnd, referralCode, attribution,
    customerId: preVerifiedCustomerId, locationId: preVerifiedLocationId,
  } = fields || {};

  const resolved = resolveIssue(brandKey, issue);
  if (resolved.error) {
    return { statusCode: 400, body: { error: resolved.error } };
  }
  const { brand, jobTypeId, businessUnitId, label } = resolved;
  const supportPhone = brand.phone;
  const callMsg = `We had trouble submitting your request. Please call us at ${supportPhone}.`;

  if (!firstName || !lastName || !phone || !address || !city || !zip) {
    return { statusCode: 400, body: { error: 'Missing required fields',
      required: ['firstName', 'lastName', 'phone', 'address', 'city', 'zip'] } };
  }
  if (!preferredDate) {
    return { statusCode: 400, body: { error: 'Missing required field: preferredDate (YYYY-MM-DD)' } };
  }

  // ── Summary ──
  const timeLabel = preferredTime === 'morning' ? '8am-12pm'
                  : preferredTime === 'afternoon' ? '12pm-5pm'
                  : 'First Available';
  let summary = label;
  if (issueDetails) summary += ` | ${issueDetails}`;
  summary += ` | Preferred: ${preferredDate} ${timeLabel}`;
  if (referralCode && brand.referralCampaignId) summary += ` | *** $50 Off $350+ ***`;

  const jobBody = summary + formatAttribution(attribution);
  const jobCampaignId = (referralCode && brand.referralCampaignId)
    ? brand.referralCampaignId
    : brand.websiteCampaignId;

  // ── Time window ──
  let jobStart, jobEnd;
  if (windowStart && windowEnd) {
    jobStart = windowStart; jobEnd = windowEnd;
  } else {
    const timeWindows = {
      morning:           { start: '08:00:00', end: '12:00:00' },
      afternoon:         { start: '12:00:00', end: '17:00:00' },
      'first-available': { start: '08:00:00', end: '17:00:00' },
    };
    const tw = timeWindows[preferredTime] || timeWindows['first-available'];
    const month = parseInt(preferredDate.split('-')[1], 10);
    const ctOffset = (month >= 3 && month <= 10) ? '-05:00' : '-06:00';
    jobStart = `${preferredDate}T${tw.start}${ctOffset}`;
    jobEnd   = `${preferredDate}T${tw.end}${ctOffset}`;
  }

  // ── dryRun: resolved + validated, but nothing written to ST ──
  if (opts.dryRun) {
    return { statusCode: 200, body: {
      success: true, dryRun: true, brand: brand.key,
      wouldCreate: { businessUnitId, jobTypeId, label, summary,
        start: jobStart, end: jobEnd, campaignId: jobCampaignId },
      message: 'Validation only — no job was created in ServiceTitan.',
    } };
  }

  try {
    const token = await getAccessToken();
    const cleanPhone = phone.replace(/\D/g, '');

    // ── 1. Customer ──
    let customer;
    if (preVerifiedCustomerId) {
      customer = { id: preVerifiedCustomerId };
    } else {
      try {
        customer = await findCustomerByPhone(token, cleanPhone);
        if (!customer) customer = await createCustomer(token, { firstName, lastName, phone: cleanPhone, email });
      } catch (err) {
        console.error(`[${brand.name} Booking] Customer step failed:`, err.response?.data || err.message);
        return { statusCode: 500, body: { error: 'customer_failed', step: 'customer', message: callMsg } };
      }
    }

    // ── 2. Location ──
    let location;
    if (preVerifiedLocationId) {
      location = { id: preVerifiedLocationId };
    } else {
      try {
        const existing = await getCustomerLocations(token, customer.id);
        location = findMatchingLocation(existing, address, zip);
        if (!location) location = await createLocation(token, customer.id, { firstName, lastName, address, city, zip });
      } catch (err) {
        console.error(`[${brand.name} Booking] Location step failed:`, err.response?.data || err.message);
        return { statusCode: 500, body: { error: 'location_failed', step: 'location', message: callMsg } };
      }
    }

    // ── 3. Job ──
    let job;
    try {
      job = await createJob(token, {
        customerId: customer.id, locationId: location.id,
        businessUnitId, jobTypeId, summary, body: jobBody, start: jobStart, end: jobEnd,
        campaignId: jobCampaignId,
      });
      console.log(`[${brand.name} Booking] Created job ${job.id} (BU ${businessUnitId}) for ${firstName} ${lastName} — ${label}`);
    } catch (err) {
      console.error(`[${brand.name} Booking] Job creation failed:`, err.response?.data || err.message);
      return { statusCode: 500, body: { error: 'job_failed', step: 'job', message: callMsg } };
    }

    // ── 4. Referral code ──
    if (referralCode && brand.referralCampaignId) {
      try {
        await patchJobReferralCode(token, job.id, referralCode.trim().toUpperCase());
      } catch (patchErr) {
        console.error(`[${brand.name} Booking] Referral patch failed on job ${job.id}:`, patchErr.response?.data || patchErr.message);
      }
    }

    return { statusCode: 200, body: {
      success: true, brand: brand.key, jobId: job.id,
      customerId: customer.id, locationId: location.id, message: 'Job created successfully',
    } };

  } catch (err) {
    console.error(`[${brand.name} Booking] Error:`, err.response?.data || err.message);
    return { statusCode: 500, body: { error: 'booking_failed', step: 'auth_or_unknown', message: callMsg } };
  }
}

/**
 * Brand-aware Vercel/Express handler factory.
 * Usage:  module.exports = createBookingHandler('lyons');
 *
 * Thin transport wrapper around performBooking() — the widget POST
 * contract (status codes + JSON bodies) is preserved exactly.
 */
function createBookingHandler(brandKey) {
  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { statusCode, body } = await performBooking(req.body || {}, brandKey);
    return res.status(statusCode).json(body);
  };
}

module.exports = { createBookingHandler, performBooking, getAccessToken, TENANT_ID };
