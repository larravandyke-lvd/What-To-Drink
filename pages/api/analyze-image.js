import { callClaude, extractJSON } from "../../lib/anthropic";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

const CATEGORIES = ["Beer", "Wine", "Sake", "Spirits", "Cordials & Digestifs", "Cocktails"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { base64, mediaType } = req.body || {};
  if (!base64) return res.status(400).json({ error: "base64 image required" });

  try {
    const content = [
      { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: base64 } },
      {
        type: "text",
        text: `This is a photo of an alcoholic drink — a bottle, can, glass, or menu. Identify it and respond with ONLY a raw JSON object, no markdown:
{"name":"best guess of the drink/producer name","category":"one of: ${CATEGORIES.join(", ")}","tags":["1-3 relevant style tags, e.g. Junmai, Chablis, IPA, Fruited, Gin — or empty array if unclear"],"abv":"e.g. 5.5% if visible or well known, or null","region":"origin/region if identifiable, or null","notes":"one or two sentence tasting note or description"}`,
      },
    ];
    const text = await callClaude(content, false);
    const json = extractJSON(text, "{}");
    res.status(200).json(json || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
