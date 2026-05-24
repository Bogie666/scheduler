/**
 * POST /api/members-verify
 * ─────────────────────────────────────────────────────────────
 * Verifies a customer's LEX membership by phone number.
 *
 * Returns:
 *   - customer info (id, name, phone, email)
 *   - locations array
 *   - membership status
 *
 * If the Memberships API call fails, the customer is allowed
 * through (graceful fallback — don't block on API issues).
 * ─────────────────────────────────────────────────────────────
 */

const axios = require('axios');

const ST_AUTH_URL   = 'https://auth.servicetitan.io/connect/token';
const ST_API_BASE   = 'https://api.servicetitan.io';
const TENANT_ID     = process.env.ST_TENANT_ID     || '1498628772';
const APP_KEY       = process.env.ST_APP_KEY        || process.env.ST_APP_ID || process.env.SERVICETITAN_APP_KEY;
const CLIENT_ID     = process.env.ST_CLIENT_ID      || process.env.SERVICETITAN_CLIENT_ID;
const CLIENT_SECRET = process.env.ST_CLIENT_SECRET  || process.env.SERVICETITAN_CLIENT_SECRET;

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone } = req.body || {};
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const cleanPhone = phone.replace(/\D/g, '');

  try {
    const token = await getAccessToken();

    // ── 1. Find customer by phone ────────────────────────────
    const customerRes = await axios.get(
      `${ST_API_BASE}/crm/v2/tenant/${TENANT_ID}/customers`,
      { params: { phone: cleanPhone }, headers: stHeaders(token) }
    );

    const customers = customerRes.data?.data || [];
    if (customers.length === 0) {
      return res.status(404).json({
        error:   'no_customer',
        message: 'No account found with this phone number.',
      });
    }

    const customer = customers[0];

    // Parse name into first/last
    const nameParts = (customer.name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName  = nameParts.slice(1).join(' ') || '';

    // Get email from contacts
    const contacts = customer.contacts || [];
    const emailContact = contacts.find(c => c.type === 'Email');

    // ── 2. Get customer locations ────────────────────────────
    const locationsRes = await axios.get(
      `${ST_API_BASE}/crm/v2/tenant/${TENANT_ID}/locations`,
      { params: { customerId: customer.id }, headers: stHeaders(token) }
    );

    const locations = (locationsRes.data?.data || []).map(loc => ({
      id:      loc.id,
      name:    loc.name,
      address: loc.address || {},
    }));

    // ── 3. Check membership status ───────────────────────────
    // The ST Memberships API ignores the customerId query param and
    // returns all tenant memberships. We filter client-side by
    // matching customerId or locationIds on each membership record.
    let isMember = false;
    let membershipCount = 0;
    let membershipDebug = null;
    const customerLocationIds = locations.map(l => l.id);

    try {
      const membershipRes = await axios.get(
        `${ST_API_BASE}/memberships/v2/tenant/${TENANT_ID}/memberships`,
        {
          params:  { status: 'Active', pageSize: 200 },
          headers: stHeaders(token),
        }
      );
      const allMemberships = membershipRes.data?.data || [];

      // Filter to memberships that belong to this customer
      const customerMemberships = allMemberships.filter(m => {
        if (m.customerId === customer.id) return true;
        if (m.locationId && customerLocationIds.includes(m.locationId)) return true;
        return false;
      });

      membershipCount = customerMemberships.length;
      isMember = membershipCount > 0;
      membershipDebug = {
        totalActive: allMemberships.length,
        customerMatches: customerMemberships.map(m => ({
          id: m.id,
          status: m.status,
          customerId: m.customerId,
          locationId: m.locationId,
          name: m.membershipType?.name || m.name,
        })),
        customerIdChecked: customer.id,
        locationIdsChecked: customerLocationIds,
      };
    } catch (memberErr) {
      console.error('[Members] Membership check failed:', memberErr.response?.data || memberErr.message);
      membershipDebug = { error: memberErr.response?.data || memberErr.message };
      isMember = false;
    }

    console.log(`[Members] Verified customer ${customer.id} — ${customer.name} — member: ${isMember} (${membershipCount} active)`);

    return res.status(200).json({
      success: true,
      customer: {
        id:        customer.id,
        firstName,
        lastName,
        phone:     cleanPhone,
        email:     emailContact?.value || '',
      },
      locations,
      isMember,
      membershipCount,
      debug: { memberships: membershipDebug },
    });

  } catch (err) {
    const stError = err.response?.data || err.message;
    console.error('[Members] Verify error:', stError);

    return res.status(500).json({
      error:   'verify_failed',
      debug:   stError,
      message: 'Unable to verify membership. Please try again or call (972) 466-1917.',
    });
  }
};
