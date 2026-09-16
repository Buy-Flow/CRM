(() => {
  'use strict';
  const X = window.CRMV2;
  if (!X) return;
  const S = X.state;
  const $ = X.$;

  const DDD_UF = {
    11:'SP',12:'SP',13:'SP',14:'SP',15:'SP',16:'SP',17:'SP',18:'SP',19:'SP',
    21:'RJ',22:'RJ',24:'RJ',27:'ES',28:'ES',31:'MG',32:'MG',33:'MG',34:'MG',35:'MG',37:'MG',38:'MG',
    41:'PR',42:'PR',43:'PR',44:'PR',45:'PR',46:'PR',47:'SC',48:'SC',49:'SC',51:'RS',53:'RS',54:'RS',55:'RS',
    61:'DF',62:'GO',63:'TO',64:'GO',65:'MT',66:'MT',67:'MS',68:'AC',69:'RO',
    71:'BA',73:'BA',74:'BA',75:'BA',77:'BA',79:'SE',81:'PE',82:'AL',83:'PB',84:'RN',85:'CE',86:'PI',87:'PE',88:'CE',89:'PI',
    91:'PA',92:'AM',93:'PA',94:'PA',95:'RR',96:'AP',97:'AM',98:'MA',99:'MA'
  };
  const ALL_UFS = [...new Set(Object.values(DDD_UF))].sort();
  const ALL_DDDS = Object.keys(DDD_UF).sort((a,b) => Number(a)-Number(b));
  const FALLBACK_ACTIVITIES = ['Advogado','Automóveis','Banco/Financeiro','Contabilidade/Contador','Corretor/Imobiliária','Dentista','Eletricista','Mecânico/Oficina','Médico/Saúde','Moto táxi/Taxista','Pedreiro/Construção','Religioso/Igreja','Vendas'];
  const FALLBACK_CATEGORIES = ['Amigo/Amiga','Cliente','Empresa/Loja','Família','Fornecedor','Serviço/Profissão'];
  const quickKeys = ['country','state','ddd','contacted','prospectStatus','activity','category'];

  const norm = v => X.normalizeText(v || '');
  const hasAny = (text, terms) => terms.some(t => text.includes(t));

  function inferDdd(raw) {
    if (!raw) return '';
    if (raw.startsWith('55') && raw.length >= 12 && DDD_UF[raw.slice(2,4)]) return raw.slice(2,4);
    if (raw.startsWith('0') && raw.length >= 13 && DDD_UF[raw.slice(3,5)]) return raw.slice(3,5);
    if ((raw.length === 10 || raw.length === 11) && DDD_UF[raw.slice(0,2)]) return raw.slice(0,2);
    return '';
  }

  function enrichContact(c) {
    const before = [c.country,c.state,c.ddd,c.familyRef,c.activity,c.category].join('|');
    const raw = X.digits(c.phone || c.phoneOriginal || '');
    const ddd = c.ddd || inferDdd(raw);
    let country = c.country || '';

    if (!country) {
      if (ddd) country = 'Brasil';
      else if (raw.startsWith('1') && raw.length === 11) country = 'Estados Unidos';
      else if (raw.length === 10 && !DDD_UF[raw.slice(0,2)]) country = 'Estados Unidos';
      else country = 'Indeterminado';
    }

    if (!c.country) c.country = country;
    if (!c.ddd && country === 'Brasil' && ddd) c.ddd = ddd;
    if (!c.state && c.ddd && DDD_UF[c.ddd]) c.state = DDD_UF[c.ddd];

    const text = norm([c.name,c.organization,c.originalNote,c.contactNote,c.tags,c.familyRef,c.activity,c.category].filter(Boolean).join(' '));

    if (!c.familyRef) {
      if (hasAny(text,['irmao','irma '])) c.familyRef = 'Irmão/Irmã';
      else if (hasAny(text,['mae','mamae'])) c.familyRef = 'Mãe';
      else if (hasAny(text,['pai','papai'])) c.familyRef = 'Pai';
      else if (hasAny(text,['esposa'])) c.familyRef = 'Esposa';
      else if (hasAny(text,['marido'])) c.familyRef = 'Marido';
      else if (hasAny(text,['filho','filha'])) c.familyRef = 'Filho/Filha';
      else if (hasAny(text,['tio','tia'])) c.familyRef = 'Tio/Tia';
      else if (hasAny(text,['primo','prima'])) c.familyRef = 'Primo/Prima';
      else if (hasAny(text,['cunhado','cunhada'])) c.familyRef = 'Cunhado/Cunhada';
      else if (hasAny(text,['sogro','sogra'])) c.familyRef = 'Sogro/Sogra';
      else if (hasAny(text,['avo','avó'])) c.familyRef = 'Avô/Avó';
    }

    if (!c.activity) {
      if (hasAny(text,['mecanico','oficina'])) c.activity = 'Mecânico/Oficina';
      else if (hasAny(text,['moto taxi','mototaxi','taxista',' taxi'])) c.activity = 'Moto táxi/Taxista';
      else if (hasAny(text,['advogad'])) c.activity = 'Advogado';
      else if (hasAny(text,['dentista','odontolog'])) c.activity = 'Dentista';
      else if (hasAny(text,['medico','medica','clinica','saude'])) c.activity = 'Médico/Saúde';
      else if (hasAny(text,['contador','contabil','contabilidade'])) c.activity = 'Contabilidade/Contador';
      else if (hasAny(text,['corretor','imobiliaria'])) c.activity = 'Corretor/Imobiliária';
      else if (hasAny(text,['eletricista'])) c.activity = 'Eletricista';
      else if (hasAny(text,['pedreiro','construcao'])) c.activity = 'Pedreiro/Construção';
      else if (hasAny(text,['vendedor','vendedora','vendas'])) c.activity = 'Vendas';
      else if (hasAny(text,['banco','financeiro','financeira'])) c.activity = 'Banco/Financeiro';
      else if (hasAny(text,['igreja','pastor','padre'])) c.activity = 'Religioso/Igreja';
      else if (hasAny(text,['automovel','carro','veiculo'])) c.activity = 'Automóveis';
    }

    if (!c.category) {
      if (c.familyRef) c.category = 'Família';
      else if (c.activity) c.category = 'Serviço/Profissão';
      else if (c.organization) c.category = 'Empresa/Loja';
    }

    const after = [c.country,c.state,c.ddd,c.familyRef,c.activity,c.category].join('|');
    return before !== after;
  }

  let lastCount = -1;
  function enrichContacts(force=false) {
    if (!force && lastCount === S.contacts.length) return;
    lastCount = S.contacts.length;
    const changed = [];
    S.contacts.forEach(c => { if (enrichContact(c)) changed.push(c); });
    if (changed.length && X.dbBulkPut) X.dbBulkPut(changed).catch(() => {});
    if (X.refreshFilterOptions) X.refreshFilterOptions();
  }

  function setOptions(id, values, firstLabel='Todos') {
    const el = $(id);
    if (!el) return;
    const current = el.value;
    const clean = [...new Set(values.filter(Boolean))];
    el.innerHTML = `<option value="">${X.escapeHtml(firstLabel)}</option>` + clean.map(v => `<option>${X.escapeHtml(v)}</option>`).join('');
    if (clean.includes(current)) el.value = current;
  }

  function populateQuickOptions() {
    enrichContacts(true);
    const countries = X.uniqueValues('country');
    const states = X.uniqueValues('state');
    const ddds = X.uniqueValues('ddd');
    const activities = X.uniqueValues('activity');
    const categories = X.uniqueValues('category');
    setOptions('quickCountry', countries.length ? countries : ['Brasil','Estados Unidos','Indeterminado']);
    setOptions('quickState', states.length ? states : ALL_UFS);
    setOptions('quickDdd', ddds.length ? ddds : ALL_DDDS);
    setOptions('quickActivity', activities.length ? activities : FALLBACK_ACTIVITIES, 'Todas');
    setOptions('quickCategory', categories.length ? categories : FALLBACK_CATEGORIES, 'Todas');
  }

  function syncQuickFromState() {
    populateQuickOptions();
    const map = {quickSort:'sort',quickCountry:'country',quickState:'state',quickDdd:'ddd',quickContacted:'contacted',quickProspectStatus:'prospectStatus',quickActivity:'activity',quickCategory:'category'};
    Object.entries(map).forEach(([id,key]) => {
      const el = $(id);
      if (el) el.value = S.filters[key] || (key === 'sort' ? 'az' : '');
    });
  }

  function syncStateFromQuick() {
    S.filters.sort = $('quickSort').value;
    S.filters.country = $('quickCountry').value;
    S.filters.state = $('quickState').value;
    S.filters.ddd = $('quickDdd').value;
    S.filters.contacted = $('quickContacted').value;
    S.filters.prospectStatus = $('quickProspectStatus').value;
    S.filters.activity = $('quickActivity').value;
    S.filters.category = $('quickCategory').value;
    S.page = 1;
    if (X.syncFiltersToUi) X.syncFiltersToUi();
  }

  function updateBadge() {
    const count = quickKeys.filter(k => S.filters[k]).length;
    const badge = $('quickFilterBadge');
    if (!badge) return;
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
  }

  function openQuick() {
    syncQuickFromState();
    $('quickFilterPopover').classList.remove('hidden');
    $('quickFilterBtn').setAttribute('aria-expanded','true');
  }
  function closeQuick() {
    $('quickFilterPopover').classList.add('hidden');
    $('quickFilterBtn').setAttribute('aria-expanded','false');
  }
  function toggleQuick(e) {
    e.stopPropagation();
    $('quickFilterPopover').classList.contains('hidden') ? openQuick() : closeQuick();
  }
  function applyQuick() {
    syncStateFromQuick();
    closeQuick();
    X.renderList();
  }
  function clearQuick() {
    ['country','state','ddd','contacted','prospectStatus','activity','category'].forEach(k => S.filters[k] = '');
    S.filters.sort = 'az';
    S.page = 1;
    if (X.syncFiltersToUi) X.syncFiltersToUi();
    syncQuickFromState();
    X.renderList();
  }
  function openFullFilters() {
    closeQuick();
    enrichContacts(true);
    if (X.syncFiltersToUi) X.syncFiltersToUi();
    X.openSheet('filtersPanel');
  }

  const originalRenderList = X.renderList;
  X.renderList = function(...args) {
    enrichContacts();
    const result = originalRenderList.apply(X, args);
    updateBadge();
    return result;
  };

  $('quickFilterBtn')?.addEventListener('click', toggleQuick);
  $('quickApplyBtn')?.addEventListener('click', applyQuick);
  $('quickClearBtn')?.addEventListener('click', clearQuick);
  $('quickMoreBtn')?.addEventListener('click', openFullFilters);
  $('quickFilterPopover')?.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', e => {
    const pop = $('quickFilterPopover');
    if (pop && !pop.classList.contains('hidden') && !e.target.closest('#quickFilterBtn')) closeQuick();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeQuick(); });
  updateBadge();
})();
