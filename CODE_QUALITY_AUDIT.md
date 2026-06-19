# CODE QUALITY AUDIT

## Initial violations report

Scope audited:
- `carbonsense-api/src/controllers/*.controller.ts`
- `carbonsense-api/src/services/*.service.ts`
- `carbonsense-api/src/routes/*.ts`
- `carbonsense-web/src/routes/*.tsx`
- `carbonsense-web/src/lib/api.ts`
- `carbonsense-web/src/hooks/useApi.ts`

Protected files were not edited: `routeTree.gen.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `client.ts`, `client.server.ts`, `types.ts`.

### Findings before fixes

1. Missing module-level JSDoc was found in every scoped API controller, API service, API route file, frontend route file, `carbonsense-web/src/lib/api.ts`, and `carbonsense-web/src/hooks/useApi.ts`.
2. Missing exported-function JSDoc was found across API controllers and services, plus all exported hooks in `carbonsense-web/src/hooks/useApi.ts`.
3. Oversized Express controller handlers were found in `auth.controller.ts`, `challenges.controller.ts`, `copilot.controller.ts`, `onboarding.controller.ts`, and `plaid.controller.ts`.
4. Oversized service functions were found in `carbon.service.ts`, `challenge.service.ts`, `copilot.service.ts`, `gamification.service.ts`, `impact.service.ts`, `plaid.service.ts`, `profile.service.ts`, `streak.service.ts`, and `team.service.ts`.
5. Large React route components were found in frontend route files. These are view components rather than Express route handlers; they are tracked separately because splitting all screen components would create high-risk churn for no runtime/API benefit during this audit.
6. No `TODO` or `FIXME` markers were found in the scoped files.
7. Import-order issues were not flagged as runtime risks in the initial scan, but touched files were normalized where edits occurred.

### Planned remediation

- Add module JSDoc to every scoped file.
- Add JSDoc to every exported function in scoped API files and `useApi.ts`.
- Extract repeated or semantic numeric limits into named constants where touched.
- Split oversized API controller/service functions where it can be done without changing request/response contracts.
- Preserve runtime behavior and API payload shapes.

## Changes applied

Pending.

## Verification

Pending.
