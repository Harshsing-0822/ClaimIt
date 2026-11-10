// ClaimIt MCP server — Streamable HTTP, stateless JSON-RPC. No AI keys: Claude (on the
// customer's own plan) reads the receipt and calls these tools.
import { listExpenses, createExpense, updateExpense, CATEGORIES, STATUSES, POLICY_LIMIT } from '@/lib/expenses';
export const dynamic = 'force-dynamic';

const TOOLS = [
  {
    name: 'submit_expense',
    title: 'Submit expense claim',
    description:
      `Save a new expense claim to the ClaimIt company ledger. Read the receipt first and fill merchant, amount (in Indian Rupees, numbers only), date and category. New claims start as "pending" until a manager approves them in the ClaimIt app. Claims above ₹${POLICY_LIMIT} are flagged as over policy.`,
    inputSchema: {
      type: 'object',
      properties: {
        employee: { type: 'string', description: 'Full name of the employee claiming the expense' },
        merchant: { type: 'string', description: 'Shop, restaurant or vendor name from the receipt' },
        amount: { type: 'number', description: 'Total amount in ₹ (INR), e.g. 1249.50' },
        date: { type: 'string', description: 'Receipt date, YYYY-MM-DD' },
        category: { type: 'string', enum: CATEGORIES, description: 'Expense category' },
        note: { type: 'string', description: 'Short business purpose, e.g. "Client lunch with Acme"' },
      },
      required: ['employee', 'merchant', 'amount', 'date', 'category'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'list_expenses',
    title: 'List expense claims',
    description: 'List expense claims from ClaimIt, newest first, optionally filtered by status and/or employee name. Returns totals too.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: STATUSES, description: 'Only claims with this status' },
        employee: { type: 'string', description: 'Only claims whose employee name contains this text' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'update_expense',
    title: 'Update expense claim',
    description: 'Change fields of an existing claim, or set its status to pending, approved or rejected. Only pass the fields to change.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'Claim ID' },
        employee: { type: 'string' },
        merchant: { type: 'string' },
        amount: { type: 'number', description: 'Amount in ₹' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        category: { type: 'string', enum: CATEGORIES },
        note: { type: 'string' },
        status: { type: 'string', enum: STATUSES },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
];

const inr = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

async function callTool(name, args = {}) {
  if (name === 'submit_expense') {
    const e = await createExpense(args, 'Claude');
    return {
      message: `Claim #${e.id} filed: ${inr(e.amount)} at ${e.merchant} for ${e.employee} — status pending.` +
        (e.over_policy ? ` ⚠ Over the ${inr(POLICY_LIMIT)} policy limit; manager will see it flagged.` : ''),
      expense: e,
    };
  }
  if (name === 'list_expenses') {
    const rows = await listExpenses(args);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return { count: rows.length, total_inr: total, expenses: rows };
  }
  if (name === 'update_expense') {
    const { id, ...rest } = args;
    if (!id) throw new Error('id is required');
    const e = await updateExpense(id, rest, 'Claude');
    return { message: `Claim #${e.id} updated (status: ${e.status}).`, expense: e };
  }
  throw new Error(`Unknown tool: ${name}`);
}

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(m) {
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return fail(m?.id ?? null, -32600, 'Invalid request');
  if (m.id === undefined || m.id === null) return null; // notification
  switch (m.method) {
    case 'initialize':
      return ok(m.id, {
        protocolVersion: m.params?.protocolVersion || '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'ClaimIt', version: '1.0.0' },
        instructions:
          'ClaimIt is the company expense ledger. When the user shares a receipt, read merchant, date, total (₹) and pick a category, then call submit_expense. Use list_expenses to answer questions about claims.',
      });
    case 'ping':
      return ok(m.id, {});
    case 'tools/list':
      return ok(m.id, { tools: TOOLS });
    case 'tools/call': {
      const { name, arguments: args } = m.params || {};
      if (!TOOLS.some((t) => t.name === name)) return fail(m.id, -32602, `Unknown tool: ${name}`);
      try {
        const data = await callTool(name, args);
        return ok(m.id, {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
          isError: false,
        });
      } catch (e) {
        return ok(m.id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
      }
    }
    case 'resources/list':
      return ok(m.id, { resources: [] });
    case 'prompts/list':
      return ok(m.id, { prompts: [] });
    default:
      return fail(m.id, -32601, `Method not found: ${m.method}`);
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json(fail(null, -32700, 'Parse error'), { status: 400, headers: CORS });
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handle))).filter(Boolean);
    return out.length ? Response.json(out, { headers: CORS }) : new Response(null, { status: 202, headers: CORS });
  }
  const res = await handle(body);
  return res ? Response.json(res, { headers: CORS }) : new Response(null, { status: 202, headers: CORS });
}

export async function GET() {
  return new Response('ClaimIt MCP endpoint is live. Add this URL in Claude → Settings → Connectors.', {
    status: 405,
    headers: { ...CORS, Allow: 'POST' },
  });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: CORS });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
