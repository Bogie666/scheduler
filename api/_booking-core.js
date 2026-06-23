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
async function createJob(token, { customerId, locationId, businessUnitId, jobTypeId, summary, start, end, campaignId }) {
  const { data } = await axios.post(
    `${ST_API_BASE}/jpm/v2/tenant/${TENANT_ID}/jobs`,
    {
      customerId, locationId, businessUnitId, jobTypeId,
      priority: 'Normal', summary, body: summary, campaignId,
      appointments: [{ start, end, arrivalWindowStart: start, arrivalWindowEnd: end }],
    },
    { headers: stHeaders(token) }
  );
  return data;
}

async function patchJobReferralCode(token, jobId, referralCode) {
  await axios.patch(
    `${ST_API_BASE}/jpm/v2/tenant/${TENANT_ID}/jobs/${jobId}`,
    { customFields: [{ typeId: REFERRAL_FIELD_TYPE_ID, value: referralCode }] },
    { headers: stHeaders(token) }
  );
}

/**
 * Brand-aware Vercel/Express handler factory.
 * Usage:  module.exports = createBookingHandler('lyons');
 */
function createBookingHandler(brandKey) {
  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const {
      issue, issueDetails, firstName, lastName, phone, email,
      address, city, zip, preferredDate, preferredTime,
      windowStart, windowEnd, referralCode,
      customerId: preVerifiedCustomerId, locationId: preVerifiedLocationId,
    } = req.body || {};

    // Resolve brand + routing first so we have the right support phone in errors
    const resolved = resolveIssue(brandKey, issue);
    if (resolved.error) {
      return res.status(400).json({ error: resolved.error });
    }
    const { brand, jobTypeId, businessUnitId, label } = resolved;
    const supportPhone = brand.phone;
    const callMsg = `We had trouble submitting your request. Please call us at ${supportPhone}.`;

    if (!firstName || !lastName || !phone || !address || !city || !zip) {
      return res.status(400).json({ error: 'Missing required fields',
        required: ['firstName', 'lastName', 'phone', 'address', 'city', 'zip'] });
    }

    try {
      const token = await getAccessToken();
      const cleanPhone = phone.replace(/\D/g, '');

      // ── Summary ──
      const timeLabel = preferredTime === 'morning' ? '8am-12pm'
                      : preferredTime === 'afternoon' ? '12pm-5pm'
                      : 'First Available';
      let summary = label;
      if (issueDetails) summary += ` | ${issueDetails}`;
      summary += ` | Preferred: ${preferredDate} ${timeLabel}`;
      if (referralCode && brand.referralCampaignId) summary += ` | *** $50 Off $350+ ***`;

      // Campaign: brand referral campaign if code present and brand supports it, else brand website
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
          return res.status(500).json({ error: 'customer_failed', step: 'customer', message: callMsg });
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
          return res.status(500).json({ error: 'location_failed', step: 'location', message: callMsg });
        }
      }

      // ── 3. Job ──
      let job;
      try {
        job = await createJob(token, {
          customerId: customer.id, locationId: location.id,
          businessUnitId, jobTypeId, summary, start: jobStart, end: jobEnd,
          campaignId: jobCampaignId,
        });
        console.log(`[${brand.name} Booking] Created job ${job.id} (BU ${businessUnitId}) for ${firstName} ${lastName} — ${label}`);
      } catch (err) {
        console.error(`[${brand.name} Booking] Job creation failed:`, err.response?.data || err.message);
        return res.status(500).json({ error: 'job_failed', step: 'job', message: callMsg });
      }

      // ── 4. Referral code ──
      if (referralCode && brand.referralCampaignId) {
        try {
          await patchJobReferralCode(token, job.id, referralCode.trim().toUpperCase());
        } catch (patchErr) {
          console.error(`[${brand.name} Booking] Referral patch failed on job ${job.id}:`, patchErr.response?.data || patchErr.message);
        }
      }

      return res.status(200).json({
        success: true, brand: brand.key, jobId: job.id,
        customerId: customer.id, locationId: location.id, message: 'Job created successfully',
      });

    } catch (err) {
      console.error(`[${brand.name} Booking] Error:`, err.response?.data || err.message);
      return res.status(500).json({ error: 'booking_failed', step: 'auth_or_unknown', message: callMsg });
    }
  };
}

module.exports = { createBookingHandler, getAccessToken, TENANT_ID };
