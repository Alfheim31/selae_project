# SELAE — Smart Event Logistics and Analytics Engine

Event registration and camera-driven check-in for student organizations: anyone
can create an event, people find it on Discover, register from their phones and
get a boarding-pass ticket, and the gate scanner checks them in. Built for CSC 0315
Intelligent Systems, BSCS 3-4, PLM.

Everything runs on **one laptop at the venue**. That laptop hosts the server;
phones on the same Wi-Fi open the event page, register and get their ticket. No
internet connection is needed (fonts and the OCR engine are bundled too).

## What it does

**For attendees (on their phones)**
- **Events** — your itinerary: tickets registered from this device and events you
  host, upcoming and past.
- **Discover** — every public event: search, **browse by category** (workshops,
  talks, hackathons, study jams, career, social, assemblies, competitions),
  **featured calendars** (one per host, with **Follow**), a departures board of
  what's next, and photos from recent events.
- **Event details slide-over** — clicking an event slides its details in from the
  right without leaving the list. From there, **Event page** opens what people
  registering see, and **Manage event** (for hosts) opens the organizer console.
- **Event page** — date, venue, host, description, and a registration form. Names
  are standardized to *Surname, Given Name M.* ("DELA CRUZ" becomes "Dela Cruz").
  When the event is full, people join a **waitlist**. After the event, its photos.
- **Boarding-pass ticket** — shown right after registering, with the event, the
  student number, the status, and a reminder to show the student ID at the entrance.
- **Notifications** (bell in the top bar) — moved off the waitlist, event starting
  within a day, checked in, photos posted, new events from calendars you follow;
  for hosts, registration counts and a reminder to add photos. A live clock sits
  next to it.

**For organizers**
- **Create event** — name, host, category, time, venue, capacity, cover photo or
  sky color, public or unlisted. Anyone can create one.
- **Live dashboard** — headcount against capacity, arrivals over time, guest list
  with waitlist (move people to going), feed of recent scans including failures.
  A **turnout forecast** predicts the final headcount, shows each guest's chance
  of coming, and recommends how many people to **release off the waitlist**
  (see below).
- **Scanner** — opens centered over the dashboard (**Open scanner**). A live webcam
  reads the printed student number off the ID with OCR, without any button, and a
  Bayesian matcher works out who it is (see below). Manual entry, and **Lock for
  volunteers** so the scanner can't be closed by accident (hold to unlock).
- **Analytics** — show-up rate, check-ins over time, attendance by section, how
  each attendee was identified, how the OCR matcher and the turnout model are
  doing, CSV export.
- **Photos** — once the event has ended, upload photos from the day (drag and drop
  or pick several; they're resized in the browser first). They show on the event
  page and in Discover, and guests who checked in get a notification.
- **Test tickets** — printed student numbers for guests, to test or demo the scanner.
- **Invite & settings** — a QR code and link to the registration page, a co-host
  link, and the event details, including the **cover photo** and closing
  registration.

## Design

The look borrows the feeling of travel tickets and boarding passes rather than
any one app: paper-white ticket stock on a cool grey-blue page, cobalt and
periwinkle skies fading to lime and sand, perforated tear lines with notches,
barcodes, small spaced-out mono labels (DATE, BOARDS, GATE, SEATS) and condensed
display type. Fonts are Barlow, Barlow Condensed and IBM Plex Mono, bundled
through `@fontsource` so they work offline.

## Requirements

- Node.js 20 or newer
- Python 3 (only for `run.py`; everything else is Node)
- A webcam on the laptop at the gate (the app still works without one: manual
  entry covers it)

## Running it

```bash
python run.py
```

The first run installs the dependencies; later runs skip that step unless
`package.json` changed. (Without Python: `npm install` once, then `npm run dev`.)

The terminal prints two addresses:

- **Local** (`http://localhost:5173`) — open this on the laptop. The camera only
  works on localhost, so the gate scanner must run here.
- **Network** (e.g. `http://192.168.1.23:5173`) — phones on the same Wi-Fi use
  this. You don't need to type it: **Invite & settings** shows a QR code that
  already points there.

### At the venue

```bash
python run.py venue
```

This builds the app (`npm start` does the same) and serves it from a single Node server on port 8080 (set
`PORT` to change it). It's faster and steadier than the dev server for a real
event.

## Who can manage what

- Anyone on the Wi-Fi can browse public events, register, and view or cancel their
  own ticket.
- An event can be managed from **the device that created it**, from **the laptop
  running the server** (localhost manages every event), or by anyone who opens its
  **co-host link** (Invite & settings).

This keeps a stranger on the same Wi-Fi from opening your gate scanner. It is not
real authentication: there are no accounts or passwords.

## Data

SELAE keeps its data in **Supabase** (Postgres plus Storage) when a `.env` file
names a project, and otherwise in a local JSON file. To use Supabase:

1. Create a project at supabase.com. In **SQL Editor**, paste `server/storage/supabase.sql`
   and run it once. It creates six tables (`events`, `registrations`, `logs`,
   `ocr_scans`, `directory`, `state`) and a public `uploads` bucket for photos.
2. Copy `.env.example` to `.env` and fill in the **Project URL** and the
   **service_role** key from Project Settings → API. The key stays on the server;
   phones never see it.
3. Start the app. An empty project gets the demo data below on the first run.

Each table row holds one record as JSON. The server keeps a working copy in memory
(the matcher and the forecast train on the whole history) and writes only the rows
that changed, within 200 ms of each change and on shutdown. If Supabase can't be
reached, the change stays pending and is retried every 5 seconds. Supabase needs
an internet connection at the venue; without a `.env`, everything stays offline in
`data/selae.json`, with covers and photos in `data/uploads/` (both ignored by git).

The first run creates the data with:

- a semester of **simulated past events** (14 of them, marked as simulated), so
  the turnout forecast has history to learn from;
- the CS Department General Assembly, already 42 minutes into check-in;
- the Intro to Machine Learning Workshop, two days out, with 60 seats and a
  52-person waitlist;
- six more upcoming events from three hosts, so Discover has categories and
  calendars to browse.

To start over, stop the server and empty the tables (or delete the local file).
A data set from before the turnout forecast has no past events, so the forecast
falls back to an average show-up rate until you start over or run real events.
To keep a different local file, set `SELAE_DATA=path/to/file.json`.

Changes are saved within 200 ms and on shutdown, so a sudden power cut can lose the
last moment of activity. The local file keeps the previous version as
`selae.json.bak`; if it can't be read at startup, SELAE keeps a `.corrupt` copy and
restores the backup.

## Intelligent component 1: OCR matching that learns

SELAE reads the printed student number and decides who the attendee is. OCR under glare makes mistakes, so this
is a decision under uncertainty, not a lookup. It works like an agent:

1. **Perceives.** Tesseract (`client/lib/ocr.js`) keeps reading the whole visible camera
   frame, in the browser and offline. Each read tries one color channel and tilt
   correction, sharpens the image and keeps only text shaped like a student number
   (nine digits starting with 19 or 20). Blue comes first because it separates pale
   text from red ID backgrounds best. The same number has to be read twice within 30 seconds.
2. **Knows how OCR fails.** `server/intelligence/matcher.js` holds a confusion matrix,
   P(read digit | true digit), plus chances of a dropped or extra digit. It
   starts from general OCR knowledge (8 and 3, 1 and 7, 5 and 6 get swapped
   far more than 1 and 0).
3. **Reasons with Bayes' rule.** For everyone on file,
   P(student | read) ∝ P(read | student) × P(student). The likelihood sums over
   every alignment of the read with that student's number (forward algorithm),
   weighting each digit by OCR's confidence in it. The prior comes from the
   event: a registered guest who hasn't arrived is far likelier at the gate than
   someone already inside or not registered. An "unknown person" hypothesis
   takes the probability when the read looks like nobody on file.
4. **Acts on a three-band policy.** At 95% or more it identifies the attendee
   alone; from 40% it shows the operator a short list with probabilities and the
   doubtful digits underlined; below that it sends them to manual entry. Whether
   the person is *admitted* is still decided by the check-in rules (registered,
   not a duplicate, under capacity).
5. **Learns.** When the operator picks a candidate, or types the right student
   after "none of these", the read is aligned with the true number and every
   digit pair is counted into the confusion matrix. The matcher adapts to this
   venue's lighting and this batch of cards. Only a person's answer is learned
   from, never the matcher's own guesses, and an answer that looks nothing like
   the read (a slip) is ignored.

**Analytics → OCR matcher** shows how it's doing: reads decided alone or asked,
how often the right student was ranked first, and the misreads it has learned.

### Evaluating it

```bash
python run.py test   # unit tests (or: npm test)
npm run eval         # matcher vs. plain edit distance on a simulated venue
```

`npm run eval` builds 2,000 students on file and a 300-guest event, simulates
OCR misreading numbers at an 11% per-digit error rate with confusions the matcher
doesn't expect at first, and compares (seed 7):

| Matcher | Top-1 right | Decided alone | Wrong when alone | Asked operator |
|---|---|---|---|---|
| Plain edit distance (earlier prototype) | 90.8% | 60.3% | 0.3% | 39.7% |
| Bayesian, before learning | 95.8% | 75.5% | 0.9% | 19.5% |
| Bayesian, after 43 corrections | 98.3% | 83.8% | 1.2% | 13.7% |

It also prints how the 95% threshold trades operator workload against wrong
automatic identifications. Most of those mistakes are people who aren't on file
at all whose number is a digit away from a guest's, which is why the approved
screen shows the name for the volunteer to check.

These numbers are from simulated reads. For the paper, photograph real IDs
(some with glare), run them through **Read printed number**, and record each
read and the true number in a CSV, then:

```bash
npm run eval -- --csv reads.csv --roster roster.txt
```

`reads.csv` has `read,truth[,conf]` per line (conf: per-digit confidences
separated by spaces); `roster.txt` lists the registered student numbers. The
first half of the reads is learned from, the second half is tested.

## Intelligent component 2: turnout forecast and waitlist release

The matcher answers "who is this at the gate?". The forecast answers the
logistics questions: how many of the people registered will actually come, and
how many people can come in off the waitlist without anyone being turned away
at the door. Free student events lose a lot of registrants (about 4 in 10 in the
simulated history), so a "full" event usually has empty seats while its
waitlist waits. The code is `server/intelligence/forecast.js`.

1. **Learns from past events.** Every registration at a finished event is a
   labelled example: they checked in or they didn't. A logistic regression,
   fitted by Newton's method with a small L2 penalty, learns P(show up) from
   what SELAE can see: how far ahead they registered (and whether it was the
   same day), their own record at earlier events (smoothed show-up rate, first
   event or not, missed their last one), year level, the time and day of the
   event, and whether they got in off the waitlist. Each example's features
   come only from events *before* it, so the model never sees the future.
2. **Explains itself.** Each feature's contribution (weight × standardized
   value) names what drove a prediction: "came to 1 of 6 past events",
   "registered 9 days ahead". Hover a percentage on the guest list to see it.
3. **Updates during check-in.** Not having arrived yet is evidence. From past
   events SELAE knows F(t), the share of attendees who have arrived t minutes in,
   and by Bayes' rule P(comes | not here at t) = p(1 − F(t)) / (p(1 − F(t)) + 1 − p).
4. **Accounts for whole events swinging.** People don't decide independently:
   rain or an exam the next day moves everyone. SELAE measures how far past
   events landed from its forecast (refitting on the events before each one),
   models that as a shift on everyone's log-odds, and averages over it with
   Gauss–Hermite quadrature. During check-in, who has and hasn't arrived
   updates its belief about this event's shift.
5. **Decides how many to release.** Given the shift, arrivals follow a
   Poisson-binomial distribution, computed exactly. Releasing k more people (in
   waitlist order, to stay fair) raises the expected headcount and the chance
   that more come than the venue holds. SELAE recommends the largest k whose
   chance of overflow stays under the organizer's limit (1%, 5% or 10%), and
   shows the trade-off as a chart. The organizer presses the button; nothing
   is released on its own, and the gate still refuses anyone past capacity.

**Analytics → Turnout model** shows the model's scores on the most recent past
events held out, its calibration, and the weight it learned for each fact.

### Evaluating it

```bash
npm run eval:turnout
```

This simulates 5 separate worlds, each with 400 students and 40 oversubscribed
events. Every student has a hidden reliability the model never sees. The script
then walks forward through the last 12 events of each world (60 events), training
only on what had finished before each one. Results with seed 11:

| Predicting who comes | AUC | Brier | Log loss |
|---|---|---|---|
| Average past show-up rate | 0.500 | 0.249 | 0.691 |
| Each person's own past rate | 0.736 | 0.208 | 0.603 |
| Logistic regression (SELAE) | 0.744 | 0.205 | 0.596 |

| Waitlist release | Released | Empty seats | Seats filled | Chance of overflow | Turned away |
|---|---|---|---|---|---|
| No release (SELAE before this) | 0.0 | 36.6 | 53.2% | 0.0% | 0.00 |
| Fixed 15% overbook | 11.8 | 31.1 | 60.3% | 0.0% | 0.00 |
| Capacity ÷ average rate | 60.6 | 8.5 | 89.1% | 37.0% | 3.87 |
| Forecast, attendees assumed independent, 5% | 55.7 | 9.5 | 87.8% | 20.2% | 1.29 |
| **Forecast, 1% risk** | 34.4 | 20.2 | 74.2% | 1.9% | 0.06 |
| **Forecast, 5% risk** | 43.6 | 15.4 | 80.3% | 7.0% | 0.31 |
| **Forecast, 10% risk** | 48.2 | 13.2 | 83.1% | 11.4% | 0.60 |

What this shows, honestly:

- Most of the ranking power comes from a person's own record. The other
  features add a little on top. With real data that balance may differ.
- The release decision is where the forecast pays off. It fills 74–83% of seats
  instead of 53%, and its overflow rate lands close to the risk you pick. The
  naive "capacity ÷ average rate" rule fills slightly more seats but overflows
  over a third of events.
- Treating attendees as independent made a 5% setting overflow 20% of the time.
  Modelling event-level swings is what brought it back to 7%. It still runs a
  little over target, so 5% is better read as "about 5–7%".

These numbers come from simulated events. Once SELAE has run a few real events,
the forecast trains on those instead (Analytics shows how many past events are
real), and the held-out scores there become the ones to report.

## Testing the scanner

1. On your phone (same Wi-Fi), scan the QR code in **Invite & settings** and
   register with the student number on your ID.
2. On the laptop, open the event's dashboard, press **Open scanner** and allow the camera.
3. Hold the ID up to the webcam, close and steady. There is no button and no set
   position: it checks in by itself once it has read the student number twice.
   Show it again later and you get "Already checked in".

**Test tickets** has more student numbers to try: guests who will check in, guests
already checked in, waitlisted guests, and students who aren't registered.

Leaving an ID in front of the camera won't repeat the result: the same number is
ignored until it has been out of view for a minute.

## Project layout

```
run.py                 one command: installs once, then starts the app
vite.config.js         Vite setup (root is client/); also copies the OCR assets and mounts the API in npm run dev
.env                   SUPABASE_URL and SUPABASE_SERVICE_KEY (ignored by git; see .env.example)
server/
  index.js             venue server: serves dist/ and the API (npm start)
  api.js               logical layer: registration, waitlist, check-in rules, uploads, notifications
  intelligence/
    matcher.js         intelligent component: Bayesian OCR matching and learning
    forecast.js        intelligent component: turnout forecast and waitlist release
  storage/
    store.js           physical layer: picks Supabase or the JSON data file; atomic file writes
    supabase.js        Supabase store: one table per collection, photos in Storage, changed rows only
    supabase.sql       the tables and bucket to create once in the Supabase SQL editor
  seed/
    seed.js            demo events, past history and student directory for the first run
    simulate.js        simulated event history, for the demo data and the evaluation
  tests/               unit tests for the matcher, forecast, API and store (npm test)
  eval/
    eval-matcher.js    evaluation: matcher vs. edit distance, threshold sweep (npm run eval)
    eval-turnout.js    evaluation: forecast vs. simpler predictors and release rules (npm run eval:turnout)
client/
  index.html           the page shell
  main.jsx             entry point
  index.css            Tailwind
  pages/
    SELAE_Frontend.jsx routing, the organizer console, scanner modal, photos
    public.jsx         top bar, notifications, events, discover, slide-over, event page,
                       registration, ticket, create event
  components/
    shared.jsx         design system (styles), sky covers, barcodes, formatting, QR code, photo resizing
    camera.jsx         webcam access, beeps, hold-to-exit
    forecast.jsx       turnout forecast panel, waitlist release, turnout model panel
  lib/
    api.js             client for the server API; host keys and tickets per device
    ocr.js             OCR of the printed student number (Tesseract), with glare correction
  public/tesseract/    OCR worker, engine and model, copied from node_modules (ignored by git)
data/                  the local JSON data file and uploads, when Supabase isn't configured (ignored by git)
```

## Stack

- React + Vite, Tailwind CSS 4
- A small Node server (no framework); data in Supabase (Postgres + Storage) or a JSON file
- recharts for charts, lucide-react for icons
- zxing-wasm (zxing-cpp compiled to WebAssembly) for decoding; bundled with the
  app, so scanning works offline
- qrcode for the registration page QR code
- tesseract.js for OCR; its worker, engine and English model are copied into the
  build from node_modules, so OCR also works offline

## Not built yet

- Accounts and passwords; email or SMS confirmations
- Exit scanning, so "checked in" counts arrivals, not people currently inside
- Importing a registration list

## Known limitations

- Host keys travel over plain HTTP, so anyone on the same Wi-Fi could capture one.
- Anyone can create an event, and a host's event page receives the full student
  directory, because the scanner's search and matcher use it.
- Registration is limited to 20 attempts a minute per address, but without an official
  roster SELAE can't tell whether a student number is real.
- A check-in can't be undone yet.

## Note for the Java build

This prototype exists to settle the interface and the rules before the Java
version is written. JavaFX is the closest match for the organizer console, and
the original ZXing library (`com.google.zxing`) covers QR and barcode decoding.
Tess4J does the OCR there, and `server/intelligence/matcher.js` and `forecast.js` have
no dependencies, so they port to Java line for line.
