/**
 * GET /api/availability
 * ─────────────────────────────────────────────────────────────
 * Thin transport wrapper around the shared availability core
 * (api/_availability-core.js). The website widget and the public
 * MCP server both use that same core, so capacity logic lives in
 * exactly one place.
 *
 * Query params:
 *   issue    (required) — the issue id from the widget
 *   startsOn (optional) — ISO date string, defaults to today
 * ─────────────────────────────────────────────────────────────
 */

const { getAvailability } = require('./_availability-core');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { issue, startsOn } = req.query || {};
  const { statusCode, body } = await getAvailability(issue, startsOn);
  return res.status(statusCode).json(body);
};