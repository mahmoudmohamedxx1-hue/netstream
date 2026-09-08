-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  NetStream — Supabase schema (IDEMPOTENT — safe to run multiple times) ║
-- ║                                                                        ║
-- ║  Run this in the Supabase SQL Editor (Dashboard → SQL → New query).     ║
-- ║  Creates the `likes` + `watch_progress` tables with RLS policies.       ║
-- ║                                                                        ║
-- ║  Every CREATE uses IF NOT EXISTS, and every policy is DROPped first     ║
-- ║  so re-running this script won't error on already-existing objects.    ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) likes table — real cross-user likes
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.likes (
  user_id    uuid  not null references auth.users(id) on delete cascade,
  imdb_id    text  not null,
  title      text,
  type       text check (type in ('movie','series')),
  poster     text,
  created_at timestamptz not null default now(),
  primary key (user_id, imdb_id)
);

create index if not exists likes_imdb_id_idx on public.likes (imdb_id);
create index if not exists likes_user_id_idx on public.likes (user_id);

alter table public.likes enable row level security;

-- Drop existing policies first (idempotent — no error if already gone)
drop policy if exists "Likes are readable by everyone" on public.likes;
drop policy if exists "Users can like (insert own row)" on public.likes;
drop policy if exists "Users can unlike (delete own row)" on public.likes;

-- Anyone (even anon) can read likes — powers the public like-count badges.
create policy "Likes are readable by everyone"
  on public.likes for select
  using (true);

-- Signed-in users can INSERT only their OWN like.
create policy "Users can like (insert own row)"
  on public.likes for insert
  with check (auth.uid() = user_id);

-- Signed-in users can DELETE only their OWN like (unlike).
create policy "Users can unlike (delete own row)"
  on public.likes for delete
  using (auth.uid() = user_id);

-- Add to realtime publication (idempotent — checks membership first)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'likes'
  ) then
    alter publication supabase_realtime add table public.likes;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) watch_progress — per-user resume-watching (Netflix-style exact resume)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.watch_progress (
  user_id    uuid    not null references auth.users(id) on delete cascade,
  imdb_id    text    not null,
  title      text,
  type       text    check (type in ('movie','series')),
  poster     text,
  season     int,
  episode    int,
  position   numeric not null default 0,
  duration   numeric,
  updated_at timestamptz not null default now(),
  primary key (user_id, imdb_id, season, episode)
);

create index if not exists watch_progress_user_idx
  on public.watch_progress (user_id, updated_at desc);

alter table public.watch_progress enable row level security;

-- Drop existing policies first (idempotent)
drop policy if exists "Users can read own progress" on public.watch_progress;
drop policy if exists "Users can upsert own progress" on public.watch_progress;
drop policy if exists "Users can update own progress" on public.watch_progress;
drop policy if exists "Users can delete own progress" on public.watch_progress;

create policy "Users can read own progress"
  on public.watch_progress for select
  using (auth.uid() = user_id);

create policy "Users can upsert own progress"
  on public.watch_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update own progress"
  on public.watch_progress for update
  using (auth.uid() = user_id);

create policy "Users can delete own progress"
  on public.watch_progress for delete
  using (auth.uid() = user_id);

-- Add to realtime publication (idempotent — checks membership first)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'watch_progress'
  ) then
    alter publication supabase_realtime add table public.watch_progress;
  end if;
end $$;
