# CourseCal

[![License: MIT](https://img.shields.io/badge/License-MIT-6ea8fe.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-6ea8fe.svg)](#running-it)
[![Built with Electron](https://img.shields.io/badge/Built%20with-Electron%20%2B%20React-6ea8fe.svg)](#tech-stack)

**Free and open source.** A desktop calendar for college coursework.

Unlike a generic calendar, its dashboard is a **priority-ordered** view of everything
due in the next four weeks — so a heavy exam next week can outrank a trivial quiz due
tomorrow, instead of being buried under it.

> Not just chronological. The ranking weighs how soon something is due *against* how much
> of your grade rides on it, and you control the balance.

## Running it

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/goodbyeandgoodriddance/coursecal.git
cd coursecal
npm install
npm run dev     # opens the app window, with hot reload
```

| Command | What it does |
|---|---|
| `npm run dev` | Launch the app with hot reload |
| `npm test` | 149 unit tests over the scoring, parsing, export and grade logic |
| `npm run typecheck` | TypeScript, no emit |
| `npm run build` | Typecheck + production build into `dist/` and `dist-electron/` |
| `npm run package` | Build the portable Windows exe into `release/` |

### Building the portable exe

`npm run package` produces `release/CourseCalx64.exe` — a single
self-contained file that needs no installer and no admin rights.

The build config sets `win.signAndEditExecutable: false`. That is deliberate: the project
is unsigned, and electron-builder otherwise downloads its `winCodeSign` bundle, whose
extraction fails on Windows without Developer Mode or admin rights (it contains macOS
symlinks). Skipping it only affects the *inner* executable's metadata, which is unpacked
to `%TEMP%` and never seen — NSIS stamps the outer exe's name, version, copyright and
icon independently. If you have a signing certificate, remove that line.

## The views

- **Dashboard** — the landing view. A month at a glance, plus two shortlists kept
  separate on purpose: work you hand in, and assessments you sit. Ranking those together
  buries whichever kind is currently less urgent. Each entry shows the three facts that
  decide whether to start now — grade weight, due date, and days remaining — with the
  full ranked list and a workload chart below.
- **Term Calendar** — the month grid. Click any day to add work dated to it; click a chip
  to edit.
- **Weekly Schedule** — recurring class times and deadlines on one timetable. Classes
  that clash sit side by side rather than hiding one another, and the grid expands to
  cover anything scheduled outside normal hours.
- **Courses** — terms, courses, class times, grade weights, and a running grade per
  course. Courses and class times stay editable after you create them.
- **Settings** — priority scoring, reminders, the completion chime, data backup/import,
  and a button to replay the guided tour.

**Reading weeks.** Name any date range on a term and classes stop running for it: the
Weekly Schedule suppresses those meetings and both calendars band the dates. Deadlines
still show, because work is often due during one.

**Course codes are optional.** A course is identified by its title; the code is a
shorthand that quick add will match if you set one, falling back to the title if you
don't.

On first launch a setup wizard creates your term and first course, then walks through
quick add, priority scoring, the item editor, the calendars, Courses, reminders, backups
and keyboard shortcuts. Replayable from Settings at any time.

Keyboard: `/` focuses quick add, `n` opens a new item, `1`–`5` switch views. Item rows
open the editor on double-click.

## How priority is scored

[`src/lib/priority.ts`](src/lib/priority.ts) is the heart of it. Each unfinished item
gets a 0–100 score from three components, blended by the weights you set in Settings:

| Component | How it's computed |
|---|---|
| **Urgency** | `1 / (1 + daysUntilDue / 7)` — flat while the deadline is distant, steep as it nears. 1 at or past the deadline. |
| **Grade impact** | `sqrt(gradeWeight / 100)`. The square root spreads out the crowded low end, where most coursework lives, so a 2% quiz and a 30% exam stay clearly separated. Items with no weight fall back to a per-type default (exam 50%, project 35%, assignment 20%, quiz 10%, reading 5%). |
| **Importance** | Your manual Low/Normal/High flag, mapped to 0 / 0.5 / 1. |

The three slider weights are normalized to sum to 1, so moving one slider changes only
the balance between them — never the overall spread of scores.

Two deliberate choices:

- **Overdue work is not scored into the list.** It goes in its own pinned section, oldest
  first, so it can never be scored out of sight.
- **Row color comes from days remaining, not from the score.** The color means the same
  thing regardless of how you have set the sliders.

## Quick add

The bar at the top of the Dashboard, Term Calendar and Weekly Schedule parses one line:

```
CS201 essay fri 5pm 20%
MATH140 problem set 3 in 2 weeks
PSY101 chapter 7 reading tomorrow
ENG210 final paper dec 4 !
```

It recognizes course codes, `today` / `tomorrow` / weekday names / `next mon` / `dec 4` /
`12/4` / `in 3 days`, times like `5pm` and `17:00`, `20%` for grade weight, and a
trailing `!` for high importance. A chip under the input shows exactly how your text was
read, before you commit it. If the course or date can't be determined, Enter opens the
full form pre-filled rather than guessing.

## Your data

Everything lives in one JSON blob in `localStorage`, which Electron persists in the app's
`userData` directory. It is validated with [zod](https://zod.dev) on load — malformed dates, broken references, duplicate IDs, corrupt records, and unrecognized schema versions are rejected rather than being allowed to crash a view. A brand-new install starts empty and opens the guided setup wizard.

**Your data is on your machine only.** Nothing is uploaded anywhere, and there is no
account. The flip side is that clearing the app's data would lose it, so:

- **Settings → Data → Export backup** writes a pretty-printed, hand-readable JSON file
  wherever you choose.
- **Import backup** validates a file against the same schema the app uses internally and
  refuses anything damaged, foreign, or from a newer version — with a plain-English
  reason, leaving your existing data untouched. A confirmed import replaces everything,
  so it first saves a snapshot of your current data into the app folder.

## Reminders

While the app is running it checks every 60 seconds for items that have crossed a
reminder threshold (24h and 1h before, by default) and sends a Windows notification. Each
reminder fires exactly once — fired reminders are recorded in persisted state, so
restarting the app does not replay them.

## Tech stack

Electron + React 19 + TypeScript, built with Vite. No backend, no network calls, no
telemetry.

```
electron/        main process (window, notifications, file dialogs) and preload bridge
src/lib/         pure logic — priority, dashboard, dates, quick add, grades, workload,
                 course labelling, reading weeks, backups, the completion chime
src/store/       zod-validated persistence, reducer, and empty first-run state
src/views/       one file per view
src/components/  shared UI (item row, modal, quick-add bar, dialog, chart, icons)
src/styles/      theme.css — all the styling
src/types/       the preload bridge contract
build/           app icon
```

The `src/lib` modules are pure functions with no React or DOM dependency, so scoring,
parsing, reminders, backups, grades, workload, timetable layout and reading weeks can be
regression-tested directly. That is where the 149 tests live.

## Contributing

Issues and pull requests are welcome. Two things worth knowing before you start:

- `src/lib/**` is pure and tested — if you change scoring, parsing or the backup format,
  the tests in the matching `*.test.ts` should change with it.
- The UI is deliberately dense and dark-only. `src/styles/theme.css` holds every style;
  there is no CSS framework.

Known gaps, if you're looking for somewhere to start: there is no `.ics` export, and packaged releases target Windows only.

## Acknowledgements

CourseCal is built on other people's free software:

| Project | License |
|---|---|
| [Electron](https://www.electronjs.org/) | MIT |
| [React](https://react.dev/) | MIT |
| [Vite](https://vite.dev/) | MIT |
| [Lucide](https://lucide.dev/) — icons | ISC |
| [Inter](https://rsms.me/inter/) — UI typeface, by Rasmus Andersson | SIL Open Font License 1.1 |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) — monospace typeface | SIL Open Font License 1.1 |
| [date-fns](https://date-fns.org/) | MIT |
| [zod](https://zod.dev/) | MIT |
| [Vitest](https://vitest.dev/) | MIT |

Both typefaces are bundled with the app; their OFL license texts ship inside their
`@fontsource` packages and are included in packaged builds.

## License

[MIT](LICENSE) — do what you like with it, just keep the notice in the LICENSE file.

made by claude and mhei &lt;3
