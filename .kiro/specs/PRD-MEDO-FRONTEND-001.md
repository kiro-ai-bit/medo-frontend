---
prd_id: PRD-MEDO-FRONTEND-001
title: Combined Frontend — screens, flows, offline sync, and PWA
application: Medo
component: "Frontend"
profile: combined-frontend
version: "1.0"
status: approved
author: Devin
approver: Sir Asim
approval_date: 22-11-26 06-02-26 UTC
upstream:
  feature_list: docs/features/feature-list.md@2026-11-20
  service_catalog: docs/contracts/service-catalog.md@2026-11-22
  frontend_map: docs/contracts/frontend-map.md@2026-11-20
  glossary: GLOSSARY.md@2026-11-21
  architecture_standard: docs/architecture/MicroservicesApps-Architecture-Standard.md
downstream: [HLD, LLD, tasks]
hld_readiness: pass
supersedes: none
superseded_by: null
---

# PRD-MEDO-FRONTEND-001: Combined Frontend — screens, flows, offline sync, and PWA

## 1. Problem statement

Medo's entire product surface is one combined frontend: a single Next.js 15 App Router PWA (Vercel-hosted) that every Patient and Caregiver uses for auth, medicine management, scheduling, dose marking, reminders, notifications, care links, and the Monster Defense gamification layer. There are no per-role apps and no native apps — one codebase, responsive web, installable PWA.

Current state: none — greenfield build; no workaround exists in production. The cost of failure is direct user-facing: a confusing auth flow loses signups, a broken offline write-queue silently loses dose marks (the product's core promise is offline-first adherence), a missing iOS install step kills Web Push reminders, and a theme that never leaves Harmony makes the gamification layer invisible. Every service PRD's value is delivered through this surface.

Quantification: <50 concurrent users, <5k dose events/day, <10k catalog entries (`platform-quality-baseline.md`). The binding constraint is correctness of the offline contract — Dexie cache + FIFO write-queue + last-write-wins replay — and per-screen fan-out discipline, not scale.

Trace: `docs/features/feature-list.md` (all sections + cross-cutting), `docs/contracts/frontend-map.md` (per-screen calls, Dexie contract, refresh triggers), all six service PRDs under `docs/prd/`, Map 1 tickets 04–10, Map 2 ticket 08, Map 3 ticket 05 (gateway/CORS), Map 4 tickets 01/02.

## 2. Goals and non-goals

### 2.1 Goals

- G-1: Deliver every feature-list capability through one responsive, installable PWA — auth, profile, Today, medicines/catalog/photos, scheduling builder, care links/invites, notifications feed/prefs, push lifecycle, gamification display — for both Patient and Caregiver actors. [§1]
- G-2: Implement the `frontend-map.md` offline contract exactly: Dexie caches only the offline-critical slice (doses, medicine display data, schedules, write queue); all writes queue FIFO and replay in order; conflicts resolve server-side last-write-wins; reads refresh on the four locked triggers. [§1]
- G-3: Implement per-screen parallel fan-out with per-section rendering — independent TanStack Query calls, skeletons per section, no backend aggregation endpoint, no chained calls. [§1]
- G-4: Implement the dose-day lifecycle UX end-to-end: reminders (local + Web Push + email fallback awareness), Taken/Snooze actions, outcome editing until midnight, missed-lock display, refill alerts, and Monster Defense theme states on Today + shell. [§1]
- G-5: Implement correct auth UX: signup→verify gate, login, silent refresh rotation, logout/logout-all, forgot/reset, cooldown messaging, pending-invite resume, and session-expired handling. [§1]
- G-6: Implement the push/local-notification stack: VAPID fetch → subscribe on permission grant → unregister on logout; iOS PWA-install onboarding; service-worker local notifications scheduled from cached Dexie data. [§1]
- G-7: Meet the accessibility, theming, and motion bar: WCAG 2.2 AA target, keyboard/screen-reader dose actions, Harmony/Uneasy/Horror surfaces, Framer Motion with reduced-motion respect. [§1]

### 2.2 Non-goals

- NG-1: Any backend logic, business rules, or data ownership — all services own their domains; the frontend renders DTOs and enqueues writes only. HLD/LLD/implementation → downstream artifacts.
- NG-2: A native iOS/Android app or app-store distribution — v1 is PWA-only; iOS push works only via installed PWA (feature-list §9).
- NG-3: Per-user channel preferences, quiet hours, or reminder scheduling choices — server-owned and non-mutable for dose reminders (Map 3 t10); the frontend only renders the two pref toggles.
- NG-4: Offline gamification computation — Harmony Points/theme are API-only; frontend shows last-known or hides the widget offline (`frontend-map.md`).
- NG-5: Offline notifications feed, catalog browsing, or Care Links — API-only per `frontend-map.md`; never Dexie-cached.
- NG-6: Caregiver score, levels, progression, battles — rejected Map 1 ticket 10.
- NG-7: SEO/marketing pages, public unauthenticated content beyond auth/invite-preview routes — the app is session-gated.
- NG-8: Multi-language/i18n — English only v1 (no requirement exists in any upstream artifact).
- NG-9: Admin/watcher/pharmacist/doctor/store roles — rejected Map 1 ticket 01; Patient + Caregiver only.

## 3. Users, actors, and roles

| Actor | Role (glossary term) | Acts on behalf of | Authz requirement summary |
|---|---|---|---|
| Patient | Patient | self | Full parity: own medicines/schedules/doses/notifications; `patientId` = session `sub` |
| Caregiver | Caregiver | self (account); acts on linked patients | Same UI per selected Care Link's `patientId`; read-only gamification; zero patient-account powers (no profile-of-patient, no invites-as-patient unless also a Patient — impossible: one role per account) |
| Browser/OS | system | n/a | Hosts service worker, IndexedDB (Dexie), Push API, Notification API, online/offline signals |
| Medo services (×6) | Medo service | Medo platform | Provide all data via public REST through the API gateway; frontend never trusted for authz |
| API gateway (Caddy/nginx) | Medo service | Medo platform | Single public entry-point; explicit public-route table; pass-through JWT verification |

## 4. User stories / capability inventory

Frontend-scoped stories:

- US-FE-01: As a new user, I want to sign up, verify my email, and land on a working Today screen so that I can start managing medicines immediately. [FR-FE-001…010]
- US-FE-02: As a returning user, I want seamless login/refresh/logout so that I never manage tokens manually and sessions behave predictably. [FR-FE-011…016]
- US-FE-03: As a patient, I want to invite a caregiver by email and track pending/accepted/declined state so that someone I trust can help manage my medicines. [FR-FE-040…048]
- US-FE-04: As a caregiver, I want to accept/decline invites addressed to my email and switch between my linked patients so that I can manage each patient's medicines with full parity. [FR-FE-049…054]
- US-FE-05: As a patient or caregiver, I want the Today screen to show today's doses with live theme/points/notifications so that I always know what to take and how adherence is going. [FR-FE-020…028]
- US-FE-06: As a patient or caregiver, I want to mark doses taken/skipped/snoozed — online or offline — so that adherence is recorded even without connectivity. [FR-FE-029…034, 080…088]
- US-FE-07: As a user, I want to register/edit/archive/delete medicines with photos via the catalog so that my medicine list stays accurate. [FR-FE-055…066]
- US-FE-08: As a user, I want a guided schedule builder with per-day exceptions so that complex regimens are captured without writing RRULE by hand. [FR-FE-067…074]
- US-FE-09: As a user, I want a notifications feed, unread badge, and two notification toggles so that I stay informed without noise. [FR-FE-075…079]
- US-FE-10: As a user on any device, I want dose reminders via local notifications + Web Push with an email fallback so that I am alerted even when the app is closed — and on iOS, clear install guidance so push can work at all. [FR-FE-089…098]
- US-FE-11: As a user, I want the Monster Defense theme and animations to reflect my adherence state so that the app feels like the defense game it is. [FR-FE-099…103]
- US-FE-12: As a user, I want my profile editable and my account deletable (with the active-links block explained) so that I control my data. [FR-FE-104…108]

### 4.1 Screen/module inventory

| Screen/module | Purpose | Actor(s) | Service calls (frontend-map ref) |
|---|---|---|---|
| Signup | Create account (name/email/password/role); resume-at-invite variant | Patient, Caregiver | Identity `POST /v1/auth/signup` (map: Auth row) |
| Login | Email+password → session; cooldown messaging | Patient, Caregiver | Identity `POST /v1/auth/login`, `POST /v1/auth/refresh` |
| Verify-email gate | Email verification interstitial + resend | unverified session | Identity `POST /v1/auth/verify-email`, `POST /v1/auth/resend-verification` |
| Forgot/reset password | Request link → set new password | public | Identity `POST /v1/auth/forgot-password`, `POST /v1/auth/reset-password` |
| Invite accept/decline | Public invite preview → authenticated accept/decline | Caregiver (+anonymous preview) | Care `GET /v1/care/invites/{token}`, `POST .../accept`, `.../decline` |
| Own profile | View/edit displayName/timezone; delete account | Patient, Caregiver | Identity `GET/PATCH/DELETE /v1/me` |
| Patient switcher | Select active Care Link's patient (caregiver only) | Caregiver | Care `GET /v1/care/links` |
| Today | Dose list + theme + points + notifications + medicines display data | Patient, Caregiver | Schedule&Dose `GET /v1/patients/{id}/doses?from=today&to=today` · Gamification `GET /v1/patients/{id}/gamification` · Notification `GET /v1/notifications`, `GET /v1/notifications/unread-count` · Medicine `GET /v1/medicines?patientId=` |
| Dose actions | Taken/Snooze/Skip marking (incl. offline enqueue) | Patient, Caregiver | Schedule&Dose `POST /v1/doses/{id}/outcome`, `POST /v1/doses/{id}/snooze` |
| Medicines list | Patient's medicines + catalog search entry | Patient, Caregiver | Medicine `GET /v1/medicines?patientId=`, `GET /v1/medicine-catalog?q=` |
| Medicine detail/edit/archive/delete | Private record management + guard messaging | Patient, Caregiver | Medicine `GET/PATCH /v1/medicines/{id}`, `POST .../archive`, `DELETE .../{id}`, `GET /v1/medicine-catalog/{id}` |
| Add medicine / catalog editor | Adopt catalog entry or create new catalog entry + photos | Patient, Caregiver | Medicine `POST /v1/medicines`, `POST /v1/medicine-catalog`, `PATCH /v1/medicine-catalog/{id}`, photo two-step routes |
| Scheduling builder | Guided schedule create/edit + per-occurrence exceptions | Patient, Caregiver | Schedule&Dose `GET/POST /v1/patients/{id}/schedules`, `GET/PATCH/DELETE /v1/schedules/{id}` |
| Care Links management | Invites (create/resend/cancel), links list, end link, pending invites | Patient, Caregiver | Care `POST /v1/care/links/invites`, `GET /v1/care/invites`, resend/cancel, `GET /v1/care/links`, `POST /v1/care/links/{id}/end` |
| Notifications feed + prefs | Feed list, mark read, two toggles | Patient, Caregiver | Notification `GET /v1/notifications?cursor=`, `POST .../read`, `POST /v1/notifications/read-all`, `GET/PUT /v1/notification-preferences` |
| Push subscription lifecycle | VAPID fetch, subscribe/unsubscribe per device | Patient, Caregiver | Notification `GET /v1/push/vapid-key`, `POST /v1/push-subscriptions`, `DELETE /v1/push-subscriptions/{id}` |
| Gamification surfaces | Harmony Points + Theme state on Today + global shell | Patient, Caregiver (read-only) | Gamification `GET /v1/patients/{id}/gamification` |
| Offline write-queue (module) | FIFO enqueue/replay of dose outcomes; Dexie cache | system | replays to Schedule&Dose outcome/snooze routes on reconnect |
| Service worker / local notifications (module) | SW registration, Dexie-scheduled local notifications, push handling | system | Notification API + Push API + Dexie reads (no REST) |

### 4.2 User flows

- UF-FE-01: Signup → verify → first use — entry: signup screen (or invite-resume variant carrying invite token); steps: submit fields → `POST /v1/auth/signup` → verification email sent → verify-email gate → user clicks link → `POST /v1/auth/verify-email` → session → Today first paint (parallel fan-out); invite variant: after account creation, redirect to `GET /v1/care/invites/{token}` → accept; exits: verified session on Today; errors: duplicate email, weak password, expired/used verify link → resend path.
- UF-FE-02: Login → session → logout — entry: login screen; steps: credentials → `POST /v1/auth/login` → access token in memory + refresh cookie → app shell; silent `POST /v1/auth/refresh` before access expiry (25 min) and on 401 retry once; exits: Today/dashboard; logout → `POST /v1/auth/logout` + push-subscription `DELETE` + Dexie purge → login screen; "log out all devices" variant → `POST /v1/auth/logout-all`; errors: bad credentials, 3-fail cooldown (25 min — surface remaining time), refresh failure → forced re-login.
- UF-FE-03: Forgot → reset — entry: forgot-password; steps: email → `POST /v1/auth/forgot-password` (always show neutral confirmation — no account enumeration) → email link → reset form → `POST /v1/auth/reset-password` → all sessions revoked → login screen with notice; errors: expired/used link, rate limit (2/hr) message.
- UF-FE-04: Patient invites caregiver → link active — entry: Care Links management (patient); steps: enter caregiver email → `POST /v1/care/links/invites` → invite email sent (server-side) → pending row shown (resend ≤3/24h, cancel) → caregiver accepts via UF-FE-05 → patient's `GET /v1/care/links` refresh shows active link + "link ended" banner on next open for ended links; exits: active Care Link or terminal invite state (declined/expired/cancelled → fresh-cycle re-invite); errors: invalid email, resend cap reached, invite expired.
- UF-FE-05: Caregiver invite → accept → link active — entry: invite email link → `GET /v1/care/invites/{token}` public preview (patient displayName, expiry); steps: if no session → signup/login resume carrying token → `POST /v1/care/invites/{token}/accept` → Care Link created → switcher gains patient; decline → `POST .../decline` → confirmation, silent to patient; errors: expired/used/declined invite → terminal state page; wrong-role account (Patient role cannot accept — role required is Caregiver).
- UF-FE-06: Dose-day lifecycle — entry: Today screen or notification tap; steps: T−30min reminder ping → dose window opens → user marks Taken/Skipped/Snooze → outcome POST (or offline enqueue) → points/theme/Doses Remaining update server-side → T+1hr ping if unmarked → hourly pings → midnight missed-lock (server job) → dose row shows missed/locked; exits: outcome recorded or missed; errors: offline → enqueue + local confirmation "will sync"; 401 → refresh → retry; conflict → last-write-wins server-side.
- UF-FE-07: Offline mark → reconnect replay — entry: device offline (browser `online`/`offline` events + fetch failures); steps: user marks outcome → write enqueued FIFO in Dexie → UI shows pending-sync state → connectivity restored → replay in order to `POST /v1/doses/{id}/outcome`/`snooze` → on success remove queue entry + refresh reads; exits: queue empty, server state canonical; errors: replay failure → retry with backoff, entry retained; conflict → server last-write-wins, UI refetches truth.
- UF-FE-08: Add medicine — entry: Medicines list → "add"; steps: catalog search `GET /v1/medicine-catalog?q=` → adopt existing (`POST /v1/medicines {catalogEntryId,…}`) OR create catalog entry (`POST /v1/medicine-catalog`, duplicate-check offer) → fill private fields (doctor/dosage/dosesRemaining/refillThreshold/price/pharmacy) → optional 3 tagged photos via two-step signed-URL upload → save → zero-schedule prompt "you must provide a schedule"; exits: medicine in list; errors: duplicate catalog match offered, photo upload failure → retry slot, delete-guard on zero dose records.
- UF-FE-09: Schedule builder — entry: medicine detail or Today prompt; steps: pick medicine → calendar multi-select dates → dose time(s) → repeat none/weekly/monthly/yearly → optional start (default today) / end (never) — UI MUST show effective defaults → per-occurrence skip/time-override on calendar → save `POST /v1/patients/{id}/schedules`; exits: schedule listed, doses materialized server-side; errors: invalid RRULE-equivalent input blocked client-side, server validation errors surfaced.
- UF-FE-10: Push subscription lifecycle — entry: first session post-login or settings; steps: `GET /v1/push/vapid-key` → `Notification.requestPermission()` → on grant `pushManager.subscribe` → `POST /v1/push-subscriptions {endpoint,p256dh,auth}` per device; iOS: if not installed → install prompt (Add to Home Screen) before permission can succeed; logout → `DELETE /v1/push-subscriptions/{id}`; exits: subscribed device receiving server Web Push; errors: permission denied → degrade to local notifications + Today screen + persistent enable prompt; subscription 404/410/403 → server prunes, client resubscribes transparently.
- UF-FE-11: Notifications feed + prefs — entry: bell icon / unread badge; steps: `GET /v1/notifications?cursor=` infinite scroll → mark one/all read → prefs screen `GET/PUT /v1/notification-preferences` (two toggles only; reminders + auth emails shown non-mutable); exits: read state persisted server-side; errors: offline → feed hidden (API-only), badge shows last-known count.
- UF-FE-12: End care link / delete account — entry: Care Links management or profile; steps: end link → confirm dialog (no reason field) → `POST /v1/care/links/{id}/end` → instant revoke, other side sees "link ended" banner; patient delete account → `DELETE /v1/me` → if active links exist server blocks → UI explains and offers end-links-first path; exits: link ended / account deleted → logout; errors: blocked deletion message, confirm-dialog cancel.
- UF-FE-13: Caregiver marks dose for patient — entry: switcher selects patient → Today; steps: identical dose-day flow as UF-FE-06 but calls carry selected `patientId`; outcome attributed server-side (`actorId`); exits: same as UF-FE-06; errors: link ended mid-session → check-link denial → "no access" page on next patient-scoped call.

## 5. Functional requirements

### 5.1 Session, auth & patient context

- FR-FE-001: WHEN a visitor opens any app route, the frontend SHALL serve only public surfaces (login, signup, forgot/reset, invite preview) to unauthenticated sessions and SHALL redirect authenticated sessions away from auth screens to the role-appropriate home (Patient/Caregiver → patient switcher or Today). [US-FE-01, 02]
  - AC-FE-001a: unauthenticated deep link to `/today` → redirect to login with return-path preserved — verification: e2e test.
  - AC-FE-001b: authenticated user opening `/login` → redirected to app home — verification: e2e test.
- FR-FE-002: The frontend SHALL store the access JWT in memory only (never localStorage/sessionStorage/IndexedDB/URL/logs); the refresh token SHALL live exclusively in the `httpOnly` `SameSite=Lax` cookie set by Identity on `api.<domain>` — the frontend never reads or persists it. [US-FE-02]
  - AC-FE-002a: no token material present in Dexie, query cache persistence, or client logs — verification: code review + storage inspection test.
- FR-FE-003: WHEN an API call returns 401, the frontend SHALL attempt exactly one silent `POST /v1/auth/refresh` and retry the original call once; if refresh fails, SHALL clear session state, purge Dexie, and route to login with a session-expired notice. [US-FE-02]
  - AC-FE-003a: expired access token mid-session → transparent refresh, user sees no interruption — verification: e2e test (shortened token TTL).
  - AC-FE-003b: revoked refresh → single redirect to login, no retry loop — verification: e2e test.
- FR-FE-004: The frontend SHALL gate all app routes behind email verification: a session with unverified email SHALL see only the verify-email interstitial (with resend) until `POST /v1/auth/verify-email` succeeds or the user logs out. [US-FE-01]
  - AC-FE-004a: unverified session cannot reach Today/medicines — verification: e2e test.
  - AC-FE-004b: resend respects server rate limit and shows cooldown — verification: component test.
- FR-FE-005: The frontend SHALL implement the `patientId` rule exactly: Patient accounts always use `patientId` = Identity `userId` (session `sub`); Caregiver accounts MUST select a Care Link via the switcher (`GET /v1/care/links`) and use that link's `patientId` for every patient-scoped call; no patient-scoped call SHALL be made without a resolved `patientId`. [US-FE-04, 13]
  - AC-FE-005a: caregiver with zero links sees an empty-state switcher prompting invite acceptance, never a broken Today — verification: e2e test.
  - AC-FE-005b: every patient-scoped request URL contains the selected `patientId` — verification: contract test on request builder.
- FR-FE-006: WHEN a Caregiver's selected link ends (detected via failed patient-scoped call or links refresh), the frontend SHALL revoke that patient context, remove it from the switcher, and show the "link ended" banner on next app open per feature-list §7; patient-scoped UI for the ended link SHALL be inaccessible immediately. [US-FE-04, 13]
  - AC-FE-006a: link ended while viewing patient → next patient-scoped call denied → "no access" page + switcher fallback — verification: e2e test.
  - AC-FE-006b: "link ended" banner renders once per ended link on next open — verification: component test.
- FR-FE-007: The frontend SHALL render a dedicated "no access" page for direct links/denied patient-scoped routes — never a blank screen or raw error (feature-list §3: UI hides disallowed, "no access" page on direct links). [US-FE-04, 13]
  - AC-FE-007a: caregiver deep-links to unlinked patient's dose → no-access page, no data leak — verification: e2e test.
- FR-FE-008: WHEN signup is entered via an invite link, the frontend SHALL carry the invite token through signup/login and route to `GET /v1/care/invites/{token}` accept/decline after the session exists — never losing the token across the auth detour. [US-FE-03, 05]
  - AC-FE-008a: invite → signup → verify → accept completes without re-entering the link — verification: e2e test.
- FR-FE-009: The frontend SHALL surface the 3-failed-login → 25 min cooldown as a countdown on the login screen (server enforces; UI displays remaining time from the error response) and SHALL surface forgot/reset rate limits (2/hr) with a clear message. [US-FE-02, 03]
  - AC-FE-009a: cooldown response → login button disabled with remaining-time label — verification: component test.
- FR-FE-010: On logout (single or all-devices), the frontend SHALL call the Identity logout route(s), DELETE the device's push subscription, purge Dexie + query cache, clear in-memory tokens, and route to login. [US-FE-02]
  - AC-FE-010a: post-logout, zero adherence data remains in IndexedDB — verification: e2e test (Dexie inspection).

### 5.2 Today screen & dose actions

- FR-FE-020: The Today screen SHALL fan out its four independent data sources in parallel — doses window (`GET /v1/patients/{id}/doses?from=today&to=today`), gamification (`GET /v1/patients/{id}/gamification`), notifications (`GET /v1/notifications` + `GET /v1/notifications/unread-count`), medicines display data (`GET /v1/medicines?patientId=`) — rendering each section independently with its own skeleton; no chained calls, no aggregation endpoint (frontend-map conventions). [US-FE-05]
  - AC-FE-020a: slow gamification call does not block dose list render — verification: e2e test (throttled network).
  - AC-FE-020b: each section shows its own loading/error state — verification: component tests.
- FR-FE-021: The Today screen SHALL display each dose with medicine name, dosage, scheduled time, photo, and current window state derived client-side from `scheduledAt` vs now in the schedule's timezone — takeable T−30min, on-time until T+1hr, late until midnight, missed after (feature-list §5); window labels are display-only, server outcome authority unchanged. [US-FE-05, 06]
  - AC-FE-021a: dose at T−20min shows "takeable" affordance; at T+2hr shows "late"; post-midnight unmarked shows "missed/locked" — verification: unit tests (fake clock) per window boundary.
- FR-FE-022: WHEN a user marks an outcome (taken-on-time/taken-late/skipped) the frontend SHALL call `POST /v1/doses/{id}/outcome` online, or enqueue FIFO in the write-queue offline; taken marks SHALL be attributed implicitly by session (actorId is server-side); the UI SHALL show pending-sync state for queued marks. [US-FE-06]
  - AC-FE-022a: online mark → immediate UI update + background refetch — verification: e2e test.
  - AC-FE-022b: offline mark → queued entry visible as "pending sync", no error toast — verification: e2e test (offline mode).
- FR-FE-023: The frontend SHALL offer Snooze (5 min) via `POST /v1/doses/{id}/snooze` (transient `snoozedUntil`, no outcome change) and SHALL hide/disable outcome actions on doses already carrying a final outcome until the midnight missed-lock passes — outcomes remain editable until then per feature-list §10 (edit = new outcome POST, not a separate edit route). [US-FE-06]
  - AC-FE-023a: marked dose before midnight → outcome can be changed via re-mark — verification: e2e test.
  - AC-FE-023b: post-midnight missed dose → actions disabled, "missed" state shown — verification: e2e test (fake clock).
- FR-FE-024: The Today screen SHALL render Harmony Points + Theme state from `GET /v1/patients/{id}/gamification` on the dose list and global shell palette; offline it SHALL show last-known values or hide the widget — never compute or cache score in Dexie (frontend-map: gamification is API-only). [US-FE-05]
  - AC-FE-024a: offline launch → theme widget shows last-known or skeleton-hide, never stale-forever without indicator — verification: e2e test.
  - AC-FE-024b: theme ∈ {Harmony, Uneasy, Horror} drives the three visual states per feature-list §10 — verification: component tests.
- FR-FE-025: The frontend SHALL render refill state per medicine (Doses Remaining, refill-alert badge) from `GET /v1/medicines?patientId=` display data on Today/medicines surfaces; refill alerts themselves arrive via Notification feed/push — the frontend never computes thresholds. [US-FE-05]
  - AC-FE-025a: medicine at dosesRemaining ≤ its refillThreshold shows alert badge; at 0 shows out-of-stock state — verification: component test.
- FR-FE-026: The frontend SHALL show a "you must provide a schedule" prompt for medicines with zero schedules (feature-list §4) linking to the scheduling builder — informational, not blocking. [US-FE-07]
  - AC-FE-026a: zero-schedule medicine → prompt visible on medicine detail — verification: component test.
- FR-FE-027: The frontend SHALL reflect multi-actor changes without user action: `refetchInterval` ≈ 15 min on Today-screen queries while the app is open (catches caregiver marks + midnight missed-lock), plus immediate refresh after every successful mutation and on reconnect (frontend-map refresh triggers 2–4). [US-FE-05, 06]
  - AC-FE-027a: caregiver marks dose → patient Today updates within the 15-min interval or next focus — verification: e2e test.
  - AC-FE-027b: no `refetchInterval` runs while the tab is hidden — verification: unit test (TanStack config).
- FR-FE-028: The frontend SHALL render per-section error states with retry affordances on Today — a failed fan-out call degrades only its section, never the whole screen. [US-FE-05]
  - AC-FE-028a: notifications call fails → dose list + theme still render; section shows retry — verification: e2e test.

### 5.3 Medicines, catalog & photos

- FR-FE-055: The Medicines list SHALL show the patient's private medicines (name resolved via catalog fields, dosage, dosesRemaining, photo) via `GET /v1/medicines?patientId=` and SHALL offer catalog search via `GET /v1/medicine-catalog?q=` for adoption — parallel/sectioned, no chained calls. [US-FE-07]
  - AC-FE-055a: catalog search results show brand + ingredient names; adopt action prefills private-record form — verification: e2e test.
- FR-FE-056: WHEN adding a medicine whose catalog entry doesn't exist, the frontend SHALL require creating the catalog entry first (`POST /v1/medicine-catalog` with duplicate-check — on duplicate-match response it SHALL offer the existing entry) before `POST /v1/medicines {catalogEntryId, …}` can succeed; the two-step ordering SHALL be enforced in UI flow. [US-FE-07]
  - AC-FE-056a: unknown medicine → catalog-create step precedes adopt; duplicate match → "use existing" path — verification: e2e test.
- FR-FE-057: The private medicine form SHALL collect all required fields — prescribing doctor, dosage, dosesRemaining (whole number ≥0), price, pharmacy name — with client validation per §5.3; edit uses `PATCH /v1/medicines/{id}`; archive uses `POST /v1/medicines/{id}/archive` (keeps history, confirm dialog). [US-FE-07]
  - AC-FE-057a: invalid dosesRemaining (negative/non-integer) blocked client-side AND server error surfaced if bypassed — verification: component + contract test.
- FR-FE-058: WHEN deleting a medicine, the frontend SHALL call `DELETE /v1/medicines/{id}` and SHALL handle the fail-closed dose-records guard: on guard rejection it SHALL show "cannot delete — dose history exists; archive instead" and offer archive. [US-FE-07]
  - AC-FE-058a: delete with dose records → guard message + archive CTA — verification: e2e test.
- FR-FE-059: Photo management SHALL implement the two-step signed-URL flow per slot A/B/C: `POST .../photos {slot}` → `{photoKey, uploadUrl}` → direct PUT to bucket → `PUT .../photos/{slot} {photoKey}`; the UI SHALL support the gap-fill rule display (missing slot shows next-most-relevant photo) and SHALL allow ≥1 photo enforcement at adopt per Medicine PRD. [US-FE-07]
  - AC-FE-059a: upload success → slot confirmed; upload failure → slot stays empty with retry — verification: e2e test (mocked storage).
  - AC-FE-059b: catalog-entry photos use `POST /v1/medicine-catalog/{id}/photos` + `PUT .../photos/{slot}`; private medicine has no photo routes of its own (photos live on catalog entry) — verification: contract test.
- FR-FE-060: The frontend SHALL render catalog photos via the read URLs returned by catalog/medicine DTOs and SHALL cache medicine display data (name/photo/dosage) in Dexie for offline Today/notification text per the Dexie contract — catalog browsing itself stays API-only. [US-FE-05, 07]
  - AC-FE-060a: offline Today → dose rows still show medicine name/photo from Dexie — verification: e2e test.
- FR-FE-061: Community catalog edits (`PATCH /v1/medicine-catalog/{id}`) SHALL be offered from catalog detail for any signed-in user, with last-write-wins semantics surfaced as "edits are shared" notice — no ownership UI exists (catalog entries are never owned). [US-FE-07]
  - AC-FE-061a: catalog edit → PATCH → subsequent readers see update — verification: e2e test.

### 5.4 Scheduling builder & exceptions

- FR-FE-067: The scheduling builder SHALL implement the guided flow per feature-list §5: pick Medicine → calendar multi-select dates → dose time(s) → repeat none/weekly/monthly/yearly → optional start (default today) / optional end (default never); the UI SHALL display the effective defaults before save (mandatory). [US-FE-08]
  - AC-FE-067a: leaving start/end empty shows "starts today / never ends" pre-save — verification: component test.
  - AC-FE-067b: saved schedule → `POST /v1/patients/{id}/schedules` payload contains RRULE-equivalent + times + schedule timezone — verification: contract test.
- FR-FE-068: The builder SHALL support per-occurrence exceptions: skip a day and change a day's time (EXDATE semantics) rendered on the calendar; skipped days SHALL display as "skipped by user" in history — distinct from dose-skip outcomes (never conflated). [US-FE-08]
  - AC-FE-068a: skipped occurrence → calendar marker + history label "skipped by user" — verification: e2e test.
- FR-FE-069: Schedule edit SHALL use `PATCH /v1/schedules/{id}` and delete `DELETE /v1/schedules/{id}` with confirm; the UI SHALL state that deleting a schedule affects future doses while history is retained. [US-FE-08]
  - AC-FE-069a: delete → confirm dialog explains future-dose impact — verification: component test.
- FR-FE-070: The frontend SHALL capture/display the schedule's own timezone (stored per schedule, no profile-tz dependency) and SHALL render dose times in that timezone on Today. [US-FE-08]
  - AC-FE-070a: schedule in different tz → Today shows local-to-schedule times correctly — verification: unit test.
- FR-FE-071: WHEN a medicine has zero schedules, the builder SHALL be reachable from the zero-schedule prompt (FR-FE-026) pre-selecting that medicine. [US-FE-08]
  - AC-FE-071a: prompt → builder opens with medicine preselected — verification: e2e test.

### 5.5 Care Links & invites

- FR-FE-040: The Care Links screen SHALL let a Patient create an invite (`POST /v1/care/links/invites {caregiverEmail}`), list own pending invites (`GET /v1/care/invites`), resend within cap (`POST /v1/care/invites/{id}/resend`, ≤3/24h), and cancel (`POST /v1/care/invites/{id}/cancel`); each terminal state (declined/expired/cancelled) SHALL offer fresh-cycle re-invite. [US-FE-03]
  - AC-FE-040a: pending invite row shows expiry + resend count remaining — verification: component test.
  - AC-FE-040b: resend cap reached → resend disabled with explanation — verification: component test.
- FR-FE-041: The Caregiver side SHALL list invites addressed to the account email via `GET /v1/care/invites` (pending-invites visibility per Map 1 t07) with accept/decline actions hitting the token routes — accept requires Caregiver role; a Patient-role session SHALL be denied with explanation. [US-FE-04]
  - AC-FE-041a: patient-role account opening caregiver invite → role explanation, no accept call — verification: e2e test.
- FR-FE-042: The invite preview route `GET /v1/care/invites/{token}` SHALL be reachable unauthenticated (locator only — never authorization); expired/used/declined tokens SHALL render a terminal-state page, not an error. [US-FE-05]
  - AC-FE-042a: expired token → "invite expired" page with contact-patient guidance — verification: e2e test.
- FR-FE-043: The links list (`GET /v1/care/links`) SHALL show links for both roles — Patient sees caregivers, Caregiver sees patients — and SHALL offer `POST /v1/care/links/{id}/end` behind a confirm dialog with no reason field (feature-list §7). [US-FE-03, 04, 12]
  - AC-FE-043a: end link → confirm → instant revoke; other side's next open shows banner — verification: e2e test.
- FR-FE-044: In-app notifications for accept/decline/link-ended SHALL appear in the Notification feed (server-generated); the frontend SHALL NOT generate local feed rows for care events — feed is server truth only. [US-FE-03, 04]
  - AC-FE-044a: link ended → feed row + banner appear without manual refresh beyond normal triggers — verification: e2e test.
- FR-FE-045: WHEN invite email is concerned, the frontend SHALL NOT offer any UI implying the invite email can be disabled — it is non-mutable/always-sent (Map 4 t09 amendment); prefs screen shows only the two toggles. [US-FE-09]
  - AC-FE-045a: prefs screen renders exactly `refillAlerts` + `careLinkNotifications` toggles — verification: component test.

### 5.6 Notifications feed, prefs & push

- FR-FE-075: The notifications feed SHALL render server feed rows via `GET /v1/notifications?cursor=` (cursor infinite scroll), per-item `POST /v1/notifications/{id}/read`, and `POST /v1/notifications/read-all`; the unread badge SHALL use `GET /v1/notifications/unread-count`. Feed is API-only — offline it SHALL hide or show last-known with a stale indicator, never Dexie-cache feed rows. [US-FE-09]
  - AC-FE-075a: offline → feed section shows degraded state, badge keeps last-known count — verification: e2e test.
- FR-FE-076: Notification preferences SHALL render exactly two toggles — `refillAlerts`, `careLinkNotifications` — via `GET/PUT /v1/notification-preferences`, default ON; dose reminders and auth emails SHALL be shown as non-mutable informational rows (cannot be toggled). [US-FE-09]
  - AC-FE-076a: PUT sends only the two toggle fields — verification: contract test.
- FR-FE-077: The frontend SHALL NOT create local feed rows or badge counts for dose reminders — reminders are push/local-notification only, not feed entries (Map 4 t09 decision). [US-FE-09]
  - AC-FE-077a: dose reminder arrival → no feed row created client-side — verification: e2e test.
- FR-FE-078: The frontend SHALL deep-link notification taps (web push + feed rows where applicable) to the relevant surface — dose reminders → Today with the dose visible; care events → Care Links; refill → medicine detail. [US-FE-09, 10]
  - AC-FE-078a: tapping a dose reminder notification opens Today focused on that dose — verification: e2e test.
- FR-FE-089: The frontend SHALL fetch `GET /v1/push/vapid-key` once per session (cache in memory), call `Notification.requestPermission()` only in a user-gesture context, and on grant SHALL `pushManager.subscribe` + `POST /v1/push-subscriptions {endpoint, p256dh, auth}` once per device; permission state SHALL drive a persistent enable/install prompt when denied or unavailable. [US-FE-10]
  - AC-FE-089a: granted → subscription POST fires once per device (dedup by endpoint) — verification: e2e test.
  - AC-FE-089b: denied → prompt persists with OS-settings guidance, app remains fully usable — verification: component test.
- FR-FE-090: On iOS, the frontend SHALL detect non-installed PWA state and SHALL present an install prompt (Add to Home Screen instructions) BEFORE attempting push permission — push is impossible on iOS Safari without installed PWA (feature-list §9); the prompt SHALL be dismissible but re-surfaced on reminder-relevant contexts. [US-FE-10]
  - AC-FE-090a: iOS Safari non-installed → install guidance shown, no dead-end permission prompt — verification: e2e test (device lab or emulation).
- FR-FE-091: The service worker SHALL schedule on-device local notifications from Dexie-cached schedules + doses per the reminder rhythm (patient T−30/T/T+1hr then hourly till marked/midnight; caregiver backup from T+1hr) with rich Monster Defense content (medicine name, dosage, time, photo) and Taken/Snooze actions per Map 1 t06; local notifications are the primary offline channel — server Web Push is backup with no handoff logic. [US-FE-10]
  - AC-FE-091a: offline device with cached schedule → local notification fires at dose time — verification: e2e test (SW + fake clock).
  - AC-FE-091b: Taken action on notification → outcome marked via same write path (online or queue) — verification: e2e test.
- FR-FE-092: The frontend SHALL handle Web Push payloads in the service worker (display notification, route tap per FR-FE-078) and SHALL treat push as best-effort backup — a missed push never blocks or duplicates local-notification state. [US-FE-10]
  - AC-FE-092a: push received while app closed → notification shown; tap → correct route — verification: e2e test.
- FR-FE-093: WHEN a push subscription endpoint returns 404/410/403 server-side (pruned), the client SHALL transparently resubscribe and re-POST on next permission check; the frontend SHALL NOT surface subscription errors to users. [US-FE-10]
  - AC-FE-093a: stale subscription → silent resubscribe — verification: integration test.
- FR-FE-094: The frontend SHALL expose PWA installability (manifest, icons, standalone display) and SHALL register the @serwist service worker on first load with update-on-reload semantics that never interrupt an in-progress dose mark. [US-FE-10]
  - AC-FE-094a: installable criteria met (Lighthouse PWA check) — verification: build audit.
  - AC-FE-094b: SW update during active session → applies on next navigation, no data loss — verification: e2e test.

### 5.7 Offline store, write-queue & degraded mode

- FR-FE-080: The frontend SHALL maintain a Dexie (IndexedDB) cache containing exactly the offline-critical slice: upcoming/today dose rows (times, outcome, `snoozedUntil`), medicine display data (name/photo/dosage), schedules (future dose times), and the write-queue — and SHALL NOT cache notifications feed, gamification state, catalog browse results, or Care Links (frontend-map exclusions). [US-FE-06]
  - AC-FE-080a: Dexie schema inspection → only the four entity types present — verification: unit test.
  - AC-FE-080b: no feed/gamification/care-link rows ever written to Dexie — verification: code review + test.
- FR-FE-081: Offline writes SHALL enqueue as FIFO entries `{type: outcome|snooze, doseId, payload, enqueuedAt}`; on reconnect they SHALL replay strictly in order to `POST /v1/doses/{id}/outcome` / `POST /v1/doses/{id}/snooze`, removing each entry only on success; a failed entry SHALL block later entries (ordering preserved) and retry with bounded backoff. [US-FE-06]
  - AC-FE-081a: two offline marks replay in enqueue order — verification: e2e test.
  - AC-FE-081b: first entry fails → second NOT sent; queue retains order — verification: unit test.
- FR-FE-082: Conflict resolution SHALL be server-authoritative last-write-wins: the frontend SHALL NOT merge or guess outcomes; after replay it SHALL refetch dose state and render server truth, surfacing any divergence silently-corrected (e.g. caregiver marked while patient offline). [US-FE-06]
  - AC-FE-082a: offline mark + concurrent caregiver mark → final UI shows server outcome after refetch — verification: e2e test.
- FR-FE-083: Read refresh SHALL occur on exactly the four locked triggers: app open, connectivity restored, after every successful online mutation, and `refetchInterval` ≈ 15 min on Today queries while visible; no other polling SHALL exist. [US-FE-05, 06]
  - AC-FE-083a: connectivity restore → immediate refetch of all active queries — verification: e2e test.
  - AC-FE-083b: mutation response → dependent queries invalidated/refetched — verification: unit test.
- FR-FE-084: Degraded-mode UX SHALL be explicit per surface: Today shows cached doses + pending-queue count; dose actions remain available (enqueue); medicines show cached display data; notifications feed + gamification show last-known or hide with stale indicator; catalog browse, care links, and prefs are hidden/disabled offline with "requires connection" affordance. [US-FE-06, 09]
  - AC-FE-084a: offline launch → Today fully usable from Dexie with sync badge — verification: e2e test.
  - AC-FE-084b: offline catalog search → disabled state with explanation — verification: component test.
- FR-FE-085: WHEN the write-queue is non-empty at app open, the frontend SHALL display a persistent pending-sync indicator with count and SHALL auto-replay on connectivity; the indicator SHALL clear only when the queue empties. [US-FE-06]
  - AC-FE-085a: queued entries survive reload (Dexie persistence) — verification: e2e test.
- FR-FE-086: The frontend SHALL bound the write-queue defensively (e.g. cap with oldest-first eviction + user warning) to prevent unbounded IndexedDB growth during long offline periods — exact bound is LLD detail (OQ-FE-03). [US-FE-06]
  - AC-FE-086a: queue at cap → warning shown, oldest entries flagged — verification: unit test.
- FR-FE-087: The frontend SHALL detect connectivity via browser `online`/`offline` events AND failed-request signals (a lie-ability guard: captive portals) — degraded mode engages on either signal. [US-FE-06]
  - AC-FE-087a: `navigator.onLine` true but API unreachable → degraded mode engages after failed calls — verification: e2e test.
- FR-FE-088: Dexie schema migrations SHALL be versioned and SHALL run before app render; a failed migration SHALL surface a recoverable error screen (never a white screen). [US-FE-06]
  - AC-FE-088a: schema v→v+1 upgrade preserves queued writes — verification: unit test.

### 5.8 Profile, theming, motion & account

- FR-FE-104: The profile screen SHALL render/edit own profile via `GET/PATCH /v1/me` (displayName, timezone) for both roles; patient-scoped profile of linked patients does NOT exist (patients have no separate profile surface — caregiver sees patient data only via patient-context screens). [US-FE-12]
  - AC-FE-104a: timezone change → schedules display respects it where applicable — verification: component test.
- FR-FE-105: The frontend SHALL render Monster Defense theme state (Harmony/Uneasy/Horror) on Today + global shell per feature-list §10: Harmony = bright/calm, Uneasy = smoky/amber, Horror = dark/blue monsters closer; theme is display-only driven by the gamification DTO. [US-FE-11]
  - AC-FE-105a: each theme state produces distinct palette + Today scene treatment — verification: visual/component tests.
- FR-FE-106: Framer Motion animations SHALL respect `prefers-reduced-motion` — all non-essential animation disabled or reduced to instant under the media query; dose-critical interactions (mark taken) SHALL never depend on animation completing. [US-FE-11]
  - AC-FE-106a: reduced-motion → no animated transitions; actions still work — verification: e2e test.
- FR-FE-107: Account deletion SHALL call `DELETE /v1/me`; on server block (active Care Links) the UI SHALL explain the block and offer the end-links-first path; on success → logout flow (FR-FE-010). [US-FE-12]
  - AC-FE-107a: patient with active links → block message + links to Care Links screen — verification: e2e test.
- FR-FE-108: The frontend SHALL provide logout-all-devices (`POST /v1/auth/logout-all`) in profile/session settings with confirm dialog. [US-FE-12]
  - AC-FE-108a: logout-all → all sessions revoked incl. current → login screen — verification: e2e test.

### 5.9 Cross-cutting client behavior

- FR-FE-100: All API calls SHALL go through the API gateway base URL (single public entry-point, Map 3 t05) with the access JWT as `Authorization: Bearer`; the frontend SHALL NOT call service hosts directly and SHALL NOT implement authz decisions — every denial is rendered, never pre-empted client-side. [US-FE-01…12]
  - AC-FE-100a: zero direct service-host calls in client bundle config — verification: code review.
- FR-FE-101: The frontend SHALL implement client-side validation per §5.3 as UX only — server remains authoritative; client validation SHALL NOT be presented as a security boundary. [US-FE-01…12]
  - AC-FE-101a: bypassed client validation → server error surfaced verbatim-ish (field-mapped) — verification: contract test.
- FR-FE-102: Every screen SHALL render the six required states per §5.2 table — no screen may omit loading/empty/populated/error/offline-degraded/unauthorized handling. [US-FE-01…12]
  - AC-FE-102a: checklist audit per screen — verification: §7.9 checklist.
- FR-FE-103: The frontend SHALL attribute dose actions visibly ("marked by caregiver" indicator on shared caregiver view per feature-list §3) using actor data returned in dose DTOs where present. [US-FE-13]
  - AC-FE-103a: caregiver-marked dose shows attribution on patient's Today — verification: e2e test.

## 5.2 Per-screen states

| Screen | loading | empty | populated | error | offline/degraded | unauthorized |
|---|---|---|---|---|---|---|
| Signup/verify/forgot/reset | form skeleton | n/a (form) | form ready | field/server errors inline; expired token terminal page | n/a (must be online — auth is API-only) | n/a |
| Invite preview/accept | token lookup skeleton | n/a | patient displayName + expiry + accept/decline | invalid/expired/used → terminal page | "requires connection" (preview is API-only) | wrong-role → explanation page |
| Own profile | form skeleton from `GET /v1/me` | n/a | editable fields | save errors inline + retry | "requires connection" for save; cached view may render read-only | session expired → login redirect |
| Patient switcher | links skeleton | "no linked patients — accept an invite" | link list → select patient | links call error + retry | last-known links or "requires connection" | zero links → invite-prompt empty state |
| Today | per-section skeletons (4 fan-out calls) | "no doses today" + schedule CTA | dose list + theme + points + badge | per-section error + retry; other sections unaffected | Dexie doses + pending-sync badge; feed/gamification last-known-or-hide | link ended → no-access page |
| Dose actions | optimistic mark pending | n/a | action buttons per window state | mark failure → revert + error toast (online) / queued (offline) | enqueue + "pending sync" state | denied → no-access |
| Medicines list | list skeleton | "no medicines — add one" + catalog search hint | medicine cards (photo/name/dosage/remaining) | list error + retry; catalog search error inline | cached display data + "offline" banner | n/a (session-gated) |
| Medicine detail/edit | detail skeleton | n/a | fields + photos + schedules + archive/delete | guard rejections explained (delete-block, validation) | read-only cached view or "requires connection" | denied → no-access |
| Add medicine/catalog editor | catalog results skeleton | "no catalog matches — create entry" | search results / entry form / photo slots | duplicate-match offer; upload retry per slot | "requires connection" (all API) | session expired → login |
| Scheduling builder | builder skeleton | n/a | calendar + time pickers + defaults | validation errors inline; save error + retry | "requires connection" (schedule API-only; cached schedules display-only elsewhere) | denied → no-access |
| Care Links management | invites/links skeletons | "no invites/links" + create-invite CTA | pending invites + links + actions | per-section error + retry | "requires connection" (API-only per frontend-map) | patient-role restrictions explained |
| Notifications feed + prefs | feed skeleton | "no notifications" | feed items + unread states + 2 toggles | feed error + retry; prefs save error | feed hidden/last-known + stale badge; prefs "requires connection" | session expired → login |
| Push lifecycle | subscribe state resolving | not subscribed → enable prompt | subscribed state + device count | permission denied → guidance; subscribe failure silent-retry | local notifications still scheduled from Dexie | n/a |
| Gamification surfaces | widget skeleton (part of Today/shell) | zero outcomes → Harmony defaults | points + theme visuals | widget error → hide widget only | last-known or hidden + stale indicator | denied → widget hidden |
| Offline write-queue (module) | n/a | empty queue → no indicator | pending count badge | replay failures → retained + retry | core function — always "active" offline | n/a |
| Service worker / local notifications (module) | SW registering | no upcoming doses → no notifications | scheduled notifications per rhythm | SW failure → push backup continues | primary channel offline | n/a |

## 5.3 Client-side validation rules

Client validation is UX only — the server remains authoritative (frontend-map: "frontend is never trusted"). Validation fires on-blur for fields and on-submit for forms; errors render inline below the field + summary on submit.

| Form | Field rules | Cross-field | Fires |
|---|---|---|---|
| Signup | name required ≤120 chars; email valid format; password ≥8 chars (complexity per server rule surfaced); role ∈ {Patient, Caregiver} required | none | on-blur + submit |
| Login | email format; password non-empty | none | submit |
| Forgot/reset | email format; new password ≥8 + confirm-match | password === confirm | on-blur + submit |
| Verify-email | token presence (from link) | none | submit |
| Invite create | caregiverEmail valid email format | none | on-blur + submit |
| Profile edit | displayName required ≤120; timezone valid IANA tz | none | on-blur + submit |
| Private medicine | doctor required; dosage required; dosesRemaining integer ≥0; price ≥0 number; pharmacyName required | dosesRemaining editable anytime (server floor rules apply) | on-blur + submit |
| Catalog entry | brandName required; ingredients list ≥1; form ∈ {tablet,capsule,syrup,injection,drops,other}; packagingQty >0; ≥1 photo at adopt (gap-fill display) | duplicate-check server-side → offer existing | on-blur + submit |
| Schedule builder | ≥1 date or repeat rule; ≥1 dose time valid HH:mm; start ≤ end when both set; repeat ∈ {none,weekly,monthly,yearly} | exceptions only on selected dates | on-change + submit |
| Notification prefs | toggles boolean | none | on-change (PUT) |
| Outcome marking | outcome ∈ enum; dose must be in markable window (client hint only — server authoritative) | snooze only when unmarked | on-click |

## 6. Non-functional requirements

| NFR-ID | Category | Metric + threshold + condition | Source/justification |
|---|---|---|---|
| NFR-FE-01 | performance/latency | Initial route load p95 < 2.5 s on mid-tier mobile 4G; Today fan-out sections independent — slowest section does not block others; interaction (mark dose) feedback < 100 ms optimistic | `platform-quality-baseline.md` + §5.1/§5.2 fan-out rule |
| NFR-FE-02 | availability/reliability | App shell loads from cache/served bundle even when API down (offline-first); API outage degrades per §5.7, never white-screens; ~99% availability inherits platform target | `platform-quality-baseline.md` |
| NFR-FE-03 | scalability | <50 concurrent users; static/edge-served bundle on Vercel; Dexie per-device — no shared client state; API call volume bounded by 4-trigger refresh + 15-min interval | `platform-quality-baseline.md` load envelope |
| NFR-FE-04 | security/authz | Access JWT memory-only; refresh httpOnly cookie; zero token/PII in Dexie, URLs, logs, or error reports; frontend never trusted — all authz server-side; no eval/innerHTML on user content | feature-list §2/§3, Map 3 t05/06 |
| NFR-FE-05 | data/privacy | Dexie holds adherence data (doses, medicines) — purged on logout + account deletion + link-end-for-patient-context; no PII in notification payloads beyond dose display needs; Sentry scrubbing for tokens/health data | `platform-quality-baseline.md` retention + `platform-observability.md` |
| NFR-FE-06 | observability | `@sentry/nextjs` client + edge error capture; Web Vitals (LCP/INP/CLS) reported; PII-scrubbed breadcrumbs; no console logging of tokens/health data; error boundaries per route section | `platform-observability.md` (Sentry free tier per service + `@sentry/nextjs` frontend) |
| NFR-FE-07 | offline/resilience | Dexie write-queue survives reload; FIFO replay ordered; conflicts LWW server-side; connectivity detection dual-signal; queue bounded; local notifications fire offline from cached data | `frontend-map.md` Dexie contract |
| NFR-FE-08 | accessibility | WCAG 2.2 AA target; keyboard-complete dose actions; focus management on route change + dialogs; screen-reader labels on Taken/Snooze/theme; color never sole carrier of theme/window state | §5.6, WCAG 2.2 AA |

† Offline/resilience and accessibility categories apply to this frontend PRD (backend PRDs omit them).

### 6.1 (backend-only section — not applicable)

This is a frontend-profile PRD; §6.1 scaling/operational backend detail is replaced by §6.2.

### 6.2 Accessibility, UX & PWA constraints

- Accessibility target: **WCAG 2.2 AA** — keyboard navigation for all flows, visible focus, focus trap in dialogs, screen-reader announcements for dose state changes and sync status, minimum touch targets, text contrast per theme states.
- Dose actions (Taken/Snooze/Skip) SHALL be fully operable by keyboard and screen reader with announced outcome confirmation; the two-button notification action limit (browser constraint) is respected — Skip exists in-app only.
- Monster Defense surfaces: global shell palette + Today Monster scene reflect theme state (Harmony bright/calm, Uneasy smoky/amber, Horror dark/blue monsters closer); gamification widget visible on Today + shell for both roles (caregiver read-only).
- Framer Motion: animations enhance but never gate interaction; `prefers-reduced-motion` disables non-essential animation; theme transitions animate palette/scene changes.
- Responsive: mobile-first layouts (primary use = phone reminders); usable on tablet/desktop widths; PWA `display: standalone`, installable manifest, icons.
- iOS: Web Push requires installed PWA — install prompt is a first-class onboarding step (UF-FE-10), not an edge case.
- Vercel deployment: frontend hosted on Vercel per locked stack; API base URL via env config; no server-side rendering dependency on Medo services (SSR, if used, must not block on service availability — client fetch preferred for patient data).

## 7. Scope boundaries

### 7.1 In scope

- All screens/modules in §4.1 inventory: auth suite, profile, patient switcher, Today, dose actions, medicines/catalog/photos, scheduling builder, care links/invites, notifications feed/prefs, push lifecycle, gamification surfaces, offline write-queue, service worker/local notifications.
- User flows UF-FE-01…13 per actor incl. error paths.
- Dexie offline contract: cached slice, FIFO write-queue, LWW conflicts, four refresh triggers, degraded mode, local notification scheduling.
- PWA installability + iOS push prerequisite; Web Push subscribe lifecycle; VAPID fetch.
- WCAG 2.2 AA, Monster Defense theming, Framer Motion constraints.
- Client-side validation per §5.3 (UX only).

### 7.2 Out of scope

- Backend services, APIs, events, jobs — owned by the six service PRDs; this PRD consumes their public contracts only.
- HLD/LLD/implementation/tasks — downstream artifacts per Architecture Standard.
- Native apps, app-store distribution → post-v1/PWA-only decision stands.
- Per-user channel prefs, quiet hours → deferred Map 3 t10.
- Offline feed/catalog/care-links/gamification compute → API-only per frontend-map.
- Levels/battles/caregiver score → rejected Map 1 t10.
- i18n, SEO/marketing pages, admin roles → no upstream requirement.
- Dexie schema field-level design, exact queue cap, SW caching strategy details → LLD (OQ-FE-02/03).

### 7.3 Dependencies on locked decisions

- `docs/features/feature-list.md` — all §§: roles (§1), auth (§2), authz (§3), medicine (§4), scheduling (§5), reminders (§6), care links (§7), refill (§8), channels (§9), gamification (§10), cross-cutting (Monster Defense, Framer Motion, offline-first, PWA+@serwist, Vercel).
- `docs/contracts/frontend-map.md` — API-first + Dexie slice, `patientId` rule, per-screen fan-out table, Dexie entities/write-queue/FIFO/LWW/refresh triggers, push lifecycle, gamification+feed API-only.
- `docs/contracts/service-catalog.md` — every public route in §10 verbatim; authz column = requirement only.
- All six service PRDs `docs/prd/*/` — DTO shapes, window semantics, guard behaviors the UI renders.
- `docs/architecture/platform-quality-baseline.md`, `platform-observability.md`, `scheduled-jobs.md` — NFR defaults; frontend has zero scheduled jobs (client-side notification scheduling is not a scheduled job).
- `GLOSSARY.md` — Patient, Caregiver, Care Link, Medicine, Medicine Catalog, Schedule, Dose, Doses Remaining, Refill alert, Reminder, Harmony Points, Theme state, Notification preferences, Email fallback.
- Locked frontend stack (Map 3): Next.js 15 App Router, Tailwind v4 + shadcn/ui, TanStack Query + Zustand, Zod, Dexie, @serwist, Framer Motion, `@sentry/nextjs`, Vercel.
- Map 3 t05/06 — gateway public-route table + CORS on `api.<domain>`; refresh cookie host-only `SameSite=Lax`.

### 7.4 Open questions

- OQ-FE-01: Domain hostnames (`app.<domain>`/`api.<domain>`) — map fog carried from Map 3; PRD uses placeholders. Owner: domain selection (future decision); blocks-HLD: no.
- OQ-FE-02: Dexie schema versioning + exact entity field shapes — LLD detail; this PRD fixes entity set + semantics only. Owner: LLD; blocks-HLD: no.
- OQ-FE-03: Write-queue cap value + eviction policy — defensive bound required (FR-FE-086), exact number LLD. Owner: LLD; blocks-HLD: no.
- OQ-FE-04: Service-worker runtime-caching strategy for static assets vs API calls — LLD detail; Dexie contract unaffected. Owner: LLD; blocks-HLD: no.
- OQ-FE-05: Whether dose DTOs expose `actorId`/actor displayName for the "marked by" indicator (FR-FE-103) — depends on Schedule & Dose DTO; if absent, attribution shows role-only or is deferred. Owner: Schedule & Dose HLD; blocks-HLD: no.
- OQ-FE-06: Notification permission-prompt timing (first launch vs first Today visit vs settings-only) — UX detail for LLD/design; requirement is gesture-context + persistent degraded prompt. Owner: LLD/design; blocks-HLD: no.
- OQ-FE-07: Email fallback UX — whether the app surfaces "check your email" hints for unmarked doses or stays silent (emails are server-sent; no frontend contract). Assumed silent v1. Owner: future UX pass; blocks-HLD: no.
- OQ-FE-08: Photo upload — whether private medicine record can carry own photos or only via catalog entry (catalog PRD says photos live on catalog entry); assumed catalog-only per FR-FE-059b. Owner: Medicine HLD confirmation; blocks-HLD: no.

## 8. Edge cases and failure modes

| Edge case | Requirement/NFR mapping | Notes |
|---|---|---|
| Offline dose mark, then caregiver marks same dose before replay | FR-FE-081, 082 | FIFO replay → server LWW → refetch shows truth; UI never merges locally |
| Device offline across midnight missed-lock | FR-FE-083, 084 | On reconnect, refresh triggers catch missed state; local notifications stop per cached outcome/missed time |
| Access token expires mid-form-fill | FR-FE-003 | Silent refresh on next call; form state preserved (client state, not server) |
| Refresh token revoked while offline | FR-FE-003, 084 | Next online call → 401 → refresh fails → login redirect + Dexie purge; queued writes LOST — accepted: server never saw them, user warned via pending-sync indicator before logout |
| Invite token expired between email and click | FR-FE-042 | Terminal-state page; patient can re-invite fresh cycle |
| Patient-role account opens caregiver invite | FR-FE-041 | Role explanation; one-role-per-account rule (feature-list §1) |
| Care link ends while caregiver viewing patient | FR-FE-006, 007 | Next patient-scoped call denied → no-access + banner next open |
| Patient deletes account while caregiver has cached doses | FR-FE-080, 010 | Server purges; caregiver's next patient-scoped call denied → context revoked; Dexie patient slice purged on link-end detection |
| Push permission denied permanently | FR-FE-089, 084 | Degrade to local notifications + Today + persistent prompt; email fallback still arrives server-side |
| iOS Safari without installed PWA | FR-FE-090 | Install prompt first; push impossible until installed — explicit UX, not silent failure |
| Service worker update mid-session | FR-FE-094 | Applies next navigation; in-flight writes safe (Dexie, not SW memory) |
| Photo upload: PUT succeeds, confirm PUT fails | FR-FE-059 | Orphan photoKey possible — server-side cleanup is Medicine HLD concern (OQ-MED-03); client retries confirm |
| Catalog duplicate on create | FR-FE-056, 061 | Server duplicate-check → offer existing entry; client never blocks silently |
| Medicine delete with dose records | FR-FE-058 | Fail-closed guard → archive CTA |
| Snooze across midnight | FR-FE-023 | Snooze is transient `snoozedUntil`; midnight missed-lock is server-side — client shows locked state on refresh |
| Two tabs open, dose marked in one | FR-FE-027, 083 | Other tab catches via 15-min interval/focus refetch; no cross-tab lock needed at envelope scale |
| Dexie quota exceeded | FR-FE-086, 088 | Bounded queue + migration error screen; doses slice small at envelope |
| Captive portal: `navigator.onLine` true, API dead | FR-FE-087 | Failed-request signal engages degraded mode |
| Notification tap for deleted/archived medicine dose | FR-FE-078 | Dose/medicine DTO resolution fails → Today with section error + retry |
| Timezone edge: schedule tz ≠ device tz | FR-FE-021, 070 | Window labels computed in schedule tz; display converts correctly |
| Rapid double-tap on Taken | FR-FE-022, 081 | Idempotent-ish: second mark = outcome change (taken→taken no-op server-side or last-write); client disables button pending response |
| Logout with non-empty write-queue | FR-FE-010, 085 | Warn before logout if queue non-empty ("N marks not synced — they will be lost"); user confirms or reconnects first |

## 8.1 (backend-only section — not applicable)

Frontend dependency-failure behavior is covered per-surface in §5.7 (offline/degraded) and the edge table; there is no §8.1 backend dependency matrix for this profile.

## 9. Data requirements

### 9.1 Owned data

Client-owned persistent data = Dexie (IndexedDB) entities only; everything else is server-owned.

| Entity | Lifecycle | Ownership | Notes |
|---|---|---|---|
| Cached dose rows (doseId, times, outcome, `snoozedUntil`, medicine display join) | written on read-refresh triggers → updated on mutation/replay → evicted by window rollover | owned by this client device; per `patientId` slice | Offline-critical slice per frontend-map; NOT dose truth — server canonical |
| Cached medicine display data (medicineId, name, photo URL, dosage) | written alongside dose/medicine reads → refreshed on triggers | owned by this client device | Powers offline Today + notification text |
| Cached schedules (future dose times per medicine) | written on schedule reads → refreshed on triggers | owned by this client device | Local notification scheduling input |
| Write-queue entries (type, doseId, payload, enqueuedAt) | enqueue offline → FIFO replay → delete on success → bounded cap | owned by this client device | Survives reload; purged on logout/account-delete |
| Last-known gamification display values (points/theme snapshot) | in-memory/query-cache only — NOT Dexie | ephemeral per session | "last-known or hide" per frontend-map; never persisted to IndexedDB |
| Push subscription record (endpoint→server id) | created on grant → deleted on logout | server owns record; client holds endpoint key | `DELETE /v1/push-subscriptions/{id}` on logout |

### 9.2 Consumed/read data

All consumed via public REST through the gateway (full inventory §10): Identity profile/session routes; Care invites/links; Medicine catalog + private medicines; Schedule&Dose schedules/doses/outcome/snooze; Notification feed/prefs/push-subs/vapid-key; Gamification read. Provider = the six Medo services; contract IDs verbatim in §10.

### 9.3 Shared/community data

- Medicine Catalog entries are community-maintained shared data — the frontend reads and may create/edit them (`POST/PATCH /v1/medicine-catalog*`) but owns nothing; edits are last-write-wins shared (feature-list §4, catalog rules).

### 9.4 Retention & deletion

- Dexie (all four entities + queue): purged on logout (FR-FE-010), on account deletion success (FR-FE-107), and per-patient-context on detected link-end (FR-FE-006); no time-based retention — cache is demand-refreshed.
- Write-queue: retained until replay success or logout purge; bounded per FR-FE-086.
- Push subscription: deleted server-side on logout; orphaned subs pruned server-side (404/410/403 → client resubscribes).
- No backups of client cache — device-local by nature.

### 9.5 Sensitive data

- Access JWT: memory-only, never persisted/logged (FR-FE-002).
- Refresh token: httpOnly cookie, JS-inaccessible by design.
- Dexie contents = health-adjacent adherence data (dose times, outcomes, medicine names/photos) — device-local, purged per §9.4; never synced anywhere except the queue replay payloads.
- Notification payloads: rich dose reminders carry medicine name/dosage/time/photo — visible on lock screen by OS design; no clinical detail beyond dose display.
- Sentry/error reports: PII + token scrubbing mandatory (NFR-FE-06).

## 10. External contracts touched

Every contract below is a public REST route the frontend consumes through the API gateway — verbatim from `service-catalog.md`. Direction = consumes; all sync REST; authz per catalog (session unless noted); "idempotent?" marks client retry safety.

| Contract ID (verbatim) | Direction | Sync/Async | Public/Internal | Authz | Idempotent? | Catalog ref |
|---|---|---|---|---|---|---|
| `POST /v1/auth/signup` | consumes | REST | public | public | no | catalog §Identity public REST |
| `POST /v1/auth/login` | consumes | REST | public | public | no | catalog §Identity |
| `POST /v1/auth/refresh` | consumes | REST | public | refresh cookie | no (rotation) | catalog §Identity |
| `POST /v1/auth/logout` | consumes | REST | public | session | yes | catalog §Identity |
| `POST /v1/auth/logout-all` | consumes | REST | public | session | yes | catalog §Identity |
| `POST /v1/auth/forgot-password` | consumes | REST | public | public | yes (rate-limited) | catalog §Identity |
| `POST /v1/auth/reset-password` | consumes | REST | public | reset token | no | catalog §Identity |
| `POST /v1/auth/verify-email` | consumes | REST | public | verify token | yes | catalog §Identity |
| `POST /v1/auth/resend-verification` | consumes | REST | public | public (rate-limited) | yes | catalog §Identity |
| `GET /v1/me` | consumes | REST | public | session | n-a | catalog §Identity |
| `PATCH /v1/me` | consumes | REST | public | session | no | catalog §Identity |
| `DELETE /v1/me` | consumes | REST | public | session | yes | catalog §Identity |
| `POST /v1/care/links/invites` | consumes | REST | public | patient session | no | catalog §Care |
| `GET /v1/care/invites/{token}` | consumes | REST | public | invite token (locator) | n-a | catalog §Care |
| `POST /v1/care/invites/{token}/accept` | consumes | REST | public | caregiver session | no | catalog §Care |
| `POST /v1/care/invites/{token}/decline` | consumes | REST | public | caregiver session | no | catalog §Care |
| `POST /v1/care/invites/{id}/resend` | consumes | REST | public | patient session | no (cap-enforced) | catalog §Care |
| `POST /v1/care/invites/{id}/cancel` | consumes | REST | public | patient session | yes | catalog §Care |
| `GET /v1/care/invites` | consumes | REST | public | session | n-a | catalog §Care |
| `GET /v1/care/links` | consumes | REST | public | session | n-a | catalog §Care |
| `POST /v1/care/links/{id}/end` | consumes | REST | public | either-party session | yes | catalog §Care |
| `GET /v1/medicine-catalog?q=&page=` | consumes | REST | public | session | n-a | catalog §Medicine catalog |
| `GET /v1/medicine-catalog/{id}` | consumes | REST | public | session | n-a | catalog §Medicine catalog |
| `POST /v1/medicine-catalog` | consumes | REST | public | session | no (dup-check) | catalog §Medicine catalog |
| `PATCH /v1/medicine-catalog/{id}` | consumes | REST | public | session | no (LWW) | catalog §Medicine catalog |
| `POST /v1/medicine-catalog/{id}/photos` | consumes | REST | public | session | no | catalog §Medicine catalog |
| `PUT /v1/medicine-catalog/{id}/photos/{slot}` | consumes | REST | public | session | yes (key attach) | catalog §Medicine catalog |
| `GET /v1/medicines?patientId=` | consumes | REST | public | patient-self or linked caregiver | n-a | catalog §Medicine patient REST |
| `POST /v1/medicines` | consumes | REST | public | patient-self or linked caregiver | no | catalog §Medicine |
| `GET /v1/medicines/{id}` | consumes | REST | public | patient-self, caregiver, or Medo service | n-a | catalog §Medicine |
| `PATCH /v1/medicines/{id}` | consumes | REST | public | patient-self or linked caregiver | no | catalog §Medicine |
| `POST /v1/medicines/{id}/archive` | consumes | REST | public | patient-self or linked caregiver | yes | catalog §Medicine |
| `DELETE /v1/medicines/{id}` | consumes | REST | public | patient-self or linked caregiver | yes (guard fail-closed) | catalog §Medicine |
| `GET /v1/patients/{id}/schedules` | consumes | REST | public | patient-self or linked caregiver | n-a | catalog §Schedule & Dose |
| `POST /v1/patients/{id}/schedules` | consumes | REST | public | patient-self or linked caregiver | no | catalog §Schedule & Dose |
| `GET /v1/schedules/{id}` | consumes | REST | public | patient-self or linked caregiver | n-a | catalog §Schedule & Dose |
| `PATCH /v1/schedules/{id}` | consumes | REST | public | patient-self or linked caregiver | no | catalog §Schedule & Dose |
| `DELETE /v1/schedules/{id}` | consumes | REST | public | patient-self or linked caregiver | yes | catalog §Schedule & Dose |
| `GET /v1/patients/{id}/doses?from=&to=&outcome=` | consumes | REST | public | patient-self or linked caregiver | n-a | catalog §Schedule & Dose |
| `GET /v1/doses/{id}` | consumes | REST | public | patient-self or linked caregiver | n-a | catalog §Schedule & Dose |
| `POST /v1/doses/{id}/outcome` | consumes | REST | public | patient-self or linked caregiver | queue-replay ordered; outcome edits = new POST | catalog §Schedule & Dose |
| `POST /v1/doses/{id}/snooze` | consumes | REST | public | patient-self or linked caregiver | transient, low-risk | catalog §Schedule & Dose |
| `GET /v1/notifications?cursor=` | consumes | REST | public | session | n-a | catalog §Notification |
| `GET /v1/notifications/unread-count` | consumes | REST | public | session | n-a | catalog §Notification |
| `POST /v1/notifications/{id}/read` | consumes | REST | public | session | yes | catalog §Notification |
| `POST /v1/notifications/read-all` | consumes | REST | public | session | yes | catalog §Notification |
| `GET /v1/notification-preferences` | consumes | REST | public | session | n-a | catalog §Notification |
| `PUT /v1/notification-preferences` | consumes | REST | public | session | no | catalog §Notification |
| `GET /v1/push/vapid-key` | consumes | REST | public | public | n-a | catalog §Notification |
| `POST /v1/push-subscriptions` | consumes | REST | public | session | yes (dedup by endpoint) | catalog §Notification |
| `DELETE /v1/push-subscriptions/{id}` | consumes | REST | public | session | yes | catalog §Notification |
| `GET /v1/patients/{id}/gamification` | consumes | REST | public | patient-self or linked caregiver (check-link per read) | n-a | catalog §Gamification |

Publishes: **none** — the frontend emits no events. Internal routes (`/doses/due`, `has-dose-records`, `/users/{id}`, check-link, patients/{id}/links, medicine internal GET) are NEVER called by the frontend — service-to-service only.

### 10.1–10.5 (backend profile subsections — consolidated for frontend)

- Exposed contracts: none — the frontend exposes no API; it is a client.
- Consumed contracts: the 53 routes above; authz per catalog column; the frontend adds NO authz logic — server denies are rendered.
- Events published/subscribed: **none** — all updates arrive via REST reads + push notifications; no SSE/WebSocket/EventSource exists in v1 (live-ish updates = 15-min refetch + post-mutation refresh per frontend-map).
- Authorization requirements: session JWT on all non-public routes; patient-scoped routes additionally require patient-self or Care check-link (server-side); invite-token routes are locator-only; the frontend never asserts authz.
- Versioning: all contracts under `/v1`; frontend tolerates additive DTO fields; breaking contract changes are coordinated via the service PRDs (additive-only evolution per catalog conventions).

## 11. Dependencies and integrations

### 11.1 Upstream dependencies

- API gateway (Caddy/nginx, Map 3 t05) — single entry-point; explicit public-route table; CORS allowlist for the Vercel origin; pass-through JWT verification. Failure → whole app data layer down → degraded/offline mode per §5.7.
- Six Medo services via gateway — per-screen fan-out (§4.1); each section degrades independently.
- Identity — session lifecycle is the hard dependency: no session → auth screens only.
- Browser/OS APIs — IndexedDB (Dexie), Service Worker + Push API + Notification API, online/offline events, `prefers-reduced-motion`, clipboard/none others.
- Vercel — hosting/CDN for the Next.js bundle; env config for API base URL.
- Resend/web-push delivery — server-side (Notification service); frontend only receives push events.

### 11.2 Downstream dependents

- None — the frontend is a leaf; no service consumes it. The API gateway routes browser traffic to it (static hosting on Vercel is separate from the EC2 backend).

### 11.3 Ordering constraints

- Service worker must register before push subscribe is attempted (FR-FE-089/094); VAPID key fetch precedes `pushManager.subscribe`.
- Email verification must complete before app routes unlock (FR-FE-004).
- Dexie schema migrations run before first render (FR-FE-088).
- Invite token must survive the auth detour (FR-FE-008) — ordering constraint on routing, not timing.
- iOS install prompt precedes push permission attempt (FR-FE-090).

### 11.4 Offline behavior

Per `frontend-map.md` Dexie contract, restated as requirements:

- **Offline-critical (Dexie):** dose rows (times/outcome/`snoozedUntil`), medicine display data, schedules (future times), write-queue. **API-only (never Dexie):** notifications feed, gamification state, catalog browse, Care Links.
- **Write path:** offline marks → FIFO queue → ordered replay to outcome/snooze routes on reconnect; conflicts server-side last-write-wins; outcomes editable until midnight anyway.
- **Read refresh triggers (exactly four):** app open, connectivity restored, post-mutation, `refetchInterval` ≈15 min on Today queries while visible.
- **Degraded mode:** Today fully usable offline (cached doses + queue + local notifications); feed/gamification last-known-or-hide; catalog/care-links/prefs require connection.
- **Local notifications:** SW reads Dexie schedules+doses → schedules on-device notifications per reminder rhythm; server Web Push = backup, no handoff logic.
- New offline decisions beyond the map: NONE — queue cap (FR-FE-086) and dual-signal connectivity (FR-FE-087) are defensive bounds, flagged OQ-FE-03/04 for LLD, not contract changes. No `offline-decision-needed` gaps.

### 11.5 Frontend integrations

- Per-screen service calls: §4.1 table reproduces `frontend-map.md` rows verbatim — **zero deviations**; the only addition is the offline write-queue module which replays to already-catalogued routes.
- Push lifecycle: VAPID `GET /v1/push/vapid-key` → permission grant → `POST /v1/push-subscriptions` per device → `DELETE` on logout; silent resubscribe on 404/410/403 prune.
- Photo upload: two-step signed-URL per catalog slot A/B/C — `POST .../photos` → direct PUT to R2 bucket → `PUT .../photos/{slot}` confirm; failure leaves slot empty with retry.
- Aggregation rule restated: parallel fan-out per screen, per-section skeleton rendering, **NO backend aggregation endpoint** — the frontend composes Today from 4 independent calls.
- Auth header: `Authorization: Bearer <access JWT>` on all session routes; refresh via cookie automatically.

## 12. Success metrics

| Goal | Metric | Instrumentation | Guardrails |
|---|---|---|---|
| G-1 | Feature coverage: every feature-list § reachable in UI | manual acceptance per flow UF-FE-01…13 + route inventory audit | zero catalogued routes uncalled by any screen (contract test) |
| G-2 | Offline correctness: queued marks replay losslessly | e2e offline tests + queue-depth telemetry (client analytics, privacy-safe counts only) | zero lost marks in test suite; queue drains on reconnect |
| G-3 | Fan-out discipline: sections render independently | component tests with per-call throttling | zero chained-call waterfalls on Today (network waterfall audit) |
| G-4 | Dose-day UX: reminder→mark→missed flow completes | e2e dose-day simulation + Sentry session metrics | zero dose actions blocked by animation/loading states |
| G-5 | Auth UX: login→Today time, refresh transparency | Web Vitals + auth funnel events (Sentry beforeSend-scrubbed) | zero unexpected logouts from silent-refresh failures in tests |
| G-6 | Push coverage: subscribed devices receive reminders | subscription count metrics (server-side) + SW push-receive logs | iOS non-installed users see install prompt (funnel event) |
| G-7 | Accessibility: WCAG 2.2 AA audit | axe-core CI + manual screen-reader pass on dose actions | zero AA violations on critical flows |

## 13. Assumptions and constraints

- Locked decisions cited, not re-decided: feature baseline (feature-list.md all §§); service boundaries + contracts (service-catalog.md, six service PRDs); frontend contract map + Dexie semantics (frontend-map.md); platform NFR/observability/jobs baselines; frontend stack Next.js 15/Tailwind v4/shadcn/TanStack/Zustand/Zod/Dexie/@serwist/Framer Motion/Sentry/Vercel; gateway + cookie/CORS mechanics (Map 3 t05/06).
- This PRD assumes the Architecture Standard's four-layer backend structure and one-combined-frontend topology; it does not re-decide them.
- "Combined frontend" = ONE Next.js app serving both roles; role differences are runtime (`patientId` rule + role-gated UI), not separate builds.
- Dose window labels (T−30/T+1hr/late/midnight) are display derivations from `scheduledAt` + schedule timezone; authoritative classification stays server-side (Schedule & Dose PRD).
- "Last-known" gamification/feed values may live in TanStack Query memory cache only — persisting them to Dexie would violate the API-only rule.
- Email fallback and refill-alert delivery are server-side; the frontend surfaces their RESULTS (feed rows, badges) but never triggers or schedules them.
- Caregiver "acting on behalf" needs no special UI beyond the patient switcher context + attribution display — no impersonation flows exist.
- Domain selection remains map fog — all URLs use `app.<domain>`/`api.<domain>` placeholders.
- PWA push on iOS is install-dependent by platform constraint — treated as requirement (FR-FE-090), not a bug.
- No real-time push channel (SSE/WebSocket) exists in v1 — "live" updates are bounded by the four refresh triggers; this is a locked simplification, not a gap.

## 14. Glossary and terminology

Terms used → `GLOSSARY.md` anchors: **Patient**, **Caregiver**, **Care Link**, **Care Link Invite**, **Medicine**, **Medicine Catalog**, **Schedule**, **Dose**, **Doses Remaining**, **Refill alert**, **Reminder**, **Harmony Points**, **Theme state**, **Notification preferences**, **Email fallback**.

Avoid-list compliance: Patient/Caregiver/Care Link/Medicine/Dose used only in glossary sense; "notification" reserved for Notification-service surfaces (feed/prefs/push) — dose pings are "reminders"; "alert" only for refill/system alerts; no "score/points/health" for Harmony Points in prose ("gamification state"/"meter" used); no "level/battle"; actor/event/endpoint names verbatim-cased.

New technical terms (flagged `proposed-glossary-entry`):

- **Write-queue** — the Dexie FIFO store of offline dose marks replayed in order on reconnect (frontend-map term, promoted here).
- **Offline-critical slice** — the four Dexie entity types; everything else is API-only.
- **Patient context** — the resolved `{patientId}` a Caregiver operates under via the switcher; Patient context is implicit (session `sub`).
- **Degraded mode** — the explicit offline UX state per surface (cached/last-known/hidden/requires-connection).
- **Gap-fill** — photo slot fallback: missing slot A/B/C displays next-most-relevant photo (feature-list §4).

## 15. Traceability matrix

| Need (feature-list §) | Goal | Story | FR/NFR | Contract(s) | Verification |
|---|---|---|---|---|---|
| §1 roles/signup/verify | G-1, G-5 | US-FE-01 | FR-FE-001…010 | Identity auth routes | e2e auth flows |
| §2 auth tokens/logout/cooldown | G-5 | US-FE-02 | FR-FE-002,003,009,010,108 | Identity session routes | e2e + storage inspection |
| §3 caregiver parity + authz UX | G-1, G-4 | US-FE-04,13 | FR-FE-005…007,041,043,103 | Care links, patient-scoped routes | e2e cross-patient denial |
| §4 medicine registration + photos | G-1 | US-FE-07 | FR-FE-026,055…061 | Medicine catalog+patient routes | e2e + contract tests |
| §5 scheduling builder + exceptions | G-1 | US-FE-08 | FR-FE-067…071 | Schedule&Dose schedule routes | e2e builder flow |
| §6 reminders + dose-day lifecycle | G-4, G-6 | US-FE-05,06,10 | FR-FE-020…028,091,092 | doses/outcome/snooze routes | e2e dose-day sim |
| §7 care-link invites | G-1 | US-FE-03,04 | FR-FE-008,040…045 | Care invite/link routes | e2e invite flows |
| §8 refill display | G-4 | US-FE-05 | FR-FE-025 | medicines route | component tests |
| §9 channels + iOS PWA | G-6 | US-FE-10 | FR-FE-077,089…094 | push-subscriptions, vapid-key | e2e + device tests |
| §10 gamification display | G-4 | US-FE-05,11 | FR-FE-024,105,106 | gamification route | component + visual tests |
| Cross-cutting offline-first | G-2 | US-FE-06 | FR-FE-080…088, NFR-FE-07 | outcome/snooze replay | e2e offline suite |
| Cross-cutting Monster Defense/Framer/Vercel | G-7 | US-FE-11 | FR-FE-105,106 | — | visual + reduced-motion tests |
| frontend-map.md contract (all rows) | G-1, G-3 | all | §4.1 inventory + §10 | all 53 routes | contract inventory audit |
| platform baselines | — | — | NFR-FE-01…08 | gateway, Sentry, Vercel | metric checks |
| `scheduled-jobs.md` zero frontend jobs | — | — | §6.2, §13 | — | code review (no node-cron/server jobs in client) |

## Appendix A. Alternatives considered

- **Dexie caching of feed/gamification vs API-only** — API-only chosen per frontend-map: score/feed are server-authoritative/cosmetic; stale adherence scores are worse than hidden widgets.
- **WebSocket/SSE live updates vs 15-min refetch** — refetch chosen (locked simplification): no real-time requirement exists; envelope scale makes polling sufficient; avoids connection-state complexity.
- **Per-role apps vs combined frontend** — combined chosen Map 2: one codebase, role via runtime `patientId` rule; caregiver parity reuses the same screens.
- **Client-side outcome computation vs server-authoritative** — server-authoritative: windows/points/refills all derive server-side; client displays and queues only (frontend never trusted).
- **Background Sync API vs manual reconnect replay** — manual replay chosen: broader support, deterministic ordering, simpler failure surfacing; Background Sync is an LLD optional enhancement.
- **Storing refresh token in JS-readable storage vs httpOnly cookie** — cookie chosen Map 3 t06: XSS cannot exfiltrate it; rotation + reuse-detection server-side.
- **Aggregation BFF endpoint vs parallel fan-out** — fan-out chosen frontend-map: no backend aggregation endpoint; per-section rendering isolates failures.
- **Native app vs PWA** — PWA v1; iOS push constraint handled via install prompt rather than native distribution.

## Appendix B. HLD-readiness checklist result

- Result: **pass**
- Date: 22-11-26 06-02-26 UTC (approved by Sir Asim)
- Checker: Devin (self-check; `D:\Temp\validate_prd.py` run at draft time — PASS)
- Conditions: none — every screen has six states (§5.2), every flow has error paths (§4.2), offline contract fully specified with zero `offline-decision-needed` gaps (§11.4), all service calls match frontend-map.md verbatim (§4.1/§11.5), WCAG 2.2 AA + PWA/install stated (§6.2). Remaining OQs are LLD/design detail (Dexie schema, queue cap, SW caching, domain fog) — all `blocks-HLD: no`. `hld_readiness` mirrors this verdict pending user approval.
