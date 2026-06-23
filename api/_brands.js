/**
 * Brand + ServiceTitan routing config for the multi-brand scheduler.
 * ───────────────────────────────────────────────────────────────────
 * All three brands live in ONE ServiceTitan tenant (1498628772).
 * They are separated only by Business Unit. Job types are SHARED across
 * brands, so an "issue" maps to a job type + a service "line", and the
 * brand decides which Business Unit that line routes to.
 *
 * Pulled live from the ServiceTitan API on 2026-06-23.
 * ───────────────────────────────────────────────────────────────────
 */

// ── Issue -> { jobTypeId, line } (brand-agnostic) ──────────────────
// `line` is resolved to a Business Unit per-brand in BRANDS[brand].units
const ISSUE_MAP = {
  // HVAC demand / service
  'ac-not-cooling':     { jobTypeId: 460,    line: 'hvac-service' },
  'heater-not-working': { jobTypeId: 460,    line: 'hvac-service' },
  'strange-noises':     { jobTypeId: 460,    line: 'hvac-service' },
  'hvac-other':         { jobTypeId: 460,    line: 'hvac-service' },
  // HVAC maintenance
  'hvac-maintenance':   { jobTypeId: 528,    line: 'hvac-maint' },
  // HVAC sales / new system
  'new-system':         { jobTypeId: 831156, line: 'hvac-sales' },
  // Plumbing (LEX/DFW only)
  'leak':               { jobTypeId: 521,    line: 'plumbing-service' },
  'clogged-drain':      { jobTypeId: 521,    line: 'plumbing-service' },
  'water-heater':       { jobTypeId: 521,    line: 'plumbing-service' },
  'no-hot-water':       { jobTypeId: 521,    line: 'plumbing-service' },
  'toilet-issue':       { jobTypeId: 521,    line: 'plumbing-service' },
  'plumbing-other':     { jobTypeId: 521,    line: 'plumbing-service' },
  // Electrical (LEX/DFW only)
  'outlet-not-working': { jobTypeId: 515,    line: 'electrical-service' },
  'breaker-tripping':   { jobTypeId: 515,    line: 'electrical-service' },
  'lighting-issue':     { jobTypeId: 515,    line: 'electrical-service' },
  'panel-upgrade':      { jobTypeId: 515,    line: 'electrical-service' },
  'ceiling-fan':        { jobTypeId: 515,    line: 'electrical-service' },
  'electrical-other':   { jobTypeId: 515,    line: 'electrical-service' },
  // Members: HVAC Tune-Ups (shared job types, routed to brand Maintenance BU)
  'members-hvac-1-system': { jobTypeId: 528,       line: 'hvac-maint' },
  'members-hvac-2-system': { jobTypeId: 161649782, line: 'hvac-maint' },
  'members-hvac-3-system': { jobTypeId: 161649821, line: 'hvac-maint' },
  'members-hvac-4-system': { jobTypeId: 161649788, line: 'hvac-maint' },
  'members-hvac-5-system': { jobTypeId: 1753588,   line: 'hvac-maint' },
  'members-hvac-6-system': { jobTypeId: 495,       line: 'hvac-maint' },
  // Members: Inspections (LEX/DFW only)
  'members-plumbing-inspection':   { jobTypeId: 148475761, line: 'plumbing-maint' },
  'members-electrical-inspection': { jobTypeId: 529,       line: 'electrical-maint' },
};

// ── Issue -> summary label ─────────────────────────────────────────
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

// ── Per-brand Business Unit routing + identity ─────────────────────
// units: service line -> Business Unit ID (verified live from ST 2026-06-23)
const BRANDS = {
  lex: {
    key: 'lex',
    name: 'LEX',
    phone: '(972) 466-1917',
    websiteCampaignId: 46472179,   // Lex Website
    referralCampaignId: 421949222, // LexPerks Referral
    units: {
      'hvac-service':      6534,       // LEX Service
      'hvac-maint':        7831,       // LEX Maintenance
      'hvac-sales':        8085,       // LEX Sales
      'plumbing-service':  124467371,  // Plumbing Service
      'plumbing-maint':    124468396,  // Plumbing Maintenance
      'electrical-service':161649734,  // Electrical Service
      'electrical-maint':  455,        // Electrical Maintenance
    },
  },
  etx: {
    key: 'etx',
    name: 'LEX ETX',
    phone: '(972) 466-1917',         // PLACEHOLDER: confirm Tyler/ETX line with Ryan
    websiteCampaignId: 46472179,     // No dedicated ETX online campaign; using Lex Website
    referralCampaignId: 421949222,   // LexPerks Referral
    units: {
      'hvac-service': 154684495,  // ETX Service
      'hvac-maint':   154681497,  // ETX Maintenance
      'hvac-sales':   154691820,  // ETX Sales
      // ETX is HVAC-only: no plumbing/electrical business units exist
    },
  },
  lyons: {
    key: 'lyons',
    name: 'LYONS',
    phone: '(972) 888-9669',         // PLACEHOLDER: confirm Lyons line with Ryan
    websiteCampaignId: 46472180,     // Lyons Website
    referralCampaignId: null,        // No confirmed Lyons referral program yet
    units: {
      'hvac-service': 6540,  // LYONS Service
      'hvac-maint':   8087,  // LYONS Maintenance
      'hvac-sales':   7698,  // LYONS Sales
      // LYONS is HVAC-only: no plumbing/electrical business units exist
    },
  },
};

/** Resolve a booking issue for a given brand. Returns null if unroutable. */
function resolveIssue(brandKey, issue) {
  const brand = BRANDS[brandKey];
  if (!brand) return { error: `Unknown brand: ${brandKey}` };
  const m = ISSUE_MAP[issue];
  if (!m) return { error: `Unknown issue: ${issue}` };
  const businessUnitId = brand.units[m.line];
  if (!businessUnitId) {
    return { error: `Service line "${m.line}" is not offered by brand ${brand.name}` };
  }
  return {
    brand,
    jobTypeId: m.jobTypeId,
    businessUnitId,
    label: SERVICE_LABELS[issue] || issue || 'General Service',
  };
}

module.exports = { ISSUE_MAP, SERVICE_LABELS, BRANDS, resolveIssue };
