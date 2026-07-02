/**
 * Shared ServiceTitan brand registry
 * ─────────────────────────────────────────────────────────────
 * The scheduler serves multiple brands (Lyons, Lex ETX) that are
 * connected through the same ServiceTitan API. Each brand can have
 * its own tenant, credentials, Business Unit / Job Type IDs,
 * campaigns and referral custom field.
 *
 * A request selects its brand via `?brand=`, a `brand` field in the
 * POST body, or an `X-Brand` header. When no brand is supplied the
 * DEFAULT_BRAND is used so existing embeds keep working unchanged.
 *
 * Credentials resolve from brand-specific env vars first, then the
 * shared ones — so "same ServiceTitan API" works with a single set
 * of credentials, while a brand that needs its own can override:
 *
 *   ST_LYONS_TENANT_ID / ST_LYONS_CLIENT_ID / ST_LYONS_CLIENT_SECRET / ST_LYONS_APP_KEY
 *   ST_LEX_ETX_TENANT_ID / ST_LEX_ETX_CLIENT_ID / ...
 *   (fallback) ST_TENANT_ID / ST_CLIENT_ID / ST_CLIENT_SECRET / ST_APP_KEY
 * ─────────────────────────────────────────────────────────────
 */

const axios = require('axios');

const ST_AUTH_URL = 'https://auth.servicetitan.io/connect/token';
const ST_API_BASE = 'https://api.servicetitan.io';

// ── Lex / Lex ETX: Issue → { jobTypeId, businessUnitId } ─────
// These are the IDs the live LEX tenant already uses. Lex ETX is
// assumed to share this tenant + these Business Units; confirm and
// override per-brand below if ETX runs its own Business Units.
const LEX_JOB_TYPE_MAP = {
  // HVAC
  'ac-not-cooling':     { jobTypeId: 460,    businessUnitId: 6534 },
  'heater-not-working': { jobTypeId: 460,    businessUnitId: 6534 },
  'strange-noises':     { jobTypeId: 460,    businessUnitId: 6534 },
  'hvac-other':         { jobTypeId: 460,    businessUnitId: 6534 },
  'hvac-maintenance':   { jobTypeId: 528,    businessUnitId: 7831 },
  'new-system':         { jobTypeId: 831156, businessUnitId: 8085 },
  // Plumbing
  'leak':               { jobTypeId: 521,       businessUnitId: 124467371 },
  'clogged-drain':      { jobTypeId: 521,       businessUnitId: 124467371 },
  'water-heater':       { jobTypeId: 521,       businessUnitId: 124467371 },
  'no-hot-water':       { jobTypeId: 521,       businessUnitId: 124467371 },
  'toilet-issue':       { jobTypeId: 521,       businessUnitId: 124467371 },
  'water-quality-test': { jobTypeId: 158642924, businessUnitId: 8085 },
  'plumbing-other':     { jobTypeId: 521,       businessUnitId: 124467371 },
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

// ── Lyons: Issue → { jobTypeId, businessUnitId } ─────────────
// TODO(Lyons): replace every id below with Lyons' own ServiceTitan
// Business Unit + Job Type ids. Keys must match the widget's issue
// ids (see src/SchedulerWidget.jsx). Any issue left null will be
// rejected by the API until filled in.
const LYONS_JOB_TYPE_MAP = {
  // HVAC
  'ac-not-cooling':     { jobTypeId: null, businessUnitId: null },
  'heater-not-working': { jobTypeId: null, businessUnitId: null },
  'strange-noises':     { jobTypeId: null, businessUnitId: null },
  'hvac-other':         { jobTypeId: null, businessUnitId: null },
  'hvac-maintenance':   { jobTypeId: null, businessUnitId: null },
  'new-system':         { jobTypeId: null, businessUnitId: null },
  // Plumbing
  'leak':               { jobTypeId: null, businessUnitId: null },
  'clogged-drain':      { jobTypeId: null, businessUnitId: null },
  'water-heater':       { jobTypeId: null, businessUnitId: null },
  'no-hot-water':       { jobTypeId: null, businessUnitId: null },
  'toilet-issue':       { jobTypeId: null, businessUnitId: null },
  'water-quality-test': { jobTypeId: null, businessUnitId: null },
  'plumbing-other':     { jobTypeId: null, businessUnitId: null },
  // Electrical
  'outlet-not-working': { jobTypeId: null, businessUnitId: null },
  'breaker-tripping':   { jobTypeId: null, businessUnitId: null },
  'lighting-issue':     { jobTypeId: null, businessUnitId: null },
  'panel-upgrade':      { jobTypeId: null, businessUnitId: null },
  'ceiling-fan':        { jobTypeId: null, businessUnitId: null },
  'electrical-other':   { jobTypeId: null, businessUnitId: null },
  // Members: HVAC Tune-Ups (by system count)
  'members-hvac-1-system': { jobTypeId: null, businessUnitId: null },
  'members-hvac-2-system': { jobTypeId: null, businessUnitId: null },
  'members-hvac-3-system': { jobTypeId: null, businessUnitId: null },
  'members-hvac-4-system': { jobTypeId: null, businessUnitId: null },
  'members-hvac-5-system': { jobTypeId: null, businessUnitId: null },
  'members-hvac-6-system': { jobTypeId: null, businessUnitId: null },
  // Members: Inspections
  'members-plumbing-inspection':   { jobTypeId: null, businessUnitId: null },
  'members-electrical-inspection': { jobTypeId: null, businessUnitId: null },
};

// ── Issue → summary label (shared across brands) ─────────────
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
  'water-quality-test': 'Water Quality Test',
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

// ── Brand definitions ────────────────────────────────────────
const BRAND_DEFS = {
  'lex-etx': {
    key:                 'lex-etx',
    displayName:         'LEX ETX',
    phone:               '(972) 466-1917',   // TODO(Lex ETX): confirm ETX support number
    state:               'TX',
    defaultTenantId:     '1498628772',
    referralFieldTypeId: 406119323,
    // campaignId to stamp on created jobs: website (no referral) vs referral
    campaigns:           { website: 46472179, referral: 421949222 },
    jobTypeMap:          LEX_JOB_TYPE_MAP,
    serviceLabels:       SERVICE_LABELS,
  },
  'lyons': {
    key:                 'lyons',
    displayName:         'Lyons',
    phone:               '(000) 000-0000',   // TODO(Lyons): real support number
    state:               'TX',               // TODO(Lyons): confirm state
    defaultTenantId:     null,               // TODO(Lyons): set via ST_LYONS_TENANT_ID
    referralFieldTypeId: null,               // TODO(Lyons): referral custom field type id, if used
    campaigns:           { website: null, referral: null }, // TODO(Lyons): campaign ids
    jobTypeMap:          LYONS_JOB_TYPE_MAP,
    serviceLabels:       SERVICE_LABELS,
  },
};

// Requests with no brand fall back to this. 'lex-etx' holds the ids the
// live widget already uses, so existing embeds keep working unchanged.
const DEFAULT_BRAND = 'lex-etx';

// ── Credential resolution ────────────────────────────────────
function envFor(brandKey, name) {
  const prefix = brandKey.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return process.env[`ST_${prefix}_${name}`];
}

function resolveCredentials(brandKey, def) {
  return {
    tenantId:     envFor(brandKey, 'TENANT_ID')     || process.env.ST_TENANT_ID     || def.defaultTenantId,
    appKey:       envFor(brandKey, 'APP_KEY')       || process.env.ST_APP_KEY       || process.env.ST_APP_ID || process.env.SERVICETITAN_APP_KEY,
    clientId:     envFor(brandKey, 'CLIENT_ID')     || process.env.ST_CLIENT_ID     || process.env.SERVICETITAN_CLIENT_ID,
    clientSecret: envFor(brandKey, 'CLIENT_SECRET') || process.env.ST_CLIENT_SECRET || process.env.SERVICETITAN_CLIENT_SECRET,
  };
}

/**
 * Resolve the brand key from a request. Accepts `?brand=`, a `brand`
 * field in the JSON body, or an `X-Brand` header. Unknown/missing
 * values fall back to DEFAULT_BRAND.
 */
function resolveBrandKey(req) {
  const raw =
    (req.query && req.query.brand) ||
    (req.body && req.body.brand) ||
    (req.headers && (req.headers['x-brand'] || req.headers['X-Brand'])) ||
    DEFAULT_BRAND;
  const key = String(raw).toLowerCase();
  return BRAND_DEFS[key] ? key : DEFAULT_BRAND;
}

/**
 * Get a fully-resolved brand config (static def + credentials +
 * endpoints) for the given key.
 */
function getBrand(brandKey) {
  const key = BRAND_DEFS[brandKey] ? brandKey : DEFAULT_BRAND;
  const def = BRAND_DEFS[key];
  return {
    ...def,
    ...resolveCredentials(key, def),
    authUrl: ST_AUTH_URL,
    apiBase: ST_API_BASE,
  };
}

// ── Per-brand OAuth token cache ──────────────────────────────
const tokenCache = {}; // brandKey -> { token, expiresAt }

async function getAccessToken(brand) {
  const cached = tokenCache[brand.key];
  if (cached && Date.now() < cached.expiresAt - 60000) return cached.token;

  const res = await axios.post(
    brand.authUrl,
    new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     brand.clientId,
      client_secret: brand.clientSecret,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  tokenCache[brand.key] = {
    token:     res.data.access_token,
    expiresAt: Date.now() + res.data.expires_in * 1000,
  };
  return res.data.access_token;
}

function stHeaders(brand, token) {
  return {
    Authorization:  `Bearer ${token}`,
    'ST-App-Key':   brand.appKey,
    'Content-Type': 'application/json',
  };
}

module.exports = {
  BRAND_DEFS,
  DEFAULT_BRAND,
  resolveBrandKey,
  getBrand,
  getAccessToken,
  stHeaders,
};
