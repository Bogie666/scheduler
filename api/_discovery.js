/**
 * Shared discovery metadata for the LEX public MCP server.
 * ───────────────────────────────────────────────────────────────────
 * One source of truth for every agent-discovery surface:
 *   - the well-known MCP server cards served on book.lexperks.com
 *   - llms.txt
 *   - the static drop-in files packaged for lexairconditioning.com
 *   - the server.json for the official MCP Registry
 *
 * Keeping it here means the live endpoints and the packaged files can
 * never drift.
 * ───────────────────────────────────────────────────────────────────
 */

const MCP_ENDPOINT = 'https://book.lexperks.com/api/mcp';
const SITE = 'https://www.lexairconditioning.com';
const PHONE = '(972) 466-1917';

// MCP "server card" — the JSON an agent reads at a well-known URL to learn
// the endpoint, transport, auth posture, and what the server can do.
function serverCard() {
  return {
    schemaVersion: '2025-06-18',
    name: 'com.lexairconditioning/scheduler',
    title: 'LEX Air Scheduling',
    description:
      'Book HVAC, plumbing, and electrical service with LEX Air Conditioning in the Dallas / Plano / DFW metro. ' +
      'Discover services, check real appointment availability, and schedule a technician visit.',
    version: '1.0.0',
    provider: {
      name: 'LEX Air Conditioning, Heating, Plumbing & Electrical',
      url: SITE,
      phone: PHONE,
      areaServed: 'Dallas-Fort Worth metroplex, Texas',
    },
    remotes: [
      { type: 'streamable-http', url: MCP_ENDPOINT },
    ],
    // Convenience mirror of the transport for readers that expect a flat field.
    endpoint: MCP_ENDPOINT,
    transport: 'streamable-http',
    authentication: { type: 'none' },
    capabilities: { tools: true },
    tools: [
      { name: 'list_services', description: 'List every service LEX can schedule (HVAC, plumbing, electrical).' },
      { name: 'check_availability', description: 'Return open appointment days and time windows for the next 14 days. Read-only.' },
      { name: 'book_service', description: 'Create a real service appointment. Supports dryRun for validation.' },
    ],
    documentation: `${SITE}/schedule-with-ai`,
  };
}

// llms.txt — a plain-text file agents (and crawlers) read to understand the
// site and, crucially, that a booking MCP endpoint exists.
function llmsText() {
  return `# LEX Air Conditioning, Heating, Plumbing & Electrical

> Three-generation family home-services company serving the Dallas / Plano / Fort Worth / Rockwall metroplex. HVAC, plumbing, and electrical service, repair, maintenance, and installation.

Customers (and AI assistants acting for them) can schedule service directly through our public Model Context Protocol (MCP) endpoint. No account or API key is required.

## Book service with an AI assistant (MCP)

- MCP endpoint: ${MCP_ENDPOINT}
- Transport: Streamable HTTP (JSON-RPC 2.0 over POST)
- Authentication: none (public)
- Server card: https://book.lexperks.com/.well-known/mcp.json

Tools:
- list_services: discover bookable HVAC / plumbing / electrical issues
- check_availability: open appointment days and time windows (next 14 days, read-only)
- book_service: create a real appointment (supports dryRun validation)

Guidance for assistants: confirm the customer's name, phone, full service address, the issue, and a preferred date/time before calling book_service. Call book_service with dryRun:true first to validate, then dryRun:false to book.

## Contact

- Phone: ${PHONE}
- Website: ${SITE}
- Service area: Dallas-Fort Worth metroplex, Texas
`;
}

module.exports = { serverCard, llmsText, MCP_ENDPOINT, SITE, PHONE };