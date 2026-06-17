# CarbonSense Quick Test

Set these first:

```bash
export API_URL="http://localhost:3001"
export TOKEN="paste_access_token_after_login"
export ADMIN_JOB_SECRET="paste_admin_job_secret"
export CHALLENGE_ID="paste_today_challenge_id"
export TEAM_ID="paste_team_id"
export CONNECTION_ID="paste_bank_connection_id"
```

## Health

```bash
curl "$API_URL/api/health"
```

## Auth

```bash
curl -X POST "$API_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'

curl -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

curl "$API_URL/api/auth/me" \
  -H "Authorization: Bearer $TOKEN"
```

## Onboarding

```bash
curl -X POST "$API_URL/api/onboarding/quiz" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"transport_mode":"mixed","meat_frequency":"few_times_week","monthly_spending":"2k_to_5k","flight_frequency":"1_2_yearly","motivation":"save_money","household_size":2,"country":"US","biological_age":30}'

curl -X POST "$API_URL/api/onboarding/complete" \
  -H "Authorization: Bearer $TOKEN"
```

## Carbon Dashboard

```bash
curl "$API_URL/api/carbon/dashboard" \
  -H "Authorization: Bearer $TOKEN"

curl "$API_URL/api/carbon/transactions?page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"

curl "$API_URL/api/carbon/trends?period=weekly&range=12" \
  -H "Authorization: Bearer $TOKEN"

curl "$API_URL/api/carbon/category/food" \
  -H "Authorization: Bearer $TOKEN"

curl "$API_URL/api/carbon/compare" \
  -H "Authorization: Bearer $TOKEN"
```

## Challenges And Streaks

```bash
curl "$API_URL/api/challenges/today" \
  -H "Authorization: Bearer $TOKEN"

curl -X POST "$API_URL/api/challenges/$CHALLENGE_ID/accept" \
  -H "Authorization: Bearer $TOKEN"

curl -X POST "$API_URL/api/challenges/$CHALLENGE_ID/complete" \
  -H "Authorization: Bearer $TOKEN"

curl -X POST "$API_URL/api/challenges/$CHALLENGE_ID/skip" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Not practical today"}'

curl "$API_URL/api/challenges/history?page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"

curl "$API_URL/api/streaks" \
  -H "Authorization: Bearer $TOKEN"

curl -X POST "$API_URL/api/streaks/freeze" \
  -H "Authorization: Bearer $TOKEN"

curl "$API_URL/api/achievements" \
  -H "Authorization: Bearer $TOKEN"

curl "$API_URL/api/level" \
  -H "Authorization: Bearer $TOKEN"
```

## Copilot

```bash
curl -X POST "$API_URL/api/copilot/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"What is my biggest carbon category and what should I do next?"}'

curl "$API_URL/api/copilot/suggestions" \
  -H "Authorization: Bearer $TOKEN"

curl "$API_URL/api/copilot/history" \
  -H "Authorization: Bearer $TOKEN"
```

## Teams

```bash
curl -X POST "$API_URL/api/teams/create" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Climate Crew","type":"friends","description":"Friends lowering carbon together"}'

curl -X POST "$API_URL/api/teams/join/INVITECODE" \
  -H "Authorization: Bearer $TOKEN"

curl "$API_URL/api/teams/my-teams" \
  -H "Authorization: Bearer $TOKEN"

curl "$API_URL/api/teams/$TEAM_ID" \
  -H "Authorization: Bearer $TOKEN"

curl "$API_URL/api/teams/$TEAM_ID/leaderboard?period=week" \
  -H "Authorization: Bearer $TOKEN"
```

## Impact And Profile

```bash
curl "$API_URL/api/impact/total" \
  -H "Authorization: Bearer $TOKEN"

curl "$API_URL/api/impact/equivalencies" \
  -H "Authorization: Bearer $TOKEN"

curl "$API_URL/api/impact/share-card" \
  -H "Authorization: Bearer $TOKEN"

curl "$API_URL/api/profile" \
  -H "Authorization: Bearer $TOKEN"

curl -X PATCH "$API_URL/api/profile" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated User","notification_preferences":{"daily_reminder":true}}'

curl "$API_URL/api/profile/carbon-age" \
  -H "Authorization: Bearer $TOKEN"
```

## Plaid

```bash
curl -X POST "$API_URL/api/plaid/create-link-token" \
  -H "Authorization: Bearer $TOKEN"

curl -X POST "$API_URL/api/plaid/exchange-token" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"public_token":"public-sandbox-token","institution":{"id":"ins_109508","name":"First Platypus Bank"}}'

curl -X POST "$API_URL/api/plaid/sync-transactions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"connection_id":"'"$CONNECTION_ID"'"}'

curl -X DELETE "$API_URL/api/plaid/disconnect/$CONNECTION_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## Admin Daily Jobs

```bash
curl "$API_URL/api/admin/run-daily-jobs" \
  -H "x-admin-secret: $ADMIN_JOB_SECRET"
```

## Account Deletion

```bash
curl -X DELETE "$API_URL/api/profile" \
  -H "Authorization: Bearer $TOKEN"
```
