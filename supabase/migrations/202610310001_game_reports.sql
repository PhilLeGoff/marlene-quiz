-- End-of-game reports, one per party generation. Server-only, like the party itself.
create table if not exists public.game_reports (id text primary key, generation bigint not null, room text not null, started_at bigint not null, finished_at bigint not null, archived boolean not null default false, data jsonb not null);
create index if not exists game_reports_finished_at on public.game_reports (finished_at);
alter table public.game_reports enable row level security;
revoke all on public.game_reports from anon,authenticated;
grant all on public.game_reports to service_role;
