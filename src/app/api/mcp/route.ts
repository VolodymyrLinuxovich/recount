// A small, read-only MCP server (Streamable HTTP, stateless JSON responses) so anyone can check
// our agents' numbers from their own AI client: VS Code (GitHub Copilot), Claude, Cursor, ...
// It serves the same aggregate numbers as /dashboard. No case, bill or message is reachable here.

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { STACK, VALIDATION } from "@/components/dashboard/facts";

const PROTOCOL = "2025-06-18";
const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];

const hours = { type: "number", description: "How far back to look, in hours (1 to 720). Default 48.", minimum: 1, maximum: 720 };

const TOOLS = [
  {
    name: "get_agent_metrics",
    title: "Agent metrics",
    description: "Per agent (bill reading, Azure AI Document Intelligence second read, letter writing, chat, Azure AI Search, Azure AI Content Safety, Apify price lookups, rule checks): number of runs, success rate, median and 90th percentile time, quality score, models used. Plus totals and how many bills, live steps and chat messages Convex has handled.",
    inputSchema: { type: "object", properties: { hours }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "get_agent_timeseries",
    title: "Agent performance over time",
    description: "Runs, successes, median time and quality score per agent in 15-minute buckets.",
    inputSchema: {
      type: "object",
      properties: { hours, agent: { type: "string", description: "Optional: one agent, e.g. read, docintel, column, letters, chat, search, safety, apify, read-check, letters-check." } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "get_recent_agent_runs",
    title: "Most recent agent runs",
    description: "The 15 most recent agent actions: when, which agent and model, how long, whether it worked. No content.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "get_validation_results",
    title: "Validation results",
    description: "Fixed test results (planted-error eval, price checks against hand-checked prices, coverage, the statewide policy audit), each with the source file to re-run it, and the stack facts (search index size, Apify Actor id).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization",
};

function reply(body: unknown, status = 200) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
}

function clampHours(x: unknown) {
  const n = typeof x === "number" && Number.isFinite(x) ? x : 48;
  return Math.min(Math.max(n, 1), 720);
}

async function callTool(name: string, args: Record<string, unknown>) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (name === "get_validation_results") return { validation: VALIDATION, stack: STACK };
  if (!url) throw new Error("Backend not configured");
  const client = new ConvexHttpClient(url);
  const s = await client.query(api.dashboard.summary, { hours: clampHours(args.hours) });
  if (name === "get_agent_metrics") return { since: new Date(s.since).toISOString(), total: s.total, agents: s.agents, convex: s.convex };
  if (name === "get_agent_timeseries") {
    const agent = typeof args.agent === "string" ? args.agent : null;
    return { bucketMinutes: s.bucketMs / 60000, series: s.series.filter((p) => !agent || p.agent === agent).map((p) => ({ ...p, t: new Date(p.t).toISOString() })) };
  }
  if (name === "get_recent_agent_runs") return { runs: s.recent.map((r) => ({ ...r, at: new Date(r.at).toISOString() })) };
  throw new Error(`Unknown tool: ${name}`);
}

async function handle(msg: Rpc) {
  const id = msg.id ?? null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: SUPPORTED.includes(asked) ? asked : PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "recount-agent-metrics", title: "Recount agent metrics", version: "1.0.0" },
        instructions: "Read-only numbers about Recount's AI agents: success rates, timings and quality checks, live from production, plus fixed validation results.",
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      if (!TOOLS.some((t) => t.name === name)) return err(-32602, `Unknown tool: ${name}`);
      try {
        const data = await callTool(name, (msg.params?.arguments as Record<string, unknown>) ?? {});
        return ok({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: false });
      } catch (e) {
        return ok({ content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true });
      }
    }
    default:
      return err(-32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(req: Request) {
  let body: Rpc | Rpc[];
  try {
    body = await req.json();
  } catch {
    return reply({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const batch = Array.isArray(body) ? body : [body];
  // Notifications (no id) get no reply.
  const out = (await Promise.all(batch.map(async (m) => (m.id === undefined ? null : handle(m))))).filter(Boolean);
  if (!out.length) return new Response(null, { status: 202, headers: cors });
  return reply(Array.isArray(body) ? out : out[0]);
}

// No server-to-client stream: this server only answers requests.
export async function GET() {
  return new Response("This MCP server uses POST (Streamable HTTP, JSON responses).", { status: 405, headers: { Allow: "POST, OPTIONS", ...cors } });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
