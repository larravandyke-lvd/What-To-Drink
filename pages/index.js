import { useEffect, useMemo, useRef, useState } from "react";

const CATEGORIES = ["Beer", "Wine", "Sake", "Spirits", "Cordials & Digestifs", "Cocktails"];
const REACTIONS = [
  { value: "up", icon: "👍" },
  { value: "sideways", icon: "🤷" },
  { value: "down", icon: "👎" },
];
const PEOPLE = ["Eric", "Elthon", "Larra", "Dan V", "Jason", "Dallas"];

function getLastAddedBy() {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem("wtd_last_added_by") || "";
  } catch {
    return "";
  }
}

function rememberAddedBy(person) {
  if (typeof window === "undefined" || !person) return;
  try {
    localStorage.setItem("wtd_last_added_by", person);
  } catch {
    // ignore storage errors
  }
}

function emptyForm() {
  return {
    name: "",
    category: CATEGORIES[0],
    tags: "",
    abv: "",
    region: "",
    producer: "",
    producerUrl: "",
    notes: "",
    pairing: "",
    rating: "",
    ratingScale: "",
    ratingSource: "",
    ratingLink: "",
    similar: "",
    addedBy: getLastAddedBy(),
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
  const [sortBy, setSortBy] = useState("recent");
  const [showFilters, setShowFilters] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState(null); // { base64, mediaType, previewUrl }
  const [form, setForm] = useState(emptyForm());
  const [expandedCards, setExpandedCards] = useState({});
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [noteDrafts, setNoteDrafts] = useState({});
  const [postingNote, setPostingNote] = useState(null);
  const cameraInputRef = useRef(null);
  const libraryInputRef = useRef(null);
  const showAddRef = useRef(showAdd);
  showAddRef.current = showAdd;
  const editingIdRef = useRef(editingId);
  editingIdRef.current = editingId;
  const pendingPhotoRef = useRef(pendingPhoto);
  pendingPhotoRef.current = pendingPhoto;

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

  useEffect(() => {
    function onScroll() {
      setShowScrollTop(window.scrollY > 400);
    }
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
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

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortBy === "alpha") {
      arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sortBy === "addedBy") {
      arr.sort((a, b) => (a.addedBy || "").localeCompare(b.addedBy || "") || (a.name || "").localeCompare(b.name || ""));
    }
    // "recent" needs no re-sort — items already arrive newest-first from the API
    return arr;
  }, [filtered, sortBy]);

  const tagOptions = useMemo(() => {
    const pool = activeCategory === "All" ? items : items.filter((i) => i.category === activeCategory);
    const set = new Set();
    pool.forEach((i) => (i.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [items, activeCategory]);

  async function processImageFile(file) {
    setAnalyzing(true);
    let finalForm = form;
    const photoObj = { base64: null, mediaType: file.type || "image/jpeg", previewUrl: null };
    try {
      const base64 = await fileToBase64(file);
      const previewUrl = URL.createObjectURL(file);
      photoObj.base64 = base64;
      photoObj.previewUrl = previewUrl;
      setPendingPhoto(photoObj);

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
      finalForm = {
        ...form,
        name: merged.name || json.name || form.name,
        category: CATEGORIES.includes(merged.category) ? merged.category : form.category,
        tags: merged.tags?.length ? merged.tags.join(", ") : form.tags,
        abv: merged.abv || form.abv,
        region: merged.region || form.region,
        producer: merged.producer || form.producer,
        producerUrl: merged.producerUrl || form.producerUrl,
        notes: merged.notes || form.notes,
        pairing: merged.pairing || form.pairing,
        rating: merged.rating || form.rating,
        ratingScale: merged.ratingScale || form.ratingScale,
        ratingSource: merged.ratingSource || form.ratingSource,
        ratingLink: merged.ratingLink || form.ratingLink,
        similar: merged.similar?.length ? merged.similar.join(", ") : form.similar,
      };
      setForm(finalForm);
    } catch {
      // leave the form as-is; person can fill in manually
    } finally {
      setAnalyzing(false);
      if (!showAddRef.current) {
        await finishBackgroundSave(finalForm, editingIdRef.current, photoObj.base64 ? photoObj : pendingPhotoRef.current);
      }
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
    let finalForm = form;
    try {
      const enrichRes = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), category: form.category }),
      });
      const enriched = await enrichRes.json();
      finalForm = {
        ...form,
        name: enriched.name || form.name,
        category: CATEGORIES.includes(enriched.category) ? enriched.category : form.category,
        tags: enriched.tags?.length ? enriched.tags.join(", ") : form.tags,
        abv: enriched.abv || form.abv,
        region: enriched.region || form.region,
        producer: enriched.producer || form.producer,
        producerUrl: enriched.producerUrl || form.producerUrl,
        notes: enriched.notes || form.notes,
        pairing: enriched.pairing || form.pairing,
        rating: enriched.rating || form.rating,
        ratingScale: enriched.ratingScale || form.ratingScale,
        ratingSource: enriched.ratingSource || form.ratingSource,
        ratingLink: enriched.ratingLink || form.ratingLink,
        similar: enriched.similar?.length ? enriched.similar.join(", ") : form.similar,
        photoUrl: enriched.photoUrl || form.photoUrl,
      };
      setForm(finalForm);
    } catch {
      // leave form as-is
    } finally {
      setAnalyzing(false);
      if (!showAddRef.current) {
        await finishBackgroundSave(finalForm, editingIdRef.current, pendingPhotoRef.current);
      }
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
      const payload = {
        name: form.name,
        category: form.category,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        abv: form.abv,
        region: form.region,
        producer: form.producer,
        producerUrl: form.producerUrl,
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
      };
      const res = editingId
        ? await fetch(`/api/drinks/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ edit: true, ...payload }),
          })
        : await fetch("/api/drinks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "save failed");
      }
      rememberAddedBy(form.addedBy);
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

  function getNoteDraft(itemId) {
    return noteDrafts[itemId] || { text: "", author: "", tags: [] };
  }

  function updateNoteDraft(itemId, patch) {
    setNoteDrafts((prev) => ({
      ...prev,
      [itemId]: { ...getNoteDraft(itemId), ...patch },
    }));
  }

  function toggleNoteTag(itemId, person) {
    const draft = getNoteDraft(itemId);
    const tags = draft.tags.includes(person)
      ? draft.tags.filter((p) => p !== person)
      : [...draft.tags, person];
    updateNoteDraft(itemId, { tags });
  }

  const filtersActive =
    activeCategory !== "All" ||
    ratingFilterPeople.length > 0 ||
    activePerson !== "All" ||
    activeTag !== null ||
    search.trim() !== "";

  function clearAllFilters() {
    setActiveCategory("All");
    setRatingFilterPeople([]);
    setActivePerson("All");
    setActiveTag(null);
    setSearch("");
  }

  async function submitNote(itemId) {
    const draft = getNoteDraft(itemId);
    if (!draft.text.trim()) return;
    if (!draft.author) {
      alert("Pick who this note is from before posting.");
      return;
    }
    setPostingNote(itemId);
    try {
      const res = await fetch(`/api/drinks/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addComment: true,
          author: draft.author,
          text: draft.text,
          tags: draft.tags,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "couldn't post note");
      }
      setNoteDrafts((prev) => ({ ...prev, [itemId]: { text: "", author: draft.author, tags: [] } }));
      await loadItems();
    } catch (err) {
      alert("Couldn't post note: " + err.message);
    } finally {
      setPostingNote(null);
    }
  }

  async function finishBackgroundSave(finalForm, eid, photo) {
    if (!finalForm.name?.trim() || !finalForm.addedBy) {
      setForm(emptyForm());
      setPendingPhoto(null);
      setEditingId(null);
      return;
    }
    const payload = {
      name: finalForm.name,
      category: finalForm.category,
      tags: finalForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
      abv: finalForm.abv,
      region: finalForm.region,
      producer: finalForm.producer,
      producerUrl: finalForm.producerUrl,
      notes: finalForm.notes,
      pairing: finalForm.pairing,
      rating: finalForm.rating,
      ratingScale: finalForm.ratingScale,
      ratingSource: finalForm.ratingSource,
      ratingLink: finalForm.ratingLink,
      similar: finalForm.similar.split(",").map((s) => s.trim()).filter(Boolean),
      addedBy: finalForm.addedBy,
      base64: photo?.base64 || null,
      mediaType: photo?.mediaType || null,
      existingPhotoUrl: !photo && finalForm.photoUrl ? finalForm.photoUrl : null,
    };
    try {
      if (eid) {
        await fetch(`/api/drinks/${eid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ edit: true, ...payload }),
        });
      } else {
        await fetch("/api/drinks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      rememberAddedBy(finalForm.addedBy);
      await loadItems();
    } catch {
      // best-effort background save — user isn't watching, fail silently
    } finally {
      setForm(emptyForm());
      setPendingPhoto(null);
      setEditingId(null);
    }
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setPendingPhoto(null);
    setShowAdd(true);
  }

  function openEdit(item) {
    setEditingId(item.id);
    setForm({
      name: item.name || "",
      category: CATEGORIES.includes(item.category) ? item.category : CATEGORIES[0],
      tags: (item.tags || []).join(", "),
      abv: item.abv || "",
      region: item.region || "",
      producer: item.producer || "",
      producerUrl: item.producerUrl || "",
      notes: item.notes || "",
      pairing: item.pairing || "",
      rating: item.rating || "",
      ratingScale: item.ratingScale || "",
      ratingSource: item.ratingSource || "",
      ratingLink: item.ratingLink || "",
      similar: (item.similar || []).join(", "),
      addedBy: item.addedBy || "",
      photoUrl: item.photoURL || "",
    });
    setPendingPhoto(null);
    setShowAdd(true);
  }

  function closeAdd() {
    setShowAdd(false);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (libraryInputRef.current) libraryInputRef.current.value = "";
    if (!analyzing) {
      setEditingId(null);
      setForm(emptyForm());
      setPendingPhoto(null);
    }
  }

  function togglePersonFilter(person) {
    setRatingFilterPeople((prev) =>
      prev.includes(person) ? prev.filter((p) => p !== person) : [...prev, person]
    );
  }

  return (
    <div className="page">
      <a href="https://portals-gateway.vercel.app/" className="portal-link">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Portal Menu
      </a>

      <header className="header">
        <p className="eyebrow">CVD</p>
        <div className="brand">
          <img src="/icon.svg" alt="" className="brand-icon" />
          <h1>What To Drink</h1>
        </div>
        <p className="tagline">Snap a bottle, glass, or menu — we'll fill in the rest.</p>
        <div className="header-actions">
          <button className="add-btn" onClick={openAdd}>
            + Add something
          </button>
          <button className="refresh-btn" onClick={loadItems} title="Refresh">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6"/></svg>
          </button>
        </div>
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
        <button className="filters-toggle-btn" onClick={() => setShowFilters((v) => !v)}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16M7 12h10M10 19h4"/></svg>
          Filters {showFilters ? "▴" : "▾"}
        </button>
        {filtersActive && (
          <button className="clear-filters-btn" onClick={clearAllFilters}>
            Clear all filters
          </button>
        )}
      </div>

      <div className="chip-row">
        <span className="chip-label">Sort</span>
        {[
          { value: "recent", label: "Most recent" },
          { value: "alpha", label: "A–Z" },
          { value: "addedBy", label: "Added by" },
        ].map((opt) => (
          <button
            key={opt.value}
            className={`chip ${sortBy === opt.value ? "active" : ""}`}
            onClick={() => setSortBy(opt.value)}
          >
            {opt.label}
          </button>
        ))}
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

      {showFilters && tagOptions.length > 0 && (
        <div className="filters-panel">
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
        </div>
      )}

      <div className="grid">
        {sorted.map((it) => (
          <div className="card" key={it.id} onClick={() => openEdit(it)}>
            <div className="card-photo">
              {it.photoURL ? (
                <img src={it.photoURL} alt={it.name} />
              ) : (
                <div className="photo-fallback">🍸</div>
              )}
              {it.rating && (
                <a
                  className="rating-badge"
                  href={it.ratingLink || undefined}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!it.ratingLink) e.preventDefault();
                  }}
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
              {it.producer && (
                <p className="notes">
                  <em>
                    {it.producerUrl ? (
                      <a
                        href={it.producerUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {it.producer}
                      </a>
                    ) : (
                      it.producer
                    )}
                  </em>
                  {it.region ? ` · ${it.region}` : ""}
                </p>
              )}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedCards((prev) => ({ ...prev, [it.id]: !prev[it.id] }));
                  }}
                >
                  {expandedCards[it.id] ? "Show less" : "Show more"}
                </button>
              )}
              <div className="people-ratings">
                <span className="rate-hint">Tap to rate</span>
                {PEOPLE.map((p) => {
                  const val = it.ratings?.[p] || "TBD";
                  const icon =
                    val === "up" ? "👍" : val === "sideways" ? "🤷" : val === "down" ? "👎" : "☆";
                  return (
                    <button
                      key={p}
                      className={`person-rating ${val !== "TBD" ? "set" : ""}`}
                      title={`${p}: ${val === "TBD" ? "no reaction yet" : val} — tap to change`}
                      onClick={(e) => {
                        e.stopPropagation();
                        cycleRating(it.id, p, val);
                      }}
                    >
                      <span className="pr-icon">{icon}</span>
                      <span className="pr-name">{p}</span>
                    </button>
                  );
                })}
              </div>

              <div className="comments-block" onClick={(e) => e.stopPropagation()}>
                {it.comments?.length > 0 && (
                  <div className="comment-list">
                    {it.comments.map((c, i) => (
                      <div className="comment" key={i}>
                        <p className="comment-text">
                          {c.author && <span className="comment-author">{c.author}: </span>}
                          {c.text}
                        </p>
                        {c.tags?.length > 0 && (
                          <div className="comment-tags">
                            {c.tags.map((t) => (
                              <span className="comment-tag" key={t}>@{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="note-form">
                  <textarea
                    className="note-input"
                    placeholder="Add a note…"
                    value={getNoteDraft(it.id).text}
                    onChange={(e) => updateNoteDraft(it.id, { text: e.target.value })}
                  />
                  <div className="note-row">
                    <select
                      className="note-author-select"
                      value={getNoteDraft(it.id).author}
                      onChange={(e) => updateNoteDraft(it.id, { author: e.target.value })}
                    >
                      <option value="">Who's this from?</option>
                      {PEOPLE.map((p) => (
                        <option value={p} key={p}>{p}</option>
                      ))}
                    </select>
                    <button
                      className="note-post-btn"
                      disabled={!getNoteDraft(it.id).text.trim() || !getNoteDraft(it.id).author || postingNote === it.id}
                      onClick={() => submitNote(it.id)}
                    >
                      {postingNote === it.id ? "Posting…" : "Post"}
                    </button>
                  </div>
                  <div className="pill-row note-tag-row">
                    <span className="chip-label">Tag</span>
                    {PEOPLE.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`pill small ${getNoteDraft(it.id).tags.includes(p) ? "active" : ""}`}
                        onClick={() => toggleNoteTag(it.id, p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

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
        {sorted.length === 0 && <p className="empty">Nothing here yet.</p>}
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={closeAdd}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()} onPaste={handlePaste}>
            <div className="modal-header-row">
              <h2>{editingId ? "Edit" : "Add something"}</h2>
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
            {analyzing && (
              <p className="analyzing">
                <span className="spinner" />
                Looking it up…
              </p>
            )}

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
                Producer website
                <input
                  placeholder="e.g. https://peachstreetdistillers.com"
                  value={form.producerUrl}
                  onChange={(e) => setForm({ ...form, producerUrl: e.target.value })}
                />
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
                  {saving ? "Saving…" : editingId ? "Save changes" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showScrollTop && (
        <button
          className="scroll-top-btn"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
        >
          ↑
        </button>
      )}
    </div>
  );
}
