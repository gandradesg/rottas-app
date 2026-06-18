-- v28: edição com aprovação + histórico (auditoria) de edições e exclusões.

-- ── Edição pendente (NÃO altera os dados da atividade até o gestor aprovar) ──
alter table public.atividades add column if not exists solicita_edicao boolean default false;
alter table public.atividades add column if not exists edicao_solicitada_em timestamptz;
alter table public.atividades add column if not exists edicao_solicitada_por uuid references auth.users(id);
alter table public.atividades add column if not exists edicao_pendente jsonb;   -- { campo: novo_valor, ... }

-- ── Metadados de exclusão (soft-delete: a linha vira histórico, some das telas) ──
alter table public.atividades add column if not exists excluida_em timestamptz;
alter table public.atividades add column if not exists excluida_por uuid references auth.users(id);
alter table public.atividades add column if not exists motivo_exclusao text;

-- ── Tabela de auditoria: cada edição aplicada e cada exclusão vira um registro ──
create table if not exists public.atividades_historico (
  id uuid primary key default gen_random_uuid(),
  atividade_id uuid,
  tipo_evento text not null,            -- 'edicao' | 'exclusao'
  resumo text,                          -- texto curto pra listar (tipo + nº + título)
  por uuid references auth.users(id),
  por_nome text,
  aprovado_por uuid references auth.users(id),
  aprovado_por_nome text,
  dados jsonb,                          -- edicao: {antes:{}, depois:{}}; exclusao: snapshot completo
  em timestamptz default now()
);
create index if not exists idx_athist_atividade on public.atividades_historico(atividade_id);
create index if not exists idx_athist_em on public.atividades_historico(em desc);
alter table public.atividades_historico enable row level security;

-- Inserção: quem aplica a edição/exclusão registra (qualquer logado)
drop policy if exists "logados inserem historico" on public.atividades_historico;
create policy "logados inserem historico" on public.atividades_historico
  for insert with check (auth.uid() is not null);

-- Leitura: admin (master/gestor/superintendente/gestor_regional); autor do evento; dono da atividade
drop policy if exists "le historico escopo" on public.atividades_historico;
create policy "le historico escopo" on public.atividades_historico
  for select using (
    public.is_admin()
    or por = auth.uid()
    or exists (select 1 from public.atividades a where a.id = atividade_id and a.gerente_id = auth.uid())
  );

-- Só o Master remove (limpeza); ninguém edita (log imutável)
drop policy if exists "master deleta historico" on public.atividades_historico;
create policy "master deleta historico" on public.atividades_historico
  for delete using (public.current_user_role() = 'master');

select 'migration v28 OK' as status;
