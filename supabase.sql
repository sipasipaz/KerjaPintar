-- Run this once in Supabase → SQL Editor.
-- Creates the single table the app uses for all its data (areas, projects,
-- tasks, inbox), keyed per signed-in user, with row-level security so a
-- user can only ever see their own rows.

create table if not exists public.kv_store (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  shared boolean not null default false,
  value text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, key, shared)
);

alter table public.kv_store enable row level security;

create policy "Users can read their own rows"
  on public.kv_store for select
  using (auth.uid() = user_id);

create policy "Users can insert their own rows"
  on public.kv_store for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own rows"
  on public.kv_store for update
  using (auth.uid() = user_id);

create policy "Users can delete their own rows"
  on public.kv_store for delete
  using (auth.uid() = user_id);

-- Optional but recommended: speeds up the list() lookups (prefix search).
create index if not exists kv_store_user_key_idx on public.kv_store (user_id, key);
