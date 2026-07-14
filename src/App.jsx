import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, Plus, Upload, ChevronUp, ChevronDown, Trash2, Pencil, Download,
  ArrowLeft, Save, Gauge, RotateCcw, FileUp, Car, CalendarDays, Database,
  GitCompare, Layers, ArrowRight, GripVertical, Copy, Clock, Check, X, BookMarked,
  List, LayoutGrid, ChevronLeft, ChevronRight, Tag, Info, Camera, Ruler, Disc, Lock,
  Video, Activity, FileText, FolderOpen, FileDown, SlidersHorizontal, Sun, Moon,
} from "lucide-react";

/* ==================================================================
   APEX LOGBOOK — redesign preview (iteration 1)
   Model:  Car ─┬─ modular setup schema
                └─ library of named Setups
           Event ── Sessions        (setup evolves along a version timeline)
   Data persists in this preview via window.storage.
   MoTeC import is a stand-in shaped like the validated sample log, but the
   fuzzy channel-matcher is the real token-based algorithm.
================================================================== */

const CORNERS = ["FL", "FR", "RL", "RR"];
const CORNER_LABEL = { FL: "Front L", FR: "Front R", RL: "Rear L", RR: "Rear R" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const uid = () => Math.random().toString(36).slice(2, 10);
const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);

/* ================= units ================= */
const UNIT_DEFS = {
  speed: { base: "km/h", opts: { "km/h": { label: "km/h", f: 1 }, "mph": { label: "mph", f: 0.621371 } } },
  temp: { base: "°C", opts: { "°C": { label: "°C" }, "°F": { label: "°F" } } },
  pressure: { base: "psi", opts: { "psi": { label: "psi", f: 1 }, "kPa": { label: "kPa", f: 6.894757 }, "bar": { label: "bar", f: 0.0689476 } } },
  distance: { base: "km", opts: { "km": { label: "km", f: 1 }, "mi": { label: "mi", f: 0.621371 } } },
  volume: { base: "L", opts: { "L": { label: "L", f: 1 }, "gal": { label: "gal (US)", f: 0.264172 } } },
};
const DEFAULT_UNITS = { speed: "km/h", temp: "°C", pressure: "psi", distance: "km", volume: "L" };
function makeUnits(settings) {
  const u = (settings && settings.units) || {};
  const conv = (cat) => {
    const sel = u[cat] || UNIT_DEFS[cat].base;
    const def = UNIT_DEFS[cat].opts[sel] || UNIT_DEFS[cat].opts[UNIT_DEFS[cat].base];
    return {
      label: def.label, sel,
      disp: (v) => { const n = num(v); if (n == null) return v === 0 ? 0 : (v ?? ""); if (cat === "temp") return sel === "°F" ? +(n * 9 / 5 + 32).toFixed(1) : +n.toFixed(1); return +(n * def.f).toFixed(cat === "pressure" && sel === "bar" ? 3 : 2); },
      base: (v) => { const n = num(v); if (n == null) return v ?? ""; if (cat === "temp") return sel === "°F" ? +((n - 32) * 5 / 9).toFixed(2) : n; return +(n / def.f).toFixed(3); },
    };
  };
  return { speed: conv("speed"), temp: conv("temp"), pressure: conv("pressure"), distance: conv("distance"), volume: conv("volume") };
}
let U_STATE = makeUnits(null);
const units = () => U_STATE;
let APP_DIR = "C:\\Users\\Me\\Documents\\Delta Database";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const DAMPER_PRESETS = {
  1: ["Damping"],
  2: ["Bump", "Rebound"],
  3: ["LS Comp", "HS Comp", "Rebound"],
  4: ["LS Bump", "HS Bump", "LS Reb", "HS Reb"],
  5: ["LS Bump", "HS Bump", "LS Reb", "HS Reb", "HS Blow-off"],
};

/* ---------- default modular setup schema for a new car ---------- */
function defaultSchema(damperWays, rocker) {
  const f = (label, type, extra = {}) => ({ id: uid(), label, type, unit: "", perCorner: false, options: [], step: 1, holes: 5, zone: "global", kind: "", ...extra });
  const groups = [
    { id: uid(), name: "Geometry", fields: [
      f("Camber", "number", { unit: "°", perCorner: true, zone: "corner" }),
      f("Toe", "number", { unit: "mm", perCorner: true, zone: "corner" }),
      f("Caster", "number", { unit: "°", perCorner: true, zone: "corner" }),
      f("Ride height", "number", { unit: "mm", perCorner: true, zone: "corner" }),
      f("Spring rate", "number", { unit: "N/mm", perCorner: true, zone: "corner" }),
    ]},
    { id: uid(), name: "Anti-roll bars", fields: [
      f("Front ARB", "stepper", { zone: "front" }),
      f("Rear ARB", "stepper", { zone: "rear" }),
    ]},
    { id: uid(), name: "Aero", fields: [
      f("Front splitter", "stepper", { zone: "front" }),
      f("Rear wing", "stepper", { zone: "rear" }),
    ]},
    { id: uid(), name: "Dampers", fields: DAMPER_PRESETS[damperWays].map((n) =>
      f(n, "stepper", { unit: "clk", perCorner: true, zone: "corner", kind: "damper" })) },
    { id: uid(), name: "Corner weights", fields: [
      f("Corner weight", "number", { unit: "kg", perCorner: true, zone: "corner", kind: "cornerweight" }),
      f("Fuel", "number", { unit: "L", zone: "global", kind: "fuel" }),
      f("Driver + kit", "number", { unit: "kg", zone: "global", kind: "driver" }),
      f("Ballast", "number", { unit: "kg", zone: "global", kind: "ballast" }),
    ]},
    { id: uid(), name: "Tyres", fields: [
      f("Tyre set", "tyreset", { zone: "global", kind: "tyreset" }),
      f("Hot pressure", "number", { unit: "psi", perCorner: true, zone: "corner", kind: "hotpressure" }),
    ]},
    { id: uid(), name: "Driveline & brakes", fields: [
      f("Diff preload", "number", { unit: "Nm", zone: "global" }),
      f("Brake bias", "number", { unit: "%", zone: "global" }),
    ]},
  ];
  if (rocker) {
    groups.find((g) => g.name === "Dampers").fields.push(
      f("Rocker position", "holes", { perCorner: true, zone: "corner", kind: "rocker", holes: 5 }));
  }
  return groups;
}
const allFields = (car) => car.setupSchema.flatMap((g) => g.fields.map((fl) => ({ ...fl, group: g.name })));

/* ---------- setup value helpers ---------- */
function blankValues(car) {
  const v = {};
  allFields(car).forEach((f) => { v[f.id] = f.perCorner ? { FL: "", FR: "", RL: "", RR: "" } : ""; });
  return v;
}
function diffSetups(car, a, b) {
  // returns [{group,label,unit,corner,from,to}]
  const out = [];
  allFields(car).forEach((f) => {
    if (f.perCorner) {
      CORNERS.forEach((c) => {
        const from = a?.[f.id]?.[c] ?? "", to = b?.[f.id]?.[c] ?? "";
        if (String(from) !== String(to)) out.push({ fieldId: f.id, group: f.group, label: f.label, unit: f.unit, corner: c, from, to });
      });
    } else {
      const from = a?.[f.id] ?? "", to = b?.[f.id] ?? "";
      if (String(from) !== String(to)) out.push({ fieldId: f.id, group: f.group, label: f.label, unit: f.unit, corner: null, from, to });
    }
  });
  return out;
}

/* ================= fuzzy MoTeC channel matching (real algorithm) ================= */
const SYNONYM = {
  spd: "speed", temp: "temperature", tmp: "temperature", amb: "ambient", ambiant: "ambient",
  pres: "pressure", press: "pressure", pos: "position", vel: "velocity", accel: "acceleration",
  inj: "injector", volt: "voltage", volts: "voltage", rev: "rpm", revs: "rpm",
};
const CORNER_TOKENS = {
  fl: "cFL", lf: "cFL", fr: "cFR", rf: "cFR", rl: "cRL", lr: "cRL", rr: "cRR",
};
function tokens(name) {
  const raw = String(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const out = [];
  for (let t of raw) {
    if (CORNER_TOKENS[t]) { out.push(CORNER_TOKENS[t]); continue; }
    t = SYNONYM[t] || t;
    out.push(t);
  }
  // combine adjacent side+end words e.g. "left"+"rear" -> corner token
  const side = { left: "L", right: "R" }, end = { front: "F", rear: "R", fwd: "F" };
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i], b = out[i + 1];
    if (side[a] && end[b]) out.push("c" + end[b] + side[a]);
    if (end[a] && side[b]) out.push("c" + end[a] + side[b]);
  }
  return out;
}
function dice(a, b) {
  const bg = (s) => { const m = new Set(); for (let i = 0; i < s.length - 1; i++) m.add(s.slice(i, i + 2)); return m; };
  const A = bg(a), B = bg(b); if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach((x) => B.has(x) && inter++);
  return (2 * inter) / (A.size + B.size);
}
/** score how well a channel name matches a set of target keyword-phrases (0..1) */
function matchScore(keywords, channelName) {
  const ct = tokens(channelName);
  const ctSet = new Set(ct);
  let best = 0;
  for (const kw of keywords) {
    const kt = tokens(kw);
    if (!kt.length) continue;
    const matched = kt.filter((t) => ctSet.has(t)).length;
    const cover = matched / kt.length;                 // order-independent token coverage
    const sim = dice(tokens(kw).join(""), ct.join("")); // spelling similarity
    best = Math.max(best, cover * 0.8 + sim * 0.2);
  }
  return best;
}
function bestChannel(keywords, channels, threshold = 0.5) {
  let top = null, topScore = threshold;
  for (const c of channels) {
    const s = matchScore(keywords, c.name);
    if (s >= topScore) { topScore = s; top = c; }
  }
  return top ? top.name : "";
}

/* --- name normalisation + fuzzy similarity, to catch near-duplicate names at entry --- */
const normName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function simRatio(a, b) {
  const ta = normName(a).split(" ").filter(Boolean), tb = normName(b).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  const sb = new Set(tb);
  const overlap = ta.filter((t) => sb.has(t)).length / Math.max(ta.length, tb.length);
  return overlap * 0.7 + dice(normName(a).replace(/ /g, ""), normName(b).replace(/ /g, "")) * 0.3;
}
function findSimilar(text, options, min = 0.5) {
  const q = normName(text); if (!q) return null;
  let best = null, bestScore = min;
  for (const o of options) { if (normName(o) === q) return null; const s = simRatio(text, o); if (s > bestScore) { bestScore = s; best = o; } }
  return best;
}
function eventTitle(e) {
  if (e.eventType === "oneoff") return (e.name && e.name.trim()) ? e.name.trim() : (e.oneoffName || "One-off event");
  if (e.eventType === "testing") return (e.name && e.name.trim()) ? e.name.trim() : "Testing";
  const parts = [];
  if (e.name && e.name.trim()) parts.push(e.name.trim());
  if (e.round) parts.push(`Round ${e.round}`);
  if (parts.length) return parts.join(" — ");
  return e.series || "Event";
}
function eventGroup(e) {
  if (e.eventType === "oneoff") return e.oneoffName || "One-off";
  if (e.eventType === "testing") return "Testing";
  return e.series || "Series";
}
const EVENT_TYPES = [["series", "Series"], ["oneoff", "One-off"], ["testing", "Testing"]];
const BALANCES = [["understeer", "Understeer"], ["neutral", "Neutral"], ["oversteer", "Oversteer"]];
const balanceLabel = (b) => (BALANCES.find((x) => x[0] === b) || [])[1] || "";
function eventInfo(e) {
  const g = eventGroup(e), t = eventTitle(e);
  return t && t !== g ? t : "";
}
function setupDiff(car, fromV, toV) {
  const out = [];
  const setName = (id) => { const s = (car.tyreBank || []).find((x) => x.id === id); return s ? setLabel(s) : (id ? "set" : ""); };
  allFields(car).forEach((f) => {
    if (fieldZone(f) === "corner") {
      CORNERS.forEach((c) => { const a = String((fromV[f.id] || {})[c] ?? ""), b = String((toV[f.id] || {})[c] ?? ""); if (a !== b) out.push({ label: f.label, corner: c, from: a, to: b, unit: f.unit }); });
    } else if (f.kind === "tyreset") {
      const a = setName(fromV[f.id]), b = setName(toV[f.id]); if (a !== b) out.push({ label: "Tyre set", corner: "", from: a, to: b, unit: "", tyre: true });
    } else { const a = String(fromV[f.id] ?? ""), b = String(toV[f.id] ?? ""); if (a !== b) out.push({ label: f.label, corner: "", from: a, to: b, unit: f.unit }); }
  });
  return out;
}

/* ---- tyre bank ---- */
const tyreAbbr = (s) => (s || "").replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase();
const compAbbr = (s) => { const t = (s || "").trim().split(/\s+/)[0]; return t.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 4); };
const setLabel = (set) => set ? `${tyreAbbr(set.brand)}-${compAbbr(set.compound)}-${String(set.index).padStart(2, "0")}` : "";
const tyreLabel = (t) => (t && (t.serial && String(t.serial).trim() ? String(t.serial).trim() : t.id)) || "";
function makeTyre({ serial = "", brand = "", compound = "", size = "", datePurchased = "", dateFitted = "", corner = "FL", createdIn = "", optimumHot = "", treadPoints = 3 } = {}) {
  const df = dateFitted || new Date().toISOString().slice(0, 10);
  const s = (serial || "").trim();
  return { id: uid(), serial: s, brand: (brand || "").trim(), compound: (compound || "").trim(), size: (size || "").trim(),
    datePurchased: datePurchased || "", dateFitted: df, corner, optimumHot: optimumHot || "", treadPoints: treadPoints || 3,
    history: [{ date: df, text: createdIn ? `Created in ${createdIn}${s ? ` (FIA ${s})` : ""}, nominated ${corner}` : `Tyre created${s ? ` (FIA ${s})` : ""}` }], treads: [] };
}
function makeTyreSet(brand, compound, index, extra = {}) {
  const set = { id: uid(), brand: brand.trim(), compound: compound.trim(), index, size: extra.size || "", optimumHot: extra.optimumHot || "", treadPoints: extra.treadPoints || 3, notes: extra.notes || "", tyres: [] };
  const lbl = setLabel(set);
  const serials = extra.serials || {};
  const dp = extra.datePurchased || "", df = extra.dateFitted || new Date().toISOString().slice(0, 10);
  set.tyres = CORNERS.map((c) => makeTyre({ serial: serials[c], brand: set.brand, compound: set.compound, size: set.size, datePurchased: dp, dateFitted: df, corner: c, createdIn: lbl, optimumHot: set.optimumHot, treadPoints: set.treadPoints }));
  return set;
}
// build a set from already-created tyres keyed by corner
function buildSetFromTyres(tyresByCorner, index, extra = {}) {
  const rep = CORNERS.map((c) => tyresByCorner[c]).find(Boolean) || {};
  const set = { id: uid(), brand: (rep.brand || "").trim(), compound: (rep.compound || "").trim(), index, size: rep.size || "",
    optimumHot: extra.optimumHot != null && extra.optimumHot !== "" ? extra.optimumHot : (rep.optimumHot || ""),
    treadPoints: extra.treadPoints || rep.treadPoints || 3, notes: extra.notes || "", tyres: [] };
  set.tyres = CORNERS.filter((c) => tyresByCorner[c]).map((c) => ({ ...tyresByCorner[c], corner: c }));
  return set;
}
// representative brand/compound/size for a set — driven from its member tyres (they should match)
const repTyre = (set) => (set && set.tyres && set.tyres[0]) || null;
const setBrand = (set) => (repTyre(set) && repTyre(set).brand) || set.brand || "";
const setCompound = (set) => (repTyre(set) && repTyre(set).compound) || set.compound || "";
const setSize = (set) => (repTyre(set) && repTyre(set).size) || set.size || "";
function tyreNextIndex(banks, brand, compound) {
  let max = 0;
  banks.forEach((bank) => (bank || []).forEach((set) => { if (tyreAbbr(set.brand) === tyreAbbr(brand) && compAbbr(set.compound) === compAbbr(compound)) max = Math.max(max, set.index); }));
  return max + 1;
}
function tyreSetUsage(events, setId, circuit) {
  let laps = 0, km = 0, cycles = 0, lastDate = "";
  (events || []).forEach((e) => { if (circuit && e.circuit !== circuit) return; const tl = num(e.trackLength) || 0; e.sessions.forEach((s) => { if (s.tyres && s.tyres.tyreSetId === setId) { const l = num(s.performance.laps) || 0; laps += l; km += l * tl; cycles += 1; if ((s.date || "") > lastDate) lastDate = s.date; } }); });
  return { laps, km: Math.round(km * 10) / 10, cycles, lastDate };
}
const daysSince = (d) => { if (!d) return null; const ms = Date.now() - new Date(d).getTime(); return ms > 0 ? Math.floor(ms / 86400000) : 0; };
function tyreKm(events, tyreId) {
  let km = 0;
  (events || []).forEach((e) => { const tl = num(e.trackLength) || 0; (e.sessions || []).forEach((s) => { const m = (s.tyres && s.tyres.mounted) || []; if (m.includes(tyreId)) km += (num(s.performance.laps) || 0) * tl; }); });
  return Math.round(km * 10) / 10;
}
function tyreCycles(events, tyreId) {
  let n = 0;
  (events || []).forEach((e) => (e.sessions || []).forEach((s) => { const m = (s.tyres && s.tyres.mounted) || []; if (m.includes(tyreId)) n += 1; }));
  return n;
}
// per-tyre tread-vs-km series (each reading averaged across its points)
function tyreTreadSeries(t) {
  return (t.treads || []).map((r) => { const a = (r.depths || []).map(num).filter((x) => isFinite(x)); return { km: r.km || 0, date: r.date, tread: a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 100) / 100 : null }; }).filter((r) => r.tread != null).sort((a, b) => a.km - b.km);
}
const latestTread = (t) => { const s = tyreTreadSeries(t); return s.length ? s[s.length - 1].tread : null; };
function applyTread(bank, setId, treadByCorner, events) {
  const today = new Date().toISOString().slice(0, 10);
  return (bank || []).map((s) => s.id !== setId ? s : { ...s, tyres: s.tyres.map((t) => {
    const depths = (treadByCorner[t.corner] || []).map((v) => String(v));
    if (!depths.some((v) => v !== "")) return t;
    return { ...t, treads: [...(t.treads || []), { date: today, km: tyreKm(events, t.id), depths }] };
  }) });
}

function NewTyreModal({ onSave, onClose }) {
  const [f, setF] = useState({ serial: "", brand: "", compound: "", size: "", datePurchased: "", dateFitted: new Date().toISOString().slice(0, 10), optimumHot: "", treadPoints: 3 });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const u = units();
  const passP = u.pressure.sel === UNIT_DEFS.pressure.base;
  const complete = ["serial", "brand", "compound", "size", "datePurchased", "dateFitted", "optimumHot"].every((k) => String(f[k] ?? "").trim() !== "");
  return (
    <div className="ov">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <h2><Disc size={16} color="var(--amber)" /> New tyre</h2>
        <div className="msub">Creates a single tyre in the unassigned pool. Add it to a set afterwards — the set inherits its brand, compound, size, optimum hot and tread points.</div>
        <div className="fgrid" style={{ marginTop: 10 }}>
          <div className="field"><label>FIA serial</label><input autoFocus value={f.serial} onChange={(e) => set("serial", e.target.value)} placeholder="serial no." /></div>
          <div className="field"><label>Brand</label><input value={f.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Michelin" /></div>
          <div className="field"><label>Compound</label><input value={f.compound} onChange={(e) => set("compound", e.target.value)} placeholder="S9M" /></div>
          <div className="field"><label>Size</label><input value={f.size} onChange={(e) => set("size", e.target.value)} placeholder="27/65-18" /></div>
          <div className="field"><label>Date purchased</label><input type="date" value={f.datePurchased} onChange={(e) => set("datePurchased", e.target.value)} /></div>
          <div className="field"><label>Date fitted</label><input type="date" value={f.dateFitted} onChange={(e) => set("dateFitted", e.target.value)} /></div>
          <div className="field"><label>Optimum hot <span className="opt">· {u.pressure.label}</span></label><input className="num" value={passP ? f.optimumHot : u.pressure.disp(f.optimumHot)} onChange={(e) => set("optimumHot", passP ? e.target.value : String(u.pressure.base(e.target.value)))} placeholder="e.g. 28.0" /></div>
          <div className="field"><label>Tread points <span className="opt">· across tyre</span></label>
            <select value={f.treadPoints} onChange={(e) => set("treadPoints", +e.target.value)}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 3 ? "3 (inner / mid / outer)" : n}</option>)}</select></div>
        </div>
        {!complete && <div className="note" style={{ marginTop: 10 }}>All fields are required before a tyre can be created.</div>}
        <div className="modrow"><button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!complete} onClick={() => onSave(f)}><Save size={14} /> Create tyre</button></div>
      </div>
    </div>
  );
}

function TyreSetModal({ loose, banks, onSave, onClose }) {
  const u = units();
  const passP = u.pressure.sel === UNIT_DEFS.pressure.base;
  const [picks, setPicks] = useState({ FL: "", FR: "", RL: "", RR: "" });
  const [optimumHot, setOptimumHot] = useState("");
  const [treadPoints, setTreadPoints] = useState("");
  const [notes, setNotes] = useState("");
  const byId = (id) => (loose || []).find((t) => t.id === id);
  const pickedList = CORNERS.map((c) => byId(picks[c])).filter(Boolean);
  const rep = pickedList[0] || null;
  const brand = rep ? (rep.brand || "") : "";
  const compound = rep ? (rep.compound || "") : "";
  const size = rep ? (rep.size || "") : "";
  const effOpt = optimumHot !== "" ? optimumHot : (rep && rep.optimumHot != null ? String(rep.optimumHot) : "");
  const effTp = treadPoints !== "" ? +treadPoints : (rep && rep.treadPoints ? rep.treadPoints : 3);
  const idx = brand.trim() && compound.trim() ? tyreNextIndex(banks, brand, compound) : null;
  const preview = idx ? `${tyreAbbr(brand)}-${compAbbr(compound)}-${String(idx).padStart(2, "0")}` : "—";
  const availFor = (cn) => (loose || []).filter((t) => !CORNERS.some((k) => k !== cn && picks[k] === t.id));
  const mismatch = pickedList.length > 1 && pickedList.some((t) => (t.brand || "") !== brand || (t.compound || "") !== compound || (t.size || "") !== size);
  const canCreate = pickedList.length >= 1 && brand.trim() && compound.trim();
  const build = () => {
    const byCorner = {}; CORNERS.forEach((c) => { const t = byId(picks[c]); if (t) byCorner[c] = t; });
    const set = buildSetFromTyres(byCorner, tyreNextIndex(banks, brand, compound), { optimumHot: effOpt, treadPoints: effTp, notes });
    onSave(set, set.tyres.map((t) => t.id));
  };
  return (
    <div className="ov">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <h2><Disc size={16} color="var(--amber)" /> New tyre set</h2>
        {(loose || []).length === 0 ? (<>
          <div className="msub">A set is built from tyres you've already created. There are no unassigned tyres yet.</div>
          <div className="note" style={{ marginTop: 12 }}>Create tyres first with the <b>New tyre</b> button, then come back to group four of them into a set.</div>
          <div className="modrow"><button className="btn ghost" onClick={onClose}>Cancel</button></div>
        </>) : (<>
          <div className="msub">Set ID: <b style={{ color: "var(--amber)", fontFamily: "var(--mono)" }}>{preview}</b> · assign an unassigned tyre to each corner. Brand, compound and size are read from the tyres.</div>
          <div className="field" style={{ marginTop: 12 }}><label>Corner tyres <span className="opt">· pick from unassigned</span></label>
            <div className="serialrow">{CORNERS.map((cn) => (
              <div className="serialcell" key={cn}><span className="pqc">{cn}</span>
                <select value={picks[cn]} onChange={(e) => setPicks((p) => ({ ...p, [cn]: e.target.value }))}>
                  <option value="">—</option>
                  {availFor(cn).map((t) => <option key={t.id} value={t.id}>{tyreLabel(t)}{[t.brand, t.compound].filter(Boolean).length ? ` · ${[t.brand, t.compound].filter(Boolean).join(" ")}` : ""}</option>)}
                </select>
              </div>
            ))}</div>
          </div>
          <div className="fgrid" style={{ marginTop: 10 }}>
            <div className="field"><label>Brand <span className="opt">· from tyres</span></label><input value={brand} disabled placeholder="—" /></div>
            <div className="field"><label>Compound <span className="opt">· from tyres</span></label><input value={compound} disabled placeholder="—" /></div>
            <div className="field"><label>Size <span className="opt">· from tyres</span></label><input value={size || "—"} disabled /></div>
            <div className="field"><label>Optimum hot <span className="opt">· {u.pressure.label}</span></label><input className="num" value={passP ? effOpt : (effOpt === "" ? "" : u.pressure.disp(effOpt))} onChange={(e) => setOptimumHot(passP ? e.target.value : String(u.pressure.base(e.target.value)))} placeholder="from tyre" /></div>
            <div className="field"><label>Tread points</label><select value={effTp} onChange={(e) => setTreadPoints(e.target.value)}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 3 ? "3 (inner / mid / outer)" : n}</option>)}</select></div>
          </div>
          <div className="field" style={{ marginTop: 8 }}><label>Notes <span className="opt">· optional</span></label><input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {mismatch && <div className="warnnote" style={{ marginTop: 10 }}>Selected tyres have different brand / compound / size. The set will use <b>{[brand, compound, size].filter(Boolean).join(" · ")}</b> from the {CORNERS.find((c) => picks[c]) || "first"} tyre.</div>}
          <div className="modrow"><button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={!canCreate} onClick={build}><Save size={14} /> Create set</button></div>
        </>)}
      </div>
    </div>
  );
}

function TyreSetPicker({ car, value, onChange, readOnly }) {
  const bank = car.tyreBank || [];
  const sel = bank.find((s) => s.id === value);
  return (
    <div className="tyresetbox">
      <div className="field"><label>Tyre set</label>
        <select value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={readOnly}>
          <option value="">— none —</option>
          {bank.map((s) => <option key={s.id} value={s.id}>{setLabel(s)} · {s.brand} {s.compound}</option>)}
        </select>
      </div>
      {sel ? (
        <div className="tsspec">
          <div><span className="k">Brand / compound</span><span className="v">{sel.brand} {sel.compound}</span></div>
          <div><span className="k">Size</span><span className="v">{sel.size || "—"}</span></div>
          <div><span className="k">Optimum hot</span><span className="v">{sel.optimumHot ? `${units().pressure.disp(sel.optimumHot)} ${units().pressure.label}` : "—"}</span></div>
        </div>
      ) : (bank.length === 0 ? <div className="note" style={{ margin: 0 }}>No tyre sets yet — add them in the Tyre bank tab.</div> : null)}
    </div>
  );
}

/* ================= MoTeC import stand-in ================= */
const FUZZY_KW = {
  ambientTemp: ["air temp", "ambient temp", "amb air temp", "inlet air temp"],
  trackTemp: ["track temp", "surface temp", "tarmac temp"],
  maxSpeed: ["ground speed", "speed over ground", "gps speed", "vehicle speed"],
  laps: ["lap number", "lap count", "lap no"],
  runningLap: ["running lap time", "current lap time"],
  fuelUsed: ["fuel used", "fuel consumed"],
  fuelLevel: ["fuel level", "fuel remaining"],
};
const MOCK_LOG = {
  meta: { driver: "", track: "Calder", vehicleId: "11A", dateRaw: "23/11/2005", timeRaw: "09:53" },
  channels: [
    { name: "Inlet Air Temp", unit: "C" }, { name: "Track Surface Temp", unit: "C" },
    { name: "Eng Oil Temp", unit: "C" }, { name: "Ground Speed", unit: "km/h" },
    { name: "LR Wheel Speed", unit: "km/h" }, { name: "Engine RPM", unit: "rpm" },
    { name: "Fuel Level", unit: "l" }, { name: "Fuel Used (Raw)", unit: "-" },
    { name: "Lap Number", unit: "-" }, { name: "Running Lap Time", unit: "s" },
    { name: "Throttle Pos", unit: "%" }, { name: "Steered Angle", unit: "deg" },
  ],
  valueFor: { "Inlet Air Temp": "18", "Track Surface Temp": "27", "Eng Oil Temp": "96",
    "Ground Speed": "237", "LR Wheel Speed": "235", "Fuel Level": "2.7", "Fuel Used (Raw)": "3.1" },
};
function autoMap(saved) {
  const m = {};
  for (const [field, kws] of Object.entries(FUZZY_KW)) {
    if (saved && saved[field]) { m[field] = saved[field]; continue; }
    m[field] = bestChannel(kws, MOCK_LOG.channels);
  }
  return m;
}
function simulateParse(mapping) {
  const m = mapping;
  let fuelUsed = "", est = false;
  if (m.fuelUsed && MOCK_LOG.valueFor[m.fuelUsed]) fuelUsed = MOCK_LOG.valueFor[m.fuelUsed];
  else if (m.fuelLevel && MOCK_LOG.valueFor[m.fuelLevel]) { fuelUsed = MOCK_LOG.valueFor[m.fuelLevel]; est = true; }
  const laps = m.laps ? "4" : "";
  const bestLap = (m.laps && m.runningLap) ? "1:04.680" : "";
  const fuelPerLap = fuelUsed && laps ? (parseFloat(fuelUsed) / parseFloat(laps)).toFixed(2) : "";
  return { ...MOCK_LOG.meta,
    ambientTemp: m.ambientTemp ? MOCK_LOG.valueFor[m.ambientTemp] || "" : "",
    trackTemp: m.trackTemp ? MOCK_LOG.valueFor[m.trackTemp] || "" : "",
    maxSpeed: m.maxSpeed ? MOCK_LOG.valueFor[m.maxSpeed] || "" : "",
    laps, bestLap, fuelUsed, fuelPerLap, fuelIsEstimate: est, mapping: m, channels: MOCK_LOG.channels };
}

/* ================= sessions & feedback ================= */
const SESSION_TYPES = ["Practice", "Qualifying", "Race", "Test", "Warmup"];
const PHASES = [["entry", "Entry"], ["mid", "Mid"], ["exit", "Exit"]];
function blankSession(versionId) {
  return {
    id: uid(), type: "Practice", date: new Date().toISOString().slice(0, 10), timeOfDay: "", ts: Date.now(),
    driver: "", versionId,
    conditions: { ambientTemp: "", trackTemp: "", weather: "Dry", humidity: "", wind: "" },
    tyres: { brand: "", compound: "", setId: "", ageLaps: "", tyreSetId: "", mounted: [],
      pc: { FL: "", FR: "", RL: "", RR: "" }, ph: { FL: "", FR: "", RL: "", RR: "" },
      temp: { FL: ["", "", ""], FR: ["", "", ""], RL: ["", "", ""], RR: ["", "", ""] } },
    performance: { bestLap: "", laps: "", fuelUsed: "", fuelPerLap: "", maxSpeed: "", finishPos: "" },
    perfSource: "manual", files: [],
    feedback: { entry: 0, mid: 0, exit: 0, lockFront: 0, lockRear: 0 },
    notes: { driver: "", engineer: "" },
  };
}
function lapToSec(s) { if (!s) return Infinity; const m = String(s).trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/); return m ? (m[1] ? +m[1] * 60 : 0) + +m[2] : Infinity; }
function secToLap(s) { if (!isFinite(s)) return "—"; const m = Math.floor(s / 60); const sec = s - m * 60; return m ? `${m}:${sec.toFixed(3).padStart(6, "0")}` : sec.toFixed(3); }

/* ================= persistence ================= */
const KEY = "apex:db:v17";
async function loadDB() { try { const r = await window.storage.get(KEY); if (r && r.value) return JSON.parse(r.value); } catch (e) {} return null; }
async function saveDB(db) { try { await window.storage.set(KEY, JSON.stringify(db)); } catch (e) {} }

/* ================= seed ================= */
function seedDB() {
  const car = {
    id: uid(), name: "Porsche 992 GT3 Cup", make: "Porsche", model: "992 GT3 Cup", klass: "GT3 Cup",
    damperWays: 4, rocker: false, channelMap: {}, setupSchema: defaultSchema(4, false), setups: [], tyreBank: [],
  };
  const F = allFields(car);
  const byLabel = (l) => F.find((x) => x.label === l);
  const base = blankValues(car);
  const setPC = (label, vals) => { const f = byLabel(label); if (f) base[f.id] = { ...vals }; };
  const set = (label, v) => { const f = byLabel(label); if (f) base[f.id] = v; };
  setPC("Camber", { FL: "-3.6", FR: "-3.6", RL: "-2.9", RR: "-2.9" });
  setPC("Toe", { FL: "0.4", FR: "0.4", RL: "1.2", RR: "1.2" });
  setPC("Ride height", { FL: "52", FR: "52", RL: "58", RR: "58" });
  setPC("Spring rate", { FL: "160", FR: "160", RL: "140", RR: "140" });
  setPC("LS Bump", { FL: "8", FR: "8", RL: "6", RR: "6" });
  setPC("HS Bump", { FL: "5", FR: "5", RL: "4", RR: "4" });
  setPC("LS Reb", { FL: "12", FR: "12", RL: "10", RR: "10" });
  setPC("HS Reb", { FL: "7", FR: "7", RL: "6", RR: "6" });
  set("Front ARB", "3"); set("Rear ARB", "2"); set("Front splitter", "3"); set("Rear wing", "6");
  set("Diff preload", "45"); set("Brake bias", "56");
  const baselineSetup = { id: uid(), name: "SMP baseline", basedOn: null, createdAt: Date.now(), values: base, balance: "understeer" };
  car.setups = [baselineSetup];
  const pSet1 = makeTyreSet("Michelin", "S9M", 1, { size: "27/65-18", datePurchased: "2024-02-20", dateFitted: "2024-03-01", optimumHot: "28.0", treadPoints: 3, notes: "Primary medium set", serials: { FL: "M24-0471", FR: "M24-0472", RL: "M24-0473", RR: "M24-0474" } });
  const pSet2 = makeTyreSet("Michelin", "S9M", 2, { size: "27/65-18", datePurchased: "2025-05-20", dateFitted: "2025-06-10", optimumHot: "27.5", treadPoints: 3, notes: "Fresh quali set", serials: { FL: "M25-1188", FR: "M25-1189", RL: "M25-1190", RR: "M25-1191" } });
  const pSet3 = makeTyreSet("Michelin", "S9M", 3, { size: "27/65-18", datePurchased: "2025-01-10", dateFitted: "2025-01-25", optimumHot: "28.5", treadPoints: 3, notes: "Enduro set", serials: { FL: "M25-0302", FR: "M25-0303", RL: "M25-0304", RR: "M25-0305" } });
  car.tyreBank = [pSet1, pSet2, pSet3];
  pSet1.tyres.forEach((t) => { t.treads = [{ date: "2025-02-10", km: 42, depths: ["6.3", "6.1", "5.8"] }, { date: "2025-04-18", km: 118, depths: ["5.4", "5.1", "4.7"] }, { date: "2025-06-01", km: 176, depths: ["4.6", "4.2", "3.7"] }]; });
  pSet3.tyres.forEach((t) => { t.treads = [{ date: "2025-01-30", km: 60, depths: ["6.1", "5.9", "5.6"] }, { date: "2025-03-05", km: 240, depths: ["4.9", "4.5", "4.0"] }]; });
  { const tf = F.find((x) => x.kind === "tyreset"); if (tf) base[tf.id] = pSet1.id; }

  const v0 = { id: uid(), label: "Baseline", values: JSON.parse(JSON.stringify(base)), changes: [], fromVersionId: null, atSession: null };
  // a change between quali and race: soften front ARB, take a click of rear rebound
  const raceVals = JSON.parse(JSON.stringify(base));
  const arbF = byLabel("Front ARB"); if (arbF) raceVals[arbF.id] = "2";
  const hsr = byLabel("HS Reb"); if (hsr) raceVals[hsr.id] = { ...raceVals[hsr.id], RL: "5", RR: "5" };
  const v1 = { id: uid(), label: "Race trim", values: raceVals, fromVersionId: v0.id, atSession: null,
    changes: diffSetups(car, base, raceVals) };

  const quali = blankSession(v0.id);
  Object.assign(quali, { type: "Qualifying", date: "2025-06-14", timeOfDay: "09:40", driver: "J. Whitmore",
    conditions: { ambientTemp: "15", trackTemp: "22", weather: "Dry", humidity: "58", wind: "SW 12" },
    tyres: { brand: "Michelin", compound: "S9M Medium", setId: "M-04", ageLaps: "6", tyreSetId: pSet2.id, mounted: pSet2.tyres.map((t) => t.id),
      pc: { FL: "24.0", FR: "24.0", RL: "23.0", RR: "23.0" }, ph: { FL: "27.5", FR: "27.8", RL: "26.9", RR: "27.1" },
      temp: { FL: ["92", "88", "80"], FR: ["93", "89", "81"], RL: ["85", "82", "78"], RR: ["86", "83", "79"] } },
    performance: { bestLap: "1:28.412", laps: "8", fuelUsed: "14.2", fuelPerLap: "1.78", maxSpeed: "241" },
    feedback: { entry: -1, mid: 0, exit: 1, lockFront: 2, lockRear: 0 },
    notes: { driver: "Front locking into T2 on trail brake; rear loose on exit of T8.", engineer: "Cool, green track. Pressures held." } });
  const race = blankSession(v1.id);
  Object.assign(race, { type: "Race", date: "2025-06-14", timeOfDay: "14:15", driver: "J. Whitmore",
    conditions: { ambientTemp: "24", trackTemp: "41", weather: "Dry", humidity: "40", wind: "N 8" },
    tyres: { brand: "Michelin", compound: "S9M Medium", setId: "M-05", ageLaps: "2", tyreSetId: pSet1.id, mounted: pSet1.tyres.map((t) => t.id),
      pc: { FL: "23.5", FR: "23.5", RL: "22.5", RR: "22.5" }, ph: { FL: "28.6", FR: "29.1", RL: "27.8", RR: "28.0" },
      temp: { FL: ["104", "98", "88"], FR: ["106", "99", "89"], RL: ["95", "91", "85"], RR: ["96", "92", "86"] } },
    performance: { bestLap: "1:29.980", laps: "18", fuelUsed: "31.6", fuelPerLap: "1.76", maxSpeed: "238" },
    feedback: { entry: 0, mid: 1, exit: 1, lockFront: 1, lockRear: 0 },
    notes: { driver: "Fronts overheating by lap 10, understeer building.", engineer: "Big track-temp jump; softer front bar helped rotation." } });
  v1.atSession = quali.id;
  quali.tyres.tyreSetId = pSet2.id;
  race.tyres.tyreSetId = pSet1.id;

  const event = { id: uid(), eventType: "series", name: "", series: "NSW Production Sports", round: "3",
    circuit: "Sydney Motorsport Park", config: "GP Circuit", trackLength: "3.93",
    startDate: "2025-06-14", endDate: "2025-06-15", carProfileId: car.id, driver: "J. Whitmore",
    baseSetupId: baselineSetup.id, versions: [v0, v1], sessions: [quali, race] };

  /* ---- second car (Toyota GR86) ---- */
  const car2 = { id: uid(), name: "Toyota GR86", make: "Toyota", model: "GR86", klass: "Production",
    damperWays: 2, rocker: false, channelMap: {}, setupSchema: defaultSchema(2, false), setups: [], tyreBank: [] };
  const b2 = blankValues(car2); const F2 = allFields(car2); const bl2 = (l) => F2.find((x) => x.label === l);
  (function () { const setPC = (l, v) => { const f = bl2(l); if (f) b2[f.id] = { ...v }; }; const set = (l, v) => { const f = bl2(l); if (f) b2[f.id] = v; };
    setPC("Camber", { FL: "-2.8", FR: "-2.8", RL: "-1.8", RR: "-1.8" });
    setPC("Spring rate", { FL: "90", FR: "90", RL: "70", RR: "70" });
    set("ARB", "2"); set("Rear wing", "2"); set("Brake bias", "58"); })();
  const base2 = { id: uid(), name: "Winton baseline", basedOn: null, createdAt: Date.now(), values: b2, balance: "oversteer" };
  car2.setups = [base2];
  const gSet1 = makeTyreSet("Hankook", "Z214", 1, { size: "25/64-18", datePurchased: "2024-07-01", dateFitted: "2024-07-20", optimumHot: "26.0", treadPoints: 3, notes: "Damp test set", serials: { FL: "H24-7701", FR: "H24-7702", RL: "H24-7703", RR: "H24-7704" } });
  car2.tyreBank = [gSet1];
  const v2_0 = { id: uid(), label: "Baseline", values: JSON.parse(JSON.stringify(b2)), changes: [], fromVersionId: null, atSession: null };
  const sess2 = blankSession(v2_0.id);
  sess2.type = "Test"; sess2.date = "2024-08-11"; sess2.timeOfDay = "11:05"; sess2.driver = "A. Kostecki";
  sess2.conditions = { ...sess2.conditions, ambientTemp: "12", trackTemp: "14", weather: "Damp", humidity: "82", wind: "W 20" };
  sess2.tyres = { ...sess2.tyres, brand: "Hankook", compound: "Z214 Medium", setId: "H-11", ageLaps: "0",
    pc: { FL: "26", FR: "26", RL: "25", RR: "25" }, ph: { FL: "28", FR: "28", RL: "27", RR: "27" } };
  sess2.performance = { ...sess2.performance, bestLap: "1:34.220", laps: "22", fuelUsed: "19.8", fuelPerLap: "0.90", maxSpeed: "182" };
  sess2.feedback = { entry: 0, mid: -1, exit: 0, lockFront: 0, lockRear: 0 };
  sess2.notes = { driver: "Greasy in sector 2, better as it dried.", engineer: "Damp baseline; softer package good in the cold." };
  sess2.tyres.tyreSetId = gSet1.id;
  const event2 = { id: uid(), eventType: "testing", name: "Winton Winter Test", series: "", round: "",
    circuit: "Winton Motor Raceway", config: "National", trackLength: "3.0", startDate: "2024-08-11", endDate: "2024-08-11",
    carProfileId: car2.id, driver: "A. Kostecki", baseSetupId: base2.id, versions: [v2_0], sessions: [sess2] };

  /* ---- third event (same Porsche, earlier season, different driver) ---- */
  const v3_0 = { id: uid(), label: "Baseline", values: JSON.parse(JSON.stringify(base)), changes: [], fromVersionId: null, atSession: null };
  const sess3 = blankSession(v3_0.id);
  sess3.type = "Practice"; sess3.date = "2024-03-16"; sess3.timeOfDay = "10:20"; sess3.driver = "M. Chen";
  sess3.conditions = { ...sess3.conditions, ambientTemp: "19", trackTemp: "28", weather: "Dry", humidity: "50", wind: "E 6" };
  sess3.tyres = { ...sess3.tyres, brand: "Michelin", compound: "S9M Medium", setId: "M-01", ageLaps: "3",
    pc: { FL: "24", FR: "24", RL: "23", RR: "23" }, ph: { FL: "27", FR: "27", RL: "26", RR: "26" } };
  sess3.performance = { ...sess3.performance, bestLap: "1:30.510", laps: "12", fuelUsed: "20.1", fuelPerLap: "1.68", maxSpeed: "236" };
  sess3.feedback = { entry: 1, mid: 0, exit: -1, lockFront: 0, lockRear: 1 };
  sess3.tyres.tyreSetId = pSet1.id; sess3.tyres.mounted = pSet1.tyres.map((t) => t.id);
  const event3 = { id: uid(), eventType: "series", name: "", series: "NSW Production Sports", round: "1",
    circuit: "Sydney Motorsport Park", config: "Druitt Circuit", trackLength: "2.8", startDate: "2024-03-16", endDate: "2024-03-17",
    carProfileId: car.id, driver: "M. Chen", baseSetupId: baselineSetup.id, versions: [v3_0], sessions: [sess3] };

  /* ---- fourth event: recurring one-off enduro with a co-driver ---- */
  const v4_0 = { id: uid(), label: "Baseline", values: JSON.parse(JSON.stringify(base)), changes: [], fromVersionId: null, atSession: null };
  const sess4 = blankSession(v4_0.id);
  sess4.type = "Race"; sess4.date = "2025-02-02"; sess4.timeOfDay = "07:30"; sess4.driver = "J. Whitmore";
  sess4.conditions = { ...sess4.conditions, ambientTemp: "21", trackTemp: "34", weather: "Dry", humidity: "55", wind: "SW 10" };
  sess4.tyres = { ...sess4.tyres, brand: "Michelin", compound: "S9M Hard", setId: "M-12", ageLaps: "1",
    pc: { FL: "23", FR: "23", RL: "22", RR: "22" }, ph: { FL: "27", FR: "27", RL: "26", RR: "26" } };
  sess4.performance = { ...sess4.performance, bestLap: "2:04.100", laps: "161", fuelUsed: "480", fuelPerLap: "2.98", maxSpeed: "285" };
  sess4.tyres.tyreSetId = pSet3.id; sess4.tyres.mounted = pSet3.tyres.map((t) => t.id);
  sess4.feedback = { entry: 0, mid: 0, exit: 0, lockFront: 1, lockRear: 0 };
  sess4.tyres.tyreSetId = pSet3.id;
  const event4 = { id: uid(), eventType: "oneoff", oneoffName: "Bathurst 12 Hour", name: "", series: "", round: "",
    circuit: "Mount Panorama", config: "Grand Prix Circuit", trackLength: "6.213", startDate: "2025-02-02", endDate: "2025-02-02",
    carProfileId: car.id, driver: "J. Whitmore", coDriver: "A. Kostecki", baseSetupId: baselineSetup.id, versions: [v4_0], sessions: [sess4] };

  const catalog = {
    series: ["NSW Production Sports", "Vic State Circuit Racing"],
    oneoffs: ["Bathurst 12 Hour"],
    circuits: [
      { name: "Sydney Motorsport Park", layouts: ["GP Circuit", "Druitt Circuit", "Gardner GP", "Amaroo", "North Circuit"] },
      { name: "Winton Motor Raceway", layouts: ["National", "Club"] },
      { name: "Mount Panorama", layouts: ["Grand Prix Circuit"] },
    ],
    drivers: ["J. Whitmore", "A. Kostecki", "M. Chen"],
  };
  return { carProfiles: [car, car2], events: [event, event2, event3, event4], catalog };
}

/* Build a catalog from existing events if one is missing (migration for older data). */
function ensureCatalog(d) {
  // backfill eventType on any legacy events
  d.events.forEach((e) => { if (!e.eventType) e.eventType = e.oneOff ? "oneoff" : (e.series ? "series" : "testing"); });
  if (d.catalog && d.catalog.series && d.catalog.circuits && d.catalog.drivers && d.catalog.oneoffs) return d;
  const cur = d.catalog || {};
  const series = [...new Set([...(cur.series || []), ...d.events.filter((e) => e.eventType !== "oneoff" && e.eventType !== "testing").map((e) => e.series)].filter(Boolean))];
  const oneoffs = [...new Set([...(cur.oneoffs || []), ...d.events.filter((e) => e.eventType === "oneoff").map((e) => e.oneoffName)].filter(Boolean))];
  const drivers = [...new Set([...(cur.drivers || []), ...d.events.flatMap((e) => [e.driver, e.coDriver, ...e.sessions.map((s) => s.driver)])].filter(Boolean))];
  const circuits = cur.circuits ? cur.circuits.map((c) => ({ ...c, layouts: [...c.layouts] })) : [];
  d.events.forEach((e) => {
    if (!e.circuit) return;
    let c = circuits.find((x) => x.name === e.circuit);
    if (!c) { c = { name: e.circuit, layouts: [] }; circuits.push(c); }
    if (e.config && !c.layouts.includes(e.config)) c.layouts.push(e.config);
  });
  return { ...d, catalog: { series, oneoffs, circuits, drivers } };
}

/* Give every event a live working setup (migrated from its latest version / base). */
function migrateSetups(d) {
  if (!d.settings) d.settings = { units: { ...DEFAULT_UNITS }, appDir: "C:\\Users\\Me\\Documents\\Delta Database", theme: "dark" };
  if (!d.settings.units) d.settings.units = { ...DEFAULT_UNITS };
  if (d.settings.appDir == null) d.settings.appDir = "C:\\Users\\Me\\Documents\\Delta Database";
  if (!d.settings.theme) d.settings.theme = "dark";
  d.carProfiles.forEach((c) => {
    if (!c.tyreBank) c.tyreBank = []; if (!c.looseTyres) c.looseTyres = [];
    const backfillT = (t, s) => { if (!t.history) t.history = []; if (!t.treads) t.treads = []; if (t.serial == null) t.serial = ""; if (t.brand == null) t.brand = (s && s.brand) || ""; if (t.compound == null) t.compound = (s && s.compound) || ""; if (t.size == null) t.size = (s && s.size) || ""; if (t.datePurchased == null) t.datePurchased = (s && s.datePurchased) || ""; if (!t.dateFitted) t.dateFitted = (s && s.dateFitted) || t.history[0]?.date || ""; if (t.optimumHot == null) t.optimumHot = (s && s.optimumHot) || ""; if (t.treadPoints == null) t.treadPoints = (s && s.treadPoints) || 3; };
    c.tyreBank.forEach((s) => {
      (s.tyres || []).forEach((t) => backfillT(t, s));
      const byCorner = {}, extra = [];
      (s.tyres || []).forEach((t) => { if (!byCorner[t.corner]) byCorner[t.corner] = t; else extra.push(t); });
      s.tyres = CORNERS.filter((cn) => byCorner[cn]).map((cn) => byCorner[cn]);
      extra.forEach((t) => c.looseTyres.push(t));
    });
    (c.looseTyres || []).forEach((t) => backfillT(t, null));
  });
  const setById = {}; d.carProfiles.forEach((c) => (c.tyreBank || []).forEach((s) => { setById[s.id] = s; }));
  d.events.forEach((e) => (e.sessions || []).forEach((s) => { if (s.tyres && !s.tyres.mounted) { const st = setById[s.tyres.tyreSetId]; s.tyres.mounted = st ? st.tyres.map((t) => t.id) : []; } if (!s.files) s.files = []; if (!s.perfSource) s.perfSource = "manual"; }));
  d.events.forEach((e) => {
    e.sessions.forEach((s) => { if (s.tyres && s.tyres.tyreSetId === undefined) s.tyres.tyreSetId = ""; });
    if (!e.setupValues) {
      const lastV = e.versions && e.versions.length ? e.versions[e.versions.length - 1] : null;
      const car = d.carProfiles.find((c) => c.id === e.carProfileId);
      e.setupValues = lastV ? JSON.parse(JSON.stringify(lastV.values)) : (car ? blankValues(car) : {});
    }
    if (!e.timeline) e.timeline = [{ id: uid(), kind: "setup", label: "Baseline", date: e.startDate || new Date().toISOString().slice(0, 10), note: "", values: JSON.parse(JSON.stringify(e.setupValues)) }];
  });
  return d;
}

/* ==================================================================
   CSS
================================================================== */
const CSS = `
  .tsd{--bg:#0E1113;--panel:#171B1F;--raised:#1E242A;--row:#141A1E;--line:#2A3138;
    --line-soft:#20262C;--tx:#E6EAED;--tx-dim:#9BA6AF;--tx-faint:#7C8791;--amber:#F2A93B;
    --cyan:#4FC3E8;--hot:#EF6B4E;--cool:#4FA8E0;--wet:#5B8DEF;--good:#5FD08A;--purp:#B48BE0;
    --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;--sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
    color-scheme:dark;background:var(--bg);color:var(--tx);font-family:var(--sans);font-size:13px;line-height:1.45;min-height:100vh;}
  .tsd.light{--bg:#EDF0F3;--panel:#FFFFFF;--raised:#FFFFFF;--row:#F3F5F7;--line:#D2D9DF;
    --line-soft:#E5E9ED;--tx:#1A2026;--tx-dim:#454F59;--tx-faint:#5A646E;--amber:#B26A0C;
    --cyan:#1C7FA6;--hot:#C9432A;--cool:#2A7BB8;--wet:#3A63C4;--good:#2A9455;--purp:#7A4FAC;color-scheme:light;}
  .tsd.light .btn.primary{color:#fff;}
  .tsd.light .previewtag{color:#fff;}
  .tsd.light .thumb .band{background:linear-gradient(135deg,#EEF2F6,#E0E7ED);}
  .tsd select{background:var(--raised);border:1px solid var(--line);border-radius:6px;color:var(--tx);}
  .tsd option{background:var(--panel);color:var(--tx);}
  .segseg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;}
  .segbtn{display:inline-flex;align-items:center;gap:7px;padding:8px 16px;font-size:12.5px;font-weight:600;color:var(--tx-dim);background:var(--raised);}
  .segbtn+.segbtn{border-left:1px solid var(--line);}
  .segbtn.on{background:var(--amber);color:#1a1206;}
  .tsd.light .segbtn.on{color:#fff;}
  .tsd.light .pill.dry{background:#fbf1dc;border-color:#e6d3a6;}
  .tsd.light .pill.wet{background:#e7edff;border-color:#bccbf0;}
  .tsd.light .pill.damp{background:#e2f1f6;border-color:#b6d9e3;}
  .tsd *{box-sizing:border-box;}
  .tsd button{font-family:inherit;cursor:pointer;color:inherit;background:none;border:none;}
  .tsd input,.tsd select,.tsd textarea{font-family:var(--sans);}
  .num{font-family:var(--mono);font-variant-numeric:tabular-nums;}
  .eyebrow{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--tx-faint);font-weight:600;}
  .topbar{display:flex;align-items:center;gap:16px;padding:11px 18px;border-bottom:1px solid var(--line);
    background:var(--panel);position:sticky;top:0;z-index:20;}
  .brand{display:flex;align-items:center;gap:9px;font-weight:700;letter-spacing:.02em;white-space:nowrap;}
  .previewtag{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#1a1206;background:var(--amber);
    padding:2px 7px;border-radius:3px;font-weight:700;}
  .nav{display:flex;gap:2px;margin-left:6px;}
  .nav button{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:6px;font-size:12.5px;
    font-weight:600;color:var(--tx-dim);}
  .nav button.on{background:var(--raised);color:var(--tx);}
  .nav button:hover{color:var(--tx);}
  .sp{flex:1;}
  .searchwrap{position:relative;width:280px;}
  .searchwrap svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--tx-faint);}
  .search{width:100%;padding:8px 10px 8px 32px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--tx);font-size:13px;}
  .search:focus{outline:none;border-color:var(--cyan);}
  .btn{display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border-radius:6px;font-size:12px;font-weight:600;
    border:1px solid var(--line);background:var(--raised);transition:.12s;white-space:nowrap;}
  .btn:hover{border-color:var(--tx-faint);}
  .btn.primary{background:var(--amber);color:#1a1206;border-color:var(--amber);}
  .btn.primary:hover{filter:brightness(1.08);}
  .btn.ghost{background:none;}
  .btn.sm{padding:5px 9px;font-size:11px;}
  .btn.danger:hover{border-color:var(--hot);color:var(--hot);}
  .wrap{max-width:1180px;margin:0 auto;padding:22px 22px 80px;}
  .pagehead{display:flex;align-items:flex-end;gap:14px;margin-bottom:20px;}
  .pagehead h1{font-size:19px;font-weight:700;margin:0;}
  .pagehead .sub{color:var(--tx-dim);font-size:12.5px;}
  .backrow{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;gap:10px;flex-wrap:wrap;}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px 17px;cursor:pointer;transition:.12s;}
  .card:hover{border-color:var(--tx-faint);}
  .card h3{margin:0 0 3px;font-size:15px;}
  .card .meta{color:var(--tx-dim);font-size:12px;}
  .card .row{display:flex;gap:14px;margin-top:12px;flex-wrap:wrap;}
  .stat{display:flex;flex-direction:column;min-width:0;}
  .stat .v{font-family:var(--mono);font-size:17px;font-weight:700;line-height:1;min-height:17px;display:flex;align-items:flex-end;}
  .stat .v.txt{display:block;font-family:inherit;font-size:12.5px;font-weight:600;line-height:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;}
  .stat .k{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-faint);margin-top:4px;}
  .panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px 17px;}
  .panel h3{font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--amber);margin:0 0 13px;font-weight:700;
    display:flex;align-items:center;gap:7px;justify-content:space-between;}
  .panel h3 .r{display:flex;gap:6px;}
  .grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;}
  .kv{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid var(--line-soft);}
  .kv:last-child{border-bottom:none;}
  .kv .k{color:var(--tx-dim);font-size:12px;}.kv .v{font-family:var(--mono);font-size:12.5px;}
  .tbl{width:100%;border-collapse:collapse;font-size:12.5px;}
  .tbl th{text-align:left;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-faint);font-weight:700;
    padding:0 12px 9px;border-bottom:1px solid var(--line);white-space:nowrap;cursor:pointer;user-select:none;}
  .tbl th.r,.tbl td.r{text-align:right;}
  .tbl td{padding:10px 12px;border-bottom:1px solid var(--line-soft);white-space:nowrap;}
  .tbl tbody tr{cursor:pointer;}.tbl tbody tr:hover td{background:var(--row);}
  .pill{display:inline-block;padding:2px 8px;border-radius:11px;font-size:10.5px;font-weight:600;border:1px solid var(--line);}
  .pill.dry{color:var(--amber);border-color:#4a3a1a;background:#241c0d;}
  .pill.wet{color:var(--wet);border-color:#25345c;background:#131a2e;}
  .pill.damp{color:var(--cyan);border-color:#1d3b45;background:#0e2028;}
  .stype{font-size:10px;letter-spacing:.06em;color:var(--tx-dim);text-transform:uppercase;}
  .empty{text-align:center;padding:60px 20px;color:var(--tx-faint);}
  .rail{width:230px;flex:none;}
  .fsec{margin-bottom:18px;}
  .fsec h4{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--tx-dim);margin:0 0 8px;font-weight:700;}
  .chk{display:flex;align-items:center;gap:8px;padding:3px 0;color:var(--tx-dim);font-size:12px;cursor:pointer;}
  .chk:hover{color:var(--tx);}.chk.on{color:var(--tx);}.chk input{accent-color:var(--amber);width:14px;height:14px;}
  .rangerow{display:flex;gap:7px;}
  .rangerow input{width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--line);border-radius:5px;color:var(--tx);font-family:var(--mono);font-size:12px;}
  .field{display:flex;flex-direction:column;gap:5px;}
  .field label{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--tx-dim);font-weight:600;}
  .field input,.field select,.field textarea{padding:8px 10px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--tx);font-size:13px;}
  .field input.num{font-family:var(--mono);}
  .field input:focus,.field select:focus,.field textarea:focus{outline:none;border-color:var(--cyan);}
  .field textarea{resize:vertical;min-height:60px;line-height:1.5;}
  .fgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px 14px;}
  .fsection{margin-bottom:24px;}
  .fsection>.ttl{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:var(--amber);font-weight:700;
    padding-bottom:8px;margin-bottom:14px;border-bottom:1px solid var(--line);display:flex;gap:8px;align-items:center;}
  .step,.miniStep{display:flex;align-items:stretch;}
  .step input{text-align:center;border-radius:0;border-left:none;border-right:none;width:100%;font-family:var(--mono);}
  .step button,.miniStep button{background:var(--raised);border:1px solid var(--line);color:var(--tx-dim);font-weight:600;flex:none;}
  .step button{width:30px;font-size:15px;}.step button:first-child{border-radius:6px 0 0 6px;}.step button:last-child{border-radius:0 6px 6px 0;}
  .step button:hover,.miniStep button:hover{color:var(--amber);border-color:var(--amber);}
  .miniStep{max-width:96px;margin:0 auto;}
  .miniStep input{width:100%;text-align:center;padding:6px 2px;background:var(--bg);border:1px solid var(--line);border-left:none;border-right:none;color:var(--tx);font-family:var(--mono);font-size:12px;}
  .miniStep input:focus{outline:none;}.miniStep button{width:24px;font-size:13px;}
  .miniStep button:first-child{border-radius:5px 0 0 5px;}.miniStep button:last-child{border-radius:0 5px 5px 0;}
  .setupbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;padding:10px 12px;background:var(--raised);border:1px solid var(--line);border-radius:9px;}
  .setupbar .sblabel{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-faint);font-weight:700;}
  .setupbar>select{padding:7px 9px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--tx);font-size:13px;font-weight:600;min-width:160px;}
  .setupdiagram{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;align-items:start;}
  .zcell{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:8px 10px;}
  .zcell.center{background:linear-gradient(180deg,var(--raised),var(--panel));}
  .zhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
  .zhead span{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--amber);font-weight:700;}
  .addbox{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:var(--bg);border:1px solid var(--line);color:var(--tx-dim);cursor:pointer;}
  .addbox:hover{border-color:var(--amber);color:var(--amber);}
  .abox{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--line-soft);}
  .abox:last-child{border-bottom:none;}
  .alabel{background:none;border:none;color:var(--tx-dim);font-size:11.5px;font-weight:500;text-align:left;cursor:pointer;padding:0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .alabel:hover{color:var(--tx);text-decoration:underline;text-decoration-color:var(--line);}
  .alabel .au{color:var(--tx-faint);}
  .zempty{font-size:10.5px;color:var(--tx-faint);padding:3px 0 5px;}
  .zcell.global{margin-top:10px;}
  .zcell.global .globrow{display:flex;flex-wrap:wrap;gap:2px 22px;}
  .zcell.global .abox{border-bottom:none;min-width:170px;flex:0 1 auto;}
  .widerow{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;align-items:start;}
  .wcol{display:flex;flex-direction:column;gap:10px;}
  .zcell.wide.compact{padding:10px 12px;}
  .zcell.wide.compact .globrow .abox{min-width:120px;}
  .zcell.wide .globrow{display:flex;flex-wrap:wrap;gap:2px 22px;}
  .zcell.wide .globrow .abox{border-bottom:none;min-width:150px;flex:0 1 auto;}
  .quadwrap{margin-top:2px;}
  .quadlbl{background:none;border:none;color:var(--tx-dim);font-size:11px;font-weight:600;cursor:pointer;padding:0 0 6px;}
  .quadlbl:hover{color:var(--tx);}
  .quad{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
  .qcell{display:flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--line-soft);border-radius:6px;padding:4px 6px;}
  .qc{font-size:9.5px;font-weight:700;color:var(--tx-faint);letter-spacing:.05em;width:20px;}
  .dopts{display:flex;align-items:center;gap:10px;}
  .dopts select{padding:3px 5px;background:var(--bg);border:1px solid var(--line);border-radius:5px;color:var(--tx-dim);font-size:11px;}
  .dtabs{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0 9px;}
  .dtabs button{padding:4px 9px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--tx-dim);font-size:11px;cursor:pointer;}
  .dtabs button.on{background:var(--amber);border-color:var(--amber);color:#12161a;font-weight:700;}
  .cwtotal{font-size:11px;color:var(--tx-dim);margin-top:8px;}
  .cwtotal b{color:var(--tx);font-family:var(--mono);font-size:13px;}
  .cwinputs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;}
  .cwinputs input,.tyregrid input{width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--tx);font-size:12px;}
  .cwinputs input:focus,.tyregrid input:focus{outline:none;border-color:var(--cyan);}
  .req{color:var(--amber);}
  .tyregrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
  .tyregrid .field:first-child{grid-column:1 / -1;}
  .dmatrix{margin-top:8px;border-top:1px dashed var(--line);padding-top:7px;}
  .dmlabel{font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--tx-faint);font-weight:700;margin-bottom:5px;}
  .dmgrid{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
  .dmcell{display:flex;flex-direction:column;gap:3px;background:var(--bg);border:1px solid var(--line-soft);border-radius:6px;padding:4px 6px;}
  .dmcell.span{grid-column:1 / -1;}
  .dmcell.diff{border-color:var(--amber);background:rgba(240,170,60,.08);}
  .dmn{font-size:9.5px;color:var(--tx-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .vwrap{position:relative;display:inline-flex;align-items:center;gap:5px;}
  .vwrap.diff .vinp,.vwrap.diff .miniStep input{border-color:var(--amber);background:rgba(240,170,60,.1);}
  .cmpv{font-size:10px;font-family:var(--mono);color:var(--cool);background:var(--bg);border:1px solid var(--line-soft);border-radius:4px;padding:1px 4px;}
  .dampctl{display:inline-flex;align-items:center;gap:8px;padding:0 4px;}
  .dampctl select{padding:6px 8px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--tx);font-size:12px;}
  .usedwrap{margin:-4px 0 12px 0;}
  .usedbtn{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--tx-dim);background:var(--bg);border:1px solid var(--line);border-radius:7px;padding:5px 10px;cursor:pointer;}
  .usedbtn:hover,.usedbtn.on{color:var(--tx);border-color:var(--tx-faint);}
  .usedbtn .ucount{background:var(--raised);border-radius:10px;padding:0 6px;font-weight:700;color:var(--amber);}
  .usedpanel{margin-top:6px;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:6px 12px;max-width:420px;}
  .usedrow{padding:6px 0;border-bottom:1px solid var(--line-soft);}
  .usedrow:last-child{border-bottom:none;}
  .usedrow .ur1{font-size:12px;font-weight:600;color:var(--tx);}
  .usedrow .ur2{font-size:10.5px;color:var(--tx-faint);margin-top:1px;}
  .savedtag{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;color:var(--tx-faint);}
  .savedtag svg{color:var(--good,#5bbf7a);}
  .baltag{display:flex;align-items:center;gap:10px;margin:-2px 0 12px 0;}
  .baltag .seg{width:280px;flex:none;}
  .seg.sm button{padding:5px 4px;font-size:10.5px;}
  .cinfo{margin-top:12px;display:flex;flex-direction:column;gap:7px;}
  .ci{display:flex;justify-content:space-between;gap:12px;align-items:baseline;}
  .ci .cik{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-faint);white-space:nowrap;}
  .ci .civ{font-size:12.5px;font-weight:600;color:var(--tx);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .pqrow{display:flex;gap:20px;flex-wrap:wrap;}
  .pqlabel{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--tx-faint);font-weight:700;margin-bottom:6px;}
  .pquad{display:grid;grid-template-columns:auto auto;gap:6px;}
  .pqcell{display:flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--line-soft);border-radius:6px;padding:3px 6px;}
  .pqc{font-size:9.5px;font-weight:700;color:var(--tx-faint);width:18px;}
  .tquad{grid-template-columns:auto auto;gap:7px;}
  .tquad .pqcell{align-items:center;gap:6px;}
  .tinputs{display:flex;gap:3px;}
  .tcap{font-size:8.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--tx-faint);margin:6px 0 0;text-align:center;}
  .abox .albl{font-size:11.5px;color:var(--tx-dim);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .modal.compact .fsection{margin-bottom:13px;}
  .modal.compact .fsection .ttl{margin-bottom:7px;}
  .modal.compact .fgrid{gap:8px 10px;}
  .modal.compact .cmx td,.modal.compact .cmx th{padding:3px 5px;}
  .modal.compact .balrow{padding:3px 0;}
  .modal.compact .eyebrow{margin:10px 0 6px !important;}
  .tlitem.tread{border-left-color:var(--cool);}
  .tlitem.session{border-left-color:var(--amber);cursor:pointer;}
  .tlitem.rotation{border-left-color:var(--cool);}
  .tlitem.session:hover{background:var(--raised);}
  .tlbest{font-family:var(--mono);font-weight:700;color:var(--amber);font-size:13px;}
  tr.oncar{background:rgba(240,170,60,.06);}
  .oncartag{margin-left:8px;font-family:inherit;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1a1206;background:var(--amber);border-radius:8px;padding:1px 6px;vertical-align:middle;}
  .errmsg{margin:10px 0 0;padding:8px 12px;background:rgba(220,80,80,.12);border:1px solid var(--hot,#d9534f);border-radius:8px;color:var(--hot,#d9534f);font-size:12.5px;}
  .trowact{white-space:nowrap;text-align:right;}
  .trowact .iconbtn{padding:3px;}
  .histrow td{padding:0 8px 8px !important;}
  .thist{background:var(--bg);border:1px solid var(--line-soft);border-radius:7px;padding:8px 10px;}
  .thistline{font-size:11.5px;color:var(--tx-dim);padding:2px 0;}
  .thistline .thd{font-family:var(--mono);color:var(--tx-faint);margin-right:8px;}
  .chartlegend{display:flex;gap:16px;margin-top:8px;font-size:11px;color:var(--tx-dim);}
  .chartlegend i.sw{display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:5px;vertical-align:middle;}
  .chartlegend i.sw.amber{background:var(--amber);}
  .chartlegend i.sw.cool{background:var(--cool);}
  .tyreui{border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--bg);}
  .tyreui-head{display:flex;align-items:center;gap:8px;margin-bottom:9px;}
  .tyreui-head .ttl{display:inline-flex;align-items:center;gap:5px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-faint);font-weight:700;}
  .tyreui-head .setid{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--amber);}
  .tyreui-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
  .tyreui-cell{border:1px solid var(--line-soft);border-radius:8px;padding:11px 8px;display:flex;flex-direction:column;align-items:center;gap:3px;background:var(--raised);}
  .tyreui-cell.clk{cursor:pointer;}
  .tyreui-cell.clk:hover{border-color:var(--amber);}
  .tyreui-cell.active{border-color:var(--amber);box-shadow:0 0 0 1px var(--amber) inset;}
  .tyreui-cell .cn{font-size:9px;letter-spacing:.1em;color:var(--tx-faint);font-weight:700;}
  .tyreui-cell .tid{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--tx);}
  .tyreui-cell .tkm,.tyreui-cell .tstats{font-size:9px;color:var(--tx-faint);font-family:var(--mono);text-align:center;line-height:1.3;}
  .tyreui-hint{margin-top:7px;font-size:10.5px;color:var(--tx-faint);text-align:center;}
  .tyreui-hist{margin-top:8px;background:var(--raised);border:1px solid var(--line-soft);border-radius:8px;padding:8px 10px;}
  .tyreui-hist .hh{font-family:var(--mono);font-size:11px;color:var(--amber);margin-bottom:4px;}
  .logrow{border-bottom:1px solid var(--line-soft);}
  .logrow:last-child{border-bottom:none;}
  .logrow .thistline{display:flex;align-items:center;gap:6px;}
  .logrow .thistline .logacts{margin-left:auto;display:inline-flex;gap:2px;opacity:0;transition:opacity .12s;}
  .logrow:hover .thistline .logacts{opacity:1;}
  .logrow .logacts .iconbtn{padding:2px;}
  .logedit{display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:5px 0;}
  .logedit input[type=date]{font-size:11px;padding:2px 5px;}
  .tyreui-foot{margin-top:8px;font-size:11px;color:var(--tx-dim);text-align:center;}
  .tyresetbox .tsspec{display:flex;flex-direction:column;gap:5px;margin-top:9px;padding-top:9px;border-top:1px dashed var(--line);}
  .tyresetbox .tsspec>div{display:flex;justify-content:space-between;gap:10px;}
  .tyresetbox .tsspec .k{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--tx-faint);}
  .tyresetbox .tsspec .v{font-size:12px;font-weight:600;color:var(--tx);font-family:var(--mono);}
  .ctyre{display:inline-flex;align-items:center;gap:3px;font-family:var(--mono);font-size:9.5px;font-weight:700;color:var(--cool);background:var(--bg);border:1px solid var(--line-soft);border-radius:5px;padding:1px 5px;margin-left:auto;}
  .zhead .ctyre+.addbox{margin-left:6px;}
  .vstatic{font-family:var(--mono);font-size:12.5px;font-weight:600;color:var(--tx);}
  .setinherit{display:flex;align-items:center;gap:7px;padding:8px 10px;background:var(--bg);border:1px solid var(--line);border-radius:8px;font-size:13px;color:var(--tx-dim);}
  .setinherit b{font-family:var(--mono);color:var(--amber);}
  .setinherit svg{color:var(--cool);}
  .ttbl{width:100%;border-collapse:collapse;}
  .ttbl th{text-align:left;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--tx-faint);padding:6px 8px;border-bottom:1px solid var(--line);}
  .ttbl td{padding:7px 8px;border-bottom:1px solid var(--line-soft);font-size:12.5px;}
  .ttbl td.num,.ttbl td .num{font-family:var(--mono);}
  .ttbl tr.clk{cursor:pointer;}
  .ttbl tr.clk:hover td{background:var(--raised);}
  .ttbl.big td{padding:9px 10px;}
  .ttbl select{padding:4px 6px;background:var(--bg);border:1px solid var(--line);border-radius:5px;color:var(--tx);font-size:12px;font-weight:700;}
  .tyrestats{display:flex;gap:20px;}
  .tyrestats .ts{display:flex;flex-direction:column;align-items:flex-end;}
  .tyrestats .ts .v{font-family:var(--mono);font-size:20px;font-weight:700;color:var(--amber);}
  .tyrestats .ts .k{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-faint);}
  .cmpbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;padding:8px 12px;background:var(--raised);border:1px solid var(--line);border-radius:9px;}
  .cmpbar select{padding:6px 8px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--tx);font-size:12px;font-weight:600;}
  .cmphint{font-size:11px;color:var(--tx-dim);}
  .printsheet{display:none;}
  @media print{
    body *{visibility:hidden;}
    .printsheet,.printsheet *{visibility:visible;}
    .printsheet{display:block;position:absolute;left:0;top:0;width:100%;padding:24px;color:#000;background:#fff;font-family:Arial,sans-serif;}
    .printsheet .ph1{font-size:20px;font-weight:700;}
    .printsheet .ph2{font-size:12px;color:#333;margin:2px 0;}
    .printsheet .phmeta{font-size:10px;color:#555;margin-bottom:12px;}
    .printsheet table{width:100%;border-collapse:collapse;margin-bottom:14px;}
    .printsheet th,.printsheet td{border:1px solid #999;padding:4px 8px;font-size:11px;text-align:left;}
    .printsheet th{background:#eee;}
    .printsheet .ptbl td:not(:first-child){text-align:center;font-family:monospace;width:12%;}
    .printsheet .ptbl2 td:first-child{width:40%;color:#333;}
    .printsheet h2{font-size:13px;margin:16px 0 6px;border-bottom:1px solid #999;padding-bottom:2px;}
    .printsheet .pnote{font-size:11px;margin-bottom:7px;}
    .printsheet .pnote b{display:block;margin-bottom:1px;}
  }
  .vinp{width:68px;text-align:center;padding:5px 6px;background:var(--bg);border:1px solid var(--line);border-radius:5px;color:var(--tx);font-size:12px;font-family:var(--mono);}
  .vinp:focus{outline:none;border-color:var(--cyan);}
  .vsel{padding:4px 6px;background:var(--bg);border:1px solid var(--line);border-radius:5px;color:var(--tx);font-size:12px;max-width:100px;}
  .vdisabled{color:var(--tx-faint);font-size:12px;}
  .holes{display:flex;gap:3px;}
  .holes button{width:20px;height:22px;border-radius:5px;background:var(--bg);border:1px solid var(--line);color:var(--tx-dim);font-size:11px;cursor:pointer;}
  .holes button.on{background:var(--amber);border-color:var(--amber);color:#12161a;font-weight:700;}
  .savebar{position:sticky;bottom:0;background:linear-gradient(transparent,var(--bg) 30%);padding:16px 0 4px;display:flex;gap:10px;justify-content:flex-end;}
  .ov{position:fixed;inset:0;background:rgba(6,8,10,.74);display:flex;align-items:flex-start;justify-content:center;padding:44px 20px;z-index:50;overflow-y:auto;}
  .modal{background:var(--panel);border:1px solid var(--line);border-radius:12px;width:100%;max-width:660px;padding:22px;}
  .modal.wide{max-width:940px;}
  .modal h2{font-size:15px;margin:0 0 4px;display:flex;align-items:center;gap:9px;}
  .modal .msub{color:var(--tx-dim);font-size:12px;margin-bottom:16px;}
  .modrow{display:flex;gap:10px;justify-content:flex-end;margin-top:20px;}
  .note{font-size:11.5px;color:var(--tx-faint);line-height:1.5;background:var(--bg);border:1px solid var(--line-soft);border-radius:7px;padding:11px 13px;margin-top:12px;}
  .warnnote{font-size:11.5px;color:var(--tx-dim);line-height:1.5;background:rgba(240,175,60,.09);border:1px solid rgba(240,175,60,.35);border-radius:7px;padding:10px 12px;margin-top:10px;display:flex;gap:8px;align-items:flex-start;}
  .warnnote svg{color:var(--amber);flex:none;margin-top:2px;}
  .serialrow{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
  .serialcell{display:flex;align-items:center;gap:6px;}
  .serialcell input{flex:1;min-width:0;}
  .movectl{display:inline-flex;gap:4px;align-items:center;}
  .movectl select{padding:3px 5px;font-size:11px;}
  .movectl .btn.sm{padding:3px 9px;}
  .banksplit{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:16px;align-items:start;}
  .bankcol .colhead{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--tx-faint);font-weight:700;margin-bottom:8px;}
  .loosewrap{display:flex;flex-direction:column;gap:7px;}
  .looserow{display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:8px 10px;}
  .looseinfo{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;}
  .looseinfo.clk{cursor:pointer;}
  .looseinfo.clk:hover .lserial{color:var(--amber);}
  .looseinfo .lserial{font-family:var(--mono);font-weight:700;font-size:12px;color:var(--tx);}
  .looseinfo .ldet{font-size:10.5px;color:var(--tx-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .looseact{display:flex;align-items:center;gap:6px;flex:none;}
  @media (max-width:720px){ .banksplit{grid-template-columns:1fr;} }
  .paneltop{display:flex;align-items:center;gap:10px;margin-bottom:4px;}
  .gfilter{font-size:11px;color:var(--tx-dim);display:inline-flex;align-items:center;gap:6px;}
  .gfilter select{padding:3px 6px;font-size:11px;}
  .tyreui-cell.selected{border-color:var(--amber);box-shadow:0 0 0 2px var(--amber) inset;}
  .tyreui-cell.target{border-style:dashed;}
  .moveactions{display:flex;align-items:center;gap:8px;margin-top:12px;padding:9px 10px;background:var(--panel);border:1px solid var(--line);border-radius:9px;flex-wrap:wrap;}
  .moveactions .mvlabel{font-size:11.5px;color:var(--tx-dim);}
  .loosechips{display:flex;flex-wrap:wrap;gap:7px;}
  .loosechip{font-family:var(--mono);font-size:11px;font-weight:700;padding:6px 11px;border-radius:20px;border:1px solid var(--line);background:var(--raised);color:var(--tx);cursor:pointer;}
  .loosechip:hover{border-color:var(--amber);}
  .loosechip.selected{border-color:var(--amber);box-shadow:0 0 0 2px var(--amber) inset;color:var(--amber);}
  .note b{color:var(--cyan);}
  /* damper/tyre corner matrix */
  .cmx{width:100%;border-collapse:collapse;}
  .cmx th{font-size:9px;letter-spacing:.05em;text-transform:uppercase;color:var(--tx-faint);font-weight:700;padding:0 6px 7px;text-align:center;}
  .cmx th.corner{text-align:left;}
  .cmx td{padding:4px 6px;text-align:center;font-family:var(--mono);font-size:12.5px;}
  .cmx td.corner{text-align:left;color:var(--tx-dim);font-family:var(--sans);font-size:11px;font-weight:600;}
  .cmx tr+tr td{border-top:1px solid var(--line-soft);}
  .cmx.mini th{padding:0 4px 5px;font-size:8.5px;}
  .cmx.mini td{padding:3px 4px;}
  .cmx.mini td.corner{font-size:10px;}
  .tyremeasrow{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,auto);gap:22px;align-items:start;}
  .seg.ro button{opacity:.85;cursor:default;}
  .dropzone{border:1.5px dashed var(--line);border-radius:10px;padding:16px;text-align:center;color:var(--tx-dim);font-size:13px;display:flex;flex-direction:column;align-items:center;gap:4px;background:var(--bg);transition:border-color .12s,background .12s;}
  .dropzone.over{border-color:var(--amber);background:var(--raised);color:var(--tx);}
  .dropzone .dzsub{font-size:11px;color:var(--tx-faint);}
  .filelist{margin-top:10px;display:flex;flex-direction:column;gap:5px;}
  .filerow{display:flex;align-items:center;gap:8px;padding:6px 9px;background:var(--bg);border:1px solid var(--line-soft);border-radius:7px;font-size:12.5px;}
  .filerow .fkind{color:var(--amber);display:inline-flex;}
  .filerow .fname{font-family:var(--mono);font-size:11.5px;color:var(--tx);}
  .filerow .fpath{margin-left:auto;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:var(--tx-faint);}
  .filerow .iconbtn{margin-left:6px;}
  .dirpath{font-family:var(--mono);font-size:11px;color:var(--tx-dim);background:var(--bg);border:1px solid var(--line-soft);border-radius:6px;padding:4px 8px;}
  .motecbadge{display:inline-flex;align-items:center;gap:4px;font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#1a1206;background:var(--amber);border-radius:8px;padding:2px 7px;margin-left:8px;vertical-align:middle;}
  .linkbtn{background:none;border:none;color:var(--amber);cursor:pointer;font-size:inherit;text-decoration:underline;padding:0;}
  .sessview .fsection{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin-bottom:12px;}
  .sessview input:disabled,.sessview select:disabled,.sessview textarea[readonly]{opacity:1;color:var(--tx);-webkit-text-fill-color:var(--tx);}
  /* schema builder */
  .grp{border:1px solid var(--line);border-radius:9px;margin-bottom:12px;overflow:hidden;}
  .grp .ghead{display:flex;align-items:center;gap:8px;background:var(--raised);padding:9px 12px;}
  .grp .ghead input{background:transparent;border:none;color:var(--tx);font-weight:700;font-size:12.5px;flex:1;}
  .grp .ghead input:focus{outline:none;}
  .frow{display:grid;grid-template-columns:18px 1.4fr .9fr .7fr auto auto;gap:8px;align-items:center;padding:7px 12px;border-top:1px solid var(--line-soft);}
  .frow input,.frow select{padding:6px 8px;background:var(--bg);border:1px solid var(--line);border-radius:5px;color:var(--tx);font-size:12px;}
  .frow .drag{color:var(--tx-faint);cursor:grab;display:flex;}
  .frow .pc{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--tx-dim);}
  .iconbtn{color:var(--tx-faint);padding:4px;border-radius:5px;}
  .iconbtn:hover{color:var(--hot);background:var(--row);}
  /* timeline */
  .timeline{position:relative;padding-left:22px;}
  .timeline:before{content:"";position:absolute;left:6px;top:4px;bottom:4px;width:2px;background:var(--line);}
  .tlitem{position:relative;margin-bottom:14px;}
  .tlitem:before{content:"";position:absolute;left:-19px;top:3px;width:10px;height:10px;border-radius:50%;background:var(--amber);border:2px solid var(--bg);}
  .tlitem.base:before{background:var(--tx-faint);}
  .tlhead{display:flex;align-items:center;gap:10px;}
  .tlhead .lbl{font-weight:700;}
  .chgline{font-family:var(--mono);font-size:11.5px;color:var(--tx-dim);margin-top:3px;}
  .chgline b{color:var(--tx);}
  .up{color:var(--hot);}.down{color:var(--cool);}
  /* segmented balance */
  .seg{display:flex;border:1px solid var(--line);border-radius:6px;overflow:hidden;}
  .seg button{flex:1;padding:6px 4px;font-size:11px;color:var(--tx-dim);border-right:1px solid var(--line);}
  .seg button:last-child{border-right:none;}
  .seg button.on{background:var(--amber);color:#1a1206;font-weight:700;}
  .seg button.us.on{background:var(--cool);color:#04121c;}
  .seg button.os.on{background:var(--hot);color:#1c0a06;}
  .balrow{display:grid;grid-template-columns:70px 1fr;gap:10px;align-items:center;margin-bottom:9px;}
  .balrow .k{font-size:11px;color:var(--tx-dim);letter-spacing:.04em;}
  /* car plan */
  .planwrap{position:relative;width:210px;height:300px;margin:0 auto;}
  .cornerbox{position:absolute;background:var(--bg);border:1px solid var(--line);border-radius:7px;padding:6px 8px;min-width:66px;}
  .cornerbox.hl{border-color:var(--amber);box-shadow:0 0 0 1px var(--amber);}
  .cornerbox .cn{font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-faint);margin-bottom:2px;}
  .cornerbox .cv{font-family:var(--mono);font-size:11px;line-height:1.35;}
  .cornerbox .cv .chg{color:var(--amber);}
  .maprow{display:grid;grid-template-columns:1.1fr 1fr auto;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line-soft);}
  .maprow .fld{font-size:12px;color:var(--tx-dim);}
  .maprow select{padding:7px 9px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--tx);font-size:12px;}
  .score{font-family:var(--mono);font-size:10px;color:var(--good);}
  .diffcard{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:12px 14px;margin-bottom:10px;}
  .diffrow{display:grid;grid-template-columns:1.4fr auto auto auto;gap:10px;align-items:center;font-family:var(--mono);font-size:12.5px;padding:5px 0;border-bottom:1px solid var(--line-soft);}
  .diffrow:last-child{border-bottom:none;}
  .diffrow .lab{font-family:var(--sans);color:var(--tx-dim);}
  /* events filter bar */
  .filterbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px;}
  .fdd{position:relative;}
  .fbtn{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border:1px solid var(--line);border-radius:7px;background:var(--panel);font-size:12px;font-weight:600;color:var(--tx-dim);}
  .fbtn:hover{border-color:var(--tx-faint);color:var(--tx);}
  .fbtn.active{color:var(--tx);border-color:var(--amber);}
  .fcount{background:var(--amber);color:#1a1206;border-radius:9px;font-size:10px;font-weight:700;padding:0 6px;min-width:16px;text-align:center;}
  .fddscrim{position:fixed;inset:0;z-index:29;}
  .fddpanel{position:absolute;top:calc(100% + 6px);left:0;z-index:30;min-width:212px;max-height:320px;overflow-y:auto;
    background:var(--raised);border:1px solid var(--line);border-radius:9px;box-shadow:0 12px 34px rgba(0,0,0,.5);padding:8px;}
  .fddhead{display:flex;justify-content:space-between;align-items:center;padding:2px 6px 8px;font-size:10px;letter-spacing:.12em;
    text-transform:uppercase;color:var(--tx-faint);font-weight:700;border-bottom:1px solid var(--line-soft);margin-bottom:6px;}
  .fddpanel .chk{padding:5px 6px;border-radius:5px;}
  .fddpanel .chk:hover{background:var(--row);}
  .fddempty{color:var(--tx-faint);font-size:12px;padding:8px 6px;}
  .chiprow{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:16px;}
  .chip{display:inline-flex;align-items:center;gap:6px;background:var(--raised);border:1px solid var(--line);border-radius:14px;padding:3px 5px 3px 11px;font-size:11.5px;}
  .chip .g{color:var(--tx-faint);}
  .chip button{color:var(--tx-dim);display:flex;padding:2px;border-radius:50%;}
  .chip button:hover{color:var(--hot);background:var(--row);}
  .viewtoggle{display:flex;border:1px solid var(--line);border-radius:7px;overflow:hidden;}
  .viewtoggle button{padding:7px 9px;color:var(--tx-dim);border-right:1px solid var(--line);display:flex;}
  .viewtoggle button:last-child{border-right:none;}
  .viewtoggle button.on{background:var(--raised);color:var(--amber);}
  .thumb{position:relative;overflow:hidden;}
  .thumb .band{height:60px;margin:-16px -17px 12px;background:linear-gradient(135deg,#212932,#141A1E);
    border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 16px;}
  .thumb .band .elabel{flex:1;min-width:0;font-size:13.5px;font-weight:600;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:10px;}
  .thumb .band .elabel .g,.evrow .ev-name .g{color:var(--amber);}
  .thumb .band .elabel .t,.evrow .ev-name .t{color:var(--tx);}
  .evrow .ev-name{font-weight:600;font-size:13.5px;color:var(--tx);}
  .fbtn.disabled{opacity:.4;cursor:not-allowed;}
  .fbtn.disabled:hover{border-color:var(--line);color:var(--tx-dim);}
  .calpanel{min-width:236px;}
  .calnav{display:flex;align-items:center;justify-content:space-between;padding:2px 4px 10px;font-weight:700;font-family:var(--mono);}
  .calnav button{color:var(--tx-dim);display:flex;padding:4px;border-radius:5px;}
  .calnav button:hover{color:var(--amber);background:var(--row);}
  .calgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}
  .calm{padding:9px 0;border:1px solid var(--line);border-radius:6px;font-size:12px;color:var(--tx-dim);font-weight:600;}
  .calm:hover{border-color:var(--tx-faint);color:var(--tx);}
  .calm.on{background:var(--amber);color:#1a1206;border-color:var(--amber);}
  .calfoot{display:flex;justify-content:flex-end;padding-top:9px;}
  .sublayouts{padding:2px 0 5px 20px;border-left:1px solid var(--line-soft);margin:2px 0 2px 9px;}
  .chk.sub{font-size:11.5px;color:var(--tx-faint);}
  .chk.sub.on{color:var(--tx);}
  .nrow{display:grid;grid-template-columns:1fr auto 150px 30px;gap:9px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line-soft);}
  .nrename{padding:7px 9px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--tx);font-size:12.5px;font-weight:600;}
  .nrename:focus{outline:none;border-color:var(--cyan);}
  .ncount{font-size:10.5px;color:var(--tx-faint);white-space:nowrap;}
  .nmerge{padding:6px 8px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--tx-dim);font-size:11.5px;}
  .iconbtn[disabled]{opacity:.3;cursor:not-allowed;}
  .circblock{border:1px solid var(--line);border-radius:9px;padding:4px 12px 8px;margin-bottom:10px;}
  .circblock>.nrow{border-bottom:1px solid var(--line-soft);}
  .layoutsub{padding-left:16px;border-left:2px solid var(--line-soft);margin:6px 0 2px 4px;}
  .oneoff{display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--tx);background:var(--bg);border:1px solid var(--line);border-radius:7px;padding:10px 12px;margin-bottom:18px;cursor:pointer;}
  .oneoff input{accent-color:var(--amber);width:15px;height:15px;}
  .fsection2{margin-bottom:18px;}
  .ttl2{font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--amber);font-weight:700;margin-bottom:11px;}
  .fgrid2{display:grid;grid-template-columns:1fr 1fr;gap:13px 14px;align-items:start;}
  .hinttext{font-size:10.5px;color:var(--tx-faint);margin-top:3px;}
  .opt{color:var(--tx-faint);text-transform:none;letter-spacing:0;font-weight:400;}
  .cochk{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--tx-dim);font-weight:600;cursor:pointer;min-height:15px;}
  .cochk input{accent-color:var(--amber);width:14px;height:14px;}
  .cbx{position:relative;}
  .cbx input{width:100%;padding:8px 10px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--tx);font-size:13px;}
  .cbx input:focus{outline:none;border-color:var(--cyan);}
  .cbxpanel{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:40;max-height:220px;overflow-y:auto;
    background:var(--raised);border:1px solid var(--line);border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.5);padding:4px;}
  .cbxopt{padding:7px 9px;border-radius:5px;font-size:12.5px;cursor:pointer;color:var(--tx-dim);}
  .cbxopt:hover,.cbxopt.sel{background:var(--row);color:var(--tx);}
  .cbxnew{padding:7px 9px;border-radius:5px;font-size:12px;cursor:pointer;color:var(--good);display:flex;align-items:center;gap:6px;border-top:1px solid var(--line-soft);margin-top:2px;}
  .cbxnew:hover{background:var(--row);}
  .cbxwarn{font-size:11px;color:var(--amber);margin-top:5px;}
  .cbxwarn b{cursor:pointer;text-decoration:underline;}
  .cbxwarn .usehint{color:var(--tx-faint);}
`;

/* ==================================================================
   Small shared components
================================================================== */
function CarPlan({ corners, highlights }) {
  // corners: {FL:[{label,val,changed}], ...}
  const pos = { FL: { top: 40, left: 0 }, FR: { top: 40, right: 0 }, RL: { bottom: 40, left: 0 }, RR: { bottom: 40, right: 0 } };
  return (
    <div className="planwrap">
      <svg viewBox="0 0 210 300" width="210" height="300" style={{ position: "absolute", inset: 0 }}>
        <defs><linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#232A30" /><stop offset="1" stopColor="#1A2025" /></linearGradient></defs>
        <path d="M105 18 C70 20 58 60 56 110 L54 210 C54 258 72 282 105 284 C138 282 156 258 156 210 L154 110 C152 60 140 20 105 18 Z"
          fill="url(#body)" stroke="#3a444d" strokeWidth="2" />
        <ellipse cx="105" cy="150" rx="26" ry="40" fill="#141A1E" stroke="#2A3138" />
        {/* wheels */}
        {[["FL", 34, 66], ["FR", 176, 66], ["RL", 34, 234], ["RR", 176, 234]].map(([c, x, y]) => (
          <rect key={c} x={x - 11} y={y - 22} width="22" height="44" rx="6"
            fill={highlights && highlights[c] ? "#3a2c10" : "#0E1113"}
            stroke={highlights && highlights[c] ? "#F2A93B" : "#3a444d"} strokeWidth="2" />
        ))}
      </svg>
      {CORNERS.map((c) => (
        <div key={c} className={"cornerbox" + (highlights && highlights[c] ? " hl" : "")} style={pos[c]}>
          <div className="cn">{CORNER_LABEL[c]}</div>
          <div className="cv">{(corners[c] || []).map((ln, i) => (
            <div key={i} className={ln.changed ? "chg" : ""}>{ln.label}: {ln.val || "–"}</div>
          ))}</div>
        </div>
      ))}
    </div>
  );
}
function Balance({ value, onChange, readOnly }) {
  const labels = [["us", "US"], ["us", "us"], ["", "N"], ["os", "os"], ["os", "OS"]];
  return (
    <div className={"seg" + (readOnly ? " ro" : "")}>
      {[-2, -1, 0, 1, 2].map((v, i) => (
        <button key={v} className={labels[i][0] + (value === v ? " on" : "")} onClick={() => !readOnly && onChange(v)} disabled={readOnly}>{labels[i][1]}</button>
      ))}
    </div>
  );
}
function Sev({ value, onChange, readOnly }) {
  const opts = ["None", "Slight", "Mod", "Heavy"];
  return (
    <div className={"seg" + (readOnly ? " ro" : "")}>
      {opts.map((o, i) => <button key={o} className={value === i ? " on" : ""} onClick={() => !readOnly && onChange(i)} disabled={readOnly}>{o}</button>)}
    </div>
  );
}
const balText = (v) => v === 0 ? "Neutral" : (v < 0 ? "Understeer" : "Oversteer") + (Math.abs(v) > 1 ? " (strong)" : "");

/* ==================================================================
   APP
================================================================== */
export default function App() {
  const [db, setDb] = useState(null);
  const [nav, setNav] = useState({ view: "events" });
  const [q, setQ] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [compareSel, setCompareSel] = useState(null); // {carId, aId, bId}

  useEffect(() => { (async () => {
    try { let d = await loadDB(); if (!d) { d = seedDB(); } d = migrateSetups(ensureCatalog(d)); await saveDB(d); setDb(d); }
    catch (err) { console.error("DB init failed:", err); setDb({ carProfiles: [], events: [], catalog: { series: [], oneoffs: [], circuits: [], drivers: [] } }); }
  })(); }, []);
  const commit = (next) => { setDb(next); saveDB(next); };
  const go = (partial) => setNav((n) => ({ ...n, ...partial }));

  if (!db) return <div className="tsd"><style>{CSS}</style><div className="empty">Opening database…</div></div>;
  U_STATE = makeUnits(db.settings);
  APP_DIR = (db.settings && db.settings.appDir) || APP_DIR;

  const carById = (id) => db.carProfiles.find((c) => c.id === id);
  const eventById = (id) => db.events.find((e) => e.id === id);

  /* ---------- mutations ---------- */
  const saveCar = (car) => {
    const exists = db.carProfiles.some((c) => c.id === car.id);
    commit({ ...db, carProfiles: exists ? db.carProfiles.map((c) => c.id === car.id ? car : c) : [...db.carProfiles, car] });
  };
  const deleteCar = (id) => {
    commit({ ...db, carProfiles: db.carProfiles.filter((c) => c.id !== id) }); go({ view: "cars", carId: null });
  };
  const saveEvent = (ev) => {
    const exists = db.events.some((e) => e.id === ev.id);
    commit({ ...db, events: exists ? db.events.map((e) => e.id === ev.id ? ev : e) : [...db.events, ev] });
  };
  const deleteEvent = (id) => { commit({ ...db, events: db.events.filter((e) => e.id !== id) }); go({ view: "events", eventId: null }); };

  /* ---------- flat session list for DB view ---------- */
  const flatSessions = db.events.flatMap((e) => e.sessions.map((s) => ({ s, e, car: carById(e.carProfileId) })));

  return (
    <div className={"tsd" + (db.settings && db.settings.theme === "light" ? " light" : "")}>
      <style>{CSS}</style>
      <div className="topbar">
        <div className="brand"><Gauge size={18} color="var(--amber)" /> DELTA&nbsp;DATABASE <span className="previewtag">Preview</span></div>
        <div className="nav">
          <button className={nav.view === "events" ? "on" : ""} onClick={() => go({ view: "events", eventId: null })}><CalendarDays size={15} /> Events</button>
          <button className={nav.view === "cars" ? "on" : ""} onClick={() => go({ view: "cars", carId: null })}><Car size={15} /> Cars</button>
          <button className={nav.view === "db" ? "on" : ""} onClick={() => go({ view: "db" })}><Database size={15} /> Database</button>
          <button className={nav.view === "settings" ? "on" : ""} onClick={() => go({ view: "settings" })}><SlidersHorizontal size={15} /> Settings</button>
        </div>
        <span className="sp" />
        <div className="searchwrap"><Search size={15} /><input className="search" placeholder="Search everything…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="btn ghost" onClick={() => setShowImport(true)}><Upload size={14} /> Import .ld</button>
      </div>

      <div className="wrap">
        {nav.view === "events" && !nav.eventId && (
          <EventsList db={db} carById={carById} onOpen={(id) => go({ view: "events", eventId: id })}
            onNew={() => go({ view: "eventNew" })} q={q} onCommit={commit} />
        )}
        {nav.view === "eventNew" && (
          <EventEditor db={db} onCancel={() => go({ view: "events" })}
            onSave={(ev, catalog) => { commit({ ...db, events: [...db.events, ev], catalog: catalog || db.catalog }); go({ view: "events", eventId: ev.id }); }} />
        )}
        {nav.view === "events" && nav.eventId && (
          <EventDetail db={db} ev={eventById(nav.eventId)} car={carById(eventById(nav.eventId).carProfileId)}
            onBack={() => go({ eventId: null })} onSave={saveEvent} onDelete={() => deleteEvent(nav.eventId)}
            onEditSave={(ev, catalog) => commit({ ...db, events: db.events.map((e) => e.id === ev.id ? ev : e), catalog: catalog || db.catalog })}
            onSaveCarSetup={(carId, setup) => commit({ ...db, carProfiles: db.carProfiles.map((c) => c.id === carId ? { ...c, setups: [...c.setups, setup] } : c) })}
            onOpenCar={(carId) => go({ view: "cars", carId, carTab: "tyres", fromEvent: nav.eventId })}
            onRotate={(carId, bank, loose, ev2) => commit({ ...db, carProfiles: db.carProfiles.map((c) => c.id === carId ? { ...c, tyreBank: bank, looseTyres: loose } : c), events: db.events.map((e) => e.id === ev2.id ? ev2 : e) })}
            onSaveCarTyres={(carId, bank) => commit({ ...db, carProfiles: db.carProfiles.map((c) => c.id === carId ? { ...c, tyreBank: bank } : c) })}
            onCompare={(carId, aId, bId) => { setCompareSel({ carId, aId, bId }); go({ view: "compare" }); }} />
        )}
        {nav.view === "cars" && !nav.carId && (
          <CarsList db={db} onOpen={(id) => go({ view: "cars", carId: id, carTab: "details", fromEvent: null })} onNew={() => go({ view: "carNew", fromEvent: null })} />
        )}
        {(nav.view === "carNew" || (nav.view === "cars" && nav.carId)) && (
          <CarProfileEditor car={nav.view === "carNew" ? null : carById(nav.carId)} db={db} initialTab={nav.carTab}
            onCancel={() => go({ view: "cars", carId: null, fromEvent: null })}
            backToEvent={nav.fromEvent ? () => go({ view: "events", eventId: nav.fromEvent, fromEvent: null }) : null}
            onChange={(car) => saveCar(car)}
            onDelete={nav.carId ? () => deleteCar(nav.carId) : null}
            onCompare={(carId, aId, bId) => { setCompareSel({ carId, aId, bId }); go({ view: "compare" }); }} />
        )}
        {nav.view === "db" && (
          <DatabaseView flat={flatSessions} q={q} onOpen={(eid) => go({ view: "events", eventId: eid })} />
        )}
        {nav.view === "settings" && (
          <SettingsView settings={db.settings} db={db} onChange={(st) => commit({ ...db, settings: st })} onImport={(data) => commit(migrateSetups(ensureCatalog(data)))} />
        )}
        {nav.view === "compare" && compareSel && (
          <CompareView car={carById(compareSel.carId)} sel={compareSel} db={db}
            onBack={() => go({ view: "cars", carId: compareSel.carId })} />
        )}
      </div>

      {showImport && <ImportModal db={db} onClose={() => setShowImport(false)} onSaveMap={saveCar} />}
    </div>
  );
}

/* ================= EVENTS ================= */
function FilterDropdown({ label, options, selected, onChange, disabled, disabledHint }) {
  const [open, setOpen] = useState(false);
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="fdd">
      <button className={"fbtn" + (selected.length ? " active" : "") + (disabled ? " disabled" : "")}
        title={disabled ? disabledHint : undefined} onClick={() => { if (!disabled) setOpen((o) => !o); }}>
        {label}{selected.length > 0 && <span className="fcount">{selected.length}</span>}<ChevronDown size={13} />
      </button>
      {open && !disabled && (<>
        <div className="fddscrim" onClick={() => setOpen(false)} />
        <div className="fddpanel">
          <div className="fddhead"><span>{label}</span>{selected.length > 0 && <span className="clearf" onClick={() => onChange([])}>clear</span>}</div>
          {options.length === 0 ? <div className="fddempty">No options</div> :
            options.map((o) => (
              <label key={o} className={"chk" + (selected.includes(o) ? " on" : "")}>
                <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} />{o}
              </label>
            ))}
        </div>
      </>)}
    </div>
  );
}

function MonthPicker({ selected, onChange, initialYear }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(initialYear);
  const lbl = (m) => `${MONTHS[m]} ${year}`;
  const toggle = (m) => { const v = lbl(m); onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]); };
  return (
    <div className="fdd">
      <button className={"fbtn" + (selected.length ? " active" : "")} onClick={() => setOpen((o) => !o)}>
        Date{selected.length > 0 && <span className="fcount">{selected.length}</span>}<ChevronDown size={13} />
      </button>
      {open && (<>
        <div className="fddscrim" onClick={() => setOpen(false)} />
        <div className="fddpanel calpanel">
          <div className="calnav">
            <button onClick={() => setYear((y) => y - 1)}><ChevronLeft size={16} /></button>
            <span>{year}</span>
            <button onClick={() => setYear((y) => y + 1)}><ChevronRight size={16} /></button>
          </div>
          <div className="calgrid">{MONTHS.map((m, i) => (
            <button key={m} className={"calm" + (selected.includes(lbl(i)) ? " on" : "")} onClick={() => toggle(i)}>{m}</button>
          ))}</div>
          {selected.length > 0 && <div className="calfoot"><span className="clearf" onClick={() => onChange([])}>clear all</span></div>}
        </div>
      </>)}
    </div>
  );
}

function TrackFilter({ layoutsByTrack, tracks, setTracks, layouts, setLayouts }) {
  const [open, setOpen] = useState(false);
  const trackList = Object.keys(layoutsByTrack).sort();
  const lkey = (t, l) => `${t}::${l}`;
  const toggleTrack = (t) => {
    if (tracks.includes(t)) { setTracks(tracks.filter((x) => x !== t)); setLayouts(layouts.filter((k) => !k.startsWith(t + "::"))); }
    else setTracks([...tracks, t]);
  };
  const toggleLayout = (t, l) => { const k = lkey(t, l); setLayouts(layouts.includes(k) ? layouts.filter((x) => x !== k) : [...layouts, k]); };
  const count = tracks.length;
  return (
    <div className="fdd">
      <button className={"fbtn" + (count ? " active" : "")} onClick={() => setOpen((o) => !o)}>
        Track{count > 0 && <span className="fcount">{count}</span>}<ChevronDown size={13} />
      </button>
      {open && (<>
        <div className="fddscrim" onClick={() => setOpen(false)} />
        <div className="fddpanel">
          <div className="fddhead"><span>Track</span>{(tracks.length || layouts.length) > 0 && <span className="clearf" onClick={() => { setTracks([]); setLayouts([]); }}>clear</span>}</div>
          {trackList.map((t) => {
            const ls = [...layoutsByTrack[t]].sort(); const on = tracks.includes(t);
            return (
              <div key={t}>
                <label className={"chk" + (on ? " on" : "")}><input type="checkbox" checked={on} onChange={() => toggleTrack(t)} />{t}</label>
                {on && ls.length > 1 && (
                  <div className="sublayouts">
                    {ls.map((l) => (
                      <label key={l} className={"chk sub" + (layouts.includes(lkey(t, l)) ? " on" : "")}>
                        <input type="checkbox" checked={layouts.includes(lkey(t, l))} onChange={() => toggleLayout(t, l)} />{l}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>)}
    </div>
  );
}

function EventTypeFilter({ cat, types, setTypes, subs, setSubs }) {
  const [open, setOpen] = useState(false);
  const childrenFor = (t) => t === "series" ? [...(cat.series || [])].sort() : t === "oneoff" ? [...(cat.oneoffs || [])].sort() : [];
  const toggleType = (t) => {
    if (types.includes(t)) { setTypes(types.filter((x) => x !== t)); setSubs(subs.filter((k) => !k.startsWith(t + "::"))); }
    else setTypes([...types, t]);
  };
  const skey = (t, v) => `${t}::${v}`;
  const toggleSub = (t, v) => { const k = skey(t, v); setSubs(subs.includes(k) ? subs.filter((x) => x !== k) : [...subs, k]); };
  const count = types.length;
  return (
    <div className="fdd">
      <button className={"fbtn" + (count ? " active" : "")} onClick={() => setOpen((o) => !o)}>
        Type{count > 0 && <span className="fcount">{count}</span>}<ChevronDown size={13} />
      </button>
      {open && (<>
        <div className="fddscrim" onClick={() => setOpen(false)} />
        <div className="fddpanel">
          <div className="fddhead"><span>Event type</span>{(types.length || subs.length) > 0 && <span className="clearf" onClick={() => { setTypes([]); setSubs([]); }}>clear</span>}</div>
          {EVENT_TYPES.map(([t, label]) => {
            const on = types.includes(t); const kids = childrenFor(t);
            return (
              <div key={t}>
                <label className={"chk" + (on ? " on" : "")}><input type="checkbox" checked={on} onChange={() => toggleType(t)} />{label}</label>
                {on && kids.length > 0 && (
                  <div className="sublayouts">
                    {kids.map((v) => (
                      <label key={v} className={"chk sub" + (subs.includes(skey(t, v)) ? " on" : "")}>
                        <input type="checkbox" checked={subs.includes(skey(t, v))} onChange={() => toggleSub(t, v)} />{v}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>)}
    </div>
  );
}

function EventsList({ db, carById, onOpen, onNew, q, onCommit }) {
  const [view, setView] = useState("grid");
  const [showManage, setShowManage] = useState(false);
  const [fDate, setFDate] = useState([]);
  const [fTypes, setFTypes] = useState([]);
  const [fSubs, setFSubs] = useState([]);
  const [fTrack, setFTrack] = useState([]);
  const [fLayout, setFLayout] = useState([]);
  const [fCar, setFCar] = useState([]);
  const [fDriver, setFDriver] = useState([]);
  const [fSetup, setFSetup] = useState([]);

  const eventDrivers = (e) => { const s = new Set(); if (e.driver) s.add(e.driver); if (e.coDriver) s.add(e.coDriver); e.sessions.forEach((x) => x.driver && s.add(x.driver)); return [...s]; };
  const baselineName = (e) => { const c = carById(e.carProfileId); const su = c?.setups.find((x) => x.id === e.baseSetupId); return su ? su.name : ""; };
  const ymKey = (e) => (e.startDate || "").slice(0, 7);
  const ymLabel = (ym) => { const [y, m] = ym.split("-"); return m ? `${MONTHS[+m - 1]} ${y}` : y; };
  const uniq = (a) => [...new Set(a.filter(Boolean))].sort();
  const bestLap = (e) => { const b = e.sessions.map((s) => lapToSec(s.performance.bestLap)).filter((x) => isFinite(x)).sort((m, n) => m - n)[0]; return b ? `${Math.floor(b / 60)}:${(b % 60).toFixed(3).padStart(6, "0")}` : "—"; };

  const layoutsByTrack = {};
  db.events.forEach((e) => { if (e.circuit) { (layoutsByTrack[e.circuit] = layoutsByTrack[e.circuit] || new Set()).add(e.config || "—"); } });
  const years = db.events.map((e) => +(e.startDate || "0").slice(0, 4)).filter(Boolean);
  const latestYear = years.length ? Math.max(...years) : new Date().getFullYear();
  const setupOptions = fCar.length ? uniq(db.carProfiles.filter((c) => fCar.includes(c.name)).flatMap((c) => c.setups.map((s) => s.name))) : [];
  const rm = (arr, set, v) => () => set(arr.filter((x) => x !== v));

  const filters = [
    { key: "date", clear: () => setFDate([]),
      match: (e) => !fDate.length || fDate.includes(ymLabel(ymKey(e))),
      control: <MonthPicker key="date" selected={fDate} onChange={setFDate} initialYear={latestYear} />,
      chips: fDate.map((v) => ({ label: "Date", value: v, onRemove: rm(fDate, setFDate, v) })) },
    { key: "type", clear: () => { setFTypes([]); setFSubs([]); },
      match: (e) => {
        if (fTypes.length && !fTypes.includes(e.eventType)) return false;
        if (e.eventType === "series") { const s = fSubs.filter((k) => k.startsWith("series::")); if (s.length && !s.includes("series::" + e.series)) return false; }
        if (e.eventType === "oneoff") { const s = fSubs.filter((k) => k.startsWith("oneoff::")); if (s.length && !s.includes("oneoff::" + e.oneoffName)) return false; }
        return true;
      },
      control: <EventTypeFilter key="type" cat={db.catalog || {}} types={fTypes} setTypes={setFTypes} subs={fSubs} setSubs={setFSubs} />,
      chips: [...fTypes.map((t) => ({ label: "Type", value: EVENT_TYPES.find((x) => x[0] === t)?.[1] || t, onRemove: () => { setFTypes(fTypes.filter((x) => x !== t)); setFSubs(fSubs.filter((k) => !k.startsWith(t + "::"))); } })),
              ...fSubs.map((k) => ({ label: k.startsWith("series::") ? "Series" : "One-off", value: k.split("::")[1], onRemove: rm(fSubs, setFSubs, k) }))] },
    { key: "track", clear: () => { setFTrack([]); setFLayout([]); },
      match: (e) => {
        if (fTrack.length && !fTrack.includes(e.circuit)) return false;
        const selForT = fLayout.filter((k) => k.startsWith(e.circuit + "::"));
        if (selForT.length && !selForT.includes(`${e.circuit}::${e.config || "—"}`)) return false;
        return true;
      },
      control: <TrackFilter key="track" layoutsByTrack={layoutsByTrack} tracks={fTrack} setTracks={setFTrack} layouts={fLayout} setLayouts={setFLayout} />,
      chips: [...fTrack.map((v) => ({ label: "Track", value: v, onRemove: () => { setFTrack(fTrack.filter((x) => x !== v)); setFLayout(fLayout.filter((k) => !k.startsWith(v + "::"))); } })),
              ...fLayout.map((k) => ({ label: "Layout", value: k.split("::")[1], onRemove: rm(fLayout, setFLayout, k) }))] },
    { key: "car", clear: () => { setFCar([]); setFSetup([]); },
      match: (e) => !fCar.length || fCar.includes(carById(e.carProfileId)?.name),
      control: <FilterDropdown key="car" label="Car" options={uniq(db.events.map((e) => carById(e.carProfileId)?.name))} selected={fCar}
        onChange={(v) => { setFCar(v); const allowed = db.carProfiles.filter((c) => v.includes(c.name)).flatMap((c) => c.setups.map((s) => s.name)); setFSetup((prev) => prev.filter((s) => allowed.includes(s))); }} />,
      chips: fCar.map((v) => ({ label: "Car", value: v, onRemove: () => { setFCar(fCar.filter((x) => x !== v)); setFSetup([]); } })) },
    { key: "driver", clear: () => setFDriver([]),
      match: (e) => !fDriver.length || eventDrivers(e).some((d) => fDriver.includes(d)),
      control: <FilterDropdown key="driver" label="Driver" options={uniq(db.events.flatMap(eventDrivers))} selected={fDriver} onChange={setFDriver} />,
      chips: fDriver.map((v) => ({ label: "Driver", value: v, onRemove: rm(fDriver, setFDriver, v) })) },
    { key: "setup", clear: () => setFSetup([]),
      match: (e) => !fSetup.length || fSetup.includes(baselineName(e)),
      control: <FilterDropdown key="setup" label="Setup" options={setupOptions} selected={fSetup} onChange={setFSetup} disabled={fCar.length === 0} disabledHint="Select a car first to filter by its setups" />,
      chips: fSetup.map((v) => ({ label: "Setup", value: v, onRemove: rm(fSetup, setFSetup, v) })) },
  ];

  const evs = db.events.filter((e) => {
    for (const f of filters) if (!f.match(e)) return false;
    if (q && !((eventTitle(e) + " " + eventGroup(e) + " " + e.circuit + " " + (e.oneoffName || "")).toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });
  const chips = filters.flatMap((f) => f.chips);
  const clearAll = () => filters.forEach((f) => f.clear());

  return (
    <>
      <div className="pagehead">
        <h1>Events</h1><span className="sub">{evs.length} of {db.events.length}</span>
        <span className="sp" />
        <div className="viewtoggle">
          <button className={view === "list" ? "on" : ""} title="List with details" onClick={() => setView("list")}><List size={15} /></button>
          <button className={view === "grid" ? "on" : ""} title="Thumbnails" onClick={() => setView("grid")}><LayoutGrid size={15} /></button>
        </div>
        <button className="btn ghost" onClick={() => setShowManage(true)}><Tag size={14} /> Manage names</button>
        <button className="btn primary" onClick={onNew}><Plus size={15} /> New event</button>
      </div>

      <div className="filterbar">
        {filters.map((f) => f.control)}
        {chips.length > 0 && <button className="btn ghost sm" onClick={clearAll}>Clear all</button>}
      </div>
      {chips.length > 0 && (
        <div className="chiprow">
          {chips.map((c, i) => (
            <span className="chip" key={c.label + c.value + i}><span className="g">{c.label}:</span> {c.value}
              <button onClick={c.onRemove}><X size={12} /></button></span>
          ))}
        </div>
      )}

      {evs.length === 0 ? <div className="empty">No events meet the filter selection.</div> : view === "grid" ? (
        <div className="cards">
          {evs.map((e) => { const car = carById(e.carProfileId);
            return (
              <div key={e.id} className="card thumb" onClick={() => onOpen(e.id)}>
                <div className="band"><span className="elabel"><span className="g">{eventGroup(e)}</span>{eventInfo(e) && <span className="t"> · {eventInfo(e)}</span>}</span><Gauge size={20} color="var(--tx-faint)" /></div>
                <div className="meta">{e.circuit}{e.config ? ` · ${e.config}` : ""} · {e.startDate}</div>
                <div className="row">
                  <div className="stat"><span className="v">{e.sessions.length}</span><span className="k">Sessions</span></div>
                  <div className="stat"><span className="v num">{bestLap(e)}</span><span className="k">Best lap</span></div>
                  <div className="stat"><span className="v txt">{car ? car.name : "—"}</span><span className="k">Car</span></div>
                  <div className="stat"><span className="v txt">{eventDrivers(e)[0] || "—"}</span><span className="k">Driver</span></div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <table className="tbl">
          <thead><tr><th>Event</th><th>Track</th><th>Date</th><th>Car</th><th>Driver</th><th>Baseline setup</th><th className="r">Sessions</th><th className="r">Best lap</th></tr></thead>
          <tbody>{evs.map((e) => { const car = carById(e.carProfileId);
            return (
              <tr key={e.id} className="evrow" onClick={() => onOpen(e.id)}>
                <td><div className="ev-name"><span className="g">{eventGroup(e)}</span>{eventInfo(e) && <span className="t"> · {eventInfo(e)}</span>}</div></td>
                <td>{e.circuit}{e.config ? <div style={{ color: "var(--tx-faint)", fontSize: 11 }}>{e.config}</div> : null}</td>
                <td className="num" style={{ color: "var(--tx-dim)" }}>{e.startDate}</td>
                <td>{car ? car.name : "—"}</td>
                <td>{eventDrivers(e).join(", ") || "—"}</td>
                <td style={{ color: "var(--tx-dim)" }}>{baselineName(e) || "—"}</td>
                <td className="r num">{e.sessions.length}</td>
                <td className="r num" style={{ color: "var(--amber)", fontWeight: 600 }}>{bestLap(e)}</td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
      {showManage && <ManageNamesModal db={db} onClose={() => setShowManage(false)} onCommit={onCommit} />}
    </>
  );
}

function NameRow({ name, count, others, onRename, onMerge, onDelete }) {
  const [text, setText] = useState(name);
  useEffect(() => { setText(name); }, [name]);
  const [mergeTo, setMergeTo] = useState("");
  return (
    <div className="nrow">
      <input className="nrename" value={text} onChange={(e) => setText(e.target.value)}
        onBlur={() => { const t = text.trim(); if (t && t !== name) onRename(t); else setText(name); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      <span className="ncount">{count} {count === 1 ? "event" : "events"}</span>
      <select className="nmerge" value="" onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) setMergeTo(v); }}>
        <option value="">Merge into…</option>
        {others.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <button className="iconbtn" disabled={count > 0} title={count > 0 ? "In use — merge instead of deleting" : "Delete"} onClick={onDelete}><Trash2 size={14} /></button>
      {mergeTo && <ConfirmModal title="Merge names?" message={`Merge “${name}” into “${mergeTo}”? All ${count} event(s) using it will be reassigned, and “${name}” removed.`} confirmLabel="Merge" onConfirm={() => { onMerge(mergeTo); setMergeTo(""); }} onClose={() => setMergeTo("")} />}
    </div>
  );
}

function ManageNamesModal({ db, onClose, onCommit }) {
  const [tab, setTab] = useState("series");
  const cat = db.catalog || { series: [], oneoffs: [], circuits: [], drivers: [] };
  const clone = () => JSON.parse(JSON.stringify(db));
  const uniqArr = (a) => [...new Set(a)];

  const seriesCount = (n) => db.events.filter((e) => e.series === n).length;
  const oneoffCount = (n) => db.events.filter((e) => e.oneoffName === n).length;
  const driverCount = (n) => db.events.filter((e) => e.driver === n || e.coDriver === n || e.sessions.some((s) => s.driver === n)).length;
  const circuitCount = (n) => db.events.filter((e) => e.circuit === n).length;
  const layoutCount = (cn, l) => db.events.filter((e) => e.circuit === cn && e.config === l).length;

  const renameSeries = (o, n) => { const d = clone(); d.catalog.series = uniqArr(d.catalog.series.map((s) => s === o ? n : s)); d.events.forEach((e) => { if (e.series === o) e.series = n; }); onCommit(d); };
  const mergeSeries = (from, into) => { const d = clone(); d.events.forEach((e) => { if (e.series === from) e.series = into; }); d.catalog.series = d.catalog.series.filter((s) => s !== from); onCommit(d); };
  const delSeries = (n) => { const d = clone(); d.catalog.series = d.catalog.series.filter((s) => s !== n); onCommit(d); };

  const renameOneoff = (o, n) => { const d = clone(); d.catalog.oneoffs = uniqArr((d.catalog.oneoffs || []).map((s) => s === o ? n : s)); d.events.forEach((e) => { if (e.oneoffName === o) e.oneoffName = n; }); onCommit(d); };
  const mergeOneoff = (from, into) => { const d = clone(); d.events.forEach((e) => { if (e.oneoffName === from) e.oneoffName = into; }); d.catalog.oneoffs = (d.catalog.oneoffs || []).filter((s) => s !== from); onCommit(d); };
  const delOneoff = (n) => { const d = clone(); d.catalog.oneoffs = (d.catalog.oneoffs || []).filter((s) => s !== n); onCommit(d); };

  const renameDriver = (o, n) => { const d = clone(); d.catalog.drivers = uniqArr(d.catalog.drivers.map((x) => x === o ? n : x)); d.events.forEach((e) => { if (e.driver === o) e.driver = n; if (e.coDriver === o) e.coDriver = n; e.sessions.forEach((s) => { if (s.driver === o) s.driver = n; }); }); onCommit(d); };
  const mergeDriver = (from, into) => { const d = clone(); d.events.forEach((e) => { if (e.driver === from) e.driver = into; if (e.coDriver === from) e.coDriver = into; e.sessions.forEach((s) => { if (s.driver === from) s.driver = into; }); }); d.catalog.drivers = d.catalog.drivers.filter((x) => x !== from); onCommit(d); };
  const delDriver = (n) => { const d = clone(); d.catalog.drivers = d.catalog.drivers.filter((x) => x !== n); onCommit(d); };

  const renameCircuit = (o, n) => { const d = clone(); const c = d.catalog.circuits.find((c) => c.name === o); if (c) c.name = n; d.events.forEach((e) => { if (e.circuit === o) e.circuit = n; }); onCommit(d); };
  const mergeCircuit = (from, into) => { const d = clone(); const cf = d.catalog.circuits.find((c) => c.name === from), ci = d.catalog.circuits.find((c) => c.name === into); if (cf && ci) cf.layouts.forEach((l) => { if (!ci.layouts.includes(l)) ci.layouts.push(l); }); d.catalog.circuits = d.catalog.circuits.filter((c) => c.name !== from); d.events.forEach((e) => { if (e.circuit === from) e.circuit = into; }); onCommit(d); };
  const delCircuit = (n) => { const d = clone(); d.catalog.circuits = d.catalog.circuits.filter((c) => c.name !== n); onCommit(d); };
  const renameLayout = (cn, o, n) => { const d = clone(); const c = d.catalog.circuits.find((c) => c.name === cn); if (c) c.layouts = uniqArr(c.layouts.map((l) => l === o ? n : l)); d.events.forEach((e) => { if (e.circuit === cn && e.config === o) e.config = n; }); onCommit(d); };
  const mergeLayout = (cn, from, into) => { const d = clone(); const c = d.catalog.circuits.find((c) => c.name === cn); if (c) c.layouts = c.layouts.filter((l) => l !== from); d.events.forEach((e) => { if (e.circuit === cn && e.config === from) e.config = into; }); onCommit(d); };
  const delLayout = (cn, l) => { const d = clone(); const c = d.catalog.circuits.find((c) => c.name === cn); if (c) c.layouts = c.layouts.filter((x) => x !== l); onCommit(d); };

  return (
    <div className="ov">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2><Tag size={16} color="var(--amber)" /> Manage names</h2>
        <div className="msub">Rename or merge saved entries — changes apply across every event that uses them. Entries stay in your lists even when no event uses them.</div>
        <div className="nav" style={{ marginBottom: 14 }}>
          <button className={tab === "series" ? "on" : ""} onClick={() => setTab("series")}>Series</button>
          <button className={tab === "oneoffs" ? "on" : ""} onClick={() => setTab("oneoffs")}>One-offs</button>
          <button className={tab === "circuits" ? "on" : ""} onClick={() => setTab("circuits")}>Circuits &amp; layouts</button>
          <button className={tab === "drivers" ? "on" : ""} onClick={() => setTab("drivers")}>Drivers</button>
        </div>
        {tab === "series" && (cat.series.length ? [...cat.series].sort().map((s) => (
          <NameRow key={s} name={s} count={seriesCount(s)} others={cat.series.filter((x) => x !== s)}
            onRename={(n) => renameSeries(s, n)} onMerge={(t) => mergeSeries(s, t)} onDelete={() => delSeries(s)} />
        )) : <div className="fddempty">No series yet.</div>)}
        {tab === "oneoffs" && ((cat.oneoffs || []).length ? [...cat.oneoffs].sort().map((s) => (
          <NameRow key={s} name={s} count={oneoffCount(s)} others={cat.oneoffs.filter((x) => x !== s)}
            onRename={(n) => renameOneoff(s, n)} onMerge={(t) => mergeOneoff(s, t)} onDelete={() => delOneoff(s)} />
        )) : <div className="fddempty">No one-off events yet.</div>)}
        {tab === "drivers" && (cat.drivers.length ? [...cat.drivers].sort().map((dn) => (
          <NameRow key={dn} name={dn} count={driverCount(dn)} others={cat.drivers.filter((x) => x !== dn)}
            onRename={(n) => renameDriver(dn, n)} onMerge={(t) => mergeDriver(dn, t)} onDelete={() => delDriver(dn)} />
        )) : <div className="fddempty">No drivers yet.</div>)}
        {tab === "circuits" && (cat.circuits.length ? cat.circuits.map((c) => (
          <div className="circblock" key={c.name}>
            <NameRow name={c.name} count={circuitCount(c.name)} others={cat.circuits.map((x) => x.name).filter((x) => x !== c.name)}
              onRename={(n) => renameCircuit(c.name, n)} onMerge={(t) => mergeCircuit(c.name, t)} onDelete={() => delCircuit(c.name)} />
            <div className="layoutsub">
              {c.layouts.length ? c.layouts.map((l) => (
                <NameRow key={l} name={l} count={layoutCount(c.name, l)} others={c.layouts.filter((x) => x !== l)}
                  onRename={(n) => renameLayout(c.name, l, n)} onMerge={(t) => mergeLayout(c.name, l, t)} onDelete={() => delLayout(c.name, l)} />
              )) : <div className="fddempty" style={{ paddingLeft: 10 }}>No layouts.</div>}
            </div>
          </div>
        )) : <div className="fddempty">No circuits yet.</div>)}
        <div className="modrow"><button className="btn primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

function Combobox({ value, onChange, options, placeholder, allowNew = true }) {
  const [open, setOpen] = useState(false);
  const q = normName(value);
  const matches = options.filter((o) => normName(o).includes(q)).slice(0, 8);
  const exact = q !== "" && options.some((o) => normName(o) === q);
  const similar = !exact ? findSimilar(value, options) : null;
  const pick = (o) => { onChange(o); setOpen(false); };
  return (
    <div className="cbx">
      <input value={value || ""} placeholder={placeholder} onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 130)} />
      {open && (matches.length > 0 || (allowNew && value && !exact)) && (
        <div className="cbxpanel" onMouseDown={(e) => e.preventDefault()}>
          {matches.map((o) => <div key={o} className={"cbxopt" + (normName(o) === q ? " sel" : "")} onClick={() => pick(o)}>{o}</div>)}
          {allowNew && value && !exact && <div className="cbxnew" onClick={() => pick(value)}><Plus size={12} /> Add “{value}” as new</div>}
        </div>
      )}
      {similar && <div className="cbxwarn"><span>Similar exists:</span> <b onClick={() => pick(similar)}>{similar}</b> <span className="usehint">— click to use it</span></div>}
    </div>
  );
}

function EventEditor({ db, event, embedded, onCancel, onSave }) {
  const isEdit = !!event;
  const u = units();
  const [err, setErr] = useState("");
  const cat = db.catalog || { series: [], oneoffs: [], circuits: [], drivers: [] };
  const [etype, setEtype] = useState(event?.eventType || "series");
  const [series, setSeries] = useState(event?.series || ""); const [round, setRound] = useState(event?.round || ""); const [name, setName] = useState(event?.name || "");
  const [oneoffName, setOneoffName] = useState(event?.oneoffName || "");
  const [circuit, setCircuit] = useState(event?.circuit || ""); const [layout, setLayout] = useState(event?.config || "");
  const [trackLength, setTrackLength] = useState(event?.trackLength || "");
  const [driver, setDriver] = useState(event?.driver || ""); const [hasCo, setHasCo] = useState(!!event?.coDriver); const [coDriver, setCoDriver] = useState(event?.coDriver || "");
  const [startDate, setStart] = useState(event?.startDate || new Date().toISOString().slice(0, 10));
  const [carProfileId, setCar] = useState(event?.carProfileId || db.carProfiles[0]?.id || "");
  const [baseSetupId, setBase] = useState(event?.baseSetupId || db.carProfiles[0]?.setups[0]?.id || "");
  const car = db.carProfiles.find((c) => c.id === carProfileId);
  const firstCar = useRef(true);
  useEffect(() => { if (firstCar.current) { firstCar.current = false; return; } setBase(car?.setups[0]?.id || ""); }, [carProfileId]);

  const seriesOptions = [...cat.series].sort();
  const oneoffOptions = [...(cat.oneoffs || [])].sort();
  const circuitOptions = cat.circuits.map((c) => c.name).sort();
  const driverOptions = [...cat.drivers].sort();
  const layoutOptions = (cat.circuits.find((c) => c.name === circuit)?.layouts || []).slice().sort();

  const save = () => {
    if (!car) { setErr("Create a car profile first (Cars tab)."); return; }
    if (etype === "series" && !series.trim()) { setErr("Choose or add a series."); return; }
    if (etype === "oneoff" && !oneoffName.trim()) { setErr("Name the one-off event."); return; }
    setErr("");
    const nc = { series: [...cat.series], oneoffs: [...(cat.oneoffs || [])], circuits: cat.circuits.map((c) => ({ ...c, layouts: [...c.layouts] })), drivers: [...cat.drivers] };
    if (etype === "series" && series.trim() && !nc.series.includes(series.trim())) nc.series.push(series.trim());
    if (etype === "oneoff" && oneoffName.trim() && !nc.oneoffs.includes(oneoffName.trim())) nc.oneoffs.push(oneoffName.trim());
    [driver, hasCo ? coDriver : ""].forEach((d) => { if (d.trim() && !nc.drivers.includes(d.trim())) nc.drivers.push(d.trim()); });
    if (circuit.trim()) {
      let cc = nc.circuits.find((c) => c.name === circuit.trim());
      if (!cc) { cc = { name: circuit.trim(), layouts: [] }; nc.circuits.push(cc); }
      if (layout.trim() && !cc.layouts.includes(layout.trim())) cc.layouts.push(layout.trim());
    }
    const common = { eventType: etype,
      series: etype === "series" ? series.trim() : "", round: etype === "series" ? round.trim() : "",
      oneoffName: etype === "oneoff" ? oneoffName.trim() : "", name: name.trim(),
      circuit: circuit.trim(), config: layout.trim(), trackLength: String(trackLength).trim(), startDate, endDate: startDate,
      driver: driver.trim(), coDriver: hasCo ? coDriver.trim() : "" };
    if (isEdit) { onSave({ ...event, ...common }, nc); return; }
    const base = car.setups.find((s) => s.id === baseSetupId) || car.setups[0];
    const v0 = { id: uid(), label: base ? base.name : "Baseline", values: base ? JSON.parse(JSON.stringify(base.values)) : blankValues(car), changes: [], fromVersionId: null, atSession: null };
    onSave({ id: uid(), ...common, carProfileId, baseSetupId: base?.id || null, versions: [v0], setupValues: JSON.parse(JSON.stringify(v0.values)), timeline: [{ id: uid(), kind: "setup", label: "Baseline", date: startDate, note: "", values: JSON.parse(JSON.stringify(v0.values)) }], sessions: [] }, nc);
  };

  return (
    <div style={{ maxWidth: 620 }}>
      {!embedded && <div className="backrow"><button className="btn ghost" onClick={onCancel}><ArrowLeft size={14} /> Cancel</button><span className="eyebrow">New event</span></div>}
      <div className="panel">
        <div className="fsection2"><div className="ttl2">Event type</div>
          <div className="seg" style={{ maxWidth: 360 }}>
            {EVENT_TYPES.map(([t, label]) => <button key={t} className={etype === t ? "on" : ""} onClick={() => setEtype(t)}>{label}</button>)}
          </div>
        </div>

        <div className="fsection2"><div className="ttl2">{etype === "testing" ? "Test details" : etype === "oneoff" ? "One-off event" : "Series & round"}</div>
          {etype === "series" && (
            <div className="fgrid2">
              <div className="field"><label>Series</label><Combobox value={series} onChange={setSeries} options={seriesOptions} placeholder="NSW Production Sports" /></div>
              <div className="field"><label>Round</label><input value={round} onChange={(e) => setRound(e.target.value)} placeholder="3" /></div>
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>Event name <span className="opt">· optional</span></label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bathurst 12 Hour" />
                <span className="hinttext">Shown with the round, e.g. “Bathurst 12 Hour — Round 3”.</span></div>
            </div>
          )}
          {etype === "oneoff" && (
            <div className="fgrid2">
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>One-off event</label>
                <Combobox value={oneoffName} onChange={setOneoffName} options={oneoffOptions} placeholder="e.g. Bathurst 12 Hour" />
                <span className="hinttext">Recurring one-offs group under this name across years — pick an existing one or add new; the date tells instances apart.</span></div>
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>Instance name <span className="opt">· optional</span></label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="overrides the title if set" /></div>
            </div>
          )}
          {etype === "testing" && (
            <div className="fgrid2">
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>Test label <span className="opt">· optional</span></label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pre-season test" />
                <span className="hinttext">Testing events aren't grouped — they sit under “Testing”.</span></div>
            </div>
          )}
        </div>

        <div className="fsection2"><div className="ttl2">Venue &amp; car</div>
          <div className="fgrid2">
            <div className="field"><label>Circuit</label><Combobox value={circuit} onChange={(v) => { setCircuit(v); setLayout(""); }} options={circuitOptions} placeholder="Sydney Motorsport Park" /></div>
            <div className="field"><label>Layout</label><Combobox value={layout} onChange={setLayout} options={layoutOptions} placeholder={circuit ? "GP Circuit" : "choose a circuit first"} /></div>
            <div className="field"><label>Track length <span className="opt">· {u.distance.label}/lap</span></label><input className="num" value={u.distance.sel === "km" ? trackLength : u.distance.disp(trackLength)} onChange={(e) => setTrackLength(u.distance.sel === "km" ? e.target.value : String(u.distance.base(e.target.value)))} placeholder={u.distance.sel === "km" ? "e.g. 6.213" : "e.g. 3.86"} /></div>
            <div className="field"><label>Start date</label><input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="field"><label>Car{isEdit && <span className="opt"> · fixed after creation</span>}</label>
              <select value={carProfileId} onChange={(e) => setCar(e.target.value)} disabled={isEdit}>
                {db.carProfiles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                {db.carProfiles.length === 0 && <option value="">— none —</option>}
              </select></div>
            <div className="field" style={{ gridColumn: "1 / -1" }}><label>Baseline setup</label>
              <select value={baseSetupId} onChange={(e) => setBase(e.target.value)} disabled={isEdit}>
                {(car?.setups || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
          </div>
        </div>

        <div className="fsection2"><div className="ttl2">Drivers</div>
          <div className="fgrid2">
            <div className="field"><label>Primary driver</label><Combobox value={driver} onChange={setDriver} options={driverOptions} placeholder="J. Whitmore" /></div>
            <div className="field">
              <label className="cochk"><input type="checkbox" checked={hasCo} onChange={(e) => { setHasCo(e.target.checked); if (!e.target.checked) setCoDriver(""); }} /> Add co-driver</label>
              {hasCo && <Combobox value={coDriver} onChange={setCoDriver} options={driverOptions} placeholder="Second driver" />}
            </div>
          </div>
        </div>

        <div className="note">Series, circuit, layout and drivers come from your saved lists so names stay consistent. Type a new value to add it; type something close to an existing entry and you'll be nudged to reuse it.</div>
        {err && <div className="errmsg">{err}</div>}
        <div className="modrow"><button className="btn ghost" onClick={onCancel}>Cancel</button><button className="btn primary" onClick={save}><Save size={14} /> {isEdit ? "Save changes" : "Create event"}</button></div>
      </div>
    </div>
  );
}

function EventDetail({ db, ev, car, onBack, onSave, onEditSave, onSaveCarSetup, onRotate, onSaveCarTyres, onOpenCar, onDelete, onCompare }) {
  const [tab, setTab] = useState("sessions");
  const [savePrompt, setSavePrompt] = useState(false);
  const [treadModal, setTreadModal] = useState(false);
  const [editingSetup, setEditingSetup] = useState(false);
  const [draft, setDraft] = useState(null);
  const [changePrompt, setChangePrompt] = useState(false);
  const [confirmCfg, setConfirmCfg] = useState(null);
  const [rotateModal, setRotateModal] = useState(false);
  const timeline = ev.timeline || [];
  const applyRotation = (newBank, newLoose, changes) => {
    if (!changes.length) { setRotateModal(false); return; }
    const nev = { ...ev, timeline: [...timeline, { id: uid(), kind: "rotation", ts: Date.now(), date: new Date().toISOString().slice(0, 10), changes }] };
    onRotate(car.id, newBank, newLoose, nev);
    setRotateModal(false);
  };
  const tyresetF = allFields(car).find((x) => x.kind === "tyreset");
  const curTyreSet = tyresetF ? (car.tyreBank || []).find((s) => s.id === (ev.setupValues || {})[tyresetF.id]) : null;
  const [inspectTyre, setInspectTyre] = useState(null);
  const saveTyre = (tyreId, upd) => onSaveCarTyres(car.id, (car.tyreBank || []).map((s) => ({ ...s, tyres: s.tyres.map((t) => t.id === tyreId ? upd : t) })));
  const saveChange = (label) => { const entry = { id: uid(), kind: "setup", ts: Date.now(), label: label || "Setup change", date: new Date().toISOString().slice(0, 10), note: "", values: JSON.parse(JSON.stringify(draft || {})) }; onSave({ ...ev, setupValues: draft, timeline: [...timeline, entry] }); setChangePrompt(false); setEditingSetup(false); setDraft(null); };
  const addTread = (tread, note, points) => onSave({ ...ev, timeline: [...timeline, { id: uid(), kind: "tread", ts: Date.now(), date: new Date().toISOString().slice(0, 10), note, tread, points }] });
  const delEntry = (id) => onSave({ ...ev, timeline: timeline.filter((t) => t.id !== id) });
  const [editingSession, setEditingSession] = useState(null); // session obj or "new"
  const [adjustFrom, setAdjustFrom] = useState(null); // versionId to branch a setup change from
  const [detail, setDetail] = useState(null); // session id to view

  if (!car) return <div className="empty">Car profile missing.</div>;
  const latest = ev.versions[ev.versions.length - 1];
  const versionById = (id) => ev.versions.find((v) => v.id === id);

  const saveSession = (s) => {
    const exists = ev.sessions.some((x) => x.id === s.id);
    onSave({ ...ev, sessions: exists ? ev.sessions.map((x) => x.id === s.id ? s : x) : [...ev.sessions, s] });
    setEditingSession(null); setDetail(s.id);
  };
  const delSession = (id) => setConfirmCfg({ title: "Delete session?", message: "This session and its data will be permanently removed.", onConfirm: () => { onSave({ ...ev, sessions: ev.sessions.filter((s) => s.id !== id) }); setDetail(null); setConfirmCfg(null); } });

  const applySetupChange = (newValues, fromVersionId, atSession) => {
    const from = versionById(fromVersionId) || latest;
    const changes = diffSetups(car, from.values, newValues);
    if (changes.length === 0) { alert("No changes were made."); return; }
    const v = { id: uid(), label: `Change ${ev.versions.length}`, values: newValues, changes, fromVersionId: from.id, atSession: atSession || null };
    onSave({ ...ev, versions: [...ev.versions, v] });
    setAdjustFrom(null);
  };
  const saveVersionToLibrary = (version) => {
    const name = prompt("Save this setup to the car library as:", version.label === "Baseline" ? `${ev.circuit} baseline` : `${ev.circuit} ${version.label}`);
    if (!name) return;
    const setup = { id: uid(), name, basedOn: ev.baseSetupId, createdAt: Date.now(), values: JSON.parse(JSON.stringify(version.values)) };
    const nextCar = { ...car, setups: [...car.setups, setup] };
    onSave(ev); // no-op keep event
    // persist car via db mutation:
    const idx = db.carProfiles.findIndex((c) => c.id === car.id);
    db.carProfiles[idx] = nextCar; saveDB(db);
    alert(`Saved "${name}" to ${car.name}.`);
  };

  const detailSession = detail ? ev.sessions.find((s) => s.id === detail) : null;

  const RF = allFields(car);
  const startEntry = (ev.timeline || []).find((t) => t.kind === "setup");
  const startValues = startEntry ? startEntry.values : (ev.setupValues || {});
  const printSetup = (values) => {
    const cornerF = RF.filter((f) => fieldZone(f) === "corner" && !isSpecial(f));
    const damperF = RF.filter((f) => f.kind === "damper");
    const cwF = RF.find((f) => f.kind === "cornerweight");
    const perCorner = [...cornerF, ...damperF, ...(cwF && car.cwOn ? [cwF] : [])];
    const front = RF.filter((f) => fieldZone(f) === "front" && !isSpecial(f));
    const rear = RF.filter((f) => fieldZone(f) === "rear" && !isSpecial(f));
    const glob = RF.filter((f) => fieldZone(f) === "global" && !isSpecial(f));
    const tsF = RF.find((f) => f.kind === "tyreset");
    const set = tsF ? (car.tyreBank || []).find((x) => x.id === values[tsF.id]) : null;
    const gv2 = (f, cn) => { const v = values[f.id]; return cn ? ((v || {})[cn] ?? "") : (v ?? ""); };
    const singles = [
      ...front.map((f) => [`Front · ${f.label}`, gv2(f), f.unit]),
      ...rear.map((f) => [`Rear · ${f.label}`, gv2(f), f.unit]),
      ...glob.map((f) => [f.label, gv2(f), f.unit]),
      ...(set ? [["Tyre set", `${setLabel(set)} · ${set.brand} ${set.compound}`, ""], ...(set.optimumHot ? [["Optimum hot", units().pressure.disp(set.optimumHot), units().pressure.label]] : [])] : []),
    ];
    return (<><table className="ptbl"><thead><tr><th>Adjustment</th><th>FL</th><th>FR</th><th>RL</th><th>RR</th></tr></thead>
      <tbody>{perCorner.map((f) => <tr key={f.id}><td>{f.label}{f.unit ? ` (${f.unit})` : ""}</td>{CORNERS.map((cn) => <td key={cn}>{gv2(f, cn) || "–"}</td>)}</tr>)}</tbody></table>
      <table className="ptbl2"><tbody>{singles.map(([l, v, u], i) => <tr key={i}><td>{l}</td><td>{(v || "–") + (u && v ? ` ${u}` : "")}</td></tr>)}</tbody></table></>);
  };
  const repItems = (() => {
    const keyOf = (x) => x.ts != null ? x.ts : (Date.parse(`${x.date || "1970-01-01"}T${x.time || "00:00"}`) || Date.parse(x.date || "1970-01-01") || 0);
    const items = [
      ...(ev.timeline || []).filter((e) => e.kind !== "tread").map((e) => ({ sort: keyOf(e), kind: e.kind, entry: e })),
      ...(ev.sessions || []).map((s) => ({ sort: keyOf({ ts: s.ts, date: s.date, time: s.timeOfDay }), kind: "session", session: s })),
    ].sort((a, b) => a.sort - b.sort);
    let prev = null;
    return items.map((it) => { if (it.kind === "setup") { const diff = prev ? setupDiff(car, prev.values, it.entry.values) : null; prev = it.entry; return { ...it, diff }; } return it; });
  })();
  const usedSets = Array.from(new Set((ev.sessions || []).map((s) => s.tyres.tyreSetId).filter(Boolean))).map((id) => (car.tyreBank || []).find((x) => x.id === id)).filter(Boolean);

  return (
    <div>
      <div className="backrow">
        <button className="btn ghost" onClick={onBack}><ArrowLeft size={14} /> Events</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm" onClick={() => setTimeout(() => window.print(), 60)} title="Print / save as PDF for the client"><FileDown size={13} /> Export report</button>
          <button className="btn danger sm" onClick={() => setConfirmCfg({ title: "Delete event?", message: "This event, all its sessions and its setup timeline will be permanently removed. This can't be undone.", confirmLabel: "Delete event", onConfirm: () => { setConfirmCfg(null); onDelete(); } })}><Trash2 size={13} /> Delete event</button>
        </div>
      </div>
      <div className="pagehead">
        <div><h1>{eventTitle(ev)}</h1><div className="sub">{eventGroup(ev)}{ev.circuit ? ` · ${ev.circuit}` : ""}{ev.config ? ` · ${ev.config}` : ""} · {ev.startDate} · {car.name}{ev.driver ? ` · ${ev.driver}${ev.coDriver ? ` / ${ev.coDriver}` : ""}` : ""}</div></div>
      </div>
      <div className="nav" style={{ marginBottom: 16 }}>
        <button className={tab === "sessions" ? "on" : ""} onClick={() => setTab("sessions")}><Layers size={14} /> Sessions</button>
        <button className={tab === "setup" ? "on" : ""} onClick={() => setTab("setup")}><Gauge size={14} /> Setup</button>
        <button className={tab === "timeline" ? "on" : ""} onClick={() => setTab("timeline")}><Clock size={14} /> Timeline</button>
        <button className={tab === "tyres" ? "on" : ""} onClick={() => setTab("tyres")}><Disc size={14} /> Tyre bank</button>
        <button className={tab === "edit" ? "on" : ""} onClick={() => setTab("edit")}><Pencil size={14} /> Edit details</button>
      </div>

      {tab === "edit" && (
        <EventEditor db={db} event={ev} embedded onCancel={() => setTab("sessions")}
          onSave={(ev2, cat) => { onEditSave(ev2, cat); setTab("sessions"); }} />
      )}

      {tab === "sessions" && !detailSession && (
        <>
          <div style={{ display: "flex", marginBottom: 12 }}>
            <span className="sp" />
            <button className="btn primary" onClick={() => setEditingSession("new")}><Plus size={15} /> Add session</button>
          </div>
          {ev.sessions.length === 0 ? <div className="empty">No sessions yet — add the first one.</div> : (
            <table className="tbl">
              <thead><tr><th>Session</th><th>Date</th><th>Driver</th><th>Setup</th><th className="r">Amb</th><th className="r">Trk</th><th className="r">Best lap</th><th>Balance</th></tr></thead>
              <tbody>{ev.sessions.map((s) => {
                const v = versionById(s.versionId);
                return (
                  <tr key={s.id} onClick={() => setDetail(s.id)}>
                    <td><span className="stype">{s.type}</span></td>
                    <td className="num" style={{ color: "var(--tx-dim)" }}>{s.date}</td>
                    <td>{s.driver || "—"}</td>
                    <td style={{ color: "var(--tx-dim)" }}>{v ? v.label : "—"}</td>
                    <td className="r num">{s.conditions.ambientTemp || "—"}</td>
                    <td className="r num">{s.conditions.trackTemp || "—"}</td>
                    <td className="r num" style={{ color: "var(--amber)", fontWeight: 600 }}>{s.performance.bestLap || "—"}</td>
                    <td style={{ fontSize: 11, color: "var(--tx-dim)" }}>{balText(s.feedback.mid)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
        </>
      )}

      {tab === "sessions" && detailSession && (
        <SessionDetail s={detailSession} car={car} ev={ev}
          onBack={() => setDetail(null)} onEdit={() => setEditingSession(detailSession)} onDelete={() => delSession(detailSession.id)} />
      )}

      {tab === "setup" && (editingSetup ? (
        <>
          <div className="setupbar">
            <span className="sblabel">Making a change</span>
            <span className="savedtag">Edit the setup, then save — the change is logged on the timeline</span>
            <span className="sp" />
            <button className="btn ghost sm" onClick={() => { setEditingSetup(false); setDraft(null); }}>Cancel</button>
            <button className="btn primary sm" disabled={!setupDiff(car, ev.setupValues || {}, draft || {}).length} onClick={() => setChangePrompt(true)}><Save size={13} /> Save change</button>
          </div>
          <SetupValues car={car} values={draft || {}} onChange={(vals) => setDraft(vals)} />
        </>
      ) : (
        <>
          <div className="setupbar">
            <span className="sblabel">Current setup</span>
            <span className="savedtag"><Lock size={11} /> Locked — use Make a change to adjust</span>
            <span className="sp" />
            <button className="btn sm" onClick={() => { setDraft(JSON.parse(JSON.stringify(ev.setupValues || {}))); setEditingSetup(true); }}><Pencil size={13} /> Make a change</button>
            <button className="btn sm" onClick={() => setSavePrompt(true)}><BookMarked size={13} /> Save to car library</button>
          </div>
          <div className="note" style={{ marginTop: 0, marginBottom: 12 }}>The event setup is locked. Hit <b>Make a change</b>, adjust what you need, and the change is recorded on the <b>Timeline</b> with a note. <b>Save to car library</b> promotes the current setup to a reusable one on {car.name}.</div>
          <SetupValues car={car} values={ev.setupValues || {}} onChange={() => {}} readOnly events={db.events} onRotate={curTyreSet ? () => setRotateModal(true) : undefined} onMeasure={curTyreSet ? () => setTreadModal(true) : undefined} onInspect={setInspectTyre} />
        </>
      ))}

      {tab === "tyres" && (
        <>
          <div className="setupbar">
            <span className="sblabel">{car.name} · tyre bank</span>
            <span className="savedtag"><Lock size={11} /> Linked to the car profile</span>
            <span className="sp" />
            <button className="btn sm" onClick={() => onOpenCar(car.id)}><Disc size={13} /> Manage in car profile</button>
          </div>
          <div className="note" style={{ marginTop: 0, marginBottom: 12 }}>This is the same tyre bank as {car.name}'s profile — sets are created and edited there, so the two never drift apart. Wear shown here builds from every event this car runs.</div>
          {(car.tyreBank || []).length === 0 ? <div className="zempty" style={{ padding: 24 }}>No tyre sets yet — add them in the car profile's Tyre bank tab.</div> : (
            <table className="ttbl big"><thead><tr><th>Set ID</th><th>Brand / compound</th><th>Size</th><th>Optimum hot</th><th>{units().distance.label}</th><th>Cycles</th></tr></thead>
              <tbody>{(car.tyreBank || []).map((s) => { const usg = tyreSetUsage(db.events, s.id); const onCar = (ev.setupValues || {})[tyresetF ? tyresetF.id : ""] === s.id; return (
                <tr key={s.id} className={onCar ? "oncar" : ""}>
                  <td style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--amber)" }}>{setLabel(s)}{onCar ? <span className="oncartag">on car</span> : ""}</td>
                  <td>{s.brand} {s.compound}</td><td>{s.size || "—"}</td><td>{s.optimumHot ? `${units().pressure.disp(s.optimumHot)} ${units().pressure.label}` : "—"}</td>
                  <td className="num">{units().distance.disp(usg.km)}</td><td className="num">{usg.cycles}</td>
                </tr>
              ); })}</tbody></table>
          )}
          {(car.looseTyres || []).length > 0 && (<>
            <div className="eyebrow" style={{ margin: "18px 0 8px" }}>Unassigned tyres · {(car.looseTyres || []).length}</div>
            <table className="ttbl big"><thead><tr><th>Tyre (FIA serial)</th><th>Brand / compound</th><th>Size</th><th>{units().distance.label}</th></tr></thead>
              <tbody>{(car.looseTyres || []).map((t) => (
                <tr key={t.id}><td style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--amber)" }}>{tyreLabel(t)}</td>
                  <td>{t.brand} {t.compound}</td><td>{t.size || "—"}</td><td className="num">{units().distance.disp(tyreKm(db.events, t.id))}</td></tr>
              ))}</tbody></table>
            <div className="note" style={{ marginTop: 8 }}>Assign or delete these in the car profile's Tyre bank tab.</div>
          </>)}
        </>
      )}

      {tab === "timeline" && (() => {
        const keyOf = (it) => it.ts != null ? it.ts : (Date.parse(`${it.date || "1970-01-01"}T${(it.time || "00:00")}`) || Date.parse(it.date || "1970-01-01") || 0);
        const items = [
          ...timeline.map((e) => ({ sort: keyOf({ ts: e.ts, date: e.date }), kind: e.kind, entry: e })),
          ...(ev.sessions || []).map((s) => ({ sort: keyOf({ ts: s.ts, date: s.date, time: s.timeOfDay }), kind: "session", session: s })),
        ].sort((a, b) => a.sort - b.sort);
        let prev = null;
        const rows = items.map((it) => {
          if (it.kind === "setup") { const isBase = !prev; const diff = prev ? setupDiff(car, prev.values, it.entry.values) : null; prev = it.entry; return { ...it, diff, isBase }; }
          return it;
        });
        return (
          <>
            <div className="setupbar">
              <span className="sblabel">Event timeline</span><span className="sp" />
            </div>
            <div className="note" style={{ marginTop: 0, marginBottom: 12 }}>Sessions, setup changes and tyre rotations appear here in order — make a change, run a session, and the sequence builds up. Tread is measured on the <b>Tyre UI</b> (Setup tab).</div>
            <div className="timeline">
              {rows.length === 0 && <div className="zempty">Nothing logged yet.</div>}
              {rows.map((row) => row.kind === "setup" ? (
                <div key={row.entry.id} className={"tlitem" + (row.isBase ? " base" : "")}>
                  <div className="tlhead">
                    <span className="lbl">{row.entry.label}</span>
                    <span className="stype">{row.entry.date}</span>
                    <span className="sp" />
                    {!row.isBase && <button className="iconbtn" title="Remove entry" onClick={() => delEntry(row.entry.id)}><Trash2 size={13} /></button>}
                  </div>
                  {row.isBase && <div className="chgline" style={{ color: "var(--tx-faint)" }}>Starting point for the event.</div>}
                  {row.diff && row.diff.length === 0 && <div className="chgline" style={{ color: "var(--tx-faint)" }}>No changes from the previous snapshot.</div>}
                  {row.diff && row.diff.map((ch, j) => (
                    <div key={j} className="chgline"><b>{ch.tyre ? <><Disc size={10} style={{ verticalAlign: "middle" }} /> Tyre set</> : `${ch.label}${ch.corner ? ` ${ch.corner}` : ""}`}</b>: {ch.from || "–"} <ArrowRight size={10} style={{ verticalAlign: "middle" }} /> <span className={ch.tyre ? "" : (num(ch.to) > num(ch.from) ? "up" : "down")}>{ch.to || "–"}</span> {ch.unit}</div>
                  ))}
                </div>
              ) : row.kind === "tread" ? (
                <div key={row.entry.id} className="tlitem tread">
                  <div className="tlhead">
                    <span className="lbl"><Ruler size={12} style={{ verticalAlign: "middle" }} /> Tread {row.entry.note ? `· ${row.entry.note}` : ""}</span>
                    <span className="stype">{row.entry.date}</span>
                    <span className="sp" />
                    <button className="iconbtn" title="Remove entry" onClick={() => delEntry(row.entry.id)}><Trash2 size={13} /></button>
                  </div>
                  <div className="chgline">{CORNERS.map((c) => { const arr = Array.isArray(row.entry.tread[c]) ? row.entry.tread[c] : [row.entry.tread[c]]; return <span key={c} style={{ marginRight: 16 }}><b>{c}</b> {arr.map((v) => v || "–").join(" / ")}</span>; })}<span style={{ color: "var(--tx-faint)", marginLeft: 4 }}>mm ({treadLabels(row.entry.points || 3).join(" / ")})</span></div>
                </div>
              ) : row.kind === "rotation" ? (
                <div key={row.entry.id} className="tlitem rotation">
                  <div className="tlhead">
                    <span className="lbl"><Disc size={12} style={{ verticalAlign: "middle" }} /> Tyre rotation</span>
                    <span className="stype">{row.entry.date}</span>
                    <span className="sp" />
                    <button className="iconbtn" title="Remove entry" onClick={() => delEntry(row.entry.id)}><Trash2 size={13} /></button>
                  </div>
                  {(row.entry.changes || []).map((ch, j) => (
                    <div key={j} className="chgline"><b style={{ fontFamily: "var(--mono)" }}>{ch.tyre}</b>: {ch.fromSet ? <>{ch.fromSet} <ArrowRight size={10} style={{ verticalAlign: "middle" }} /> {ch.toSet}</> : <>{ch.from} <ArrowRight size={10} style={{ verticalAlign: "middle" }} /> {ch.to}</>}</div>
                  ))}
                </div>
              ) : (
                <div key={row.session.id} className="tlitem session clk" onClick={() => { setTab("sessions"); setDetail(row.session.id); }}>
                  <div className="tlhead">
                    <span className="lbl"><Layers size={12} style={{ verticalAlign: "middle" }} /> {row.session.type}{row.session.driver ? ` · ${row.session.driver}` : ""}</span>
                    <span className="stype">{row.session.date}{row.session.timeOfDay ? ` ${row.session.timeOfDay}` : ""}</span>
                    <span className="sp" />
                    <span className="tlbest">{row.session.performance.bestLap || "—"}</span>
                  </div>
                  <div className="chgline">{[row.session.performance.laps && `${row.session.performance.laps} laps`, row.session.performance.fuelUsed && `${row.session.performance.fuelUsed} L`, (() => { const t = (car.tyreBank || []).find((x) => x.id === row.session.tyres.tyreSetId); return t ? setLabel(t) : null; })()].filter(Boolean).join(" · ") || "—"}</div>
                </div>
              ))}
            </div>
          </>
        );
      })()}

      {editingSession && (
        <SessionEditor car={car} ev={ev}
          session={editingSession === "new" ? (() => { const b = blankSession(latest.id); const tf = allFields(car).find((x) => x.kind === "tyreset"); if (tf) { const sid = (ev.setupValues || {})[tf.id] || ""; b.tyres.tyreSetId = sid; const st = (car.tyreBank || []).find((s) => s.id === sid); b.tyres.mounted = st ? st.tyres.map((t) => t.id) : []; } b.driver = ev.driver || ""; return b; })() : editingSession}
          isNew={editingSession === "new"} onCancel={() => setEditingSession(null)} onSave={saveSession} />
      )}
      {adjustFrom && (
        <SetupEditorModal car={car} title="Make a setup change"
          values={JSON.parse(JSON.stringify(versionById(adjustFrom).values))}
          onCancel={() => setAdjustFrom(null)}
          onSave={(vals) => applySetupChange(vals, adjustFrom, null)} />
      )}
      {savePrompt && <PromptModal title="Save setup to car library" label="Setup name"
        initial={`${eventGroup(ev)}${ev.eventType === "series" && ev.round ? ` R${ev.round}` : ""}`.trim()}
        onSave={(name) => { onSaveCarSetup(car.id, { id: uid(), name, basedOn: ev.baseSetupId, createdAt: Date.now(), balance: "", values: JSON.parse(JSON.stringify(ev.setupValues || {})) }); setSavePrompt(false); }}
        onClose={() => setSavePrompt(false)} />}
      {changePrompt && <PromptModal title="Log this change" label="What changed?" placeholder="e.g. Softer front bar, +2 rear wing"
        initial="" onSave={saveChange} onClose={() => setChangePrompt(false)} />}
      {treadModal && curTyreSet && <TreadModal set={curTyreSet} onSave={(t) => { onSaveCarTyres(car.id, applyTread(car.tyreBank || [], curTyreSet.id, t, db.events)); setTreadModal(false); }} onClose={() => setTreadModal(false)} />}
      {inspectTyre && <TyreInspector tyre={inspectTyre} events={db.events} onSave={saveTyre} onClose={() => setInspectTyre(null)} />}
      {rotateModal && <RotateTyresModal bank={car.tyreBank || []} loose={car.looseTyres || []} events={db.events} focusSetId={curTyreSet ? curTyreSet.id : null} onSave={applyRotation} onClose={() => setRotateModal(false)} />}
      {confirmCfg && <ConfirmModal {...confirmCfg} onClose={() => setConfirmCfg(null)} />}

      <div className="printsheet">
        <div className="ph1">{eventTitle(ev)}</div>
        <div className="ph2">{eventGroup(ev)} · {car.name}{car.make ? ` — ${car.make} ${car.model}` : ""}</div>
        <div className="phmeta">{ev.circuit}{ev.config ? ` (${ev.config})` : ""}{ev.trackLength ? ` · ${units().distance.disp(ev.trackLength)} ${units().distance.label}/lap` : ""} · {ev.startDate}{ev.endDate && ev.endDate !== ev.startDate ? `–${ev.endDate}` : ""} · Driver: {ev.driver || "—"}{ev.coDriver ? ` / ${ev.coDriver}` : ""}</div>
        <h2>Sessions</h2>
        <table><thead><tr><th>Session</th><th>Date</th><th>Driver</th><th>Best lap</th><th>Laps</th><th>Fuel {units().volume.label}</th><th>Fuel/lap</th><th>Max {units().speed.label}</th><th>Finish</th></tr></thead>
          <tbody>{(ev.sessions || []).map((s) => <tr key={s.id}><td>{s.type}</td><td>{s.date} {s.timeOfDay}</td><td>{s.driver}</td><td>{s.performance.bestLap || "–"}</td><td>{s.performance.laps || "–"}</td><td>{s.performance.fuelUsed ? units().volume.disp(s.performance.fuelUsed) : "–"}</td><td>{s.performance.fuelPerLap ? units().volume.disp(s.performance.fuelPerLap) : "–"}</td><td>{s.performance.maxSpeed ? units().speed.disp(s.performance.maxSpeed) : "–"}</td><td>{["Practice", "Test", "Warmup"].includes(s.type) ? "–" : (s.performance.finishPos || "–")}</td></tr>)}</tbody></table>
        <h2>Session notes</h2>
        {(ev.sessions || []).some((s) => s.notes.driver || s.notes.engineer) ? (ev.sessions || []).map((s) => (s.notes.driver || s.notes.engineer) ? <div key={s.id} className="pnote"><b>{s.type} · {s.date}</b>{s.notes.driver && <div>Driver: {s.notes.driver}</div>}{s.notes.engineer && <div>Engineer: {s.notes.engineer}</div>}</div> : null) : <div className="pnote">No notes recorded.</div>}
        <h2>Timeline of changes</h2>
        <table className="ptbl2"><tbody>{repItems.length ? repItems.map((it, i) => {
          if (it.kind === "setup") return <tr key={i}><td>{it.entry.date}</td><td><b>{it.entry.label}</b>{it.diff && it.diff.length ? `: ${it.diff.map((ch) => `${ch.tyre ? "Tyre set" : ch.label}${ch.corner ? ` ${ch.corner}` : ""} ${ch.from || "–"}→${ch.to || "–"}`).join("; ")}` : ""}</td></tr>;
          if (it.kind === "rotation") return <tr key={i}><td>{it.entry.date}</td><td><b>Tyre rotation</b>: {(it.entry.changes || []).map((ch) => `${ch.tyre} ${ch.fromSet ? `${ch.fromSet}→${ch.toSet}` : `${ch.from}→${ch.to}`}`).join("; ")}</td></tr>;
          return <tr key={i}><td>{it.session.date}</td><td><b>{it.session.type}</b> — {it.session.performance.bestLap || "–"}, {it.session.performance.laps || "–"} laps</td></tr>;
        }) : <tr><td colSpan={2}>No changes logged.</td></tr>}</tbody></table>
        <h2>Starting setup</h2>
        {printSetup(startValues)}
        <h2>Setup at end of event</h2>
        {printSetup(ev.setupValues || {})}
        <h2>Tyres used</h2>
        <table className="ptbl2"><tbody>{usedSets.length ? usedSets.map((st) => { const u = tyreSetUsage(db.events, st.id); return <tr key={st.id}><td>{setLabel(st)} · {st.brand} {st.compound}</td><td>{units().distance.disp(u.km)} {units().distance.label} · {u.cycles} heat cycles</td></tr>; }) : <tr><td colSpan={2}>No tyre sets recorded.</td></tr>}</tbody></table>
      </div>
    </div>
  );
}

/* ---- session detail ---- */
function simMotec(file) {
  const name = file ? file.name : "log.ld";
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const laps = 8 + (h % 15);
  const sec = 78 + (h % 20) + ((h >> 4) % 1000) / 1000;
  const m = Math.floor(sec / 60), s2 = sec - m * 60;
  const bestLap = `${m}:${s2.toFixed(3).padStart(6, "0")}`;
  const fuelUsed = +(laps * (2 + ((h >> 8) % 15) / 10)).toFixed(1);
  const maxSpeed = 210 + (h % 60);
  return { laps, bestLap, fuelUsed, maxSpeed };
}
function SettingsView({ settings, db, onChange, onImport }) {
  const u = settings.units || DEFAULT_UNITS;
  const setUnit = (cat, val) => onChange({ ...settings, units: { ...(settings.units || DEFAULT_UNITS), [cat]: val } });
  const applyPreset = (sys) => onChange({ ...settings, units: sys === "metric" ? { speed: "km/h", temp: "°C", pressure: "kPa", distance: "km", volume: "L" } : { speed: "mph", temp: "°F", pressure: "psi", distance: "mi", volume: "gal" } });
  const cats = [["speed", "Speed"], ["temp", "Temperature"], ["pressure", "Pressure"], ["distance", "Distance"], ["volume", "Fuel volume"]];
  const fileRef = useRef(null);
  const [pending, setPending] = useState(null); // parsed import awaiting confirm
  const [importErr, setImportErr] = useState("");
  const exportData = () => {
    try {
      const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `delta-database-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { setImportErr("Export failed in this preview environment."); }
  };
  const onFile = (e) => {
    setImportErr(""); const file = e.target.files && e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { try { const data = JSON.parse(reader.result); if (!data || !Array.isArray(data.carProfiles) || !Array.isArray(data.events)) throw new Error("bad"); setPending(data); } catch (err) { setImportErr("That file isn't a valid Delta Database backup."); } };
    reader.onerror = () => setImportErr("Couldn't read that file.");
    reader.readAsText(file); e.target.value = "";
  };
  return (
    <div>
      <div className="pagehead"><h1>Settings</h1></div>
      <div className="panel" style={{ maxWidth: 660 }}>
        <h3>Appearance</h3>
        <div className="note" style={{ marginTop: 0 }}>Switch between the dark and light interface themes.</div>
        <div className="segseg" style={{ marginTop: 12 }}>
          <button className={"segbtn" + ((settings.theme || "dark") === "dark" ? " on" : "")} onClick={() => onChange({ ...settings, theme: "dark" })}><Moon size={13} /> Dark</button>
          <button className={"segbtn" + (settings.theme === "light" ? " on" : "")} onClick={() => onChange({ ...settings, theme: "light" })}><Sun size={13} /> Light</button>
        </div>
      </div>
      <div className="panel" style={{ maxWidth: 660, marginTop: 16 }}>
        <h3>Units</h3>
        <div className="note" style={{ marginTop: 0 }}>Applies to measured values across the app — tyre pressures, temperatures, speed, fuel and distance. Custom setup-sheet fields keep the units you type on them.</div>
        <div style={{ display: "flex", gap: 8, margin: "12px 0 16px" }}>
          <button className="btn sm" onClick={() => applyPreset("metric")}>Metric preset</button>
          <button className="btn sm" onClick={() => applyPreset("imperial")}>Imperial preset</button>
        </div>
        <div className="fgrid">
          {cats.map(([cat, label]) => (
            <div className="field" key={cat}><label>{label}</label>
              <select value={u[cat] || UNIT_DEFS[cat].base} onChange={(e) => setUnit(cat, e.target.value)}>
                {Object.keys(UNIT_DEFS[cat].opts).map((k) => <option key={k} value={k}>{UNIT_DEFS[cat].opts[k].label}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
      <div className="panel" style={{ maxWidth: 660, marginTop: 16 }}>
        <h3>File storage</h3>
        <div className="note" style={{ marginTop: 0 }}>Root folder where MoTeC logs, videos and other files dropped onto a session are filed. Each session is stored under <span style={{ fontFamily: "var(--mono)" }}>…\{"{Car}"}\{"{Event}"}\</span>.</div>
        <div className="field" style={{ marginTop: 12 }}><label>App directory</label>
          <input value={settings.appDir || ""} onChange={(e) => onChange({ ...settings, appDir: e.target.value })} placeholder="C:\Users\...\Documents\Delta Database" style={{ fontFamily: "var(--mono)", fontSize: 12.5 }} />
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn ghost sm" disabled title="Folder picker is available in the installed Windows app"><FolderOpen size={13} /> Browse…</button>
          <span className="opt">A native folder picker is available in the installed Windows app; here you can type or paste the path.</span>
        </div>
      </div>
      <div className="panel" style={{ maxWidth: 660, marginTop: 16 }}>
        <h3>Data backup &amp; transfer</h3>
        <div className="note" style={{ marginTop: 0 }}>Export everything — cars, events, sessions, setups and the whole tyre bank — to a single <span style={{ fontFamily: "var(--mono)" }}>.json</span> file. Keep it as a backup, or import it on another computer to move your data across. Importing replaces all current data.</div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={exportData}><Download size={14} /> Export all data</button>
          <button className="btn ghost" onClick={() => fileRef.current && fileRef.current.click()}><Upload size={14} /> Import from file…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} style={{ display: "none" }} />
        </div>
        {importErr && <div className="warnnote" style={{ marginTop: 10 }}>{importErr}</div>}
        {pending && (
          <div className="warnnote" style={{ marginTop: 12 }}>
            Import <b>{pending.carProfiles.length}</b> car{pending.carProfiles.length === 1 ? "" : "s"} and <b>{pending.events.length}</b> event{pending.events.length === 1 ? "" : "s"}? This <b>replaces all data</b> currently in the app.
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button className="btn ghost sm" onClick={() => setPending(null)}>Cancel</button>
              <button className="btn primary sm" onClick={() => { onImport(pending); setPending(null); }}><Check size={13} /> Replace &amp; import</button>
            </div>
          </div>
        )}
        <div className="note" style={{ marginTop: 10 }}>In the installed Windows app your data also lives in a local database file, and this same export makes a portable copy you can carry anywhere.</div>
      </div>
    </div>
  );
}

function sessionDir(car, ev) {
  const evName = (eventGroup(ev) || ev.name || ev.oneoffName || "Event").replace(/[\\/:*?"<>|]/g, "-");
  const base = (APP_DIR || "…/Delta Database").replace(/[\\/]+$/, "");
  return `${base}\\${(car.name || "Car").replace(/[\\/:*?"<>|]/g, "-")}\\${evName}\\`;
}

function SessionForm({ s, up, car, ev, readOnly, onDropFiles, onRemoveFile }) {
  const [showDir, setShowDir] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const drivers = Array.from(new Set([ev.driver, ev.coDriver, s.driver].filter(Boolean)));
  const noPos = ["Practice", "Test", "Warmup"].includes(s.type);
  const motec = s.perfSource === "motec";
  const perfDisabled = readOnly || motec;
  const setInfo = (car.tyreBank || []).find((x) => x.id === s.tyres.tyreSetId);
  const u = units();
  const tinp = { width: 30, textAlign: "center", padding: "4px 2px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 5, color: "var(--tx)", fontSize: 11.5 };
  const idPass = (cat) => u[cat].sel === UNIT_DEFS[cat].base;
  const measInput = (cat, val, path, opts = {}) => { const pass = idPass(cat); return <input className="num" style={opts.style || inp} disabled={opts.disabled ?? readOnly} value={pass ? (val ?? "") : u[cat].disp(val)} onChange={(e) => up(path, pass ? e.target.value : u[cat].base(e.target.value))} placeholder={opts.placeholder} />; };
  const tcell = (c, i) => { const pass = idPass("temp"); return <input key={i} className="num" style={tinp} title={["Inner", "Middle", "Outer"][i]} disabled={readOnly} value={pass ? s.tyres.temp[c][i] : u.temp.disp(s.tyres.temp[c][i])} onChange={(e) => { const t = JSON.parse(JSON.stringify(s.tyres.temp)); t[c][i] = pass ? e.target.value : u.temp.base(e.target.value); up("tyres.temp", t); }} />; };
  const logFiles = (s.files || []).filter((f) => f.kind === "log");
  const baseName = (n) => n.replace(/\.[^.]+$/, "");
  const missingLdx = logFiles.filter((f) => /\.ld$/i.test(f.name) && !logFiles.some((g) => /\.ldx$/i.test(g.name) && baseName(g.name) === baseName(f.name))).map((f) => baseName(f.name));
  return (
    <>
      <div className="fsection"><div className="ttl">Session</div>
        <div className="fgrid">
          <div className="field"><label>Type</label><select value={s.type} disabled={readOnly} onChange={(e) => up("type", e.target.value)}>{SESSION_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="field"><label>Date</label><input type="date" value={s.date} disabled={readOnly} onChange={(e) => up("date", e.target.value)} /></div>
          <div className="field"><label>Time</label><input value={s.timeOfDay} disabled={readOnly} onChange={(e) => up("timeOfDay", e.target.value)} placeholder="09:40" /></div>
          <div className="field"><label>Driver</label>
            {drivers.length ? <select value={s.driver} disabled={readOnly} onChange={(e) => up("driver", e.target.value)}>{!s.driver && <option value="">—</option>}{drivers.map((d) => <option key={d}>{d}</option>)}</select>
              : <input value={s.driver} disabled={readOnly} onChange={(e) => up("driver", e.target.value)} />}
          </div>
        </div>
      </div>
      <div className="fsection"><div className="ttl">Conditions</div>
        <div className="fgrid">
          <div className="field"><label>Ambient {u.temp.label}</label>{measInput("temp", s.conditions.ambientTemp, "conditions.ambientTemp", { style: { ...inp, width: 70 } })}</div>
          <div className="field"><label>Track {u.temp.label}</label>{measInput("temp", s.conditions.trackTemp, "conditions.trackTemp", { style: { ...inp, width: 70 } })}</div>
          <div className="field"><label>Weather</label><select value={s.conditions.weather} disabled={readOnly} onChange={(e) => up("conditions.weather", e.target.value)}>{["Dry", "Damp", "Wet"].map((w) => <option key={w}>{w}</option>)}</select></div>
          <div className="field"><label>Humidity %</label><input className="num" value={s.conditions.humidity} disabled={readOnly} onChange={(e) => up("conditions.humidity", e.target.value)} /></div>
          <div className="field"><label>Wind</label><input value={s.conditions.wind} disabled={readOnly} onChange={(e) => up("conditions.wind", e.target.value)} /></div>
        </div>
      </div>
      <div className="fsection"><div className="ttl">Tyres</div>
        <div className="fgrid"><div className="field" style={{ gridColumn: "1 / -1" }}><label>Tyre set <span className="opt">· from the setup on the car</span></label>
          {setInfo ? <div className="setinherit"><Disc size={13} /> <b>{setLabel(setInfo)}</b> · {setInfo.brand} {setInfo.compound}{setInfo.size ? ` · ${setInfo.size}` : ""}</div>
            : <div className="note" style={{ margin: 0 }}>No tyre set on the current setup.</div>}
        </div></div>
        <div className="tyremeasrow">
          <div><div className="eyebrow" style={{ margin: "14px 0 8px" }}>Tyre pressures</div>
            <div className="pqrow">
              <div className="pqwrap"><div className="pqlabel">Cold <span className="au">{u.pressure.label}</span></div><div className="pquad">{CORNERS.map((cc) => <div className="pqcell" key={cc}><span className="pqc">{cc}</span>{measInput("pressure", s.tyres.pc[cc], `tyres.pc.${cc}`)}</div>)}</div></div>
              <div className="pqwrap"><div className="pqlabel">Hot <span className="au">{u.pressure.label}</span></div><div className="pquad">{CORNERS.map((cc) => <div className="pqcell" key={cc}><span className="pqc">{cc}</span>{measInput("pressure", s.tyres.ph[cc], `tyres.ph.${cc}`)}</div>)}</div></div>
            </div>
          </div>
          <div><div className="eyebrow" style={{ margin: "14px 0 8px" }}>Tyre temps <span className="au">{u.temp.label}</span></div>
            <div className="pquad tquad">{CORNERS.map((cc) => <div className="pqcell tcell" key={cc}><span className="pqc">{cc}</span><div className="tinputs">{[0, 1, 2].map((i) => tcell(cc, i))}</div></div>)}</div>
            <div className="tcap">inner · middle · outer</div>
          </div>
        </div>
      </div>
      <div className="fsection"><div className="ttl">Files &amp; data</div>
        {onDropFiles && !readOnly && <div className={"dropzone" + (dragOver ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); onDropFiles(e.dataTransfer.files); }}>
          <Upload size={16} /> Drop MoTeC logs <b>(.ld + .ldx)</b> &amp; video here
          <div className="dzsub">Keep the .ld and its .ldx together · logs auto-fill laps, best lap &amp; fuel · files are filed under the event folder</div>
        </div>}
        {(s.files || []).length ? <div className="filelist">{s.files.map((f, i) => { const ext = (f.name.split(".").pop() || "").toLowerCase(); const tag = ext === "ld" ? "log · data" : ext === "ldx" ? "log · companion" : f.kind === "video" ? "video" : "file"; return <div className="filerow" key={i}><span className="fkind">{f.kind === "log" ? <Activity size={13} /> : f.kind === "video" ? <Video size={13} /> : <FileText size={13} />}</span><span className="fname">{f.name}</span><span className="fpath">{tag}</span>{!readOnly && onRemoveFile && <button className="iconbtn" title="Remove" onClick={() => onRemoveFile(i)}><X size={12} /></button>}</div>; })}</div> : <div className="note" style={{ margin: "8px 0 0" }}>No files attached to this session yet.</div>}
        {missingLdx.length > 0 && <div className="warnnote"><Info size={13} /> MoTeC logs come as a <b>.ld</b> + <b>.ldx</b> pair. Missing companion for {missingLdx.map((b) => `${b}.ldx`).join(", ")} — i2 can recreate it, but beacon/lap markers and per-file maths live in the .ldx, so add it if you have it.</div>}
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn ghost sm" onClick={() => setShowDir((v) => !v)}><FolderOpen size={13} /> Open files folder</button>
          {showDir && <span className="dirpath">{sessionDir(car, ev)}</span>}
        </div>
      </div>
      <div className="fsection"><div className="ttl">Performance {motec && <span className="motecbadge"><Activity size={11} /> from MoTeC log</span>}</div>
        <div className="fgrid">
          <div className="field"><label>Best lap</label><input className="num" value={s.performance.bestLap} disabled={perfDisabled} onChange={(e) => up("performance.bestLap", e.target.value)} placeholder="1:28.412" /></div>
          <div className="field"><label>Laps</label><input className="num" value={s.performance.laps} disabled={perfDisabled} onChange={(e) => up("performance.laps", e.target.value)} /></div>
          <div className="field"><label>Fuel used {u.volume.label}</label>{measInput("volume", s.performance.fuelUsed, "performance.fuelUsed", { disabled: perfDisabled })}</div>
          <div className="field"><label>Fuel/lap {u.volume.label}</label><input className="num" value={idPass("volume") ? s.performance.fuelPerLap : u.volume.disp(s.performance.fuelPerLap)} readOnly /></div>
          <div className="field"><label>Max speed {u.speed.label}</label>{measInput("speed", s.performance.maxSpeed, "performance.maxSpeed", { disabled: perfDisabled })}</div>
          <div className="field"><label>Finish position{noPos ? <span className="opt"> · n/a</span> : ""}</label><input className="num" value={noPos ? "" : (s.performance.finishPos || "")} disabled={readOnly || noPos} onChange={(e) => up("performance.finishPos", e.target.value)} placeholder={noPos ? "—" : "e.g. 3"} /></div>
        </div>
        {motec && !readOnly && <div className="note" style={{ marginTop: 8 }}>Laps, best lap and fuel are read from the MoTeC log <span className="opt">(simulated in this preview)</span>. <button className="linkbtn" onClick={() => up("perfSource", "manual")}>Switch to manual entry</button></div>}
        {!motec && !readOnly && <div className="note" style={{ marginTop: 8 }}>Entered manually. Drop a <b>.ld</b> log above to pull these from MoTeC instead.</div>}
      </div>
      <div className="fsection"><div className="ttl">Driver feedback</div>
        <div style={{ maxWidth: 380 }}>
          {PHASES.map(([k, l]) => <div className="balrow" key={k}><span className="k">{l}</span><Balance value={s.feedback[k]} readOnly={readOnly} onChange={(v) => up(`feedback.${k}`, v)} /></div>)}
          <div className="balrow"><span className="k">Front lock</span><Sev value={s.feedback.lockFront} readOnly={readOnly} onChange={(v) => up("feedback.lockFront", v)} /></div>
          <div className="balrow"><span className="k">Rear lock</span><Sev value={s.feedback.lockRear} readOnly={readOnly} onChange={(v) => up("feedback.lockRear", v)} /></div>
        </div>
      </div>
      <div className="fsection"><div className="ttl">Notes</div>
        <div className="field" style={{ marginBottom: 10 }}><label>Driver feedback notes</label><textarea value={s.notes.driver} readOnly={readOnly} onChange={(e) => up("notes.driver", e.target.value)} /></div>
        <div className="field"><label>Engineer notes</label><textarea value={s.notes.engineer} readOnly={readOnly} onChange={(e) => up("notes.engineer", e.target.value)} /></div>
      </div>
    </>
  );
}

function SessionEditor({ car, ev, session, isNew, onCancel, onSave }) {
  const [s, setS] = useState(JSON.parse(JSON.stringify(session)));
  const up = (path, v) => setS((prev) => { const n = JSON.parse(JSON.stringify(prev)); const k = path.split("."); let o = n; for (let i = 0; i < k.length - 1; i++) o = o[k[i]]; o[k[k.length - 1]] = v; return n; });
  useEffect(() => { if (s.perfSource === "motec") return; const f = num(s.performance.fuelUsed), l = num(s.performance.laps); if (f != null && l) { const c = (f / l).toFixed(2); if (s.performance.fuelPerLap !== c) up("performance.fuelPerLap", c); } // eslint-disable-next-line
  }, [s.performance.fuelUsed, s.performance.laps, s.perfSource]);
  const onDropFiles = (fileList) => {
    const arr = Array.from(fileList || []); if (!arr.length) return;
    setS((prev) => {
      const n = JSON.parse(JSON.stringify(prev));
      arr.forEach((f) => { const ext = (f.name.split(".").pop() || "").toLowerCase(); const kind = (ext === "ld" || ext === "ldx") ? "log" : (["mp4", "mov", "avi", "mkv", "m4v", "insv"].includes(ext) ? "video" : "other"); if (!n.files.some((x) => x.name === f.name)) n.files.push({ name: f.name, kind, size: f.size }); });
      const ld = n.files.find((f) => /\.ld$/i.test(f.name)); // the data file drives the parse; .ldx is its companion
      if (ld) { const p = simMotec(ld); n.perfSource = "motec"; n.performance.laps = String(p.laps); n.performance.bestLap = p.bestLap; n.performance.fuelUsed = String(p.fuelUsed); n.performance.fuelPerLap = (p.fuelUsed / p.laps).toFixed(2); n.performance.maxSpeed = String(p.maxSpeed); }
      return n;
    });
  };
  const onRemoveFile = (i) => setS((prev) => { const n = JSON.parse(JSON.stringify(prev)); n.files.splice(i, 1); if (!n.files.some((f) => /\.ld$/i.test(f.name))) n.perfSource = "manual"; return n; });
  return (
    <div className="ov">
      <div className="modal wide compact" onClick={(e) => e.stopPropagation()}>
        <h2><Layers size={16} color="var(--amber)" /> {isNew ? "Add session" : "Edit session"}</h2>
        <div className="msub">{eventTitle(ev)} · {car.name}</div>
        <SessionForm s={s} up={up} car={car} ev={ev} readOnly={false} onDropFiles={onDropFiles} onRemoveFile={onRemoveFile} />
        <div className="modrow"><button className="btn ghost" onClick={onCancel}>Cancel</button><button className="btn primary" onClick={() => onSave(s)}><Save size={14} /> Save session</button></div>
      </div>
    </div>
  );
}

function SessionDetail({ s, car, ev, onBack, onEdit, onDelete }) {
  const wc = s.conditions.weather?.toLowerCase() || "dry";
  return (
    <div>
      <div className="backrow">
        <button className="btn ghost" onClick={onBack}><ArrowLeft size={14} /> Sessions</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm" onClick={onEdit}><Pencil size={13} /> Edit</button>
          <button className="btn danger sm" onClick={onDelete}><Trash2 size={13} /> Delete</button>
        </div>
      </div>
      <div className="pagehead">
        <div><h1>{s.type} <span className="sub" style={{ fontSize: 13 }}>· {s.date} {s.timeOfDay}</span></h1>
          <div className="sub">{s.driver}</div></div>
        <span className="sp" />
        <span className={"pill " + (wc.includes("wet") ? "wet" : wc.includes("damp") ? "damp" : "dry")}>{s.conditions.weather}</span>
        <div style={{ textAlign: "right" }}><div className="num" style={{ fontSize: 26, fontWeight: 700, color: "var(--amber)" }}>{s.performance.bestLap || "—"}</div><div className="eyebrow">Best lap</div></div>
      </div>
      <div className="sessview"><SessionForm s={s} up={() => {}} car={car} ev={ev} readOnly /></div>
    </div>
  );
}

const inp = { width: 56, textAlign: "center", padding: "5px 4px", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 5, color: "var(--tx)" };

/* ================= CARS ================= */
function CarsList({ db, onOpen, onNew }) {
  const lastEventFor = (carId) => { const evs = db.events.filter((e) => e.carProfileId === carId); return evs.length ? evs.reduce((a, b) => (a.startDate > b.startDate ? a : b)) : null; };
  return (
    <>
      <div className="pagehead"><h1>Cars</h1><span className="sp" /><button className="btn primary" onClick={onNew}><Plus size={15} /> New car profile</button></div>
      <div className="cards">
        {db.carProfiles.map((c) => {
          const last = lastEventFor(c.id);
          return (
            <div key={c.id} className="card" onClick={() => onOpen(c.id)}>
              <h3>{c.name}</h3><div className="meta">{c.klass}{c.make ? ` · ${c.make}` : ""}</div>
              <div className="cinfo">
                <div className="ci"><span className="cik">Last event</span><span className="civ">{last ? `${eventGroup(last)}${eventInfo(last) ? ` · ${eventInfo(last)}` : ""}` : "—"}</span></div>
                <div className="ci"><span className="cik">Dash</span><span className="civ">{c.dash || "—"}</span></div>
                <div className="ci"><span className="cik">ECU</span><span className="civ">{c.ecu || "—"}</span></div>
                <div className="ci"><span className="cik">Onboard camera</span><span className="civ">{c.onboardCamera || "—"}</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

const FIELD_TYPES = [["stepper", "Stepper (−/＋)"], ["number", "Number"], ["text", "Text"], ["select", "Pick-list"], ["holes", "Position 1–N"]];
const ZONES = [["corner", "Each corner"], ["front", "Front"], ["rear", "Rear"], ["global", "Whole car"]];
const fieldZone = (f) => f.zone || (f.perCorner ? "corner" : "global");
const SPECIAL_KINDS = ["damper", "cornerweight", "fuel", "driver", "ballast", "tyre", "hotpressure", "tyreset"];
const isSpecial = (f) => SPECIAL_KINDS.includes(f.kind);

function SetupValues({ car, values, onChange, readOnly, onRotate, onMeasure, onInspect, events }) {
  const V = values || {};
  const setV = (fieldId, corner, val) => {
    const nv = JSON.parse(JSON.stringify(V));
    if (corner) { nv[fieldId] = { ...(nv[fieldId] || {}) }; nv[fieldId][corner] = val; } else nv[fieldId] = val;
    onChange(nv);
  };
  const cornerFields = allFields(car).filter((f) => fieldZone(f) === "corner" && !isSpecial(f));
  const frontFields = allFields(car).filter((f) => fieldZone(f) === "front" && !isSpecial(f));
  const rearFields = allFields(car).filter((f) => fieldZone(f) === "rear" && !isSpecial(f));
  const globalFields = allFields(car).filter((f) => fieldZone(f) === "global" && !isSpecial(f));
  const damperFields = allFields(car).filter((f) => f.kind === "damper");
  const cwField = allFields(car).find((f) => f.kind === "cornerweight");
  const fuelField = allFields(car).find((f) => f.kind === "fuel");
  const driverField = allFields(car).find((f) => f.kind === "driver");
  const ballastField = allFields(car).find((f) => f.kind === "ballast");
  const hotField = allFields(car).find((f) => f.kind === "hotpressure");
  const tyresetField = allFields(car).find((f) => f.kind === "tyreset");
  const selSet = (car.tyreBank || []).find((s) => s.id === (tyresetField ? V[tyresetField.id] : ""));
  const cornerTyre = (corner) => selSet ? (selSet.tyres.find((t) => t.corner === corner) || {}).id : null;

  const vin = (f, corner) => { const val = corner ? (V[f.id] || {})[corner] : V[f.id];
    return readOnly ? <span className="vstatic">{(val ?? "") === "" ? "–" : val}</span> : <ValueInput field={f} val={val} onChange={(v) => setV(f.id, corner || null, v)} />; };
  const box = (f, corner) => (
    <div className="abox" key={f.id + (corner || "")}>
      <span className="albl">{f.label}{f.unit ? <span className="au"> {f.unit}</span> : null}</span>
      {vin(f, corner)}
    </div>
  );
  const damperMatrix = (corner) => { if (!damperFields.length) return null; return (
    <div className="dmatrix"><div className="dmlabel">Dampers <span className="au">clk</span></div>
      <div className="dmgrid">{damperFields.map((f, i) => { const solo = damperFields.length % 2 === 1 && i === damperFields.length - 1; return (
        <div className={"dmcell" + (solo ? " span" : "")} key={f.id}><span className="dmn">{f.label}</span>{vin(f, corner)}</div>
      ); })}</div></div>
  ); };
  const cornerCell = (corner, title) => (
    <div className="zcell"><div className="zhead"><span>{title}</span></div>{cornerFields.map((f) => box(f, corner))}{damperMatrix(corner)}</div>
  );
  const centerCell = (title, fields) => (
    <div className="zcell center"><div className="zhead"><span>{title}</span></div>{fields.length ? fields.map((f) => box(f, null)) : <div className="zempty">—</div>}</div>
  );
  const quad = (f) => (<div className="quadwrap"><div className="quad">{CORNERS.map((cn) => (
    <div className="qcell" key={cn}><span className="qc">{cn}</span>{vin(f, cn)}</div>))}</div></div>);

  return (
    <div>
      <div className="setupdiagram">
        {cornerCell("FL", "Front-left")}{centerCell("Front", frontFields)}{cornerCell("FR", "Front-right")}
        {cornerCell("RL", "Rear-left")}{centerCell("Rear", rearFields)}{cornerCell("RR", "Rear-right")}
      </div>
      <div className="widerow">
        <div className="wcol">
          <div className="zcell wide"><div className="zhead"><span>Corner weights</span></div>
            {car.cwOn && cwField ? (<>
              {quad(cwField)}
              <div className="cwtotal">Total <b>{(() => { const o = V[cwField.id] || {}; const s = CORNERS.reduce((a, cn) => a + (num(o[cn]) || 0), 0); return s ? s.toFixed(1) : "—"; })()}</b> kg</div>
              <div className="cwinputs">
                {fuelField && <div className="field"><label>{fuelField.label}</label>{readOnly ? <span className="vstatic">{V[fuelField.id] || "–"}</span> : <input value={V[fuelField.id] || ""} onChange={(e) => setV(fuelField.id, null, e.target.value)} />}</div>}
                {driverField && <div className="field"><label>{driverField.label}</label>{readOnly ? <span className="vstatic">{V[driverField.id] || "–"}</span> : <input value={V[driverField.id] || ""} onChange={(e) => setV(driverField.id, null, e.target.value)} />}</div>}
              </div>
              {car.ballastOn && ballastField && <div className="field" style={{ marginTop: 6 }}><label>{ballastField.label}</label>{readOnly ? <span className="vstatic">{V[ballastField.id] || "–"}</span> : <input value={V[ballastField.id] || ""} onChange={(e) => setV(ballastField.id, null, e.target.value)} />}</div>}
            </>) : <div className="zempty">Off for this car.</div>}
          </div>
          <div className="zcell wide compact"><div className="zhead"><span>Whole car</span></div>
            <div className="globrow">{globalFields.length ? globalFields.map((f) => box(f, null)) : <div className="zempty">—</div>}</div>
          </div>
        </div>
        <div className="zcell wide"><div className="zhead"><span>Tyres</span></div>
          {tyresetField && <TyreSetPicker car={car} value={V[tyresetField.id]} onChange={(v) => setV(tyresetField.id, null, v)} readOnly={readOnly} />}
          {selSet && <div style={{ marginTop: 12 }}><TyreUI set={selSet} events={events} onRotate={onRotate} onMeasure={onMeasure} onInspect={onInspect} /></div>}
        </div>
      </div>
    </div>
  );
}

function ValueInput({ field, val, onChange, disabled }) {
  const v = val || "";
  if (disabled) return <span className="vdisabled">—</span>;
  if (field.type === "select") return <select className="vsel" value={v} onChange={(e) => onChange(e.target.value)}><option value="" />{(field.options || []).map((o) => <option key={o}>{o}</option>)}</select>;
  if (field.type === "holes") { const n = field.holes || 5; return <div className="holes">{Array.from({ length: n }, (_, i) => String(i + 1)).map((o) => <button key={o} type="button" className={v === o ? "on" : ""} onClick={() => onChange(v === o ? "" : o)}>{o}</button>)}</div>; }
  if (field.type === "stepper") return <div className="miniStep"><button type="button" onClick={() => onChange(String((num(v) || 0) - (field.step || 1)))}>−</button><input value={v} onChange={(e) => onChange(e.target.value)} /><button type="button" onClick={() => onChange(String((num(v) || 0) + (field.step || 1)))}>+</button></div>;
  return <input className={"vinp" + (field.type === "number" ? " num" : "")} value={v} onChange={(e) => onChange(e.target.value)} />;
}

function FieldEditModal({ field, onSave, onDelete, onClose }) {
  const [f, setF] = useState({ ...field, options: field.options || [], holes: field.holes || 5, step: field.step || 1 });
  const [optsText, setOptsText] = useState((field.options || []).join(", "));
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const save = () => {
    if (!f.label.trim()) return;
    const patch = { label: f.label.trim(), type: f.type, unit: f.unit.trim(), zone: f.zone,
      options: f.type === "select" ? optsText.split(",").map((s) => s.trim()).filter(Boolean) : (f.options || []),
      holes: f.type === "holes" ? Math.max(2, Math.min(12, num(f.holes) || 5)) : (f.holes || 5),
      step: num(f.step) || 1 };
    onSave(patch);
  };
  return (
    <div className="ov">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <h2><Pencil size={15} color="var(--amber)" /> Adjustment box</h2>
        <div className="fgrid2" style={{ marginTop: 4 }}>
          <div className="field" style={{ gridColumn: "1 / -1" }}><label>Label</label><input value={f.label} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Camber" autoFocus /></div>
          <div className="field"><label>Type</label><select value={f.type} onChange={(e) => set("type", e.target.value)}>{FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field"><label>Unit <span className="opt">· optional</span></label><input value={f.unit} onChange={(e) => set("unit", e.target.value)} placeholder="mm, °, clk…" /></div>
          <div className="field"><label>Placement</label><select value={f.zone} onChange={(e) => set("zone", e.target.value)}>{ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          {f.type === "holes" && <div className="field"><label>Positions (max)</label><input value={f.holes} onChange={(e) => set("holes", e.target.value)} placeholder="5" /></div>}
          {f.type === "stepper" && <div className="field"><label>Step</label><input value={f.step} onChange={(e) => set("step", e.target.value)} placeholder="1" /></div>}
          {f.type === "select" && <div className="field" style={{ gridColumn: "1 / -1" }}><label>Options <span className="opt">· comma-separated</span></label><input value={optsText} onChange={(e) => setOptsText(e.target.value)} placeholder="Soft, Med, Stiff" /></div>}
        </div>
        <div className="modrow" style={{ justifyContent: "space-between" }}>
          <button className="btn danger sm" onClick={onDelete}><Trash2 size={13} /> Delete box</button>
          <div style={{ display: "flex", gap: 8 }}><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={!f.label.trim()}><Save size={14} /> Done</button></div>
        </div>
      </div>
    </div>
  );
}

function PromptModal({ title, initial, label, placeholder, onSave, onClose }) {
  const [v, setV] = useState(initial || "");
  return (
    <div className="ov">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <h2><Pencil size={15} color="var(--amber)" /> {title}</h2>
        <div className="field" style={{ marginTop: 6 }}><label>{label || "Name"}</label>
          <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder || ""}
            onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) onSave(v.trim()); if (e.key === "Escape") onClose(); }} /></div>
        <div className="modrow"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (v.trim()) onSave(v.trim()); }}><Save size={14} /> Save</button></div>
      </div>
    </div>
  );
}
function ConfirmModal({ title, message, confirmLabel, onConfirm, onClose }) {
  return (
    <div className="ov">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <h2>{title}</h2>
        <div className="msub">{message}</div>
        <div className="modrow">
          {onConfirm ? (<>
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn danger" onClick={onConfirm}><Trash2 size={14} /> {confirmLabel || "Delete"}</button>
          </>) : <button className="btn primary" onClick={onClose}>OK</button>}
        </div>
      </div>
    </div>
  );
}

const treadLabels = (n) => n === 3 ? ["I", "M", "O"] : n === 2 ? ["In", "Out"] : Array.from({ length: n }, (_, i) => `P${i + 1}`);

function TyreUI({ set, usage, events, onRotate, onMeasure, onInspect, compact }) {
  const tyreAt = (cn) => set ? set.tyres.find((t) => t.corner === cn) : null;
  const u = units();
  const tyreDetail = (t) => t ? [t.brand, t.compound, t.size].filter(Boolean).join(" · ") : "";
  return (
    <div className={"tyreui" + (compact ? " compact" : "")}>
      <div className="tyreui-head"><span className="ttl"><Disc size={13} /> Tyre UI</span>{set && <span className="setid">{setLabel(set)}</span>}<span className="sp" />
        {onMeasure && <button className="btn ghost sm" onClick={onMeasure}><Ruler size={12} /> Measure tread</button>}
        {onRotate && <button className="btn ghost sm" onClick={onRotate}><ArrowRight size={12} /> Rotate / move</button>}
      </div>
      {set ? (<>
        <div className="tyreui-grid">
          {["FL", "FR", "RL", "RR"].map((cn) => { const t = tyreAt(cn); const km = t && events ? tyreKm(events, t.id) : null; const cyc = t && events ? tyreCycles(events, t.id) : null; const tr = t ? latestTread(t) : null;
            return (
              <div className={"tyreui-cell" + (t ? " clk" : "")} key={cn} onClick={() => { if (t && onInspect) onInspect(t); }} title={t ? `${tyreDetail(t)}${tyreDetail(t) ? " · " : ""}inspect` : ""}>
                <span className="cn">{cn}</span>
                <span className="tid">{t ? tyreLabel(t) : "— empty —"}</span>
                {t && <span className="tstats">{km != null ? `${u.distance.disp(km)} ${u.distance.label}` : "—"} · {cyc || 0} cyc{tr != null ? ` · ${tr} mm` : ""}</span>}
              </div>
            ); })}
        </div>
        {usage && <div className="tyreui-foot">Set total {u.distance.disp(usage.km)} {u.distance.label} · {usage.laps} laps · {usage.cycles} sessions{set.optimumHot ? ` · optimum hot ${u.pressure.disp(set.optimumHot)} ${u.pressure.label}` : ""}</div>}
        {onInspect && <div className="tyreui-hint">Click a tyre to inspect its wear, dates and history.</div>}
      </>) : <div className="note" style={{ margin: 0 }}>No tyre set on the car — pick one in the setup's tyre box.</div>}
    </div>
  );
}

function MiniWearChart({ series, kmMax }) {
  if (!series.length) return <div className="zempty" style={{ padding: 14 }}>No tread readings yet.</div>;
  const u = units();
  const W = 460, H = 150, padL = 40, padR = 14, padT = 12, padB = 28;
  const xmax = Math.max(1, kmMax || 0, ...series.map((p) => p.km));
  const tvals = series.map((p) => p.tread);
  const lo = Math.min(...tvals), hi = Math.max(...tvals);
  const sx = (v) => padL + (v / xmax) * (W - padL - padR);
  const sy = (t) => (H - padB) - (hi === lo ? 0.5 : (t - lo) / (hi - lo)) * (H - padT - padB);
  const nT = 4;
  const xticks = Array.from({ length: nT + 1 }, (_, i) => Math.round((xmax * i / nT) * 10) / 10);
  const yticks = lo === hi ? [lo] : Array.from({ length: nT + 1 }, (_, i) => lo + (hi - lo) * i / nT);
  const d = series.map((p, i) => `${i ? "L" : "M"}${sx(p.km).toFixed(1)},${sy(p.tread).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {xticks.map((xt, i) => <g key={"x" + i}><line x1={sx(xt)} y1={padT} x2={sx(xt)} y2={H - padB} stroke="var(--line)" strokeOpacity={i === 0 ? 0.8 : 0.25} /><text x={sx(xt)} y={H - padB + 12} fill="var(--tx-faint)" fontSize="8.5" textAnchor="middle">{u.distance.disp(xt)}</text></g>)}
      {yticks.map((yt, i) => <g key={"y" + i}><line x1={padL} y1={sy(yt)} x2={W - padR} y2={sy(yt)} stroke="var(--line)" strokeOpacity={0.2} /><text x={padL - 5} y={sy(yt) + 3} fill="var(--cool)" fontSize="8" textAnchor="end">{yt.toFixed(1)}</text></g>)}
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="var(--line)" /><line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--line)" />
      {series.length >= 2 && <path d={d} fill="none" stroke="var(--cool)" strokeWidth="2" strokeDasharray="4 3" />}
      {series.map((p, i) => <circle key={i} cx={sx(p.km)} cy={sy(p.tread)} r="3.2" fill="var(--cool)" />)}
      <text x={(padL + W - padR) / 2} y={H - 3} fill="var(--tx-faint)" fontSize="9" textAnchor="middle">km on tyre — tread depth (mm)</text>
    </svg>
  );
}

function TyreInspector({ tyre, events, onSave, onClose }) {
  const [t, setT] = useState(() => JSON.parse(JSON.stringify(tyre)));
  const [editEntry, setEditEntry] = useState(null);
  const [ed, setEd] = useState(null);
  const u = units();
  const km = tyreKm(events, t.id), cycles = tyreCycles(events, t.id), age = daysSince(t.dateFitted || t.datePurchased);
  const series = tyreTreadSeries(t);
  const cur = series.length ? series[series.length - 1].tread : null;
  const smInp = { padding: "2px 5px", fontSize: 11, width: 46 };
  const log = [
    ...(t.history || []).map((h, i) => ({ kind: "h", i, date: h.date, text: h.text })),
    ...(t.treads || []).map((r, i) => ({ kind: "t", i, date: r.date, km: r.km, depths: r.depths, text: `Tread ${(r.depths || []).join(" / ")} mm @ ${u.distance.disp(r.km)} ${u.distance.label}` })),
  ].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const startEdit = (e) => { setEditEntry({ kind: e.kind, i: e.i }); setEd(e.kind === "t" ? { date: e.date || "", km: String(e.km ?? ""), depths: (e.depths || []).map(String) } : { date: e.date || "", text: e.text || "" }); };
  const delEntry = (e) => setT((p) => e.kind === "h" ? { ...p, history: (p.history || []).filter((_, i) => i !== e.i) } : { ...p, treads: (p.treads || []).filter((_, i) => i !== e.i) });
  const saveEdit = () => { setT((p) => editEntry.kind === "h" ? { ...p, history: (p.history || []).map((x, i) => i === editEntry.i ? { date: ed.date, text: ed.text } : x) } : { ...p, treads: (p.treads || []).map((x, i) => i === editEntry.i ? { date: ed.date, km: num(ed.km) || 0, depths: ed.depths } : x) }); setEditEntry(null); setEd(null); };
  return (
    <div className="ov">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h2><Disc size={16} color="var(--amber)" /> {tyreLabel(t)}</h2>
        <div className="msub">{[t.brand, t.compound, t.size].filter(Boolean).join(" · ") || "Tyre"}{t.serial ? "" : " · no FIA serial"} · currently {t.corner}</div>
        <div className="tyrestats" style={{ marginTop: 12 }}>
          <div className="ts"><span className="v num">{u.distance.disp(km)}</span><span className="k">{u.distance.label}</span></div>
          <div className="ts"><span className="v num">{cycles}</span><span className="k">Heat cycles</span></div>
          <div className="ts"><span className="v num">{cur == null ? "—" : cur}</span><span className="k">Tread mm</span></div>
          <div className="ts"><span className="v num">{age == null ? "—" : age}</span><span className="k">Days old</span></div>
        </div>
        <div className="eyebrow" style={{ margin: "14px 0 6px" }}>Edit details</div>
        <div className="fgrid">
          <div className="field"><label>FIA serial</label><input value={t.serial} onChange={(e) => setT((p) => ({ ...p, serial: e.target.value }))} placeholder="serial no." /></div>
          <div className="field"><label>Brand</label><input value={t.brand || ""} onChange={(e) => setT((p) => ({ ...p, brand: e.target.value }))} placeholder="Michelin" /></div>
          <div className="field"><label>Compound</label><input value={t.compound || ""} onChange={(e) => setT((p) => ({ ...p, compound: e.target.value }))} placeholder="S9M" /></div>
          <div className="field"><label>Size</label><input value={t.size || ""} onChange={(e) => setT((p) => ({ ...p, size: e.target.value }))} placeholder="27/65-18" /></div>
          <div className="field"><label>Date purchased</label><input type="date" value={t.datePurchased || ""} onChange={(e) => setT((p) => ({ ...p, datePurchased: e.target.value }))} /></div>
          <div className="field"><label>Date fitted</label><input type="date" value={t.dateFitted || ""} onChange={(e) => setT((p) => ({ ...p, dateFitted: e.target.value }))} /></div>
          <div className="field"><label>Optimum hot <span className="opt">· {u.pressure.label}</span></label><input className="num" value={u.pressure.sel === UNIT_DEFS.pressure.base ? (t.optimumHot || "") : (t.optimumHot === "" || t.optimumHot == null ? "" : u.pressure.disp(t.optimumHot))} onChange={(e) => setT((p) => ({ ...p, optimumHot: u.pressure.sel === UNIT_DEFS.pressure.base ? e.target.value : String(u.pressure.base(e.target.value)) }))} placeholder="e.g. 28.0" /></div>
          <div className="field"><label>Tread points</label><select value={t.treadPoints || 3} onChange={(e) => setT((p) => ({ ...p, treadPoints: +e.target.value }))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 3 ? "3 (I/M/O)" : n}</option>)}</select></div>
        </div>
        <div className="note" style={{ marginTop: 8 }}>km, heat cycles, tread and age are read from the sessions this tyre runs and can't be edited directly.</div>
        <div className="panel" style={{ marginTop: 12 }}><h3>Tread depth vs distance</h3><MiniWearChart series={series} /></div>
        <div className="eyebrow" style={{ margin: "14px 0 6px" }}>History &amp; tread readings</div>
        <div className="tyreui-hist" style={{ marginTop: 0 }}>
          {log.length ? log.map((e) => (
            <div key={e.kind + e.i} className="logrow">
              {editEntry && editEntry.kind === e.kind && editEntry.i === e.i ? (
                <div className="logedit">
                  <input type="date" value={ed.date} onChange={(ev) => setEd({ ...ed, date: ev.target.value })} />
                  {e.kind === "t" ? (<>{ed.depths.map((d, di) => <input key={di} className="num" style={smInp} value={d} onChange={(ev) => { const nd = ed.depths.slice(); nd[di] = ev.target.value; setEd({ ...ed, depths: nd }); }} />)}<input className="num" style={{ ...smInp, width: 56 }} value={ed.km} onChange={(ev) => setEd({ ...ed, km: ev.target.value })} placeholder="km" /></>) : (<input value={ed.text} onChange={(ev) => setEd({ ...ed, text: ev.target.value })} style={{ flex: 1 }} />)}
                  <button className="btn primary sm" onClick={saveEdit}>Save</button><button className="btn ghost sm" onClick={() => { setEditEntry(null); setEd(null); }}>Cancel</button>
                </div>
              ) : (
                <div className="thistline"><span className="thd">{e.date}</span> {e.text}
                  <span className="logacts"><button className="iconbtn" title="Edit" onClick={() => startEdit(e)}><Pencil size={11} /></button><button className="iconbtn" title="Delete" onClick={() => delEntry(e)}><Trash2 size={11} /></button></span>
                </div>
              )}
            </div>
          )) : <span style={{ color: "var(--tx-faint)" }}>No history yet.</span>}
        </div>
        <div className="modrow"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { onSave(t.id, t); onClose(); }}><Save size={14} /> Save tyre</button></div>
      </div>
    </div>
  );
}

function MoveControls({ sets, label, onMove }) {
  const [sid, setSid] = useState("");
  const [corner, setCorner] = useState("FL");
  const target = sets.find((s) => s.id === sid);
  const occ = target && target.tyres.find((t) => t.corner === corner);
  return (
    <span className="movectl">
      <select value={sid} onChange={(e) => setSid(e.target.value)}><option value="">{label || "to set…"}</option>{sets.map((s) => <option key={s.id} value={s.id}>{setLabel(s)}</option>)}</select>
      <select value={corner} onChange={(e) => setCorner(e.target.value)} disabled={!sid}>{CORNERS.map((c) => <option key={c} value={c}>{c}{target && target.tyres.some((t) => t.corner === c) ? " •" : ""}</option>)}</select>
      <button className="btn ghost sm" disabled={!sid} title={occ ? `${tyreLabel(occ)} will move to Unassigned` : "Move here"} onClick={() => { onMove(sid, corner); setSid(""); }}>→</button>
    </span>
  );
}

function RotateTyresModal({ bank, loose, events, focusSetId, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({ bank: JSON.parse(JSON.stringify(bank || [])), loose: JSON.parse(JSON.stringify(loose || [])) }));
  const [sel, setSel] = useState(null); // { kind:'corner'|'loose', id }
  const [mvSet, setMvSet] = useState("");
  const [mvCorner, setMvCorner] = useState("FL");
  const focus = draft.bank.find((s) => s.id === focusSetId) || draft.bank[0];
  const others = draft.bank.filter((s) => !focus || s.id !== focus.id);
  const u = units();
  const detail = (t) => [t.brand, t.compound].filter(Boolean).join(" ");
  const tyreAt = (cn) => focus ? focus.tyres.find((t) => t.corner === cn) : null;
  const selTyre = sel ? (sel.kind === "loose" ? draft.loose.find((t) => t.id === sel.id) : (focus && focus.tyres.find((t) => t.id === sel.id))) : null;
  const relocate = (tyreId, fromKind, toSetId, corner) => setDraft((d) => {
    let b = d.bank, lo = d.loose, tyre = null;
    if (fromKind === "loose") { tyre = lo.find((t) => t.id === tyreId); lo = lo.filter((t) => t.id !== tyreId); }
    else { const fs = b.find((s) => s.id === fromKind); tyre = fs && fs.tyres.find((t) => t.id === tyreId); b = b.map((s) => s.id === fromKind ? { ...s, tyres: s.tyres.filter((t) => t.id !== tyreId) } : s); }
    if (!tyre) return d;
    if (toSetId === "loose") return { bank: b, loose: [...lo, { ...tyre }] };
    const target = b.find((s) => s.id === toSetId); const occ = target && target.tyres.find((t) => t.corner === corner);
    if (occ) lo = [...lo, { ...occ }];
    b = b.map((s) => s.id === toSetId ? { ...s, tyres: [...s.tyres.filter((t) => !(occ && t.id === occ.id)), { ...tyre, corner }] } : s);
    return { bank: b, loose: lo };
  });
  const rotateFocus = (tyreId, corner) => setDraft((d) => ({ ...d, bank: d.bank.map((s) => {
    if (!focus || s.id !== focus.id) return s;
    const cur = s.tyres.find((t) => t.id === tyreId); const occ = s.tyres.find((t) => t.corner === corner && t.id !== tyreId);
    if (!cur || cur.corner === corner) return s;
    return { ...s, tyres: s.tyres.map((t) => t.id === tyreId ? { ...t, corner } : (occ && t.id === occ.id ? { ...t, corner: cur.corner } : t)) };
  }) }));
  const clickCorner = (cn) => {
    const t = tyreAt(cn);
    if (!sel) { if (t) setSel({ kind: "corner", id: t.id }); return; }
    if (sel.kind === "corner") { if (t && t.id === sel.id) { setSel(null); return; } rotateFocus(sel.id, cn); setSel(null); }
    else { relocate(sel.id, "loose", focus.id, cn); setSel(null); }
  };
  const clickLoose = (t) => setSel(sel && sel.kind === "loose" && sel.id === t.id ? null : { kind: "loose", id: t.id });
  const moveSets = sel && sel.kind === "loose" ? draft.bank : others;
  const mvTarget = moveSets.find((s) => s.id === mvSet);
  const doMove = () => { if (!sel || !mvSet) return; relocate(sel.id, sel.kind === "loose" ? "loose" : focus.id, mvSet, mvCorner); setSel(null); setMvSet(""); };
  const doUnassign = () => { if (!sel || sel.kind !== "corner") return; relocate(sel.id, focus.id, "loose"); setSel(null); };
  const save = () => {
    const today = new Date().toISOString().slice(0, 10);
    const orig = {}; (bank || []).forEach((s) => s.tyres.forEach((t) => { orig[t.id] = { corner: t.corner, where: s.id, label: setLabel(s) }; }));
    (loose || []).forEach((t) => { orig[t.id] = { corner: t.corner, where: "loose", label: "Unassigned" }; });
    const changes = [];
    const tagHist = (t, whereLabel, whereId) => { const o = orig[t.id]; if (!o) return t.history || [];
      if (o.where !== whereId) {
        const txt = whereId === "loose" ? `Unassigned from ${o.label}` : (o.where === "loose" ? `Assigned to ${whereLabel} ${t.corner}` : `Moved from ${o.label} to ${whereLabel} ${t.corner}`);
        changes.push({ tyre: tyreLabel(t), fromSet: o.label, toSet: whereLabel, corner: whereId === "loose" ? "" : t.corner });
        return [...(t.history || []), { date: today, text: txt }];
      }
      if (o.corner !== t.corner) { changes.push({ tyre: tyreLabel(t), from: o.corner, to: t.corner }); return [...(t.history || []), { date: today, text: `Rotated ${o.corner} → ${t.corner}` }]; }
      return t.history || [];
    };
    const newBank = draft.bank.map((ds) => { const lbl = setLabel(ds); return { ...ds, tyres: ds.tyres.map((t) => ({ ...t, history: tagHist(t, lbl, ds.id) })) }; });
    const newLoose = draft.loose.map((t) => ({ ...t, history: tagHist(t, "Unassigned", "loose") }));
    onSave(newBank, newLoose, changes);
  };
  return (
    <div className="ov">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <h2><Disc size={15} color="var(--amber)" /> Rotate / move tyres</h2>
        <div className="msub">{focus ? <><b style={{ fontFamily: "var(--mono)", color: "var(--amber)" }}>{setLabel(focus)}</b> — pick a tyre, then drop it on a corner to rotate, or move it to another set below. Whatever it displaces goes to <b>Unassigned</b>.</> : "No tyre set on the car's setup yet."}</div>
        {focus && (<>
          <div className="tyreui" style={{ marginTop: 12 }}>
            <div className="tyreui-grid">
              {["FL", "FR", "RL", "RR"].map((cn) => { const t = tyreAt(cn); const isSel = t && sel && sel.kind === "corner" && sel.id === t.id; const km = t && events ? tyreKm(events, t.id) : null;
                return (
                  <div key={cn} className={"tyreui-cell clk" + (isSel ? " selected" : "") + (sel && !isSel ? " target" : "")} onClick={() => clickCorner(cn)} title={t ? detail(t) : "empty corner"}>
                    <span className="cn">{cn}</span>
                    <span className="tid">{t ? tyreLabel(t) : "— empty —"}</span>
                    {t && <span className="tstats">{km != null ? `${u.distance.disp(km)} ${u.distance.label}` : "—"}{detail(t) ? ` · ${detail(t)}` : ""}</span>}
                  </div>
                ); })}
            </div>
            <div className="tyreui-hint">{sel ? (sel.kind === "corner" ? "Click another corner to swap, or move / unassign below." : "Click a corner to assign this tyre there.") : "Click a tyre to pick it up."}</div>
          </div>
          {selTyre && (
            <div className="moveactions">
              <span className="mvlabel">Selected <b style={{ fontFamily: "var(--mono)", color: "var(--amber)" }}>{tyreLabel(selTyre)}</b></span>
              <span className="sp" />
              {sel.kind === "corner" && <button className="btn ghost sm" onClick={doUnassign}>Unassign</button>}
              <span className="movectl">
                <select value={mvSet} onChange={(e) => setMvSet(e.target.value)}><option value="">move to set…</option>{moveSets.map((s) => <option key={s.id} value={s.id}>{setLabel(s)}</option>)}</select>
                <select value={mvCorner} onChange={(e) => setMvCorner(e.target.value)} disabled={!mvSet}>{CORNERS.map((cc) => <option key={cc} value={cc}>{cc}{mvTarget && mvTarget.tyres.some((t) => t.corner === cc) ? " •" : ""}</option>)}</select>
                <button className="btn ghost sm" disabled={!mvSet} onClick={doMove}>→</button>
              </span>
            </div>
          )}
        </>)}
        <div className="eyebrow" style={{ margin: "16px 0 7px" }}>Unassigned tyres · {draft.loose.length}</div>
        {draft.loose.length === 0 ? <div className="zempty" style={{ padding: 14 }}>None.</div> : (
          <div className="loosechips">{draft.loose.map((t) => { const isSel = sel && sel.kind === "loose" && sel.id === t.id;
            return <button key={t.id} className={"loosechip" + (isSel ? " selected" : "")} onClick={() => clickLoose(t)} title={detail(t)}>{tyreLabel(t)}</button>; })}</div>
        )}
        <div className="modrow"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={!focus}><Save size={14} /> Save change</button></div>
      </div>
    </div>
  );
}

function TreadModal({ set, onSave, onClose }) {
  const points = (set && set.treadPoints) || 3;
  const labels = treadLabels(points);
  const [t, setT] = useState(() => { const o = {}; CORNERS.forEach((c) => o[c] = Array(points).fill("")); return o; });
  const [note, setNote] = useState("");
  const setPt = (c, i, v) => setT((p) => { const n = JSON.parse(JSON.stringify(p)); n[c][i] = v; return n; });
  return (
    <div className="ov">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <h2><Ruler size={15} color="var(--amber)" /> Tread measurement</h2>
        <div className="msub">Depth (mm){set ? <> · <b style={{ fontFamily: "var(--mono)", color: "var(--amber)" }}>{setLabel(set)}</b></> : ""} · {points === 3 ? "inner / mid / outer" : `${points} points`} per tyre</div>
        <table className="cmx" style={{ marginTop: 10 }}><thead><tr><th className="corner">Corner</th>{labels.map((l) => <th key={l}>{l}</th>)}</tr></thead>
          <tbody>{CORNERS.map((c) => (
            <tr key={c}><td className="corner">{CORNER_LABEL[c]}</td>
              {labels.map((l, i) => <td key={i}><input className="num" style={inp} value={t[c][i]} onChange={(e) => setPt(c, i, e.target.value)} /></td>)}
            </tr>))}</tbody></table>
        <div className="field" style={{ marginTop: 8 }}><label>Note <span className="opt">· optional</span></label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. after Race 1" /></div>
        <div className="modrow"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => onSave(t, note, points)}><Save size={14} /> Add to timeline</button></div>
      </div>
    </div>
  );
}

function CarProfileEditor({ car, db, initialTab, onCancel, backToEvent, onChange, onDelete, onCompare }) {
  const isNew = !car;
  const [c, setC] = useState(car ? JSON.parse(JSON.stringify(car)) : {
    id: uid(), name: "", make: "", model: "", klass: "", damperWays: 2, rocker: false,
    driveType: "", gearbox: "", shiftType: "", engine: "", horsepower: "", trackWidth: "", wheelbase: "", ecu: "", dash: "", onboardCamera: "",
    cwOn: true, ballastOn: false,
    channelMap: {}, setupSchema: defaultSchema(2, false), setups: [], tyreBank: [],
  });
  const set = (k, v) => setC((p) => ({ ...p, [k]: v }));
  const [ctab, setCtab] = useState(initialTab || "details");
  const [tyreSetSel, setTyreSetSel] = useState(null);
  const [tyreModal, setTyreModal] = useState(false);
  const [newTyre, setNewTyre] = useState(false);
  const [graphCircuit, setGraphCircuit] = useState("");
  const [tyreHistId, setTyreHistId] = useState(null);
  const [rotateModal, setRotateModal] = useState(null); // focus set id
  const [treadTarget, setTreadTarget] = useState(null); // set id to measure
  const applyCarRotation = (newBank, newLoose) => { setC((p) => ({ ...p, tyreBank: newBank, looseTyres: newLoose ?? (p.looseTyres || []) })); setRotateModal(null); };
  const applyCarTread = (setId, tread) => { setC((p) => ({ ...p, tyreBank: applyTread(p.tyreBank, setId, tread, db.events) })); setTreadTarget(null); };
  const [inspectTyre, setInspectTyre] = useState(null);
  const saveTyre = (tyreId, upd) => setC((p) => ({ ...p, tyreBank: (p.tyreBank || []).map((s) => ({ ...s, tyres: s.tyres.map((t) => t.id === tyreId ? upd : t) })), looseTyres: (p.looseTyres || []).map((t) => t.id === tyreId ? upd : t) }));
  const allBanks = () => db.carProfiles.map((cc) => cc.id === c.id ? (c.tyreBank || []) : (cc.tyreBank || []));
  const addTyreSet = (set, usedIds = []) => { setC((p) => ({ ...p, tyreBank: [...(p.tyreBank || []), set], looseTyres: (p.looseTyres || []).filter((t) => !usedIds.includes(t.id)) })); setTyreModal(false); setTyreSetSel(set.id); };
  const updateTyreSet = (setId, patch) => setC((p) => ({ ...p, tyreBank: p.tyreBank.map((s) => s.id === setId ? { ...s, ...patch } : s) }));
  const delTyreSet = (setId) => { setC((p) => ({ ...p, tyreBank: (p.tyreBank || []).filter((s) => s.id !== setId), looseTyres: [...(p.looseTyres || []), ...((p.tyreBank || []).find((s) => s.id === setId)?.tyres || [])] })); setTyreSetSel(null); };
  const assignLoose = (tyreId, toSetId, corner) => setC((p) => {
    const today = new Date().toISOString().slice(0, 10);
    const ty = (p.looseTyres || []).find((t) => t.id === tyreId); if (!ty) return p;
    let loose = (p.looseTyres || []).filter((t) => t.id !== tyreId);
    const target = (p.tyreBank || []).find((s) => s.id === toSetId); if (!target) return p; const lbl = setLabel(target);
    const occ = target.tyres.find((t) => t.corner === corner);
    if (occ) loose = [...loose, { ...occ, history: [...(occ.history || []), { date: today, text: `Unassigned from ${lbl}` }] }];
    const bank = (p.tyreBank || []).map((s) => s.id === toSetId ? { ...s, tyres: [...s.tyres.filter((t) => !(occ && t.id === occ.id)), { ...ty, corner, history: [...(ty.history || []), { date: today, text: `Assigned to ${lbl} ${corner}` }] }] } : s);
    return { ...p, tyreBank: bank, looseTyres: loose };
  });
  const delLooseTyre = (tyreId) => setC((p) => ({ ...p, looseTyres: (p.looseTyres || []).filter((t) => t.id !== tyreId) }));
  const createLooseTyre = (fields) => { setC((p) => ({ ...p, looseTyres: [...(p.looseTyres || []), makeTyre({ ...fields, corner: "FL" })] })); setNewTyre(false); };

  // ensure there's always a setup to edit values against
  useEffect(() => { if (c.setups.length === 0) setC((p) => ({ ...p, setups: [{ id: uid(), name: "Baseline", basedOn: null, createdAt: Date.now(), values: blankValues(p) }] })); }, []);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (isNew && !c.name.trim()) return; // don't persist an unnamed brand-new car
    onChange(c);
  }, [c]);
  const [selSetup, setSel] = useState(car?.setups?.[0]?.id || "");
  useEffect(() => { if (!selSetup && c.setups[0]) setSel(c.setups[0].id); }, [c.setups.length]);
  const selIdx = c.setups.findIndex((s) => s.id === selSetup);
  const selValues = c.setups[selIdx]?.values || {};
  const [editFieldId, setEditFieldId] = useState(null);
  const editField = editFieldId ? (() => { for (const g of c.setupSchema) { const f = g.fields.find((x) => x.id === editFieldId); if (f) return f; } return null; })() : null;

  const addField = (zone) => {
    const nf = { id: uid(), label: "New adjustment", type: "number", unit: "", perCorner: zone === "corner", options: [], step: 1, holes: 5, zone };
    setC((p) => {
      const s = JSON.parse(JSON.stringify(p.setupSchema));
      const gname = zone === "corner" ? "Corner" : zone === "front" ? "Front" : zone === "rear" ? "Rear" : "Whole car";
      let g = s.find((x) => x.name === gname); if (!g) { g = { id: uid(), name: gname, fields: [] }; s.push(g); }
      g.fields.push(nf);
      const setups = p.setups.map((su) => ({ ...su, values: { ...su.values, [nf.id]: zone === "corner" ? { FL: "", FR: "", RL: "", RR: "" } : "" } }));
      return { ...p, setupSchema: s, setups };
    });
    setEditFieldId(nf.id);
  };
  const patchField = (id, patch) => setC((p) => {
    const s = JSON.parse(JSON.stringify(p.setupSchema));
    let before = null, after = null;
    for (const g of s) { const fi = g.fields.findIndex((f) => f.id === id); if (fi >= 0) { before = g.fields[fi]; after = { ...before, ...patch }; if (patch.zone !== undefined) after.perCorner = patch.zone === "corner"; g.fields[fi] = after; break; } }
    if (!after) return p;
    let setups = p.setups;
    if (before.perCorner !== after.perCorner) {
      setups = p.setups.map((su) => { const vals = { ...su.values }; const cur = vals[id];
        if (after.perCorner) { const scalar = (cur && typeof cur === "object") ? "" : (cur || ""); vals[id] = { FL: scalar, FR: scalar, RL: scalar, RR: scalar }; }
        else { const o = (cur && typeof cur === "object") ? cur : {}; vals[id] = o.FL || o.FR || o.RL || o.RR || ""; }
        return { ...su, values: vals }; });
    }
    return { ...p, setupSchema: s, setups };
  });
  const removeField = (id) => { setC((p) => ({ ...p, setupSchema: p.setupSchema.map((g) => ({ ...g, fields: g.fields.filter((f) => f.id !== id) })), setups: p.setups.map((su) => { const vals = { ...su.values }; delete vals[id]; return { ...su, values: vals }; }) })); setEditFieldId(null); };
  const setVal = (fieldId, corner, v) => setC((p) => ({ ...p, setups: p.setups.map((su) => {
    if (su.id !== selSetup) return su; const vals = { ...su.values };
    if (corner) vals[fieldId] = { ...(vals[fieldId] || {}), [corner]: v }; else vals[fieldId] = v;
    return { ...su, values: vals }; }) }));

  const [promptCfg, setPromptCfg] = useState(null);
  const [confirmCfg, setConfirmCfg] = useState(null);
  const addSetup = () => setPromptCfg({ title: "New setup", label: "Setup name", initial: `Setup ${c.setups.length + 1}`,
    onSave: (name) => { const ns = { id: uid(), name, basedOn: null, createdAt: Date.now(), values: blankValues(c) }; setC((p) => ({ ...p, setups: [...p.setups, ns] })); setSel(ns.id); setPromptCfg(null); } });
  const dupSetup = () => { const cur = c.setups[selIdx]; if (!cur) return; const ns = { id: uid(), name: `${cur.name} copy`, basedOn: cur.id, createdAt: Date.now(), balance: cur.balance || "", values: JSON.parse(JSON.stringify(cur.values)) }; setC((p) => ({ ...p, setups: [...p.setups, ns] })); setSel(ns.id); };
  const setBalance = (b) => setC((p) => ({ ...p, setups: p.setups.map((s) => s.id === selSetup ? { ...s, balance: s.balance === b ? "" : b } : s) }));
  const renameSetup = () => { const cur = c.setups[selIdx]; if (!cur) return; setPromptCfg({ title: "Rename setup", label: "Setup name", initial: cur.name,
    onSave: (name) => { setC((p) => ({ ...p, setups: p.setups.map((s) => s.id === cur.id ? { ...s, name } : s) })); setPromptCfg(null); } }); };
  const delSetup = () => { const cur = c.setups[selIdx]; if (!cur) return; setConfirmCfg({ title: "Delete setup", message: `Delete “${cur.name}”? This can't be undone.`,
    onConfirm: () => { const nextId = (c.setups.find((s) => s.id !== selSetup) || {}).id || ""; setC((p) => ({ ...p, setups: p.setups.filter((s) => s.id !== cur.id) })); setSel(nextId); setConfirmCfg(null); } }); };

  const regenDampers = (ways, rocker) => {
    setC((p) => {
      let schema = p.setupSchema.filter((g) => g.name !== "Dampers" && g.name !== "Rockers");
      const fields = DAMPER_PRESETS[ways].map((n) => ({ id: uid(), label: n, type: "stepper", unit: "clk", perCorner: true, options: [], step: 1, holes: 5, zone: "corner", kind: "damper" }));
      if (rocker) fields.push({ id: uid(), label: "Rocker position", type: "holes", unit: "", perCorner: true, options: [], step: 1, holes: 5, zone: "corner", kind: "rocker" });
      const damperGroup = { id: uid(), name: "Dampers", fields };
      const di = p.setupSchema.findIndex((g) => g.name === "Dampers");
      if (di >= 0) schema.splice(Math.min(di, schema.length), 0, damperGroup); else schema.push(damperGroup);
      return { ...p, damperWays: ways, rocker, setupSchema: schema };
    });
  };

  const renameSpecial = (id, curLabel) => setPromptCfg({ title: "Rename box", label: "Box label", initial: curLabel,
    onSave: (n) => { patchField(id, { label: n }); setPromptCfg(null); } });

  const cornerFields = allFields(c).filter((f) => fieldZone(f) === "corner" && !isSpecial(f));
  const frontFields = allFields(c).filter((f) => fieldZone(f) === "front" && !isSpecial(f));
  const rearFields = allFields(c).filter((f) => fieldZone(f) === "rear" && !isSpecial(f));
  const globalFields = allFields(c).filter((f) => fieldZone(f) === "global" && !isSpecial(f));
  const damperFields = allFields(c).filter((f) => f.kind === "damper");
  const cwField = allFields(c).find((f) => f.kind === "cornerweight");
  const fuelField = allFields(c).find((f) => f.kind === "fuel");
  const driverField = allFields(c).find((f) => f.kind === "driver");
  const ballastField = allFields(c).find((f) => f.kind === "ballast");
  const tyresetField = allFields(c).find((f) => f.kind === "tyreset");
  const hotField = allFields(c).find((f) => f.kind === "hotpressure");
  const hasSetup = selIdx >= 0;
  const selTyreSet = (c.tyreBank || []).find((s) => s.id === (tyresetField ? (selValues[tyresetField.id] || "") : ""));
  const cornerTyre = (corner) => selTyreSet ? (selTyreSet.tyres.find((t) => t.corner === corner) || {}).id : null;

  // ---- compare overlay ----
  const [cmpOn, setCmpOn] = useState(false);
  const [cmpId, setCmpId] = useState("");
  const [usageOpen, setUsageOpen] = useState(false);
  useEffect(() => {
    if (!cmpOn) return;
    const valid = cmpId && cmpId !== selSetup && c.setups.some((s) => s.id === cmpId);
    if (!valid) { const other = c.setups.find((s) => s.id !== selSetup); setCmpId(other ? other.id : ""); }
  }, [cmpOn, selSetup, cmpId, c.setups.length]);
  const cmpSetup = c.setups.find((s) => s.id === cmpId);
  const showCmp = cmpOn && cmpSetup && cmpSetup.id !== selSetup;
  const cmpValues = cmpSetup?.values || {};
  const gv = (vals, id, corner) => { const x = corner ? (vals[id] || {})[corner] : vals[id]; return x == null ? "" : String(x); };
  const isDiff = (id, corner) => showCmp && gv(selValues, id, corner) !== gv(cmpValues, id, corner);
  const usageFor = (setupId) => (db?.events || []).filter((e) => e.baseSetupId === setupId);

  // value cell with optional diff highlight + comparison overlay
  const vcell = (f, corner) => (
    <div className={"vwrap" + (isDiff(f.id, corner) ? " diff" : "")}>
      <ValueInput field={f} val={corner ? (selValues[f.id] || {})[corner] : selValues[f.id]} onChange={(v) => setVal(f.id, corner || null, v)} disabled={!hasSetup} />
      {showCmp && isDiff(f.id, corner) && <span className="cmpv">{gv(cmpValues, f.id, corner) || "–"}</span>}
    </div>
  );

  const box = (f, corner) => (
    <div className="abox" key={f.id + (corner || "")}>
      <button className="alabel" onClick={() => setEditFieldId(f.id)} title="Edit this box">{f.label}{f.unit ? <span className="au"> {f.unit}</span> : null}</button>
      {vcell(f, corner)}
    </div>
  );

  // per-corner damper matrix (2×2, with a spanning cell for an odd/5th adjuster e.g. blow-off)
  const damperMatrix = (corner) => {
    if (!damperFields.length) return null;
    return (
      <div className="dmatrix">
        <div className="dmlabel">Dampers <span className="au">clk</span></div>
        <div className="dmgrid">
          {damperFields.map((f, i) => {
            const solo = damperFields.length % 2 === 1 && i === damperFields.length - 1;
            return (
              <div className={"dmcell" + (solo ? " span" : "") + (isDiff(f.id, corner) ? " diff" : "")} key={f.id}>
                <span className="dmn">{f.label}</span>
                <ValueInput field={f} val={(selValues[f.id] || {})[corner]} onChange={(v) => setVal(f.id, corner, v)} disabled={!hasSetup} />
                {showCmp && isDiff(f.id, corner) && <span className="cmpv">{gv(cmpValues, f.id, corner) || "–"}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const cornerCell = (corner, title) => (
    <div className="zcell">
      <div className="zhead"><span>{title}</span><button className="addbox" onClick={() => addField("corner")} title="Add a corner adjustment"><Plus size={13} /></button></div>
      {cornerFields.map((f) => box(f, corner))}
      {damperMatrix(corner)}
    </div>
  );
  const centerCell = (zone, title, fields) => (
    <div className="zcell center">
      <div className="zhead"><span>{title}</span><button className="addbox" onClick={() => addField(zone)} title={`Add a ${title.toLowerCase()} adjustment`}><Plus size={13} /></button></div>
      {fields.length ? fields.map((f) => box(f, null)) : <div className="zempty">＋ add a {title.toLowerCase()} box</div>}
    </div>
  );

  // quadrant of one per-corner field (2×2 with corner labels)
  const quad = (f, editableLabel) => (
    <div className="quadwrap">
      {f && editableLabel && <button className="quadlbl" onClick={() => renameSpecial(f.id, f.label)} title="Rename">{f.label}{f.unit ? ` (${f.unit})` : ""}</button>}
      <div className="quad">
        {CORNERS.map((cn) => (
          <div className="qcell" key={cn}>
            <span className="qc">{cn}</span>
            {vcell(f, cn)}
          </div>
        ))}
      </div>
    </div>
  );

  const cornerWeightBox = () => (
    <div className="zcell wide">
      <div className="zhead"><span>Corner weights</span>
        <label className="cochk"><input type="checkbox" checked={c.cwOn} onChange={(e) => set("cwOn", e.target.checked)} /> Track</label>
      </div>
      {c.cwOn && cwField ? (<>
        {quad(cwField, true)}
        <div className="cwtotal">Total <b>{(() => { const o = selValues[cwField.id] || {}; const s = CORNERS.reduce((a, cn) => a + (num(o[cn]) || 0), 0); return s ? s.toFixed(1) : "—"; })()}</b> kg</div>
        <div className="cwinputs">
          {fuelField && <div className="field"><label>{fuelField.label} <span className="req">*</span></label><input value={selValues[fuelField.id] || ""} onChange={(e) => setVal(fuelField.id, null, e.target.value)} placeholder="e.g. 40" /></div>}
          {driverField && <div className="field"><label>{driverField.label} <span className="req">*</span></label><input value={selValues[driverField.id] || ""} onChange={(e) => setVal(driverField.id, null, e.target.value)} placeholder="e.g. 80" /></div>}
        </div>
        <label className="cochk" style={{ marginTop: 8 }}><input type="checkbox" checked={c.ballastOn} onChange={(e) => set("ballastOn", e.target.checked)} /> Running ballast</label>
        {c.ballastOn && ballastField && <div className="field" style={{ marginTop: 6 }}><label>{ballastField.label} ({ballastField.unit})</label><input value={selValues[ballastField.id] || ""} onChange={(e) => setVal(ballastField.id, null, e.target.value)} placeholder="e.g. 15" /></div>}
      </>) : <div className="zempty">Corner-weight tracking is off.</div>}
    </div>
  );

  const tyreBox = () => (
    <div className="zcell wide">
      <div className="zhead"><span>Tyres</span></div>
      {tyresetField && <TyreSetPicker car={c} value={selValues[tyresetField.id]} onChange={(v) => setVal(tyresetField.id, null, v)} readOnly={!hasSetup} />}
      {selTyreSet && <div style={{ marginTop: 12 }}><TyreUI set={selTyreSet} events={db.events} usage={tyreSetUsage(db.events, selTyreSet.id)} onRotate={hasSetup ? () => setRotateModal(selTyreSet.id) : undefined} onMeasure={hasSetup ? () => setTreadTarget(selTyreSet.id) : undefined} onInspect={setInspectTyre} /></div>}
    </div>
  );

  const damperControls = () => (
    <div className="dampctl">
      <span className="sblabel">Dampers</span>
      <select value={c.damperWays} onChange={(e) => regenDampers(+e.target.value, c.rocker)}>
        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}-way</option>)}
      </select>
    </div>
  );

  const exportPDF = () => { setCmpOn(false); setTimeout(() => window.print(), 60); };
  const perCornerRows = [...cornerFields, ...damperFields, ...(hotField ? [hotField] : []), ...(c.cwOn && cwField ? [cwField] : [])];
  const singleRows = [
    ...frontFields.map((f) => [`Front · ${f.label}`, gv(selValues, f.id, null), f.unit]),
    ...rearFields.map((f) => [`Rear · ${f.label}`, gv(selValues, f.id, null), f.unit]),
    ...globalFields.map((f) => [f.label, gv(selValues, f.id, null), f.unit]),
    ...(selTyreSet ? [["Tyre set", `${setLabel(selTyreSet)} · ${selTyreSet.brand} ${selTyreSet.compound}`, ""], ...(selTyreSet.optimumHot ? [["Optimum hot", units().pressure.disp(selTyreSet.optimumHot), units().pressure.label]] : [])] : []),
    ...(fuelField ? [[fuelField.label, gv(selValues, fuelField.id, null), fuelField.unit]] : []),
    ...(driverField ? [[driverField.label, gv(selValues, driverField.id, null), driverField.unit]] : []),
    ...(c.ballastOn && ballastField ? [[ballastField.label, gv(selValues, ballastField.id, null), ballastField.unit]] : []),
  ];

  return (
    <div>
      <div className="backrow">
        <button className="btn ghost" onClick={onCancel}><ArrowLeft size={14} /> Cars</button>
        {backToEvent && <button className="btn" onClick={backToEvent}><ArrowLeft size={14} /> Back to event</button>}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="savedtag"><Check size={12} /> Changes saved automatically</span>
          {onDelete && <button className="btn danger sm" onClick={() => {
            const usedBy = (db?.events || []).filter((e) => e.carProfileId === c.id).length;
            if (usedBy) setConfirmCfg({ title: "Can't delete this car", message: `It's used by ${usedBy} event${usedBy > 1 ? "s" : ""}. Remove those events first, then delete the profile.` });
            else setConfirmCfg({ title: "Delete car profile?", message: `“${c.name || "This car"}” and all of its setups will be permanently removed. This can't be undone.`, confirmLabel: "Delete profile", onConfirm: () => { setConfirmCfg(null); onDelete(); } });
          }}><Trash2 size={13} /> Delete</button>}
        </div>
      </div>
      <div className="pagehead"><h1>{c.name || "New car profile"}</h1></div>

      <div className="nav" style={{ marginBottom: 16 }}>
        <button className={ctab === "details" ? "on" : ""} onClick={() => setCtab("details")}><Car size={14} /> Car details</button>
        <button className={ctab === "setup" ? "on" : ""} onClick={() => setCtab("setup")}><Layers size={14} /> Setup sheet</button>
        <button className={ctab === "tyres" ? "on" : ""} onClick={() => setCtab("tyres")}><Disc size={14} /> Tyre bank</button>
      </div>

      {ctab === "details" && (<>
        <div className="fsection"><div className="ttl"><Car size={14} /> Identity</div>
          <div className="fgrid">
            <div className="field" style={{ gridColumn: "span 2" }}><label>Name</label><input value={c.name} onChange={(e) => set("name", e.target.value)} placeholder="Porsche 992 GT3 Cup" /></div>
            <div className="field"><label>Make</label><input value={c.make} onChange={(e) => set("make", e.target.value)} /></div>
            <div className="field"><label>Model</label><input value={c.model} onChange={(e) => set("model", e.target.value)} /></div>
            <div className="field"><label>Class</label><input value={c.klass} onChange={(e) => set("klass", e.target.value)} /></div>
          </div>
        </div>

        <div className="fsection"><div className="ttl"><Gauge size={14} /> Drivetrain</div>
          <div className="fgrid">
            <div className="field"><label>Drive type</label>
              <select value={c.driveType || ""} onChange={(e) => set("driveType", e.target.value)}>
                <option value="">—</option>{["FWD", "RWD", "AWD"].map((o) => <option key={o} value={o}>{o}</option>)}
              </select></div>
            <div className="field"><label>Engine</label><input value={c.engine || ""} onChange={(e) => set("engine", e.target.value)} placeholder="4.0L flat-6" /></div>
            <div className="field"><label>Power <span className="opt">· hp</span></label><input value={c.horsepower || ""} onChange={(e) => set("horsepower", e.target.value)} placeholder="510" /></div>
            <div className="field"><label>Gearbox</label><input value={c.gearbox || ""} onChange={(e) => set("gearbox", e.target.value)} placeholder="6-speed" /></div>
            <div className="field"><label>Shift type</label>
              <select value={c.shiftType || ""} onChange={(e) => set("shiftType", e.target.value)}>
                <option value="">—</option>{["Sequential", "Paddle shift", "H-pattern"].map((o) => <option key={o} value={o}>{o}</option>)}
              </select></div>
          </div>
        </div>

        <div className="fsection"><div className="ttl"><Layers size={14} /> Chassis &amp; electronics</div>
          <div className="fgrid">
            <div className="field"><label>Track width <span className="opt">· mm</span></label><input value={c.trackWidth || ""} onChange={(e) => set("trackWidth", e.target.value)} placeholder="1680" /></div>
            <div className="field"><label>Wheelbase <span className="opt">· mm</span></label><input value={c.wheelbase || ""} onChange={(e) => set("wheelbase", e.target.value)} placeholder="2450" /></div>
            <div className="field"><label>ECU</label><input value={c.ecu || ""} onChange={(e) => set("ecu", e.target.value)} placeholder="MoTeC M150" /></div>
            <div className="field"><label>Dash</label><input value={c.dash || ""} onChange={(e) => set("dash", e.target.value)} placeholder="MoTeC C125" /></div>
            <div className="field"><label>Onboard camera</label><input value={c.onboardCamera || ""} onChange={(e) => set("onboardCamera", e.target.value)} placeholder="e.g. SmartyCam 3" /></div>
          </div>
        </div>
      </>)}

      {ctab === "setup" && (<>
        <div className="note" style={{ marginTop: 0, marginBottom: 12 }}>Build the car's adjustments on the diagram — hit <b>＋</b> on any zone to add a box, then set its label, unit and type (click a box's label to edit it later). Pick a setup to enter its values in place. Box changes apply to every setup; the values you type are saved per setup.</div>

        <div className="setupbar">
          <span className="sblabel">Editing setup</span>
          <select value={selSetup} onChange={(e) => setSel(e.target.value)}>
            {c.setups.length === 0 && <option value="">— none —</option>}
            {c.setups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn sm" onClick={addSetup}><Plus size={12} /> New</button>
          <button className="btn sm" onClick={dupSetup} disabled={!hasSetup}><Copy size={12} /> Duplicate</button>
          <button className="btn sm" onClick={renameSetup} disabled={!hasSetup}><Pencil size={12} /> Rename</button>
          <span className="sp" />
          {damperControls()}
          <button className="btn sm" onClick={exportPDF} disabled={!hasSetup} title="Print / save the setup sheet as PDF"><FileDown size={12} /> Export sheet</button>
          <button className="iconbtn" onClick={delSetup} disabled={!hasSetup || c.setups.length <= 1} title="Delete this setup"><Trash2 size={14} /></button>
        </div>

        {hasSetup && (
          <div className="baltag">
            <span className="sblabel">Balance</span>
            <div className="seg sm">
              {BALANCES.map(([v, l]) => <button key={v} className={(c.setups[selIdx]?.balance === v) ? "on" : ""} onClick={() => setBalance(v)}>{l}</button>)}
            </div>
          </div>
        )}

        {hasSetup && (() => { const used = usageFor(selSetup); return (
          <div className="usedwrap">
            <button className={"usedbtn" + (usageOpen ? " on" : "")} onClick={() => setUsageOpen((o) => !o)}>
              <Info size={13} /> Where used <span className="ucount">{used.length}</span>{usageOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {usageOpen && (
              <div className="usedpanel">
                {used.length ? used.map((e) => (
                  <div className="usedrow" key={e.id}>
                    <div className="ur1">{eventGroup(e)}{e.eventType === "series" && e.round ? ` · Round ${e.round}` : ""}</div>
                    <div className="ur2">{e.circuit || "—"}{e.config ? ` · ${e.config}` : ""}{e.startDate ? ` · ${e.startDate}` : ""}</div>
                  </div>
                )) : <div className="fddempty">This setup hasn't been used at an event yet.</div>}
              </div>
            )}
          </div>
        ); })()}

        <div className="cmpbar">
          <label className="cochk"><input type="checkbox" checked={cmpOn} onChange={(e) => setCmpOn(e.target.checked)} disabled={c.setups.length < 2} /> Compare against</label>
          <select value={cmpId} onChange={(e) => setCmpId(e.target.value)} disabled={!cmpOn}>
            {c.setups.filter((s) => s.id !== selSetup).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {showCmp && <span className="cmphint">Differences are highlighted; the small figure is <b style={{ color: "var(--cool)" }}>{cmpSetup.name}</b>'s value.</span>}
        </div>

        <div className="setupdiagram">
          {cornerCell("FL", "Front-left")}
          {centerCell("front", "Front", frontFields)}
          {cornerCell("FR", "Front-right")}
          {cornerCell("RL", "Rear-left")}
          {centerCell("rear", "Rear", rearFields)}
          {cornerCell("RR", "Rear-right")}
        </div>

        <div className="widerow">
          <div className="wcol">
            {cornerWeightBox()}
            <div className="zcell wide compact">
              <div className="zhead"><span>Whole car</span><button className="addbox" onClick={() => addField("global")} title="Add a whole-car adjustment"><Plus size={13} /></button></div>
              <div className="globrow">{globalFields.length ? globalFields.map((f) => box(f, null)) : <div className="zempty">＋ add a whole-car box</div>}</div>
            </div>
          </div>
          {tyreBox()}
        </div>
      </>)}

      {ctab === "tyres" && (() => {
        const bank = c.tyreBank || [];
        const sel = bank.find((s) => s.id === tyreSetSel);
        if (sel) {
          const u = tyreSetUsage(db.events, sel.id);
          const treadsNow = (sel.tyres || []).map(latestTread).filter((x) => x != null);
          const avgTread = treadsNow.length ? Math.round((treadsNow.reduce((a, b) => a + b, 0) / treadsNow.length) * 100) / 100 : null;
          const upd = (k, v) => updateTyreSet(sel.id, { [k]: v });
          return (
            <>
              <div className="backrow">
                <button className="btn ghost sm" onClick={() => setTyreSetSel(null)}><ArrowLeft size={14} /> Tyre bank</button>
                <button className="btn danger sm" onClick={() => setConfirmCfg({ title: "Delete tyre set?", message: `Set ${setLabel(sel)} will be removed and its tyres sent to Unassigned.`, confirmLabel: "Delete set", onConfirm: () => { setConfirmCfg(null); delTyreSet(sel.id); } })}><Trash2 size={13} /> Delete set</button>
              </div>
              <div className="pagehead"><div><h1 style={{ fontFamily: "var(--mono)" }}>{setLabel(sel)}</h1><div className="sub">{setBrand(sel)} {setCompound(sel)}{setSize(sel) ? ` · ${setSize(sel)}` : ""}</div></div>
                <span className="sp" />
                <div className="tyrestats">
                  <div className="ts"><span className="v num">{units().distance.disp(u.km)}</span><span className="k">{units().distance.label}</span></div>
                  <div className="ts"><span className="v num">{u.laps}</span><span className="k">Laps</span></div>
                  <div className="ts"><span className="v num">{u.cycles}</span><span className="k">Sessions</span></div>
                  <div className="ts"><span className="v num">{avgTread == null ? "—" : avgTread}</span><span className="k">Avg tread mm</span></div>
                </div>
              </div>
              <div className="widerow">
                <div className="zcell wide"><div className="zhead"><span>Set details</span></div>
                  <div className="fgrid">
                    <div className="field"><label>Brand <span className="opt">· from tyres</span></label><input value={setBrand(sel)} disabled /></div>
                    <div className="field"><label>Compound <span className="opt">· from tyres</span></label><input value={setCompound(sel)} disabled /></div>
                    <div className="field"><label>Size <span className="opt">· from tyres</span></label><input value={setSize(sel) || "—"} disabled /></div>
                    <div className="field"><label>Optimum hot <span className="opt">· {units().pressure.label}</span></label><input className="num" value={units().pressure.sel === "psi" ? (sel.optimumHot || "") : units().pressure.disp(sel.optimumHot)} onChange={(e) => upd("optimumHot", units().pressure.sel === "psi" ? e.target.value : String(units().pressure.base(e.target.value)))} placeholder="e.g. 28.0" /></div>
                    <div className="field"><label>Tread points</label><select value={sel.treadPoints || 3} onChange={(e) => upd("treadPoints", +e.target.value)}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 3 ? "3 (I/M/O)" : n}</option>)}</select></div>
                  </div>
                  <div className="field" style={{ marginTop: 8 }}><label>Notes</label><textarea value={sel.notes} onChange={(e) => upd("notes", e.target.value)} /></div>
                  <div className="note" style={{ marginTop: 10 }}>Brand, compound and size are read from the set's tyres (they should match). km, laps and sessions come from the events this set runs. Each tyre's own serial, dates, km, cycles and tread history live on its inspector — click a tyre.</div>
                </div>
                <div className="zcell wide"><div className="zhead"><span>Tyres</span></div>
                  <TyreUI set={sel} usage={u} events={db.events} onRotate={() => setRotateModal(sel.id)} onMeasure={() => setTreadTarget(sel.id)} onInspect={setInspectTyre} />
                </div>
              </div>
              {(() => {
                const tsF = allFields(c).find((ff) => ff.kind === "tyreset");
                const keyOf = (x) => x.ts != null ? x.ts : (Date.parse(`${x.date || "1970-01-01"}T${x.time || "00:00"}`) || Date.parse(x.date || "1970-01-01") || 0);
                const srows = [];
                (db.events || []).forEach((e) => { const tl = num(e.trackLength) || 0; (e.sessions || []).forEach((s) => { if (s.tyres && s.tyres.tyreSetId === sel.id) { const l = num(s.performance.laps) || 0; srows.push({ ts: s.ts, date: s.date || "", time: s.timeOfDay || "", laps: l, km: l * tl, best: s.performance.bestLap, sec: lapToSec(s.performance.bestLap), ev: e, type: s.type }); } }); });
                srows.sort((a, b) => keyOf(a) - keyOf(b));
                let cum = 0; srows.forEach((r) => { cum += r.km; r.cum = Math.round(cum * 10) / 10; });
                const treadByKm = {};
                (sel.tyres || []).forEach((t) => (t.treads || []).forEach((r) => { const a = (r.depths || []).map(num).filter((x) => isFinite(x)); if (!a.length) return; const avg = a.reduce((x, y) => x + y, 0) / a.length; const km = r.km || 0; const key = km.toFixed(1); if (!treadByKm[key]) treadByKm[key] = { km, treadSum: 0, n: 0 }; treadByKm[key].treadSum += avg; treadByKm[key].n += 1; }));
                const trows = Object.values(treadByKm).map((o) => ({ km: o.km, tread: Math.round((o.treadSum / o.n) * 100) / 100 })).sort((a, b) => a.km - b.km);
                const circuits = Array.from(new Set(srows.map((r) => r.ev.circuit).filter(Boolean)));
                const counts = {}; srows.forEach((r) => { if (r.ev.circuit) counts[r.ev.circuit] = (counts[r.ev.circuit] || 0) + 1; });
                const activeCircuit = (graphCircuit && circuits.includes(graphCircuit)) ? graphCircuit : (circuits.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0))[0] || "");
                const lapPts = srows.filter((r) => isFinite(r.sec) && (!activeCircuit || r.ev.circuit === activeCircuit));
                const hasLap = lapPts.length >= 1, hasTread = trows.length >= 1;
                const lineLap = lapPts.length >= 2, lineTread = trows.length >= 2;
                return (
                  <div className="panel" style={{ marginTop: 14 }}>
                    <div className="paneltop"><h3 style={{ margin: 0 }}>Lap time &amp; tread vs distance</h3><span className="sp" />
                      {circuits.length > 0 && <label className="gfilter">Track <select value={activeCircuit} onChange={(e) => setGraphCircuit(e.target.value)}>{circuits.map((c2) => <option key={c2} value={c2}>{c2}</option>)}</select></label>}
                    </div>
                    {circuits.length > 1 && <div className="note" style={{ marginTop: 8, marginBottom: 4 }}>Lap times shown for <b>{activeCircuit || "—"}</b> only, so times from different circuits don't clash. Average tread depth spans every session on the set.</div>}
                    {(srows.length === 0 && trows.length === 0) ? <div className="zempty">No session or tread data on this set yet.</div> : (<>
                      {(hasLap || hasTread) && (() => {
                        const W = 660, H = 200, padL = 52, padR = 46, padT = 14, padB = 34;
                        const xmax = Math.max(1, ...srows.map((r) => r.cum), ...trows.map((t) => t.km));
                        const sx = (v) => padL + (v / xmax) * (W - padL - padR);
                        const lo = Math.min(...lapPts.map((p) => p.sec)), lhi = Math.max(...lapPts.map((p) => p.sec));
                        const to = Math.min(...trows.map((t) => t.tread)), thi = Math.max(...trows.map((t) => t.tread));
                        const syL = (s) => (H - padB) - (lhi === lo ? 0.5 : (s - lo) / (lhi - lo)) * (H - padT - padB);
                        const syT = (t) => (H - padB) - (thi === to ? 0.5 : (t - to) / (thi - to)) * (H - padT - padB);
                        const nT = 4;
                        const fmtLap = (s) => { const m = Math.floor(s / 60); const sec = s - m * 60; return m ? `${m}:${sec.toFixed(1).padStart(4, "0")}` : sec.toFixed(1); };
                        const xticks = Array.from({ length: nT + 1 }, (_, i) => Math.round((xmax * i / nT) * 10) / 10);
                        const lticks = !hasLap ? [] : (lo === lhi ? [lo] : Array.from({ length: nT + 1 }, (_, i) => lo + (lhi - lo) * i / nT));
                        const tticks = !hasTread ? [] : (to === thi ? [to] : Array.from({ length: nT + 1 }, (_, i) => to + (thi - to) * i / nT));
                        const lapD = lapPts.map((p, i) => `${i ? "L" : "M"}${sx(p.cum).toFixed(1)},${syL(p.sec).toFixed(1)}`).join(" ");
                        const trD = trows.map((p, i) => `${i ? "L" : "M"}${sx(p.km).toFixed(1)},${syT(p.tread).toFixed(1)}`).join(" ");
                        return (
                          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
                            {xticks.map((xt, i) => (<g key={"x" + i}>
                              <line x1={sx(xt)} y1={padT} x2={sx(xt)} y2={H - padB} stroke="var(--line)" strokeOpacity={i === 0 ? 0.9 : 0.3} />
                              <text x={sx(xt)} y={H - padB + 12} fill="var(--tx-faint)" fontSize="8.5" textAnchor="middle">{units().distance.disp(xt)}</text>
                            </g>))}
                            {hasLap && lticks.map((lt, i) => (<g key={"l" + i}>
                              <line x1={padL} y1={syL(lt)} x2={W - padR} y2={syL(lt)} stroke="var(--line)" strokeOpacity={0.22} />
                              <text x={padL - 5} y={syL(lt) + 3} fill="var(--amber)" fontSize="8" textAnchor="end">{fmtLap(lt)}</text>
                            </g>))}
                            {hasTread && tticks.map((tt, i) => <text key={"t" + i} x={W - padR + 5} y={syT(tt) + 3} fill="var(--cool)" fontSize="8">{tt.toFixed(1)}</text>)}
                            <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="var(--line)" />
                            <line x1={W - padR} y1={padT} x2={W - padR} y2={H - padB} stroke="var(--line)" />
                            <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--line)" />
                            {hasLap && <>{lineLap && <path d={lapD} fill="none" stroke="var(--amber)" strokeWidth="2" />}{lapPts.map((p, i) => <circle key={i} cx={sx(p.cum)} cy={syL(p.sec)} r="3.2" fill="var(--amber)" />)}</>}
                            {hasTread && <>{lineTread && <path d={trD} fill="none" stroke="var(--cool)" strokeWidth="2" strokeDasharray="4 3" />}{trows.map((p, i) => <circle key={i} cx={sx(p.km)} cy={syT(p.tread)} r="3.2" fill="var(--cool)" />)}</>}
                            <text x={(padL + W - padR) / 2} y={H - 4} fill="var(--tx-faint)" fontSize="9.5" textAnchor="middle">distance on set — {units().distance.label}</text>
                          </svg>
                        );
                      })()}
                      <div className="chartlegend"><span><i className="sw amber" /> best lap (left axis)</span><span><i className="sw cool" /> avg tread depth (right axis)</span></div>
                      <table className="ttbl" style={{ marginTop: 8 }}><thead><tr><th>Date</th><th>Session</th><th>{units().distance.label} (cum)</th><th>Best lap</th></tr></thead>
                        <tbody>{srows.map((r, i) => (<tr key={i}><td style={{ color: "var(--tx-dim)" }}>{r.date}</td><td>{eventGroup(r.ev)}{eventInfo(r.ev) ? ` · ${eventInfo(r.ev)}` : ""} · {r.type}</td><td className="num">{units().distance.disp(r.cum)}</td><td className="num">{r.best || "—"}</td></tr>))}</tbody></table>
                    </>)}
                  </div>
                );
              })()}
            </>
          );
        }
        return (
          <>
            <div className="setupbar"><span className="sblabel">Tyre bank</span><span className="sp" />
              <button className="btn sm" onClick={() => setNewTyre(true)}><Plus size={13} /> New tyre</button>
              <button className="btn sm" onClick={() => setTyreModal(true)}><Plus size={13} /> New set</button></div>
            <div className="note" style={{ marginTop: 0, marginBottom: 12 }}>Tyres are the unit of tracking: each has an <b>FIA serial</b>, its own brand/compound/size, dates, km, heat cycles and tread history. A <b>set</b> is up to four tyres by corner (ID <b>brand-compound-index</b>) and is inspected for lap-time and average-tread trends. Create tyres, then add them to a set — moving tyres in and out only affects the set's average tread.</div>
            <div className="banksplit">
              <div className="bankcol">
                <div className="colhead">Sets · {bank.length}</div>
                {bank.length === 0 ? <div className="zempty" style={{ padding: 20 }}>No tyre sets yet.</div> : (
                  <table className="ttbl big"><thead><tr><th>Set ID</th><th>Compound</th><th>{units().distance.label}</th><th>Laps</th><th>Sess.</th></tr></thead>
                    <tbody>{bank.map((s) => { const u = tyreSetUsage(db.events, s.id); return (
                      <tr key={s.id} className="clk" onClick={() => setTyreSetSel(s.id)}>
                        <td style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--amber)" }}>{setLabel(s)}</td>
                        <td>{setBrand(s)} {setCompound(s)}</td>
                        <td className="num">{units().distance.disp(u.km)}</td><td className="num">{u.laps}</td><td className="num">{u.cycles}</td>
                      </tr>
                    ); })}</tbody></table>
                )}
              </div>
              <div className="bankcol">
                <div className="colhead">Unassigned tyres · {(c.looseTyres || []).length}</div>
                {(c.looseTyres || []).length === 0 ? <div className="zempty" style={{ padding: 20 }}>None. Tyres bumped off a corner land here.</div> : (
                  <div className="loosewrap">{(c.looseTyres || []).map((t) => (
                    <div className="looserow" key={t.id}>
                      <div className="looseinfo clk" onClick={() => setInspectTyre(t)} title="Inspect tyre">
                        <span className="lserial">{tyreLabel(t)}</span>
                        <span className="ldet">{[t.brand, t.compound, t.size].filter(Boolean).join(" · ") || "—"} · {units().distance.disp(tyreKm(db.events, t.id))} {units().distance.label} · {tyreCycles(db.events, t.id)} cyc</span>
                      </div>
                      <div className="looseact">
                        {bank.length ? <MoveControls sets={bank} label="assign…" onMove={(sid, corner) => assignLoose(t.id, sid, corner)} /> : <span className="opt">no sets</span>}
                        <button className="iconbtn" title="Delete tyre" onClick={() => setConfirmCfg({ title: "Delete tyre?", message: `${tyreLabel(t)} will be permanently removed.`, confirmLabel: "Delete", onConfirm: () => { setConfirmCfg(null); delLooseTyre(t.id); } })}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}</div>
                )}
              </div>
            </div>
          </>
        );
      })()}

      {tyreModal && <TyreSetModal loose={c.looseTyres || []} banks={allBanks()} onSave={addTyreSet} onClose={() => setTyreModal(false)} />}
      {newTyre && <NewTyreModal onSave={createLooseTyre} onClose={() => setNewTyre(false)} />}
      {rotateModal && <RotateTyresModal bank={c.tyreBank || []} loose={c.looseTyres || []} events={db.events} focusSetId={rotateModal} onSave={(nb, nl) => applyCarRotation(nb, nl)} onClose={() => setRotateModal(null)} />}
      {treadTarget && <TreadModal set={(c.tyreBank || []).find((s) => s.id === treadTarget)} onSave={(t) => applyCarTread(treadTarget, t)} onClose={() => setTreadTarget(null)} />}
      {inspectTyre && <TyreInspector tyre={inspectTyre} events={db.events} onSave={saveTyre} onClose={() => setInspectTyre(null)} />}

      <div className="printsheet">
        <div className="ph1">{c.name || "Setup sheet"}</div>
        <div className="ph2">{c.setups[selIdx]?.name || ""}{c.klass ? ` · ${c.klass}` : ""} · exported {new Date().toISOString().slice(0, 10)}</div>
        <div className="phmeta">{[c.driveType, c.engine && `${c.engine}${c.horsepower ? ` · ${c.horsepower}hp` : ""}`, c.gearbox && `${c.gearbox}${c.shiftType ? ` (${c.shiftType})` : ""}`, c.ecu && `ECU ${c.ecu}`, c.dash && `Dash ${c.dash}`].filter(Boolean).join("  ·  ")}</div>
        <table className="ptbl"><thead><tr><th>Adjustment</th><th>FL</th><th>FR</th><th>RL</th><th>RR</th></tr></thead>
          <tbody>{perCornerRows.map((f) => (
            <tr key={f.id}><td>{f.label}{f.unit ? ` (${f.unit})` : ""}</td>{CORNERS.map((cn) => <td key={cn}>{gv(selValues, f.id, cn) || "–"}</td>)}</tr>
          ))}</tbody>
        </table>
        <table className="ptbl2"><tbody>{singleRows.map(([lab, val, unit], i) => (
          <tr key={i}><td>{lab}</td><td>{val || "–"}{val && unit ? ` ${unit}` : ""}</td></tr>
        ))}</tbody></table>
      </div>

      {editField && <FieldEditModal field={editField} onSave={(patch) => { patchField(editField.id, patch); setEditFieldId(null); }} onDelete={() => removeField(editField.id)} onClose={() => setEditFieldId(null)} />}
      {promptCfg && <PromptModal {...promptCfg} onClose={() => setPromptCfg(null)} />}
      {confirmCfg && <ConfirmModal {...confirmCfg} onClose={() => setConfirmCfg(null)} />}
    </div>
  );
}

/* ================= COMPARE ================= */
function resolveValues(car, db, sel, which) {
  // sel.aId/bId may be a library setup id or an event version id — search both
  const id = which === "a" ? sel.aId : sel.bId;
  const lib = car.setups.find((s) => s.id === id);
  if (lib) return { name: lib.name, values: lib.values };
  for (const e of db.events) { const v = e.versions.find((v) => v.id === id); if (v) return { name: `${e.name}: ${v.label}`, values: v.values }; }
  return { name: "—", values: {} };
}
function CompareView({ car, sel, db, onBack }) {
  if (!car) return <div className="empty">Car missing.</div>;
  const A = resolveValues(car, db, sel, "a"), B = resolveValues(car, db, sel, "b");
  const changes = diffSetups(car, A.values, B.values);
  const highlights = {}; const planCorners = {};
  CORNERS.forEach((c) => { planCorners[c] = []; });
  changes.forEach((ch) => { if (ch.corner) { highlights[ch.corner] = true; } });
  // build plan readout: show changed per-corner fields
  CORNERS.forEach((c) => {
    changes.filter((ch) => ch.corner === c).slice(0, 3).forEach((ch) => planCorners[c].push({ label: ch.label, val: `${ch.from || "–"}→${ch.to || "–"}`, changed: true }));
  });
  const byGroup = {};
  changes.forEach((ch) => { (byGroup[ch.group] = byGroup[ch.group] || []).push(ch); });
  return (
    <div>
      <div className="backrow"><button className="btn ghost" onClick={onBack}><ArrowLeft size={14} /> Back</button><span className="eyebrow">{car.name}</span></div>
      <div className="pagehead"><div><h1>Compare setups</h1><div className="sub"><b style={{ color: "var(--cool)" }}>{A.name}</b> &nbsp;→&nbsp; <b style={{ color: "var(--amber)" }}>{B.name}</b> · {changes.length} change{changes.length !== 1 ? "s" : ""}</div></div></div>
      <div className="grid2" style={{ gridTemplateColumns: "260px 1fr", alignItems: "start" }}>
        <div className="panel"><h3>What changed</h3><CarPlan corners={planCorners} highlights={highlights} /></div>
        <div>
          {changes.length === 0 ? <div className="empty">These two setups are identical.</div> :
            Object.entries(byGroup).map(([g, arr]) => (
              <div className="diffcard" key={g}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>{g}</div>
                {arr.map((ch, i) => {
                  const up = num(ch.to) != null && num(ch.from) != null && num(ch.to) > num(ch.from);
                  const delta = num(ch.to) != null && num(ch.from) != null ? (num(ch.to) - num(ch.from)) : null;
                  return (
                    <div className="diffrow" key={i}>
                      <span className="lab">{ch.label}{ch.corner ? ` · ${ch.corner}` : ""}</span>
                      <span style={{ color: "var(--cool)" }}>{ch.from || "–"}</span>
                      <ArrowRight size={12} />
                      <span style={{ color: "var(--amber)" }}>{ch.to || "–"} {ch.unit} {delta != null && <span className={up ? "up" : "down"}>({delta > 0 ? "+" : ""}{delta})</span>}</span>
                    </div>
                  );
                })}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
function CompareInline({ car, versions }) {
  const [a, setA] = useState(versions[0]?.id || ""); const [b, setB] = useState(versions[versions.length - 1]?.id || "");
  const va = versions.find((v) => v.id === a), vb = versions.find((v) => v.id === b);
  const changes = va && vb ? diffSetups(car, va.values, vb.values) : [];
  return (
    <div>
      <div className="fgrid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="field"><label>From</label><select value={a} onChange={(e) => setA(e.target.value)}>{versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></div>
        <div className="field"><label>To</label><select value={b} onChange={(e) => setB(e.target.value)}>{versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></div>
      </div>
      <div style={{ marginTop: 12 }}>
        {changes.length === 0 ? <div style={{ color: "var(--tx-faint)", fontSize: 12 }}>No differences.</div> :
          changes.map((ch, i) => (
            <div className="chgline" key={i}><b>{ch.label}{ch.corner ? ` ${ch.corner}` : ""}</b>: {ch.from || "–"} → {ch.to || "–"} {ch.unit}</div>
          ))}
      </div>
    </div>
  );
}

/* ================= SETUP EDITOR MODAL ================= */
function SetupEditorModal({ car, values, title, onCancel, onSave }) {
  const [vals, setVals] = useState(JSON.parse(JSON.stringify(values)));
  const setScalar = (id, v) => setVals((p) => ({ ...p, [id]: v }));
  const setCorner = (id, c, v) => setVals((p) => ({ ...p, [id]: { ...(p[id] || {}), [c]: v } }));
  const stepC = (id, c, d) => setCorner(id, c, String((num(vals[id]?.[c]) || 0) + d));
  const stepS = (id, d) => setScalar(id, String((num(vals[id]) || 0) + d));
  return (
    <div className="ov">
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2><Pencil size={16} color="var(--amber)" /> {title}</h2>
        <div className="msub">{car.name} — adjust values; only what you change is recorded on the timeline.</div>
        {car.setupSchema.map((g) => (
          <div className="fsection" key={g.id}><div className="ttl">{g.name}</div>
            {g.fields.some((f) => f.perCorner) && (
              <table className="cmx" style={{ marginBottom: 12 }}>
                <thead><tr><th className="corner">Per-corner</th>{CORNERS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{g.fields.filter((f) => f.perCorner).map((f) => (
                  <tr key={f.id}><td className="corner">{f.label} {f.unit && <span style={{ color: "var(--tx-faint)" }}>({f.unit})</span>}</td>
                    {CORNERS.map((c) => (
                      <td key={c}>
                        {f.type === "select" ? (
                          <select style={inp} value={vals[f.id]?.[c] || ""} onChange={(e) => setCorner(f.id, c, e.target.value)}><option value="" />{f.options.map((o) => <option key={o}>{o}</option>)}</select>
                        ) : f.type === "stepper" ? (
                          <div className="miniStep"><button onClick={() => stepC(f.id, c, -1)}>−</button><input value={vals[f.id]?.[c] || ""} onChange={(e) => setCorner(f.id, c, e.target.value)} /><button onClick={() => stepC(f.id, c, 1)}>+</button></div>
                        ) : (
                          <input style={inp} value={vals[f.id]?.[c] || ""} onChange={(e) => setCorner(f.id, c, e.target.value)} />
                        )}
                      </td>
                    ))}
                  </tr>))}</tbody>
              </table>
            )}
            {g.fields.some((f) => !f.perCorner) && (
              <div className="fgrid">{g.fields.filter((f) => !f.perCorner).map((f) => (
                <div className="field" key={f.id}><label>{f.label}{f.unit ? ` (${f.unit})` : ""}</label>
                  {f.type === "select" ? (
                    <select value={vals[f.id] || ""} onChange={(e) => setScalar(f.id, e.target.value)}><option value="" />{f.options.map((o) => <option key={o}>{o}</option>)}</select>
                  ) : f.type === "stepper" ? (
                    <div className="step"><button onClick={() => stepS(f.id, -1)}>−</button><input className="num" value={vals[f.id] || ""} onChange={(e) => setScalar(f.id, e.target.value)} /><button onClick={() => stepS(f.id, 1)}>+</button></div>
                  ) : (
                    <input className={f.type === "number" ? "num" : ""} value={vals[f.id] || ""} onChange={(e) => setScalar(f.id, e.target.value)} />
                  )}
                </div>
              ))}</div>
            )}
          </div>
        ))}
        <div className="modrow"><button className="btn ghost" onClick={onCancel}>Cancel</button><button className="btn primary" onClick={() => onSave(vals)}><Save size={14} /> Save change</button></div>
      </div>
    </div>
  );
}

/* ================= DATABASE (flat filterable) ================= */
function DatabaseView({ flat, q, onOpen }) {
  const [fCircuit, setFCircuit] = useState([]); const [fCar, setFCar] = useState([]); const [fType, setFType] = useState([]);
  const [fTyre, setFTyre] = useState([]); const [fWeather, setFWeather] = useState([]); const [fBal, setFBal] = useState([]);
  const [ambMin, setAmbMin] = useState(""); const [ambMax, setAmbMax] = useState("");
  const [sortKey, setSortKey] = useState("date"); const [sortDir, setSortDir] = useState("desc");
  const tyreBrandOf = ({ s, car }) => { const t = (car?.tyreBank || []).find((x) => x.id === s.tyres.tyreSetId); return t ? t.brand : (s.tyres.brand || ""); };
  const tyreSetLabelOf = ({ s, car }) => { const t = (car?.tyreBank || []).find((x) => x.id === s.tyres.tyreSetId); return t ? setLabel(t) : (s.tyres.setId || ""); };
  const opt = (fn) => [...new Set(flat.map(fn).filter(Boolean))].sort();
  const opts = {
    circuit: opt((x) => x.e.circuit), car: opt((x) => x.car?.name), type: opt((x) => x.s.type),
    tyre: opt((x) => tyreBrandOf(x)), weather: opt((x) => x.s.conditions.weather),
  };
  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const BAL_LABEL = { understeer: "Understeer", oversteer: "Oversteer", neutral: "Neutral" };
  const setupBalOf = ({ e, car }) => { const su = car?.setups?.find((s) => s.id === e.baseSetupId); return su && su.balance ? BAL_LABEL[su.balance] : ""; };

  let rows = flat.filter(({ s, e, car }) => {
    if (fCircuit.length && !fCircuit.includes(e.circuit)) return false;
    if (fCar.length && !fCar.includes(car?.name)) return false;
    if (fType.length && !fType.includes(s.type)) return false;
    if (fTyre.length && !fTyre.includes(tyreBrandOf({ s, car }))) return false;
    if (fWeather.length && !fWeather.includes(s.conditions.weather)) return false;
    if (fBal.length && !fBal.includes(setupBalOf({ e, car }))) return false;
    const a = num(s.conditions.ambientTemp);
    if (ambMin !== "" && (a == null || a < +ambMin)) return false;
    if (ambMax !== "" && (a == null || a > +ambMax)) return false;
    if (q.trim()) { const hay = [eventTitle(e), eventGroup(e), e.name, e.circuit, car?.name, s.driver, tyreSetLabelOf({ s, car }), tyreBrandOf({ s, car }), s.tyres.compound, s.notes.driver, s.notes.engineer].join(" ").toLowerCase(); if (!hay.includes(q.toLowerCase())) return false; }
    return true;
  });
  const dir = sortDir === "asc" ? 1 : -1;
  rows.sort((x, y) => {
    let a, b;
    switch (sortKey) {
      case "bestLap": a = lapToSec(x.s.performance.bestLap); b = lapToSec(y.s.performance.bestLap); break;
      case "amb": a = num(x.s.conditions.ambientTemp) ?? -999; b = num(y.s.conditions.ambientTemp) ?? -999; break;
      case "circuit": a = x.e.circuit; b = y.e.circuit; break;
      default: a = x.s.date; b = y.s.date;
    }
    return a < b ? -1 * dir : a > b ? dir : 0;
  });
  const th = (key, label, r) => (<th className={r ? "r" : ""} onClick={() => { if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir(key === "bestLap" || key === "circuit" ? "asc" : "desc"); } }}>{label}{sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}</th>);
  const Facet = ({ title, values, sel, set }) => values.length ? (
    <div className="fsec"><h4>{title}</h4>{values.map((v) => <label key={v} className={"chk" + (sel.includes(v) ? " on" : "")}><input type="checkbox" checked={sel.includes(v)} onChange={() => toggle(sel, set, v)} />{v}</label>)}</div>
  ) : null;

  return (
    <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
      <aside className="rail">
        <div className="fsec"><h4>Filter sessions</h4></div>
        <Facet title="Circuit" values={opts.circuit} sel={fCircuit} set={setFCircuit} />
        <Facet title="Car" values={opts.car} sel={fCar} set={setFCar} />
        <Facet title="Session type" values={opts.type} sel={fType} set={setFType} />
        <Facet title="Tyre brand" values={opts.tyre} sel={fTyre} set={setFTyre} />
        <Facet title="Weather" values={opts.weather} sel={fWeather} set={setFWeather} />
        <Facet title="Setup balance" values={["Understeer", "Neutral", "Oversteer"]} sel={fBal} set={setFBal} />
        <div className="fsec"><h4>Ambient °C</h4><div className="rangerow"><input placeholder="min" value={ambMin} onChange={(e) => setAmbMin(e.target.value)} /><input placeholder="max" value={ambMax} onChange={(e) => setAmbMax(e.target.value)} /></div></div>
      </aside>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pagehead"><h1>Session database</h1><span className="sub">{rows.length} of {flat.length} sessions across all events</span></div>
        {rows.length === 0 ? <div className="empty">No sessions match.</div> : (
          <table className="tbl">
            <thead><tr>{th("date", "Date")}{th("circuit", "Circuit")}<th>Event</th><th>Car</th><th>Session</th><th>Tyre</th>{th("amb", "Amb", true)}{th("bestLap", "Best lap", true)}<th>Balance</th></tr></thead>
            <tbody>{rows.map(({ s, e, car }) => (
              <tr key={s.id} onClick={() => onOpen(e.id)}>
                <td className="num" style={{ color: "var(--tx-dim)" }}>{s.date}</td>
                <td>{e.circuit}</td><td style={{ color: "var(--tx-dim)" }}>{eventGroup(e)}{eventInfo(e) ? ` · ${eventInfo(e)}` : ""}</td><td>{car?.name}</td>
                <td><span className="stype">{s.type}</span></td><td style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{tyreSetLabelOf({ s, car }) || tyreBrandOf({ s, car }) || "—"}</td>
                <td className="r num">{s.conditions.ambientTemp || "—"}</td>
                <td className="r num" style={{ color: "var(--amber)", fontWeight: 600 }}>{s.performance.bestLap || "—"}</td>
                <td style={{ fontSize: 11, color: "var(--tx-dim)" }}>{setupBalOf({ e, car }) || "—"}</td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ================= IMPORT ================= */
function ImportModal({ db, onClose, onSaveMap }) {
  const [carId, setCarId] = useState(db.carProfiles[0]?.id || "");
  const car = db.carProfiles.find((c) => c.id === carId);
  const [stage, setStage] = useState("pick");
  const [summary, setSummary] = useState(null); const [fname, setFname] = useState("");
  const [overrides, setOverrides] = useState({});
  const fileRef = useRef();
  const run = (name, ov) => { setFname(name || "Sample1.ld"); setStage("busy"); setTimeout(() => { const map = ov || autoMap(car?.channelMap); const s = simulateParse(map); setSummary(s); setOverrides(map); setStage("review"); }, 380); };
  const channelNames = summary ? summary.channels.map((c) => c.name) : [];
  const saveMapping = () => { if (!car) return; const nc = { ...car, channelMap: { ...overrides } }; onSaveMap(nc); alert(`Channel mapping saved to ${car.name} — future imports from this car auto-apply it.`); };

  return (
    <div className="ov">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2><Upload size={16} color="var(--amber)" /> Import from MoTeC <span className="previewtag">Preview flow</span></h2>
        <div className="msub">Read a MoTeC .ld log into a new session. The channel matcher below is the real fuzzy algorithm.</div>
        <div className="field" style={{ marginBottom: 14 }}><label>Car profile (mapping is remembered per car)</label>
          <select value={carId} onChange={(e) => setCarId(e.target.value)}>{db.carProfiles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        {stage === "pick" && (
          <>
            <div style={{ border: "1.5px dashed var(--line)", borderRadius: 9, padding: 26, textAlign: "center", color: "var(--tx-dim)", cursor: "pointer" }} onClick={() => fileRef.current.click()}>
              <FileUp size={22} /><div style={{ marginTop: 8 }}>Click to choose a <b>.ld</b> file</div>
              <input ref={fileRef} type="file" style={{ display: "none" }} onChange={(e) => run(e.target.files[0]?.name, null)} />
            </div>
            <div className="note"><b>Notice the matcher:</b> this mock log deliberately names channels awkwardly — "Inlet Air Temp", "Track Surface Temp", "LR Wheel Speed" — yet they still map correctly because matching is by word-tokens, not exact text.</div>
          </>
        )}
        {stage === "busy" && <div className="empty">Reading {fname}…</div>}
        {stage === "review" && summary && (
          <>
            <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              {[["Best lap", summary.bestLap, true], ["Laps", summary.laps], ["Fuel", summary.fuelUsed && units().volume.disp(summary.fuelUsed) + " " + units().volume.label + (summary.fuelIsEstimate ? " est" : "")], ["Ambient", summary.ambientTemp && units().temp.disp(summary.ambientTemp) + " " + units().temp.label], ["Track", summary.trackTemp && units().temp.disp(summary.trackTemp) + " " + units().temp.label], ["Top speed", summary.maxSpeed && units().speed.disp(summary.maxSpeed) + " " + units().speed.label]].map(([k, v, a]) => (
                <div className="panel" key={k} style={{ padding: "9px 12px" }}><div className="eyebrow">{k}</div><div className="num" style={{ fontSize: 16, color: a ? "var(--amber)" : "var(--tx)" }}>{v || "—"}</div></div>
              ))}
            </div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Channel mapping <span style={{ textTransform: "none", letterSpacing: 0 }}>(auto-matched; adjust if needed)</span></div>
            {Object.entries(FUZZY_KW).map(([key, kws]) => {
              const sc = overrides[key] ? matchScore(kws, overrides[key]) : 0;
              return (
                <div className="maprow" key={key}>
                  <span className="fld">{key.replace(/([A-Z])/g, " $1").replace(/^./, (m) => m.toUpperCase())}</span>
                  <select value={overrides[key] || ""} onChange={(e) => setOverrides({ ...overrides, [key]: e.target.value })}>
                    <option value="">— none —</option>{channelNames.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <span className="score">{overrides[key] ? `${Math.round(sc * 100)}%` : ""}</span>
                </div>
              );
            })}
            <div className="modrow">
              <button className="btn ghost" onClick={() => setStage("pick")}>Back</button>
              <button className="btn" onClick={saveMapping}><Check size={13} /> Save mapping to car</button>
              <button className="btn" onClick={() => run(fname, overrides)}><RotateCcw size={13} /> Re-extract</button>
              <button className="btn primary" onClick={onClose}><Save size={14} /> (would create session)</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
