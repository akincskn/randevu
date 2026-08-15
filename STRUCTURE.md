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
│   │   │       ├── page.tsx              # Pending badge, today's appointments
│   │   │       ├── appointments/page.tsx
│   │   │       ├── services/page.tsx
│   │   │       └── hours/page.tsx        # Weekly hours + exceptions
│   │   └── api/
│   │       ├── appointments/
│   │       │   ├── route.ts              # POST create (public, rate-limited)
│   │       │   ├── token/[token]/route.ts # GET customer detail by publicToken
│   │       │   └── [id]/
│   │       │       ├── confirm/route.ts  # PATCH -> CONFIRMED, returns wa.me link
│   │       │       └── cancel/route.ts
│   │       ├── businesses/
│   │       │   └── [slug]/route.ts       # GET public business + service list
│   │       ├── availability/route.ts     # GET open slots (businessId, serviceId, date)
│   │       ├── push/
│   │       │   └── subscribe/route.ts    # Store VAPID push subscription
│   │       └── cron/
│   │           └── expire-appointments/route.ts  # Business-hours-aware expiry sweep
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── redis.ts                      # Upstash client + shared atomic counter
│   │   ├── rate-limit.ts                 # Per-phone daily booking quota (spec line 45)
│   │   ├── read-limit.ts                 # Per-IP limit for public GET routes
│   │   ├── timezone.ts                   # Absolute instant <-> business local wall time
│   │   ├── availability.ts               # Working-hours rules
│   │   ├── slots.ts                      # Open-slot generator (pure)
│   │   ├── schemas.ts                    # Zod schemas
│   │   ├── dto.ts                        # DTO mappers (Prisma model -> API response)
│   │   ├── public-api.ts                 # Typed fetch client used by public pages
│   │   ├── format.ts                     # tr-TR date/time/price formatting
│   │   └── push.ts                       # Web Push helper (VAPID)
│   └── components/
│       ├── public/
│       └── dashboard/
└── package.json
```

## Notes

- The three public `GET` routes (`businesses/[slug]`, `availability`, `appointments/token/[token]`)
  were added in Phase 3 with user approval (2026-08-15). They exist because the rule below forbids
  page components from touching Prisma: without them the public pages would have no data source.
  `availability` takes `businessId` (not the slug) by explicit user instruction.
- `lib/` is flat (`schemas.ts`, `dto.ts`) rather than the originally sketched `validation/` and `dto/`
  directories — the files are small enough that a directory per concern added nothing.

- `api/cron/expire-appointments` is called on a schedule (Vercel Cron or Upstash QStash, both free-tier
  viable). It must NOT use a fixed wall-clock timeout — it reads each business's working hours and
  exceptions to decide which `PENDING` appointments are past their business-hours-aware deadline.
- No route may query Prisma directly from a page component for public-facing pages — always go through
  `api/` + DTO layer, per `CLAUDE.md` rule 2.