/**
 * POST /api/lex-booking
 * ─────────────────────────────────────────────────────────────
 * Creates an unassigned job on the ServiceTitan dispatch board for
 * the selected brand (Lyons, Lex ETX). The brand is chosen via a
 * `brand` field in the request body (defaults to DEFAULT_BRAND).
 *
 * Flow:
 *   1. Find existing customer by phone, or create a new one
 *   2. Find a matching location, or create a new one
 *   3. Create an unassigned job (no technicianId)
 *   4. PATCH the job's referral custom field with the referral
 *      code, if the brand defines one and a code was provided
 *
 * The job lands in the unassigned area of the dispatch board
 * so ACP can auto-assign it or a dispatcher can drag it.
 * ─────────────────────────────────────────────────────────────
 */

const axios = require('axios');
const { resolveBrandKey, getBrand, getAccessToken, stHeaders } = require('./_brands');

// ── Step 1: Find or create customer ──────────────────────────

async function findCustomerByPhone(brand, token, phone) {
  const { data } = await axios.get(
    `${brand.apiBase}/crm/v2/tenant/${brand.tenantId}/customers`,
    { params: { phone }, headers: stHeaders(brand, token) }
  );
  return data?.data?.[0] || null;
}

async function createCustomer(brand, token, { firstName, lastName, phone, email }) {
  const contacts = [{ type: 'Phone', value: phone }];
  if (email) contacts.push({ type: 'Email', value: email });

  const { data } = await axios.post(
    `${brand.apiBase}/crm/v2/tenant/${brand.tenantId}/customers`,
    {
      name: `${firstName} ${lastName}`,
      type: 'Residential',
      contacts,
    },
    { headers: stHeaders(brand, token) }
  );
  return data;
}

// ── Step 2: Find or create location ──────────────────────────

async function getCustomerLocations(brand, token, customerId) {
  const { data } = await axios.get(
    `${brand.apiBase}/crm/v2/tenant/${brand.tenantId}/locations`,
    { params: { customerId }, headers: stHeaders(brand, token) }
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

async function createLocation(brand, token, customerId, { firstName, lastName, address, city, zip }) {
  const { data } = await axios.post(
    `${brand.apiBase}/crm/v2/tenant/${brand.tenantId}/locations`,
    {
      customerId,
      name: `${firstName} ${lastName}`,
      address: {
        street:  address,
        city,
        state:   brand.state,
        zip,
        country: 'US',
      },
    },
    { headers: stHeaders(brand, token) }
  );
  return data;
}

// ── Step 3: Create unassigned job ────────────────────────────

async function createJob(brand, token, { customerId, locationId, businessUnitId, jobTypeId, summary, start, end, campaignId }) {
  const { data } = await axios.post(
    `${brand.apiBase}/jpm/v2/tenant/${brand.tenantId}/jobs`,
    {
      customerId,
      locationId,
      businessUnitId,
      jobTypeId,
      priority: 'Normal',
      summary,
      body: summary,
      ...(campaignId ? { campaignId } : {}),
      appointments: [
        {
          start,
          end,
          arrivalWindowStart: start,
          arrivalWindowEnd: end,
        },
      ],
    },
    { headers: stHeaders(brand, token) }
  );
  return data;
}

// ── Step 4: PATCH referral code onto job ──────────────────────

async function patchJobReferralCode(brand, token, jobId, referralCode) {
  await axios.patch(
    `${brand.apiBase}/jpm/v2/tenant/${brand.tenantId}/jobs/${jobId}`,
    {
      customFields: [
        { typeId: brand.referralFieldTypeId, value: referralCode },
      ],
    },
    { headers: stHeaders(brand, token) }
  );
}

// ── Main handler ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Brand');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const brand = getBrand(resolveBrandKey(req));
  const callUs = `Please call us at ${brand.phone}.`;

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
    windowStart,
    windowEnd,
    referralCode,
    customerId: preVerifiedCustomerId,
    locationId: preVerifiedLocationId,
  } = req.body || {};

  if (!firstName || !lastName || !phone || !address || !city || !zip) {
    return res.status(400).json({ error: 'Missing required fields', required: ['firstName', 'lastName', 'phone', 'address', 'city', 'zip'] });
  }

  const mapping = brand.jobTypeMap[issue];
  if (!mapping || mapping.jobTypeId == null || mapping.businessUnitId == null) {
    return res.status(400).json({ error: `Unknown or unconfigured issue "${issue}" for brand "${brand.key}". No job type mapping found.` });
  }

  try {
    const token     = await getAccessToken(brand);
    const cleanPhone = phone.replace(/\D/g, '');

    // ── Build summary ────────────────────────────────────────
    const issueLabel = brand.serviceLabels[issue] || issue || 'General Service';
    const timeLabel  = preferredTime === 'morning' ? '8am-12pm'
                     : preferredTime === 'afternoon' ? '12pm-5pm'
                     : 'First Available';

    let summary = issueLabel;
    if (issueDetails) summary += ` — ${issueDetails}`;
    summary += ` | Preferred: ${preferredDate} ${timeLabel}`;
    if (referralCode) {
      summary += ` | *** $50 Off $350+ ***`;
    }

    // Campaign: referral campaign if a code is present, otherwise website.
    const jobCampaignId = referralCode
      ? brand.campaigns.referral
      : brand.campaigns.website;

    // ── Time window ──────────────────────────────────────────
    // Use actual ST arrival window times if provided, otherwise fall
    // back to hardcoded windows with Central Time offset.
    let jobStart, jobEnd;
    if (windowStart && windowEnd) {
      jobStart = windowStart;
      jobEnd   = windowEnd;
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

    // ── 1. Find or create customer ───────────────────────────
    let customer;
    if (preVerifiedCustomerId) {
      customer = { id: preVerifiedCustomerId };
      console.log(`[Booking:${brand.key}] Using pre-verified customer ${customer.id}`);
    } else {
      try {
        customer = await findCustomerByPhone(brand, token, cleanPhone);
        if (!customer) {
          customer = await createCustomer(brand, token, { firstName, lastName, phone: cleanPhone, email });
          console.log(`[Booking:${brand.key}] Created new customer ${customer.id} — ${firstName} ${lastName}`);
        } else {
          console.log(`[Booking:${brand.key}] Found existing customer ${customer.id} — ${customer.name}`);
        }
      } catch (err) {
        const detail = err.response?.data || err.message;
        console.error(`[Booking:${brand.key}] Customer step failed:`, detail);
        return res.status(500).json({ error: 'customer_failed', step: 'customer', debug: detail,
          message: `We had trouble submitting your request. ${callUs}` });
      }
    }

    // ── 2. Find or create location ───────────────────────────
    let location;
    if (preVerifiedLocationId) {
      location = { id: preVerifiedLocationId };
      console.log(`[Booking:${brand.key}] Using pre-verified location ${location.id}`);
    } else {
      try {
        const existingLocations = await getCustomerLocations(brand, token, customer.id);
        location = findMatchingLocation(existingLocations, address, zip);
        if (!location) {
          location = await createLocation(brand, token, customer.id, { firstName, lastName, address, city, zip });
          console.log(`[Booking:${brand.key}] Created new location ${location.id} — ${address}, ${city} ${zip}`);
        } else {
          console.log(`[Booking:${brand.key}] Using existing location ${location.id}`);
        }
      } catch (err) {
        const detail = err.response?.data || err.message;
        console.error(`[Booking:${brand.key}] Location step failed:`, detail);
        return res.status(500).json({ error: 'location_failed', step: 'location', debug: detail,
          message: `We had trouble submitting your request. ${callUs}` });
      }
    }

    // ── 3. Create unassigned job ─────────────────────────────
    let job;
    try {
      job = await createJob(brand, token, {
        customerId:     customer.id,
        locationId:     location.id,
        businessUnitId: mapping.businessUnitId,
        jobTypeId:      mapping.jobTypeId,
        summary,
        start: jobStart,
        end:   jobEnd,
        campaignId:     jobCampaignId,
      });
      console.log(`[Booking:${brand.key}] Created unassigned job ${job.id} for ${firstName} ${lastName} — ${issueLabel}`);
    } catch (err) {
      const detail = err.response?.data || err.message;
      console.error(`[Booking:${brand.key}] Job creation failed:`, detail);
      return res.status(500).json({ error: 'job_failed', step: 'job', debug: detail,
        message: `We had trouble submitting your request. ${callUs}` });
    }

    // ── 4. PATCH referral code if provided ───────────────────
    if (referralCode && brand.referralFieldTypeId) {
      try {
        await patchJobReferralCode(brand, token, job.id, referralCode.trim().toUpperCase());
        console.log(`[Booking:${brand.key}] Patched referral code ${referralCode} onto job ${job.id}`);
      } catch (patchErr) {
        console.error(`[Booking:${brand.key}] Failed to patch referral code onto job ${job.id}:`, patchErr.response?.data || patchErr.message);
      }
    }

    return res.status(200).json({
      success:    true,
      brand:      brand.key,
      jobId:      job.id,
      customerId: customer.id,
      locationId: location.id,
      message:    'Job created successfully',
    });

  } catch (err) {
    const stError = err.response?.data || err.message;
    console.error(`[Booking:${brand.key}] Error:`, stError);

    return res.status(500).json({
      error:   'booking_failed',
      step:    'auth_or_unknown',
      debug:   stError,
      message: `We had trouble submitting your request. ${callUs}`,
    });
  }
};
