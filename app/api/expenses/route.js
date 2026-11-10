import { listExpenses, createExpense } from '@/lib/expenses';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const p = new URL(req.url).searchParams;
    return Response.json(await listExpenses({ status: p.get('status'), employee: p.get('employee') }));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    return Response.json(await createExpense(await req.json(), 'Web'));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
