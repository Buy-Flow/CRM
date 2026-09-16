(() => {
  'use strict';
  const X = window.CRMV2 = {
    PAGE_SIZE:60,
    DB_NAME:'crm-contatos-simples',
    DB_VERSION:1,
    STORE:'contacts',
    STATUS_OPTIONS:['Não contatado','Tentativa','Falou comigo','Retornar','Interessado','Sem interesse','Cliente'],
    state:{db:null,contacts:[],filtered:[],page:1,selected:new Set(),currentId:null,importRows:[],filters:null}
  };
  X.emptyFilters=()=>({search:'',name:'',nameMode:'contains',phoneOriginal:'',phone:'',contacted:'',numberStatus:'',country:'',state:'',ddd:'',family:'',activity:'',category:'',tags:'',confidence:'',duplicate:'',organization:'',originalNote:'',email:'',contactNote:'',prospectStatus:'',nextContact:'',sort:'az'});
  X.state.filters=X.emptyFilters();
  X.$=id=>document.getElementById(id);
  X.qs=(sel,root=document)=>root.querySelector(sel);
  X.qsa=(sel,root=document)=>[...root.querySelectorAll(sel)];
  X.escapeHtml=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  X.normalizeText=(v='')=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  X.digits=(v='')=>String(v).replace(/\D/g,'');
  X.nowIso=()=>new Date().toISOString();
  X.todayKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  X.dateKey=v=>{if(!v)return'';const d=new Date(v);if(Number.isNaN(d.getTime()))return'';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  X.displayDate=v=>{if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'})};
  X.inputDate=v=>{if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10)};
  X.makeId=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  X.toast=message=>{const el=X.$('toast');el.textContent=message;el.classList.remove('hidden');clearTimeout(X.toast._timer);X.toast._timer=setTimeout(()=>el.classList.add('hidden'),2800)};

  X.openDb=()=>new Promise((resolve,reject)=>{const req=indexedDB.open(X.DB_NAME,X.DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(X.STORE)){const s=db.createObjectStore(X.STORE,{keyPath:'id'});s.createIndex('phone','phone',{unique:false});s.createIndex('updatedAt','updatedAt',{unique:false})}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
  X.tx=(mode='readonly')=>X.state.db.transaction(X.STORE,mode).objectStore(X.STORE);
  X.dbGetAll=()=>new Promise((resolve,reject)=>{const req=X.tx().getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)});
  X.dbPut=c=>new Promise((resolve,reject)=>{const req=X.tx('readwrite').put(c);req.onsuccess=()=>resolve(c);req.onerror=()=>reject(req.error)});
  X.dbBulkPut=contacts=>new Promise((resolve,reject)=>{const t=X.state.db.transaction(X.STORE,'readwrite'),s=t.objectStore(X.STORE);contacts.forEach(c=>s.put(c));t.oncomplete=resolve;t.onerror=()=>reject(t.error)});
  X.dbDelete=id=>new Promise((resolve,reject)=>{const req=X.tx('readwrite').delete(id);req.onsuccess=resolve;req.onerror=()=>reject(req.error)});
  X.dbBulkDelete=ids=>new Promise((resolve,reject)=>{const t=X.state.db.transaction(X.STORE,'readwrite'),s=t.objectStore(X.STORE);ids.forEach(id=>s.delete(id));t.oncomplete=resolve;t.onerror=()=>reject(t.error)});

  X.normalizeHeader=(h='')=>X.normalizeText(h).replace(/[^a-z0-9]+/g,'');
  X.HEADER_MAP={nome:['nome','name'],telefoneOriginal:['telefoneoriginal','telefone','phoneoriginal','phone'],telefoneNormalizado:['telefonenormalizado','telefonenormal','whatsapp','celularnormalizado'],jaContatei:['jacontatei','contatado','contacted'],statusNumero:['statusdonumero','statusnumero','numberstatus'],pais:['pais','country'],estado:['estadouf','estado','uf','state'],ddd:['ddd','areacode'],referencia:['referenciafamiliar','referencia','familiar'],atividade:['atividadeprofissao','atividade','profissao','occupation'],categoria:['categoria','category'],tags:['tags','tag'],confianca:['confianca','confidence'],duplicado:['duplicado','duplicate'],organizacao:['organizacao','empresa','organization','company'],observacaoOriginal:['observacaooriginal','observacao','notaoriginal'],email:['email','e-mail'],observacaoContato:['observacaodocontato','observacaocontato','notadocontato','nota']};
  X.readByAliases=(row,aliases)=>{const found=Object.keys(row).find(k=>aliases.includes(X.normalizeHeader(k)));return found?row[found]:''};
  X.boolish=value=>{const n=X.normalizeText(value);return ['sim','yes','true','1','☑ sim','contatado'].some(x=>n===x||n.includes('☑'))};
  X.normalizePhone=(value,country='')=>{const raw=X.digits(value);if(!raw)return'';if(raw.startsWith('55')&&raw.length>=12)return`+${raw}`;if(X.normalizeText(country).includes('brasil')&&(raw.length===10||raw.length===11))return`+55${raw}`;if(raw.startsWith('1')&&raw.length===11)return`+${raw}`;if(X.normalizeText(country).includes('estados unidos')&&raw.length===10)return`+1${raw}`;if(String(value).trim().startsWith('+'))return`+${raw}`;return raw};
  X.rowToContact=row=>{const get=f=>X.readByAliases(row,X.HEADER_MAP[f]);const country=String(get('pais')||'').trim();const phoneOriginal=String(get('telefoneOriginal')||get('telefoneNormalizado')||'').trim();const phone=X.normalizePhone(get('telefoneNormalizado')||phoneOriginal,country);const contacted=X.boolish(get('jaContatei'));return{id:X.makeId(),name:String(get('nome')||'Sem nome').trim()||'Sem nome',phoneOriginal,phone,contacted,numberStatus:String(get('statusNumero')||'').trim(),country,state:String(get('estado')||'').trim(),ddd:String(get('ddd')||'').trim(),familyRef:String(get('referencia')||'').trim(),activity:String(get('atividade')||'').trim(),category:String(get('categoria')||'').trim(),tags:String(get('tags')||'').trim(),confidence:String(get('confianca')||'').trim(),duplicate:X.boolish(get('duplicado')),organization:String(get('organizacao')||'').trim(),originalNote:String(get('observacaoOriginal')||'').trim(),email:String(get('email')||'').trim(),contactNote:String(get('observacaoContato')||'').trim(),prospectStatus:contacted?'Falou comigo':'Não contatado',lastContact:contacted?X.nowIso():'',nextContact:'',interactions:[],createdAt:X.nowIso(),updatedAt:X.nowIso()}};

  X.uniqueValues=field=>[...new Set(X.state.contacts.map(c=>String(c[field]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true,sensitivity:'base'}));
  X.fillSelect=(id,values,first='Todos')=>{const el=X.$(id);if(!el)return;const cur=el.value;el.innerHTML=`<option value="">${X.escapeHtml(first)}</option>`+values.map(v=>`<option>${X.escapeHtml(v)}</option>`).join('');if(values.includes(cur))el.value=cur};
  X.refreshFilterOptions=()=>{X.fillSelect('filterState',X.uniqueValues('state'));X.fillSelect('filterDdd',X.uniqueValues('ddd'));X.fillSelect('filterFamily',X.uniqueValues('familyRef'),'Todas');X.fillSelect('filterActivity',X.uniqueValues('activity'),'Todas');X.fillSelect('filterCategory',X.uniqueValues('category'),'Todas')};
  X.textMatch=(value,filter,mode='contains')=>{if(!filter)return true;const a=X.normalizeText(value),b=X.normalizeText(filter);if(mode==='starts')return a.startsWith(b);if(mode==='equals')return a===b;return a.includes(b)};
  X.phoneMatch=(value,filter)=>{if(!filter)return true;const a=X.digits(value),b=X.digits(filter);return b?a.includes(b):X.normalizeText(value).includes(X.normalizeText(filter))};
  X.nextContactMatch=(value,mode)=>{if(!mode)return true;const key=X.dateKey(value);if(mode==='none')return!key;if(mode==='scheduled')return!!key;if(!key)return false;const today=X.todayKey();if(mode==='today')return key===today;if(mode==='overdue')return key<today;return true};
})();