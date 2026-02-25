import React, { useEffect, useMemo, useRef, useState } from "react";

const LS_ENTRIES = "ptt_entries_v3";
const LS_QUICK = "ptt_quick_v3";
const LS_RANK_XP = "ptt_rankxp_v3";
const LS_LAST_CHECK = "ptt_lastcheck_v3";

const LONG_PRESS_MS = 1000; // <- TU zmieniasz czas przytrzymania (np. 1000 = 1s)

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function lastNDays(n = 7) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(todayKey(d));
  }
  return out;
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function useLongPress({ onLongPress, onClick, ms = 1000 }) {
  const timer = useRef(null);
  const longPressed = useRef(false);

  const start = () => {
    longPressed.current = false;
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      onLongPress?.();
    }, ms);
  };

  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const end = () => {
    clear();
    if (!longPressed.current) onClick?.();
  };

  return {
    onPointerDown: start,
    onPointerUp: end,
    onPointerLeave: clear,
    onPointerCancel: clear,
  };
}

export default function App() {
  const [title, setTitle] = useState("Power Tenor Tracker");
  const [entries, setEntries] = useState([]);
  const [quick, setQuick] = useState([
    { id: "q1", name: "Post", exp: 30 },
    { id: "q2", name: "Śpiew", exp: 50 },
  ]);

  const [name, setName] = useState("");
  const [exp, setExp] = useState("");

  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const [armedEntryId, setArmedEntryId] = useState(null);
  const [armedQuickId, setArmedQuickId] = useState(null);

  const [rankXP, setRankXP] = useState(0);

  // ---- Load
  useEffect(() => {
    const savedEntries = safeParse(localStorage.getItem(LS_ENTRIES), []);
    const savedQuick = safeParse(localStorage.getItem(LS_QUICK), null);
    const savedRank = safeParse(localStorage.getItem(LS_RANK_XP), 0);
    if (Array.isArray(savedEntries)) setEntries(savedEntries);
    if (Array.isArray(savedQuick) && savedQuick.length) setQuick(savedQuick);
    if (typeof savedRank === "number") setRankXP(savedRank);
  }, []);

  // ---- Save
  useEffect(() => {
    localStorage.setItem(LS_ENTRIES, JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    localStorage.setItem(LS_QUICK, JSON.stringify(quick));
  }, [quick]);

  useEffect(() => {
    localStorage.setItem(LS_RANK_XP, JSON.stringify(rankXP));
  }, [rankXP]);

  function showToast(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  }

  const totalXP = useMemo(() => entries.reduce((s, e) => s + (Number(e.exp) || 0), 0), [entries]);
  const level = useMemo(() => Math.floor(totalXP / 100) + 1, [totalXP]);
  const inLevel = useMemo(() => totalXP % 100, [totalXP]);
  const toNext = useMemo(() => 100 - inLevel, [inLevel]);

  const expToday = useMemo(() => {
    const tk = todayKey();
    return entries
      .filter((e) => e.dayKey === tk)
      .reduce((s, e) => s + (Number(e.exp) || 0), 0);
  }, [entries]);

  const last7 = useMemo(() => {
    const days = lastNDays(7);
    const map = new Map(days.map((d) => [d, 0]));
    for (const e of entries) {
      if (map.has(e.dayKey)) map.set(e.dayKey, map.get(e.dayKey) + (Number(e.exp) || 0));
    }
    return days.map((d) => ({ day: d.slice(5), value: map.get(d) || 0 }));
  }, [entries]);

  const maxBar = useMemo(() => Math.max(10, ...last7.map((x) => x.value)), [last7]);

  function addEntry(actionName, actionExp, alsoAddToQuick = true) {
    const n = String(actionName || "").trim();
    const v = Number(actionExp);

    if (!n) return showToast("Podaj nazwę aktywności ✍️");
    if (!Number.isFinite(v) || v <= 0) return showToast("Podaj poprawne EXP ✅");

    const now = new Date();
    const entry = {
      id: uid(),
      name: n,
      exp: v,
      ts: now.toISOString(),
      dayKey: todayKey(now),
    };

    setEntries((prev) => [entry, ...prev]);
    setRankXP((prev) => prev + v);

    // Dodaj też jako szybka akcja (pole obok "Post, Śpiew") – jeśli nie istnieje
    if (alsoAddToQuick) {
      setQuick((prev) => {
        const exists = prev.some((q) => q.name.toLowerCase() === n.toLowerCase() && Number(q.exp) === v);
        if (exists) return prev;
        return [...prev, { id: uid(), name: n, exp: v }];
      });
    }

    setName("");
    setExp("");
    showToast(`Dodano: ${n} (+${v})`);
  }

  function clearAll() {
    setEntries([]);
    setRankXP(0);
    setArmedEntryId(null);
    setArmedQuickId(null);

    localStorage.removeItem(LS_ENTRIES);
    localStorage.removeItem(LS_RANK_XP);
    localStorage.removeItem(LS_LAST_CHECK);

    showToast("Wyczyszczono wszystko ✅");
  }

  function deleteEntry(entryId) {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    // rankXP celowo nie “cofamy” za historię, bo to byłby exploit.
    // Jeśli chcesz: możemy odjąć exp usuniętego wpisu (powiedz).
    showToast("Usunięto wpis 🗑️");
  }

  function deleteQuick(qid) {
    setQuick((prev) => prev.filter((q) => q.id !== qid));
    showToast("Usunięto szybką akcję 🗑️");
  }

  function downloadReport() {
    const lines = [];
    lines.push(`RAPORT: ${title}`);
    lines.push(`Data: ${new Date().toLocaleString()}`);
    lines.push("");
    lines.push(`LEVEL: ${level}`);
    lines.push(`EXP łącznie: ${totalXP}`);
    lines.push(`EXP dziś: ${expToday}`);
    lines.push(`Do następnego: ${toNext} EXP`);
    lines.push(`Rank XP: ${rankXP}`);
    lines.push("");
    lines.push("Ostatnie 7 dni (EXP):");
    for (const d of last7) lines.push(`- ${d.day}: ${d.value}`);
    lines.push("");
    lines.push("Ostatnie wpisy:");
    entries.slice(0, 20).forEach((e) => {
      lines.push(`- ${e.dayKey} | ${e.name} (+${e.exp})`);
    });

    downloadTextFile(`raport_${todayKey()}.txt`, lines.join("\n"));
    showToast("Pobrano raport 📄");
  }

  // ---------- UI
  const progressPct = Math.round((inLevel / 100) * 100);

  return (
    <div className="container">
      <div className="header">
        <h1 className="title outline">{title}</h1>
        <p className="subtitle outline" style={{ opacity: 0.92 }}>
          Wygląd jak gra RPG • EXP • levele
        </p>
      </div>

      <div className="grid">
        {/* STATUS */}
        <div className="card">
          <div className="cardTitleRow">
            <div className="badge">
              <span style={{ fontSize: 18 }}>⭐</span>
              <span className="outline" style={{ fontSize: 18 }}>LEVEL {level}</span>
            </div>
            <div className="outline" style={{ fontSize: 20 }}>
              {inLevel}/100 EXP
            </div>
          </div>

          <div className="progressWrap" aria-label="progress">
            <div className="progressFill" style={{ width: `${progressPct}%` }} />
          </div>

          <div className="smallNote">
            <span className="outline" style={{ opacity: 0.9 }}>
              Total EXP: {totalXP}
            </span>
          </div>
        </div>

        {/* DODAWANIE */}
        <div className="card">
          <h2 className="sectionLabel outline">Dodaj EXP</h2>
          <div className="row">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nazwa aktywności (np. Ćwiczenie śpiewu)"
            />
            <input
              className="input"
              value={exp}
              onChange={(e) => setExp(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="EXP (np. 40)"
              inputMode="numeric"
            />
            <button
              className="btn btnPrimary outline"
              onClick={() => addEntry(name, exp, true)}
            >
              + DODAJ
            </button>
          </div>

          <div style={{ height: 10 }} />

          <h3 className="sectionLabel outline" style={{ fontSize: 22, marginTop: 8 }}>
            Szybkie akcje
          </h3>

          <div className="quickWrap">
            {quick.map((q) => (
              <QuickChip
                key={q.id}
                q={q}
                armed={armedQuickId === q.id}
                onAdd={() => addEntry(q.name, q.exp, false)}
                onArm={() => {
                  setArmedQuickId(q.id);
                  showToast("Przytrzymaj jeszcze raz 1s, aby usunąć 🗑️");
                }}
                onDelete={() => deleteQuick(q.id)}
                longPressMs={LONG_PRESS_MS}
              />
            ))}
          </div>

          <div style={{ height: 12 }} />

          <button className="btn outline" onClick={clearAll}>
            Wyczyść wszystko
          </button>
        </div>

        {/* RAPORT */}
        <div className="card">
          <div className="cardTitleRow">
            <h2 className="cardTitle outline">Raport</h2>
            <button className="btn outline" onClick={downloadReport} title="Pobierz raport tekstowy">
              🎮 STATY
            </button>
          </div>

          <div className="split2">
            <div className="statBox">
              <div className="statLabel outline">Wpisy</div>
              <p className="statValue outline">{entries.length}</p>
            </div>
            <div className="statBox">
              <div className="statLabel outline">EXP dziś</div>
              <p className="statValue outline">{expToday}</p>
            </div>
            <div className="statBox">
              <div className="statLabel outline">Level</div>
              <p className="statValue outline">{level}</p>
            </div>
            <div className="statBox">
              <div className="statLabel outline">Do następnego</div>
              <p className="statValue outline">{toNext} EXP</p>
            </div>
          </div>

          <div style={{ height: 12 }} />

          <div className="chart">
            <div className="outline" style={{ fontSize: 18, marginBottom: 6 }}>
              Ostatnie 7 dni
            </div>
            <div className="chartRow">
              {last7.map((d) => (
                <div
                  key={d.day}
                  className="bar"
                  style={{
                    height: `${Math.max(6, Math.round((d.value / maxBar) * 90))}px`,
                  }}
                  title={`${d.day}: ${d.value}`}
                />
              ))}
            </div>
            <div className="barLabel outline" style={{ display: "flex", gap: 8 }}>
              {last7.map((d) => (
                <div key={d.day} style={{ flex: 1, textAlign: "center" }}>
                  {d.day}
                </div>
              ))}
            </div>

            <div style={{ height: 10 }} />

            <div className="split2">
              <div className="statBox">
                <div className="statLabel outline">Top (EXP)</div>
                <p className="outline" style={{ margin: 0, opacity: 0.95 }}>
                  {topBy(entries, "exp") || "Brak danych"}
                </p>
              </div>
              <div className="statBox">
                <div className="statLabel outline">Top (ilość)</div>
                <p className="outline" style={{ margin: 0, opacity: 0.95 }}>
                  {topCount(entries) || "Brak danych"}
                </p>
              </div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          {/* Historia */}
          <div className="outline" style={{ fontSize: 18, marginBottom: 8 }}>
            Historia
          </div>

          {entries.length === 0 ? (
            <div className="outline" style={{ opacity: 0.92 }}>
              Brak wpisów. Dodaj pierwszy EXP i wbijaj levele 😄
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {entries.slice(0, 25).map((e) => (
                <EntryRow
                  key={e.id}
                  e={e}
                  armed={armedEntryId === e.id}
                  onArm={() => {
                    setArmedEntryId(e.id);
                    showToast("Przytrzymaj jeszcze raz 1s, aby usunąć 🗑️");
                  }}
                  onDelete={() => deleteEntry(e.id)}
                  longPressMs={LONG_PRESS_MS}
                />
              ))}
            </div>
          )}
        </div>

        {/* USTAWIENIA */}
        <div className="card">
          <h2 className="sectionLabel outline">Ustawienia</h2>
          <div className="row">
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nazwa nagłówka"
            />
            <button className="btn outline" onClick={() => showToast("Zmieniono tytuł ✅")}>
              Zapisz
            </button>
          </div>
          <div className="smallNote outline" style={{ opacity: 0.9 }}>
            Tip: czas przytrzymania do usuwania ustawisz w <b>LONG_PRESS_MS</b> na górze pliku.
          </div>
        </div>
      </div>

      {toast ? <div className="toast outline">{toast}</div> : null}
    </div>
  );
}

function QuickChip({ q, armed, onAdd, onArm, onDelete, longPressMs }) {
  const press = useLongPress({
    ms: longPressMs,
    onClick: () => {
      if (armed) {
        // jeśli już uzbrojony, krótki klik nie kasuje — dodaje exp
        onAdd();
        return;
      }
      onAdd();
    },
    onLongPress: () => {
      if (!armed) onArm();
      else onDelete();
    },
  });

  return (
    <button className={"chip " + (armed ? "chipArmed" : "")} {...press}>
      {/* OBWÓDKA TYLKO NA TEKŚCIE (a nie na całym chipie) */}
      <span className="chipName outline">{q.name}</span>
      <span className="chipExp outline">({q.exp})</span>
      <span className="chipIcon" title="przytrzymaj, aby usunąć">
        ⏳
      </span>
    </button>
  );
}

function EntryRow({ e, armed, onArm, onDelete, longPressMs }) {
  const press = useLongPress({
    ms: longPressMs,
    onClick: () => {
      // nic
    },
    onLongPress: () => {
      if (!armed) onArm();
      else onDelete();
    },
  });

  return (
    <div className={"statBox " + (armed ? "chipArmed" : "")} {...press} style={{ cursor: "pointer" }}>
      <div className="outline" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {e.name}
        </div>
        <div>+{e.exp}</div>
      </div>
      <div className="outline" style={{ opacity: 0.8, marginTop: 6, fontSize: 12 }}>
        {e.dayKey} • przytrzymaj 1s, aby usunąć
      </div>
    </div>
  );
}

function topBy(entries, key) {
  if (!entries.length) return "";
  const map = new Map();
  for (const e of entries) {
    const name = (e.name || "").trim();
    if (!name) continue;
    const val = Number(e[key]) || 0;
    map.set(name, (map.get(name) || 0) + val);
  }
  let best = null;
  for (const [name, sum] of map.entries()) {
    if (!best || sum > best.sum) best = { name, sum };
  }
  return best ? `${best.name} • ${best.sum} EXP` : "";
}

function topCount(entries) {
  if (!entries.length) return "";
  const map = new Map();
  for (const e of entries) {
    const name = (e.name || "").trim();
    if (!name) continue;
    map.set(name, (map.get(name) || 0) + 1);
  }
  let best = null;
  for (const [name, cnt] of map.entries()) {
    if (!best || cnt > best.cnt) best = { name, cnt };
  }
  return best ? `${best.name} • ${best.cnt} razy` : "";
}
