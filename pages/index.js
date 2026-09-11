import { useEffect, useMemo, useRef, useState } from "react";

const CATEGORIES = ["Beer", "Wine", "Sake", "Spirits", "Cordials & Digestifs", "Cocktails"];
const REACTIONS = [
  { value: "up", icon: "👍" },
  { value: "sideways", icon: "🤷" },
  { value: "down", icon: "👎" },
];
const PEOPLE = ["Eric", "Elthon", "Larra", "Dan V", "Jason"];

function emptyForm() {
  return {
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
    addedBy: "",
    photoUrl: "",
  };
}

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
  const [form, setForm] = useState(emptyForm());
  const [expandedCards, setExpandedCards] = useState({});
  const cameraInputRef = useRef(null);
  const libraryInputRef = useRef(null);

  async function loadItems() {
    try {
      const res = await fetch("/api/drinks");
      const data = await res.json();
      setItems(data);
    } catch {
      // keep showing whatever we already have
    }
  }

  useEffect(() => {
    loadItems();
    const interval = setInterval(loadItems, 20000);
    return () => clearInterval(interval);
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

  async function processImageFile(file) {
    setAnalyzing(true);
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
      setForm((prev) => ({
        ...prev,
        name: json.name || prev.name,
        category: CATEGORIES.includes(merged.category) ? merged.category : prev.category,
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
      }));
    } catch {
      // leave the form as-is; person can fill in manually
    } finally {
      setAnalyzing(false);
    }
  }

  function handleFileInputChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
  }

  function handlePaste(e) {
    const clipItems = e.clipboardData?.items;
    if (!clipItems) return;
    for (const item of clipItems) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) processImageFile(file);
        break;
      }
    }
  }

  async function handleLookup() {
    if (!form.name.trim()) return;
    setAnalyzing(true);
    try {
      const enrichRes = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), category: form.category }),
      });
      const enriched = await enrichRes.json();
      setForm((prev) => ({
        ...prev,
        category: CATEGORIES.includes(enriched.category) ? enriched.category : prev.category,
        tags: (enriched.tags || []).join(", "),
        abv: enriched.abv || "",
        region: enriched.region || "",
        producer: enriched.producer || "",
        notes: enriched.notes || "",
        pairing: enriched.pairing || "",
        rating: enriched.rating || "",
        ratingScale: enriched.ratingScale || "",
        ratingSource: enriched.ratingSource || "",
        ratingSource: enriched.ratingSource || "",
        ratingLink: enriched.ratingLink || "",
        similar: (enriched.similar || []).join(", "),
        photoUrl: enriched.photoUrl || prev.photoUrl,
      }));
    } catch {
      // leave form as-is
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim()) {
      alert("Give it a name before saving.");
      return;
    }
    if (!form.addedBy) {
      alert("Pick who's adding this before saving.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/drinks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
          addedBy: form.addedBy,
          base64: pendingPhoto?.base64 || null,
          mediaType: pendingPhoto?.mediaType || null,
          existingPhotoUrl: !pendingPhoto && form.photoUrl ? form.photoUrl : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "save failed");
      }
      await loadItems();
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

    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, ratings: { ...it.ratings, [person]: next } } : it
      )
    );

    fetch(`/api/drinks/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person, value: next }),
    }).catch((err) => alert("Couldn't save that reaction: " + err.message));
  }

  function openAdd() {
    setForm(emptyForm());
    setPendingPhoto(null);
    setShowAdd(true);
  }

  function closeAdd() {
    setShowAdd(false);
    setForm(emptyForm());
    setPendingPhoto(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (libraryInputRef.current) libraryInputRef.current.value = "";
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
        <button className="add-btn" onClick={openAdd}>
          + Add something
        </button>
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFileInputChange} />
        <input ref={libraryInputRef} type="file" accept="image/*" hidden onChange={handleFileInputChange} />
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
            <div className="card-photo">
              {it.photoURL ? (
                <img src={it.photoURL} alt={it.name} />
              ) : (
                <div className="photo-fallback">🍸</div>
              )}
              {it.rating && (
                
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
              <div className={expandedCards[it.id] ? "" : "clamp-block"}>
                {it.notes && <p className="notes">{it.notes}</p>}
                {it.pairing && <p className="notes">Pairs with: {it.pairing}</p>}
                {it.similar?.length > 0 && (
                  <p className="notes">If you like this, try: {it.similar.join(", ")}</p>
                )}
              </div>
              {(it.notes || it.pairing || it.similar?.length > 0) && (
                <button
                  className="expand-toggle"
                  onClick={() => setExpandedCards((prev) => ({ ...prev, [it.id]: !prev[it.id] }))}
                >
                  {expandedCards[it.id] ? "Show less" : "Show more"}
                </button>
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
              {it.createdAt && (
                <p className="added-date">
                  {new Date(it.createdAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="empty">Nothing here yet.</p>}
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={closeAdd}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()} onPaste={handlePaste}>
            <div className="modal-header-row">
              <h2>Add something</h2>
              <button className="close-x" onClick={closeAdd}>✕ Close</button>
            </div>

            <div className="method-grid">
              <button className="method-btn" onClick={() => document.getElementById("dw-name-input")?.focus()}>
                <span className="method-icon">⌨️</span>
                <span>Type it</span>
              </button>
              <button className="method-btn" onClick={() => cameraInputRef.current?.click()}>
                <span className="method-icon">📷</span>
                <span>Take a pic</span>
              </button>
              <button className="method-btn" onClick={() => libraryInputRef.current?.click()}>
                <span className="method-icon">🖼️</span>
                <span>Screenshot / Upload</span>
              </button>
              <button
                className="method-btn"
                onClick={async () => {
                  try {
                    const clipboardItems = await navigator.clipboard.read();
                    for (const item of clipboardItems) {
                      const type = item.types.find((t) => t.startsWith("image/"));
                      if (type) {
                        const blob = await item.getType(type);
                        processImageFile(blob);
                        return;
                      }
                    }
                    alert("No image found on your clipboard.");
                  } catch {
                    alert("Couldn't read the clipboard — try Cmd+V inside this window instead.");
                  }
                }}
              >
                <span className="method-icon">📋</span>
                <span>Paste image</span>
              </button>
            </div>

            {pendingPhoto?.previewUrl ? (
              <img className="preview" src={pendingPhoto.previewUrl} alt="" />
            ) : form.photoUrl ? (
              <img className="preview" src={form.photoUrl} alt="" />
            ) : null}
            {analyzing && <p className="analyzing">Looking it up…</p>}

            <div className="form">
              <label>
                Name
                <div className="name-row">
                  <input
                    id="dw-name-input"
                    placeholder="e.g. Allagash White, Kim Crawford Sauvignon Blanc..."
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                  />
                  <button className="lookup-btn" onClick={handleLookup} disabled={!form.name.trim() || analyzing}>
                    Look up
                  </button>
                </div>
              </label>

              <label>
                Category
                <div className="pill-row">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`pill ${form.category === c ? "active" : ""}`}
                      onClick={() => setForm({ ...form, category: c })}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </label>

              <label>
                Added by
                <div className="pill-row">
                  {PEOPLE.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`pill ${form.addedBy === p ? "active" : ""}`}
                      onClick={() => setForm({ ...form, addedBy: p })}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                {!form.addedBy && <span className="required-hint">Pick who's adding this</span>}
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
                What it's about
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

              <div className="modal-actions">
                <button onClick={closeAdd} className="secondary">Cancel</button>
                <button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
