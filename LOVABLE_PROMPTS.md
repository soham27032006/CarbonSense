# 🎨 CarbonSense — Lovable Frontend Prompts

> **How to use**: Paste **Prompt 0** first to set context, then paste each prompt **one at a time** in order. Wait for Lovable to finish building before pasting the next. Lovable handles all design, UI/UX, animations, and styling — these prompts focus on structure, functionality, and API wiring.
>
> **Backend API Base URL**: Replace `{{API_URL}}` with your actual deployed backend URL (e.g., `https://carbonsense-api.railway.app`)

---

## 📋 PROMPT 0 — Master Context (PASTE THIS FIRST)

```
I'm building CarbonSense — a premium "Duolingo for climate action" app. It's an AI-powered carbon footprint tracker that auto-tracks carbon from bank transactions and turns reduction into a daily habit with personalized micro-challenges, streaks, levels, teams, and an AI copilot chat.

DESIGN DIRECTION:
- Premium, modern feel — think Duolingo meets Headspace meets a luxury fintech
- Dark mode by default with rich greens, teals, and warm accents
- Use organic shapes, smooth gradients, glassmorphism cards
- Micro-animations everywhere — loading states, transitions, confetti on achievements
- Mobile-first responsive design (should feel native on phones)
- Use an icon library (Lucide icons) and a premium sans-serif font (Inter or Plus Jakarta Sans from Google Fonts)
- The vibe is: hopeful, empowering, premium — never preachy or guilt-inducing

TECH:
- React + TypeScript + Vite
- React Router v6 for navigation
- Supabase JS client for auth (@supabase/supabase-js)
- Tanstack React Query for API state management
- Zustand for global client state (user, theme)
- Recharts for data visualization charts
- Framer Motion for animations
- Axios for API calls to backend at: {{API_URL}}
- react-hot-toast for notifications

APP STRUCTURE:
- /login — Login page
- /signup — Signup page  
- /onboarding — Multi-step onboarding quiz (only shown once after first signup)
- /home — Daily hub (today's challenge, streak, quick stats)
- /dashboard — Carbon analytics (charts, transactions, trends)
- /challenges — Challenge center (today + history + browse)
- /impact — Impact dashboard (lifetime stats, equivalencies, achievements)
- /teams — Teams & community
- /teams/:id — Individual team view with leaderboard
- /copilot — AI copilot chat
- /profile — User profile & settings
- /connect-bank — Plaid bank connection flow

NAVIGATION:
- Bottom tab bar on mobile (5 tabs): Home, Dashboard, Challenges, Impact, Profile
- Floating action button (bottom-right) opens AI Copilot as a slide-up panel/modal
- Top bar shows: app logo (left), streak fire icon + count (center), notification bell (right)

AUTH FLOW:
- Unauthenticated users see /login or /signup only
- After first signup → redirect to /onboarding
- After onboarding complete → redirect to /home
- Returning users → /login → /home directly
- Store auth token in Supabase session, send as Bearer token to backend API

Acknowledge this context. Do NOT build anything yet — I will give you screen-by-screen prompts next.
```

---

## 📋 PROMPT 1 — Project Setup + Auth Pages (Login/Signup)

```
Set up the CarbonSense project and build the authentication pages.

1. PROJECT SETUP:
- Initialize React + TypeScript + Vite project
- Install all dependencies from the context (React Router, Supabase, Tanstack Query, Zustand, Recharts, Framer Motion, Axios, react-hot-toast, Lucide React)
- Set up folder structure:
  src/
  ├── api/          (axios instance + API functions)
  ├── components/   (reusable UI components)
  ├── hooks/        (custom React hooks)
  ├── layouts/      (AppLayout with nav, AuthLayout)
  ├── pages/        (page components)
  ├── stores/       (Zustand stores)
  ├── lib/          (supabase client, utils)
  ├── types/        (TypeScript interfaces)
  └── assets/       (icons, images)

- Create src/lib/supabase.ts — initialize Supabase client with env vars
- Create src/api/client.ts — Axios instance with baseURL={{API_URL}}, auto-attach auth Bearer token from Supabase session, response interceptor for 401 → redirect to /login
- Create src/stores/authStore.ts — Zustand store holding: user, isAuthenticated, isLoading, login(), logout(), setUser()
- Create src/types/index.ts with these TypeScript interfaces:
  User, Transaction, Challenge, UserChallenge, Team, TeamMembership, Achievement, CarbonSummary, CopilotMessage, DashboardData, EquivalencyData

2. AUTH LAYOUT:
- Create AuthLayout — a centered layout for login/signup pages
- Full-screen background with a subtle animated gradient (green → teal → dark)
- CarbonSense logo at top (text-based: "CarbonSense" with a leaf icon ✦)
- Tagline below logo: "Sense the change. Make it count."
- Card container for the form (glassmorphism style)

3. LOGIN PAGE (/login):
- Email + password fields with validation
- "Log In" primary button with loading state
- "Don't have an account? Sign Up" link → /signup
- "Forgot password?" link (calls Supabase auth.resetPasswordForEmail)
- Social login buttons: "Continue with Google" (Supabase OAuth)
- On success: check if user.onboarding_complete → if false, go to /onboarding, else go to /home
- API: POST /api/auth/login with email+password, OR use Supabase client auth directly
- Show toast on error

4. SIGNUP PAGE (/signup):
- Name + Email + Password + Confirm Password fields with validation
- Password strength indicator
- "Create Account" button with loading state
- "Already have an account? Log In" link → /login
- Social signup: "Continue with Google"
- On success: call POST /api/auth/signup to create user record in backend, then redirect to /onboarding
- Show toast on success: "Welcome to CarbonSense! 🌍"

5. ROUTE PROTECTION:
- Create ProtectedRoute wrapper component — if not authenticated, redirect to /login
- Create PublicOnlyRoute — if authenticated, redirect to /home
- Set up React Router with all routes from the context, wrapped appropriately
- Add Supabase auth state listener (onAuthStateChange) to sync auth state globally
```

---

## 📋 PROMPT 2 — Onboarding Flow

```
Build the multi-step onboarding quiz for CarbonSense at /onboarding.

This is a critical first-time experience — it should feel magical, personal, and fast (under 2 minutes).

FLOW: 6 steps, one per screen, with a progress bar at top.

STEP 1 — Welcome
- Animated welcome screen: "Let's learn about your carbon footprint"
- Subtitle: "5 quick questions to personalize your experience"
- Large animated Earth/leaf illustration (use a styled gradient circle with a leaf icon)
- "Let's Go" button with bounce animation
- No API call here

STEP 2 — Transport
- Question: "How do you usually get around?"
- Visual option cards (NOT a boring dropdown — large tappable cards with icons):
  🚗 "I drive" (car)
  🚌 "Public transit" (public_transit)
  🚲 "Bike or walk" (bike)
  🏠 "Work from home" (wfh)
  🔄 "Mix of everything" (mixed)
- Single select, card highlights on selection with animation
- "Next" button appears after selection

STEP 3 — Diet
- Question: "How often do you eat meat?"
- Visual option cards:
  🥩 "Every day" (daily)
  🍗 "A few times a week" (few_times_week)
  🥗 "Rarely" (rarely)
  🌱 "Never — I'm plant-based" (never)
- Single select

STEP 4 — Spending  
- Question: "What's your rough monthly spending?"
- Subtitle: "This helps us estimate your consumption footprint"
- Option cards:
  💵 "Under $2,000" (under_2k)
  💰 "Between $2K-$5K" (2k_to_5k)
  💳 "$5K-$10K" (5k_to_10k)
  💎 "Over $10K" (over_10k)
- Single select
- Small privacy note at bottom: "🔒 We never see your actual bank balance"

STEP 5 — Travel
- Question: "How often do you fly?"
- Option cards:
  🚫 "Never" (never)
  ✈️ "Once or twice a year" (1_2_yearly)
  🛫 "Monthly" (monthly)
  🌍 "Weekly" (weekly)
- Single select

STEP 6 — Motivation
- Question: "What motivates you most?"
- Option cards:
  💰 "Save money while saving the planet" (save_money)
  😌 "Reduce my climate anxiety" (reduce_anxiety)
  👨‍👩‍👧 "Set an example for my family" (family_values)
  🤝 "Be part of a community" (community)
- Single select

AFTER ALL STEPS — Carbon Age Reveal Screen:
- Call POST /api/onboarding/quiz with all collected answers + household_size:1, country:"US"
- Show a dramatic reveal animation:
  - Loading spinner: "Calculating your carbon footprint..."
  - Then animate in the result:
    - Large number: "Your Carbon Age: 34" (with count-up animation from 0)
    - Below: "Your estimated annual footprint: 12.3 tons CO2"
    - Comparison bar: "US average: 16 tons | Paris target: 4 tons" — show user's position
    - Percentile: "You're in the top 62% in the US"
    - Encouraging message based on result (if below avg: "Great start!", if above: "Don't worry — small changes make a big difference!")
- "Choose Your First Challenge Track" — 3 visual cards based on their highest category:
  🍽 "Food First" / 🚗 "Commute Conscious" / 🎲 "Surprise Me"
- Tapping a track → calls POST /api/onboarding/complete
- Then redirect to /home with a welcome toast: "You're all set! Here's your first challenge 🌱"

IMPORTANT UX:
- Progress bar (segmented, not continuous) at top showing steps 1-6
- "Back" button on each step (except step 1)
- Smooth slide-left/right transitions between steps using Framer Motion
- Store answers in local state until the final API call
- The entire onboarding must feel like a polished, premium interactive experience
```

---

## 📋 PROMPT 3 — Home Page (Daily Hub)

```
Build the Home page at /home — this is the daily hub and the most important screen.

It's the first thing users see every day. Design it to be warm, inviting, and action-oriented — ONE primary action: today's challenge.

DATA: Call GET /api/carbon/dashboard on page load. Response:
{
  carbon_age, current_level: { level, name, xp, xp_to_next },
  streak: { current, max, freeze_available },
  today: { carbon_kg, challenge_status },
  this_week: { total_carbon_kg, vs_last_week_percent, category_breakdown },
  this_month: { total_carbon_kg, vs_last_month_percent, daily_average_kg },
  ai_insight: "string"
}
Also call GET /api/challenges/today for the daily challenge.

LAYOUT (top to bottom, scrollable):

SECTION 1 — Header Bar (sticky)
- Left: "CarbonSense" logo text with ✦ leaf icon
- Center: 🔥 streak count (animated fire icon + number, e.g., "🔥 12")
- Right: Bell icon (notification) + user avatar circle

SECTION 2 — Greeting Card
- "Good morning, {name}! 🌤" (dynamic greeting based on time of day: morning/afternoon/evening)
- Subtitle: current level badge — "🌱 Carbon Conscious · Level 3"
- Background: gentle gradient card

SECTION 3 — Today's Challenge Card (THE HERO)
- This is the biggest, most prominent element on the page
- Large card with gradient background (green → teal)
- Icon for challenge category (🍽/🚗/🏠/🛍/🧘)
- Challenge title in large text: "Plant-Based Lunch"
- Description: "Try a vegetarian or vegan lunch today"
- Stats row: "Saves 2.5 kg CO2 · Earns 15 XP · Easy"
- Social proof line: "142 others doing this today" (can be random 50-200 for now)
- Primary CTA button state depends on challenge_status:
  - "pending" → green "Accept Challenge ✓" button
  - "accepted" → amber "Mark Complete 🎉" button  
  - "completed" → confetti animation + "Done! +15 XP ⭐" in green
  - null → "No challenge today" (edge case)
- Secondary: "Skip → Try Another" small text link
- On Accept: POST /api/challenges/:id/accept → update button state
- On Complete: POST /api/challenges/:id/complete → show confetti animation + XP earned toast + update streak
- On Skip: show modal asking for reason, then POST /api/challenges/:id/skip

SECTION 4 — Quick Stats Row (3 mini cards in a horizontal scroll/row)
- Card 1: "🔥 Streak: 12 days" with small flame animation
- Card 2: "📊 This week: 28.5 kg" with up/down arrow + percent vs last week
- Card 3: "⭐ XP: 340/600" with mini progress bar to next level
- Cards should be tappable → navigate to respective detail pages

SECTION 5 — AI Insight Card
- Small card with robot/sparkle icon ✨
- Shows the ai_insight string from dashboard API
- "Powered by AI" subtle label
- Tappable → opens AI Copilot

SECTION 6 — Weekly Category Mini-Chart
- Small horizontal bar chart or mini donut showing this_week.category_breakdown
- Categories: 🍔 Food, 🚗 Transport, 🏠 Home, 🛍 Shopping, ✈️ Travel
- Color-coded bars
- "View full dashboard →" link → /dashboard

SECTION 7 — Footer spacer (enough space so bottom nav doesn't overlap content)

ANIMATIONS:
- Page fade-in on load
- Challenge card has subtle floating/breathing animation
- Streak fire icon has a gentle flame flicker
- Numbers count up when they first appear
- Confetti burst when challenge is completed (use a confetti library or CSS animation)
- Pull-to-refresh on mobile
```

---

## 📋 PROMPT 4 — Carbon Dashboard (Analytics)

```
Build the Carbon Dashboard page at /dashboard — this is the deep analytics view.

DATA CALLS:
- GET /api/carbon/dashboard (summary stats)
- GET /api/carbon/trends?period=weekly&range=12 (chart data)
- GET /api/carbon/transactions?page=1&limit=15 (recent transactions)
- GET /api/carbon/compare (comparison data)

LAYOUT:

SECTION 1 — Carbon Age Hero
- Large circular badge showing Carbon Age number (e.g., "34")
- Animated ring/circle around it that fills based on improvement progress
- Below: "Your Carbon Age" label
- Below that: small text "Real age: 28 · Target: 28"
- Color: green if carbon_age ≤ real age, amber if +1-5, red if +6 or more
- Tappable → shows explanation modal of how Carbon Age is calculated

SECTION 2 — Period Selector
- Toggle tabs: "Week" | "Month" | "Year"
- Selected tab is highlighted with accent color
- Changes all data below when toggled

SECTION 3 — Trend Chart
- Line/area chart using Recharts
- X-axis: time periods, Y-axis: kg CO2
- Gradient fill under the line (green to transparent)
- Show comparison: dashed line for previous period
- Tooltip on hover/tap showing exact values
- Below chart: summary text: "↓ 12% vs last week" (green if decreasing, red if increasing)

SECTION 4 — Category Breakdown
- Donut/pie chart showing carbon by category
- Categories with colors: Food (orange), Transport (blue), Home (yellow), Shopping (purple), Travel (red), Other (gray)
- Legend below the chart
- Each category segment is tappable → navigates to category detail
- Show percentages on the chart

SECTION 5 — Top Transactions
- Header: "Recent Transactions" + "See All →" link
- List of latest 10 transactions as cards:
  Each card shows:
  - Merchant icon (first letter in circle or category icon)
  - Merchant name
  - Date
  - Amount ($)
  - Carbon badge: colored dot (🟢 < 1kg, 🟡 1-3kg, 🔴 > 3kg) + "2.1 kg CO2"
- List is scrollable
- "See All →" link goes to full transaction list view (paginated)

SECTION 6 — Comparison Card
- "How You Compare" header
- Horizontal bar showing:
  - User's monthly carbon (marker + avatar)
  - National average (US: ~1,333 kg/month) marker
  - Paris target (~333 kg/month) marker
- Text: "You're in the top {percentile}% in the US"
- Encouraging message if improving

TRANSACTION LIST (sub-page or expandable):
- Full paginated list of all transactions
- Filter chips at top: All, Food, Transport, Home, Shopping, Travel
- Date filter dropdown
- Each transaction row: merchant icon, name, date, amount, carbon_kg with colored indicator
- Infinite scroll or "Load More" pagination
- Pull-to-refresh

INTERACTIONS:
- All charts have smooth entrance animations
- Donut chart segments animate in sequentially
- Numbers count up on first render
- Period selector changes trigger smooth data transitions
```

---

## 📋 PROMPT 5 — Challenges Page

```
Build the Challenges page at /challenges — the challenge center.

DATA CALLS:
- GET /api/challenges/today (today's active challenge)
- GET /api/challenges/history?page=1&limit=20 (past challenges)

LAYOUT — Three tab sections at top: "Today" | "History" | "Library"

TAB 1 — Today (default)
- Shows today's challenge as a large featured card (same design as Home but bigger, full-width)
- Below the main card, show:
  - "Why this challenge?" AI explanation text: "Based on your spending, food is your biggest carbon area"
  - "Tips" accordion/expandable section with tips array from the challenge
  - Stats: "This saves {carbon_save_kg} kg CO2 — equivalent to {equivalency text}"
  - "Others doing this today: 142" with animated avatars row
- Action buttons:
  - If pending: "Accept Challenge" (green) + "Try Another" (text)
  - If accepted: "Mark Complete 🎉" (green) + "I couldn't today" (text)
  - If completed: big confetti state showing XP earned, streak updated
  - If skipped: show the alternative challenge offered
- Bottom: "Your challenge streak" mini section — visual calendar dots (last 14 days), filled = completed, empty = missed, gold = current

TAB 2 — History
- Scrollable list of past challenges grouped by week
- Each item shows:
  - Challenge icon + title
  - Date
  - Status badge: ✅ Completed (green) | ⏭ Skipped (gray) | ❌ Missed (red dim)
  - XP earned (if completed)
  - Carbon saved (if completed)
- Summary stats at top of history:
  - "Total completed: 47"
  - "Total carbon saved: 112 kg"
  - "Total XP earned: 890"
  - "Completion rate: 72%"
- Filter by: All | Completed | Skipped | category dropdown

TAB 3 — Library (Browse All)
- Grid of all available challenges (not personalized, just the full library)
- Grouped by category with section headers: 🍽 Food, 🚗 Transport, 🏠 Home, 🛍 Shopping, 🧘 Lifestyle
- Each challenge card shows:
  - Icon, title, difficulty badge (Easy/Medium/Hard with colors), carbon save, XP reward
  - Brief description (1 line)
- Cards are NOT actionable from library — just informational ("Coming up in your rotation")
- This gives users visibility into what's available and builds anticipation

CHALLENGE COMPLETION CELEBRATION:
When user taps "Mark Complete":
1. Button transforms into a loading spinner briefly
2. API call: POST /api/challenges/:id/complete
3. Full-screen celebration overlay:
   - Confetti particle animation (green + gold particles)
   - Large "🎉" emoji
   - "Challenge Complete!"
   - "+15 XP" counter animating up
   - "You saved 2.5 kg CO2 — like planting a small tree!"
   - Updated streak: "🔥 13 day streak!"
   - If achievement earned: "🏆 New achievement: Week Warrior!"
   - "Share" button (copies a text to clipboard for now)
   - "Back to Home" button
4. Overlay auto-dismisses after 5 seconds or on tap

SKIP FLOW:
When user taps "Skip" or "Try Another":
1. Show bottom sheet modal:
   - "Why are you skipping?" 
   - Quick-tap options: "Too hard" | "Not relevant" | "Already did it" | "No time today"
2. POST /api/challenges/:id/skip with reason
3. Fetch next alternative challenge
4. Animate swap — old card slides left, new card slides in from right
```

---

## 📋 PROMPT 6 — AI Copilot Chat

```
Build the AI Copilot chat interface for CarbonSense.

This opens as a slide-up panel/full-screen modal when the user taps the floating AI button (sparkle ✨ icon, bottom-right above the tab bar).

DATA CALLS:
- POST /api/copilot/chat — send message, get response
- GET /api/copilot/suggestions — get suggested prompts
- GET /api/copilot/history — load past conversation

DESIGN:
- Slide-up from bottom with spring animation (Framer Motion)
- Nearly full screen on mobile (covers tab bar), with rounded top corners
- Header bar: "✨ AI Copilot" title + "✕" close button
- Chat area fills remaining space
- Input bar fixed at bottom

CHAT AREA:
- Messages displayed as chat bubbles:
  - User messages: right-aligned, accent color background, white text
  - AI messages: left-aligned, dark glass card, light text, with a small "✦ CarbonSense AI" label
- AI messages support markdown rendering (bold, lists, numbers)
- Show typing indicator (animated dots) while waiting for AI response
- Auto-scroll to bottom on new messages
- Load previous messages on open (GET /api/copilot/history) with "Load earlier messages" at top

SUGGESTED PROMPTS:
- On first open (empty conversation), show a grid/list of suggested prompt chips:
  "What's my biggest carbon category?"
  "How do I compare to the average?"
  "Give me tips to reduce food carbon"
  "Is organic really better?"
  "Plan me a low-carbon week"
  "What does my Carbon Age mean?"
- Tapping a chip auto-sends that message
- After conversation starts, show 3 follow-up suggestions below the latest AI response

INPUT BAR:
- Text input with placeholder: "Ask me anything about your carbon..."
- Send button (arrow icon) — disabled when input is empty
- Send on Enter key press
- Input auto-focuses when panel opens
- Disable input + show loading while AI is responding

BEHAVIOR:
- POST /api/copilot/chat with { message: "user text" }
- Response: { response: "AI text", suggestions: ["follow-up 1", "follow-up 2", "follow-up 3"] }
- Display AI response with a typing effect (character by character, fast) for more natural feel
- Show follow-up suggestions as tappable chips below the AI response
- Handle errors gracefully: "Sorry, I couldn't process that. Try again?"
- Rate limit indicator: if 429 response, show "You've reached the chat limit. Try again in a few minutes."

FLOATING ACTION BUTTON (always visible on app):
- Position: bottom-right, 16px above tab bar, 16px from right edge
- Style: circular, gradient green-to-teal, sparkle ✨ icon
- Subtle pulsing glow animation
- Has a small notification dot if AI has an insight to share
- On tap: opens the copilot panel
- While copilot is open: button transforms into the close button
```

---

## 📋 PROMPT 7 — Impact Dashboard

```
Build the Impact page at /impact — this is the emotional payoff screen.

DATA CALLS:
- GET /api/impact/total (lifetime stats)
- GET /api/impact/equivalencies (tangible equivalents)
- GET /api/achievements (all achievements + earned status)
- GET /api/level (level progress)

LAYOUT (scrollable, visually rich):

SECTION 1 — Virtual Forest Hero
- Large visual area at top (250px height)
- Animated illustration of a growing forest/garden:
  - Show trees proportional to carbon saved (1 tree per 22 kg saved)
  - If < 22 kg: show a seedling growing
  - If 22-110 kg: show 1-5 small trees
  - If 110-500 kg: show a small forest patch
  - If 500+ kg: show a lush forest
- Use CSS/SVG illustrations with subtle swaying animation
- Below forest: "Your CarbonSense Forest: {tree_count} trees 🌳"
- This is the most visually delightful part of the entire app

SECTION 2 — Lifetime Stats Grid
- 2×3 grid of stat cards with icons:
  🌿 "{carbon_saved_kg} kg CO2 saved"
  ✅ "{challenges_completed} challenges done"
  🔥 "{best_streak} best streak"
  📅 "{days_active} days active"
  ⭐ "{xp} total XP"
  🏆 "{achievements_earned}/{total_achievements} achievements"
- Each card has a large number with count-up animation + label below
- Cards have subtle glass effect

SECTION 3 — Equivalencies
- Header: "What your impact looks like in the real world"
- Horizontal scrollable cards (carousel style), each showing one equivalency:
  🌳 "Like {value} trees absorbing CO2 for a year"
  🚗 "Like NOT driving {value} miles"
  📱 "{value} smartphones charged"
  ✈️ "{value} cross-country flights saved"
  🚿 "{value} minutes of hot showers saved"
- Each card has a large icon, the number prominently displayed, and the description
- Animate numbers when cards scroll into view

SECTION 4 — Level Progress
- Current level badge: icon + "Level 5: Carbon Champion"
- Visual XP progress bar: "1,000 / 1,500 XP to Level 6"
- Fill animation on load
- Below: list of all 10 levels with current level highlighted:
  Level 1-10 with names, showing locked/unlocked status
  Reached levels: green check, current: pulsing glow, future: gray/locked

SECTION 5 — Achievements Gallery
- Header: "Your Achievements" + "{earned}/{total}"
- Grid of achievement badges (3 columns):
  - Earned: full color icon + name + earned date
  - Unearned: grayscale icon + name + progress indicator ("12/30 challenges")
  - Tappable: shows full description + progress in a bottom sheet
- Show most recent earned achievement first with a "NEW" badge animation

SECTION 6 — Share Your Impact
- Card with gradient background
- "Share your impact with the world"
- Preview of a shareable card showing:
  {name}'s CarbonSense Impact
  🌿 {kg} kg CO2 saved
  🔥 {streak} day streak
  🌳 {trees} trees worth
  Level: {level_name}
- "Share" button → copies a formatted text to clipboard (or generates a sharable image URL)
  Toast: "Impact card copied! Share it on social media 🌍"
```

---

## 📋 PROMPT 8 — Teams & Community

```
Build the Teams page at /teams and individual team view at /teams/:id.

DATA CALLS:
- GET /api/teams/my-teams (user's teams)
- GET /api/teams/:id (team detail)
- GET /api/teams/:id/leaderboard?period=week (leaderboard)
- POST /api/teams/create (create team)
- POST /api/teams/join/:inviteCode (join team)

/teams PAGE LAYOUT:

SECTION 1 — Header
- "My Teams" title
- Two action buttons: "+ Create Team" and "🔗 Join Team"

SECTION 2 — My Teams List
- If user has no teams: empty state illustration + "Join or create a team to start competing together!"
- If user has teams: list of team cards, each showing:
  - Team name + type badge (Neighborhood/Employer/Friends)
  - Member count: "👥 12 members"
  - Team total carbon saved: "🌿 342 kg saved together"
  - "View Team →" CTA
  - Tappable → navigates to /teams/:id

CREATE TEAM MODAL (triggered by "+ Create Team"):
- Form fields:
  - Team Name (required)
  - Type: dropdown — Neighborhood, Employer, Friends, Custom
  - Description (optional, max 200 chars)
- "Create Team" button
- POST /api/teams/create → on success show the invite code prominently: "Share this code: {invite_code}" with copy button
- Toast: "Team created! Share the invite code with your group 🎉"

JOIN TEAM MODAL (triggered by "🔗 Join Team"):
- Single input: "Enter invite code"
- "Join Team" button
- POST /api/teams/join/:inviteCode
- On success: navigate to /teams/:id + toast "Welcome to {team_name}! 🤝"
- On error: "Invalid invite code. Check with your team admin."

/teams/:id — INDIVIDUAL TEAM PAGE:

SECTION 1 — Team Header
- Team name (large)
- Type badge + member count
- Created date
- If user is admin: "⚙ Settings" icon → manage team
- Invite code display: "Invite code: {code}" with copy button

SECTION 2 — Team Stats Row
- 3 stat cards:
  🌿 "Total CO2 Saved: {kg} kg"
  👥 "Members: {count}"
  🔥 "Team Best Streak: {best}" (highest individual streak in team)

SECTION 3 — Weekly Leaderboard
- Period toggle: "This Week" | "This Month" | "All Time"
- Ranked list of members:
  #1 🥇 {display_name} — {carbon_saved} kg saved · {challenges} challenges · 🔥{streak}
  #2 🥈 ...
  #3 🥉 ...
  #4-N: normal rows
- Current user's row is highlighted/pinned if not in top 3
- Use anonymized display: first name + last initial, or "Member #X" if privacy preferred
- Animate position changes with Framer Motion

SECTION 4 — Team Activity Feed (static for MVP)
- Simple list of recent team achievements:
  "{Member} completed a challenge! 🌿"
  "{Member} hit a 14-day streak! 🔥"
  "Team milestone: 500 kg CO2 saved! 🎉"
- Use timestamp: "2 hours ago", "Yesterday"
- This can be populated from leaderboard data changes for now

SECTION 5 — Invite Friends
- "Grow your team" card
- Invite code displayed prominently
- "Copy Invite Code" button + "Share" button
```

---

## 📋 PROMPT 9 — Profile & Settings

```
Build the Profile page at /profile — user settings and account management.

DATA CALLS:
- GET /api/profile (full profile data)
- PATCH /api/profile (update profile)
- GET /api/profile/carbon-age (detailed carbon age info)
- DELETE /api/profile (account deletion)
- GET /api/streaks (streak details)

LAYOUT:

SECTION 1 — Profile Header
- User avatar (circular, large — 80px — with level ring/border colored by level)
- User name (editable inline — tap to edit)
- Level badge: "🌱 Level 5 · Carbon Champion"
- Member since: "Member since June 2026"
- Carbon Age display: large "Carbon Age: 34" with comparison to real age

SECTION 2 — Stats Overview
- Summary row: 4 mini stats
  🔥 "12 day streak"
  ⭐ "1,240 XP"
  ✅ "47 challenges"
  🌿 "112 kg saved"

SECTION 3 — Connected Accounts
- "Bank Accounts" section header
- List of connected bank accounts:
  Each shows: bank icon/logo + institution name + status (Active ✅ / Error ⚠️) + last synced
  "Disconnect" button on each → confirmation modal → DELETE /api/plaid/disconnect/:id
- "+ Connect Bank Account" button → navigates to /connect-bank
- If no banks connected: "Connect your bank for automatic carbon tracking" card with CTA

SECTION 4 — My Teams
- List of teams with quick view
- "Manage Teams →" link to /teams

SECTION 5 — Notification Preferences
- Toggle switches:
  📱 "Daily challenge reminder" — on/off + time picker (default: 8:00 AM)
  🔥 "Streak at risk" — on/off
  📊 "Weekly summary" — on/off
  🏆 "Achievement earned" — on/off
  👥 "Team updates" — on/off
- Changes auto-save via PATCH /api/profile

SECTION 6 — App Settings
- "Appearance" — Dark Mode / Light Mode / System toggle
- "Units" — Metric (kg) / Imperial (lbs) toggle
- "Country" — dropdown (affects carbon benchmarks and emission factors)

SECTION 7 — About & Legal
- "About CarbonSense" → shows app version, team credits
- "Privacy Policy" → opens external link
- "Terms of Service" → opens external link
- "How Carbon Age is calculated" → modal explaining the formula
- "Data Sources" → modal listing emission factor sources (EPA, DEFRA, Climatiq)

SECTION 8 — Account Actions (bottom, with spacing)
- "Export My Data" button (outline style) → shows toast "Data export requested. Check your email."
- "Log Out" button (outline red) → Supabase signout → redirect /login
- "Delete Account" button (red text, small) → confirmation modal:
  "Are you sure? This will permanently delete all your data including carbon history, challenges, team memberships, and conversations. This action cannot be undone."
  → Type "DELETE" to confirm
  → DELETE /api/profile
  → Supabase signout → redirect /login with toast "Account deleted. We're sorry to see you go 🌍"

EDIT PROFILE MODAL:
- Triggered by tapping name or an "Edit" button
- Fields: Name, Avatar URL (or upload)
- "Save" → PATCH /api/profile → toast "Profile updated!"
```

---

## 📋 PROMPT 10 — Bank Connection (Plaid Link)

```
Build the bank connection flow at /connect-bank.

This page integrates Plaid Link to let users connect their bank accounts for automatic carbon tracking.

DATA CALLS:
- POST /api/plaid/create-link-token (get Plaid Link token)
- POST /api/plaid/exchange-token (exchange public token after user completes Plaid Link)
- POST /api/plaid/sync-transactions (trigger first transaction sync)

INSTALL: Add react-plaid-link package for Plaid Link integration

FLOW:

STEP 1 — Explanation Screen
- Header: "Connect Your Bank 🏦"
- Icon/illustration of a bank building with a shield
- Benefit bullets:
  ✅ "Automatically track your carbon from purchases"
  ✅ "No manual entry needed"
  ✅ "See exactly which spending drives your footprint"
- Privacy assurances card:
  🔒 "We never see your bank balance or credentials"
  🔒 "Transaction data is encrypted and private"
  🔒 "You can disconnect anytime"
  🔒 "Powered by Plaid — trusted by millions"
- "Connect Bank Account" large CTA button
- "Skip for now" text link → navigate back to /profile or /home

STEP 2 — Plaid Link
- On "Connect Bank Account" tap:
  1. Call POST /api/plaid/create-link-token → get link_token
  2. Open Plaid Link modal using react-plaid-link's usePlaidLink hook
  3. User selects their bank, logs in (handled entirely by Plaid)
  4. On success callback: receive public_token + metadata
  5. Call POST /api/plaid/exchange-token with { public_token, institution: { id, name } }
  6. Show loading: "Connecting your bank..."

STEP 3 — First Sync
- After exchange succeeds:
  1. Show: "Connected to {institution_name} ✅"
  2. "Now syncing your transactions..."
  3. Call POST /api/plaid/sync-transactions with { connection_id }
  4. Show progress animation (pulsing dots or spinner)
  5. On completion: "✅ Synced {count} transactions! We found {total_carbon} kg of carbon in your spending."
  6. Preview: show top 3 highest-carbon transactions as a teaser list
  7. CTA: "View Your Carbon Dashboard →" → navigate to /dashboard

ERROR HANDLING:
- Plaid Link fails: "Something went wrong connecting your bank. Please try again."
- Exchange fails: "We couldn't process the connection. Try a different bank or skip for now."
- Sync fails: "Bank connected, but we're still processing your transactions. They'll appear soon!"
- In all error cases, show a "Try Again" button + "Skip" option

EDGE CASES:
- If user already has a connected bank → show it at top with "Add Another Bank" option
- Max 3 bank connections (for free tier — Pro unlimited)
- If free tier limit reached → show upgrade prompt: "Upgrade to Pro for unlimited bank connections"
```

---

## 📋 PROMPT 11 — App Layout + Navigation + Final Wiring

```
Build the main AppLayout with navigation and wire up all pages together.

1. APP LAYOUT COMPONENT (wraps all authenticated pages):

TOP BAR (fixed at top):
- Height: 56px
- Left: CarbonSense logo — "✦ CarbonSense" in brand font
- Center: Streak indicator — 🔥 fire icon + streak count number (e.g., "🔥 12")
  - Streak count comes from the auth store (fetched on app load)
  - If streak is 0: show dimmed/gray fire icon
  - Animate fire icon when streak increases
- Right: Notification bell icon (with red dot if unread) + user avatar (small circle, tappable → /profile)
- Background: dark blur/glass effect

BOTTOM TAB BAR (fixed at bottom, mobile):
- 5 tabs with icons + labels:
  🏠 Home (/home)
  📊 Dashboard (/dashboard)
  🎯 Challenges (/challenges)
  🌳 Impact (/impact)
  👤 Profile (/profile)
- Active tab: accent color (teal/green) icon + label + subtle indicator dot/line above
- Inactive tabs: muted gray
- Smooth icon transition on tab change
- Tab bar has glass/blur background
- On desktop: convert to side nav bar instead of bottom tabs

FLOATING AI BUTTON:
- Circular button, 56px, positioned bottom-right, 16px above tab bar, 16px from edge
- Gradient green-to-teal background
- Sparkle ✨ icon centered
- Subtle pulsing glow animation (CSS box-shadow pulse)
- On tap: opens AI Copilot panel (slide-up overlay from Prompt 6)
- Z-index above everything

2. ROUTING SETUP (React Router v6):
- / → redirect to /home if authenticated, /login if not
- /login → PublicOnlyRoute → LoginPage
- /signup → PublicOnlyRoute → SignupPage
- /onboarding → ProtectedRoute → OnboardingPage (no bottom nav)
- /home → ProtectedRoute + AppLayout → HomePage
- /dashboard → ProtectedRoute + AppLayout → DashboardPage
- /challenges → ProtectedRoute + AppLayout → ChallengesPage
- /impact → ProtectedRoute + AppLayout → ImpactPage
- /profile → ProtectedRoute + AppLayout → ProfilePage
- /teams → ProtectedRoute + AppLayout → TeamsPage
- /teams/:id → ProtectedRoute + AppLayout → TeamDetailPage
- /connect-bank → ProtectedRoute + AppLayout → ConnectBankPage
- /copilot → ProtectedRoute → CopilotPage (for direct URL access)
- * → 404 page with "Back to Home" link

3. GLOBAL STATE (Zustand stores):
- authStore: user, isAuthenticated, isLoading
- appStore: theme (dark/light), streakCount, notifications

4. REACT QUERY SETUP:
- QueryClientProvider wrapping the entire app
- Default staleTime: 5 minutes
- Default retry: 1
- Global error handler for 401 → logout + redirect

5. LOADING & ERROR STATES:
- Create a reusable LoadingSpinner component (animated leaf or circular spinner)
- Create a reusable ErrorState component ("Something went wrong" + retry button)
- Create a reusable EmptyState component (illustration + message + CTA)
- Use React Suspense boundaries with fallback loading for route transitions

6. TOAST NOTIFICATIONS:
- react-hot-toast configured globally
- Position: top-center on mobile, bottom-right on desktop
- Success toasts: green accent
- Error toasts: red accent
- Custom toast for achievements: shows achievement icon + name + XP

7. RESPONSIVE DESIGN:
- Mobile-first (375px base)
- Tablet: stacked layout, larger cards
- Desktop: max-width 480px centered container (phone-like feel) OR side-by-side layout
- Bottom tab bar → side nav on desktop (1024px+ breakpoint)

8. PAGE TRANSITIONS:
- Use Framer Motion AnimatePresence for page transitions
- Default: fade + slight slide-up for entering, fade out for exiting
- Duration: 200ms

9. FINAL CHECKLIST:
- All pages are connected and navigable
- Auth flow works end-to-end: signup → onboarding → home
- Protected routes redirect unauthenticated users
- API calls use the configured Axios instance with auth token
- Error boundaries catch and display errors gracefully
- Loading states shown during data fetches
- All tab navigation works
- AI Copilot FAB is visible on all authenticated pages
- Pull-to-refresh on mobile pages
- App is fully responsive
```

---

## 📋 PROMPT 12 — Polish & Final Touches

```
Final polish pass on the entire CarbonSense app.

1. ADD A PROPER 404 PAGE:
- Fun illustration (lost astronaut or wandering leaf)
- "Oops! This page doesn't exist"
- "Back to Home" button

2. ADD A LOADING/SPLASH SCREEN:
- Shown while Supabase auth state is being resolved on app load
- CarbonSense logo centered with subtle pulse animation
- Dark background matching app theme
- Disappears once auth state is determined

3. ADD ONBOARDING GUARD:
- After login, if user.onboarding_complete is false → force redirect to /onboarding
- User cannot navigate to any other page until onboarding is done
- Onboarding page has no tab bar or navigation

4. ADD EMPTY STATES for every page:
- Home with no challenge: "Your first challenge is loading... Check back soon!"
- Dashboard with no data: "Connect your bank or complete challenges to see your carbon data" + CTA
- Teams with no teams: illustration + "Join or create a team to start!"
- Impact with 0 saved: "Complete your first challenge to start growing your forest 🌱"
- Copilot empty: suggested prompts grid (already built in Prompt 6)

5. MICRO-ANIMATIONS (add if not already present):
- Card hover: subtle lift + shadow increase
- Button press: slight scale-down (0.97)
- Page transitions: fade + slide
- Number animations: count-up from 0 on first render
- Progress bars: fill animation with spring easing
- Achievement unlock: scale-up + glow pulse
- Streak fire: subtle flicker/wave animation (CSS keyframes)
- Pull-to-refresh: rotating leaf icon

6. ACCESSIBILITY:
- All interactive elements have aria-labels
- Color contrast meets WCAG AA standards
- Focus indicators on keyboard navigation
- Screen reader friendly navigation labels
- Skip to main content link

7. PERFORMANCE:
- Lazy load pages with React.lazy() + Suspense
- Debounce search/filter inputs
- Optimize images (use WebP where possible)
- Memoize expensive components with React.memo

8. META TAGS (in index.html):
- Title: "CarbonSense — Your AI Climate Coach"
- Description: "Track your carbon footprint, complete daily challenges, and join a community reducing their climate impact."
- Open Graph tags for social sharing
- Favicon: green leaf icon

9. ENVIRONMENT VARIABLES:
Make sure .env has:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
- VITE_API_URL (backend URL)
- VITE_PLAID_ENV (sandbox)

The app should now be fully functional, beautiful, and production-ready!
```

---

## ✅ DONE — Summary

After all 13 prompts (0-12), your Lovable frontend will have:

| Screen | Features |
|--------|----------|
| **Auth** | Login, Signup, Social auth, Password reset |
| **Onboarding** | 6-step quiz, Carbon Age reveal, challenge track selection |
| **Home** | Daily challenge card, streak, quick stats, AI insight |
| **Dashboard** | Carbon Age, trend charts, category donut, transaction list, comparisons |
| **Challenges** | Today/History/Library tabs, accept/complete/skip flow, confetti celebration |
| **AI Copilot** | Chat interface, suggested prompts, typing effect, slide-up panel |
| **Impact** | Virtual forest, lifetime stats, equivalencies, achievements gallery, share card |
| **Teams** | Create/join teams, leaderboards, team stats, invite system |
| **Profile** | Settings, notifications, bank connections, account management, GDPR delete |
| **Bank Connect** | Plaid Link integration, transaction sync, privacy assurances |
| **Navigation** | Bottom tabs, top bar, floating AI button, route protection |
| **Polish** | 404 page, splash screen, empty states, animations, accessibility |

**Connect Lovable frontend to your Codex backend and you're live! 🚀**
