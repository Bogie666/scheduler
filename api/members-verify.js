/**
 * POST /api/members-verify
 * ─────────────────────────────────────────────────────────────
 * Verifies a customer's membership by phone number, for the
 * selected brand (Lyons, Lex ETX). Brand is chosen via a `brand`
 * field in the body (defaults to DEFAULT_BRAND).
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
const { resolveBrandKey, getBrand, getAccessToken, stHeaders } = require('./_brands');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Brand');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone } = req.body || {};
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const brand      = getBrand(resolveBrandKey(req));
  const cleanPhone = phone.replace(/\D/g, '');

  try {
    const token = await getAccessToken(brand);

    // ── 1. Find customer by phone ────────────────────────────
    const customerRes = await axios.get(
      `${brand.apiBase}/crm/v2/tenant/${brand.tenantId}/customers`,
      { params: { phone: cleanPhone }, headers: stHeaders(brand, token) }
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
      `${brand.apiBase}/crm/v2/tenant/${brand.tenantId}/locations`,
      { params: { customerId: customer.id }, headers: stHeaders(brand, token) }
    );

    const locations = (locationsRes.data?.data || []).map(loc => ({
      id:      loc.id,
      name:    loc.name,
      address: loc.address || {},
    }));

    // ── 3. Check membership status ───────────────────────────
    // The ST Memberships list endpoint ignores customerId/locationId
    // as query filters. We paginate through all active memberships
    // and match by customerId or locationId on each record.
    let isMember = false;
    let membershipCount = 0;
    let customerMemberships = [];
    const customerLocationIds = locations.map(l => l.id);

    try {
      let page = 1;
      const pageSize = 200;
      let hasMore = true;

      while (hasMore) {
        const membershipRes = await axios.get(
          `${brand.apiBase}/memberships/v2/tenant/${brand.tenantId}/memberships`,
          {
            params:  { status: 'Active', page, pageSize },
            headers: stHeaders(brand, token),
          }
        );
        const batch = membershipRes.data?.data || [];

        for (const m of batch) {
          if (m.customerId === customer.id ||
              (m.locationId && customerLocationIds.includes(m.locationId)) ||
              (m.recurringLocationId && customerLocationIds.includes(m.recurringLocationId))) {
            customerMemberships.push(m);
          }
        }

        // Stop if we found matches or reached the last page
        if (customerMemberships.length > 0 || batch.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }

      membershipCount = customerMemberships.length;
      isMember = membershipCount > 0;
    } catch (memberErr) {
      console.error(`[Members:${brand.key}] Membership check failed:`, memberErr.response?.data || memberErr.message);
      isMember = false;
    }

    console.log(`[Members:${brand.key}] Verified customer ${customer.id} — ${customer.name} — member: ${isMember} (${membershipCount} active)`);

    return res.status(200).json({
      success: true,
      brand:   brand.key,
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
    });

  } catch (err) {
    const stError = err.response?.data || err.message;
    console.error(`[Members:${brand.key}] Verify error:`, stError);

    return res.status(500).json({
      error:   'verify_failed',
      debug:   stError,
      message: `Unable to verify membership. Please try again or call ${brand.phone}.`,
    });
  }
};
