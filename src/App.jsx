import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * ====== USTAWIENIA / BALANS ======
 */
const LONG_PRESS_MS = 1000; // <- usuwanie po 1 sekundzie

const LEVEL_STEP = 100; // 100 EXP na level (prosto i czytelnie)
const DEFAULT_QUICK_ACTIONS = [
  { id: "qa_post", name: "Post", exp: 30, icon: "⏳" },
  { id: "qa_sing", name: "Śpiew", exp: 50, icon: "⏳" }
];

// Diminishing returns – ile razy w danym dniu ta sama aktywność, tym mniejszy EXP
function diminishingMultiplier(countAfterThis) {
  // countAfterThis = ile razy będzie wykonana po dodaniu (1,2,3...)
  if (countAfterThis <= 2) return 1.0;
  if (countAfterThis <= 5) return 0.7;
  if (countAfterThis <= 10) return 0.4;
  return 0.2;
}

// Rangi liczone z Rank Points (RP) – oddzielnie od Total EXP (level)
const RANKS = [
  { key: "bronze", name: "Bronze", minRP: 0 },
  { key: "silver", name: "Silver", minRP: 250 },
  { key: "gold", name: "Gold", minRP: 650 },
  { key: "platinum", name: "Platinum", minRP: 1200 },
  { key: "diamond", name: "Diamond", minRP: 2000 },
  { key: "master", name: "Master Tenor", minRP: 3200 }
];

// Spadek RP za brak aktywności – sensowny: mały “drift” w dół, ale nie kasuje wszystkiego
const DAILY_RP_DECAY = 0.06; // 6% RP dziennie bez aktywności (za każdy “brakujący” dzień)
const MIN_RP_FLOOR = 0; // nie spada poniżej 0

/**
 * ====== STORAGE ======
 */
const LS_KEY = "ptt_state_v1";

function todayKey(d = new Date()) {
  // lokalny dzień: YYYY-MM-DD
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function uid() {
  return Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

/**
 * ====== ErrorBoundary (żeby nie było “czarnego ekranu”) ======
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, message: err?.message || "Nieznany błąd" };
  }
  componentDidCatch(err) {
    // eslint-disable-next-line no-console
    console.error("App crashed:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="container">
          <div className="shell">
            <div className="card">
              <div className="stroke title">Ups… coś się wysypało 😵</div>
              <p className="notice">
                Zamiast czarnego ekranu masz ekran ratunkowy. Kliknij reset, a aplikacja wróci.
              </p>
              <div className="errorBox">
                <div className="small">Błąd:</div>
                <div style={{ fontWeight: 900 }}>{this.state.message}</div>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  className="btn"
                  onClick={() => {
                    localStorage.removeItem(LS_KEY);
                    location.reload();
                  }}
                >
                  RESET (wyczyść dane)
                </button>
                <button
                  className="btn btnSecondary"
                  onClick={() => location.reload()}
                >
                  Odśwież
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * ====== Long press hook ======
 */
function useLongPress({ onLongPress, onClick, ms = 1000 }) {
  const timerRef = useRef(null);
  const longPressedRef = useRef(false);

  function start(e) {
    longPressedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      onLongPress?.(e);
    }, ms);
  }

  function clear(e) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!longPressedRef.current) {
      onClick?.(e);
    }
  }

  return {
    onPointerDown: start,
    onPointerUp: clear,
    onPointerCancel: () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    },
    onPointerLeave: () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
}

/**
 * ====== APP ======
 */
function InnerApp() {
  const [activityName, setActivityName] = useState("");
  const [activityExp, setActivityExp] = useState("");

  // UI: które kafelki mają odsłonięty kosz
  const [revealDelete, setRevealDelete] = useState({ type: null, id: null });

  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      totalXP: 0,
      rankRP: 0,
      entries: [], // {id, name, baseExp, gainedExp, mult, dateKey, ts}
      quickActions: DEFAULT_QUICK_ACTIONS,
      dailyCounts: {}, // { [dateKey]: { [nameLower]: count } }
      lastSeenDay: todayKey(),
      createdAt: Date.now()
    };
  });

  // zapisywanie
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }, [state]);

  // wykrycie zmiany dnia + decay
  useEffect(() => {
    const tick = () => {
      const nowDay = todayKey();
      if (state.lastSeenDay !== nowDay) {
        const daysMissed = diffDaysLocal(state.lastSeenDay, nowDay);
        if (daysMissed > 0) {
          // jeśli minęły dni, a nie było aktywności – degraduj RP za każdy brakujący dzień
          setState((s) => {
            let rp = s.rankRP;
            for (let i = 0; i < daysMissed; i++) {
              rp = Math.max(MIN_RP_FLOOR, Math.floor(rp * (1 - DAILY_RP_DECAY)));
            }
            return { ...s, rankRP: rp, lastSeenDay: nowDay };
          });
        } else {
          setState((s) => ({ ...s, lastSeenDay: nowDay }));
        }
      }
    };
    tick();
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastSeenDay, state.rankRP]);

  // wyliczenia
  const level = useMemo(() => Math.floor(state.totalXP / LEVEL_STEP) + 1, [state.totalXP]);
  const levelBase = useMemo(() => (level - 1) * LEVEL_STEP, [level]);
  const levelProgressXP = useMemo(() => state.totalXP - levelBase, [state.totalXP, levelBase]);
  const nextLevelAt = useMemo(() => level * LEVEL_STEP, [level]);
  const toNext = useMemo(() => nextLevelAt - state.totalXP, [nextLevelAt, state.totalXP]);
  const progressPct = useMemo(() => clamp((levelProgressXP / LEVEL_STEP) * 100, 0, 100), [levelProgressXP]);

  const rank = useMemo(() => getRankFromRP(state.rankRP), [state.rankRP]);
  const rankNext = useMemo(() => getNextRank(rank), [rank]);
  const rpToNextRank = useMemo(() => {
    if (!rankNext) return 0;
    return Math.max(0, rankNext.minRP - state.rankRP);
  }, [rankNext, state.rankRP]);

  const today = todayKey();
  const todayEntries = useMemo(() => state.entries.filter((e) => e.dateKey === today), [state.entries, today]);
  const xpToday = useMemo(() => todayEntries.reduce((a, e) => a + e.gainedExp, 0), [todayEntries]);

  const last7 = useMemo(() => buildLast7Days(state.entries), [state.entries]);
  const topByXP = useMemo(() => computeTop(state.entries, "xp"), [state.entries]);
  const topByCount = useMemo(() => computeTop(state.entries, "count"), [state.entries]);

  function addEntry({ name, baseExp }) {
    const cleanName = (name || "").trim();
    const nExp = Number(baseExp);

    if (!cleanName) return;
    if (!Number.isFinite(nExp) || nExp <= 0) return;

    const dKey = todayKey();
    const key = cleanName.toLowerCase();

    // dzienny licznik
    const prev = state.dailyCounts?.[dKey]?.[key] || 0;
    const after = prev + 1;
    const mult = diminishingMultiplier(after);
    const gained = Math.max(1, Math.round(nExp * mult)); // minimum 1

    // RP = “motywacja” – też uwzględnia diminishing returns
    const gainedRP = Math.max(1, Math.round(gained * 0.6)); // RP rośnie wolniej niż EXP

    const entry = {
      id: uid(),
      name: cleanName,
      baseExp: nExp,
      gainedExp: gained,
      mult,
      dateKey: dKey,
      ts: Date.now()
    };

    setState((s) => ({
      ...s,
      totalXP: s.totalXP + gained,
      rankRP: s.rankRP + gainedRP,
      entries: [entry, ...s.entries],
      dailyCounts: {
        ...s.dailyCounts,
        [dKey]: {
          ...(s.dailyCounts?.[dKey] || {}),
          [key]: after
        }
      }
    }));

    // Dodaj do szybkich akcji automatycznie (jeśli nie istnieje)
    setState((s) => {
      const exists = s.quickActions.some((qa) => qa.name.toLowerCase() === key);
      if (exists) return s;
      const newQA = {
        id: "qa_" + uid(),
        name: cleanName,
        exp: nExp,
        icon: "⏳"
      };
      return { ...s, quickActions: [...s.quickActions, newQA] };
    });
  }

  function handleAddFromForm() {
    addEntry({ name: activityName, baseExp: activityExp });
    setActivityName("");
    setActivityExp("");
    setRevealDelete({ type: null, id: null });
  }

  function clickQuickAction(qa) {
    addEntry({ name: qa.name, baseExp: qa.exp });
    setRevealDelete({ type: null, id: null });
  }

  function removeEntry(id) {
    setState((s) => {
      const entry = s.entries.find((e) => e.id === id);
      if (!entry) return s;

      const newEntries = s.entries.filter((e) => e.id !== id);

      // cofamy XP i RP
      const gainedRP = Math.max(1, Math.round(entry.gainedExp * 0.6));
      const totalXP = Math.max(0, s.totalXP - entry.gainedExp);
      const rankRP = Math.max(0, s.rankRP - gainedRP);

      // licznik dzienny – zdejmujemy 1 (żeby multiplikatory “logicznie” się cofały)
      const dKey = entry.dateKey;
      const key = entry.name.toLowerCase();
      const dayObj = { ...(s.dailyCounts?.[dKey] || {}) };
      if (dayObj[key]) dayObj[key] = Math.max(0, dayObj[key] - 1);
      const dailyCounts = { ...s.dailyCounts, [dKey]: dayObj };

      return { ...s, entries: newEntries, totalXP, rankRP, dailyCounts };
    });
    setRevealDelete({ type: null, id: null });
  }

  function removeQuickAction(id) {
    setState((s) => ({ ...s, quickActions: s.quickActions.filter((q) => q.id !== id) }));
    setRevealDelete({ type: null, id: null });
  }

  function addQuickActionManually(name, exp) {
    const cleanName = (name || "").trim();
    const nExp = Number(exp);
    if (!cleanName) return;
    if (!Number.isFinite(nExp) || nExp <= 0) return;

    setState((s) => {
      const key = cleanName.toLowerCase();
      const exists = s.quickActions.some((qa) => qa.name.toLowerCase() === key);
      if (exists) return s;
      return {
        ...s,
        quickActions: [...s.quickActions, { id: "qa_" + uid(), name: cleanName, exp: nExp, icon: "⏳" }]
      };
    });
  }

  function clearAll() {
    localStorage.removeItem(LS_KEY);
    setState({
      totalXP: 0,
      rankRP: 0,
      entries: [],
      quickActions: DEFAULT_QUICK_ACTIONS,
      dailyCounts: {},
      lastSeenDay: todayKey(),
      createdAt: Date.now()
    });
    setRevealDelete({ type: null, id: null });
  }

  function downloadReportTxt() {
    const lines = [];
    lines.push("POWER TENOR TRACKER — RAPORT");
    lines.push(`Data: ${new Date().toLocaleString()}`);
    lines.push("");
    lines.push(`Total EXP: ${state.totalXP}`);
    lines.push(`Level: ${level}`);
    lines.push(`Do następnego levela: ${toNext} EXP`);
    lines.push("");
    lines.push(`Ranga: ${rank.name}`);
    lines.push(`Rank Points (RP): ${state.rankRP}`);
    if (rankNext) lines.push(`Do ${rankNext.name}: ${rpToNextRank} RP`);
    lines.push("");
    lines.push(`Wpisy dziś: ${todayEntries.length}`);
    lines.push(`EXP dziś: ${xpToday}`);
    lines.push("");
    lines.push("Ostatnie 7 dni (EXP):");
    last7.forEach((d) => lines.push(`- ${d.label}: ${d.value}`));
    lines.push("");
    lines.push("Top (EXP):");
    topByXP.slice(0, 5).forEach((t, i) => lines.push(`${i + 1}. ${t.name} — ${t.xp} EXP (${t.count}x)`));
    lines.push("");
    lines.push("Top (Ilość):");
    topByCount.slice(0, 5).forEach((t, i) => lines.push(`${i + 1}. ${t.name} — ${t.count}x (${t.xp} EXP)`));
    lines.push("");
    lines.push("Uwagi:");
    lines.push("- EXP maleje przy spamowaniu tej samej aktywności w danym dniu (anty-farm).");
    lines.push("- RP spada lekko za dni bez aktywności (system motywacyjny).");

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `power-tenor-raport_${todayKey()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // UI: formularz “dodaj quick action”
  const [qaName, setQaName] = useState("");
  const [qaExp, setQaExp] = useState("");

  // klik w tło chowa kosze
  function hideDelete() {
    setRevealDelete({ type: null, id: null });
  }

  return (
    <div className="container" onPointerDown={(e) => {
      // jeśli klik w “puste” tło – schowaj kosz; jeśli klik w przycisk/element – nie przeszkadzaj
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "button" || tag === "input" || tag === "svg" || tag === "path") return;
      // jeśli klik wewnątrz elementu z data-nokeep nie chowaj
      if (e.target?.closest?.("[data-keep]")) return;
      hideDelete();
    }}>
      <div className="shell">
        <div className="header">
          <div className="title stroke">Power Tenor Tracker</div>
          <p className="subtitle stroke">Wygląd jak gra RPG • EXP • levele • rangi</p>
        </div>

        <div className="grid">
          {/* LEWA */}
          <div className="card" data-keep>
            <div className="hudTop">
              <div className="badge">
                <span className="star" aria-hidden>⭐</span>
                <span className="stroke" style={{ fontWeight: 900, fontSize: 20 }}>LEVEL {level}</span>
              </div>

              <div className="hudRight">
                <div className="rankPill">
                  <div className="small">Ranga</div>
                  <div className="stroke" style={{ fontWeight: 900, fontSize: 18 }}>{rank.name}</div>
                  <div className="small">RP: {state.rankRP}{rankNext ? ` • do ${rankNext.name}: ${rpToNextRank}` : ""}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="stroke big">{levelProgressXP}/{LEVEL_STEP} EXP</div>
                  <div className="small">Do następnego: {toNext} EXP</div>
                </div>
              </div>
            </div>

            <div className="expBarWrap">
              <div className="expBar" aria-label="Pasek doświadczenia">
                <div className="expFill" style={{ width: `${progressPct}%` }} />
                <div className="expShine" />
              </div>
            </div>

            <div className="totalLine stroke">Total EXP: {state.totalXP}</div>

            <hr className="hr" />

            <div className="sectionTitle stroke">Dodaj EXP</div>

            <div className="formGrid">
              <input
                className="input"
                value={activityName}
                onChange={(e) => setActivityName(e.target.value)}
                placeholder="Nazwa aktywności (np. Ćwiczenie śpiewu)"
                inputMode="text"
              />
              <input
                className="input"
                value={activityExp}
                onChange={(e) => setActivityExp(e.target.value)}
                placeholder="EXP (np. 40)"
                inputMode="numeric"
              />
              <button className="btn stroke" onClick={handleAddFromForm}>+ DODAJ</button>
            </div>

            <hr className="hr" />

            <div className="flexBetween">
              <div className="sectionTitle stroke" style={{ margin: 0 }}>Szybkie akcje</div>
              <button className="btn btnSecondary stroke" onClick={clearAll}>Wyczyść wszystko</button>
            </div>

            <div className="chips" style={{ marginTop: 10 }}>
              {state.quickActions.map((qa) => {
                const isRevealed = revealDelete.type === "qa" && revealDelete.id === qa.id;

                const lp = useLongPress({
                  ms: LONG_PRESS_MS,
                  onClick: () => clickQuickAction(qa),
                  onLongPress: () => setRevealDelete({ type: "qa", id: qa.id })
                });

                return (
                  <div
                    key={qa.id}
                    className="chip"
                    {...lp}
                  >
                    <div className="chipLabel stroke">{qa.name} ({qa.exp})</div>
                    <div className="chipMeta">
                      <span aria-hidden>{qa.icon || "⏳"}</span>
                    </div>

                    {isRevealed && (
                      <div
                        className="trashBubble"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => removeQuickAction(qa.id)}
                        title="Usuń szybką akcję"
                      >
                        <span aria-hidden>🗑️</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 12 }} className="row">
              <input
                className="input"
                style={{ flex: 1, minWidth: 180 }}
                value={qaName}
                onChange={(e) => setQaName(e.target.value)}
                placeholder="Dodaj nową szybką akcję (nazwa)"
              />
              <input
                className="input"
                style={{ width: 160 }}
                value={qaExp}
                onChange={(e) => setQaExp(e.target.value)}
                placeholder="EXP"
                inputMode="numeric"
              />
              <button
                className="btn stroke"
                onClick={() => {
                  addQuickActionManually(qaName, qaExp);
                  setQaName("");
                  setQaExp("");
                }}
              >
                + DODAJ
              </button>
            </div>

            <hr className="hr" />

            <div className="sectionTitle stroke">Historia</div>
            {state.entries.length === 0 ? (
              <div className="notice stroke">Brak wpisów. Dodaj pierwszy EXP i wbijaj levele 😄</div>
            ) : (
              <div className="list">
                {state.entries.map((e) => {
                  const isRevealed = revealDelete.type === "entry" && revealDelete.id === e.id;

                  const lp = useLongPress({
                    ms: LONG_PRESS_MS,
                    onClick: () => {
                      // klik w wpis – nic nie robi (żeby nie było przypadkowych akcji)
                      setRevealDelete({ type: null, id: null });
                    },
                    onLongPress: () => setRevealDelete({ type: "entry", id: e.id })
                  });

                  return (
                    <div key={e.id} className="item" {...lp}>
                      <div className="itemLeft">
                        <div className="itemName stroke">{e.name}</div>
                        <div className="itemSub">
                          {e.dateKey} • baza {e.baseExp} • mnożnik {Math.round(e.mult * 100)}%
                        </div>
                      </div>
                      <div className="itemRight">
                        <div className="itemExp stroke">+{e.gainedExp} EXP</div>
                        <div className="itemSub">{new Date(e.ts).toLocaleTimeString()}</div>
                      </div>

                      {isRevealed && (
                        <div
                          className="trashBubble"
                          onPointerDown={(ev) => ev.stopPropagation()}
                          onClick={() => removeEntry(e.id)}
                          title="Usuń wpis"
                        >
                          <span aria-hidden>🗑️</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* PRAWA */}
          <div className="card" data-keep>
            <div className="flexBetween">
              <div className="sectionTitle stroke" style={{ margin: 0 }}>Raport</div>
              <button className="btn btnSecondary stroke" onClick={downloadReportTxt}>
                🎮 STATY
              </button>
            </div>

            <div className="reportGrid" style={{ marginTop: 10 }}>
              <div className="statBox">
                <div className="statLabel stroke">Wpisy</div>
                <div className="statValue stroke">{state.entries.length}</div>
              </div>
              <div className="statBox">
                <div className="statLabel stroke">EXP dziś</div>
                <div className="statValue stroke">{xpToday}</div>
              </div>
              <div className="statBox">
                <div className="statLabel stroke">Level</div>
                <div className="statValue stroke">{level}</div>
              </div>
              <div className="statBox">
                <div className="statLabel stroke">Do następnego</div>
                <div className="statValue stroke">{toNext} EXP</div>
              </div>
            </div>

            <div className="chart">
              <div className="stroke" style={{ fontWeight: 900, marginBottom: 8 }}>Ostatnie 7 dni</div>
              <MiniLineChart data={last7} />
            </div>

            <div className="topGrid">
              <div className="statBox">
                <div className="stroke" style={{ fontWeight: 900, marginBottom: 8 }}>Top (EXP)</div>
                {topByXP.length === 0 ? (
                  <div className="notice stroke">Brak danych</div>
                ) : (
                  <TopList items={topByXP.slice(0, 6)} mode="xp" />
                )}
              </div>
              <div className="statBox">
                <div className="stroke" style={{ fontWeight: 900, marginBottom: 8 }}>Top (ilość)</div>
                {topByCount.length === 0 ? (
                  <div className="notice stroke">Brak danych</div>
                ) : (
                  <TopList items={topByCount.slice(0, 6)} mode="count" />
                )}
              </div>
            </div>

            <div style={{ marginTop: 12 }} className="notice stroke">
              Anty-farm: powtarzanie tej samej czynności w ciągu dnia daje mniej EXP. <br />
              Motywacja: brak aktywności → RP spada lekko (ranga może spaść).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <InnerApp />
    </ErrorBoundary>
  );
}

/**
 * ====== POMOCNICZE FUNKCJE ======
 */
function getRankFromRP(rp) {
  let current = RANKS[0];
  for (const r of RANKS) {
    if (rp >= r.minRP) current = r;
  }
  return current;
}
function getNextRank(currentRank) {
  const idx = RANKS.findIndex((r) => r.key === currentRank.key);
  if (idx < 0) return null;
  return RANKS[idx + 1] || null;
}

function diffDaysLocal(fromDay, toDay) {
  // fromDay/toDay: YYYY-MM-DD
  const [fy, fm, fd] = fromDay.split("-").map(Number);
  const [ty, tm, td] = toDay.split("-").map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function buildLast7Days(entries) {
  const out = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = todayKey(d);
    const label = key.slice(5); // MM-DD
    const value = entries
      .filter((e) => e.dateKey === key)
      .reduce((a, e) => a + e.gainedExp, 0);
    out.push({ key, label, value });
  }
  return out;
}

function computeTop(entries, mode) {
  const map = new Map();
  for (const e of entries) {
    const k = e.name;
    const cur = map.get(k) || { name: k, xp: 0, count: 0 };
    cur.xp += e.gainedExp;
    cur.count += 1;
    map.set(k, cur);
  }
  const arr = Array.from(map.values());
  if (mode === "count") arr.sort((a, b) => b.count - a.count || b.xp - a.xp);
  else arr.sort((a, b) => b.xp - a.xp || b.count - a.count);
  return arr;
}

/**
 * ====== MiniLineChart (SVG, bez bibliotek) ======
 */
function MiniLineChart({ data }) {
  const w = 520;
  const h = 140;
  const pad = 18;

  const maxV = Math.max(1, ...data.map((d) => d.value));
  const pts = data.map((d, i) => {
    const x = pad + (i * (w - pad * 2)) / (data.length - 1);
    const y = pad + (1 - d.value / maxV) * (h - pad * 2);
    return { x, y, v: d.value, label: d.label };
  });

  const dPath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="auto" aria-label="Wykres 7 dni">
      {/* grid */}
      <path d={`M ${pad} ${h - pad} H ${w - pad}`} stroke="rgba(255,255,255,.18)" strokeWidth="2" fill="none" />
      <path d={`M ${pad} ${pad} V ${h - pad}`} stroke="rgba(255,255,255,.10)" strokeWidth="2" fill="none" />

      {/* line */}
      <path d={dPath} stroke="rgba(255,255,255,.92)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={dPath} stroke="rgba(255,43,214,.55)" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".35" />

      {/* points */}
      {pts.map((p, idx) => (
        <g key={idx}>
          <circle cx={p.x} cy={p.y} r="6" fill="rgba(25,211,255,.9)" />
          <circle cx={p.x} cy={p.y} r="10" fill="rgba(25,211,255,.25)" />
          <text x={p.x} y={h - 6} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,.85)" style={{ fontWeight: 900 }}>
            {p.label}
          </text>
        </g>
      ))}

      <text x={pad} y={14} fontSize="12" fill="rgba(255,255,255,.70)" style={{ fontWeight: 900 }}>
        max: {maxV}
      </text>
    </svg>
  );
}

function TopList({ items, mode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((t, i) => (
        <div key={t.name} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div className="stroke" style={{ fontWeight: 900 }}>
            {i + 1}. {t.name}
          </div>
          <div className="stroke" style={{ fontWeight: 900, opacity: .95 }}>
            {mode === "count" ? `${t.count}x` : `${t.xp} EXP`}
          </div>
        </div>
      ))}
    </div>
  );
}
