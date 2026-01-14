// Vercel Serverless Function for LEX Scheduler -> ServiceTitan Integration

const SERVICETITAN_AUTH_URL = 'https://auth.servicetitan.io/connect/token';
const SERVICETITAN_API_BASE = 'https://api.servicetitan.io';
const TENANT_ID = '1498628772';
const BOOKING_PROVIDER_ID = '346456684';

// In-memory token cache (persists across warm function invocations)
let tokenCache = {
  accessToken: null,
  expiresAt: 0,
};

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Set CORS headers for response
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  try {
    const bookingData = req.body;

    // Validate required fields
    const requiredFields = ['serviceType', 'issue', 'firstName', 'lastName', 'phone', 'address', 'city', 'zip', 'preferredDate', 'preferredTime'];
    const missingFields = requiredFields.filter(field => !bookingData[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        fields: missingFields
      });
    }

    // Get ServiceTitan access token
    const accessToken = await getAccessToken();

    // Create the booking in ServiceTitan
    const booking = await createServiceTitanBooking(accessToken, bookingData);

    return res.status(200).json({
      success: true,
      message: 'Booking submitted successfully',
      bookingId: booking.id,
    });

  } catch (error) {
    console.error('Booking error:', error);

    return res.status(500).json({
      error: 'Failed to submit booking',
      message: error.message || 'An unexpected error occurred',
    });
  }
}

async function getAccessToken() {
  // Return cached token if still valid (with 60s buffer)
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.accessToken;
  }

  const clientId = process.env.SERVICETITAN_CLIENT_ID;
  const clientSecret = process.env.SERVICETITAN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('ServiceTitan credentials not configured');
  }

  const response = await fetch(SERVICETITAN_AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ServiceTitan auth failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Cache the token
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };

  return data.access_token;
}

async function createServiceTitanBooking(accessToken, bookingData) {
  const bookingUrl = `${SERVICETITAN_API_BASE}/crm/v2/tenant/${TENANT_ID}/booking-provider/${BOOKING_PROVIDER_ID}/bookings`;

  // Map time preference to ServiceTitan format
  const timeWindowMap = {
    'morning': { start: '08:00:00', end: '12:00:00' },
    'afternoon': { start: '12:00:00', end: '17:00:00' },
    'first-available': { start: '08:00:00', end: '17:00:00' },
  };
  const timeWindow = timeWindowMap[bookingData.preferredTime] || timeWindowMap['first-available'];

  // Map service type to ServiceTitan business unit/campaign
  const serviceTypeMap = {
    'hvac': { name: 'Heating & Cooling', businessUnitName: 'HVAC' },
    'plumbing': { name: 'Plumbing', businessUnitName: 'Plumbing' },
    'electrical': { name: 'Electrical', businessUnitName: 'Electrical' },
  };
  const serviceInfo = serviceTypeMap[bookingData.serviceType] || serviceTypeMap['hvac'];

  // Build the issue summary
  const issueSummary = formatIssueSummary(bookingData);

  // Generate unique external ID for this booking
  const externalId = `LEX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // ServiceTitan booking payload
  const payload = {
    externalId,
    source: 'Website',
    name: `${bookingData.firstName} ${bookingData.lastName}`,
    summary: issueSummary,
    isFirstTimeClient: true,
    contacts: [
      {
        type: 'Phone',
        value: bookingData.phone,
      },
    ],
    address: {
      street: bookingData.address,
      city: bookingData.city,
      state: bookingData.state || 'TX',
      zip: bookingData.zip,
      country: 'USA',
    },
    start: `${bookingData.preferredDate}T${timeWindow.start}`,
    end: `${bookingData.preferredDate}T${timeWindow.end}`,
  };

  // Add email if provided
  if (bookingData.email) {
    payload.contacts.push({
      type: 'Email',
      value: bookingData.email,
    });
  }

  const response = await fetch(bookingUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'ST-App-Key': process.env.SERVICETITAN_APP_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('ServiceTitan API error:', errorText);
    throw new Error(`ServiceTitan booking failed: ${response.status}`);
  }

  return await response.json();
}

function formatIssueSummary(bookingData) {
  const issueLabels = {
    // HVAC
    'ac-not-cooling': 'AC Not Cooling',
    'heater-not-working': 'Heater Not Working',
    'maintenance': 'Maintenance/Tune-Up',
    'new-system': 'New System Estimate',
    'strange-noises': 'Strange Noises',
    // Plumbing
    'leak': 'Leak/Dripping',
    'clogged-drain': 'Clogged Drain',
    'water-heater': 'Water Heater Issue',
    'no-hot-water': 'No Hot Water',
    'toilet': 'Toilet Problem',
    // Electrical
    'outlet': 'Outlet Not Working',
    'breaker': 'Breaker Tripping',
    'lighting': 'Lighting Issue',
    'panel-upgrade': 'Panel Upgrade',
    'ceiling-fan': 'Ceiling Fan Install',
    // Common
    'other': 'Other',
  };

  const serviceLabels = {
    'hvac': 'HVAC',
    'plumbing': 'Plumbing',
    'electrical': 'Electrical',
  };

  const serviceName = serviceLabels[bookingData.serviceType] || bookingData.serviceType;
  const issueName = issueLabels[bookingData.issue] || bookingData.issue;

  let summary = `${serviceName} - ${issueName}`;

  if (bookingData.issueDetails) {
    summary += `\n\nDetails: ${bookingData.issueDetails}`;
  }

  return summary;
}
