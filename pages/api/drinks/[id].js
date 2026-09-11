import { sql, ensureTable } from "../../../lib/db";

export default async function handler(req, res) {
  await ensureTable();
  const { id } = req.query;

  if (req.method !== "PATCH") return res.status(405).json({ error: "PATCH only" });

  const { person, value } = req.body || {};
  if (!person || !value) return res.status(400).json({ error: "person and value required" });

  try {
    const { rows } = await sql`
      UPDATE drinks
      SET ratings = jsonb_set(COALESCE(ratings, '{}'::jsonb), ARRAY[${person}], to_jsonb(${value}::text))
      WHERE id = ${id}
      RETURNING *
    `;
    if (rows.length === 0) return res.status(404).json({ error: "not found" });
    return res.status(200).json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
