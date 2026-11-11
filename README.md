# Semester Studio

A browser-local engineering college timetable builder. The frontend includes real constraint scheduling rather than a static calendar mockup.

## Run locally

Requires Node.js 20 or newer.

```sh
npm ci
npm run build
npm run dev
```

Open http://127.0.0.1:4173. `npm test` runs the importer and scheduling invariant tests. `dist/` is the complete static site; it can be served by any static host. Source is written as native JavaScript modules, with no framework build required. `npm run build` vendors SheetJS into `dist/vendor` for Excel support.

## Workflow

1. Upload a CSV, Excel (.xlsx/.xls), or JSON file. A downloadable CSV template and sample college data are included. Every nonempty Excel worksheet is read.
2. Enter one supported scheduling instruction per line and review the detected rules. Unsupported lines and unknown teacher names block generation.
3. Generate up to three distinct, complete timetable alternatives for **every department, semester, and section in the uploaded data**. Semesters 1–8 are supported.
4. Compare options, filter by department and class, inspect sessions, save the preferred college-wide plan, print a class timetable, or export all class timetables and breaks as CSV.

The sample contains 32 assignments, 17 teachers, 6 classes and 89 weekly teaching hours across Computer Science, Electronics and Mechanical. It intentionally demonstrates an odd-semester cycle; importing an even-semester or mixed file works the same way.

## Input columns

| Column | Meaning |
|---|---|
| department | Required department name |
| semester | Required number from 1 through 8 |
| teacher | Required teacher name; use the same spelling across rows |
| subject | Required subject name |
| weekly_hours | Required weekly **clock hours**, including fractional hours that resolve to whole minutes |
| section | Defaults to A; creates a separate class/cohort |
| code | Optional course code |
| type | lecture or lab; defaults to lecture unless the subject contains Lab/Practical |
| room | Optional room identifier; matching room names are checked globally for clashes |
| block_hours | Continuous session length; defaults to 1 for lectures, 2 for labs |

Each row assigns one teacher to one subject for one class. Lab weekly hours must be divisible by the continuous lab block length. The import limit is 500 rows and 5 MB. Missing rooms are explicitly reported because unnamed room availability cannot be checked. JSON may be an array of these records or `{ "assignments": [...] }`.

## Scheduling instructions

The instructions box uses a deterministic, explicitly supported language. It does **not** call an LLM or pretend to interpret arbitrary prose. Examples:

```text
College hours: 09:00-16:30
Working days: Monday-Friday
Short break: 11:00-11:15
Lunch: 13:15-14:00
Maximum teacher hours per day: 5
Maximum teacher hours per week: 24
Maximum class hours per day: 6
Dr. Ananya Rao unavailable on Friday
Dr. Ananya Rao available 09:00-14:00
Dr. Ananya Rao maximum 4 hours per day
```

Rules omitted from the instructions use the defaults displayed in Review rules. Specific teacher limits override global limits for that teacher. Teacher names must match the file, ignoring case. Breaks are exact time windows. Labs cannot cross them. Room, teacher and class identities are matched case-insensitively by the engine.

## Scheduling approach and limits

Scheduling runs in a Web Worker using deterministic seeded, multi-attempt constructive search. Alternative objectives favor a balanced week, earlier finishes, or distributed teaching. Each returned option is independently checked against the required weekly hours, teacher availability, workload limits, room conflicts, class overlaps, college timings and continuous labs. Infeasible capacity is reported; an unsuccessful heuristic search is distinguished from a proof that no solution exists.

This is a frontend planning tool, not a student-information-system integration. It does not model elective student groups, room capacity/equipment, multiple co-teachers in a single assignment, rotating weeks, holidays, parallel lab batches, or arbitrary prose constraints. Add explicit solver/data-model support before using those policies. It never labels a partial timetable as complete.

Assignments, instructions, and up to 12 saved plans are stored in this browser's local storage. No assignment data is uploaded to a backend. Clearing browser storage removes local plans; CSV export provides a portable backup. The default demo is generated on first visit.

## Files

- `dist/app.js`: frontend interactions, importing, review, selection, persistence and export.
- `dist/styles.css`: responsive layout and print styles.
- `dist/imports.js`: CSV parser, row normalization and instruction parsing.
- `dist/scheduler.js`: generator and independent validation.
- `dist/worker.js`: background scheduling worker.
- `dist/demo.js`: sample college and default rules.
- `tests/`: importer, integration, capacity, precision and conflict invariants.

Excel parsing uses [SheetJS Community Edition](https://docs.sheetjs.com/docs/getting-started/installation/standalone/), distributed under Apache 2.0; its license is included in `dist/vendor/XLSX-LICENSE.txt`.
