/**
 * Public MCP server for LEX / LEX ETX / LYONS service scheduling.
 * ───────────────────────────────────────────────────────────────────
 * A single stateless Streamable-HTTP MCP endpoint that any external
 * assistant (Claude, ChatGPT, etc.) can connect to. It speaks MCP's
 * JSON-RPC 2.0 protocol over HTTP POST and exposes three tools:
 *
 *   list_services      — the bookable issues + which brands offer them
 *   check_availability — open dispatch windows for an issue (read-only)
 *   book_service       — create a real ServiceTitan job (supports dryRun)
 *
 * It reuses the EXACT same booking + availability cores as the website
 * widget (api/_booking-core.js, api/_availability-core.js), so an
 * assistant booking a job and the website widget booking a job hit
 * ServiceTitan through identical, already-proven code. No ST logic is
 * duplicated here.
 *
 * Transport: stateless JSON-RPC over POST. Each call is self-contained;
 * we do not keep SSE sessions, which is the simplest shape that works
 * with Vercel serverless functions and MCP's Streamable HTTP clients.
 * ───────────────────────────────────────────────────────────────────
 */

const { performBooking } = require('./_booking-core');
const { getAvailability } = require('./_availability-core');
const { BRANDS, ISSUE_MAP, SERVICE_LABELS, resolveIssue } = require('./_brands');

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'lex-scheduler', title: 'LEX Air Scheduling', version: '1.0.0' };

// This public MCP is scoped to LEX only (Dallas / Plano / DFW, all trades).
// ETX and LYONS routing still lives in _brands.js for the website widget,
// but is intentionally NOT exposed here.
const BRAND_KEY = 'lex';

// Only issues LEX actually services (has a Business Unit for).
function lexServiceableIssues() {
  return Object.keys(ISSUE_MAP).filter((issue) => {
    const m = ISSUE_MAP[issue];
    return m && !!BRANDS[BRAND_KEY].units[m.line];
  });
}

// ── Tool catalog ───────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'list_services',
    title: 'List bookable services',
    description:
      'List every service issue LEX Air can schedule and its human label. ' +
      'Call this first to discover valid `issue` values for check_availability and book_service. ' +
      'LEX serves the Dallas / Plano / DFW metro and covers HVAC, plumbing, and electrical.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'check_availability',
    title: 'Check appointment availability',
    description:
      'Return open appointment days and time windows (Central Time) for a given service issue over the next 14 days. ' +
      'Read-only: books nothing. Use the returned window start/end with book_service for a precise slot, ' +
      'or just tell the customer which days are open.',
    inputSchema: {
      type: 'object',
      properties: {
        issue: { type: 'string', description: 'Issue id from list_services, e.g. "ac-not-cooling", "leak", "panel-upgrade".' },
        startsOn: { type: 'string', description: 'Optional ISO date (YYYY-MM-DD) to start the search from. Defaults to today.' },
      },
      required: ['issue'],
      additionalProperties: false,
    },
  },
  {
    name: 'book_service',
    title: 'Book a service appointment',
    description:
      'Create a real LEX Air service appointment (an unassigned job on the ServiceTitan dispatch board). ' +
      'ALWAYS confirm the customer name, phone, full service address, issue, and preferred date/time with the user before calling this. ' +
      'Set dryRun:true first to validate routing without creating anything; then call again with dryRun:false to actually book. ' +
      'Returns a jobId on success.',
    inputSchema: {
      type: 'object',
      properties: {
        issue: { type: 'string', description: 'Issue id from list_services.' },
        issueDetails: { type: 'string', description: 'Optional free-text describing the problem in the customer\u2019s words.' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        phone: { type: 'string', description: 'Customer phone number.' },
        email: { type: 'string', description: 'Optional email.' },
        address: { type: 'string', description: 'Street address of the service location.' },
        city: { type: 'string' },
        zip: { type: 'string', description: '5-digit ZIP.' },
        preferredDate: { type: 'string', description: 'Preferred date, YYYY-MM-DD.' },
        preferredTime: { type: 'string', enum: ['morning', 'afternoon', 'first-available'], description: 'morning = 8am-12pm, afternoon = 12pm-5pm, first-available = ASAP. Default first-available.' },
        windowStart: { type: 'string', description: 'Optional exact ISO start (from check_availability) overriding preferredTime.' },
        windowEnd: { type: 'string', description: 'Optional exact ISO end (from check_availability).' },
        dryRun: { type: 'boolean', description: 'If true, validate + resolve routing but do NOT create anything in ServiceTitan. Recommended before the real booking.' },
      },
      required: ['issue', 'firstName', 'lastName', 'phone', 'address', 'city', 'zip', 'preferredDate'],
      additionalProperties: false,
    },
  },
];

// ── Tool implementations. Each returns an MCP tool result object. ───
function textResult(obj, isError = false) {
  return {
    content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }],
    isError,
  };
}

async function runTool(name, args) {
  args = args || {};
  if (name === 'list_services') {
    const services = lexServiceableIssues().map((issue) => ({
      issue,
      label: SERVICE_LABELS[issue] || issue,
    }));
    const b = BRANDS[BRAND_KEY];
    return textResult({
      brand: { key: BRAND_KEY, name: b.name, phone: b.phone, area: 'Dallas / Plano / DFW metro', trades: ['HVAC', 'Plumbing', 'Electrical'] },
      services,
    });
  }

  if (name === 'check_availability') {
    const { statusCode, body } = await getAvailability(args.issue, args.startsOn);
    if (statusCode !== 200) return textResult(body, true);
    if (!body.slots || body.slots.length === 0) {
      return textResult({ slots: [], message: 'No open windows in the next 14 days. The customer should call to be squeezed in.' });
    }
    return textResult(body);
  }

  if (name === 'book_service') {
    // Fixed to LEX. Guard: reject an issue LEX can't service before hitting ST.
    const check = resolveIssue(BRAND_KEY, args.issue);
    if (check.error) return textResult({ error: check.error }, true);
    const { statusCode, body } = await performBooking(args, BRAND_KEY, { dryRun: !!args.dryRun });
    return textResult(body, statusCode !== 200);
  }

  return textResult({ error: `Unknown tool: ${name}` }, true);
}

// ── JSON-RPC dispatch ──────────────────────────────────────────────
function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

async function handleRpc(msg) {
  const { id, method, params } = msg || {};
  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          'Scheduling tools for LEX Air (Dallas/Plano/DFW), LEX ETX (Tyler), and LYONS (Rockwall). ' +
          'Use list_services to discover issues, check_availability to find open days, and book_service to schedule. ' +
          'Always confirm the customer\u2019s name, phone, address, and preferred time before booking.',
      });
    case 'notifications/initialized':
      return null; // notification, no response
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, { tools: TOOLS });
    case 'tools/call': {
      const toolName = params?.name;
      const toolArgs = params?.arguments;
      if (!toolName) return rpcError(id, -32602, 'Missing tool name');
      try {
        const result = await runTool(toolName, toolArgs);
        return rpcResult(id, result);
      } catch (err) {
        console.error('[MCP] tool error:', err?.response?.data || err?.message || err);
        return rpcResult(id, textResult({ error: 'tool_execution_failed', detail: String(err?.message || err) }, true));
      }
    }
    default:
      if (id === undefined || id === null) return null; // unknown notification
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

// ── Vercel HTTP handler (Streamable HTTP transport) ────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET is used by some clients to open an SSE stream. We are stateless
  // and reply on POST only, so advertise that there is no open stream.
  if (req.method === 'GET') {
    return res.status(405).json({ error: 'This MCP endpoint is stateless; send JSON-RPC over POST.' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  }

  try {
    // MCP allows a single message or a batch array.
    if (Array.isArray(payload)) {
      const responses = [];
      for (const m of payload) {
        const r = await handleRpc(m);
        if (r) responses.push(r);
      }
      // If every message was a notification, reply 202 with no body.
      if (responses.length === 0) return res.status(202).end();
      return res.status(200).json(responses);
    }

    const response = await handleRpc(payload);
    if (!response) return res.status(202).end(); // notification
    return res.status(200).json(response);
  } catch (err) {
    console.error('[MCP] fatal:', err?.message || err);
    return res.status(500).json({ jsonrpc: '2.0', id: payload?.id ?? null, error: { code: -32603, message: 'Internal error' } });
  }
};

// Exported for local testing.
module.exports.handleRpc = handleRpc;
module.exports.TOOLS = TOOLS;