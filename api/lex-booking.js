/**
 * POST /api/booking
 * ─────────────────────────────────────────────────────────────
 * Receives booking requests from the scheduler widget and
 * submits them to ServiceTitan via the Bookings Provider API.
 *
 * If a referral code is included, it is written to the
 * "Referred by Code" custom field (typeId: 406119323)
 * on the booking record so CSRs can see it.
 * ─────────────────────────────────────────────────────────────
 */

const axios = require('axios');

const ST_AUTH_URL          = 'https://auth.servicetitan.io/connect/token';
const ST_API_BASE          = 'https://api.servicetitan.io';
const TENANT_ID            = process.env.ST_TENANT_ID            || '1498628772';
const APP_KEY              = process.env.ST_APP_KEY               || process.env.ST_APP_ID;
const CLIENT_ID            = process.env.ST_CLIENT_ID;
const CLIENT_SECRET        = process.env.ST_CLIENT_SECRET;
const BOOKING_PROVIDER_ID  = process.env.ST_BOOKING_PROVIDER_ID  || '346456684';

// ── Token cache ───────────────────────────────────────────────
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

// ── Service type → summary label ─────────────────────────────
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
};

// ── Main handler ──────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // CORS
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

  // Basic validation
  if (!firstName || !lastName || !phone || !address || !city || !zip) {
    return res.status(400).json({ error: 'Missing required fields', required: ['firstName', 'lastName', 'phone', 'address', 'city', 'zip'] });
  }

  try {
    const token = await getAccessToken();

    // ── Build summary string ───────────────────────────────────
    const issueLabel  = SERVICE_LABELS[issue] || issue || 'General Service';
    const timeLabel   = preferredTime === 'morning' ? '8am-12pm' : preferredTime === 'afternoon' ? '12pm-5pm' : 'First Available';
    const cleanPhone  = phone.replace(/\D/g, '');

    let summary = `${issueLabel}`;
    if (issueDetails) summary += ` — ${issueDetails}`;
    summary += ` | Preferred: ${preferredDate} ${timeLabel}`;

    // Include referral code in summary so CSRs can see it clearly
    if (referralCode) {
      summary += ` | REFERRAL CODE: ${referralCode} *** $50 Off $350+ ***`;
    }

    // ── Build contacts array ───────────────────────────────────
    const contacts = [{ type: 'Phone', value: cleanPhone }];
    if (email) contacts.push({ type: 'Email', value: email });

    // ── Submit to ST Bookings API ─────────────────────────────
    const bookingPayload = {
      source:    'Online',
      name:      `${firstName} ${lastName}`,
      address: {
        street:  address,
        city,
        state:   'TX',
        zip,
        country: 'US',
      },
      contacts,
      summary,
      isFirstTimeClient: false,
      priority:          'Normal',
    };

    const response = await axios.post(
      `${ST_API_BASE}/crm/v2/tenant/${TENANT_ID}/booking-provider/${BOOKING_PROVIDER_ID}/bookings`,
      bookingPayload,
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          'ST-App-Key':   APP_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`[Booking] Created ST booking ${response.data?.id} for ${firstName} ${lastName}${referralCode ? ` | ref: ${referralCode}` : ''}`);

    return res.status(200).json({
      success:   true,
      bookingId: response.data?.id,
      message:   'Booking request submitted successfully',
    });

  } catch (err) {
    const stError = err.response?.data || err.message;
    console.error('[Booking] Full ST Error:', JSON.stringify(stError, null, 2));

    return res.status(500).json({
      error:   'booking_failed',
      message: 'We had trouble submitting your request. Please call us at (972) 466-1917.',
      debug:   stError,
    });
  }
};
