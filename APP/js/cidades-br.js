// Fonte automática de cidades (municípios) de PR e SC, via API do IBGE.
// - Busca uma vez e guarda em cache (memória + localStorage).
// - Se a API falhar (offline), usa uma lista mínima de fallback.
// Cada item: { nome, uf }.

const CACHE_KEY = 'rottas-cidades-br-v1';
const UFS = ['PR', 'SC'];

// Fallback enxuto (principais cidades) caso o IBGE esteja indisponível.
const FALLBACK = [
  { nome: 'Curitiba', uf: 'PR' }, { nome: 'Londrina', uf: 'PR' }, { nome: 'Maringá', uf: 'PR' },
  { nome: 'Ponta Grossa', uf: 'PR' }, { nome: 'Cascavel', uf: 'PR' }, { nome: 'São José dos Pinhais', uf: 'PR' },
  { nome: 'Foz do Iguaçu', uf: 'PR' }, { nome: 'Colombo', uf: 'PR' }, { nome: 'Guarapuava', uf: 'PR' },
  { nome: 'Paranaguá', uf: 'PR' }, { nome: 'Araucária', uf: 'PR' }, { nome: 'Pinhais', uf: 'PR' },
  { nome: 'Toledo', uf: 'PR' }, { nome: 'Apucarana', uf: 'PR' }, { nome: 'Campo Largo', uf: 'PR' },
  { nome: 'Florianópolis', uf: 'SC' }, { nome: 'Joinville', uf: 'SC' }, { nome: 'Blumenau', uf: 'SC' },
  { nome: 'Itajaí', uf: 'SC' }, { nome: 'Balneário Camboriú', uf: 'SC' }, { nome: 'Chapecó', uf: 'SC' },
  { nome: 'Criciúma', uf: 'SC' }, { nome: 'São José', uf: 'SC' }, { nome: 'Palhoça', uf: 'SC' },
  { nome: 'Lages', uf: 'SC' }, { nome: 'Jaraguá do Sul', uf: 'SC' }, { nome: 'Brusque', uf: 'SC' },
  { nome: 'Camboriú', uf: 'SC' }, { nome: 'Tubarão', uf: 'SC' }, { nome: 'Itapema', uf: 'SC' },
].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

let _cache = null;

export async function loadCidadesBR() {
  if (_cache) return _cache;
  // 1) cache local
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) { _cache = arr; return _cache; }
    }
  } catch (e) {}
  // 2) IBGE
  try {
    const results = await Promise.all(UFS.map(uf =>
      fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
        .then(r => { if (!r.ok) throw new Error('IBGE ' + r.status); return r.json(); })
        .then(arr => arr.map(m => ({ nome: m.nome, uf })))
    ));
    const all = results.flat().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    if (!all.length) throw new Error('IBGE vazio');
    _cache = all;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(all)); } catch (e) {}
    return _cache;
  } catch (e) {
    console.warn('[cidades] IBGE indisponível, usando fallback:', e.message);
    _cache = FALLBACK.slice();
    return _cache;
  }
}

// Mapa nome(lower) -> uf. Se a cidade existir em mais de uma UF, marca null (ambíguo).
export function mapaCidadeUf(list) {
  const m = new Map();
  (list || []).forEach(c => {
    const k = (c.nome || '').trim().toLowerCase();
    if (!k) return;
    if (m.has(k) && m.get(k) !== c.uf) m.set(k, null);
    else if (!m.has(k)) m.set(k, c.uf);
  });
  return m;
}
