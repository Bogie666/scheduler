/**
 * Serves the MCP "server card" at the well-known discovery paths.
 * Wired via vercel.json rewrites:
 *   /.well-known/mcp.json
 *   /.well-known/mcp-server
 *   /.well-known/mcp/server-card.json
 */
const { serverCard } = require('./_discovery');

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res.status(200).json(serverCard());
};