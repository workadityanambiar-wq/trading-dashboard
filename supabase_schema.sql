-- Run this in your Supabase project: SQL Editor → New query → paste → Run

-- Watchlist table (one row per user, stores tickers as an array)
create table if not exists user_watchlists (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  tickers    text[]    not null default '{}',
  updated_at timestamptz not null default now()
);

-- Row Level Security: users can only read/write their own row
alter table user_watchlists enable row level security;

create policy "Users manage their own watchlist"
  on user_watchlists
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
