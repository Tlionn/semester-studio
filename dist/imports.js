/** Local import and explicit scheduling-rule parsing. No input is evaluated as code. */
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_ALIASES = Object.fromEntries(DAYS.flatMap(day => [[day.toLowerCase(), day], [day.slice(0, 3).toLowerCase(), day], [`${day.toLowerCase()}s`, day]]));
Object.assign(DAY_ALIASES, { tues: 'Tuesday', thurs: 'Thursday', thur: 'Thursday' });

export const TEMPLATE_CSV = 'department,semester,section,teacher,subject,code,type,weekly_hours,room,block_hours\r\nComputer Science,3,A,Dr. Ananya Rao,Data Structures,CS301,lecture,3,C301,1\r\nComputer Science,3,A,Dr. Ananya Rao,Data Structures Lab,CS351,lab,2,CS Lab 1,2\r\nElectronics,3,A,Dr. Vikram Shah,Digital Electronics,EC301,lecture,3,E301,1\r\n';

/** RFC 4180-style CSV, including quoted commas, newlines, and escaped quotes. */
export function parseCSV(text) {
  if (typeof text !== 'string') throw new Error('The CSV file must contain text.');
  const input = text.replace(/^\uFEFF/, '');
  const records = [];
  let record = [], field = '', inQuotes = false, closedQuote = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') { inQuotes = false; closedQuote = true; }
      else field += ch;
      continue;
    }
    if (ch === '"') {
      if (field.trim() || closedQuote) throw new Error(`Unexpected quote near CSV record ${records.length + 1}.`);
      field = ''; inQuotes = true;
    } else if (ch === ',') {
      record.push(field); field = ''; closedQuote = false;
    } else if (ch === '\n' || ch === '\r') {
      record.push(field);
      if (record.some(value => value.trim())) records.push(record);
      record = []; field = ''; closedQuote = false;
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
    } else if (closedQuote && !/\s/.test(ch)) {
      throw new Error(`Unexpected text after a closing quote near CSV record ${records.length + 1}.`);
    } else if (!closedQuote) field += ch;
  }
  if (inQuotes) throw new Error('The CSV has an unclosed quoted field.');
  record.push(field);
  if (record.some(value => value.trim())) records.push(record);
  if (!records.length) return [];
  const headers = records.shift().map(header => header.trim());
  if (headers.some(header => !header)) throw new Error('Every CSV column must have a header.');
  if (new Set(headers.map(header => header.toLowerCase())).size !== headers.length) throw new Error('The CSV contains duplicate column headers.');
  return records.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV record ${index + 2} has ${values.length} columns; expected ${headers.length}.`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });
}

const ALIASES = {
  department: ['department', 'dept', 'departmentname', 'branch'],
  semester: ['semester', 'sem', 'semesternumber'],
  section: ['section', 'classsection', 'division'],
  teacher: ['teacher', 'teachername', 'faculty', 'facultyname', 'instructor', 'instructorname'],
  subject: ['subject', 'subjectname', 'course', 'coursename'],
  code: ['code', 'subjectcode', 'coursecode'],
  type: ['type', 'sessiontype', 'classtype', 'subjecttype'],
  hours: ['hours', 'weeklyhours', 'hoursperweek', 'contacthours', 'weeklycontacthours'],
  room: ['room', 'roomnumber', 'classroom', 'labroom'],
  blockHours: ['blockhours', 'sessionhours', 'labduration', 'blockduration', 'durationhours'],
};
const normalizeHeader = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const clean = value => value == null ? '' : String(value).trim().replace(/[ \t]+/g, ' ');
const identity = value => clean(value).toLocaleLowerCase();
const numeric = value => typeof value === 'number' ? value : /^\d+(\.\d+)?$/.test(clean(value)) ? Number(value) : NaN;

export function normalizeAssignments(rows) {
  const assignments = [], errors = [], warnings = [];
  if (!Array.isArray(rows) || !rows.length) return { assignments, errors: ['The file has no teaching assignments. Add a header row and at least one assignment.'], warnings };
  if (rows.length > 500) return { assignments, errors: ['This planner supports up to 500 assignment rows per file. Split the file into a smaller planning cycle.'], warnings };
  const seen = new Set();
  let roomsMissing = false;
  rows.forEach((row, index) => {
    const rowErrors = [];
    if (!row || typeof row !== 'object' || Array.isArray(row)) { errors.push(`Row ${index + 2}: expected a named-column record.`); return; }
    const normalized = new Map();
    for (const [key, value] of Object.entries(row)) {
      const name = normalizeHeader(key);
      if (normalized.has(name)) rowErrors.push(`duplicate column “${key}”`);
      normalized.set(name, value);
    }
    const record = {};
    for (const [key, aliases] of Object.entries(ALIASES)) {
      const matches = aliases.filter(alias => normalized.has(alias));
      if (matches.length > 1 && new Set(matches.map(alias => clean(normalized.get(alias)))).size > 1) rowErrors.push(`conflicting ${key} columns`);
      record[key] = matches.length ? normalized.get(matches[0]) : '';
    }
    for (const key of ['department', 'teacher', 'subject']) {
      record[key] = clean(record[key]);
      if (!record[key]) rowErrors.push(`${key} is required`);
      else if (record[key].length > 160) rowErrors.push(`${key} must be 160 characters or fewer`);
    }
    const semesterText = clean(record.semester).replace(/^(?:semester|sem)\s*/i, '');
    record.semester = Number(semesterText);
    if (!semesterText || !Number.isInteger(record.semester) || record.semester < 1 || record.semester > 8) rowErrors.push('semester must be a number from 1 to 8');
    record.section = clean(record.section) || 'A';
    record.code = clean(record.code);
    record.room = clean(record.room);
    if (!record.room) roomsMissing = true;
    const type = identity(record.type);
    record.type = ['lab', 'laboratory', 'practical'].includes(type) ? 'lab' : ['lecture', 'class', 'theory', 'tutorial'].includes(type) ? 'lecture' : !type ? /\blab(?:oratory)?\b|\bpractical\b/i.test(record.subject) ? 'lab' : 'lecture' : '';
    if (!record.type) rowErrors.push('type must be lecture or lab');
    record.hours = numeric(record.hours);
    if (!Number.isFinite(record.hours) || record.hours <= 0 || record.hours > 60) rowErrors.push('weekly_hours must be a positive number no greater than 60');
    else if (Math.abs(record.hours * 60 - Math.round(record.hours * 60)) > 0.000001) rowErrors.push('weekly_hours must resolve to a whole number of minutes');
    record.blockHours = clean(record.blockHours) ? numeric(record.blockHours) : record.type === 'lab' ? Math.min(2, record.hours) : 1;
    if (!Number.isFinite(record.blockHours) || record.blockHours <= 0 || record.blockHours > 8) rowErrors.push('block_hours must be a positive number no greater than 8');
    else if (Math.abs(record.blockHours * 60 - Math.round(record.blockHours * 60)) > 0.000001) rowErrors.push('block_hours must resolve to a whole number of minutes');
    else if (Number.isFinite(record.hours) && Math.abs(record.hours / record.blockHours - Math.round(record.hours / record.blockHours)) > 0.00001) rowErrors.push('weekly_hours must be a multiple of block_hours');
    const key = [record.department, record.semester, record.section, record.teacher, record.subject, record.code, record.type].map(identity).join('\u001f');
    if (seen.has(key)) rowErrors.push('this teaching assignment appears more than once; combine its weekly hours into one row');
    seen.add(key);
    if (rowErrors.length) errors.push(`Row ${index + 2}: ${rowErrors.join('; ')}.`);
    else assignments.push({ id: `assignment-${index + 1}`, ...record });
  });
  if (roomsMissing) warnings.push('Rows without a room are scheduled without room-availability checks.');
  return { assignments, errors, warnings };
}

function minutes(value) { const [hours, mins] = value.split(':').map(Number); return hours * 60 + mins; }
function readTime(value) {
  const match = clean(value).toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hours = Number(match[1]); const mins = Number(match[2] || 0);
  if (mins > 59 || (match[3] ? hours < 1 || hours > 12 : hours > 23)) return null;
  if (match[3]) hours = hours % 12 + (match[3] === 'pm' ? 12 : 0);
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}
function readDays(value) {
  let input = clean(value).replace(/\.$/, '').toLowerCase();
  if (/^(?:weekdays|monday\s*(?:-|–|—|to|through)\s*friday)$/.test(input)) return DAYS.slice(0, 5);
  if (/^(?:every day|all days|daily)$/.test(input)) return [...DAYS];
  const range = input.match(/^([a-z]+)\s*(?:-|–|—|to|through)\s*([a-z]+)$/);
  if (range) {
    const start = DAY_ALIASES[range[1]], end = DAY_ALIASES[range[2]];
    if (!start || !end || DAYS.indexOf(end) < DAYS.indexOf(start)) return null;
    return DAYS.slice(DAYS.indexOf(start), DAYS.indexOf(end) + 1);
  }
  const result = input.split(/\s*(?:,|&|\band\b)\s*/).map(day => DAY_ALIASES[day]);
  return result.length && result.every(Boolean) ? [...new Set(result)] : null;
}

function globalLimit(line) {
  const standard = line.match(/^(?:maximum|max)\s+(teacher|faculty|class|student)\s+hours\s+per\s+(day|week)\s*:\s*(\d+(?:\.\d+)?)$/i);
  if (standard) return standard;
  const alternate = line.match(/^(teachers?|faculty|classes|students?)\s*:?\s*(?:maximum|max)\s+(\d+(?:\.\d+)?)\s+hours?\s+per\s+(day|week)$/i);
  return alternate ? [alternate[0], alternate[1], alternate[3], alternate[2]] : null;
}

/**
 * Supported rules are intentionally explicit and reviewable. Unsupported lines
 * are returned verbatim so callers can prevent generating a misleading schedule.
 */
export function parseInstructions(text, baseConfig) {
  const config = JSON.parse(JSON.stringify(baseConfig));
  config.teacherRules ||= [];
  config.breaks ||= [];
  const recognized = [], unrecognized = [], errors = [];
  const written = new Map();
  let replacingBreaks = false;
  let explicitlyNoBreaks = false;
  const timeToken = '(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)';
  const range = `${timeToken}\\s*(?:-|–|—|to)\\s*${timeToken}`;
  const setValue = (target, key, value, marker = key) => {
    const serialized = JSON.stringify(value);
    if (written.has(marker) && written.get(marker) !== serialized) errors.push(`Conflicting values for ${marker}. Keep one rule.`);
    target[key] = value; written.set(marker, serialized);
  };
  const teacherRule = name => {
    name = clean(name).replace(/^teacher\s+/i, '').replace(/:$/, '').trim();
    let rule = config.teacherRules.find(item => identity(item.teacher) === identity(name));
    if (!rule) { rule = { teacher: name }; config.teacherRules.push(rule); }
    return rule;
  };
  const readRange = (start, end, source) => {
    const parsed = [readTime(start), readTime(end)];
    if (!parsed.every(Boolean) || minutes(parsed[0]) >= minutes(parsed[1])) { errors.push(`Invalid time range in “${source}”. Use a same-day range such as 09:00-14:00.`); return null; }
    return parsed;
  };
  const lines = String(text || '').split(/\r?\n|;/).map(line => line.trim().replace(/^(?:[-*•]\s+|\d+\.\s+)/, '')).filter(Boolean);
  for (const source of lines) {
    const line = source.replace(/\.$/, '').trim();
    let match, label;
    if (/^#/.test(line)) continue;
    if ((match = line.match(new RegExp(`^(?:college|working|teaching|school|day)\\s+(?:hours|timings?)\\s*:?\\s*${range}$`, 'i')))) {
      const times = readRange(match[1], match[2], source);
      if (times) { setValue(config, 'start', times[0]); setValue(config, 'end', times[1]); label = `College hours · ${times[0]}–${times[1]}`; }
    } else if ((match = line.match(/^(?:working|teaching|college|school)\s+days\s*:\s*(.+)$/i))) {
      const days = readDays(match[1]);
      if (!days) errors.push(`Unrecognized working days in “${source}”. Use Monday-Friday or a comma-separated day list.`);
      else { setValue(config, 'days', days); label = `${days.length} working days · ${days.map(day => day.slice(0, 3)).join(', ')}`; }
    } else if ((match = line.match(new RegExp(`^((?:short |tea |morning |afternoon |coffee )?break|lunch(?: break)?)\\s*:?\\s*${range}$`, 'i')))) {
      const times = readRange(match[2], match[3], source);
      if (explicitlyNoBreaks) errors.push('“No breaks” conflicts with listed break times. Keep one approach.');
      if (!replacingBreaks) { config.breaks = []; replacingBreaks = true; }
      if (times) { const name = match[1][0].toUpperCase() + match[1].slice(1); config.breaks.push({ name, start: times[0], end: times[1] }); label = `${name} · ${times[0]}–${times[1]}`; }
    } else if (/^no breaks$/i.test(line)) {
      if (replacingBreaks && config.breaks.length) errors.push('“No breaks” conflicts with listed break times. Keep one approach.');
      config.breaks = []; replacingBreaks = true; explicitlyNoBreaks = true; label = 'No scheduled breaks';
    } else if ((match = globalLimit(line))) {
      const kind = /^(?:teacher|faculty)/i.test(match[1]) ? 'Teacher' : 'Class';
      const period = match[2].toLowerCase(); const value = Number(match[3]);
      if (kind === 'Class' && period === 'week') { unrecognized.push(source); continue; }
      const key = `max${kind}HoursPer${period === 'day' ? 'Day' : 'Week'}`;
      if (value <= 0 || value > (period === 'day' ? 24 : 168)) errors.push(`Invalid hour limit in “${source}”.`);
      else { setValue(config, key, value); label = `${kind} limit · ${value} h/${period}`; }
    } else if ((match = line.match(/^(?:period|slot|lecture)\s+(?:duration|length)\s*:\s*(\d+)\s*(?:minutes?|mins?)$/i))) {
      const value = Number(match[1]);
      if (value < 15 || value > 180) errors.push('Period duration must be between 15 and 180 minutes.');
      else { setValue(config, 'slotMinutes', value); label = `${value}-minute periods`; }
    } else if ((match = line.match(new RegExp(`^(.+?)\\s+(?:is\\s+)?unavailable\\s+(?:on\\s+)?([a-z]+)\\s+${range}$`, 'i')))) {
      const day = DAY_ALIASES[match[2].toLowerCase()]; const times = readRange(match[3], match[4], source);
      if (!day) { unrecognized.push(source); continue; }
      if (times) { const rule = teacherRule(match[1]); rule.unavailable ||= []; rule.unavailable.push({ day, start: times[0], end: times[1] }); label = `${rule.teacher} · unavailable ${day} ${times[0]}–${times[1]}`; }
    } else if ((match = line.match(/^(.+?)\s+(?:is\s+)?unavailable\s+(?:on\s+)?(.+)$/i)) && readDays(match[2])) {
      const rule = teacherRule(match[1]); const days = readDays(match[2]); rule.unavailableDays = [...new Set([...(rule.unavailableDays || []), ...days])]; label = `${rule.teacher} · unavailable ${days.join(', ')}`;
    } else if ((match = line.match(new RegExp(`^(.+?)\\s+(?:is\\s+)?available\\s+(?:from\\s+)?${range}$`, 'i')))) {
      const times = readRange(match[2], match[3], source);
      if (times) { const rule = teacherRule(match[1]); setValue(rule, 'availableStart', times[0], `${rule.teacher} availability start`); setValue(rule, 'availableEnd', times[1], `${rule.teacher} availability end`); label = `${rule.teacher} · available ${times[0]}–${times[1]}`; }
    } else if ((match = line.match(new RegExp(`^(.+?)\\s+(?:is\\s+)?(available|unavailable)\\s+(before|after)\\s+${timeToken}$`, 'i')))) {
      const value = readTime(match[4]);
      if (!value) errors.push(`Invalid time in “${source}”.`);
      else { const rule = teacherRule(match[1]); const isStart = (match[2].toLowerCase() === 'available') === (match[3].toLowerCase() === 'after'); setValue(rule, isStart ? 'availableStart' : 'availableEnd', value, `${rule.teacher} availability ${isStart ? 'start' : 'end'}`); label = `${rule.teacher} · available ${isStart ? 'after' : 'before'} ${value}`; }
    } else if ((match = line.match(/^(.+?)\s*:?[ \t]+(?:maximum|max)\s+(\d+(?:\.\d+)?)\s+hours?\s+per\s+(day|week)$/i))) {
      if (/^(?:semester|sem|section|department|class|students?)\b/i.test(match[1])) { unrecognized.push(source); continue; }
      const rule = teacherRule(match[1]); const value = Number(match[2]); const period = match[3].toLowerCase();
      if (value <= 0 || value > (period === 'day' ? 24 : 168)) errors.push(`Invalid teacher hour limit in “${source}”.`);
      else { setValue(rule, period === 'day' ? 'maxHoursPerDay' : 'maxHoursPerWeek', value, `${rule.teacher} maximum hours per ${period}`); label = `${rule.teacher} · maximum ${value} h/${period}`; }
    } else unrecognized.push(source);
    if (label) recognized.push({ label, source });
  }
  const start = readTime(config.start), end = readTime(config.end);
  if (!start || !end || minutes(start) >= minutes(end)) errors.push('College hours must have a valid start before the end time.');
  if (!Array.isArray(config.days) || !config.days.length) errors.push('Select at least one working day.');
  config.breaks.sort((a, b) => minutes(a.start) - minutes(b.start));
  for (let index = 0; index < config.breaks.length; index += 1) {
    const current = config.breaks[index], previous = config.breaks[index - 1];
    if (!readTime(current.start) || !readTime(current.end) || minutes(current.start) >= minutes(current.end)) errors.push(`${current.name} has an invalid time range.`);
    else if (start && end && (minutes(current.start) < minutes(start) || minutes(current.end) > minutes(end))) errors.push(`${current.name} must fall within college hours.`);
    if (previous && minutes(previous.end) > minutes(current.start)) errors.push(`${previous.name} overlaps ${current.name}. Adjust the break times.`);
  }
  for (const rule of config.teacherRules) {
    if (rule.availableStart && rule.availableEnd && minutes(rule.availableStart) >= minutes(rule.availableEnd)) errors.push(`${rule.teacher}'s availability must start before it ends.`);
  }
  return { config, recognized, unrecognized, errors: [...new Set(errors)] };
}
