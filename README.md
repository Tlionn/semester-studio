# Semester Studio

A browser-local engineering college timetable builder. The frontend includes real constraint scheduling rather than a static calendar mockup.

## Run with Docker

Requires Docker Engine or Docker Desktop with Linux containers and Docker Compose v2.

```sh
git clone https://github.com/Tlionn/semester-studio.git
cd semester-studio
docker compose up --build -d
```

Open http://localhost:8080. The first build downloads the base images and the locked SheetJS dependency; subsequent starts use the built image. The runtime serves only static assets with NGINX as a non-root user. It does not require Node.js on your host, a database, or API keys.

```sh
docker compose ps
docker compose logs -f app
docker compose down
```

By default, Docker publishes port 8080 only on this computer (`127.0.0.1`). To choose another port, copy `.env.example` to `.env`, change `HOST_PORT`, and rerun `docker compose up -d`. `HOST_BIND=0.0.0.0` allows network access; use it only when intended. These settings can also be passed as environment variables.

The container has a `/healthz` health check. Timetables remain in each browser's local storage, so no Docker data volume is required. A different hostname or port has separate browser storage; export plans before switching addresses. The Docker instance has no built-in login; ChatGPT sign-in applies only to the separately hosted Site.

## Run locally

Requires Node.js 20 or newer.

```sh
npm ci
npm run build
npm run dev
```

Open http://127.0.0.1:4173. `npm test` runs the importer and scheduling invariant tests. `dist/` is the complete static site; it can be served by any static host. Source is written as native JavaScript modules, with no framework build required. `npm run build` vendors SheetJS into `dist/vendor` for Excel support.

## Workflow

1. Enter or edit allocations in **Workloads & duties**, or upload a CSV, Excel (.xlsx/.xls), or JSON file. Every nonempty Excel worksheet is read. The manual form accepts teacher, department, course/activity, semester, section, weekly hours, session length and room.
2. Add flexible **research workload** as an allocation, or reserve fixed research, test duty, meetings and other work with **Block time**. Choose weekly recurrence or a single date, then select the planning week.
3. Enter supported instructions and review the rules. Unsupported lines and unknown teacher names block generation. Equal 8:30 a.m. teaching starts is enabled by default, with an editable count of one per teaching teacher per week.
4. Generate up to three distinct, complete alternatives for **every department, semester, and section in the uploaded data**. Semesters 1–8 are supported.
5. Use **Teacher availability** for classes, labs, research, fixed duties, breaks, unavailable periods and free time. Review every teacher's early-start count. Compare alternatives in the timetable builder, save a plan, or export all timetables or an individual teacher's availability as CSV.

The sample contains 34 allocations, 17 teachers, 6 classes, 89 teaching hours, 4 flexible research hours and 2 fixed duty/meeting hours across Computer Science, Electronics and Mechanical. It demonstrates an odd-semester cycle; even-semester or mixed files work the same way.

## Input columns

| Column | Meaning |
|---|---|
| department | Required department name |
| semester | Required number from 1 through 8 for classes/labs; blank for research |
| teacher | Required teacher name; use the same spelling across rows |
| subject | Required subject name |
| weekly_hours | Required weekly **clock hours**, including fractional hours that resolve to whole minutes |
| section | Defaults to A for teaching; blank for research |
| code | Optional course code |
| type | lecture, lab or research; defaults to lecture unless the subject contains Lab/Practical |
| room | Optional room identifier; matching room names are checked globally for clashes |
| block_hours | Continuous session length; defaults to 1 for lectures/research, 2 for labs |

Each row assigns one teacher to one subject for one class. Lab weekly hours must be divisible by the continuous lab block length. The import limit is 500 rows and 5 MB. Missing rooms are explicitly reported because unnamed room availability cannot be checked. JSON may be an array of these records or `{ "assignments": [...] }`.

## Scheduling instructions

The instructions box uses a deterministic, explicitly supported language. It does **not** call an LLM or pretend to interpret arbitrary prose. Examples:

```text
College hours: 08:30-16:30
Working days: Monday-Friday
Short break: 10:30-10:45
Lunch: 12:45-13:30
Maximum teacher hours per day: 5
Maximum teacher hours per week: 24
Maximum class hours per day: 6
Dr. Ananya Rao unavailable on Friday
Dr. Ananya Rao available 09:00-14:00
Dr. Ananya Rao maximum 4 hours per day
```

Rules omitted from the instructions use the defaults displayed in Review rules. Specific teacher limits override global limits for that teacher. Teacher names must match the file, ignoring case. Breaks are exact time windows. Labs cannot cross them. Room, teacher and class identities are matched case-insensitively by the engine.

## Availability, workload and early-start policy

- Teacher daily and weekly hour limits include classes, labs, flexible research and active fixed commitments. Student-class limits include only classes and labs. Research never occupies a student cohort, although it occupies its teacher and any named room.
- Fixed commitments cannot overlap other commitments for the same teacher. They can span college breaks (for example, an examination), and their full clock duration counts toward teacher workload. All commitments must fit within college hours.
- The planning week begins on Monday. A dated duty reserves time only in the week containing that date. Weekly blocks recur each applicable week. CSV timetable exports preserve the week, occurrence date and recurrence type.
- Equal 8:30 starts is a **hard constraint**: every teacher with a lecture/lab workload must receive exactly the configured count of teaching sessions starting at 08:30. Labs count; research and duties do not. Research-only teachers are excluded. College hours must begin at 08:30 when this rule is enabled. A positive count is required, preventing a vacuous all-zero result.
- The engine reports impossibility or search exhaustion rather than relaxing equality. The rule can be explicitly disabled in the UI if the college's policy permits it. The distribution panel shows the actual per-teacher counts.
- Changing workloads, instructions, week, duties or fairness settings invalidates existing options. The teacher view hides outdated teaching allocations and labels remaining time **unallocated**, never available, until successful regeneration. Fixed blocks remain visible.
- Earlier saved schedules remain accessible with their original configuration; opening one does not retroactively apply the new early-start policy. No old workloads or saved plans are discarded by the upgrade.

## Scheduling approach and limits

Scheduling runs in a Web Worker using deterministic seeded, multi-attempt constructive search. Exact early-start reservations are placed before remaining sessions. Alternative objectives favor a balanced week, earlier finishes, or distributed teaching. Each returned option is independently checked against required weekly hours, teacher availability, workload limits, fixed commitments, exact early-start counts, room conflicts, class overlaps, college timings and continuous labs. Infeasible capacity is reported; an unsuccessful heuristic search is distinguished from proof that no solution exists.

This is a frontend planning tool, not a student-information-system integration. It does not model elective student groups, room capacity/equipment, multiple co-teachers in a single assignment, rotating weeks, holidays, parallel lab batches, or arbitrary prose constraints. Add explicit solver/data-model support before using those policies. It never labels a partial timetable as complete.

Assignments, instructions, and up to 12 saved plans are stored in this browser's local storage. No assignment data is uploaded to a backend. Clearing browser storage removes local plans; CSV export provides a portable backup. The default demo is generated on first visit.

## Files

- `dist/app.js`: frontend interactions, importing, review, selection, persistence and export.
- `dist/workload-ui.js`: workload and commitment forms, teacher calendar and fairness distribution.
- `dist/availability.js`: commitment normalization, week/date filtering and per-teacher availability segments.
- `dist/workload.css`: readable responsive styling for the teacher and workload views.
- `dist/styles.css`: responsive layout and print styles.
- `dist/imports.js`: CSV parser, row normalization and instruction parsing.
- `dist/scheduler.js`: generator and independent validation.
- `dist/worker.js`: background scheduling worker.
- `dist/demo.js`: sample college and default rules.
- `tests/`: importer, integration, capacity, precision and conflict invariants.

Excel parsing uses [SheetJS Community Edition](https://docs.sheetjs.com/docs/getting-started/installation/standalone/), distributed under Apache 2.0; its license is included in `dist/vendor/XLSX-LICENSE.txt`.
