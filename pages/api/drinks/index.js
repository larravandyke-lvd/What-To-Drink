import { put } from "@vercel/blob";
import { sql, ensureTable } from "../../lib/db";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

export default async function handler(req, res) {
  await ensureTable();

  if (req.method === "GET") {
    const rows = await sql`SELECT * FROM drinks ORDER BY created_at DESC`;
    const mapped = rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      tags: r.tags || [],
      abv: r.abv,
      region: r.region,
      producer: r.producer,
      notes: r.notes,
      pairing: r.pairing,
      rating: r.rating,
      ratingScale: r.rating_scale,
      ratingSource: r.rating_source,
      ratingLink: r.rating_link,
      similar: r.similar || [],
      ratings: r.ratings || {},
      addedBy: r.added_by,
      photoURL: r.photo_url,
      createdAt: r.created_at,
    }));
    return res.status(200).json(mapped);
  }

  if (req.method === "POST") {
    try {
      const {
        name, category, tags, abv, region, producer, notes, pairing,
        rating, ratingScale, ratingSource, ratingLink, similar, addedBy,
        base64, mediaType,
      } = req.body || {};

      let photoUrl = null;
      if (base64) {
        const buffer = Buffer.from(base64, "base64");
        const ext = (mediaType || "image/jpeg").split("/")[1] || "jpg";
        const blob = await put(`drinks/${Date.now()}.${ext}`, buffer, {
          access: "public",
          contentType: mediaType || "image/jpeg",
        });
        photoUrl = blob.url;
      }

      const rows = await sql`
        INSERT INTO drinks (
          name, category, tags, abv, region, producer, notes, pairing,
          rating, rating_scale, rating_source, rating_link, similar, ratings, added_by, photo_url
        ) VALUES (
          ${name}, ${category}, ${JSON.stringify(tags || [])}, ${abv}, ${region}, ${producer},
          ${notes}, ${pairing}, ${rating}, ${ratingScale}, ${ratingSource}, ${ratingLink},
          ${JSON.stringify(similar || [])}, '{}', ${addedBy}, ${photoUrl}
        )
        RETURNING *
      `;
      return res.status(200).json(rows[0]);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "GET or POST only" });
}
