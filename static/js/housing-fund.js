// ========== 公积金缴存模块 ==========

let hfPeriod = '';
let hfStats = {};
let hfSelectedIds = new Set();
let hfEditId = null;  // 编辑时暂存ID

// 自定义escAttr（escapeHtml已有，但attr需额外转引号）
function hfEscAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

async function renderHousingFund(container) {
  container.innerHTML = `
    <div class="module-page">
      <div class="stats-row" id="hf-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;"></div>
      <div class="toolbar">
        <div class="toolbar-left">
          <input type="month" id="hf-period-filter" onchange="hfRefresh()" style="padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;" />
        </div>
        <div class="toolbar-right" style="display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="hfShowCreate()">+ 新增</button>
          <button class="btn btn-outline" onclick="hfShowImport()">📁 导入</button>
          <button class="btn btn-danger" onclick="hfBatchDelete()" id="hf-batch-del-btn" style="display:none;">删除</button>
        </div>
      </div>
        <div class="table-wrap" style="max-height:calc(100vh - 260px);overflow:auto;">
        <table class="data-table" id="hf-table">
          <thead>
            <tr>
              <th style="width:36px;"><input type="checkbox" onchange="hfToggleAll(this)" /></th>
              <th>工号</th>
              <th>姓名</th>
              <th>身份证号</th>
              <th>缴存基数</th>
              <th>单位比例(%)</th>
              <th>个人比例(%)</th>
              <th>缴存额</th>
              <th>单位缴存额</th>
              <th>个人缴存额</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="hf-tbody"></tbody>
        </table>
      </div>
    </div>
  `;
  hfRefresh();
}

async function hfRefresh() {
  hfPeriod = document.getElementById('hf-period-filter')?.value || '';
  let url = `/api/housing-fund/details?company_id=${currentCompanyId}`;
  if (hfPeriod) url += `&period=${hfPeriod}`;

  let statsUrl = `/api/housing-fund/stats?company_id=${currentCompanyId}`;
  if (hfPeriod) statsUrl += `&period=${hfPeriod}`;

  try {
    const [data, stats] = await Promise.all([
      api('GET', url),
      api('GET', statsUrl),
    ]);
    hfStats = stats;
    hfRenderStats(stats);
    hfRenderTable(data.items || []);
  } catch (e) {
    console.error(e);
  }
}

function hfRenderStats(stats) {
  const el = document.getElementById('hf-stats');
  if (!el) return;
  const cards = [
    { label: '缴存人数', value: stats.person_count || 0 },
    { label: '单位缴存合计', value: '\u00a5' + (stats.total_company_amount || 0).toLocaleString() },
    { label: '个人缴存合计', value: '\u00a5' + (stats.total_personal_amount || 0).toLocaleString() },
    { label: '缴存总额', value: '\u00a5' + (stats.total_amount || 0).toLocaleString() },
  ];
  el.innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="stat-label">${c.label}</div>
      <div class="stat-value">${c.value}</div>
    </div>
  `).join('');
}

function hfRenderTable(items) {
  const tbody = document.getElementById('hf-tbody');
  if (!tbody) return;
  hfSelectedIds.clear();
  tbody.innerHTML = items.length === 0
    ? '<tr><td colspan="12" style="text-align:center;padding:40px;color:#999;">暂无数据</td></tr>'
    : items.map(item => `
      <tr>
        <td><input type="checkbox" value="${item.id}" onchange="hfToggleCheck(this)" /></td>
        <td>${escapeHtml(item.employee_id || '-')}</td>
        <td>${escapeHtml(item.employee_name)}</td>
        <td>${escapeHtml(item.id_number || '-')}</td>
        <td class="num">${(item.deposit_base || 0).toLocaleString()}</td>
        <td class="num">${item.company_ratio || 0}%</td>
        <td class="num">${item.personal_ratio || 0}%</td>
        <td class="num">${(item.total_amount || 0).toLocaleString()}</td>
        <td class="num">${(item.company_amount || 0).toLocaleString()}</td>
        <td class="num">${(item.personal_amount || 0).toLocaleString()}</td>
        <td><span class="tag tag-green">${escapeHtml(item.status || '正常')}</span></td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="hfShowEdit(${item.id})">编辑</button>
          <button class="btn btn-sm btn-danger" onclick="hfDelete(${item.id})">删除</button>
        </td>
      </tr>
    `).join('');
  updateBatchBtn();
}

function hfToggleAll(cb) {
  const checks = document.querySelectorAll('#hf-tbody input[type="checkbox"]');
  checks.forEach(c => c.checked = cb.checked);
  hfSelectedIds.clear();
  if (cb.checked) checks.forEach(c => hfSelectedIds.add(parseInt(c.value)));
  updateBatchBtn();
}

function hfToggleCheck(cb) {
  if (cb.checked) hfSelectedIds.add(parseInt(cb.value));
  else hfSelectedIds.delete(parseInt(cb.value));
  updateBatchBtn();
}

function updateBatchBtn() {
  const btn = document.getElementById('hf-batch-del-btn');
  if (btn) btn.style.display = hfSelectedIds.size > 0 ? '' : 'none';
}

async function hfBatchDelete() {
  if (hfSelectedIds.size === 0) return;
  if (!confirm(`确认删除选中的 ${hfSelectedIds.size} 条记录？`)) return;
  await api('POST', `/api/housing-fund/details/batch-delete?company_id=${currentCompanyId}`, [...hfSelectedIds]);
  hfRefresh();
}

// ============ 新增/编辑弹窗 ============

function hfShowCreate() {
  showModal(`
    <div class="modal-title">新增公积金缴存记录</div>
    <div class="form-group">
      <label>工号</label>
      <input class="form-input" id="hf-emp-id" placeholder="工号（选填）" />
    </div>
    <div class="form-group">
      <label>姓名 <span style="color:red">*</span></label>
      <input class="form-input" id="hf-emp-name" placeholder="姓名" />
    </div>
    <div class="form-group">
      <label>身份证号</label>
      <input class="form-input" id="hf-id-number" placeholder="身份证号" />
    </div>
    <div class="form-group">
      <label>缴存基数</label>
      <input class="form-input" type="number" id="hf-deposit-base" placeholder="0" step="0.01" />
    </div>
    <div class="form-row-2">
      <div class="form-group">
        <label>单位缴存比例(%)</label>
        <input class="form-input" type="number" id="hf-company-ratio" placeholder="0" step="0.01" />
      </div>
      <div class="form-group">
        <label>个人缴存比例(%)</label>
        <input class="form-input" type="number" id="hf-personal-ratio" placeholder="0" step="0.01" />
      </div>
    </div>
    <div class="form-group">
      <label>状态</label>
      <select class="form-input" id="hf-status">
        <option value="正常">正常</option>
        <option value="封存">封存</option>
      </select>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="hfDoCreate()">保存</button>
    </div>
  `);
}

async function hfDoCreate() {
  const name = document.getElementById('hf-emp-name').value.trim();
  if (!name) return alert('请输入姓名');
  const body = {
    company_id: currentCompanyId,
    period: hfPeriod || new Date().toISOString().slice(0, 7),
    employee_id: document.getElementById('hf-emp-id').value.trim(),
    employee_name: name,
    id_number: document.getElementById('hf-id-number').value.trim(),
    deposit_base: parseFloat(document.getElementById('hf-deposit-base').value) || 0,
    company_ratio: parseFloat(document.getElementById('hf-company-ratio').value) || 0,
    personal_ratio: parseFloat(document.getElementById('hf-personal-ratio').value) || 0,
    status: document.getElementById('hf-status').value,
  };
  await api('POST', `/api/housing-fund/details?${new URLSearchParams(body).toString()}`);
  closeModal();
  hfRefresh();
}

async function hfShowEdit(id) {
  const data = await api('GET', `/api/housing-fund/details/${id}?company_id=${currentCompanyId}`);
  hfEditId = id;
  showModal(`
    <div class="modal-title">编辑公积金缴存记录</div>
    <div class="form-group">
      <label>工号</label>
      <input class="form-input" id="hf-emp-id" value="${hfEscAttr(data.employee_id || '')}" />
    </div>
    <div class="form-group">
      <label>姓名 <span style="color:red">*</span></label>
      <input class="form-input" id="hf-emp-name" value="${hfEscAttr(data.employee_name)}" />
    </div>
    <div class="form-group">
      <label>身份证号</label>
      <input class="form-input" id="hf-id-number" value="${hfEscAttr(data.id_number || '')}" />
    </div>
    <div class="form-group">
      <label>缴存基数</label>
      <input class="form-input" type="number" id="hf-deposit-base" value="${data.deposit_base || 0}" step="0.01" />
    </div>
    <div class="form-row-2">
      <div class="form-group">
        <label>单位缴存比例(%)</label>
        <input class="form-input" type="number" id="hf-company-ratio" value="${data.company_ratio || 0}" step="0.01" />
      </div>
      <div class="form-group">
        <label>个人缴存比例(%)</label>
        <input class="form-input" type="number" id="hf-personal-ratio" value="${data.personal_ratio || 0}" step="0.01" />
      </div>
    </div>
    <div class="form-group">
      <label>状态</label>
      <select class="form-input" id="hf-status">
        <option value="正常" ${data.status === '正常' ? 'selected' : ''}>正常</option>
        <option value="封存" ${data.status === '封存' ? 'selected' : ''}>封存</option>
      </select>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="hfDoEdit()">保存</button>
    </div>
  `);
}

async function hfDoEdit() {
  const name = document.getElementById('hf-emp-name').value.trim();
  if (!name) return alert('请输入姓名');
  const body = new URLSearchParams({
    company_id: currentCompanyId,
    employee_id: document.getElementById('hf-emp-id').value.trim(),
    employee_name: name,
    id_number: document.getElementById('hf-id-number').value.trim(),
    deposit_base: document.getElementById('hf-deposit-base').value,
    company_ratio: document.getElementById('hf-company-ratio').value,
    personal_ratio: document.getElementById('hf-personal-ratio').value,
    status: document.getElementById('hf-status').value,
  });
  await api('PUT', `/api/housing-fund/details/${hfEditId}?${body.toString()}`);
  closeModal();
  hfRefresh();
}

async function hfDelete(id) {
  if (!confirm('确认删除此条记录？')) return;
  await api('DELETE', `/api/housing-fund/details/${id}?company_id=${currentCompanyId}`);
  hfRefresh();
}

// ============ 导入弹窗 ============

function hfShowImport() {
  showModal(`
    <div class="modal-title">导入公积金缴存明细</div>
    <div class="form-group">
      <label>汇缴期间</label>
      <input type="month" class="form-input" id="hf-import-period" value="${hfPeriod || new Date().toISOString().slice(0, 7)}" />
    </div>
    <div class="form-group">
      <label>Excel 文件 (.xlsx/.xls)</label>
      <input type="file" class="form-input" id="hf-import-file" accept=".xlsx,.xls" />
    </div>
    <div style="font-size:12px;color:#888;margin-top:8px;">
      表头要求：工号、姓名、身份证号、缴存基数、单位缴存比例、个人缴存比例、缴存额、单位缴存额、个人缴存额
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="hfDoImport()">导入</button>
    </div>
  `);
}

async function hfDoImport() {
  const file = document.getElementById('hf-import-file').files[0];
  if (!file) return alert('请选择文件');
  const period = document.getElementById('hf-import-period').value;
  if (!period) return alert('请选择汇缴期间');

  const formData = new FormData();
  formData.append('file', file);

  try {
    const result = await api('POST', `/api/housing-fund/import?company_id=${currentCompanyId}&period=${period}`, formData);
    alert(result.message || `成功导入 ${result.imported} 条`);
    closeModal();
    hfRefresh();
  } catch (e) {
    alert('导入失败: ' + (e.message || e));
  }
}
