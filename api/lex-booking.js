/**
 * POST /api/lex-booking
 * ─────────────────────────────────────────────────────────────
 * Creates an unassigned job on the ServiceTitan dispatch board.
 *
 * Flow:
 *   1. Find existing customer by phone, or create a new one
 *   2. Find a matching location, or create a new one
 *   3. Create an unassigned job (no technicianId)
 *   4. PATCH the job's custom field 406119323 with the referral
 *      code, if one was provided
 *
 * The job lands in the unassigned area of the dispatch board
 * so ACP can auto-assign it or a dispatcher can drag it.
 * ─────────────────────────────────────────────────────────────
 */

const axios = require('axios');

const ST_AUTH_URL   = 'https://auth.servicetitan.io/connect/token';
const ST_API_BASE   = 'https://api.servicetitan.io';
const TENANT_ID     = process.env.ST_TENANT_ID     || '1498628772';
const APP_KEY       = process.env.ST_APP_KEY        || process.env.ST_APP_ID || process.env.SERVICETITAN_APP_KEY;
const CLIENT_ID     = process.env.ST_CLIENT_ID      || process.env.SERVICETITAN_CLIENT_ID;
const CLIENT_SECRET = process.env.ST_CLIENT_SECRET  || process.env.SERVICETITAN_CLIENT_SECRET;

const REFERRAL_FIELD_TYPE_ID = 406119323;

// ── Issue → { jobTypeId, businessUnitId } ────────────────────
const JOB_TYPE_MAP = {
  // HVAC
  'ac-not-cooling':     { jobTypeId: 460,    businessUnitId: 6534 },
  'heater-not-working': { jobTypeId: 460,    businessUnitId: 6534 },
  'strange-noises':     { jobTypeId: 460,    businessUnitId: 6534 },
  'hvac-other':         { jobTypeId: 460,    businessUnitId: 6534 },
  'hvac-maintenance':   { jobTypeId: 528,    businessUnitId: 7831 },
  'new-system':         { jobTypeId: 831156, businessUnitId: 8085 },
  // Plumbing
  'leak':               { jobTypeId: 521,    businessUnitId: 124467371 },
  'clogged-drain':      { jobTypeId: 521,    businessUnitId: 124467371 },
  'water-heater':       { jobTypeId: 521,    businessUnitId: 124467371 },
  'no-hot-water':       { jobTypeId: 521,    businessUnitId: 124467371 },
  'toilet-issue':       { jobTypeId: 521,    businessUnitId: 124467371 },
  'plumbing-other':     { jobTypeId: 521,    businessUnitId: 124467371 },
  // Electrical
  'outlet-not-working': { jobTypeId: 515,    businessUnitId: 161649734 },
  'breaker-tripping':   { jobTypeId: 515,    businessUnitId: 161649734 },
  'lighting-issue':     { jobTypeId: 515,    businessUnitId: 161649734 },
  'panel-upgrade':      { jobTypeId: 515,    businessUnitId: 161649734 },
  'ceiling-fan':        { jobTypeId: 515,    businessUnitId: 161649734 },
  'electrical-other':   { jobTypeId: 515,    businessUnitId: 161649734 },
  // Members: HVAC Tune-Ups (by system count)
  'members-hvac-1-system': { jobTypeId: 528,       businessUnitId: 7831 },
  'members-hvac-2-system': { jobTypeId: 161649782, businessUnitId: 7831 },
  'members-hvac-3-system': { jobTypeId: 161649821, businessUnitId: 7831 },
  'members-hvac-4-system': { jobTypeId: 161649788, businessUnitId: 7831 },
  'members-hvac-5-system': { jobTypeId: 1753588,   businessUnitId: 7831 },
  'members-hvac-6-system': { jobTypeId: 495,       businessUnitId: 7831 },
  // Members: Inspections
  'members-plumbing-inspection':   { jobTypeId: 148475761, businessUnitId: 124468396 },
  'members-electrical-inspection': { jobTypeId: 529,       businessUnitId: 455 },
};

// ── Issue → summary label ────────────────────────────────────
const SERVICE_LABELS = {
  'ac-not-cooling':     'AC Not Cooling',
  'heater-not-working': 'Heater Not Working',
  'hvac-maintenance':   'HVAC Maintenance / Tune-Up',
  'new-system':         'New System Estimate',
  'strange-noises':     'Strange Noises (HVAC)',
  'hvac-other':         'HVAC - Other',
  'leak':               'Plumbing Leak / Dripping',
  'clogged-drain':      'Clogged Drain',
  'water-heater':       'Water Heater Issue',
  'no-hot-water':       'No Hot Water',
  'toilet-issue':       'Toilet Problem',
  'plumbing-other':     'Plumbing - Other',
  'outlet-not-working': 'Outlet Not Working',
  'breaker-tripping':   'Breaker Keeps Tripping',
  'lighting-issue':     'Lighting Issue',
  'panel-upgrade':      'Panel Upgrade',
  'ceiling-fan':        'Ceiling Fan Install',
  'electrical-other':   'Electrical - Other',
  'members-hvac-1-system': 'HVAC Maintenance - 1 System',
  'members-hvac-2-system': 'HVAC Maintenance - 2 Systems',
  'members-hvac-3-system': 'HVAC Maintenance - 3 Systems',
  'members-hvac-4-system': 'HVAC Maintenance - 4 Systems',
  'members-hvac-5-system': 'HVAC Maintenance - 5 Systems',
  'members-hvac-6-system': 'HVAC Maintenance - 6+ Systems',
  'members-plumbing-inspection':   'Plumbing Inspection',
  'members-electrical-inspection': 'Electrical Inspection',
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

function stHeaders(token) {
  return {
    Authorization:  `Bearer ${token}`,
    'ST-App-Key':   APP_KEY,
    'Content-Type': 'application/json',
  };
}

// ── Step 1: Find or create customer ──────────────────────────

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
    {
      name: `${firstName} ${lastName}`,
      type: 'Residential',
      contacts,
    },
    { headers: stHeaders(token) }
  );
  return data;
}

// ── Step 2: Find or create location ──────────────────────────

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
    const locZip    = loc.address?.zip || '';
    return locStreet === normalizedStreet && locZip === zip;
  }) || null;
}

async function createLocation(token, customerId, { firstName, lastName, address, city, zip }) {
  const { data } = await axios.post(
    `${ST_API_BASE}/crm/v2/tenant/${TENANT_ID}/locations`,
    {
      customerId,
      name: `${firstName} ${lastName}`,
      address: {
        street:  address,
        city,
        state:   'TX',
        zip,
        country: 'US',
      },
    },
    { headers: stHeaders(token) }
  );
  return data;
}

// ── Step 3: Create unassigned job ────────────────────────────

async function createJob(token, { customerId, locationId, businessUnitId, jobTypeId, summary, start, end, campaignId }) {
  const { data } = await axios.post(
    `${ST_API_BASE}/jpm/v2/tenant/${TENANT_ID}/jobs`,
    {
      customerId,
      locationId,
      businessUnitId,
      jobTypeId,
      priority: 'Normal',
      summary,
      body: summary,
      campaignId: campaignId || 46472179,
      appointments: [
        {
          start,
          end,
          arrivalWindowStart: start,
          arrivalWindowEnd: end,
        },
      ],
    },
    { headers: stHeaders(token) }
  );
  return data;
}

// ── Step 4: PATCH referral code onto job ──────────────────────

async function patchJobReferralCode(token, jobId, referralCode) {
  await axios.patch(
    `${ST_API_BASE}/jpm/v2/tenant/${TENANT_ID}/jobs/${jobId}`,
    {
      customFields: [
        { typeId: REFERRAL_FIELD_TYPE_ID, value: referralCode },
      ],
    },
    { headers: stHeaders(token) }
  );
}

// ── Main handler ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    serviceType,
    issue,
    issueDetails,
    firstName,
    lastName,
    phone,
    email,
    address,
    city,
    zip,
    preferredDate,
    preferredTime,
    referralCode,
  } = req.body || {};

  if (!firstName || !lastName || !phone || !address || !city || !zip) {
    return res.status(400).json({ error: 'Missing required fields', required: ['firstName', 'lastName', 'phone', 'address', 'city', 'zip'] });
  }

  const mapping = JOB_TYPE_MAP[issue];
  if (!mapping) {
    return res.status(400).json({ error: `Unknown issue: ${issue}. No job type mapping found.` });
  }

  try {
    const token     = await getAccessToken();
    const cleanPhone = phone.replace(/\D/g, '');

    // ── Build summary ────────────────────────────────────────
    const issueLabel = SERVICE_LABELS[issue] || issue || 'General Service';
    const timeLabel  = preferredTime === 'morning' ? '8am-12pm'
                     : preferredTime === 'afternoon' ? '12pm-5pm'
                     : 'First Available';

    let summary = issueLabel;
    if (issueDetails) summary += ` — ${issueDetails}`;
    summary += ` | Preferred: ${preferredDate} ${timeLabel}`;
    if (referralCode) {
      summary += ` | REFERRAL CODE: ${referralCode} *** $50 Off $350+ ***`;
    }

    // ── Time window ──────────────────────────────────────────
    const timeWindows = {
      morning:           { start: '08:00:00', end: '12:00:00' },
      afternoon:         { start: '12:00:00', end: '17:00:00' },
      'first-available': { start: '08:00:00', end: '17:00:00' },
    };
    const tw = timeWindows[preferredTime] || timeWindows['first-available'];

    // ── 1. Find or create customer ───────────────────────────
    let customer;
    try {
      customer = await findCustomerByPhone(token, cleanPhone);
      if (!customer) {
        customer = await createCustomer(token, { firstName, lastName, phone: cleanPhone, email });
        console.log(`[Booking] Created new customer ${customer.id} — ${firstName} ${lastName}`);
      } else {
        console.log(`[Booking] Found existing customer ${customer.id} — ${customer.name}`);
      }
    } catch (err) {
      const detail = err.response?.data || err.message;
      console.error('[Booking] Customer step failed:', detail);
      return res.status(500).json({ error: 'customer_failed', step: 'customer', debug: detail,
        message: 'We had trouble submitting your request. Please call us at (972) 466-1917.' });
    }

    // ── 2. Find or create location ───────────────────────────
    let location;
    try {
      const existingLocations = await getCustomerLocations(token, customer.id);
      location = findMatchingLocation(existingLocations, address, zip);
      if (!location) {
        location = await createLocation(token, customer.id, { firstName, lastName, address, city, zip });
        console.log(`[Booking] Created new location ${location.id} — ${address}, ${city} ${zip}`);
      } else {
        console.log(`[Booking] Using existing location ${location.id}`);
      }
    } catch (err) {
      const detail = err.response?.data || err.message;
      console.error('[Booking] Location step failed:', detail);
      return res.status(500).json({ error: 'location_failed', step: 'location', debug: detail,
        message: 'We had trouble submitting your request. Please call us at (972) 466-1917.' });
    }

    // ── 3. Create unassigned job ─────────────────────────────
    let job;
    try {
      job = await createJob(token, {
        customerId:     customer.id,
        locationId:     location.id,
        businessUnitId: mapping.businessUnitId,
        jobTypeId:      mapping.jobTypeId,
        summary,
        start: `${preferredDate}T${tw.start}`,
        end:   `${preferredDate}T${tw.end}`,
      });
      console.log(`[Booking] Created unassigned job ${job.id} for ${firstName} ${lastName} — ${issueLabel}`);
    } catch (err) {
      const detail = err.response?.data || err.message;
      console.error('[Booking] Job creation failed:', detail);
      return res.status(500).json({ error: 'job_failed', step: 'job', debug: detail,
        message: 'We had trouble submitting your request. Please call us at (972) 466-1917.' });
    }

    // ── 4. PATCH referral code if provided ───────────────────
    if (referralCode) {
      try {
        await patchJobReferralCode(token, job.id, referralCode.trim().toUpperCase());
        console.log(`[Booking] Patched referral code ${referralCode} onto job ${job.id}`);
      } catch (patchErr) {
        console.error(`[Booking] Failed to patch referral code onto job ${job.id}:`, patchErr.response?.data || patchErr.message);
      }
    }

    return res.status(200).json({
      success:    true,
      jobId:      job.id,
      customerId: customer.id,
      locationId: location.id,
      message:    'Job created successfully',
    });

  } catch (err) {
    const stError = err.response?.data || err.message;
    console.error('[Booking] Error:', stError);

    return res.status(500).json({
      error:   'booking_failed',
      step:    'auth_or_unknown',
      debug:   stError,
      message: 'We had trouble submitting your request. Please call us at (972) 466-1917.',
    });
  }
};
