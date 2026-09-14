import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Home, Inbox as InboxIcon, FolderKanban, CalendarDays, Kanban as KanbanIcon,
  RefreshCw, Search, Plus, X, Check, Trash2, ChevronRight, ChevronLeft, ChevronDown,
  Clock, MapPin, AlertTriangle, CheckCircle2, Circle, Menu, ArrowRight,
  Pencil, Archive, Sparkles, ListChecks, Flag, Sun, Moon, LogOut, List, CalendarRange
} from "lucide-react";

/* ---------------------------------------------------------------------- */
/*  Design tokens (injected once)                                          */
/* ---------------------------------------------------------------------- */

const TOKENS = `
  [data-theme="light"]{
    --paper:#F2F3F5; --panel:#FFFFFF; --panel-2:#FFFFFF;
    --ink:#1F2023; --ink-soft:#6C6E75; --ink-faint:#9A9CA3;
    --line:#E1E2E6; --line-soft:#ECEDF0;
    --accent:#7C5CFC; --accent-ink:#4C3199; --accent-soft:#EDE6FF; --accent-soft-line:#D6C8FF;
    --track:#2F9E8F; --track-soft:#DFF5F1;
    --risk:#E2574C; --risk-soft:#FCE4E1;
    --blocked:#64748B; --blocked-soft:#E7EAEF;
    --overdue:#D1342A; --overdue-soft:#FBDEDC;
    --modal-scrim: rgba(31,32,35,0.45);
  }
  [data-theme="dark"]{
    --paper:#1B1B1D; --panel:#242426; --panel-2:#2B2B2E;
    --ink:#E4E4E6; --ink-soft:#A3A3A8; --ink-faint:#707074;
    --line:#38383B; --line-soft:#2E2E31;
    --accent:#A277FF; --accent-ink:#E4D9FF; --accent-soft:#332952; --accent-soft-line:#4A3B73;
    --track:#3ECFB8; --track-soft:#123B35;
    --risk:#FF8A7C; --risk-soft:#3A1E1B;
    --blocked:#8FA3C0; --blocked-soft:#1E2733;
    --overdue:#FF6B5C; --overdue-soft:#3A1210;
    --modal-scrim: rgba(0,0,0,0.6);
  }
  :root, [data-theme]{
    --side-bg:#18181A; --side-text:#D7D7DC; --side-dim:#87878F; --side-line:#28282B; --side-accent:#A277FF;
  }
  .font-display{ font-family:'Fraunces', ui-serif, Georgia, serif; }
  .font-mono{ font-family:'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
  .font-ui{ font-family:'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif; }
  .ppos-scroll::-webkit-scrollbar{ width:8px; height:8px; }
  .ppos-scroll::-webkit-scrollbar-thumb{ background:var(--line); border-radius:4px; }
  .ppos-scroll::-webkit-scrollbar-track{ background:transparent; }
  .ppos-focus:focus{ outline:2px solid var(--accent); outline-offset:1px; }
`;

const PAGE_WIDE = "max-w-[1400px] w-full mx-auto px-6 md:px-10 py-8";
const PAGE_READ = "max-w-2xl w-full mx-auto px-6 md:px-10 py-8";

/* ---------------------------------------------------------------------- */
/*  Constants                                                              */
/* ---------------------------------------------------------------------- */

const AREA_STATUS = ["Active", "Archived"];
const PROJECT_STATUSES = ["Planned", "Active", "On Hold", "Blocked", "Completed", "Cancelled", "Archived"];
const TASK_STATUSES = ["Inbox", "Next", "Scheduled", "In Progress", "Waiting", "Done", "Cancelled"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const CONTEXTS = ["Anywhere", "Home", "Office", "Campus", "Online"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const INACTIVE_PROJECT_STATUSES = new Set(["On Hold", "Completed", "Cancelled", "Archived"]);

const PRIORITY_WEIGHT = { Low: 5, Medium: 15, High: 30, Critical: 40 };

/* ---------------------------------------------------------------------- */
/*  Utilities                                                              */
/* ---------------------------------------------------------------------- */

let counter = 0;
function uid(prefix = "id") {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
function isoFromDate(d) { return d.toISOString().slice(0, 10); }
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoFromDate(d);
}
function daysBetween(fromIso, toIso) {
  const a = new Date(fromIso + "T00:00:00");
  const b = new Date(toIso + "T00:00:00");
  return Math.round((b - a) / 86400000);
}
function formatDateShort(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function formatDateFull(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
function relativeDayLabel(iso) {
  if (!iso) return null;
  const diff = daysBetween(todayISO(), iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff <= 6) return formatDateShort(iso).split(" ")[0] === undefined ? formatDateShort(iso) : new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });
  return formatDateShort(iso);
}
function classNames(...xs) { return xs.filter(Boolean).join(" "); }
function fmtDuration(mins) {
  if (mins == null) return null;
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
function round(n) { return Math.round(n); }

/* ---------------------------------------------------------------------- */
/*  Domain calculations                                                    */
/* ---------------------------------------------------------------------- */

function projectTasks(projectId, tasks) {
  return tasks.filter(t => t.projectId === projectId);
}

function computeProgress(project, tasks) {
  const ts = projectTasks(project.id, tasks).filter(t => t.status !== "Cancelled");
  const hasDeliverables = project.deliverables && project.deliverables.length > 0;
  let taskPct = null;
  if (ts.length > 0) {
    const done = ts.filter(t => t.status === "Done").length;
    taskPct = (done / ts.length) * 100;
  }
  let delivPct = null;
  if (hasDeliverables) {
    const done = project.deliverables.filter(d => d.done).length;
    delivPct = (done / project.deliverables.length) * 100;
  }
  if (taskPct == null && delivPct == null) return null;
  if (taskPct != null && delivPct != null) return round((taskPct + delivPct) / 2);
  return round(taskPct != null ? taskPct : delivPct);
}

function estimateRemainingMinutes(project, tasks) {
  const ts = projectTasks(project.id, tasks).filter(t => t.status !== "Done" && t.status !== "Cancelled");
  return ts.reduce((sum, t) => sum + (t.duration || 60), 0);
}

function computeHealth(project, tasks) {
  if (INACTIVE_PROJECT_STATUSES.has(project.status)) return null;
  if (project.status === "Blocked") {
    return { level: "Blocked", reason: "Marked as blocked and needs a decision to move forward." };
  }
  const ts = projectTasks(project.id, tasks).filter(t => t.status !== "Cancelled");
  const overdue = ts.filter(t => t.status !== "Done" && t.dueDate && t.dueDate < todayISO());
  if (overdue.length > 0) {
    return { level: "At Risk", reason: `${overdue.length} task${overdue.length > 1 ? "s" : ""} overdue.` };
  }
  if (!project.deadline) {
    return { level: "On Track", reason: "No deadline set." };
  }
  const daysLeft = daysBetween(todayISO(), project.deadline);
  if (daysLeft < 0) {
    return { level: "At Risk", reason: "Deadline has passed." };
  }
  const remainingMin = estimateRemainingMinutes(project, tasks);
  const remainingHours = remainingMin / 60;
  const capacityHours = Math.max(daysLeft, 0) * 2; // heuristic: ~2h/day realistic capacity
  if (daysLeft <= 1 && remainingHours > 1.5) {
    return { level: "At Risk", reason: `${remainingHours.toFixed(1)}h of estimated work remains with the deadline tomorrow or sooner.` };
  }
  if (remainingHours > capacityHours) {
    return { level: "At Risk", reason: `${remainingHours.toFixed(1)}h of estimated work remain with about ${capacityHours}h of realistic time before the deadline.` };
  }
  return { level: "On Track", reason: `${remainingHours.toFixed(1)}h of work remaining, deadline in ${daysLeft}d.` };
}

// Transparent recommendation scoring (see product spec section 36)
function scoreTask(task, project, opts) {
  const { availableMinutes, context } = opts;
  const reasons = [];
  let score = 0;

  const pw = PRIORITY_WEIGHT[task.priority] || 0;
  score += pw;
  if (task.priority === "Critical" || task.priority === "High") reasons.push(`${task.priority} priority`);

  if (task.dueDate) {
    const diff = daysBetween(todayISO(), task.dueDate);
    if (diff < 0) { score += 30; reasons.push("Overdue"); }
    else if (diff === 0) { score += 25; reasons.push("Due today"); }
    else if (diff === 1) { score += 20; reasons.push("Due tomorrow"); }
    else if (diff <= 3) { score += 12; reasons.push(`Due in ${diff}d`); }
    else if (diff <= 7) { score += 6; }
  }

  if (project) {
    const health = computeHealth(project, opts.tasks);
    if (health && health.level === "At Risk") { score += 10; reasons.push(`${project.name} is at risk`); }
  }

  if (task.status === "Waiting") { score -= 15; reasons.push("Waiting on something"); }

  if (task.duration != null) {
    if (task.duration <= availableMinutes) {
      const closeness = 1 - Math.abs(availableMinutes - task.duration) / Math.max(availableMinutes, 1);
      score += 8 + closeness * 8;
      reasons.push(`Fits your ${fmtDuration(availableMinutes)} window`);
    }
  } else {
    score += 4;
  }

  if (context && context !== "Anywhere" && task.location && task.location !== context) {
    score -= 1000; // effectively excluded, handled by filter too
  } else if (task.location && task.location === context) {
    reasons.push(`Good for ${context}`);
  }

  return { score, reasons };
}

function recommendTasks(tasks, projects, { availableMinutes = 480, context = "Anywhere", limit = 3 } = {}) {
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const candidates = tasks.filter(t => {
    if (t.status === "Done" || t.status === "Cancelled") return false;
    const p = t.projectId ? projectMap[t.projectId] : null;
    if (p && INACTIVE_PROJECT_STATUSES.has(p.status)) return false;
    if (context !== "Anywhere" && t.location && t.location !== context) return false;
    if (t.duration != null && t.duration > availableMinutes && availableMinutes < 480) return false;
    return true;
  });
  const scored = candidates.map(t => {
    const p = t.projectId ? projectMap[t.projectId] : null;
    const { score, reasons } = scoreTask(t, p, { availableMinutes, context, tasks });
    return { task: t, project: p, score, reasons };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/* ---------------------------------------------------------------------- */
/*  Natural-language quick-add parsing (transparent, no invented fields)   */
/* ---------------------------------------------------------------------- */

function findNextWeekday(fromIso, weekdayName, forceNext) {
  const idx = WEEKDAYS.indexOf(weekdayName.toLowerCase());
  if (idx === -1) return null;
  const from = new Date(fromIso + "T00:00:00");
  let diff = (idx - from.getDay() + 7) % 7;
  if (diff === 0 && forceNext) diff = 7;
  if (diff === 0) diff = 0;
  return addDays(fromIso, diff);
}

function parseQuickAdd(raw, projects) {
  const text = raw.trim();
  const lower = text.toLowerCase();
  const today = todayISO();
  const result = { name: text, projectId: null, dueDate: null, scheduledDate: null, location: null, duration: null };

  // duration
  let m = lower.match(/for\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/);
  if (m) result.duration = Math.round(parseFloat(m[1]) * 60);
  if (!result.duration) {
    m = lower.match(/(\d+)\s*(minutes|mins?|m)\b/);
    if (m) result.duration = parseInt(m[1], 10);
  }
  if (!result.duration) {
    m = lower.match(/\b(\d+(?:\.\d+)?)\s*h\b/);
    if (m) result.duration = Math.round(parseFloat(m[1]) * 60);
  }

  // location
  for (const ctx of ["home", "office", "campus", "online"]) {
    if (new RegExp(`\\b${ctx}\\b`).test(lower)) {
      result.location = ctx[0].toUpperCase() + ctx.slice(1);
      break;
    }
  }

  // dates
  const beforeMatch = lower.match(/\b(before|by)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  const nextWeekdayMatch = lower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  const plainWeekdayMatch = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);

  if (beforeMatch) {
    result.dueDate = findNextWeekday(today, beforeMatch[2], false);
  } else if (nextWeekdayMatch) {
    result.scheduledDate = findNextWeekday(today, nextWeekdayMatch[1], true);
  } else if (plainWeekdayMatch) {
    result.scheduledDate = findNextWeekday(today, plainWeekdayMatch[1], false);
  }

  if (/\btomorrow\b/.test(lower)) {
    if (/\bdue\b/.test(lower)) result.dueDate = addDays(today, 1);
    else result.scheduledDate = addDays(today, 1);
  }
  if (/\btonight\b/.test(lower)) {
    result.scheduledDate = today;
  } else if (/\btoday\b/.test(lower)) {
    result.scheduledDate = today;
  }

  // project matching — substring match against existing project names
  const activeProjects = projects.filter(p => !INACTIVE_PROJECT_STATUSES.has(p.status));
  let bestMatch = null;
  for (const p of activeProjects) {
    const words = p.name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    for (const w of words) {
      if (lower.includes(w)) { bestMatch = p; break; }
    }
    if (bestMatch) break;
  }
  if (bestMatch) result.projectId = bestMatch.id;

  return result;
}

/* ---------------------------------------------------------------------- */
/*  Persistence hook                                                       */
/* ---------------------------------------------------------------------- */

const STORAGE_KEY = "ppos-data-v1";

function seedData() {
  const areaWork = { id: uid("area"), name: "Work", icon: "💼", description: "Internships and paid work", status: "Active" };
  const areaOrgs = { id: uid("area"), name: "Organizations", icon: "🤝", description: "Community and org leadership", status: "Active" };
  const areaCareer = { id: uid("area"), name: "Career", icon: "🎯", description: "Portfolio and job search", status: "Active" };
  const areaUni = { id: uid("area"), name: "University", icon: "🎓", description: "Coursework and thesis", status: "Active" };
  const areaPersonal = { id: uid("area"), name: "Personal", icon: "🌱", description: "Everything else", status: "Active" };

  const areas = [areaWork, areaOrgs, areaCareer, areaUni, areaPersonal];

  const p1 = {
    id: uid("proj"), name: "MTKI Portacamp SEO Content", areaId: areaWork.id,
    status: "Active", priority: "High", goal: "Publish a high-performing SEO article about portacamp.",
    description: "", deadline: addDays(todayISO(), 5), startDate: todayISO(), tags: ["content", "seo"],
    deliverables: [
      { id: uid("del"), name: "Competitor research", done: true },
      { id: uid("del"), name: "Article outline", done: true },
      { id: uid("del"), name: "Draft", done: false },
      { id: uid("del"), name: "SEO optimization", done: false },
      { id: uid("del"), name: "Review", done: false },
      { id: uid("del"), name: "Publication", done: false },
    ],
    notes: "", links: [], activity: [{ id: uid("act"), date: todayISO(), text: "Project created" }],
  };
  const p2 = {
    id: uid("proj"), name: "Achievrs Recruitment Push", areaId: areaOrgs.id,
    status: "Active", priority: "Medium", goal: "Bring in a new cohort of members for this term.",
    description: "", deadline: addDays(todayISO(), 12), startDate: todayISO(), tags: [],
    deliverables: [], notes: "", links: [], activity: [{ id: uid("act"), date: todayISO(), text: "Project created" }],
  };
  const p3 = {
    id: uid("proj"), name: "Portfolio Case Studies", areaId: areaCareer.id,
    status: "Planned", priority: "Medium", goal: "Two strong case studies ready to share with recruiters.",
    description: "", deadline: null, startDate: null, tags: [],
    deliverables: [], notes: "", links: [], activity: [{ id: uid("act"), date: todayISO(), text: "Project created" }],
  };

  const projects = [p1, p2, p3];

  const tasks = [
    { id: uid("task"), name: "Finish competitor analysis for MTKI", projectId: p1.id, status: "Next", priority: "High", dueDate: addDays(todayISO(), 1), scheduledDate: null, scheduledTime: null, location: null, duration: 50, notes: "", tags: [] },
    { id: uid("task"), name: "Write article outline section 3", projectId: p1.id, status: "In Progress", priority: "High", dueDate: addDays(todayISO(), 2), scheduledDate: todayISO(), scheduledTime: null, location: "Home", duration: 40, notes: "", tags: [] },
    { id: uid("task"), name: "Draft recruitment post copy", projectId: p2.id, status: "Next", priority: "Medium", dueDate: addDays(todayISO(), 4), scheduledDate: null, scheduledTime: null, location: null, duration: 30, notes: "", tags: [] },
    { id: uid("task"), name: "Pick two projects for case studies", projectId: p3.id, status: "Inbox", priority: "Low", dueDate: null, scheduledDate: null, scheduledTime: null, location: null, duration: 20, notes: "", tags: [] },
  ];

  const inbox = [
    { id: uid("inb"), text: "Follow up with Nelly about LTW priorities", createdAt: todayISO() },
  ];

  return { areas, projects, tasks, inbox, settings: { availableMinutesToday: 180 } };
}

function useStorage() {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);
  const dataRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(STORAGE_KEY, false);
        if (result && result.value) {
          setData(JSON.parse(result.value));
        } else {
          setData(seedData());
        }
      } catch (e) {
        setData(seedData());
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => { dataRef.current = data; }, [data]);

  const persist = useCallback((next) => {
    setData(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify(next), false);
      } catch (e) {
        // best-effort; ignore failures silently in UI
      }
    }, 350);
  }, []);

  return { data, loaded, persist };
}

/* ---------------------------------------------------------------------- */
/*  Small shared UI atoms                                                  */
/* ---------------------------------------------------------------------- */

function HealthPill({ health }) {
  if (!health) return null;
  const map = {
    "On Track": { bg: "var(--track-soft)", fg: "var(--track)" },
    "At Risk": { bg: "var(--risk-soft)", fg: "var(--risk)" },
    "Blocked": { bg: "var(--blocked-soft)", fg: "var(--blocked)" },
  };
  const c = map[health.level] || map["On Track"];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-ui font-medium"
      style={{ background: c.bg, color: c.fg }} title={health.reason}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.fg }} />
      {health.level}
    </span>
  );
}

function PriorityTag({ priority }) {
  const colors = { Critical: "var(--overdue)", High: "var(--risk)", Medium: "var(--accent)", Low: "var(--ink-faint)" };
  return (
    <span className="inline-flex items-center gap-1 font-ui text-xs" style={{ color: colors[priority] }}>
      <Flag size={11} strokeWidth={2.5} /> {priority}
    </span>
  );
}

function ProgressBar({ value }) {
  if (value == null) return <div className="text-xs font-mono text-[var(--ink-faint)]">No tasks yet</div>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--line-soft)] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: "var(--accent)" }} />
      </div>
      <span className="font-mono text-xs text-[var(--ink-soft)] w-9 text-right">{value}%</span>
    </div>
  );
}

function IconBtn({ onClick, children, title, active }) {
  return (
    <button onClick={onClick} title={title}
      className={classNames("p-1.5 rounded transition-colors ppos-focus", active ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "text-[var(--ink-soft)] hover:bg-[var(--line-soft)]")}>
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs font-ui text-[var(--ink-faint)] mb-1">{label}</div>
      {children}
    </label>
  );
}

const inputCls = "w-full px-2.5 py-1.5 rounded border border-[var(--line)] bg-[var(--panel-2)] text-sm font-ui text-[var(--ink)] ppos-focus";
const selectCls = inputCls + " cursor-pointer";
const btnPrimary = "px-3 py-1.5 rounded bg-[var(--accent)] text-white text-sm font-ui font-medium hover:brightness-95 ppos-focus";
const btnGhost = "px-3 py-1.5 rounded border border-[var(--line)] text-sm font-ui text-[var(--ink)] hover:bg-[var(--line-soft)] ppos-focus";

function Modal({ title, onClose, children, width = "max-w-lg" }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4" style={{ background: "var(--modal-scrim)" }} onClick={onClose}>
      <div className={classNames("w-full bg-[var(--panel-2)] rounded-lg shadow-xl border border-[var(--line)]", width)} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--line)]">
          <h3 className="font-display text-lg text-[var(--ink)]">{title}</h3>
          <button onClick={onClose} className="text-[var(--ink-faint)] hover:text-[var(--ink)] ppos-focus rounded p-1"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function SectionHeader({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <h3 className="font-ui text-[11px] tracking-wide text-[var(--ink-faint)] uppercase">{children}</h3>
      {action}
    </div>
  );
}

function EmptyState({ text, cta, onCta }) {
  return (
    <div className="py-8 text-center border border-dashed border-[var(--line)] rounded-lg">
      <p className="text-sm font-ui text-[var(--ink-soft)] mb-2">{text}</p>
      {cta && <button onClick={onCta} className={btnGhost}>{cta}</button>}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Quick Add modal                                                        */
/* ---------------------------------------------------------------------- */

function QuickAddModal({ projects, onClose, onCreateTask, onCreateInbox }) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState(null);
  const [asInbox, setAsInbox] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);

  useEffect(() => {
    if (!raw.trim()) { setParsed(null); return; }
    setParsed(parseQuickAdd(raw, projects));
  }, [raw, projects]);

  function submit() {
    if (!raw.trim()) return;
    if (asInbox) {
      onCreateInbox(raw.trim());
    } else {
      onCreateTask({
        name: parsed.name, projectId: parsed.projectId, status: parsed.scheduledDate ? "Scheduled" : "Inbox",
        priority: "Medium", dueDate: parsed.dueDate, scheduledDate: parsed.scheduledDate, scheduledTime: null,
        location: parsed.location, duration: parsed.duration, notes: "", tags: [],
      });
    }
    onClose();
  }

  const activeProjects = projects.filter(p => !INACTIVE_PROJECT_STATUSES.has(p.status));

  return (
    <Modal title="Quick add" onClose={onClose} width="max-w-xl">
      <textarea ref={inputRef} value={raw} onChange={e => setRaw(e.target.value)} rows={2}
        placeholder="Create competitor analysis for MTKI before Friday..."
        className={inputCls + " resize-none"}
        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }} />

      <div className="flex items-center gap-2 mt-2">
        <button onClick={() => setAsInbox(false)} className={classNames("px-2.5 py-1 rounded text-xs font-ui", !asInbox ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "text-[var(--ink-faint)]")}>Create task</button>
        <button onClick={() => setAsInbox(true)} className={classNames("px-2.5 py-1 rounded text-xs font-ui", asInbox ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "text-[var(--ink-faint)]")}>Send to inbox instead</button>
      </div>

      {!asInbox && parsed && (
        <div className="mt-4 p-3 rounded border border-[var(--line-soft)] bg-[var(--paper)] space-y-2">
          <div className="text-xs font-ui text-[var(--ink-faint)] mb-1">Detected — edit anything before saving</div>
          <Field label="Task">
            <input className={inputCls} value={parsed.name} onChange={e => setParsed({ ...parsed, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Project">
              <select className={selectCls} value={parsed.projectId || ""} onChange={e => setParsed({ ...parsed, projectId: e.target.value || null })}>
                <option value="">Unassigned</option>
                {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Location">
              <select className={selectCls} value={parsed.location || ""} onChange={e => setParsed({ ...parsed, location: e.target.value || null })}>
                <option value="">Not set</option>
                {CONTEXTS.filter(c => c !== "Anywhere").map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Due date">
              <input type="date" className={inputCls} value={parsed.dueDate || ""} onChange={e => setParsed({ ...parsed, dueDate: e.target.value || null })} />
            </Field>
            <Field label="Scheduled date">
              <input type="date" className={inputCls} value={parsed.scheduledDate || ""} onChange={e => setParsed({ ...parsed, scheduledDate: e.target.value || null })} />
            </Field>
            <Field label="Duration (min)">
              <input type="number" className={inputCls} value={parsed.duration || ""} onChange={e => setParsed({ ...parsed, duration: e.target.value ? parseInt(e.target.value) : null })} />
            </Field>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        <button onClick={submit} className={btnPrimary}>{asInbox ? "Add to inbox" : "Create task"}</button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/*  What should I work on? modal                                          */
/* ---------------------------------------------------------------------- */

function WorkNowModal({ tasks, projects, onClose, onGoToTask }) {
  const [minutes, setMinutes] = useState(60);
  const [context, setContext] = useState("Anywhere");
  const [custom, setCustom] = useState("");

  const recs = useMemo(() => recommendTasks(tasks, projects, {
    availableMinutes: custom ? parseInt(custom) || 60 : minutes, context, limit: 5,
  }), [tasks, projects, minutes, context, custom]);

  return (
    <Modal title="What should I work on?" onClose={onClose} width="max-w-xl">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Field label="Available time">
          <div className="flex flex-wrap gap-1.5">
            {[15, 30, 60, 120].map(m => (
              <button key={m} onClick={() => { setMinutes(m); setCustom(""); }}
                className={classNames("px-2.5 py-1 rounded text-xs font-mono border", (!custom && minutes === m) ? "bg-[var(--accent-soft)] border-[var(--accent-soft-line)] text-[var(--accent-ink)]" : "border-[var(--line)] text-[var(--ink-soft)]")}>
                {fmtDuration(m)}
              </button>
            ))}
            <input placeholder="custom" value={custom} onChange={e => setCustom(e.target.value.replace(/\D/g, ""))}
              className="w-16 px-2 py-1 rounded text-xs font-mono border border-[var(--line)] ppos-focus" />
          </div>
        </Field>
        <Field label="Context">
          <select className={selectCls} value={context} onChange={e => setContext(e.target.value)}>
            {CONTEXTS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>

      <div className="text-xs font-ui text-[var(--ink-faint)] uppercase tracking-wide mb-2">
        You have {fmtDuration(custom ? parseInt(custom) || 0 : minutes)} — best use of your time
      </div>

      {recs.length === 0 && <EmptyState text="Nothing fits that window right now." />}

      <div className="space-y-2">
        {recs.map(({ task, project, reasons }, i) => (
          <button key={task.id} onClick={() => { onGoToTask(task); onClose(); }}
            className="w-full text-left p-3 rounded border border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent-soft-line)] transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-ui text-sm text-[var(--ink)]">{i + 1}. {task.name}</div>
                {project && <div className="text-xs font-ui text-[var(--ink-faint)] mt-0.5">{project.name}</div>}
              </div>
              {task.duration != null && <span className="font-mono text-xs text-[var(--ink-soft)] shrink-0">{fmtDuration(task.duration)}</span>}
            </div>
            {reasons.length > 0 && (
              <div className="text-xs font-ui text-[var(--accent-ink)] mt-1.5">Recommended because: {reasons.join(" + ")}</div>
            )}
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/*  Task row + editor                                                      */
/* ---------------------------------------------------------------------- */

function TaskRow({ task, project, onToggleDone, onOpen, showProject }) {
  const overdue = task.dueDate && task.status !== "Done" && task.dueDate < todayISO();
  return (
    <div className="flex items-center gap-2.5 py-2 px-2.5 rounded hover:bg-[var(--line-soft)] group">
      <button onClick={() => onToggleDone(task)} className="shrink-0 text-[var(--ink-faint)] hover:text-[var(--track)]">
        {task.status === "Done" ? <CheckCircle2 size={17} style={{ color: "var(--track)" }} /> : <Circle size={17} />}
      </button>
      <button onClick={() => onOpen(task)} className="flex-1 min-w-0 text-left">
        <div className={classNames("text-sm font-ui truncate", task.status === "Done" ? "line-through text-[var(--ink-faint)]" : "text-[var(--ink)]")}>{task.name}</div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {showProject && project && <span className="text-xs font-ui text-[var(--ink-faint)]">{project.name}</span>}
          {task.location && <span className="text-xs font-ui text-[var(--ink-faint)] inline-flex items-center gap-0.5"><MapPin size={10} />{task.location}</span>}
          {task.duration != null && <span className="text-xs font-mono text-[var(--ink-faint)] inline-flex items-center gap-0.5"><Clock size={10} />{fmtDuration(task.duration)}</span>}
        </div>
      </button>
      <PriorityTag priority={task.priority} />
      {task.dueDate && (
        <span className={classNames("font-mono text-xs shrink-0", overdue ? "text-[var(--overdue)]" : "text-[var(--ink-soft)]")}>
          {relativeDayLabel(task.dueDate)}
        </span>
      )}
    </div>
  );
}

function TaskEditor({ task, projects, onClose, onSave, onDelete }) {
  const [t, setT] = useState({ ...task });
  const activeProjects = projects.filter(p => !INACTIVE_PROJECT_STATUSES.has(p.status) || p.id === task.projectId);
  return (
    <Modal title={task.id ? "Edit task" : "New task"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Task name">
          <input className={inputCls} value={t.name} onChange={e => setT({ ...t, name: e.target.value })} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Project">
            <select className={selectCls} value={t.projectId || ""} onChange={e => setT({ ...t, projectId: e.target.value || null })}>
              <option value="">Unassigned</option>
              {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={selectCls} value={t.status} onChange={e => setT({ ...t, status: e.target.value })}>
              {TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className={selectCls} value={t.priority} onChange={e => setT({ ...t, priority: e.target.value })}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Location">
            <select className={selectCls} value={t.location || ""} onChange={e => setT({ ...t, location: e.target.value || null })}>
              <option value="">Not set</option>
              {CONTEXTS.filter(c => c !== "Anywhere").map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Due date">
            <input type="date" className={inputCls} value={t.dueDate || ""} onChange={e => setT({ ...t, dueDate: e.target.value || null })} />
          </Field>
          <Field label="Scheduled date">
            <input type="date" className={inputCls} value={t.scheduledDate || ""} onChange={e => setT({ ...t, scheduledDate: e.target.value || null })} />
          </Field>
          <Field label="Duration (minutes)">
            <input type="number" className={inputCls} value={t.duration ?? ""} onChange={e => setT({ ...t, duration: e.target.value ? parseInt(e.target.value) : null })} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea rows={2} className={inputCls + " resize-none"} value={t.notes || ""} onChange={e => setT({ ...t, notes: e.target.value })} />
        </Field>
      </div>
      <div className="flex justify-between mt-5">
        {task.id ? (
          <button onClick={() => onDelete(task.id)} className="text-sm font-ui text-[var(--overdue)] hover:underline inline-flex items-center gap-1"><Trash2 size={14} />Delete</button>
        ) : <span />}
        <div className="flex gap-2">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button onClick={() => onSave(t)} className={btnPrimary}>Save</button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/*  Dashboard (Today)                                                      */
/* ---------------------------------------------------------------------- */

function Dashboard({ data, actions, openProject, openTask }) {
  const { areas, projects, tasks, settings } = data;
  const activeProjects = projects.filter(p => !INACTIVE_PROJECT_STATUSES.has(p.status));
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));

  const todaysFocus = useMemo(() => recommendTasks(tasks, projects, {
    availableMinutes: settings.availableMinutesToday || 180, context: "Anywhere", limit: 3,
  }), [tasks, projects, settings.availableMinutesToday]);

  const todayTasks = tasks.filter(t => t.status !== "Done" && t.status !== "Cancelled" &&
    (t.scheduledDate === todayISO() || t.dueDate === todayISO()));

  const attention = [];
  activeProjects.forEach(p => {
    const h = computeHealth(p, tasks);
    if (h && h.level !== "On Track") attention.push({ project: p, health: h });
  });
  const overdueTasks = tasks.filter(t => t.status !== "Done" && t.status !== "Cancelled" && t.dueDate && t.dueDate < todayISO());

  const weekEnd = addDays(todayISO(), 6);
  const weekTasks = tasks.filter(t => t.status !== "Done" && t.status !== "Cancelled" && t.scheduledDate && t.scheduledDate >= todayISO() && t.scheduledDate <= weekEnd);
  const plannedMinutes = weekTasks.reduce((s, t) => s + (t.duration || 45), 0);
  const availableWeeklyMinutes = (settings.availableMinutesToday || 180) * 7;
  const overcapacity = plannedMinutes > availableWeeklyMinutes;
  const upcomingDeadlines = activeProjects.filter(p => p.deadline && p.deadline >= todayISO() && p.deadline <= weekEnd)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  return (
    <div className={PAGE_WIDE}>
      <div className="mb-8">
        <div className="font-mono text-xs text-[var(--ink-faint)] mb-1">{formatDateFull(todayISO())}</div>
        <h1 className="font-display text-3xl text-[var(--ink)]">Today</h1>
      </div>

      <section className="mb-8">
        <SectionHeader action={
          <button onClick={actions.openWorkNow} className="inline-flex items-center gap-1.5 text-xs font-ui text-[var(--accent-ink)] hover:underline">
            <Sparkles size={13} /> What should I work on?
          </button>
        }>Today's focus</SectionHeader>
        {todaysFocus.length === 0 ? (
          <EmptyState text="No open tasks yet." cta="Quick add a task" onCta={actions.openQuickAdd} />
        ) : (
          <div className="space-y-2">
            {todaysFocus.map(({ task, project, reasons }, i) => (
              <button key={task.id} onClick={() => openTask(task)} className="w-full text-left p-3.5 rounded-lg border border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent-soft-line)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="font-mono text-xs text-[var(--ink-faint)] mt-0.5">{i + 1}</span>
                    <div>
                      <div className="font-ui text-sm text-[var(--ink)]">{task.name}</div>
                      {project && <div className="text-xs font-ui text-[var(--ink-faint)] mt-0.5">{project.name}</div>}
                      {reasons.length > 0 && <div className="text-xs font-ui text-[var(--accent-ink)] mt-1">{reasons.join(" · ")}</div>}
                    </div>
                  </div>
                  {task.duration != null && <span className="font-mono text-xs text-[var(--ink-soft)] shrink-0">{fmtDuration(task.duration)}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {todayTasks.length > 0 && (
        <section className="mb-8">
          <SectionHeader>Scheduled today</SectionHeader>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] divide-y divide-[var(--line-soft)]">
            {todayTasks.map(t => (
              <TaskRow key={t.id} task={t} project={projectMap[t.projectId]} showProject onToggleDone={actions.toggleDone} onOpen={openTask} />
            ))}
          </div>
        </section>
      )}

      {(attention.length > 0 || overdueTasks.length > 0) && (
        <section className="mb-8">
          <SectionHeader>Needs attention</SectionHeader>
          <div className="space-y-2">
            {overdueTasks.length > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-[var(--overdue-soft)] bg-[var(--overdue-soft)]">
                <AlertTriangle size={15} style={{ color: "var(--overdue)" }} />
                <span className="text-sm font-ui" style={{ color: "var(--overdue)" }}>{overdueTasks.length} task{overdueTasks.length > 1 ? "s" : ""} overdue</span>
              </div>
            )}
            {attention.map(({ project, health }) => (
              <button key={project.id} onClick={() => openProject(project)} className="w-full flex items-center justify-between p-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent-soft-line)] text-left">
                <div>
                  <div className="font-ui text-sm text-[var(--ink)]">{project.name}</div>
                  <div className="text-xs font-ui text-[var(--ink-faint)] mt-0.5">{health.reason}</div>
                </div>
                <HealthPill health={health} />
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <SectionHeader action={<button onClick={() => actions.setView("projects")} className="text-xs font-ui text-[var(--ink-faint)] hover:text-[var(--accent-ink)] inline-flex items-center gap-0.5">All projects <ChevronRight size={13} /></button>}>
          Active projects
        </SectionHeader>
        {activeProjects.length === 0 ? (
          <EmptyState text="No active projects yet." cta="Create your first project" onCta={actions.openNewProject} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {activeProjects.slice(0, 6).map(p => {
              const health = computeHealth(p, tasks);
              const progress = computeProgress(p, tasks);
              const remaining = projectTasks(p.id, tasks).filter(t => t.status !== "Done" && t.status !== "Cancelled").length;
              const area = areas.find(a => a.id === p.areaId);
              return (
                <button key={p.id} onClick={() => openProject(p)} className="text-left p-3.5 rounded-lg border border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent-soft-line)]">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="font-ui text-sm text-[var(--ink)] leading-snug">{p.name}</div>
                    {health && <HealthPill health={health} />}
                  </div>
                  <div className="text-xs font-ui text-[var(--ink-faint)] mb-2">{area ? area.name : ""} · <PriorityTag priority={p.priority} /></div>
                  <ProgressBar value={progress} />
                  <div className="flex items-center justify-between mt-2 text-xs font-ui text-[var(--ink-faint)]">
                    <span>{p.deadline ? `Due ${formatDateShort(p.deadline)}` : "No deadline"}</span>
                    <span className="font-mono">{remaining} left</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <SectionHeader>Week overview</SectionHeader>
        <div className="p-4 rounded-lg border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex items-center justify-between mb-3">
            <div className="font-ui text-sm text-[var(--ink)]">
              <span className="font-mono">{fmtDuration(plannedMinutes)}</span> planned this week ·{" "}
              <span className="font-mono">{fmtDuration(availableWeeklyMinutes)}</span> available
            </div>
            {overcapacity && <span className="text-xs font-ui font-medium px-2 py-0.5 rounded" style={{ background: "var(--risk-soft)", color: "var(--risk)" }}>OVERCAPACITY</span>}
          </div>
          {upcomingDeadlines.length > 0 ? (
            <div className="space-y-1.5">
              {upcomingDeadlines.map(p => (
                <div key={p.id} className="flex items-center justify-between text-sm font-ui">
                  <span className="text-[var(--ink)]">{p.name}</span>
                  <span className="font-mono text-xs text-[var(--ink-soft)]">{formatDateShort(p.deadline)}</span>
                </div>
              ))}
            </div>
          ) : <div className="text-xs font-ui text-[var(--ink-faint)]">No deadlines in the next 7 days.</div>}
        </div>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Projects list                                                          */
/* ---------------------------------------------------------------------- */

function ProjectsPage({ data, openProject, actions }) {
  const { areas, projects, tasks } = data;
  const [filterArea, setFilterArea] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [sortBy, setSortBy] = useState("deadline");

  let list = projects.slice();
  if (filterArea) list = list.filter(p => p.areaId === filterArea);
  if (filterStatus) list = list.filter(p => p.status === filterStatus);

  const progressCache = Object.fromEntries(list.map(p => [p.id, computeProgress(p, tasks)]));
  if (sortBy === "deadline") list.sort((a, b) => localeCompareSafe(a.deadline || "9999", b.deadline || "9999"));
  if (sortBy === "priority") list.sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
  if (sortBy === "progress") list.sort((a, b) => (progressCache[b.id] || 0) - (progressCache[a.id] || 0));
  if (sortBy === "name") list.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className={PAGE_WIDE}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl text-[var(--ink)]">Projects</h1>
        <button onClick={actions.openNewProject} className={btnPrimary + " inline-flex items-center gap-1.5"}><Plus size={15} />New project</button>
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <select className={selectCls + " w-auto"} value={filterArea} onChange={e => setFilterArea(e.target.value)}>
          <option value="">All areas</option>
          {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className={selectCls + " w-auto"} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex-1" />
        <span className="text-xs font-ui text-[var(--ink-faint)]">Sort</span>
        <select className={selectCls + " w-auto"} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="deadline">Deadline</option>
          <option value="priority">Priority</option>
          <option value="progress">Progress</option>
          <option value="name">Name</option>
        </select>
      </div>

      {list.length === 0 ? (
        <EmptyState text="No projects match these filters." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.map(p => {
            const health = computeHealth(p, tasks);
            const progress = computeProgress(p, tasks);
            const remaining = projectTasks(p.id, tasks).filter(t => t.status !== "Done" && t.status !== "Cancelled").length;
            const area = areas.find(a => a.id === p.areaId);
            return (
              <button key={p.id} onClick={() => openProject(p)} className="text-left p-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent-soft-line)]">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="font-ui text-sm text-[var(--ink)] leading-snug">{p.name}</div>
                  {health && <HealthPill health={health} />}
                </div>
                <div className="text-xs font-ui text-[var(--ink-faint)] mb-2">{area ? area.name : "No area"} · <PriorityTag priority={p.priority} /> · {p.status}</div>
                <ProgressBar value={progress} />
                <div className="flex items-center justify-between mt-2 text-xs font-ui text-[var(--ink-faint)]">
                  <span>{p.deadline ? `Due ${formatDateShort(p.deadline)}` : "No deadline"}</span>
                  <span className="font-mono">{remaining} remaining</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
function localeCompareSafe(a, b) { return a.localeCompare(b); }

/* ---------------------------------------------------------------------- */
/*  Project detail                                                         */
/* ---------------------------------------------------------------------- */

function ProjectDetail({ project, areas, tasks, onBack, onUpdate, onDelete, onAddTask, onOpenTask, onToggleDone }) {
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(project.goal || "");
  const [newDeliverable, setNewDeliverable] = useState("");
  const [newTaskName, setNewTaskName] = useState("");

  const health = computeHealth(project, tasks);
  const progress = computeProgress(project, tasks);
  const myTasks = projectTasks(project.id, tasks).filter(t => t.status !== "Cancelled");
  const openTasks = myTasks.filter(t => t.status !== "Done");
  const area = areas.find(a => a.id === project.areaId);

  function patch(fields) {
    const activity = project.activity ? project.activity.slice() : [];
    onUpdate({ ...project, ...fields });
  }
  function logActivity(text) {
    const activity = [{ id: uid("act"), date: todayISO(), text }, ...(project.activity || [])].slice(0, 20);
    return activity;
  }

  return (
    <div className={PAGE_WIDE}>
      <button onClick={onBack} className="text-xs font-ui text-[var(--ink-faint)] hover:text-[var(--ink)] mb-4 inline-flex items-center gap-1">
        <ChevronRight size={13} className="rotate-180" /> All projects
      </button>

      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="font-display text-3xl text-[var(--ink)]">{project.name}</h1>
        {health && <HealthPill health={health} />}
      </div>
      {health && <div className="text-xs font-ui text-[var(--ink-faint)] mb-5">{health.reason}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 max-w-2xl">
        <Field label="Status">
          <select className={selectCls} value={project.status} onChange={e => patch({ status: e.target.value, activity: logActivity(`Status changed to ${e.target.value}`) })}>
            {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className={selectCls} value={project.priority} onChange={e => patch({ priority: e.target.value })}>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Deadline">
          <input type="date" className={inputCls} value={project.deadline || ""} onChange={e => patch({ deadline: e.target.value || null, activity: logActivity(`Deadline set to ${e.target.value}`) })} />
        </Field>
        <Field label="Area">
          <select className={selectCls} value={project.areaId || ""} onChange={e => patch({ areaId: e.target.value || null })}>
            <option value="">None</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
        <div className="min-w-0">
          <div className="mb-6">
            <SectionHeader>Goal</SectionHeader>
            {editingGoal ? (
              <div className="flex gap-2">
                <input className={inputCls} value={goalDraft} onChange={e => setGoalDraft(e.target.value)} autoFocus />
                <button onClick={() => { patch({ goal: goalDraft }); setEditingGoal(false); }} className={btnPrimary}>Save</button>
              </div>
            ) : (
              <button onClick={() => setEditingGoal(true)} className="text-left w-full group">
                <p className="text-sm font-ui text-[var(--ink)]">{project.goal || "What are you trying to accomplish?"}</p>
              </button>
            )}
          </div>

          <div className="mb-6 max-w-md">
            <SectionHeader>Progress</SectionHeader>
            <ProgressBar value={progress} />
          </div>

          <div className="mb-6">
            <SectionHeader action={
              <div className="flex gap-1">
                <input value={newTaskName} onChange={e => setNewTaskName(e.target.value)} placeholder="Add next action"
                  onKeyDown={e => { if (e.key === "Enter" && newTaskName.trim()) { onAddTask(project.id, newTaskName.trim()); setNewTaskName(""); } }}
                  className="text-xs px-2 py-1 rounded border border-[var(--line)] ppos-focus w-44" />
              </div>
            }>Next actions ({openTasks.length})</SectionHeader>
            {openTasks.length === 0 ? (
              <div className="text-xs font-ui text-[var(--ink-faint)]">Nothing open — add a next action above.</div>
            ) : (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] divide-y divide-[var(--line-soft)]">
                {openTasks.map(t => <TaskRow key={t.id} task={t} onToggleDone={onToggleDone} onOpen={onOpenTask} />)}
              </div>
            )}
          </div>

          <button onClick={() => onDelete(project.id)} className="text-xs font-ui text-[var(--overdue)] hover:underline inline-flex items-center gap-1"><Trash2 size={12} />Delete project</button>
        </div>

        <div className="min-w-0">
          <div className="mb-6">
            <SectionHeader action={
              <div className="flex gap-1">
                <input value={newDeliverable} onChange={e => setNewDeliverable(e.target.value)} placeholder="Add deliverable"
                  onKeyDown={e => { if (e.key === "Enter" && newDeliverable.trim()) { patch({ deliverables: [...(project.deliverables || []), { id: uid("del"), name: newDeliverable.trim(), done: false }] }); setNewDeliverable(""); } }}
                  className="text-xs px-2 py-1 rounded border border-[var(--line)] ppos-focus w-28" />
              </div>
            }>Deliverables</SectionHeader>
            {(!project.deliverables || project.deliverables.length === 0) ? (
              <div className="text-xs font-ui text-[var(--ink-faint)]">No deliverables — this project can stay simple.</div>
            ) : (
              <div className="space-y-1">
                {project.deliverables.map(d => (
                  <div key={d.id} className="flex items-center gap-2 group">
                    <button onClick={() => patch({ deliverables: project.deliverables.map(x => x.id === d.id ? { ...x, done: !x.done } : x) })}>
                      {d.done ? <CheckCircle2 size={16} style={{ color: "var(--track)" }} /> : <Circle size={16} className="text-[var(--ink-faint)]" />}
                    </button>
                    <span className={classNames("text-sm font-ui flex-1", d.done ? "line-through text-[var(--ink-faint)]" : "text-[var(--ink)]")}>{d.name}</span>
                    <button onClick={() => patch({ deliverables: project.deliverables.filter(x => x.id !== d.id) })} className="opacity-0 group-hover:opacity-100 text-[var(--ink-faint)] hover:text-[var(--overdue)]"><X size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {project.activity && project.activity.length > 0 && (
            <div className="mb-6">
              <SectionHeader>Activity</SectionHeader>
              <div className="space-y-1.5">
                {project.activity.slice(0, 6).map(a => (
                  <div key={a.id} className="flex items-baseline gap-3 text-xs font-ui">
                    <span className="font-mono text-[var(--ink-faint)] w-14 shrink-0">{formatDateShort(a.date)}</span>
                    <span className="text-[var(--ink-soft)]">{a.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Inbox                                                                   */
/* ---------------------------------------------------------------------- */

function InboxPage({ data, actions }) {
  const [raw, setRaw] = useState("");
  const { inbox } = data;

  function capture() {
    if (!raw.trim()) return;
    actions.addInboxItem(raw.trim());
    setRaw("");
  }

  return (
    <div className={PAGE_READ}>
      <h1 className="font-display text-3xl text-[var(--ink)] mb-1">Inbox</h1>
      <p className="text-sm font-ui text-[var(--ink-faint)] mb-6">Dump unfinished thoughts here. Process them into tasks or projects when ready.</p>

      <div className="flex gap-2 mb-6">
        <input value={raw} onChange={e => setRaw(e.target.value)} onKeyDown={e => e.key === "Enter" && capture()}
          placeholder="Follow up with Nelly..." className={inputCls} />
        <button onClick={capture} className={btnPrimary}>Capture</button>
      </div>

      {inbox.length === 0 ? (
        <EmptyState text="Inbox zero. Nice." />
      ) : (
        <div className="space-y-2">
          {inbox.map(item => (
            <div key={item.id} className="p-3 rounded-lg border border-[var(--line)] bg-[var(--panel)]">
              <div className="text-sm font-ui text-[var(--ink)] mb-2">{item.text}</div>
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => actions.processToTask(item)} className="text-xs px-2 py-1 rounded border border-[var(--line)] hover:bg-[var(--line-soft)] font-ui">→ Task</button>
                <button onClick={() => actions.processToProject(item)} className="text-xs px-2 py-1 rounded border border-[var(--line)] hover:bg-[var(--line-soft)] font-ui">→ Project</button>
                <button onClick={() => actions.deleteInboxItem(item.id)} className="text-xs px-2 py-1 rounded border border-[var(--line)] hover:bg-[var(--overdue-soft)] font-ui text-[var(--overdue)]">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Areas                                                                   */
/* ---------------------------------------------------------------------- */

function areaStats(area, projects, tasks) {
  const areaProjects = projects.filter(p => p.areaId === area.id);
  const activeAreaProjects = areaProjects.filter(p => !INACTIVE_PROJECT_STATUSES.has(p.status));
  const relevantTasks = tasks.filter(t => areaProjects.some(p => p.id === t.projectId) && t.status !== "Cancelled");
  const done = relevantTasks.filter(t => t.status === "Done").length;
  const progress = relevantTasks.length > 0 ? round((done / relevantTasks.length) * 100) : null;
  const remaining = relevantTasks.filter(t => t.status !== "Done").length;
  return { activeCount: activeAreaProjects.length, totalCount: areaProjects.length, progress, remaining };
}

function AreasPage({ data, actions, openArea }) {
  const { areas, projects, tasks } = data;
  const [newName, setNewName] = useState("");

  return (
    <div className={PAGE_WIDE}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl text-[var(--ink)]">Areas</h1>
      </div>

      <div className="flex gap-2 mb-6 max-w-md">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New area name"
          onKeyDown={e => { if (e.key === "Enter" && newName.trim()) { actions.addArea(newName.trim()); setNewName(""); } }}
          className={inputCls} />
        <button onClick={() => { if (newName.trim()) { actions.addArea(newName.trim()); setNewName(""); } }} className={btnPrimary + " shrink-0"}>Add area</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {areas.map(a => {
          const stats = areaStats(a, projects, tasks);
          return (
            <div key={a.id} className="p-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] group relative">
              <button onClick={() => openArea(a)} className="flex items-start gap-3 text-left w-full mb-3">
                <span className="text-lg shrink-0">{a.icon || "📁"}</span>
                <div className="min-w-0">
                  <div className="font-ui text-sm text-[var(--ink)] flex items-center gap-1.5">
                    {a.name}
                    {a.status === "Archived" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--line-soft)] text-[var(--ink-faint)]">Archived</span>}
                  </div>
                  {a.description && <div className="text-xs font-ui text-[var(--ink-faint)] truncate">{a.description}</div>}
                </div>
              </button>
              <ProgressBar value={stats.progress} />
              <div className="flex items-center justify-between mt-2 text-xs font-ui text-[var(--ink-faint)]">
                <span>{stats.activeCount} active project{stats.activeCount === 1 ? "" : "s"}</span>
                <span className="font-mono">{stats.remaining} task{stats.remaining === 1 ? "" : "s"} left</span>
              </div>
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 flex gap-1">
                <button onClick={() => actions.archiveArea(a.id)} title={a.status === "Archived" ? "Unarchive" : "Archive"} className="text-[var(--ink-faint)] hover:text-[var(--ink)] p-1"><Archive size={13} /></button>
                <button onClick={() => actions.deleteArea(a.id, stats.totalCount)} title="Delete" className="text-[var(--ink-faint)] hover:text-[var(--overdue)] p-1"><Trash2 size={13} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Area detail                                                             */
/* ---------------------------------------------------------------------- */

function AreaDetail({ area, projects, tasks, onBack, onUpdate, onOpenProject, onNewProjectInArea }) {
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(area.description || "");

  const areaProjects = projects.filter(p => p.areaId === area.id);
  const activeProjects = areaProjects.filter(p => !INACTIVE_PROJECT_STATUSES.has(p.status));
  const stats = areaStats(area, projects, tasks);

  return (
    <div className={PAGE_WIDE}>
      <button onClick={onBack} className="text-xs font-ui text-[var(--ink-faint)] hover:text-[var(--ink)] mb-4 inline-flex items-center gap-1">
        <ChevronRight size={13} className="rotate-180" /> All areas
      </button>

      <div className="flex items-center gap-3 mb-1">
        <span className="text-2xl">{area.icon || "📁"}</span>
        <h1 className="font-display text-3xl text-[var(--ink)]">{area.name}</h1>
      </div>
      {editingDesc ? (
        <div className="flex gap-2 mt-2 max-w-md">
          <input className={inputCls} value={descDraft} onChange={e => setDescDraft(e.target.value)} autoFocus />
          <button onClick={() => { onUpdate({ ...area, description: descDraft }); setEditingDesc(false); }} className={btnPrimary}>Save</button>
        </div>
      ) : (
        <button onClick={() => setEditingDesc(true)} className="text-sm font-ui text-[var(--ink-faint)] hover:text-[var(--ink)] mt-1 mb-6 text-left">
          {area.description || "Add a description..."}
        </button>
      )}

      <div className="grid grid-cols-3 gap-3 mb-8 max-w-xl">
        <div className="p-3.5 rounded-lg border border-[var(--line)] bg-[var(--panel)]">
          <div className="font-mono text-2xl text-[var(--ink)]">{stats.progress != null ? `${stats.progress}%` : "—"}</div>
          <div className="text-xs font-ui text-[var(--ink-faint)] mt-0.5">Overall progress</div>
        </div>
        <div className="p-3.5 rounded-lg border border-[var(--line)] bg-[var(--panel)]">
          <div className="font-mono text-2xl text-[var(--ink)]">{stats.remaining}</div>
          <div className="text-xs font-ui text-[var(--ink-faint)] mt-0.5">Tasks remaining</div>
        </div>
        <div className="p-3.5 rounded-lg border border-[var(--line)] bg-[var(--panel)]">
          <div className="font-mono text-2xl text-[var(--ink)]">{stats.activeCount}</div>
          <div className="text-xs font-ui text-[var(--ink-faint)] mt-0.5">Active projects</div>
        </div>
      </div>

      <SectionHeader action={
        <button onClick={() => onNewProjectInArea(area.id)} className="text-xs font-ui text-[var(--accent-ink)] hover:underline inline-flex items-center gap-1"><Plus size={13} />New project</button>
      }>Projects in this area</SectionHeader>

      {areaProjects.length === 0 ? (
        <EmptyState text="No projects here yet." cta="Create a project" onCta={() => onNewProjectInArea(area.id)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {areaProjects.map(p => {
            const health = computeHealth(p, tasks);
            const progress = computeProgress(p, tasks);
            const remaining = projectTasks(p.id, tasks).filter(t => t.status !== "Done" && t.status !== "Cancelled").length;
            return (
              <button key={p.id} onClick={() => onOpenProject(p)} className="text-left p-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] hover:border-[var(--accent-soft-line)]">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="font-ui text-sm text-[var(--ink)] leading-snug">{p.name}</div>
                  {health && <HealthPill health={health} />}
                </div>
                <div className="text-xs font-ui text-[var(--ink-faint)] mb-2"><PriorityTag priority={p.priority} /> · {p.status}</div>
                <ProgressBar value={progress} />
                <div className="flex items-center justify-between mt-2 text-xs font-ui text-[var(--ink-faint)]">
                  <span>{p.deadline ? `Due ${formatDateShort(p.deadline)}` : "No deadline"}</span>
                  <span className="font-mono">{remaining} remaining</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Board (simple kanban)                                                   */
/* ---------------------------------------------------------------------- */

const ALL_BOARD_COLS = ["Inbox", "Next", "In Progress", "Waiting", "Done"];
const DUE_FILTERS = ["Any", "Overdue", "Due today", "Due this week", "No due date"];

function taskMatchesDueFilter(task, filter) {
  if (filter === "Any") return true;
  if (filter === "No due date") return !task.dueDate;
  if (!task.dueDate) return false;
  const diff = daysBetween(todayISO(), task.dueDate);
  if (filter === "Overdue") return diff < 0;
  if (filter === "Due today") return diff === 0;
  if (filter === "Due this week") return diff >= 0 && diff <= 6;
  return true;
}

function BoardPage({ data, onOpenTask, actions }) {
  const { tasks, projects, areas } = data;
  const [filterArea, setFilterArea] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterDue, setFilterDue] = useState("Any");
  const [visibleCols, setVisibleCols] = useState(ALL_BOARD_COLS);

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));

  let filtered = tasks.filter(t => t.status !== "Cancelled");
  if (filterArea) filtered = filtered.filter(t => projectMap[t.projectId]?.areaId === filterArea);
  if (filterProject) filtered = filtered.filter(t => t.projectId === filterProject);
  if (filterPriority) filtered = filtered.filter(t => t.priority === filterPriority);
  if (filterDue !== "Any") filtered = filtered.filter(t => taskMatchesDueFilter(t, filterDue));

  const cols = ALL_BOARD_COLS.filter(c => visibleCols.includes(c));

  function move(task, dir) {
    const idx = ALL_BOARD_COLS.indexOf(task.status);
    const next = ALL_BOARD_COLS[idx + dir];
    if (next) actions.updateTask({ ...task, status: next });
  }
  function toggleCol(c) {
    setVisibleCols(v => v.includes(c) ? (v.length > 1 ? v.filter(x => x !== c) : v) : [...v, c]);
  }

  const availableProjects = filterArea ? projects.filter(p => p.areaId === filterArea) : projects;

  return (
    <div className={PAGE_WIDE}>
      <h1 className="font-display text-3xl text-[var(--ink)] mb-6">Board</h1>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select className={selectCls + " w-auto"} value={filterArea} onChange={e => { setFilterArea(e.target.value); setFilterProject(""); }}>
          <option value="">All areas</option>
          {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className={selectCls + " w-auto"} value={filterProject} onChange={e => setFilterProject(e.target.value)}>
          <option value="">All projects</option>
          {availableProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className={selectCls + " w-auto"} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className={selectCls + " w-auto"} value={filterDue} onChange={e => setFilterDue(e.target.value)}>
          {DUE_FILTERS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-6">
        <span className="text-xs font-ui text-[var(--ink-faint)] mr-1">Columns:</span>
        {ALL_BOARD_COLS.map(c => (
          <button key={c} onClick={() => toggleCol(c)}
            className={classNames("px-2 py-1 rounded text-xs font-ui border", visibleCols.includes(c) ? "bg-[var(--accent-soft)] border-[var(--accent-soft-line)] text-[var(--accent-ink)]" : "border-[var(--line)] text-[var(--ink-faint)]")}>
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
        {cols.map((col) => {
          const ci = ALL_BOARD_COLS.indexOf(col);
          return (
            <div key={col}>
              <div className="text-xs font-ui uppercase tracking-wide text-[var(--ink-faint)] mb-2 flex items-center justify-between">
                <span>{col}</span>
                <span className="font-mono">{filtered.filter(t => t.status === col).length}</span>
              </div>
              <div className="space-y-2 min-h-[60px]">
                {filtered.filter(t => t.status === col).map(t => (
                  <div key={t.id} className="p-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel)]">
                    <button onClick={() => onOpenTask(t)} className="text-left w-full text-sm font-ui text-[var(--ink)] mb-1">{t.name}</button>
                    {projectMap[t.projectId] && <div className="text-xs font-ui text-[var(--ink-faint)] mb-1.5">{projectMap[t.projectId].name}</div>}
                    <div className="flex items-center justify-between">
                      <PriorityTag priority={t.priority} />
                      <div className="flex gap-1">
                        {ci > 0 && <button onClick={() => move(t, -1)} className="text-[var(--ink-faint)] hover:text-[var(--ink)]"><ChevronRight size={13} className="rotate-180" /></button>}
                        {ci < ALL_BOARD_COLS.length - 1 && <button onClick={() => move(t, 1)} className="text-[var(--ink-faint)] hover:text-[var(--ink)]"><ChevronRight size={13} /></button>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Calendar (upcoming list)                                                */
/* ---------------------------------------------------------------------- */

function tasksForDay(tasks, day) {
  return tasks.filter(t => t.status !== "Cancelled" && (t.scheduledDate === day || t.dueDate === day));
}

function monthGrid(cursorIso) {
  const cursor = new Date(cursorIso + "T00:00:00");
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0=Sun
  const gridStart = new Date(year, month, 1 - startOffset);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({ iso: isoFromDate(d), inMonth: d.getMonth() === month });
  }
  return cells;
}

function CalendarPage({ data, onOpenTask, onToggleDone }) {
  const { tasks, projects } = data;
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const [mode, setMode] = useState("month");
  const [monthCursor, setMonthCursor] = useState(todayISO().slice(0, 8) + "01");
  const [selectedDay, setSelectedDay] = useState(null);

  const days14 = Array.from({ length: 14 }, (_, i) => addDays(todayISO(), i));
  const grid = useMemo(() => monthGrid(monthCursor), [monthCursor]);
  const monthLabel = new Date(monthCursor + "T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function shiftMonth(n) {
    const d = new Date(monthCursor + "T00:00:00");
    d.setMonth(d.getMonth() + n);
    setMonthCursor(isoFromDate(new Date(d.getFullYear(), d.getMonth(), 1)));
  }

  const selectedDayTasks = selectedDay ? tasksForDay(tasks.filter(t => t.status !== "Done"), selectedDay).concat(tasksForDay(tasks.filter(t => t.status === "Done"), selectedDay)) : [];

  return (
    <div className={PAGE_WIDE}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-display text-3xl text-[var(--ink)]">Calendar</h1>
        <div className="flex items-center gap-1 p-1 rounded-lg border border-[var(--line)] bg-[var(--panel)]">
          <button onClick={() => setMode("month")} className={classNames("px-2.5 py-1 rounded text-xs font-ui inline-flex items-center gap-1.5", mode === "month" ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "text-[var(--ink-faint)]")}>
            <CalendarRange size={13} />Month
          </button>
          <button onClick={() => setMode("list")} className={classNames("px-2.5 py-1 rounded text-xs font-ui inline-flex items-center gap-1.5", mode === "list" ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "text-[var(--ink-faint)]")}>
            <List size={13} />List
          </button>
        </div>
      </div>

      {mode === "month" ? (
        <>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded border border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--line-soft)]"><ChevronLeft size={15} /></button>
            <div className="font-ui text-sm text-[var(--ink)] w-40">{monthLabel}</div>
            <button onClick={() => shiftMonth(1)} className="p-1.5 rounded border border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--line-soft)]"><ChevronRight size={15} /></button>
            <button onClick={() => setMonthCursor(todayISO().slice(0, 8) + "01")} className="text-xs font-ui text-[var(--accent-ink)] hover:underline ml-1">Today</button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {weekdayLabels.map(w => <div key={w} className="text-xs font-ui text-[var(--ink-faint)] text-center py-1">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {grid.map(cell => {
              const dayTasks = tasksForDay(tasks, cell.iso);
              const isToday = cell.iso === todayISO();
              const openCount = dayTasks.filter(t => t.status !== "Done").length;
              return (
                <button key={cell.iso} onClick={() => setSelectedDay(cell.iso)}
                  className={classNames("aspect-square md:aspect-auto md:h-24 p-1.5 rounded-lg border text-left flex flex-col transition-colors",
                    cell.inMonth ? "border-[var(--line)] bg-[var(--panel)]" : "border-[var(--line-soft)] bg-transparent opacity-50",
                    isToday && "border-[var(--accent-soft-line)]")}>
                  <span className={classNames("font-mono text-xs", isToday ? "text-[var(--accent-ink)] font-medium" : "text-[var(--ink-faint)]")}>
                    {new Date(cell.iso + "T00:00:00").getDate()}
                  </span>
                  {dayTasks.length > 0 && (
                    <div className="mt-auto flex items-center gap-1 flex-wrap">
                      {openCount > 0 && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>{openCount}</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="max-w-2xl space-y-5">
          {days14.map(day => {
            const dayTasks = tasksForDay(tasks.filter(t => t.status !== "Done"), day);
            if (dayTasks.length === 0) return null;
            return (
              <div key={day}>
                <div className="text-xs font-ui uppercase tracking-wide text-[var(--ink-faint)] mb-2">{relativeDayLabel(day)} · {formatDateShort(day)}</div>
                <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] divide-y divide-[var(--line-soft)]">
                  {dayTasks.map(t => <TaskRow key={t.id} task={t} project={projectMap[t.projectId]} showProject onToggleDone={onToggleDone} onOpen={onOpenTask} />)}
                </div>
              </div>
            );
          })}
          {days14.every(day => tasksForDay(tasks.filter(t => t.status !== "Done"), day).length === 0) && (
            <EmptyState text="Nothing scheduled in the next two weeks." />
          )}
        </div>
      )}

      {selectedDay && (
        <Modal title={formatDateFull(selectedDay)} onClose={() => setSelectedDay(null)}>
          {selectedDayTasks.length === 0 ? (
            <EmptyState text="Nothing scheduled this day." />
          ) : (
            <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] divide-y divide-[var(--line-soft)]">
              {selectedDayTasks.map(t => (
                <TaskRow key={t.id} task={t} project={projectMap[t.projectId]} showProject onToggleDone={onToggleDone} onOpen={(task) => { setSelectedDay(null); onOpenTask(task); }} />
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Weekly review                                                          */
/* ---------------------------------------------------------------------- */

function WeeklyReview({ data, actions }) {
  const { projects, tasks } = data;
  const weekAgo = addDays(todayISO(), -7);
  const active = projects.filter(p => !INACTIVE_PROJECT_STATUSES.has(p.status));

  const completedThisWeek = tasks.filter(t => t.status === "Done").length; // simple lifetime-done proxy
  const stalled = active.filter(p => !(p.activity || []).some(a => a.date >= weekAgo));
  const progressed = active.filter(p => (p.activity || []).some(a => a.date >= weekAgo));
  const overdue = tasks.filter(t => t.status !== "Done" && t.status !== "Cancelled" && t.dueDate && t.dueDate < todayISO());
  const weekEnd = addDays(todayISO(), 7);
  const upcoming = active.filter(p => p.deadline && p.deadline >= todayISO() && p.deadline <= weekEnd);
  const nextWeekMinutes = tasks.filter(t => t.status !== "Done" && t.status !== "Cancelled" && t.scheduledDate && t.scheduledDate > todayISO() && t.scheduledDate <= weekEnd)
    .reduce((s, t) => s + (t.duration || 45), 0);
  const risks = active.filter(p => { const h = computeHealth(p, tasks); return h && h.level === "At Risk"; });

  const stats = [
    { label: "Completed", value: completedThisWeek },
    { label: "Projects progressed", value: progressed.length },
    { label: "Projects stalled", value: stalled.length },
    { label: "Overdue", value: overdue.length },
    { label: "Upcoming deadlines", value: upcoming.length },
    { label: "Workload next week", value: fmtDuration(nextWeekMinutes) },
    { label: "Potential risks", value: risks.length },
  ];

  return (
    <div className={PAGE_WIDE}>
      <h1 className="font-display text-3xl text-[var(--ink)] mb-6">Weekly review</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 max-w-3xl">
        {stats.map(s => (
          <div key={s.label} className="p-3.5 rounded-lg border border-[var(--line)] bg-[var(--panel)]">
            <div className="font-mono text-2xl text-[var(--ink)]">{s.value}</div>
            <div className="text-xs font-ui text-[var(--ink-faint)] mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="max-w-2xl">
        {stalled.length > 0 && (
          <div className="mb-6">
            <SectionHeader>Stalled — no activity in 7 days</SectionHeader>
            <div className="space-y-1">
              {stalled.map(p => <div key={p.id} className="text-sm font-ui text-[var(--ink)] py-1">{p.name}</div>)}
            </div>
          </div>
        )}

        <div className="p-4 rounded-lg border border-[var(--line)] bg-[var(--paper)] space-y-2">
          <div className="text-xs font-ui uppercase tracking-wide text-[var(--ink-faint)] mb-1">Worth asking yourself</div>
          {[
            "What should remain active?",
            "What should be paused?",
            "What should be cancelled?",
            "What needs a new deadline?",
            "What's the most important project next week?",
          ].map(q => <div key={q} className="text-sm font-ui text-[var(--ink-soft)]">— {q}</div>)}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  New project modal                                                       */
/* ---------------------------------------------------------------------- */

function NewProjectModal({ areas, onClose, onCreate, defaultAreaId }) {
  const [name, setName] = useState("");
  const [areaId, setAreaId] = useState(defaultAreaId || (areas[0] ? areas[0].id : ""));
  const [priority, setPriority] = useState("Medium");
  const [deadline, setDeadline] = useState("");
  const [goal, setGoal] = useState("");

  return (
    <Modal title="New project" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Project name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
        <Field label="Goal / outcome (optional)"><input className={inputCls} value={goal} onChange={e => setGoal(e.target.value)} placeholder="What are you trying to accomplish?" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Area">
            <select className={selectCls} value={areaId} onChange={e => setAreaId(e.target.value)}>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className={selectCls} value={priority} onChange={e => setPriority(e.target.value)}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Deadline"><input type="date" className={inputCls} value={deadline} onChange={e => setDeadline(e.target.value)} /></Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        <button disabled={!name.trim()} onClick={() => name.trim() && onCreate({ name: name.trim(), areaId, priority, deadline: deadline || null, goal })}
          className={btnPrimary + " disabled:opacity-40"}>Create project</button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/*  Sidebar                                                                 */
/* ---------------------------------------------------------------------- */

function Sidebar({ view, setView, areas, collapsed, setCollapsed, onOpenArea, selectedAreaId }) {
  const nav = [
    { id: "today", label: "Today", icon: Home },
    { id: "inbox", label: "Inbox", icon: InboxIcon },
    { id: "projects", label: "Projects", icon: FolderKanban },
    { id: "calendar", label: "Calendar", icon: CalendarDays },
    { id: "board", label: "Board", icon: KanbanIcon },
  ];
  return (
    <div className={classNames("shrink-0 h-full flex flex-col transition-all", collapsed ? "w-14" : "w-56")} style={{ background: "var(--side-bg)" }}>
      <div className="flex items-center justify-between px-3.5 py-4">
        {!collapsed && <div className="font-display text-lg text-[var(--side-text)]">PPOS</div>}
        <button onClick={() => setCollapsed(!collapsed)} className="text-[var(--side-dim)] hover:text-[var(--side-text)] p-1"><Menu size={16} /></button>
      </div>

      <nav className="px-2 space-y-0.5">
        {nav.map(n => (
          <button key={n.id} onClick={() => setView(n.id)}
            className={classNames("w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-sm font-ui transition-colors",
              view === n.id ? "bg-[var(--side-line)] text-[var(--accent)]" : "text-[var(--side-text)] hover:bg-[var(--side-line)]")}>
            <n.icon size={16} className="shrink-0" />
            {!collapsed && n.label}
          </button>
        ))}
      </nav>

      {!collapsed && (
        <>
          <div className="px-4 mt-6 mb-1.5 text-[10px] font-ui uppercase tracking-wide text-[var(--side-dim)]">Areas</div>
          <nav className="px-2 space-y-0.5 flex-1 overflow-auto ppos-scroll">
            {areas.filter(a => a.status !== "Archived").map(a => (
              <button key={a.id} onClick={() => onOpenArea(a)}
                className={classNames("w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded text-sm font-ui",
                  view === "area-detail" && selectedAreaId === a.id ? "bg-[var(--side-line)] text-[var(--accent)]" : "text-[var(--side-text)] hover:bg-[var(--side-line)]")}>
                <span className="text-sm">{a.icon}</span>{a.name}
              </button>
            ))}
          </nav>
        </>
      )}

      <div className="px-2 pb-3 pt-2 border-t border-[var(--side-line)] space-y-0.5">
        <button onClick={() => setView("areas")} className={classNames("w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-sm font-ui", (view === "areas" || view === "area-detail") ? "bg-[var(--side-line)] text-[var(--accent)]" : "text-[var(--side-text)] hover:bg-[var(--side-line)]")}>
          <FolderKanban size={16} />{!collapsed && "Areas"}
        </button>
        <button onClick={() => setView("review")} className={classNames("w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-sm font-ui", view === "review" ? "bg-[var(--side-line)] text-[var(--accent)]" : "text-[var(--side-text)] hover:bg-[var(--side-line)]")}>
          <RefreshCw size={16} />{!collapsed && "Weekly review"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Top bar with search                                                     */
/* ---------------------------------------------------------------------- */

function TopBar({ data, onQuickAdd, onWorkNow, onOpenProject, onOpenTask, theme, onToggleTheme, userEmail, onSignOut }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    if (!q.trim()) return null;
    const lower = q.toLowerCase();
    return {
      projects: data.projects.filter(p => p.name.toLowerCase().includes(lower)).slice(0, 5),
      tasks: data.tasks.filter(t => t.name.toLowerCase().includes(lower)).slice(0, 5),
      areas: data.areas.filter(a => a.name.toLowerCase().includes(lower)).slice(0, 5),
    };
  }, [q, data]);

  return (
    <div className="h-14 shrink-0 flex items-center gap-3 px-6 border-b border-[var(--line)] bg-[var(--paper)] relative">
      <div className="relative flex-1 max-w-sm">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search projects, tasks, areas..."
          className="w-full pl-8 pr-2.5 py-1.5 rounded border border-[var(--line)] bg-[var(--panel-2)] text-sm font-ui ppos-focus" />
        {results && (results.projects.length + results.tasks.length + results.areas.length > 0) && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-[var(--panel-2)] border border-[var(--line)] rounded-lg shadow-lg z-40 max-h-80 overflow-auto ppos-scroll">
            {results.projects.length > 0 && (
              <div className="p-2">
                <div className="text-[10px] font-ui uppercase text-[var(--ink-faint)] px-1.5 mb-1">Projects</div>
                {results.projects.map(p => (
                  <button key={p.id} onClick={() => { onOpenProject(p); setQ(""); }} className="w-full text-left px-1.5 py-1.5 rounded hover:bg-[var(--line-soft)] text-sm font-ui">{p.name}</button>
                ))}
              </div>
            )}
            {results.tasks.length > 0 && (
              <div className="p-2 border-t border-[var(--line-soft)]">
                <div className="text-[10px] font-ui uppercase text-[var(--ink-faint)] px-1.5 mb-1">Tasks</div>
                {results.tasks.map(t => (
                  <button key={t.id} onClick={() => { onOpenTask(t); setQ(""); }} className="w-full text-left px-1.5 py-1.5 rounded hover:bg-[var(--line-soft)] text-sm font-ui">{t.name}</button>
                ))}
              </div>
            )}
            {results.areas.length > 0 && (
              <div className="p-2 border-t border-[var(--line-soft)]">
                <div className="text-[10px] font-ui uppercase text-[var(--ink-faint)] px-1.5 mb-1">Areas</div>
                {results.areas.map(a => <div key={a.id} className="px-1.5 py-1.5 text-sm font-ui text-[var(--ink-soft)]">{a.icon} {a.name}</div>)}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex-1" />
      <button onClick={onToggleTheme} title={theme === "dark" ? "Switch to light" : "Switch to dark"}
        className="p-2 rounded border border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--line-soft)] ppos-focus">
        {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>
      <button onClick={onWorkNow} className={btnGhost + " inline-flex items-center gap-1.5"}><Sparkles size={14} />Work now</button>
      <button onClick={onQuickAdd} className={btnPrimary + " inline-flex items-center gap-1.5"}><Plus size={15} />Quick add</button>
      {onSignOut && (
        <button onClick={onSignOut} title={userEmail ? `Sign out (${userEmail})` : "Sign out"}
          className="p-2 rounded border border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--line-soft)] ppos-focus">
          <LogOut size={15} />
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Root App                                                                */
/* ---------------------------------------------------------------------- */

export default function App({ onSignOut, userEmail } = {}) {
  const { data, loaded, persist } = useStorage();
  const [view, setView] = useState("today");
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedAreaId, setSelectedAreaId] = useState(null);
  const [editingTask, setEditingTask] = useState(null); // task object or {} for new, or null
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showWorkNow, setShowWorkNow] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectDefaultAreaId, setNewProjectDefaultAreaId] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      const saved = window.localStorage.getItem("ppos-theme");
      if (saved === "light" || saved === "dark") return saved;
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (e) { return "light"; }
  });

  useEffect(() => {
    try { window.localStorage.setItem("ppos-theme", theme); } catch (e) {}
  }, [theme]);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap";
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  useEffect(() => {
    function handler(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setShowQuickAdd(true); }
      if (e.key.toLowerCase() === "n" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") { setShowQuickAdd(true); }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!loaded || !data) {
    return (
      <div className="w-full h-full flex items-center justify-center" data-theme={theme} style={{ background: "var(--paper)" }}>
        <style>{TOKENS}</style>
        <div className="font-mono text-sm text-[var(--ink-faint)]">Loading…</div>
      </div>
    );
  }

  function update(fields) { persist({ ...data, ...fields }); }

  // Task actions
  function saveTask(t) {
    if (t.id) {
      update({ tasks: data.tasks.map(x => x.id === t.id ? t : x) });
    } else {
      const created = { ...t, id: uid("task") };
      let projects = data.projects;
      if (created.projectId) projects = addProjectActivity(created.projectId, `Added task: ${created.name}`, projects);
      update({ tasks: [...data.tasks, created], projects });
    }
    setEditingTask(null);
  }
  function deleteTask(id) {
    update({ tasks: data.tasks.filter(t => t.id !== id) });
    setEditingTask(null);
  }
  function toggleDone(task) {
    const nowDone = task.status !== "Done";
    const updated = { ...task, status: nowDone ? "Done" : "Next" };
    let projects = data.projects;
    if (nowDone && task.projectId) projects = addProjectActivity(task.projectId, `Completed: ${task.name}`, projects);
    update({ tasks: data.tasks.map(t => t.id === task.id ? updated : t), projects });
  }
  function addProjectActivity(projectId, text, base) {
    return base.map(p => p.id === projectId ? { ...p, activity: [{ id: uid("act"), date: todayISO(), text }, ...(p.activity || [])].slice(0, 20) } : p);
  }

  function createTaskFromQuickAdd(fields) {
    const created = { ...fields, id: uid("task") };
    let projects = data.projects;
    if (created.projectId) projects = addProjectActivity(created.projectId, `Added task: ${created.name}`, projects);
    update({ tasks: [...data.tasks, created], projects });
  }

  function addTaskToProject(projectId, name) {
    const created = { id: uid("task"), name, projectId, status: "Next", priority: "Medium", dueDate: null, scheduledDate: null, scheduledTime: null, location: null, duration: null, notes: "", tags: [] };
    const projects = addProjectActivity(projectId, `Added task: ${name}`, data.projects);
    update({ tasks: [...data.tasks, created], projects });
  }

  // Project actions
  function updateProject(p) { update({ projects: data.projects.map(x => x.id === p.id ? p : x) }); }
  function deleteProject(id) {
    update({ projects: data.projects.filter(p => p.id !== id), tasks: data.tasks.map(t => t.projectId === id ? { ...t, projectId: null } : t) });
    setView("projects"); setSelectedProjectId(null);
  }
  function createProject(fields) {
    const created = { id: uid("proj"), ...fields, status: "Planned", description: "", startDate: todayISO(), tags: [], deliverables: [], notes: "", links: [], activity: [{ id: uid("act"), date: todayISO(), text: "Project created" }] };
    update({ projects: [...data.projects, created] });
    setShowNewProject(false);
    setNewProjectDefaultAreaId(null);
    setSelectedProjectId(created.id); setSelectedAreaId(null); setView("project-detail");
  }

  // Area actions
  function addArea(name) {
    update({ areas: [...data.areas, { id: uid("area"), name, icon: "📁", description: "", status: "Active" }] });
  }
  function archiveArea(id) {
    update({ areas: data.areas.map(a => a.id === id ? { ...a, status: a.status === "Archived" ? "Active" : "Archived" } : a) });
  }
  function deleteArea(id, projectCount) {
    const msg = projectCount > 0
      ? `Delete this area? ${projectCount} project${projectCount > 1 ? "s" : ""} in it will become unassigned (not deleted).`
      : "Delete this area?";
    if (!window.confirm(msg)) return;
    update({
      areas: data.areas.filter(a => a.id !== id),
      projects: data.projects.map(p => p.areaId === id ? { ...p, areaId: null } : p),
    });
    if (selectedAreaId === id) { setSelectedAreaId(null); setView("areas"); }
  }
  function updateArea(a) { update({ areas: data.areas.map(x => x.id === a.id ? a : x) }); }
  function openArea(a) { setSelectedAreaId(a.id); setView("area-detail"); }
  function openNewProjectInArea(areaId) { setNewProjectDefaultAreaId(areaId); setShowNewProject(true); }

  // Inbox actions
  function addInboxItem(text) { update({ inbox: [{ id: uid("inb"), text, createdAt: todayISO() }, ...data.inbox] }); }
  function deleteInboxItem(id) { update({ inbox: data.inbox.filter(i => i.id !== id) }); }
  function processToTask(item) {
    setEditingTask({ name: item.text, projectId: null, status: "Inbox", priority: "Medium", dueDate: null, scheduledDate: null, scheduledTime: null, location: null, duration: null, notes: "", tags: [] });
    deleteInboxItem(item.id);
  }
  function processToProject(item) {
    setShowNewProject(true);
    deleteInboxItem(item.id);
  }

  function openProject(p) { setSelectedProjectId(p.id); setSelectedAreaId(null); setView("project-detail"); }
  const selectedProject = data.projects.find(p => p.id === selectedProjectId);
  const selectedArea = data.areas.find(a => a.id === selectedAreaId);

  return (
    <div className="w-full h-full flex" data-theme={theme} style={{ background: "var(--paper)" }}>
      <style>{TOKENS}</style>
      <Sidebar view={view} setView={(v) => { setView(v); setSelectedProjectId(null); setSelectedAreaId(null); }}
        areas={data.areas} collapsed={collapsed} setCollapsed={setCollapsed} onOpenArea={openArea} selectedAreaId={selectedAreaId} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar data={data} onQuickAdd={() => setShowQuickAdd(true)} onWorkNow={() => setShowWorkNow(true)}
          onOpenProject={openProject} onOpenTask={setEditingTask}
          theme={theme} onToggleTheme={() => setTheme(t => t === "dark" ? "light" : "dark")}
          userEmail={userEmail} onSignOut={onSignOut} />

        <div className="flex-1 overflow-auto ppos-scroll">
          {view === "today" && (
            <Dashboard data={data} openProject={openProject} openTask={setEditingTask}
              actions={{
                openQuickAdd: () => setShowQuickAdd(true), openWorkNow: () => setShowWorkNow(true),
                openNewProject: () => { setNewProjectDefaultAreaId(null); setShowNewProject(true); }, setView, toggleDone,
              }} />
          )}
          {view === "inbox" && (
            <InboxPage data={data} actions={{ addInboxItem, deleteInboxItem, processToTask, processToProject }} />
          )}
          {view === "projects" && (
            <ProjectsPage data={data} openProject={openProject} actions={{ openNewProject: () => { setNewProjectDefaultAreaId(null); setShowNewProject(true); } }} />
          )}
          {view === "project-detail" && selectedProject && (
            <ProjectDetail project={selectedProject} areas={data.areas} tasks={data.tasks}
              onBack={() => setView("projects")} onUpdate={updateProject} onDelete={deleteProject}
              onAddTask={addTaskToProject} onOpenTask={setEditingTask} onToggleDone={toggleDone} />
          )}
          {view === "areas" && (
            <AreasPage data={data} actions={{ addArea, archiveArea, deleteArea }} openArea={openArea} />
          )}
          {view === "area-detail" && selectedArea && (
            <AreaDetail area={selectedArea} projects={data.projects} tasks={data.tasks}
              onBack={() => { setView("areas"); setSelectedAreaId(null); }} onUpdate={updateArea}
              onOpenProject={openProject} onNewProjectInArea={openNewProjectInArea} />
          )}
          {view === "board" && (
            <BoardPage data={data} onOpenTask={setEditingTask} actions={{ updateTask: saveTask }} />
          )}
          {view === "calendar" && <CalendarPage data={data} onOpenTask={setEditingTask} onToggleDone={toggleDone} />}
          {view === "review" && <WeeklyReview data={data} actions={{}} />}
        </div>
      </div>

      {showQuickAdd && (
        <QuickAddModal projects={data.projects} onClose={() => setShowQuickAdd(false)}
          onCreateTask={createTaskFromQuickAdd} onCreateInbox={addInboxItem} />
      )}
      {showWorkNow && (
        <WorkNowModal tasks={data.tasks} projects={data.projects} onClose={() => setShowWorkNow(false)} onGoToTask={setEditingTask} />
      )}
      {showNewProject && (
        <NewProjectModal areas={data.areas} defaultAreaId={newProjectDefaultAreaId}
          onClose={() => { setShowNewProject(false); setNewProjectDefaultAreaId(null); }} onCreate={createProject} />
      )}
      {editingTask && (
        <TaskEditor task={editingTask} projects={data.projects} onClose={() => setEditingTask(null)} onSave={saveTask} onDelete={deleteTask} />
      )}
    </div>
  );
}
