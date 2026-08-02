# VCE Exam Simulator

An offline IT certification exam simulator for **Android and iOS**, modelled on the desktop
Avanset VCE Player: timed exam simulation, practice mode with instant feedback, a question
navigator, review flags, a score report with per-domain breakdown, and study analytics.

The app is the *engine*. Exam content comes from question banks you import — dump text in the
"Question #1 / Correct Answer:" layout used by community exam sites, plus JSON, Moodle GIFT,
Aiken and CSV. Two small banks of **originally written** sample questions ship with the app so
every feature is usable out of the box.

---

## Why React Native (Expo)

One TypeScript codebase compiles to a real native app on both platforms:

- Android → `.apk` / `.aab` via Gradle
- iOS → `.ipa` via Xcode

The alternative worth considering was Flutter. React Native won here because the exam engine is
plain logic, and keeping it in TypeScript means it runs unmodified under Node — the 130 unit
tests in `__tests__/` execute in under a second with no simulator, no device, and no Metro
bundler.

---

## Features

**Exam modes**
| Mode | Behaviour |
| --- | --- |
| Exam simulation | Timed, shuffled questions and options, no feedback until submit, auto-submits at zero |
| Practice | Untimed, answer and explanation revealed as soon as each question is completed |
| Quick drill | 30 shuffled questions with instant feedback |
| Custom | Pick domains, pool filter, question count, timer, pass mark, shuffling and partial credit |

**Question types** — single choice, multi-select ("choose two"), true/false, fill-in-the-blank,
sequencing, drag-and-drop, matching, and hotspot/drop-down grids.

**During an exam** — countdown clock with 5-minute and 1-minute warnings, pause (which stops the
clock *and* hides the question), flag for review, the numbered question navigator, per-question
timing, and autosave every 1.5 s so a killed app resumes mid-exam with the clock intact.

**After an exam** — pass/fail verdict, percentage, a 100–1000 scaled score with the cut score
pinned at 700, per-domain breakdown, weakest-domain guidance, and a filterable answer review
(all / incorrect / flagged / skipped) with explanations and personal notes.

**Study analytics** — readiness score per bank (weighted towards recent attempts and discounted
for thin coverage of the bank), score trend chart, attempt history, and a "previously wrong"
filter that rebuilds an exam from only the questions you have missed.

**Community-answer support** — dumps carry community vote distributions, which frequently
disagree with the printed key. The app shows the vote split and raises a **DISPUTED** badge when
the two disagree, so a wrong key in a dump does not quietly teach you the wrong answer.

Everything is stored locally in SQLite. The app makes no network requests.

---

## Running it

```bash
npm install
npx expo start          # then press 'a' for Android, 'i' for iOS, or scan the QR code
```

`npx expo start` runs the app in **Expo Go**, which is enough for everything except the native
SQLite build — for that, and for anything you intend to ship, use a development or production
build below.

### Quality gates

```bash
npm test          # 130 unit tests over the exam engine and importers
npm run typecheck # tsc --noEmit
```

---

## Building for devices

### Option A — EAS Build (no local Android Studio or Xcode needed)

```bash
npm install -g eas-cli
eas login
eas build:configure

npm run build:apk       # Android .apk for sideloading / internal testing
npm run build:android   # Android .aab for Google Play
npm run build:ios       # iOS .ipa (requires an Apple Developer account)
```

Profiles are defined in `eas.json`. iOS builds are signed in the cloud; EAS prompts for
credentials on the first run.

### Option B — Local native builds

`ios/` and `android/` are generated rather than committed, so create them first:

```bash
npx expo prebuild --clean
```

**Android** (needs JDK 17+ and the Android SDK):

```bash
npm run android                       # debug build onto a device/emulator
cd android && ./gradlew assembleRelease   # → android/app/build/outputs/apk/release/
cd android && ./gradlew bundleRelease     # → .aab for Play Store submission
```

**iOS** (needs macOS and Xcode 15+):

```bash
cd ios && pod install
npm run ios                           # debug build onto a simulator/device
open ios/vceexamsimulator.xcworkspace # then Product → Archive for App Store / TestFlight
```

Bundle identifier and package name are both `com.vcesim.examsimulator` — change them in
`app.json` before publishing under your own account.

---

## Importing question banks

Import → choose a file or paste text. The format is detected automatically; nothing is uploaded.

**Dump text** (ExamTopics-style — the most common paste):

```
Question #12 Topic 3

You need to configure high availability for the database.
What should you do? (Choose two.)

A. Enable geo-replication
B. Add a secondary replica
C. Increase the vCore count
D. Enable auto-failover groups

Correct Answer: BD

Community vote distribution
BD (74%)
AB (26%)

Explanation:
Auto-failover groups plus a secondary replica give ...

Reference:
https://learn.microsoft.com/...
```

The parser tolerates the messy reality of these files: wrapped option text, missing explanations,
site chrome like "Show Suggested Answer" and "Upvoted 12 times", stem sentences that begin with
"A." (a common false positive — it keeps the *last* run of sequential A/B/C markers), and blocks
where the vendor key is paywalled, in which case the community consensus becomes the key.

**JSON** — the native format. Answer keys are accepted as letters (`"BD"`), arrays, indexes, or
the option text itself:

```json
{
  "code": "SY0-701",
  "title": "Security+",
  "passingScore": 75,
  "timeLimitMinutes": 90,
  "sections": [{ "id": "threats", "title": "Threats & Vulnerabilities" }],
  "questions": [
    {
      "stem": "Which two are hashing algorithms? (Choose two.)",
      "sectionId": "threats",
      "options": ["MD5", "AES", "SHA-256", "RSA"],
      "answer": "AC",
      "explanation": "MD5 and SHA-256 are one-way hashes; AES and RSA are ciphers."
    }
  ]
}
```

**GIFT** (`::Title::Question {=right ~wrong}`, `{T}`, `{=answer1 =answer2}`), **Aiken**
(options then `ANSWER: A`), and **CSV/TSV** (`question,a,b,c,d,answer,explanation,section` —
columns matched by name, so order does not matter) are also supported.

Question ids are a hash of the question text, so re-importing an updated dump replaces the
content while keeping your history attached to questions that have not changed.

---

## Project layout

```
app/                        expo-router screens (file-based routing)
  _layout.tsx               app shell: opens the DB, seeds samples, mounts the dialog host
  index.tsx                 library: installed banks, readiness, resume
  exam/[bankId].tsx         mode picker and custom configuration
  session/[sessionId].tsx   the exam runner
  results/[attemptId].tsx   score report
  results/review/…          answer review with explanations and notes
  import.tsx  stats.tsx  settings.tsx

src/core/                   the exam engine — pure TypeScript, no React Native imports
  types.ts                  domain model
  grading.ts                grading rules for all 8 question types
  session.ts                session state machine (pure reducer) + timing
  scoring.ts                score report, scaled score, domain breakdown
  stats.ts                  readiness, trends, per-question mastery
  random.ts                 seeded RNG so an attempt can be reproduced exactly
  import/                   one parser per format + autodetection

src/db/                     SQLite schema, migrations, repositories
src/store/                  zustand stores (library, live attempt)
src/ui/                     theme, shared components, question renderers
assets/banks/               bundled sample banks
__tests__/                  engine and importer tests (Node, no RN)
```

The `src/core` / everything-else split is the important one: all exam rules live in pure
functions that can be tested directly, and the React layer only renders them and persists the
result.

### A note on the drag-and-drop renderer

The desktop VCE player uses a literal drag. On a phone that fights the scroll view, so
drag-and-drop and matching questions use the standard mobile equivalent — tap a token to pick it
up, tap a drop zone to place it, tap a filled zone to send it back. It is also the only variant
that works with screen readers. Grading is identical either way.

---

## Verification

- 130 unit tests across grading, the session engine, scoring/statistics, and all five importers
- `tsc --noEmit` clean under `strict`
- Bundles verified for Android (`4.6 MB` Hermes bytecode), iOS (`4.4 MB`) and web
- Full flows driven in a browser against the real build: library → setup → exam → answer →
  submit → score report → answer review, with no runtime errors

---

## Legal note

This repository contains an exam simulator and originally written sample questions. It contains
no vendor exam content.

Redistributing real certification exam questions ("brain dumps") generally breaches both the
copyright of the exam owner and the candidate agreement you accept when sitting the exam, and
can invalidate your certification. Import only material you have the right to use. Community
answer keys are also wrong often enough to matter — the app surfaces vote splits and disputed
answers for exactly that reason, but always verify against official vendor documentation.
