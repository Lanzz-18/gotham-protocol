-- Gotham Protocol — cross-device sync schema.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- Two tables:
--   history  one row per logged action, keyed by the SAME id the engine
--            already generates locally, so pushing a local entry is always
--            an upsert — never a duplicate.
--   profile  one row per user holding config/settings/portraits as JSON.
--            Those change rarely and are never edited from two devices in
--            the same second, so last-write-wins is the right amount of
--            mechanism here — no per-field merge needed.

create table if not exists history (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  pillar      text not null,
  action      text not null,
  xp          integer not null,
  note        text not null default '',
  ts          bigint not null,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists history_user_id_idx on history (user_id);

create table if not exists profile (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  config      jsonb not null,
  settings    jsonb not null,
  portraits   jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table history enable row level security;
alter table profile enable row level security;

-- Each user can only ever see or touch their own rows. This is the entire
-- access-control story — the anon/publishable key is safe to ship in the
-- client precisely because these policies are the real gate.
create policy "history: owner only" on history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "profile: owner only" on profile
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
