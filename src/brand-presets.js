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
    phoneNumber: '(903) 581-6561', // ETX (Tyler / East Texas) line
    buttonText: 'Book Online',
  },

  // LYONS (King of 5-Star Service) — distinct purple/cyan/orange branding, HVAC only.
  // Colors taken from the official Lyons mascot logo (purple bg, cyan top,
  // orange accents, navy wordmark). Logo asset: public/lyons-logo.png (add file).
  lyons: {
    apiEndpoint: '/api/lyons-booking',
    logoUrl: 'https://scheduler-mu-three.vercel.app/lyons-logo.png', // add public/lyons-logo.png
    headerColor: '#552C91',  // Lyons purple (primary brand)
    buttonColor: '#F7941E',  // Lyons orange (signature CTA accent)
    tagline: 'The King of 5-Star Service',
    phoneNumber: '(214) 432-2859', // Lyons line
    buttonText: 'Book Online',
  },
};
