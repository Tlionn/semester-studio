/** Browser-local, deterministic constraint scheduler. All durations are clock hours. */
import { normalizeTeacherBlocks, activeTeacherBlocks } from './availability.js';
const DEFAULTS = {
  days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  start: '09:00', end: '16:30', slotMinutes: 60,
  breaks: [{ name: 'Short break', start: '11:00', end: '11:15' }, { name: 'Lunch', start: '13:15', end: '14:00' }],
  maxTeacherHoursPerDay: 5, maxTeacherHoursPerWeek: 24, maxClassHoursPerDay: 6, teacherRules: [], teacherBlocks: [],
};
const EPS = 0.00001;
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const wholeMinutes = hours => Math.round(hours * 60) >= 1 && Math.abs(hours * 60 - Math.round(hours * 60)) < EPS;
const norm = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
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
const isTeaching = row => row.type === 'lecture' || row.type === 'lab';

function prepare(assignments, supplied = {}) {
  const config = { ...DEFAULTS, ...supplied };
  const errors = [];
  const start = time(config.start), end = time(config.end);
  const early = { enabled: config.earlyStart?.enabled === true, time: config.earlyStart?.time || '08:30', perTeacher: Number(config.earlyStart?.perTeacher ?? 1) };
  early.minute = time(early.time);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) errors.push('Set a valid college day with the start time before the end time.');
  if (!Array.isArray(config.days) || !config.days.length || config.days.length > 7 || new Set(config.days.map(norm)).size !== config.days.length || config.days.some(day => !DAY_NAMES.includes(day))) errors.push('Choose between one and seven distinct teaching days, using full day names such as Monday.');
  if (!Number.isFinite(+config.slotMinutes) || +config.slotMinutes < 15 || +config.slotMinutes > 180) errors.push('Teaching slot length must be between 15 and 180 minutes.');
  if (early.enabled) {
    if (!Number.isFinite(early.minute) || early.minute !== start) errors.push(`Equal early starts require the college day to begin at ${early.time}. Change college hours or the early-start time.`);
    if (!Number.isInteger(early.perTeacher) || early.perTeacher < 1 || early.perTeacher > (Array.isArray(config.days) ? config.days.length : 0)) errors.push('Early starts per teacher must be a whole number from 1 to the number of working days.');
  }
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
    const row = { ...a, id: String(a.id ?? `assignment-${index + 1}`), semester: a.type === 'research' ? null : a.semester, section: a.type === 'research' ? '' : a.section || 'A', type: a.type || 'lecture', hours: Number(a.hours), room: a.room || '', blockHours: numeric(a.blockHours, a.type === 'lab' ? 2 : +config.slotMinutes / 60) };
    if (ids.has(row.id)) errors.push(`Assignment ID ${row.id} appears more than once.`);
    ids.add(row.id);
    if (!norm(row.teacher) || !norm(row.subject) || !norm(row.department) || (isTeaching(row) && !norm(row.semester))) errors.push(`Assignment ${index + 1} needs a teacher, subject, department, and a semester for teaching.`);
    if (!['lecture', 'lab', 'research'].includes(row.type)) errors.push(`${row.subject || `Assignment ${index + 1}`}: session type must be lecture, lab, or research.`);
    if (!Number.isFinite(row.hours) || row.hours <= 0 || row.hours > 168) errors.push(`${row.subject || `Assignment ${index + 1}`}: weekly hours must be positive and no more than 168.`);
    if (!Number.isFinite(row.blockHours) || row.blockHours <= 0 || row.blockHours > 12 || !wholeMinutes(row.blockHours)) errors.push(`${row.subject || `Assignment ${index + 1}`}: session length must be a positive whole number of minutes, up to 12 hours.`);
    if (row.type === 'lab' && Math.abs(row.hours / row.blockHours - Math.round(row.hours / row.blockHours)) > EPS) errors.push(`${row.subject}: weekly lab hours (${row.hours}) must be a multiple of its ${row.blockHours}-hour continuous block.`);
    if (Number.isFinite(row.hours) && !wholeMinutes(row.hours)) errors.push(`${row.subject}: weekly hours must resolve to whole minutes.`);
    row.teacherKey = norm(row.teacher); row.cohortKey = isTeaching(row) ? cohort(row) : null; row.roomKey = norm(row.room);
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
  let blocks = [];
  if (!errors.length) {
    const normalized = normalizeTeacherBlocks(config.teacherBlocks || [], { assignments: rows, config });
    errors.push(...normalized.errors);
    if (!normalized.errors.length) blocks = activeTeacherBlocks({ ...config, teacherBlocks: normalized.blocks }).map(b => ({ ...b, duration: rounded((time(b.end) - time(b.start)) / 60) }));
  }
  const teachingTeachers = new Map(rows.filter(isTeaching).map(a => [a.teacherKey, a.teacher]));
  const allTeachers = new Map([...rows.map(a => [a.teacherKey, a.teacher]), ...blocks.map(b => [norm(b.teacher), b.teacher])]);
  return { config, rows, errors: [...new Set(errors)], start, end, breaks, windows, slots, ruleFor, blocks, early, teachingTeachers, allTeachers };
}

function candidatesFor(row, duration, p) {
  const r = p.ruleFor(row.teacherKey), result = [];
  if (duration > r.daily * 60 + EPS || (isTeaching(row) && duration > +p.config.maxClassHoursPerDay * 60 + EPS)) return result;
  for (const day of p.config.days) {
    if (r.unavailableDays.has(norm(day))) continue;
    for (const w of p.windows) {
      for (let start = w.start; start + duration <= w.end + EPS; start += +p.config.slotMinutes) {
        const candidate = { day, start, end: start + duration };
        if (start < r.start || candidate.end > r.end || r.unavailable.some(u => u.day === norm(day) && overlap(candidate, u)) || p.blocks.some(b => norm(b.teacher) === row.teacherKey && b.day === day && overlap(candidate, { start: time(b.start), end: time(b.end) }))) continue;
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
  const blockTotals = new Map(), blockDaily = new Map();
  for (const block of p.blocks) {
    const teacher = norm(block.teacher), hours = (time(block.end) - time(block.start)) / 60, key = `${teacher}|${block.day}`;
    blockTotals.set(teacher, (blockTotals.get(teacher) || 0) + hours);
    blockDaily.set(key, (blockDaily.get(key) || 0) + hours);
  }
  for (const row of p.rows) {
    teacherTotals.set(row.teacherKey, (teacherTotals.get(row.teacherKey) || 0) + row.hours);
    if (isTeaching(row)) classTotals.set(row.cohortKey, (classTotals.get(row.cohortKey) || 0) + row.hours);
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
  for (const [teacher, teacherName] of p.allTeachers) {
    const hours = teacherTotals.get(teacher) || 0, fixedHours = blockTotals.get(teacher) || 0, rule = p.ruleFor(teacher);
    if (hours + fixedHours > rule.weekly + EPS) errors.push(`${teacherName} is assigned ${rounded(hours + fixedHours)} workload hours${fixedHours ? `, including ${rounded(fixedHours)} fixed hours` : ''}, above the ${rule.weekly}-hour weekly limit.`);
    for (const day of p.config.days) if ((blockDaily.get(`${teacher}|${day}`) || 0) > rule.daily + EPS) errors.push(`${teacherName}'s fixed blocks exceed the ${rule.daily}-hour daily workload limit on ${day}.`);
    const availableHours = sum(p.config.days.map(day => {
      if (rule.unavailableDays.has(norm(day))) return 0;
      let available = 0;
      for (const w of p.windows) {
        const s = Math.max(w.start, rule.start), e = Math.min(w.end, rule.end);
        if (e <= s) continue;
        const unavailable = [...rule.unavailable, ...p.blocks.filter(b => norm(b.teacher) === teacher).map(b => ({ day: norm(b.day), start: time(b.start), end: time(b.end) }))];
        const blocked = unavailable.filter(u => u.day === norm(day) && u.start < e && u.end > s).map(u => ({ start: Math.max(s, u.start), end: Math.min(e, u.end) })).sort((a, b) => a.start - b.start);
        let boundary = s, free = 0;
        for (const b of blocked) { free += Math.max(0, b.start - boundary); boundary = Math.max(boundary, b.end); }
        available += free + Math.max(0, e - boundary);
      }
      return Math.max(0, Math.min(rule.daily - (blockDaily.get(`${teacher}|${day}`) || 0), available / 60));
    }));
    if (hours > availableHours + EPS) errors.push(`${teacherName} needs ${rounded(hours)} scheduled hours but has capacity for only ${rounded(availableHours)} hours after fixed blocks, daily limits, and availability.`);
  }
  for (const [key, hours] of classTotals) {
    const row = p.rows.find(a => a.cohortKey === key), capacity = p.config.days.length * Math.min(+p.config.maxClassHoursPerDay, dailyMinutes / 60);
    if (hours > capacity + EPS) errors.push(`${row.department}, semester ${row.semester}, section ${row.section} needs ${rounded(hours)} hours but the week has capacity for ${rounded(capacity)} hours.`);
  }
  for (const task of tasks) task.priority = task.domains.length / Math.max(1, teacherTotals.get(task.row.teacherKey)) / (task.duration / 60);
  if (p.early.enabled) {
    const forcedCohorts = new Map();
    for (const [teacher, teacherName] of p.teachingTeachers) {
      const teachingTasks = tasks.filter(t => t.row.teacherKey === teacher && isTeaching(t.row));
      const earlyTasks = teachingTasks.filter(t => t.domains.some(pos => pos.start === p.early.minute && t.duration / 60 + (blockDaily.get(`${teacher}|${pos.day}`) || 0) <= p.ruleFor(teacher).daily + EPS));
      const days = new Set(earlyTasks.flatMap(t => t.domains.filter(pos => pos.start === p.early.minute && t.duration / 60 + (blockDaily.get(`${teacher}|${pos.day}`) || 0) <= p.ruleFor(teacher).daily + EPS).map(pos => pos.day)));
      if (teachingTasks.length < p.early.perTeacher || earlyTasks.length < p.early.perTeacher || days.size < p.early.perTeacher) errors.push(`${teacherName} needs exactly ${p.early.perTeacher} teaching starts at ${p.early.time}, but only ${Math.min(earlyTasks.length, days.size)} can fit. Adjust morning availability, fixed duties, or the equal-start target.`);
      const cohorts = new Set(earlyTasks.map(t => t.row.cohortKey));
      if (cohorts.size === 1) {
        const key = [...cohorts][0];
        forcedCohorts.set(key, (forcedCohorts.get(key) || 0) + p.early.perTeacher);
      }
    }
    for (const [key, starts] of forcedCohorts) if (starts > p.config.days.length) {
      const row = p.rows.find(a => a.cohortKey === key);
      errors.push(`${row.department}, semester ${row.semester}, section ${row.section} needs ${starts} teacher starts at ${p.early.time}, but has only ${p.config.days.length} morning slots. Reduce the equal-start target or add teaching days.`);
    }
  }
  return { errors: [...new Set(errors)], tasks };
}

function random(seed) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function hash(value) { let h = 2166136261; for (const c of value) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function solve(tasks, p, strategy, seed, backtracking = false) {
  const rng = random(seed), occupied = new Map(), loads = new Map(), result = [], used = new Set(), earlyCounts = new Map();
  const keys = (task, day) => [`t|${task.row.teacherKey}|${day}`, ...(isTeaching(task.row) ? [`c|${task.row.cohortKey}|${day}`] : []), ...(task.row.roomKey ? [`r|${task.row.roomKey}|${day}`] : [])];
  for (const block of p.blocks) {
    const key = `t|${norm(block.teacher)}|${block.day}`, start = time(block.start), end = time(block.end);
    if (!occupied.has(key)) occupied.set(key, []);
    occupied.get(key).push({ start, end, fixed: true });
    loads.set(key, (loads.get(key) || 0) + end - start);
  }
  const canPlace = (task, pos) => {
    const ks = keys(task, pos.day);
    if ((loads.get(ks[0]) || 0) + task.duration > p.ruleFor(task.row.teacherKey).daily * 60 + EPS || (isTeaching(task.row) && (loads.get(ks[1]) || 0) + task.duration > +p.config.maxClassHoursPerDay * 60 + EPS)) return false;
    if (p.early.enabled && isTeaching(task.row) && pos.start === p.early.minute && (earlyCounts.get(task.row.teacherKey) || 0) >= p.early.perTeacher) return false;
    return ks.every(k => !(occupied.get(k) || []).some(event => overlap(event, pos)));
  };
  const place = (task, pos) => {
    const event = { ...pos, task };
    for (const k of keys(task, pos.day)) { if (!occupied.has(k)) occupied.set(k, []); occupied.get(k).push(event); loads.set(k, (loads.get(k) || 0) + task.duration); }
    used.add(task.taskId);
    if (isTeaching(task.row) && pos.start === p.early.minute) earlyCounts.set(task.row.teacherKey, (earlyCounts.get(task.row.teacherKey) || 0) + 1);
    result.push(event);
  };
  const remove = () => {
    const event = result.pop();
    for (const k of keys(event.task, event.day)) { occupied.get(k).pop(); loads.set(k, loads.get(k) - event.task.duration); }
    used.delete(event.task.taskId);
    if (isTeaching(event.task.row) && event.start === p.early.minute) earlyCounts.set(event.task.row.teacherKey, earlyCounts.get(event.task.row.teacherKey) - 1);
  };
  const cost = (task, pos) => {
    const ks = keys(task, pos.day), classEvents = isTeaching(task.row) ? occupied.get(ks[1]) || [] : (occupied.get(ks[0]) || []).filter(e => e.task);
    const classLoad = isTeaching(task.row) ? (loads.get(ks[1]) || 0) / 60 : 0, teacherLoad = (loads.get(ks[0]) || 0) / 60;
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
  const nodeLimit = backtracking ? 12000 : tasks.length * 3 + 1;
  const visit = index => {
    while (index < ordered.length && used.has(ordered[index].taskId)) index++;
    if (index === ordered.length) return true;
    if (++nodes > nodeLimit) return false;
    const task = ordered[index];
    const choices = task.domains.filter(pos => canPlace(task, pos)).map(pos => ({ ...pos, cost: cost(task, pos) })).sort((a, b) => a.cost - b.cost);
    for (const pos of choices) {
      place(task, pos);
      if (visit(index + 1)) return true;
      remove();
      if (!backtracking || nodes > nodeLimit) break;
    }
    return false;
  };
  const earlyTasksByTeacher = new Map([...p.teachingTeachers.keys()].map(teacher => [teacher, ordered.filter(t => t.row.teacherKey === teacher && isTeaching(t.row))]));
  const reserveEarly = () => {
    if (++nodes > nodeLimit) return false;
    let selected = null;
    for (const [teacher, teacherTasks] of earlyTasksByTeacher) {
      const needed = p.early.perTeacher - (earlyCounts.get(teacher) || 0);
      if (needed <= 0) continue;
      const choices = [], seen = new Set();
      for (const task of teacherTasks) {
        if (used.has(task.taskId)) continue;
        // Identical weekly sessions are interchangeable during reservation.
        const taskKey = `${task.row.id}|${task.duration}`;
        if (seen.has(taskKey)) continue;
        seen.add(taskKey);
        for (const pos of task.domains) if (pos.start === p.early.minute && canPlace(task, pos)) choices.push({ task, pos });
      }
      if (new Set(choices.map(choice => choice.pos.day)).size < needed) return false;
      if (!selected || choices.length / needed < selected.choices.length / selected.needed) selected = { teacher, choices, needed };
    }
    if (!selected) return visit(0);
    const choices = selected.choices.map(choice => ({ ...choice, cost: cost(choice.task, choice.pos) })).sort((a, b) => a.cost - b.cost);
    for (const choice of choices) {
      place(choice.task, choice.pos);
      if (reserveEarly()) return true;
      remove();
      if (!backtracking || nodes > nodeLimit) break;
    }
    return false;
  };
  if (!(p.early.enabled ? reserveEarly() : visit(0))) return null;
  return result.map(event => ({
    id: event.task.taskId, assignmentId: event.task.row.id, department: event.task.row.department,
    semester: event.task.row.semester, section: event.task.row.section, teacher: event.task.row.teacher,
    subject: event.task.row.subject, code: event.task.row.code || '', type: event.task.row.type, room: event.task.row.room,
    day: event.day, start: clock(event.start), end: clock(event.end), duration: rounded(event.task.duration / 60),
  })).sort((a, b) => p.config.days.indexOf(a.day) - p.config.days.indexOf(b.day) || time(a.start) - time(b.start) || a.id.localeCompare(b.id));
}

function metricsFor(events, p) {
  const groups = new Map();
  for (const event of events.filter(isTeaching)) { const key = `${cohort(event)}|${event.day}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(event); }
  let gapMinutes = 0, spread = 0;
  for (const group of groups.values()) {
    const first = Math.min(...group.map(e => time(e.start))), last = Math.max(...group.map(e => time(e.end)));
    const breaks = sum(p.breaks.map(b => Math.max(0, Math.min(last, b.end) - Math.max(first, b.start))));
    gapMinutes += Math.max(0, last - first - breaks - sum(group.map(e => time(e.end) - time(e.start))));
  }
  for (const key of new Set(p.rows.filter(isTeaching).map(cohort))) {
    const loads = p.config.days.map(day => sum((groups.get(`${key}|${day}`) || []).map(e => (time(e.end) - time(e.start)) / 60)));
    const average = sum(loads) / loads.length;
    spread += sum(loads.map(h => (h - average) ** 2));
  }
  const requiredHours = rounded(sum(p.rows.map(a => a.hours))), scheduledHours = rounded(sum(events.map(e => (time(e.end) - time(e.start)) / 60)));
  const quality = Math.max(1, Math.min(100, Math.round(100 - (gapMinutes / 60) / Math.max(1, groups.size) * 5 - spread / Math.max(1, new Set(p.rows.filter(isTeaching).map(cohort)).size) * 1.5)));
  const earlyStarts = [...p.teachingTeachers].map(([key, teacher]) => ({ teacher, count: events.filter(e => isTeaching(e) && norm(e.teacher) === key && time(e.start) === p.early.minute).length, target: p.early.enabled ? p.early.perTeacher : null }));
  const fixedHours = rounded(sum(p.blocks.map(b => (time(b.end) - time(b.start)) / 60)));
  return { scheduledHours, requiredHours, gaps: rounded(gapMinutes / 60), teacherConflicts: 0, balance: rounded(spread), score: quality,
    researchHours: rounded(sum(events.filter(e => e.type === 'research').map(e => (time(e.end) - time(e.start)) / 60))),
    fixedHours, totalWorkloadHours: rounded(scheduledHours + fixedHours), earlyStarts, earlyStartEqual: !p.early.enabled || earlyStarts.every(e => e.count === e.target) };
}

/** Independently checks a complete schedule, including resource collisions and exact demand. */
export function validateTimetable(candidate, assignments, config = {}) {
  const p = prepare(assignments, config), errors = [...p.errors];
  const events = Array.isArray(candidate) ? candidate : candidate?.events;
  if (!Array.isArray(events)) return { valid: false, errors: [...errors, 'A timetable must contain an events array.'], metrics: null };
  if (errors.length) return { valid: false, errors, metrics: null };
  const rows = new Map(p.rows.map(a => [a.id, a])), totals = new Map(), resources = new Map(), daily = new Map(), weekly = new Map();
  let teacherConflicts = 0;
  for (const block of p.blocks) {
    const teacher = norm(block.teacher), key = `t|${teacher}|${block.day}`, start = time(block.start), end = time(block.end), duration = (end - start) / 60;
    if (!resources.has(key)) resources.set(key, []);
    resources.get(key).push({ start, end, fixed: true });
    daily.set(key, (daily.get(key) || 0) + duration);
    weekly.set(teacher, (weekly.get(teacher) || 0) + duration);
  }
  if (!Array.isArray(candidate) && Object.hasOwn(candidate, 'blocks')) {
    const blockSignature = blocks => Array.isArray(blocks) ? blocks.map(b => [b.id, norm(b.teacher), b.title, b.type, b.day, b.start, b.end, b.date || '', b.duration].join('|')).sort().join('\n') : null;
    if (blockSignature(candidate.blocks) !== blockSignature(p.blocks)) errors.push('The timetable fixed blocks do not match the active blocks for the selected week. Regenerate the timetable.');
  }
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
    if (row.type !== 'lab' && duration > row.blockHours + EPS) errors.push(`${row.subject}: a ${row.type} session exceeds its configured session length.`);
    for (const field of ['department', 'semester', 'section', 'teacher', 'subject', 'type', 'room']) if (norm(event[field] ?? (field === 'section' && isTeaching(row) ? 'A' : '')) !== norm(row[field])) errors.push(`${row.subject}: event ${field} does not match its assignment.`);
    if (Math.abs(Number(event.duration) - duration) > 0.011 || !Number.isFinite(Number(event.duration))) errors.push(`${row.subject}: stored duration does not match its time window.`);
    if (rule.unavailableDays.has(norm(event.day)) || start < rule.start || end > rule.end || rule.unavailable.some(u => u.day === norm(event.day) && overlap({ start, end }, u))) errors.push(`${row.teacher} is unavailable for ${row.subject} on ${event.day} at ${event.start}.`);
    totals.set(row.id, (totals.get(row.id) || 0) + duration);
    const tKey = `t|${row.teacherKey}|${event.day}`, cKey = `c|${row.cohortKey}|${event.day}`;
    daily.set(tKey, (daily.get(tKey) || 0) + duration); if (isTeaching(row)) daily.set(cKey, (daily.get(cKey) || 0) + duration);
    weekly.set(row.teacherKey, (weekly.get(row.teacherKey) || 0) + duration);
    for (const key of [tKey, ...(isTeaching(row) ? [cKey] : []), ...(row.roomKey ? [`r|${row.roomKey}|${event.day}`] : [])]) {
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
    for (const day of p.config.days) {
      if (isTeaching(row) && (daily.get(`c|${row.cohortKey}|${day}`) || 0) > +p.config.maxClassHoursPerDay + EPS) errors.push(`${row.department} semester ${row.semester} section ${row.section} exceeds the daily class limit on ${day}.`);
    }
  }
  for (const [teacher, teacherName] of p.allTeachers) {
    const rule = p.ruleFor(teacher);
    if ((weekly.get(teacher) || 0) > rule.weekly + EPS) errors.push(`${teacherName} exceeds the weekly workload limit, including fixed blocks.`);
    for (const day of p.config.days) if ((daily.get(`t|${teacher}|${day}`) || 0) > rule.daily + EPS) errors.push(`${teacherName} exceeds the daily workload limit on ${day}, including fixed blocks.`);
  }
  if (p.early.enabled) for (const [teacher, teacherName] of p.teachingTeachers) {
    const actual = events.filter(e => { const row = rows.get(String(e.assignmentId)); return row && isTeaching(row) && row.teacherKey === teacher && time(e.start) === p.early.minute; }).length;
    if (actual !== p.early.perTeacher) errors.push(`${teacherName} has ${actual} teaching starts at ${p.early.time}; exactly ${p.early.perTeacher} are required for equal early starts.`);
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
    options.push({ id: `option-${options.length + 1}`, label: labels[strategy] + (round >= 3 ? ` ${Math.floor(round / 3) + 1}` : ''), events: best.events, blocks: p.blocks.map(b => ({ ...b })), score: best.metrics.score, metrics: best.metrics, complete: true, unscheduled: [] });
  }
  const diagnostics = options.length ? (options.length < target ? [`Found ${options.length} distinct valid ${options.length === 1 ? 'option' : 'options'} under these constraints.`] : []) : [`No complete schedule was found within the search limit${p.early.enabled ? ` while giving every teaching teacher exactly ${p.early.perTeacher} start${p.early.perTeacher === 1 ? '' : 's'} at ${p.early.time}` : ''}. Try widening teacher availability, adjusting fixed duties, shortening lab blocks, increasing daily limits, or adding teaching days. No constraint has been relaxed.`];
  return { options, diagnostics, slots: p.slots };
}
