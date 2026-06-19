# CarbonSense — Full Project Plan for Codex

## What We're Building
CarbonSense is the "Duolingo of climate action" — an AI-powered carbon footprint tracker that auto-tracks carbon from bank transactions and turns reduction into a daily habit with personalized micro-challenges.

## Tech Stack
- **Backend**: Node.js + Express + TypeScript
- **Database**: Supabase (PostgreSQL) + Supabase Auth
- **AI**: OpenAI GPT-4o API (copilot chat, carbon classification, challenge personalization)
- **Banking API**: Plaid (transaction data)
- **Cache**: Redis (Upstash) for streaks/leaderboards
- **Push Notifications**: Firebase Cloud Messaging
- **Payments**: Stripe (subscriptions)
- **Hosting**: Railway or Render
- **Frontend**: Built separately in Lovable (React/Next.js)

## Database Schema

### users
- id (uuid, PK)
- email (text, unique)
- name (text)
- avatar_url (text, nullable)
- carbon_age (integer, default 0)
- level (integer, default 1)
- level_name (text, default 'Carbon Curious')
- xp (integer, default 0)
- streak_count (integer, default 0)
- streak_max (integer, default 0)
- streak_freeze_available (boolean, default true)
- onboarding_complete (boolean, default false)
- onboarding_data (jsonb) — stores quiz answers
- notification_preferences (jsonb)
- created_at (timestamptz)
- updated_at (timestamptz)

### bank_connections
- id (uuid, PK)
- user_id (uuid, FK → users)
- plaid_access_token (text, encrypted)
- plaid_item_id (text)
- institution_name (text)
- institution_logo (text, nullable)
- status (text: 'active', 'error', 'disconnected')
- last_synced (timestamptz)
- created_at (timestamptz)

### transactions
- id (uuid, PK)
- user_id (uuid, FK → users)
- bank_connection_id (uuid, FK → bank_connections, nullable)
- plaid_transaction_id (text, nullable, unique)
- merchant_name (text)
- merchant_category (text)
- amount (decimal)
- currency (text, default 'USD')
- carbon_kg (decimal)
- carbon_category (text: 'food', 'transport', 'home', 'shopping', 'travel', 'other')
- carbon_confidence (decimal, 0-1)
- carbon_source (text: 'ai', 'manual', 'emission_factor')
- transaction_date (date)
- created_at (timestamptz)

### challenges
- id (uuid, PK)
- title (text)
- description (text)
- category (text: 'food', 'transport', 'home', 'shopping', 'lifestyle')
- difficulty (text: 'easy', 'medium', 'hard')
- carbon_save_kg (decimal)
- xp_reward (integer)
- tips (text[])
- icon (text)
- is_active (boolean, default true)
- created_at (timestamptz)

### user_challenges
- id (uuid, PK)
- user_id (uuid, FK → users)
- challenge_id (uuid, FK → challenges)
- date_assigned (date)
- status (text: 'pending', 'accepted', 'completed', 'skipped')
- completed_at (timestamptz, nullable)
- xp_earned (integer, default 0)
- created_at (timestamptz)

### teams
- id (uuid, PK)
- name (text)
- type (text: 'neighborhood', 'employer', 'friends', 'custom')
- description (text, nullable)
- invite_code (text, unique)
- created_by (uuid, FK → users)
- member_count (integer, default 1)
- total_carbon_saved_kg (decimal, default 0)
- created_at (timestamptz)

### team_memberships
- id (uuid, PK)
- team_id (uuid, FK → teams)
- user_id (uuid, FK → users)
- role (text: 'admin', 'member')
- joined_at (timestamptz)
- UNIQUE(team_id, user_id)

### achievements
- id (uuid, PK)
- name (text)
- description (text)
- icon (text)
- condition_type (text: 'streak', 'challenges_completed', 'carbon_saved', 'level')
- threshold (integer)
- xp_reward (integer)
- created_at (timestamptz)

### user_achievements
- id (uuid, PK)
- user_id (uuid, FK → users)
- achievement_id (uuid, FK → achievements)
- earned_at (timestamptz)
- UNIQUE(user_id, achievement_id)

### carbon_summaries
- id (uuid, PK)
- user_id (uuid, FK → users)
- period_type (text: 'day', 'week', 'month')
- period_start (date)
- total_carbon_kg (decimal)
- food_kg (decimal)
- transport_kg (decimal)
- home_kg (decimal)
- shopping_kg (decimal)
- travel_kg (decimal)
- other_kg (decimal)
- challenge_savings_kg (decimal)
- created_at (timestamptz)
- UNIQUE(user_id, period_type, period_start)

### copilot_conversations
- id (uuid, PK)
- user_id (uuid, FK → users)
- messages (jsonb[]) — array of {role, content, timestamp}
- created_at (timestamptz)
- updated_at (timestamptz)

## API Endpoints

### Auth (Supabase handles most)
- POST /api/auth/signup
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me

### Onboarding
- POST /api/onboarding/quiz — save quiz answers + calculate initial carbon estimate
- POST /api/onboarding/complete — mark onboarding done

### Bank / Plaid
- POST /api/plaid/create-link-token — get Plaid Link token
- POST /api/plaid/exchange-token — exchange public token for access token
- POST /api/plaid/sync-transactions — fetch + classify transactions
- DELETE /api/plaid/disconnect/:connectionId

### Carbon Dashboard
- GET /api/carbon/dashboard — get current carbon summary + Carbon Age
- GET /api/carbon/transactions — paginated transaction list with carbon data
- GET /api/carbon/trends — weekly/monthly trend data
- GET /api/carbon/category/:category — drill into specific category
- GET /api/carbon/compare — comparison vs average/last period

### Challenges
- GET /api/challenges/today — get today's personalized challenge
- POST /api/challenges/:id/accept — accept a challenge
- POST /api/challenges/:id/complete — mark challenge complete
- POST /api/challenges/:id/skip — skip with reason
- GET /api/challenges/history — past challenges

### Streaks & Gamification
- GET /api/streaks — current streak, max streak, freeze status
- POST /api/streaks/freeze — use streak freeze
- GET /api/achievements — all achievements + user's earned ones
- GET /api/level — current level, XP, progress to next

### Teams
- POST /api/teams/create — create a team
- POST /api/teams/join/:inviteCode — join via invite
- GET /api/teams/:id — team details + leaderboard
- GET /api/teams/my-teams — user's teams
- GET /api/teams/:id/leaderboard — team leaderboard

### AI Copilot
- POST /api/copilot/chat — send message, get AI response
- GET /api/copilot/history — conversation history
- GET /api/copilot/suggestions — suggested prompts

### Impact
- GET /api/impact/total — lifetime carbon saved
- GET /api/impact/equivalencies — trees, drives, flights equivalents
- GET /api/impact/share-card — generate shareable impact image data

### User Profile
- GET /api/profile — full profile
- PATCH /api/profile — update profile
- GET /api/profile/carbon-age — Carbon Age calculation
- DELETE /api/profile — delete account + all data (GDPR)

## Carbon Classification Logic
1. Receive transaction (merchant_name, category, amount)
2. Check local emission factor lookup table first (top 500 merchants)
3. If not found, use OpenAI to classify: category + carbon estimate
4. Apply emission factor: carbon_kg = amount × emission_factor_per_dollar
5. Store with confidence score

## Emission Factor Examples (per USD spent)
- Fast food: 0.68 kg CO2/$
- Groceries (meat): 0.45 kg CO2/$
- Groceries (plant): 0.18 kg CO2/$
- Gas/fuel: 2.31 kg CO2/$
- Electricity: 0.85 kg CO2/$
- Clothing: 0.22 kg CO2/$
- Electronics: 0.35 kg CO2/$
- Airlines: 1.20 kg CO2/$
- Public transit: 0.12 kg CO2/$
- Restaurants: 0.42 kg CO2/$

## Challenge Library (Seed Data — 30 challenges)
See Prompt 4 for full seed data.

## Carbon Age Formula
carbon_age = biological_age + (annual_carbon_tons - country_target_tons) × 2
- Country target (US): 4.0 tons/year (Paris-aligned)
- If user emits 8 tons/year and is 25: carbon_age = 25 + (8-4)×2 = 33

## Level System
- Level 1: Carbon Curious (0 XP)
- Level 2: Carbon Aware (100 XP)
- Level 3: Carbon Conscious (300 XP)
- Level 4: Carbon Reducer (600 XP)
- Level 5: Carbon Champion (1000 XP)
- Level 6: Carbon Hero (1500 XP)
- Level 7: Carbon Warrior (2200 XP)
- Level 8: Carbon Legend (3000 XP)
- Level 9: Carbon Neutral Star (4000 XP)
- Level 10: Climate Guardian (5500 XP)

## Streak Rules
- Complete 1 challenge per day = streak continues
- Miss a day WITH streak freeze available = freeze used, streak safe
- Miss a day WITHOUT freeze = streak resets to 0
- Streak freeze regenerates every 7 days
- Streak milestones: 7, 14, 30, 60, 100, 365 days (bonus XP)
