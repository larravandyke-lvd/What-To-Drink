import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL);

let ready = false;

export async function ensureTable() {
  if (ready) return;
  await sql`
    CREATE TABLE IF NOT EXISTS drinks (
      id SERIAL PRIMARY KEY,
      name TEXT,
      category TEXT,
      tags JSONB DEFAULT '[]',
      abv TEXT,
      region TEXT,
      producer TEXT,
      notes TEXT,
      pairing TEXT,
      rating TEXT,
      rating_scale TEXT,
      rating_source TEXT,
      rating_link TEXT,
      "similar" JSONB DEFAULT '[]',
      ratings JSONB DEFAULT '{}',
      added_by TEXT,
      photo_url TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  ready = true;
}
