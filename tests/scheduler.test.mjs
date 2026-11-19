import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTimetables, validateTimetable } from '../dist/scheduler.js';
import { normalizeAssignments, parseInstructions } from '../dist/imports.js';
import { DEMO_ASSIGNMENTS, DEFAULT_CONFIG, DEFAULT_INSTRUCTIONS, DEMO_BLOCKS } from '../dist/demo.js';
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

test('the shipped demo and pasted instructions generate complete teaching and research alternatives with equal early starts', () => {
  const parsed = parseInstructions(DEFAULT_INSTRUCTIONS, DEFAULT_CONFIG);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.unrecognized, []);
  assert.ok(parsed.recognized.length >= 8);
  parsed.config.teacherBlocks = DEMO_BLOCKS;
  const result = generateTimetables(DEMO_ASSIGNMENTS, parsed.config);
  assert.equal(result.options.length, 3);
  for (const option of result.options) {
    assert.equal(option.metrics.scheduledHours, DEMO_ASSIGNMENTS.reduce((total, row) => total + row.hours, 0));
    assert.equal(option.metrics.researchHours, 4);
    assert.equal(option.metrics.earlyStartEqual, true);
    assert.ok(option.metrics.earlyStarts.every(early => early.count === 1 && early.target === 1));
    assert.equal(option.blocks.length, DEMO_BLOCKS.length);
    assert.equal(validateTimetable(option, DEMO_ASSIGNMENTS, parsed.config).valid, true);
    assert.ok(option.events.filter(event => event.teacher === 'Dr. Ananya Rao').every(event => event.day !== 'Friday'));
  }
});

test('fractional clock hours preserve exact minute durations on weekend teaching days', () => {
  const normalized = normalizeAssignments([{ department: 'Computer Science', semester: 2, teacher: 'Dr. Example', subject: 'Workshop', type: 'lab', hours: 2.05, blockHours: 2.05 }]);
  assert.deepEqual(normalized.errors, []);
  const parsed = parseInstructions('Working days: Saturday, Sunday', config);
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
  const parsed = parseInstructions('Dr. Example unavailable Saturday 09:00-12:00', config);
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

const fairConfig = {
  ...config, start: '08:30', weekStart: '2026-11-16',
  breaks: [{ name: 'Short break', start: '10:30', end: '10:45' }, { name: 'Lunch', start: '12:45', end: '13:30' }],
  earlyStart: { enabled: true, time: '08:30', perTeacher: 1 },
};
const block = (id, changes = {}) => ({ id, teacher: 'Teacher 1', title: 'Exam duty', type: 'duty', day: 'Monday', start: '09:00', end: '10:00', date: '', ...changes });

test('exact early-start fairness shares class morning slots and excludes research-only teachers', () => {
  const assignments = [row('1'), row('2'), row('3'), row('r', { teacher: 'Research Fellow', type: 'research', semester: null, section: '', hours: 4 })];
  const result = generateTimetables(assignments, fairConfig);
  assert.equal(result.options.length, 3);
  for (const option of result.options) {
    assert.equal(validateTimetable(option, assignments, fairConfig).valid, true);
    assert.equal(option.metrics.earlyStartEqual, true);
    assert.equal(option.metrics.earlyStarts.length, 3);
    assert.ok(option.metrics.earlyStarts.every(early => early.count === 1 && early.target === 1));
    const earlyTeaching = option.events.filter(event => event.type !== 'research' && event.start === '08:30');
    assert.equal(new Set(earlyTeaching.map(event => event.day)).size, 3);
  }
});

test('a configurable target of two early starts is exact rather than a minimum or soft preference', () => {
  const assignments = [row('1'), row('2')];
  const configured = { ...fairConfig, earlyStart: { enabled: true, time: '08:30', perTeacher: 2 } };
  const result = generateTimetables(assignments, configured);
  assert.equal(result.options.length, 3);
  assert.ok(result.options.every(option => option.metrics.earlyStarts.every(early => early.count === 2)));
  assert.ok(result.options.every(option => validateTimetable(option, assignments, configured).valid));
});

test('morning unavailability, duties, invalid targets and insufficient shared-class mornings never relax fairness', () => {
  const cases = [
    { assignments: [row('1')], config: { ...fairConfig, teacherRules: [{ teacher: 'Teacher 1', availableStart: '09:30' }] }, match: /Teacher 1 needs exactly 1 teaching starts at 08:30/ },
    { assignments: [row('1')], config: { ...fairConfig, teacherBlocks: config.days.map((day, index) => block(`b${index}`, { day, start: '08:30', end: '09:30' })) }, match: /morning availability, fixed duties/ },
    { assignments: [row('1'), row('2'), row('3')], config: { ...fairConfig, earlyStart: { enabled: true, time: '08:30', perTeacher: 2 } }, match: /only 5 morning slots/ },
    { assignments: [row('1', { hours: 1 })], config: { ...fairConfig, earlyStart: { enabled: true, time: '08:30', perTeacher: 2 } }, match: /needs exactly 2/ },
    { assignments: [row('1')], config: { ...fairConfig, earlyStart: { enabled: true, time: '08:30', perTeacher: 0 } }, match: /whole number from 1/ },
    { assignments: [row('1')], config: { ...fairConfig, earlyStart: { enabled: true, time: '09:00', perTeacher: 1 } }, match: /college day to begin at 09:00/ },
  ];
  for (const example of cases) {
    const result = generateTimetables(example.assignments, example.config);
    assert.equal(result.options.length, 0);
    assert.match(result.diagnostics.join(' '), example.match);
  }
});

test('teachers competing for the same sole available morning receive an explicit unsatisfied fairness result', () => {
  const assignments = [row('1', { hours: 1 }), row('2', { hours: 1 })];
  const configured = { ...fairConfig, teacherRules: ['Teacher 1', 'Teacher 2'].map(teacher => ({ teacher, unavailableDays: ['Tuesday', 'Wednesday', 'Thursday', 'Friday'] })) };
  const result = generateTimetables(assignments, configured);
  assert.equal(result.options.length, 0);
  assert.match(result.diagnostics.join(' '), /exactly 1 start at 08:30/);
});

test('research has no class resource or class daily limit, while teacher occupancy remains exclusive', () => {
  const research = [row('r1', { type: 'research', semester: null, section: '', hours: 1 }), row('r2', { type: 'research', semester: null, section: '', hours: 1 })];
  const narrow = { ...config, days: ['Monday'], start: '09:00', end: '10:00', breaks: [], maxClassHoursPerDay: 0.5 };
  const simultaneous = generateTimetables(research, narrow);
  assert.ok(simultaneous.options.length);
  assert.ok(simultaneous.options[0].events.every(event => event.start === '09:00' && event.semester === null && event.section === ''));
  assert.equal(validateTimetable(simultaneous.options[0], research, narrow).valid, true);
  const mixed = [row('1', { hours: 1 }), row('r', { teacher: 'Teacher 1', type: 'research', semester: null, section: '', hours: 1 })];
  const mixedConfig = { ...narrow, end: '11:00', maxClassHoursPerDay: 1 };
  const result = generateTimetables(mixed, mixedConfig);
  assert.ok(result.options.length);
  assert.equal(new Set(result.options[0].events.map(event => event.start)).size, 2);
  assert.equal(validateTimetable(result.options[0], mixed, mixedConfig).valid, true);
  const tampered = structuredClone(result.options[0]);
  tampered.events[1].start = tampered.events[0].start;
  tampered.events[1].end = tampered.events[0].end;
  assert.equal(validateTimetable(tampered, mixed, mixedConfig).valid, false);
});

test('fixed duties prevent labs crossing their windows and are returned separately from assignment events', () => {
  const assignments = [row('1', { type: 'lab', hours: 2, blockHours: 2 })];
  const configured = { ...config, days: ['Monday'], start: '09:00', end: '13:00', breaks: [], teacherBlocks: [block('b1', { start: '10:00', end: '11:00' })] };
  const result = generateTimetables(assignments, configured);
  assert.equal(result.options.length, 1);
  const option = result.options[0];
  assert.equal(option.events.length, 1);
  assert.equal(option.events[0].start, '11:00');
  assert.equal(option.events[0].end, '13:00');
  assert.equal(option.blocks.length, 1);
  assert.equal(option.metrics.fixedHours, 1);
  assert.equal(option.metrics.totalWorkloadHours, 3);
  assert.equal(validateTimetable(option, assignments, configured).valid, true);
});

test('duties can span college breaks and their whole clock duration counts as workload', () => {
  const assignments = [row('1', { hours: 1 })];
  const configured = { ...config, days: ['Monday'], teacherBlocks: [block('b1', { start: '10:30', end: '11:30' })] };
  const result = generateTimetables(assignments, configured);
  assert.ok(result.options.length);
  assert.equal(result.options[0].metrics.fixedHours, 1);
  assert.equal(result.options[0].metrics.totalWorkloadHours, 2);
  assert.equal(validateTimetable(result.options[0], assignments, configured).valid, true);
});

test('dated blocks apply only in their selected week and derive the weekday from the date', () => {
  const assignments = [row('1', { hours: 1 })];
  const configured = { ...config, weekStart: '2026-11-16', teacherBlocks: [block('dated', { day: 'Monday', date: '2026-11-18' })] };
  const current = generateTimetables(assignments, configured);
  assert.ok(current.options.length);
  assert.equal(current.options[0].blocks[0].day, 'Wednesday');
  assert.equal(current.options[0].metrics.fixedHours, 1);
  const laterConfig = { ...configured, weekStart: '2026-11-23' };
  const later = generateTimetables(assignments, laterConfig);
  assert.ok(later.options.length);
  assert.equal(later.options[0].blocks.length, 0);
  assert.equal(later.options[0].metrics.fixedHours, 0);
  assert.equal(validateTimetable(later.options[0], assignments, laterConfig).valid, true);
});

test('workload caps include teaching, research and active fixed blocks, including block-only teachers', () => {
  const assignments = [row('1', { hours: 1 }), row('r', { teacher: 'Teacher 1', type: 'research', semester: null, section: '', hours: 1 })];
  const weekly = generateTimetables(assignments, { ...config, maxTeacherHoursPerWeek: 2, teacherBlocks: [block('b')] });
  assert.equal(weekly.options.length, 0);
  assert.match(weekly.diagnostics.join(' '), /3 workload hours, including 1 fixed hours/);
  const daily = generateTimetables([row('1', { hours: 1 })], { ...config, days: ['Monday'], maxTeacherHoursPerDay: 1, teacherBlocks: [block('b')] });
  assert.equal(daily.options.length, 0);
  assert.match(daily.diagnostics.join(' '), /capacity for only 0/);
  const blockOnly = generateTimetables([row('1', { hours: 1 })], { ...config, maxTeacherHoursPerDay: 1, teacherBlocks: [block('b', { teacher: 'Visiting Examiner', start: '09:00', end: '11:00' })] });
  assert.equal(blockOnly.options.length, 0);
  assert.match(blockOnly.diagnostics.join(' '), /Visiting Examiner's fixed blocks exceed/);
});

test('malformed, overlapping and out-of-hours fixed blocks fail before generation', () => {
  const examples = [
    { blocks: [block('a'), block('b', { start: '09:30', end: '10:30' })], match: /overlaps/ },
    { blocks: [block('a', { start: '08:00' })], match: /college hours/ },
    { blocks: [block('a', { date: '2026-02-30' })], match: /valid YYYY-MM-DD/ },
  ];
  for (const example of examples) {
    const result = generateTimetables([row('1')], { ...config, weekStart: '2026-11-16', teacherBlocks: example.blocks });
    assert.equal(result.options.length, 0);
    assert.match(result.diagnostics.join(' '), example.match);
  }
});

test('independent validation rejects removed fixed blocks, duty collisions and unfair altered event times', () => {
  const assignments = [row('1', { hours: 1 })];
  const configured = { ...fairConfig, teacherBlocks: [block('b', { start: '09:30', end: '10:30' })] };
  const result = generateTimetables(assignments, configured);
  assert.ok(result.options.length);
  const omitted = { ...result.options[0], blocks: [] };
  assert.match(validateTimetable(omitted, assignments, configured).errors.join(' '), /fixed blocks do not match/);
  const collision = structuredClone(result.options[0]);
  collision.events[0].day = 'Monday'; collision.events[0].start = '09:30'; collision.events[0].end = '10:30';
  const validation = validateTimetable(collision, assignments, configured);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(' '), /double-booked/);
  assert.match(validation.errors.join(' '), /exactly 1 are required/);
  assert.equal(validation.metrics.earlyStartEqual, false);
  // A forged summary cannot bypass the independent event recount.
  collision.metrics.earlyStartEqual = true;
  assert.equal(validateTimetable(collision, assignments, configured).metrics.earlyStartEqual, false);
});

test('near-zero positive durations are rejected instead of creating zero-minute scheduling tasks', () => {
  for (const changes of [{ hours: 0.5, blockHours: 1e-9 }, { hours: 1e-9, blockHours: 1 }]) {
    const result = generateTimetables([row('1', changes)], config);
    assert.equal(result.options.length, 0);
    assert.match(result.diagnostics.join(' '), /whole.*minutes/);
  }
});
