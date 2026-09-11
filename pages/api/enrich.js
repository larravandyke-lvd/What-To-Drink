import { callClaude, extractJSON } from "../../lib/anthropic";

const CATEGORIES = ["Beer", "Wine", "Sake", "Spirits", "Cordials & Digestifs", "Cocktails"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { name, category } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });

  try {
    const prompt = `Look up the drink "${name}"${category ? ` (category: ${category})` : ""}. Respond with ONLY a raw JSON object, no markdown, no preamble, in this exact shape:
{"category":"one of: ${CATEGORIES.join(", ")}","tags":["1-3 relevant style tags, e.g. Junmai, Chablis, IPA, Fruited, Gin"],"abv":"e.g. 5.5% or null","region":"origin/region or null","producer":"producer/brewery/winery/distillery name or null","notes":"one or two sentence tasting note or description","pairing":"a short food pairing suggestion or null","rating":"the score/number only, e.g. 4.2 or 91, or null","ratingScale":"e.g. out of 5 or out of 100, or null","ratingSource":"the site the rating came from — use Vivino for wine, Untappd or BeerAdvocate for beer, Distiller for spirits, Sake no Shizuku or Sakenomy for sake, or a comparable community/critic rating site for the category — or null if none found","ratingLink":"url to that page, or null","similar":["2-3 real, specific drinks a fan of this one would likely enjoy, same category or a close neighbor — just the names"]}
Use current, accurate information. If you can't confidently identify the drink, make a reasonable best guess rather than leaving fields null. If you cannot find a real rating, set rating, ratingScale, ratingSource, and ratingLink to null — never invent one.`;
    const text = await callClaude(prompt, true);
    const json = extractJSON(text, "{}");
    res.status(200).json(json || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
