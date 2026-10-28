-- Server-only aggregate. No answer, session, score or submission is readable by browser roles.
create table public.parties (id text primary key, data jsonb not null, version bigint not null default 0);
create table public.party_revisions (id text primary key, version bigint not null default 0);
create table public.score_events (id text primary key, data jsonb not null);
create table public.rate_limits (key text primary key, count integer not null, expires bigint not null);
alter table public.parties enable row level security;
alter table public.party_revisions enable row level security;
alter table public.score_events enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.parties,public.party_revisions,public.score_events,public.rate_limits from anon,authenticated;
grant select on public.party_revisions to anon,authenticated;
create policy "Only non-secret revision numbers are public" on public.party_revisions for select to anon,authenticated using (true);
grant all on public.parties,public.party_revisions,public.score_events,public.rate_limits to service_role;

create function public.audit_party() returns trigger language plpgsql set search_path=public as $$
declare old_event jsonb; event jsonb;
begin
 if TG_OP='UPDATE' then
  for old_event in select value from jsonb_array_elements(OLD.data->'events') loop
   if not exists (select 1 from jsonb_array_elements(NEW.data->'events') x where x=old_event) then raise exception 'Score history is append-only'; end if;
  end loop;
 end if;
 for event in select value from jsonb_array_elements(NEW.data->'events') loop
  insert into score_events values(event->>'id',event) on conflict(id) do nothing;
 end loop;
 insert into party_revisions values(NEW.id,NEW.version) on conflict(id) do update set version=excluded.version;
 return NEW;
end $$;
create trigger party_audit after insert or update on public.parties for each row execute function public.audit_party();
create function public.immutable_event() returns trigger language plpgsql as $$ begin raise exception 'Score events are immutable'; end $$;
create trigger immutable_score before update or delete on public.score_events for each row execute function public.immutable_event();

-- The row lock and expected version serialize competing guesses, votes, and score writes.
create function public.commit_party(expected_version bigint,new_data jsonb) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update parties set data=new_data,version=version+1 where id='main' and version=expected_version;
 return found;
end $$;
revoke all on function public.commit_party(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.commit_party(bigint,jsonb) to service_role;
create function public.hit_rate_limit(bucket_key text,expiry bigint) returns integer language plpgsql security definer set search_path=public as $$
declare hits integer;
begin
 insert into rate_limits values(bucket_key,1,expiry) on conflict(key) do update set count=rate_limits.count+1 returning count into hits;
 delete from rate_limits where expires < (extract(epoch from now())*1000)::bigint;
 return hits;
end $$;
revoke all on function public.hit_rate_limit(text,bigint) from public,anon,authenticated;
grant execute on function public.hit_rate_limit(text,bigint) to service_role;

-- Only the revision table is published. Never add parties or score_events here.
alter publication supabase_realtime add table public.party_revisions;
insert into storage.buckets(id,name,public,file_size_limit) values('party-media','party-media',false,8388608) on conflict(id) do nothing;
-- No storage policies: browser roles cannot list/read/upload private media.
-- All access goes through authorized API routes with the server service role.
