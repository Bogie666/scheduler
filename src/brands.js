/**
 * Frontend brand presets
 * ─────────────────────────────────────────────────────────────
 * Branding defaults per brand (Lyons, Lex ETX). A caller selects a
 * brand with `brand: 'lyons'` in the widget config; any value it also
 * passes explicitly (logoUrl, headerColor, …) overrides the preset.
 *
 * `brand` is also forwarded to the backend so ServiceTitan calls hit
 * the right tenant / Business Units (see api/_brands.js).
 * ─────────────────────────────────────────────────────────────
 */

export const DEFAULT_BRAND = 'lex-etx';

export const BRAND_PRESETS = {
  'lex-etx': {
    brand:          'lex-etx',
    displayName:    'LEX ETX',
    // Left null to preserve the current live text header. Set to
    // 'https://scheduler-mu-three.vercel.app/Lex-logo.png' to show the logo.
    logoUrl:        null,
    headerColor:    '#133865',
    buttonColor:    '#0A5C8C',
    phoneNumber:    '(972) 466-1917', // TODO(Lex ETX): confirm ETX support number
    tagline:        'The Gold Standard of White Glove Service',
    headerSubtitle: 'LEX Air Conditioning • Plumbing • Electrical',
  },
  'lyons': {
    brand:          'lyons',
    displayName:    'Lyons',
    logoUrl:        null,             // TODO(Lyons): hosted logo URL
    headerColor:    '#1E3A5F',        // TODO(Lyons): brand header color
    buttonColor:    '#2C6E9B',        // TODO(Lyons): brand button color
    phoneNumber:    '(000) 000-0000', // TODO(Lyons): real support number
    tagline:        'Lyons — Home Services You Can Trust', // TODO(Lyons): tagline
    headerSubtitle: 'Heating • Cooling • Plumbing • Electrical',
  },
};

export function getBrandPreset(brand) {
  return BRAND_PRESETS[brand] || BRAND_PRESETS[DEFAULT_BRAND];
}
