import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as imports from '../dist/imports.js';
import * as demo from '../dist/demo.js';
import * as availability from '../dist/availability.js';
import * as workloads from '../dist/workload-ui.js';

const assignment = { id: 'a1', department: 'CSE', semester: 3, section: 'A', teacher: 'Dr. Rao', subject: 'Algorithms', code: 'CS301', type: 'lecture', hours: 1, blockHours: 1, room: 'C301' };
const oldConfig = { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], start: '09:00', end: '16:30', slotMinutes: 60, breaks: [{ name: 'Short break', start: '11:00', end: '11:15' }, { name: 'Lunch', start: '13:15', end: '14:00' }], maxTeacherHoursPerDay: 5, maxTeacherHoursPerWeek: 24, maxClassHoursPerDay: 6, teacherRules: [] };
const oldOption = { id: 'option-1', label: 'Balanced week', metrics: { requiredHours: 1 }, events: [{ ...assignment, id: 'event-1', assignmentId: assignment.id, day: 'Monday', start: '09:00', end: '10:00', duration: 1 }] };
const oldSnapshot = { id: 'saved-legacy', savedAt: 1794484800000, option: oldOption, config: oldConfig, assignments: [assignment], slots: [{ start: '09:00', end: '10:00', type: 'teaching' }], instructions: '', filename: 'original.csv', institution: 'Original College' };
const legacyState = { version: 1, assignments: [assignment], filename: 'original.csv', instructions: '', options: [oldOption], slots: oldSnapshot.slots, selected: 0, department: 'CSE', cohort: 'CSE::3::A', view: 'saved', saved: [oldSnapshot], institution: 'Original College', stale: false, resultAssignments: [assignment], resultConfig: oldConfig, resultInstructions: '', resultFilename: 'original.csv' };

// Execute the actual application event handlers with browser effects supplied by
// a small adapter. The assertions exercise state transitions and exported data.
const appSource = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replaceAll('import.meta.url', "'http://localhost/app.js'");
function boot(cached = legacyState) {
  const listeners = {}, rendered = [], downloads = [], storage = new Map([['semester-studio-v1', JSON.stringify(cached)]]);
  const element = () => ({ innerHTML: '', textContent: '', open: false, hidden: false, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, showModal() { this.open = true; }, close() { this.open = false; } });
  const elements = Object.fromEntries(['#app', '#dialog', '#toast', '#rule-summary', '#stale-notice', '#conflict-status', '#validation-button'].map(id => [id, element()]));
  const context = vm.createContext({
    ...imports, ...demo, ...availability, ...workloads,
    createWorkloadViews(dependencies) {
      const views = workloads.createWorkloadViews(dependencies);
      const render = views.availabilityPage;
      views.availabilityPage = (state, config, options) => { rendered.push({ config: structuredClone(config), stale: state.stale }); return render(state, config, options); };
      return views;
    },
    structuredClone, URL, console,
    setTimeout() { return 1; }, clearTimeout() {},
    crypto: { randomUUID: () => 'new-record' },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    document: { querySelector: selector => elements[selector] || null, querySelectorAll: () => [], addEventListener: (event, handler) => { listeners[event] = handler; } },
    FormData: class { constructor(form) { return Object.entries(form.values); } },
    window: {}, captureDownload: (content, name) => downloads.push({ content, name }),
  });
  vm.runInContext(appSource, context);
  vm.runInContext('download = captureDownload', context);
  const evaluate = code => vm.runInContext(code, context);
  const click = (action, id) => listeners.click({ target: { closest: () => ({ dataset: { action, id } }) } });
  const submit = (id, values, editId = '') => {
    const errors = element();
    listeners.submit({ preventDefault() {}, target: { id, values, dataset: { editId }, querySelector: () => errors } });
    return errors;
  };
  return { evaluate, click, submit, listeners, rendered, downloads };
}

test('Restoring instruction text after a manual workload edit cannot make old results current', () => {
  const app = boot();
  app.click('open-saved', oldSnapshot.id);
  assert.equal(app.evaluate('state.stale'), false);
  app.submit('workload-form', { ...assignment, semester: '3', hours: '2', blockHours: '1' }, assignment.id);
  assert.equal(app.evaluate('state.assignments[0].hours'), 2);
  assert.equal(app.evaluate('state.resultAssignments[0].hours'), 1);
  app.listeners.input({ target: { id: 'instructions', value: 'Maximum teacher hours per day: 4' } });
  app.listeners.input({ target: { id: 'instructions', value: '' } });
  assert.equal(app.evaluate('state.stale'), true);
  app.click('save');
  app.click('export-teacher');
  assert.equal(app.evaluate('state.saved.length'), 1, 'stale results cannot be saved');
  assert.equal(app.downloads.length, 0, 'stale availability cannot be exported');
});

test('Legacy saved plans survive migration and reopen with their original hours and breaks', () => {
  const app = boot();
  assert.equal(app.evaluate('state.saved.length'), 1);
  assert.equal(app.evaluate('state.stale'), true, 'legacy active results require review');
  app.click('open-saved', oldSnapshot.id);
  assert.equal(app.evaluate('state.stale'), false);
  assert.deepEqual(app.rendered.at(-1).config, oldConfig);
  assert.equal(app.evaluate('currentConfig().start'), '09:00');
  assert.equal(app.evaluate('currentConfig().breaks[0].start'), '11:00');
  app.listeners.change({ target: { id: 'planning-week', value: '2026-11-26' } });
  assert.equal(app.evaluate('state.weekStart'), '2026-11-23');
  assert.equal(app.evaluate('state.stale'), true);
  assert.equal(app.evaluate('currentConfig().start'), '09:00', 'editing the week retains the original plan defaults');
});

test('One-date duties require a date and exports preserve dated and recurring occurrences', () => {
  const app = boot();
  app.click('open-saved', oldSnapshot.id);
  const errors = app.submit('block-form', { teacher: 'Dr. Rao', title: 'Invigilation', type: 'duty', recurrence: 'dated', date: '', day: 'Thursday', start: '14:00', end: '15:00' });
  assert.equal(app.evaluate('state.teacherBlocks.length'), 0);
  assert.notEqual(errors.innerHTML, '', 'blank dated commitment reports an error');
  app.evaluate(`state.resultConfig={...state.resultConfig,weekStart:'2026-11-16',teacherBlocks:[
    {id:'dated',teacher:'Dr. Rao',title:'Current test',type:'duty',date:'2026-11-19',day:'Thursday',start:'14:00',end:'15:00'},
    {id:'future',teacher:'Dr. Rao',title:'Future test',type:'duty',date:'2026-11-26',day:'Thursday',start:'14:00',end:'15:00'},
    {id:'weekly',teacher:'Dr. Rao',title:'Weekly meeting',type:'other',date:'',day:'Tuesday',start:'14:00',end:'15:00'}
  ]};exportCSV(selected(),state.resultConfig)`);
  const rows = imports.parseCSV(app.downloads[0].content);
  const dated = rows.find(row => row.Subject === 'Current test');
  assert.equal(dated['Week beginning'], '2026-11-16');
  assert.equal(dated.Date, '2026-11-19');
  assert.equal(dated.Recurrence, 'One date only');
  assert.equal(rows.find(row => row.Subject === 'Weekly meeting').Recurrence, 'Weekly');
  assert.equal(rows.some(row => row.Subject === 'Future test'), false);
});
