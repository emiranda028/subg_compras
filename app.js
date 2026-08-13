(function(){
'use strict';

async function boot(){
let RAW;
try {
  const res = await fetch('data.json');
  RAW = await res.json();
} catch(err) {
  document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;color:#C4453D;">No se pudo cargar data.json. Verificá que el archivo esté subido en la misma carpeta que index.html en GitHub, con el mismo nombre exacto.<br><br>Detalle técnico: '+err.message+'</div>';
  return;
}

const EXPS = RAW.expedientes;
const OCS = RAW.ocs;
const CATEGORIAS = RAW.categorias;

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const NAVY = '#0F2438', STEEL = '#2C5F8A', RAIL = '#E0742A', RAIL_L='#F3A868',
      OK = '#2E7D5B', WARN='#C4453D', LINE='#DCE1E8';
const PALETTE = ['#0F2438','#2C5F8A','#E0742A','#5C88AC','#2E7D5B','#C4453D','#8A6FB3','#B58900',
                  '#4A7C6F','#9E5A3C','#3E6B94','#B0455E','#6D8A2E','#7A5C8A','#3F8E9E'];

function fmtMoney(n){
  if(n === null || n === undefined) return '$0';
  return '$' + Math.round(n).toLocaleString('es-AR');
}
function fmtMoneyShort(n){
  if(n >= 1e9) return '$' + (n/1e9).toFixed(1).replace('.',',') + 'M millones';
  if(n >= 1e6) return '$' + (n/1e6).toFixed(1).replace('.',',') + 'M';
  if(n >= 1e3) return '$' + (n/1e3).toFixed(0) + 'K';
  return '$' + Math.round(n);
}
function fmtMoneyAxis(n){
  if(Math.abs(n) >= 1e9) return (n/1e9).toFixed(1) + 'MM';
  if(Math.abs(n) >= 1e6) return (n/1e6).toFixed(0) + 'M';
  if(Math.abs(n) >= 1e3) return (n/1e3).toFixed(0) + 'K';
  return n;
}

// ---------------- Filter state ----------------
const state = {
  anio: 'todos',
  modo: 'todos',
  tematica: 'todos',
  status: 'todos',
  proveedor: '',
  scope: 'todos', // 'todos' | 'adjudicado' -> quick toggle for KPIs/table default view
  texto: '' // búsqueda libre en el listado (expediente, descripción, proveedor)
};

const ANIOS = [...new Set(EXPS.map(e=>e.anio))].sort();
const MODOS = [...new Set(EXPS.map(e=>e.modo))].sort();
const STATUSES = [...new Set(EXPS.map(e=>e.status))];

// ---------------- Filters UI ----------------
function buildFilters(){
  const bar = document.getElementById('filtersBar');
  bar.innerHTML = `
    <div class="filter-field scope-field">
      <label>Vista rápida</label>
      <div class="chip-toggle" id="scopeToggle">
        <button data-v="todos" class="active">Todos los estados</button>
        <button data-v="adjudicado">Solo adjudicado</button>
      </div>
    </div>
    <div class="filter-field">
      <label>Año</label>
      <select id="fAnio"><option value="todos">Todos</option>${ANIOS.map(a=>`<option value="${a}">${a}</option>`).join('')}</select>
    </div>
    <div class="filter-field">
      <label>Modo</label>
      <select id="fModo"><option value="todos">Todos</option>${MODOS.map(m=>`<option value="${m}">Modo ${m}</option>`).join('')}</select>
    </div>
    <div class="filter-field">
      <label>Temática</label>
      <select id="fTematica"><option value="todos">Todas</option>${CATEGORIAS.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
    </div>
    <div class="filter-field">
      <label>Estado</label>
      <select id="fStatus"><option value="todos">Todos</option>${STATUSES.map(s=>`<option value="${s}">${s}</option>`).join('')}</select>
    </div>
    <div class="filter-field" style="min-width:200px;">
      <label>Proveedor</label>
      <input id="fProveedor" type="text" placeholder="Buscar proveedor...">
    </div>
    <button class="btn ghost" id="btnReset">Limpiar filtros</button>
  `;

  document.getElementById('scopeToggle').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    state.scope = b.dataset.v;
    if(state.scope === 'adjudicado'){ state.status = 'ADJUDICADO'; document.getElementById('fStatus').value='ADJUDICADO'; }
    else { state.status = 'todos'; document.getElementById('fStatus').value='todos'; }
    [...document.getElementById('scopeToggle').children].forEach(c=>c.classList.toggle('active', c===b));
    refresh();
  });
  document.getElementById('fAnio').addEventListener('change', e=>{state.anio=e.target.value; refresh();});
  document.getElementById('fModo').addEventListener('change', e=>{state.modo=e.target.value; refresh();});
  document.getElementById('fTematica').addEventListener('change', e=>{state.tematica=e.target.value; refresh();});
  document.getElementById('fStatus').addEventListener('change', e=>{
    state.status=e.target.value;
    state.scope = (state.status === 'ADJUDICADO') ? 'adjudicado' : 'todos';
    [...document.getElementById('scopeToggle').children].forEach(c=>c.classList.toggle('active', c.dataset.v===state.scope));
    refresh();
  });
  document.getElementById('fProveedor').addEventListener('input', e=>{state.proveedor=e.target.value.trim().toUpperCase(); refresh();});
  document.getElementById('btnReset').addEventListener('click', ()=>{
    state.anio='todos'; state.modo='todos'; state.tematica='todos'; state.status='todos';
    state.proveedor=''; state.scope='todos'; state.texto='';
    document.getElementById('fAnio').value='todos';
    document.getElementById('fModo').value='todos';
    document.getElementById('fTematica').value='todos';
    document.getElementById('fStatus').value='todos';
    document.getElementById('fProveedor').value='';
    const buscarTabla = document.getElementById('fBuscarTabla');
    if(buscarTabla) buscarTabla.value='';
    [...document.getElementById('scopeToggle').children].forEach(c=>c.classList.toggle('active', c.dataset.v==='todos'));
    refresh();
  });
}

// ---------------- Filtering ----------------
function matchesBase(e){
  if(state.anio!=='todos' && e.anio!=Number(state.anio)) return false;
  if(state.modo!=='todos' && e.modo!==state.modo) return false;
  if(state.tematica!=='todos' && e.tematica!==state.tematica) return false;
  if(state.proveedor && !(e.proveedores||[]).some(p=>p.includes(state.proveedor)) && !(e.proveedor||'').includes(state.proveedor)) return false;
  return true;
}
function filteredExps(){
  return EXPS.filter(e=>{
    if(!matchesBase(e)) return false;
    if(state.status!=='todos' && e.status!==state.status) return false;
    return true;
  });
}
// Filtro adicional de texto libre, aplicado solo al listado de expedientes (no afecta KPIs ni gráficos)
function filteredTableRows(){
  const base = filteredExps();
  if(!state.texto) return base;
  const t = state.texto;
  return base.filter(e=>
    e.exp.toUpperCase().includes(t)
    || e.desc.toUpperCase().includes(t)
    || (e.proveedores||[]).some(p=>p.includes(t))
  );
}
function filteredOcsAdjudicado(){
  // OCs cuyo expediente esté adjudicado, respetando filtros (excepto estado, que se fuerza a ADJUDICADO)
  return OCS.filter(o=>{
    if(o.status !== 'ADJUDICADO') return false;
    if(state.anio!=='todos' && o.anio!=Number(state.anio)) return false;
    if(state.modo!=='todos' && o.modo!==state.modo) return false;
    if(state.tematica!=='todos' && o.tematica!==state.tematica) return false;
    if(state.proveedor && !o.proveedor.includes(state.proveedor)) return false;
    return true;
  });
}
function filteredExpsAdjudicado(){
  return EXPS.filter(e=>matchesBase(e) && e.status==='ADJUDICADO');
}

// ---------------- KPIs ----------------
function renderKpis(){
  const all = filteredExps();
  const adj = filteredExpsAdjudicado();
  const totalTodos = EXPS.length;
  const totalMontoAdj = adj.reduce((s,e)=>s+e.importe,0);
  const pctAdj = all.length ? (adj.length/all.length*100) : 0;
  const proc = all.filter(e=>e.status==='EN PROCESO COMPRA').length;
  const pend = all.filter(e=>e.status==='ADJUDIC. PEND.').length;

  const kpis = [
    {label:'Expedientes (filtro actual)', value: all.length.toLocaleString('es-AR'), sub:`de ${totalTodos.toLocaleString('es-AR')} cargados en total`},
    {label:'Adjudicado — Monto', value: fmtMoneyShort(totalMontoAdj), sub: fmtMoney(totalMontoAdj), accent:true},
    {label:'Adjudicado — Cantidad', value: adj.length.toLocaleString('es-AR'), sub: `${pctAdj.toFixed(1)}% del filtro actual`, accent:true},
    {label:'En proceso de compra', value: proc.toLocaleString('es-AR'), sub:'sobre filtro actual'},
    {label:'Pendiente de adjudicación', value: pend.toLocaleString('es-AR'), sub:'sobre filtro actual'},
  ];
  document.getElementById('kpiGrid').innerHTML = kpis.map(k=>`
    <div class="kpi ${k.accent?'accent':''}">
      <div class="label">${k.label}</div>
      <div class="value">${k.value}</div>
      <div class="sub">${k.sub}</div>
    </div>`).join('');
}

// ---------------- Comparativa 2025 vs 2026 ----------------
function renderCompare(){
  const el = document.getElementById('compareGrid');
  if(!el) return;
  const adj = filteredExpsAdjudicado();
  const y1 = 2025, y2 = 2026;
  const set1 = adj.filter(e=>e.anio===y1);
  const set2 = adj.filter(e=>e.anio===y2);
  const monto1 = set1.reduce((s,e)=>s+e.importe,0);
  const monto2 = set2.reduce((s,e)=>s+e.importe,0);
  const cant1 = set1.length, cant2 = set2.length;

  function deltaHtml(v1, v2){
    if(v1===0 && v2===0) return `<div class="compare-delta">— sin variación</div>`;
    if(v1===0) return `<div class="compare-delta up">▲ nuevo en ${y2}</div>`;
    const pct = ((v2-v1)/v1)*100;
    const up = pct >= 0;
    return `<div class="compare-delta ${up?'up':'down'}">${up?'▲':'▼'} ${Math.abs(pct).toFixed(1)}% vs ${y1}</div>`;
  }

  const cards = [
    {
      label:'Monto adjudicado',
      rows:[[y1, fmtMoneyShort(monto1)],[y2, fmtMoneyShort(monto2)]],
      delta: deltaHtml(monto1, monto2)
    },
    {
      label:'Cantidad de expedientes adjudicados',
      rows:[[y1, cant1.toLocaleString('es-AR')],[y2, cant2.toLocaleString('es-AR')]],
      delta: deltaHtml(cant1, cant2)
    },
    {
      label:'Ticket promedio adjudicado',
      rows:[[y1, fmtMoneyShort(cant1?monto1/cant1:0)],[y2, fmtMoneyShort(cant2?monto2/cant2:0)]],
      delta: deltaHtml(cant1?monto1/cant1:0, cant2?monto2/cant2:0)
    },
    {
      label:'Temática líder',
      custom: (()=>{
        function top(set){
          const by={}; set.forEach(e=>{by[e.tematica]=(by[e.tematica]||0)+e.importe;});
          const s = Object.entries(by).sort((a,b)=>b[1]-a[1])[0];
          return s ? s[0] : '—';
        }
        return `
          <div class="compare-row"><span class="compare-year">${y1}</span><span class="compare-val" style="font-size:13.5px;">${top(set1)}</span></div>
          <div class="compare-row"><span class="compare-year">${y2}</span><span class="compare-val rail" style="font-size:13.5px;">${top(set2)}</span></div>`;
      })()
    }
  ];

  el.innerHTML = cards.map(c=>`
    <div class="compare-card">
      <div class="label">${c.label}</div>
      ${c.custom ? c.custom : c.rows.map(([y,v])=>`<div class="compare-row"><span class="compare-year">${y}</span><span class="compare-val ${y==y2?'rail':''}">${v}</span></div>`).join('')}
      ${c.delta || ''}
    </div>`).join('');
}

// ---------------- Charts ----------------
let charts = {};
function destroy(id){ if(charts[id]){ charts[id].destroy(); delete charts[id]; } }

function chartAnio(){
  destroy('anio');
  const adj = filteredExpsAdjudicado();
  const years = state.anio==='todos' ? ANIOS : [Number(state.anio)];
  const montoByYear = years.map(y=>adj.filter(e=>e.anio===y).reduce((s,e)=>s+e.importe,0));
  const cantByYear = years.map(y=>adj.filter(e=>e.anio===y).length);
  const ctx = document.getElementById('chartAnio');
  charts.anio = new Chart(ctx, {
    data:{
      labels: years,
      datasets:[
        {type:'bar', label:'Monto adjudicado', data:montoByYear, backgroundColor:NAVY, borderRadius:4, order:2, yAxisID:'y'},
        {type:'line', label:'Cantidad expedientes', data:cantByYear, borderColor:RAIL, backgroundColor:RAIL, tension:.3, order:1, yAxisID:'y1', pointRadius:4}
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      scales:{
        y:{beginAtZero:true, ticks:{callback:v=>fmtMoneyAxis(v), font:{family:'IBM Plex Mono', size:11}}, grid:{color:LINE}},
        y1:{beginAtZero:true, position:'right', grid:{display:false}, ticks:{font:{family:'IBM Plex Mono', size:11}}},
        x:{grid:{display:false}, ticks:{font:{family:'IBM Plex Mono', size:11}}}
      },
      plugins:{legend:{position:'bottom', labels:{font:{family:'Inter', size:11.5}}},
        tooltip:{callbacks:{label:(c)=> c.dataset.yAxisID==='y' ? ' Monto: '+fmtMoney(c.raw) : ' Cantidad: '+c.raw}}}
    }
  });
}

function chartMes(){
  destroy('mes');
  const adj = filteredExpsAdjudicado();
  const montoByMes = Array.from({length:12}, (_,i)=>adj.filter(e=>e.mes===i+1).reduce((s,e)=>s+e.importe,0));
  document.getElementById('mesNote').textContent = state.anio==='todos' ? 'Todos los años cargados (acumulado)' : `Año ${state.anio}`;
  const ctx = document.getElementById('chartMes');
  charts.mes = new Chart(ctx, {
    type:'bar',
    data:{ labels: MESES.slice(1),
      datasets:[{label:'Monto adjudicado', data:montoByMes, backgroundColor:STEEL, borderRadius:4}]},
    options:{
      responsive:true, maintainAspectRatio:false,
      scales:{
        y:{beginAtZero:true, ticks:{callback:v=>fmtMoneyAxis(v), font:{family:'IBM Plex Mono', size:11}}, grid:{color:LINE}},
        x:{grid:{display:false}, ticks:{font:{family:'IBM Plex Mono', size:11}}}
      },
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>' '+fmtMoney(c.raw)}}}
    }
  });
}

function chartTematica(){
  destroy('tematica');
  const adj = filteredExpsAdjudicado();
  const byTem = {};
  adj.forEach(e=>{ byTem[e.tematica] = (byTem[e.tematica]||0) + e.importe; });
  const sorted = Object.entries(byTem).sort((a,b)=>b[1]-a[1]);
  const ctx = document.getElementById('chartTematica');
  charts.tematica = new Chart(ctx, {
    type:'bar',
    data:{ labels: sorted.map(s=>s[0]),
      datasets:[{label:'Monto adjudicado', data:sorted.map(s=>s[1]), backgroundColor:sorted.map((_,i)=>PALETTE[i%PALETTE.length]), borderRadius:4}]},
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      scales:{
        x:{beginAtZero:true, ticks:{callback:v=>fmtMoneyAxis(v), font:{family:'IBM Plex Mono', size:11}}, grid:{color:LINE}},
        y:{grid:{display:false}, ticks:{font:{family:'Inter', size:11.5}}}
      },
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>' '+fmtMoney(c.raw)}}}
    }
  });
}

function chartProveedor(){
  destroy('proveedor');
  const ocs = filteredOcsAdjudicado();
  const byProv = {};
  ocs.forEach(o=>{ byProv[o.proveedor] = (byProv[o.proveedor]||0) + o.monto; });
  const sorted = Object.entries(byProv).sort((a,b)=>b[1]-a[1]).slice(0,15);
  const ctx = document.getElementById('chartProveedor');
  charts.proveedor = new Chart(ctx, {
    type:'bar',
    data:{ labels: sorted.map(s=> s[0].length>28 ? s[0].slice(0,26)+'…' : s[0]),
      datasets:[{label:'Monto adjudicado', data:sorted.map(s=>s[1]), backgroundColor:RAIL, borderRadius:4}]},
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      scales:{
        x:{beginAtZero:true, ticks:{callback:v=>fmtMoneyAxis(v), font:{family:'IBM Plex Mono', size:11}}, grid:{color:LINE}},
        y:{grid:{display:false}, ticks:{font:{family:'Inter', size:11}}}
      },
      plugins:{legend:{display:false}, tooltip:{callbacks:{
        title:(items)=> sorted[items[0].dataIndex][0],
        label:c=>' '+fmtMoney(c.raw)
      }}}
    }
  });
}

function chartEstado(){
  destroy('estado');
  const all = filteredExps();
  const byStatus = {};
  all.forEach(e=>{ byStatus[e.status] = (byStatus[e.status]||0) + 1; });
  const labels = Object.keys(byStatus);
  const colors = labels.map(s=> s==='ADJUDICADO'?OK : s==='EN PROCESO COMPRA'?RAIL : s==='ADJUDIC. PEND.'?WARN : STEEL);
  const ctx = document.getElementById('chartEstado');
  charts.estado = new Chart(ctx, {
    type:'doughnut',
    data:{ labels, datasets:[{data:Object.values(byStatus), backgroundColor:colors, borderWidth:2, borderColor:'#fff'}]},
    options:{ responsive:true, maintainAspectRatio:false, cutout:'62%',
      plugins:{legend:{position:'bottom', labels:{font:{family:'Inter', size:11.5}}},
        tooltip:{callbacks:{label:c=>` ${c.label}: ${c.raw} (${(c.raw/all.length*100).toFixed(1)}%)`}}}}
  });
}

function chartModo(){
  destroy('modo');
  const all = filteredExps();
  const byModo = {};
  all.forEach(e=>{ byModo[e.modo] = (byModo[e.modo]||0) + 1; });
  const labels = Object.keys(byModo).sort();
  const ctx = document.getElementById('chartModo');
  charts.modo = new Chart(ctx, {
    type:'doughnut',
    data:{ labels: labels.map(l=>'Modo '+l), datasets:[{data:labels.map(l=>byModo[l]), backgroundColor:PALETTE, borderWidth:2, borderColor:'#fff'}]},
    options:{ responsive:true, maintainAspectRatio:false, cutout:'62%',
      plugins:{legend:{position:'bottom', labels:{font:{family:'Inter', size:11.5}}},
        tooltip:{callbacks:{label:c=>` ${c.label}: ${c.raw} (${(c.raw/all.length*100).toFixed(1)}%)`}}}}
  });
}

// ---------------- Table ----------------
let sortKey = 'fecha', sortDir = -1;
function statusBadge(s){
  const cls = s==='ADJUDICADO'?'adj': s==='EN PROCESO COMPRA'?'proc': s==='ADJUDIC. PEND.'?'pend':'fin';
  return `<span class="badge ${cls}">${s}</span>`;
}
function renderTable(){
  let rows = filteredTableRows();
  rows.sort((a,b)=>{
    let va=a[sortKey], vb=b[sortKey];
    if(sortKey==='proveedores'){ va=(a.proveedores[0]||''); vb=(b.proveedores[0]||''); }
    if(typeof va==='string') va=va.toLowerCase();
    if(typeof vb==='string') vb=vb.toLowerCase();
    if(va<vb) return -1*sortDir;
    if(va>vb) return 1*sortDir;
    return 0;
  });
  document.getElementById('rowCount').textContent = `${rows.length.toLocaleString('es-AR')} expedientes`;
  const body = rows.slice(0,1500).map(e=>`
    <tr>
      <td class="mono">${e.exp}</td>
      <td class="mono">${e.fecha}</td>
      <td class="mono">${e.modo}</td>
      <td>${e.tematica}</td>
      <td>${(e.proveedores||[]).join(', ') || '—'}</td>
      <td class="desc-cell" title="${e.desc.replace(/"/g,'&quot;')}">${e.desc}</td>
      <td>${statusBadge(e.status)}</td>
      <td class="mono">${fmtMoney(e.importe)}</td>
    </tr>`).join('');
  document.getElementById('tbody').innerHTML = body;
  if(rows.length>1500){
    document.getElementById('rowCount').textContent += ' (mostrando primeros 1.500 — usá filtros o exportá para ver todo)';
  }
}

document.querySelectorAll('#dataTable thead th').forEach(th=>{
  th.addEventListener('click', ()=>{
    const k = th.dataset.k;
    if(sortKey===k) sortDir*=-1; else { sortKey=k; sortDir=1; }
    renderTable();
  });
});

// ---------------- Export ----------------
function currentRows(){ return filteredTableRows(); }
function toCsvValue(v){ if(v==null) return ''; const s=String(v).replace(/"/g,'""'); return /[",\n]/.test(s) ? `"${s}"` : s; }
function exportCsv(){
  const rows = currentRows();
  const header = ['Expediente','Fecha','Modo','Tipo','Temática','Proveedor(es)','Descripción','Estado','Importe'];
  const lines = [header.join(',')];
  rows.forEach(e=>{
    lines.push([e.exp, e.fecha, e.modo, e.tipo, e.tematica, (e.proveedores||[]).join(' / '), e.desc, e.status, e.importe]
      .map(toCsvValue).join(','));
  });
  const blob = new Blob(['\uFEFF'+lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  downloadBlob(blob, 'reporte_compras_modo_I_IV.csv');
}
function exportXlsx(){
  if(typeof XLSX === 'undefined'){
    alert('No se pudo cargar el módulo de Excel (xlsx.min.js). Verificá que ese archivo esté subido junto al index.html en GitHub. Mientras tanto podés usar la exportación CSV.');
    return;
  }
  const rows = currentRows().map(e=>({
    Expediente:e.exp, Fecha:e.fecha, Modo:e.modo, Tipo:e.tipo, Tematica:e.tematica,
    Proveedores:(e.proveedores||[]).join(' / '), Descripcion:e.desc, Estado:e.status, Importe:e.importe
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte Compras');
  XLSX.writeFile(wb, 'reporte_compras_modo_I_IV.xlsx');
}
function exportPdf(){ window.print(); }
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
document.getElementById('fBuscarTabla').addEventListener('input', e=>{
  state.texto = e.target.value.trim().toUpperCase();
  renderTable();
});
document.getElementById('expCsv').addEventListener('click', exportCsv);
document.getElementById('expXlsx').addEventListener('click', exportXlsx);
document.getElementById('expPdf').addEventListener('click', exportPdf);

// ---------------- Meta ----------------
function renderMeta(){
  const fechas = EXPS.map(e=>e.fecha).sort();
  document.getElementById('metaPeriodo').textContent = `${fechas[0]} — ${fechas[fechas.length-1]}`;
  document.getElementById('metaTotal').textContent = EXPS.length.toLocaleString('es-AR');
  const now = new Date();
  const fStr = now.toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit', year:'numeric'}) + ' ' + now.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'});
  document.getElementById('metaFecha').textContent = fStr;
  document.getElementById('footFecha').textContent = 'Generado el ' + fStr;
}

// ---------------- Refresh ----------------
function refresh(){
  renderKpis();
  renderCompare();
  chartAnio();
  chartMes();
  chartTematica();
  chartProveedor();
  chartEstado();
  chartModo();
  renderTable();
}

buildFilters();
renderMeta();
refresh();

} // end boot()

boot();

})();
