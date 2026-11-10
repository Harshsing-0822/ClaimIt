import { updateExpense } from '@/lib/expenses';
export const dynamic = 'force-dynamic';

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    return Response.json(await updateExpense(id, await req.json(), 'Manager'));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
