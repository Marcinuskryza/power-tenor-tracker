import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * ====== USTAWIENIA / BALANS ======
 */
const LONG_PRESS_MS = 1000;

// RPG curve: koszt wbicia KOLEJNEGO levela (dla aktualnego lvl)
function expNeedForLevel(lvl) {
  // lvl >= 1
  return Math.round(120 + 8 * lvl * lvl);
}

const DEFAULT_QUICK_ACTIONS = [
  { id: "qa_post", name: "Post", exp: 30, icon: "⏳" },
  { id: "qa_sing", name: "Śpiew", exp: 50, icon: "⏳" }
];

function diminishingMultiplier(countAfterThis) {
  if (countAfterThis <= 2) return 1.0;
  if (countAfterThis <= 5) return 0.7;
  if (countAfterThis <= 10) return 0.4;
  return 0.2;
}

const RANKS = [
  { key: "bronze", name: "Bronze", minRP: 0 },
  { key: "silver", name: "Silver", minRP: 250 },
  { key: "gold", name: "Gold", minRP: 650 },
  { key: "platinum", name: "Platinum", minRP: 1200 },
  { key: "diamond", name: "Diamond", minRP: 2000 },
  { key: "master", name: "Master Vocal", minRP: 3200 }
];

const DAILY_RP_DECAY = 0.06; // 6% dziennie bez aktywności
const MIN_RP_FLOOR = 0;

const LS_KEY = "ptt_state_v1";

function todayKey(d = new Date()) {
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
 * ====== Level calc (RPG)
 * totalXP -> odejmuj koszt lvl1, lvl2, ... aż zabraknie.
 */
function computeLevelProgress(totalXP) {
  let xp = Math.max(0, Number(totalXP) || 0);
  let lvl = 1;

  for (let guard = 0; guard < 10000; guard++) {
    const need = expNeedForLevel(lvl);
    if (xp >= need) {
      xp -= need;
      lvl += 1;
      continue;
    }
    const toNext = need - xp;
    const pct = clamp((xp / need) * 100, 0, 100);
    return { level: lvl, need, into: xp, toNext, pct };
  }

  const need = expNeedForLevel(lvl);
  return { level: lvl, need, into: 0, toNext: need, pct: 0 };
}

/**
 * ====== NORMALIZACJA / MIGRACJA STANU ======
 */
function normalizeState(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const totalXP = Number(obj.totalXP);
  const rankRP = Number(obj.rankRP);

  return {
    totalXP: Number.isFinite(totalXP) ? totalXP : 0,
    rankRP: Number.isFinite(rankRP) ? rankRP : 0,
    entries: Array.isArray(obj.entries) ? obj.entries : [],
    quickActions: Array.isArray(obj.quickActions) && obj.quickActions.length > 0 ? obj.quickActions : DEFAULT_QUICK_ACTIONS,
    dailyCounts: obj.dailyCounts && typeof obj.dailyCounts === "object" ? obj.dailyCounts : {},
    lastSeenDay: typeof obj.lastSeenDay === "string" ? obj.lastSeenDay : todayKey(),
    createdAt: Number.isFinite(Number(obj.createdAt)) ? obj.createdAt : Date.now()
  };
}

/**
 * ====== ErrorBoundary ======
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
    console.error("App crashed:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="container">
          <div className="shell">
            <div className="card">
              <div className="stroke title">Ups… coś się wysypało 😵</div>
              <p className="notice">Kliknij reset, żeby wrócić do działania (czyści dane lokalne).</p>
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
                <button className="btn btnSecondary" onClick={() => location.reload()}>
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
 * ====== KOMPONENTY ======
 */
function QuickActionChip({ qa, isRevealed, onClick, onRevealDelete, onDelete }) {
  const lp = useLongPress({
    ms: LONG_PRESS_MS,
    onClick: () => onClick(qa),
    onLongPress: () => onRevealDelete(qa.id)
  });

  return (
    <div className="chip" {...lp}>
      <div className="chipLabel stroke">
        {qa.name} ({qa.exp})
      </div>
      <div className="chipMeta">
        <span aria-hidden>{qa.icon || "⏳"}</span>
      </div>

      {isRevealed && (
        <div
          className="trashBubble"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(qa.id)}
          title="Usuń szybką akcję"
        >
          <span aria-hidden>🗑️</span>
        </div>
      )}
    </div>
  );
}

function EntryItem({ entry, isRevealed, onRevealDelete, onDelete, onTap }) {
  const lp = useLongPress({
    ms: LONG_PRESS_MS,
    onClick: onTap,
    onLongPress: () => onRevealDelete(entry.id)
  });

  return (
    <div className="item" {...lp}>
      <div className="itemLeft">
        <div className="itemName stroke">{entry.name}</div>
        <div className="itemSub">
          {entry.dateKey} • baza {entry.baseExp} • mnożnik {Math.round(entry.mult * 100)}%
        </div>
      </div>
      <div className="itemRight">
        <div className="itemExp stroke">+{entry.gainedExp} EXP</div>
        <div className="itemSub">{new Date(entry.ts).toLocaleTimeString()}</div>
      </div>

      {isRevealed && (
        <div
          className="trashBubble"
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={() => onDelete(entry.id)}
          title="Usuń wpis"
        >
          <span aria-hidden>🗑️</span>
        </div>
      )}
    </div>
  );
}

/**
 * ====== APP ======
 */
function InnerApp() {
  const [activityName, setActivityName] = useState("");
  const [activityExp, setActivityExp] = useState("");
  const [qaName, setQaName] = useState("");
  const [qaExp, setQaExp] = useState("");

  const [revealDelete, setRevealDelete] = useState({ type: null, id: null });

  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return normalizeState(JSON.parse(raw));
    } catch (e) {
      console.warn("Nie udało się wczytać stanu z localStorage:", e);
    }
    return normalizeState(null);
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(normalizeState(state)));
    } catch (e) {
      console.warn("Nie udało się zapisać stanu do localStorage:", e);
    }
  }, [state]);

  // dzień + decay RP
  useEffect(() => {
    const tick = () => {
      const nowDay = todayKey();
      if (state.lastSeenDay !== nowDay) {
        const daysMissed = diffDaysLocal(state.lastSeenDay, nowDay);
        if (daysMissed > 0) {
          setState((prev) => {
            const s = normalizeState(prev);
            let rp = s.rankRP;
            for (let i = 0; i < daysMissed; i++) {
              rp = Math.max(MIN_RP_FLOOR, Math.floor(rp * (1 - DAILY_RP_DECAY)));
            }
            return { ...s, rankRP: rp, lastSeenDay: nowDay };
          });
        } else {
          setState((prev) => ({ ...normalizeState(prev), lastSeenDay: nowDay }));
        }
      }
    };
    tick();
    const id = setInterval(tick, 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastSeenDay, state.rankRP]);

  // ====== Level info (RPG) ======
  const levelInfo = useMemo(() => computeLevelProgress(state.totalXP), [state.totalXP]);
  const level = levelInfo.level;
  const levelProgressXP = levelInfo.into;
  const needThisLevel = levelInfo.need;
  const toNext = levelInfo.toNext;
  const progressPct = levelInfo.pct;

  const rank = useMemo(() => getRankFromRP(state.rankRP), [state.rankRP]);
  const rankNext = useMemo(() => getNextRank(rank), [rank]);
  const rpToNextRank = useMemo(() => {
    if (!rankNext) return 0;
    return Math.max(0, rankNext.minRP - state.rankRP);
  }, [rankNext, state.rankRP]);

  const today = todayKey();
  const entriesArr = Array.isArray(state.entries) ? state.entries : [];
  const todayEntries = useMemo(() => entriesArr.filter((e) => e.dateKey === today), [entriesArr, today]);
  const xpToday = useMemo(() => todayEntries.reduce((a, e) => a + (Number(e.gainedExp) || 0), 0), [todayEntries]);

  const last7 = useMemo(() => buildLast7Days(entriesArr), [entriesArr]);
  const topByXP = useMemo(() => computeTop(entriesArr, "xp"), [entriesArr]);
  const topByCount = useMemo(() => computeTop(entriesArr, "count"), [entriesArr]);

  function addEntry({ name, baseExp }) {
    const cleanName = (name || "").trim();
    const nExp = Number(baseExp);
    if (!cleanName) return;
    if (!Number.isFinite(nExp) || nExp <= 0) return;

    const dKey = todayKey();
    const key = cleanName.toLowerCase();

    setState((prev) => {
      const s = normalizeState(prev);

      const prevCount = s.dailyCounts?.[dKey]?.[key] || 0;
      const after = prevCount + 1;
      const mult = diminishingMultiplier(after);
      const gained = Math.max(1, Math.round(nExp * mult));
      const gainedRP = Math.max(1, Math.round(gained * 0.6));

      const entry = {
        id: uid(),
        name: cleanName,
        baseExp: nExp,
        gainedExp: gained,
        mult,
        dateKey: dKey,
        ts: Date.now()
      };

      const quickActionsArr = Array.isArray(s.quickActions) ? s.quickActions : [];
      const existsQA = quickActionsArr.some((qa) => (qa?.name || "").toLowerCase() === key);
      const quickActions = existsQA
        ? quickActionsArr
        : [...quickActionsArr, { id: "qa_" + uid(), name: cleanName, exp: nExp, icon: "⏳" }];

      return {
        ...s,
        totalXP: s.totalXP + gained,
        rankRP: s.rankRP + gainedRP,
        entries: [entry, ...(Array.isArray(s.entries) ? s.entries : [])],
        quickActions,
        dailyCounts: {
          ...s.dailyCounts,
          [dKey]: {
            ...(s.dailyCounts?.[dKey] || {}),
            [key]: after
          }
        }
      };
    });

    setRevealDelete({ type: null, id: null });
  }

  function removeEntry(id) {
    setState((prev) => {
      const s = normalizeState(prev);

      const arr = Array.isArray(s.entries) ? s.entries : [];
      const entry = arr.find((e) => e.id === id);
      if (!entry) return s;

      const newEntries = arr.filter((e) => e.id !== id);
      const gainedRP = Math.max(1, Math.round((Number(entry.gainedExp) || 0) * 0.6));

      const totalXP = Math.max(0, s.totalXP - (Number(entry.gainedExp) || 0));
      const rankRP = Math.max(0, s.rankRP - gainedRP);

      const dKey = entry.dateKey;
      const key = (entry.name || "").toLowerCase();
      const dayObj = { ...(s.dailyCounts?.[dKey] || {}) };
      if (dayObj[key]) dayObj[key] = Math.max(0, dayObj[key] - 1);

      return {
        ...s,
        entries: newEntries,
        totalXP,
        rankRP,
        dailyCounts: { ...s.dailyCounts, [dKey]: dayObj }
      };
    });
    setRevealDelete({ type: null, id: null });
  }

  function removeQuickAction(id) {
    setState((prev) => {
      const s = normalizeState(prev);
      const qas = Array.isArray(s.quickActions) ? s.quickActions : [];
      return { ...s, quickActions: qas.filter((q) => q.id !== id) };
    });
    setRevealDelete({ type: null, id: null });
  }

  function addQuickActionManually(name, exp) {
    const cleanName = (name || "").trim();
    const nExp = Number(exp);
    if (!cleanName) return;
    if (!Number.isFinite(nExp) || nExp <= 0) return;

    setState((prev) => {
      const s = normalizeState(prev);

      const key = cleanName.toLowerCase();
      const qas = Array.isArray(s.quickActions) ? s.quickActions : [];
      const exists = qas.some((qa) => (qa?.name || "").toLowerCase() === key);
      if (exists) return s;

      return { ...s, quickActions: [...qas, { id: "qa_" + uid(), name: cleanName, exp: nExp, icon: "⏳" }] };
    });
  }

  function clearAll() {
    localStorage.removeItem(LS_KEY);
    setState(normalizeState(null));
    setRevealDelete({ type: null, id: null });
  }

  function downloadReportTxt() {
    const lines = [];
    lines.push("Żyćko RPG — RAPORT");
    lines.push(`Data: ${new Date().toLocaleString()}`);
    lines.push("");
    lines.push(`Total EXP: ${state.totalXP}`);
    lines.push(`Level: ${level}`);
    lines.push(`Postęp w levelu: ${levelProgressXP}/${needThisLevel} EXP`);
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
    computeTop(entriesArr, "xp")
      .slice(0, 5)
      .forEach((t, i) => lines.push(`${i + 1}. ${t.name} — ${t.xp} EXP (${t.count}x)`));

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `żyćko-rpg-raport_${todayKey()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function hideDelete() {
    setRevealDelete({ type: null, id: null });
  }

  return (
    <div
      className="container"
      onPointerDown={(e) => {
        const tag = e.target?.tagName?.toLowerCase();
        if (tag === "button" || tag === "input" || tag === "svg" || tag === "path") return;
        if (e.target?.closest?.("[data-keep]")) return;
        hideDelete();
      }}
    >
      <div className="shell">
        <div className="header">
          <div className="title stroke">Żyćko RPG</div>
          <p className="subtitle stroke">RPG • EXP • levele • rangi</p>
        </div>

        <div className="grid">
          {/* LEWA KARTA: dodawanie + szybkie akcje */}
          <div className="card" data-keep>
            <div className="hudTop">
              <div className="badge">
                <span className="star" aria-hidden>
                  ⭐
                </span>
                <span className="stroke" style={{ fontWeight: 900, fontSize: 20 }}>
                  LEVEL {level}
                </span>
              </div>

              <div className="hudRight">
                <div className="rankPill">
                  <div className="small">Ranga</div>
                  <div className="stroke" style={{ fontWeight: 900, fontSize: 18 }}>
                    {rank.name}
                  </div>
                  <div className="small">
                    RP: {state.rankRP}
                    {rankNext ? ` • do ${rankNext.name}: ${rpToNextRank}` : ""}
                  </div>
                </div>
              </div>
            </div>

            {/* NAPIS EXP NAD PASKIEM (tu jest zmiana) */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 10 }}>
              <div className="stroke big">
                {levelProgressXP}/{needThisLevel} EXP
              </div>
              <div className="small">Do następnego: {toNext} EXP</div>
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
              <input className="input" value={activityExp} onChange={(e) => setActivityExp(e.target.value)} placeholder="EXP (np. 40)" inputMode="numeric" />
              <button
                className="btn stroke"
                onClick={() => {
                  addEntry({ name: activityName, baseExp: activityExp });
                  setActivityName("");
                  setActivityExp("");
                }}
              >
                + DODAJ
              </button>
            </div>

            <hr className="hr" />

            <div className="flexBetween">
              <div className="sectionTitle stroke" style={{ margin: 0 }}>
                Szybkie akcje
              </div>
              <button className="btn btnSecondary stroke" onClick={clearAll}>
                Wyczyść wszystko
              </button>
            </div>

            <div className="chips" style={{ marginTop: 10 }}>
              {(Array.isArray(state.quickActions) ? state.quickActions : []).map((qa) => (
                <QuickActionChip
                  key={qa.id}
                  qa={qa}
                  isRevealed={revealDelete.type === "qa" && revealDelete.id === qa.id}
                  onClick={(q) => addEntry({ name: q.name, baseExp: q.exp })}
                  onRevealDelete={(id) => setRevealDelete({ type: "qa", id })}
                  onDelete={removeQuickAction}
                />
              ))}
            </div>

            <div style={{ marginTop: 12 }} className="row">
              <input
                className="input"
                style={{ flex: 1, minWidth: 180 }}
                value={qaName}
                onChange={(e) => setQaName(e.target.value)}
                placeholder="Dodaj nową szybką akcję (nazwa)"
              />
              <input className="input" style={{ width: 160 }} value={qaExp} onChange={(e) => setQaExp(e.target.value)} placeholder="EXP" inputMode="numeric" />
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
          </div>

          {/* PRAWA KARTA: raport + historia POD raportem */}
          <div className="card" data-keep>
            <div className="flexBetween">
              <div className="sectionTitle stroke" style={{ margin: 0 }}>
                Raport
              </div>
              <button className="btn btnSecondary stroke" onClick={downloadReportTxt}>
                🎮 STATY
              </button>
            </div>

            <div className="reportGrid" style={{ marginTop: 10 }}>
              <div className="statBox">
                <div className="statLabel stroke">Wpisy</div>
                <div className="statValue stroke">{entriesArr.length}</div>
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
              <div className="stroke" style={{ fontWeight: 900, marginBottom: 8 }}>
                Ostatnie 7 dni
              </div>
              <MiniLineChart data={last7} />
            </div>

            <div className="topGrid">
              <div className="statBox">
                <div className="stroke" style={{ fontWeight: 900, marginBottom: 8 }}>
                  Top (EXP)
                </div>
                {topByXP.length === 0 ? <div className="notice stroke">Brak danych</div> : <TopList items={topByXP.slice(0, 6)} mode="xp" />}
              </div>
              <div className="statBox">
                <div className="stroke" style={{ fontWeight: 900, marginBottom: 8 }}>
                  Top (ilość)
                </div>
                {topByCount.length === 0 ? <div className="notice stroke">Brak danych</div> : <TopList items={topByCount.slice(0, 6)} mode="count" />}
              </div>
            </div>

            <div style={{ marginTop: 12 }} className="notice stroke">
              Anty-farm: powtarzanie tej samej czynności w ciągu dnia daje mniej EXP. <br />
              Motywacja: brak aktywności → RP spada lekko (ranga może spaść).
            </div>

            <hr className="hr" />

            <div className="sectionTitle stroke">Historia</div>
            {entriesArr.length === 0 ? (
              <div className="notice stroke">Brak wpisów. Dodaj pierwszy EXP i wbijaj levele 😄</div>
            ) : (
              <div className="list">
                {entriesArr.map((e) => (
                  <EntryItem
                    key={e.id}
                    entry={e}
                    isRevealed={revealDelete.type === "entry" && revealDelete.id === e.id}
                    onRevealDelete={(id) => setRevealDelete({ type: "entry", id })}
                    onDelete={removeEntry}
                    onTap={() => setRevealDelete({ type: null, id: null })}
                  />
                ))}
              </div>
            )}
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
 * ====== POMOCNICZE ======
 */
function getRankFromRP(rp) {
  let current = RANKS[0];
  for (const r of RANKS) if (rp >= r.minRP) current = r;
  return current;
}
function getNextRank(currentRank) {
  const idx = RANKS.findIndex((r) => r.key === currentRank.key);
  if (idx < 0) return null;
  return RANKS[idx + 1] || null;
}
function diffDaysLocal(fromDay, toDay) {
  const [fy, fm, fd] = fromDay.split("-").map(Number);
  const [ty, tm, td] = toDay.split("-").map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}
function buildLast7Days(entries) {
  const out = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = todayKey(d);
    const label = key.slice(5);
    const value = entries.filter((e) => e.dateKey === key).reduce((a, e) => a + (Number(e.gainedExp) || 0), 0);
    out.push({ key, label, value });
  }
  return out;
}
function computeTop(entries, mode) {
  const map = new Map();
  for (const e of entries) {
    const k = e.name;
    const cur = map.get(k) || { name: k, xp: 0, count: 0 };
    cur.xp += Number(e.gainedExp) || 0;
    cur.count += 1;
    map.set(k, cur);
  }
  const arr = Array.from(map.values());
  if (mode === "count") arr.sort((a, b) => b.count - a.count || b.xp - a.xp);
  else arr.sort((a, b) => b.xp - a.xp || b.count - a.count);
  return arr;
}

/**
 * ====== MiniLineChart (SVG) ======
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
      <path d={`M ${pad} ${h - pad} H ${w - pad}`} stroke="rgba(255,255,255,.18)" strokeWidth="2" fill="none" />
      <path d={`M ${pad} ${pad} V ${h - pad}`} stroke="rgba(255,255,255,.10)" strokeWidth="2" fill="none" />
      <path d={dPath} stroke="rgba(255,255,255,.92)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={dPath} stroke="rgba(255,43,214,.55)" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".35" />
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
          <div className="stroke" style={{ fontWeight: 900, opacity: 0.95 }}>
            {mode === "count" ? `${t.count}x` : `${t.xp} EXP`}
          </div>
        </div>
      ))}
    </div>
  );
}
