/**
 * Brand presets for the embeddable scheduler widget.
 * Drop one of these onto window.LEXSchedulerConfig before loading the IIFE,
 * or merge with page-specific overrides (apiEndpoint, position, etc.).
 *
 * NOTE: ETX uses the LEX preset (same branding) but a different apiEndpoint.
 *       LYONS colors below are PROVISIONAL (derived from the live Lyons site)
 *       and must be confirmed against the official Lyons brand spec.
 */
window.SchedulerBrandPresets = {
  // LEX Air Conditioning (DFW) — navy + gold, full trades
  lex: {
    apiEndpoint: '/api/lex-booking',
    logoUrl: null, // defaults to bundled LEX logo
    headerColor: '#133865',
    buttonColor: '#0A5C8C',
    tagline: 'The Gold Standard of White Glove Service',
    phoneNumber: '(972) 466-1917',
    buttonText: 'Book Online',
  },

  // LEX ETX (Tyler / East Texas) — SAME branding as LEX, HVAC only.
  // Only the booking endpoint differs so jobs route to ETX business units.
  etx: {
    apiEndpoint: '/api/etx-booking',
    logoUrl: null,
    headerColor: '#133865',
    buttonColor: '#0A5C8C',
    tagline: 'The Gold Standard of White Glove Service',
    phoneNumber: '(972) 466-1917', // confirm dedicated ETX line
    buttonText: 'Book Online',
  },

  // LYONS (King of 5-Star Service) — distinct blue branding, HVAC only.
  // Colors PROVISIONAL — confirm with official Lyons brand spec.
  lyons: {
    apiEndpoint: '/api/lyons-booking',
    logoUrl: 'https://scheduler-mu-three.vercel.app/lyons-logo.png', // add asset
    headerColor: '#152857',  // Lyons navy (provisional)
    buttonColor: '#0085E2',  // Lyons blue (provisional)
    tagline: 'The King of 5-Star Service',
    phoneNumber: '(972) 888-9669', // confirm Lyons line
    buttonText: 'Book Online',
  },
};
