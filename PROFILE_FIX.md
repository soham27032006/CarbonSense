# 👤 Codex Prompt — Fix Profile Page (Complete Crash)

> **Problem**: Profile page at /profile shows "This page didn't load. Something went wrong on our end." — completely crashed.
> 
> **Root cause analysis**: The GET /api/profile endpoint calls getProfile() which does Promise.all() with bank connections and teams. If ANY of these sub-queries throws, the entire profile endpoint returns 500. The frontend then shows a crash screen instead of handling the error gracefully.

---

## Paste this into Codex:

```
CRITICAL BUG: The Profile page (/profile) is completely CRASHED — showing 
"This page didn't load." Both backend and frontend need fixes.

===================================================================
PART A — BACKEND FIXES (carbonsense-api/)
===================================================================

### BACKEND FIX 1 — Make getProfile resilient to partial failures

In src/services/profile.service.ts, the getProfile function (line 12-42) 
uses Promise.all() for user data, bank connections, and teams. If bank 
connections or teams fail, the ENTIRE profile crashes.

REPLACE the getProfile function with a resilient version:

```typescript
export async function getProfile(userId: string) {
  // User data is required — if this fails, we should throw
  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (userError || !user) {
    throw new Error("Unable to load profile");
  }

  // Bank connections and teams are OPTIONAL — don't crash if they fail
  let bankConnections: any[] = [];
  let teams: any[] = [];

  try {
    bankConnections = await getProfileBankConnections(userId);
  } catch (err) {
    console.error("Failed to load bank connections for profile:", err);
    bankConnections = []; // Graceful fallback
  }

  try {
    teams = await getProfileTeams(userId);
  } catch (err) {
    console.error("Failed to load teams for profile:", err);
    teams = []; // Graceful fallback
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar_url: user.avatar_url,
    carbon_age: user.carbon_age,
    level: user.level,
    level_name: user.level_name,
    xp: user.xp,
    streak_count: user.streak_count,
    streak_max: user.streak_max,
    streak_freeze_available: user.streak_freeze_available,
    onboarding_complete: user.onboarding_complete,
    onboarding_data: user.onboarding_data,
    bank_connections: bankConnections,
    teams,
    member_since: user.created_at,
    notification_preferences: user.notification_preferences
  };
}
```

---

### BACKEND FIX 2 — Catch async errors in controller

In src/controllers/profile.controller.ts, the getProfileController (line 35-44) 
has a try/catch but throws using `throw toProfileError(error)`. The issue is 
that `throw` inside an async function without `next(error)` may not reach 
the Express error handler properly.

FIX: Add the `next` parameter and use it:

```typescript
import type { NextFunction, Request, Response } from "express";

export async function getProfileController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getProfile(requireUserId(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(toProfileError(error));
  }
}

export async function updateProfileController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = profileUpdateSchema.parse(req.body);
    const data = await updateProfile(requireUserId(req), input);
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }
    next(toProfileError(error));
  }
}

export async function getCarbonAgeController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getCarbonAgeDetail(requireUserId(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(toProfileError(error));
  }
}

export async function deleteProfileController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await deleteProfile(requireUserId(req));
    res.status(200).json(data);
  } catch (error) {
    next(toProfileError(error));
  }
}
```

---

### BACKEND FIX 3 — Check ALL other controllers for the same throw pattern

This bug likely exists in OTHER controllers too. Search for this pattern 
in ALL controller files:

```typescript
// BAD PATTERN (thrown error might not reach Express error handler):
} catch (error) {
  throw toSomethingError(error);
}

// GOOD PATTERN:
} catch (error) {
  next(toSomethingError(error));
}
```

Update ALL controller files to use `next(error)` instead of `throw`:
- carbon.controller.ts
- challenges.controller.ts
- copilot.controller.ts
- impact.controller.ts
- onboarding.controller.ts (if exists)
- plaid.controller.ts
- streaks.controller.ts
- teams.controller.ts

Add `NextFunction` as the third parameter to every controller function 
and replace `throw` with `next()` in catch blocks.

---

### BACKEND FIX 4 — Make plaid.service import safe

In profile.service.ts line 3: `import { disconnectBank } from "./plaid.service"`

If Plaid is not configured (no PLAID_CLIENT_ID env var), this import might 
crash at startup or when called. Make it safe:

```typescript
// Wrap disconnectBank call in deleteProfile to handle missing Plaid config
async function safeDisconnectBank(userId: string, connectionId: string) {
  try {
    await disconnectBank(userId, connectionId);
  } catch (err) {
    console.error(`Failed to disconnect bank ${connectionId}:`, err);
    // Continue with deletion even if Plaid disconnect fails
  }
}
```

Use `safeDisconnectBank` in deleteProfile instead of `disconnectBank`.

===================================================================
PART B — FRONTEND FIXES (carbonsense-web/)
===================================================================

### FRONTEND FIX 5 — Add Error Boundary to prevent full page crash

The Profile page crashes completely instead of showing a fallback.
Create a reusable ErrorBoundary component:

```tsx
// src/components/ErrorBoundary.tsx
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          padding: '24px',
          textAlign: 'center',
        }}>
          <span style={{ fontSize: '48px', marginBottom: '16px' }}>😵</span>
          <h2 style={{ marginBottom: '8px' }}>Something went wrong</h2>
          <p style={{ opacity: 0.7, marginBottom: '24px' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: '12px 24px',
              borderRadius: '12px',
              background: '#10b981',
              color: 'white',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Wrap the Profile page (and ALL other pages) with ErrorBoundary:
```tsx
// In App.tsx or route config:
<Route path="/profile" element={
  <ProtectedRoute>
    <ErrorBoundary>
      <ProfilePage />
    </ErrorBoundary>
  </ProtectedRoute>
} />
```

---

### FRONTEND FIX 6 — Fix Profile page component to handle API errors

Find the Profile page component and update it to handle loading and 
error states properly:

```tsx
// src/pages/ProfilePage.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const { data: profile, isLoading, error, refetch } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await api.get('/profile');
      // Handle wrapped response: { success: true, data: {...} }
      return res.data?.data || res.data;
    },
    retry: 2,
    retryDelay: 1000,
  });

  const { data: streakData } = useQuery({
    queryKey: ['streaks'],
    queryFn: async () => {
      const res = await api.get('/streaks');
      return res.data?.data || res.data;
    },
    retry: 1,
  });

  const { data: levelData } = useQuery({
    queryKey: ['level'],
    queryFn: async () => {
      const res = await api.get('/level');
      return res.data?.data || res.data;
    },
    retry: 1,
  });

  // ---- Loading State ----
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
      }}>
        <div className="spinner" />
        <p style={{ marginLeft: '12px', opacity: 0.7 }}>Loading profile...</p>
      </div>
    );
  }

  // ---- Error State ----
  if (error || !profile) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '24px',
        textAlign: 'center',
      }}>
        <span style={{ fontSize: '48px', marginBottom: '16px' }}>😵</span>
        <h2>Couldn't load your profile</h2>
        <p style={{ opacity: 0.7, marginBottom: '24px' }}>
          {(error as any)?.message || 'Please check your connection and try again'}
        </p>
        <button onClick={() => refetch()} style={{
          padding: '12px 24px',
          borderRadius: '12px',
          background: '#10b981',
          color: 'white',
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
        }}>
          Try Again
        </button>
      </div>
    );
  }

  // ---- Handler Functions ----
  const handleLogout = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate('/login');
    toast.success('Logged out successfully');
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.prompt(
      'This will PERMANENTLY delete all your data. Type "DELETE" to confirm:'
    );
    if (confirmed !== 'DELETE') {
      toast.error('Account deletion cancelled');
      return;
    }
    try {
      await api.delete('/profile');
      await supabase.auth.signOut();
      queryClient.clear();
      navigate('/login');
      toast.success('Account deleted. We\'re sorry to see you go 🌍');
    } catch (err) {
      toast.error('Failed to delete account. Please try again.');
    }
  };

  // ---- Render Profile ----
  return (
    <div className="page-container">
      
      {/* SECTION 1: Profile Header */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 0',
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #10b981, #059669)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '32px',
          color: 'white',
          fontWeight: 700,
          border: '3px solid #34d399',
        }}>
          {profile.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <h2 style={{ marginTop: '12px', marginBottom: '4px' }}>{profile.name}</h2>
        <p style={{ opacity: 0.6, fontSize: '14px' }}>{profile.email}</p>
        <p style={{ 
          marginTop: '8px',
          padding: '4px 12px',
          borderRadius: '20px',
          background: 'rgba(16, 185, 129, 0.15)',
          color: '#34d399',
          fontSize: '13px',
          fontWeight: 600,
        }}>
          🌱 Level {profile.level} · {profile.level_name}
        </p>
        <p style={{ opacity: 0.5, fontSize: '12px', marginTop: '8px' }}>
          Member since {new Date(profile.member_since).toLocaleDateString('en-US', { 
            month: 'long', year: 'numeric' 
          })}
        </p>
      </div>

      {/* SECTION 2: Quick Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px',
        marginBottom: '24px',
      }}>
        {[
          { icon: '🔥', value: profile.streak_count || 0, label: 'Streak' },
          { icon: '⭐', value: profile.xp || 0, label: 'XP' },
          { icon: '🎯', value: profile.carbon_age || '--', label: 'Carbon Age' },
          { icon: '🏆', value: profile.streak_max || 0, label: 'Best Streak' },
        ].map((stat, i) => (
          <div key={i} style={{
            textAlign: 'center',
            padding: '12px 8px',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.05)',
          }}>
            <span style={{ fontSize: '20px' }}>{stat.icon}</span>
            <p style={{ fontWeight: 700, fontSize: '18px', margin: '4px 0' }}>{stat.value}</p>
            <p style={{ fontSize: '11px', opacity: 0.6 }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* SECTION 3: Connected Banks */}
      <div style={{
        marginBottom: '24px',
        padding: '16px',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.05)',
      }}>
        <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>🏦 Bank Accounts</h3>
        {profile.bank_connections && profile.bank_connections.length > 0 ? (
          profile.bank_connections.map((bank: any) => (
            <div key={bank.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 0',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div>
                <p style={{ fontWeight: 600 }}>{bank.institution_name}</p>
                <p style={{ fontSize: '12px', opacity: 0.5 }}>
                  {bank.status === 'active' ? '✅ Active' : '⚠️ Error'} · 
                  Last synced: {bank.last_synced 
                    ? new Date(bank.last_synced).toLocaleDateString() 
                    : 'Never'}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '16px', opacity: 0.6 }}>
            <p>No bank accounts connected</p>
            <button onClick={() => navigate('/connect-bank')} style={{
              marginTop: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
            }}>
              + Connect Bank
            </button>
          </div>
        )}
      </div>

      {/* SECTION 4: My Teams */}
      <div style={{
        marginBottom: '24px',
        padding: '16px',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.05)',
      }}>
        <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>👥 My Teams</h3>
        {profile.teams && profile.teams.length > 0 ? (
          profile.teams.map((team: any) => (
            <div key={team.id} onClick={() => navigate(`/teams/${team.id}`)} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 0',
              cursor: 'pointer',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div>
                <p style={{ fontWeight: 600 }}>{team.name}</p>
                <p style={{ fontSize: '12px', opacity: 0.5 }}>
                  {team.type} · {team.member_count} members
                </p>
              </div>
              <span style={{ opacity: 0.4 }}>→</span>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '16px', opacity: 0.6 }}>
            <p>No teams yet</p>
            <button onClick={() => navigate('/teams')} style={{
              marginTop: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
            }}>
              Join or Create Team
            </button>
          </div>
        )}
      </div>

      {/* SECTION 5: App Settings */}
      <div style={{
        marginBottom: '24px',
        padding: '16px',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.05)',
      }}>
        <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>⚙️ Settings</h3>
        
        {/* About */}
        <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ fontWeight: 500 }}>About CarbonSense</p>
          <p style={{ fontSize: '12px', opacity: 0.5 }}>Version 1.0.0 · Hackathon Edition</p>
        </div>
        
        {/* Carbon Age explained */}
        <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
          onClick={() => toast('Carbon Age = Real Age + (Annual CO2 - Target) × 2\nTarget: 4 tons/year (Paris-aligned)', { icon: '🧮', duration: 6000 })}
        >
          <p style={{ fontWeight: 500 }}>How Carbon Age Works</p>
          <p style={{ fontSize: '12px', opacity: 0.5 }}>Tap to learn about the formula</p>
        </div>

        {/* Data Sources */}
        <div style={{ padding: '12px 0', cursor: 'pointer' }}
          onClick={() => toast('Sources: EPA, DEFRA, Climatiq emission factors', { icon: '📊', duration: 4000 })}
        >
          <p style={{ fontWeight: 500 }}>Data Sources</p>
          <p style={{ fontSize: '12px', opacity: 0.5 }}>EPA, DEFRA, Climatiq</p>
        </div>
      </div>

      {/* SECTION 6: Account Actions */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginBottom: '48px',
        padding: '16px',
      }}>
        <button onClick={handleLogout} style={{
          padding: '14px',
          borderRadius: '12px',
          background: 'transparent',
          border: '1px solid rgba(239, 68, 68, 0.5)',
          color: '#ef4444',
          fontWeight: 600,
          cursor: 'pointer',
          fontSize: '15px',
        }}>
          Log Out
        </button>
        
        <button onClick={handleDeleteAccount} style={{
          padding: '12px',
          background: 'transparent',
          border: 'none',
          color: 'rgba(239, 68, 68, 0.6)',
          cursor: 'pointer',
          fontSize: '13px',
        }}>
          Delete Account
        </button>
      </div>
    </div>
  );
}
```

---

### FRONTEND FIX 7 — Fix response unwrapping

The backend wraps ALL responses in { success: true, data: {...} }.
Make sure the frontend consistently unwraps this. Check the API client:

If the api client (src/lib/api.ts or similar) doesn't auto-unwrap, 
add a response interceptor:

```typescript
api.interceptors.response.use(
  (response) => {
    // Auto-unwrap { success: true, data: ... } pattern
    if (response.data && typeof response.data === 'object' && 'data' in response.data) {
      response.data = response.data.data;
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Auto-logout on 401
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

If this interceptor already exists, make sure the Profile page doesn't 
DOUBLE-unwrap (i.e., don't do response.data.data if the interceptor 
already unwraps to response.data).

---

### FRONTEND FIX 8 — Add Error Boundaries to ALL route pages

Wrap every route with ErrorBoundary (not just Profile):

```tsx
// In App.tsx or router config:
import { ErrorBoundary } from './components/ErrorBoundary';

const routes = [
  { path: '/home', element: <HomePage /> },
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/challenges', element: <ChallengesPage /> },
  { path: '/impact', element: <ImpactPage /> },
  { path: '/profile', element: <ProfilePage /> },
  { path: '/teams', element: <TeamsPage /> },
  { path: '/teams/:id', element: <TeamDetailPage /> },
  { path: '/connect-bank', element: <ConnectBankPage /> },
];

// Wrap each:
{routes.map(route => (
  <Route key={route.path} path={route.path} element={
    <ProtectedRoute>
      <ErrorBoundary>
        {route.element}
      </ErrorBoundary>
    </ProtectedRoute>
  } />
))}
```

---

### FRONTEND FIX 9 — Check that Profile page component EXISTS

Verify that the Profile page component file actually exists at the 
expected path. Check these common locations:
- src/pages/ProfilePage.tsx
- src/pages/Profile.tsx  
- src/pages/profile/index.tsx
- src/components/pages/Profile.tsx

If the file exists but has a compile error (TypeScript error, missing 
import, etc.), fix the compile error.

If the file DOESN'T exist, create it using the complete component code 
from Frontend Fix 6 above.

Also verify the route in the router config points to the correct 
component with the correct import path.

===================================================================
VERIFICATION CHECKLIST:
===================================================================

After all fixes, test:

1. [ ] Navigate to /profile — page loads without crash
2. [ ] Profile header shows: avatar, name, email, level badge, member since
3. [ ] Quick stats show: streak, XP, carbon age, best streak
4. [ ] Bank accounts section shows connected banks or "Connect" CTA
5. [ ] Teams section shows teams or "Join/Create" CTA  
6. [ ] Settings section shows app info, carbon age explanation
7. [ ] Log Out button works → redirects to /login
8. [ ] Delete Account shows confirmation → works on "DELETE" typed
9. [ ] Page shows loading state while fetching
10. [ ] Page shows error state with "Try Again" if API fails
11. [ ] No console errors
12. [ ] No TypeScript compilation errors
13. [ ] Backend GET /api/profile returns 200 with all data
14. [ ] Backend doesn't crash if bank_connections table is empty
15. [ ] Backend doesn't crash if team_memberships table is empty
```
