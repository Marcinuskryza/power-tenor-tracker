import React, { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

const LS_KEYS = {
  entries: "ptt_entries_v2",
  presets: "ptt_presets_v2",
  totalExp: "ptt_totalExp_v2",
};

const LEVEL_EXP = 100; // 100 EXP = 1 level (prosto i "game'owo")

const DEFAULT_PRESETS = [
  { id: "preset-post", name: "Post", exp: 30 },
  { id: "preset-sing", name: "Śpiew", exp: 50 },
];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function nowISO() {
  return new Date().toISOString();
}

function isSameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function dayKey(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastNDaysKeys(n) {
  const out = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

/**
 * Long-press hook: triggers after `ms` unless user releases earlier
 */
function useLongPress(callback, ms = 3000) {
  const timerRef = useRef(null);
  const startedRef = useRef(false);

  const start = (e) => {
    e?.preventDefault?.();
    startedRef.current = true;
    timerRef.current = setTimeout(() => {
      callback?.();
    }, ms);
  };

  const clear = () => {
    startedRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return {
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: clear,
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchCancel: clear,
    onContextMenu: (e) => e.preventDefault(),
  };
}

export default function App() {
  const [activityName, setActivityName] = useState("");
  const [activityExp, setActivityExp] = useState("");

  const [entries, setEntries] = useState([]);
  const [presets, setPresets] = useState(DEFAULT_PRESETS);
  const [totalExp, setTotalExp] = useState(0);

  // Load from localStorage
  useEffect(() => {
    const e = safeParse(localStorage.getItem(LS_KEYS.entries), []);
    const p = safeParse(localStorage.getItem(LS_KEYS.presets), null);
    const t = Number(localStorage.getItem(LS_KEYS.totalExp) ?? 0);

    if (Array.isArray(e)) setEntries(e);
    if (Array.isArray(p) && p.length) setPresets(p);
    setTotalExp(Number.isFinite(t) ? t : 0);
  }, []);

  // Save
  useEffect(() => {
    localStorage.setItem(LS_KEYS.entries, JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.presets, JSON.stringify(presets));
  }, [presets]);

  useEffect(() => {
    localStorage.setItem(LS_KEYS.totalExp, String(totalExp));
  }, [totalExp]);

  // Level calc
  const level = Math.floor(totalExp / LEVEL_EXP) + 1;
  const expIntoLevel = totalExp % LEVEL_EXP;
  const expToNext = LEVEL_EXP;
  const progress = (expIntoLevel / expToNext) * 100;

  // Reports
  const report = useMemo(() => {
    const today = nowISO();
    const expToday = entries
      .filter((x) => isSameDay(x.createdAt, today))
      .reduce((sum, x) => sum + x.exp, 0);

    const count = entries.length;

    const byName = new Map();
    for (const e of entries) {
      const key = (e.name || "").trim();
      if (!key) continue;
      const prev = byName.get(key) || { name: key, count: 0, exp: 0 };
      prev.count += 1;
      prev.exp += e.exp;
      byName.set(key, prev);
    }

    const topByExp = [...byName.values()]
      .sort((a, b) => b.exp - a.exp)
      .slice(0, 5);

    const topByCount = [...byName.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const keys7 = lastNDaysKeys(7);
    const perDay = new Map(keys7.map((k) => [k, 0]));
    for (const e of entries) {
      const k = dayKey(e.createdAt);
      if (perDay.has(k)) perDay.set(k, perDay.get(k) + e.exp);
    }
    const series7 = keys7.map((k) => ({ day: k.slice(5), exp: perDay.get(k) || 0 }));
    const max7 = Math.max(1, ...series7.map((x) => x.exp));

    return { expToday, count, topByExp, topByCount, series7, max7 };
  }, [entries]);

  const addOrUpdatePresetFromEntry = (name, exp) => {
    const n = name.trim();
    if (!n) return;

    // jeśli istnieje preset o tej nazwie -> aktualizuj jego EXP do ostatnio użytego
    setPresets((prev) => {
      const idx = prev.findIndex((p) => p.name.toLowerCase() === n.toLowerCase());
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], name: n, exp };
        return copy;
      }
      // dodaj nowy preset na koniec
      return [...prev, { id: uid("preset"), name: n, exp }];
    });
  };

  const handleAdd = () => {
    const name = activityName.trim();
    const exp = Number(activityExp);

    if (!name) return alert("Wpisz nazwę aktywności 🙂");
    if (!Number.isFinite(exp) || exp <= 0) return alert("Wpisz poprawne EXP (np. 30)");

    const entry = {
      id: uid("entry"),
      name,
      exp: Math.floor(exp),
      createdAt: nowISO(),
    };

    setEntries((prev) => [entry, ...prev]);
    setTotalExp((prev) => prev + entry.exp);

    // ✅ dodaj do “pola obok” (Szybkie akcje)
    addOrUpdatePresetFromEntry(name, entry.exp);

    // opcjonalnie czyść inputy
    setActivityName("");
    setActivityExp("");
  };

  const handleQuick = (p) => {
    // 1) uzupełnij pola (żeby było “jak w grze” i widać co dodasz)
    setActivityName(p.name);
    setActivityExp(String(p.exp));

    // 2) i od razu dodaj wpis jednym tapnięciem
    const entry = {
      id: uid("entry"),
      name: p.name,
      exp: p.exp,
      createdAt: nowISO(),
    };
    setEntries((prev) => [entry, ...prev]);
    setTotalExp((prev) => prev + entry.exp);
  };

  const clearAll = () => {
    if (!confirm("Na pewno wyczyścić wszystko?")) return;
    setEntries([]);
    setTotalExp(0);
  };

  const removeEntry = (id) => {
    setEntries((prev) => {
      const found = prev.find((x) => x.id === id);
      if (found) setTotalExp((t) => Math.max(0, t - found.exp));
      return prev.filter((x) => x.id !== id);
    });
  };

  const removePreset = (id) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="app">
      <div className="bgGlow" />

      <header className="header">
        <h1 className="title stroke">Power Tenor Tracker</h1>
        <div className="subtitle stroke">Wygląd jak gra RPG • EXP • levele</div>
      </header>

      {/* LEVEL CARD */}
      <section className="card cardGlass">
        <div className="levelRow">
          <div className="pill">
            <span className="star">★</span>
            <span className="stroke">LEVEL {level}</span>
          </div>

          <div className="levelMeta stroke">
            {expIntoLevel}/{expToNext} EXP
          </div>
        </div>

        <div className="xpBarOuter">
          <div className="xpBarInner" style={{ width: `${clamp(progress, 0, 100)}%` }} />
          <div className="xpBarShine" />
        </div>

        <div className="smallText stroke">Total EXP: {totalExp}</div>
      </section>

      {/* INPUT / ACTIONS */}
      <section className="card cardGlass">
        <div className="inputs">
          <input
            className="input"
            value={activityName}
            onChange={(e) => setActivityName(e.target.value)}
            placeholder="Nazwa aktywności (np. Ćwiczenie śpiewu)"
          />

          <div className="row">
            <input
              className="input"
              value={activityExp}
              onChange={(e) => setActivityExp(e.target.value)}
              placeholder="EXP (np. 40)"
              inputMode="numeric"
            />

            <button className="btnPrimary" onClick={handleAdd}>
              <span className="stroke">+ DODAJ</span>
            </button>
          </div>
        </div>

        {/* ✅ “Pole obok” — rośnie wraz z ilością */}
        <div className="quickWrap">
          <div className="quickTitle stroke">Szybkie akcje</div>
          <div className="quickGrid">
            {presets.map((p) => {
              const lp = useLongPress(() => {
                if (confirm(`Usunąć szybką akcję: "${p.name} (${p.exp})"?`)) removePreset(p.id);
              }, 3000);

              return (
                <button
                  key={p.id}
                  className="chip"
                  onClick={() => handleQuick(p)}
                  {...lp}
                  title="Kliknij: dodaj. Przytrzymaj 3 sek: usuń."
                >
                  <span className="stroke">
                    {p.name} ({p.exp})
                  </span>
                  <span className="chipHint stroke">⏳</span>
                </button>
              );
            })}
          </div>

          <button className="btnDanger" onClick={clearAll}>
            <span className="stroke">Wyczyść wszystko</span>
          </button>
        </div>
      </section>

      {/* REPORT CARD */}
      <section className="card cardGlass">
        <div className="reportHeader">
          <div className="reportTitle stroke">Raport</div>
          <div className="reportBadge stroke">🎮 STATY</div>
        </div>

        <div className="reportGrid">
          <div className="statBox">
            <div className="statLabel stroke">Wpisy</div>
            <div className="statValue stroke">{report.count}</div>
          </div>

          <div className="statBox">
            <div className="statLabel stroke">EXP dziś</div>
            <div className="statValue stroke">{report.expToday}</div>
          </div>

          <div className="statBox">
            <div className="statLabel stroke">Level</div>
            <div className="statValue stroke">{level}</div>
          </div>

          <div className="statBox">
            <div className="statLabel stroke">Do następnego</div>
            <div className="statValue stroke">{expToNext - expIntoLevel} EXP</div>
          </div>
        </div>

        <div className="chart">
          <div className="chartTitle stroke">Ostatnie 7 dni</div>
          <div className="bars">
            {report.series7.map((d) => {
              const h = (d.exp / report.max7) * 100;
              return (
                <div key={d.day} className="barCol">
                  <div className="bar" style={{ height: `${clamp(h, 0, 100)}%` }} />
                  <div className="barLabel stroke">{d.day}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="topLists">
          <div className="topList">
            <div className="topTitle stroke">Top (EXP)</div>
            {report.topByExp.length ? (
              report.topByExp.map((x) => (
                <div key={x.name} className="topRow">
                  <span className="stroke">{x.name}</span>
                  <span className="stroke">{x.exp}</span>
                </div>
              ))
            ) : (
              <div className="muted stroke">Brak danych</div>
            )}
          </div>

          <div className="topList">
            <div className="topTitle stroke">Top (ilość)</div>
            {report.topByCount.length ? (
              report.topByCount.map((x) => (
                <div key={x.name} className="topRow">
                  <span className="stroke">{x.name}</span>
                  <span className="stroke">{x.count}×</span>
                </div>
              ))
            ) : (
              <div className="muted stroke">Brak danych</div>
            )}
          </div>
        </div>
      </section>

      {/* ENTRIES */}
      <section className="entries">
        {entries.length === 0 ? (
          <div className="empty stroke">Brak wpisów. Dodaj pierwszy EXP i wbijaj levele 😄</div>
        ) : (
          entries.map((e) => {
            const lp = useLongPress(() => {
              if (confirm(`Usunąć wpis: "${e.name} (+${e.exp})"?`)) removeEntry(e.id);
            }, 3000);

            return (
              <div key={e.id} className="entryCard" {...lp} title="Przytrzymaj 3 sekundy, aby usunąć">
                <div className="entryLeft">
                  <div className="entryName stroke">{e.name}</div>
                  <div className="entryTime stroke">
                    {new Date(e.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="entryExp stroke">+{e.exp}</div>
              </div>
            );
          })
        )}
      </section>

      <footer className="footer stroke">Tip: przytrzymaj kafelek 3 sekundy, żeby go usunąć.</footer>
    </div>
  );
}
