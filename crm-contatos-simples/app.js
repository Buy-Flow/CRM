(() => {
  'use strict';

  const PAGE_SIZE = 60;
  const DB_NAME = 'crm-contatos-simples';
  const DB_VERSION = 1;
  const STORE = 'contacts';
  const STATUS_OPTIONS = ['Não contatado','Tentativa','Falou comigo','Retornar','Interessado','Sem interesse','Cliente'];

  const state = {
    db: null,
    contacts: [],
    filtered: [],
    page: 1,
    selected: new Set(),
    currentId: null,
    importRows: [],
    filters: {
      search: '', country: '', state: '', ddd: '', contacted: '', prospectStatus: '',
      numberStatus: '', family: '', activity: '', category: '', confidence: '', duplicate: '', sort: 'az'
    }
  };

  const $ = (id) => document.getElementById(id);
  const qs = (sel, root=document) => root.querySelector(sel);
  const qsa = (sel, root=document) => [...root.querySelectorAll(sel)];
  const escapeHtml = (value='') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const normalizeText = (value='') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const digits = (value='') => String(value).replace(/\D/g,'');
  const nowIso = () => new Date().toISOString();
  const displayDate = (value) => {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'});
  };
  const inputDate = (value) => {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10);
  };
  const makeId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.classList.add('hidden'), 2800);
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('phone', 'phone', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(mode='readonly') {
    return state.db.transaction(STORE, mode).objectStore(STORE);
  }

  function dbGetAll() {
    return new Promise((resolve, reject) => {
      const req = tx().getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function dbPut(contact) {
    return new Promise((resolve, reject) => {
      const req = tx('readwrite').put(contact);
      req.onsuccess = () => resolve(contact);
      req.onerror = () => reject(req.error);
    });
  }

  function dbBulkPut(contacts) {
    return new Promise((resolve, reject) => {
      const transaction = state.db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      contacts.forEach(c => store.put(c));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function dbDelete(id) {
    return new Promise((resolve, reject) => {
      const req = tx('readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function dbBulkDelete(ids) {
    return new Promise((resolve, reject) => {
      const transaction = state.db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      ids.forEach(id => store.delete(id));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function normalizeHeader(header='') {
    return normalizeText(header).replace(/[^a-z0-9]+/g,'');
  }

  const HEADER_MAP = {
    nome: ['nome','name'],
    telefoneOriginal: ['telefoneoriginal','telefone','phoneoriginal','phone'],
    telefoneNormalizado: ['telefonenormalizado','telefonenormal','whatsapp','celularnormalizado'],
    jaContatei: ['jacontatei','contatado','contacted'],
    statusNumero: ['statusdonumero','statusnumero','numberstatus'],
    pais: ['pais','country'],
    estado: ['estadouf','estado','uf','state'],
    ddd: ['ddd','areacode'],
    referencia: ['referenciafamiliar','referencia','familiar'],
    atividade: ['atividadeprofissao','atividade','profissao','occupation'],
    categoria: ['categoria','category'],
    tags: ['tags','tag'],
    confianca: ['confianca','confidence'],
    duplicado: ['duplicado','duplicate'],
    organizacao: ['organizacao','empresa','organization','company'],
    observacaoOriginal: ['observacaooriginal','observacao','notaoriginal'],
    email: ['email','e-mail'],
    observacaoContato: ['observacaodocontato','observacaocontato','notadocontato','nota']
  };

  function readByAliases(row, aliases) {
    const keys = Object.keys(row);
    const found = keys.find(k => aliases.includes(normalizeHeader(k)));
    return found ? row[found] : '';
  }

  function boolish(value) {
    const n = normalizeText(value);
    return ['sim','yes','true','1','☑ sim','contatado'].some(x => n === x || n.includes('☑'));
  }

  function normalizePhone(value, country='') {
    const raw = digits(value);
    if (!raw) return '';
    if (raw.startsWith('55') && raw.length >= 12) return `+${raw}`;
    if (normalizeText(country).includes('brasil') && (raw.length === 10 || raw.length === 11)) return `+55${raw}`;
    if (raw.startsWith('1') && raw.length === 11) return `+${raw}`;
    if (normalizeText(country).includes('estados unidos') && raw.length === 10) return `+1${raw}`;
    if (String(value).trim().startsWith('+')) return `+${raw}`;
    return raw;
  }

  function rowToContact(row) {
    const get = (field) => readByAliases(row, HEADER_MAP[field]);
    const country = String(get('pais') || '').trim();
    const originalPhone = String(get('telefoneOriginal') || get('telefoneNormalizado') || '').trim();
    const phone = normalizePhone(get('telefoneNormalizado') || originalPhone, country);
    const contacted = boolish(get('jaContatei'));
    return {
      id: makeId(),
      name: String(get('nome') || 'Sem nome').trim() || 'Sem nome',
      phoneOriginal: originalPhone,
      phone,
      contacted,
      numberStatus: String(get('statusNumero') || '').trim(),
      country,
      state: String(get('estado') || '').trim(),
      ddd: String(get('ddd') || '').trim(),
      familyRef: String(get('referencia') || '').trim(),
      activity: String(get('atividade') || '').trim(),
      category: String(get('categoria') || '').trim(),
      tags: String(get('tags') || '').trim(),
      confidence: String(get('confianca') || '').trim(),
      duplicate: boolish(get('duplicado')),
      organization: String(get('organizacao') || '').trim(),
      originalNote: String(get('observacaoOriginal') || '').trim(),
      email: String(get('email') || '').trim(),
      contactNote: String(get('observacaoContato') || '').trim(),
      prospectStatus: contacted ? 'Falou comigo' : 'Não contatado',
      lastContact: contacted ? nowIso() : '',
      nextContact: '',
      interactions: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }

  function uniqueValues(field) {
    return [...new Set(state.contacts.map(c => String(c[field] || '').trim()).filter(Boolean))]
      .sort((a,b) => a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'}));
  }

  function fillSelect(id, values, firstLabel='Todos') {
    const el = $(id);
    const current = el.value;
    el.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>` + values.map(v => `<option>${escapeHtml(v)}</option>`).join('');
    if (values.includes(current)) el.value = current;
  }

  function refreshFilterOptions() {
    fillSelect('filterState', uniqueValues('state'));
    fillSelect('filterDdd', uniqueValues('ddd'));
    fillSelect('filterFamily', uniqueValues('familyRef'), 'Todas');
    fillSelect('filterActivity', uniqueValues('activity'), 'Todas');
    fillSelect('filterCategory', uniqueValues('category'), 'Todas');
  }

  function filterContacts() {
    const f = state.filters;
    const term = normalizeText(f.search);
    let list = state.contacts.filter(c => {
      if (term) {
        const hay = normalizeText([c.name,c.phone,c.phoneOriginal,c.activity,c.category,c.organization,c.familyRef,c.tags,c.contactNote,c.originalNote,c.email].join(' '));
        if (!hay.includes(term)) return false;
      }
      if (f.country && c.country !== f.country) return false;
      if (f.state && c.state !== f.state) return false;
      if (f.ddd && c.ddd !== f.ddd) return false;
      if (f.contacted === 'yes' && !c.contacted) return false;
      if (f.contacted === 'no' && c.contacted) return false;
      if (f.prospectStatus && c.prospectStatus !== f.prospectStatus) return false;
      if (f.numberStatus && c.numberStatus !== f.numberStatus) return false;
      if (f.family && c.familyRef !== f.family) return false;
      if (f.activity && c.activity !== f.activity) return false;
      if (f.category && c.category !== f.category) return false;
      if (f.confidence && c.confidence !== f.confidence) return false;
      if (f.duplicate === 'yes' && !c.duplicate) return false;
      if (f.duplicate === 'no' && c.duplicate) return false;
      return true;
    });

    const byName = (a,b) => a.name.localeCompare(b.name,'pt-BR',{numeric:true,sensitivity:'base'});
    if (f.sort === 'az') list.sort(byName);
    else if (f.sort === 'za') list.sort((a,b) => -byName(a,b));
    else if (f.sort === 'newest') list.sort((a,b) => new Date(b.updatedAt||0) - new Date(a.updatedAt||0));
    else if (f.sort === 'oldest') list.sort((a,b) => new Date(a.updatedAt||0) - new Date(b.updatedAt||0));
    else if (f.sort === 'next') list.sort((a,b) => {
      if (!a.nextContact && !b.nextContact) return byName(a,b);
      if (!a.nextContact) return 1;
      if (!b.nextContact) return -1;
      return new Date(a.nextContact) - new Date(b.nextContact);
    });

    state.filtered = list;
    const maxPage = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (state.page > maxPage) state.page = maxPage;
  }

  function statusClass(status='') {
    return `status-${status.replace(/\s+/g,'-')}`;
  }

  function phoneHref(phone='') {
    const d = digits(phone);
    return d ? `tel:+${d}` : '#';
  }

  function whatsappHref(phone='') {
    const d = digits(phone);
    return d ? `https://wa.me/${d}` : '#';
  }

  function contactCard(c) {
    const badges = [];
    if (c.country) badges.push(`<span class="badge blue">${escapeHtml(c.country)}</span>`);
    if (c.state) badges.push(`<span class="badge">${escapeHtml(c.state)}</span>`);
    if (c.ddd) badges.push(`<span class="badge">DDD ${escapeHtml(c.ddd)}</span>`);
    if (c.familyRef) badges.push(`<span class="badge amber">${escapeHtml(c.familyRef)}</span>`);
    if (c.activity) badges.push(`<span class="badge green">${escapeHtml(c.activity)}</span>`);
    if (c.category && c.category !== 'Sem categoria') badges.push(`<span class="badge">${escapeHtml(c.category)}</span>`);
    const checked = state.selected.has(c.id) ? 'checked' : '';
    const phone = c.phone || c.phoneOriginal || '';
    return `
      <article class="contact-card" data-id="${c.id}">
        <div class="select-cell"><input class="contact-select" type="checkbox" data-select-contact="${c.id}" ${checked}></div>
        <div class="contact-main">
          <div class="contact-top">
            <div>
              <div class="contact-name">${escapeHtml(c.name)}</div>
              <div class="contact-phone">${escapeHtml(phone || 'Sem telefone')}</div>
            </div>
            <button class="status-pill ${statusClass(c.prospectStatus)}" data-cycle-status="${c.id}">${escapeHtml(c.prospectStatus || 'Não contatado')}</button>
          </div>
          <div class="contact-meta">${badges.join('')}</div>
          <div class="contact-actions">
            ${phone ? `<a class="action-link whatsapp" href="${whatsappHref(phone)}" target="_blank" rel="noopener">WhatsApp</a><a class="action-link" href="${phoneHref(phone)}">Ligar</a>` : ''}
            <button class="contacted-toggle ${c.contacted ? 'on' : ''}" data-toggle-contacted="${c.id}">${c.contacted ? '✓ Contatado' : 'Marcar contato'}</button>
            <button class="details-btn" data-open-details="${c.id}">Detalhes</button>
          </div>
          ${c.nextContact ? `<div class="next-contact">Retornar: ${displayDate(c.nextContact)}</div>` : ''}
          ${c.contactNote ? `<div class="contact-note-preview">${escapeHtml(c.contactNote)}</div>` : ''}
        </div>
      </article>`;
  }

  function renderStats() {
    const base = state.contacts;
    $('statTotal').textContent = base.length;
    $('statPending').textContent = base.filter(c => !c.contacted).length;
    $('statContacted').textContent = base.filter(c => c.contacted).length;
    $('statReturn').textContent = base.filter(c => c.prospectStatus === 'Retornar').length;
    $('statInterested').textContent = base.filter(c => c.prospectStatus === 'Interessado').length;
  }

  function activeFilterEntries() {
    const labels = {
      country:'País',state:'UF',ddd:'DDD',contacted:'Contato',prospectStatus:'Status',numberStatus:'Número',
      family:'Família',activity:'Profissão',category:'Categoria',confidence:'Confiança',duplicate:'Duplicado'
    };
    return Object.entries(state.filters)
      .filter(([k,v]) => !['search','sort'].includes(k) && v)
      .map(([k,v]) => ({key:k,label:labels[k],value:v === 'yes' ? 'Sim' : v === 'no' ? 'Não' : v}));
  }

  function renderActiveFilters() {
    const entries = activeFilterEntries();
    const box = $('activeFilters');
    const badge = $('filterCountBadge');
    badge.textContent = entries.length;
    badge.classList.toggle('hidden', !entries.length);
    box.classList.toggle('hidden', !entries.length);
    box.innerHTML = entries.map(e => `<span class="filter-chip">${escapeHtml(e.label)}: ${escapeHtml(e.value)} <button data-remove-filter="${e.key}">×</button></span>`).join('');
  }

  function renderBulkBar() {
    $('bulkCount').textContent = state.selected.size;
    $('bulkBar').classList.toggle('hidden', state.selected.size === 0);
  }

  function renderList() {
    filterContacts();
    renderStats();
    renderActiveFilters();
    renderBulkBar();
    $('resultCount').textContent = `${state.filtered.length.toLocaleString('pt-BR')} ${state.filtered.length === 1 ? 'contato' : 'contatos'}`;
    $('sortBtn').textContent = state.filters.sort === 'az' ? 'A→Z' : state.filters.sort === 'za' ? 'Z→A' : state.filters.sort === 'next' ? 'Retorno' : state.filters.sort === 'newest' ? 'Recentes' : 'Antigos';

    const list = $('contactsList');
    const empty = $('emptyState');
    if (!state.filtered.length) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      $('emptyMessage').textContent = state.contacts.length ? 'Nenhum contato corresponde aos filtros atuais.' : 'Importe sua planilha para começar.';
      $('pagination').classList.add('hidden');
      return;
    }
    empty.classList.add('hidden');
    const start = (state.page - 1) * PAGE_SIZE;
    const pageRows = state.filtered.slice(start, start + PAGE_SIZE);
    list.innerHTML = pageRows.map(contactCard).join('');
    const pages = Math.ceil(state.filtered.length / PAGE_SIZE);
    $('pageInfo').textContent = `Página ${state.page} de ${pages}`;
    $('prevPageBtn').disabled = state.page <= 1;
    $('nextPageBtn').disabled = state.page >= pages;
    $('pagination').classList.toggle('hidden', pages <= 1);
  }

  function openSheet(id) {
    $('sheetBackdrop').classList.remove('hidden');
    const el = $(id);
    el.classList.add('open');
    el.setAttribute('aria-hidden','false');
  }

  function closeSheets() {
    $('sheetBackdrop').classList.add('hidden');
    qsa('.sheet.open').forEach(el => {
      el.classList.remove('open');
      el.setAttribute('aria-hidden','true');
    });
  }

  function contactById(id) {
    return state.contacts.find(c => c.id === id);
  }

  async function updateContact(id, patch) {
    const idx = state.contacts.findIndex(c => c.id === id);
    if (idx < 0) return;
    const updated = {...state.contacts[idx], ...patch, updatedAt: nowIso()};
    state.contacts[idx] = updated;
    await dbPut(updated);
    renderList();
  }

  async function toggleContacted(id) {
    const c = contactById(id);
    if (!c) return;
    const contacted = !c.contacted;
    await updateContact(id, {
      contacted,
      lastContact: contacted ? nowIso() : c.lastContact,
      prospectStatus: contacted && c.prospectStatus === 'Não contatado' ? 'Falou comigo' : c.prospectStatus
    });
    toast(contacted ? 'Contato marcado como realizado.' : 'Contato marcado como pendente.');
  }

  async function cycleStatus(id) {
    const c = contactById(id);
    if (!c) return;
    const current = Math.max(0, STATUS_OPTIONS.indexOf(c.prospectStatus));
    const next = STATUS_OPTIONS[(current + 1) % STATUS_OPTIONS.length];
    const patch = { prospectStatus: next };
    if (next !== 'Não contatado' && !c.contacted) {
      patch.contacted = true;
      patch.lastContact = nowIso();
    }
    await updateContact(id, patch);
  }

  function renderDetails(id) {
    const c = contactById(id);
    if (!c) return;
    state.currentId = id;
    $('detailSubtitle').textContent = c.name;
    const phone = c.phone || c.phoneOriginal || '';
    const origin = [
      ['País',c.country],['Estado/UF',c.state],['DDD',c.ddd],['Referência familiar',c.familyRef],
      ['Atividade/Profissão',c.activity],['Categoria',c.category],['Tags',c.tags],['Confiança',c.confidence],
      ['Duplicado',c.duplicate ? 'Sim' : 'Não'],['Organização',c.organization],['E-mail',c.email],['Status do número',c.numberStatus],
      ['Observação original',c.originalNote]
    ].filter(([,v]) => v !== '' && v != null);
    $('detailsContent').innerHTML = `
      <div class="detail-actions">
        ${phone ? `<a class="btn primary" href="${whatsappHref(phone)}" target="_blank" rel="noopener">Abrir WhatsApp</a><a class="btn ghost" href="${phoneHref(phone)}">Ligar</a>` : '<button class="btn ghost" disabled>Sem telefone</button>'}
      </div>
      <div class="detail-grid">
        <label class="field"><span>Nome</span><input id="detailName" value="${escapeHtml(c.name)}"></label>
        <label class="field"><span>Telefone</span><input id="detailPhone" value="${escapeHtml(phone)}"></label>
        <label class="field"><span>Status</span><select id="detailStatus">${STATUS_OPTIONS.map(s => `<option ${s===c.prospectStatus?'selected':''}>${escapeHtml(s)}</option>`).join('')}</select></label>
        <label class="field"><span>Próximo contato</span><input id="detailNext" type="date" value="${inputDate(c.nextContact)}"></label>
        <label class="field full"><span>Observação do contato</span><textarea id="detailNote">${escapeHtml(c.contactNote)}</textarea></label>
        <label class="field full"><span><input id="detailContacted" type="checkbox" ${c.contacted?'checked':''}> Já entrei em contato</span></label>
      </div>
      <div class="sheet-footer" style="position:static;margin-top:12px;padding-bottom:0">
        <button class="btn danger" id="detailDeleteBtn">Excluir</button>
        <button class="btn primary grow" id="detailSaveBtn">Salvar alterações</button>
      </div>
      <div class="origin-card">
        <h3>Dados de origem</h3>
        <div class="origin-list">${origin.map(([k,v]) => `<div class="origin-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}</div>
      </div>
      <div class="history-card">
        <h3>Histórico</h3>
        <div id="historyEntries">${(c.interactions||[]).slice().reverse().map(i => `<div class="history-entry"><time>${escapeHtml(new Date(i.date).toLocaleString('pt-BR'))}</time><p>${escapeHtml(i.note)}</p></div>`).join('') || '<p class="muted">Nenhuma interação registrada.</p>'}</div>
        <div class="history-add">
          <textarea class="field" id="historyNote" placeholder="Ex.: Pediu para retornar sexta às 14h"></textarea>
          <button class="btn ghost" id="addHistoryBtn">Adicionar ao histórico</button>
        </div>
      </div>`;
    openSheet('detailsPanel');
  }

  async function saveDetails() {
    const id = state.currentId;
    const c = contactById(id);
    if (!c) return;
    const contacted = $('detailContacted').checked;
    const status = $('detailStatus').value;
    await updateContact(id, {
      name: $('detailName').value.trim() || 'Sem nome',
      phone: normalizePhone($('detailPhone').value, c.country),
      contacted,
      prospectStatus: status,
      nextContact: $('detailNext').value ? new Date(`${$('detailNext').value}T12:00:00`).toISOString() : '',
      contactNote: $('detailNote').value.trim(),
      lastContact: contacted && !c.contacted ? nowIso() : c.lastContact
    });
    toast('Contato salvo.');
    renderDetails(id);
  }

  async function addHistory() {
    const c = contactById(state.currentId);
    if (!c) return;
    const note = $('historyNote').value.trim();
    if (!note) return toast('Digite uma nota para o histórico.');
    const interactions = [...(c.interactions || []), {date:nowIso(), note}];
    await updateContact(c.id, { interactions, contactNote: c.contactNote || note, lastContact: nowIso(), contacted: true });
    toast('Interação registrada.');
    renderDetails(c.id);
  }

  async function deleteCurrent() {
    const c = contactById(state.currentId);
    if (!c || !confirm(`Excluir ${c.name}?`)) return;
    await dbDelete(c.id);
    state.contacts = state.contacts.filter(x => x.id !== c.id);
    state.selected.delete(c.id);
    closeSheets();
    renderList();
    refreshFilterOptions();
    toast('Contato excluído.');
  }

  function syncFiltersFromUi() {
    state.filters.country = $('filterCountry').value;
    state.filters.state = $('filterState').value;
    state.filters.ddd = $('filterDdd').value;
    state.filters.contacted = $('filterContacted').value;
    state.filters.prospectStatus = $('filterProspectStatus').value;
    state.filters.numberStatus = $('filterNumberStatus').value;
    state.filters.family = $('filterFamily').value;
    state.filters.activity = $('filterActivity').value;
    state.filters.category = $('filterCategory').value;
    state.filters.confidence = $('filterConfidence').value;
    state.filters.duplicate = $('filterDuplicate').value;
    state.filters.sort = $('filterSort').value;
    state.page = 1;
  }

  function syncFiltersToUi() {
    $('filterCountry').value = state.filters.country;
    $('filterState').value = state.filters.state;
    $('filterDdd').value = state.filters.ddd;
    $('filterContacted').value = state.filters.contacted;
    $('filterProspectStatus').value = state.filters.prospectStatus;
    $('filterNumberStatus').value = state.filters.numberStatus;
    $('filterFamily').value = state.filters.family;
    $('filterActivity').value = state.filters.activity;
    $('filterCategory').value = state.filters.category;
    $('filterConfidence').value = state.filters.confidence;
    $('filterDuplicate').value = state.filters.duplicate;
    $('filterSort').value = state.filters.sort;
  }

  function clearFilters(keepSearch=false) {
    const search = keepSearch ? state.filters.search : '';
    state.filters = {search,country:'',state:'',ddd:'',contacted:'',prospectStatus:'',numberStatus:'',family:'',activity:'',category:'',confidence:'',duplicate:'',sort:'az'};
    if (!keepSearch) $('searchInput').value = '';
    syncFiltersToUi();
    state.page = 1;
    renderList();
  }

  function removeFilter(key) {
    if (Object.prototype.hasOwnProperty.call(state.filters,key)) state.filters[key] = '';
    syncFiltersToUi();
    state.page = 1;
    renderList();
  }

  function quickFilter(kind) {
    clearFilters(true);
    if (kind === 'pending') state.filters.contacted = 'no';
    if (kind === 'contacted') state.filters.contacted = 'yes';
    if (kind === 'return') state.filters.prospectStatus = 'Retornar';
    if (kind === 'interested') state.filters.prospectStatus = 'Interessado';
    syncFiltersToUi();
    renderList();
  }

  function toggleSort() {
    state.filters.sort = state.filters.sort === 'az' ? 'za' : 'az';
    syncFiltersToUi();
    state.page = 1;
    renderList();
  }

  function openImport() {
    $('importModal').classList.remove('hidden');
    $('importPreview').classList.add('hidden');
    $('importPreview').innerHTML = '';
    $('fileInput').value = '';
  }

  function closeImport() {
    $('importModal').classList.add('hidden');
    state.importRows = [];
  }

  async function readImportFile(file) {
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, {type:'array',cellDates:false});
      const sheet = book.Sheets[book.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, {defval:'',raw:false});
      if (!rows.length) throw new Error('O arquivo não possui linhas de dados.');
      state.importRows = rows;
      renderImportPreview(file.name);
    } catch (err) {
      console.error(err);
      toast(`Não consegui ler o arquivo: ${err.message || err}`);
    }
  }

  function renderImportPreview(filename) {
    const preview = $('importPreview');
    const rows = state.importRows;
    const headers = Object.keys(rows[0] || {});
    const sample = rows.slice(0,5);
    preview.classList.remove('hidden');
    preview.innerHTML = `
      <div class="preview-summary"><span class="badge blue">${escapeHtml(filename)}</span><span class="badge green">${rows.length.toLocaleString('pt-BR')} linhas</span><span class="badge">${headers.length} colunas</span></div>
      <div class="preview-table-wrap"><table class="preview-table"><thead><tr>${headers.slice(0,8).map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${sample.map(row=>`<tr>${headers.slice(0,8).map(h=>`<td>${escapeHtml(row[h])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="import-options">
        <strong>Se o telefone já existir:</strong>
        <label><input type="radio" name="dupMode" value="ignore" checked> Ignorar duplicado</label>
        <label><input type="radio" name="dupMode" value="update"> Atualizar o contato existente</label>
      </div>
      <button class="btn primary grow" id="confirmImportBtn">Importar ${rows.length.toLocaleString('pt-BR')} contatos</button>`;
  }

  async function confirmImport() {
    if (!state.importRows.length) return;
    const button = $('confirmImportBtn');
    if (button) { button.disabled = true; button.textContent = 'Importando...'; }
    const mode = qs('input[name="dupMode"]:checked')?.value || 'ignore';
    const existingByPhone = new Map(state.contacts.filter(c=>digits(c.phone)).map(c => [digits(c.phone), c]));
    const batch = [];
    let imported=0, updated=0, ignored=0, errors=0;
    for (const row of state.importRows) {
      try {
        const c = rowToContact(row);
        const key = digits(c.phone);
        if (key && existingByPhone.has(key)) {
          if (mode === 'ignore') { ignored++; continue; }
          const old = existingByPhone.get(key);
          const merged = {
            ...old,
            ...c,
            id: old.id,
            interactions: old.interactions || [],
            prospectStatus: old.prospectStatus || c.prospectStatus,
            contactNote: c.contactNote || old.contactNote,
            nextContact: old.nextContact || '',
            lastContact: old.lastContact || c.lastContact,
            createdAt: old.createdAt || c.createdAt,
            updatedAt: nowIso()
          };
          batch.push(merged);
          existingByPhone.set(key, merged);
          updated++;
        } else {
          batch.push(c);
          if (key) existingByPhone.set(key,c);
          imported++;
        }
      } catch (e) { errors++; }
    }
    try {
      await dbBulkPut(batch);
      state.contacts = await dbGetAll();
      refreshFilterOptions();
      clearFilters();
      closeImport();
      toast(`Importação concluída: ${imported} novos, ${updated} atualizados, ${ignored} ignorados${errors ? `, ${errors} com erro` : ''}.`);
    } catch (err) {
      console.error(err);
      toast('Erro ao salvar a importação neste dispositivo.');
      if (button) button.disabled = false;
    }
  }

  function exportFiltered() {
    if (!state.filtered.length) return toast('Não há contatos para exportar.');
    const rows = state.filtered.map(c => ({
      'Nome': c.name,
      'Telefone original': c.phoneOriginal,
      'Telefone normalizado': c.phone,
      'Já contatei?': c.contacted ? 'Sim' : 'Não',
      'Status de prospecção': c.prospectStatus,
      'Status do número': c.numberStatus,
      'País': c.country,
      'Estado/UF': c.state,
      'DDD': c.ddd,
      'Referência familiar': c.familyRef,
      'Atividade/Profissão': c.activity,
      'Categoria': c.category,
      'Tags': c.tags,
      'Confiança': c.confidence,
      'Duplicado': c.duplicate ? 'Sim' : 'Não',
      'Organização': c.organization,
      'Observação original': c.originalNote,
      'E-mail': c.email,
      'Observação do contato': c.contactNote,
      'Último contato': displayDate(c.lastContact),
      'Próximo contato': displayDate(c.nextContact)
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contatos');
    XLSX.writeFile(wb, `crm-contatos-${new Date().toISOString().slice(0,10)}.xlsx`);
    toast('Planilha exportada.');
  }

  async function bulkMarkContacted() {
    if (!state.selected.size) return;
    const selectedIds = new Set(state.selected);
    const changed = state.contacts.filter(c => selectedIds.has(c.id)).map(c => ({
      ...c, contacted:true, lastContact:c.lastContact || nowIso(), prospectStatus:c.prospectStatus === 'Não contatado' ? 'Falou comigo' : c.prospectStatus, updatedAt:nowIso()
    }));
    await dbBulkPut(changed);
    const map = new Map(changed.map(c=>[c.id,c]));
    state.contacts = state.contacts.map(c=>map.get(c.id)||c);
    state.selected.clear();
    renderList();
    toast('Contatos marcados como contatados.');
  }

  async function bulkStatus(status) {
    if (!status || !state.selected.size) return;
    const selectedIds = new Set(state.selected);
    const changed = state.contacts.filter(c => selectedIds.has(c.id)).map(c => ({
      ...c, prospectStatus:status, contacted:status === 'Não contatado' ? c.contacted : true,
      lastContact:status === 'Não contatado' ? c.lastContact : (c.lastContact || nowIso()), updatedAt:nowIso()
    }));
    await dbBulkPut(changed);
    const map = new Map(changed.map(c=>[c.id,c]));
    state.contacts = state.contacts.map(c=>map.get(c.id)||c);
    state.selected.clear();
    $('bulkStatusSelect').value = '';
    renderList();
    toast('Status atualizado.');
  }

  async function bulkDelete() {
    if (!state.selected.size || !confirm(`Excluir ${state.selected.size} contatos selecionados?`)) return;
    const ids = [...state.selected];
    await dbBulkDelete(ids);
    const set = new Set(ids);
    state.contacts = state.contacts.filter(c => !set.has(c.id));
    state.selected.clear();
    refreshFilterOptions();
    renderList();
    toast('Contatos excluídos.');
  }

  function bindEvents() {
    $('searchInput').addEventListener('input', (e) => {
      state.filters.search = e.target.value;
      state.page = 1;
      renderList();
    });
    $('openFiltersBtn').addEventListener('click', () => { syncFiltersToUi(); openSheet('filtersPanel'); });
    $('applyFiltersBtn').addEventListener('click', () => { syncFiltersFromUi(); closeSheets(); renderList(); });
    $('clearFiltersBtn').addEventListener('click', () => { clearFilters(); closeSheets(); });
    $('sheetBackdrop').addEventListener('click', closeSheets);
    qsa('[data-close-sheet]').forEach(btn => btn.addEventListener('click', closeSheets));
    $('sortBtn').addEventListener('click', toggleSort);
    $('refreshBtn').addEventListener('click', async () => { state.contacts = await dbGetAll(); refreshFilterOptions(); renderList(); toast('Lista atualizada.'); });
    $('prevPageBtn').addEventListener('click', () => { if (state.page>1){state.page--;renderList();scrollTo({top:0,behavior:'smooth'});} });
    $('nextPageBtn').addEventListener('click', () => { if (state.page*PAGE_SIZE<state.filtered.length){state.page++;renderList();scrollTo({top:0,behavior:'smooth'});} });
    $('importBtn').addEventListener('click', openImport);
    $('emptyImportBtn').addEventListener('click', openImport);
    $('closeImportBtn').addEventListener('click', closeImport);
    $('exportBtn').addEventListener('click', exportFiltered);
    $('importDropzone').addEventListener('click', () => $('fileInput').click());
    $('fileInput').addEventListener('change', e => readImportFile(e.target.files?.[0]));
    ['dragenter','dragover'].forEach(ev => $('importDropzone').addEventListener(ev, e => {e.preventDefault();$('importDropzone').classList.add('drag');}));
    ['dragleave','drop'].forEach(ev => $('importDropzone').addEventListener(ev, e => {e.preventDefault();$('importDropzone').classList.remove('drag');}));
    $('importDropzone').addEventListener('drop', e => readImportFile(e.dataTransfer?.files?.[0]));
    $('bulkContactedBtn').addEventListener('click', bulkMarkContacted);
    $('bulkStatusSelect').addEventListener('change', e => bulkStatus(e.target.value));
    $('bulkDeleteBtn').addEventListener('click', bulkDelete);
    qsa('[data-quick-filter]').forEach(btn => btn.addEventListener('click', () => quickFilter(btn.dataset.quickFilter)));

    document.addEventListener('click', async (e) => {
      const remove = e.target.closest('[data-remove-filter]');
      if (remove) return removeFilter(remove.dataset.removeFilter);
      const details = e.target.closest('[data-open-details]');
      if (details) return renderDetails(details.dataset.openDetails);
      const toggle = e.target.closest('[data-toggle-contacted]');
      if (toggle) return toggleContacted(toggle.dataset.toggleContacted);
      const cycle = e.target.closest('[data-cycle-status]');
      if (cycle) return cycleStatus(cycle.dataset.cycleStatus);
      if (e.target.id === 'confirmImportBtn') return confirmImport();
      if (e.target.id === 'detailSaveBtn') return saveDetails();
      if (e.target.id === 'addHistoryBtn') return addHistory();
      if (e.target.id === 'detailDeleteBtn') return deleteCurrent();
    });

    document.addEventListener('change', (e) => {
      const select = e.target.closest('[data-select-contact]');
      if (!select) return;
      if (select.checked) state.selected.add(select.dataset.selectContact);
      else state.selected.delete(select.dataset.selectContact);
      renderBulkBar();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeSheets();
        if (!$('importModal').classList.contains('hidden')) closeImport();
      }
    });
  }

  async function init() {
    try {
      state.db = await openDb();
      state.contacts = await dbGetAll();
      refreshFilterOptions();
      bindEvents();
      renderList();
      $('storageStatus').textContent = 'Salvo neste dispositivo';
    } catch (err) {
      console.error(err);
      $('storageStatus').textContent = 'Falha no armazenamento local';
      toast('Não foi possível abrir o armazenamento local do CRM.');
    }
  }

  init();
})();
