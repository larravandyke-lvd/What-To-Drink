import { useEffect, useMemo, useRef, useState } from "react";
import { db, storage } from "../lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  orderBy,
  query,
} from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";

const CATEGORIES = ["Beer", "Wine", "Sake", "Spirits", "Cordials & Digestifs", "Cocktails"];
const REACTIONS = [
  { value: "up", icon: "👍" },
  { value: "sideways", icon: "🤷" },
  { value: "down", icon: "👎" },
];
const PEOPLE = ["Eric", "Elthon", "Larra", "Dan V", "Jason"];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [items, setItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [ratingFilterPeople, setRatingFilterPeople] = useState([]);
  const [ratingFilterValue, setRatingFilterValue] = useState("up");
  const [activePerson, setActivePerson] = useState("All");
  const [activeTag, setActiveTag] = useState(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState(null); // { base64, mediaType, previewUrl }
  const [form, setForm] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const q = query(collection(db, "drinks"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (activeCategory !== "All" && it.category !== activeCategory) return false;
      if (ratingFilterPeople.length > 0) {
        const allMatch = ratingFilterPeople.every(
          (p) => (it.ratings?.[p] || "TBD") === ratingFilterValue
        );
        if (!allMatch) return false;
      }
      if (activePerson !== "All" && it.addedBy !== activePerson) return false;
      if (activeTag && !(it.tags || []).includes(activeTag)) return false;
      if (q) {
        const haystack = [
          it.name,
          it.producer,
          it.region,
          it.notes,
          it.pairing,
          ...(it.tags || []),
          ...(it.similar || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, activeCategory, ratingFilterPeople, ratingFilterValue, activePerson, activeTag, search]);

  const tagOptions = useMemo(() => {
    const pool = activeCategory === "All" ? items : items.filter((i) => i.category === activeCategory);
    const set = new Set();
    pool.forEach((i) => (i.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [items, activeCategory]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzing(true);
    setShowAdd(true);
    try {
      const base64 = await fileToBase64(file);
      const previewUrl = URL.createObjectURL(file);
      setPendingPhoto({ base64, mediaType: file.type || "image/jpeg", previewUrl });
      const res = await fetch("/api/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mediaType: file.type || "image/jpeg" }),
      });
      const json = await res.json();

      // Second pass: enrich with a web-search-backed lookup, same pattern as What To Watch
      let enriched = {};
      if (json.name) {
        try {
          const enrichRes = await fetch("/api/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: json.name, category: json.category }),
          });
          enriched = await enrichRes.json();
        } catch {
          // fall back to analyze-image's own guesses if enrich fails
        }
      }

      const merged = { ...json, ...enriched };
      setForm({
        name: json.name || "",
        category: CATEGORIES.includes(merged.category) ? merged.category : CATEGORIES[0],
        tags: (merged.tags || []).join(", "),
        abv: merged.abv || "",
        region: merged.region || "",
        producer: merged.producer || "",
        notes: merged.notes || "",
        pairing: merged.pairing || "",
        rating: merged.rating || "",
        ratingScale: merged.ratingScale || "",
        ratingSource: merged.ratingSource || "",
        ratingLink: merged.ratingLink || "",
        similar: (merged.similar || []).join(", "),
        addedBy: PEOPLE[0],
      });
    } catch (err) {
      setForm({
        name: "",
        category: CATEGORIES[0],
        tags: "",
        abv: "",
        region: "",
        producer: "",
        notes: "",
        pairing: "",
        rating: "",
        ratingScale: "",
        ratingSource: "",
        ratingLink: "",
        similar: "",
        addedBy: PEOPLE[0],
      });
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    if (!form || !pendingPhoto) return;
    setSaving(true);
    try {
      const path = `drinks/${Date.now()}.jpg`;
      const storageRef = ref(storage, path);
      await uploadString(storageRef, pendingPhoto.base64, "base64", {
        contentType: pendingPhoto.mediaType,
      });
      const photoURL = await getDownloadURL(storageRef);
      await addDoc(collection(db, "drinks"), {
        name: form.name,
        category: form.category,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        abv: form.abv,
        region: form.region,
        producer: form.producer,
        notes: form.notes,
        pairing: form.pairing,
        rating: form.rating,
        ratingScale: form.ratingScale,
        ratingSource: form.ratingSource,
        ratingLink: form.ratingLink,
        similar: form.similar.split(",").map((s) => s.trim()).filter(Boolean),
        ratings: {},
        addedBy: form.addedBy,
        photoURL,
        createdAt: serverTimestamp(),
      });
      closeAdd();
    } catch (err) {
      alert("Save failed: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  const RATING_CYCLE = ["TBD", "up", "sideways", "down"];
  function cycleRating(itemId, person, current) {
    const idx = RATING_CYCLE.indexOf(current || "TBD");
    const next = RATING_CYCLE[(idx + 1) % RATING_CYCLE.length];
    updateDoc(doc(db, "drinks", itemId), { [`ratings.${person}`]: next }).catch((err) =>
      alert("Couldn't save that reaction: " + err.message)
    );
  }

  function closeAdd() {
    setShowAdd(false);
    setForm(null);
    setPendingPhoto(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function togglePersonFilter(person) {
    setRatingFilterPeople((prev) =>
      prev.includes(person) ? prev.filter((p) => p !== person) : [...prev, person]
    );
  }

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <img src="/icon.svg" alt="" className="brand-icon" />
          <div>
            <h1>What To Drink</h1>
            <p>Snap a bottle, glass, or menu — we'll fill in the rest.</p>
          </div>
        </div>
        <button className="add-btn" onClick={() => fileInputRef.current?.click()}>
          + Add something
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={handleFile}
        />
      </header>

      <div className="search-row">
        <input
          className="search-input"
          type="text"
          placeholder="Search name, tasting notes, tags, pairing…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="chip-row">
        <span className="chip-label">Who</span>
        {["All", ...PEOPLE].map((p) => (
          <button
            key={p}
            className={`chip ${activePerson === p ? "active" : ""}`}
            onClick={() => setActivePerson(p)}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="tabs">
        {["All", ...CATEGORIES].map((c) => (
          <button
            key={c}
            className={`tab ${activeCategory === c ? "active" : ""}`}
            onClick={() => {
              setActiveCategory(c);
              setActiveTag(null);
            }}
          >
            {c} ({c === "All" ? items.length : items.filter((i) => i.category === c).length})
          </button>
        ))}
      </div>

      <div className="chip-row reaction-filter">
        <span className="chip-label">Show what</span>
        {PEOPLE.map((p) => (
          <button
            key={p}
            className={`chip ${ratingFilterPeople.includes(p) ? "active" : ""}`}
            onClick={() => togglePersonFilter(p)}
          >
            {p}
          </button>
        ))}
        {ratingFilterPeople.length > 0 && (
          <>
            {REACTIONS.map((r) => (
              <button
                key={r.value}
                className={`chip reaction-chip ${ratingFilterValue === r.value ? "active" : ""}`}
                onClick={() => setRatingFilterValue(r.value)}
              >
                {r.icon}
              </button>
            ))}
            <button className="chip clear-chip" onClick={() => setRatingFilterPeople([])}>
              Clear
            </button>
          </>
        )}
      </div>

      {tagOptions.length > 0 && (
        <div className="chip-row">
          <span className="chip-label">Tags</span>
          {tagOptions.map((t) => (
            <button
              key={t}
              className={`chip ${activeTag === t ? "active" : ""}`}
              onClick={() => setActiveTag(activeTag === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="grid">
        {filtered.map((it) => (
          <div className="card" key={it.id}>
            {it.photoURL && (
              <div className="card-photo">
                <img src={it.photoURL} alt={it.name} />
                {it.rating && (
                  <a
                    className="rating-badge"
                    href={it.ratingLink || undefined}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => !it.ratingLink && e.preventDefault()}
                  >
                    {it.rating}{it.ratingScale?.includes("100") ? "" : "★"}
                  </a>
                )}
              </div>
            )}
            <div className="card-body">
              <h3>{it.name}</h3>
              <div className="card-meta">
                <span className="badge">{it.category}</span>
                {it.abv && <span className="abv">{it.abv}</span>}
              </div>
              {it.tags?.length > 0 && (
                <div className="tag-list">
                  {it.tags.map((t) => (
                    <span key={t} className="tag">{t}</span>
                  ))}
                </div>
              )}
              {it.ratingSource && (
                <p className="added-by">{it.rating} on {it.ratingSource}</p>
              )}
              {it.producer && <p className="notes"><em>{it.producer}</em>{it.region ? ` · ${it.region}` : ""}</p>}
              {it.notes && <p className="notes">{it.notes}</p>}
              {it.pairing && <p className="notes">Pairs with: {it.pairing}</p>}
              {it.similar?.length > 0 && (
                <p className="notes">If you like this, try: {it.similar.join(", ")}</p>
              )}
              <div className="people-ratings">
                {PEOPLE.map((p) => {
                  const val = it.ratings?.[p] || "TBD";
                  const icon =
                    val === "up" ? "👍" : val === "sideways" ? "🤷" : val === "down" ? "👎" : "·";
                  return (
                    <button
                      key={p}
                      className={`person-rating ${val !== "TBD" ? "set" : ""}`}
                      title={`${p}: ${val === "TBD" ? "no reaction yet" : val} — tap to change`}
                      onClick={() => cycleRating(it.id, p, val)}
                    >
                      <span className="pr-icon">{icon}</span>
                      <span className="pr-name">{p}</span>
                    </button>
                  );
                })}
              </div>
              {it.addedBy && <p className="added-by">Added by {it.addedBy}</p>}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="empty">Nothing here yet.</p>}
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={closeAdd}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {pendingPhoto?.previewUrl && <img className="preview" src={pendingPhoto.previewUrl} alt="" />}
            {analyzing ? (
              <p className="analyzing">Analyzing photo…</p>
            ) : form ? (
              <div className="form">
                <label>
                  Name
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
                <label>
                  Category
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Tags (comma separated)
                  <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
                </label>
                <label>
                  ABV
                  <input value={form.abv} onChange={(e) => setForm({ ...form, abv: e.target.value })} />
                </label>
                <label>
                  Region
                  <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
                </label>
                <label>
                  Producer
                  <input value={form.producer} onChange={(e) => setForm({ ...form, producer: e.target.value })} />
                </label>
                <label>
                  Notes
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </label>
                <label>
                  Pairing
                  <input value={form.pairing} onChange={(e) => setForm({ ...form, pairing: e.target.value })} />
                </label>
                <label>
                  Rating
                  <input
                    placeholder="e.g. 4.2"
                    value={form.rating}
                    onChange={(e) => setForm({ ...form, rating: e.target.value })}
                  />
                </label>
                <label>
                  Rating source
                  <input
                    placeholder="e.g. Vivino, Untappd, Distiller"
                    value={form.ratingSource}
                    onChange={(e) => setForm({ ...form, ratingSource: e.target.value })}
                  />
                </label>
                <label>
                  If you like this, try (comma separated)
                  <input value={form.similar} onChange={(e) => setForm({ ...form, similar: e.target.value })} />
                </label>
                <label>
                  Added by
                  <select
                    value={form.addedBy}
                    onChange={(e) => setForm({ ...form, addedBy: e.target.value })}
                  >
                    {PEOPLE.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <div className="modal-actions">
                  <button onClick={closeAdd} className="secondary">Cancel</button>
                  <button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
