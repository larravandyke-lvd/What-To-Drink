import { sql, ensureTable } from "../../lib/db";

export default async function handler(req, res) {
  await ensureTable();
  try {
    const rows = await sql`SELECT id, name, added_by FROM drinks ORDER BY id`;
    return res.status(200).json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
