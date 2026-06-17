# CarbonSense

CarbonSense is a unified carbon footprint tracking app with:

- `carbonsense-api` - Express, TypeScript, Supabase, Google Gemini, Plaid, Redis, Stripe.
- `carbonsense-web` - React, TypeScript, Vite, TanStack Start, Supabase Auth.

## Local Setup

```bash
cd "D:\CARBON FOOTPRINT"
npm run install:all
npm run dev
```

The backend runs on `http://localhost:3001`.
The frontend runs on `http://localhost:5173`.

For local development, `carbonsense-web/.env` should leave `VITE_API_URL` empty so Vite proxies `/api/*` to the backend.

## Environment Variables

Backend: copy `carbonsense-api/.env.example` to `carbonsense-api/.env`.

Required backend variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `REDIS_URL`
- `PORT`
- `NODE_ENV`
- `FRONTEND_URL`
- `JWT_SECRET`
- `ADMIN_JOB_SECRET`

Frontend: copy `carbonsense-web/.env.example` to `carbonsense-web/.env`.

Required frontend variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL`

Use the same Supabase project for both apps:

- backend `SUPABASE_URL` must match frontend `VITE_SUPABASE_URL`
- backend `SUPABASE_ANON_KEY` must match frontend `VITE_SUPABASE_ANON_KEY`

## Database Setup

Run the Supabase migration and seed files from:

- `carbonsense-api/supabase/migrations`
- `carbonsense-api/seed`

## Deploy Backend To Railway

1. Create a Railway project from `carbonsense-api`.
2. Set all backend environment variables in Railway.
3. Set `FRONTEND_URL` to the deployed Vercel frontend URL.
4. Railway uses `carbonsense-api/railway.json` and `carbonsense-api/Procfile`.

The backend start command is:

```bash
npm run build && npm start
```

## Deploy Frontend To Vercel

1. Create a Vercel project from `carbonsense-web`.
2. Set frontend environment variables in Vercel.
3. In production, set `VITE_API_URL` to the Railway backend URL, for example:

```env
VITE_API_URL=https://your-railway-backend.up.railway.app
```

4. Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` pointed at the same Supabase project as the backend.

## Local Testing Checklist

```bash
cd "D:\CARBON FOOTPRINT"
npm run install:all
npm run dev
```

Then open `http://localhost:5173` and verify:

- Sign up
- Onboarding quiz
- Home dashboard
- Daily challenge accept and complete
- Streak/XP updates
- AI Copilot chat
