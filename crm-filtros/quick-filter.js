(() => {
  'use strict';
  const X = window.CRMV2;
  if (!X) return;
  const S = X.state;
  const $ = X.$;

  const quickKeys = ['country','state','ddd','contacted','prospectStatus','activity','category'];

  function setOptions(id, values, firstLabel='Todos') {
    const el = $(id);
    if (!el) return;
    const current = el.value;
    el.innerHTML = `<option value="">${X.escapeHtml(firstLabel)}</option>` + values.map(v => `<option>${X.escapeHtml(v)}</option>`).join('');
    if (values.includes(current)) el.value = current;
  }

  function populateQuickOptions() {
    setOptions('quickCountry', X.uniqueValues('country'));
    setOptions('quickState', X.uniqueValues('state'));
    setOptions('quickDdd', X.uniqueValues('ddd'));
    setOptions('quickActivity', X.uniqueValues('activity'), 'Todas');
    setOptions('quickCategory', X.uniqueValues('category'), 'Todas');
  }

  function syncQuickFromState() {
    populateQuickOptions();
    const map = {
      quickSort:'sort', quickCountry:'country', quickState:'state', quickDdd:'ddd',
      quickContacted:'contacted', quickProspectStatus:'prospectStatus',
      quickActivity:'activity', quickCategory:'category'
    };
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
    if ($('quickFilterPopover').classList.contains('hidden')) openQuick();
    else closeQuick();
  }

  function applyQuick() {
    syncStateFromQuick();
    closeQuick();
    X.renderList();
  }

  function clearQuick() {
    S.filters.country = '';
    S.filters.state = '';
    S.filters.ddd = '';
    S.filters.contacted = '';
    S.filters.prospectStatus = '';
    S.filters.activity = '';
    S.filters.category = '';
    S.filters.sort = 'az';
    S.page = 1;
    if (X.syncFiltersToUi) X.syncFiltersToUi();
    syncQuickFromState();
    X.renderList();
  }

  function openFullFilters() {
    closeQuick();
    if (X.syncFiltersToUi) X.syncFiltersToUi();
    X.openSheet('filtersPanel');
  }

  const originalRenderList = X.renderList;
  X.renderList = function(...args) {
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
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeQuick();
  });

  updateBadge();
})();
