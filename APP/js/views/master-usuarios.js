// Master: gerenciamento de usuários (gestores e gerentes)
import { el, icon, toast, modal, confirmModal, loadingBtn, fmt } from '../ui.js';
import { shell } from './shell.js';
import { supabase, loadAllProfiles, state } from '../supabase.js';
import { ESTADOS_BR, PERMISSOES, ROLES } from '../config.js';
import { authGuards, isMaster, isPrincipalMaster, roleLevel } from '../auth.js';

let listEl = null;

export async function masterUsuariosView(_params, app) {
  const content = el('div', { class: 'flex flex-col gap-4' });

  content.appendChild(el('div', { class: 'flex items-center justify-between' },
    el('div', {},
      el('h1', { class: 'text-2xl font-extrabold' }, 'Usuários'),
      el('p', { class: 'text-sm text-fg-muted' }, 'Gestores e Gerentes de Plataforma'),
    ),
    el('button', {
      class: 'btn btn-primary',
      onclick: () => openCreateModal()
    }, icon('plus', 16), 'Novo'),
  ));

  listEl = el('div', { class: 'flex flex-col gap-2' });
  content.appendChild(listEl);
  app.appendChild(shell(content, { title: 'Usuários' }));

  await reload();
}

// Hierarquia rigida (user explicito):
//   Master > {Gestor, Superintendente, Gestor Regional} > Gerente > Supervisor
// Quem pode VER e EDITAR o profile alvo?
//   - Master: todos
//   - Gestor/Superint/GestReg: a si mesmo + Gerentes + Supervisores
//   - Gerente: a si mesmo + Supervisores
//   - Supervisor: apenas a si mesmo
export function canManageProfile(target) {
  const myRole = state.profile?.role;
  const myId = state.profile?.id;
  if (!myRole) return false;
  if (target.id === myId) return true;
  if (myRole === 'master') return true;
  if (['gestor', 'superintendente', 'gestor_regional'].includes(myRole)) {
    return ['gerente', 'supervisor'].includes(target.role);
  }
  if (myRole === 'gerente') return target.role === 'supervisor';
  return false;
}

async function reload() {
  if (!listEl) return;
  if (!listEl.children.length) listEl.innerHTML = '<div class="skeleton h-20"></div>';
  const allProfiles = await loadAllProfiles();
  // Filtra a lista: usuario so ve quem pode gerenciar
  const profiles = allProfiles.filter(p => canManageProfile(p));
  listEl.innerHTML = '';
  if (!profiles.length) {
    listEl.appendChild(el('div', { class: 'card p-8 text-center text-fg-muted' }, 'Nenhum usuário cadastrado.'));
    return;
  }
  // Ordem hierárquica: master no topo, supervisor por último
  const order = {
    master: 0, gestor: 1, superintendente: 2,
    gestor_regional: 3, gerente: 4, supervisor: 5
  };
  profiles.sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.nome.localeCompare(b.nome));
  profiles.forEach(p => listEl.appendChild(userRow(p)));
}

function userRow(p) {
  const meta = ROLES[p.role] || { label: p.role || '?', icon: '·', color: 'gray' };
  const colorCls = {
    orange: 'chip-orange', blue: 'chip-blue', purple: 'chip-purple',
    green: 'chip-green', red: 'chip-red', gray: 'chip-gray'
  }[meta.color] || 'chip-gray';
  const roleChip = { label: meta.label, cls: colorCls, icon: meta.icon };

  return el('div', { class: 'card p-3' },
    el('div', { class: 'flex items-center gap-3' },
      el('div', {
        class: 'w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0',
        style: { background: 'linear-gradient(135deg, #F26B22, #D5530F)' }
      }, p.nome.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()),
      el('div', { class: 'flex-1 min-w-0' },
        el('div', { class: 'flex items-center gap-2 flex-wrap' },
          el('span', { class: 'font-semibold truncate' }, p.nome),
          el('span', { class: `chip ${roleChip.cls}` }, roleChip.icon, ' ', roleChip.label),
          !p.ativo && el('span', { class: 'chip chip-red' }, 'Inativo'),
          p.primeiro_acesso && el('span', { class: 'chip chip-yellow' }, 'Pendente'),
        ),
        el('div', { class: 'text-xs text-fg-muted truncate' }, p.email),
        el('div', { class: 'text-xs text-fg-subtle truncate' },
          [p.cidade, p.estado].filter(Boolean).join(' · ') || 'Sem cidade/estado',
          ' · ',
          p.telefone || 'sem telefone',
        ),
      ),
      // Botao editar: respeita HIERARQUIA RIGIDA
      // Master > {Gestor, Superintendente, Gestor Regional} > Gerente > Supervisor
      // Cada nivel so edita quem esta ABAIXO + a si mesmo
      canManageProfile(p) && el('button', {
        class: 'p-2 rounded-lg hover:bg-bg-elev transition flex-shrink-0',
        onclick: () => openEditModal(p)
      }, icon('edit', 18, 'text-fg-muted')),
    ),
  );
}

function openCreateModal() {
  const fields = userFormFields({});
  const submitBtn = el('button', { class: 'btn btn-primary' }, 'Convidar');
  const cancelBtn = el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Cancelar');
  const m = modal({ title: 'Novo usuário', size: 'md', content: fields.form, footer: [cancelBtn, submitBtn] });
  setTimeout(() => fields.form.querySelector('input')?.focus(), 80);

  submitBtn.addEventListener('click', () => {
    const v = fields.values();
    if (!v.email || !v.nome) { toast('Email e nome são obrigatórios', 'error'); return; }
    if (!v.role) { toast('Selecione o perfil de acesso', 'error'); return; }

    // UI otimista: fecha modal já, mostra "convidando..." e processa em bg
    m.close();
    toast(`Convidando ${v.nome}...`, 'info', 2500);

    inviteUserBackground(v).then(() => {
      toast(`✓ ${v.nome} convidado(a)! Email enviado.`, 'success', 4500);
      reload();
    }).catch(err => {
      console.error('[invite] erro:', err);
      toast('Erro ao convidar: ' + (err.message || err), 'error', 6000);
    });
  });
}

// Async pesado em background - não bloqueia UI
// Usa Edge Function `invite-user` que chama auth.admin.inviteUserByEmail
// (dispara o template INVITE - "bem-vindo, cadastre senha" - e NÃO o template recovery)
async function inviteUserBackground(v) {
  const { data: { session: masterSession } } = await supabase.auth.getSession();
  if (!masterSession) throw new Error('Sessão master não encontrada');

  const fnUrl = `${supabase.supabaseUrl}/functions/v1/invite-user`;
  const resp = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${masterSession.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: v.email,
      nome: v.nome,
      telefone: v.telefone,
      cidade: v.cidade,
      estado: v.estado,
      role: v.role,
      permissoes: v.permissoes || {},
      estados_acesso: v.estados_acesso || [],
      cidades_acesso: v.cidades_acesso || [],
      gerente_supervisor_id: v.gerente_supervisor_id || null,
    }),
  });

  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(result.error || `Erro ${resp.status} ao convidar`);
  }
}

function openEditModal(p) {
  const fields = userFormFields(p);
  const ativoToggle = el('label', { class: 'flex items-center gap-3 mt-3 p-3 card cursor-pointer' },
    el('input', { type: 'checkbox', name: 'ativo', checked: !!p.ativo }),
    el('div', {},
      el('span', { class: 'font-semibold block text-sm' }, 'Usuário ativo'),
      el('span', { class: 'text-xs text-fg-muted' }, 'Desative para impedir login sem excluir o histórico'),
    ),
  );
  fields.form.appendChild(ativoToggle);

  // Botão de excluir perfil - apenas master editando perfis não-master
  // Master principal NUNCA pode ser excluído (nem pelo próprio). Outros masters podem por outro master.
  const canDelete = isMaster() && !isPrincipalMaster(p);
  if (canDelete) {
    const deleteSection = el('div', { class: 'mt-3 pt-3', style: { borderTop: '1px solid var(--border)' } },
      el('button', {
        class: 'btn w-full',
        style: {
          background: 'transparent',
          color: 'var(--danger, #ef4444)',
          border: '1px solid var(--danger, #ef4444)',
          fontWeight: '600',
          fontSize: '0.85rem',
        },
        onclick: async () => {
          const ok = await confirmModal({
            title: 'Excluir perfil?',
            message: `Tem certeza que deseja excluir o perfil de "${p.nome}"? Essa ação não pode ser desfeita. O histórico de atividades vinculado a este usuário será mantido.`,
            confirmLabel: 'Excluir',
            danger: true,
          });
          if (!ok) return;
          m.close();
          toast('Excluindo perfil...', 'info', 2000);
          try {
            // Chama Edge Function delete-user que apaga em auth.users (cascateia profile)
            // - garante que email pode ser reconvidado depois sem "already registered"
            const { data: { session } } = await supabase.auth.getSession();
            const fnUrl = `${supabase.supabaseUrl}/functions/v1/delete-user`;
            const resp = await fetch(fnUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ user_id: p.id }),
            });
            const result = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(result.error || `Erro ${resp.status}`);
            toast(`✓ Perfil de ${p.nome} excluído`, 'success', 3500);
            reload();
          } catch (err) {
            console.error('[user delete] erro:', err);
            toast('Erro ao excluir: ' + (err.message || err), 'error', 6000);
          }
        }
      }, '🗑️ Excluir este perfil'),
      el('p', { class: 'text-xs text-fg-subtle mt-1.5 text-center' },
        'O histórico de atividades será mantido.'),
    );
    fields.form.appendChild(deleteSection);
  }

  const submitBtn = el('button', { class: 'btn btn-primary' }, 'Salvar');
  // Reenviar convite permitido pra qualquer um, exceto o master principal
  // (ele nao deve ser reconvidado - ja tem acesso garantido e protegido).
  const resetBtn = !isPrincipalMaster(p) ? el('button', {
    class: 'btn btn-ghost text-xs',
    onclick: async () => {
      const ok = await confirmModal({ title: 'Reenviar convite?', message: 'Será enviado um novo email para definir a senha.', confirmLabel: 'Reenviar' });
      if (!ok) return;
      try {
        // Reenvia via Edge Function (mesmo fluxo do convite original - dispara template INVITE)
        const { data: { session } } = await supabase.auth.getSession();
        const fnUrl = `${supabase.supabaseUrl}/functions/v1/invite-user`;
        const resp = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: p.email, nome: p.nome, telefone: p.telefone,
            cidade: p.cidade, estado: p.estado, role: p.role,
            permissoes: p.permissoes || {},
          }),
        });
        const result = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(result.error || 'Erro ao reenviar');
        toast('Email reenviado', 'success');
      } catch (e) { toast(e.message, 'error'); }
    }
  }, 'Reenviar convite') : null;
  const cancelBtn = el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Cancelar');

  const footer = resetBtn ? [resetBtn, cancelBtn, submitBtn] : [cancelBtn, submitBtn];
  const m = modal({ title: 'Editar usuário', size: 'md', content: fields.form, footer });

  submitBtn.addEventListener('click', () => {
    const v = fields.values();
    const ativo = ativoToggle.querySelector('input[name=ativo]').checked;
    m.close();
    toast('Salvando...', 'info', 1500);
    supabase.from('profiles').update({
      nome: v.nome,
      telefone: v.telefone,
      cidade: v.cidade,
      estado: v.estado,
      role: v.role,
      permissoes: v.permissoes || {},
      estados_acesso: v.estados_acesso || [],
      cidades_acesso: v.cidades_acesso || [],
      gerente_supervisor_id: v.gerente_supervisor_id || null,
      ativo,
    }).eq('id', p.id).select().then(({ data, error }) => {
      if (error) {
        console.error('[user update] erro:', error);
        toast('Erro: ' + error.message, 'error', 6000);
        return;
      }
      if (!data || !data.length) {
        toast('❌ Sem permissão para editar este usuário (RLS rejeitou)', 'error', 6000);
        return;
      }
      console.log('[user update] ok:', data);
      toast('✓ Atualizado', 'success', 2500);
      reload();
    });
  });
}

function userFormFields(p) {
  const form = el('div', { class: 'flex flex-col gap-3' });
  const nome = el('input', { class: 'input', value: p.nome || '', placeholder: 'Nome completo' });
  const email = el('input', { class: 'input', type: 'email', value: p.email || '', placeholder: 'email@rottasconstrutora.com.br', disabled: !!p.id });
  const tel = el('input', { class: 'input', value: p.telefone || '', placeholder: '(00) 00000-0000' });
  const cidade = el('input', { class: 'input', value: p.cidade || '', placeholder: 'Cidade' });
  const estado = el('select', { class: 'select' },
    el('option', { value: '' }, 'UF'),
    ...ESTADOS_BR.map(u => el('option', { value: u, selected: p.estado === u }, u)),
  );

  // Seletor de role lendo TODOS os roles do config.ROLES (assim novos roles
  // aparecem automaticamente — ex: recepcao_rottas).
  // Hierarquia: supervisor=1, gerente=2, gestor_regional=3, superintendente=4, gestor=5, master=6
  // recepcao_rottas: nivel 1 (peer com supervisor) MAS isolado — função especial de recepção.
  const callerLevel = roleLevel(state.profile?.role);
  // Ordena por level pra UI ficar consistente
  const allRoles = Object.keys(ROLES).sort((a, b) => (ROLES[a].level || 9) - (ROLES[b].level || 9));
  // Caller só pode atribuir roles de nível <= ao próprio (master atribui qualquer um;
  // gestor pode criar gestor_regional/superintendente/etc mas não outro master).
  // Master principal sempre pode criar tudo.
  const availableRoles = allRoles.filter(r => {
    const lvl = roleLevel(r);
    if (isMaster()) return true; // master atribui qualquer um
    return lvl <= callerLevel;
  });

  const initialRole = p.role || 'gerente';
  let chosenRole = availableRoles.includes(initialRole) ? initialRole : 'gerente';

  // Pílulas em grid - se tiver mais de 3, quebra em 2 linhas
  const roleButtons = availableRoles.map(r => el('button', {
    type: 'button', 'data-role': r,
  }));

  // === Permissões (visíveis para todos os roles admin) ===
  const initialPerms = p.permissoes || {};
  const permsState = {};
  PERMISSOES.forEach(perm => { permsState[perm.key] = initialPerms[perm.key] === true; });

  const permsContainer = el('div', { class: 'flex flex-col gap-2 mt-2' });
  PERMISSOES.forEach(perm => {
    const cb = el('input', { type: 'checkbox', checked: permsState[perm.key], 'data-perm': perm.key });
    cb.addEventListener('change', () => { permsState[perm.key] = cb.checked; });
    permsContainer.appendChild(el('label', {
      class: 'flex items-start gap-2 p-2.5 rounded-lg hover:bg-bg-elev transition cursor-pointer'
    },
      cb,
      el('div', { class: 'flex-1' },
        el('span', { class: 'block text-sm font-semibold' }, perm.label),
        el('span', { class: 'block text-xs text-fg-muted' }, perm.desc),
      ),
    ));
  });

  const permsCard = el('div', { class: 'card p-3 hidden' },
    el('h3', { class: 'text-xs font-bold uppercase tracking-wider text-fg-subtle mb-2' },
      '🔐 Permissões adicionais'),
    el('p', { class: 'text-xs text-fg-muted mb-2' },
      isMaster()
        ? 'Marque o que este usuário pode fazer no app:'
        : 'Apenas o Master pode alterar permissões.'
    ),
    permsContainer,
  );
  if (!isMaster()) {
    permsContainer.querySelectorAll('input').forEach(i => i.disabled = true);
  }

  // === Multi-estado (superintendente, gestor, master) ===
  // Checkboxes pra cada UF. Permite marcar 1 ou mais.
  // Pra master/gestor, vazio = sem restrição (vê tudo).
  const initialEstados = Array.isArray(p.estados_acesso) ? p.estados_acesso : [];
  const estadosCheck = {};
  ESTADOS_BR.forEach(uf => { estadosCheck[uf] = initialEstados.includes(uf); });
  const estadosBox = el('div', { class: 'card p-3 hidden' },
    el('h3', { class: 'text-xs font-bold uppercase tracking-wider text-fg-subtle mb-2' },
      '🗺️ Estados de acesso'),
    el('p', { class: 'text-xs text-fg-muted mb-2' }, ''),
    el('div', { class: 'grid grid-cols-2 gap-2' },
      ...ESTADOS_BR.map(uf => {
        const cb = el('input', { type: 'checkbox', checked: estadosCheck[uf] });
        cb.addEventListener('change', () => { estadosCheck[uf] = cb.checked; });
        return el('label', { class: 'flex items-center gap-2 p-2 rounded-lg hover:bg-bg-elev cursor-pointer' },
          cb, el('span', { class: 'text-sm font-semibold' }, uf));
      })
    ),
  );
  const estadosHelpEl = estadosBox.querySelector('p');

  // === Multi-cidade (gestor_regional) ===
  // Lista vem dos empreendimentos cadastrados (campos cidade+estado).
  // Dedup case-insensitive, ordenado por estado→cidade.
  const cidadesFromEmps = [];
  const seenCity = new Set();
  (state.empreendimentos || []).forEach(e => {
    if (!e.cidade) return;
    const key = (e.cidade + '|' + (e.estado || '')).toLowerCase();
    if (seenCity.has(key)) return;
    seenCity.add(key);
    cidadesFromEmps.push({ nome: e.cidade, estado: e.estado || '' });
  });
  cidadesFromEmps.sort((a,b) =>
    (a.estado||'').localeCompare(b.estado||'') || a.nome.localeCompare(b.nome)
  );

  const initialCidades = Array.isArray(p.cidades_acesso) ? p.cidades_acesso : [];
  const cidadesCheck = {};
  cidadesFromEmps.forEach(c => {
    const key = c.nome + '|' + c.estado;
    cidadesCheck[key] = initialCidades.some(x => (typeof x === 'string' ? x : x.nome) === c.nome);
  });
  const cidadesBox = el('div', { class: 'card p-3 hidden' },
    el('h3', { class: 'text-xs font-bold uppercase tracking-wider text-fg-subtle mb-2' },
      '🏙️ Cidades de acesso'),
    el('p', { class: 'text-xs text-fg-muted mb-2' },
      'Gestor Regional vê tudo das cidades marcadas. Lista puxa das cidades dos empreendimentos cadastrados.'),
    el('div', { class: 'grid grid-cols-2 gap-2 max-h-60 overflow-y-auto' },
      ...(cidadesFromEmps.length === 0
        ? [el('span', { class: 'text-sm text-fg-muted col-span-2' }, 'Nenhuma cidade encontrada. Cadastre empreendimentos com cidade+estado preenchidos.')]
        : cidadesFromEmps.map(c => {
          const key = c.nome + '|' + c.estado;
          const cb = el('input', { type: 'checkbox', checked: cidadesCheck[key] });
          cb.addEventListener('change', () => { cidadesCheck[key] = cb.checked; });
          return el('label', { class: 'flex items-center gap-2 p-2 rounded-lg hover:bg-bg-elev cursor-pointer' },
            cb, el('span', { class: 'text-sm' }, c.nome, c.estado && el('span', { class: 'text-xs text-fg-muted ml-1' }, c.estado)));
        }))
    ),
  );

  // === Vínculo Supervisor -> Gerente ===
  // Quando o role é Supervisor, mostra select de qual gerente ele é subordinado
  // (1 supervisor pertence a 1 gerente, mas 1 gerente pode ter vários supervisores).
  const gerentesList = (state.profiles || []).filter(x => x.role === 'gerente' && x.ativo);
  const supervisorSel = el('select', { class: 'select' },
    el('option', { value: '' }, 'Sem gerente atribuído'),
    ...gerentesList.map(g => el('option', {
      value: g.id, selected: p.gerente_supervisor_id === g.id,
    }, g.nome + (g.cidade ? ` · ${g.cidade}` : '')))
  );
  const supervisorBox = el('div', { class: 'card p-3 hidden' },
    el('h3', { class: 'text-xs font-bold uppercase tracking-wider text-fg-subtle mb-2' },
      '🔗 Gerente responsável'),
    el('p', { class: 'text-xs text-fg-muted mb-2' },
      'Supervisor é subordinado a um Gerente. O Gerente é responsável por planejar a agenda.'),
    supervisorSel,
  );

  function paint() {
    roleButtons.forEach(b => {
      const r = b.dataset.role;
      const meta = ROLES[r] || { label: r, icon: '·' };
      const active = r === chosenRole;
      b.className = 'border-2 rounded-xl py-2.5 px-3 flex items-center justify-center gap-1.5 text-xs font-bold transition ' +
        (active
          ? 'border-rottas-500 bg-rottas-50 text-rottas-600 dark:bg-rottas-500/15'
          : 'border-border text-fg-muted hover:border-fg-subtle');
      b.innerHTML = `${meta.icon} <span>${meta.label}</span>`;
    });
    // Mostra cards condicionais
    permsCard.classList.toggle('hidden',
      !['superintendente','gestor_regional'].includes(chosenRole));
    // Estados de acesso: superintendente OU gestor/master (estes ultimos opcionais)
    const showEstados = ['superintendente','gestor','master'].includes(chosenRole);
    estadosBox.classList.toggle('hidden', !showEstados);
    if (showEstados) {
      estadosHelpEl.textContent = chosenRole === 'superintendente'
        ? 'Superintendente vê tudo dos estados marcados. Pode marcar mais de um.'
        : 'Opcional. Se vazio, vê tudo. Se marcar, fica restrito aos estados marcados.';
    }
    // Cidades: gestor_regional
    cidadesBox.classList.toggle('hidden', chosenRole !== 'gestor_regional');
    // Vínculo gerente: supervisor
    supervisorBox.classList.toggle('hidden', chosenRole !== 'supervisor');
  }
  roleButtons.forEach(b => {
    b.addEventListener('click', () => { chosenRole = b.dataset.role; paint(); });
  });
  paint();

  // Master principal (gabriel.galvao) READ-ONLY
  const isPrincipal = isPrincipalMaster(p);
  const roleField = isPrincipal
    ? el('div', { class: 'card p-3 flex items-center gap-2 bg-rottas-50 dark:bg-rottas-500/10' },
        '👑 ', el('span', { class: 'font-semibold' }, 'Master Principal'),
        el('span', { class: 'text-xs text-fg-muted ml-auto' }, 'Não editável'))
    : el('div', { class: 'grid grid-cols-2 sm:grid-cols-3 gap-2' }, ...roleButtons);

  form.append(
    el('div', {}, el('label', { class: 'label label-required' }, 'Nome'), nome),
    el('div', {}, el('label', { class: 'label label-required' }, 'Email'), email,
      p.id && el('p', { class: 'text-xs text-fg-subtle mt-1' }, 'Email não pode ser alterado.')),
    el('div', {}, el('label', { class: 'label label-required' }, 'Perfil de acesso'), roleField),
    estadosBox,
    cidadesBox,
    supervisorBox,
    permsCard,
    el('div', {}, el('label', { class: 'label' }, 'Telefone'), tel),
    el('div', { class: 'grid grid-cols-3 gap-2' },
      el('div', { class: 'col-span-2' }, el('label', { class: 'label' }, 'Cidade base'), cidade),
      el('div', {}, el('label', { class: 'label' }, 'UF base'), estado),
    ),
  );

  return {
    form,
    values: () => {
      const v = {
        nome: nome.value.trim(),
        email: email.value.trim().toLowerCase(),
        telefone: tel.value.trim() || null,
        cidade: cidade.value.trim() || null,
        estado: estado.value || null,
        role: isPrincipal ? 'master' : chosenRole,
        permissoes: ['superintendente','gestor_regional'].includes(chosenRole) && isMaster()
          ? { ...permsState }
          : (['superintendente','gestor_regional'].includes(chosenRole) ? initialPerms : {}),
      };
      // Multi-estado: superintendente, gestor, master podem usar
      if (['superintendente','gestor','master'].includes(chosenRole)) {
        v.estados_acesso = ESTADOS_BR.filter(uf => estadosCheck[uf]);
      } else {
        v.estados_acesso = [];
      }
      // Multi-cidade (gestor_regional): vem da lista derivada de empreendimentos
      if (chosenRole === 'gestor_regional') {
        v.cidades_acesso = cidadesFromEmps
          .filter(c => cidadesCheck[c.nome + '|' + c.estado])
          .map(c => c.nome);
      } else {
        v.cidades_acesso = [];
      }
      // Supervisor -> Gerente
      v.gerente_supervisor_id = chosenRole === 'supervisor'
        ? (supervisorSel.value || null)
        : null;
      return v;
    },
  };
}
