// 档案列表全局缓存（用于新增时计算下一个编码）
let deptList = [], empList = [], custList = [], suppList = [];

function _nextArchiveCode(prefix, list) {
    const nums = list
        .map(x => x.code)
        .filter(c => c && c.startsWith(prefix))
        .map(c => parseInt(c.substring(prefix.length)))
        .filter(n => !isNaN(n));
    const next = nums.length === 0 ? 1 : Math.max(...nums) + 1;
    return prefix + String(next).padStart(3, '0');
}

// ==================== 会计科目 ====================
// 允许作为一级科目使用的6个往来科目（其他科目必须设置二级）
const CONTACT_ACCOUNTS_L1 = [
  { code: '1122', name: '应收账款' },
  { code: '2202', name: '应付账款' },
  { code: '2203', name: '预收账款' },
  { code: '1123', name: '预付账款' },
  { code: '1221', name: '其他应收款' },
  { code: '2241', name: '其他应付款' }
];
const CONTACT_CODES_L1 = CONTACT_ACCOUNTS_L1.map(function(a) { return a.code; });
const CONTACT_NAMES_L1 = CONTACT_ACCOUNTS_L1.map(function(a) { return a.name; }).join('、');
async function renderAccounts(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML = `
    <div class="card card-fill">
      <div class="filter-bar">
        <select class="form-control" id="acc-cat" style="width:130px">
          <option value="">全部类别</option>
          <option>资产</option><option>负债</option><option>权益</option>
          <option>收入</option><option>费用</option><option>成本</option>
        </select>
        <input class="form-control" id="acc-kw" placeholder="科目编码/名称" style="width:180px" oninput="loadAccounts()">
        <button class="btn btn-primary" onclick="showAddAccount()">新增科目</button>
      </div>
      <div class="table-wrap" id="acc-table" style="flex:1;overflow:auto">加载中...</div>
    </div>
  `;
  await loadAccounts();
}

async function loadAccounts() {
  const cat = document.getElementById('acc-cat')?.value;
  const kw = document.getElementById('acc-kw')?.value;
  const url = `/api/accounts${cat || kw ? '?' : ''}${cat ? 'category=' + cat : ''}${cat && kw ? '&' : ''}${kw ? 'keyword=' + kw : ''}`;
  const el = document.getElementById('acc-table');
  try {
    const data = await api(url);
    allAccounts = data;
    el.innerHTML = `
      <table>
        <thead><tr><th>科目编码</th><th>科目名称</th><th>类别</th><th>余额方向</th><th>级次</th><th>上级科目</th><th>期初金额</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          ${data.map(a => {
                const locked = a.has_children || a.has_journal;
                const reason = a.has_children ? '该科目下有下级科目' : (a.has_journal ? '该科目已被序时账使用' : '');
                const editBtn = locked
                  ? `<button class="btn btn-sm btn-secondary" disabled style="opacity:0.35;cursor:not-allowed" title="${reason}，需要密码才能修改">编辑</button>`
                  : `<button class="btn btn-sm btn-secondary" onclick="showEditAccount(${a.id},'${esc(a.code)}','${esc(a.name)}','${a.category}','${a.balance_direction}',${a.level},'${a.parent_code||''}',${a.opening_balance||0})">编辑</button>`;
                const delBtn = locked
                  ? `<button class="btn btn-sm btn-danger" disabled style="opacity:0.35;cursor:not-allowed" title="${reason}，需要密码才能删除">删除</button>`
                  : `<button class="btn btn-sm btn-danger" onclick="deleteAccount(${a.id},false)">删除</button>`;
                const toggleBtn = locked
                  ? `<button class="btn btn-sm btn-secondary" disabled style="opacity:0.35;cursor:not-allowed" title="${reason}，需要密码才能修改">${a.is_active ? '停用' : '启用'}</button>`
                  : `<button class="btn btn-sm btn-secondary" onclick="toggleAccount(${a.id},${!a.is_active},false)">${a.is_active ? '停用' : '启用'}</button>`;
                return `
            <tr>
              <td style="font-weight:500">${a.code}</td>
              <td>${a.name.trim()}</td>
              <td><span class="badge" style="background:var(--primary-light);color:var(--primary)">${a.category}</span></td>
              <td style="text-align:center">${a.balance_direction}</td>
              <td style="text-align:center">${a.level}</td>
              <td>${a.parent_code || '-'}</td>
              <td style="text-align:right">${(a.opening_balance || 0).toFixed(2)}</td>
              <td>${a.is_active ? '<span class="badge badge-audited">启用</span>' : '<span class="badge" style="background:#f3f4f6;color:#6b7280">停用</span>'}</td>
              <td style="white-space:nowrap">
                ${editBtn}
                ${delBtn}
                ${toggleBtn}
              </td>
            </tr>
          `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    showError(el, e, '加载数据');
  }
}

function showAddAccount() {
  const parentOptions = allAccounts.filter(a => a.level === 1).map(a => `<option value="${a.code}">${a.code} ${a.name}</option>`).join('');
  showModal(`
    <div class="modal-title">新增会计科目</div>
    <div class="form-grid">
      <div class="form-group"><label>科目编码 *</label><input class="form-control" id="na-code" readonly style="background:#f3f4f6;color:#6b7280" placeholder="自动生成"></div>
      <div class="form-group"><label>科目名称 *</label><input class="form-control" id="na-name" placeholder="如 研发费用"></div>
      <div class="form-group">
        <label>科目类别 *</label>
        <select class="form-control" id="na-cat">
          <option>资产</option><option>负债</option><option>权益</option>
          <option>收入</option><option>费用</option><option>成本</option>
        </select>
      </div>
      <div class="form-group">
        <label>余额方向 *</label>
        <select class="form-control" id="na-dir"><option>借</option><option>贷</option></select>
      </div>
      <div class="form-group">
        <label>级次</label>
        <select class="form-control" id="na-level" onchange="onAccLevelChange()">
          <option value="1">一级（4位）</option>
          <option value="2">二级（2位）</option>
          <option value="3">三级（3位）</option>
          <option value="4">四级（3位）</option>
          <option value="5">五级（3位）</option>
        </select>
      </div>
      <div class="form-group">
        <label>上级科目</label>
        <select class="form-control" id="na-parent" onchange="computeNextAccCode()"><option value="">无</option>${parentOptions}</select>
      </div>
      <div class="form-group">
        <label>期初金额</label><input class="form-control" id="na-ob" type="number" step="0.01" value="0.00" placeholder="0.00">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveNewAccount()">保存</button>
    </div>
  `);
  computeNextAccCode();
}

function onAccLevelChange() {
  const level = parseInt(document.getElementById('na-level').value);
  const parentEl = document.getElementById('na-parent');
  if (!parentEl) return;
  parentEl.disabled = (level === 1);

  // 根据级次更新上级科目选项
  let filterLevel = 0;
  if (level === 2) filterLevel = 1;
  else if (level === 3) filterLevel = 2;
  else if (level === 4) filterLevel = 3;
  else if (level === 5) filterLevel = 4;

  if (filterLevel > 0) {
    const parents = allAccounts.filter(a => a.level === filterLevel);
    parentEl.innerHTML = '<option value="">请选择上级科目</option>' +
      parents.map(a => `<option value="${a.code}">${a.code} ${a.name}</option>`).join('');
  } else {
    parentEl.innerHTML = '<option value="">无</option>';
  }

  computeNextAccCode();
  // 显示一级科目限制提示
  showL1RestrictionTip();
}

function showL1RestrictionTip() {
  const level = parseInt(document.getElementById('na-level')?.value || '1');
  let tipEl = document.getElementById('na-l1-tip');
  if (level === 1) {
    const codeEl = document.getElementById('na-code');
    const codeRoot = codeEl?.value?.substring(0, 4) || '';
    const isAllowed = CONTACT_CODES_L1.includes(codeRoot);
    if (!isAllowed) {
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.id = 'na-l1-tip';
        tipEl.style.cssText = 'color:#dc2626;font-size:12px;margin-top:4px;padding:6px 10px;background:#fef2f2;border-radius:4px;border:1px solid #fecaca';
        const formGrid = document.querySelector('.modal .form-grid');
        if (formGrid) formGrid.after(tipEl);
      }
      tipEl.innerHTML = '⚠️ 该科目不可作为一级科目。仅' + CONTACT_NAMES_L1 + '（6个往来科目）允许一级，其他科目必须设置2级及以上。';
    } else {
      if (tipEl) tipEl.remove();
    }
  } else {
    if (tipEl) tipEl.remove();
  }
}

function computeNextAccCode() {
  const level = parseInt(document.getElementById('na-level')?.value || '1');
  const parentCode = (level === 1) ? null : document.getElementById('na-parent')?.value;
  const codeEl = document.getElementById('na-code');
  if (!codeEl) return;

  if (level === 1) {
    const l1 = allAccounts.filter(a => a.level === 1).map(a => parseInt(a.code));
    const next = l1.length === 0 ? 1001 : Math.max(...l1) + 1;
    codeEl.value = String(next).padStart(4, '0');
  } else if (level === 2) {
    if (!parentCode) { codeEl.value = ''; return; }
    const children = allAccounts.filter(a => a.parent_code === parentCode && a.level === 2);
    if (children.length === 0) {
      codeEl.value = parentCode + '01';
    } else {
      const maxSuffix = Math.max(...children.map(a => parseInt(a.code.substring(parentCode.length))));
      codeEl.value = parentCode + String(maxSuffix + 1).padStart(2, '0');
    }
  } else {
    // L3/L4/L5: 上级编码 + 3位
    if (!parentCode) { codeEl.value = ''; return; }
    const suffixLen = 3;
    const children = allAccounts.filter(a => a.parent_code === parentCode);
    if (children.length === 0) {
      codeEl.value = parentCode + '0'.repeat(suffixLen - 1) + '1';
    } else {
      const maxSuffix = Math.max(...children.map(a => parseInt(a.code.substring(parentCode.length))));
      codeEl.value = parentCode + String(maxSuffix + 1).padStart(suffixLen, '0');
    }
  }
}

function showEditAccount(id, code, name, category, balance_direction, level, parent_code, opening_balance) {
  const parentOptions = allAccounts.filter(a => a.level === 1 && a.code !== code).map(a => {
    const sel = (a.code === parent_code) ? 'selected' : '';
    return `<option value="${a.code}" ${sel}>${a.code} ${a.name}</option>`;
  }).join('');
  const catOptions = ['资产','负债','权益','收入','费用','成本'].map(c => {
    return `<option ${c === category ? 'selected' : ''}>${c}</option>`;
  }).join('');
  const dirOptions = ['借','贷'].map(d => {
    return `<option ${d === balance_direction ? 'selected' : ''}>${d}</option>`;
  }).join('');
  showModal(`
    <div class="modal-title">编辑会计科目</div>
    <div class="form-grid">
      <div class="form-group"><label>科目编码 *</label><input class="form-control" id="na-code" value="${code}" disabled style="background:#f3f4f6"></div>
      <div class="form-group"><label>科目名称 *</label><input class="form-control" id="na-name" value="${esc(name)}"></div>
      <div class="form-group">
        <label>科目类别 *</label>
        <select class="form-control" id="na-cat">${catOptions}</select>
      </div>
      <div class="form-group">
        <label>余额方向 *</label>
        <select class="form-control" id="na-dir">${dirOptions}</select>
      </div>
      <div class="form-group">
        <label>级次</label>
        <select class="form-control" id="na-level" onchange="onAccLevelChange()">
          <option value="1" ${level==1?'selected':''}>一级（4位）</option>
          <option value="2" ${level==2?'selected':''}>二级（2位）</option>
          <option value="3" ${level==3?'selected':''}>三级（3位）</option>
          <option value="4" ${level==4?'selected':''}>四级（3位）</option>
          <option value="5" ${level==5?'selected':''}>五级（3位）</option>
        </select>
      </div>
      <div class="form-group">
        <label>上级科目</label>
        <select class="form-control" id="na-parent" ${level==1?'disabled':''}><option value="">无</option>${parentOptions}</select>
      </div>
      <div class="form-group">
        <label>期初金额</label><input class="form-control" id="na-ob" type="number" step="0.01" value="${opening_balance||0}">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveEditAccount(${id})">保存</button>
    </div>
  `);
}

async function saveEditAccount(id, skipPwd = false) {
  if (!skipPwd) {
    const acc = allAccounts.find(a => a.id === id);
    if (acc && (acc.has_children || acc.has_journal)) {
      promptAccountPwd(id, 'edit');
      return;
    }
  }
  const name = document.getElementById('na-name').value.trim();
  const category = document.getElementById('na-cat').value;
  const balance_direction = document.getElementById('na-dir').value;
  const level = parseInt(document.getElementById('na-level').value);
  const parent_code = level === 1 ? null : (document.getElementById('na-parent').value || null);
  const opening_balance = parseFloat(document.getElementById('na-ob').value) || 0;
  if (!name) { toast('请填写科目名称', 'error'); return; }
  try {
    const body = { name, category, balance_direction, level, parent_code, opening_balance };
    if (skipPwd) body.password = '123456';
    await api(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    toast('科目修改成功', 'success');
    closeModal();
    await loadAccounts();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function saveNewAccount() {
  const code = document.getElementById('na-code').value.trim();
  const name = document.getElementById('na-name').value.trim();
  const category = document.getElementById('na-cat').value;
  const balance_direction = document.getElementById('na-dir').value;
  const level = parseInt(document.getElementById('na-level').value);
  const parent_code = document.getElementById('na-parent').value || null;
  const opening_balance = parseFloat(document.getElementById('na-ob').value) || 0;
  if (!code || !name) { toast('请填写科目编码和名称', 'error'); return; }
  // 一级科目限制：仅6个往来科目可作为一级科目，其他必须设二级
  if (level === 1) {
    const codeRoot = code.substring(0, 4);
    if (!CONTACT_CODES_L1.includes(codeRoot)) {
      toast('该科目不可作为一级科目使用。\n\n仅以下6个往来科目允许设置一级科目：\n' + CONTACT_NAMES_L1 + '\n\n请选择2级（含）以上级次，并指定上级科目。', 'error');
      return;
    }
  }
  try {
    await api('/api/accounts', { method: 'POST', body: JSON.stringify({ code, name, category, balance_direction, level, parent_code, opening_balance }) });
    toast('科目创建成功', 'success');
    closeModal();
    await loadAccounts();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function toggleAccount(id, active, skipPwd = false) {
  if (!skipPwd) {
    const acc = allAccounts.find(a => a.id === id);
    if (acc && (acc.has_children || acc.has_journal)) {
      promptAccountPwd(id, 'toggle', active);
      return;
    }
  }
  try {
    await api(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify({ is_active: active }) });
    toast(active ? '科目已启用' : '科目已停用', 'success');
    await loadAccounts();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteAccount(id, skipPwd = false) {
  if (!skipPwd) {
    const acc = allAccounts.find(a => a.id === id);
    if (acc && (acc.has_children || acc.has_journal)) {
      promptAccountPwd(id, 'delete');
      return;
    }
  }
  if (!confirm('确认删除该科目？')) return;
  try {
    await api(`/api/accounts/${id}`, { method: 'DELETE' });
    toast('删除成功', 'success');
    await loadAccounts();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function promptAccountPwd(id, action, extra) {
  showModal(`
    <div class="modal-title">需要密码</div>
    <p style="margin-bottom:12px;color:var(--gray-600);font-size:14px">该科目受保护（有下级科目或被序时账使用），请输入密码才能操作。</p>
    <div class="form-field">
      <label>密码</label>
      <input type="password" id="acc-pwd" class="form-control" placeholder="请输入密码" onkeydown="if(event.key==='Enter')submitAccountPwd(${id},'${action}',${extra||''})">
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitAccountPwd(${id},'${action}',${extra||''})">确认</button>
    </div>
  `);
  setTimeout(() => document.getElementById('acc-pwd')?.focus(), 100);
}

async function submitAccountPwd(id, action, extra) {
  const pwd = document.getElementById('acc-pwd').value;
  if (pwd !== '123456') {
    toast('密码错误', 'error');
    return;
  }
  closeModal();
  if (action === 'toggle') {
    await toggleAccount(id, extra, true);
  } else if (action === 'delete') {
    await deleteAccount(id, true);
  } else if (action === 'edit') {
    await saveEditAccount(id, true);
  }
}

// ==================== 期间管理 ====================
async function renderPeriods(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML = '<div class="card">加载中...</div>';
  try {
    const data = await api('/api/periods');
    el.innerHTML = `
      <div class="card card-fill">
        <table>
          <thead><tr><th>会计期间</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            ${data.map(p => `
              <tr>
                <td style="font-weight:600">${p.period}</td>
                <td><span class="badge ${p.status === '开放' ? 'badge-open' : 'badge-closed'}">${p.status}</span></td>
                <td>
                  ${p.status === '开放' ? `<button class="btn btn-secondary btn-sm" onclick="closePeriod('${p.period}')">结账</button>` : '<span style="color:var(--gray-500);font-size:12px">已结账</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    showError(el, e, '加载数据');
  }
}

async function closePeriod(period) {
  if (!confirm(`确认对 ${period} 进行月末结账？结账后该期间不可修改。`)) return;
  try {
    const res = await api(`/api/periods/${period}/close`, { method: 'POST' });
    toast(res.message, 'success');
    await loadCurrentPeriod();
    await renderPeriods();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ==================== 公司信息 ====================
async function renderCompany(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  try {
    const data = await api('/api/company');
    let html = '<div class="card" style="margin-bottom:16px">' +
      '<div class="card-title" style="display:flex;align-items:center;justify-content:space-between;">' +
      '<span>🏢 公司基本信息</span>' +
      '<button class="btn btn-sm" onclick="exitCompany()" style="font-size:12px;padding:4px 10px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;">🚪 返回选择公司</button>' +
      '</div>' +
      '<div class="form-grid" style="display:grid;grid-template-columns:1fr;gap:16px">' +
        '<div class="form-field"><label>公司全称</label><input id="comp-name" value="' + esc(data?.company_name||'') + '" placeholder="如：XX机械制造有限公司"></div>' +
        '<div class="form-field"><label>统一社会信用代码</label><input id="comp-uscc" value="' + esc(data?.uscc||'') + '" placeholder="18位统一社会信用代码"></div>' +
      '</div></div>';

    html += '<div style="margin-top:16px"><button class="btn btn-primary" onclick="saveCompanyFull()">💾 保存</button></div>';

    el.innerHTML = html;
  } catch (e) {
    showError(el, e, '加载数据');
  }
}

// ==================== 部门档案 ====================

async function saveCompanyFull() {
  const body = {
    company_name: document.getElementById('comp-name').value.trim(),
    uscc: document.getElementById('comp-uscc').value.trim()
  };
  if (!body.company_name) { toast('请填写公司全称', 'error'); return; }
  try {
    await api('/api/company', { method: 'PUT', body: JSON.stringify(body) });
    toast('公司信息保存成功', 'success');
    renderCompany();
  } catch (e) { toast(e.message, 'error'); }
}

// ==================== 部门档案 ====================
async function renderDepartments(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  try {
    const data = await api('/api/departments');
    deptList = data;
    el.innerHTML = `
      <div class="card card-fill">
        <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-shrink:0">
          <button class="btn btn-primary btn-sm" onclick="showDeptForm()">新增部门</button>
          <button class="btn btn-outline btn-sm" onclick="showUploadModal('department')">导入文件</button>
          <button class="btn btn-danger btn-sm" id="deptBatchDelBtn" onclick="batchDeleteDepts()">批量删除</button>
        </div>
        <div class="table-wrap" style="flex:1;overflow:auto">
          <table>
            <thead><tr><th style="width:40px"><input type="checkbox" onchange="toggleDeptAll(this);updateDeptBatchBtn()"></th><th>编码</th><th>部门名称</th><th>操作</th></tr></thead>
            <tbody>
              ${data.length === 0 ? '<tr><td colspan="4"><div class="empty-state"><p>暂无部门，请添加</p></div></td></tr>' : data.map(d => {
                const locked = d.has_journal;
                const cbAttr = locked ? 'disabled title="该部门已被序时账引用"' : '';
                const editBtn = locked
                  ? '<button class="btn btn-sm btn-secondary" disabled style="opacity:0.35;cursor:not-allowed" title="该部门已被序时账引用，不可编辑">编辑</button>'
                  : '<button class="btn btn-sm btn-secondary" onclick="showDeptForm(' + d.id + ',\'' + d.code + '\',\'' + esc(d.name) + '\')">编辑</button>';
                const delBtn = locked
                  ? '<button class="btn btn-sm btn-danger" disabled style="opacity:0.35;cursor:not-allowed" title="该部门已被序时账引用，不可删除">删除</button>'
                  : '<button class="btn btn-sm btn-danger" onclick="deleteDept(' + d.id + ')">删除</button>';
                return '<tr><td><input type="checkbox" class="dept-cb" value="' + d.id + '" onchange="updateDeptBatchBtn()" ' + cbAttr + '></td><td>' + d.code + '</td><td>' + d.name + '</td><td style="white-space:nowrap">' + editBtn + delBtn + '</td></tr>';
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    showError(el, e, '加载数据');
  }
}

function showDeptForm(id, code, name) {
  const isEdit = !!id;
  const nextCode = isEdit ? (code || '') : _nextArchiveCode('BM', deptList);
  showModal(`
    <h3>${isEdit ? '编辑' : '新增'}部门</h3>
    <div class="form-field"><label>编码</label><input id="dept-code" value="${nextCode}" readonly style="background:#f3f4f6;color:#6b7280" placeholder="自动生成"></div>
    <div class="form-field"><label>名称 <span style="color:red">*</span></label><input id="dept-name" value="${name||''}" placeholder="如：生产部"></div>
    <div style="margin-top:12px">
      <button class="btn btn-primary" onclick="saveDept(${id||0})">保存</button>
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    </div>
  `);
}

async function saveDept(id) {
  const body = {
    code: document.getElementById('dept-code').value.trim(),
    name: document.getElementById('dept-name').value.trim()
  };
  if (!body.name) { toast('请填写部门名称', 'error'); return; }
  if (!id && !body.code) body.code = '';
  try {
    // 去重检查
    const list = await api('/api/departments');
    const dup = list.find(d => d.name === body.name && d.id !== id);
    if (dup) { toast('部门名称"' + body.name + '"已存在（' + dup.code + '），请勿重复添加', 'warn'); return; }
  } catch (e) { /* 查重失败不影响保存 */ }
  try {
    if (id) {
      await api(`/api/departments/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/api/departments', { method: 'POST', body: JSON.stringify(body) });
    }
    toast('保存成功', 'success');
    closeModal();
    renderDepartments();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteDept(id) {
  if (!confirm('确认删除该部门？')) return;
  try {
    await api(`/api/departments/${id}`, { method: 'DELETE' });
    toast('删除成功', 'success');
    renderDepartments();
  } catch (e) { toast(e.message, 'error'); }
}

function toggleDeptAll(cb) {
  document.querySelectorAll('.dept-cb').forEach(c => c.checked = cb.checked);
  updateDeptBatchBtn();
}

function updateDeptBatchBtn() {
  const cbs = document.querySelectorAll('.dept-cb:checked');
  const btn = document.getElementById('deptBatchDelBtn');
  if (!btn) return;
  btn.textContent = cbs.length > 0 ? '批量删除（' + cbs.length + '）' : '批量删除';
}

async function batchDeleteDepts() {
  let cbs = document.querySelectorAll('.dept-cb:checked');
  if (cbs.length === 0) { toast('请先选择要删除的部门', 'warn'); return; }
  if (!confirm('确认删除选中的 ' + cbs.length + ' 个部门？此操作不可恢复。')) return;
  try {
    let ids = Array.from(cbs).map(c => parseInt(c.value));
    await api('/api/departments/batch-delete', { method: 'POST', body: JSON.stringify({ ids: ids }) });
    toast('成功删除 ' + cbs.length + ' 个部门', 'success');
    renderDepartments();
  } catch (e) { toast(e.message, 'error'); }
}

// ==================== 人员档案 ====================
async function renderEmployees(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  try {
    const data = await api('/api/employees');
    empList = data;
    el.innerHTML = `
      <div class="card card-fill">
        <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-shrink:0">
          <button class="btn btn-primary btn-sm" onclick="showEmpForm()">新增人员</button>
          <button class="btn btn-outline btn-sm" onclick="showUploadModal('employee')">导入文件</button>
          <button class="btn btn-danger btn-sm" id="btn-batch-del-emp" onclick="batchDeleteEmp()">批量删除</button>
        </div>
        <div class="table-wrap" style="flex:1;overflow:auto">
          <table class="single-line-table">
            <thead><tr><th style="width:36px"><input type="checkbox" onchange="toggleSelectAllEmp(this)" title="全选"></th><th>工号</th><th>姓名</th><th>身份证号</th><th>操作</th></tr></thead>
            <tbody>
              ${data.length === 0 ? '<tr><td colspan="5"><div class="empty-state"><p>暂无人员，请添加</p></div></td></tr>' : data.map(e => {
                const locked = e.has_journal;
                const editBtn = locked
                  ? `<button class="btn btn-sm btn-secondary" disabled style="opacity:0.35;cursor:not-allowed" title="该人员已被序时账往来项目引用，不可编辑">编辑</button>`
                  : `<button class="btn btn-sm btn-secondary" onclick="showEmpForm(${e.id},'${e.code}','${esc(e.name)}','${esc(e.id_card||'')}')">编辑</button>`;
                const delBtn = locked
                  ? `<button class="btn btn-sm btn-danger" disabled style="opacity:0.35;cursor:not-allowed" title="该人员已被序时账往来项目引用，不可删除">删除</button>`
                  : `<button class="btn btn-sm btn-danger" onclick="deleteEmp(${e.id})">删除</button>`;
                const cbAttr = locked ? 'disabled title="该人员已被序时账往来项目引用"' : '';
                return `
                <tr>
                  <td><input type="checkbox" class="emp-check" value="${e.id}" onchange="updateEmpBatchBtn()" ${cbAttr}></td>
                  <td class="single-line">${e.code}</td>
                  <td class="single-line">${e.name}</td>
                  <td class="single-line">${e.id_card || '-'}</td>
                  <td style="white-space:nowrap">
                    ${editBtn}
                    ${delBtn}
                  </td>
                </tr>
              `}).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    showError(el, e, '加载数据');
  }
}

function toggleSelectAllEmp(cb) {
  document.querySelectorAll('.emp-check:not([disabled])').forEach(c => c.checked = cb.checked);
  updateEmpBatchBtn();
}

function updateEmpBatchBtn() {
  const count = document.querySelectorAll('.emp-check:checked').length;
  const btn = document.getElementById('btn-batch-del-emp');
  if (btn) {
    btn.textContent = count > 0 ? '批量删除（' + count + '）' : '批量删除';
    btn.disabled = count === 0;
  }
}

async function batchDeleteEmp() {
  const checked = [...document.querySelectorAll('.emp-check:checked')].map(cb => parseInt(cb.value));
  if (checked.length === 0) return;
  if (!confirm('确认删除选中的 ' + checked.length + ' 条人员记录？此操作不可撤销！')) return;
  try {
    await api('/api/employees/batch-delete', { method: 'POST', body: JSON.stringify({ids: checked}) });
    toast('成功删除 ' + checked.length + ' 条人员', 'success');
    renderEmployees();
  } catch (e) { toast(e.message, 'error'); }
}

function showEmpForm(id, code, name, idCard) {
  const isEdit = !!id;
  const nextCode = isEdit ? (code || '') : _nextArchiveCode('RY', empList);
  showModal(`
    <h3>${isEdit ? '编辑' : '新增'}人员</h3>
    <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-field"><label>工号</label><input id="emp-code" value="${nextCode}" ${isEdit ? 'disabled style="background:#f3f4f6"' : 'readonly style="background:#f3f4f6;color:#6b7280" placeholder="自动生成"'}</div>
      <div class="form-field"><label>姓名 <span style="color:red">*</span></label><input id="emp-name" value="${name||''}"></div>
      <div class="form-field"><label>身份证号</label><input id="emp-idcard" value="${idCard||''}" placeholder="18位身份证号"></div>
    </div>
    <div style="margin-top:12px">
      <button class="btn btn-primary" onclick="saveEmp(${id||0})">保存</button>
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    </div>
  `);
}

async function saveEmp(id) {
  const body = {
    code: document.getElementById('emp-code').value.trim(),
    name: document.getElementById('emp-name').value.trim(),
    id_card: document.getElementById('emp-idcard')?.value.trim() || null
  };
  if (!body.name) { toast('请填写人员姓名', 'error'); return; }
  if (!id && !body.code) body.code = '';
  try {
    const list = await api('/api/employees');
    const dup = list.find(e => e.id !== id && body.id_card && e.id_card === body.id_card);
    if (dup) { toast('人员"' + body.name + '" 身份证号已存在（' + dup.code + ' ' + dup.name + '），请勿重复添加', 'warn'); return; }
  } catch (e) {}
  try {
    if (id) {
      await api(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/api/employees', { method: 'POST', body: JSON.stringify(body) });
    }
    toast('保存成功', 'success');
    closeModal();
    renderEmployees();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteEmp(id) {
  if (!confirm('确认删除该人员？')) return;
  try {
    await api(`/api/employees/${id}`, { method: 'DELETE' });
    toast('删除成功', 'success');
    renderEmployees();
  } catch (e) { toast(e.message, 'error'); }
}

// ==================== 客户档案 ====================
async function renderCustomers(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  try {
    const data = await api('/api/customers');
    custList = data;
    el.innerHTML = `
      <div class="card card-fill">
        <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-shrink:0">
          <button class="btn btn-primary btn-sm" onclick="showCustForm()">新增客户</button>
          <button class="btn btn-outline btn-sm" onclick="showUploadModal('customer')">导入文件</button>
          <button class="btn btn-danger btn-sm" onclick="batchDeleteCust()" id="btn-batch-del-cust">批量删除</button>
        </div>
        <div class="table-wrap" style="flex:1;overflow:auto">
          <table class="single-line-table">
            <thead><tr><th style="width:36px"><input type="checkbox" id="custSelectAll" onchange="toggleSelectAllCust(this)" title="全选"></th><th>编码</th><th>客户名称</th><th style="font-size:11px">统一社会信用代码/税号</th><th>地址</th><th>开户行</th><th>银行账号</th><th>操作</th></tr></thead>
            <tbody>
              ${data.length === 0 ? '<tr><td colspan="8"><div class="empty-state"><p>暂无客户，请添加</p></div></td></tr>' : data.map(c => {
                const locked = c.has_journal;
                const editBtn = locked
                  ? `<button class="btn btn-sm btn-secondary" disabled style="opacity:0.35;cursor:not-allowed" title="该客户已被序时账引用，不可编辑">编辑</button>`
                  : `<button class="btn btn-sm btn-secondary" onclick="showCustForm(${c.id},'${esc(c.code)}','${esc(c.name)}','${esc(c.uscc||'')}','${esc(c.tax_no||'')}','${esc(c.address||'')}','${esc(c.bank_name||'')}','${esc(c.bank_account||'')}')">编辑</button>`;
                const delBtn = locked
                  ? `<button class="btn btn-sm btn-danger" disabled style="opacity:0.35;cursor:not-allowed" title="该客户已被序时账引用，不可删除">删除</button>`
                  : `<button class="btn btn-sm btn-danger" onclick="deleteCust(${c.id})">删除</button>`;
                const cbAttr = locked ? 'disabled title="该客户已被序时账引用"' : '';
                const usccDisplay = c.uscc || c.tax_no || '-';
                return `
                <tr>
                  <td><input type="checkbox" class="cust-check" value="${c.id}" onchange="updateBatchDelCustBtn()" ${cbAttr}></td>
                  <td class="single-line">${c.code}</td>
                  <td class="single-line">${c.name}</td>
                  <td class="single-line" style="font-family:monospace;font-size:11px">${usccDisplay}</td>
                  <td class="single-line" style="font-size:11px">${c.address || '-'}</td>
                  <td class="single-line" style="font-size:11px">${c.bank_name || '-'}</td>
                  <td class="single-line" style="font-family:monospace;font-size:11px">${c.bank_account || '-'}</td>
                  <td style="white-space:nowrap">
                    ${editBtn}
                    ${delBtn}
                  </td>
                </tr>
              `}).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    showError(el, e, '加载数据');
  }
}

function toggleSelectAllCust(el) {
  document.querySelectorAll('.cust-check:not(:disabled)').forEach(cb => { cb.checked = el.checked; });
  updateBatchDelCustBtn();
}
function updateBatchDelCustBtn() {
  const btn = document.getElementById('btn-batch-del-cust');
  if (!btn) return;
  const enabledBoxes = document.querySelectorAll('.cust-check:not(:disabled)');
  const checkedEnabled = document.querySelectorAll('.cust-check:not(:disabled):checked');
  const checked = checkedEnabled.length;
  btn.textContent = checked > 0 ? `批量删除（${checked}）` : '批量删除';
  btn.disabled = checked === 0;
  // 同步全选框状态
  const selectAll = document.getElementById('custSelectAll');
  if (selectAll) {
    selectAll.checked = enabledBoxes.length > 0 && enabledBoxes.length === checkedEnabled.length;
    selectAll.indeterminate = checkedEnabled.length > 0 && checkedEnabled.length < enabledBoxes.length;
  }
}
async function batchDeleteCust() {
  const checked = [...document.querySelectorAll('.cust-check:not(:disabled):checked')].map(cb => parseInt(cb.value));
  if (checked.length === 0) return;
  if (!confirm(`确认删除选中的 ${checked.length} 条客户记录？此操作不可撤销！`)) return;
  try {
    await api('/api/customers/batch-delete', { method: 'POST', body: JSON.stringify({ids: checked}) });
    toast(`成功删除 ${checked.length} 条客户`, 'success');
    renderCustomers();
  } catch (e) { toast(e.message, 'error'); }
}

function showCustForm(id, code, name, uscc, tax_no, address, bank_name, bank_account) {
  const isEdit = !!id;
  const nextCode = isEdit ? (code || '') : _nextArchiveCode('KH', custList);
  showModal(`
    <h3>${isEdit ? '编辑' : '新增'}客户</h3>
    <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-field"><label>编码</label><input id="cust-code" value="${nextCode}" ${isEdit ? 'disabled style="background:#f3f4f6"' : 'readonly style="background:#f3f4f6;color:#6b7280" placeholder="自动生成"'}</div>
      <div class="form-field"><label>名称 <span style="color:red">*</span></label><input id="cust-name" value="${name||''}"></div>
      <div class="form-field"><label>统一社会信用代码/税号</label><input id="cust-uscc" value="${uscc||''}" placeholder="18位代码" style="font-family:monospace"></div>
      <div class="form-field"><label>地址</label><input id="cust-address" value="${address||''}"></div>
      <div class="form-field"><label>开户行</label><input id="cust-bank-name" value="${bank_name||''}"></div>
      <div class="form-field"><label>银行账号</label><input id="cust-bank-account" value="${bank_account||''}" style="font-family:monospace"></div>
    </div>
    <div style="margin-top:12px">
      <button class="btn btn-primary" onclick="saveCust(${id||0})">保存</button>
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    </div>
  `);
}

async function saveCust(id) {
  const body = {
    code: document.getElementById('cust-code').value.trim(),
    name: document.getElementById('cust-name').value.trim(),
    uscc: document.getElementById('cust-uscc')?.value.trim() || null,
    tax_no: document.getElementById('cust-uscc')?.value.trim() || null,
    address: document.getElementById('cust-address')?.value.trim() || null,
    bank_name: document.getElementById('cust-bank-name')?.value.trim() || null,
    bank_account: document.getElementById('cust-bank-account')?.value.trim() || null
  };
  if (!body.name) { toast('请填写客户名称', 'error'); return; }
  if (!id && !body.code) body.code = '';
  try {
    const list = await api('/api/customers');
    const dup = list.find(c => c.id !== id && (
      (body.name && c.name === body.name) || (body.uscc && c.uscc === body.uscc)
    ));
    if (dup) { toast('客户"' + body.name + '"（' + body.uscc + '）与已有记录冲突（' + dup.code + ' ' + dup.name + '），请勿重复添加', 'warn'); return; }
  } catch (e) {}
  try {
    if (id) {
      await api(`/api/customers/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/api/customers', { method: 'POST', body: JSON.stringify(body) });
    }
    toast('保存成功', 'success');
    closeModal();
    renderCustomers();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteCust(id) {
  if (!confirm('确认删除该客户？')) return;
  try {
    await api(`/api/customers/${id}`, { method: 'DELETE' });
    toast('删除成功', 'success');
    renderCustomers();
  } catch (e) { toast(e.message, 'error'); }
}

// ==================== 供应商档案 ====================
async function renderSuppliers(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  try {
    const data = await api('/api/suppliers');
    suppList = data;
    el.innerHTML = `
      <div class="card card-fill">
        <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-shrink:0">
          <button class="btn btn-primary btn-sm" onclick="showSuppForm()">新增供应商</button>
          <button class="btn btn-outline btn-sm" onclick="showUploadModal('supplier')">导入文件</button>
          <button class="btn btn-danger btn-sm" onclick="batchDeleteSupp()" id="btn-batch-del-supp">批量删除</button>
        </div>
        <div class="table-wrap" style="flex:1;overflow:auto">
          <table class="single-line-table">
            <thead><tr><th style="width:36px"><input type="checkbox" id="suppSelectAll" onchange="toggleSelectAllSupp(this)" title="全选"></th><th>编码</th><th>供应商名称</th><th style="font-size:11px">统一社会信用代码/税号</th><th>开户行</th><th>银行账号</th><th>操作</th></tr></thead>
            <tbody>
              ${data.length === 0 ? '<tr><td colspan="7"><div class="empty-state"><p>暂无供应商，请添加</p></div></td></tr>' : data.map(s => {
                const locked = s.has_journal;
                const editBtn = locked
                  ? `<button class="btn btn-sm btn-secondary" disabled style="opacity:0.35;cursor:not-allowed" title="该供应商已被序时账引用，不可编辑">编辑</button>`
                  : `<button class="btn btn-sm btn-secondary" onclick="showSuppForm(${s.id},'${s.code}','${esc(s.name)}','${esc(s.uscc||'')}','${esc(s.tax_no||'')}','${esc(s.bank_name||'')}','${esc(s.bank_account||'')}')">编辑</button>`;
                const delBtn = locked
                  ? `<button class="btn btn-sm btn-danger" disabled style="opacity:0.35;cursor:not-allowed" title="该供应商已被序时账引用，不可删除">删除</button>`
                  : `<button class="btn btn-sm btn-danger" onclick="deleteSupp(${s.id})">删除</button>`;
                const cbAttr = locked ? 'disabled title="该供应商已被序时账引用"' : '';
                const usccDisplay = s.uscc || s.tax_no || '-';
                return `
                <tr>
                  <td><input type="checkbox" class="supp-check" value="${s.id}" onchange="updateBatchDelSuppBtn()" ${cbAttr}></td>
                  <td class="single-line">${s.code}</td>
                  <td class="single-line">${s.name}</td>
                  <td class="single-line" style="font-family:monospace;font-size:11px">${usccDisplay}</td>
                  <td class="single-line" style="font-size:11px">${s.bank_name || '-'}</td>
                  <td class="single-line" style="font-family:monospace;font-size:11px">${s.bank_account || '-'}</td>
                  <td style="white-space:nowrap">
                    ${editBtn}
                    ${delBtn}
                  </td>
                </tr>
              `}).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    showError(el, e, '加载数据');
  }
}

function toggleSelectAllSupp(el) {
  document.querySelectorAll('.supp-check:not(:disabled)').forEach(cb => { cb.checked = el.checked; });
  updateBatchDelSuppBtn();
}
function updateBatchDelSuppBtn() {
  const btn = document.getElementById('btn-batch-del-supp');
  if (!btn) return;
  const enabledBoxes = document.querySelectorAll('.supp-check:not(:disabled)');
  const checkedEnabled = document.querySelectorAll('.supp-check:not(:disabled):checked');
  const checked = checkedEnabled.length;
  btn.textContent = checked > 0 ? `批量删除（${checked}）` : '批量删除';
  btn.disabled = checked === 0;
  const selectAll = document.getElementById('suppSelectAll');
  if (selectAll) {
    selectAll.checked = enabledBoxes.length > 0 && enabledBoxes.length === checkedEnabled.length;
    selectAll.indeterminate = checkedEnabled.length > 0 && checkedEnabled.length < enabledBoxes.length;
  }
}
async function batchDeleteSupp() {
  const checked = [...document.querySelectorAll('.supp-check:not(:disabled):checked')].map(cb => parseInt(cb.value));
  if (checked.length === 0) return;
  if (!confirm(`确认删除选中的 ${checked.length} 条供应商记录？此操作不可撤销！`)) return;
  try {
    await api('/api/suppliers/batch-delete', { method: 'POST', body: JSON.stringify({ids: checked}) });
    toast(`成功删除 ${checked.length} 条供应商`, 'success');
    renderSuppliers();
  } catch (e) { toast(e.message, 'error'); }
}

function showSuppForm(id, code, name, uscc, tax_no, bank_name, bank_account) {
  const isEdit = !!id;
  const nextCode = isEdit ? (code || '') : _nextArchiveCode('GYS', suppList);
  showModal(`
    <h3>${isEdit ? '编辑' : '新增'}供应商</h3>
    <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-field"><label>编码</label><input id="supp-code" value="${nextCode}" ${isEdit ? 'disabled style="background:#f3f4f6"' : 'readonly style="background:#f3f4f6;color:#6b7280" placeholder="自动生成"'}</div>
      <div class="form-field"><label>名称 <span style="color:red">*</span></label><input id="supp-name" value="${name||''}"></div>
      <div class="form-field"><label>统一社会信用代码/税号</label><input id="supp-uscc" value="${uscc||''}" placeholder="18位代码" style="font-family:monospace"></div>
      <div class="form-field"><label>开户行</label><input id="supp-bank-name" value="${bank_name||''}"></div>
      <div class="form-field" style="grid-column:1/-1"><label>银行账号</label><input id="supp-bank-account" value="${bank_account||''}" style="font-family:monospace"></div>
    </div>
    <div style="margin-top:12px">
      <button class="btn btn-primary" onclick="saveSupp(${id||0})">保存</button>
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    </div>
  `);
}

async function saveSupp(id) {
  const body = {
    code: document.getElementById('supp-code').value.trim(),
    name: document.getElementById('supp-name').value.trim(),
    uscc: document.getElementById('supp-uscc')?.value.trim() || null,
    tax_no: document.getElementById('supp-uscc')?.value.trim() || null,
    bank_name: document.getElementById('supp-bank-name')?.value.trim() || null,
    bank_account: document.getElementById('supp-bank-account')?.value.trim() || null
  };
  if (!body.name) { toast('请填写供应商名称', 'error'); return; }
  if (!id && !body.code) body.code = '';
  try {
    const list = await api('/api/suppliers');
    const dup = list.find(s => s.id !== id && (
      (body.name && s.name === body.name) || (body.uscc && s.uscc === body.uscc)
    ));
    if (dup) { toast('供应商"' + body.name + '"（' + body.uscc + '）与已有记录冲突（' + dup.code + ' ' + dup.name + '），请勿重复添加', 'warn'); return; }
  } catch (e) {}
  try {
    if (id) {
      await api(`/api/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/api/suppliers', { method: 'POST', body: JSON.stringify(body) });
    }
    toast('保存成功', 'success');
    closeModal();
    renderSuppliers();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteSupp(id) {
  if (!confirm('确认删除该供应商？')) return;
  try {
    await api(`/api/suppliers/${id}`, { method: 'DELETE' });
    toast('删除成功', 'success');
    renderSuppliers();
  } catch (e) { toast(e.message, 'error'); }
}

