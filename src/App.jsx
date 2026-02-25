import React, { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

const STORAGE_KEY = "power_tenor_tracker_entries_v2";

/** Proste levele RPG (rosnące progi) */
function calcLevel(totalExp) {
  let level = 1;
  let need = 100; // exp na lvl 2
  let expLeft = totalExp;

  while (expLeft >= need) {
    expLeft -= need;
    level++;
    need = Math.round(need * 1.4);
  }

  return { level, inLevelExp: expLeft, needExp: need };
}

/** Hook do long-press (domyślnie 3000ms) */
function useLongPress(onLongPress, ms = 3000) {
  const timerRef = useRef(null);
  const [isHolding, setIsHolding] = useState(false);

  const start = () => {
    setIsHolding(true);
    timerRef.current = setTimeout(() => {
      onLongPress?.();
      setIsHolding(false);
      timerRef.current = null;
    }, ms);
  };

  const cancel = () => {
    setIsHolding(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  return { isHolding, start, cancel };
}

function ExpTile({ entry, onDelete }) {
  const { isHolding, start, cancel } = useLongPress(onDelete, 3000);

  return (
    <div
      className={`tile ${isHolding ? "holding" : ""}`}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
    >
      <div className="tileTop">
        <div className="tileName">{entry.name}</div>
        <div className="tileExp">+{entry.exp} EXP</div>
      </div>

      <div className="tileHint">
        Przytrzymaj <b>3 sekundy</b>, aby usunąć
      </div>

      <div className="holdOverlay">
        <div className="holdPill">⏳ Trzymaj... usuwa po 3s</div>
      </div>
    </div>
  );
}

export default function App() {
  const [name, setName] = useState("");
  const [exp, setExp] = useState("");
  const [entries, setEntries] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const totalExp = useMemo(
    () => entries.reduce((sum, e) => sum + (Number(e.exp) || 0), 0),
    [entries]
  );

  const lvl = useMemo(() => calcLevel(totalExp), [totalExp]);
  const pct = Math.min(100, Math.round((lvl.inLevelExp / lvl.needExp) * 100));

  const addEntry = () => {
    const n = name.trim();
    const v = Number(exp);

    if (!n) return;
    if (!Number.isFinite(v) || v <= 0) return;

    setEntries((prev) => [
      {
        id: (crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
        name: n,
        exp: v,
        createdAt: Date.now(),
      },
      ...prev,
    ]);

    setName("");
    setExp("");
  };

  const removeEntry = (id) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const clearAll = () => {
    setEntries([]);
  };

  // Przykładowe “szybkie” kafelki (opcjonalne)
  const quickAdd = (label, value) => {
    setName(label);
    setExp(String(value));
  };

  return (
    <div className="app">
      <div className="title">Power Tenor Tracker</div>
      <div className="subtitle">Wygląd jak gra RPG • EXP • levele</div>

      {/* RPG BAR */}
      <div className="rpgBar">
        <div className="rpgHeader">
          <div className="levelBadge">
            ⭐ LEVEL <span>{lvl.level}</span>
          </div>
          <div className="rpgNumbers">
            {lvl.inLevelExp}/{lvl.needExp} EXP
          </div>
        </div>

        <div className="barTrack">
          <div className="barFill" style={{ width: `${pct}%` }} />
        </div>

        <div className="small">
          Total EXP: <b>{totalExp}</b>
        </div>
      </div>

      {/* ADD */}
      <div className="card">
        <div className="row">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nazwa aktywności (np. Ćwiczenie śpiewu)"
          />
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <input
            className="input"
            value={exp}
            onChange={(e) => setExp(e.target.value)}
            placeholder="EXP (np. 40)"
            inputMode="numeric"
          />
          <button className="btn" onClick={addEntry}>
            + DODAJ
          </button>
        </div>

        <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
          <button
            className="btn btnAlt"
            onClick={() => quickAdd("Post na social media", 30)}
            type="button"
          >
            Post (30)
          </button>
          <button
            className="btn btnAlt"
            onClick={() => quickAdd("Ćwiczenie śpiewu", 50)}
            type="button"
          >
            Śpiew (50)
          </button>
          <button className="btn btnDanger" onClick={clearAll} type="button">
            Wyczyść wszystko
          </button>
        </div>
      </div>

      {/* LIST */}
      <div className="grid">
        {entries.length === 0 ? (
          <div className="empty">
            Brak wpisów. Dodaj pierwszy EXP i wbijaj levele 😄
          </div>
        ) : (
          entries.map((e) => (
            <ExpTile
              key={e.id}
              entry={e}
              onDelete={() => removeEntry(e.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}