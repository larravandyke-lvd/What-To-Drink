import { put } from "@vercel/blob";
import { callClaude, extractJSON } from "../../lib/anthropic";

const CATEGORIES = ["Beer", "Wine", "Sake", "Spirits", "Cordials & Digestifs", "Cocktails"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { name, category } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });

  try {
    const prompt = `Look up the drink "${name}"${category ? ` (category: ${category})` : ""}. Respond with ONLY a raw JSON object, no markdown, no preamble, in this exact shape:
{"name":"the correct, fully capitalized official product name (e.g. if given 'fernet' respond with 'Fernet-Branca'; if given a slightly misspelled or lowercase name, correct it)","category":"one of: ${CATEGORIES.join(", ")}","tags":["1-3 relevant style tags, e.g. Junmai, Chablis, IPA, Fruited, Gin"],"abv":"e.g. 5.5% or null","region":"origin/region or null","producer":"producer/brewery/winery/distillery name or null","producerUrl":"search the web for this producer's official website (their own domain, not a retailer, ratings site, or social media page) and put the URL here — only use null if a real search genuinely turns up nothing","notes":"one or two sentence tasting note or description","pairing":"a short food pairing suggestion or null","rating":"the score/number only, e.g. 4.2 or 91, or null","ratingScale":"e.g. out of 5 or out of 100, or null","ratingSource":"the site the rating came from — use Vivino for wine, Untappd or BeerAdvocate for beer, Distiller for spirits, Sake no Shizuku or Sakenomy for sake, or a comparable community/critic rating site for the category — or null if none found","ratingLink":"url to that page, or null","similar":["2-3 real, specific drinks a fan of this one would likely enjoy, same category or a close neighbor — just the names"],"imageUrl":"a direct URL (ending in .jpg, .jpeg, .png, or .webp) to a real photo of this specific product's bottle/can/label — prefer the producer's own site, a major retailer (Total Wine, Wine.com, Drizly), or Wikipedia/Wikimedia Commons — or null if you can't find one"}
Use current, accurate information. If you can't confidently identify the drink, make a reasonable best guess rather than leaving fields null. Always return a "name" — if you're not sure of the exact product, return a cleaned-up, properly capitalized version of what was given. If you cannot find a real rating, set rating, ratingScale, ratingSource, and ratingLink to null — never invent one. Only set imageUrl to a URL you are confident is a real, direct image link — never invent or guess one. For producerUrl, actually run a web search for the producer's name (small local breweries/distilleries usually do have a website even if you don't recognize the name) before settling on null.`;
    const text = await callClaude(prompt, true);
    const json = extractJSON(text, "{}") || {};
    const lookupName = json.name || name;

    // Try to re-host the found image via Blob so the browser can reliably display it
    // (many source sites block hotlinking/CORS or reject requests with no User-Agent).
    async function tryHostImage(url) {
      try {
        const imgRes = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          },
        });
        if (!imgRes.ok) return null;
        const contentType = imgRes.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) return null;
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
        const blob = await put(`drinks/${Date.now()}.${ext}`, buffer, {
          access: "public",
          contentType,
        });
        return blob.url;
      } catch {
        return null;
      }
    }

    if (json.imageUrl) {
      const hosted = await tryHostImage(json.imageUrl);
      if (hosted) json.photoUrl = hosted;
      delete json.imageUrl;
    }

    // Fallback: Wikipedia's summary API is far more reliably fetchable than
    // random retailer/producer sites, and covers most well-known drink brands.
    if (!json.photoUrl) {
      try {
        const wikiRes = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(lookupName)}`,
          { headers: { "User-Agent": "what-to-drink-app/1.0" } }
        );
        if (wikiRes.ok) {
          const wikiJson = await wikiRes.json();
          const thumb = wikiJson.thumbnail?.source || wikiJson.originalimage?.source;
          if (thumb) {
            const hosted = await tryHostImage(thumb);
            if (hosted) json.photoUrl = hosted;
          }
        }
      } catch {
        // no Wikipedia page or fetch failed — that's fine, card falls back to the icon
      }
    }

    res.status(200).json(json);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
