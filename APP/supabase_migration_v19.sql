-- v19: Atividade "Visitas" + perfil Recepção Rottas + lista mestra Gerentes House
-- ============================================================================
-- 1. Nova lista mestra: gerentes_house
-- 2. Novas colunas em atividades para suportar tipo='visita'
-- 3. Atualização do CHECK constraint de tipo (inclui 'visita')
-- 4. Tabela de auditoria visitas_imports
-- 5. Policies RLS para o novo role 'recepcao_rottas'
-- ============================================================================

-- ─── 1. LISTA MESTRA: GERENTES HOUSE ──────────────────────────────────────
create table if not exists public.gerentes_house (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean default true,
  created_at timestamptz default now()
);

alter table public.gerentes_house enable row level security;

drop policy if exists "logados leem gerentes_house" on public.gerentes_house;
create policy "logados leem gerentes_house" on public.gerentes_house
  for select using (auth.uid() is not null);

drop policy if exists "admin escreve gerentes_house" on public.gerentes_house;
create policy "admin escreve gerentes_house" on public.gerentes_house
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('master','gestor'))
  );

-- ─── 2. COLUNAS NOVAS EM ATIVIDADES ──────────────────────────────────────
-- Reusa: cliente (Nome), corretor (Corretor), local_treinamento (Local da Visita),
--        imobiliaria, empreendimento, observacoes
-- Novas:
alter table public.atividades add column if not exists visita_periodo text;
alter table public.atividades add column if not exists visita_forma_atendimento text;
alter table public.atividades add column if not exists visita_canal text;
alter table public.atividades add column if not exists visita_gerente_house_id uuid
  references public.gerentes_house(id) on delete set null;

-- Index para consultas do dashboard de visitas
create index if not exists idx_atividades_tipo_visita
  on public.atividades(created_at desc) where tipo = 'visita';

-- ─── 3. CHECK CONSTRAINT DE TIPO (inclui 'visita') ───────────────────────
alter table public.atividades drop constraint if exists atividades_tipo_check;
alter table public.atividades add constraint atividades_tipo_check
  check (tipo in ('checkin','atendimento','proposta','orulo','visita'));

-- ─── 4. AUDITORIA DE IMPORTAÇÕES ─────────────────────────────────────────
create table if not exists public.visitas_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null not null,
  filename text,
  qtd_registros int default 0,
  geo jsonb,
  status text default 'ok',
  erro text,
  created_at timestamptz default now()
);

alter table public.visitas_imports enable row level security;

drop policy if exists "user le proprios imports" on public.visitas_imports;
create policy "user le proprios imports" on public.visitas_imports
  for select using (auth.uid() = user_id);

drop policy if exists "user cria proprios imports" on public.visitas_imports;
create policy "user cria proprios imports" on public.visitas_imports
  for insert with check (auth.uid() = user_id);

drop policy if exists "master le todos imports" on public.visitas_imports;
create policy "master le todos imports" on public.visitas_imports
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master')
  );

-- ─── 5. RLS POLICIES PARA ATIVIDADES tipo='visita' ───────────────────────
-- Permite que: recepcao_rottas veja só as PRÓPRIAS visitas; master veja TODAS;
-- demais roles NÃO veem visitas (não há policy permissiva para eles).
-- Isso convive com as policies existentes para outros tipos (checkin etc).

drop policy if exists "recepcao le proprias visitas" on public.atividades;
create policy "recepcao le proprias visitas" on public.atividades
  for select using (
    tipo = 'visita' and gerente_id = auth.uid()
  );

drop policy if exists "master le todas visitas" on public.atividades;
create policy "master le todas visitas" on public.atividades
  for select using (
    tipo = 'visita' and
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'master')
  );

drop policy if exists "recepcao cria visitas" on public.atividades;
create policy "recepcao cria visitas" on public.atividades
  for insert with check (
    tipo = 'visita' and gerente_id = auth.uid() and
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'recepcao_rottas')
  );

-- ─── 6. SEED INICIAL (opcional — remova se não quiser) ───────────────────
-- Comentado por padrão. Master cadastra via UI master-listas.
-- insert into public.gerentes_house (nome) values ('Exemplo Gerente House') on conflict do nothing;

select 'migration v19 OK · atividade visita + role recepcao_rottas + gerentes_house' as status;
