import { listExpenses } from '@/lib/expenses';
export const dynamic = 'force-dynamic';

const esc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req) {
  const status = new URL(req.url).searchParams.get('status');
  const rows = await listExpenses({ status });
  const head = ['ID', 'Date', 'Employee', 'Merchant', 'Category', 'Amount (INR)', 'Status', 'Over policy', 'Note', 'Last action by'];
  const lines = rows.map((r) =>
    [r.id, r.date, r.employee, r.merchant, r.category, r.amount.toFixed(2), r.status, r.over_policy ? 'Yes' : 'No', r.note, r.updated_by || ''].map(esc).join(',')
  );
  const csv = [head.join(','), ...lines].join('\n');
  const today = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="claimit-expenses-${today}.csv"`,
    },
  });
}
