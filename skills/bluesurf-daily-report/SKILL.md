---
name: bluesurf-daily-report
description: >-
  Saves hours on the Blue Surf daily report without confirming. Use when the
  user asks to capture, log, or report hours, or says daily report. Also ask
  once, at the end of a finished work activity, whether to capture the time
  worked. Never use Save & Confirm.
---

Repo: the Blue Surf tools checkout that has `.surf-cookies.json` (on this machine, `~/Documents/work/bluepeople/bluesurf-tools`). Session cookies load into headless Chromium. `PLAYWRIGHT_BROWSERS_PATH` must point at that repo's `.playwright` directory.

**Expired session:** if a command fails with "session expired", sign in again yourself; don't just tell the user to. Run `npm run login` from the repo (allow up to 6 minutes). It opens a Chromium window and exits by itself once the user is signed in; no Enter needed. Tell the user to finish SSO in that window. When it prints `Signed in`, retry once.

## When to ask

Capturing time is optional. At the end of a finished work activity, ask once whether to capture the time worked. If they say no, stop. If they ask on their own, do it.

## Save, do not confirm

The day is `https://surf.bluepeople.com/dailyReport/YYYY-MM-DD`. Default to yesterday when they say "ayer" and do not name a date.

`SAVE` keeps the report open (`status` 0). `SAVE & CONFIRM` closes it (`status` 2) and is the user's step. Never post status 2, never click Save & Confirm, and never accept the confirm dialog.

## How a day is filled

The target is 8 hours, counting meetings and anything already on the day.

1. Read `GET /api/effort/myDailyReport/YYYY-MM-DD`, `GET /api/google/calendar/YYYY-MM-DD`, and `GET /api/WorkItems/efforts/YYYY-MM-DD`.
2. An empty day auto-adds each calendar event as its own activity (project taken from the code before the first space or dash, category Google / Google Calendar). Keep those. Do not delete them to make room.
3. Add one activity per ticket worked. Project first, then the work item, then the category. Development work uses Desarrollo / Construcción / Codificación.
4. Hours on the tickets plus the meetings already added must total 8. If the ticket estimates add up to more than the hours left after meetings, lower the entries so the day is 8 and say so in that ticket's description. If the time worked is over the ticket estimate, keep the time and write why in the description after the ticket is selected.
5. Do not invent tickets or meetings that are not on the calendar or in the work that was done. If the known work cannot reach 8, save what is known and tell the user what is missing.

`POST /api/Effort/DailyReport` with `status: 0`. Then `GET` the day again and check `status` is 0 and the hours sum to what you intended. Tell the user the activities, the hours, and that confirm is still theirs at the daily report URL.
