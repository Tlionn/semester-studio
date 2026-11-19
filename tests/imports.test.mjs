import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, normalizeAssignments, parseInstructions, TEMPLATE_CSV } from '../dist/imports.js';
import { DEFAULT_CONFIG, DEFAULT_INSTRUCTIONS, DEMO_ASSIGNMENTS } from '../dist/demo.js';

test('CSV supports BOM, quoted commas, multiline text, escaped quotes and CRLF', () => {
  const rows = parseCSV('\uFEFFteacher,subject\r\n"Dr. Rao, A.","Algorithms\nwith ""graphs"""\r\n');
  assert.deepEqual(rows, [{ teacher: 'Dr. Rao, A.', subject: 'Algorithms\nwith "graphs"' }]);
});

test('Malformed CSV fails without silent row truncation', () => {
  assert.throws(() => parseCSV('teacher,subject\nRao,Math,extra'), /expected 2/);
  assert.throws(() => parseCSV('teacher,subject\nRao,"Math'), /unclosed/);
  assert.throws(() => parseCSV('teacher,teacher\nRao,Math'), /duplicate/);
});

test('Template normalizes and accepts flexible spreadsheet headers', () => {
  const result = normalizeAssignments(parseCSV(TEMPLATE_CSV));
  assert.deepEqual(result.errors, []);
  assert.equal(result.assignments.length, 4);
  assert.equal(result.assignments[1].type, 'lab');
  const aliases = normalizeAssignments([{ Dept: 'CSE', Sem: 'Semester 3', Faculty: 'Rao', 'Course Name': 'Algorithms', 'Hours Per Week': 4 }]);
  assert.deepEqual(aliases.errors, []);
  assert.equal(aliases.assignments[0].semester, 3);
  assert.equal(aliases.assignments[0].section, 'A');
  assert.equal(aliases.warnings.length, 1);
});

test('Invalid hours, semesters, duplicates and incompatible lab lengths are rejected', () => {
  const base = { department: 'CSE', semester: 3, teacher: 'Rao', subject: 'Algorithms', weekly_hours: 4 };
  for (const change of [{ weekly_hours: 0 }, { weekly_hours: '4h' }, { weekly_hours: 0.66, block_hours: 0.33 }, { semester: 9 }, { type: 'lab', weekly_hours: 3, block_hours: 2 }]) assert.ok(normalizeAssignments([{ ...base, ...change }]).errors.length);
  assert.ok(normalizeAssignments([base, base]).errors.some(error => error.includes('more than once')));
});

test('Spreadsheet formula strings stay inert text', () => {
  const result = normalizeAssignments([{ department: 'CSE', semester: 3, teacher: '=HYPERLINK("bad")', subject: '<script>alert(1)</script>', weekly_hours: 3 }]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.assignments[0].teacher, '=HYPERLINK("bad")');
});

test('Every default instruction is understood, preserving explicit breaks and limits', () => {
  const result = parseInstructions(DEFAULT_INSTRUCTIONS, DEFAULT_CONFIG);
  assert.deepEqual(result.unrecognized, []);
  assert.deepEqual(result.errors, []);
  assert.equal(result.recognized.length, 8);
  assert.deepEqual(result.config.teacherRules, [{ teacher: 'Dr. Ananya Rao', unavailableDays: ['Friday'] }]);
  assert.equal(result.config.breaks.length, 2);
  assert.equal(DEFAULT_CONFIG.teacherRules.length, 0, 'base config is not mutated');
});

test('Availability, teacher limits, day lists and partial-day exclusions parse', () => {
  const result = parseInstructions('Working days: Mon, Wed and Fri\nDr. Ananya Rao available 9am-2pm\nDr. Ananya Rao maximum 4 hours per day\nDr. Ananya Rao maximum 16 hours per week\nDr. Ananya Rao unavailable on Monday 10:00-11:00\nPeriod duration: 30 minutes', DEFAULT_CONFIG);
  assert.deepEqual(result.unrecognized, []);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.config.days, ['Monday', 'Wednesday', 'Friday']);
  assert.equal(result.config.slotMinutes, 30);
  const rule = result.config.teacherRules[0];
  assert.equal(rule.availableStart, '09:00');
  assert.equal(rule.availableEnd, '14:00');
  assert.equal(rule.maxHoursPerDay, 4);
  assert.equal(rule.maxHoursPerWeek, 16);
  assert.deepEqual(rule.unavailable, [{ day: 'Monday', start: '10:00', end: '11:00' }]);
});

test('Unsupported natural language is returned and conflicting constraints are rejected', () => {
  const unknown = 'Prefer difficult subjects before lunch';
  const result = parseInstructions(`${unknown}\nSemester 3 maximum 4 hours per day\nMaximum teacher hours per day: 4\nMaximum teacher hours per day: 6`, DEFAULT_CONFIG);
  assert.deepEqual(result.unrecognized, [unknown, 'Semester 3 maximum 4 hours per day']);
  assert.ok(result.errors.some(error => /Conflicting/.test(error)));
});

test('Overlapping breaks and malformed time ranges cannot silently generate', () => {
  const overlap = parseInstructions('Short break: 11:00-12:00\nLunch: 11:30-12:30', DEFAULT_CONFIG);
  assert.ok(overlap.errors.some(error => /overlaps/.test(error)));
  const invalid = parseInstructions('College hours: 19:00-09:00', DEFAULT_CONFIG);
  assert.ok(invalid.errors.length);
  assert.deepEqual(invalid.recognized, []);
  assert.ok(parseInstructions('No breaks\nLunch: 13:15-14:00', DEFAULT_CONFIG).errors.length);
  assert.ok(parseInstructions('Lunch: 13:15-14:00\nNo breaks', DEFAULT_CONFIG).errors.length);
});

test('Alternative global wording and before/after availability retain exact limits', () => {
  const result = parseInstructions('Teachers: max 4 hours per day\nFaculty maximum 18 hours per week\nStudents: max 5 hours per day\nDr. Rao unavailable before 10am\nDr. Rao available before 3pm', DEFAULT_CONFIG);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.unrecognized, []);
  assert.equal(result.config.maxTeacherHoursPerDay, 4);
  assert.equal(result.config.maxTeacherHoursPerWeek, 18);
  assert.equal(result.config.maxClassHoursPerDay, 5);
  assert.deepEqual(result.config.teacherRules, [{ teacher: 'Dr. Rao', availableStart: '10:00', availableEnd: '15:00' }]);
});

test('Demo includes shared teachers, three departments, and four semester choices', () => {
  assert.equal(new Set(DEMO_ASSIGNMENTS.map(row => row.department)).size, 3);
  assert.equal(new Set(DEMO_ASSIGNMENTS.filter(row => row.type !== 'research').map(row => row.semester)).size, 4);
  assert.equal(DEMO_ASSIGNMENTS.filter(row => row.type === 'research').length, 2);
  assert.ok(DEMO_ASSIGNMENTS.every(row => row.hours % row.blockHours === 0));
});

test('Research workload belongs to a teacher without creating a semester or section', () => {
  const result = normalizeAssignments([{ department: 'CSE', teacher: 'Dr. Rao', 'Course Name': 'Research', type: 'research', weekly_hours: 3 }]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.assignments[0].semester, null);
  assert.equal(result.assignments[0].section, '');
  assert.equal(result.assignments[0].blockHours, 1);
  assert.equal(result.assignments[0].type, 'research');
  const invalid = normalizeAssignments([{ department: 'CSE', teacher: 'Dr. Rao', type: 'research', weekly_hours: 2 }]);
  assert.ok(invalid.errors.some(error => error.includes('subject is required')));
});

test('Positive durations too small to represent one minute cannot become zero-length sessions', () => {
  const base = { department: 'CSE', teacher: 'Dr. Rao', subject: 'Research', type: 'research', weekly_hours: 1, block_hours: 1 };
  const tinyWorkload = normalizeAssignments([{ ...base, weekly_hours: 1e-9, block_hours: 1e-9 }]);
  assert.equal(tinyWorkload.assignments.length, 0);
  assert.ok(tinyWorkload.errors.some(error => error.includes('weekly_hours must resolve to at least one whole minute')));
  assert.ok(tinyWorkload.errors.some(error => error.includes('block_hours must resolve to at least one whole minute')));
  const tinyBlock = normalizeAssignments([{ ...base, block_hours: 1e-9 }]);
  assert.equal(tinyBlock.assignments.length, 0);
  const oneMinute = normalizeAssignments([{ ...base, weekly_hours: 1 / 60, block_hours: 1 / 60 }]);
  assert.deepEqual(oneMinute.errors, []);
});
