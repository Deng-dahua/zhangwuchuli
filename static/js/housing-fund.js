// ========== 住房公积金模块 ==========

var hfPeriod = '';
var hfStats = {};
var hfSelectedIds = new Set();
var hfEditId = null;  // 编辑时暂存ID

// 自定义escAttr（escapeHtml已有，但attr需额外转引号）
function hfEscAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

// ============ 期间步进（与顶栏 period-stepper 同款） ============
function stepHfYear(delta) {
    const yearSel = document.getElementById('hf-year');
    if (!yearSel) return;
    const opts = Array.from(yearSel.options).map(o => parseInt(o.value));
    const cur = parseInt(yearSel.value);
    const idx = opts.indexOf(cur);
    const next = idx + delta;
    if (next >= 0 && next < opts.length) yearSel.value = opts[next];
    const monthSel = document.getElementById('hf-month');
    if (monthSel) hfPeriod = yearSel.value + '-' + monthSel.value;
    if (typeof hfRefresh === 'function') hfRefresh();
}

function stepHfMonth(delta) {
    const yearSel = document.getElementById('hf-year');
    const monSel = document.getElementById('hf-month');
    if (!monSel) return;
    let y = parseInt(yearSel?.value || new Date().getFullYear());
    let m = parseInt(monSel.value) + delta;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    const yearOpts = Array.from(yearSel?.options || []).map(o => parseInt(o.value));
    if (yearSel && yearOpts.length > 0 && yearOpts.includes(y)) yearSel.value = y;
    monSel.value = String(m).padStart(2, '0');
    hfPeriod = yearSel.value + '-' + monSel.value;
    if (typeof hfRefresh === 'function') hfRefresh();
}

// ============ 导入弹窗步进（不触发主界面刷新） ============
function stepHfImportYear(delta) {
    const sel = document.getElementById('hf-import-year');
    if (!sel) return;
    const opts = Array.from(sel.options).map(o => parseInt(o.value));
    const cur = parseInt(sel.value);
    const idx = opts.indexOf(cur);
    const next = idx + delta;
    if (next >= 0 && next < opts.length) sel.value = opts[next];
}

function stepHfImportMonth(delta) {
    const yearSel = document.getElementById('hf-import-year');
    const monSel = document.getElementById('hf-import-month');
    if (!monSel) return;
    let y = parseInt(yearSel?.value || new Date().getFullYear());
    let m = parseInt(monSel.value) + delta;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    const yearOpts = Array.from(yearSel?.options || []).map(o => parseInt(o.value));
    if (yearSel && yearOpts.length > 0 && yearOpts.includes(y)) yearSel.value = y;
    monSel.value = String(m).padStart(2, '0');
}

// ============ 查询 / 清除期间 ============
function hfQuery() {
  if (typeof hfRefresh === 'function') hfRefresh();
}

function hfClearPeriod() {
  const yearSel = document.getElementById('hf-year');
  const monthSel = document.getElementById('hf-month');
  if (!yearSel || !monthSel) return;
  const now = new Date();
  const cy = now.getFullYear();
  const cm = String(now.getMonth() + 1).padStart(2, '0');
  const yearOpts = Array.from(yearSel.options).map(o => parseInt(o.value));
  if (yearOpts.includes(cy)) yearSel.value = cy;
  monthSel.value = cm;
  hfPeriod = yearSel.value + '-' + monthSel.value;
  if (typeof hfRefresh === 'function') hfRefresh();
}

// ============ 导入文件选择处理 ============
function hfHandleFileSelected(input) {
    const zone = document.getElementById('hf-upload-zone');
    const text = document.getElementById('hf-upload-text');
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (zone) zone.classList.add('has-file');
        if (text) text.textContent = file.name;
    } else {
        if (zone) zone.classList.remove('has-file');
        if (text) text.textContent = '点击或拖拽上传 Excel 文件';
    }
}

async function renderHousingFund(container) {
  // 默认期间：与顶栏 currentPeriod 一致
  let defYear = new Date().getFullYear();
  let defMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  if (typeof currentPeriod !== 'undefined' && currentPeriod && currentPeriod.includes('-')) {
    const parts = currentPeriod.split('-');
    defYear = parseInt(parts[0]);
    defMonth = parts[1];
  }
  const hfDefPeriod = defYear + '-' + defMonth;

  let yearOpts = '';
  for (let y = defYear - 5; y <= defYear + 1; y++) {
    yearOpts += '<option value="' + y + '"' + (y === defYear ? ' selected' : '') + '>' + y + '年</option>';
  }

  container.innerHTML = `
    <div class="module-page">
      <div class="stats-row" id="hf-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;"></div>
      <div class="toolbar">
        <div class="toolbar-left" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div class="period-selector-bar" style="display:inline-flex">
            <div class="period-stepper">
              <select id="hf-year" class="period-selector-year">${yearOpts}</select>
              <div class="stepper-arrows">
                <button class="stepper-btn stepper-up" type="button" onclick="stepHfYear(1)">▲</button>
                <button class="stepper-btn stepper-down" type="button" onclick="stepHfYear(-1)">▼</button>
              </div>
            </div>
            <div class="period-stepper">
              <select id="hf-month" class="period-selector-month">
                <option value="01"${defMonth==='01'?' selected':''}>01月</option>
                <option value="02"${defMonth==='02'?' selected':''}>02月</option>
                <option value="03"${defMonth==='03'?' selected':''}>03月</option>
                <option value="04"${defMonth==='04'?' selected':''}>04月</option>
                <option value="05"${defMonth==='05'?' selected':''}>05月</option>
                <option value="06"${defMonth==='06'?' selected':''}>06月</option>
                <option value="07"${defMonth==='07'?' selected':''}>07月</option>
                <option value="08"${defMonth==='08'?' selected':''}>08月</option>
                <option value="09"${defMonth==='09'?' selected':''}>09月</option>
                <option value="10"${defMonth==='10'?' selected':''}>10月</option>
                <option value="11"${defMonth==='11'?' selected':''}>11月</option>
                <option value="12"${defMonth==='12'?' selected':''}>12月</option>
              </select>
              <div class="stepper-arrows">
                <button class="stepper-btn stepper-up" type="button" onclick="stepHfMonth(1)">▲</button>
                <button class="stepper-btn stepper-down" type="button" onclick="stepHfMonth(-1)">▼</button>
              </div>
            </div>
          </div>
          <button class="btn btn-outline" onclick="hfQuery()">查询</button>
          <button class="btn btn-outline" onclick="hfClearPeriod()">清除</button>
          <button class="btn btn-primary" onclick="hfShowCreate()">新增住房公积金</button>
          <button class="btn btn-outline" onclick="hfShowImport()">导入文件</button>
          <button class="btn btn-info" onclick="generateHfVouchers()" style="background:#7c3aed;color:#fff">生成凭证</button>
          <button class="btn btn-danger" onclick="hfBatchDelete()" id="hf-batch-del-btn">批量删除</button>
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
  // 设置默认期间并加载数据
  hfPeriod = hfDefPeriod;
  const yearSel = document.getElementById('hf-year');
  const monthSel = document.getElementById('hf-month');
  if (yearSel) yearSel.value = defYear;
  if (monthSel) monthSel.value = defMonth;
  // 绑定期间变化事件
  if (yearSel) yearSel.addEventListener('change', () => { hfPeriod = yearSel.value + '-' + monthSel.value; hfRefresh(); });
  if (monthSel) monthSel.addEventListener('change', () => { hfPeriod = yearSel.value + '-' + monthSel.value; hfRefresh(); });
  hfRefresh();
}

async function hfRefresh() {
  const yearSel = document.getElementById('hf-year');
  const monthSel = document.getElementById('hf-month');
  if (yearSel && monthSel) hfPeriod = yearSel.value + '-' + monthSel.value;
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
  if (btn) btn.textContent = hfSelectedIds.size > 0 ? `批量删除(${hfSelectedIds.size})` : '批量删除';
}

async function hfBatchDelete() {
  if (hfSelectedIds.size === 0) return alert('请先勾选要删除的记录');
  if (!confirm(`确认删除选中的 ${hfSelectedIds.size} 条记录？`)) return;
  await api('POST', `/api/housing-fund/details/batch-delete?company_id=${currentCompanyId}`, [...hfSelectedIds]);
  hfRefresh();
}

// ============ 新增/编辑弹窗 ============

function stepHfModalYear(delta) {
  const sel = document.getElementById('hf-modal-year');
  if (!sel) return;
  const opts = Array.from(sel.options).map(o => parseInt(o.value));
  const cur = parseInt(sel.value);
  const idx = opts.indexOf(cur);
  const next = idx + delta;
  if (next >= 0 && next < opts.length) sel.value = opts[next];
}

function stepHfModalMonth(delta) {
  const yearSel = document.getElementById('hf-modal-year');
  const monSel = document.getElementById('hf-modal-month');
  if (!monSel) return;
  let y = parseInt(yearSel?.value || new Date().getFullYear());
  let m = parseInt(monSel.value) + delta;
  if (m > 12) { m = 1; y++; }
  if (m < 1) { m = 12; y--; }
  const yearOpts = Array.from(yearSel?.options || []).map(o => parseInt(o.value));
  if (yearSel && yearOpts.length > 0 && yearOpts.includes(y)) yearSel.value = y;
  monSel.value = String(m).padStart(2, '0');
}

function hfShowCreate() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'hf-modal';
  // 默认期间与顶栏一致
  let defYear = new Date().getFullYear();
  let defMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  if (typeof currentPeriod !== 'undefined' && currentPeriod && currentPeriod.includes('-')) {
    const parts = currentPeriod.split('-');
    defYear = parseInt(parts[0]);
    defMonth = parts[1];
  }
  let yearOpts = '';
  for (let y = defYear - 5; y <= defYear + 1; y++) {
    yearOpts += '<option value="' + y + '"' + (y === defYear ? ' selected' : '') + '>' + y + '年</option>';
  }
  modal.innerHTML = `
    <div class="modal" style="max-width:720px;max-height:90vh;overflow-y:auto">
      <div class="modal-header"><h3>新增住房公积金</h3><button class="modal-close" onclick="closeModal('hf-modal')">&times;</button></div>
      <div class="modal-body salary-form">
        <div class="form-grid-2">
          <div class="form-row">
            <label>期间</label>
            <div class="period-selector-bar" style="display:inline-flex">
              <div class="period-stepper">
                <select id="hf-modal-year" class="period-selector-year">${yearOpts}</select>
                <div class="stepper-arrows">
                  <button class="stepper-btn stepper-up" type="button" onclick="stepHfModalYear(1)">▲</button>
                  <button class="stepper-btn stepper-down" type="button" onclick="stepHfModalYear(-1)">▼</button>
                </div>
              </div>
              <div class="period-stepper">
                <select id="hf-modal-month" class="period-selector-month">
                  <option value="01"${defMonth==='01'?' selected':''}>01月</option>
                  <option value="02"${defMonth==='02'?' selected':''}>02月</option>
                  <option value="03"${defMonth==='03'?' selected':''}>03月</option>
                  <option value="04"${defMonth==='04'?' selected':''}>04月</option>
                  <option value="05"${defMonth==='05'?' selected':''}>05月</option>
                  <option value="06"${defMonth==='06'?' selected':''}>06月</option>
                  <option value="07"${defMonth==='07'?' selected':''}>07月</option>
                  <option value="08"${defMonth==='08'?' selected':''}>08月</option>
                  <option value="09"${defMonth==='09'?' selected':''}>09月</option>
                  <option value="10"${defMonth==='10'?' selected':''}>10月</option>
                  <option value="11"${defMonth==='11'?' selected':''}>11月</option>
                  <option value="12"${defMonth==='12'?' selected':''}>12月</option>
                </select>
                <div class="stepper-arrows">
                  <button class="stepper-btn stepper-up" type="button" onclick="stepHfModalMonth(1)">▲</button>
                  <button class="stepper-btn stepper-down" type="button" onclick="stepHfModalMonth(-1)">▼</button>
                </div>
              </div>
            </div>
          </div>
          <div class="form-row"><label>工号</label><input class="form-input" id="hf-emp-id" placeholder="工号（选填）" /></div>
          <div class="form-row"><label>姓名 <span style="color:#ef4444">*</span></label><input class="form-input" id="hf-emp-name" placeholder="姓名" /></div>
          <div class="form-row"><label>身份证号</label><input class="form-input" id="hf-id-number" placeholder="身份证号" /></div>
        </div>
        <div class="section-title">缴存信息</div>
        <div class="form-grid-2">
          <div class="form-row"><label>缴存基数</label><input class="form-input" type="number" id="hf-deposit-base" placeholder="0" step="0.01" /></div>
          <div class="form-row"><label>状态</label>
            <select class="form-input" id="hf-status">
              <option value="正常" selected>正常</option>
              <option value="封存">封存</option>
            </select>
          </div>
          <div class="form-row"><label>单位缴存比例(%)</label><input class="form-input" type="number" id="hf-company-ratio" placeholder="0" step="0.01" /></div>
          <div class="form-row"><label>个人缴存比例(%)</label><input class="form-input" type="number" id="hf-personal-ratio" placeholder="0" step="0.01" /></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('hf-modal')">取消</button>
        <button class="btn btn-primary" onclick="hfDoCreate()">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

async function hfDoCreate() {
  const name = document.getElementById('hf-emp-name').value.trim();
  if (!name) return alert('请输入姓名');
  const year = document.getElementById('hf-modal-year')?.value || new Date().getFullYear();
  const month = document.getElementById('hf-modal-month')?.value || String(new Date().getMonth() + 1).padStart(2, '0');
  const period = year + '-' + month;
  const body = {
    company_id: currentCompanyId,
    period: period,
    employee_id: document.getElementById('hf-emp-id').value.trim(),
    employee_name: name,
    id_number: document.getElementById('hf-id-number').value.trim(),
    deposit_base: parseFloat(document.getElementById('hf-deposit-base').value) || 0,
    company_ratio: parseFloat(document.getElementById('hf-company-ratio').value) || 0,
    personal_ratio: parseFloat(document.getElementById('hf-personal-ratio').value) || 0,
    status: document.getElementById('hf-status').value,
  };
  await api('POST', `/api/housing-fund/details?${new URLSearchParams(body).toString()}`);
  closeModal('hf-modal');
  hfRefresh();
}

async function hfShowEdit(id) {
  const data = await api('GET', `/api/housing-fund/details/${id}?company_id=${currentCompanyId}`);
  hfEditId = id;

  // 解析已有期间（优先用 data.period，否则用 currentPeriod）
  let defYear = new Date().getFullYear();
  let defMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  const existPeriod = data.period || (typeof currentPeriod !== 'undefined' && currentPeriod) || '';
  if (existPeriod && existPeriod.includes('-')) {
    const parts = existPeriod.split('-');
    defYear = parseInt(parts[0]);
    defMonth = parts[1];
  } else if (typeof currentPeriod !== 'undefined' && currentPeriod && currentPeriod.includes('-')) {
    const parts = currentPeriod.split('-');
    defYear = parseInt(parts[0]);
    defMonth = parts[1];
  }
  let yearOpts = '';
  for (let y = defYear - 5; y <= defYear + 1; y++) {
    yearOpts += '<option value="' + y + '"' + (y === defYear ? ' selected' : '') + '>' + y + '年</option>';
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'hf-modal-edit';
  modal.innerHTML = `
    <div class="modal" style="max-width:720px;max-height:90vh;overflow-y:auto">
      <div class="modal-header"><h3>编辑住房公积金</h3><button class="modal-close" onclick="closeModal('hf-modal-edit')">&times;</button></div>
      <div class="modal-body salary-form">
        <div class="form-grid-2">
          <div class="form-row">
            <label>期间</label>
            <div class="period-selector-bar" style="display:inline-flex">
              <div class="period-stepper">
                <select id="hf-modal-year" class="period-selector-year">${yearOpts}</select>
                <div class="stepper-arrows">
                  <button class="stepper-btn stepper-up" type="button" onclick="stepHfModalYear(1)">▲</button>
                  <button class="stepper-btn stepper-down" type="button" onclick="stepHfModalYear(-1)">▼</button>
                </div>
              </div>
              <div class="period-stepper">
                <select id="hf-modal-month" class="period-selector-month">
                  <option value="01"${defMonth==='01'?' selected':''}>01月</option>
                  <option value="02"${defMonth==='02'?' selected':''}>02月</option>
                  <option value="03"${defMonth==='03'?' selected':''}>03月</option>
                  <option value="04"${defMonth==='04'?' selected':''}>04月</option>
                  <option value="05"${defMonth==='05'?' selected':''}>05月</option>
                  <option value="06"${defMonth==='06'?' selected':''}>06月</option>
                  <option value="07"${defMonth==='07'?' selected':''}>07月</option>
                  <option value="08"${defMonth==='08'?' selected':''}>08月</option>
                  <option value="09"${defMonth==='09'?' selected':''}>09月</option>
                  <option value="10"${defMonth==='10'?' selected':''}>10月</option>
                  <option value="11"${defMonth==='11'?' selected':''}>11月</option>
                  <option value="12"${defMonth==='12'?' selected':''}>12月</option>
                </select>
                <div class="stepper-arrows">
                  <button class="stepper-btn stepper-up" type="button" onclick="stepHfModalMonth(1)">▲</button>
                  <button class="stepper-btn stepper-down" type="button" onclick="stepHfModalMonth(-1)">▼</button>
                </div>
              </div>
            </div>
          </div>
          <div class="form-row"><label>工号</label><input class="form-input" id="hf-emp-id" value="${hfEscAttr(data.employee_id || '')}" /></div>
          <div class="form-row"><label>姓名 <span style="color:#ef4444">*</span></label><input class="form-input" id="hf-emp-name" value="${hfEscAttr(data.employee_name)}" /></div>
          <div class="form-row"><label>身份证号</label><input class="form-input" id="hf-id-number" value="${hfEscAttr(data.id_number || '')}" /></div>
        </div>
        <div class="section-title">缴存信息</div>
        <div class="form-grid-2">
          <div class="form-row"><label>缴存基数</label><input class="form-input" type="number" id="hf-deposit-base" value="${data.deposit_base || 0}" step="0.01" /></div>
          <div class="form-row"><label>状态</label>
            <select class="form-input" id="hf-status">
              <option value="正常" ${data.status === '正常' ? 'selected' : ''}>正常</option>
              <option value="封存" ${data.status === '封存' ? 'selected' : ''}>封存</option>
            </select>
          </div>
          <div class="form-row"><label>单位缴存比例(%)</label><input class="form-input" type="number" id="hf-company-ratio" value="${data.company_ratio || 0}" step="0.01" /></div>
          <div class="form-row"><label>个人缴存比例(%)</label><input class="form-input" type="number" id="hf-personal-ratio" value="${data.personal_ratio || 0}" step="0.01" /></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('hf-modal-edit')">取消</button>
        <button class="btn btn-primary" onclick="hfDoEdit()">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

async function hfDoEdit() {
  const name = document.getElementById('hf-emp-name').value.trim();
  if (!name) return alert('请输入姓名');
  const year = document.getElementById('hf-modal-year')?.value || new Date().getFullYear();
  const month = document.getElementById('hf-modal-month')?.value || String(new Date().getMonth() + 1).padStart(2, '0');
  const period = year + '-' + month;
  const body = new URLSearchParams({
    company_id: currentCompanyId,
    period: period,
    employee_id: document.getElementById('hf-emp-id').value.trim(),
    employee_name: name,
    id_number: document.getElementById('hf-id-number').value.trim(),
    deposit_base: document.getElementById('hf-deposit-base').value,
    company_ratio: document.getElementById('hf-company-ratio').value,
    personal_ratio: document.getElementById('hf-personal-ratio').value,
    status: document.getElementById('hf-status').value,
  });
  await api('PUT', `/api/housing-fund/details/${hfEditId}?${body.toString()}`);
  closeModal('hf-modal-edit');
  hfRefresh();
}

async function hfDelete(id) {
  if (!confirm('确认删除此条记录？')) return;
  await api('DELETE', `/api/housing-fund/details/${id}?company_id=${currentCompanyId}`);
  hfRefresh();
}

// ============ 导入弹窗 ============

function hfShowImport() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'hf-import-modal';

  // 默认期间与顶栏一致
  let defYear = new Date().getFullYear();
  let defMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  if (typeof currentPeriod !== 'undefined' && currentPeriod && currentPeriod.includes('-')) {
    const parts = currentPeriod.split('-');
    defYear = parseInt(parts[0]);
    defMonth = parts[1];
  }
  let yearOpts = '';
  for (let y = defYear - 5; y <= defYear + 1; y++) {
    yearOpts += '<option value="' + y + '"' + (y === defYear ? ' selected' : '') + '>' + y + '年</option>';
  }

  modal.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-header"><h3>导入住房公积金</h3><button class="modal-close" onclick="closeModal('hf-import-modal')">&times;</button></div>
      <div class="modal-body salary-form">
        <div style="margin-top:16px;text-align:center">
          <label style="font-size:13px;font-weight:600;color:var(--gray-700);display:block;margin-bottom:6px">所属期间</label>
          <div class="period-selector-bar" style="display:inline-flex">
            <div class="period-stepper">
              <select id="hf-import-year" class="period-selector-year">${yearOpts}</select>
              <div class="stepper-arrows">
                <button class="stepper-btn stepper-up" type="button" onclick="stepHfImportYear(1)">▲</button>
                <button class="stepper-btn stepper-down" type="button" onclick="stepHfImportYear(-1)">▼</button>
              </div>
            </div>
            <div class="period-stepper">
              <select id="hf-import-month" class="period-selector-month">
                <option value="01"${defMonth==='01'?' selected':''}>01月</option>
                <option value="02"${defMonth==='02'?' selected':''}>02月</option>
                <option value="03"${defMonth==='03'?' selected':''}>03月</option>
                <option value="04"${defMonth==='04'?' selected':''}>04月</option>
                <option value="05"${defMonth==='05'?' selected':''}>05月</option>
                <option value="06"${defMonth==='06'?' selected':''}>06月</option>
                <option value="07"${defMonth==='07'?' selected':''}>07月</option>
                <option value="08"${defMonth==='08'?' selected':''}>08月</option>
                <option value="09"${defMonth==='09'?' selected':''}>09月</option>
                <option value="10"${defMonth==='10'?' selected':''}>10月</option>
                <option value="11"${defMonth==='11'?' selected':''}>11月</option>
                <option value="12"${defMonth==='12'?' selected':''}>12月</option>
              </select>
              <div class="stepper-arrows">
                <button class="stepper-btn stepper-up" type="button" onclick="stepHfImportMonth(1)">▲</button>
                <button class="stepper-btn stepper-down" type="button" onclick="stepHfImportMonth(-1)">▼</button>
              </div>
            </div>
          </div>
        </div>
        <div class="form-row" style="margin-top:24px;flex-direction:column;align-items:stretch;gap:6px">
          <label style="width:auto;text-align:left">选择文件</label>
          <div class="file-upload-zone" id="hf-upload-zone" onclick="document.getElementById('hf-import-file').click()">
            <div class="upload-icon">&#128206;</div>
            <div class="upload-text" id="hf-upload-text">点击或拖拽上传 Excel 文件</div>
            <div class="upload-hint">支持 .xls、.xlsx 格式</div>
          </div>
          <input type="file" id="hf-import-file" accept=".xls,.xlsx" style="display:none" onchange="hfHandleFileSelected(this)">
        </div>
        <div style="font-size:12px;color:#888;margin-top:8px;">
          表头要求：工号、姓名、身份证号、缴存基数、单位缴存比例、个人缴存比例、缴存额、单位缴存额、个人缴存额
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('hf-import-modal')">取消</button>
        <button class="btn btn-primary" onclick="hfDoImport()">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

async function hfDoImport() {
  const file = document.getElementById('hf-import-file').files[0];
  if (!file) return alert('请选择文件');
  const year = document.getElementById('hf-import-year')?.value || new Date().getFullYear();
  const month = document.getElementById('hf-import-month')?.value || String(new Date().getMonth() + 1).padStart(2, '0');
  const period = year + '-' + month;
  if (!period) return alert('请选择汇缴期间');

  const formData = new FormData();
  formData.append('file', file);

  try {
    const result = await api('POST', `/api/housing-fund/import?company_id=${currentCompanyId}&period=${period}`, formData);
    closeModal('hf-import-modal');
    hfRefresh();
    toast(result.message || `成功导入 ${result.imported || 0} 条记录`, 'success');
  } catch (e) {
    toast('导入失败: ' + (e.message || e), 'error');
  }
}

// ============ 生成凭证 ============

async function generateHfVouchers() {
    const period = hfPeriod;
    if (!period) {
        alert('请先选择期间');
        return;
    }
    if (!confirm(`确认生成 ${period} 的住房公积金凭证？（将生成计提+缴纳2组凭证）`)) return;
    try {
        // 1. 生成计提凭证
        const result1 = await api('POST', `/api/housing-fund/generate-accrual?company_id=${currentCompanyId}&period=${period}`);
        // 2. 匹配缴纳凭证
        const result2 = await api('POST', `/api/housing-fund/match-payment?company_id=${currentCompanyId}`);
        alert(`生成成功！\n计提凭证：${result1.generated || 0} 张\n缴纳凭证：${result2.generated || 0} 张`);
        // 刷新公积金页面
        hfRefresh();
        // 刷新序时账（如果用户正在看）
        if (typeof loadJePage === 'function') loadJePage(1);
    } catch (e) {
        alert('生成失败：' + e.message);
    }
}
