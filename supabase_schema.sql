-- =====================================================================
-- ROTTAS APP — Schema do banco de dados
-- Rode este script inteiro no SQL Editor do Supabase
-- =====================================================================

-- 1. PROFILES (dados dos usuários, ligado ao auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  role text check (role in ('master','gerente')) not null default 'gerente',
  nome text not null,
  email text not null,
  telefone text,
  cidade text,
  estado text,
  ativo boolean default true,
  primeiro_acesso boolean default true,
  created_at timestamptz default now()
);

-- Trigger: cria profile automaticamente quando user é criado no auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, nome, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'role', 'gerente')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Cria profile para o usuário master que você já criou
insert into public.profiles (id, email, nome, role, primeiro_acesso)
select id, email, 'Gabriel Galvão', 'master', true
from auth.users
where email = 'gabriel.galvao@rottasconstrutora.com.br'
on conflict (id) do update set role = 'master', nome = 'Gabriel Galvão';

-- 2. LISTAS GERENCIADAS PELO MASTER
create table public.imobiliarias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  created_at timestamptz default now()
);

create table public.empreendimentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  created_at timestamptz default now()
);

create table public.motivos_visita (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  created_at timestamptz default now()
);

create table public.motivos_orulo (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  created_at timestamptz default now()
);

-- Seed inicial
insert into public.imobiliarias (nome) values
  ('MyBrokers'), ('Lopes Imóveis'), ('Afinco Imóveis')
  on conflict do nothing;

insert into public.empreendimentos (nome) values
  ('Barra Home Resort'), ('Barra Soul Home Resort & SPA'), ('Porto Horizonte')
  on conflict do nothing;

insert into public.motivos_visita (nome) values
  ('Treinamento'), ('Ativação'), ('Plantão')
  on conflict do nothing;

insert into public.motivos_orulo (nome) values
  ('Solicitação de Tabela'), ('Solicitação de Visita'), ('Treinamento')
  on conflict do nothing;

-- 3. ATIVIDADES (tabela única com discriminador `tipo`)
create table public.atividades (
  id uuid primary key default gen_random_uuid(),
  gerente_id uuid references public.profiles(id) on delete cascade not null,
  tipo text check (tipo in ('checkin','atendimento','proposta','orulo')) not null,
  observacoes text,

  -- check-in
  imobiliaria text,
  motivo_visita text,
  latitude double precision,
  longitude double precision,
  fotos text[] default '{}',

  -- atendimento
  local_visita text,
  produto text,
  corretor text,
  cliente text,
  termometro text check (termometro in ('quente','morno','frio')),

  -- proposta
  empreendimento text,
  unidade text,
  valor numeric,
  reserva text,
  reserva_data timestamptz,

  -- orulo
  motivo_contato text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_atividades_gerente on public.atividades(gerente_id);
create index idx_atividades_tipo on public.atividades(tipo);
create index idx_atividades_created on public.atividades(created_at desc);

-- 4. STORAGE BUCKET para fotos
insert into storage.buckets (id, name, public)
values ('fotos','fotos', true)
on conflict (id) do nothing;

-- 5. ROW LEVEL SECURITY
alter table public.profiles enable row level security;
alter table public.imobiliarias enable row level security;
alter table public.empreendimentos enable row level security;
alter table public.motivos_visita enable row level security;
alter table public.motivos_orulo enable row level security;
alter table public.atividades enable row level security;

-- helper: é master?
create or replace function public.is_master()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'master'
  );
$$;

-- profiles
create policy "ler proprio profile" on public.profiles
  for select using (auth.uid() = id);
create policy "master le todos profiles" on public.profiles
  for select using (public.is_master());
create policy "atualiza proprio profile" on public.profiles
  for update using (auth.uid() = id);
create policy "master cria profiles" on public.profiles
  for insert with check (public.is_master());
create policy "master atualiza profiles" on public.profiles
  for update using (public.is_master());
create policy "master deleta profiles" on public.profiles
  for delete using (public.is_master());

-- listas: todos leem, só master escreve
create policy "todos leem imobiliarias" on public.imobiliarias for select using (auth.uid() is not null);
create policy "master gerencia imobiliarias" on public.imobiliarias for all using (public.is_master()) with check (public.is_master());
create policy "gerente cria imobiliaria" on public.imobiliarias for insert with check (auth.uid() is not null);

create policy "todos leem empreendimentos" on public.empreendimentos for select using (auth.uid() is not null);
create policy "master gerencia empreendimentos" on public.empreendimentos for all using (public.is_master()) with check (public.is_master());

create policy "todos leem motivos_visita" on public.motivos_visita for select using (auth.uid() is not null);
create policy "master gerencia motivos_visita" on public.motivos_visita for all using (public.is_master()) with check (public.is_master());

create policy "todos leem motivos_orulo" on public.motivos_orulo for select using (auth.uid() is not null);
create policy "master gerencia motivos_orulo" on public.motivos_orulo for all using (public.is_master()) with check (public.is_master());

-- atividades: gerente vê/edita as próprias, master vê todas
create policy "gerente le proprias atividades" on public.atividades
  for select using (auth.uid() = gerente_id);
create policy "master le todas atividades" on public.atividades
  for select using (public.is_master());
create policy "gerente cria atividade" on public.atividades
  for insert with check (auth.uid() = gerente_id);
create policy "gerente edita propria atividade" on public.atividades
  for update using (auth.uid() = gerente_id);
create policy "master edita qualquer atividade" on public.atividades
  for update using (public.is_master());

-- storage policies
create policy "todos leem fotos" on storage.objects
  for select using (bucket_id = 'fotos');
create policy "autenticado faz upload" on storage.objects
  for insert with check (bucket_id = 'fotos' and auth.role() = 'authenticated');
create policy "dono deleta foto" on storage.objects
  for delete using (bucket_id = 'fotos' and owner = auth.uid());
