import { activeTeacherBlocks, teacherAvailability } from './availability.js';

const norm = value => String(value || '').trim().toLowerCase();
const minutes = time => { const [h,m] = time.split(':').map(Number); return h*60+m; };
const hours = values => Math.round(values.reduce((n,v)=>n+Number(v.hours || 0),0)*100)/100;
const format = value => Math.round(Number(value || 0)*100)/100;
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const typeLabel = type => ({lecture:'Class',lab:'Lab',research:'Research',duty:'Test duty',other:'Other work',available:'Available',unallocated:'Unallocated',unavailable:'Unavailable',break:'Break'}[type] || type);
export function mondayFor(date) {
  const d = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay()+6)%7);
  return d.toISOString().slice(0,10);
}
export function currentMonday() {
  const now = new Date();
  return mondayFor(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`);
}
export function teacherNames(assignments, blocks = []) {
  const names = new Map();
  for (const row of [...assignments,...blocks]) if(norm(row.teacher)) names.set(norm(row.teacher), names.get(norm(row.teacher)) || row.teacher);
  return [...names.values()].sort((a,b)=>a.localeCompare(b));
}

export function createWorkloadViews({esc,icon}) {
  const option = (value,label,current) => `<option value="${esc(value)}" ${String(value)===String(current)?'selected':''}>${esc(label)}</option>`;
  const teacherList = state => `<datalist id="known-teachers">${teacherNames(state.assignments,state.teacherBlocks).map(t=>`<option value="${esc(t)}"></option>`).join('')}</datalist>`;
  function planningControls(state) {
    return `<section class="planning-controls card" aria-label="Week and early start policy">
      <label class="field"><span>Week beginning</span><input type="date" id="planning-week" value="${esc(state.weekStart)}" aria-label="Planning week"></label>
      <div class="early-policy"><label class="switch-line"><input type="checkbox" id="equal-starts" ${state.earlyStart.enabled?'checked':''}> Equal 8:30 a.m. starts</label><p>Classes and labs count. Research and duties do not.</p></div>
      <label class="field target-field"><span>Per teaching teacher / week</span><input id="early-target" type="number" min="1" max="7" step="1" value="${state.earlyStart.perTeacher}" ${!state.earlyStart.enabled?'disabled':''} aria-label="8:30 starts per teacher per week"></label>
    </section>`;
  }
  function workloadTable(rows) {
    return `<div class="table-scroll"><table class="data-table workload-table"><thead><tr><th>Teacher</th><th>Course / activity</th><th>Class</th><th>Type</th><th>Hours / week</th><th>Actions</th></tr></thead><tbody>${rows.length?rows.map(a=>`<tr><td>${esc(a.teacher)}<small>${esc(a.department)}</small></td><td>${esc(a.subject)}<small>${esc(a.code || (a.room ? `Room: ${a.room}` : ''))}</small></td><td>${a.type==='research'?'Teacher only':`Semester ${a.semester}<small>Section ${esc(a.section)}</small>`}</td><td><span class="activity-tag ${a.type}">${typeLabel(a.type)}</span></td><td><strong>${a.hours}h</strong><small>${a.blockHours}h sessions</small></td><td><div class="table-actions"><button class="button small" data-action="edit-workload" data-id="${esc(a.id)}" aria-label="Edit ${esc(a.subject)} for ${esc(a.teacher)}">Edit</button><button class="icon-button" data-action="delete-workload" data-id="${esc(a.id)}" aria-label="Remove ${esc(a.subject)} for ${esc(a.teacher)}">${icon('trash')}</button></div></td></tr>`).join(''):'<tr><td colspan="6">No matching workloads. Add an assignment or import a file.</td></tr>'}</tbody></table></div>`;
  }
  function blocksTable(state,config) {
    const active = new Set(activeTeacherBlocks(config).map(b=>b.id));
    return `<div class="table-scroll"><table class="data-table"><thead><tr><th>Teacher / activity</th><th>When</th><th>Time</th><th>This week</th><th>Actions</th></tr></thead><tbody>${state.teacherBlocks.length?state.teacherBlocks.map(b=>`<tr><td>${esc(b.teacher)}<small>${esc(b.title)} · ${typeLabel(b.type)}</small></td><td>${b.date?esc(b.date):`Every ${esc(b.day)}`}</td><td>${esc(b.start)}–${esc(b.end)}</td><td><span class="activity-tag ${active.has(b.id)?'duty':'inactive'}">${active.has(b.id)?'Blocked':'Different week'}</span></td><td><div class="table-actions"><button class="button small" data-action="edit-block" data-id="${esc(b.id)}" aria-label="Edit ${esc(b.title)}">Edit</button><button class="icon-button" data-action="delete-block" data-id="${esc(b.id)}" aria-label="Remove ${esc(b.title)}">${icon('trash')}</button></div></td></tr>`).join(''):'<tr><td colspan="5">No fixed commitments. Block test duty, meetings, or protected research time here.</td></tr>'}</tbody></table></div>`;
  }
  function workloadsPage(state,config,errorHTML='') {
    const teachers=teacherNames(state.assignments,state.teacherBlocks);
    return `<section class="page-heading"><div><div class="eyebrow">FACULTY WORKLOADS</div><h1>Give every hour a place.</h1><p>Enter course allocations directly, or import your department’s workload file.</p></div><div class="button-row"><button class="button" data-action="upload">${icon('upload')} Import file</button><button class="button primary" data-action="add-workload">+ Add workload</button></div></section>
      ${errorHTML}${planningControls(state)}
      <div class="workload-summary"><div class="card"><span>Teachers</span><strong>${teachers.length}</strong></div><div class="card"><span>Class hours / week</span><strong>${hours(state.assignments.filter(a=>a.type==='lecture'))}h</strong></div><div class="card"><span>Lab hours / week</span><strong>${hours(state.assignments.filter(a=>a.type==='lab'))}h</strong></div><div class="card"><span>Research hours / week</span><strong>${hours(state.assignments.filter(a=>a.type==='research'))}h</strong></div></div>
      <section class="card panel"><div class="panel-heading"><div><h2>Course & research allocations</h2><p>Required weekly hours are scheduled in full. Research belongs to a teacher, not a student class.</p></div><button class="button" data-action="export-workloads">${icon('download')} Export workloads</button></div><div class="data-toolbar"><input class="search-field" id="assignment-search" placeholder="Search teacher, course, department or semester…" aria-label="Search assignments"><button class="button" data-action="template">Template</button></div><div id="assignment-table">${workloadTable(state.assignments)}</div></section>
      <section class="card panel"><div class="panel-heading"><div><h2>Blocked duties & other work</h2><p>Fixed commitments reserve the teacher’s time. Dated duties affect only their selected week.</p></div><button class="button" data-action="add-block">+ Block time</button></div>${blocksTable(state,config)}</section>
      <div class="selection-banner"><div><strong>Ready to assign the week?</strong><p>Teacher limits count classes, labs, research, and active duties together.</p></div><button class="button primary" data-action="generate">${icon('spark')} Generate timetables</button></div>`;
  }
  function workloadForm(state,existing) {
    const a=existing||{teacher:state.teacher||'',department:'',subject:'',code:'',semester:3,section:'A',type:'lecture',hours:3,blockHours:1,room:''};
    return `<form id="workload-form" data-edit-id="${esc(existing?.id||'')}"><div class="form-errors" role="alert"></div><div class="form-grid">
      <label class="field"><span>Teacher</span><input name="teacher" list="known-teachers" required maxlength="160" value="${esc(a.teacher)}" placeholder="Select or enter a teacher"></label>
      <label class="field"><span>Department</span><input name="department" required maxlength="160" value="${esc(a.department)}" placeholder="e.g. Computer Science"></label>
      <label class="field"><span>Activity type</span><select name="type" id="workload-type">${['lecture','lab','research'].map(t=>option(t,typeLabel(t),a.type)).join('')}</select></label>
      <label class="field"><span>Course / research name</span><input name="subject" required maxlength="160" value="${esc(a.subject)}" placeholder="e.g. Data Structures"></label>
      <label class="field teaching-field"><span>Semester</span><select name="semester" ${a.type==='research'?'disabled':''}>${[1,2,3,4,5,6,7,8].map(n=>option(n,`Semester ${n}`,a.semester)).join('')}</select></label>
      <label class="field teaching-field"><span>Section</span><input name="section" maxlength="40" value="${esc(a.section||'A')}" ${a.type==='research'?'disabled':''}></label>
      <label class="field"><span>Required hours / week</span><input name="hours" type="number" min="0.25" max="60" step="0.25" required value="${a.hours}"></label>
      <label class="field"><span>Continuous session hours</span><input name="blockHours" type="number" min="0.25" max="8" step="0.25" required value="${a.blockHours}"></label>
      <label class="field"><span>Course code <small>(optional)</small></span><input name="code" maxlength="40" value="${esc(a.code)}"></label>
      <label class="field"><span>Room <small>(optional)</small></span><input name="room" maxlength="80" value="${esc(a.room)}"></label>
      </div>${teacherList(state)}<p class="form-note">Hours are clock hours. Lab and research blocks are protected from teaching clashes. Research does not occupy a semester’s classroom timetable.</p><div class="form-actions"><button type="button" class="button" data-action="close-dialog">Cancel</button><button type="submit" class="button primary">${existing?'Save changes':'Add workload'}</button></div></form>`;
  }
  function blockForm(state,existing) {
    const b=existing||{teacher:state.teacher||teacherNames(state.assignments)[0]||'',title:'',type:'duty',day:'Monday',start:'13:30',end:'14:30',date:''};
    return `<form id="block-form" data-edit-id="${esc(existing?.id||'')}"><div class="form-errors" role="alert"></div><div class="form-grid">
      <label class="field"><span>Teacher</span><input name="teacher" list="known-teachers" required maxlength="160" value="${esc(b.teacher)}"></label>
      <label class="field"><span>Commitment type</span><select name="type">${['duty','research','other'].map(t=>option(t,typeLabel(t),b.type)).join('')}</select></label>
      <label class="field wide"><span>Activity name</span><input name="title" required maxlength="160" value="${esc(b.title)}" placeholder="e.g. Internal assessment invigilation"></label>
      <label class="field"><span>Repeat</span><select name="recurrence" id="block-recurrence">${option('weekly','Every week',b.date?'dated':'weekly')}${option('dated','One date only',b.date?'dated':'weekly')}</select></label>
      <label class="field" id="block-day-field" ${b.date?'hidden':''}><span>Day</span><select name="day">${DAYS.map(d=>option(d,d,b.day)).join('')}</select></label>
      <label class="field" id="block-date-field" ${!b.date?'hidden':''}><span>Date</span><input name="date" type="date" ${b.date?'required':''} value="${esc(b.date||state.weekStart)}"></label>
      <label class="field"><span>From</span><input name="start" type="time" required value="${esc(b.start)}"></label>
      <label class="field"><span>Until</span><input name="end" type="time" required value="${esc(b.end)}"></label>
      </div>${teacherList(state)}<p class="form-note">This is a fixed reservation. Any existing timetable becomes out of date until regenerated. Overlapping commitments for the same teacher are flagged.</p><div class="form-actions"><button type="button" class="button" data-action="close-dialog">Cancel</button><button type="submit" class="button primary">${existing?'Save block':'Block this time'}</button></div></form>`;
  }
  function availabilityPage(state,config,{busy,errorHTML='',option:chosen}={}) {
    const teachers=teacherNames(state.assignments,state.teacherBlocks);
    if(!teachers.includes(state.teacher))state.teacher=teachers[0]||'';
    const generated=!!chosen&&!state.stale&&!busy;
    const events=generated?chosen.events:[];
    const availability=teacherAvailability({teacher:state.teacher,assignments:state.assignments,events,config,generated});
    const summary=availability.summary;
    const teacherRows=state.assignments.filter(a=>norm(a.teacher)===norm(state.teacher));
    const blocks=activeTeacherBlocks(config).filter(b=>norm(b.teacher)===norm(state.teacher));
    const titleDate=new Date(`${state.weekStart}T12:00:00Z`).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
    const assignments=teacherRows.map(a=>`<div class="teacher-work-row"><span><b>${esc(a.subject)}</b><small>${a.type==='research'?'Research':`Sem ${a.semester} · ${esc(a.section)}`} · ${a.hours}h / week</small></span><span class="activity-tag ${a.type}">${typeLabel(a.type)}</span></div>`).join('');
    const countEvents=chosen?.events||[];
    const teachingTeachers=teacherNames(state.assignments.filter(a=>a.type!=='research'));
    const counts=teachingTeachers.map(teacher=>({teacher,count:countEvents.filter(e=>norm(e.teacher)===norm(teacher)&&['lecture','lab'].includes(e.type)&&e.start==='08:30').length}));
    const isEqual=generated&&counts.every(c=>c.count===state.earlyStart.perTeacher);
    return `<section class="page-heading"><div><div class="eyebrow">TEACHER AVAILABILITY</div><h1>A clear view of every teacher.</h1><p>Classes, labs, research and duties, together in one weekly schedule.</p></div><div class="button-row"><button class="button" data-action="add-block">${icon('lock')} Block time</button><button class="button primary" data-action="generate" ${busy?'disabled':''}>${icon(busy?'refresh':'spark',busy?'spin':'')} ${busy?'Generating…':'Generate timetables'}</button></div></section>
      ${errorHTML}${planningControls(state)}
      ${!generated?`<div class="notice ${state.stale?'warning':''}">${icon('info')} <span>${busy?'Building schedules against workloads, duty blocks and equal early starts.':state.stale?'The inputs changed. Teaching allocations are hidden until you regenerate. Blocked times below are current.':'Generate a timetable to see scheduled teaching and confirmed free time. Unallocated slots are provisional.'}</span></div>`:''}
      <section class="card teacher-header"><div class="teacher-identity"><span class="teacher-avatar">${esc(state.teacher.split(' ').filter(w=>!/^Dr\.?$|^Prof\.?$/.test(w)).map(w=>w[0]).slice(0,2).join(''))||'—'}</span><div><label for="teacher-select">Viewing teacher</label><select id="teacher-select" aria-label="Select teacher">${teachers.length?teachers.map(t=>option(t,t,state.teacher)).join(''):'<option>No teachers yet</option>'}</select></div></div><div><strong>Week of ${esc(titleDate)}</strong><p>${generated?esc(chosen.label):'Availability draft'} · ${config.start}–${config.end}</p></div><button class="button" data-action="export-teacher" ${!generated?'disabled':''}>${icon('download')} Export teacher week</button></section>
      <div class="workload-summary teacher-metrics"><div class="card"><span>Classes</span><strong>${format(generated?summary.lectureHours:hours(teacherRows.filter(a=>a.type==='lecture')))}h</strong><small>${generated?'Scheduled':'Required weekly'}</small></div><div class="card"><span>Labs</span><strong>${format(generated?summary.labHours:hours(teacherRows.filter(a=>a.type==='lab')))}h</strong><small>${generated?'Scheduled':'Required weekly'}</small></div><div class="card"><span>Research</span><strong>${format(generated?summary.researchHours:hours(teacherRows.filter(a=>a.type==='research'))+summary.researchHours)}h</strong><small>${generated?'Scheduled':'Required weekly'}</small></div><div class="card"><span>Duties & other work</span><strong>${format(summary.dutyHours)}h</strong><small>Blocked this week</small></div><div class="card"><span>${generated?'Available':'Unallocated'}</span><strong>${generated?`${format(summary.availableHours)}h`:'—'}</strong><small>${generated?'Free within availability':'Generate to confirm'}</small></div></div>
      <section class="card teacher-calendar"><div class="panel-heading"><h2>Weekly availability</h2><div class="activity-legend">${['lecture','lab','research','duty','available'].map(t=>`<span><i class="${t}"></i>${typeLabel(t)}</span>`).join('')}</div></div>${availabilityGrid(availability.segments,config,generated)}</section>
      <div class="teacher-detail-layout"><section class="card panel"><div class="panel-heading"><h2>Assigned workload</h2><button class="button small" data-action="add-workload">+ Add</button></div>${assignments||'<p>No course or research workload entered for this teacher.</p>'}<div class="teacher-work-row total"><b>Total required</b><strong>${hours(teacherRows)}h / week</strong></div></section>
      <section class="card panel"><div class="panel-heading"><h2>Fixed commitments</h2><button class="button small" data-action="add-block">+ Block time</button></div>${blocks.map(b=>`<button class="teacher-block-row" data-action="edit-block" data-id="${esc(b.id)}"><span><b>${esc(b.title)}</b><small>${esc(b.day)} · ${b.start}–${b.end}${b.date?` · ${b.date}`:' · Weekly'}</small></span><span class="activity-tag ${b.type}">${typeLabel(b.type)}</span></button>`).join('')||'<p>No fixed commitments for this teacher this week.</p>'}</section></div>
      <section class="card panel fairness-panel"><div class="panel-heading"><div><h2>8:30 a.m. teaching distribution</h2><p>${state.earlyStart.enabled?`Exactly ${state.earlyStart.perTeacher} start${state.earlyStart.perTeacher===1?'':'s'} per teaching teacher per week. Research and fixed duties are excluded.`:'Equal-start enforcement is off. Counts below reflect the generated schedule.'}</p></div><span class="status-pill ${generated&&state.earlyStart.enabled&&!isEqual?'warning':''}">${generated?(state.earlyStart.enabled?(isEqual?'Equal allocation verified':'Allocation differs'):'Rule disabled'):'Awaiting generation'}</span></div><div class="fairness-grid">${counts.map(c=>`<div class="fairness-person"><span>${esc(c.teacher)}</span><b>${generated?c.count:'—'}<small>${state.earlyStart.enabled?` / ${state.earlyStart.perTeacher}`:''}</small></b></div>`).join('')}</div></section>`;
  }
  function availabilityGrid(segments,config,generated) {
    const boundaries=[...new Set([config.start,config.end,...segments.flatMap(s=>[s.start,s.end])])].filter(t=>minutes(t)>=minutes(config.start)&&minutes(t)<=minutes(config.end)).sort((a,b)=>minutes(a)-minutes(b));
    if(boundaries.length<2)return '<div class="empty-state"><p>Set valid college hours to show availability.</p></div>';
    let cells=`<div class="availability-day time">TIME</div>${config.days.map(day=>`<div class="availability-day">${esc(day)}</div>`).join('')}`;
    boundaries.slice(0,-1).forEach((time,i)=>{cells+=`<div class="availability-time" style="grid-column:1;grid-row:${i+2}">${time}<small>${boundaries[i+1]}</small></div>`;});
    for(const s of segments){const col=config.days.indexOf(s.day)+2,start=boundaries.indexOf(s.start)+2,end=boundaries.indexOf(s.end)+2;if(col<2||start<2||end<=start)continue;
      const details=s.status==='available'?'No scheduled work':s.status==='unallocated'?'Teaching not generated':s.status==='unavailable'?'Outside teacher availability':s.status==='break'?'Protected break':['lecture','lab'].includes(s.status)?`Sem ${s.semester} · ${s.section}${s.room?' · '+s.room:''}`:`${s.start}–${s.end}`;
      cells+=`<div class="availability-slot ${esc(s.status)} ${minutes(s.end)-minutes(s.start)<=30?'short':''}" style="grid-column:${col};grid-row:${start}/${end}" title="${esc(`${s.day} ${s.start}–${s.end}: ${s.title||typeLabel(s.status)}`)}"><span class="slot-type">${typeLabel(s.status)}</span><strong>${esc(s.title||typeLabel(s.status))}</strong><small>${esc(details)}</small></div>`;
    }
    return `<div class="calendar-scroll"><div class="availability-grid" style="grid-template-columns:76px repeat(${config.days.length},minmax(145px,1fr));grid-template-rows:48px ${boundaries.slice(0,-1).map((t,i)=>`${Math.max(52,(minutes(boundaries[i+1])-minutes(t))*1.6)}px`).join(' ')}">${cells}</div></div><div class="calendar-bottom"><span>${generated?'Free time excludes breaks, duties, research and teacher unavailability. Workload limits still apply to new allocations.':'Unallocated time is provisional until a valid timetable is generated.'}</span></div>`;
  }
  return {planningControls,workloadsPage,workloadTable,workloadForm,blockForm,availabilityPage};
}
