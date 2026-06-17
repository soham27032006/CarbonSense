# 🔗 CarbonSense — Codex Integration Prompt (Frontend + Backend)

> **Instructions**: 
> 1. Upload/attach your **frontend zip file** (downloaded from Lovable/GitHub) to Codex
> 2. Make sure Codex has access to the **carbonsense-api** backend folder too
> 3. Paste the prompt below into Codex

---

## 📋 THE INTEGRATION PROMPT — Paste this into Codex

```
I have two separate projects that need to be connected:

1. BACKEND: "carbonsense-api/" folder — Node.js + Express + TypeScript backend (already built)
   - Runs on port 3001
   - Uses Supabase Auth (verifies Bearer tokens via supabase.auth.getUser)
   - All API routes are under /api/*
   - CORS is currently set to app.use(cors()) with no restrictions

2. FRONTEND: The zip file I'm uploading — React + TypeScript + Vite app (built with Lovable)
   - Runs on port 5173 (Vite default)
   - Uses Supabase JS client for auth (signup, login, session management)
   - Needs to call backend API for all data (carbon, challenges, copilot, etc.)

TASK: Wire them together so they work as one unified app. Do the following steps:

---

### STEP 1 — Extract & organize the frontend

- Extract the frontend zip into a folder called "carbonsense-web/" at the same level as "carbonsense-api/"
- The final structure should be:
  ```
  CARBON FOOTPRINT/
  ├── carbonsense-api/    (backend)
  ├── carbonsense-web/    (frontend)
  └── package.json        (root workspace — create this)
  ```

---

### STEP 2 — Configure CORS on the backend

In carbonsense-api/src/app.ts, replace the current `app.use(cors())` with proper CORS config:

```typescript
app.use(cors({
  origin: [
    'http://localhost:5173',           // Vite dev
    'http://localhost:4173',           // Vite preview
    'http://localhost:3000',           // alternate dev
    process.env.FRONTEND_URL || '',    // production frontend URL
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
```

Also add `FRONTEND_URL` to the .env.example:
```
FRONTEND_URL=http://localhost:5173
```

And make FRONTEND_URL optional in env.ts (use .optional() or .default('')).

---

### STEP 3 — Configure the frontend API client

Find the API client/axios config in the frontend (likely in src/api/, src/lib/, src/services/, or src/integrations/). 

Do the following:

A) Create or update "carbonsense-web/src/lib/api.ts":
```typescript
import axios from 'axios';
import { supabase } from './supabase';  // adjust import path to wherever supabase client is

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Automatically attach Supabase auth token to every request
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// Handle 401 responses — redirect to login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await supabase.auth.signOut();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

B) Make sure the Supabase client in the frontend (src/lib/supabase.ts or similar) uses the SAME Supabase project as the backend. Both must share the same SUPABASE_URL and SUPABASE_ANON_KEY.

---

### STEP 4 — Create frontend environment file

Create "carbonsense-web/.env" (and .env.example):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=http://localhost:3001
```

Make sure the frontend's Supabase client reads from these:
```typescript
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

---

### STEP 5 — Update ALL frontend API calls to use the api client

Search through the entire frontend codebase. Find every place that:
- Makes fetch() calls to an API
- Uses axios directly (not through the api client)
- Has hardcoded API URLs (like "http://localhost:3001/api/...")
- Uses Supabase client to query database directly (like supabase.from('table').select()) for data that should come from the backend API instead

Replace them ALL with the api client. Here's the mapping:

AUTH:
- Login/Signup should use Supabase auth directly (supabase.auth.signInWithPassword, supabase.auth.signUp)
- After Supabase auth succeeds, call: api.post('/auth/signup', { email, name }) to create the user record in the backend (only on signup)
- Get current user: api.get('/auth/me')

ONBOARDING:
- Submit quiz: api.post('/onboarding/quiz', quizData)
- Complete onboarding: api.post('/onboarding/complete')

DASHBOARD:
- Get dashboard: api.get('/carbon/dashboard')
- Get transactions: api.get('/carbon/transactions', { params: { page, limit, category } })
- Get trends: api.get('/carbon/trends', { params: { period, range } })
- Get category detail: api.get(`/carbon/category/${category}`)
- Get comparison: api.get('/carbon/compare')

CHALLENGES:
- Today's challenge: api.get('/challenges/today')
- Accept: api.post(`/challenges/${id}/accept`)
- Complete: api.post(`/challenges/${id}/complete`)
- Skip: api.post(`/challenges/${id}/skip`, { reason })
- History: api.get('/challenges/history', { params: { page, limit } })

STREAKS & GAMIFICATION:
- Get streak: api.get('/streaks')
- Use freeze: api.post('/streaks/freeze')
- Get achievements: api.get('/achievements')
- Get level: api.get('/level')

TEAMS:
- My teams: api.get('/teams/my-teams')
- Create team: api.post('/teams/create', { name, type, description })
- Join team: api.post(`/teams/join/${inviteCode}`)
- Team detail: api.get(`/teams/${id}`)
- Leaderboard: api.get(`/teams/${id}/leaderboard`, { params: { period } })

AI COPILOT:
- Chat: api.post('/copilot/chat', { message })
- Suggestions: api.get('/copilot/suggestions')
- History: api.get('/copilot/history')

IMPACT:
- Total impact: api.get('/impact/total')
- Equivalencies: api.get('/impact/equivalencies')
- Share card: api.get('/impact/share-card')

PROFILE:
- Get profile: api.get('/profile')
- Update profile: api.patch('/profile', data)
- Carbon age: api.get('/profile/carbon-age')
- Delete account: api.delete('/profile')

PLAID:
- Create link token: api.post('/plaid/create-link-token')
- Exchange token: api.post('/plaid/exchange-token', { public_token, institution })
- Sync transactions: api.post('/plaid/sync-transactions', { connection_id })
- Disconnect: api.delete(`/plaid/disconnect/${connectionId}`)

IMPORTANT: If the frontend uses Supabase client to directly query tables (like supabase.from('challenges').select('*')), REPLACE those with the proper API calls above. The frontend should NEVER query the database directly — all data flows through the backend API.

---

### STEP 6 — Create React Query hooks for clean data fetching

Create "carbonsense-web/src/hooks/useApi.ts" with reusable React Query hooks:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

// Dashboard
export const useDashboard = () =>
  useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/carbon/dashboard').then(r => r.data) });

// Today's Challenge
export const useTodayChallenge = () =>
  useQuery({ queryKey: ['challenge-today'], queryFn: () => api.get('/challenges/today').then(r => r.data) });

// Accept Challenge
export const useAcceptChallenge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/challenges/${id}/accept`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['challenge-today'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); }
  });
};

// Complete Challenge
export const useCompleteChallenge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/challenges/${id}/complete`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['challenge-today'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['streaks'] }); qc.invalidateQueries({ queryKey: ['impact'] }); }
  });
};

// Streaks
export const useStreaks = () =>
  useQuery({ queryKey: ['streaks'], queryFn: () => api.get('/streaks').then(r => r.data) });

// Impact
export const useImpact = () =>
  useQuery({ queryKey: ['impact'], queryFn: () => api.get('/impact/total').then(r => r.data) });

// Profile
export const useProfile = () =>
  useQuery({ queryKey: ['profile'], queryFn: () => api.get('/profile').then(r => r.data) });

// Copilot Chat
export const useCopilotChat = () =>
  useMutation({ mutationFn: (message: string) => api.post('/copilot/chat', { message }).then(r => r.data) });

// Teams
export const useMyTeams = () =>
  useQuery({ queryKey: ['my-teams'], queryFn: () => api.get('/teams/my-teams').then(r => r.data) });

// Add more hooks following the same pattern for all other endpoints
```

Then update the page components to use these hooks instead of direct API calls.

---

### STEP 7 — Create root workspace for running both together

Create a root "package.json" at CARBON FOOTPRINT/ level:

```json
{
  "name": "carbonsense",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "concurrently \"npm run dev:api\" \"npm run dev:web\"",
    "dev:api": "cd carbonsense-api && npm run dev",
    "dev:web": "cd carbonsense-web && npm run dev",
    "build": "cd carbonsense-web && npm run build",
    "install:all": "cd carbonsense-api && npm install && cd ../carbonsense-web && npm install"
  },
  "devDependencies": {
    "concurrently": "^8.0.0"
  }
}
```

Run: npm install (at root level to get concurrently)

Now "npm run dev" from root starts BOTH backend (port 3001) and frontend (port 5173) simultaneously.

---

### STEP 8 — Add Vite proxy for development (avoid CORS in dev)

In "carbonsense-web/vite.config.ts", add a proxy so frontend dev server forwards /api calls to the backend:

```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  }
});
```

Then update the api client to use relative URLs in development:
```typescript
const API_URL = import.meta.env.VITE_API_URL || '';
// When VITE_API_URL is empty, calls go to /api/* which Vite proxies to localhost:3001
```

Update carbonsense-web/.env for dev:
```
VITE_API_URL=
```
(Empty = use Vite proxy in dev. Set the full URL only for production.)

---

### STEP 9 — Fix any type mismatches

Check that the TypeScript types in the frontend match the backend API responses. Common mismatches:

- Backend returns { success: true, data: {...} } → frontend might expect the data directly
- Backend returns snake_case fields → frontend might expect camelCase
- Backend returns dates as ISO strings → frontend might expect Date objects

If the backend wraps responses in { success, data, error }, create a response extractor:
```typescript
api.interceptors.response.use(
  (response) => {
    // If backend wraps in { success, data }, unwrap it
    if (response.data && typeof response.data === 'object' && 'data' in response.data) {
      response.data = response.data.data;
    }
    return response;
  },
  (error) => Promise.reject(error)
);
```

---

### STEP 10 — Verify end-to-end flow

After all changes, verify these flows work:

1. SIGNUP FLOW:
   - Frontend: supabase.auth.signUp({ email, password })
   - Then: api.post('/auth/signup', { email, name })
   - Then: redirect to /onboarding

2. LOGIN FLOW:
   - Frontend: supabase.auth.signInWithPassword({ email, password })
   - Supabase returns session with access_token
   - All subsequent api calls include Bearer token automatically
   - api.get('/auth/me') returns user data

3. ONBOARDING:
   - api.post('/onboarding/quiz', answers) → returns carbon estimate
   - api.post('/onboarding/complete') → marks user ready
   - Redirect to /home

4. DAILY FLOW:
   - api.get('/carbon/dashboard') → loads home page data
   - api.get('/challenges/today') → shows daily challenge
   - api.post('/challenges/:id/accept') → accept
   - api.post('/challenges/:id/complete') → complete + XP + streak

5. AI COPILOT:
   - api.post('/copilot/chat', { message }) → AI response

Make sure the app compiles with zero TypeScript errors and all API calls work.

---

### STEP 11 — Create deployment configs

A) For BACKEND deployment on Railway:
Create "carbonsense-api/Procfile":
```
web: npm start
```

Create "carbonsense-api/railway.json":
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "npm run build && npm start",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

B) For FRONTEND deployment on Vercel:
Create "carbonsense-web/vercel.json":
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

C) Update the README.md at root level with:
- How to set up locally (npm run install:all && npm run dev)
- How to deploy backend to Railway
- How to deploy frontend to Vercel
- Environment variables needed for each
- Production env: VITE_API_URL must be set to the Railway backend URL

Done! The app should now be fully connected and working as one unified system.
```

---

## ✅ After Codex finishes, do this:

### Local Testing Checklist

```bash
# 1. Install everything
cd "d:\CARBON FOOTPRINT"
npm run install:all

# 2. Set up environment variables
# Copy .env.example to .env in BOTH projects and fill in real values:
# - Same Supabase URL + keys in both
# - OpenAI API key in backend
# - Plaid keys in backend (use sandbox)

# 3. Run both
npm run dev
# Backend starts on http://localhost:3001
# Frontend starts on http://localhost:5173

# 4. Open http://localhost:5173 in browser
# 5. Sign up → Onboarding → Home → Test everything
```

### Production Deployment

| Service | Deploy To | URL Pattern |
|---------|-----------|-------------|
| Backend | Railway | `https://carbonsense-api-xxx.railway.app` |
| Frontend | Vercel | `https://carbonsense.vercel.app` |

Set these env vars in production:
- **Railway**: All backend .env vars + `FRONTEND_URL=https://carbonsense.vercel.app`
- **Vercel**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL=https://carbonsense-api-xxx.railway.app`
