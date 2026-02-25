import React, { useEffect, useMemo, useRef, useState } from "react";

function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function requiredExpForLevel(level) {
  return 100 + (level - 1) * 50;
}

function formatDateKey(ts) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shortMD(ts) {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function daysBetween(dateKeyA, dateKeyB) {
  const [ya, ma, da] = dateKeyA.split("-").map(Number);
  const [yb, mb, db] = dateKeyB.split("-").map(Number);
  const a = new Date(ya, ma - 1, da);
  const b = new Date(yb, mb - 1, db);
  a.setHours(12, 0, 0, 0);
  b.setHours(12, 0, 0, 0);
  const diff = b.getTime() - a.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/** ---------- RANGI (na bazie Rank XP) ---------- */
function getRank(rankXP) {
  const xp = Math.max(0, Math.floor(rankXP));
  if (xp >= 50000) return { name: "MASTER TENOR", tier: "master", min: 50000 };
  if (xp >= 20000) return { name: "DIAMOND TENOR", tier: "diamond", min: 20000 };
  if (xp >= 8000) return { name: "GOLD ARTIST", tier: "gold", min: 8000 };
  if (xp >= 2000) return { name: "SILVER PERFORMER", tier: "silver", min: 2000 };
  return { name: "BRONZE VOCALIST", tier: "bronze", min: 0 };
}

/** ---------- Diminishing returns (w tym samym dniu) ---------- */
function diminishingMultiplier(timesAlreadyDoneToday) {
  // timesAlreadyDoneToday = ile razy ta aktywność była już wykonana DZISIAJ (przed dodaniem)
  if (timesAlreadyDoneToday <= 0) return 1.0;   // 1 raz
  if (timesAlreadyDoneToday === 1) return 0.9;  // 2 raz
  if (timesAlreadyDoneToday === 2) return 0.75; // 3 raz
  return 0.5;                                   // 4+ raz
}

/** ---------- Long press ---------- */
function useLongPress({ onLongPress, ms = 3000, disabled = false }) {
  const timer = useRef(null);
  const active = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    active.current = false;
  };

  const start = () => {
    if (disabled) return;
    active.current = true;
    timer.current = setTimeout(() => {
      if (active.current) onLongPress?.();
      clear();
    }, ms);
  };

  const end = () => clear();

  return {
    onMouseDown: start,
    onMouseUp: end,
    onMouseLeave: end,
    onTouchStart: start,
    onTouchEnd: end,
    onTouchCancel: end,
  };
}

/* ---------------------- SUBKOMPONENTY ---------------------- */

function QuickChip({ q, armed, onArm, onUse, onDelete, longPressMs = 2000 }) {
  const lp = useLongPress({
    ms: longPressMs,
    onLongPress: () => onArm(q.id),
  });

  return (
    <button
      className={"chip outline " + (armed ? "chipArmed" : "")}
      onClick={() => {
        if (armed) return;
        onUse(q);
      }}
      {...lp}
    >
      <span className="chipName">{q.name}</span>
      <span className="chipExp">({q.exp})</span>
      <span className="chipIcon">⏳</span>

      {armed && (
        <span
          className="chipDelete"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(q.id);
          }}
          role="button"
          aria-label="Usuń szybką akcję"
          title="Usuń"
        >
          🗑️
        </span>
      )}
    </button>
  );
}

function EntryCard({ e, armed, onArm, onDelete, longPressMs = 3000 }) {
  const lp = useLongPress({
    ms: longPressMs,
    onLongPress: () => onArm(e.id),
  });

  return (
    <div className={"entry glass2 " + (armed ? "entryArmed" : "")} {...lp}>
      <div className="entryLeft">
        <div className="entryName outline">{e.name}</div>
        <div className="entryMeta outline-soft">{new Date(e.ts).toLocaleString("pl-PL")}</div>
        {typeof e.baseExp === "number" && e.baseExp !== e.exp ? (
          <div className="entryMeta outline-soft">
            base {e.baseExp} → gained {e.exp} (×{e.mult})
          </div>
        ) : null}
      </div>

      <div className="entryRight">
        <div className="entryExp outline">+{e.exp}</div>
        <div className="entryTag outline-soft">EXP</div>
      </div>

      {armed && (
        <button className="entryDelete outline" onClick={() => onDelete(e.id)}>
          🗑️ Usuń
        </button>
      )}
    </div>
  );
}

/* ---------------------- APP ---------------------- */

export default function App() {
  const LS_ENTRIES = "ptt_entries_v7";
  const LS_QUICK = "ptt_quick_v7";
  const LS_RANK_XP = "ptt_rank_xp_v2";
  const LS_LAST_CHECK = "ptt_last_check_v2";

  const [entries, setEntries] = useState(() =>
    safeJsonParse(localStorage.getItem(LS_ENTRIES), [])
  );

  const [quickActions, setQuickActions] = useState(() =>
    safeJsonParse(localStorage.getItem(LS_QUICK), [
      { id: uid(), name: "Post", exp: 30 },
      { id: uid(), name: "Śpiew", exp: 50 },
    ])
  );

  const [rankXP, setRankXP] = useState(() => {
    const v = Number(localStorage.getItem(LS_RANK_XP) ?? 0);
    return Number.isFinite(v) ? v : 0;
  });

  const [name, setName] = useState("");
  const [exp, setExp] = useState("");
  const [toast, setToast] = useState("");

  const [armedEntryId, setArmedEntryId] = useState(null);
  const [armedQuickId, setArmedQuickId] = useState(null);

  useEffect(() => {
    localStorage.setItem(LS_ENTRIES, JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    localStorage.setItem(LS_QUICK, JSON.stringify(quickActions));
  }, [quickActions]);

  useEffect(() => {
    localStorage.setItem(LS_RANK_XP, String(Math.max(0, Math.floor(rankXP))));
  }, [rankXP]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const totalExp = useMemo(
    () => entries.reduce((s, e) => s + (Number(e.exp) || 0), 0),
    [entries]
  );

  const { level, expIntoLevel, expToNext } = useMemo(() => {
    let lvl = 1;
    let remaining = totalExp;
    while (true) {
      const req = requiredExpForLevel(lvl);
      if (remaining >= req) {
        remaining -= req;
        lvl += 1;
        continue;
      }
      return { level: lvl, expIntoLevel: remaining, expToNext: req };
    }
  }, [totalExp]);

  const progressPct = useMemo(() => {
    if (expToNext <= 0) return 0;
    return clamp((expIntoLevel / expToNext) * 100, 0, 100);
  }, [expIntoLevel, expToNext]);

  const rank = useMemo(() => getRank(rankXP), [rankXP]);

  const todayKey = formatDateKey(Date.now());
  const expToday = useMemo(() => {
    return entries
      .filter((e) => formatDateKey(e.ts) === todayKey)
      .reduce((s, e) => s + (Number(e.exp) || 0), 0);
  }, [entries, todayKey]);

  const last7 = useMemo(() => {
    const days = [];
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = formatDateKey(d.getTime());
      const sum = entries
        .filter((e) => formatDateKey(e.ts) === key)
        .reduce((s, e) => s + (Number(e.exp) || 0), 0);
      days.push({ key, label: shortMD(d.getTime()), exp: sum });
    }
    const max = Math.max(1, ...days.map((x) => x.exp));
    return { days, max };
  }, [entries]);

  const topByExp = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      const k = (e.name || "").trim() || "Bez nazwy";
      map.set(k, (map.get(k) || 0) + (Number(e.exp) || 0));
    }
    const arr = [...map.entries()].map(([name, exp]) => ({ name, exp }));
    arr.sort((a, b) => b.exp - a.exp);
    return arr.slice(0, 3);
  }, [entries]);

  const topByCount = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      const k = (e.name || "").trim() || "Bez nazwy";
      map.set(k, (map.get(k) || 0) + 1);
    }
    const arr = [...map.entries()].map(([name, count]) => ({ name, count }));
    arr.sort((a, b) => b.count - a.count);
    return arr.slice(0, 3);
  }, [entries]);

  /** ---------- SYSTEM OCHRONY + DEGRADACJA ---------- */
  useEffect(() => {
    const today = formatDateKey(Date.now());
    const lastCheck = localStorage.getItem(LS_LAST_CHECK);

    if (!lastCheck) {
      localStorage.setItem(LS_LAST_CHECK, today);
      return;
    }

    const gap = daysBetween(lastCheck, today);
    if (gap <= 0) return;

    const activeDays = new Set(entries.map((e) => formatDateKey(e.ts)));

    let newRankXP = rankXP;
    let penalizedDays = 0;

    // liczymy dni pomiędzy, nie karzemy dzisiejszego dnia
    for (let i = 1; i <= gap; i++) {
      const d = new Date(lastCheck + "T12:00:00");
      d.setDate(d.getDate() + i);
      const key = formatDateKey(d.getTime());
      if (key === today) break;

      if (!activeDays.has(key)) {
        penalizedDays += 1;

        // ✅ OCHRONA: 1. dzień łagodnie, 2. średnio, 3+ normalnie
        let pct = 0.03;
        let minPenalty = 80;

        if (penalizedDays === 1) {
          pct = 0.01;
          minPenalty = 30;
        } else if (penalizedDays === 2) {
          pct = 0.02;
          minPenalty = 60;
        } else {
          pct = 0.03;
          minPenalty = 80;
        }

        const penalty = Math.max(minPenalty, Math.round(newRankXP * pct));
        newRankXP = Math.max(0, newRankXP - penalty);
      }
    }

    localStorage.setItem(LS_LAST_CHECK, today);

    if (penalizedDays > 0 && newRankXP !== rankXP) {
      setRankXP(newRankXP);
      setToast(`Brak aktywności: -${penalizedDays} dzień/dni → Rank XP spadł`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  function addEntry(activityName, activityExp) {
    const cleanName = (activityName || "").trim();
    const baseExp = Number(activityExp);

    if (!cleanName) {
      setToast("Podaj nazwę aktywności 🙂");
      return;
    }
    if (!Number.isFinite(baseExp) || baseExp <= 0) {
      setToast("EXP musi być liczbą > 0 🙂");
      return;
    }

    // ✅ diminishing returns: ile razy ta aktywność była już DZISIAJ?
    const doneToday = entries.filter(
      (e) => formatDateKey(e.ts) === todayKey && (e.name || "").toLowerCase() === cleanName.toLowerCase()
    ).length;

    const mult = diminishingMultiplier(doneToday);
    const gainedExp = Math.max(1, Math.round(baseExp * mult));

    const entry = {
      id: uid(),
      name: cleanName,
      exp: gainedExp,     // gained (po modyfikatorze)
      baseExp: baseExp,   // bazowe (dla info)
      mult: mult,         // mnożnik
      ts: Date.now(),
    };

    setEntries((prev) => [entry, ...prev]);
    setRankXP((prev) => prev + gainedExp);

    // aktualizuj quick actions (z bazowym exp, żeby preset trzymał “normalną wartość”)
    setQuickActions((prev) => {
      const idx = prev.findIndex((q) => q.name.toLowerCase() === cleanName.toLowerCase());
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], exp: baseExp, name: cleanName };
        return copy;
      }
      return [...prev, { id: uid(), name: cleanName, exp: baseExp }];
    });

    localStorage.setItem(LS_LAST_CHECK, formatDateKey(Date.now()));

    setName("");
    setExp("");

    if (mult < 1) {
      setToast(`+${gainedExp} EXP ✅ (base ${baseExp} ×${mult})`);
    } else {
      setToast(`+${gainedExp} EXP ✅`);
    }
  }

  function clearAll() {
    setEntries([]);
    setToast("Wyczyszczono wpisy ✅");
  }

  function removeEntry(id) {
    const found = entries.find((x) => x.id === id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setArmedEntryId(null);
    if (found) setRankXP((prev) => Math.max(0, prev - (Number(found.exp) || 0)));
    setToast("Usunięto wpis 🗑️");
  }

  function removeQuick(id) {
    setQuickActions((prev) => prev.filter((q) => q.id !== id));
    setArmedQuickId(null);
    setToast("Usunięto szybką akcję 🗑️");
  }

  function downloadStats() {
    const lines = [];
    lines.push("POWER TENOR TRACKER — RAPORT");
    lines.push("--------------------------------");
    lines.push(`Data: ${new Date().toLocaleString("pl-PL")}`);
    lines.push("");
    lines.push(`Total EXP (historyczne): ${totalExp}`);
    lines.push(`Rank XP (do rangi): ${Math.floor(rankXP)}`);
    lines.push(`Ranga: ${rank.name}`);
    lines.push("");
    lines.push(`Wpisy: ${entries.length}`);
    lines.push(`EXP dziś: ${expToday}`);
    lines.push(`Level: ${level}`);
    lines.push(`Do następnego: ${Math.max(0, expToNext - expIntoLevel)} EXP`);
    lines.push("");
    lines.push("Ostatnie 7 dni:");
    for (const d of last7.days) lines.push(`- ${d.label}: ${d.exp} EXP`);
    lines.push("");
    lines.push("Top (EXP):");
    if (topByExp.length === 0) lines.push("- Brak danych");
    for (const t of topByExp) lines.push(`- ${t.name}: ${t.exp} EXP`);
    lines.push("");
    lines.push("Top (ilość):");
    if (topByCount.length === 0) lines.push("- Brak danych");
    for (const t of topByCount) lines.push(`- ${t.name}: ${t.count}x`);
    lines.push("");
    lines.push("Szybkie akcje:");
    if (quickActions.length === 0) lines.push("- Brak");
    for (const q of quickActions) lines.push(`- ${q.name}: ${q.exp} EXP`);

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `power-tenor-raport_${formatDateKey(Date.now())}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1200);
    setToast("Pobrano raport 📄");
  }

  return (
    <div className="app">
      <div className="bg" aria-hidden="true" />
      <div className="shell">
        <header className="header">
          <div>
            <h1 className="title outline">Power Tenor Tracker</h1>
            <div className="subtitle outline-soft">EXP • levele • rangi • raport</div>
          </div>
        </header>

        <section className="card glass levelCard">
          <div className="levelTop" style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
            <div className="levelBadge">
              <span className="star">⭐</span>
              <span className="outline">LEVEL {level}</span>
            </div>

            <div className="levelBadge" title="Ranga liczona z Rank XP">
              <span className="star">🏆</span>
              <span className="outline">{rank.name}</span>
            </div>

            <div className="levelNumbers outline">
              {Math.floor(expIntoLevel)}/{Math.floor(expToNext)} EXP
            </div>
          </div>

          <div className="xpBar">
            <div className="xpFill" style={{ width: `${progressPct}%` }} />
            <div className="xpGloss" />
          </div>

          <div className="muted outline-soft">
            Total EXP: <b>{totalExp}</b> • Rank XP: <b>{Math.floor(rankXP)}</b>
          </div>
        </section>

        <section className="card glass">
          <div className="form">
            <input className="input" placeholder="Nazwa aktywności" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="row">
              <input className="input" placeholder="EXP (np. 40)" value={exp} onChange={(e) => setExp(e.target.value)} inputMode="numeric" />
              <button className="btn primary outline" onClick={() => addEntry(name, exp)}>
                + DODAJ
              </button>
            </div>
          </div>

          <div className="sectionTitle outline">Szybkie akcje</div>

          <div className="quickWrap">
            {quickActions.map((q) => (
              <QuickChip
                key={q.id}
                q={q}
                armed={armedQuickId === q.id}
                onArm={(id) => setArmedQuickId(id)}
                onUse={(item) => addEntry(item.name, item.exp)}
                onDelete={(id) => removeQuick(id)}
                longPressMs={2000}
              />
            ))}
          </div>

          <div className="row rowBottom">
            <button className="btn danger outline" onClick={clearAll}>
              Wyczyść wszystko
            </button>

            {armedQuickId && (
              <button className="btn ghost outline" onClick={() => setArmedQuickId(null)}>
                Anuluj usuwanie
              </button>
            )}
          </div>

          <div className="hint outline-soft">
            Diminishing returns: ta sama czynność w 1 dzień daje mniej EXP po kolejnych powtórzeniach.
          </div>
        </section>

        <section className="card glass">
          <div className="reportTop">
            <div className="sectionTitle outline">Raport</div>
            <button className="btn staty outline" onClick={downloadStats} title="Pobierz raport .txt">
              🎮 STATY
            </button>
          </div>

          <div className="grid2">
            <div className="mini glass2">
              <div className="miniLabel outline-soft">Wpisy</div>
              <div className="miniValue outline">{entries.length}</div>
            </div>
            <div className="mini glass2">
              <div className="miniLabel outline-soft">EXP dziś</div>
              <div className="miniValue outline">{expToday}</div>
            </div>
            <div className="mini glass2">
              <div className="miniLabel outline-soft">Ranga</div>
              <div className="miniValue outline" style={{ fontSize: 18 }}>{rank.name}</div>
            </div>
            <div className="mini glass2">
              <div className="miniLabel outline-soft">Rank XP</div>
              <div className="miniValue outline">{Math.floor(rankXP)}</div>
            </div>
          </div>

          <div className="chart glass2">
            <div className="chartTitle outline">Ostatnie 7 dni</div>
            <div className="bars">
              {last7.days.map((d) => {
                const h = clamp((d.exp / last7.max) * 100, 0, 100);
                return (
                  <div className="barCol" key={d.key}>
                    <div className="bar" style={{ height: `${h}%` }} title={`${d.label}: ${d.exp} EXP`} />
                    <div className="barLabel outline-soft">{d.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="entries">
          <div className="entriesHeader">
            <div className="sectionTitle outline">Historia</div>
            {armedEntryId && (
              <button className="btn ghost outline" onClick={() => setArmedEntryId(null)}>
                Anuluj usuwanie
              </button>
            )}
          </div>

          {entries.length === 0 ? (
            <div className="empty outline">Brak wpisów. Dodaj pierwszy EXP 😄</div>
          ) : (
            <div className="entriesList">
              {entries.map((e) => (
                <EntryCard
                  key={e.id}
                  e={e}
                  armed={armedEntryId === e.id}
                  onArm={(id) => setArmedEntryId(id)}
                  onDelete={(id) => removeEntry(id)}
                  longPressMs={3000}
                />
              ))}
            </div>
          )}
        </section>

        {toast && <div className="toast outline">{toast}</div>}
      </div>
    </div>
  );
}
