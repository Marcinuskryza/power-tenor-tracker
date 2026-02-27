import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * ==========================================================
 * Żyćko RPG v2 — ONE FILE APP.jsx
 * - Karta 1: Dziennik EXP (jak u Ciebie)
 * - Karta 2: Quest Board (daily/weekly/monthly/6M)
 * - Kampania/Sezon 6M + raporty + archiwum
 * - Ocena jakości 1–3 TYLKO przy questach
 * - Eventy (np. Koncert) dodawane ręcznie jako bonus
 * - Tagowanie nowych czynności (quick actions) do ścieżek
 * ==========================================================
 */

/**
 * ====== USTAWIENIA / BALANS ======
 */
const LONG_PRESS_MS = 1000;

// RPG curve: koszt wbicia KOLEJNEGO levela (dla aktualnego lvl)
function expNeedForLevel(lvl) {
  return Math.round(120 + 8 * lvl * lvl);
}

const DAILY_RP_DECAY = 0.06; // 6% dziennie bez aktywności
const MIN_RP_FLOOR = 0;

const LS_KEY_V2 = "ptt_state_v2";
const LS_KEY_V1 = "ptt_state_v1"; // migracja

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function uid() {
  return Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}
function todayKey(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function diffDaysLocal(fromDay, toDay) {
  const [fy, fm, fd] = fromDay.split("-").map(Number);
  const [ty, tm, td] = toDay.split("-").map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}
function startOfISOWeek(d = new Date()) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay() || 7; // Mon=1..Sun=7
  if (day !== 1) date.setDate(date.getDate() - (day - 1));
  return date;
}
function isoWeekKey(d = new Date()) {
  // yyyy-Www
  const date = startOfISOWeek(d);
  const year = date.getFullYear();
  const oneJan = new Date(year, 0, 1);
  const dayOfYear = Math.floor((date - oneJan) / (24 * 60 * 60 * 1000)) + 1;
  const week = Math.ceil((dayOfYear + (oneJan.getDay() || 7) - 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
function monthKey(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

const RANKS = [
  { key: "bronze", name: "Bronze", minRP: 0 },
  { key: "silver", name: "Silver", minRP: 250 },
  { key: "gold", name: "Gold", minRP: 650 },
  { key: "platinum", name: "Platinum", minRP: 1200 },
  { key: "diamond", name: "Diamond", minRP: 2000 },
  { key: "master", name: "Master Vocal", minRP: 3200 }
];

// anty-farm jak u Ciebie (dla wpisów w ciągu dnia)
function diminishingMultiplier(countAfterThis) {
  if (countAfterThis <= 2) return 1.0;
  if (countAfterThis <= 5) return 0.7;
  if (countAfterThis <= 10) return 0.4;
  return 0.2;
}

/**
 * ====== ŚCIEŻKI / PRIORYTETY (Twoje) ======
 */
const TRACKS = [
  { key: "vocal", name: "Wokal (studia/technika)", prio: 5, emoji: "🎤" },
  { key: "career", name: "Kariera + Social", prio: 4, emoji: "🎬" },
  { key: "bands", name: "Zespoły", prio: 3, emoji: "🤘" },
  { key: "dragon", name: "Smocza Grota", prio: 2, emoji: "🐉" },
  { key: "fitness", name: "Fitness", prio: 1, emoji: "🏃‍♂️" }
];

function trackByKey(k) {
  return TRACKS.find((t) => t.key === k) || TRACKS[0];
}

const TIME_COSTS = [
  { key: "S", name: "S (5–15 min)" },
  { key: "M", name: "M (20–45 min)" },
  { key: "L", name: "L (60–120 min)" }
];

/**
 * ====== JAKOŚĆ (questy) ======
 * - tylko przy questach, szybkie 1–3
 * - wpływa na EXP/RP/CP
 */
function qualityMult(q) {
  const Q = Number(q) || 2;
  // EXP: delikatnie
  const exp = Q === 1 ? 0.85 : Q === 3 ? 1.15 : 1.0;
  // RP: mocniej
  const rp = Q === 1 ? 0.7 : Q === 3 ? 1.3 : 1.0;
  // CP: najmocniej
  const cp = Q === 1 ? 0.5 : Q === 3 ? 1.4 : 1.0;
  return { exp, rp, cp };
}

/**
 * ====== BIBLIOTEKA QUESTÓW (templates) ======
 * Generator wybiera propozycje na podstawie deficytów i zmęczenia.
 * Każdy template ma: title, track, timeCost, type, difficulty, baseExp, baseRP, baseCP
 */
const QUEST_TEMPLATES = [
  // VOCAL
  { track: "vocal", type: "Drill", difficulty: 1, timeCost: "M", title: "Kentemplin: pełna sesja techniczna", baseExp: 60, baseRP: 45, baseCP: 18 },
  { track: "vocal", type: "Drill", difficulty: 1, timeCost: "S", title: "Rozśpiewka + 1 ćwiczenie intonacji", baseExp: 35, baseRP: 26, baseCP: 10 },
  { track: "vocal", type: "Build", difficulty: 2, timeCost: "M", title: "Nagranie kontrolne 30–60s + odsłuch + 3 notatki", baseExp: 85, baseRP: 65, baseCP: 26 },
  { track: "vocal", type: "Boss", difficulty: 3, timeCost: "L", title: "Performance take: nagraj 1–2 min i wybierz najlepszy", baseExp: 140, baseRP: 110, baseCP: 40 },

  // CAREER+SOCIAL
  { track: "career", type: "Ship", difficulty: 2, timeCost: "M", title: "Wyślij 2 zgłoszenia na casting / współpracę", baseExp: 70, baseRP: 65, baseCP: 26 },
  { track: "career", type: "Build", difficulty: 2, timeCost: "M", title: "Self-tape: przygotuj 30–60s sceny (nagranie robocze)", baseExp: 95, baseRP: 80, baseCP: 32 },
  { track: "career", type: "Build", difficulty: 2, timeCost: "S", title: "Zaktualizuj portfolio: 1 mały element (CV/opis/mini bio)", baseExp: 40, baseRP: 38, baseCP: 14 },
  { track: "career", type: "Ship", difficulty: 1, timeCost: "S", title: "Opublikuj 1 krótką rzecz (post/short/story)", baseExp: 45, baseRP: 36, baseCP: 12 },
  { track: "career", type: "Build", difficulty: 1, timeCost: "S", title: "Zaplanuj 3 tematy contentu (lista)", baseExp: 30, baseRP: 26, baseCP: 10 },
  { track: "career", type: "Boss", difficulty: 3, timeCost: "L", title: "Zrób 1 porządny materiał (self-tape / short z montażem) i wyślij/publikuj", baseExp: 150, baseRP: 125, baseCP: 48 },

  // BANDS
  { track: "bands", type: "Drill", difficulty: 1, timeCost: "M", title: "Próba domowa: przećwicz 3 numery (focus na trudne fragmenty)", baseExp: 65, baseRP: 50, baseCP: 18 },
  { track: "bands", type: "Build", difficulty: 2, timeCost: "M", title: "Nagraj demo wokalu do 1 fragmentu utworu zespołu", baseExp: 90, baseRP: 75, baseCP: 28 },
  { track: "bands", type: "Ship", difficulty: 1, timeCost: "S", title: "Zrób 1 konkretny krok organizacyjny (2 wiadomości / ustalenie)", baseExp: 40, baseRP: 36, baseCP: 12 },
  { track: "bands", type: "Boss", difficulty: 3, timeCost: "L", title: "Przygotuj set: przejedź 6–10 numerów + zaznacz 5 poprawek", baseExp: 145, baseRP: 115, baseCP: 44 },

  // DRAGON (Smocza Grota)
  { track: "dragon", type: "Build", difficulty: 1, timeCost: "S", title: "Smocza Grota: dopisz 8 linijek tekstu", baseExp: 35, baseRP: 28, baseCP: 14 },
  { track: "dragon", type: "Build", difficulty: 2, timeCost: "M", title: "Smocza Grota: wymyśl 2 riff/tematy i nagraj szkic", baseExp: 85, baseRP: 70, baseCP: 30 },
  { track: "dragon", type: "Boss", difficulty: 3, timeCost: "L", title: "Smocza Grota: zrób mini-demo (zwrotka+refren szkic)", baseExp: 150, baseRP: 120, baseCP: 55 },

  // FITNESS (specjalnie “łagodne”)
  { track: "fitness", type: "Starter", difficulty: 1, timeCost: "S", title: "Fitness MVW: 5–10 min (rozgrzewka + 1 seria)", baseExp: 25, baseRP: 22, baseCP: 6 },
  { track: "fitness", type: "Drill", difficulty: 1, timeCost: "S", title: "Spacer / bieg: 10–15 min (bez spiny)", baseExp: 30, baseRP: 26, baseCP: 7 },
  { track: "fitness", type: "Build", difficulty: 2, timeCost: "M", title: "Trening: 25–40 min (siłownia/kalistenika/bieg)", baseExp: 70, baseRP: 60, baseCP: 14 }
];

/**
 * ====== EVENTY (manualne bonusy) ======
 * np. koncert dodawany ręcznie, nie generuje się automatycznie.
 */
const EVENT_TYPES = [
  { key: "concert", name: "Koncert", emoji: "🎸", baseExp: 250, baseRP: 180 },
  { key: "audition", name: "Casting / przesłuchanie", emoji: "🎬", baseExp: 160, baseRP: 140 },
  { key: "release", name: "Premiera / wydanie", emoji: "🚀", baseExp: 300, baseRP: 220 }
];

/**
 * ====== SZYBKIE AKCJE (start) ======
 */
const DEFAULT_QUICK_ACTIONS = [
  { id: "qa_kent", name: "Kentemplin", exp: 60, icon: "🎤" },
  { id: "qa_post", name: "Post/Short", exp: 45, icon: "📱" }
];

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
 * ====== RANGI ======
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

/**
 * ====== NORMALIZACJA / MIGRACJA STANU ======
 */
function defaultCampaignPack() {
  const startTs = Date.now();
  const endTs = new Date().setMonth(new Date().getMonth() + 6);
  const id = "season_" + uid();
  return {
    id,
    name: "Kampania 6M (Sezon)",
    startTs,
    endTs,
    tracks: TRACKS.map((t) => ({
      key: t.key,
      name: t.name,
      prio: t.prio,
      cp: 0,
      targetCP: t.key === "vocal" ? 1500 : t.key === "career" ? 1200 : t.key === "bands" ? 900 : t.key === "dragon" ? 600 : 350
    })),
    createdAt: Date.now()
  };
}

function normalizeState(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};

  const totalXP = Number(obj.totalXP);
  const rankRP = Number(obj.rankRP);

  // v2 additions
  const activeTab = typeof obj.activeTab === "string" ? obj.activeTab : "log"; // "log" | "quests"
  const quests = Array.isArray(obj.quests) ? obj.quests : [];
  const questHistory = Array.isArray(obj.questHistory) ? obj.questHistory : [];
  const questGen = obj.questGen && typeof obj.questGen === "object" ? obj.questGen : { lastDayKey: "", lastWeekKey: "", lastMonthKey: "" };
  const activityMeta = obj.activityMeta && typeof obj.activityMeta === "object" ? obj.activityMeta : {}; // { [activityKey]: { trackKey, timeCost } }
  const events = Array.isArray(obj.events) ? obj.events : [];
  const campaign = obj.campaign && typeof obj.campaign === "object" ? obj.campaign : defaultCampaignPack();
  const archivedCampaigns = Array.isArray(obj.archivedCampaigns) ? obj.archivedCampaigns : [];

  return {
    totalXP: Number.isFinite(totalXP) ? totalXP : 0,
    rankRP: Number.isFinite(rankRP) ? rankRP : 0,
    entries: Array.isArray(obj.entries) ? obj.entries : [],
    quickActions: Array.isArray(obj.quickActions) && obj.quickActions.length > 0 ? obj.quickActions : DEFAULT_QUICK_ACTIONS,
    dailyCounts: obj.dailyCounts && typeof obj.dailyCounts === "object" ? obj.dailyCounts : {},
    lastSeenDay: typeof obj.lastSeenDay === "string" ? obj.lastSeenDay : todayKey(),
    createdAt: Number.isFinite(Number(obj.createdAt)) ? obj.createdAt : Date.now(),

    // v2
    activeTab,
    quests,
    questHistory,
    questGen,
    activityMeta,
    events,
    campaign,
    archivedCampaigns
  };
}

// Migracja v1 -> v2
function loadState() {
  try {
    const raw2 = localStorage.getItem(LS_KEY_V2);
    if (raw2) return normalizeState(JSON.parse(raw2));
  } catch {}

  try {
    const raw1 = localStorage.getItem(LS_KEY_V1);
    if (raw1) {
      const s1 = JSON.parse(raw1);
      const s2 = normalizeState({ ...s1, activeTab: "log" });
      return s2;
    }
  } catch {}

  return normalizeState(null);
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
                    localStorage.removeItem(LS_KEY_V2);
                    localStorage.removeItem(LS_KEY_V1);
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
    if (!longPressedRef.current) onClick?.(e);
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
 * ====== UI KOMPONENTY ======
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
          {entry.fromQuest ? " • QUEST" : ""}
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

function Pill({ children }) {
  return (
    <span
      className="stroke"
      style={{
        fontWeight: 900,
        fontSize: 12,
        padding: "6px 10px",
        borderRadius: 999,
        background: "rgba(255,255,255,.08)",
        border: "1px solid rgba(255,255,255,.12)"
      }}
    >
      {children}
    </span>
  );
}

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div
      onPointerDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999
      }}
    >
      <div
        className="card"
        onPointerDown={(e) => e.stopPropagation()}
        style={{ width: "min(720px, 100%)", maxHeight: "85vh", overflow: "auto" }}
      >
        <div className="flexBetween" style={{ gap: 12 }}>
          <div className="sectionTitle stroke" style={{ margin: 0 }}>
            {title}
          </div>
          <button className="btn btnSecondary stroke" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

function QuestCard({ q, track, onDone, onReroll, onSnooze, disabled }) {
  return (
    <div
      className="item"
      style={{
        opacity: q.status !== "open" ? 0.75 : 1,
        border: q.type === "Boss" ? "1px solid rgba(255,255,255,.22)" : undefined
      }}
    >
      <div className="itemLeft">
        <div className="itemName stroke" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span aria-hidden>{track.emoji}</span>
          <span>{q.title}</span>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill>{q.type}</Pill>
            <Pill>{q.timeCost}</Pill>
            <Pill>EXP {q.baseExp}</Pill>
          </span>
        </div>
        <div className="itemSub">
          {track.name} • trudność {q.difficulty}/3 •{" "}
          {q.period === "daily" ? `dziś (${q.dueDayKey})` : q.period === "weekly" ? `tydzień ${q.dueWeekKey}` : q.period === "monthly" ? `miesiąc ${q.dueMonthKey}` : "kampania"}
          {q.status === "done" ? ` • ✅ zrobione (Q${q.quality || 2})` : ""}
          {q.status === "skipped" ? " • ⛔ pominięte" : ""}
          {q.snoozeUntil ? ` • 😴 uśpione do ${q.snoozeUntil}` : ""}
        </div>
      </div>

      <div className="itemRight" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
        {q.status === "open" && !q.snoozeUntil && (
          <>
            <button className="btn stroke" disabled={disabled} onClick={() => onDone(q)}>
              ✅ Zrobione
            </button>
            <button className="btn btnSecondary stroke" disabled={disabled} onClick={() => onReroll(q)}>
              🔁 Zamień
            </button>
            <button className="btn btnSecondary stroke" disabled={disabled} onClick={() => onSnooze(q)}>
              😴 Uśpij
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * ====== RAPORTY / EXPORT ======
 */
function downloadText(filename, text) {
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
function downloadJson(filename, obj) {
  const text = JSON.stringify(obj, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * ====== QUEST GENERATOR (adaptacyjny, prosty i sprawiedliwy) ======
 */
function getRecentWindowDayKeys(days = 14) {
  const out = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(todayKey(d));
  }
  return out;
}
function computeRecentActivity(entries, questHistory) {
  const days = getRecentWindowDayKeys(14);
  const byTrack = Object.fromEntries(TRACKS.map((t) => [t.key, { entries: 0, questsDone: 0 }]));

  for (const e of entries) {
    if (!days.includes(e.dateKey)) continue;
    // jeśli wpis ma trackKey (z meta), zalicz do track; jeśli nie, pomijamy w adaptacji
    if (e.trackKey && byTrack[e.trackKey]) byTrack[e.trackKey].entries += 1;
  }
  for (const q of questHistory) {
    if (q.status !== "done") continue;
    const dKey = q.doneDayKey || q.dueDayKey || todayKey();
    if (!days.includes(dKey)) continue;
    if (q.track && byTrack[q.track]) byTrack[q.track].questsDone += 1;
  }
  return byTrack;
}
function pickTemplateForTrack(trackKey, { avoidTypes = [], maxDifficulty = 3, preferTypes = [] } = {}) {
  const pool = QUEST_TEMPLATES.filter((t) => t.track === trackKey && t.difficulty <= maxDifficulty && !avoidTypes.includes(t.type));
  if (pool.length === 0) return null;

  // preferTypes: jeśli da się, wybierz z preferowanych
  const preferred = pool.filter((t) => preferTypes.includes(t.type));
  const list = preferred.length > 0 ? preferred : pool;

  return list[Math.floor(Math.random() * list.length)];
}
function makeQuestFromTemplate(tpl, period, due) {
  const q = {
    id: "q_" + uid(),
    title: tpl.title,
    track: tpl.track,
    type: tpl.type,
    difficulty: tpl.difficulty,
    timeCost: tpl.timeCost,
    baseExp: tpl.baseExp,
    baseRP: tpl.baseRP,
    baseCP: tpl.baseCP,
    period,
    createdTs: Date.now(),
    status: "open",
    quality: null,
    snoozeUntil: null
  };
  if (period === "daily") q.dueDayKey = due;
  if (period === "weekly") q.dueWeekKey = due;
  if (period === "monthly") q.dueMonthKey = due;
  if (period === "campaign") q.dueCampaignId = due;
  return q;
}

// Prosty, adaptacyjny rozdzielacz: priorytet + deficyt (co leży) + fitness “delikatnie”
function generateDailyQuests(state) {
  const day = todayKey();
  const existing = state.quests.filter((q) => q.period === "daily" && q.dueDayKey === day);
  if (existing.length >= 4) return []; // już jest

  const recent = computeRecentActivity(state.entries, state.questHistory);

  // bazowo 4 daily: vocal + career + (bands/dragon) + fitness starter
  // dobór 3 “głównych” przez deficyt: (prio share - recent share)
  const trackKeys = TRACKS.map((t) => t.key);
  const totalRecent = trackKeys.reduce((a, k) => a + (recent[k]?.questsDone || 0) + (recent[k]?.entries || 0) * 0.2, 0);

  const desired = Object.fromEntries(TRACKS.map((t) => [t.key, t.prio]));
  const sumPrio = TRACKS.reduce((a, t) => a + t.prio, 0);

  const score = trackKeys
    .map((k) => {
      const cur = (recent[k]?.questsDone || 0) + (recent[k]?.entries || 0) * 0.2;
      const curShare = totalRecent > 0 ? cur / totalRecent : 0;
      const wantShare = desired[k] / sumPrio;
      const deficit = wantShare - curShare; // dodatni = leży
      // fitness zawsze ma “mniejsze ciśnienie”
      const damp = k === "fitness" ? 0.35 : 1.0;
      return { k, val: deficit * damp };
    })
    .sort((a, b) => b.val - a.val);

  // zawsze zapewnij wokal i karierę
  const pickedTracks = [];
  if (!pickedTracks.includes("vocal")) pickedTracks.push("vocal");
  if (!pickedTracks.includes("career")) pickedTracks.push("career");

  // dobierz 1–2 kolejne z deficytu
  for (const s of score) {
    if (pickedTracks.length >= 3) break;
    if (s.k === "fitness") continue; // fitness osobno
    if (!pickedTracks.includes(s.k)) pickedTracks.push(s.k);
  }

  // fitness starter zawsze, ale bardzo krótki
  pickedTracks.push("fitness");

  const out = [];
  // preferencje: jeśli momentum wysokie w tracku, dawaj Build/Ship zamiast Drill
  for (const tk of pickedTracks) {
    const r = recent[tk] || { entries: 0, questsDone: 0 };
    const momentum = r.questsDone + r.entries * 0.2;
    const preferTypes = tk === "vocal" ? (momentum >= 4 ? ["Build", "Boss"] : ["Drill", "Build"]) : tk === "career" ? (momentum >= 3 ? ["Ship", "Build"] : ["Build", "Ship"]) : tk === "bands" ? ["Drill", "Build", "Ship"] : tk === "dragon" ? ["Build"] : ["Starter", "Drill", "Build"];
    const maxDifficulty = tk === "fitness" ? 2 : 3;

    const tpl = pickTemplateForTrack(tk, { preferTypes, maxDifficulty, avoidTypes: [] });
    if (!tpl) continue;

    // fitness: zawsze S/M, delikatnie
    if (tk === "fitness" && tpl.timeCost === "L") continue;

    out.push(makeQuestFromTemplate(tpl, "daily", day));
  }

  // jeśli brakowało do 4, dociągnij z najwyższego deficytu (bez fitness)
  while (out.length < 4) {
    const tk = score.find((s) => s.k !== "fitness")?.k || "vocal";
    const tpl = pickTemplateForTrack(tk, { maxDifficulty: 2, preferTypes: ["Build", "Ship", "Drill"] });
    if (!tpl) break;
    out.push(makeQuestFromTemplate(tpl, "daily", day));
  }

  // usuń duplikaty tytułów
  const seen = new Set();
  return out.filter((q) => {
    const key = q.track + "::" + q.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function generateWeeklyQuests(state) {
  const wk = isoWeekKey(new Date());
  const existing = state.quests.filter((q) => q.period === "weekly" && q.dueWeekKey === wk);
  if (existing.length >= 4) return [];

  const out = [];
  // 1 boss wokal lub career zależnie od deficytu; plus 2 build/ship, plus 1 bands
  const recent = computeRecentActivity(state.entries, state.questHistory);

  const vocalScore = (recent.vocal?.questsDone || 0) + (recent.vocal?.entries || 0) * 0.2;
  const careerScore = (recent.career?.questsDone || 0) + (recent.career?.entries || 0) * 0.2;
  const bossTrack = vocalScore <= careerScore ? "vocal" : "career";

  const bossTpl = pickTemplateForTrack(bossTrack, { preferTypes: ["Boss"], maxDifficulty: 3 });
  if (bossTpl) out.push(makeQuestFromTemplate(bossTpl, "weekly", wk));

  const build1 = pickTemplateForTrack("career", { preferTypes: ["Build", "Ship"], maxDifficulty: 3 });
  if (build1) out.push(makeQuestFromTemplate(build1, "weekly", wk));

  const build2 = pickTemplateForTrack("vocal", { preferTypes: ["Build"], maxDifficulty: 3 });
  if (build2) out.push(makeQuestFromTemplate(build2, "weekly", wk));

  const bands = pickTemplateForTrack("bands", { preferTypes: ["Build", "Boss", "Drill", "Ship"], maxDifficulty: 3 });
  if (bands) out.push(makeQuestFromTemplate(bands, "weekly", wk));

  // dragon: 1x na tydzień jeśli nie ma już weekly dragon i jeśli nie jest “uśpione” w historii
  const alreadyDragon = existing.some((q) => q.track === "dragon") || out.some((q) => q.track === "dragon");
  if (!alreadyDragon) {
    const dragon = pickTemplateForTrack("dragon", { preferTypes: ["Build"], maxDifficulty: 2 });
    if (dragon) out.push(makeQuestFromTemplate(dragon, "weekly", wk));
  }

  return out.slice(0, 6);
}

function generateMonthlyMilestones(state) {
  const mk = monthKey(new Date());
  const existing = state.quests.filter((q) => q.period === "monthly" && q.dueMonthKey === mk);
  if (existing.length >= 3) return [];

  // miesięczne “meta” (nie muszą mieć exp ogromnego, to milestone)
  const makeMilestone = (track, title) =>
    makeQuestFromTemplate(
      { track, type: "Milestone", difficulty: 2, timeCost: "L", title, baseExp: 120, baseRP: 95, baseCP: 80 },
      "monthly",
      mk
    );

  const out = [];
  out.push(makeMilestone("vocal", "Milestone: 16 sesji wokalu + 4 nagrania kontrolne w tym miesiącu"));
  out.push(makeMilestone("career", "Milestone: 12 publikacji/zgłoszeń łącznie (social+castingi) w tym miesiącu"));
  out.push(makeMilestone("bands", "Milestone: 6 sesji pracy pod zespoły + 1 demo fragmentu w tym miesiącu"));
  return out;
}

/**
 * ====== MINI WYKRES (z Twojego kodu) ======
 */
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

/**
 * ====== APP ======
 */
function InnerApp() {
  const [activityName, setActivityName] = useState("");
  const [activityExp, setActivityExp] = useState("");
  const [qaName, setQaName] = useState("");
  const [qaExp, setQaExp] = useState("");

  const [revealDelete, setRevealDelete] = useState({ type: null, id: null });

  const [state, setState] = useState(() => loadState());

  // modale / overlaye
  const [tagModal, setTagModal] = useState({ open: false, activityKey: "", activityName: "" });
  const [tagChoice, setTagChoice] = useState({ trackKey: "vocal", timeCost: "M" });

  const [qualityModal, setQualityModal] = useState({ open: false, questId: null });

  const [eventModal, setEventModal] = useState({ open: false });
  const [eventType, setEventType] = useState("concert");
  const [eventLabel, setEventLabel] = useState("");
  const [eventExpBonus, setEventExpBonus] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY_V2, JSON.stringify(normalizeState(state)));
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
            for (let i = 0; i < daysMissed; i++) rp = Math.max(MIN_RP_FLOOR, Math.floor(rp * (1 - DAILY_RP_DECAY)));
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

  // ====== Questy: generowanie (daily/weekly/monthly) ======
  useEffect(() => {
    const day = todayKey();
    const wk = isoWeekKey(new Date());
    const mk = monthKey(new Date());

    setState((prev) => {
      const s = normalizeState(prev);
      const gen = s.questGen || { lastDayKey: "", lastWeekKey: "", lastMonthKey: "" };

      const newQuests = [];

      if (gen.lastDayKey !== day) {
        newQuests.push(...generateDailyQuests(s));
        gen.lastDayKey = day;
      }
      if (gen.lastWeekKey !== wk) {
        newQuests.push(...generateWeeklyQuests(s));
        gen.lastWeekKey = wk;
      }
      if (gen.lastMonthKey !== mk) {
        newQuests.push(...generateMonthlyMilestones(s));
        gen.lastMonthKey = mk;
      }

      if (newQuests.length === 0) return s;

      return { ...s, quests: [...newQuests, ...s.quests], questGen: gen };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastSeenDay]);

  // ====== Helpers: meta aktywności ======
  function getActivityMeta(name) {
    const key = (name || "").trim().toLowerCase();
    return state.activityMeta?.[key] || null;
  }
  function ensureActivityTagged(name) {
    const cleanName = (name || "").trim();
    if (!cleanName) return;

    const key = cleanName.toLowerCase();
    const meta = state.activityMeta?.[key];
    if (meta && meta.trackKey && meta.timeCost) return;

    // otwórz modal do tagowania
    setTagChoice({ trackKey: "vocal", timeCost: "M" });
    setTagModal({ open: true, activityKey: key, activityName: cleanName });
  }
  function applyActivityTag() {
    setState((prev) => {
      const s = normalizeState(prev);
      return {
        ...s,
        activityMeta: {
          ...s.activityMeta,
          [tagModal.activityKey]: { trackKey: tagChoice.trackKey, timeCost: tagChoice.timeCost }
        }
      };
    });
    setTagModal({ open: false, activityKey: "", activityName: "" });
  }

  // ====== Dziennik: wpisy ======
  function addEntry({ name, baseExp, fromQuest = false, questId = null }) {
    const cleanName = (name || "").trim();
    const nExp = Number(baseExp);
    if (!cleanName) return;
    if (!Number.isFinite(nExp) || nExp <= 0) return;

    const dKey = todayKey();
    const key = cleanName.toLowerCase();

    const meta = state.activityMeta?.[key];
    const trackKey = meta?.trackKey || null;

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
        ts: Date.now(),
        fromQuest: !!fromQuest,
        questId: questId || null,
        trackKey: trackKey || null
      };

      const quickActionsArr = Array.isArray(s.quickActions) ? s.quickActions : [];
      const existsQA = quickActionsArr.some((qa) => (qa?.name || "").toLowerCase() === key);
      const quickActions = existsQA ? quickActionsArr : [...quickActionsArr, { id: "qa_" + uid(), name: cleanName, exp: nExp, icon: "⏳" }];

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

    // jeśli aktywność nie ma taga — poproś o tag
    ensureActivityTagged(cleanName);

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

    ensureActivityTagged(cleanName);
  }

  function clearAll() {
    localStorage.removeItem(LS_KEY_V2);
    localStorage.removeItem(LS_KEY_V1);
    setState(normalizeState(null));
    setRevealDelete({ type: null, id: null });
  }

  function downloadStatsTxt() {
    const lines = [];
    lines.push("Żyćko RPG — STATY");
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

    downloadText(`zyćko-rpg-staty_${todayKey()}.txt`, lines.join("\n"));
  }

  // ====== QUESTS: listy / filtrowanie ======
  const allQuests = Array.isArray(state.quests) ? state.quests : [];
  const dayKeyNow = todayKey();
  const weekKeyNow = isoWeekKey(new Date());
  const monthKeyNow = monthKey(new Date());

  const dailyQuests = useMemo(() => allQuests.filter((q) => q.period === "daily" && q.dueDayKey === dayKeyNow), [allQuests, dayKeyNow]);
  const weeklyQuests = useMemo(() => allQuests.filter((q) => q.period === "weekly" && q.dueWeekKey === weekKeyNow), [allQuests, weekKeyNow]);
  const monthlyQuests = useMemo(() => allQuests.filter((q) => q.period === "monthly" && q.dueMonthKey === monthKeyNow), [allQuests, monthKeyNow]);

  const openDaily = dailyQuests.filter((q) => q.status === "open" && !q.snoozeUntil);
  const openWeekly = weeklyQuests.filter((q) => q.status === "open" && !q.snoozeUntil);
  const openMonthly = monthlyQuests.filter((q) => q.status === "open" && !q.snoozeUntil);

  // ====== QUEST ACTIONS ======
  function requestQuestDone(q) {
    setQualityModal({ open: true, questId: q.id });
  }

  function completeQuestWithQuality(quality) {
    const qid = qualityModal.questId;
    if (!qid) return;

    setState((prev) => {
      const s = normalizeState(prev);
      const qs = Array.isArray(s.quests) ? s.quests : [];
      const idx = qs.findIndex((x) => x.id === qid);
      if (idx < 0) return s;
      const q = qs[idx];
      if (q.status !== "open") return s;

      const mult = qualityMult(quality);

      // Fitness: łagodniejsza kara na Q1 (żeby nie demotywować)
      const isFitness = q.track === "fitness";
      const rpMult = isFitness && Number(quality) === 1 ? Math.max(mult.rp, 0.9) : mult.rp;
      const cpMult = isFitness && Number(quality) === 1 ? Math.max(mult.cp, 0.8) : mult.cp;

      const gainedExp = Math.max(1, Math.round(q.baseExp * mult.exp));
      const gainedRP = Math.max(1, Math.round(q.baseRP * rpMult));
      const gainedCP = Math.max(0, Math.round(q.baseCP * cpMult));

      const doneTs = Date.now();
      const doneDayKey = todayKey();

      // wpis do dziennika “z questa” — żebyś widział historię jako EXP
      const entryName = `[QUEST] ${q.title}`;
      const entry = {
        id: uid(),
        name: entryName,
        baseExp: q.baseExp,
        gainedExp,
        mult: 1,
        dateKey: doneDayKey,
        ts: doneTs,
        fromQuest: true,
        questId: q.id,
        trackKey: q.track
      };

      // update quest
      const updated = { ...q, status: "done", quality, doneTs, doneDayKey };
      const newQuests = [...qs];
      newQuests[idx] = updated;

      // quest history (dla adaptacji i raportów)
      const hist = {
        id: q.id,
        title: q.title,
        track: q.track,
        type: q.type,
        difficulty: q.difficulty,
        timeCost: q.timeCost,
        period: q.period,
        dueDayKey: q.dueDayKey || null,
        dueWeekKey: q.dueWeekKey || null,
        dueMonthKey: q.dueMonthKey || null,
        status: "done",
        quality,
        doneTs,
        doneDayKey,
        gainedExp,
        gainedRP,
        gainedCP
      };

      // kampania: CP do ścieżki
      const camp = s.campaign && typeof s.campaign === "object" ? s.campaign : defaultCampaignPack();
      const tracks = Array.isArray(camp.tracks) ? camp.tracks : [];
      const tIdx = tracks.findIndex((t) => t.key === q.track);
      if (tIdx >= 0) {
        const t = tracks[tIdx];
        tracks[tIdx] = { ...t, cp: (Number(t.cp) || 0) + gainedCP };
      }

      return {
        ...s,
        totalXP: s.totalXP + gainedExp,
        rankRP: s.rankRP + gainedRP,
        entries: [entry, ...(Array.isArray(s.entries) ? s.entries : [])],
        quests: newQuests,
        questHistory: [hist, ...(Array.isArray(s.questHistory) ? s.questHistory : [])],
        campaign: { ...camp, tracks }
      };
    });

    setQualityModal({ open: false, questId: null });
  }

  function rerollQuest(q) {
    setState((prev) => {
      const s = normalizeState(prev);
      const qs = Array.isArray(s.quests) ? s.quests : [];
      const idx = qs.findIndex((x) => x.id === q.id);
      if (idx < 0) return s;
      const cur = qs[idx];
      if (cur.status !== "open") return s;

      const preferTypes = cur.track === "vocal" ? ["Drill", "Build", "Boss"] : cur.track === "career" ? ["Ship", "Build"] : cur.track === "bands" ? ["Build", "Drill", "Ship"] : cur.track === "dragon" ? ["Build"] : ["Starter", "Drill", "Build"];
      const tpl = pickTemplateForTrack(cur.track, { preferTypes, maxDifficulty: 3, avoidTypes: [cur.type] }) || pickTemplateForTrack(cur.track, { maxDifficulty: 3 });

      if (!tpl) return s;

      const replacement = makeQuestFromTemplate(tpl, cur.period, cur.period === "daily" ? cur.dueDayKey : cur.period === "weekly" ? cur.dueWeekKey : cur.dueMonthKey || cur.dueCampaignId);
      // zachowaj dueKey
      replacement.dueDayKey = cur.dueDayKey;
      replacement.dueWeekKey = cur.dueWeekKey;
      replacement.dueMonthKey = cur.dueMonthKey;
      replacement.dueCampaignId = cur.dueCampaignId;

      const newQuests = [...qs];
      newQuests[idx] = replacement;

      const hist = {
        id: cur.id,
        title: cur.title,
        track: cur.track,
        type: cur.type,
        period: cur.period,
        status: "rerolled",
        ts: Date.now()
      };

      return { ...s, quests: newQuests, questHistory: [hist, ...(Array.isArray(s.questHistory) ? s.questHistory : [])] };
    });
  }

  function snoozeQuest(q) {
    // prosto: uśpij na 3 dni (daily), 7 dni (weekly), do końca miesiąca (monthly)
    const d = new Date();
    const until = q.period === "daily" ? todayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3)) : q.period === "weekly" ? todayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) : todayKey(new Date(d.getFullYear(), d.getMonth() + 1, 1));
    setState((prev) => {
      const s = normalizeState(prev);
      const qs = Array.isArray(s.quests) ? s.quests : [];
      const idx = qs.findIndex((x) => x.id === q.id);
      if (idx < 0) return s;
      const cur = qs[idx];
      if (cur.status !== "open") return s;

      const newQuests = [...qs];
      newQuests[idx] = { ...cur, snoozeUntil: until };

      const hist = { id: cur.id, title: cur.title, track: cur.track, type: cur.type, period: cur.period, status: "snoozed", snoozeUntil: until, ts: Date.now() };
      return { ...s, quests: newQuests, questHistory: [hist, ...(Array.isArray(s.questHistory) ? s.questHistory : [])] };
    });
  }

  // automatyczne “odśnieżanie” uśpionych questów
  useEffect(() => {
    const day = todayKey();
    setState((prev) => {
      const s = normalizeState(prev);
      const qs = Array.isArray(s.quests) ? s.quests : [];
      let changed = false;
      const newQs = qs.map((q) => {
        if (!q.snoozeUntil) return q;
        if (q.snoozeUntil <= day) {
          changed = true;
          return { ...q, snoozeUntil: null };
        }
        return q;
      });
      return changed ? { ...s, quests: newQs } : s;
    });
  }, [state.lastSeenDay]);

  // ====== EVENTY ======
  function addEvent() {
    const type = EVENT_TYPES.find((x) => x.key === eventType) || EVENT_TYPES[0];
    const bonusExp = Number(eventExpBonus);
    const extra = Number.isFinite(bonusExp) && bonusExp > 0 ? bonusExp : 0;

    const gainedExp = type.baseExp + extra;
    const gainedRP = type.baseRP;

    const ev = {
      id: "ev_" + uid(),
      type: type.key,
      label: (eventLabel || "").trim() || type.name,
      ts: Date.now(),
      dateKey: todayKey(),
      gainedExp,
      gainedRP
    };

    setState((prev) => {
      const s = normalizeState(prev);
      const entry = {
        id: uid(),
        name: `[EVENT] ${ev.label}`,
        baseExp: gainedExp,
        gainedExp,
        mult: 1,
        dateKey: ev.dateKey,
        ts: ev.ts,
        fromQuest: false,
        questId: null,
        trackKey: null
      };

      return {
        ...s,
        totalXP: s.totalXP + gainedExp,
        rankRP: s.rankRP + gainedRP,
        events: [ev, ...(Array.isArray(s.events) ? s.events : [])],
        entries: [entry, ...(Array.isArray(s.entries) ? s.entries : [])]
      };
    });

    setEventModal({ open: false });
    setEventLabel("");
    setEventExpBonus("");
  }

  // ====== KAMPANIA: raporty + archiwum ======
  const campaign = state.campaign || defaultCampaignPack();
  const campaignTracks = Array.isArray(campaign.tracks) ? campaign.tracks : [];

  const campaignPct = useMemo(() => {
    const sum = campaignTracks.reduce((a, t) => a + (Number(t.cp) || 0), 0);
    const target = campaignTracks.reduce((a, t) => a + (Number(t.targetCP) || 0), 0);
    if (target <= 0) return 0;
    return clamp(Math.round((sum / target) * 100), 0, 999);
  }, [campaignTracks]);

  function downloadCampaignTxt() {
    const lines = [];
    const start = new Date(campaign.startTs || Date.now());
    const end = new Date(campaign.endTs || Date.now());
    lines.push("Żyćko RPG — RAPORT KAMPANII");
    lines.push(`Nazwa: ${campaign.name || "Kampania"}`);
    lines.push(`Start: ${start.toLocaleString()}`);
    lines.push(`Koniec (plan): ${end.toLocaleString()}`);
    lines.push(`Postęp kampanii: ~${campaignPct}%`);
    lines.push("");
    lines.push(`Level: ${level}`);
    lines.push(`Total EXP: ${state.totalXP}`);
    lines.push(`Ranga: ${rank.name} (RP: ${state.rankRP})`);
    lines.push("");
    lines.push("CP per ścieżka:");
    for (const t of campaignTracks) {
      const pct = t.targetCP > 0 ? Math.round(((Number(t.cp) || 0) / t.targetCP) * 100) : 0;
      const base = trackByKey(t.key);
      lines.push(`- ${base.emoji} ${t.name}: ${t.cp}/${t.targetCP} CP (${pct}%)`);
    }
    lines.push("");
    const doneQuests = (state.questHistory || []).filter((q) => q.status === "done");
    const doneDaily = doneQuests.filter((q) => q.period === "daily").length;
    const doneWeekly = doneQuests.filter((q) => q.period === "weekly").length;
    const doneBoss = doneQuests.filter((q) => q.type === "Boss").length;
    lines.push(`Questy ukończone: ${doneQuests.length} (daily: ${doneDaily}, weekly: ${doneWeekly}, boss: ${doneBoss})`);
    lines.push("");
    lines.push("Top 5 questów (ostatnie):");
    doneQuests.slice(0, 5).forEach((q, i) => {
      lines.push(`${i + 1}. [${q.track}] ${q.title} • Q${q.quality} • +${q.gainedExp} EXP, +${q.gainedRP} RP, +${q.gainedCP} CP`);
    });
    downloadText(`zyćko-rpg-kampania_${todayKey()}.txt`, lines.join("\n"));
  }

  function downloadCampaignJson() {
    const snapshot = normalizeState(state);
    downloadJson(`zyćko-rpg-kampania_${todayKey()}.json`, {
      exportedAt: Date.now(),
      campaign: snapshot.campaign,
      questHistory: snapshot.questHistory,
      quests: snapshot.quests,
      totals: { totalXP: snapshot.totalXP, rankRP: snapshot.rankRP },
      entries: snapshot.entries,
      activityMeta: snapshot.activityMeta,
      events: snapshot.events
    });
  }

  function archiveAndRestartCampaign() {
    // archiwizuj obecny sezon (snapshot kampanii + questHistory) i start nowy
    setState((prev) => {
      const s = normalizeState(prev);
      const archived = Array.isArray(s.archivedCampaigns) ? s.archivedCampaigns : [];
      const pack = s.campaign || defaultCampaignPack();

      const payload = {
        id: pack.id,
        name: pack.name,
        startTs: pack.startTs,
        endTs: pack.endTs,
        archivedAt: Date.now(),
        tracks: pack.tracks,
        questHistory: s.questHistory,
        summary: {
          totalXP: s.totalXP,
          rankRP: s.rankRP
        }
      };

      // start nowy
      const newPack = defaultCampaignPack();

      return {
        ...s,
        campaign: newPack,
        archivedCampaigns: [payload, ...archived],
        // questy i historia mogą zostać jako ogólna historia, ale dla “czystej kampanii”
        // czyścimy questHistory i questy otwarte; wpisy zostają jako życiowy log
        questHistory: [],
        quests: [],
        questGen: { lastDayKey: "", lastWeekKey: "", lastMonthKey: "" }
      };
    });
  }

  // ====== UI: tabs ======
  function setTab(tab) {
    setState((prev) => ({ ...normalizeState(prev), activeTab: tab }));
    setRevealDelete({ type: null, id: null });
  }

  function hideDelete() {
    setRevealDelete({ type: null, id: null });
  }

  return (
    <div
      className="container"
      onPointerDown={(e) => {
        const tag = e.target?.tagName?.toLowerCase();
        if (tag === "button" || tag === "input" || tag === "svg" || tag === "path" || tag === "select" || tag === "option" || tag === "textarea") return;
        if (e.target?.closest?.("[data-keep]")) return;
        hideDelete();
      }}
    >
      <div className="shell">
        <div className="header">
          <div className="title stroke">Żyćko RPG</div>
          <p className="subtitle stroke">RPG • EXP • levele • rangi • questy • kampania</p>

          {/* TAB SWITCH — bez nowej karty */}
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <button className={`btn stroke ${state.activeTab === "log" ? "" : "btnSecondary"}`} onClick={() => setTab("log")}>
              📓 Dziennik
            </button>
            <button className={`btn stroke ${state.activeTab === "quests" ? "" : "btnSecondary"}`} onClick={() => setTab("quests")}>
              🧭 Questy
            </button>
            <button className="btn btnSecondary stroke" onClick={() => setEventModal({ open: true })}>
              ➕ Event (np. koncert)
            </button>
          </div>
        </div>

        {state.activeTab === "log" ? (
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
                <input className="input" value={activityName} onChange={(e) => setActivityName(e.target.value)} placeholder="Nazwa aktywności (np. Ćwiczenie śpiewu)" inputMode="text" />
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
                <input className="input" style={{ flex: 1, minWidth: 180 }} value={qaName} onChange={(e) => setQaName(e.target.value)} placeholder="Dodaj nową szybką akcję (nazwa)" />
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

              <div style={{ marginTop: 12 }} className="notice stroke">
                Tip: nowe aktywności aplikacja poprosi raz o przypisanie do ścieżki (Wokal/Kariera/Zespoły/Smocza Grota/Fitness). Dzięki temu questy będą adaptacyjne.
              </div>
            </div>

            {/* PRAWA KARTA: raport + historia */}
            <div className="card" data-keep>
              <div className="flexBetween">
                <div className="sectionTitle stroke" style={{ margin: 0 }}>
                  Raport
                </div>
                <button className="btn btnSecondary stroke" onClick={downloadStatsTxt}>
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
                Anty-farm: powtarzanie tej samej czynności w ciągu dnia daje mniej EXP.
                <br />
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
        ) : (
          // ===================== QUEST BOARD =====================
          <div className="grid">
            <div className="card" data-keep>
              <div className="flexBetween">
                <div className="sectionTitle stroke" style={{ margin: 0 }}>
                  Kampania 6M
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button className="btn btnSecondary stroke" onClick={downloadCampaignTxt}>
                    📄 Raport TXT
                  </button>
                  <button className="btn btnSecondary stroke" onClick={downloadCampaignJson}>
                    🧾 Export JSON
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10 }} className="notice stroke">
                Postęp kampanii: <b>{campaignPct}%</b> • Start: {new Date(campaign.startTs).toLocaleDateString()} • Koniec (plan): {new Date(campaign.endTs).toLocaleDateString()}
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {campaignTracks.map((t) => {
                  const base = trackByKey(t.key);
                  const pct = t.targetCP > 0 ? clamp(Math.round(((Number(t.cp) || 0) / t.targetCP) * 100), 0, 999) : 0;
                  return (
                    <div key={t.key} className="statBox" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div>
                        <div className="stroke" style={{ fontWeight: 900 }}>
                          {base.emoji} {t.name}
                        </div>
                        <div className="small">Priorytet: {t.prio}/5</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="stroke" style={{ fontWeight: 900 }}>
                          {t.cp}/{t.targetCP} CP
                        </div>
                        <div className="small">{pct}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 12 }} className="notice stroke">
                Jakość robienia questów (1–3) wpływa na nagrody. Ocena jest tylko przy questach — szybko, bez notatek.
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  className="btn btnSecondary stroke"
                  onClick={() => {
                    if (confirm("Zarchiwizować kampanię i zacząć nową? (Questy i historia kampanii zostaną wyczyszczone, wpisy zostają.)")) {
                      archiveAndRestartCampaign();
                    }
                  }}
                >
                  🏁 Zakończ/Archiwizuj i start nowej
                </button>
              </div>

              {Array.isArray(state.archivedCampaigns) && state.archivedCampaigns.length > 0 && (
                <>
                  <hr className="hr" />
                  <div className="sectionTitle stroke">Archiwum kampanii</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {state.archivedCampaigns.slice(0, 5).map((c) => (
                      <div key={c.id} className="statBox" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div>
                          <div className="stroke" style={{ fontWeight: 900 }}>
                            {c.name}
                          </div>
                          <div className="small">
                            {new Date(c.startTs).toLocaleDateString()} → {new Date(c.endTs).toLocaleDateString()} • Archiw.: {new Date(c.archivedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <button className="btn btnSecondary stroke" onClick={() => downloadJson(`kampania-archiwum_${c.id}.json`, c)}>
                          Export
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="card" data-keep>
              <div className="sectionTitle stroke">Quest Board</div>

              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                <div className="statBox">
                  <div className="stroke" style={{ fontWeight: 900, marginBottom: 8 }}>
                    Dziś
                  </div>
                  {dailyQuests.length === 0 ? (
                    <div className="notice stroke">Brak questów na dziś (odśwież / poczekaj na generowanie).</div>
                  ) : (
                    <div className="list" style={{ display: "grid", gap: 10 }}>
                      {dailyQuests.map((q) => (
                        <QuestCard key={q.id} q={q} track={trackByKey(q.track)} onDone={requestQuestDone} onReroll={rerollQuest} onSnooze={snoozeQuest} />
                      ))}
                    </div>
                  )}
                  <div className="notice stroke" style={{ marginTop: 10 }}>
                    Tip: nie musisz robić wszystkiego. Questy są propozycjami. 🔁 Zamień i 😴 Uśpij uczą system Twoich preferencji.
                  </div>
                </div>

                <div className="statBox">
                  <div className="stroke" style={{ fontWeight: 900, marginBottom: 8 }}>
                    Ten tydzień
                  </div>
                  {weeklyQuests.length === 0 ? (
                    <div className="notice stroke">Brak questów tygodniowych.</div>
                  ) : (
                    <div className="list" style={{ display: "grid", gap: 10 }}>
                      {weeklyQuests.map((q) => (
                        <QuestCard key={q.id} q={q} track={trackByKey(q.track)} onDone={requestQuestDone} onReroll={rerollQuest} onSnooze={snoozeQuest} />
                      ))}
                    </div>
                  )}
                </div>

                <div className="statBox">
                  <div className="stroke" style={{ fontWeight: 900, marginBottom: 8 }}>
                    Ten miesiąc (milestone’y)
                  </div>
                  {monthlyQuests.length === 0 ? (
                    <div className="notice stroke">Brak milestone’ów.</div>
                  ) : (
                    <div className="list" style={{ display: "grid", gap: 10 }}>
                      {monthlyQuests.map((q) => (
                        <QuestCard key={q.id} q={q} track={trackByKey(q.track)} onDone={requestQuestDone} onReroll={rerollQuest} onSnooze={snoozeQuest} />
                      ))}
                    </div>
                  )}
                </div>

                <div className="notice stroke">
                  Koncerty i rzeczy “zewnętrzne” dodawaj jako <b>Event</b> (bonus EXP/RP). System nie będzie Ci ich losował jako questów.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: tagowanie aktywności */}
      <Modal
        open={tagModal.open}
        title="Przypisz aktywność do ścieżki (jednorazowo)"
        onClose={() => setTagModal({ open: false, activityKey: "", activityName: "" })}
      >
        <div className="notice stroke">
          Aktywność: <b>{tagModal.activityName}</b>
          <br />
          Dzięki temu questy będą lepiej dopasowane.
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <div>
            <div className="small">Ścieżka</div>
            <select className="input" value={tagChoice.trackKey} onChange={(e) => setTagChoice((p) => ({ ...p, trackKey: e.target.value }))}>
              {TRACKS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.emoji} {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="small">Czas</div>
            <select className="input" value={tagChoice.timeCost} onChange={(e) => setTagChoice((p) => ({ ...p, timeCost: e.target.value }))}>
              {TIME_COSTS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn stroke" onClick={applyActivityTag}>
              Zapisz
            </button>
            <button className="btn btnSecondary stroke" onClick={() => setTagModal({ open: false, activityKey: "", activityName: "" })}>
              Pomiń (na razie)
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: jakość wykonania (questy) */}
      <Modal open={qualityModal.open} title="Oceń jakość wykonania (tylko quest)" onClose={() => setQualityModal({ open: false, questId: null })}>
        <div className="notice stroke">Kliknij szybko 1–3. To wpływa na nagrody (najbardziej CP kampanii).</div>
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn btnSecondary stroke" onClick={() => completeQuestWithQuality(1)}>
            1 • tak sobie / rozdrażniony
          </button>
          <button className="btn stroke" onClick={() => completeQuestWithQuality(2)}>
            2 • normalnie
          </button>
          <button className="btn btnSecondary stroke" onClick={() => completeQuestWithQuality(3)}>
            3 • mega skupienie
          </button>
        </div>
      </Modal>

      {/* MODAL: event */}
      <Modal open={eventModal.open} title="Dodaj Event (bonus)" onClose={() => setEventModal({ open: false })}>
        <div className="notice stroke">Eventy są ręczne (np. koncert). Dają duży bonus EXP/RP i zapis do historii.</div>
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <div>
            <div className="small">Typ</div>
            <select className="input" value={eventType} onChange={(e) => setEventType(e.target.value)}>
              {EVENT_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.emoji} {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="small">Nazwa (opcjonalnie)</div>
            <input className="input" value={eventLabel} onChange={(e) => setEventLabel(e.target.value)} placeholder="np. Koncert — Klub X / Casting Y" />
          </div>
          <div>
            <div className="small">Bonus EXP (opcjonalnie)</div>
            <input className="input" value={eventExpBonus} onChange={(e) => setEventExpBonus(e.target.value)} placeholder="np. 50" inputMode="numeric" />
          </div>
          <button className="btn stroke" onClick={addEvent}>
            Dodaj Event
          </button>
        </div>
      </Modal>
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
