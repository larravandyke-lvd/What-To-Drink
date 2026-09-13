import { put } from "@vercel/blob";
import { sql, ensureTable } from "../../../lib/db";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

export default async function handler(req, res) {
  await ensureTable();
  const { id } = req.query;

  if (req.method === "DELETE") {
    try {
      const rows = await sql`DELETE FROM drinks WHERE id = ${id} RETURNING id`;
      if (rows.length === 0) return res.status(404).json({ error: "not found" });
      return res.status(200).json({ deleted: true, id: rows[0].id });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== "PATCH") return res.status(405).json({ error: "PATCH or DELETE only" });

  const body = req.body || {};

  if (body.person && body.value && !body.edit) {
    try {
      const rows = await sql`
        UPDATE drinks
        SET ratings = jsonb_set(COALESCE(ratings, '{}'::jsonb), ARRAY[${body.person}], to_jsonb(${body.value}::text))
        WHERE id = ${id}
        RETURNING *
      `;
      if (rows.length === 0) return res.status(404).json({ error: "not found" });
      return res.status(200).json(rows[0]);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (body.addComment) {
    try {
      const { author, text, tags } = body;
      if (!text || !text.trim()) return res.status(400).json({ error: "note text required" });
      if (!author) return res.status(400).json({ error: "author required" });

      const comment = {
        author,
        text: text.trim(),
        tags: tags || [],
        createdAt: new Date().toISOString(),
      };

      const rows = await sql`
        UPDATE drinks
        SET comments = COALESCE(comments, '[]'::jsonb) || ${JSON.stringify([comment])}::jsonb
        WHERE id = ${id}
        RETURNING *
      `;
      if (rows.length === 0) return res.status(404).json({ error: "not found" });
      return res.status(200).json(rows[0]);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (body.edit) {
    try {
      const {
        name, category, tags, abv, region, producer, producerUrl, notes, pairing,
        rating, ratingScale, ratingSource, ratingLink, similar, addedBy,
        base64, mediaType, existingPhotoUrl,
      } = body;

      let photoUrl = existingPhotoUrl || null;
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
        UPDATE drinks SET
          name = ${name},
          category = ${category},
          tags = ${JSON.stringify(tags || [])},
          abv = ${abv},
          region = ${region},
          producer = ${producer},
          producer_url = ${producerUrl},
          notes = ${notes},
          pairing = ${pairing},
          rating = ${rating},
          rating_scale = ${ratingScale},
          rating_source = ${ratingSource},
          rating_link = ${ratingLink},
          "similar" = ${JSON.stringify(similar || [])},
          added_by = ${addedBy},
          photo_url = ${photoUrl}
        WHERE id = ${id}
        RETURNING *
      `;
      if (rows.length === 0) return res.status(404).json({ error: "not found" });
      return res.status(200).json(rows[0]);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: "invalid request body" });
}
