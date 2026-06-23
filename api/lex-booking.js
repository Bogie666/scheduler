// POST /api/lex-booking — LEX Air Conditioning (DFW), full trades.
// HVAC + Plumbing + Electrical. Routes to LEX business units in the shared tenant.
// Refactored to use the shared multi-brand booking core (api/_booking-core.js).
const { createBookingHandler } = require('./_booking-core');
module.exports = createBookingHandler('lex');
