// POST /api/lyons-booking — LYONS (King of 5-Star Service), HVAC only.
// Distinct branding; routes to LYONS business units in the shared tenant.
const { createBookingHandler } = require('./_booking-core');
module.exports = createBookingHandler('lyons');
