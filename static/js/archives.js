// ==================== 会计科目 ====================
async function renderAccounts(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML = `
    <div class="card card-fill">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <button class="btn btn-primary" onclick="showAddAccount()">+ 新增科目</button>
      </div>
      <div class="filter-bar">
        <select class="form-control" id="acc-cat" style="width:130px">
          <option value="">全部类别</option>
          <option>资产</option><option>负债</option><option>权益</option>
          <option>收入</option><option>费用</option><option>成本</option>
        </select>
        <input class="form-control" id="acc-kw" placeholder="科目编码/名称" style="width:180px">
        <button class="btn btn-primary" onclick="loadAccounts()">🔍 查询</button>
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
          ${data.map(a => `
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
                <button class="btn btn-sm btn-secondary" onclick="toggleAccount(${a.id}, ${!a.is_active})">${a.is_active ? '停用' : '启用'}</button>
                <button class="btn btn-sm btn-danger" onclick="deleteAccount(${a.id})">删除</button>
              </td>
            </tr>
          `).join('')}
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
      <div class="form-group"><label>科目编码 *</label><input class="form-control" id="na-code" placeholder="如 6605"></div>
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
        <select class="form-control" id="na-level"><option value="1">一级</option><option value="2">二级</option></select>
      </div>
      <div class="form-group">
        <label>上级科目</label>
        <select class="form-control" id="na-parent"><option value="">无</option>${parentOptions}</select>
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
  try {
    await api('/api/accounts', { method: 'POST', body: JSON.stringify({ code, name, category, balance_direction, level, parent_code, opening_balance }) });
    toast('科目创建成功', 'success');
    closeModal();
    await loadAccounts();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function toggleAccount(id, active) {
  try {
    await api(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify({ is_active: active }) });
    toast(active ? '科目已启用' : '科目已停用', 'success');
    await loadAccounts();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteAccount(id) {
  if (!confirm('确认删除该科目？')) return;
  try {
    await api(`/api/accounts/${id}`, { method: 'DELETE' });
    toast('删除成功', 'success');
    await loadAccounts();
  } catch (e) {
    toast(e.message, 'error');
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
    el.innerHTML = `
      <div class="card card-fill">
        <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-shrink:0">
          <button class="btn btn-primary btn-sm" onclick="showDeptForm()">＋ 新增部门</button>
          <button class="btn btn-outline btn-sm" onclick="showUploadModal('department')">📁 导入文件</button>
          <button class="btn btn-danger btn-sm" id="deptBatchDelBtn" onclick="batchDeleteDepts()">🗑 批量删除</button>
        </div>
        <div class="table-wrap" style="flex:1;overflow:auto">
          <table>
            <thead><tr><th style="width:40px"><input type="checkbox" onchange="toggleDeptAll(this);updateDeptBatchBtn()"></th><th>编码</th><th>部门名称</th><th>操作</th></tr></thead>
            <tbody>
              ${data.length === 0 ? '<tr><td colspan="4"><div class="empty-state"><p>暂无部门，请添加</p></div></td></tr>' : data.map(d => `
                <tr>
                  <td><input type="checkbox" class="dept-cb" value="${d.id}" onchange="updateDeptBatchBtn()"></td>
                  <td>${d.code}</td>
                  <td>${d.name}</td>
                  <td style="white-space:nowrap">
                    <button class="btn btn-sm btn-secondary" onclick="showDeptForm(${d.id},'${d.code}','${esc(d.name)}')">编辑</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteDept(${d.id})">删除</button>
                  </td>
                </tr>
              `).join('')}
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
  showModal(`
    <h3>${isEdit ? '编辑' : '新增'}部门</h3>
    <div class="form-field"><label>编码 <span style="color:red">*</span></label><input id="dept-code" value="${code||''}" placeholder="如：SC"></div>
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
  if (!body.code || !body.name) { toast('请填写编码和名称', 'error'); return; }
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
  btn.textContent = cbs.length > 0 ? '🗑 批量删除(' + cbs.length + ')' : '🗑 批量删除';
}

async function batchDeleteDepts() {
  var cbs = document.querySelectorAll('.dept-cb:checked');
  if (cbs.length === 0) { toast('请先选择要删除的部门', 'warn'); return; }
  if (!confirm('确认删除选中的 ' + cbs.length + ' 个部门？此操作不可恢复。')) return;
  try {
    var ids = Array.from(cbs).map(c => parseInt(c.value));
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
    el.innerHTML = `
      <div class="card card-fill">
        <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-shrink:0">
          <button class="btn btn-primary btn-sm" onclick="showEmpForm()">＋ 新增人员</button>
          <button class="btn btn-outline btn-sm" onclick="showUploadModal('employee')">📁 导入文件</button>
          <button class="btn btn-danger btn-sm" id="btn-batch-del-emp" onclick="batchDeleteEmp()">🗑 批量删除</button>
        </div>
        <div class="table-wrap" style="flex:1;overflow:auto">
          <table>
            <thead><tr><th style="width:36px"><input type="checkbox" onchange="toggleSelectAllEmp(this)" title="全选"></th><th>工号</th><th>姓名</th><th>身份证号</th><th>操作</th></tr></thead>
            <tbody>
              ${data.length === 0 ? '<tr><td colspan="5"><div class="empty-state"><p>暂无人员，请添加</p></div></td></tr>' : data.map(e => {
                return `
                <tr>
                  <td><input type="checkbox" class="emp-check" value="${e.id}" onchange="updateEmpBatchBtn()"></td>
                  <td>${e.code}</td>
                  <td>${e.name}</td>
                  <td>${e.id_card || '-'}</td>
                  <td style="white-space:nowrap">
                    <button class="btn btn-sm btn-secondary" onclick="showEmpForm(${e.id},'${e.code}','${esc(e.name)}','${esc(e.id_card||'')}')">编辑</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteEmp(${e.id})">删除</button>
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
  document.querySelectorAll('.emp-check').forEach(c => c.checked = cb.checked);
  updateEmpBatchBtn();
}

function updateEmpBatchBtn() {
  const count = document.querySelectorAll('.emp-check:checked').length;
  const btn = document.getElementById('btn-batch-del-emp');
  if (btn) {
    btn.textContent = count > 0 ? '🗑 批量删除（' + count + '）' : '🗑 批量删除';
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
  showModal(`
    <h3>${isEdit ? '编辑' : '新增'}人员</h3>
    <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-field"><label>工号 <span style="color:red">*</span></label><input id="emp-code" value="${code||''}"></div>
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
  if (!body.code || !body.name) { toast('请填写工号和姓名', 'error'); return; }
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
    el.innerHTML = `
      <div class="card card-fill">
        <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-shrink:0">
          <button class="btn btn-primary btn-sm" onclick="showCustForm()">＋ 新增客户</button>
          <button class="btn btn-outline btn-sm" onclick="showUploadModal('customer')">📁 导入文件</button>
          <button class="btn btn-danger btn-sm" onclick="batchDeleteCust()" id="btn-batch-del-cust">🗑 批量删除</button>
        </div>
        <div class="table-wrap" style="flex:1;overflow:auto">
          <table>
            <thead><tr><th style="width:36px"><input type="checkbox" onchange="toggleSelectAllCust(this)" title="全选"></th><th>编码</th><th>客户名称</th><th>统一社会信用代码</th><th>操作</th></tr></thead>
            <tbody>
              ${data.length === 0 ? '<tr><td colspan="5"><div class="empty-state"><p>暂无客户，请添加</p></div></td></tr>' : data.map(c => {
                const locked = c.has_journal;
                const delBtn = locked
                  ? `<button class="btn btn-sm btn-danger" disabled style="opacity:0.35;cursor:not-allowed" title="该客户已被序时账引用，不可删除">删除</button>`
                  : `<button class="btn btn-sm btn-danger" onclick="deleteCust(${c.id})">删除</button>`;
                const cbAttr = locked ? 'disabled title="该客户已被序时账引用"' : '';
                return `
                <tr>
                  <td><input type="checkbox" class="cust-check" value="${c.id}" onchange="updateBatchDelCustBtn()" ${cbAttr}></td>
                  <td>${c.code}</td>
                  <td>${c.name}</td>
                  <td style="font-family:monospace;font-size:12px">${c.uscc || '-'}</td>
                  <td style="white-space:nowrap">
                    <button class="btn btn-sm btn-secondary" onclick="showCustForm(${c.id},'${esc(c.code)}','${esc(c.name)}','${esc(c.uscc||'')}')">编辑</button>
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
  document.querySelectorAll('.cust-check').forEach(cb => { cb.checked = el.checked; });
  updateBatchDelCustBtn();
}
function updateBatchDelCustBtn() {
  const btn = document.getElementById('btn-batch-del-cust');
  if (!btn) return;
  const checked = document.querySelectorAll('.cust-check:checked').length;
  btn.textContent = checked > 0 ? `🗑 批量删除（${checked}）` : '🗑 批量删除';
  btn.disabled = checked === 0;
}
async function batchDeleteCust() {
  const checked = [...document.querySelectorAll('.cust-check:checked')].map(cb => parseInt(cb.value));
  if (checked.length === 0) return;
  if (!confirm(`确认删除选中的 ${checked.length} 条客户记录？此操作不可撤销！`)) return;
  try {
    await api('/api/customers/batch-delete', { method: 'POST', body: JSON.stringify({ids: checked}) });
    toast(`成功删除 ${checked.length} 条客户`, 'success');
    renderCustomers();
  } catch (e) { toast(e.message, 'error'); }
}

function showCustForm(id, code, name, uscc) {
  const isEdit = !!id;
  showModal(`
    <h3>${isEdit ? '编辑' : '新增'}客户</h3>
    <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-field"><label>编码 <span style="color:red">*</span></label><input id="cust-code" value="${code||''}" placeholder="如：KH001"></div>
      <div class="form-field"><label>名称 <span style="color:red">*</span></label><input id="cust-name" value="${name||''}"></div>
      <div class="form-field" style="grid-column:1/-1"><label>统一社会信用代码</label><input id="cust-uscc" value="${uscc||''}" placeholder="18位统一社会信用代码" style="font-family:monospace"></div>
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
    uscc: document.getElementById('cust-uscc')?.value.trim() || null
  };
  if (!body.code || !body.name) { toast('请填写编码和名称', 'error'); return; }
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
    el.innerHTML = `
      <div class="card card-fill">
        <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-shrink:0">
          <button class="btn btn-primary btn-sm" onclick="showSuppForm()">＋ 新增供应商</button>
          <button class="btn btn-outline btn-sm" onclick="showUploadModal('supplier')">📁 导入文件</button>
          <button class="btn btn-danger btn-sm" onclick="batchDeleteSupp()" id="btn-batch-del-supp">🗑 批量删除</button>
        </div>
        <div class="table-wrap" style="flex:1;overflow:auto">
          <table>
            <thead><tr><th style="width:36px"><input type="checkbox" onchange="toggleSelectAllSupp(this)" title="全选"></th><th>编码</th><th>供应商名称</th><th>统一社会信用代码</th><th>操作</th></tr></thead>
            <tbody>
              ${data.length === 0 ? '<tr><td colspan="5"><div class="empty-state"><p>暂无供应商，请添加</p></div></td></tr>' : data.map(s => `
                <tr>
                  <td><input type="checkbox" class="supp-check" value="${s.id}" onchange="updateBatchDelSuppBtn()"></td>
                  <td>${s.code}</td>
                  <td>${s.name}</td>
                  <td style="font-family:monospace;font-size:12px">${s.uscc || '-'}</td>
                  <td style="white-space:nowrap">
                    <button class="btn btn-sm btn-secondary" onclick="showSuppForm(${s.id},'${s.code}','${esc(s.name)}','${esc(s.uscc||'')}')">编辑</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteSupp(${s.id})">删除</button>
                  </td>
                </tr>
              `).join('')}
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
  document.querySelectorAll('.supp-check').forEach(cb => { cb.checked = el.checked; });
  updateBatchDelSuppBtn();
}
function updateBatchDelSuppBtn() {
  const btn = document.getElementById('btn-batch-del-supp');
  if (!btn) return;
  const checked = document.querySelectorAll('.supp-check:checked').length;
  btn.textContent = checked > 0 ? `🗑 批量删除（${checked}）` : '🗑 批量删除';
  btn.disabled = checked === 0;
}
async function batchDeleteSupp() {
  const checked = [...document.querySelectorAll('.supp-check:checked')].map(cb => parseInt(cb.value));
  if (checked.length === 0) return;
  if (!confirm(`确认删除选中的 ${checked.length} 条供应商记录？此操作不可撤销！`)) return;
  try {
    await api('/api/suppliers/batch-delete', { method: 'POST', body: JSON.stringify({ids: checked}) });
    toast(`成功删除 ${checked.length} 条供应商`, 'success');
    renderSuppliers();
  } catch (e) { toast(e.message, 'error'); }
}

function showSuppForm(id, code, name, uscc) {
  const isEdit = !!id;
  showModal(`
    <h3>${isEdit ? '编辑' : '新增'}供应商</h3>
    <div class="form-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-field"><label>编码 <span style="color:red">*</span></label><input id="supp-code" value="${code||''}" placeholder="如：GYS001"></div>
      <div class="form-field"><label>名称 <span style="color:red">*</span></label><input id="supp-name" value="${name||''}"></div>
      <div class="form-field" style="grid-column:1/-1"><label>统一社会信用代码</label><input id="supp-uscc" value="${uscc||''}" placeholder="18位统一社会信用代码" style="font-family:monospace"></div>
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
    uscc: document.getElementById('supp-uscc')?.value.trim() || null
  };
  if (!body.code || !body.name) { toast('请填写编码和名称', 'error'); return; }
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

