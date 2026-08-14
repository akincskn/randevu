@AGENTS.md
# Project: Berber/Kuaför Randevu Sistemi

This file is the binding contract for every agent and every code change in this repository.
No agent may deviate from these rules without explicit written approval from the user in the conversation.

## 0. Zero-Ambiguity Protocol (read this first)

- If a requirement is not explicitly written in `PROJECT_SPEC.md`, you MUST NOT infer, assume, or
  "fill the gap" with a plausible-sounding behavior. Stop and ask the user a direct, specific question.
- Never present a guess as a fact. Never say "I assume X" and proceed — surface the open question instead
  and wait.
- Never silently change scope (adding a feature not in spec, removing one that is in spec) even if it
  "seems better." Propose it explicitly, get confirmation, then implement.
- If a tool call, build, or test fails, report the exact error output. Do not paraphrase, soften, or
  hide a failure to make progress look better than it is.
- No placeholder code, no `// TODO: implement later`, no mocked data pretending to be real, no
  `any`-typed escape hatches. If something cannot be finished in the current step, say so explicitly
  and stop there — do not ship a stub that looks finished.

## 1. Stack

- Next.js 14+ (App Router), TypeScript strict mode
- Prisma + Neon PostgreSQL
- Upstash Redis (rate limiting, caching)
- Web Push API (VAPID) for notifications — no Firebase, no paid push service
- Deployment: Vercel (free tier)
- No AI/LLM integration in v1 — this is explicitly out of scope, do not add AI features "for later" hooks

## 2. Non-negotiable engineering rules

- Defensive programming everywhere: null checks, timeouts on all external calls, explicit error handling.
  No `try {} catch {}` blocks that swallow errors silently — always log and handle.
- Every API route: input validated with Zod, wrapped in try/catch, rate-limited via Upstash where the
  route is public (unauthenticated).
- DTO pattern between database models and API responses — never leak raw Prisma models to the client.
- SOLID / DRY / KISS. If a function is doing two things, split it.
- TypeScript strict mode, no `any`. If a type is genuinely unknown, use `unknown` and narrow it.
- 200-line max per file. If a file grows past this, split it before continuing.
- Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`) on every commit.
- Build and test after every feature is implemented — never batch multiple unverified features together.
- Every unguessable public identifier (appointment detail/cancel links) uses a cryptographically random
  token, never a sequential/incrementing ID.
- Every write to a uniqueness-sensitive resource (e.g., booking a slot) goes through a database-level
  constraint, not just an application-level check. Race conditions are solved in the database, not the UI.

## 3. Repository conventions

- See `STRUCTURE.md` for the required folder layout. Do not deviate from it without approval.
- See `schema.prisma` for the current source-of-truth data model. Schema changes require a migration
  file and an explanation of why the change is necessary, tied to a spec requirement.
- See `PROJECT_SPEC.md` for full product scope — v1 in-scope, v1 explicitly out-of-scope, and v2 deferred
  items. Do not implement anything listed under "v2 / Deferred."

## 4. Agent roles

This project uses a Claude Code Agent Team. Roles and their exact operating rules are defined in
`.claude/agents/`:

- `team-lead.md` — orchestrates, decomposes work, never writes code, never makes product decisions
- `fullstack-developer.md` — implements features against spec only
- `qa-tester.md` — tests against spec acceptance criteria only, factual pass/fail reporting
- `architecture-analyst.md` — read-only codebase analysis and architecture reporting, no opinions

"200-line limit applies to hand-authored application code under src/. It does not apply to prisma/schema.prisma or generated migration SQL."

Every agent must re-read this file and `PROJECT_SPEC.md` at the start of its work, not rely on memory
of a previous session.