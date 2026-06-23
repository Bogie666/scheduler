// POST /api/etx-booking — LEX ETX (Tyler / East Texas), HVAC only.
// Same branding as LEX; routes to ETX business units in the shared tenant.
const { createBookingHandler } = require('./_booking-core');
module.exports = createBookingHandler('etx');
