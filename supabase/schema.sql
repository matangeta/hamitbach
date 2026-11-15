-- המטבח: schema for Supabase. Paste the whole file into Supabase > SQL Editor > New query > Run.
-- Safe to run again (drops and recreates policies/functions; tables are created only if missing).

create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles on delete cascade,
  title text not null,
  category text not null default 'אחר',
  tags text[] not null default '{}',
  body text not null default '',
  source_key text,                      -- original file name, used by import to link recipes to each other
  public_token uuid unique,             -- set = anyone with the link can view this one recipe
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recipes_owner on public.recipes (owner_id);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles on delete cascade,
  list text not null check (list in ('shopping', 'wishlist', 'restaurants')),
  section text not null default '',
  title text not null,
  note text not null default '',
  link text not null default '',
  extra jsonb not null default '{}',
  done boolean not null default false,
  position double precision not null default extract(epoch from now()),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists items_owner on public.items (owner_id, list);

-- one row per (owner, person, category). grantee_email lets you share with someone before they sign up.
create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles on delete cascade,
  grantee_email text not null,
  grantee_id uuid references public.profiles on delete cascade,
  scope text not null check (scope in ('recipes', 'shopping', 'wishlist', 'restaurants')),
  can_edit boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, grantee_email, scope)
);
create index if not exists shares_grantee on public.shares (grantee_id);

-- ---------- triggers ----------
create or replace function public.touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists recipes_touch on public.recipes;
create trigger recipes_touch before update on public.recipes for each row execute function public.touch();
drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items for each row execute function public.touch();

-- new auth user -> profile, and pick up shares that were waiting for this email
create or replace function public.on_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  update public.shares set grantee_id = new.id where grantee_id is null and grantee_email = lower(new.email);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.on_new_user();

-- a share by email -> resolve the person if they already have an account
create or replace function public.share_fill() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.grantee_email = lower(trim(new.grantee_email));
  select id into new.grantee_id from public.profiles where email = new.grantee_email;
  if new.grantee_id = new.owner_id then raise exception 'cannot share with yourself'; end if;
  return new;
end $$;
drop trigger if exists shares_fill on public.shares;
create trigger shares_fill before insert or update of grantee_email on public.shares for each row execute function public.share_fill();

-- ---------- access rule ----------
create or replace function public.can_access(owner uuid, what text, edit boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select owner = auth.uid() or exists (
    select 1 from public.shares s
    where s.owner_id = owner and s.grantee_id = auth.uid() and s.scope = what and (s.can_edit or not edit));
$$;

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.recipes enable row level security;
alter table public.items enable row level security;
alter table public.shares enable row level security;

drop policy if exists p_profiles_read on public.profiles;
create policy p_profiles_read on public.profiles for select to authenticated using (
  id = auth.uid()
  or exists (select 1 from public.shares s where (s.owner_id = profiles.id and s.grantee_id = auth.uid())
                                             or (s.grantee_id = profiles.id and s.owner_id = auth.uid())));
drop policy if exists p_profiles_update on public.profiles;
create policy p_profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists p_recipes_read on public.recipes;
create policy p_recipes_read on public.recipes for select to authenticated using (public.can_access(owner_id, 'recipes', false));
drop policy if exists p_recipes_insert on public.recipes;
create policy p_recipes_insert on public.recipes for insert to authenticated with check (public.can_access(owner_id, 'recipes', true));
drop policy if exists p_recipes_update on public.recipes;
create policy p_recipes_update on public.recipes for update to authenticated
  using (public.can_access(owner_id, 'recipes', true)) with check (public.can_access(owner_id, 'recipes', true));
drop policy if exists p_recipes_delete on public.recipes;
create policy p_recipes_delete on public.recipes for delete to authenticated using (public.can_access(owner_id, 'recipes', true));

drop policy if exists p_items_read on public.items;
create policy p_items_read on public.items for select to authenticated using (public.can_access(owner_id, list, false));
drop policy if exists p_items_insert on public.items;
create policy p_items_insert on public.items for insert to authenticated with check (public.can_access(owner_id, list, true));
drop policy if exists p_items_update on public.items;
create policy p_items_update on public.items for update to authenticated
  using (public.can_access(owner_id, list, true)) with check (public.can_access(owner_id, list, true));
drop policy if exists p_items_delete on public.items;
create policy p_items_delete on public.items for delete to authenticated using (public.can_access(owner_id, list, true));

drop policy if exists p_shares_read on public.shares;
create policy p_shares_read on public.shares for select to authenticated using (owner_id = auth.uid() or grantee_id = auth.uid());
drop policy if exists p_shares_insert on public.shares;
create policy p_shares_insert on public.shares for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists p_shares_update on public.shares;
create policy p_shares_update on public.shares for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists p_shares_delete on public.shares;
create policy p_shares_delete on public.shares for delete to authenticated using (owner_id = auth.uid() or grantee_id = auth.uid());

-- ---------- one recipe by public link (works without an account) ----------
create or replace function public.public_recipe(token uuid)
returns table (title text, category text, body text, owner_name text)
language sql stable security definer set search_path = public as $$
  select r.title, r.category, r.body, p.name from public.recipes r join public.profiles p on p.id = r.owner_id
  where r.public_token = token;
$$;
grant execute on function public.public_recipe(uuid) to anon, authenticated;

-- ---------- live updates (shared shopping list etc.) ----------
do $$ begin
  begin alter publication supabase_realtime add table public.items; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.recipes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.shares; exception when duplicate_object then null; end;
end $$;
