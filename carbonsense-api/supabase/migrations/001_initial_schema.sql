CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  avatar_url text,
  carbon_age integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  level_name text NOT NULL DEFAULT 'Carbon Curious',
  xp integer NOT NULL DEFAULT 0,
  streak_count integer NOT NULL DEFAULT 0,
  streak_max integer NOT NULL DEFAULT 0,
  streak_freeze_available boolean NOT NULL DEFAULT true,
  streak_last_checked_date date,
  onboarding_complete boolean NOT NULL DEFAULT false,
  onboarding_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  notification_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_auth_user_fk FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE public.bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plaid_access_token text NOT NULL,
  plaid_item_id text NOT NULL,
  plaid_cursor text,
  institution_name text NOT NULL,
  institution_logo text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'disconnected')),
  last_synced timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bank_connection_id uuid REFERENCES public.bank_connections(id) ON DELETE SET NULL,
  plaid_transaction_id text UNIQUE,
  merchant_name text NOT NULL,
  merchant_category text NOT NULL,
  amount decimal NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  carbon_kg decimal NOT NULL,
  carbon_category text NOT NULL CHECK (carbon_category IN ('food', 'transport', 'home', 'shopping', 'travel', 'other')),
  carbon_confidence decimal NOT NULL CHECK (carbon_confidence >= 0 AND carbon_confidence <= 1),
  carbon_source text NOT NULL CHECK (carbon_source IN ('ai', 'manual', 'emission_factor')),
  transaction_date date NOT NULL,
  is_removed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('food', 'transport', 'home', 'shopping', 'lifestyle')),
  difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  carbon_save_kg decimal NOT NULL,
  xp_reward integer NOT NULL,
  tips text[] NOT NULL DEFAULT ARRAY[]::text[],
  icon text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  date_assigned date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'completed', 'skipped')),
  skip_reason text,
  completed_at timestamptz,
  xp_earned integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('neighborhood', 'employer', 'friends', 'custom')),
  description text,
  invite_code text UNIQUE NOT NULL,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  member_count integer NOT NULL DEFAULT 1,
  total_carbon_saved_kg decimal NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.team_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

CREATE TABLE public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  condition_type text NOT NULL CHECK (condition_type IN ('streak', 'challenges_completed', 'carbon_saved', 'level', 'custom')),
  threshold integer NOT NULL,
  xp_reward integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

CREATE TABLE public.carbon_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  period_type text NOT NULL CHECK (period_type IN ('day', 'week', 'month')),
  period_start date NOT NULL,
  total_carbon_kg decimal NOT NULL,
  food_kg decimal NOT NULL,
  transport_kg decimal NOT NULL,
  home_kg decimal NOT NULL,
  shopping_kg decimal NOT NULL,
  travel_kg decimal NOT NULL,
  other_kg decimal NOT NULL,
  challenge_savings_kg decimal NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_type, period_start)
);

CREATE TABLE public.copilot_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  messages jsonb[] NOT NULL DEFAULT ARRAY[]::jsonb[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bank_connections_user_id_idx ON public.bank_connections(user_id);
CREATE INDEX bank_connections_plaid_item_id_idx ON public.bank_connections(plaid_item_id);
CREATE INDEX transactions_user_id_transaction_date_idx ON public.transactions(user_id, transaction_date DESC);
CREATE INDEX transactions_bank_connection_id_idx ON public.transactions(bank_connection_id);
CREATE INDEX transactions_carbon_category_idx ON public.transactions(carbon_category);
CREATE INDEX challenges_category_difficulty_idx ON public.challenges(category, difficulty);
CREATE INDEX challenges_is_active_idx ON public.challenges(is_active);
CREATE INDEX user_challenges_user_id_date_assigned_idx ON public.user_challenges(user_id, date_assigned DESC);
CREATE INDEX user_challenges_challenge_id_idx ON public.user_challenges(challenge_id);
CREATE INDEX teams_created_by_idx ON public.teams(created_by);
CREATE INDEX teams_invite_code_idx ON public.teams(invite_code);
CREATE INDEX team_memberships_team_id_idx ON public.team_memberships(team_id);
CREATE INDEX team_memberships_user_id_idx ON public.team_memberships(user_id);
CREATE INDEX user_achievements_user_id_idx ON public.user_achievements(user_id);
CREATE INDEX carbon_summaries_user_period_idx ON public.carbon_summaries(user_id, period_type, period_start DESC);
CREATE INDEX copilot_conversations_user_id_updated_at_idx ON public.copilot_conversations(user_id, updated_at DESC);

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER copilot_conversations_set_updated_at
BEFORE UPDATE ON public.copilot_conversations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carbon_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can delete own profile" ON public.users
  FOR DELETE USING (auth.uid() = id);

CREATE POLICY "Users can read own bank connections" ON public.bank_connections
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bank connections" ON public.bank_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bank connections" ON public.bank_connections
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own bank connections" ON public.bank_connections
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can read own transactions" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON public.transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transactions" ON public.transactions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own transactions" ON public.transactions
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can read active challenges" ON public.challenges
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "Users can read own challenge assignments" ON public.user_challenges
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own challenge assignments" ON public.user_challenges
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own challenge assignments" ON public.user_challenges
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own challenge assignments" ON public.user_challenges
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can read teams they belong to" ON public.teams
  FOR SELECT USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_memberships
      WHERE team_memberships.team_id = teams.id
      AND team_memberships.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can create own teams" ON public.teams
  FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Team creators can update teams" ON public.teams
  FOR UPDATE USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Team creators can delete teams" ON public.teams
  FOR DELETE USING (auth.uid() = created_by);

CREATE POLICY "Users can read own team memberships" ON public.team_memberships
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own team memberships" ON public.team_memberships
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own team memberships" ON public.team_memberships
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own team memberships" ON public.team_memberships
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can read achievements" ON public.achievements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can read own earned achievements" ON public.user_achievements
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own earned achievements" ON public.user_achievements
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own earned achievements" ON public.user_achievements
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own earned achievements" ON public.user_achievements
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can read own carbon summaries" ON public.carbon_summaries
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own carbon summaries" ON public.carbon_summaries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own carbon summaries" ON public.carbon_summaries
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own carbon summaries" ON public.carbon_summaries
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can read own copilot conversations" ON public.copilot_conversations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own copilot conversations" ON public.copilot_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own copilot conversations" ON public.copilot_conversations
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own copilot conversations" ON public.copilot_conversations
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.create_team_with_admin(
  p_user_id uuid,
  p_name text,
  p_type text,
  p_description text,
  p_invite_code text
)
RETURNS public.teams AS $$
DECLARE
  created_team public.teams;
BEGIN
  INSERT INTO public.teams (name, type, description, invite_code, created_by)
  VALUES (p_name, p_type, p_description, p_invite_code, p_user_id)
  RETURNING * INTO created_team;

  INSERT INTO public.team_memberships (team_id, user_id, role)
  VALUES (created_team.id, p_user_id, 'admin');

  RETURN created_team;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.join_team_atomic(
  p_user_id uuid,
  p_invite_code text
)
RETURNS public.teams AS $$
DECLARE
  found_team public.teams;
BEGIN
  SELECT * INTO found_team
  FROM public.teams
  WHERE invite_code = p_invite_code;

  IF found_team.id IS NULL THEN
    RAISE EXCEPTION 'TEAM_NOT_FOUND';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.team_memberships
    WHERE team_id = found_team.id
    AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'ALREADY_TEAM_MEMBER';
  END IF;

  INSERT INTO public.team_memberships (team_id, user_id, role)
  VALUES (found_team.id, p_user_id, 'member');

  UPDATE public.teams
  SET member_count = member_count + 1
  WHERE id = found_team.id
  RETURNING * INTO found_team;

  RETURN found_team;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
