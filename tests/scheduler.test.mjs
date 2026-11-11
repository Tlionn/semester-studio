import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../dist/scheduler.js', import.meta.url), 'utf8');
const { generateTimetables, validateTimetable } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
import { normalizeAssignments, parseInstructions } from '../dist/imports.js';
import { DEMO_ASSIGNMENTS, DEFAULT_CONFIG, DEFAULT_INSTRUCTIONS } from '../dist/demo.js';
const config = {
  days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], start: '09:00', end: '16:30', slotMinutes: 60,
  breaks: [{ name: 'Short break', start: '11:00', end: '11:15' }, { name: 'Lunch', start: '13:15', end: '14:00' }],
  maxTeacherHoursPerDay: 5, maxTeacherHoursPerWeek: 24, maxClassHoursPerDay: 6, teacherRules: [],
};
const row = (id, changes = {}) => ({ id, department: 'Computer Science', semester: 3, section: 'A', teacher: `Teacher ${id}`, subject: `Subject ${id}`, code: `CS${id}`, type: 'lecture', hours: 3, room: '', blockHours: 1, ...changes });

test('generates three genuinely distinct complete schedules spanning all cohorts', () => {
  const assignments = [row('1'), row('2'), row('3', { type: 'lab', hours: 4, blockHours: 2, room: 'Lab 1' }), row('4', { semester: 5, teacher: 'Teacher 1' }), row('5', { semester: 5, type: 'lab', hours: 4, blockHours: 2, room: 'Lab 1' }), row('6', { department: 'Mechanical', teacher: 'Teacher 2' })];
  const result = generateTimetables(assignments, config);
  assert.equal(result.options.length, 3);
  assert.equal(new Set(result.options.map(o => JSON.stringify(o.events))).size, 3);
  for (const option of result.options) {
    assert.equal(validateTimetable(option, assignments, config).valid, true);
    assert.equal(option.metrics.requiredHours, 20);
    assert.equal(option.metrics.scheduledHours, 20);
    assert.equal(option.metrics.teacherConflicts, 0);
    assert.equal(option.complete, true);
    for (const event of option.events.filter(e => e.type === 'lab')) assert.equal(event.duration, 2);
  }
  assert.ok(result.slots.some(s => s.start === '11:00' && s.end === '11:15' && s.type === 'break'));
  assert.deepEqual(result, generateTimetables(assignments, config));
});

test('honors availability, unavailable days and time windows, specific and global hour limits', () => {
  const assignments = [row('1', { hours: 4 }), row('2', { teacher: 'Teacher 1', semester: 5, hours: 2 })];
  const rules = { ...config, teacherRules: [{ teacher: 'teacher 1', unavailableDays: ['Monday'], availableStart: '11:15', availableEnd: '16:00', maxHoursPerDay: 2, maxHoursPerWeek: 6, unavailable: [{ day: 'Tuesday', start: '11:15', end: '13:15' }] }] };
  const result = generateTimetables(assignments, rules);
  assert.ok(result.options.length);
  for (const option of result.options) {
    assert.equal(validateTimetable(option, assignments, rules).valid, true);
    assert.ok(option.events.every(e => e.day !== 'Monday' && e.start >= '11:15' && e.end <= '16:00'));
    assert.ok(option.events.filter(e => e.day === 'Tuesday').every(e => e.start >= '14:00'));
    for (const day of config.days) assert.ok(option.events.filter(e => e.day === day).reduce((n, e) => n + e.duration, 0) <= 2);
  }
});

test('returns explicit diagnostics instead of partial schedules for impossible weekly load', () => {
  const result = generateTimetables([row('1', { hours: 25 })], config);
  assert.equal(result.options.length, 0);
  assert.match(result.diagnostics.join(' '), /weekly limit/);
});

test('rejects infeasible lab blocks and overlapping breaks', () => {
  const labs = generateTimetables([row('1', { type: 'lab', hours: 4, blockHours: 4 })], config);
  assert.equal(labs.options.length, 0);
  assert.match(labs.diagnostics.join(' '), /continuous slot/);
  const overlap = generateTimetables([row('1')], { ...config, breaks: [{ start: '11:00', end: '12:00' }, { start: '11:30', end: '12:30' }] });
  assert.equal(overlap.options.length, 0);
  assert.match(overlap.diagnostics.join(' '), /overlap/);
});

test('independent validation detects shared teacher, shared room and cohort collisions', () => {
  const assignments = [row('1', { teacher: 'Shared', room: 'Lab A', hours: 1 }), row('2', { teacher: 'Shared', room: 'Lab A', semester: 5, hours: 1 })];
  const events = assignments.map(a => ({ ...a, assignmentId: a.id, duration: 1, day: 'Monday', start: '09:00', end: '10:00' }));
  const validation = validateTimetable({ events }, assignments, config);
  assert.equal(validation.valid, false);
  assert.equal(validation.metrics.teacherConflicts, 1);
  assert.ok(validation.errors.some(e => e.includes('Shared is double-booked')));
  assert.ok(validation.errors.some(e => e.includes('Lab A is double-booked')));
});

test('independent validation detects missing hours, break overlap and invalid lab duration', () => {
  const assignments = [row('1', { type: 'lab', hours: 2, blockHours: 2 })];
  const event = { ...assignments[0], assignmentId: '1', duration: 1, day: 'Monday', start: '10:30', end: '11:30' };
  const validation = validateTimetable({ events: [event] }, assignments, config);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(e => e.includes('overlaps a break')));
  assert.ok(validation.errors.some(e => e.includes('continuous 2-hour')));
  assert.ok(validation.errors.some(e => e.includes('scheduled 1 of 2')));
});

test('coordinates thirty subjects across semesters and departments within a practical runtime', () => {
  const assignments = Array.from({ length: 30 }, (_, i) => row(String(i), { department: i < 15 ? 'Computer Science' : 'Mechanical', semester: 1 + Math.floor((i % 15) / 5) * 2, teacher: `Faculty ${i % 12}`, type: i % 5 === 4 ? 'lab' : 'lecture', hours: i % 5 === 4 ? 2 : 3, blockHours: i % 5 === 4 ? 2 : 1, room: i % 5 === 4 ? `Lab ${i % 3}` : '' }));
  const start = performance.now();
  const result = generateTimetables(assignments, config);
  const elapsed = performance.now() - start;
  assert.equal(result.options.length, 3);
  assert.ok(result.options.every(o => validateTimetable(o, assignments, config).valid));
  assert.ok(elapsed < 2000, `Generation took ${elapsed}ms`);
});

test('rejects inconsistent lab hours and detects limited availability capacity', () => {
  const lab = generateTimetables([row('1', { type: 'lab', hours: 3, blockHours: 2 })], config);
  assert.equal(lab.options.length, 0);
  assert.match(lab.diagnostics.join(' '), /multiple/);
  const capacity = generateTimetables([row('1', { hours: 6 })], { ...config, teacherRules: [{ teacher: 'Teacher 1', availableStart: '15:00', availableEnd: '16:00' }] });
  assert.equal(capacity.options.length, 0);
  assert.match(capacity.diagnostics.join(' '), /capacity for only 5/);
});

test('the shipped demo and pasted instructions generate three complete 89-hour alternatives', () => {
  const parsed = parseInstructions(DEFAULT_INSTRUCTIONS, DEFAULT_CONFIG);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.unrecognized, []);
  assert.equal(parsed.recognized.length, 8);
  const result = generateTimetables(DEMO_ASSIGNMENTS, parsed.config);
  assert.equal(result.options.length, 3);
  for (const option of result.options) {
    assert.equal(option.metrics.scheduledHours, 89);
    assert.equal(validateTimetable(option, DEMO_ASSIGNMENTS, parsed.config).valid, true);
    assert.ok(option.events.filter(event => event.teacher === 'Dr. Ananya Rao').every(event => event.day !== 'Friday'));
  }
});

test('fractional clock hours preserve exact minute durations on weekend teaching days', () => {
  const normalized = normalizeAssignments([{ department: 'Computer Science', semester: 2, teacher: 'Dr. Example', subject: 'Workshop', type: 'lab', hours: 2.05, blockHours: 2.05 }]);
  assert.deepEqual(normalized.errors, []);
  const parsed = parseInstructions('Working days: Saturday, Sunday', DEFAULT_CONFIG);
  assert.deepEqual(parsed.errors, []);
  const result = generateTimetables(normalized.assignments, parsed.config);
  assert.ok(result.options.length);
  for (const option of result.options) {
    assert.equal(validateTimetable(option, normalized.assignments, parsed.config).valid, true);
    assert.equal(option.events[0].duration, 2.05);
    assert.ok(['Saturday', 'Sunday'].includes(option.events[0].day));
    assert.equal(option.events[0].start, '14:00');
    assert.equal(option.events[0].end, '16:03');
  }
});

test('a valid unavailable window on a nonteaching day is harmless', () => {
  const assignments = [row('1', { teacher: 'Dr. Example' })];
  const parsed = parseInstructions('Dr. Example unavailable Saturday 09:00-12:00', DEFAULT_CONFIG);
  const result = generateTimetables(assignments, parsed.config);
  assert.equal(result.options.length, 3);
  assert.ok(result.options.every(option => validateTimetable(option, assignments, parsed.config).valid));
});

test('unknown or malformed teaching days produce diagnostics instead of throwing', () => {
  for (const days of [['Funday'], 'Monday', []]) {
    const result = generateTimetables([row('1')], { ...config, days, teacherRules: [{ teacher: 'Teacher 1', unavailable: [{ day: 'Saturday', start: '09:00', end: '12:00' }] }] });
    assert.equal(result.options.length, 0);
    assert.ok(result.diagnostics.some(error => error.includes('teaching days')));
  }
});

test('one hundred imported assignments remain practical and globally conflict-free', () => {
  const normalized = normalizeAssignments(Array.from({ length: 100 }, (_, i) => ({
    department: `Department ${Math.floor(i / 20)}`, semester: 1 + Math.floor((i % 20) / 5) * 2,
    teacher: `Faculty ${i % 35}`, subject: `Course ${i}`, code: `C${i}`,
    type: i % 5 === 4 ? 'lab' : 'lecture', hours: i % 5 === 4 ? 2 : 3,
    blockHours: i % 5 === 4 ? 2 : 1, room: i % 5 === 4 ? `Lab ${i % 7}` : '',
  })));
  assert.deepEqual(normalized.errors, []);
  const start = performance.now();
  const result = generateTimetables(normalized.assignments, DEFAULT_CONFIG);
  const elapsed = performance.now() - start;
  assert.equal(result.options.length, 3);
  assert.ok(result.options.every(option => validateTimetable(option, normalized.assignments, DEFAULT_CONFIG).valid));
  assert.ok(elapsed < 3000, `Generation took ${elapsed}ms`);
});
