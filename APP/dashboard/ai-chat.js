// ═════════════════════════════════════════════════════════════════════════
// Imob Rottas · Dashboard · ai-chat.js
// Chat IA com Google Gemini 2.0 Flash (grátis), rate-limit local 20/hora
// ═════════════════════════════════════════════════════════════════════════

const GEMINI_KEY_STORAGE = 'rottas-dash-gemini-key';
const RATE_STORAGE       = 'rottas-dash-ai-rate';
const RATE_LIMIT_PER_HR  = 20;

let _ctx = { kpis: null, filters: null, periodLabel: '—' };
let _refs = null;

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
function bumpRate() {
  const r = readRate();
  r.count = (r.count || 0) + 1;
  writeRate(r);
  return r;
}
function updateRateLabel() {
  if (!_refs?.rateEl) return;
  const r = readRate();
  const remaining = Math.max(0, RATE_LIMIT_PER_HR - r.count);
  _refs.rateEl.textContent = `${RATE_LIMIT_PER_HR} perguntas/hora · ${r.count} usadas · ${remaining} restantes`;
}

// ─── KEY MANAGEMENT ──────────────────────────────────────────────────────
function getKey() { return localStorage.getItem(GEMINI_KEY_STORAGE) || ''; }
function setKey(k) { localStorage.setItem(GEMINI_KEY_STORAGE, (k || '').trim()); }

function renderKeyBox() {
  if (!_refs?.keyboxEl) return;
  const key = getKey();
  if (!_refs.canManageKey && !key) {
    _refs.keyboxEl.innerHTML = `<div style="font-size:11px;color:var(--fg-muted);padding:8px;background:var(--bg-elev);border-radius:8px;">
      Chat IA não configurado. Peça ao Master/Gestor para adicionar a chave Gemini.</div>`;
    if (_refs.inputEl) _refs.inputEl.disabled = true;
    if (_refs.sendEl)  _refs.sendEl.disabled = true;
    return;
  }
  if (!_refs.canManageKey) { _refs.keyboxEl.innerHTML = ''; return; }

  _refs.keyboxEl.innerHTML = `
    <details style="font-size:11px;">
      <summary style="cursor:pointer;color:var(--fg-muted);padding:4px 0;">
        ⚙️ ${key ? 'Chave Gemini configurada' : '⚠ Configure a chave Gemini'} ${key ? '(clique para alterar)' : ''}
      </summary>
      <div style="display:flex;gap:6px;margin-top:6px;">
        <input id="ai-key-input" type="password" class="ctrl" style="flex:1;" placeholder="Chave Gemini API (aistudio.google.com)" value="${escapeAttr(key)}" />
        <button id="ai-key-save" class="btn btn-secondary">Salvar</button>
      </div>
      <p style="font-size:10px;color:var(--fg-muted);margin-top:6px;">
        Obtenha grátis em <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--accent);">aistudio.google.com</a>
      </p>
    </details>
  `;
  const inp = document.getElementById('ai-key-input');
  document.getElementById('ai-key-save')?.addEventListener('click', () => {
    setKey(inp.value);
    _refs.toast?.('Chave Gemini salva', 'success');
    renderKeyBox();
  });
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
- VGV Vendas: R$ ${k.vgvVendas.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} (${k.vendas} vendas efetivadas)
- VGV Propostas: R$ ${k.vgvPropostas.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} (${k.propostas} propostas)
- Conv. Atendimento → Proposta: ${k.convAtendProp.toFixed(1)}%
- Conv. Proposta → Venda: ${k.convPropVenda.toFixed(1)}%
- Pace Visitas vs período anterior: ${k.paceVisitas !== null ? k.paceVisitas.toFixed(0) + '%' : 'N/D'} (${k.visitas} agora vs ${k.prevVisitas} ant.)
- Pace Propostas vs período anterior: ${k.pacePropostas !== null ? k.pacePropostas.toFixed(0) + '%' : 'N/D'} (${k.propostas} agora vs ${k.prevPropostas} ant.)
- Atividades totais: Check-ins=${k.checkins}, Atendimentos=${k.atendimentos}, Propostas=${k.propostas}, Vendas=${k.vendas}

Interpretação de Pace: ≥100% = crescendo (saudável), 80-100% = atenção (estável), <80% = problema (queda).`;
}

// ─── SEND MESSAGE ────────────────────────────────────────────────────────
async function sendMessage() {
  const q = (_refs.inputEl.value || '').trim();
  if (!q) return;

  const key = getKey();
  if (!key) { _refs.toast?.('Configure a chave Gemini primeiro', 'warning'); return; }

  const r = readRate();
  if (r.count >= RATE_LIMIT_PER_HR) {
    const minsLeft = Math.ceil((r.resetAt - Date.now()) / 60000);
    _refs.toast?.(`Limite de ${RATE_LIMIT_PER_HR} perguntas/hora atingido. Reset em ${minsLeft} min.`, 'warning');
    return;
  }

  // UI: bolha do user
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

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${buildContext()}\n\nPergunta do gestor: ${q}` }] }],
          generationConfig: { maxOutputTokens: 400, temperature: 0.65 },
        }),
      }
    );
    if (!res.ok) {
      const errTxt = await res.text();
      throw new Error(`HTTP ${res.status}: ${errTxt.slice(0, 200)}`);
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

// Markdown leve: **bold**, *italic*, `code`, line breaks
function formatMarkdownLite(text) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  s = s.replace(/\*(.+?)\*/g, '<i>$1</i>');
  s = s.replace(/`(.+?)`/g, '<code style="background:var(--bg);padding:1px 5px;border-radius:4px;font-size:12px;">$1</code>');
  s = s.replace(/\n/g, '<br>');
  return s;
}

// ─── PUBLIC API ──────────────────────────────────────────────────────────
export function initAiChat(refs) {
  _refs = refs;
  renderKeyBox();
  renderSuggestions();
  updateRateLabel();

  _refs.sendEl.addEventListener('click', sendMessage);
  _refs.inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // Mensagem inicial
  const welcome = document.createElement('div');
  welcome.className = 'chat-bubble-ai';
  welcome.innerHTML = '👋 Olá! Posso analisar os KPIs atuais e sugerir ações. Os filtros aplicados na tela definem o contexto da minha resposta.';
  _refs.historyEl.appendChild(welcome);
}

export function updateAiContext(ctx) {
  _ctx = { ..._ctx, ...ctx };
}
