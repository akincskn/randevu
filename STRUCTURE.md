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
│   │       │   └── [id]/
│   │       │       ├── confirm/route.ts  # PATCH -> CONFIRMED, returns wa.me link
│   │       │       └── cancel/route.ts
│   │       ├── push/
│   │       │   └── subscribe/route.ts    # Store VAPID push subscription
│   │       └── cron/
│   │           └── expire-appointments/route.ts  # Business-hours-aware expiry sweep
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── redis.ts
│   │   ├── validation/                   # Zod schemas
│   │   ├── dto/                          # DTO mappers (Prisma model -> API response)
│   │   └── push.ts                       # Web Push helper (VAPID)
│   └── components/
│       ├── public/
│       └── dashboard/
└── package.json
```

## Notes

- `api/cron/expire-appointments` is called on a schedule (Vercel Cron or Upstash QStash, both free-tier
  viable). It must NOT use a fixed wall-clock timeout — it reads each business's working hours and
  exceptions to decide which `PENDING` appointments are past their business-hours-aware deadline.
- No route may query Prisma directly from a page component for public-facing pages — always go through
  `api/` + DTO layer, per `CLAUDE.md` rule 2.