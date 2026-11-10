import { neon } from '@neondatabase/serverless';

export const CATEGORIES = ['Meals', 'Travel', 'Office', 'Software', 'Other'];
export const STATUSES = ['pending', 'approved', 'rejected'];
export const POLICY_LIMIT = 5000; // ₹ — claims above this are flagged

let _sql;
function sql(...args) {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql(...args);
}

let ready;
function ensureDb() {
  if (!ready) ready = init().catch((e) => { ready = undefined; throw e; });
  return ready;
}

async function init() {
  await sql`create table if not exists expenses (
    id serial primary key,
    employee text not null,
    merchant text not null,
    amount numeric(12,2) not null,
    date date not null,
    category text not null default 'Other',
    note text not null default '',
    status text not null default 'pending',
    source text not null default 'Claude',
    updated_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`;
  const [{ count }] = await sql`select count(*)::int as count from expenses`;
  if (count === 0) {
    const seed = [
      ['Priya Sharma', 'IndiGo Airlines', 6500, 'Travel', 'Flight BLR→DEL for client visit', 'pending'],
      ['Rahul Verma', 'Starbucks', 840, 'Meals', 'Coffee with candidate', 'approved'],
      ['Ananya Iyer', 'Amazon India', 2299, 'Office', 'Keyboard and mouse', 'pending'],
      ['Rahul Verma', 'Figma', 1250, 'Software', 'Monthly seat', 'approved'],
      ['Priya Sharma', 'Uber', 460, 'Travel', 'Airport drop', 'rejected'],
    ];
    let d = 1;
    for (const [employee, merchant, amount, category, note, status] of seed) {
      await sql`insert into expenses (employee, merchant, amount, date, category, note, status, source, updated_by)
        values (${employee}, ${merchant}, ${amount}, current_date - ${d++}::int, ${category}, ${note}, ${status}, 'Seed',
                ${status === 'pending' ? null : 'Manager'})`;
    }
  }
}

function shape(r) {
  return { ...r, over_policy: r.amount > POLICY_LIMIT };
}

export async function listExpenses({ status, employee } = {}) {
  await ensureDb();
  const s = status && STATUSES.includes(status) ? status : null;
  const e = employee ? `%${employee}%` : null;
  const rows = await sql`select id, employee, merchant, amount::float8 as amount,
      to_char(date, 'YYYY-MM-DD') as date, category, note, status, source, updated_by,
      created_at, updated_at
    from expenses
    where (${s}::text is null or status = ${s})
      and (${e}::text is null or employee ilike ${e})
    order by created_at desc, id desc`;
  return rows.map(shape);
}

function clean(input, partial) {
  const out = {};
  const req = (k) => { if (!partial && (input[k] === undefined || input[k] === '')) throw new Error(`${k} is required`); };
  ['employee', 'merchant', 'amount', 'date'].forEach(req);

  if (input.employee !== undefined) out.employee = String(input.employee).trim();
  if (input.merchant !== undefined) out.merchant = String(input.merchant).trim();
  if (input.amount !== undefined) {
    const a = Number(input.amount);
    if (!Number.isFinite(a) || a <= 0) throw new Error('amount must be a positive number in ₹');
    out.amount = Math.round(a * 100) / 100;
  }
  if (input.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date))) throw new Error('date must be YYYY-MM-DD');
    out.date = String(input.date);
  }
  if (input.category !== undefined) {
    const c = CATEGORIES.find((x) => x.toLowerCase() === String(input.category).toLowerCase());
    out.category = c || 'Other';
  }
  if (input.note !== undefined) out.note = String(input.note);
  if (input.status !== undefined) {
    const st = String(input.status).toLowerCase();
    if (!STATUSES.includes(st)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
    out.status = st;
  }
  return out;
}

export async function createExpense(input, source = 'Claude') {
  await ensureDb();
  const d = clean(input, false);
  const [row] = await sql`insert into expenses (employee, merchant, amount, date, category, note, source)
    values (${d.employee}, ${d.merchant}, ${d.amount}, ${d.date}, ${d.category || 'Other'}, ${d.note || ''}, ${source})
    returning id`;
  return getExpense(row.id);
}

export async function getExpense(id) {
  const rows = await sql`select id, employee, merchant, amount::float8 as amount,
      to_char(date, 'YYYY-MM-DD') as date, category, note, status, source, updated_by, created_at, updated_at
    from expenses where id = ${Number(id)}`;
  return rows[0] ? shape(rows[0]) : null;
}

export async function updateExpense(id, input, by = 'Manager') {
  await ensureDb();
  const d = clean(input, true);
  const rows = await sql`update expenses set
      employee = coalesce(${d.employee ?? null}, employee),
      merchant = coalesce(${d.merchant ?? null}, merchant),
      amount   = coalesce(${d.amount ?? null}::numeric, amount),
      date     = coalesce(${d.date ?? null}::date, date),
      category = coalesce(${d.category ?? null}, category),
      note     = coalesce(${d.note ?? null}, note),
      status   = coalesce(${d.status ?? null}, status),
      updated_by = ${by},
      updated_at = now()
    where id = ${Number(id)} returning id`;
  if (!rows[0]) throw new Error(`No expense with id ${id}`);
  return getExpense(id);
}
