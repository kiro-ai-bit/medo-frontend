---
lld_id: LLD-MEDO-FRONTEND-001
application: Medo
component: Frontend
profile: combined-frontend
version: "1.0"
status: approved
author: Devin
approver: Sir Asim
approval_date: 24-11-26 18-35-11 UTC
upstream:
  hld: docs/hld/frontend/HLD-MEDO-FRONTEND-001.md@1.0
  prd: docs/prd/frontend/PRD-MEDO-FRONTEND-001.md@1.0
  service_catalog: docs/contracts/service-catalog.md@2026-11-22
  frontend_map: docs/contracts/frontend-map.md@2026-11-22
  feature_list: docs/features/feature-list.md@2026-11-20
  architecture_standard: docs/architecture/MicroservicesApps-Architecture-Standard.md
  quality_baseline: docs/architecture/platform-quality-baseline.md@2026-11-21
  observability: docs/architecture/platform-observability.md@2026-11-21
  scheduled_jobs: docs/architecture/scheduled-jobs.md@2026-11-21
  glossary: GLOSSARY.md@2026-11-21
  locked_decisions: .scratch/medo-backend/issues/01-10 @2026-11-21; .scratch/medo-hld/issues/01-03 @2026-11-22/23; .scratch/medo-lld/issues/01-05 @2026-11-23/24
downstream: [tasks]
task_readiness: pass
supersedes: none
superseded_by: null
---

# LLD-MEDO-FRONTEND-001: Combined Frontend — module design, Dexie offline store, service worker, and push lifecycle

## 1. Document control header

Frontend | combined-frontend | HLD-MEDO-FRONTEND-001@1.0 | draft

## 2. Design context and scope

### 2.1 Upstream HLD consumed

`HLD-MEDO-FRONTEND-001@1.0` (status: approved, `lld_readiness: pass`). Consumed by reference: §2 goals DG-FE-1…10; §4 boundary + invariants; §5 all thirteen blocks (`auth-session`, `patient-context`, six API clients, `query/state layer`, `offline store`, `service worker + push`, `screen modules`, `shared UI/theme`); §6 data architecture (Dexie ownership, entity inventory, consistency, retention); §7 contracts (53 public routes, none exposed); §8 events (none) + workflows FIG-FE-04-1…5; §9 the 13-row frontend contract map; §10 cross-cutting; §11 security + PWA/push architecture; §12 deployment; §13 scaling; §14 failure/degraded; §15 operations (zero jobs); §16 HD-FE-01…09; §17 traceability; §18 OQ register (OQ-HLD-FE-02, OQ-FE-02/03/04/06, OQ-HLD-CARE-01 carried here; OQ-HLD-FE-01 resolved-by Notification LLD LD-NOT-18 → `data.url='/today?dose={id}'`; OQ-FE-05/07/08 resolved upstream).

### 2.2 Component place in system

The Combined Frontend is the `medo-frontend` repository — one public MIT repo under GitHub owner `kiro-ai-bit` (`inherited:.scratch/medo-lld/issues/02-repo-shared-package-layout.md@2026-11-23`), deployed as one Vercel project serving the Next.js 15 App Router PWA at `app.simmaps.com` (`inherited:HLD-MEDO-FRONTEND-001@1.0#12`). It realizes the HLD's thirteen blocks as feature modules under `Medo.Frontend.*` namespaces (Architecture Standard lines 52–73). It does NOT design: any backend domain logic or DTO production (six service LLDs own their contracts — consumed verbatim via `@kiro-ai-bit/contracts`), authz decisions, event machinery, internal REST routes, notification delivery, or `@kiro-ai-bit/*` package internals.

### 2.3 Implementation goals

- LG-FE-1: Every one of the 13 `frontend-map.md` screen rows maps to a screen module + API-client functions + query-key conventions + Dexie classification; all 53 public routes have a client function with exact contract types. [`frontend-map.md@2026-11-22`; HLD §9]
- LG-FE-2: Dexie schema v1 fully specified — four object stores (dose rows, medicine display data, schedules, write-queue) with key paths, indexes, field lists, version/migration plan; exactly the cached-entity set, nothing else. [OQ-FE-02; HLD §6.1; `inherited:.scratch/medo-hld/issues/03-frontend-offline-architecture.md@2026-11-23`]
- LG-FE-3: Write-queue FIFO internals implementable — entry shape, cap + eviction (OQ-FE-03/OQ-HLD-FE-02), bounded backoff, replay algorithm, head-of-line blocking, LWW silent-correct. [HD-FE-05]
- LG-FE-4: Service-worker internals implementable — @serwist precache manifest, CacheFirst photos, NetworkOnly API, local-notification engine reading Dexie, push-event → notification → deep-link flow. [HD-FE-07/08; OQ-FE-04]
- LG-FE-5: Push lifecycle implementable — VAPID fetch → permission-gated `pushManager.subscribe` → `POST /v1/push-subscriptions` → `DELETE` on logout → silent resubscribe; iOS install gate. [HD-FE-08; FR-FE-089…094]
- LG-FE-6: Session/token mechanics implementable — memory-only JWT, one refresh interceptor (401→refresh→retry-once), boot rehydration, single purge routine. [HD-FE-03]
- LG-FE-7: Six-state contract + route guards + patient-context resolution + connectivity state machine bound per screen. [HD-FE-04/06/09]
- LG-FE-8: Carried OQs resolved — write-queue cap, Dexie schema, SW caching, permission timing (OQ-FE-02/03/04/06, OQ-HLD-FE-02), invite-link landing path (OQ-HLD-CARE-01/OQ-LLD-CARE-02), `/today?dose=` route (OQ-LLD-NOT-02).

### 2.4 Implementation non-goals

- DTO schema authoring for backend services → backend LLDs §6 + `@kiro-ai-bit/contracts` zod schemas (this LLD consumes types via `z.infer`, never redefines route shapes).
- Server push payload *production* (dedup_key, TTL, templates) → Notification LLD LD-NOT-16/17/18; frontend binds `data.url` consumption only.
- Invite-link base URL *issuance* → Care LLD LD-CARE-05 (`INVITE_LINK_BASE=https://app.simmaps.com/invite/`); this LLD owns the receiving route `/invite/[token]`.
- Dose window classification authority → Schedule & Dose; frontend computes display labels only (FR-FE-021).
- Task sequencing/estimates → downstream `tasks` stage.
- SSR data fetching of patient data → rejected upstream (PRD §6.2: client fetch preferred; SSR must not block on services).

### 2.5 Inherited decisions

- Frontend stack: Next.js 15 App Router + TypeScript, Tailwind CSS v4 + shadcn/ui, TanStack Query + Zustand, Zod, Dexie, @serwist, Framer Motion, `@sentry/nextjs`, Vercel (`inherited:PRD-MEDO-FRONTEND-001@1.0#§7.3`; `inherited:HLD-MEDO-FRONTEND-001@1.0#2.5`). Note: DEV.log resume shorthand "Vite+React SPA" is superseded by the approved HLD/PRD — Next.js is authoritative.
- Domain/hosts: `app.simmaps.com` (Vercel), `api.simmaps.com` (Caddy→EC2), `photos.simmaps.com` (R2); host-only `SameSite=Lax` refresh cookie on `api.`; previews no-login v1 (`inherited:.scratch/medo-hld/issues/01-domain-selection.md@2026-11-22`).
- Deploy: Vercel Git integration on `main`; no staging (`inherited:.scratch/medo-hld/issues/02-cicd-deploy-mechanism.md@2026-11-23`).
- Offline architecture: 4 Dexie families + locked scope; single global FIFO `{entryId,type,patientId,doseId,payload,enqueuedAt}` + head-of-line blocking + bounded backoff + server LWW silent-correct; binary online/degraded dual-signal/proof-clear; SW = precache shell + CacheFirst photos + NetworkOnly API (`inherited:.scratch/medo-hld/issues/03-frontend-offline-architecture.md@2026-11-23`).
- API gateway: single entry-point Caddy, explicit public-route table, per-service JWT verify pass-through, proxy CORS exact-origin (`inherited:.scratch/medo-backend/issues/05-api-gateway-entry-point.md@2026-11-21`).
- Auth tokens: user JWTs `iss/aud/sub/role/sid/iat/exp(25m)/jti` verified per-service via JWKS; refresh = rotation + reuse-detection, 30d sliding (`inherited:.scratch/medo-backend/issues/06-auth-token-mechanics.md@2026-11-21`).
- Rate limits: server-enforced classes only; frontend surfaces 429 + `Retry-After` (`inherited:.scratch/medo-backend/issues/09-rate-limiting-caching.md@2026-11-21`).
- Observability: `@sentry/nextjs` + Web Vitals + PII/token scrubbing (`inherited:.scratch/medo-backend/issues/08-observability.md@2026-11-21`; `platform-observability.md@2026-11-21`).
- Test tooling: Vitest + RTL + jsdom component tests; Playwright e2e golden-path ~5–8 flows vs local compose; ESLint+typescript-eslint+Prettier+`tsc --noEmit` strict via `@kiro-ai-bit/*` (`inherited:.scratch/medo-lld/issues/01-test-dev-tooling.md@2026-11-23`).
- Repo/shared layout: `medo-frontend` repo; `@kiro-ai-bit/{eventing,rate-limit,eslint-config,tsconfig,test-utils,contracts}` from `medo-shared`, exact-pinned + lockfile + PAT (`inherited:.scratch/medo-lld/issues/02@2026-11-23`, `03@2026-11-24`).
- Contracts: `@kiro-ai-bit/contracts` = single zod-schema source for all 53 public routes; frontend types = `z.infer`; public routes only; frontend consumes zero events (`inherited:.scratch/medo-lld/issues/03-contract-type-sharing.md@2026-11-24`).
- Consumed DTO/event contracts fixed by sibling LLDs: dose window enum + `DueDoseDto`-family shapes, `DoseSummaryDto`/`DoseDetailDto` (§6 of `LLD-MEDO-SCHEDULE-DOSE-001@1.0` — `actorId` exposed per HD-SCH-06), `has-dose-records` (unused by frontend), `DoseOutcomeChanged` payload (not consumed — no events), Notification `data.url='/today?dose={id}'` (`inherited:docs/lld/notification/LLD-MEDO-NOTIFICATION-001.md@1.0#LD-NOT-18`), Care `INVITE_LINK_BASE=https://app.simmaps.com/invite/` (`inherited:docs/lld/care/LLD-MEDO-CARE-001.md@1.0#LD-CARE-05`).
- HLD `HD-FE-01…09` — all `accepted`; realized here.
- Baselines: `platform-quality-baseline.md@2026-11-21`, `platform-observability.md@2026-11-21`, `scheduled-jobs.md@2026-11-21` (frontend row = zero jobs).

## 3. Repository structure and module map

### 3.1 Repository declaration (frontend profile §5.1)

Repository: `medo-frontend` (public, MIT) under `kiro-ai-bit`; consumes `@kiro-ai-bit/{contracts,eslint-config,tsconfig,test-utils}` exact-pinned + committed lockfile; `npm link` dev hatch (`inherited:.scratch/medo-lld/issues/02@2026-11-23`). Logical namespaces: `Medo.Frontend.<ModulePath>`; import convention (LD-FE-01): `@app/*`, `@features/*`, `@shared/*` aliases via `@kiro-ai-bit/tsconfig`. Framework entry: Next.js 15 App Router (`app/` router tree), `instrumentation.ts` for Sentry, `next.config` for headers/headers-only config. `planning/` holds pointers to approved PRD/HLD/LLD. Test roots: `tests/unit`, `tests/component`, `tests/e2e` (Playwright) — component tests live beside modules per Vitest+RTL convention.

```
medo-frontend/
├── app/                      # Next.js App Router — route tree only (thin pages)
│   ├── (public)/             # login, signup, forgot, reset, verify-email, invite/[token]
│   ├── (app)/                # session-gated shell: today, medicines, schedules, care, notifications, profile
│   └── api/                  # none — no backend routes (client-only app)
├── features/                 # feature modules (screens + domain modules)
│   ├── auth/                 # auth-session module
│   ├── patient-context/      # patient-context module
│   ├── today/                # Today screen + dose actions
│   ├── medicines/            # list/detail/add/catalog/photos
│   ├── scheduling/           # schedule builder + exceptions
│   ├── care-links/           # invites + links management
│   ├── notifications/        # feed + prefs + push settings
│   └── gamification/         # theme/points surfaces (widget + scene)
├── lib/
│   ├── api/                  # six typed API clients + http core (auth interceptor)
│   ├── state/                # TanStack Query layer + Zustand stores
│   ├── offline/              # Dexie schema + write-queue + replay engine
│   ├── sw/                   # @serwist worker + notification scheduler + push handlers
│   └── shared/               # theme engine, six-state primitives, guards, utils
├── public/                   # icons, manifest, static assets
├── planning/                 # pointers to approved docs
└── tests/{unit,component,e2e}/
```

### 3.2 Module map

| Module ID | Responsibility | Physical path | Layer-equivalent | HLD block | LD-ref |
|---|---|---|---|---|---|
| `feature-auth-session` | Signup/login/verify/forgot/reset/logout flows; JWT custody; 401→refresh→retry-once; purge orchestration | `features/auth/` | client module | `auth-session` | LD-FE-02/03/04 |
| `feature-patient-context` | `patientId` rule resolution; links fetch; link-end revoke + banner; switcher state | `features/patient-context/` | client module | `patient-context` | LD-FE-05 |
| `api-identity` | Typed Identity REST client | `lib/api/identity/` | api-client | `identity API client` | — |
| `api-care` | Typed Care REST client | `lib/api/care/` | api-client | `care API client` | — |
| `api-medicine` | Typed Medicine REST client incl. photo two-step | `lib/api/medicine/` | api-client | `medicine API client` | — |
| `api-schedule-dose` | Typed Schedule & Dose REST client incl. outcome/snooze | `lib/api/schedule-dose/` | api-client | `schedule-dose API client` | — |
| `api-notification` | Typed Notification REST client incl. prefs/push-subscriptions/vapid-key | `lib/api/notification/` | api-client | `notification API client` | — |
| `api-gamification` | Typed Gamification read client | `lib/api/gamification/` | api-client | `gamification API client` | — |
| `lib-api-http` | Shared fetch core: base URL, Bearer attach, 401 interceptor, error normalization, connectivity signal | `lib/api/http/` | api-client (shared) | `query/state layer` (fetch side) + HD-FE-03 | LD-FE-03/06 |
| `state-query` | TanStack Query client, query-key factory, refresh triggers, per-section hooks | `lib/state/query/` | state | `query/state layer` | LD-FE-07 |
| `state-client` | Zustand stores: session meta, connectivity flag, patient context, UI state | `lib/state/client/` | state | `query/state layer` + `patient-context` | LD-FE-05/06 |
| `offline-dexie` | Dexie database v1: 4 object stores + migrations | `lib/offline/db/` | state (persistence) | `offline store` | LD-FE-08 |
| `offline-queue` | FIFO write-queue: enqueue/replay/backoff/cap/eviction | `lib/offline/queue/` | state (persistence) | `offline store` | LD-FE-09/10 |
| `sw-worker` | @serwist worker: precache, CacheFirst photos, NetworkOnly API, update lifecycle | `lib/sw/worker/` | service-worker | `service worker + push` | LD-FE-11 |
| `sw-notifications` | Local-notification scheduler reading Dexie + Taken/Snooze action routing | `lib/sw/notifications/` | service-worker | `service worker + push` | LD-FE-12 |
| `sw-push` | Push-event → OS notification; notificationclick deep-link; subscription resync | `lib/sw/push/` | service-worker | `service worker + push` | LD-FE-13 |
| `screens-*` | 13 screen modules per HLD §9 rows | `features/*/screens/` + `app/` routes | client module (screens) | `screen modules` | LD-FE-14 |
| `shared-ui-theme` | Design system, Monster Defense theme engine, six-state primitives, route guards, reduced-motion gate | `lib/shared/` | client module (shared) | `shared UI/theme` | LD-FE-15 |

Zero orphans: every HLD §5 block maps to ≥1 module above; every module maps to exactly one HLD block (api-client split is the HLD's own six-client decomposition).

## 4. Module and unit detailed design

Pseudocode dialect note: signatures are TypeScript-flavored; `Promise<T>` marks async; DTO types referenced by §6 contract-schema names; error classes from §14.

### 4.1 `feature-auth-session` — auth flows + session mechanics

| Unit | Kind | Signature | Responsibility | Depends on | Realizes |
|---|---|---|---|---|---|
| `AuthProvider` | component | `<AuthProvider>{children}</AuthProvider>` | Boot rehydration: silent refresh → `GET /v1/me` → hydrate session store; render gate | `api-identity`, `state-client` | HD-FE-03 |
| `useSignup` | hook | `useSignup(): {submit(input: SignupInput): Promise<void>, state: AsyncState}` | `POST /v1/auth/signup`; invite-token carry-through | `api-identity` | FR-FE-001/008 |
| `useLogin` | hook | `useLogin(): {submit(input: LoginInput): Promise<void>, cooldownSeconds: number|null}` | `POST /v1/auth/login`; cooldown display from error `details` | `api-identity` | FR-FE-009 |
| `useVerifyEmail` | hook | `useVerifyEmail(token: string): AsyncState` | `POST /v1/auth/verify-email` | `api-identity` | FR-FE-004 |
| `useResendVerification` | hook | `useResendVerification(): AsyncState` | `POST /v1/auth/resend-verification` | `api-identity` | FR-FE-004 |
| `useForgotPassword` | hook | `useForgotPassword(): AsyncState` | `POST /v1/auth/forgot-password` (neutral confirmation) | `api-identity` | FR-FE-003 flow |
| `useResetPassword` | hook | `useResetPassword(token: string): AsyncState` | `POST /v1/auth/reset-password` | `api-identity` | UF-FE-03 |
| `useLogout` | hook | `useLogout(scope: 'device'\|'all'): Promise<void>` | logout route(s) → push DELETE → `purgeClientState()` | `api-identity`, `api-notification`, `offline-*`, `state-*` | FR-FE-010/108 |
| `purgeClientState` | function | `purgeClientState(reason: 'logout'\|'expired'\|'deleted'): Promise<void>` | Single purge: Dexie.delete() + queryClient.clear() + zustand reset + session null + route login | all stores | HD-FE-03 |
| `SessionGuard` | component | `<SessionGuard><Outlet/></SessionGuard>` | Router-level guard: unauthenticated→login w/ return path; unverified→verify interstitial; wrong-role→explanation | `state-client` | HD-FE-09 |

### 4.2 `feature-patient-context` — patientId resolution

| Unit | Kind | Signature | Responsibility | Depends on | Realizes |
|---|---|---|---|---|---|
| `usePatientContext` | hook | `usePatientContext(): {patientId: string, role: 'patient'\|'caregiver', source: 'self'\|'link'} \| null` | Resolve context: Patient→session `sub`; Caregiver→switcher selection | `state-client`, `api-identity` (`role`) | HD-FE-04, FR-FE-005 |
| `useCareLinks` | hook | `useCareLinks(): AsyncState<CareLinkDto[]>` | `GET /v1/care/links` via TanStack Query (API-only, never Dexie) | `api-care`, `state-query` | FR-FE-043 |
| `PatientSwitcher` | component | `<PatientSwitcher/>` | Caregiver patient selection; empty state "accept an invite" | `useCareLinks`, `state-client` | FR-FE-005a |
| `useLinkEndWatch` | hook | `useLinkEndWatch(): void` | Detect link-end via failed patient-scoped call OR links refresh diff → revoke context + purge patient Dexie slice + set banner flag | `api-*` (via http error hook), `offline-dexie` | FR-FE-006/007 |
| `LinkEndedBanner` | component | `<LinkEndedBanner/>` | "link ended" banner once per ended link on next open | `state-client` | FR-FE-006b |
| `requirePatientContext` | function | `requirePatientContext(): {patientId: string}` | Throws `NoPatientContextError` — every patient-scoped request builder calls it | — | FR-FE-005 |

### 4.3 API clients — one subsection per client

All clients share `lib/api/http/` core. Per service: client object + per-route functions. Signatures use contract-schema types (`z.infer` names from `@kiro-ai-bit/contracts`, §6.2); every function returns the DTO type or throws `ApiError` (§14).

#### 4.3.1 `lib-api-http` — shared HTTP core

| Unit | Kind | Signature | Responsibility | Depends on | Realizes |
|---|---|---|---|---|---|
| `apiFetch` | function | `apiFetch<T>(req: ApiRequest, schema: ZodType<T>): Promise<T>` | Single fetch path: base URL join, `Authorization: Bearer` attach, JSON parse, zod-parse response, error normalize, connectivity signal, 401 interceptor hook | `state-client` (token), `state-client` (connectivity) | HD-FE-03/06 |
| `AuthInterceptor` | function | `onUnauthorized(): Promise<boolean>` | Exactly-one `POST /v1/auth/refresh` per 401 (single-flight) + one retry; failure → `purgeClientState('expired')` | `api-identity` (refresh), `state-client` | FR-FE-003 |
| `raiseConnectivitySignal` | function | `reportApiFailure(): void` / `reportApiSuccess(): void` | Failed-call engages degraded; success clears (proof) | `state-client` | HD-FE-06 |
| `ApiError` | class | `class ApiError extends Error {status, code, requestId, retryAfter?, details?}` | Normalized error envelope consumer | — | §14 |

#### 4.3.2 `api-identity` — Identity routes (12 public)

| Unit | Kind | Signature | Realizes |
|---|---|---|---|
| `identityClient` | object | namespace of route functions below | HD-FE-01 |
| `signup` | function | `signup(input: SignupRequest): Promise<SignupResponse>` | `POST /v1/auth/signup` |
| `login` | function | `login(input: LoginRequest): Promise<LoginResponse>` | `POST /v1/auth/login` |
| `refresh` | function | `refresh(): Promise<RefreshResponse>` | `POST /v1/auth/refresh` (cookie; no Bearer) |
| `logout` / `logoutAll` | function | `logout(): Promise<void>` / `logoutAll(): Promise<void>` | `POST /v1/auth/logout{,-all}` |
| `forgotPassword` / `resetPassword` | function | `forgotPassword(input): Promise<void>` / `resetPassword(input): Promise<void>` | forgot/reset routes |
| `verifyEmail` / `resendVerification` | function | `verifyEmail(token): Promise<void>` / `resendVerification(): Promise<void>` | verify routes |
| `getMe` / `patchMe` / `deleteMe` | function | `getMe(): Promise<MeDto>` / `patchMe(input): Promise<MeDto>` / `deleteMe(): Promise<void>` | `GET/PATCH/DELETE /v1/me` |

#### 4.3.3 `api-care` — Care routes (9 public)

| Unit | Signature | Realizes |
|---|---|---|
| `createInvite` | `createInvite(input: {caregiverEmail: string}): Promise<InviteDto>` | `POST /v1/care/links/invites` |
| `getInvitePreview` | `getInvitePreview(token: string): Promise<InvitePreviewDto>` | `GET /v1/care/invites/{token}` (public) |
| `acceptInvite` / `declineInvite` | `acceptInvite(token): Promise<CareLinkDto>` / `declineInvite(token): Promise<void>` | accept/decline |
| `resendInvite` / `cancelInvite` | `resendInvite(id: string): Promise<InviteDto>` / `cancelInvite(id: string): Promise<void>` | resend/cancel |
| `listInvites` | `listInvites(): Promise<InviteDto[]>` | `GET /v1/care/invites` |
| `listLinks` | `listLinks(): Promise<CareLinkDto[]>` | `GET /v1/care/links` |
| `endLink` | `endLink(id: string): Promise<void>` | `POST /v1/care/links/{id}/end` |

#### 4.3.4 `api-medicine` — Medicine routes (13 public)

| Unit | Signature | Realizes |
|---|---|---|
| `searchCatalog` / `getCatalogEntry` | `searchCatalog(q: string, page?: number): Promise<CatalogPageDto>` / `getCatalogEntry(id): Promise<CatalogEntryDto>` | catalog GETs |
| `createCatalogEntry` / `patchCatalogEntry` | `createCatalogEntry(input): Promise<CatalogEntryDto>` / `patchCatalogEntry(id, input): Promise<CatalogEntryDto>` | catalog writes |
| `requestCatalogPhoto` / `confirmCatalogPhoto` | `requestCatalogPhoto(id, slot): Promise<PhotoUploadTicket>` / `confirmCatalogPhoto(id, slot, photoKey): Promise<void>` | catalog photo two-step |
| `requestMedicinePhoto` / `confirmMedicinePhoto` | same shapes on `/v1/medicines/{id}/photos` — **note:** catalog-only per OQ-FE-08/HD resolution; private-medicine photo routes exist in catalog but frontend uses catalog-entry photos only (LD-FE-16) | medicine photo routes |
| `listMedicines` / `getMedicine` | `listMedicines(patientId: string): Promise<MedicineDto[]>` / `getMedicine(id): Promise<MedicineDetailDto>` | patient medicine GETs |
| `createMedicine` / `patchMedicine` | `createMedicine(input): Promise<MedicineDto>` / `patchMedicine(id, input): Promise<MedicineDto>` | adopt + edit |
| `archiveMedicine` / `deleteMedicine` | `archiveMedicine(id): Promise<void>` / `deleteMedicine(id): Promise<void>` | archive/delete (guard error mapped §14) |
| `putPhotoObject` | `putPhotoObject(uploadUrl: string, file: Blob, contentType: string): Promise<void>` | direct-to-R2 presigned PUT (not via api.simmaps.com) |

#### 4.3.5 `api-schedule-dose` — Schedule & Dose routes (9 public)

| Unit | Signature | Realizes |
|---|---|---|
| `listSchedules` / `createSchedule` | `listSchedules(patientId): Promise<ScheduleDto[]>` / `createSchedule(patientId, input): Promise<ScheduleDto>` | schedule routes |
| `getSchedule` / `patchSchedule` / `deleteSchedule` | `getSchedule(id)`, `patchSchedule(id, input)`, `deleteSchedule(id)` | `/v1/schedules/{id}` |
| `listDoses` / `getDose` | `listDoses(patientId, query: {from: string, to: string, outcome?: string}): Promise<DoseSummaryDto[]>` / `getDose(id): Promise<DoseDetailDto>` | dose reads |
| `markOutcome` | `markOutcome(doseId: string, input: {outcome: DoseOutcome, markedAt?: string}): Promise<DoseDetailDto>` | `POST /v1/doses/{id}/outcome` |
| `snoozeDose` | `snoozeDose(doseId: string): Promise<DoseDetailDto>` | `POST /v1/doses/{id}/snooze` |

#### 4.3.6 `api-notification` — Notification routes (9 public)

| Unit | Signature | Realizes |
|---|---|---|
| `listFeed` / `unreadCount` | `listFeed(cursor?: string): Promise<FeedPageDto>` / `unreadCount(): Promise<{unread: number}>` | feed reads |
| `markRead` / `markAllRead` | `markRead(id): Promise<void>` / `markAllRead(): Promise<void>` | read mutations |
| `getPrefs` / `putPrefs` | `getPrefs(): Promise<NotificationPrefsDto>` / `putPrefs(input: {refillAlerts: boolean, careLinkNotifications: boolean}): Promise<NotificationPrefsDto>` | prefs (two toggles only) |
| `getVapidKey` | `getVapidKey(): Promise<{publicKey: string}>` | `GET /v1/push/vapid-key` (public) |
| `registerPushSubscription` / `removePushSubscription` | `registerPushSubscription(sub: PushSubscriptionKeys): Promise<{id: string}>` / `removePushSubscription(id: string): Promise<void>` | push-sub lifecycle |

#### 4.3.7 `api-gamification` — Gamification route (1 public)

| Unit | Signature | Realizes |
|---|---|---|
| `getGamification` | `getGamification(patientId: string): Promise<GamificationDto>` | `GET /v1/patients/{id}/gamification` |

Rationale (module group): one client per service cluster mirrors HLD HD-FE-01; shared http core gives one 401/429/connectivity choke point (HD-FE-03/06). Adding a contract touches exactly one client.

### 4.4 `state-query` + `state-client` — state layer

| Unit | Kind | Signature | Responsibility | Depends on | Realizes |
|---|---|---|---|---|---|
| `queryClient` | object | `new QueryClient({defaults})` | TanStack Query instance; defaults: `staleTime`, retry policy (§14), `refetchInterval` only where bound | — | HD-FE-02 |
| `queryKeys` | object | factory fns e.g. `queryKeys.doses(patientId, from, to)` | Central query-key registry — every key built here, never ad-hoc | — | LD-FE-07 |
| `useTodayFanout` | hook | `useTodayFanout(): {doses, gamification, feed, medicines}` | 4 parallel `useQuery` calls, independent sections | `state-query`, api clients | FR-FE-020 |
| `useDoseWindowQuery` | hook | `useDoseWindowQuery(patientId, from, to)` | `GET /v1/patients/{id}/doses` — `refetchInterval: 15min` while visible | `api-schedule-dose` | FR-FE-027 |
| `connectivityStore` | zustand store | `{status: 'online'\|'degraded', pendingSyncCount: number, patientContext, session, linkEndedBanner}` | Single owner of binary flag + session/patient meta | — | HD-FE-06 |
| `useConnectivity` | hook | `useConnectivity(): 'online'\|'degraded'` | Subscribe flag; all consumers read this | `connectivityStore` | HD-FE-06 |
| `refreshTriggers` | module | `registerRefreshTriggers(): void` | App open → invalidate active queries; connectivity restore → invalidate + queue replay; post-mutation → targeted invalidate | `queryClient`, `offline-queue` | FR-FE-083 |

### 4.5 `offline-dexie` + `offline-queue` — offline store

| Unit | Kind | Signature | Responsibility | Depends on | Realizes |
|---|---|---|---|---|---|
| `medoDb` | Dexie instance | `class MedoDb extends Dexie` v1 schema (§5) | Four object stores; versioned migrations | dexie | HD-FE-05 |
| `doseCache` | repository | `upsertDoses(rows: CachedDose[]): Promise<void>` / `dosesForRange(patientId, from, to)` / `purgePatient(patientId)` | Dose slice read/write/evict | `medoDb` | FR-FE-080 |
| `medicineCache` | repository | `upsertMedicines(rows)`, `medicinesFor(patientId)` | Medicine display data | `medoDb` | FR-FE-080 |
| `scheduleCache` | repository | `upsertSchedules(rows)`, `futureSchedules(patientId)` | Schedules for local-notification scheduling | `medoDb` | FR-FE-080 |
| `enqueueWrite` | function | `enqueueWrite(entry: Omit<QueueEntry,'entryId'|'enqueuedAt'|'attempts'>): Promise<QueueEntry>` | FIFO enqueue inside `medoDb.transaction` | `medoDb`, cap policy | HD-FE-05 |
| `replayQueue` | function | `replayQueue(): Promise<{sent: number, remaining: number}>` | Ordered replay per §8.3; single-flight | api clients, `medoDb` | FR-FE-081/082 |
| `queueMeta` | repository | `pendingCount()`, `evictOverflow()`, `clearAll()` | Queue cap/eviction/purge | `medoDb` | FR-FE-085/086 |
| `syncDoseSlice` | function | `syncDoseSlice(patientId): Promise<void>` | Post-fetch populate: writes dose/medicine/schedule slices after successful reads | api clients, caches | HD-FE-05 |

### 4.6 `sw-worker` + `sw-notifications` + `sw-push` — service worker

| Unit | Kind | Signature | Responsibility | Depends on | Realizes |
|---|---|---|---|---|---|
| `serwistConfig` | config object | precache + runtime rules per LD-FE-11 | SW build config (manifest generated at build) | @serwist | OQ-FE-04 |
| `notificationScheduler` | module | `rescheduleAll(): Promise<void>` | Read Dexie doses+schedules+medicines → compute reminder instants → `registration.showNotification` per rhythm; suppress missed/locked per cached outcome | `medoDb` (SW-side Dexie access) | HD-FE-07, FR-FE-091 |
| `reminderRhythm` | pure function | `reminderInstants(dose: CachedDose, now: Date, role): ReminderInstant[]` | T−30/T/T+1hr then hourly till marked/midnight; caregiver backup from T+1hr | — | Map 1 t06 (inherited) |
| `onNotificationAction` | handler | `(action: 'taken'\|'snooze', doseId) => void` | Route action → same write path as dose mark: online API call or Dexie queue (SW can open DB) | `medoDb`, fetch | FR-FE-091b |
| `pushHandler` | event handler | `onPush(event): void` | Parse payload → `showNotification` rich dose content | — | HD-FE-08 |
| `onNotificationClick` | event handler | `onClick(event): void` | Deep-link via route-target map (`data.url` from LD-NOT-18 or fallback map) → focus/open `/today?dose={id}` | — | FR-FE-078, OQ-LLD-NOT-02 |
| `pushLifecycle` | module | `ensureSubscription(): Promise<void>` / `removeSubscription(): Promise<void>` / `resyncIfPruned(): Promise<void>` | VAPID fetch → permission → subscribe → POST; DELETE on logout; silent resubscribe | `api-notification`, Push API | FR-FE-089/093 |
| `installGate` | module | `iosInstallRequired(): boolean` / `promptInstall(): void` | Detect iOS non-installed → install guidance before permission | — | FR-FE-090, OQ-FE-06 |

### 4.7 `screens-*` + `shared-ui-theme`

| Unit | Kind | Signature | Responsibility | Realizes |
|---|---|---|---|---|
| `AppShell` | component | layout w/ nav + theme palette + pending-sync badge + `LinkEndedBanner` | session-gated shell | HD-FE-09 |
| `TodayScreen` | component | 4-section fan-out composition; dose cards w/ window labels + actions | FR-FE-020…028 |
| `DoseCard` / `DoseActions` | components | window-state display; Taken/Snooze/Skip; optimistic mark + queue fallback | FR-FE-021…023 |
| `MedicinesScreen` / `MedicineDetail` / `AddMedicineWizard` / `PhotoUploader` | components | list/search/detail/edit/archive/delete/add-catalog/photos | FR-FE-055…061 |
| `ScheduleBuilder` | component | guided builder + calendar exceptions | FR-FE-067…071 |
| `CareLinksScreen` | component | invites + links + end + pending | FR-FE-040…045 |
| `NotificationsScreen` / `PrefsScreen` / `PushSettings` | components | feed/prefs/push lifecycle UI | FR-FE-075…079, 089 |
| `GamificationWidget` / `ThemeScene` | components | points+theme on Today/shell; three visual states | FR-FE-024/105 |
| `ProfileScreen` | component | `GET/PATCH/DELETE /v1/me`, logout-all | FR-FE-104/107/108 |
| `AuthScreens` | components | signup/login/verify/forgot/reset/invite-preview | FR-FE-001…010, 040…042 |
| `SixState` primitives | components | `<SectionState>` loading/empty/error/offline/unauthorized | FR-FE-102, §5.2 table |
| `themeEngine` | module | `themeTokens(state: 'harmony'\|'uneasy'\|'horror')` → CSS vars + scene params | FR-FE-105 |
| `ReducedMotionGate` | module | wraps Framer Motion; `useReducedMotion()` honored | FR-FE-106 |
| `RouteGuard` | component | public/session/verified+role classes at router level | HD-FE-09 |

Rationale: screens stay thin — compose hooks/clients; offline machinery isolated from presentation (HD-FE-01).

## 5. Data model and persistence design (frontend profile §5.3 → Dexie)

Client-owned persistent store = one Dexie database `medo` on each device — the ONLY client persistence boundary. No migrations of server data; all rows are non-authoritative cache.

### 5.1 Database `medo` v1 — object stores

| Store | Key path | Indexes | Contents |
|---|---|---|---|
| `doses` | `doseId` | `[patientId+scheduledAt]`, `[patientId+localDate]`, `[patientId+outcome]` | Cached dose rows |
| `medicines` | `medicineId` | `[patientId]` | Medicine display data |
| `schedules` | `scheduleId` | `[patientId+medicineId]` | Schedule display rows |
| `writeQueue` | `entryId` (auto-increment) | `[enqueuedAt]`, `[patientId]` | FIFO write-queue entries |
| `meta` | `key` | — | sync markers: `lastSyncAt`, `schemaFlags`, `endedLinks` banner flags |

### 5.2 `doses` store — columns

| Field | Type | Nullable | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `doseId` | string | no | — | PK | from `DoseSummaryDto`/`DoseDetailDto` |
| `patientId` | string | no | — | required | context partition key |
| `scheduleId` | string | no | — | — | join |
| `medicineId` | string | no | — | — | join to `medicines` |
| `localDate` | string | no | — | `YYYY-MM-DD` schedule-local | window calc input |
| `doseTime` | string | no | — | `HH:mm` schedule-local | |
| `scheduledAt` | string | no | — | ISO instant | server truth |
| `outcome` | string\|null | yes | null | `taken-on-time\|taken-late\|skipped\|missed\|null` | cached server state |
| `snoozedUntil` | string\|null | yes | null | ISO instant | transient field cached |
| `skippedByUser` | boolean | no | false | — | plan-skip flag |
| `actorId` | string\|null | yes | null | — | attribution display (LD-FE-15) |
| `markedAt` | string\|null | yes | null | — | last outcome time |
| `fetchedAt` | string | no | — | ISO | cache-age for stale indicators |

### 5.3 `medicines` store — columns

| Field | Type | Nullable | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `medicineId` | string | no | — | PK | |
| `patientId` | string | no | — | required | |
| `displayName` | string | no | — | — | resolved catalog display name |
| `dosage` | string | no | — | — | |
| `photoUrl` | string\|null | yes | null | R2 public URL | CacheFirst via SW |
| `dosesRemaining` | number\|null | yes | null | — | refill badge display |
| `refillThreshold` | number\|null | yes | null | — | refill badge threshold display (PRD-MEDICINE OQ-MED-06) |
| `archived` | boolean | no | false | — | |
| `fetchedAt` | string | no | — | — | |

### 5.4 `schedules` store — columns

| Field | Type | Nullable | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `scheduleId` | string | no | — | PK | |
| `patientId` | string | no | — | required | |
| `medicineId` | string | no | — | — | join |
| `timezone` | string | no | — | IANA tz | schedule-owned tz (HD-SCH-07) |
| `doseTimes` | string[] | no | — | `HH:mm[]` | |
| `startDate` / `endDate` | string\|null | yes | null | `YYYY-MM-DD` | |
| `rrule` | string\|null | yes | null | stored rule text | display only — never expanded client-side |
| `fetchedAt` | string | no | — | — | |

### 5.5 `writeQueue` store — columns

| Field | Type | Nullable | Default | Constraints | Notes |
|---|---|---|---|---|---|
| `entryId` | number | no | auto | PK auto-increment | FIFO order = key order |
| `type` | string | no | — | `outcome\|snooze` | only eligible writes (HD-FE-05) |
| `patientId` | string | no | — | — | |
| `doseId` | string | no | — | — | |
| `payload` | object | no | — | `{outcome?, markedAt?}` per type | replay body |
| `enqueuedAt` | string | no | — | ISO | ordering + age |
| `attempts` | number | no | 0 | — | backoff counter |
| `nextAttemptAt` | string | no | — | ISO | backoff gate |
| `lastError` | string\|null | yes | null | — | diagnostics |

Queue cap: **LD-FE-09** (resolves OQ-FE-03/OQ-HLD-FE-02) — `MAX_QUEUE_ENTRIES=200`, `MAX_QUEUE_AGE_DAYS=7`; overflow evicts oldest with `meta.evictedCount` + user warning (FR-FE-086).

### 5.6 `meta` store

| Field | Type | Notes |
|---|---|---|
| `key` | string PK | `lastFullSyncAt`, `endedLinks:<linkId>`, `evictedCount`, `installPromptDismissed` |
| `value` | any | JSON-serializable |

### 5.7 Migration & seed plan

- `medo` v1 = initial schema (this LLD). Future versions: Dexie `.version(n).upgrade()` chain; each upgrade MUST preserve `writeQueue` + `meta` rows (FR-FE-088a). Migrations run before first render via `medoDb.open()` in `AuthProvider` boot; failure → recoverable error screen (LD-FE-08).
- Seed: none — all rows populated by `syncDoseSlice` on first successful reads; no server seeds needed (client cache).
- Purge triggers (HLD §6.4): logout/logout-all/session-expired/account-delete → `medoDb.delete()`; link-end → `doseCache/medicineCache/scheduleCache.purgePatient(patientId)` + queue entries for that patientId removed.
- Retention: no time-based TTL — demand-refreshed; window rollover evicts `doses` rows outside the 7-day lookback + today (LD-FE-08).

## 6. API endpoint realization (frontend profile §5.2)

### 6.1 Contract inventory — 53 public routes → client functions

All routes under `https://api.simmaps.com/v1`; auth = `Authorization: Bearer <access JWT>` except the public rows marked †. Request/response field-exactness is owned by `@kiro-ai-bit/contracts` zod schemas (`z.infer` types); schema field definitions are SSOT'd in the owning service LLD §6 (cite-don't-copy — e.g. `LLD-MEDO-IDENTITY-001@1.0#6`).

| # | Route | Client fn | Schema (contracts pkg) | Class | Offline |
|---|---|---|---|---|---|
| 1 | `POST /v1/auth/signup` † | `signup` | `SignupRequest/SignupResponse` | mutation | API-only |
| 2 | `POST /v1/auth/login` † | `login` | `LoginRequest/LoginResponse` | mutation | API-only |
| 3 | `POST /v1/auth/refresh` †cookie | `refresh` | `RefreshResponse` | mutation (interceptor) | API-only |
| 4 | `POST /v1/auth/logout` | `logout` | — | mutation | API-only |
| 5 | `POST /v1/auth/logout-all` | `logoutAll` | — | mutation | API-only |
| 6 | `POST /v1/auth/forgot-password` † | `forgotPassword` | `ForgotPasswordRequest` | mutation | API-only |
| 7 | `POST /v1/auth/reset-password` † | `resetPassword` | `ResetPasswordRequest` | mutation | API-only |
| 8 | `POST /v1/auth/verify-email` † | `verifyEmail` | `VerifyEmailRequest` | mutation | API-only |
| 9 | `POST /v1/auth/resend-verification` † | `resendVerification` | — | mutation | API-only |
| 10 | `GET /v1/me` | `getMe` | `MeDto` | query `['me']` | cached read-only view |
| 11 | `PATCH /v1/me` | `patchMe` | `PatchMeRequest/MeDto` | mutation | API-only |
| 12 | `DELETE /v1/me` | `deleteMe` | — | mutation | API-only |
| 13 | `POST /v1/care/links/invites` | `createInvite` | `CreateInviteRequest/InviteDto` | mutation | API-only |
| 14 | `GET /v1/care/invites/{token}` †locator | `getInvitePreview` | `InvitePreviewDto` | query `['invite',token]` | API-only |
| 15 | `POST /v1/care/invites/{token}/accept` | `acceptInvite` | `AcceptInviteResponse` | mutation | API-only |
| 16 | `POST /v1/care/invites/{token}/decline` | `declineInvite` | — | mutation | API-only |
| 17 | `POST /v1/care/invites/{id}/resend` | `resendInvite` | `InviteDto` | mutation | API-only |
| 18 | `POST /v1/care/invites/{id}/cancel` | `cancelInvite` | — | mutation | API-only |
| 19 | `GET /v1/care/invites` | `listInvites` | `InviteDto[]` | query `['invites']` | API-only |
| 20 | `GET /v1/care/links` | `listLinks` | `CareLinkDto[]` | query `['links']` | API-only |
| 21 | `POST /v1/care/links/{id}/end` | `endLink` | — | mutation | API-only |
| 22 | `GET /v1/medicine-catalog?q=&page=` | `searchCatalog` | `CatalogPageDto` | query `['catalog',q,page]` | API-only |
| 23 | `GET /v1/medicine-catalog/{id}` | `getCatalogEntry` | `CatalogEntryDto` | query `['catalog',id]` | API-only |
| 24 | `POST /v1/medicine-catalog` | `createCatalogEntry` | `CatalogEntryRequest/Dto` | mutation | API-only |
| 25 | `PATCH /v1/medicine-catalog/{id}` | `patchCatalogEntry` | `CatalogEntryPatch/CatalogEntryDto` | mutation | API-only |
| 26 | `POST /v1/medicine-catalog/{id}/photos` | `requestCatalogPhoto` | `PhotoTicketDto {photoKey,uploadUrl}` | mutation | API-only |
| 27 | `PUT /v1/medicine-catalog/{id}/photos/{slot}` | `confirmCatalogPhoto` | — | mutation | API-only |
| 28 | `GET /v1/medicines?patientId=` | `listMedicines` | `MedicineDto[]` | query `['medicines',patientId]` | Dexie display slice |
| 29 | `POST /v1/medicines` | `createMedicine` | `CreateMedicineRequest/MedicineDto` | mutation | API-only |
| 30 | `GET /v1/medicines/{id}` | `getMedicine` | `MedicineDetailDto` | query `['medicine',id]` | read-only cached |
| 31 | `PATCH /v1/medicines/{id}` | `patchMedicine` | `PatchMedicineRequest/MedicineDto` | mutation | API-only |
| 32 | `POST /v1/medicines/{id}/archive` | `archiveMedicine` | — | mutation | API-only |
| 33 | `DELETE /v1/medicines/{id}` | `deleteMedicine` | — | mutation | API-only |
| 34 | `POST /v1/medicines/{id}/photos` †unused v1 | — | `PhotoTicketDto` | — | catalog-only photos (LD-FE-16) |
| 35 | `PUT /v1/medicines/{id}/photos/{slot}` †unused v1 | — | — | — | catalog-only photos |
| 36 | `GET /v1/patients/{id}/schedules` | `listSchedules` | `ScheduleDto[]` | query `['schedules',patientId]` | Dexie slice |
| 37 | `POST /v1/patients/{id}/schedules` | `createSchedule` | `ScheduleRequest/ScheduleDto` | mutation | API-only |
| 38 | `GET /v1/schedules/{id}` | `getSchedule` | `ScheduleDto` | query `['schedule',id]` | Dexie slice |
| 39 | `PATCH /v1/schedules/{id}` | `patchSchedule` | `SchedulePatch/ScheduleDto` | mutation | API-only |
| 40 | `DELETE /v1/schedules/{id}` | `deleteSchedule` | — | mutation | API-only |
| 41 | `GET /v1/patients/{id}/doses?from=&to=&outcome=` | `listDoses` | `DoseSummaryDto[]` | query `['doses',patientId,from,to,outcome]` | Dexie slice |
| 42 | `GET /v1/doses/{id}` | `getDose` | `DoseDetailDto` | query `['dose',id]` | Dexie slice |
| 43 | `POST /v1/doses/{id}/outcome` | `markOutcome` | `MarkOutcomeRequest/DoseDetailDto` | mutation → queue-eligible | write-queue offline |
| 44 | `POST /v1/doses/{id}/snooze` | `snoozeDose` | `DoseDetailDto` | mutation → queue-eligible | write-queue offline |
| 45 | `GET /v1/notifications?cursor=` | `listFeed` | `FeedPageDto` | infinite query `['feed',cursor]` | API-only |
| 46 | `GET /v1/notifications/unread-count` | `unreadCount` | `{unread:number}` | query `['feed','unread']` | API-only |
| 47 | `POST /v1/notifications/{id}/read` | `markRead` | — | mutation | API-only |
| 48 | `POST /v1/notifications/read-all` | `markAllRead` | — | mutation | API-only |
| 49 | `GET /v1/notification-preferences` | `getPrefs` | `NotificationPrefsDto` | query `['prefs']` | API-only |
| 50 | `PUT /v1/notification-preferences` | `putPrefs` | `NotificationPrefsDto` | mutation | API-only |
| 51 | `GET /v1/push/vapid-key` †public | `getVapidKey` | `{publicKey:string}` | query `['vapid']` staleTime=session | n/a |
| 52 | `POST /v1/push-subscriptions` | `registerPushSubscription` | `PushSubRequest/{id}` | mutation | n/a |
| 53 | `DELETE /v1/push-subscriptions/{id}` | `removePushSubscription` | — | mutation | n/a |
| 54 | `GET /v1/patients/{id}/gamification` | `getGamification` | `GamificationDto` | query `['gamification',patientId]` | API-only last-known/hide |

† = fully public or locator-only per catalog authz column. Internal routes (`/v1/doses/due`, `has-dose-records`, `/v1/users/{id}`, `check-link`, `patients/{id}/links`) are never called — no client functions exist for them.

### 6.2 Type consumption rule

Every signature's `*Request`/`*Response`/`*Dto` type = `z.infer<typeof Schema>` exported from `@kiro-ai-bit/contracts` (ticket 03). No hand-written duplicate interfaces; a missing schema = contract gap flagged upstream, never defined locally. Zod schemas are the runtime validators inside `apiFetch` (response parse) and at form boundaries (UX validation §14).

### 6.3 Query-key factory (LD-FE-07)

Rule: all keys via `queryKeys.*` factory — shape `['<domain>', ...parts]`; Today fan-out keys: `['doses', patientId, from, to]`, `['gamification', patientId]`, `['feed', cursor]`, `['feed','unread']`, `['medicines', patientId]`. `staleTime` defaults: reads 60s except `['vapid']` = session; `refetchInterval` = 15min ONLY on `['doses',…today…]` while `document.visibilityState==='visible'` (LD-FE-07). Post-mutation invalidation = targeted `queryClient.invalidateQueries` per §8.4.

### 6.4 Per-screen six-state contract (FR-FE-102)

Bound verbatim from `PRD-MEDO-FRONTEND-001@1.0#§5.2` table — 15 screen/module rows; each maps to a `<SixState>` wrapper per section. Offline/degraded column realized via `useConnectivity()` + Dexie fallback components (`CachedDoseList`, `LastKnownWidget`). Route→screen map + guard class: `/login`,`/signup`,`/forgot`,`/reset`,`/verify-email`,`/invite/[token]` = public; app shell routes = session-gated; patient-scoped routes (`/today`,`/medicines*`,`/schedules*`,`/care*`) = verified+role-gated; `/profile`,`/notifications`,`/settings/push` = session-gated non-patient-scoped.

### 6.5 Client-side validation (FR-FE-101, §5.3 PRD)

Zod form schemas per PRD §5.3 table (signup/login/forgot-reset/invite/profile/medicine/catalog/schedule/prefs/outcome) — UX only, `on-blur`+`on-submit`; server errors mapped field-level via `ApiError.details` where present (OQ-LLD-SYS-01 envelope ratified client-side: consume `{error:{code,message,requestId,details?}}` as-is).

## 7. Event realization

### 7.1 Published events

**Not an event participant — publishes none.** No outbox, no `broker_db` access, no `@kiro-ai-bit/eventing` publisher.

### 7.2 Consumed events

**Not an event participant — consumes none.** Freshness = REST reads (four triggers) + Web Push payloads (display-only). `@kiro-ai-bit/eventing` is NOT a frontend dependency (ticket 03 verified).

### 7.3 Explicit none-statements

- Publishes: none. Consumes: none. Subscribes (messaging): platform Push API lifecycle only (§11.4/§4.6 `pushLifecycle`) — Notification-service contract, not event consumption.

## 8. Algorithms and business-rule logic

### 8.1 Connectivity state machine (HD-FE-06)

States: `online`, `degraded`. Engage on `offline` event OR any `apiFetch` failure (incl. non-2xx network-level; HTTP 4xx/5xx with valid JSON does NOT engage — server reachable). Clear only on first successful `apiFetch` response. Single owner `connectivityStore`; no component self-detects.

```
on online-event            -> status=online
on offline-event           -> status=degraded
on apiFetch network-fail   -> status=degraded
on apiFetch success        -> if degraded: status=online; trigger refreshTriggers.restore()
```

### 8.2 Silent-refresh interceptor (HD-FE-03)

```
apiFetch(response.status === 401 && !req.isAuthRoute && !req._retried):
  if refreshInFlight: await it
  else: refreshInFlight = identityClient.refresh()
       .then(ok => ok) .catch(() => purgeClientState('expired'))
  if refresh ok: retry original once (_retried=true)
  if fail: throw ApiError(401) — caller surfaces; purge already ran
```

Single-flight guaranteed; exactly one retry; no loops (FR-FE-003).

### 8.3 Write-queue replay (HD-FE-05, FR-FE-081/082)

```
replayQueue():                      # single-flight; called on proof-of-connectivity + post-mutation
  if replaying or status!=online: return
  replaying = true
  for entry of writeQueue.orderBy('entryId').toArray():   # FIFO = key order
    if entry.nextAttemptAt > now: break                    # head-of-line + backoff gate
    try:
      resp = entry.type=='outcome' ? markOutcome(entry.doseId, entry.payload)
                                   : snoozeDose(entry.doseId)
      delete entry                                              # success only
      sent++
    catch e:
      entry.attempts++; entry.lastError = e.code
      entry.nextAttemptAt = now + backoff(entry.attempts)       # bounded exp backoff, cap 30min
      if permanent(e): mark entry.dead = true (kept for user warning; not retried)
      break                                                    # head-of-line blocking
  update pendingSyncCount; if queue empty -> refreshTriggers.postReplay()
```

Backoff: `min(30min, 2^attempts minutes)` jittered ±20% (LD-FE-10). Permanent = 4xx validation/authz (not 401 — interceptor handles); retryable = network/5xx/429(Retry-After honored).

### 8.4 Read refresh triggers (FR-FE-083)

1. App open / boot → `queryClient.invalidateQueries()` (all) after session hydrate.
2. Connectivity restore → invalidate all + `replayQueue()` FIRST, then invalidate (post-replay truth).
3. Post-mutation → invalidate the mutation's dependent keys (table per screen; e.g. `markOutcome` → `['doses',patientId]` + `['medicines',patientId]` + `['gamification',patientId]` + `['feed','unread']`).
4. `refetchInterval` 15min on `['doses', patientId, today, today]` while tab visible (TanStack `refetchIntervalInBackground:false`).

### 8.5 Dexie slice sync (populate-on-read)

```
after successful listDoses/listMedicines/listSchedules response:
  syncDoseSlice: upsertDoses(map(dto->CachedDose)); upsertMedicines(displayFields);
                 upsertSchedules(scheduleFields); doseCache.evictOutsideWindow(patientId, today-7d, today+1d)
```

Server remains truth; Dexie is write-through cache populated ONLY from successful API responses (never from queue replays — replay triggers a refetch instead).

### 8.6 Local-notification scheduler (HD-FE-07)

```
rescheduleAll():   # runs in SW on: Dexie data change message, connectivity restore, SW activate, periodic while app open
  rows = doses+schedules+medicines from Dexie (SW IndexedDB access)
  for each dose in horizon (today..+7d) where outcome==null and !skippedByUser:
    for each instant in reminderInstants(dose, now, role):   # T-30,T,T+1h,hourly..midnight; caregiver from T+1h
      if instant > now: registration.showNotification(tag=`dose:${doseId}:${window}`, {rich Monster Defense body, actions:[Taken,Snooze]})
  suppress instants for outcome!=null or missed-locked rows
```

Recompute triggers: `medoDb` hook message from page (`doseCache` writes), SW `sync` event equivalent = app-open message, connectivity-restore message. No RRULE expansion — materialized dose rows only.

### 8.7 Push lifecycle state machine

States: `unsupported → prompt-needed → granted-subscribed → subscribed`; `denied → degraded-prompt`; `pruned → resyncing → subscribed`.

```
ensureSubscription():
  if !('serviceWorker' in navigator && 'PushManager' in window): unsupported
  if ios && !isInstalled(): showInstallPrompt(); return          # FR-FE-090, OQ-FE-06
  key = await getVapidKey() (memory-cached per session)
  if Notification.permission=='default': requestPermission() in user gesture only
  if granted: sub = await registration.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:key})
              await registerPushSubscription({endpoint,p256dh,auth})   # once per device; dedup by endpoint
removeSubscription(): on logout -> DELETE /v1/push-subscriptions/{id} (best-effort, don't block logout)
resyncIfPruned(): on 404/410/403 from register -> unsubscribe + resubscribe + re-POST silently
```

### 8.8 Patient-context resolution (HD-FE-04)

```
resolve():
  me = session.user (role from /v1/me)
  if role=='patient': return {patientId: me.sub, source:'self'}
  if role=='caregiver': return switcher.selectedLink ? {patientId: selectedLink.patientId, source:'link'} : null
linkEnd detection: patient-scoped call returns 403/FORBIDDEN -> revoke context, purge patient slice,
                   remove link from switcher, set meta.endedLinks[linkId]=true (banner next open)
```

### 8.9 Dose window label (display-only, FR-FE-021)

```
windowLabel(dose, now):   # schedule tz via Intl; display only — server owns outcome
  t = doseTime in schedule.timezone -> instant; mins = diff(now, scheduledAt)
  if outcome set: return outcome label (missed -> 'missed/locked' after midnight)
  if now < scheduledAt-30m: 'upcoming'; <= scheduledAt+60m: 'takeable'..'on-time';
  same localDate: 'late'; next localDate: 'missed'
```

### 6.10 Invite landing route (OQ-HLD-CARE-01/OQ-LLD-CARE-02 resolution)

`app/(public)/invite/[token]/page.tsx` — public route; `getInvitePreview(token)` locator-only; unauthenticated → signup/login carrying `?invite=<token>` through `AuthProvider` resume; authenticated wrong-role (Patient) → role explanation; terminal states (expired/used/declined) → dedicated pages. Matches Care `INVITE_LINK_BASE=https://app.simmaps.com/invite/` (`inherited:LLD-MEDO-CARE-001@1.0#LD-CARE-05`) — **OQ-LLD-CARE-02 resolved**.

### 8.11 `/today?dose={id}` handling (OQ-LLD-NOT-02 resolution)

`TodayScreen` reads `searchParams.dose`; on populated state: scroll `doseId` card into view + highlight ring + focus management; unknown/stale id → ignore param, render normal Today (never error). Matches Notification `data.url='/today?dose={id}'` (`inherited:LLD-MEDO-NOTIFICATION-001@1.0#LD-NOT-18`).

### 8.12 Logout purge sequence (FR-FE-010)

```
useLogout: warn if writeQueue.pendingCount>0 -> confirm
  await identityClient.logout[All]()         # best-effort
  await pushLifecycle.removeSubscription()   # best-effort
  await purgeClientState('logout'):          # ALWAYS runs even if calls fail
     await medoDb.delete(); queryClient.clear(); connectivityStore.reset();
     sessionStore.clear(); router -> /login
```

### 8.13 Gamification theme mapping (FR-FE-105)

`GamificationDto.themeState ∈ harmony|uneasy|horror` → `themeEngine.tokens()` → CSS custom properties on `AppShell` + `ThemeScene` params; last-known values held in `state-client` (memory only — NEVER Dexie, FR-FE-024/NG-4); offline → last-known or hide widget + stale indicator.

### 8.14 Actor attribution display (FR-FE-103, OQ-FE-05 resolution)

Dose DTO `actorId` (fixed by `LLD-MEDO-SCHEDULE-DOSE-001@1.0#LD-SCH-07/HD-SCH-06`): display rule — `actorId == session.sub` → "you"; else if `actorId` matches a linked caregiver's userId in `GET /v1/care/links` → "marked by caregiver (<link displayName>)"; else "marked by caregiver". No directory call (frontend cannot call `/v1/users/{id}` — internal).

Invariants (enforcement points):
- INV-FE-1: exactly four Dexie stores + meta; zero feed/gamification/links/catalog rows in Dexie — enforced by repository API surface (no write paths exist).
- INV-FE-2: access JWT memory-only; refresh cookie JS-inaccessible — enforced by http core (no storage writes of token).
- INV-FE-3: queue FIFO order — enforced by auto-increment PK + single-flight replay + head-of-line break.
- INV-FE-4: API-only data never touches Dexie — enforced by `syncDoseSlice` being the ONLY Dexie writer besides queue.
- INV-FE-5: one refresh attempt per 401 — enforced inside `apiFetch` interceptor flag.
- INV-FE-6: connectivity clears only on successful API response — enforced inside `apiFetch` success path.
- INV-FE-7: six states per screen — enforced by `<SixState>` wrapper requirement + §15 audit.

## 9. Transaction boundaries and consistency

Client-side atomicity units (no distributed tx — single-device IndexedDB):

| Write path | Tx boundary | Side effects | Failure semantics |
|---|---|---|---|
| `enqueueWrite` | Dexie tx: insert queue row + update `meta.pendingSyncCount` | pending badge | rollback both; surface enqueue error |
| `replayQueue` per entry | HTTP call outside Dexie tx; delete row only on 2xx | refetch invalidation post-drain | retain + backoff on failure |
| `syncDoseSlice` | Dexie tx per store family (doses+medicines+schedules may be one tx) | cache freshness | partial failure → next trigger retries; stale indicators cover |
| `purgeClientState` | `medoDb.delete()` + store resets (best-effort sequential) | login route | always completes; failures logged to Sentry |
| `markOutcome` online | optimistic UI update → API call → invalidate | pending state | failure → revert + toast (online) or enqueue (offline/degraded) |
| Photo two-step | `requestPhoto` → `putPhotoObject` (R2) → `confirmPhoto` | slot state | confirm failure → slot empty + retry; orphan photoKey server-retained (resolved OQ-MED-03) |

Concurrency: two tabs — last-writer-wins per Dexie row; queue is per-device (no cross-tab ordering needed at envelope; 15-min refetch reconciles). Dexie `version()` upgrades run before render.

## 10. Scheduled jobs and background processing

**No scheduled jobs** — explicit per `scheduled-jobs.md@2026-11-21` (frontend row = none). Client-side notification scheduling (§8.6) is event-driven recompute, not a scheduled job (PRD §7.3). No node-cron, no SW periodic-sync reliance in v1 (recompute on triggers only — LD-FE-12).

## 11. Integration clients and cross-service calls

| Dependency | Client unit | Auth | Timeout/retry | Failure binding |
|---|---|---|---|---|
| api.simmaps.com all REST | `apiFetch` per client | Bearer JWT; refresh cookie on `/v1/auth/*` | fetch default; TanStack retry per §14; queue for dose writes | degraded engage; per-section error |
| photos.simmaps.com R2 | `putPhotoObject` presigned PUT; `<img>` GETs | presigned URL / public-read | browser default; user retry per slot | slot empty + retry; orphan key server-side |
| OS push service → SW | `pushHandler` | platform | platform-managed | best-effort backup |
| IndexedDB (Dexie) | `medoDb` | device-local | sync API | recoverable error screen, never white-screen |
| Vercel edge | hosting | platform | platform | precached shell serves app |

Inbound: none (no routes, no webhooks). Internal REST: never called. JWKS: frontend never verifies JWTs — attach-only.

## 12. Shared packages and platform bindings

| Package/mechanism | API surface used | Init point | Config keys |
|---|---|---|---|
| `@kiro-ai-bit/contracts` | zod schemas → `z.infer` types + `apiFetch` response validation | `lib/api/http` + form schemas | — |
| `@kiro-ai-bit/tsconfig` | path aliases `@app/* @features/* @lib/*` | tsconfig extends | — |
| `@kiro-ai-bit/eslint-config` / `test-utils` | lint + Vitest setup | config files | — |
| `next` 15 App Router | routing, `useSearchParams`, `instrumentation` | `app/` tree | `NEXT_PUBLIC_API_BASE_URL` |
| `@tanstack/react-query` | `QueryClient`, `useQuery`, `useMutation`, `useInfiniteQuery` | `state-query` | per §6.3 |
| `zustand` | `create` stores | `state-client` | — |
| `dexie` | `Dexie`, `version().stores()`, `transaction` | `offline-dexie` | — |
| `zod` | schema validation (forms + response parse via contracts) | forms + `apiFetch` | — |
| `@serwist/*` (Next integration) | `Serwist` SW registration, precache, runtime caching, push/notification events | `lib/sw/` + `next.config` wrapper | manifest at build |
| `framer-motion` | animated components | `shared-ui-theme` | reduced-motion gate |
| `@sentry/nextjs` | `Sentry.init`, `captureException`, Web Vitals | `instrumentation.ts` + edge | `NEXT_PUBLIC_SENTRY_DSN` |
| `tailwindcss` v4 + `shadcn/ui` | styling + components | `app/globals.css` + `components/ui` | theme tokens |
| `date-fns` + `date-fns-tz`? — **LD-FE-17**: use `Intl.DateTimeFormat` + `Temporal`-free manual tz math via `luxon`? Decision: **`luxon`** for schedule-tz window math (consistent w/ SCH LLD LD-SCH-12; MIT; documented) | `lib/shared/time` | — |

Not used: `@kiro-ai-bit/eventing` (no events), `@kiro-ai-bit/rate-limit` (server-side), Dexie addons beyond core.

## 13. Configuration, secrets and environment

| Var | Consumer | Purpose | Local | Prod | Required |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `apiFetch` | `https://api.simmaps.com` | `.env.local` | Vercel env | yes |
| `NEXT_PUBLIC_SENTRY_DSN` | `@sentry/nextjs` | error ingest | `.env.local` | Vercel env | yes |
| `NEXT_PUBLIC_APP_ENV` | boot | `development\|production` | `.env.local` | Vercel env | yes |
| VAPID public key | `pushLifecycle` | `applicationServerKey` | runtime fetch `GET /v1/push/vapid-key` — NEVER bundled | same | runtime |
| Presigned photo URLs | `PhotoUploader` | upload/confirm | runtime from API | same | runtime |

Zero secrets client-side (public VAPID + short-lived presigned URLs only — HLD §10.6/§11.3). Env validation unit: `lib/config/env.ts` zod-parsed at boot, fail-fast on missing required vars (LD-FE-01 convention).

## 14. Error handling, idempotency and failure paths

Error envelope consumed verbatim: `{error:{code,message,requestId,details?}}` → `ApiError{status,code,requestId,retryAfter,details}` (OQ-LLD-SYS-01 ratified client-side — consume `details` when present, ignore otherwise). Code registry surfaced: `UNAUTHORIZED`, `FORBIDDEN`(→no-access), `NOT_FOUND`, `CONFLICT`(delete-guard), `VALIDATION_FAILED`(field-map via details), `RATE_LIMITED`(→`Retry-After` countdown), `DEPENDENCY_UNAVAILABLE`, `INTERNAL`.

| Unit/Path | Failure mode | Behavior | Retry? | Observability |
|---|---|---|---|---|
| `apiFetch` network fail | offline/dead API | engage degraded; throw `ApiError(0)` | per query class | connectivityStore + Sentry breadcrumb |
| 401 | expired access | interceptor refresh+retry once | once | — |
| refresh fail | revoked session | purge + login redirect | no | Sentry event |
| 403 patient-scoped | link ended/denied | no-access page + context revoke | no | — |
| 409 delete-guard | dose records exist | "archive instead" + CTA | no | — |
| 429 | rate limited | `Retry-After` countdown UI (login cooldown, resend cap) | user-driven | — |
| queue replay entry fail | 4xx/5xx/network | retain + bounded backoff; head-of-line | auto per §8.3 | `lastError` + pending badge |
| Dexie open/migration fail | quota/corruption | recoverable error screen | no | Sentry event |
| SW register fail | unsupported/broken | app works online-only; push skipped | no | Sentry |
| push subscribe fail | denied/unsupported | persistent enable prompt; app unaffected | silent resync | — |
| photo PUT/confirm fail | R2 error | slot empty + retry; orphan key server-side | user retry | Sentry |
| malformed DTO | zod parse fail | section error boundary + Sentry; never crash | no | Sentry event |

Idempotency: outcome re-mark = new POST (LWW); queue order preserved; `POST /v1/push-subscriptions` dedup by endpoint; `POST /v1/auth/refresh` single-flight; reads freely retryable. TanStack Query retry: mutations 0 (explicit user retry), queries 2 exponential except `['feed']`/`['vapid']` (1/0). Degraded UX per §6.4 six-state offline column.

## 15. Test strategy

Harness: Vitest + RTL + jsdom (component), `@kiro-ai-bit/test-utils` setup; Playwright e2e golden-path vs local compose (`medo-infra compose.e2e.yml`); MSW or route-mock for API stubs at contract boundary (never mock internals). `tests/unit`, `tests/component` beside modules, `tests/e2e` flows.

| Module/unit | Scope | Cases (invariant → cases) | Fixtures |
|---|---|---|---|
| `apiFetch`+interceptor | unit | INV-FE-2/5/6 → 401 single-refresh-retry, refresh-fail purge, degraded engage/clear, error normalize | mock fetch |
| six API clients | contract | every §6.1 row → request shape + zod parse + error map; 53-route audit | contract fixtures from `@kiro-ai-bit/contracts` |
| `queryKeys`/`useTodayFanout` | unit | parallel fan-out (no chained), per-section independence, 15-min visible-only interval | QueryClient wrapper |
| `connectivityStore` | unit | dual-signal engage, proof-clear only | fake timers |
| `medoDb` schema | unit | INV-FE-1/4 → only 4 stores+meta; migration preserves queue | fake-indexeddb |
| `offline-queue` | unit+integration | INV-FE-3 → FIFO order, head-of-line block, backoff, cap eviction (LD-FE-09), LWW refetch | fake-indexeddb + mock api |
| `syncDoseSlice`/caches | unit | populate-on-read, window eviction, patient purge | fixtures |
| `notificationScheduler`/`reminderRhythm` | unit | rhythm instants per role, suppression on outcome/missed | fake clock + Dexie |
| `pushLifecycle`/`installGate` | unit | subscribe-once dedup, DELETE on logout, resync-on-prune, iOS gate | mock PushManager |
| `sw-*` handlers | unit | push→notification, click→deep-link map, action→write path | mock SW env |
| screens (13) | component | six-state per §6.4; validation per §6.5; guards; switcher; wizard | RTL + fixtures |
| `themeEngine`/`ReducedMotionGate` | component | 3 theme states, reduced-motion | — |
| e2e golden paths (~6) | e2e | UF-FE-01 signup→verify→Today; UF-FE-02 login→logout purge; UF-FE-06/07 dose mark online+offline replay; UF-FE-05 invite accept; UF-FE-10 push lifecycle (emulated); UF-FE-08 add medicine | compose stack + seeded services |

Invariant coverage: INV-FE-1…7 each ≥1 case above; every §6.1 route → contract test row; failure rows §14 → failure cases. Test doubles: peer services stubbed at HTTP boundary (MSW/Playwright route mock); Dexie real (fake-indexeddb); Push/Notification APIs mocked; time via injected `now`.

## 16. Design decisions register

| ID | Title | Status | Context → Decision (options rejected) |
|---|---|---|---|
| LD-FE-01 | Repo/module conventions | accepted | `medo-frontend` repo; `Medo.Frontend.*` namespaces; aliases `@app/* @features/* @lib/*`; env fail-fast `lib/config/env.ts`. (inherited layout ticket 02; alias rule new) |
| LD-FE-02 | Auth session module shape | accepted | `AuthProvider` boot = refresh→`/v1/me`→hydrate; `SessionGuard` 3 route classes at router level. (HD-FE-03/09 binding) |
| LD-FE-03 | HTTP core + interceptor | accepted | single `apiFetch` + `AuthInterceptor` single-flight one-retry; `ApiError` envelope consumer. (HD-FE-03) |
| LD-FE-04 | Purge routine | accepted | `purgeClientState(reason)` single routine: Dexie delete + query clear + store reset + login route; used by logout/expired/deleted. (HD-FE-03) |
| LD-FE-05 | Patient-context store | accepted | session-scoped Zustand `{role, patientId, source}`; links via TanStack only; link-end via 403-diff detection + per-patient Dexie purge. (HD-FE-04) |
| LD-FE-06 | Connectivity module | accepted | `connectivityStore` binary flag; engage offline-event|apiFetch-fail; clear on apiFetch success only; HTTP errors with valid JSON do NOT engage. (HD-FE-06 refinement) |
| LD-FE-07 | Query-key factory + refetch policy | accepted | `queryKeys.*` factory; staleTime 60s (vapid=session); 15-min `refetchInterval` visible-only on today doses; targeted post-mutation invalidation map. |
| LD-FE-08 | Dexie v1 schema + migration | accepted | 5 stores (§5.1) exact fields/indexes; `version(1)`; pre-render open; failure→error screen; window eviction 7d+today; **resolves OQ-FE-02**. |
| LD-FE-09 | Write-queue cap + eviction | accepted | `MAX_QUEUE_ENTRIES=200`, `MAX_QUEUE_AGE_DAYS=7`; oldest-first eviction + `meta.evictedCount` + warning; **resolves OQ-FE-03/OQ-HLD-FE-02**. |
| LD-FE-10 | Queue entry schema + backoff | accepted | entry fields §5.5 (`attempts`,`nextAttemptAt`,`lastError`,`dead` flag); backoff `min(30m,2^a min)` ±20% jitter; permanent=4xx-except-401/429. |
| LD-FE-11 | SW caching detail | accepted | @serwist precache app-shell manifest (build-generated); runtime CacheFirst `photos.simmaps.com` `{maxEntries:500, maxAgeSeconds:30d}`; NetworkOnly `api.simmaps.com/v1/*`; navigation→shell fallback; update=next-navigation (skipWaiting false, clientsClaim true); **resolves OQ-FE-04**. |
| LD-FE-12 | Local-notification engine | accepted | SW-side scheduler §8.6 reading Dexie; recompute on Dexie-change message + activate + connectivity-restore; no periodic-sync in v1;_taken/snooze actions → same write path (API or queue). (HD-FE-07) |
| LD-FE-13 | Push deep-link map | accepted | `notificationclick` → `data.url` (`/today?dose={id}` per LD-NOT-18) else fallback map {dose→`/today`, care→`/care-links`, refill→`/medicines`}; unknown→`/today`; **resolves OQ-LLD-NOT-02 + consumes OQ-HLD-FE-01 resolution**. |
| LD-FE-14 | Screen/route inventory | accepted | 15 routes: `/login /signup /forgot-password /reset-password /verify-email /invite/[token]` public; `/today /medicines /medicines/new /medicines/[id] /schedules/new /schedules/[id] /care-links /notifications /profile /settings/push` gated; guard class per §6.4. |
| LD-FE-15 | Actor attribution + theme tokens | accepted | attribution rule §8.14 (self/link-displayName/generic — no directory call); `themeEngine` CSS-var tokens per themeState; last-known memory-only. (resolves OQ-FE-05 display path) |
| LD-FE-16 | Photo scope | accepted | frontend uses catalog-entry photo routes only (`/v1/medicine-catalog/{id}/photos*`); private-medicine photo routes bound but unused v1 (OQ-FE-08 resolved upstream — catalog-only). |
| LD-FE-17 | Timezone math lib | accepted | `luxon` for schedule-tz window/label math (consistent w/ SCH LLD; MIT; Context7 gate PASS `/moment/luxon` 2026-11-24); display formatting via `Intl`. |
| LD-FE-18 | Permission-prompt timing | accepted | `GET /v1/push/vapid-key`+permission attempt ONLY after first successful Today load AND user gesture ("Enable reminders" CTA on Today + persistent prompt when denied/unavailable); iOS install prompt precedes permission; **resolves OQ-FE-06**. |
| LD-FE-19 | Error envelope consumption | accepted | consume `{error:{code,message,requestId,details?}}` verbatim; `details` field-map for validation; **ratifies OQ-LLD-SYS-01 client-side**. |
| LD-FE-20 | Optimistic marking | accepted | Taken/Snooze online = optimistic pending → API → invalidate; offline/degraded = enqueue + "pending sync" (no optimistic outcome value — queue is truth until replay). |

## 17. Traceability matrix

| Upstream element | LLD element | Verification |
|---|---|---|
| HLD blocks §5 (13) | §3.2 module map 1:1 | module-orphan audit |
| HD-FE-01…09 | §4 units + LD-FE-02/03/05/06/07/11/12/13/15 | design review |
| 53 public routes (§6.1) | §4.3 client fns + §6.1 table | contract tests §15 |
| frontend-map 13 rows | §6.4 screens + §4.7 | component/e2e |
| Dexie 4 families + queue | §5 schema + §4.5 | unit tests |
| Write-queue FIFO/LWW | §8.3 + LD-FE-09/10 | unit/e2e offline |
| Refresh triggers ×4 | §8.4 + `refreshTriggers` | unit/e2e |
| Connectivity FSM | §8.1 + `connectivityStore` | unit |
| Push lifecycle | §8.7 + §4.6 + LD-FE-13/18 | unit/e2e |
| Local notifications | §8.6 + `notificationScheduler` | unit (fake clock) |
| Six-state per screen | §6.4 + `<SixState>` | component audit |
| PRD FR groups 5.1–5.9 | §4/§6/§8 bindings | §15 coverage |
| NFR-FE-01…08 | §13 perf budgets cited; §14 security; §15 a11y tests | audits |
| Zero jobs | §10 explicit none | review |
| OQ-FE-02/03/04/06, OQ-HLD-FE-02 | LD-FE-08/09/11/18 | resolved |
| OQ-HLD-CARE-01/OQ-LLD-CARE-02 | §8.10 route `/invite/[token]` | e2e invite flow |
| OQ-LLD-NOT-02 | §8.11 `?dose=` param | e2e push-tap |
| OQ-LLD-SYS-01 | LD-FE-19 | contract tests |

## 18. Glossary, assumptions, risks and open questions

### 18.1 Glossary deltas

Uses `GLOSSARY.md@2026-11-21` terms verbatim (Patient, Caregiver, Care Link, Medicine, Medicine Catalog, Schedule, Dose, Doses Remaining, Refill alert, Reminder, Harmony Points, Theme state, Notification preferences, Email fallback). Frontend terms per PRD §14 (Write-queue, Offline-critical slice, Patient context, Degraded mode, Gap-fill). No new terms; no Avoid-list violations.

### 18.2 Assumptions

- Browser support matrix (IndexedDB/SW/Push/Notification) — owner: implementer; trigger: browser-support audit; unsupported → degraded messaging (HLD §12.6).
- `@kiro-ai-bit/contracts` exports zod schemas for all 53 routes at implementation time — owner: contracts package authoring inside tickets 06–12; trigger: first import.
- `data.url` payload field present on Notification push payloads per LD-NOT-18 — owner: Notification LLD (approved); fallback map covers absence.
- iOS PWA install reliance — platform constraint (PRD §13).

### 18.3 Risks

- Dexie quota on long-offline devices — mitigation: bounded queue (LD-FE-09) + small locked scope + error screen; accepted residual.
- SW update mid-session — mitigation: next-navigation apply; in-flight writes safe in Dexie.
- Push permission denial (esp. iOS pre-install) — mitigation: install gate + persistent prompt + server email fallback; UX risk not data risk.
- Access-JWT memory-only reload cost — mitigation: silent boot refresh; accepted.
- Captive-portal false-online — mitigation: dual-signal (LD-FE-06); residual brief flicker.
- Two-tab divergence — mitigation: 15-min refetch + LWW; accepted at envelope.
- No backups v1 — client cache loss = refetch, not data loss.

### 18.4 Open questions

- OQ-LLD-SYS-01: error-envelope `details` ratification — **resolved-by: LD-FE-19** (client consumes `details?` when present; envelope adopted verbatim). Formal upstream ratification remains a doc-hygiene note, `blocks-tasks: no`.
- OQ-LLD-SYS-02: HLD Notification §7.2 missing medicine-read row — doc hygiene only, non-blocking, owner: doc maintainer; `blocks-tasks: no`.
- All other carried OQs resolved-by LD records (§16) — zero `blocks-tasks` open.

### 18.5 TBD register

None — no `TBD-lld:*` items.

## Appendix A. Task-readiness checklist result (§7, signed)

- Result: **pass** (self-check 24-11-26; `D:\Temp\venvs\Scripts\python.exe shared/scripts/validate_lld.py` run at draft time)
- Checker: Devin
- Notes: §7.10 frontend gate verified — every frontend-map row → screen module + client fns + query keys (§6.1/§6.4); Dexie schema = exactly cached-entity set (§5); write-queue FIFO/replay/conflict specified (§8.3, LWW §9); four refresh triggers mapped (§8.4); push lifecycle + SW strategy complete (§8.6/8.7, LD-FE-11/13); six-state contract per screen (§6.4); zero backend-internal detail (DTO types only via contracts pkg). Zero `blocks-tasks`; all LD-FE-* pending user approval flip to `accepted`.

## Appendix B. Revision history

None — initial version.
