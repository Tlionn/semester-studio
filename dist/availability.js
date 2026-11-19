/** Teacher commitments and a complete, non-overlapping view of each working day. */
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const key = value => clean(value).toLocaleLowerCase();
const rounded = value => Math.round(value * 1000000) / 1000000;
const time = value => {
  const match = clean(value).match(/^(\d{1,2}):([0-5]\d)$/);
  return match && +match[1] < 24 ? +match[1] * 60 + +match[2] : NaN;
};
const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const dayName = value => DAYS.find(day => key(day) === key(value) || key(day.slice(0, 3)) === key(value));
function dateValue(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}
const weekday = date => DAYS[(date.getUTCDay() + 6) % 7];
const overlap = (a, b) => time(a.start) < time(b.end) && time(b.start) < time(a.end);
const sameOccurrence = (a, b) => a.date && b.date ? a.date === b.date : a.day === b.day;

/** Return commitments that occur in the selected Monday–Sunday week. */
export function activeTeacherBlocks(config = {}) {
  const week = dateValue(config.weekStart);
  const validWeek = week && week.getUTCDay() === 1;
  const weekEnd = validWeek ? week.getTime() + 7 * 86400000 : NaN;
  return (Array.isArray(config.teacherBlocks) ? config.teacherBlocks : []).flatMap(block => {
    if (!block || typeof block !== 'object') return [];
    const date = clean(block.date), parsed = date ? dateValue(date) : null;
    if (date && (!parsed || !validWeek || parsed.getTime() < week.getTime() || parsed.getTime() >= weekEnd)) return [];
    const day = parsed ? weekday(parsed) : dayName(block.day);
    if (!day) return [];
    return [{ ...block, day, date, duration: rounded((time(block.end) - time(block.start)) / 60) }];
  });
}

/** Normalize all commitments, retaining dated records outside the current week. */
export function normalizeTeacherBlocks(input, { assignments = [], config = {} } = {}) {
  const blocks = [], errors = [];
  if (!Array.isArray(input)) return { blocks, errors: ['Teacher commitments must be an array of time blocks.'] };
  const names = new Map(assignments.map(assignment => [key(assignment.teacher), clean(assignment.teacher)]));
  const seenIds = new Set();
  const collegeStart = time(config.start), collegeEnd = time(config.end);
  if (!Number.isFinite(collegeStart) || !Number.isFinite(collegeEnd) || collegeStart >= collegeEnd) errors.push('Set valid college hours before adding teacher commitments.');
  const workingDays = (config.days || []).map(dayName).filter(Boolean);
  const week = dateValue(config.weekStart);
  const validWeek = week && week.getUTCDay() === 1;
  if (input.some(block => clean(block?.date)) && !validWeek) errors.push('Choose a valid Monday as the planning week start before using dated commitments.');
  input.forEach((raw, index) => {
    const issues = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { errors.push(`Commitment ${index + 1}: expected a time-block record.`); return; }
    const teacher = names.get(key(raw.teacher)) || clean(raw.teacher);
    const title = clean(raw.title);
    const type = key(raw.type) || 'duty';
    const id = clean(raw.id) || `teacher-block-${index + 1}`;
    const date = clean(raw.date), parsed = date ? dateValue(date) : null;
    const day = parsed ? weekday(parsed) : dayName(raw.day);
    const start = time(raw.start), end = time(raw.end);
    if (!teacher) issues.push('teacher is required');
    if (!title) issues.push('a commitment title is required');
    if (teacher.length > 160 || title.length > 160) issues.push('teacher names and titles must be 160 characters or fewer');
    if (!['duty', 'research', 'other'].includes(type)) issues.push('type must be duty, research or other');
    if (date && !parsed) issues.push('date must be a valid YYYY-MM-DD date');
    if (!day && !date) issues.push('select a weekday for a recurring commitment');
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) issues.push('use a valid start time before the end time');
    else if (Number.isFinite(collegeStart) && Number.isFinite(collegeEnd) && (start < collegeStart || end > collegeEnd)) issues.push('commitment times must stay within college hours');
    const activeDate = parsed && validWeek && parsed.getTime() >= week.getTime() && parsed.getTime() < week.getTime() + 7 * 86400000;
    if (day && workingDays.length && (!date || activeDate) && !workingDays.includes(day)) issues.push(`${day} is not a working day in this timetable`);
    if (seenIds.has(id)) issues.push('commitment ID appears more than once');
    seenIds.add(id);
    if (issues.length) errors.push(`Commitment ${index + 1}${title ? ` (${title})` : ''}: ${issues.join('; ')}.`);
    else blocks.push({ id, teacher, title, type, day, start: clock(start), end: clock(end), date });
  });
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const a = blocks[i], b = blocks[j];
      if (key(a.teacher) === key(b.teacher) && sameOccurrence(a, b) && overlap(a, b)) errors.push(`${a.teacher}: “${a.title}” overlaps “${b.title}” on ${a.date || b.date || a.day}. Adjust one commitment.`);
    }
  }
  return { blocks, errors: [...new Set(errors)] };
}

/**
 * Free time is only labelled available after a timetable has been generated.
 * Fixed duties override break labels when they span breaks, so their full clock
 * duration stays occupied and is counted once in the workload summary.
 */
export function teacherAvailability({ teacher, assignments = [], events = [], config = {}, generated = false } = {}) {
  const summary = { lectureHours: 0, labHours: 0, researchHours: 0, dutyHours: 0, availableHours: 0, earlyStarts: 0 };
  const segments = [];
  const teacherKey = key(teacher);
  const teacherName = assignments.find(a => key(a.teacher) === teacherKey)?.teacher || clean(teacher);
  const start = time(config.start), end = time(config.end);
  if (!teacherKey || !Number.isFinite(start) || !Number.isFinite(end) || start >= end) return { segments, summary };
  const teaching = generated ? events.filter(event => key(event.teacher) === teacherKey && ['lecture', 'lab', 'research'].includes(event.type) && !event.fixed && !event.blockId) : [];
  const fixed = activeTeacherBlocks(config).filter(block => key(block.teacher) === teacherKey);
  const rules = (config.teacherRules || []).filter(rule => key(rule.teacher) === teacherKey);
  const days = (config.days || []).map(dayName).filter(Boolean);
  summary.earlyStarts = teaching.filter(event => ['lecture', 'lab'].includes(event.type) && time(event.start) === 510 && days.includes(event.day)).length;
  for (const day of days) {
    const scheduled = teaching.filter(event => key(event.day) === key(day));
    const commitments = fixed.filter(block => block.day === day);
    const unavailable = [];
    for (const rule of rules) {
      if ((rule.unavailableDays || []).some(value => key(value) === key(day))) unavailable.push({ start: clock(start), end: clock(end), title: 'Unavailable' });
      if (Number.isFinite(time(rule.availableStart)) && time(rule.availableStart) > start) unavailable.push({ start: clock(start), end: rule.availableStart, title: 'Outside teacher availability' });
      if (Number.isFinite(time(rule.availableEnd)) && time(rule.availableEnd) < end) unavailable.push({ start: rule.availableEnd, end: clock(end), title: 'Outside teacher availability' });
      for (const window of rule.unavailable || []) if (key(window.day) === key(day)) unavailable.push({ ...window, title: 'Unavailable' });
    }
    const breaks = config.breaks || [];
    const boundaries = new Set([start, end]);
    for (const entry of [...scheduled, ...commitments, ...unavailable, ...breaks]) {
      const a = time(entry.start), b = time(entry.end);
      if (Number.isFinite(a) && Number.isFinite(b) && a < b && a < end && b > start) { boundaries.add(Math.max(start, a)); boundaries.add(Math.min(end, b)); }
    }
    const points = [...boundaries].sort((a, b) => a - b);
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index], b = points[index + 1];
      const covers = entry => time(entry.start) < b && time(entry.end) > a;
      const block = commitments.find(covers), event = scheduled.find(covers), excluded = unavailable.find(covers), pause = breaks.find(covers);
      let status, title, metadata = {};
      if (block) { status = block.type; title = block.title; metadata = { blockId: block.id, date: block.date, fixed: true }; }
      else if (event) { status = event.type; title = event.subject || event.title; metadata = { eventId: event.id, assignmentId: event.assignmentId, department: event.department, semester: event.semester, section: event.section, room: event.room, code: event.code }; }
      else if (excluded) { status = 'unavailable'; title = excluded.title; }
      else if (pause) { status = 'break'; title = pause.name || 'Break'; }
      else { status = generated ? 'available' : 'unallocated'; title = generated ? 'Available' : 'Not yet allocated'; }
      const duration = (b - a) / 60;
      segments.push({ day, start: clock(a), end: clock(b), status, title, teacher: teacherName, duration: rounded(duration), ...metadata });
      const summaryKey = { lecture: 'lectureHours', lab: 'labHours', research: 'researchHours', duty: 'dutyHours', other: 'dutyHours', available: 'availableHours' }[status];
      if (summaryKey) summary[summaryKey] += duration;
    }
  }
  for (const name of Object.keys(summary)) summary[name] = rounded(summary[name]);
  return { segments, summary };
}
