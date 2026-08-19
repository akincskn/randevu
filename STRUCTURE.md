# Repository Structure

This is the required layout. Agents must not invent alternative structures.

```
/
├── CLAUDE.md
├── PROJECT_SPEC.md
├── STRUCTURE.md
├── .claude/
│   └── agents/
│       ├── team-lead.md
│       ├── fullstack-developer.md
│       ├── qa-tester.md
│       └── architecture-analyst.md
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   │   └── [businessSlug]/
│   │   │       ├── page.tsx              # Public booking page
│   │   │       └── appointment/[token]/
│   │   │           └── page.tsx          # Customer appointment detail view
│   │   ├── (dashboard)/
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── dashboard/
│   │   │       ├── layout.tsx            # Shell: always-visible pending badge (spec 58)
│   │   │       ├── page.tsx              # Today's appointments
│   │   │       ├── appointments/page.tsx
│   │   │       ├── services/page.tsx
│   │   │       └── hours/page.tsx        # Weekly hours + exceptions
│   │   └── api/
│   │       ├── appointments/
│   │       │   ├── route.ts              # POST create (public, rate-limited)
│   │       │   ├── list/route.ts         # GET barber's list + pendingCount (session)
│   │       │   ├── manual/route.ts       # POST barber-entered appointment -> CONFIRMED (session)
│   │       │   ├── token/[token]/route.ts # GET customer detail by publicToken
│   │       │   └── [id]/
│   │       │       ├── confirm/route.ts  # PATCH -> CONFIRMED, returns wa.me link
│   │       │       └── cancel/route.ts
│   │       ├── auth/
│   │       │   ├── register/route.ts
│   │       │   ├── login/route.ts
│   │       │   └── session/route.ts      # GET current business, DELETE = logout
│   │       ├── businesses/
│   │       │   └── [slug]/route.ts       # GET public business + service list
│   │       ├── availability/route.ts     # GET open slots (businessId, serviceId, date)
│   │       ├── services/
│   │       │   ├── route.ts              # GET list (incl. inactive), POST create
│   │       │   └── [id]/route.ts         # PATCH update, DELETE (409 if in use)
│   │       ├── working-hours/
│   │       │   ├── route.ts              # GET week, PUT replace whole week
│   │       │   └── exceptions/
│   │       │       ├── route.ts          # GET upcoming, POST upsert by date
│   │       │       └── [id]/route.ts     # DELETE
│   │       ├── push/
│   │       │   └── subscribe/route.ts    # Store VAPID push subscription
│   │       └── cron/
│   │           └── expire-appointments/route.ts  # Business-hours-aware expiry sweep
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── appointment-links.ts          # Customer detail URL (shared: confirm + manual)
│   │   ├── redis.ts                      # Upstash client + shared atomic counter
│   │   ├── rate-limit.ts                 # Per-phone daily booking quota (spec line 64)
│   │   ├── read-limit.ts                 # Per-IP limit for public GET routes
│   │   ├── timezone.ts                   # Absolute instant <-> business local wall time
│   │   ├── availability.ts               # Working-hours rules
│   │   ├── slots.ts                      # Open-slot generator (pure)
│   │   ├── schemas.ts                    # Zod schemas (public)
│   │   ├── schemas-dashboard.ts          # Zod schemas (barber panel)
│   │   ├── dto.ts                        # DTO mappers (public)
│   │   ├── dto-dashboard.ts              # DTO mappers (barber panel)
│   │   ├── public-api.ts                 # Typed fetch client used by public pages
│   │   ├── dashboard-api.ts              # Typed fetch client used by the panel
│   │   ├── format.ts                     # tr-TR date/time/price formatting
│   │   ├── minute-time.ts                # minutes-from-midnight <-> "HH:MM"
│   │   ├── push.ts                       # Web Push transport (VAPID) + dead-subscription cleanup
│   │   ├── push-notifications.ts         # Notification CONTENT (new request, daily digest)
│   │   ├── expiry.ts                     # PURE: business-hours-aware timeout maths (spec 51-54)
│   │   ├── expiry-sweep.ts               # Sweep orchestration: read -> expire -> daily digest
│   │   ├── digest-lock.ts                # Redis NX once-per-local-day guard for the digest
│   │   └── cron-auth.ts                  # Bearer CRON_SECRET check (timing-safe)
│   └── components/
│       ├── public/                       # DatePicker/SlotPicker/useAvailability also reused by the panel
│       └── dashboard/
├── public/
│   └── sw.js                             # Service worker: push + notificationclick
└── package.json
```

## Notes

- The three public `GET` routes (`businesses/[slug]`, `availability`, `appointments/token/[token]`)
  were added in Phase 3 with user approval (2026-08-15). They exist because the rule below forbids
  page components from touching Prisma: without them the public pages would have no data source.
  `availability` takes `businessId` (not the slug) by explicit user instruction.
- `lib/` is flat (`schemas.ts`, `dto.ts`) rather than the originally sketched `validation/` and `dto/`
  directories — the files are small enough that a directory per concern added nothing. Where a file
  approached the 200-line limit it was split by AUDIENCE (`*-dashboard.ts`), not by arbitrary size:
  the public and barber layers have genuinely different contracts (e.g. `isActive` and internal `id`
  are hidden from the public DTO but required by the panel).
- `api/appointments/list` sits under a static `list` segment rather than being a `GET` on
  `api/appointments`, because that file already carries the PUBLIC `POST` (spec line 22). Keeping an
  unauthenticated and a session-protected contract in one file invites mixing them up.

- `api/cron/expire-appointments` is called on a schedule. **Phase 6 settled this: Upstash QStash every
  15 minutes**, not Vercel Cron — the free Vercel plan allows only one trigger per day, which cannot
  carry "1-2 hours after opening" nor a digest that must hit each business at ITS own opening time.
  It must NOT use a fixed wall-clock timeout — it reads each business's working hours and exceptions
  to decide which `PENDING` appointments are past their business-hours-aware deadline. `POST` only
  (QStash posts; a `GET` would let a stray browser visit mutate appointment status), guarded by
  `Authorization: Bearer $CRON_SECRET`.
- The timeout logic is split three ways for the same reason `slots.ts` is pure: `expiry.ts` holds the
  MATHS and touches no database, `expiry-sweep.ts` does the reads/writes and drives the digest, and
  the route only authenticates. `digest-lock.ts` is separate because its failure mode is deliberately
  different from the rest — it fails OPEN (see PROJECT_SPEC.md, 2026-08-16).
- Push is split in two (Phase 5): `push.ts` only knows how to DELIVER a payload to one business's
  subscriptions and how to drop dead ones (HTTP 404/410); `push-notifications.ts` only knows what the
  two spec-mandated messages SAY (spec lines 55-57). The daily digest function lives there ready to be
  called — its SCHEDULER is Phase 6's job and no timer exists in Phase 5.
- `public/sw.js` is hand-authored browser JavaScript, not part of the Next.js bundle. It must be served
  from the root so its service-worker scope covers the whole site.
- No route may query Prisma directly from a page component for public-facing pages — always go through
  `api/` + DTO layer, per `CLAUDE.md` rule 2.
- `api/appointments/manual` is a separate route rather than a flag on the public `POST /api/appointments`.
  The two differ in four ways at once (session vs Turnstile, no rate limit, `CONFIRMED` vs `PENDING`,
  and a deliberate working-hours bypass); branching one handler on a caller-supplied flag would have put
  the bypass one boolean away from the public path. Added 2026-08-19 with the scope addition recorded in
  PROJECT_SPEC.md "Randevu akışı" item 5.
- `manual-appointment-form.tsx` is split from `manual-appointment-fields.tsx`, `use-active-services.ts`,
  and (for the shell) `pending-badge.tsx` purely to stay under the 200-line limit in CLAUDE.md §2; each
  split is by responsibility — the fields file holds no request or state logic, the hook holds no markup.
- The dashboard manual-booking form imports `DatePicker`, `SlotPicker`, and `useAvailability` from
  `components/public/` rather than copying them. `form-ui.tsx` and `public/ui.tsx` stay separate because
  they are different design surfaces, but these three are not styling — they are the SAME availability
  data. A second implementation would drift and let the barber pick a slot customers cannot see
  (user decision, 2026-08-20).

