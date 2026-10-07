-- Rotina do "Meu app" (blocos fixos e compromissos do dia). Rodar uma vez no SQL Editor do Supabase.
-- Uma linha por pessoa (user_id = auth.uid()); ninguem le ou grava a rotina de outra pessoa.
create table if not exists public.routines (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 200000),
  updated_at timestamptz not null default now()
);

alter table public.routines enable row level security;

drop policy if exists "rotina: dona le" on public.routines;
drop policy if exists "rotina: dona cria" on public.routines;
drop policy if exists "rotina: dona altera" on public.routines;

create policy "rotina: dona le" on public.routines
  for select to authenticated using (user_id = auth.uid());
create policy "rotina: dona cria" on public.routines
  for insert to authenticated with check (user_id = auth.uid());
create policy "rotina: dona altera" on public.routines
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.routines from anon;
grant select, insert, update on public.routines to authenticated;
