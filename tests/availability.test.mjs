import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTeacherBlocks, activeTeacherBlocks, teacherAvailability } from '../dist/availability.js';
import { DEFAULT_CONFIG, DEMO_ASSIGNMENTS, DEMO_BLOCKS } from '../dist/demo.js';

const config = overrides => ({ ...structuredClone(DEFAULT_CONFIG), weekStart: '2026-11-16', ...overrides });
const block = overrides => ({ id: 'block-1', teacher: 'Dr. Ananya Rao', title: 'Test duty', type: 'duty', day: 'Monday', start: '09:30', end: '10:30', date: '', ...overrides });
const event = overrides => ({ id: 'event-1', assignmentId: 'a-1', teacher: 'Dr. Ananya Rao', department: 'Computer Science', semester: 3, section: 'A', subject: 'Data Structures', type: 'lecture', day: 'Monday', start: '08:30', end: '09:30', ...overrides });
const mins = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

test('Fixed duties canonicalize teacher names, allow block-only teachers and may span breaks', () => {
  const result = normalizeTeacherBlocks([block({ teacher: ' dr. ananya RAO ', start: '10:00', end: '11:00' }), block({ id: 'external', teacher: 'Visiting examiner', day: 'Friday' })], { assignments: DEMO_ASSIGNMENTS, config: config() });
  assert.deepEqual(result.errors, []);
  assert.equal(result.blocks[0].teacher, 'Dr. Ananya Rao');
  assert.equal(result.blocks[1].teacher, 'Visiting examiner');
});

test('Dated duties derive weekdays and are active only in the selected Monday–Sunday week', () => {
  const dates = [block({ id: 'current', date: '2026-11-19', day: 'Monday' }), block({ id: 'future', date: '2026-11-26' }), block({ id: 'past', date: '2026-11-12' })];
  const normalized = normalizeTeacherBlocks(dates, { assignments: DEMO_ASSIGNMENTS, config: config() });
  assert.deepEqual(normalized.errors, []);
  assert.equal(normalized.blocks.length, 3, 'future and past records are retained');
  const active = activeTeacherBlocks(config({ teacherBlocks: normalized.blocks }));
  assert.equal(active.length, 1);
  assert.equal(active[0].id, 'current');
  assert.equal(active[0].day, 'Thursday');
  assert.equal(active[0].duration, 1);
  assert.equal(activeTeacherBlocks(config({ weekStart: '2026-11-23', teacherBlocks: normalized.blocks }))[0].id, 'future');
});

test('Malformed dates, invalid weeks, outside hours and same-teacher overlap are actionable errors', () => {
  for (const invalid of [block({ date: '2026-02-30' }), block({ start: '08:00' }), block({ end: '09:00' }), block({ day: 'Sunday' })]) {
    assert.ok(normalizeTeacherBlocks([invalid], { config: config() }).errors.length);
  }
  assert.ok(normalizeTeacherBlocks([block({ date: '2026-11-19' })], { config: config({ weekStart: '2026-11-19' }) }).errors.some(error => /Monday/.test(error)));
  const overlaps = normalizeTeacherBlocks([block(), block({ id: 'second', teacher: 'DR. ANANYA RAO', start: '10:00', end: '11:00' })], { config: config() });
  assert.ok(overlaps.errors.some(error => /overlaps/.test(error)));
  const differentTeacher = normalizeTeacherBlocks([block(), block({ id: 'second', teacher: 'Dr. Menon' })], { config: config() });
  assert.deepEqual(differentTeacher.errors, []);
});

test('Dated and recurring collisions respect actual occurrence rather than weekday alone', () => {
  const dates = [block({ id: 'week-a', date: '2026-11-16' }), block({ id: 'week-b', date: '2026-11-23' })];
  assert.deepEqual(normalizeTeacherBlocks(dates, { config: config() }).errors, []);
  const withRecurring = normalizeTeacherBlocks([...dates, block({ id: 'weekly' })], { config: config() });
  assert.equal(withRecurring.errors.filter(error => /overlaps/.test(error)).length, 2);
});

test('Availability covers every minute exactly once and never marks duties, breaks or absence free', () => {
  const settings = config({ days: ['Monday'], teacherBlocks: [block({ start: '10:00', end: '11:00' })], teacherRules: [{ teacher: 'Dr. Ananya Rao', availableStart: '09:30', unavailable: [{ day: 'Monday', start: '14:30', end: '15:00' }] }] });
  const result = teacherAvailability({ teacher: 'Dr. Ananya Rao', assignments: DEMO_ASSIGNMENTS, events: [event({ start: '11:00', end: '12:00' })], config: settings, generated: true });
  assert.equal(result.segments.reduce((total, segment) => total + mins(segment.end) - mins(segment.start), 0), 480);
  assert.equal(result.segments[0].start, '08:30');
  assert.equal(result.segments.at(-1).end, '16:30');
  result.segments.slice(1).forEach((segment, index) => assert.equal(segment.start, result.segments[index].end));
  assert.ok(result.segments.filter(segment => mins(segment.start) >= 600 && mins(segment.end) <= 660).every(segment => segment.status === 'duty'));
  assert.equal(result.summary.dutyHours, 1, 'duty counts through the short break');
  assert.equal(result.summary.lectureHours, 1);
  assert.equal(result.summary.availableHours, 3.75);
  assert.ok(result.segments.some(segment => segment.status === 'unavailable' && segment.start === '14:30'));
});

test('Unscheduled or stale views ignore old teaching events and never claim unallocated time is available', () => {
  const result = teacherAvailability({ teacher: 'Dr. Ananya Rao', assignments: DEMO_ASSIGNMENTS, events: [event()], config: config({ days: ['Monday'], teacherBlocks: [block()] }), generated: false });
  assert.equal(result.summary.lectureHours, 0);
  assert.equal(result.summary.earlyStarts, 0);
  assert.equal(result.summary.availableHours, 0);
  assert.equal(result.summary.dutyHours, 1);
  assert.ok(result.segments.some(segment => segment.status === 'unallocated'));
  assert.ok(!result.segments.some(segment => segment.status === 'available'));
});

test('Research and duty workload summaries distinguish flexible research, fixed research and exact early classes', () => {
  const result = teacherAvailability({ teacher: 'Dr. Ananya Rao', assignments: DEMO_ASSIGNMENTS, config: config({ days: ['Monday', 'Tuesday'], teacherBlocks: [block({ start: '13:30', end: '14:30', type: 'research', title: 'Research review' }), block({ id: 'meeting', day: 'Tuesday', start: '14:30', end: '15:30', type: 'other' })] }), generated: true, events: [event(), event({ id: 'lab', day: 'Tuesday', type: 'lab', start: '08:30', end: '10:30' }), event({ id: 'research', type: 'research', subject: 'Research writing', start: '14:30', end: '15:30' })] });
  assert.equal(result.summary.lectureHours, 1);
  assert.equal(result.summary.labHours, 2);
  assert.equal(result.summary.researchHours, 2);
  assert.equal(result.summary.dutyHours, 1);
  assert.equal(result.summary.earlyStarts, 2);
  const researchOnly = teacherAvailability({ teacher: 'Dr. Ananya Rao', config: config({ days: ['Monday'] }), events: [event({ type: 'research' })], generated: true });
  assert.equal(researchOnly.summary.earlyStarts, 0);
});

test('Entire unavailable days have no free minutes and demo commitments normalize', () => {
  const result = teacherAvailability({ teacher: 'Dr. Ananya Rao', config: config({ days: ['Friday'], teacherRules: [{ teacher: 'Dr. Ananya Rao', unavailableDays: ['Friday'] }] }), generated: true });
  assert.equal(result.summary.availableHours, 0);
  assert.ok(result.segments.every(segment => segment.status === 'unavailable'));
  assert.deepEqual(normalizeTeacherBlocks(DEMO_BLOCKS, { assignments: DEMO_ASSIGNMENTS, config: config() }).errors, []);
});
