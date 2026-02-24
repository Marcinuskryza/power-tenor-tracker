import React, { useMemo, useState } from "react";

/**
 * Konfiguracja leveli:
 * - MAX_LEVEL: 100 (zmień na 20, jeśli chcesz)
 * - Formuła rośnie stopniowo (quadratic), żeby kolejne levele wymagały więcej XP.
 */
const MAX_LEVEL = 100;

// XP potrzebny, żeby wejść na dany level (prog total XP)
// Level 1 starts at 0.
function xpThresholdForLevel(level) {
  if (level <= 1) return 0;
  const n = level - 1; // 1..99
  return Math.floor(250 * n + 35 * n * n);
}

function computeLevelFromXp(totalXp) {
  let level = 1;
  for (let l = 2; l <= MAX_LEVEL; l++) {
    if (totalXp >= xpThresholdForLevel(l)) level = l;
    else break;
  }
  return level;
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

const LS_KEY = "powerTenorTracker_v2";

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function todayISO(date = new Date()) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function fmtDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString("pl-PL");
}

function fmtPLN(amount) {
  const n = Number(amount) || 0;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${abs.toFixed(2)} zł`;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

const DEFAULT_ACTIVITIES = [
  { id: "post_perf", name: "Publikacja performance video", xp: 150 },
  { id: "casting_apply", name: "Zgłoszenie castingowe", xp: 100 },
  { id: "selftape", name: "Selftape / nagranie pod casting", xp: 500 },
  { id: "casting_live", name: "Casting na żywo", xp: 1000 },
  { id: "paid_gig", name: "Płatne granie / koncert", xp: 800 },
  { id: "commercial_booked", name: "Zgarnięta reklama", xp: 3000 }
];

const DEFAULT_MONEY_CATEGORIES = [
  { id: "concert", name: "Koncert / granie" },
  { id: "commercial", name: "Reklama / aktorstwo" },
  { id: "travel", name: "Paliwo / dojazd" },
  { id: "food", name: "Jedzenie" },
  { id: "gear", name: "Sprzęt" },
  { id: "other", name: "Inne" }
];

export default function App() {
  const initial = useMemo(() => {
    const loaded = loadState();
    if (loaded) return loaded;
    return {
      activities: DEFAULT_ACTIVITIES,
      log: [], // XP log: {ts, dateISO, activityId, name, xp}
      money: [], // Gold log: {ts, dateISO, categoryId, categoryName, note, amount}
      moneyCategories: DEFAULT_MONEY_CATEGORIES,
      settings: {
        seasonName: "POWER TENOR – SEASON 1",
        maxLevel: MAX_LEVEL,
        monthlySurvivalTargetPLN: 3000
      }
    };
  }, []);

  const [state, setState] = useState(initial);
  const [tab, setTab] = useState("today"); // today | add | gold | report | log

  // Add activity form
  const [newName, setNewName] = useState("");
  const [newXp, setNewXp] = useState(50);

  // Gold form
  const [moneyAmount, setMoneyAmount] = useState("");
  const [moneyNote, setMoneyNote] = useState("");
  const [moneyCat, setMoneyCat] = useState("concert");

  const totalXp = useMemo(
    () => state.log.reduce((sum, e) => sum + (Number(e.xp) || 0), 0),
    [state.log]
  );

  const level = useMemo(() => computeLevelFromXp(totalXp), [totalXp]);

  const nextLevel = Math.min(level + 1, state.settings.maxLevel);
  const curThreshold = xpThresholdForLevel(level);
  const nextThreshold = xpThresholdForLevel(nextLevel);
  const intoLevel = totalXp - curThreshold;
  const needed = Math.max(0, nextThreshold - curThreshold);
  const pct = needed > 0 ? clamp((intoLevel / needed) * 100, 0, 100) : 100;

  const today = todayISO();

  const todayLog = useMemo(
    () => state.log.filter((e) => e.dateISO === today),
    [state.log, today]
  );

  const todayXp = useMemo(
    () => todayLog.reduce((s, e) => s + (Number(e.xp) || 0), 0),
    [todayLog]
  );

  const todayMoney = useMemo(
    () => state.money.filter((m) => m.dateISO === today),
    [state.money, today]
  );

  const todayNetPLN = useMemo(
    () => todayMoney.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [todayMoney]
  );

  const monthPrefix = today.slice(0, 7); // YYYY-MM
  const monthMoney = useMemo(
    () => state.money.filter((m) => m.dateISO.startsWith(monthPrefix)),
    [state.money, monthPrefix]
  );

  const monthNetPLN = useMemo(
    () => monthMoney.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [monthMoney]
  );

  function commit(next) {
    setState(next);
    saveState(next);
  }

  // XP actions
  function addEntry(activity) {
    const entry = {
      ts: Date.now(),
      dateISO: todayISO(),
      activityId: activity.id,
      name: activity.name,
      xp: activity.xp
    };
    commit({ ...state, log: [entry, ...state.log] });
  }

  function removeXpEntry(ts) {
    commit({ ...state, log: state.log.filter((e) => e.ts !== ts) });
  }

  // Add custom activity
  function addActivity() {
    const name = newName.trim();
    const xp = Number(newXp);
    if (!name || !Number.isFinite(xp) || xp <= 0) return;

    const id = `custom_${Math.random().toString(16).slice(2)}`;
    const next = {
      ...state,
      activities: [{ id, name, xp }, ...state.activities]
    };
    commit(next);
    setNewName("");
    setNewXp(50);
    setTab("today");
  }

  function deleteActivity(id) {
    const next = {
      ...state,
      activities: state.activities.filter((a) => a.id !== id)
    };
    commit(next);
  }

  // GOLD actions
  function addMoneyEntry() {
    const amount = Number(String(moneyAmount).replace(",", "."));
    if (!Number.isFinite(amount) || amount === 0) return;

    const cat = state.moneyCategories.find((c) => c.id === moneyCat) || state.moneyCategories[0];
    const entry = {
      ts: Date.now(),
      dateISO: todayISO(),
      categoryId: cat.id,
      categoryName: cat.name,
      note: moneyNote.trim(),
      amount
    };

    commit({ ...state, money: [entry, ...state.money] });
    setMoneyAmount("");
    setMoneyNote("");
  }

  function removeMoneyEntry(ts) {
    commit({ ...state, money: state.money.filter((e) => e.ts !== ts) });
  }

  // REPORT
  function buildReport({ days = 7 } = {}) {
    const cutoff = startOfDay(daysAgo(days - 1));

    const xpEntries = state.log
      .filter((e) => new Date(e.ts) >= cutoff)
      .sort((a, b) => a.ts - b.ts);

    const moneyEntries = state.money
      .filter((e) => new Date(e.ts) >= cutoff)
      .sort((a, b) => a.ts - b.ts);

    const xpSum = xpEntries.reduce((s, e) => s + (Number(e.xp) || 0), 0);
    const netPLN = moneyEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const byDayXp = new Map();
    const byDayMoney = new Map();
    const byAct = new Map();
    const byCat = new Map();

    for (const e of xpEntries) {
      byDayXp.set(e.dateISO, (byDayXp.get(e.dateISO) || 0) + e.xp);
      byAct.set(e.name, (byAct.get(e.name) || 0) + e.xp);
    }

    for (const e of moneyEntries) {
      byDayMoney.set(e.dateISO, (byDayMoney.get(e.dateISO) || 0) + e.amount);
      byCat.set(e.categoryName, (byCat.get(e.categoryName) || 0) + e.amount);
    }

    const lines = [];
    lines.push(`${state.settings.seasonName} – RAPORT (${days} dni)`);
    lines.push(`Wygenerowano: ${new Date().toLocaleString("pl-PL")}`);
    lines.push("");

    lines.push(`TOTAL XP: ${totalXp}`);
    lines.push(`LEVEL: ${level}/${state.settings.maxLevel}`);
    lines.push(
      `Postęp do następnego levelu: ${intoLevel}/${needed} XP (${pct.toFixed(1)}%)`
    );
    lines.push(`XP w ostatnich ${days} dniach: ${xpSum}`);
    lines.push("");

    lines.push(`GOLD (PLN) netto w ostatnich ${days} dniach: ${fmtPLN(netPLN)}`);
    lines.push(`GOLD (PLN) netto w tym miesiącu (${monthPrefix}): ${fmtPLN(monthNetPLN)}`);
    lines.push(
      `Cel przetrwania miesięczny: ${fmtPLN(state.settings.monthlySurvivalTargetPLN)}`
    );
    lines.push(
      `Status: ${monthNetPLN >= state.settings.monthlySurvivalTargetPLN ? "✅ OK" : "⚠️ poniżej celu"}`
    );
    lines.push("");

    lines.push("XP per dzień:");
    const daysSortedXp = Array.from(byDayXp.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [d, x] of daysSortedXp) lines.push(`- ${d}: ${x} XP`);

    lines.push("");
    lines.push("GOLD netto per dzień:");
    const daysSortedMoney = Array.from(byDayMoney.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [d, amt] of daysSortedMoney) lines.push(`- ${d}: ${fmtPLN(amt)}`);

    lines.push("");
    lines.push("Top aktywności (wg XP):");
    const actSorted = Array.from(byAct.entries()).sort((a, b) => b[1] - a[1]);
    for (const [name, x] of actSorted) lines.push(`- ${name}: ${x} XP`);

    lines.push("");
    lines.push("Kategorie GOLD (netto):");
    const catSorted = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]);
    for (const [name, amt] of catSorted) lines.push(`- ${name}: ${fmtPLN(amt)}`);

    lines.push("");
    lines.push("Ostatnie wpisy XP (10):");
    const lastXp = state.log.slice(0, 10).reverse();
    for (const e of lastXp) lines.push(`- ${fmtDateTime(e.ts)} | ${e.name} (+${e.xp})`);

    lines.push("");
    lines.push("Ostatnie wpisy GOLD (10):");
    const lastMoney = state.money.slice(0, 10).reverse();
    for (const e of lastMoney) {
      const note = e.note ? ` — ${e.note}` : "";
      lines.push(`- ${fmtDateTime(e.ts)} | ${e.categoryName}: ${fmtPLN(e.amount)}${note}`);
    }

    return lines.join("\n");
  }

  function downloadReport(days) {
    const text = buildReport({ days });
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `power-tenor-report-${days}d-${todayISO()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copyReport(days) {
    const text = buildReport({ days });
    try {
      await navigator.clipboard.writeText(text);
      alert("Skopiowano raport do schowka ✅");
    } catch {
      alert("Nie udało się skopiować (przeglądarka). Pobierz jako plik.");
    }
  }

  function resetAll() {
    if (!confirm("Na pewno? To usunie wszystkie dane z przeglądarki.")) return;
    localStorage.removeItem(LS_KEY);
    const next = {
      activities: DEFAULT_ACTIVITIES,
      log: [],
      money: [],
      moneyCategories: DEFAULT_MONEY_CATEGORIES,
      settings: {
        seasonName: "POWER TENOR – SEASON 1",
        maxLevel: MAX_LEVEL,
        monthlySurvivalTargetPLN: 3000
      }
    };
    setState(next);
    saveState(next);
  }

  const todayNetClass = todayNetPLN >= 0 ? "moneyPos" : "moneyNeg";
  const monthNetClass = monthNetPLN >= 0 ? "moneyPos" : "moneyNeg";

  return (
    <div className="container">
      <div className="card">
        <h1>{state.settings.seasonName}</h1>

        <div className="row">
          <div className="col">
            <div className="kpi">Total XP</div>
            <div className="big">{totalXp}</div>
          </div>
          <div className="col">
            <div className="kpi">Level</div>
            <div className="big">
              {level}/{state.settings.maxLevel}
            </div>
          </div>
          <div className="col">
            <div className="kpi">Dzisiaj</div>
            <div className="big">{todayXp} XP</div>
            <div className={`small ${todayNetClass}`}>Netto: {fmtPLN(todayNetPLN)}</div>
          </div>
          <div className="col">
            <div className="kpi">Ten miesiąc</div>
            <div className={`big ${monthNetClass}`}>{fmtPLN(monthNetPLN)}</div>
            <div className="small">
              Cel: {fmtPLN(state.settings.monthlySurvivalTargetPLN)} •{" "}
              {monthNetPLN >= state.settings.monthlySurvivalTargetPLN ? "✅ OK" : "⚠️ poniżej celu"}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="kpi">
            Postęp do Level {Math.min(level + 1, state.settings.maxLevel)}: {intoLevel}/{needed} XP ({pct.toFixed(1)}%)
          </div>
          <div className="progressOuter" aria-label="progress">
            <div className="progressInner" style={{ width: `${pct}%` }} />
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            Progi: L{level} = {curThreshold} XP • L{Math.min(level + 1, state.settings.maxLevel)} = {nextThreshold} XP
          </div>
        </div>

        <div className="tabs">
          <button className={`tabbtn ${tab === "today" ? "active" : ""}`} onClick={() => setTab("today")}>
            Dziś
          </button>
          <button className={`tabbtn ${tab === "gold" ? "active" : ""}`} onClick={() => setTab("gold")}>
            Gold (PLN)
          </button>
          <button className={`tabbtn ${tab === "add" ? "active" : ""}`} onClick={() => setTab("add")}>
            Dodaj czynność
          </button>
          <button className={`tabbtn ${tab === "report" ? "active" : ""}`} onClick={() => setTab("report")}>
            Raport
          </button>
          <button className={`tabbtn ${tab === "log" ? "active" : ""}`} onClick={() => setTab("log")}>
            Dziennik
          </button>
        </div>

        {tab === "today" && (
          <>
            <h2>Kliknij wykonane questy</h2>
            <div className="list">
              {state.activities.map((a) => (
                <div className="item" key={a.id}>
                  <div className="itemLeft">
                    <div style={{ fontWeight: 650 }}>{a.name}</div>
                    <div className="small">+{a.xp} XP</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button className="btn primary" onClick={() => addEntry(a)}>
                      Zrobione
                    </button>
                    {a.id.startsWith("custom_") && (
                      <button className="btn danger" onClick={() => deleteActivity(a.id)}>
                        Usuń
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <hr />

            <h2>Dzisiaj – XP</h2>
            <div className="list">
              {todayLog.slice(0, 8).map((e) => (
                <div className="item" key={e.ts}>
                  <div className="itemLeft">
                    <div style={{ fontWeight: 650 }}>{e.name}</div>
                    <div className="small">{fmtDateTime(e.ts)} • +{e.xp} XP</div>
                  </div>
                  <button className="btn danger" onClick={() => removeXpEntry(e.ts)}>
                    Cofnij
                  </button>
                </div>
              ))}
              {todayLog.length === 0 && <div className="small">Brak wpisów XP dzisiaj.</div>}
            </div>

            <hr />

            <h2>Dzisiaj – GOLD</h2>
            <div className="list">
              {todayMoney.slice(0, 8).map((e) => (
                <div className="item" key={e.ts}>
                  <div className="itemLeft">
                    <div style={{ fontWeight: 650 }}>
                      {e.categoryName} •{" "}
                      <span className={e.amount >= 0 ? "moneyPos" : "moneyNeg"}>
                        {fmtPLN(e.amount)}
                      </span>
                    </div>
                    <div className="small">
                      {fmtDateTime(e.ts)}
                      {e.note ? ` • ${e.note}` : ""}
                    </div>
                  </div>
                  <button className="btn danger" onClick={() => removeMoneyEntry(e.ts)}>
                    Usuń
                  </button>
                </div>
              ))}
              {todayMoney.length === 0 && <div className="small">Brak wpisów GOLD dzisiaj.</div>}
            </div>
          </>
        )}

        {tab === "gold" && (
          <>
            <h2>Dodaj wpis GOLD (PLN)</h2>
            <div className="small" style={{ marginBottom: 8 }}>
              Wpisuj <b>netto</b> (może być na minusie). Przykład: koncert kosztował Cię 300 zł → wpisz <b>-300</b>.
            </div>

            <div className="row">
              <div className="col">
                <label>Kategoria</label>
                <select value={moneyCat} onChange={(e) => setMoneyCat(e.target.value)}>
                  {state.moneyCategories.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col">
                <label>Kwota (PLN)</label>
                <input
                  value={moneyAmount}
                  onChange={(e) => setMoneyAmount(e.target.value)}
                  placeholder="np. 8000 albo -300"
                />
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <label>Notatka (opcjonalnie)</label>
              <input
                value={moneyNote}
                onChange={(e) => setMoneyNote(e.target.value)}
                placeholder="np. paliwo + parking / gaża / nocleg"
              />
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button className="btn primary" onClick={addMoneyEntry}>
                Dodaj wpis
              </button>
              <button className="btn" onClick={() => setTab("today")}>
                Wróć
              </button>
            </div>

            <hr />

            <h2>Ten miesiąc – podgląd</h2>
            <div className={`big ${monthNetClass}`}>{fmtPLN(monthNetPLN)}</div>
            <div className="small">
              Cel: {fmtPLN(state.settings.monthlySurvivalTargetPLN)} •{" "}
              {monthNetPLN >= state.settings.monthlySurvivalTargetPLN ? "✅ OK" : "⚠️ poniżej celu"}
            </div>

            <div className="small" style={{ marginTop: 10 }}>
              Tip: jeśli chcesz mierzyć „czy dokładanie do koncertów maleje”, trzymaj koszty w kategoriach typu
              „Paliwo / dojazd” i przychód w „Koncert / granie”. Raport pokaże sumy per kategoria.
            </div>
          </>
        )}

        {tab === "add" && (
          <>
            <h2>Dodaj nową czynność (XP)</h2>
            <div className="row">
              <div className="col">
                <label>Nazwa czynności</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="np. Backstage video z koncertu"
                />
              </div>
              <div className="col">
                <label>XP</label>
                <input type="number" value={newXp} onChange={(e) => setNewXp(e.target.value)} min={1} />
              </div>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button className="btn primary" onClick={addActivity}>
                Dodaj
              </button>
              <button className="btn" onClick={() => setTab("today")}>
                Anuluj
              </button>
            </div>

            <hr />
            <div className="small">
              Tip: dodawaj czynności „input-based” (publikacja, zgłoszenie, selftape). Wyniki typu „dostałem rolę”
              traktuj jako bonus.
            </div>
          </>
        )}

        {tab === "report" && (
          <>
            <h2>Raport tekstowy (XP + GOLD)</h2>
            <div className="row">
              <div className="col">
                <button className="btn" onClick={() => copyReport(7)}>
                  Kopiuj raport 7 dni
                </button>
              </div>
              <div className="col">
                <button className="btn" onClick={() => downloadReport(7)}>
                  Pobierz .txt (7 dni)
                </button>
              </div>
              <div className="col">
                <button className="btn" onClick={() => copyReport(30)}>
                  Kopiuj raport 30 dni
                </button>
              </div>
              <div className="col">
                <button className="btn" onClick={() => downloadReport(30)}>
                  Pobierz .txt (30 dni)
                </button>
              </div>
            </div>

            <hr />
            <label>Podgląd (7 dni)</label>
            <textarea rows={18} readOnly value={buildReport({ days: 7 })} />
          </>
        )}

        {tab === "log" && (
          <>
            <h2>Dziennik XP (ostatnie 50)</h2>
            <div className="list">
              {state.log.slice(0, 50).map((e) => (
                <div className="item" key={e.ts}>
                  <div className="itemLeft">
                    <div style={{ fontWeight: 650 }}>{e.name}</div>
                    <div className="small">{fmtDateTime(e.ts)} • {e.dateISO} • +{e.xp} XP</div>
                  </div>
                  <button className="btn danger" onClick={() => removeXpEntry(e.ts)}>
                    Usuń
                  </button>
                </div>
              ))}
              {state.log.length === 0 && <div className="small">Brak wpisów XP.</div>}
            </div>

            <hr />

            <h2>Dziennik GOLD (ostatnie 50)</h2>
            <div className="list">
              {state.money.slice(0, 50).map((e) => (
                <div className="item" key={e.ts}>
                  <div className="itemLeft">
                    <div style={{ fontWeight: 650 }}>
                      {e.categoryName} •{" "}
                      <span className={e.amount >= 0 ? "moneyPos" : "moneyNeg"}>
                        {fmtPLN(e.amount)}
                      </span>
                    </div>
                    <div className="small">
                      {fmtDateTime(e.ts)} • {e.dateISO}
                      {e.note ? ` • ${e.note}` : ""}
                    </div>
                  </div>
                  <button className="btn danger" onClick={() => removeMoneyEntry(e.ts)}>
                    Usuń
                  </button>
                </div>
              ))}
              {state.money.length === 0 && <div className="small">Brak wpisów GOLD.</div>}
            </div>

            <hr />
            <button className="btn danger" onClick={resetAll}>
              Reset (usuń dane lokalne)
            </button>
          </>
        )}
      </div>
    </div>
  );
}