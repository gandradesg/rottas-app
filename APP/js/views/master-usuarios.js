// Master: gerenciamento de usuários (gestores e gerentes)
import { el, icon, toast, modal, confirmModal, loadingBtn, fmt } from '../ui.js';
import { shell } from './shell.js';
import { supabase, loadAllProfiles, state } from '../supabase.js';
import { ESTADOS_BR, PERMISSOES } from '../config.js';
import { authGuards, isMaster } from '../auth.js';

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

async function reload() {
  if (!listEl) return;
  if (!listEl.children.length) listEl.innerHTML = '<div class="skeleton h-20"></div>';
  const profiles = await loadAllProfiles();
  listEl.innerHTML = '';
  if (!profiles.length) {
    listEl.appendChild(el('div', { class: 'card p-8 text-center text-fg-muted' }, 'Nenhum usuário cadastrado.'));
    return;
  }
  // Ordem: master → gestor → gerente
  const order = { master: 0, gestor: 1, gerente: 2 };
  profiles.sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.nome.localeCompare(b.nome));
  profiles.forEach(p => listEl.appendChild(userRow(p)));
}

function userRow(p) {
  const roleChip = p.role === 'master'
    ? { label: 'Master', cls: 'chip-orange', icon: '👑' }
    : p.role === 'gestor'
      ? { label: 'Gestor', cls: 'chip-orange', icon: '📊' }
      : { label: 'Gerente', cls: 'chip-blue', icon: '🗺️' };

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
      // Master edita Master/Gestor. Gestor edita Gerente ou a si mesmo.
      (isMaster() || p.role === 'gerente' || p.id === state.profile?.id) && el('button', {
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
  const canDelete = isMaster() && p.role !== 'master';
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
            const { error } = await supabase.from('profiles').delete().eq('id', p.id);
            if (error) throw error;
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
  const resetBtn = p.role !== 'master' ? el('button', {
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

  // Seletor de role - duas pílulas grandes
  const initialRole = p.role && p.role !== 'master' ? p.role : 'gerente';
  let chosenRole = initialRole;
  const roleGerente = el('button', { type: 'button', 'data-role': 'gerente' });
  const roleGestor = el('button', { type: 'button', 'data-role': 'gestor' });

  // Permissões (apenas para gestores, apenas master pode editar)
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
      '🔐 Permissões do Gestor'),
    el('p', { class: 'text-xs text-fg-muted mb-2' },
      isMaster()
        ? 'Marque o que este Gestor pode fazer no app:'
        : 'Apenas o Master pode alterar permissões.'
    ),
    permsContainer,
  );
  if (!isMaster()) {
    permsContainer.querySelectorAll('input').forEach(i => i.disabled = true);
  }

  function paint() {
    [roleGerente, roleGestor].forEach(b => {
      const active = b.dataset.role === chosenRole;
      const isGestor = b.dataset.role === 'gestor';
      const activeCls = isGestor
        ? 'border-rottas-500 bg-rottas-50 text-rottas-600 dark:bg-rottas-500/15'
        : 'border-info bg-info/10 text-info';
      b.className = 'flex-1 border-2 rounded-xl py-3 px-3 flex items-center justify-center gap-2 text-sm font-bold transition ' +
        (active ? activeCls : 'border-border text-fg-muted hover:border-fg-subtle');
      b.innerHTML = isGestor ? '📊 Gestor' : '🗺️ Gerente de Plataforma';
    });
    // Mostra/esconde permissões conforme role
    permsCard.classList.toggle('hidden', chosenRole !== 'gestor');
  }
  roleGerente.addEventListener('click', () => { chosenRole = 'gerente'; paint(); });
  roleGestor.addEventListener('click', () => { chosenRole = 'gestor'; paint(); });
  paint();

  const isMasterEdit = p.role === 'master';
  const roleField = isMasterEdit
    ? el('div', { class: 'card p-3 flex items-center gap-2 bg-rottas-50 dark:bg-rottas-500/10' },
        '👑 ', el('span', { class: 'font-semibold' }, 'Master'),
        el('span', { class: 'text-xs text-fg-muted ml-auto' }, 'Não editável'))
    : el('div', { class: 'flex gap-2' }, roleGerente, roleGestor);

  form.append(
    el('div', {}, el('label', { class: 'label label-required' }, 'Nome'), nome),
    el('div', {}, el('label', { class: 'label label-required' }, 'Email'), email,
      p.id && el('p', { class: 'text-xs text-fg-subtle mt-1' }, 'Email não pode ser alterado.')),
    el('div', {}, el('label', { class: 'label label-required' }, 'Perfil de acesso'), roleField),
    !isMasterEdit && permsCard,
    el('div', {}, el('label', { class: 'label' }, 'Telefone'), tel),
    el('div', { class: 'grid grid-cols-3 gap-2' },
      el('div', { class: 'col-span-2' }, el('label', { class: 'label' }, 'Cidade'), cidade),
      el('div', {}, el('label', { class: 'label' }, 'UF'), estado),
    ),
  );

  return {
    form,
    values: () => ({
      nome: nome.value.trim(),
      email: email.value.trim().toLowerCase(),
      telefone: tel.value.trim() || null,
      cidade: cidade.value.trim() || null,
      estado: estado.value || null,
      role: isMasterEdit ? 'master' : chosenRole,
      // Permissões: só master pode setar; default {}
      permissoes: chosenRole === 'gestor' && isMaster() ? { ...permsState } : (chosenRole === 'gestor' ? initialPerms : {}),
    }),
  };
}
