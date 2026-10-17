create table if not exists candidate_chat_sessions (
  candidate_id text primary key,
  session jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
