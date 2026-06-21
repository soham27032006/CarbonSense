# Contributing to CarbonSense

## Local Setup

See [README.md](README.md#local-setup) for environment setup, dependency installation, and first-run instructions.

## Running the Project

```bash
npm run dev          # starts both API (3001) and web (5173)
npm run dev:api      # API only
npm run dev:web      # web only
```

## Tests & Coverage

```bash
cd carbonsense-api
npm test              # vitest run — 10 files, 36 tests
npm run test:coverage # vitest run --coverage — text + HTML report
```

Tests mock Supabase, Redis, Plaid, and the Gemini client via `tests/setup.ts` and `tests/helpers/`.

## Build

```bash
npm run build --prefix carbonsense-api   # tsc — type-checks and emits dist/
npm run build --prefix carbonsense-web   # vite build — production bundle
```

Both builds must pass before any commit. CI enforces this on every push to `main`.

## Code Style (Master Roadmap)

| Rule | Limit |
|---|---|
| Route / middleware handlers | under 25 lines |
| Service functions | under 30 lines |
| Utility helpers | under 20 lines |
| Magic numbers | never — use `UPPER_SNAKE_CASE` named constants |
| Module-level JSDoc | required on every source file |
| Exported function JSDoc | required with `@returns` and `@throws` |

Commits follow [Conventional Commits](https://www.conventionalcommits.org/): `feat(api):`, `fix(web):`, `refactor(api):`, etc.

## Protected Files

Do not edit — auto-generated or externally managed:

- `carbonsense-web/src/routeTree.gen.ts`
- `carbonsense-web/src/integrations/auth-middleware.ts`
- `carbonsense-web/src/integrations/auth-attacher.ts`
- `carbonsense-web/src/integrations/supabase/client.ts`
- `carbonsense-web/src/integrations/supabase/client.server.ts`
- `carbonsense-web/src/types.ts`
