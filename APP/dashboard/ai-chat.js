// ═════════════════════════════════════════════════════════════════════════
// Imob Rottas · Dashboard · ai-chat.js v2
// Chat IA com Google Gemini 2.0 Flash (grátis)
// CHAVE COMPARTILHADA via tabela app_settings (todos admins usam a mesma)
// Fallback para localStorage caso a tabela não exista ainda
// ═════════════════════════════════════════════════════════════════════════

const GEMINI_LOCAL_KEY   = 'rottas-dash-gemini-key';     // fallback local
const RATE_STORAGE       = 'rottas-dash-ai-rate';
const RATE_LIMIT_PER_HR  = 20;
const APP_SETTINGS_KEY   = 'gemini_api_key';             // key na tabela app_settings

let _ctx = { kpis: null, filters: null, periodLabel: '—' };
let _refs = null;
let _cachedSharedKey = null;       // cache da chave compartilhada
let _sharedKeyAvailable = null;    // true se app_settings funcionou (table existe + permissão)

const SUGGESTIONS = [
  'Por que as conversões caíram?',
  'Qual gerente precisa de atenção?',
  'Qual cidade tem o melhor desempenho?',
  'Como aumentar o pace de visitas?',
];

// ─── RATE LIMIT ──────────────────────────────────────────────────────────
function readRate() {
  try {
    const raw = localStorage.getItem(RATE_STORAGE);
    if (!raw) return { count: 0, resetAt: Date.now() + 3600_000 };
    const obj = JSON.parse(raw);
    if (Date.now() > obj.resetAt) return { count: 0, resetAt: Date.now() + 3600_000 };
    return obj;
  } catch { return { count: 0, resetAt: Date.now() + 3600_000 }; }
}
function writeRate(r) { try { localStorage.setItem(RATE_STORAGE, JSON.stringify(r)); } catch {} }
function bumpRate() { const r = readRate(); r.count = (r.count || 0) + 1; writeRate(r); return r; }
function updateRateLabel() {
  if (!_refs?.rateEl) return;
  const r = readRate();
  const remaining = Math.max(0, RATE_LIMIT_PER_HR - r.count);
  _refs.rateEl.textContent = `${r.count}/${RATE_LIMIT_PER_HR} perguntas usadas · ${remaining} restantes na hora`;
}

// ─── KEY MANAGEMENT (compartilhada via Supabase) ─────────────────────────
async function loadSharedKey() {
  if (!_refs?.sb) { _sharedKeyAvailable = false; return null; }
  try {
    const { data, error } = await _refs.sb.from('app_settings').select('value').eq('key', APP_SETTINGS_KEY).maybeSingle();
    if (error) { _sharedKeyAvailable = false; return null; }
    _sharedKeyAvailable = true;
    _cachedSharedKey = data?.value || '';
    return _cachedSharedKey;
  } catch (e) {
    _sharedKeyAvailable = false;
    return null;
  }
}

async function saveSharedKey(newKey) {
  if (!_refs?.sb) return false;
  const trimmed = (newKey || '').trim();
  try {
    const { error } = await _refs.sb.from('app_settings').upsert({ key: APP_SETTINGS_KEY, value: trimmed }, { onConflict: 'key' });
    if (error) throw error;
    _cachedSharedKey = trimmed;
    _sharedKeyAvailable = true;
    return true;
  } catch (e) {
    console.warn('[ai-chat] falha ao salvar chave compartilhada:', e);
    return false;
  }
}

async function getEffectiveKey() {
  if (_cachedSharedKey != null) return _cachedSharedKey;
  const shared = await loadSharedKey();
  if (shared) return shared;
  // Fallback: localStorage (caso table não exista ainda)
  return localStorage.getItem(GEMINI_LOCAL_KEY) || '';
}

function setLocalKey(k) { localStorage.setItem(GEMINI_LOCAL_KEY, (k || '').trim()); }

async function renderKeyBox() {
  if (!_refs?.keyboxEl) return;
  const key = await getEffectiveKey();
  const sharedOK = _sharedKeyAvailable === true;

  if (!_refs.canManageKey) {
    if (!key) {
      _refs.keyboxEl.innerHTML = `<div style="font-size:11px;color:var(--fg-muted);padding:8px;background:var(--bg-elev);border-radius:8px;">
        ⚠ Chat IA não configurado. Peça ao Master/Gestor para cadastrar a chave Gemini.</div>`;
      if (_refs.inputEl) _refs.inputEl.disabled = true;
      if (_refs.sendEl)  _refs.sendEl.disabled = true;
    } else {
      _refs.keyboxEl.innerHTML = '';
      if (_refs.inputEl) _refs.inputEl.disabled = false;
      if (_refs.sendEl)  _refs.sendEl.disabled = false;
    }
    return;
  }

  // Master/Gestor: pode gerenciar a chave
  const statusBadge = sharedOK
    ? '<span style="background:rgba(16,185,129,0.15);color:#10B981;padding:2px 7px;border-radius:6px;font-size:9.5px;font-weight:700;">COMPARTILHADA</span>'
    : '<span style="background:rgba(245,158,11,0.15);color:#F59E0B;padding:2px 7px;border-radius:6px;font-size:9.5px;font-weight:700;">LOCAL</span>';

  _refs.keyboxEl.innerHTML = `
    <details style="font-size:11px;" ${key ? '' : 'open'}>
      <summary style="cursor:pointer;color:var(--fg-muted);padding:4px 0;display:flex;align-items:center;gap:6px;">
        ⚙️ ${key ? 'Chave Gemini cadastrada' : '⚠ Configure a chave Gemini'} ${statusBadge}
      </summary>
      <div style="display:flex;gap:6px;margin-top:6px;">
        <input id="ai-key-input" type="password" class="ctrl" style="flex:1;" placeholder="Cole a chave da Gemini API" value="${escapeAttr(key)}" />
        <button id="ai-key-save" class="btn btn-secondary">Salvar</button>
        <button id="ai-key-test" class="btn btn-secondary" title="Testar a chave agora">🧪 Testar</button>
      </div>
      <div id="ai-key-test-result" style="margin-top:6px;font-size:10.5px;line-height:1.4;"></div>
      <p style="font-size:10px;color:var(--fg-muted);margin-top:6px;line-height:1.4;">
        ${sharedOK
          ? 'Esta chave é COMPARTILHADA com todos os admins via Supabase.'
          : '⚠ Tabela app_settings não encontrada — chave salva apenas neste navegador. Aplique a migration v18 no Supabase para compartilhar.'}
        <br>Obtenha grátis em <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--accent);">aistudio.google.com</a>
      </p>
    </details>
  `;
  const inp = document.getElementById('ai-key-input');
  document.getElementById('ai-key-save')?.addEventListener('click', async () => {
    const v = inp.value.trim();
    setLocalKey(v);
    if (sharedOK) {
      const ok = await saveSharedKey(v);
      _refs.toast?.(ok ? 'Chave Gemini compartilhada salva ✓' : 'Salva localmente (falha no compartilhar)', ok ? 'success' : 'warning');
    } else {
      _cachedSharedKey = v;
      _refs.toast?.('Chave salva localmente neste navegador', 'success');
    }
    await renderKeyBox();
  });
  document.getElementById('ai-key-test')?.addEventListener('click', () => testKey(inp.value.trim()));
}

// Testa a chave fazendo (1) lista de modelos disponíveis e (2) chamada REAL de
// generateContent num modelo flash. Reporta qual modelo funcionou.
async function testKey(key) {
  const resultEl = document.getElementById('ai-key-test-result');
  if (!resultEl) return;
  if (!key) { resultEl.innerHTML = '<span style="color:var(--yellow);">⚠ Cole a chave antes de testar.</span>'; return; }

  resultEl.innerHTML = '<span style="color:var(--fg-muted);">⏳ Etapa 1/2: listando modelos...</span>';

  // Etapa 1: ListModels
  let availableModels = [];
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    const txt = await res.text();
    let json = {}; try { json = JSON.parse(txt); } catch {}
    if (!res.ok) {
      const msg = json?.error?.message || txt.slice(0, 200);
      if (res.status === 400) {
        resultEl.innerHTML = `<div style="color:var(--red);font-weight:600;">✕ Chave INVÁLIDA (400)</div><div style="color:var(--fg-muted);margin-top:3px;">Crie outra em <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--accent);">aistudio.google.com/app/apikey</a>.<br><br><span style="font-size:9.5px;">Detalhe: ${escapeHtml(msg)}</span></div>`;
      } else if (res.status === 403) {
        resultEl.innerHTML = `<div style="color:var(--red);font-weight:600;">🚫 API não habilitada (403)</div><div style="color:var(--fg-muted);margin-top:3px;">Habilite a "Generative Language API" em <a href="https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com" target="_blank" style="color:var(--accent);">console.cloud.google.com</a>.<br><br><span style="font-size:9.5px;">Detalhe: ${escapeHtml(msg)}</span></div>`;
      } else {
        resultEl.innerHTML = `<div style="color:var(--red);font-weight:600;">✕ Erro ${res.status}</div><div style="color:var(--fg-muted);margin-top:3px;font-size:9.5px;">${escapeHtml(msg)}</div>`;
      }
      return;
    }
    if (!Array.isArray(json.models)) {
      resultEl.innerHTML = `<div style="color:var(--red);font-weight:600;">✕ Resposta inesperada</div><div style="font-size:10px;color:var(--fg-muted);margin-top:3px;">${escapeHtml(txt.slice(0,200))}</div>`;
      return;
    }
    availableModels = json.models
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
  } catch (err) {
    resultEl.innerHTML = `<div style="color:var(--red);font-weight:600;">✕ Erro de rede</div><div style="color:var(--fg-muted);margin-top:3px;font-size:10px;">${escapeHtml(err.message || String(err))}</div>`;
    return;
  }

  if (!availableModels.length) {
    resultEl.innerHTML = `<div style="color:var(--red);font-weight:600;">✕ Nenhum modelo com generateContent disponível</div><div style="color:var(--fg-muted);margin-top:3px;font-size:10.5px;">A chave existe mas não tem acesso a nenhum modelo capaz de gerar texto. Provavelmente o projeto Google Cloud não tem a API habilitada corretamente. Tente criar uma chave NOVA em <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--accent);">aistudio.google.com</a>.</div>`;
    return;
  }

  // Etapa 2: tenta uma chamada real em modelos preferenciais (na ordem)
  resultEl.innerHTML = `<span style="color:var(--fg-muted);">⏳ Etapa 2/2: testando chamada real... (${availableModels.length} modelos disponíveis)</span>`;

  const preferred = ['gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-2.0-flash-exp', 'gemini-1.5-pro'];
  const tryOrder = [
    ...preferred.filter(m => availableModels.includes(m)),
    ...availableModels.filter(m => /flash|pro/i.test(m) && !preferred.includes(m)),
  ].slice(0, 5);

  const tries = [];
  let workingModel = null;
  for (const model of tryOrder) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Responda apenas "OK".' }] }],
            generationConfig: { maxOutputTokens: 5, temperature: 0 },
          }),
        }
      );
      if (res.ok) {
        const j = await res.json();
        const reply = j?.candidates?.[0]?.content?.parts?.[0]?.text || '(vazio)';
        workingModel = model;
        tries.push({ model, ok: true, reply: reply.trim().slice(0, 20) });
        break;
      } else {
        const txt = await res.text();
        let parsedMsg = '';
        try { parsedMsg = JSON.parse(txt)?.error?.message || ''; } catch {}
        tries.push({ model, ok: false, status: res.status, msg: parsedMsg || txt.slice(0, 80) });
      }
    } catch (err) {
      tries.push({ model, ok: false, msg: err.message });
    }
  }

  if (workingModel) {
    const triedHtml = tries.map(t => t.ok ? `<div style="color:var(--green);">✓ <b>${t.model}</b> respondeu "${escapeHtml(t.reply)}"</div>` : `<div style="color:var(--red);">✕ ${t.model} (${t.status || 'erro'})</div>`).join('');
    resultEl.innerHTML = `
      <div style="color:var(--green);font-weight:600;margin-bottom:5px;">✓ Chave funcionando! Modelo ativo: <b>${workingModel}</b></div>
      ${triedHtml}
      <div style="color:var(--fg-muted);margin-top:6px;font-size:10px;">Clique <b>Salvar</b> acima e feche este painel para usar o chat.</div>
    `;
  } else {
    const triedHtml = tries.map(t => `<div style="color:var(--red);">✕ ${t.model}: HTTP ${t.status || '?'} — ${escapeHtml(t.msg || 'sem detalhe')}</div>`).join('');
    resultEl.innerHTML = `
      <div style="color:var(--red);font-weight:600;margin-bottom:5px;">✕ Chave existe mas nenhum modelo respondeu</div>
      ${triedHtml}
      <div style="color:var(--fg-muted);margin-top:6px;font-size:10px;">
        <b>Modelos disponíveis nesta chave:</b><br>
        <span style="font-family:monospace;font-size:9.5px;background:var(--bg-elev);padding:3px 6px;border-radius:4px;display:inline-block;margin-top:3px;">${availableModels.slice(0, 10).join(', ')}</span><br><br>
        Crie uma chave NOVA em <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--accent);">aistudio.google.com</a> escolhendo "Create API key in new project".
      </div>
    `;
  }
}

function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

// ─── SUGGESTIONS ─────────────────────────────────────────────────────────
function renderSuggestions() {
  if (!_refs?.suggestionsEl) return;
  _refs.suggestionsEl.innerHTML = '';
  SUGGESTIONS.forEach(s => {
    const b = document.createElement('button');
    b.className = 'btn btn-secondary';
    b.style.cssText = 'font-size:10.5px;padding:4px 9px;';
    b.textContent = s;
    b.addEventListener('click', () => { _refs.inputEl.value = s; _refs.inputEl.focus(); });
    _refs.suggestionsEl.appendChild(b);
  });
}

// ─── CONTEXT BUILDER ─────────────────────────────────────────────────────
function buildContext() {
  if (!_ctx.kpis) return 'Dados ainda não carregados.';
  const k = _ctx.kpis;
  const f = _ctx.filters || {};
  return `Você é um analista sênior do mercado imobiliário brasileiro, especialista em performance comercial.
Responda de forma DIRETA, OBJETIVA e em PORTUGUÊS BRASILEIRO. Use no máximo 5-6 frases curtas.
Sempre que possível, dê 1 ação concreta que o gestor pode tomar.

PERÍODO: ${_ctx.periodLabel}
FILTROS: estado=${f.estado}, cidade=${f.cidade}, gerente=${f.gerente === 'todos' ? 'todos' : 'individual'}, empreendimento=${f.empreend}

KPIs DO PERÍODO ATUAL:
- VGV Vendas: R$ ${k.vgvVendas.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} (${k.vendas} vendas)
- VGV Propostas: R$ ${k.vgvPropostas.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} (${k.propostas} propostas)
- Conv. Atendimento→Proposta: ${k.convAtendProp.toFixed(1)}%
- Conv. Proposta→Venda: ${k.convPropVenda.toFixed(1)}%
- Pace Visitas vs período anterior: ${k.paceVisitas !== null ? k.paceVisitas.toFixed(0) + '%' : 'N/D'} (${k.visitas} agora vs ${k.prevVisitas} ant.)
- Pace Propostas vs período anterior: ${k.pacePropostas !== null ? k.pacePropostas.toFixed(0) + '%' : 'N/D'} (${k.propostas} agora vs ${k.prevPropostas} ant.)
- Atividades: Check-ins=${k.checkins}, Atendimentos=${k.atendimentos}, Propostas=${k.propostas}, Vendas=${k.vendas}

Pace: ≥100% = crescendo, 80-100% = atenção, <80% = problema.`;
}

// ─── SEND MESSAGE ────────────────────────────────────────────────────────
async function sendMessage() {
  const q = (_refs.inputEl.value || '').trim();
  if (!q) return;

  const key = await getEffectiveKey();
  if (!key) { _refs.toast?.('Chave Gemini não configurada', 'warning'); return; }

  const r = readRate();
  if (r.count >= RATE_LIMIT_PER_HR) {
    const minsLeft = Math.ceil((r.resetAt - Date.now()) / 60000);
    _refs.toast?.(`Limite de ${RATE_LIMIT_PER_HR}/hora atingido. Reset em ${minsLeft}min.`, 'warning');
    return;
  }

  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble-user';
  userBubble.textContent = q;
  _refs.historyEl.appendChild(userBubble);

  _refs.inputEl.value = '';
  _refs.sendEl.disabled = true;

  const thinking = document.createElement('div');
  thinking.className = 'chat-bubble-ai';
  thinking.innerHTML = '<span style="opacity:.6;">analisando os KPIs...</span>';
  _refs.historyEl.appendChild(thinking);
  _refs.historyEl.scrollTop = _refs.historyEl.scrollHeight;

  // Modelos a tentar em ordem (fallback se o primeiro falhar com 404)
  // gemini-pro foi DEPRECIADO em v1beta. Removido da lista.
  const MODELS_FALLBACK = ['gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-2.0-flash-exp', 'gemini-1.5-pro'];
  let res, usedModel;
  const payload = JSON.stringify({
    contents: [{ parts: [{ text: `${buildContext()}\n\nPergunta do gestor: ${q}` }] }],
    generationConfig: { maxOutputTokens: 400, temperature: 0.65 },
  });
  try {
    for (const model of MODELS_FALLBACK) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }
      );
      usedModel = model;
      // Se 404 (modelo não disponível pra essa chave/região), tenta o próximo
      if (res.status === 404) { console.warn(`[ai-chat] ${model} retornou 404, tentando próximo...`); continue; }
      break;
    }
    if (!res.ok) {
      const errTxt = await res.text();
      // Parse mensagem de erro estruturada (Google retorna JSON)
      let parsedMsg = '';
      try { const j = JSON.parse(errTxt); parsedMsg = j?.error?.message || ''; } catch {}

      if (res.status === 400) {
        thinking.innerHTML = `<div style="color:var(--red);font-weight:600;margin-bottom:6px;">⚠ Chave inválida ou requisição malformada</div>
          <div style="font-size:11.5px;color:var(--fg-muted);line-height:1.5;">A chave Gemini parece ser inválida. Confira em
          <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--accent);">aistudio.google.com/app/apikey</a>
          e cole novamente em ⚙️ Configure a chave.<br><br><span style="font-size:10px;">Detalhe: ${escapeHtml(parsedMsg || 'sem detalhes')}</span></div>`;
        return;
      }
      if (res.status === 403) {
        thinking.innerHTML = `<div style="color:var(--red);font-weight:600;margin-bottom:6px;">🚫 Acesso negado pela Google</div>
          <div style="font-size:11.5px;color:var(--fg-muted);line-height:1.5;">A chave pode estar restrita por IP/domínio, ou a Generative Language API não está habilitada no projeto Google Cloud associado.<br><br>Verifique em <a href="https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com" target="_blank" style="color:var(--accent);">console.cloud.google.com</a>.<br><br><span style="font-size:10px;">Detalhe: ${escapeHtml(parsedMsg || 'sem detalhes')}</span></div>`;
        return;
      }
      if (res.status === 429) {
        thinking.innerHTML = `<div style="color:var(--yellow);font-weight:600;margin-bottom:6px;">⏳ Cota gratuita do Gemini esgotada</div>
          <div style="font-size:11.5px;color:var(--fg-muted);line-height:1.5;">
          A chave em uso bateu o limite por minuto (15 RPM) ou por dia (1500 RPD).<br><br>
          <b>Por que aconteceu?</b> Mesmo sem ter perguntado aqui, sua chave pode estar:<br>
          • Sendo usada em outros projetos<br>
          • Em um projeto sem billing habilitado (limite mais baixo)<br>
          • Acabou de ser criada e o limite ainda não estabilizou<br><br>
          <b>Soluções:</b><br>
          1) Aguarde 1-2 minutos e tente de novo<br>
          2) Crie outra chave em <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--accent);">aistudio.google.com</a><br>
          3) Master pode trocar a chave compartilhada no ⚙️ acima<br><br>
          <span style="font-size:10px;">Detalhe: ${escapeHtml(parsedMsg || 'sem detalhes')}</span></div>`;
        return;
      }
      throw new Error(`HTTP ${res.status}: ${parsedMsg || errTxt.slice(0, 200)}`);
    }
    const json = await res.json();
    const answer = json?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta da IA.';
    thinking.innerHTML = formatMarkdownLite(answer);
    bumpRate();
    updateRateLabel();
  } catch (err) {
    console.error('[ai-chat]', err);
    thinking.innerHTML = `<span style="color:var(--red);">⚠ Erro: ${escapeHtml(err.message || String(err))}</span>`;
  } finally {
    _refs.sendEl.disabled = false;
    _refs.historyEl.scrollTop = _refs.historyEl.scrollHeight;
  }
}

function formatMarkdownLite(text) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  s = s.replace(/\*(.+?)\*/g, '<i>$1</i>');
  s = s.replace(/`(.+?)`/g, '<code style="background:var(--bg);padding:1px 5px;border-radius:4px;font-size:12px;">$1</code>');
  s = s.replace(/\n/g, '<br>');
  return s;
}

// ─── PUBLIC API ──────────────────────────────────────────────────────────
export async function initAiChat(refs) {
  _refs = refs;
  await loadSharedKey();
  await renderKeyBox();
  renderSuggestions();
  updateRateLabel();

  _refs.sendEl.addEventListener('click', sendMessage);
  _refs.inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  const welcome = document.createElement('div');
  welcome.className = 'chat-bubble-ai';
  welcome.innerHTML = '👋 Olá! Posso analisar os KPIs atuais e sugerir ações. Os filtros aplicados na tela definem o contexto.';
  _refs.historyEl.appendChild(welcome);
}

export function updateAiContext(ctx) {
  _ctx = { ..._ctx, ...ctx };
}
