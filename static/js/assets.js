// ==================== 固定资产 ====================
let faPeriod = '';  // 折旧期间

function _faEffectivePeriod() { return faPeriod || currentPeriod; }

async function renderFixedAssets(container) {
  const el = container || document.getElementById('content-area');
  if (!faPeriod) faPeriod = currentPeriod;
  el.innerHTML = _faPageHTML();
  _faBindPeriodBtns();
  await _faLoadAll();
}

function _faPageHTML() {
  return `<div class="card" style="margin-bottom:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-weight:600;color:var(--gray-700)">折旧期间：</span>
        <button class="btn btn-sm btn-secondary" onclick="_faStepPeriod(-1)">◀</button>
        <span id="fa-period-display" style="font-weight:700;min-width:70px;text-align:center">${_faEffectivePeriod()}</span>
        <button class="btn btn-sm btn-secondary" onclick="_faStepPeriod(1)">▶</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm btn-success" onclick="depreciateAll()">📅 计提本月折旧</button>
        <button class="btn btn-sm btn-primary" onclick="showFixedAssetForm()">＋ 新增资产</button>
        <button class="btn btn-sm btn-danger" onclick="_faBatchDelete()" id="fa-batch-delete-btn" style="display:none">🗑 批量删除</button>
      </div>
    </div>
    <div id="fa-stats" style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap"></div>
  </div>
  <div class="card" style="margin-bottom:0">
    <div class="table-wrap" id="fa-table">加载中...</div>
  </div>`;
}

function _faBindPeriodBtns() {
  document.getElementById('fa-period-display').textContent = _faEffectivePeriod();
}

async function _faStepPeriod(delta) {
  const [y, m] = _faEffectivePeriod().split('-').map(Number);
  let nm = m + delta, ny = y;
  if (nm > 12) { nm = 1; ny++; }
  if (nm < 1) { nm = 12; ny--; }
  faPeriod = `${ny}-${String(nm).padStart(2,'0')}`;
  document.getElementById('fa-period-display').textContent = faPeriod;
  await _faLoadAll();
}

async function _faLoadAll() {
  await Promise.all([_faLoadStats(), loadFixedAssets()]);
}

async function _faLoadStats() {
  try {
    const s = await api('/api/fixed-assets/stats');
    const el = document.getElementById('fa-stats');
    el.innerHTML = [
      {label:'资产总数', value:s.total_count, unit:'项', color:'#4361ee'},
      {label:'在用资产', value:s.active_count, unit:'项', color:'#2ec4b6'},
      {label:'原值合计', value:'¥'+fmt(s.total_original), unit:'', color:'#e07c3c'},
      {label:'累计折旧', value:'¥'+fmt(s.total_depreciation), unit:'', color:'#e63946'},
      {label:'净值合计', value:'¥'+fmt(s.total_net_value), unit:'', color:'#6c5ce7'},
      {label:'月折旧额', value:'¥'+fmt(s.monthly_depreciation), unit:'', color:'#2a9d8f'},
    ].map(c => `<div style="background:#fff;border:1px solid var(--gray-200);border-radius:8px;padding:10px 14px;min-width:110px;border-top:3px solid ${c.color}">
      <div style="font-size:11px;color:var(--gray-500)">${c.label}</div>
      <div style="font-size:18px;font-weight:700;color:var(--gray-800)">${c.value} <span style="font-size:12px;font-weight:400;color:var(--gray-500)">${c.unit}</span></div>
    </div>`).join('');
  } catch(e) {}
}

async function loadFixedAssets() {
  try {
    const data = await api('/api/fixed-assets');
    let tbody = '';
    for (const a of data) {
      const statusBadge = a.status === '在用' ? '<span class="badge badge-active">在用</span>'
        : a.status === '闲置' ? '<span class="badge badge-warning" style="background:#f4a261;color:#fff">闲置</span>'
        : '<span class="badge badge-deprecated">' + (a.status||'停用') + '</span>';
      const netPct = a.original_value > 0 ? ((a.net_value / a.original_value) * 100).toFixed(0) : 0;
      tbody += `<tr>
        <td><input type="checkbox" class="fa-check" data-id="${a.id}" onchange="_faToggleBatchBtn()" ${a.status==='在用'?'disabled title=在用资产不可批量删除':''}></td>
        <td>${a.code||''}</td>
        <td>${a.name||''}</td>
        <td>${a.category||''}</td>
        <td>${a.dept_code||''}</td>
        <td class="num">¥${fmt(a.original_value)}</td>
        <td class="num">¥${fmt(a.accumulated_depreciation)}</td>
        <td class="num">¥${fmt(a.net_value)} (${netPct}%)</td>
        <td class="num">¥${fmt(a.monthly_depreciation)}</td>
        <td>${statusBadge}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm btn-secondary" onclick="showFixedAssetForm(${a.id})">编辑</button>
          <button class="btn btn-sm" style="background:#4361ee;color:#fff" onclick="_faShowDeprHistory(${a.id},'${a.name||''}')">折旧</button>
          <button class="btn btn-sm btn-danger" onclick="deleteFixedAsset(${a.id})">删除</button>
        </td>
      </tr>`;
    }
    document.getElementById('fa-table').innerHTML = `<table>
      <thead><tr><th style="width:30px"><input type="checkbox" id="fa-check-all" onchange="_faToggleAll(this)"></th><th>资产编码</th><th>资产名称</th><th>类别</th><th>使用部门</th><th class="num">原值</th><th class="num">累计折旧</th><th class="num">净值</th><th class="num">月折旧</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>${tbody || '<tr><td colspan="11"><div class="empty-state"><p>暂无固定资产</p></div></td></tr>'}</tbody>
    </table>`;
  } catch (e) {
    document.getElementById('fa-table').innerHTML = '<p style="color:var(--danger)">' + e.message + '</p>';
  }
}

function _faToggleAll(cb) {
  document.querySelectorAll('.fa-check:not([disabled])').forEach(c => c.checked = cb.checked);
  _faToggleBatchBtn();
}
function _faToggleBatchBtn() {
  const checked = document.querySelectorAll('.fa-check:checked').length;
  document.getElementById('fa-batch-delete-btn').style.display = checked > 0 ? '' : 'none';
}
async function _faBatchDelete() {
  const ids = [...document.querySelectorAll('.fa-check:checked')].map(c => parseInt(c.dataset.id));
  if (!ids.length) return;
  if (!confirm(`确认删除 ${ids.length} 项资产？在用资产不会被删除。`)) return;
  try {
    const r = await api('/api/fixed-assets/batch-delete', {method:'POST', body:JSON.stringify(ids)});
    toast(r.message, 'success');
    await _faLoadAll();
  } catch(e) { toast(e.message, 'error'); }
}

async function _faShowDeprHistory(faId, name) {
  try {
    const data = await api(`/api/fixed-assets/${faId}/depreciations`);
    let rows = '';
    for (const d of data) {
      rows += `<tr><td>${d.period}</td><td class="num">¥${fmt(d.depreciation_amount)}</td><td class="num">¥${fmt(d.accumulated_before)}</td><td class="num">¥${fmt(d.accumulated_after)}</td><td class="num">¥${fmt(d.net_value)}</td></tr>`;
    }
    const html = `<div class="modal-title">${name} — 折旧明细</div>
      <div class="table-wrap" style="max-height:400px;overflow-y:auto">
        <table><thead><tr><th>期间</th><th class="num">本期折旧</th><th class="num">折旧前累计</th><th class="num">折旧后累计</th><th class="num">折旧后净值</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5"><div class="empty-state"><p>暂无折旧记录</p></div></td></tr>'}</tbody></table>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">关闭</button></div>`;
    showModal(html);
  } catch(e) { toast(e.message, 'error'); }
}

async function showFixedAssetForm(assetId) {
  assetId = assetId || null;
  let html = `<div class="modal-title">${assetId ? '编辑固定资产' : '新增固定资产'}</div>`;
  html += '<form id="fa-form" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-height:60vh;overflow-y:auto;padding:0 4px">';
  const fields = [
    ['code','资产编码*','text','required'],
    ['name','资产名称*','text','required'],
    ['category','资产类别','select',JSON.stringify(['房屋建筑物','机器设备','运输工具','电子设备','办公设备','其他']),'机器设备'],
    ['spec','规格型号','text',''],
    ['unit','计量单位','text','台'],
    ['dept_code','使用部门','text',''],
    ['location','存放地点','text',''],
    ['purchase_date','购入日期','date',''],
    ['original_value','原值*','number','required step=0.01'],
    ['residual_value','预计残值','number','step=0.01','0'],
    ['useful_life_months','使用年限(月)','number','step=1','60'],
    ['depreciation_method','折旧方法','select',JSON.stringify(['直线法','双倍余额递减法','年数总和法']),'直线法'],
    ['supplier','供应商','text',''],
    ['status','资产状态','select',JSON.stringify(['在用','闲置','报废','出售']),'在用'],
    ['remark','备注','textarea',''],
  ];
  for (const f of fields) {
    const [k,label,type,extra,def] = f;
    html += `<div class="form-group"><label>${label}</label>`;
    if (type === 'select') {
      const opts = typeof extra === 'string' && extra.startsWith('[') ? JSON.parse(extra) : [];
      html += `<select class="form-control" name="${k}">${opts.map(o=>`<option value="${o}"${o===def?' selected':''}>${o}</option>`).join('')}</select>`;
    } else if (type === 'textarea') {
      html += `<textarea class="form-control" name="${k}" rows="2">${def||''}</textarea>`;
    } else {
      html += `<input type="${type}" class="form-control" name="${k}" ${extra||''} value="${def||''}">`;
    }
    html += '</div>';
  }
  html += '</form>';
  html += `<div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveFixedAsset(${assetId||'null'})">保存</button></div>`;
  showModal(html);
  if (assetId) {
    try {
      const a = await api('/api/fixed-assets/' + assetId);
      for (const f of fields) {
        const el = document.querySelector(`#fa-form [name="${f[0]}"]`);
        if (el) {
          const v = a[f[0]];
          if (v != null && v !== undefined) el.value = v;
        }
      }
    } catch(e) {}
  }
}

async function saveFixedAsset(id) {
  const form = document.getElementById('fa-form');
  const body = {};
  new FormData(form).forEach((v,k) => {
    if (v !== '' && v !== undefined) {
      body[k] = (['original_value','residual_value','useful_life_months'].includes(k) || k==='residual_value') ? parseFloat(v) : v;
    }
  });
  try {
    if (id && id !== 'null') {
      await api('/api/fixed-assets/' + id, {method:'PUT', body:JSON.stringify(body)});
    } else {
      await api('/api/fixed-assets', {method:'POST', body:JSON.stringify(body)});
    }
    closeModal();
    toast('保存成功', 'success');
    await _faLoadAll();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteFixedAsset(id) {
  if (!confirm('确认删除该固定资产？')) return;
  try {
    await api('/api/fixed-assets/' + id, {method:'DELETE'});
    toast('删除成功', 'success');
    await _faLoadAll();
  } catch(e) { toast(e.message, 'error'); }
}

async function depreciateAll() {
  const period = _faEffectivePeriod();
  if (!confirm(`确认对全部在用资产计提 ${period} 折旧？`)) return;
  try {
    const res = await api(`/api/fixed-assets/depreciate?period=${encodeURIComponent(period)}`, {method:'POST'});
    let msg = `折旧完成，共处理 ${res.depreciated_count} 项资产`;
    if (res.total_amount > 0) msg += `，¥${fmt(res.total_amount)}`;
    if (res.voucher_no) msg += `，凭证号 ${res.voucher_no}`;
    toast(msg, 'success');
    await _faLoadAll();
  } catch(e) { toast(e.message, 'error'); }
}


// ==================== 无形资产 ====================
let iaPeriod = '';

function _iaEffectivePeriod() { return iaPeriod || currentPeriod; }

async function renderIntangibleAssets(container) {
  const el = container || document.getElementById('content-area');
  if (!iaPeriod) iaPeriod = currentPeriod;
  el.innerHTML = _iaPageHTML();
  document.getElementById('ia-period-display').textContent = _iaEffectivePeriod();
  await _iaLoadAll();
}

function _iaPageHTML() {
  return `<div class="card" style="margin-bottom:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-weight:600;color:var(--gray-700)">摊销期间：</span>
        <button class="btn btn-sm btn-secondary" onclick="_iaStepPeriod(-1)">◀</button>
        <span id="ia-period-display" style="font-weight:700;min-width:70px;text-align:center">${_iaEffectivePeriod()}</span>
        <button class="btn btn-sm btn-secondary" onclick="_iaStepPeriod(1)">▶</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm btn-success" onclick="amortizeAll()">📅 摊销本月</button>
        <button class="btn btn-sm btn-primary" onclick="showIntangibleAssetForm()">＋ 新增资产</button>
        <button class="btn btn-sm btn-danger" onclick="_iaBatchDelete()" id="ia-batch-delete-btn" style="display:none">🗑 批量删除</button>
      </div>
    </div>
    <div id="ia-stats" style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap"></div>
  </div>
  <div class="card" style="margin-bottom:0">
    <div class="table-wrap" id="ia-table">加载中...</div>
  </div>`;
}

async function _iaStepPeriod(delta) {
  const [y, m] = _iaEffectivePeriod().split('-').map(Number);
  let nm = m + delta, ny = y;
  if (nm > 12) { nm = 1; ny++; }
  if (nm < 1) { nm = 12; ny--; }
  iaPeriod = `${ny}-${String(nm).padStart(2,'0')}`;
  document.getElementById('ia-period-display').textContent = iaPeriod;
  await _iaLoadAll();
}

async function _iaLoadAll() {
  await Promise.all([_iaLoadStats(), loadIntangibleAssets()]);
}

async function _iaLoadStats() {
  try {
    const s = await api('/api/intangible-assets/stats');
    const el = document.getElementById('ia-stats');
    el.innerHTML = [
      {label:'资产总数', value:s.total_count, unit:'项', color:'#4361ee'},
      {label:'在用资产', value:s.active_count, unit:'项', color:'#2ec4b6'},
      {label:'原值合计', value:'¥'+fmt(s.total_original), unit:'', color:'#e07c3c'},
      {label:'累计摊销', value:'¥'+fmt(s.total_amortization), unit:'', color:'#e63946'},
      {label:'净值合计', value:'¥'+fmt(s.total_net_value), unit:'', color:'#6c5ce7'},
      {label:'月摊销额', value:'¥'+fmt(s.monthly_amortization), unit:'', color:'#2a9d8f'},
    ].map(c => `<div style="background:#fff;border:1px solid var(--gray-200);border-radius:8px;padding:10px 14px;min-width:110px;border-top:3px solid ${c.color}">
      <div style="font-size:11px;color:var(--gray-500)">${c.label}</div>
      <div style="font-size:18px;font-weight:700;color:var(--gray-800)">${c.value} <span style="font-size:12px;font-weight:400;color:var(--gray-500)">${c.unit}</span></div>
    </div>`).join('');
  } catch(e) {}
}

async function loadIntangibleAssets() {
  try {
    const data = await api('/api/intangible-assets');
    let tbody = '';
    for (const a of data) {
      const statusBadge = a.status === '在用' ? '<span class="badge badge-active">在用</span>'
        : '<span class="badge badge-deprecated">' + (a.status||'停用') + '</span>';
      tbody += `<tr>
        <td><input type="checkbox" class="ia-check" data-id="${a.id}" onchange="_iaToggleBatchBtn()"></td>
        <td>${a.code||''}</td>
        <td>${a.name||''}</td>
        <td>${a.category||''}</td>
        <td class="num">¥${fmt(a.original_value)}</td>
        <td class="num">¥${fmt(a.accumulated_amortization)}</td>
        <td class="num">¥${fmt(a.net_value)}</td>
        <td class="num">¥${fmt(a.monthly_amortization)}</td>
        <td>${statusBadge}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm btn-secondary" onclick="showIntangibleAssetForm(${a.id})">编辑</button>
          <button class="btn btn-sm" style="background:#4361ee;color:#fff" onclick="_iaShowAmortHistory(${a.id},'${a.name||''}')">摊销</button>
          <button class="btn btn-sm btn-danger" onclick="deleteIntangibleAsset(${a.id})">删除</button>
        </td>
      </tr>`;
    }
    document.getElementById('ia-table').innerHTML = `<table>
      <thead><tr><th style="width:30px"><input type="checkbox" id="ia-check-all" onchange="_iaToggleAll(this)"></th><th>资产编码</th><th>资产名称</th><th>类别</th><th class="num">原值</th><th class="num">累计摊销</th><th class="num">净值</th><th class="num">月摊销</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>${tbody || '<tr><td colspan="10"><div class="empty-state"><p>暂无无形资产</p></div></td></tr>'}</tbody>
    </table>`;
  } catch (e) {
    document.getElementById('ia-table').innerHTML = '<p style="color:var(--danger)">' + e.message + '</p>';
  }
}

function _iaToggleAll(cb) {
  document.querySelectorAll('.ia-check').forEach(c => c.checked = cb.checked);
  _iaToggleBatchBtn();
}
function _iaToggleBatchBtn() {
  const checked = document.querySelectorAll('.ia-check:checked').length;
  document.getElementById('ia-batch-delete-btn').style.display = checked > 0 ? '' : 'none';
}
async function _iaBatchDelete() {
  const ids = [...document.querySelectorAll('.ia-check:checked')].map(c => parseInt(c.dataset.id));
  if (!ids.length) return;
  if (!confirm(`确认删除 ${ids.length} 项无形资产？`)) return;
  try {
    const r = await api('/api/intangible-assets/batch-delete', {method:'POST', body:JSON.stringify(ids)});
    toast(r.message, 'success');
    await _iaLoadAll();
  } catch(e) { toast(e.message, 'error'); }
}

async function _iaShowAmortHistory(iaId, name) {
  try {
    const data = await api(`/api/intangible-assets/${iaId}/amortizations`);
    let rows = '';
    for (const d of data) {
      rows += `<tr><td>${d.period}</td><td class="num">¥${fmt(d.amortization_amount)}</td><td class="num">¥${fmt(d.accumulated_before)}</td><td class="num">¥${fmt(d.accumulated_after)}</td><td class="num">¥${fmt(d.net_value)}</td></tr>`;
    }
    const html = `<div class="modal-title">${name} — 摊销明细</div>
      <div class="table-wrap" style="max-height:400px;overflow-y:auto">
        <table><thead><tr><th>期间</th><th class="num">本期摊销</th><th class="num">摊销前累计</th><th class="num">摊销后累计</th><th class="num">摊销后净值</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5"><div class="empty-state"><p>暂无摊销记录</p></div></td></tr>'}</tbody></table>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">关闭</button></div>`;
    showModal(html);
  } catch(e) { toast(e.message, 'error'); }
}

async function showIntangibleAssetForm(assetId) {
  assetId = assetId || null;
  let html = `<div class="modal-title">${assetId ? '编辑无形资产' : '新增无形资产'}</div>`;
  html += '<form id="ia-form" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;max-height:60vh;overflow-y:auto;padding:0 4px">';
  const fields = [
    ['code','资产编码*','text','required'],
    ['name','资产名称*','text','required'],
    ['category','资产类别','select',JSON.stringify(['专利权','商标权','著作权','土地使用权','软件','特许权','其他']),'专利权'],
    ['purchase_date','取得日期','date',''],
    ['original_value','原值*','number','required step=0.01'],
    ['residual_value','预计残值','number','step=0.01','0'],
    ['useful_life_months','摊销期限(月)','number','step=1','120'],
    ['status','资产状态','select',JSON.stringify(['在用','处置']),'在用'],
    ['remark','备注','textarea',''],
  ];
  for (const f of fields) {
    const [k,label,type,extra,def] = f;
    html += `<div class="form-group"><label>${label}</label>`;
    if (type === 'select') {
      const opts = typeof extra === 'string' && extra.startsWith('[') ? JSON.parse(extra) : [];
      html += `<select class="form-control" name="${k}">${opts.map(o=>`<option value="${o}"${o===def?' selected':''}>${o}</option>`).join('')}</select>`;
    } else if (type === 'textarea') {
      html += `<textarea class="form-control" name="${k}" rows="2">${def||''}</textarea>`;
    } else {
      html += `<input type="${type}" class="form-control" name="${k}" ${extra||''} value="${def||''}">`;
    }
    html += '</div>';
  }
  html += '</form>';
  html += `<div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveIntangibleAsset(${assetId||'null'})">保存</button></div>`;
  showModal(html);
  if (assetId) {
    try {
      const a = await api('/api/intangible-assets/' + assetId);
      for (const f of fields) {
        const el = document.querySelector(`#ia-form [name="${f[0]}"]`);
        if (el) {
          const v = a[f[0]];
          if (v != null && v !== undefined) el.value = v;
        }
      }
    } catch(e) {}
  }
}

async function saveIntangibleAsset(id) {
  const form = document.getElementById('ia-form');
  const body = {};
  new FormData(form).forEach((v,k) => {
    if (v !== '' && v !== undefined) {
      body[k] = (['original_value','residual_value','useful_life_months'].includes(k)) ? parseFloat(v) : v;
    }
  });
  try {
    if (id && id !== 'null') {
      await api('/api/intangible-assets/' + id, {method:'PUT', body:JSON.stringify(body)});
    } else {
      await api('/api/intangible-assets', {method:'POST', body:JSON.stringify(body)});
    }
    closeModal();
    toast('保存成功', 'success');
    await _iaLoadAll();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteIntangibleAsset(id) {
  if (!confirm('确认删除该无形资产？')) return;
  try {
    await api('/api/intangible-assets/' + id, {method:'DELETE'});
    toast('删除成功', 'success');
    await _iaLoadAll();
  } catch(e) { toast(e.message, 'error'); }
}

async function amortizeAll() {
  const period = _iaEffectivePeriod();
  if (!confirm(`确认对全部在用无形资产摊销 ${period}？`)) return;
  try {
    const res = await api(`/api/intangible-assets/amortize?period=${encodeURIComponent(period)}`, {method:'POST'});
    let msg = `摊销完成，共处理 ${res.amortized_count} 项资产`;
    if (res.total_amount > 0) msg += `，¥${fmt(res.total_amount)}`;
    if (res.voucher_no) msg += `，凭证号 ${res.voucher_no}`;
    toast(msg, 'success');
    await _iaLoadAll();
  } catch(e) { toast(e.message, 'error'); }
}


// ==================== 库存管理 ====================
let invTxPage = 1;
let invBalancePeriod = '';

function _invEffectivePeriod() { return invBalancePeriod || currentPeriod; }

async function renderInventory(container) {
  const el = container || document.getElementById('content-area');
  el.innerHTML = _invPageHTML();
  document.getElementById('inv-balance-period').textContent = _invEffectivePeriod();
  await _invLoadAll();
}

function _invPageHTML() {
  return `<div class="card" style="margin-bottom:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-weight:600;color:var(--gray-700)">余额期间：</span>
        <button class="btn btn-sm btn-secondary" onclick="_invStepPeriod(-1)">◀</button>
        <span id="inv-balance-period" style="font-weight:700;min-width:70px;text-align:center">${_invEffectivePeriod()}</span>
        <button class="btn btn-sm btn-secondary" onclick="_invStepPeriod(1)">▶</button>
        <button class="btn btn-sm" style="background:#6c5ce7;color:#fff" onclick="_invLoadBalance()">📊 重新核算</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm btn-primary" onclick="showInventoryItemForm()">＋ 新增存货</button>
        <button class="btn btn-sm btn-success" onclick="showInventoryTxForm()">📥 收发记录</button>
        <button class="btn btn-sm" style="background:#e07c3c;color:#fff" onclick="_invShowTransferForm()">🔄 仓库调拨</button>
        <button class="btn btn-sm" style="background:#e63946;color:#fff" onclick="_invShowCountForm()">📋 盘点</button>
      </div>
    </div>
    <div id="inv-stats" style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap"></div>
  </div>
  <div class="card" style="margin-bottom:0">
    <div class="table-wrap" id="inv-table">加载中...</div>
  </div>`;
}

async function _invStepPeriod(delta) {
  const [y, m] = _invEffectivePeriod().split('-').map(Number);
  let nm = m + delta, ny = y;
  if (nm > 12) { nm = 1; ny++; }
  if (nm < 1) { nm = 12; ny--; }
  invBalancePeriod = `${ny}-${String(nm).padStart(2,'0')}`;
  document.getElementById('inv-balance-period').textContent = invBalancePeriod;
  await _invLoadAll();
}

async function _invLoadAll() {
  await Promise.all([loadInventoryItems(), _invLoadBalance()]);
}

async function _invLoadBalance() {
  try {
    const period = _invEffectivePeriod();
    const data = await api(`/api/inventory-balances?period=${period}`);
    const items = data.items || [];
    // Update stats
    const totalEndVal = items.reduce((s,i) => s + (i.end_amount||0), 0);
    const totalItems = items.length;
    const el = document.getElementById('inv-stats');
    el.innerHTML = [
      {label:'存货种类', value:totalItems, unit:'种', color:'#4361ee'},
      {label:'库存总值', value:'¥'+fmt(totalEndVal), unit:'', color:'#e07c3c'},
      {label:'核算期间', value:period, unit:'', color:'#2ec4b6'},
    ].map(c => `<div style="background:#fff;border:1px solid var(--gray-200);border-radius:8px;padding:10px 14px;min-width:110px;border-top:3px solid ${c.color}">
      <div style="font-size:11px;color:var(--gray-500)">${c.label}</div>
      <div style="font-size:18px;font-weight:700;color:var(--gray-800)">${c.value} <span style="font-size:12px;font-weight:400;color:var(--gray-500)">${c.unit}</span></div>
    </div>`).join('');

    // Update table to include balance data
    let tbody = '';
    for (const it of items) {
      tbody += `<tr>
        <td>${it.item_code||''}</td>
        <td>${it.item_name||''}</td>
        <td>${it.spec||''}</td>
        <td>${it.unit||''}</td>
        <td>${it.warehouse||''}</td>
        <td class="num">${fmt(it.begin_quantity)}</td>
        <td class="num" style="color:#2ec4b6">${fmt(it.in_quantity)}</td>
        <td class="num" style="color:#e63946">${fmt(it.out_quantity)}</td>
        <td class="num" style="font-weight:700">${fmt(it.end_quantity)}</td>
        <td class="num">¥${fmt(it.end_amount)}</td>
      </tr>`;
    }
    document.getElementById('inv-table').innerHTML = `<table>
      <thead><tr><th>存货编码</th><th>名称</th><th>规格</th><th>单位</th><th>仓库</th><th class="num">期初</th><th class="num">本期入库</th><th class="num">本期出库</th><th class="num">期末</th><th class="num">期末金额</th></tr></thead>
      <tbody>${tbody || '<tr><td colspan="10"><div class="empty-state"><p>暂无库存数据</p></div></td></tr>'}</tbody>
    </table>`;

    // Also load latest transactions below
    await loadInventoryTransactions(1);
  } catch(e) {
    document.getElementById('inv-stats').innerHTML = '<p style="color:var(--gray-500)">库存余额加载失败</p>';
  }
}

async function loadInventoryItems() {
  // This is used by the item dropdown in forms, not for display
  // Data is covered by _invLoadBalance
}

async function showInventoryItemForm(itemId) {
  itemId = itemId || null;
  let html = `<div class="modal-title">${itemId ? '编辑存货' : '新增存货'}</div>`;
  html += '<form id="inv-form" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 4px">';
  const fields = [
    ['code','存货编码*','text','required'],
    ['name','存货名称*','text','required'],
    ['spec','规格型号','text',''],
    ['unit','计量单位','text','个'],
    ['category','存货分类','select',JSON.stringify(['原材料','半成品','产成品','周转材料','低值易耗品']),'原材料'],
    ['warehouse','仓库','text',''],
    ['safety_stock','安全库存','number','step=0.01','0'],
    ['cost_price','参考成本价','number','step=0.01','0'],
    ['remark','备注','text',''],
  ];
  for (const f of fields) {
    const [k,label,type,extra,def] = f;
    html += `<div class="form-group"><label>${label}</label>`;
    if (type === 'select') {
      const opts = typeof extra === 'string' && extra.startsWith('[') ? JSON.parse(extra) : [];
      html += `<select class="form-control" name="${k}">${opts.map(o=>`<option value="${o}"${o===def?' selected':''}>${o}</option>`).join('')}</select>`;
    } else {
      html += `<input type="${type}" class="form-control" name="${k}" ${extra||''} value="${def||''}">`;
    }
    html += '</div>';
  }
  html += '</form>';
  html += `<div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveInventoryItem(${itemId||'null'})">保存</button></div>`;
  showModal(html);
  if (itemId) {
    try {
      const a = await api('/api/inventory-items/' + itemId);
      for (const f of fields) {
        const el = document.querySelector(`#inv-form [name="${f[0]}"]`);
        if (el) { const v = a[f[0]]; if (v != null) el.value = v; }
      }
    } catch(e) {}
  }
}

async function saveInventoryItem(id) {
  const form = document.getElementById('inv-form');
  const body = {};
  new FormData(form).forEach((v,k) => { if (v) body[k] = (['safety_stock','cost_price'].includes(k)) ? parseFloat(v) : v; });
  try {
    if (id && id !== 'null') {
      await api('/api/inventory-items/' + id, {method:'PUT', body:JSON.stringify(body)});
    } else {
      await api('/api/inventory-items', {method:'POST', body:JSON.stringify(body)});
    }
    closeModal();
    toast('保存成功', 'success');
    await _invLoadAll();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteInventoryItem(id) {
  if (!confirm('确认删除该存货档案？')) return;
  try {
    await api('/api/inventory-items/' + id, {method:'DELETE'});
    toast('删除成功', 'success');
    await _invLoadAll();
  } catch(e) { toast(e.message, 'error'); }
}

async function showInventoryTxForm() {
  let items = [];
  try { items = await api('/api/inventory-items'); } catch(e) {}
  let html = '<div class="modal-title">录入收发记录</div>';
  html += '<form id="inv-tx-form" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 4px">';
  html += `<div class="form-group"><label>存货*</label><select class="form-control" name="item_code" required><option value="">-- 选择 --</option>${items.map(it=>`<option value="${it.code}">${it.code} ${it.name}</option>`).join('')}</select></div>`;
  const txFields = [
    ['transaction_date','日期*','date','required'],
    ['trans_type','类型*','select',JSON.stringify(['入库','出库','其他']),'入库'],
    ['quantity','数量*','number','required step=0.01'],
    ['unit_price','单价','number','step=0.01'],
    ['warehouse','仓库','text',''],
    ['reference_no','单据号','text',''],
    ['operator','操作人','text','管理员'],
    ['remark','备注','text',''],
  ];
  for (const f of txFields) {
    const [k,label,type,extra,def] = f;
    html += `<div class="form-group"><label>${label}</label>`;
    if (type === 'select') {
      const opts = typeof extra === 'string' ? JSON.parse(extra) : [];
      html += `<select class="form-control" name="${k}">${opts.map(o=>`<option value="${o}"${o===def?' selected':''}>${o}</option>`).join('')}</select>`;
    } else {
      html += `<input type="${type}" class="form-control" name="${k}" ${extra||''} value="${def||''}">`;
    }
    html += '</div>';
  }
  html += '</form>';
  html += '<div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveInventoryTx()">保存</button></div>';
  showModal(html);
}

async function saveInventoryTx() {
  const form = document.getElementById('inv-tx-form');
  const body = {};
  new FormData(form).forEach((v,k) => {
    if (v) body[k] = (['quantity','unit_price'].includes(k)) ? parseFloat(v) : v;
  });
  try {
    await api('/api/inventory-transactions', {method:'POST', body:JSON.stringify(body)});
    closeModal();
    toast('收发记录已保存', 'success');
    await _invLoadAll();
  } catch(e) { toast(e.message, 'error'); }
}

async function _invShowTransferForm() {
  let items = [];
  try { items = await api('/api/inventory-items'); } catch(e) {}
  let html = '<div class="modal-title">仓库调拨</div>';
  html += '<form id="inv-transfer-form" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 4px">';
  html += `<div class="form-group"><label>存货*</label><select class="form-control" name="item_code" required><option value="">-- 选择 --</option>${items.map(it=>`<option value="${it.code}">${it.code} ${it.name} (库存:${it.current_stock||0})</option>`).join('')}</select></div>`;
  html += `<div class="form-group"><label>调出仓库*</label><input type="text" class="form-control" name="warehouse_from" required></div>`;
  html += `<div class="form-group"><label>调入仓库*</label><input type="text" class="form-control" name="warehouse_to" required></div>`;
  html += `<div class="form-group"><label>数量*</label><input type="number" class="form-control" name="quantity" required step="0.01" min="0.01"></div>`;
  html += `<div class="form-group"><label>单价</label><input type="number" class="form-control" name="unit_price" step="0.01" value="0"></div>`;
  html += `<div class="form-group"><label>日期*</label><input type="date" class="form-control" name="transaction_date" required value="${new Date().toISOString().slice(0,10)}"></div>`;
  html += `<div class="form-group"><label>单据号</label><input type="text" class="form-control" name="reference_no"></div>`;
  html += `<div class="form-group"><label>操作人</label><input type="text" class="form-control" name="operator" value="管理员"></div>`;
  html += `<div class="form-group" style="grid-column:span 2"><label>备注</label><input type="text" class="form-control" name="remark"></div>`;
  html += '</form>';
  html += '<div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="_invDoTransfer()">确认调拨</button></div>';
  showModal(html);
}

async function _invDoTransfer() {
  const form = document.getElementById('inv-transfer-form');
  const fd = new FormData(form);
  try {
    const res = await api('/api/inventory-transactions/transfer', {method:'POST', body:fd});
    closeModal();
    toast(res.message||'调拨成功', 'success');
    await _invLoadAll();
  } catch(e) { toast(e.message, 'error'); }
}

async function _invShowCountForm() {
  let items = [];
  try { items = await api('/api/inventory-items'); } catch(e) {}
  let html = '<div class="modal-title">库存盘点</div>';
  html += '<form id="inv-count-form" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 4px">';
  html += `<div class="form-group"><label>存货*</label><select class="form-control" name="item_code" required onchange="_invOnCountItemChange(this)"><option value="">-- 选择 --</option>${items.map(it=>`<option value="${it.code}" data-stock="${it.current_stock||0}" data-unit="${it.unit||''}">${it.code} ${it.name} (账面:${it.current_stock||0} ${it.unit||''})</option>`).join('')}</select></div>`;
  html += `<div class="form-group"><label>账面库存</label><input type="text" class="form-control" id="inv-count-book" readonly></div>`;
  html += `<div class="form-group"><label>实盘数量*</label><input type="number" class="form-control" name="actual_quantity" required step="0.01" onchange="_invOnCountChange()"></div>`;
  html += `<div class="form-group"><label>差异</label><input type="text" class="form-control" id="inv-count-diff" readonly></div>`;
  html += `<div class="form-group"><label>单价</label><input type="number" class="form-control" name="unit_price" step="0.01" value="0"></div>`;
  html += `<div class="form-group"><label>盘点日期*</label><input type="date" class="form-control" name="transaction_date" required value="${new Date().toISOString().slice(0,10)}"></div>`;
  html += `<div class="form-group"><label>仓库</label><input type="text" class="form-control" name="warehouse"></div>`;
  html += `<div class="form-group"><label>单据号</label><input type="text" class="form-control" name="reference_no"></div>`;
  html += `<div class="form-group"><label>操作人</label><input type="text" class="form-control" name="operator" value="管理员"></div>`;
  html += `<div class="form-group" style="grid-column:span 2"><label>备注</label><input type="text" class="form-control" name="remark"></div>`;
  html += '</form>';
  html += '<div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="_invDoCount()">确认盘点</button></div>';
  showModal(html);
}

function _invOnCountItemChange(sel) {
  const opt = sel.selectedOptions[0];
  document.getElementById('inv-count-book').value = opt ? (opt.dataset.stock + ' ' + opt.dataset.unit) : '';
  _invOnCountChange();
}
function _invOnCountChange() {
  const book = parseFloat(document.getElementById('inv-count-book')?.value) || 0;
  const actual = parseFloat(document.querySelector('#inv-count-form [name="actual_quantity"]')?.value) || 0;
  const diff = actual - book;
  const diffEl = document.getElementById('inv-count-diff');
  if (diffEl) {
    diffEl.value = diff.toFixed(2);
    diffEl.style.color = diff > 0 ? '#2ec4b6' : diff < 0 ? '#e63946' : '';
  }
}

async function _invDoCount() {
  const form = document.getElementById('inv-count-form');
  const fd = new FormData(form);
  try {
    const res = await api('/api/inventory-transactions/count', {method:'POST', body:fd});
    closeModal();
    toast(res.message||'盘点完成', res.trans_type==='盘盈'?'success':'warning');
    await _invLoadAll();
  } catch(e) { toast(e.message, 'error'); }
}

async function loadInventoryTransactions(page) {
  page = page || 1;
  invTxPage = page;
  try {
    const data = await api('/api/inventory-transactions?limit=15');
    let tbody = '';
    for (const t of data) {
      let typeBadge;
      if (t.trans_type === '入库' || t.trans_type === '调拨入' || t.trans_type === '盘盈') typeBadge = '<span class="badge badge-active">' + t.trans_type + '</span>';
      else if (t.trans_type === '出库' || t.trans_type === '调拨出' || t.trans_type === '盘亏') typeBadge = '<span class="badge badge-pending">' + t.trans_type + '</span>';
      else typeBadge = '<span class="badge badge-deprecated">' + (t.trans_type||'') + '</span>';
      tbody += `<tr>
        <td>${t.transaction_date||''}</td>
        <td>${typeBadge}</td>
        <td>${t.item_code||''}</td>
        <td>${t.warehouse||''}${t.warehouse_to?' → '+t.warehouse_to:''}</td>
        <td class="num">${t.quantity!=null?fmt(t.quantity):'-'}</td>
        <td class="num">${t.unit_price!=null?'¥'+fmt(t.unit_price):'-'}</td>
        <td class="num">${t.total_amount!=null?'¥'+fmt(t.total_amount):'-'}</td>
        <td>${t.reference_no||''}</td>
        <td>${t.operator||''}</td>
        <td>${t.created_at||''}</td>
      </tr>`;
    }
    // Insert transaction table below inventory balance table if not already there
    let txEl = document.getElementById('inv-tx-section');
    if (!txEl) {
      const invTable = document.getElementById('inv-table');
      if (invTable && invTable.parentElement) {
        const div = document.createElement('div');
        div.id = 'inv-tx-section';
        div.innerHTML = `<div class="card" style="margin-top:16px">
          <div class="card-title">最近收发记录</div>
          <div class="table-wrap" id="inv-tx-table"></div>
        </div>`;
        invTable.parentElement.appendChild(div);
        txEl = document.getElementById('inv-tx-table');
      }
    }
    if (!txEl) txEl = document.getElementById('inv-tx-table');
    if (txEl) {
      txEl.innerHTML = `<table>
        <thead><tr><th>日期</th><th>类型</th><th>存货</th><th>仓库</th><th class="num">数量</th><th class="num">单价</th><th class="num">金额</th><th>单据号</th><th>操作人</th><th>录入时间</th></tr></thead>
        <tbody>${tbody || '<tr><td colspan="10"><div class="empty-state"><p>暂无收发记录</p></div></td></tr>'}</tbody>
      </table>`;
    }
  } catch(e) {}
}
