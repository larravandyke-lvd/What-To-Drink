import { sql, ensureTable } from "../../lib/db";

export default async function handler(req, res) {
  await ensureTable();
  try {
    const before = await sql`SELECT id, name, added_by FROM drinks ORDER BY id`;
    const updated = await sql`UPDATE drinks SET added_by = 'Larra' RETURNING id, name, added_by`;
    return res.status(200).json({ before, updated });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
