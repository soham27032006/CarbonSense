# CarbonSense API

CarbonSense is a Node.js, Express, and TypeScript backend for a carbon footprint tracking app. It uses Supabase for PostgreSQL and Auth, Plaid for bank transactions, Google Gemini for carbon insights and Copilot chat, Redis for rate limits and leaderboards, and Stripe-ready environment configuration for subscriptions.

## Setup

```bash
npm install
cp .env.example .env
npm run build
npm run dev
```

Fill `.env` with real credentials before starting the API.

## Database

Run the Supabase migration:

```bash
supabase db push
```

Seed challenge and achievement data:

```bash
psql "$DATABASE_URL" -f seed/challenges.sql
psql "$DATABASE_URL" -f seed/achievements.sql
```

## Scripts

```bash
npm run dev      # start development server with nodemon
npm run build    # compile TypeScript to dist
npm start        # run compiled server
```

## Environment Variables

| Variable | Description |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `PLAID_CLIENT_ID` | Plaid client ID |
| `PLAID_SECRET` | Plaid secret |
| `PLAID_ENV` | Plaid environment: `sandbox`, `development`, or `production` |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `REDIS_URL` | Redis or Upstash Redis URL |
| `PORT` | API port, default `3001` |
| `NODE_ENV` | `development`, `test`, or `production` |
| `JWT_SECRET` | App secret used for local encryption key derivation |
| `ADMIN_JOB_SECRET` | Secret for manual daily job endpoint |

## API Reference

All endpoints return JSON. Protected endpoints require `Authorization: Bearer <access_token>`.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | No | Health check |
| GET | `/api/admin/run-daily-jobs` | Admin secret | Run streak and summary jobs |
| POST | `/api/auth/signup` | No | Create Supabase Auth user and profile |
| POST | `/api/auth/login` | No | Login and return Supabase session tokens |
| POST | `/api/auth/logout` | Yes | Revoke current session |
| GET | `/api/auth/me` | Yes | Current user and profile |
| POST | `/api/onboarding/quiz` | Yes | Save quiz and estimate carbon footprint |
| POST | `/api/onboarding/complete` | Yes | Mark onboarding done and assign first challenge |
| POST | `/api/plaid/create-link-token` | Yes | Create Plaid Link token |
| POST | `/api/plaid/exchange-token` | Yes | Exchange public token and sync initial transactions |
| POST | `/api/plaid/sync-transactions` | Yes | Sync transactions for a connection |
| DELETE | `/api/plaid/disconnect/:connectionId` | Yes | Remove Plaid Item and disconnect account |
| POST | `/api/plaid/webhook` | No | Plaid transaction webhook |
| GET | `/api/carbon/dashboard` | Yes | Main carbon dashboard |
| GET | `/api/carbon/transactions` | Yes | Paginated carbon transactions |
| GET | `/api/carbon/trends` | Yes | Weekly or monthly chart data |
| GET | `/api/carbon/category/:category` | Yes | Category drilldown |
| GET | `/api/carbon/compare` | Yes | User vs average comparison |
| GET | `/api/challenges/today` | Yes | Personalized daily challenge |
| POST | `/api/challenges/:id/accept` | Yes | Accept assigned challenge |
| POST | `/api/challenges/:id/complete` | Yes | Complete challenge and award XP |
| POST | `/api/challenges/:id/skip` | Yes | Skip and get alternative |
| GET | `/api/challenges/history` | Yes | Challenge history |
| GET | `/api/streaks` | Yes | Current streak info |
| POST | `/api/streaks/freeze` | Yes | Use streak freeze |
| GET | `/api/achievements` | Yes | Achievements with earned status |
| GET | `/api/level` | Yes | Level, XP, and gamification progress |
| POST | `/api/teams/create` | Yes | Create team |
| POST | `/api/teams/join/:inviteCode` | Yes | Join team by invite code |
| GET | `/api/teams/my-teams` | Yes | Teams for current user |
| GET | `/api/teams/:id` | Yes | Team detail and stats |
| GET | `/api/teams/:id/leaderboard` | Yes | Cached team leaderboard |
| POST | `/api/copilot/chat` | Yes | AI Copilot chat, stricter rate limit |
| GET | `/api/copilot/suggestions` | Yes | Suggested Copilot prompts |
| GET | `/api/copilot/history` | Yes | Copilot conversation history |
| GET | `/api/impact/total` | Yes | Lifetime impact totals |
| GET | `/api/impact/equivalencies` | Yes | Carbon saved equivalents |
| GET | `/api/impact/share-card` | Yes | Share card data |
| GET | `/api/profile` | Yes | Full profile |
| PATCH | `/api/profile` | Yes | Update profile fields |
| GET | `/api/profile/carbon-age` | Yes | Carbon Age detail |
| DELETE | `/api/profile` | Yes | GDPR account deletion |

## Admin Job Trigger

```bash
curl -H "x-admin-secret: $ADMIN_JOB_SECRET" \
  http://localhost:3001/api/admin/run-daily-jobs
```

The job checks streaks, refreshes weekly freeze eligibility, and generates yesterday's carbon summaries.
