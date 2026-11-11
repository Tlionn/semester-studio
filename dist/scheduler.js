/** Browser-local, deterministic constraint scheduler. All durations are clock hours. */
const DEFAULTS = {
  days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  start: '09:00', end: '16:30', slotMinutes: 60,
  breaks: [{ name: 'Short break', start: '11:00', end: '11:15' }, { name: 'Lunch', start: '13:15', end: '14:00' }],
  maxTeacherHoursPerDay: 5, maxTeacherHoursPerWeek: 24, maxClassHoursPerDay: 6, teacherRules: [],
};
const EPS = 0.00001;
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const wholeMinutes = hours => Math.abs(hours * 60 - Math.round(hours * 60)) < EPS;
const norm = value => String(value ?? '').trim().toLowerCase();
const time = value => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value));
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : NaN;
};
const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.round(value % 60)).padStart(2, '0')}`;
const overlap = (a, b) => a.start < b.end && b.start < a.end;
const cohort = a => [a.department, a.semester, a.section || 'A'].map(norm).join('::');
const sum = values => values.reduce((a, b) => a + b, 0);
const numeric = (value, fallback) => value === undefined || value === null || value === '' ? fallback : Number(value);
const rounded = value => Math.round(value * 100) / 100;

function prepare(assignments, supplied = {}) {
  const config = { ...DEFAULTS, ...supplied };
  const errors = [];
  const start = time(config.start), end = time(config.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) errors.push('Set a valid college day with the start time before the end time.');
  if (!Array.isArray(config.days) || !config.days.length || config.days.length > 7 || new Set(config.days.map(norm)).size !== config.days.length || config.days.some(day => !DAY_NAMES.includes(day))) errors.push('Choose between one and seven distinct teaching days, using full day names such as Monday.');
  if (!Number.isFinite(+config.slotMinutes) || +config.slotMinutes < 15 || +config.slotMinutes > 180) errors.push('Teaching slot length must be between 15 and 180 minutes.');
  for (const field of ['maxTeacherHoursPerDay', 'maxTeacherHoursPerWeek', 'maxClassHoursPerDay']) {
    if (!Number.isFinite(+config[field]) || +config[field] <= 0) errors.push(`${field} must be a positive number.`);
  }
  const breaks = (Array.isArray(config.breaks) ? config.breaks : []).map(b => ({ name: b.name || 'Break', start: time(b.start), end: time(b.end) })).sort((a, b) => a.start - b.start);
  breaks.forEach((b, i) => {
    if (!Number.isFinite(b.start) || !Number.isFinite(b.end) || b.start >= b.end || b.start < start || b.end > end) errors.push(`The ${b.name} must fit entirely within the college day.`);
    if (i && overlap(breaks[i - 1], b)) errors.push('Break times overlap. Adjust the break windows.');
  });
  const windows = [], slots = [];
  let cursor = start;
  if (!errors.length) {
    for (const b of [...breaks, { start: end, end }]) {
      if (b.start > cursor) windows.push({ start: cursor, end: b.start });
      for (let s = cursor; s < b.start; s += +config.slotMinutes) slots.push({ start: clock(s), end: clock(Math.min(s + +config.slotMinutes, b.start)), type: 'teaching' });
      if (b.end > b.start) slots.push({ start: clock(b.start), end: clock(b.end), type: 'break', name: b.name });
      cursor = b.end;
    }
  }
  if (!Array.isArray(assignments) || !assignments.length) errors.push('Upload at least one teaching assignment to generate a timetable.');
  const ids = new Set();
  const rows = (Array.isArray(assignments) ? assignments : []).map((a, index) => {
    const row = { ...a, id: String(a.id ?? `assignment-${index + 1}`), section: a.section || 'A', type: a.type || 'lecture', hours: Number(a.hours), room: a.room || '', blockHours: numeric(a.blockHours, a.type === 'lab' ? 2 : +config.slotMinutes / 60) };
    if (ids.has(row.id)) errors.push(`Assignment ID ${row.id} appears more than once.`);
    ids.add(row.id);
    if (!norm(row.teacher) || !norm(row.subject) || !norm(row.department) || !norm(row.semester)) errors.push(`Assignment ${index + 1} needs a teacher, subject, department, and semester.`);
    if (!['lecture', 'lab'].includes(row.type)) errors.push(`${row.subject || `Assignment ${index + 1}`}: session type must be lecture or lab.`);
    if (!Number.isFinite(row.hours) || row.hours <= 0 || row.hours > 168) errors.push(`${row.subject || `Assignment ${index + 1}`}: weekly hours must be positive and no more than 168.`);
    if (!Number.isFinite(row.blockHours) || row.blockHours <= 0 || row.blockHours > 12 || !wholeMinutes(row.blockHours)) errors.push(`${row.subject || `Assignment ${index + 1}`}: session length must be a positive whole number of minutes, up to 12 hours.`);
    if (row.type === 'lab' && Math.abs(row.hours / row.blockHours - Math.round(row.hours / row.blockHours)) > EPS) errors.push(`${row.subject}: weekly lab hours (${row.hours}) must be a multiple of its ${row.blockHours}-hour continuous block.`);
    if (Number.isFinite(row.hours) && !wholeMinutes(row.hours)) errors.push(`${row.subject}: weekly hours must resolve to whole minutes.`);
    row.teacherKey = norm(row.teacher); row.cohortKey = cohort(row); row.roomKey = norm(row.room);
    return row;
  });
  const rules = new Map();
  for (const r of Array.isArray(config.teacherRules) ? config.teacherRules : []) {
    if (!norm(r.teacher)) { errors.push('Every teacher rule must name a teacher.'); continue; }
    const key = norm(r.teacher), prior = rules.get(key);
    const daily = numeric(r.maxHoursPerDay, prior?.daily ?? +config.maxTeacherHoursPerDay);
    const weekly = numeric(r.maxHoursPerWeek, prior?.weekly ?? +config.maxTeacherHoursPerWeek);
    const availableStart = r.availableStart ? time(r.availableStart) : start;
    const availableEnd = r.availableEnd ? time(r.availableEnd) : end;
    if (!Number.isFinite(daily) || daily <= 0 || !Number.isFinite(weekly) || weekly <= 0) errors.push(`${r.teacher}: teaching limits must be positive numbers.`);
    if (!Number.isFinite(availableStart) || !Number.isFinite(availableEnd) || availableStart >= availableEnd) errors.push(`${r.teacher}: availability times are invalid.`);
    const unavail = (r.unavailable || []).map(u => ({ day: norm(u.day), start: time(u.start), end: time(u.end) }));
    for (const u of unavail) if (!Number.isFinite(u.start) || !Number.isFinite(u.end) || u.start >= u.end || !DAY_NAMES.some(d => norm(d) === u.day)) errors.push(`${r.teacher}: an unavailable time window has an invalid day or time.`);
    rules.set(key, {
      daily: prior ? Math.min(prior.daily, daily) : daily,
      weekly: prior ? Math.min(prior.weekly, weekly) : weekly,
      start: Math.max(prior?.start ?? start, availableStart), end: Math.min(prior?.end ?? end, availableEnd),
      unavailableDays: new Set([...(prior?.unavailableDays || []), ...(r.unavailableDays || []).map(norm)]),
      unavailable: [...(prior?.unavailable || []), ...unavail],
    });
  }
  const ruleFor = teacher => rules.get(teacher) || { daily: +config.maxTeacherHoursPerDay, weekly: +config.maxTeacherHoursPerWeek, start, end, unavailableDays: new Set(), unavailable: [] };
  return { config, rows, errors: [...new Set(errors)], start, end, breaks, windows, slots, ruleFor };
}

function candidatesFor(row, duration, p) {
  const r = p.ruleFor(row.teacherKey), result = [];
  if (duration > r.daily * 60 + EPS || duration > +p.config.maxClassHoursPerDay * 60 + EPS) return result;
  for (const day of p.config.days) {
    if (r.unavailableDays.has(norm(day))) continue;
    for (const w of p.windows) {
      for (let start = w.start; start + duration <= w.end + EPS; start += +p.config.slotMinutes) {
        const candidate = { day, start, end: start + duration };
        if (start < r.start || candidate.end > r.end || r.unavailable.some(u => u.day === norm(day) && overlap(candidate, u))) continue;
        result.push(candidate);
      }
    }
  }
  return result;
}

function preflight(p) {
  const errors = [...p.errors];
  if (errors.length) return { errors, tasks: [] };
  const teacherTotals = new Map(), classTotals = new Map(), tasks = [];
  for (const row of p.rows) {
    teacherTotals.set(row.teacherKey, (teacherTotals.get(row.teacherKey) || 0) + row.hours);
    classTotals.set(row.cohortKey, (classTotals.get(row.cohortKey) || 0) + row.hours);
    let remaining = Math.round(row.hours * 60), index = 0;
    while (remaining > 0) {
      const duration = Math.min(remaining, Math.round(row.blockHours * 60));
      const domains = candidatesFor(row, duration, p);
      if (!domains.length) errors.push(`${row.subject} (${row.teacher}) has no available ${rounded(duration / 60)}-hour continuous slot. Check breaks, lab length, and teacher availability.`);
      tasks.push({ row, duration, domains, taskId: `${row.id}-${++index}` });
      remaining -= duration;
    }
  }
  const dailyMinutes = sum(p.windows.map(w => w.end - w.start));
  for (const [teacher, hours] of teacherTotals) {
    const row = p.rows.find(a => a.teacherKey === teacher), rule = p.ruleFor(teacher);
    const availableDays = p.config.days.filter(d => !rule.unavailableDays.has(norm(d))).length;
    if (hours > rule.weekly + EPS) errors.push(`${row.teacher} is assigned ${rounded(hours)} hours, above the ${rule.weekly}-hour weekly limit.`);
    const availableHours = sum(p.config.days.map(day => {
      if (rule.unavailableDays.has(norm(day))) return 0;
      let available = 0;
      for (const w of p.windows) {
        const s = Math.max(w.start, rule.start), e = Math.min(w.end, rule.end);
        if (e <= s) continue;
        const blocked = rule.unavailable.filter(u => u.day === norm(day) && u.start < e && u.end > s).map(u => ({ start: Math.max(s, u.start), end: Math.min(e, u.end) })).sort((a, b) => a.start - b.start);
        let boundary = s, free = 0;
        for (const b of blocked) { free += Math.max(0, b.start - boundary); boundary = Math.max(boundary, b.end); }
        available += free + Math.max(0, e - boundary);
      }
      return Math.min(rule.daily, available / 60);
    }));
    if (hours > availableDays * rule.daily + EPS || hours > availableHours + EPS) errors.push(`${row.teacher} needs ${rounded(hours)} hours but has capacity for only ${rounded(availableHours)} hours under the current daily limits and availability.`);
  }
  for (const [key, hours] of classTotals) {
    const row = p.rows.find(a => a.cohortKey === key), capacity = p.config.days.length * Math.min(+p.config.maxClassHoursPerDay, dailyMinutes / 60);
    if (hours > capacity + EPS) errors.push(`${row.department}, semester ${row.semester}, section ${row.section} needs ${rounded(hours)} hours but the week has capacity for ${rounded(capacity)} hours.`);
  }
  for (const task of tasks) task.priority = task.domains.length / Math.max(1, teacherTotals.get(task.row.teacherKey)) / (task.duration / 60);
  return { errors: [...new Set(errors)], tasks };
}

function random(seed) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function hash(value) { let h = 2166136261; for (const c of value) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function solve(tasks, p, strategy, seed, backtracking = false) {
  const rng = random(seed), occupied = new Map(), loads = new Map(), result = [];
  const keys = (task, day) => [`t|${task.row.teacherKey}|${day}`, `c|${task.row.cohortKey}|${day}`, ...(task.row.roomKey ? [`r|${task.row.roomKey}|${day}`] : [])];
  const canPlace = (task, pos) => {
    const ks = keys(task, pos.day);
    if ((loads.get(ks[0]) || 0) + task.duration > p.ruleFor(task.row.teacherKey).daily * 60 + EPS || (loads.get(ks[1]) || 0) + task.duration > +p.config.maxClassHoursPerDay * 60 + EPS) return false;
    return ks.every(k => !(occupied.get(k) || []).some(event => overlap(event, pos)));
  };
  const place = (task, pos) => {
    const event = { ...pos, task };
    for (const k of keys(task, pos.day)) { if (!occupied.has(k)) occupied.set(k, []); occupied.get(k).push(event); loads.set(k, (loads.get(k) || 0) + task.duration); }
    result.push(event);
  };
  const remove = () => {
    const event = result.pop();
    for (const k of keys(event.task, event.day)) { occupied.get(k).pop(); loads.set(k, loads.get(k) - event.task.duration); }
  };
  const cost = (task, pos) => {
    const ks = keys(task, pos.day), classEvents = occupied.get(ks[1]) || [];
    const classLoad = (loads.get(ks[1]) || 0) / 60, teacherLoad = (loads.get(ks[0]) || 0) / 60;
    const repeats = classEvents.filter(e => e.task.row.id === task.row.id).length;
    let gap = 0;
    if (classEvents.length) {
      const nearest = Math.min(...classEvents.map(e => Math.min(Math.abs(e.end - pos.start), Math.abs(pos.end - e.start))));
      gap = nearest / 60;
    }
    const morning = (pos.start - p.start) / 60;
    if (strategy === 1) return classLoad * 0.8 + teacherLoad * 0.8 + repeats * 10 + morning * 3 + gap * 1.8 + rng() * 3;
    if (strategy === 2) return classLoad * 4 + teacherLoad * 2 + repeats * 14 + gap * 0.25 + rng() * 6;
    return classLoad * 3 + teacherLoad * 1.5 + repeats * 12 + gap * 2 + morning * 0.3 + rng() * 4;
  };
  const ordered = tasks.map(t => ({ ...t, jitter: rng() })).sort((a, b) => a.priority - b.priority || b.duration - a.duration || a.jitter - b.jitter);
  let nodes = 0;
  const visit = index => {
    if (index === ordered.length) return true;
    if (++nodes > (backtracking ? 5000 : ordered.length + 1)) return false;
    const task = ordered[index];
    const choices = task.domains.filter(pos => canPlace(task, pos)).map(pos => ({ ...pos, cost: cost(task, pos) })).sort((a, b) => a.cost - b.cost);
    for (const pos of choices) {
      place(task, pos);
      if (visit(index + 1)) return true;
      remove();
      if (!backtracking || nodes > 5000) break;
    }
    return false;
  };
  if (!visit(0)) return null;
  return result.map(event => ({
    id: event.task.taskId, assignmentId: event.task.row.id, department: event.task.row.department,
    semester: event.task.row.semester, section: event.task.row.section, teacher: event.task.row.teacher,
    subject: event.task.row.subject, code: event.task.row.code || '', type: event.task.row.type, room: event.task.row.room,
    day: event.day, start: clock(event.start), end: clock(event.end), duration: rounded(event.task.duration / 60),
  })).sort((a, b) => p.config.days.indexOf(a.day) - p.config.days.indexOf(b.day) || time(a.start) - time(b.start) || a.id.localeCompare(b.id));
}

function metricsFor(events, p) {
  const groups = new Map();
  for (const event of events) { const key = `${cohort(event)}|${event.day}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(event); }
  let gapMinutes = 0, spread = 0;
  for (const group of groups.values()) {
    const first = Math.min(...group.map(e => time(e.start))), last = Math.max(...group.map(e => time(e.end)));
    const breaks = sum(p.breaks.map(b => Math.max(0, Math.min(last, b.end) - Math.max(first, b.start))));
    gapMinutes += Math.max(0, last - first - breaks - sum(group.map(e => time(e.end) - time(e.start))));
  }
  for (const key of new Set(p.rows.map(cohort))) {
    const loads = p.config.days.map(day => sum((groups.get(`${key}|${day}`) || []).map(e => (time(e.end) - time(e.start)) / 60)));
    const average = sum(loads) / loads.length;
    spread += sum(loads.map(h => (h - average) ** 2));
  }
  const requiredHours = rounded(sum(p.rows.map(a => a.hours))), scheduledHours = rounded(sum(events.map(e => (time(e.end) - time(e.start)) / 60)));
  const quality = Math.max(1, Math.min(100, Math.round(100 - (gapMinutes / 60) / Math.max(1, groups.size) * 5 - spread / Math.max(1, new Set(p.rows.map(cohort)).size) * 1.5)));
  return { scheduledHours, requiredHours, gaps: rounded(gapMinutes / 60), teacherConflicts: 0, balance: rounded(spread), score: quality };
}

/** Independently checks a complete schedule, including resource collisions and exact demand. */
export function validateTimetable(candidate, assignments, config = {}) {
  const p = prepare(assignments, config), errors = [...p.errors];
  const events = Array.isArray(candidate) ? candidate : candidate?.events;
  if (!Array.isArray(events)) return { valid: false, errors: [...errors, 'A timetable must contain an events array.'], metrics: null };
  if (errors.length) return { valid: false, errors, metrics: null };
  const rows = new Map(p.rows.map(a => [a.id, a])), totals = new Map(), resources = new Map(), daily = new Map(), weekly = new Map();
  let teacherConflicts = 0;
  for (const event of events) {
    const row = rows.get(String(event.assignmentId));
    if (!row) { errors.push(`Unknown assignment ${event.assignmentId}.`); continue; }
    const start = time(event.start), end = time(event.end), duration = (end - start) / 60;
    const rule = p.ruleFor(row.teacherKey);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < p.start || end > p.end) { errors.push(`${row.subject}: an event has invalid start or end times.`); continue; }
    if (!p.config.days.includes(event.day)) errors.push(`${row.subject}: ${event.day} is not a teaching day.`);
    if (p.breaks.some(b => overlap({ start, end }, b))) errors.push(`${row.subject} overlaps a break.`);
    if (!p.windows.some(w => start >= w.start && end <= w.end && (start - w.start) % +p.config.slotMinutes === 0)) errors.push(`${row.subject} does not start on a configured teaching slot.`);
    if (row.type === 'lab' && Math.abs(duration - row.blockHours) > EPS) errors.push(`${row.subject}: each lab must be a continuous ${row.blockHours}-hour block.`);
    if (row.type === 'lecture' && duration > row.blockHours + EPS) errors.push(`${row.subject}: a lecture exceeds its configured session length.`);
    for (const field of ['department', 'semester', 'section', 'teacher', 'subject', 'type', 'room']) if (norm(event[field] ?? (field === 'section' ? 'A' : '')) !== norm(row[field])) errors.push(`${row.subject}: event ${field} does not match its assignment.`);
    if (Math.abs(Number(event.duration) - duration) > 0.011 || !Number.isFinite(Number(event.duration))) errors.push(`${row.subject}: stored duration does not match its time window.`);
    if (rule.unavailableDays.has(norm(event.day)) || start < rule.start || end > rule.end || rule.unavailable.some(u => u.day === norm(event.day) && overlap({ start, end }, u))) errors.push(`${row.teacher} is unavailable for ${row.subject} on ${event.day} at ${event.start}.`);
    totals.set(row.id, (totals.get(row.id) || 0) + duration);
    const tKey = `t|${row.teacherKey}|${event.day}`, cKey = `c|${row.cohortKey}|${event.day}`;
    daily.set(tKey, (daily.get(tKey) || 0) + duration); daily.set(cKey, (daily.get(cKey) || 0) + duration);
    weekly.set(row.teacherKey, (weekly.get(row.teacherKey) || 0) + duration);
    for (const key of [tKey, cKey, ...(row.roomKey ? [`r|${row.roomKey}|${event.day}`] : [])]) {
      const previous = resources.get(key) || [];
      for (const prior of previous) if (overlap({ start, end }, prior)) {
        if (key.startsWith('t|')) teacherConflicts++;
        errors.push(`${key.startsWith('t|') ? row.teacher : key.startsWith('r|') ? row.room : `${row.department} semester ${row.semester} section ${row.section}`} is double-booked on ${event.day} at ${event.start}.`);
      }
      previous.push({ start, end }); resources.set(key, previous);
    }
  }
  for (const row of p.rows) {
    if (Math.abs((totals.get(row.id) || 0) - row.hours) > EPS) errors.push(`${row.subject}: scheduled ${rounded(totals.get(row.id) || 0)} of ${row.hours} required hours.`);
    const rule = p.ruleFor(row.teacherKey);
    if ((weekly.get(row.teacherKey) || 0) > rule.weekly + EPS) errors.push(`${row.teacher} exceeds the weekly teaching limit.`);
    for (const day of p.config.days) {
      if ((daily.get(`t|${row.teacherKey}|${day}`) || 0) > rule.daily + EPS) errors.push(`${row.teacher} exceeds the daily teaching limit on ${day}.`);
      if ((daily.get(`c|${row.cohortKey}|${day}`) || 0) > +p.config.maxClassHoursPerDay + EPS) errors.push(`${row.department} semester ${row.semester} section ${row.section} exceeds the daily class limit on ${day}.`);
    }
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)], metrics: { ...metricsFor(events, p), teacherConflicts } };
}

/** Returns distinct, fully validated alternatives, or actionable diagnostics. */
export function generateTimetables(assignments, config = {}, count = 3) {
  const p = prepare(assignments, config), { errors, tasks } = preflight(p);
  if (errors.length) return { options: [], diagnostics: errors, slots: p.slots };
  const target = Math.max(1, Math.min(6, Math.floor(Number(count) || 3)));
  const options = [], signatures = new Set(), seed = hash(JSON.stringify([assignments, config]));
  const labels = ['Balanced week', 'Early finish', 'Spread out'];
  for (let round = 0; round < target; round++) {
    const strategy = round % 3;
    let best = null, bestRank = Infinity;
    for (let attempt = 0; attempt < 12; attempt++) {
      const events = solve(tasks, p, strategy, seed + round * 1021 + attempt * 7919);
      if (!events) continue;
      const signature = events.map(e => `${e.assignmentId}:${e.day}:${e.start}:${e.end}`).sort().join('|');
      if (signatures.has(signature)) continue;
      const validation = validateTimetable({ events }, assignments, config);
      if (!validation.valid) continue;
      const metrics = validation.metrics;
      const morningCost = sum(events.map(e => (time(e.end) - p.start) / 60)) / Math.max(1, events.length);
      const rank = strategy === 1 ? morningCost * 4 + metrics.gaps * 0.1 : strategy === 2 ? metrics.balance * 3 + metrics.gaps * 0.05 : metrics.balance + metrics.gaps;
      if (rank < bestRank) { bestRank = rank; best = { events, metrics, signature }; }
    }
    if (!best && round === 0) {
      const events = solve(tasks, p, strategy, seed + 99991, true);
      if (events) {
        const validation = validateTimetable({ events }, assignments, config);
        if (validation.valid) best = { events, metrics: validation.metrics, signature: events.map(e => `${e.assignmentId}:${e.day}:${e.start}:${e.end}`).sort().join('|') };
      }
    }
    if (!best) continue;
    signatures.add(best.signature);
    options.push({ id: `option-${options.length + 1}`, label: labels[strategy] + (round >= 3 ? ` ${Math.floor(round / 3) + 1}` : ''), events: best.events, score: best.metrics.score, metrics: best.metrics, complete: true, unscheduled: [] });
  }
  const diagnostics = options.length ? (options.length < target ? [`Found ${options.length} distinct valid ${options.length === 1 ? 'option' : 'options'} under these constraints.`] : []) : ['No complete schedule was found within the search limit. Try widening teacher availability, shortening lab blocks, increasing daily limits, or adding teaching days. No incomplete timetable has been presented as valid.'];
  return { options, diagnostics, slots: p.slots };
}
