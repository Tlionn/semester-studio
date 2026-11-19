import { parseCSV, normalizeAssignments, parseInstructions, TEMPLATE_CSV } from './imports.js';
import { DEMO_ASSIGNMENTS, DEMO_FILENAME, DEFAULT_CONFIG, DEFAULT_INSTRUCTIONS, DEMO_BLOCKS } from './demo.js';
import { normalizeTeacherBlocks, activeTeacherBlocks, teacherAvailability } from './availability.js';
import { createWorkloadViews, currentMonday, mondayFor, teacherNames } from './workload-ui.js';

const paths = {
 grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2m-8 3h2"/>',
 users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
 bookmark:'<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4Z"/>',
 settings:'<path d="m9 3-.5 3-2 1L4 6 2 10l2 2v2l-2 2 2 4 3-1 2 1 .5 2h5l.5-3 2-1 3 1 2-4-2-2v-2l2-2-2-4-3 1-2-1-.5-3Z" transform="translate(0 -1) scale(.95)"/><circle cx="12" cy="11" r="3"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>', down:'<path d="m6 9 6 6 6-6"/>',
 check:'<path d="m5 12 4 4L19 6"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
 download:'<path d="M12 3v13m-5-5 5 5 5-5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
 file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8m-8 4h6"/>',
 spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 shield:'<path d="m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6Z"/><path d="m8 12 3 3 5-6"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4m.1 3h.01"/>',
 leaf:'<path d="M20 3C6 2 2 8 5 15c4 8 16 4 15-12ZM5 20 16 9M8 17v-5m0 5h5"/>',
 building:'<path d="M4 21V8l8-5 8 5v13M2 21h20M9 21v-5h6v5M8 9h1m6 0h1m-8 3h1m6 0h1"/>',
 coffee:'<path d="M4 8h13v9a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Zm13 1h2a3 3 0 0 1 0 6h-2M7 2v2m4-2v2m4-2v2"/>',
 expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
 print:'<path d="M6 8V3h12v5M6 17H3V9h18v8h-3M6 14h12v7H6Zm11-3h1"/>',
 refresh:'<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M5 16a8 8 0 0 0 13 2"/>',
 book:'<path d="M12 5v16M3 3l9 2 9-2v16l-9 2-9-2Z"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
 user:'<circle cx="12" cy="8" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>'
};
const icon = (name, cls='') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uniq = values => [...new Set(values)];
const minute = value => {const [h,m] = value.split(':').map(Number);return h*60+m;};
const cohortKey = a => `${a.department}::${a.semester}::${a.section || 'A'}`;
const shortTeacher = name => name.replace(/^(Dr\.?|Prof\.?)\s*/i,'');
const views = createWorkloadViews({esc,icon});
const teaching = rows => rows.filter(a=>a.type!=='research');
const storageKey = 'semester-studio-v1';
const record = value => value && typeof value==='object' && !Array.isArray(value);
const clockString = value => typeof value==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const validAssignment = value => record(value) && ['id','department','teacher','subject','section','room','code'].every(key=>typeof value[key]==='string') && (value.type==='research'?value.semester===null:Number.isInteger(value.semester) && value.semester>=1 && value.semester<=8) && ['lecture','lab','research'].includes(value.type) && Number.isFinite(value.hours) && value.hours>0 && Number.isFinite(value.blockHours) && value.blockHours>0;
const validConfig = value => record(value) && Array.isArray(value.days) && value.days.length>0 && value.days.every(day=>['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].includes(day)) && clockString(value.start) && clockString(value.end) && Array.isArray(value.breaks) && value.breaks.every(b=>record(b)&&typeof b.name==='string'&&clockString(b.start)&&clockString(b.end)) && Array.isArray(value.teacherRules) && ['slotMinutes','maxTeacherHoursPerDay','maxTeacherHoursPerWeek','maxClassHoursPerDay'].every(key=>Number.isFinite(value[key])&&value[key]>0);
const validSlots = value => Array.isArray(value) && value.every(slot=>record(slot)&&clockString(slot.start)&&clockString(slot.end));
const validOption = value => record(value) && typeof value.id==='string' && typeof value.label==='string' && record(value.metrics) && Number.isFinite(value.metrics.requiredHours) && Array.isArray(value.events) && value.events.every(e=>record(e)&&['id','assignmentId','department','section','subject','teacher','type','room','day','code'].every(key=>typeof e[key]==='string')&&(e.type==='research'?e.semester===null:Number.isInteger(e.semester))&&clockString(e.start)&&clockString(e.end));
const validSnapshot = value => record(value) && typeof value.id==='string' && Number.isFinite(value.savedAt) && ['instructions','filename','institution'].every(key=>typeof value[key]==='string') && Array.isArray(value.assignments) && value.assignments.every(validAssignment) && validOption(value.option) && validConfig(value.config) && validSlots(value.slots);
function validCache(value){return record(value)&&[1,2].includes(value.version)&&Array.isArray(value.assignments)&&value.assignments.every(validAssignment)&&Array.isArray(value.options)&&value.options.every(validOption)&&validSlots(value.slots)&&Array.isArray(value.saved)&&value.saved.every(validSnapshot)&&['filename','instructions','institution','department','cohort'].every(key=>typeof value[key]==='string')&&['builder','assignments','saved','availability'].includes(value.view)&&Number.isInteger(value.selected)&&value.selected>=0&&typeof value.stale==='boolean'&&(!value.options.length||(Array.isArray(value.resultAssignments)&&value.resultAssignments.every(validAssignment)&&validConfig(value.resultConfig)))&&['resultInstructions','resultFilename'].every(key=>value[key]===undefined||typeof value[key]==='string');}
let cached; try { const candidate=JSON.parse(localStorage.getItem(storageKey));if(validCache(candidate))cached=candidate; } catch {}
let state = {teacher:'Dr. Ananya Rao',teacherBlocks:structuredClone(cached?[]:DEMO_BLOCKS),weekStart:currentMonday(),earlyStart:{enabled:true,time:'08:30',perTeacher:1},assignments:structuredClone(DEMO_ASSIGNMENTS),filename:DEMO_FILENAME,instructions:DEFAULT_INSTRUCTIONS,options:[],slots:[],selected:0,department:'Computer Science',cohort:'Computer Science::3::A',view:'availability',saved:[],institution:'Engineering College',stale:false,...cached};
if(!Array.isArray(state.teacherBlocks))state.teacherBlocks=[];
if(!/^\d{4}-\d{2}-\d{2}$/.test(state.weekStart||'')||!mondayFor(state.weekStart))state.weekStart=currentMonday();
if(!state.earlyStart||typeof state.earlyStart.enabled!=='boolean'||!Number.isInteger(state.earlyStart.perTeacher)||state.earlyStart.perTeacher<1||state.earlyStart.perTeacher>7)state.earlyStart={enabled:true,time:'08:30',perTeacher:1};
state.earlyStart.time='08:30';
if(cached?.version===1){if(state.instructions===`College hours: 09:00-16:30
Working days: Monday-Friday
Short break: 11:00-11:15
Lunch: 13:15-14:00
Maximum teacher hours per day: 5
Maximum teacher hours per week: 24
Maximum class hours per day: 6
Dr. Ananya Rao unavailable on Friday`)state.instructions=DEFAULT_INSTRUCTIONS;state.stale=!!state.options.length;state.view='availability';}
if(state.options.length){state.resultInstructions??=state.instructions;state.resultFilename??=state.filename;if(planSignature()!==state.resultPlan)state.stale=true;}
let busy=false, errors=[], warnings=[], full=false, worker=null, requestId=0, importRequestId=0, timeout, toastTimer;
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
function persist(){try{localStorage.setItem(storageKey,JSON.stringify({...state,version:2}));}catch{toast('Browser storage is full. Export your timetable to keep a copy.');}}
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500);}
function selected(){return state.options[state.selected] || state.options[0];}
function stats(){return {teachers:uniq(state.assignments.map(a=>a.teacher)).length,subjects:state.assignments.length,semesters:uniq(teaching(state.assignments).map(a=>a.semester)).length,cohorts:uniq(teaching(state.assignments).map(cohortKey)).length};}
function brand(){return '<span class="brand-mark"><i></i><i></i><i></i><i></i></span><span>semester.</span>';}
function navButton(view, name, ico){return `<button data-action="nav" data-view="${view}" class="${state.view===view?'active':''}" ${state.view===view?'aria-current="page"':''}>${icon(ico)}<span>${name}</span>${view==='saved'?`<span class="count-badge">${state.saved.length}</span>`:''}</button>`;}
function cancelGeneration(){worker?.terminate();worker=null;clearTimeout(timeout);timeout=null;requestId++;busy=false;}
function baseConfig(){return {...structuredClone(state.baseSettings||DEFAULT_CONFIG),teacherRules:[],weekStart:state.weekStart,teacherBlocks:structuredClone(state.teacherBlocks),earlyStart:structuredClone(state.earlyStart)};}
function currentConfig(){return parseInstructions(state.instructions,baseConfig()).config;}
function planSignature(){return JSON.stringify({baseSettings:state.baseSettings||null,assignments:state.assignments,filename:state.filename,instructions:state.instructions,weekStart:state.weekStart,teacherBlocks:state.teacherBlocks,earlyStart:state.earlyStart});}
function invalidatePlan(){cancelGeneration();state.stale=!!state.options.length;errors=[];warnings=[];persist();render();}
function formErrors(form,items){form.querySelector('.form-errors').innerHTML=items.length?`<div class="error-box">${items.map(v=>`<div>${esc(v)}</div>`).join('')}</div>`:'';}
function handleWorkloadAction(action,button){
 const id=button.dataset.id;
 if(action==='add-workload'||action==='edit-workload'){
   const item=action==='edit-workload'?state.assignments.find(a=>a.id===id):null;
   modal(item?'Edit workload':'Add a teacher workload',views.workloadForm(state,item));return true;
 }
 if(action==='add-block'||action==='edit-block'){
   const item=action==='edit-block'?state.teacherBlocks.find(b=>b.id===id):null;
   modal(item?'Edit blocked time':'Block a teacher’s time',views.blockForm(state,item));return true;
 }
 if(action==='delete-workload'||action==='delete-block'){
   const isBlock=action==='delete-block',item=(isBlock?state.teacherBlocks:state.assignments).find(a=>a.id===id);
   if(item)modal(isBlock?'Remove this time block?':'Remove this workload?',`<p>${esc(item.title||item.subject)} · ${esc(item.teacher)}</p><p>The current schedule will need to be generated again.</p><div class="button-row"><button class="button danger" data-action="${isBlock?'confirm-delete-block':'confirm-delete-workload'}" data-id="${esc(id)}">Remove</button><button class="button" data-action="close-dialog">Keep it</button></div>`);
   return true;
 }
 if(action==='confirm-delete-workload'||action==='confirm-delete-block'){
   if(action==='confirm-delete-workload'){state.assignments=state.assignments.filter(a=>a.id!==id);state.filename='Manually edited workloads';}
   else state.teacherBlocks=state.teacherBlocks.filter(b=>b.id!==id);
   dialog.close();invalidatePlan();toast('Removed. Regenerate to update the schedule.');return true;
 }
 if(action==='export-workloads'){
   const header=['department','semester','section','teacher','subject','code','type','weekly_hours','room','block_hours'];
   const rows=state.assignments.map(a=>[a.department,a.semester,a.section,a.teacher,a.subject,a.code,a.type,a.hours,a.room,a.blockHours]);
   download('\uFEFF'+[header,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n'),'faculty-workloads.csv','text/csv;charset=utf-8');return true;
 }
 if(action==='export-teacher'){
   if(!selected()||state.stale||busy)return true;
   const config=state.resultConfig;
   const result=teacherAvailability({teacher:state.teacher,assignments:state.resultAssignments,events:selected().events,config,generated:true});
   const header=['Teacher','Week beginning','Day','Start','End','Status','Activity','Department','Semester','Section','Room'];
   const rows=result.segments.map(e=>[state.teacher,config.weekStart,e.day,e.start,e.end,e.status,e.title,e.department||'',e.semester??'',e.section||'',e.room||'']);
   download('\uFEFF'+[header,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n'),'teacher-week-availability.csv','text/csv;charset=utf-8');toast('Exported teaching, research, duties and available time.');return true;
 }
 return false;
}
function handleWorkloadChange(event){
 const target=event.target;
 if(target.id==='teacher-select'){state.teacher=target.value;persist();render();return true;}
 if(target.id==='planning-week'){
   const monday=mondayFor(target.value);if(!monday){render();return true;}state.weekStart=monday;invalidatePlan();return true;
 }
 if(target.id==='equal-starts'){state.earlyStart.enabled=target.checked;invalidatePlan();return true;}
 if(target.id==='early-target'){
   const value=Number(target.value);if(!Number.isInteger(value)||value<1||value>7){toast('Choose between 1 and 7 early starts per teacher.');render();return true;}
   state.earlyStart.perTeacher=value;invalidatePlan();return true;
 }
 if(target.id==='workload-type'){
   const form=target.form,isResearch=target.value==='research';
   form.elements.semester.disabled=isResearch;form.elements.section.disabled=isResearch;
   form.elements.blockHours.value=target.value==='lab'?'2':'1';return true;
 }
 if(target.id==='block-recurrence'){
   const dated=target.value==='dated';document.querySelector('#block-day-field').hidden=dated;document.querySelector('#block-date-field').hidden=!dated;target.form.elements.date.required=dated;return true;
 }
 return false;
}
document.addEventListener('submit',event=>{
 const form=event.target;
 if(!['workload-form','block-form'].includes(form.id))return;
 event.preventDefault();const values=Object.fromEntries(new FormData(form)),id=form.dataset.editId;
 if(form.id==='workload-form'){
   const input={...values,id:id||crypto.randomUUID(),semester:values.type==='research'?null:Number(values.semester),section:values.type==='research'?'':values.section,hours:Number(values.hours),blockHours:Number(values.blockHours)};
   const proposed=id?state.assignments.map(a=>a.id===id?input:a):[...state.assignments,input];
   const result=normalizeAssignments(proposed);
   if(result.errors.length){formErrors(form,result.errors);return;}
   state.assignments=result.assignments.map((a,i)=>({...a,id:proposed[i].id}));state.filename='Manually entered workloads';state.teacher=input.teacher;
   importRequestId++;dialog.close();invalidatePlan();toast(id?'Workload updated. Regenerate to apply it.':'Workload added. Regenerate to schedule the required hours.');
 }else{
   if(values.recurrence==='dated'&&!values.date){formErrors(form,['Select a date for this one-time commitment.']);return;}
   const input={id:id||crypto.randomUUID(),teacher:values.teacher,title:values.title,type:values.type,day:values.day,start:values.start,end:values.end,date:values.recurrence==='dated'?values.date:''};
   const proposed=id?state.teacherBlocks.map(b=>b.id===id?input:b):[...state.teacherBlocks,input];
   const result=normalizeTeacherBlocks(proposed,{assignments:state.assignments,config:currentConfig()});
   if(result.errors.length){formErrors(form,result.errors);return;}
   state.teacherBlocks=result.blocks;state.teacher=input.teacher;dialog.close();invalidatePlan();toast('Time blocked. Regenerate so classes and labs move around it.');
 }
});
function render(){
 app.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand">${brand()}</div><div class="workspace"><div class="workspace-icon">${icon('building')}</div><div><strong>${esc(state.institution)}</strong><small>Academic workspace</small></div>${icon('down')}</div><div class="nav-label">WORKSPACE</div><nav class="nav" aria-label="Main navigation">${navButton('availability','Teacher availability','users')}${navButton('builder','Timetable builder','calendar')}${navButton('assignments','Workloads & duties','book')}${navButton('saved','Saved timetables','bookmark')}</nav><div class="sidebar-bottom"><nav class="nav"><button data-action="guide">${icon('book')}<span>Quick guide</span></button><button data-action="settings">${icon('settings')}<span>Workspace settings</span></button></nav><div class="tip-card">${icon('leaf')}<strong>Less juggling. More teaching.</strong><p>A little planning makes room for a better learning experience.</p></div><div class="user"><div class="avatar">AC</div><div><strong>Academic coordinator</strong><small>Personal workspace</small></div>${icon('down')}</div></div></aside><main class="main"><header class="topbar"><div class="breadcrumbs">Workspace ${icon('chevron')} <strong>${state.view==='builder'?'Timetable builder':state.view==='saved'?'Saved timetables':state.view==='availability'?'Teacher availability':'Workloads & duties'}</strong></div><div class="mobile-brand">${brand()}</div><div class="top-actions"><span class="period">${icon('calendar')} Academic year 2026–27</span><button class="icon-button" data-action="guide" aria-label="Help and quick guide">${icon('help')}</button><div class="avatar" title="Academic coordinator">AC</div></div></header><nav class="mobile-nav" aria-label="Mobile navigation">${navButton('availability','Teachers','users')}${navButton('builder','Builder','calendar')}${navButton('assignments','Workloads','book')}${navButton('saved','Saved','bookmark')}<button data-action="settings" aria-label="Workspace settings">${icon('settings')}</button></nav><div class="content ${full?'full-layout':''}">${state.view==='builder'?builder():state.view==='assignments'?assignmentsPage():state.view==='availability'?views.availabilityPage(state,selected()&&!state.stale&&!busy?state.resultConfig:currentConfig(),{busy,errorHTML:errorBox(),option:selected()}):savedPage()}<footer class="page-footer"><span>${icon('leaf')} A little structure. A lot of possibility.</span><span>Made for the rhythm of your campus.</span></footer></div></main></div><input type="file" id="file-input" accept=".csv,.xlsx,.xls,.json" class="hidden" aria-label="Upload teaching assignments">`;
 bindDropzone();
}
function builder(){const s=stats();return `<section class="page-heading"><div><div class="eyebrow">TIMETABLE BUILDER</div><h1>A better week starts here.</h1><p>Bring your faculty, subjects, and schedules into perfect sync.</p></div><button class="button primary" data-action="generate" ${busy?'disabled':''}>${icon(busy?'refresh':'spark',busy?'spin':'')} ${busy?'Building your week…':'Generate timetables'}</button></section>${views.planningControls(state)}<div class="steps"><div class="step"><span class="step-number">${state.assignments.length?icon('check'):'1'}</span><div>Teaching assignments<small>Upload your faculty & subjects</small></div></div><span class="step-line"></span><div class="step"><span class="step-number">${icon('check')}</span><div>Scheduling rules<small>Set the rhythm of your week</small></div></div><span class="step-line"></span><div class="step"><span class="step-number">3</span><div>Find your best fit<small>Compare, choose & export</small></div></div></div><div class="builder-layout"><section class="setup-column" aria-label="Timetable inputs"><div class="card"><div class="card-heading"><div class="card-title"><span class="section-num">01</span> Teaching assignments</div><button class="icon-button" data-action="template-info" aria-label="Assignment format information">${icon('info')}</button></div><div class="card-body"><p class="subtext">Import course allocations or enter each teacher’s workload directly.</p><button class="button add-manual" data-action="add-workload">+ Enter workload manually</button><div class="dropzone" id="dropzone" role="button" tabindex="0" data-action="upload" aria-label="Upload a CSV or Excel teaching assignment file"><div class="upload-icon">${icon('upload')}</div><p><strong>Click to upload</strong> or drag and drop</p><small>Excel, CSV or JSON · up to 5 MB</small></div>${state.assignments.length?`<div class="file-row"><span class="file-icon">${icon('file')}</span><div><span class="file-name" title="${esc(state.filename)}">${esc(state.filename)}</span><span class="file-detail">${s.subjects} assignments · Ready to plan</span></div><button class="icon-button" data-action="remove-file" aria-label="Remove uploaded file">${icon('close')}</button></div><div class="stats"><div class="stat"><strong>${s.teachers}</strong><span>Teachers</span></div><div class="stat"><strong>${s.subjects}</strong><span>Subjects</span></div><div class="stat"><strong>${s.semesters}</strong><span>Semesters</span></div></div>`:''}</div><div class="card-footer"><button class="button quiet" data-action="template">${icon('download')} Download template</button><button class="button quiet" data-action="preview" ${!state.assignments.length?'disabled':''}>View data </button></div></div><div class="card"><div class="card-heading"><div class="card-title"><span class="section-num">02</span> Scheduling rules</div><button class="icon-button" data-action="guide" aria-label="See instruction examples">${icon('help')}</button></div><div class="card-body"><p class="subtext">Every campus has its own rhythm.<br>Add working hours, breaks, and faculty needs.</p><label class="hidden" for="instructions">Scheduling instructions</label><textarea id="instructions" class="instruction-area" spellcheck="false" placeholder="College hours: 08:30-16:30&#10;Working days: Monday-Friday&#10;Lunch: 12:45-13:30">${esc(state.instructions)}</textarea><div class="hint">${icon('info')} One rule per line. Use the examples for guidance.</div><div class="rule-summary" id="rule-summary">${rulesChips()}</div></div><div class="card-footer"><button class="button quiet" data-action="rule-examples">${icon('spark')} See examples</button><button class="button quiet" data-action="review-rules">Review rules </button></div></div><p class="local-note">${icon('lock')} Your files stay in this browser.</p></section><section class="results-column" aria-label="Timetable alternatives">${resultContent()}</section></div>`;}
function rulesChips(){const p=parseInstructions(state.instructions,baseConfig());return `<span class="chip">${icon('calendar')} ${p.config.days.length} working days</span><span class="chip">${icon('coffee')} ${p.config.breaks.length} breaks</span><span class="chip">${icon('clock')} ${p.config.maxTeacherHoursPerDay}h daily limit</span>`;}
function errorBox(){return errors.length?`<div class="error-box" role="alert"><strong>Let’s resolve a few things first</strong><ul>${errors.map(e=>`<li>${esc(typeof e==='string'?e:JSON.stringify(e))}</li>`).join('')}</ul></div>`:'';}
function resultContent(){
 let html=errorBox();
 if(warnings.length) html+=`<div class="stale-note">${warnings.map(esc).join('<br>')}</div>`;
 if(busy)return html+`<div class="empty-state">${icon('spark')}<h3>Finding your campus rhythm</h3><p>Balancing teaching hours, protecting breaks, and checking every teacher and classroom.</p><div class="loading-line"></div></div>`;
 const option=selected();
 if(!option)return html+`<div class="empty-state">${icon('calendar')}<h3>A fresh week, full of possibility.</h3><p>Upload your teaching assignments and add your rules. We’ll find complete, clash-free schedules for every class in your file.</p><button class="button primary" data-action="generate">${icon('spark')} Generate timetables</button><button class="button quiet" data-action="demo">Try with sample data </button></div>`;
 return html+`<div class="results-heading"><div><h2>Your week, in balance.</h2><p>${state.options.length} ${state.options.length===1?'option':'alternatives'} for ${uniq(teaching(state.resultAssignments||state.assignments).map(cohortKey)).length} classes. Find the one that fits.</p></div><span class="status-pill" id="conflict-status">${icon('shield')} ${state.stale?'Previous rules checked':'No scheduling conflicts'}</span></div><div class="options" role="group" aria-label="Choose a timetable alternative">${state.options.map((o,i)=>`<button class="option ${state.selected===i?'selected':''}" data-action="select-option" data-index="${i}" aria-pressed="${state.selected===i}"><span class="option-top"><span class="option-label">${esc(o.label)}</span><span class="radio"></span></span><span class="option-desc">${o.label.startsWith('Balanced week')?'An even, thoughtful rhythm':o.label.startsWith('Early finish')?'Make room for your afternoons':'More breathing room each day'}</span><span class="option-bottom"><b>${o.metrics.requiredHours}h scheduled</b><span class="recommended">${o.label.startsWith('Balanced week')?'Recommended':'Clash-free'}</span></span></button>`).join('')}</div><div id="stale-notice" class="stale-note ${state.stale?'':'hidden'}">Inputs have changed. Generate again to apply them before saving or exporting.</div>${calendar(option)}<div class="selection-banner"><div class="banner-text"><div class="banner-icon">${icon('bookmark')}</div><div><strong>A timetable that works for everyone.</strong><p>Save this option for all departments and semesters.</p></div></div><button class="button" data-action="save" ${state.stale?'disabled':''}>${icon('check')} Use this timetable</button></div>`;
}
function calendar(option){
 const assignments=teaching(state.resultAssignments||state.assignments), config=state.resultConfig||DEFAULT_CONFIG;
 if(!assignments.length)return '<div class="empty-state"><h3>No student classes in this plan</h3><p>Research and duties are shown in Teacher availability.</p><button class="button" data-action="nav" data-view="availability">View teacher availability</button></div>';
 const departments=uniq(assignments.map(a=>a.department));
 if(!departments.includes(state.department))state.department=departments[0];
 const cohorts=uniq(assignments.filter(a=>a.department===state.department).map(cohortKey)).sort((a,b)=>Number(a.split('::')[1])-Number(b.split('::')[1]));
 if(!cohorts.includes(state.cohort))state.cohort=cohorts[0];
 const events=option.events.filter(e=>e.type!=='research'&&cohortKey(e)===state.cohort);
 const sem=state.cohort?.split('::')[1]||'',section=state.cohort?.split('::')[2]||'A';
 const boundaries=uniq([...state.slots.flatMap(s=>[s.start,s.end]),...events.flatMap(e=>[e.start,e.end])]).sort((a,b)=>minute(a)-minute(b));
 const intervals=boundaries.slice(0,-1).map((start,i)=>({start,end:boundaries[i+1],break:config.breaks.find(b=>minute(start)>=minute(b.start)&&minute(boundaries[i+1])<=minute(b.end))}));
 const subjects=uniq(assignments.filter(a=>cohortKey(a)===state.cohort).map(a=>a.subject));
 let grid=`<div class="day-heading time-heading" style="grid-column:1;grid-row:1">TIME</div>${config.days.map((d,i)=>`<div class="day-heading" style="grid-column:${i+2};grid-row:1">${esc(d)}</div>`).join('')}`;
 intervals.forEach((slot,i)=>{const row=i+2;grid+=`<div class="time-cell ${slot.break?'break-time':''}" style="grid-column:1;grid-row:${row}">${slot.start}<small>${slot.end}</small></div>`;if(slot.break)grid+=`<div class="break-cell" style="grid-column:2 / ${config.days.length+2};grid-row:${row}">${icon('coffee')} ${esc(slot.break.name)} <span>· ${minute(slot.end)-minute(slot.start)} min</span></div>`;else config.days.forEach((d,di)=>{const covered=events.some(e=>e.day===d&&minute(e.start)<minute(slot.end)&&minute(e.end)>minute(slot.start));grid+=`<div class="grid-cell" style="grid-column:${di+2};grid-row:${row}">${!covered?'<span class="free-slot">—</span>':''}</div>`;});});
 events.forEach(e=>{const di=config.days.indexOf(e.day),start=boundaries.indexOf(e.start)+2,end=boundaries.indexOf(e.end)+2;grid+=`<button class="event ${e.type==='lab'?'lab':`color-${subjects.indexOf(e.subject)%5}`}" style="grid-column:${di+2};grid-row:${start}/${end}" data-action="event" data-event="${esc(e.id)}" title="${esc(`${e.subject} · ${e.teacher} · ${e.day} ${e.start}–${e.end}`)}">${e.type==='lab'?'<small class="lab-label">LAB SESSION</small>':''}<strong>${esc(e.subject)}</strong><span>${esc(shortTeacher(e.teacher))}</span><small>${esc(e.room||e.code||'Room not assigned')}</small></button>`;});
 const hours=Math.round(events.reduce((sum,e)=>sum+(minute(e.end)-minute(e.start))/60,0)*100)/100;
 return `<div class="card calendar-card"><h2 class="print-title">${esc(state.institution)} · ${esc(state.department)} · Semester ${sem} / ${esc(section)}</h2><div class="calendar-controls"><div class="select-group"><div class="select-wrap"><select id="department" aria-label="Department">${departments.map(d=>`<option ${d===state.department?'selected':''}>${esc(d)}</option>`).join('')}</select>${icon('down')}</div><div class="select-wrap"><select id="cohort" aria-label="Semester and section">${cohorts.map(c=>`<option value="${esc(c)}" ${c===state.cohort?'selected':''}>Semester ${esc(c.split('::')[1])} · ${esc(c.split('::')[2])}</option>`).join('')}</select>${icon('down')}</div></div><div class="calendar-actions"><button class="icon-button" data-action="expand" aria-label="${full?'Exit':'Open'} expanded timetable">${icon('expand')}</button><button class="icon-button" data-action="print" aria-label="Print this semester timetable" ${state.stale?'disabled':''}>${icon('print')}</button><button class="icon-button" data-action="export" aria-label="Export all timetables" ${state.stale?'disabled':''}>${icon('download')}</button></div></div><div class="calendar-info"><strong>Weekly timetable <span style="color:#a8b19f">/ Section ${esc(section)}</span></strong><div class="legend"><span><i></i>Lecture</span><span><i></i>Lab</span><span><i></i>Break</span></div></div><div class="calendar-scroll"><div class="calendar" style="grid-template-columns:76px repeat(${config.days.length},minmax(145px,1fr));grid-template-rows:39px ${intervals.map(s=>s.break?'32px':`${Math.max(64,Math.min(120,(minute(s.end)-minute(s.start))*2))}px`).join(' ')}">${grid}</div></div><div class="calendar-bottom"><span>${icon('check')} ${hours} teaching hours · ${events.filter(e=>e.type==='lab').length} lab sessions</span><button class="button quiet" id="validation-button" data-action="validation">${icon('shield')} ${state.stale?'Previous checks':'All checks passed'}</button></div></div>`;
}
function assignmentTable(rows){return views.workloadTable(rows);}
function assignmentsPage(){return views.workloadsPage(state,currentConfig(),errorBox());}
function savedPage(){return `<section class="page-heading"><div><div class="eyebrow">READY FOR THE WEEK AHEAD</div><h1>Saved timetables</h1><p>Your chosen schedules, kept together in this browser.</p></div><button class="button primary" data-action="nav" data-view="builder">${icon('calendar')} Back to builder</button></section>${state.saved.length?`<div class="saved-list">${state.saved.map(s=>`<article class="card saved-card">${icon('bookmark')}<h3>${esc(s.option.label)}</h3><p>${esc(s.institution)}<br>${uniq(teaching(s.assignments).map(cohortKey)).length} classes · ${s.option.metrics.requiredHours} workload hours<br>Saved ${new Date(s.savedAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</p><div class="button-row"><button class="button small primary" data-action="open-saved" data-id="${s.id}">Open timetable </button><button class="button small" data-action="export-saved" data-id="${s.id}" aria-label="Export saved timetable">${icon('download')}</button><button class="button small danger" data-action="delete-saved" data-id="${s.id}" aria-label="Delete saved timetable">${icon('trash')}</button></div></article>`).join('')}</div>`:`<div class="empty-state">${icon('bookmark')}<h3>A home for your best plans.</h3><p>Choose “Use this timetable” in the builder to save a complete schedule for every class.</p><button class="button primary" data-action="nav" data-view="builder">Go to timetable builder </button></div>`}`;}
function modal(title, body){dialog.innerHTML=`<div class="dialog-head"><h2>${esc(title)}</h2><button class="icon-button" data-action="close-dialog" aria-label="Close dialog">${icon('close')}</button></div><div class="dialog-body">${body}</div>`;if(!dialog.open)dialog.showModal();}
function ruleProblems(parsed){const names=new Set(teacherNames(state.assignments,state.teacherBlocks).map(a=>a.trim().toLowerCase()));return [...normalizeTeacherBlocks(state.teacherBlocks,{assignments:state.assignments,config:parsed.config}).errors,...parsed.errors,...parsed.unrecognized.map(l=>`Unrecognized rule: “${l}”. Use an example format or remove this line.`),...parsed.config.teacherRules.filter(r=>!names.has(r.teacher.trim().toLowerCase())).map(r=>`Teacher “${r.teacher}” does not match the file. Use the teacher’s exact name.`)];}
function reviewRules(){const p=parseInstructions(state.instructions,baseConfig()),problems=ruleProblems(p);modal('Review your scheduling rules',`<p>These rules will apply to every department and semester. Hours are clock hours. Teacher limits include classes, labs, research and fixed duties. Teacher names must match your workload.</p>${problems.length?`<div class="error-box"><strong>Needs your attention</strong>${problems.map(e=>`<div>${esc(e)}</div>`).join('')}</div>`:''}<h3>Effective schedule</h3><div class="rule-item">${icon('clock')} ${esc(p.config.days.join(', '))} · ${p.config.start}–${p.config.end}</div><div class="rule-item">${icon('coffee')} ${p.config.breaks.map(b=>`${esc(b.name)} ${b.start}–${b.end}`).join(' · ')||'No breaks'}</div><div class="rule-item">${icon('users')} Teacher limits: ${p.config.maxTeacherHoursPerDay}h/day · ${p.config.maxTeacherHoursPerWeek}h/week</div><div class="rule-item">${icon('book')} Class limit: ${p.config.maxClassHoursPerDay}h/day</div><div class="rule-item">${icon('clock')} ${p.config.earlyStart?.enabled?`Exactly ${p.config.earlyStart.perTeacher} teaching start(s) at 08:30 per teaching teacher per week`:'Equal early starts disabled'}</div><div class="rule-item">${icon('lock')} ${activeTeacherBlocks(p.config).length} fixed commitments in the week of ${esc(state.weekStart)}</div><h3>${p.recognized.length} recognized instructions</h3>${p.recognized.map(r=>`<div class="rule-item">${icon('check')} ${esc(r.label||r.source||r)}</div>`).join('')}`);}
function generate(){
 if(busy)return;
 const parsed=parseInstructions(state.instructions,baseConfig());errors=ruleProblems(parsed);warnings=[];
 if(!state.assignments.length)errors.unshift('Upload teaching assignments or load the sample data first.');
 if(errors.length){render();return;}
 const input={assignments:structuredClone(state.assignments),instructions:state.instructions,filename:state.filename,plan:planSignature()};
 cancelGeneration();const id=++requestId;busy=true;if(!['builder','availability'].includes(state.view))state.view='availability';render();
 let activeWorker;
 try{activeWorker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});worker=activeWorker;}
 catch{busy=false;errors=['The timetable engine could not start. Reload the page and try again.'];render();return;}
 const finish=()=>{clearTimeout(timeout);timeout=null;busy=false;activeWorker.terminate();if(worker===activeWorker)worker=null;};
 timeout=setTimeout(()=>{if(id!==requestId)return;finish();errors=['The search took longer than expected. Try fewer classes or relax the tightest scheduling rules.'];render();},45000);
 activeWorker.onmessage=({data})=>{if(id!==requestId||data.id!==id)return;finish();if(data.error){errors=[data.error];render();return;}const r=data.result;state.options=r.options;state.slots=r.slots;state.selected=0;state.resultConfig=structuredClone(parsed.config);state.resultAssignments=input.assignments;state.resultInstructions=input.instructions;state.resultFilename=input.filename;state.resultPlan=input.plan;state.stale=planSignature()!==input.plan||state.filename!==input.filename||JSON.stringify(state.assignments)!==JSON.stringify(input.assignments);errors=r.options.length?[]:r.diagnostics;warnings=r.options.length&&r.options.length<3?[`Found ${r.options.length} distinct valid ${r.options.length===1?'option':'options'} with these rules. You can use any available option.`]:[];persist();render();};
 activeWorker.onerror=()=>{if(id!==requestId)return;finish();errors=['The timetable engine could not start. Reload the page and try again.'];render();};
 activeWorker.postMessage({id,assignments:input.assignments,config:parsed.config,count:3});
}
async function importFile(file){
 if(!file)return;
 const importId=++importRequestId;
 if(file.size>5*1024*1024){modal('File is too large','<p>Please upload a file smaller than 5 MB.</p>');return;}
 try{let rows;const ext=file.name.split('.').pop().toLowerCase();
 if(ext==='csv')rows=parseCSV(await file.text());
 else if(ext==='json'){const json=JSON.parse(await file.text());rows=Array.isArray(json)?json:json.assignments;}
 else if(['xlsx','xls'].includes(ext)){if(!window.XLSX)throw new Error('Excel support is still loading. Try again in a moment.');const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});rows=wb.SheetNames.flatMap(name=>XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:''}));}
 else throw new Error('Please choose a CSV, Excel (.xlsx or .xls), or JSON file.');
 if(importId!==importRequestId)return;
 const result=normalizeAssignments(rows);
 if(result.errors.length){modal('Check your assignment file',`<p>No data was replaced. Fix the following rows and try again.</p><div class="error-box">${result.errors.slice(0,20).map(e=>`<div>${esc(e)}</div>`).join('')}${result.errors.length>20?`<p>And ${result.errors.length-20} more errors.</p>`:''}</div><button class="button" data-action="template">${icon('download')} Download the template</button>`);return;}
 cancelGeneration();state.assignments=result.assignments;state.filename=file.name;state.options=[];state.resultAssignments=null;state.stale=false;state.department=result.assignments[0].department;state.cohort=cohortKey(result.assignments[0]);errors=[];warnings=result.warnings;persist();render();toast(`Imported ${result.assignments.length} assignments. Review your rules, then generate.`);
 }catch(error){if(importId!==importRequestId)return;modal('Unable to read this file',`<p>${esc(error.message)}</p><p>Your previous assignments are still available.</p>`);}
}
function bindDropzone(){const drop=document.querySelector('#dropzone');if(!drop)return;drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragging');});drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragging');importFile(e.dataTransfer.files[0]);});drop.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();document.querySelector('#file-input').click();}});}
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function csvCell(value){let text=String(value??'');if(/^[\s]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
function dateForDay(config,day){if(!config.weekStart)return '';const d=new Date(config.weekStart+'T12:00:00Z');if(!Number.isFinite(d.getTime()))return '';const offset=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].indexOf(day);if(offset<0)return '';d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
function exportCSV(option,config){
 const header=['Department','Semester','Section','Day','Start','End','Type','Subject','Teacher','Room','Hours','Week beginning','Date','Recurrence'];
 const rows=option.events.map(e=>[e.department,e.semester,e.section,e.day,e.start,e.end,e.type,e.subject,e.teacher,e.room,e.duration??(minute(e.end)-minute(e.start))/60,config.weekStart||'',dateForDay(config,e.day),'Scheduled week']);
 for(const b of activeTeacherBlocks(config))rows.push(['','','',b.day,b.start,b.end,b.type,b.title,b.teacher,'',(minute(b.end)-minute(b.start))/60,config.weekStart||'',b.date||dateForDay(config,b.day),b.date?'One date only':'Weekly']);
 const classes=uniq(option.events.filter(e=>e.type!=='research').map(cohortKey));
 for(const c of classes){const [department,semester,section]=c.split('::');for(const day of config.days)for(const b of config.breaks)rows.push([department,semester,section,day,b.start,b.end,'break',b.name,'','',(minute(b.end)-minute(b.start))/60,config.weekStart||'',dateForDay(config,day),'Scheduled week']);}
 rows.sort((a,b)=>String(a[0]).localeCompare(String(b[0]))||Number(a[1])-Number(b[1])||String(a[2]).localeCompare(String(b[2]))||config.days.indexOf(a[3])-config.days.indexOf(b[3])||minute(a[4])-minute(b[4]));
 download('\uFEFF'+[header,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n'),'semester-all-timetables.csv','text/csv;charset=utf-8');toast('Exported classes, labs, research, dated duties and breaks.');
}
function saveOption(){const option=selected();if(!option||state.stale)return;if(state.saved.length>=12){toast('You have 12 saved plans. Remove one before saving another.');return;}const snapshot={id:crypto.randomUUID(),savedAt:Date.now(),option:structuredClone(option),config:structuredClone(state.resultConfig),assignments:structuredClone(state.resultAssignments),slots:structuredClone(state.slots),instructions:state.resultInstructions??state.instructions,filename:state.resultFilename??state.filename,institution:state.institution};state.saved.unshift(snapshot);persist();render();toast('Timetable saved for every department and semester.');}
const exampleText=`College hours: 08:30-16:30\nWorking days: Monday-Friday\nShort break: 10:30-10:45\nLunch: 12:45-13:30\nMaximum teacher hours per day: 5\nMaximum teacher hours per week: 24\nMaximum class hours per day: 6\nDr. Ananya Rao unavailable on Friday\nDr. Ananya Rao available 09:00-14:00\nDr. Ananya Rao maximum 4 hours per day`;
function showGuide(){modal('A good week in three steps',`<h3>01 · Bring your teaching assignments</h3><p>Import CSV, Excel or JSON. Each row is one teaching assignment for a department, semester and section. Include teacher, subject, weekly hours, and whether it’s a class, lab, or research allocation. You can also add and edit workloads directly under Workloads & duties. Research rows leave semester and section blank. Add room names to check room clashes. Every nonempty Excel worksheet is imported.</p><h3>02 · Make the rules clear</h3><p>Paste one instruction per line using the supported formats below. Review the detected rules before generating. Instructions that are not recognized must be corrected; they are never silently ignored. Missing rules use the defaults shown in “Review rules.”</p><pre>${esc(exampleText)}</pre><h3>Teacher availability and fixed duties</h3><p>Teacher availability shows teaching, labs, research, unavailable periods and free time. Use Block time for recurring or dated duties. A dated duty only affects its selected Monday–Sunday week. Updating workloads or blocks makes the old schedule stale until regeneration.</p><p>Equal 8:30 starts is a strict rule, with a configurable count per teaching teacher. Research and duties do not count as early teaching starts. If equality cannot be scheduled, the app reports the constraint problem. Turn the rule off explicitly only when your policy permits it.</p><h3>03 · Find the right fit</h3><p>Generation coordinates every class together, so a shared teacher or room cannot be double-booked. Labs stay in continuous blocks and breaks remain protected. Pick an alternative, explore each class, then save or export all timetables.</p><p>This is a local planning tool. A valid schedule is checked against the supported rules; the search may not find every possible solution. Files and saved plans stay in this browser. Use CSV export to share or keep a backup.</p><button class="button" data-action="template">${icon('download')} Download assignment template</button>`);}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const action=b.dataset.action;
 if(handleWorkloadAction(action,b))return;
 if(action==='nav'){state.view=b.dataset.view;full=false;render();persist();}
 else if(action==='generate')generate();
 else if(action==='upload')document.querySelector('#file-input').click();
 else if(action==='template')download(TEMPLATE_CSV,'teaching-assignments-template.csv','text/csv;charset=utf-8');
 else if(action==='close-dialog')dialog.close();
 else if(action==='guide'||action==='rule-examples')showGuide();
 else if(action==='review-rules')reviewRules();
 else if(action==='preview')modal('Teaching assignments',`<p>${state.assignments.length} assignments from ${esc(state.filename)}</p>${assignmentTable(state.assignments)}`);
 else if(action==='template-info')modal('A simple file. A complete picture.',`<p>Required columns: <strong>department, semester, teacher, subject, weekly_hours</strong>.</p><p>Optional: <strong>section</strong> (defaults to A), <strong>code</strong>, <strong>type</strong> (lecture, lab or research), <strong>room</strong>, <strong>block_hours</strong> (continuous session length; defaults to 2 for labs and 1 for lectures).</p><p>Use semesters 1–8 for teaching; leave semester and section blank for research. Lab weekly hours must be a multiple of their block length. Give a shared room the same name in every row so conflicts can be checked. Up to 500 assignment rows per file.</p><button class="button primary" data-action="template">${icon('download')} Download CSV template</button>`);
 else if(action==='select-option'){state.selected=Number(b.dataset.index);persist();render();}
 else if(action==='save')saveOption();
 else if(action==='export'&&!state.stale)exportCSV(selected(),state.resultConfig);
 else if(action==='print'&&!state.stale)window.print();
 else if(action==='expand'){full=!full;render();}
 else if(action==='event'){const event=selected().events.find(v=>v.id===b.dataset.event);if(event)modal(event.subject,`<div class="detail-grid">${[['Teacher',event.teacher],['When',`${event.day} · ${event.start}–${event.end}`],['Department',event.department],['Class',`Semester ${event.semester} · Section ${event.section}`],['Session',event.type==='lab'?'Continuous laboratory block':'Lecture'],['Room',event.room||'Not assigned']].map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`);}
 else if(action==='validation')modal('A complete, checked timetable',`<p>Every generated option covers all ${state.resultAssignments.length} uploaded assignments and ${selected().metrics.requiredHours} required clock hours.</p>${['No teacher is in two classes at once','No class has overlapping sessions','Named rooms are not double-booked','Lectures and labs stay clear of every break','Lab blocks are continuous','Teacher availability and workload limits are respected','All required weekly teaching and research hours are scheduled','Fixed duties remain blocked and count toward teacher workload','The configured early-start count is independently verified'].map(t=>`<div class="rule-item">${icon('check')} ${t}</div>`).join('')}<p>Room checks apply only to rooms named in the input file. These checks use the rules from the last successful generation.</p>`);
 else if(action==='remove-file'){cancelGeneration();importRequestId++;state.assignments=[];state.filename='';state.options=[];state.resultAssignments=null;state.stale=false;errors=[];warnings=[];persist();render();}
 else if(action==='demo'){cancelGeneration();importRequestId++;state.assignments=structuredClone(DEMO_ASSIGNMENTS);state.filename=DEMO_FILENAME;state.instructions=DEFAULT_INSTRUCTIONS;state.baseSettings=null;state.teacherBlocks=structuredClone(DEMO_BLOCKS);state.earlyStart={enabled:true,time:'08:30',perTeacher:1};state.department='Computer Science';state.cohort='Computer Science::3::A';state.options=[];persist();generate();}
 else if(action==='open-saved'){const s=state.saved.find(s=>s.id===b.dataset.id);if(!s)return;cancelGeneration();importRequestId++;state={...state,assignments:structuredClone(s.assignments),resultAssignments:structuredClone(s.assignments),resultConfig:structuredClone(s.config),options:[structuredClone(s.option)],slots:structuredClone(s.slots),instructions:s.instructions,filename:s.filename,resultInstructions:s.instructions,resultFilename:s.filename,institution:s.institution,baseSettings:{...structuredClone(s.config),teacherRules:[]},teacherBlocks:structuredClone(s.config.teacherBlocks||[]),weekStart:s.config.weekStart||currentMonday(),earlyStart:structuredClone(s.config.earlyStart||{enabled:false,time:'08:30',perTeacher:1}),selected:0,stale:false,view:'availability'};state.resultPlan=planSignature();errors=[];warnings=[];persist();render();}
 else if(action==='export-saved'){const s=state.saved.find(s=>s.id===b.dataset.id);if(s)exportCSV(s.option,s.config);}
 else if(action==='delete-saved'){const id=b.dataset.id;modal('Remove this saved timetable?',`<p>This removes only this saved copy from the browser. Export it first if you need to keep a backup.</p><div class="button-row"><button class="button danger" data-action="confirm-delete" data-id="${id}">${icon('trash')} Remove saved copy</button><button class="button" data-action="close-dialog">Keep it</button></div>`);}
 else if(action==='confirm-delete'){state.saved=state.saved.filter(s=>s.id!==b.dataset.id);dialog.close();persist();render();toast('Saved copy removed.');}
 else if(action==='settings')modal('Your academic workspace',`<p>Give your workspace a name. It appears on printed schedules and saved plans.</p><label for="institution-name">College name</label><div class="data-toolbar" style="margin-top:10px"><input id="institution-name" class="search-field" maxlength="80" value="${esc(state.institution)}"><button class="button primary" data-action="save-settings">Save changes</button></div><h3>Planning defaults</h3><p>Configure teaching days, college timings and hour limits in the builder’s scheduling instructions. Your plans are saved locally in this browser.</p>`);
 else if(action==='save-settings'){const name=document.querySelector('#institution-name').value.trim();if(name){state.institution=name;persist();dialog.close();render();toast('Workspace updated.');}}
});
document.addEventListener('change',e=>{if(handleWorkloadChange(e))return;if(e.target.id==='file-input'){const file=e.target.files[0];e.target.value='';importFile(file);}else if(e.target.id==='department'){state.department=e.target.value;render();persist();}else if(e.target.id==='cohort'){state.cohort=e.target.value;render();persist();}});
document.addEventListener('input',e=>{if(e.target.id==='instructions'){state.instructions=e.target.value;state.stale=!!state.options.length&&planSignature()!==state.resultPlan;const conflictStatus=document.querySelector('#conflict-status');if(conflictStatus)conflictStatus.innerHTML=icon('shield')+' '+(state.stale?'Previous rules checked':'No scheduling conflicts');const validationButton=document.querySelector('#validation-button');if(validationButton)validationButton.innerHTML=icon('shield')+' '+(state.stale?'Previous checks':'All checks passed');document.querySelector('#stale-notice')?.classList.toggle('hidden',!state.stale);document.querySelectorAll('[data-action="save"],[data-action="export"],[data-action="print"]').forEach(b=>b.disabled=state.stale);document.querySelector('#rule-summary').innerHTML=rulesChips();persist();}else if(e.target.id==='assignment-search'){const q=e.target.value.toLowerCase();document.querySelector('#assignment-table').innerHTML=assignmentTable(state.assignments.filter(a=>[a.teacher,a.subject,a.department,a.code,String(a.semester)].join(' ').toLowerCase().includes(q)));}});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
render();
if(!cached&&state.assignments.length)generate();
