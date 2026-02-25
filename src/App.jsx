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

/** Long press – stabilnie na mobile */
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
    onTouchCancel: end
  };
}

/* ---------------------- SUBKOMPONENTY (żeby hooki były legalne) ---------------------- */

function QuickChip({ q, armed, onArm, onCancelArm, onUse, onDelete }) {
  const lp = useLongPress({
    ms: 1000,
    onLongPress: () => onArm(q.id)
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

function EntryCard({ e, armed, onArm, onDelete }) {
  const lp = useLongPress({
    ms: 1000,
    onLongPress: () => onArm(e.id)
  });

  return (
    <div className={"entry glass2 " + (armed ? "entryArmed" : "")} {...lp}>
      <div className="entryLeft">
        <div className="entryName outline">{e.name}</div>
        <div className="entryMeta outline-soft">{new Date(e.ts).toLocaleString("pl-PL")}</div>
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
  const LS_ENTRIES = "ptt_entries_v5";
  const LS_QUICK = "ptt_quick_v5";

  const [entries, setEntries] = useState(() =>
    safeJsonParse(localStorage.getItem(LS_ENTRIES), [])
  );

  const [quickActions, setQuickActions] = useState(() =>
    safeJsonParse(localStorage.getItem(LS_QUICK), [
      { id: uid(), name: "Post", exp: 30 },
      { id: uid(), name: "Śpiew", exp: 50 }
    ])
  );

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
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 1800);
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

  function addEntry(activityName, activityExp) {
    const cleanName = (activityName || "").trim();
    const numExp = Number(activityExp);

    if (!cleanName) {
      setToast("Podaj nazwę aktywności 🙂");
      return;
    }
    if (!Number.isFinite(numExp) || numExp <= 0) {
      setToast("EXP musi być liczbą > 0 🙂");
      return;
    }

    const entry = { id: uid(), name: cleanName, exp: numExp, ts: Date.now() };
    setEntries((prev) => [entry, ...prev]);

    // Dodaj/aktualizuj w szybkich akcjach
    setQuickActions((prev) => {
      const idx = prev.findIndex((q) => q.name.toLowerCase() === cleanName.toLowerCase());
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], exp: numExp, name: cleanName };
        return copy;
      }
      return [...prev, { id: uid(), name: cleanName, exp: numExp }];
    });

    setName("");
    setExp("");
    setToast(`+${numExp} EXP ✅`);
  }

  function clearAll() {
    setEntries([]);
    setToast("Wyczyszczono wpisy ✅");
  }

  function removeEntry(id) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setArmedEntryId(null);
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
    lines.push(`Wpisy: ${entries.length}`);
    lines.push(`Total EXP: ${totalExp}`);
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
            <h1 className="title outline">Życie RPG</h1>
            <div className="subtitle outline-soft">Witaj w Życie RPG • EXP • levele</div>
          </div>
        </header>

        {/* LEVEL CARD */}
        <section className="card glass levelCard">
          <div className="levelTop">
            <div className="levelBadge">
              <span className="star">⭐</span>
              <span className="outline">LEVEL {level}</span>
            </div>

            <div className="levelNumbers outline">
              {Math.floor(expIntoLevel)}/{Math.floor(expToNext)} EXP
            </div>
          </div>

          <div className="xpBar">
            <div className="xpFill" style={{ width: `${progressPct}%` }} />
            <div className="xpGloss" />
          </div>

          <div className="muted outline-soft">Total EXP: {totalExp}</div>
        </section>

        {/* ADD CARD */}
        <section className="card glass">
          <div className="form">
            <input
              className="input"
              placeholder="Nazwa aktywności (np. Ćwiczenie śpiewu)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              inputMode="text"
            />

            <div className="row">
              <input
                className="input"
                placeholder="EXP (np. 40)"
                value={exp}
                onChange={(e) => setExp(e.target.value)}
                inputMode="numeric"
              />
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
                onCancelArm={() => setArmedQuickId(null)}
                onUse={(item) => addEntry(item.name, item.exp)}
                onDelete={(id) => removeQuick(id)}
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
            Tip: przytrzymaj <b>1s</b> 🗑️
          </div>
        </section>

        {/* REPORT CARD */}
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
              <div className="miniLabel outline-soft">Level</div>
              <div className="miniValue outline">{level}</div>
            </div>
            <div className="mini glass2">
              <div className="miniLabel outline-soft">Do następnego</div>
              <div className="miniValue outline">{Math.max(0, expToNext - expIntoLevel)} EXP</div>
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

          <div className="grid2">
            <div className="mini glass2">
              <div className="miniLabel outline-soft">Top (EXP)</div>
              <div className="miniList">
                {topByExp.length === 0 ? (
                  <div className="outline">Brak danych</div>
                ) : (
                  topByExp.map((t) => (
                    <div key={t.name} className="miniRow outline">
                      <span className="miniName">{t.name}</span>
                      <span className="miniRight">{t.exp}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mini glass2">
              <div className="miniLabel outline-soft">Top (ilość)</div>
              <div className="miniList">
                {topByCount.length === 0 ? (
                  <div className="outline">Brak danych</div>
                ) : (
                  topByCount.map((t) => (
                    <div key={t.name} className="miniRow outline">
                      <span className="miniName">{t.name}</span>
                      <span className="miniRight">{t.count}x</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ENTRIES */}
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
            <div className="empty outline">Brak wpisów. Dodaj pierwszy EXP i wbijaj levele 😄</div>
          ) : (
            <div className="entriesList">
              {entries.map((e) => (
                <EntryCard
                  key={e.id}
                  e={e}
                  armed={armedEntryId === e.id}
                  onArm={(id) => setArmedEntryId(id)}
                  onDelete={(id) => removeEntry(id)}
                />
              ))}
            </div>
          )}

          <div className="hint outline-soft">
            Tip: przytrzymaj <b>1s</b> 🗑️
          </div>
        </section>

        {toast && <div className="toast outline">{toast}</div>}
      </div>
    </div>
  );
}
