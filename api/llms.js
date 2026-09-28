/**
 * Serves /llms.txt (plain text) — advertises the booking MCP endpoint to
 * AI assistants and crawlers. Wired via vercel.json rewrite.
 */
const { llmsText } = require('./_discovery');

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(llmsText());
};