-- Notas do "Meu app". Rodar uma vez no SQL Editor do Supabase.
-- Cada nota pertence a quem criou (user_id = auth.uid()); ninguem le ou grava nota de outra pessoa.
create table if not exists public.notes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 100000),
  pinned boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_updated on public.notes (user_id, updated_at desc);

alter table public.notes enable row level security;

drop policy if exists "notas: dona le" on public.notes;
drop policy if exists "notas: dona cria" on public.notes;
drop policy if exists "notas: dona altera" on public.notes;

create policy "notas: dona le" on public.notes
  for select to authenticated using (user_id = auth.uid());
create policy "notas: dona cria" on public.notes
  for insert to authenticated with check (user_id = auth.uid());
create policy "notas: dona altera" on public.notes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- sem policy de delete: o app apaga marcando deleted = true, para o apagar chegar aos outros aparelhos

revoke all on public.notes from anon;
grant select, insert, update on public.notes to authenticated;
