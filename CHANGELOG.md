# Changelog

All notable changes to CarbonSense are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) — runs API build + tests and web build on every push and pull request to `main`, pinned to Node 20.
- Test coverage reporting for `carbonsense-api` via `@vitest/coverage-v8`; `npm run test:coverage` script and `text`/`html` reporters.
- `CONTRIBUTING.md` — local setup, test, build, and code-style expectations.
- `CHANGELOG.md` — this file.

### Changed
- README Testing row updated with real test count (10 files / 36 tests) and real coverage percentage.

## [1.0.0] — 2026-06-20

Initial hackathon submission. Summarized from `CODE_QUALITY_AUDIT.md`, `EFFICIENCY_AUDIT.md`, and `SECURITY_ACCESSIBILITY_AUDIT.md`.

### Added
- Full JSDoc coverage across all scoped controllers, services, route modules, `lib/api.ts`, and `hooks/useApi.ts` — both module-level docstrings and per-export function documentation.
- Centralized named-constant timeouts in `carbonsense-api/src/config/timeouts.ts` (`AI_REQUEST_TIMEOUT_MS`, `PLAID_REQUEST_TIMEOUT_MS`, `SUPABASE_REQUEST_TIMEOUT_MS`) wired into the Gemini, Plaid, and Supabase clients.
- AES-256-GCM encryption for Plaid access tokens at rest.
- Redis-cached team leaderboard (1h TTL, invalidated on join/leave/carbon update).
- Server-side pagination on `/api/carbon/transactions` (LIMIT 15, `has_more` cursor).

### Changed
- 37 oversized service functions decomposed into thin orchestrator + `*Workflow` helper pairs; every service function now under the 30-line limit.
- Oversized Express controller handlers in `auth`, `challenges`, `copilot`, `onboarding`, and `plaid` split into named helpers; every handler now under the 25-line limit.
- Supabase clients wrapped with `fetchWithTimeout` (15s hard cap via `AbortController`) replacing the default unbounded `fetch`.
- Copilot chat refactored to a single structured Gemini call returning `{ response, suggestions }` with a per-turn history cap.

### Fixed
- Helmet CSP hardened: `frameAncestors: 'none'`, `objectSrc: 'none'`, `defaultSrc: 'self'`; production CORS allowlist fails closed (no wildcard).
- Global error handler no longer echoes stack traces or internal details to the client; all errors normalized to the `{ success: false, error: { code, message } }` envelope.
- Accessibility: skip-to-main-content link, semantic landmarks, focus-trap hook for modals/drawer, `aria-live` on AI responses and loaders, `aria-invalid`/`aria-describedby` on form errors, global `:focus-visible` ring fallback.

### Security
- `.gitignore` expanded to exclude `.env*` and per-user local config; verified no secrets are tracked in the repository.

[Unreleased]: https://github.com/soham27032006/CarbonSense/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/soham27032006/CarbonSense/releases/tag/v1.0.0
