# AGENTS.md — رجال الأمة (Almagles)

Guidance for any coding agent (and human) changing this repo. Read it before
touching code. It describes how the site is **already** built, so every change
looks and behaves like it belongs here. When this file and the code disagree,
the established code wins — then fix this file.

---

## 1. What the site is

**رجال الأمة** is an Arabic-only, right-to-left community site for a study
circle («المجلس»). Members follow a weekly schedule of lessons («المقرر
الأسبوعي»), read daily posts by category, comment and react, tick off shared
devotional tasks («مهامي» / «ساحة الهمّة»), read the morning/evening/sleep
adhkar, and get in-app and phone (PWA push) notifications.

The identity, in one line: **a quiet, dignified, scholarly space — parchment
by day, a night-time «السَّحَر» palette by night — where encouragement serves
worship and never becomes a game for its own sake.** The tasks page says it
plainly: points are only encouragement, and the reward is with Allah.

Every change should keep that tone: calm, warm, sincere, uncluttered.

---

## 2. Stack and layout

| Part | Tech |
|---|---|
| Client (`client/`) | React 18, Vite 6, Tailwind CSS 4 (CSS-first config in `src/index.css`), React Router 7, lucide-react icons |
| Server (`server/`) | Node ≥ 20 (CI and Docker use 22), Express 4, Prisma 5, zod, argon2, JWT in httpOnly cookies |
| DB | PostgreSQL (Neon in production; in-memory PGlite in tests) |
| Media | Cloudinary when configured; otherwise `server/uploads/` locally |
| Mail | Brevo HTTP API (`MAIL_DEV_MODE=1` prints codes in dev) |
| Push | Web Push (VAPID) + service worker `client/public/sw.js` |
| Hosting | Render, one service: Express serves `/api` and the built client |

npm workspaces; run everything from the repo root.

```
client/src/
  pages/            one file per route (admin/ and write/ for role-gated areas)
  components/       shared UI; feature folders: schedule/ tasks/ adhkar/
  context/          AuthContext, NotificationsContext
  lib/              pure logic + data (api, dates, richText, taskSchedule, fadail, adhkarData…)
  index.css         design tokens + component classes (the design system)
client/public/      sw.js, theme-init.js, manifest, brand/ and icons/
server/src/
  app.ts            middleware order, rate limits, CSP, SPA + share-meta fallback
  routes/           one router per resource, mounted under /api
  lib/              domain logic (taskSchedule, notifications, push, linkPreview…)
  middleware/       auth (role guards), csrf, validate (zod), error (HttpError)
server/prisma/      schema.prisma, migrations/, seed.ts
server/test/        vitest + supertest API tests (helpers.ts)
```

### Commands

```bash
npm run dev            # server :4000 + client :5173 (Vite proxies /api and /uploads)
npm test               # server tests on PGlite with every migration applied (~45s)
npm run build          # server tsc + client tsc --noEmit + vite build
npx tsc --noEmit -p server/tsconfig.json   # server type-check (CI runs this)
npm run db:migrate     # prisma migrate dev (local DB only)
npm run db:generate    # regenerate Prisma client after schema changes
```

There is no linter or formatter configured. Match the surrounding file's
formatting (2 spaces, single quotes, semicolons, trailing commas, long lines
are tolerated).

---

## 3. Before you change anything

The owner asks that every area be examined thoroughly **before** editing. For
any non-trivial change:

1. **Read the whole feature area**, not just the line you'll edit: the page,
   its components folder, its `lib/` helpers, the server route, and its test
   file.
2. **Find the sibling that already does this.** A new tab → copy `TasksPage`'s
   `tab-strip`. A new dialog → look at `ReactorsDialog` / `ScheduleSheet`. A
   new route → copy the shape of `routes/tasks.ts`. Reuse before inventing.
3. **Check for mirrored logic.** Some logic exists on both sides and must stay
   in step (e.g. `client/src/lib/taskSchedule.ts` mirrors
   `server/src/lib/taskSchedule.ts`). `client/src/lib/links.ts` and
   `server/src/lib/links.ts` must be **byte-identical** — a test fails if they
   differ. Change both or neither.
4. **Check roles.** Who may see / do this? (§7). Gate it on the server first;
   the client gate is only for UX.
5. **Check both themes** (night is the default) and a ~360px phone width.
6. **State your plan** for anything touching the schema, auth, notifications,
   religious content, or more than a couple of files, and wait for approval.
7. After editing: type-check both apps, run `npm test`, and add/extend tests
   in `server/test/` for any server behaviour you changed.

---

## 4. Visual identity (the design system)

All of it lives in `client/src/index.css`. **Use it; don't route around it.**

### Colour — semantic tokens only

Tokens swap between paper (light) and night (dark) on `<html class="dark">`,
so **components never need `dark:` variants**.

| Use | Classes |
|---|---|
| Page / raised surfaces | `bg-canvas`, `bg-surface`, `bg-surface-2` |
| Borders | `border-line`, `border-line-strong` |
| Text | `text-fg` (main), `text-fg-2` (secondary), `text-muted` (quiet) |
| Brand gold | `text-accent` / `text-accent-strong` for text & icons; `bg-accent-fill` + `text-on-accent` for filled; `bg-accent-soft` for tinted panels |
| States | `danger`, `success`, `warn` each with a `-soft` background |
| Ornament | `text-pattern` (arch lattice, dividers) |

Rules:
- **No raw Tailwind palette colours** (`stone-500`, `amber-400`, `emerald-…`)
  and **no hex values in components.** If a colour is missing, add a token to
  both `:root` and `.dark` (and to `@theme inline`), with a comment.
- Allowed exceptions already in use: `bg-black/55`–`/60` for modal
  backdrops, `text-white` on a `bg-danger` badge or over photos/video,
  YouTube red in `PostMedia`, `theme-color` hex values that must match the
  tokens.
- Brand mark colours are `--brand-*`, used only by `Logo.tsx`. Brand assets
  are generated from `public/brand/almagles-mark.svg` by
  `client/scripts/brand-assets.mjs` — regenerate, don't hand-edit icons.
- Night («السَّحَر») is the default theme. `public/theme-init.js` must stay an
  external blocking script: the production CSP forbids inline scripts.

### Typography

- Body: **Noto Naskh Arabic** (`font-sans`, the default). Reading text uses
  `.prose-ar` (19px, line-height ~2).
- Display: **Reem Kufi** (`font-display`) for headings, buttons, labels, tabs,
  nav, badges, counts. Nearly every UI control carries `font-display`.
- Page title: `font-display text-2xl font-black text-fg` inside `.page-header`.
- Don't add new font families or load fonts from anywhere but Google Fonts
  (CSP).
- Reader font-size control shares the key `almagles_text_size` with the post
  page; reuse it rather than adding another.

### Component classes (use these first)

`container-site` (max 1180px, the page gutter) · `card` · `btn-primary` /
`btn-gold` · `btn-outline` · `btn-danger` · `input` · `label` · `chip` ·
`prose-ar` · `ayah` · `hadith` · `rich-link` · `page-header` · `tab-strip` ·
`section-heading` · `site-header`.

### Shape, depth and motion

- Buttons, chips, tabs, avatars, badges: **`rounded-full`** (pill). Minimum
  touch height 40–44px (`.btn` is `min-h-11`).
- Cards: `.card` (small radius, 1px `line` border, `bg-surface`). Inner
  panels and dialogs go up to `rounded-xl` / `rounded-2xl` — **not beyond**.
- Depth comes from borders and surface steps, not shadows. Use
  `shadow-2xs` / `shadow-sm` at most on inline elements; `shadow-xl`+ only on
  floating layers (toasts, sheets, dialogs, menus).
- No gradients, glows, or glassmorphism for decoration. The ornamental
  language is the brand's onion-arch motif (`ArchPattern`, watermark `Logo`)
  and thin gold rules.
- Motion is short and soft (`hero-rise`, `sheet-rise`, `points-pop`,
  `bushra-in` in `index.css`). Add new keyframes to `index.css` **with a
  `prefers-reduced-motion` override**. Tailwind-animate classes
  (`animate-in`, `fade-in`…) are not installed and do nothing.

### Recurring UI patterns — copy them

| Pattern | Reference |
|---|---|
| Page header (icon in gold circle + title + one-line hint) | `pages/TasksPage.tsx` |
| Tabs synced to `?tab=` with `role="tablist"` | `pages/TasksPage.tsx` |
| Empty state | `components/EmptyState.tsx` |
| Loading | `components/Spinner.tsx` (`<Spinner full />` for pages) |
| Bottom sheet / dialog | `components/ScheduleSheet.tsx`, `ReactorsDialog.tsx` |
| Toast (bottom-centre pill, `bg-fg text-canvas`, `role="status"`) | `pages/PostPage.tsx` |
| Save-on-request editing with «حفظ» / «تراجع» and unsaved guard | `components/schedule/*`, `lib/unsaved.ts` |
| Load/404/failure states for a fetched page | `pages/PostPage.tsx` |

### RTL

The whole document is `dir="rtl"` and the site is Arabic-only. Existing code
uses both physical (`left-*`, `pr-*`) and logical (`start-*`, `pe-*`)
utilities; both render correctly. **Prefer logical utilities in new code**,
but don't mass-convert existing files. Directional icons follow RTL meaning:
`ArrowRight` = back, `ChevronLeft` = next/forward.

### Accessibility

Real `<button type="button">`s, `aria-label` in Arabic on icon-only buttons,
`role="dialog" aria-modal="true"` on dialogs, `role="status"` on toasts,
visible focus (`.btn` has it), and keep the reduced-motion overrides.

---

## 5. Language, copy and voice

- **All user-facing text is Arabic** (Modern Standard, warm, brotherly,
  respectful — «إخوانك», «ذكّره بلطف», «أدرك سلسلتك»). No English in the UI.
- **Server error messages are Arabic** and returned as `{ message }`; the
  client shows `ApiError.message` directly.
- Quote names of features, buttons and labels with guillemets «…».
- Numbers in UI copy: Arabic-Indic digits via `Intl.NumberFormat('ar')` (see
  `arNumber` in `components/reactions.tsx`). Dates: Hijri (Umm al-Qura) and
  Gregorian helpers in `lib/dates.ts` — use them, don't format by hand. Weeks
  start on **Saturday**.
- **Code, identifiers, comments and commit messages are English.** Comments
  explain *why* in plain words and name the UI by its Arabic label, e.g.
  `// «عودة حميدة»: back after two days away — the bonus and a warm word.`
  Don't write comments that restate the code ("State for X", "matching site
  design").

---

## 6. Religious content — handle with care

This is the most sensitive part of the site.

- **Never invent, paraphrase from memory, or "fix" Qur'an or hadith text.**
  Only well-known, authentic texts, each with its source (surah:ayah;
  collection and grading for hadith, e.g. «رواه مسلم», «صححه الألباني»). If you
  need a new text, ask the owner for it or flag it for their review — do not
  generate it.
- Qur'an is written inside ﴿ … ﴾ with `[السورة: الآية]`; hadith inside «…»
  with its source. In user-written text the markers are `﴿ ﴾` for ayat and
  `(( ))` for hadith, rendered by `lib/richText.ts` / `RichText.tsx` with the
  `.ayah` / `.hadith` classes. Never render user text as HTML.
- Curated sources live in `lib/fadail.ts` (reward texts matched to task
  titles — read its header for the keyword-normalisation rules),
  `lib/reminderMessages.ts`, and `lib/adhkarData.ts`. Extend those files rather
  than scattering texts through components.
- ﷺ after the Prophet's name; honorifics as already used in the data files.
- Encouragement features (points, streaks, badges, nudges) stay gentle and
  bounded: nudges are rate-limited (once a day per pair, at most three received
  per member a day), excuses are respected, and copy never shames a member.

---

## 7. Roles and permissions

| Role | Can |
|---|---|
| anonymous | read posts, schedule, adhkar |
| `visitor` | + comment, react, profile, tasks, notifications |
| `writer` | + publish in assigned categories (`/write`); if `canManageSchedule`, the schedule (`/manage/schedule`) and task management |
| `admin` | everything via `/admin` |

Server guards in `server/src/middleware/auth.ts`: `requireAuth`,
`requireAdmin`, `requireScheduleManager`, `requirePublisher`,
`requireWriterOrAdmin`, and `canManageCategory()`. Client guards in
`client/src/App.tsx` (`RequireLogin`, `RequireAdmin`, …) mirror them. A new
permission is enforced on the server and tested in
`server/test/permissions.test.ts`.

---

## 8. Server conventions

- **Route shape** (see `routes/tasks.ts`): a `Router()`, zod schemas with
  Arabic messages, `validate(schema, 'body' | 'query')`, then
  `async (req, res, next) => { try { … } catch (err) { next(err); } }`.
  Throw `new HttpError(status, 'رسالة عربية')` for expected failures. Prisma
  `P2002`/`P2025` are already mapped in `middleware/error.ts`.
- Select explicit fields (`TASK_SELECT`-style constants); never return
  `passwordHash` or other users' emails.
- **Middleware order in `app.ts` matters**: helmet → health → body parsers →
  cookies → rate limits (production only) → `resolveUser` → `csrfProtect` →
  routes → `notFoundApi` → SPA fallback → `errorHandler`. New mutating routes
  automatically need the CSRF header; the client `api()` helper sends it.
- New write-heavy endpoints get a limiter in `app.ts` like their neighbours.
- If a new external origin is needed (images, media, iframes), update the CSP
  in `app.ts` deliberately and say why.
- **Time is the member's.** The browser sends its local `date` (YYYY-MM-DD),
  `time` (HH:MM) and, for night tasks, today's `fajr`/`isha`; the server
  bounds-checks them (e.g. ticking only near today). Don't compute a member's
  "today" from server time.
- Notifications: create them through `lib/notifications.ts` and push through
  `lib/push.ts` (`pushToUsers`), never by calling `web-push` directly. New
  notification types need an enum value (migration), client text in
  `client/src/lib/notifications.ts`, and a link target.
- Env vars are read only via `server/src/env.ts`; document new ones in
  `server/.env.example`, `render.yaml` and the README table.

### Database and migrations

- Schema in `server/prisma/schema.prisma`. Migrations are folders named
  `YYYYMMDDHHMMSS_snake_case` with Prisma-style SQL.
- **Never edit or delete an applied migration**; add a new one.
- Tests apply every migration in order on PGlite — migration SQL must run there
  (plain Postgres DDL; backfills in SQL are fine).
- Production runs `prisma migrate deploy` at build time. Keep migrations
  additive and backfill existing rows so live data keeps working.
- `db:seed` is safe on the live DB (creates an admin only if none exists).
  `db:seed:demo` refuses non-local DBs — keep that guard.

### Tests

`server/test/*.test.ts` with helpers from `test/helpers.ts`: `resetDb`,
`createUser`, `createCategory`, `client()` (a cookie- and CSRF-aware agent),
`loginAs(email)`. Tests share one PGlite connection and run serially. Name
tests by behaviour in plain English (`'runs qiyam from Isha to Fajr where the
member is…'`). Pure logic in `lib/` gets unit tests too. There are no client
tests; verify UI changes by running the app in both themes and at phone width.

---

## 9. Client conventions

- All HTTP through `api()` in `lib/api.ts` (CSRF header, single-flight token
  refresh, Arabic `ApiError`). Never call `fetch('/api/…')` directly.
- Shared response types live in `lib/types.ts`.
- Pure logic and static data go in `lib/`; components stay presentational
  where they can. Large static datasets go in `lib/*Data.ts`.
- `localStorage` keys are prefixed `almagles_`, and every access is wrapped in
  `try/catch` (private mode). Server state belongs on the server, not in
  `localStorage`.
- Editors save **on request** («حفظ» / «تراجع», Enter, Ctrl+S, «حفظ الكل»),
  not on blur, and register unsaved edits with `lib/unsaved.ts` so leaving
  the page asks first.
- Routes are declared in `App.tsx`; add nav entries to **both** the desktop and
  mobile menus in `Navbar.tsx` (and `Footer.tsx` if it's a public page).
- Effects that fetch guard against stale responses (`let active = true` …
  cleanup) like `PostPage`.
- Prayer times are computed client-side in `lib/prayerTimes.ts` for the
  member's chosen city; reuse `prayerClockFor(loadPlace())`.

---

## 10. Git and pull requests

- Branch from `main` as `feat/<topic>` or `fix/<topic>`; open a PR into
  `main` on `distru3/almagles`. CI (`.github/workflows/ci.yml`) must pass:
  server type-check, tests, full build, and `npm audit --omit=dev
  --audit-level=high`.
- **Commit style** (the established one — no `feat:`/`fix:` prefixes):
  - Subject: plain English describing what changed **for the user**,
    optionally prefixed with the area: `Tasks: open a member's profile from
    the board`, `Make post text optional`.
  - Body: short prose paragraphs explaining the behaviour and the why, naming
    UI by its Arabic label in «», and noting any new migration by name.
- Don't commit `.env`, `server/uploads/`, or `.claude/`.

---

## 11. Known drift — don't copy these

These spots predate or deviate from the conventions above. Leave them unless
the task is to fix them, and **don't use them as examples**:

- `pages/AdhkarPage.tsx` and `components/adhkar/*`: `rounded-3xl`, heavy
  shadows, `tracking-widest`, `Sparkles` ornaments, gradient dividers,
  non-existent `animate-in fade-in` classes, comments that restate the code,
  and tasks linked by hard-coded keyword lists instead of `lib/fadail.ts`-style
  normalised matching. Adhkar reminders run on a 30s `setInterval` in
  `localStorage`, so they only fire while the page is open — unlike schedule
  reminders, which use server push.
- `pages/admin/AdminCommentsTab.tsx`: `text-stone-500 dark:text-stone-400`
  (should be `text-muted`).
- `pages/Home.tsx`: one `dark:bg-canvas` override on the hero.
- `components/reactions.tsx` uses `Intl.NumberFormat('ar-EG')` while others use
  `'ar'`; `CouncilNotes.tsx` shows a counter with Western digits.
- Toasts are copy-pasted in four places (`PostPage`, `CommentSection`,
  `ScheduleBuilder`, `AdhkarPage`) and admin search boxes duplicate
  `SearchInput`-like markup — prefer extracting a shared component when you
  touch them.
- Destructive confirms and errors in admin use `window.confirm` / `alert`.
  Acceptable for now; a new flow should prefer an in-page dialog.
