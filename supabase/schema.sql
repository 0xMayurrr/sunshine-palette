-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Migration: add attendance column if not exists
alter table public.meetings add column if not exists attendance text default null;

-- 1. PROFILES TABLE
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid unique not null references auth.users(id) on delete cascade,
  name text,
  email text,
  role text default 'Founder',
  avatar_url text,
  default_reminder_emails text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. MEETINGS TABLE
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  client_name text,
  description text,
  date date not null,
  start_time text not null,
  end_time text not null,
  meeting_type text not null default 'Client Meeting',
  color text not null default 'Client Meeting',
  meeting_link text,
  google_event_id text,
  google_meet_link text,
  reminder_emails text[] default '{}',
  status text not null default 'scheduled',
  attendance text default null, -- 'attending' | 'not_attending' | null
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_meetings_user_id on public.meetings(user_id);
create index if not exists idx_meetings_date on public.meetings(date);
create index if not exists idx_meetings_status on public.meetings(status);

-- 3. REMINDERS TABLE
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_type text not null,
  minutes_before integer not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending', -- ('pending', 'processing', 'sent', 'failed', 'cancelled')
  reminder_emails text[] default '{}',
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- Indexes for reminder scheduler
create index if not exists idx_reminders_status_scheduled on public.reminders(status, scheduled_for);
create index if not exists idx_reminders_meeting_id on public.reminders(meeting_id);

-- 4. GOOGLE CONNECTIONS TABLE
create table if not exists public.google_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  google_account_email text,
  access_token text not null,
  refresh_token text,
  token_expiry bigint,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_google_connections_user_id on public.google_connections(user_id);

-- ROW LEVEL SECURITY (RLS) POLICIES
alter table public.profiles enable row level security;
alter table public.meetings enable row level security;
alter table public.reminders enable row level security;
alter table public.google_connections enable row level security;

-- Profiles Policies
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = user_id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = user_id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = user_id);

-- Meetings Policies
create policy "Users can view own meetings" on public.meetings for select using (auth.uid() = user_id);
create policy "Users can insert own meetings" on public.meetings for insert with check (auth.uid() = user_id);
create policy "Users can update own meetings" on public.meetings for update using (auth.uid() = user_id);
create policy "Users can delete own meetings" on public.meetings for delete using (auth.uid() = user_id);

-- Reminders Policies
create policy "Users can view own reminders" on public.reminders for select using (auth.uid() = user_id);
create policy "Users can insert own reminders" on public.reminders for insert with check (auth.uid() = user_id);
create policy "Users can update own reminders" on public.reminders for update using (auth.uid() = user_id);
create policy "Users can delete own reminders" on public.reminders for delete using (auth.uid() = user_id);

-- Google Connections Policies
create policy "Users can view own google connection" on public.google_connections for select using (auth.uid() = user_id);
create policy "Users can insert own google connection" on public.google_connections for insert with check (auth.uid() = user_id);
create policy "Users can update own google connection" on public.google_connections for update using (auth.uid() = user_id);
create policy "Users can delete own google connection" on public.google_connections for delete using (auth.uid() = user_id);

-- TRIGGER TO AUTOMATICALLY CREATE PROFILE ON SIGNUP
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, user_id, name, email, role)
  values (
    new.id,
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'Founder'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. SUPABASE AUTOMATED CRON SCHEDULER (pg_cron + pg_net)
-- Enables 100% automated 1-minute reminder processing directly inside Supabase Database
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule 1-minute HTTP trigger in Supabase
select cron.schedule(
  'process-due-reminders-job',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://calendar.buildicy.com/api/cron?secret=reminders@buildicy.com'
  );
  $$
);

