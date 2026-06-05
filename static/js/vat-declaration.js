// ==================== 增值税申报页面 ====================
let vatDeclarations = [];
let vatSelectedId = null;
let vatActiveTab = 'main'; // main|schedule1|schedule2|schedule3|schedule4|schedule5|reduction
let vatFilterPeriod = '';

// ==================== 主渲染 ====================
async function renderVATDeclaration(container) {
  const el = container || document.getElementById('page-vat-declaration') || document.getElementById('content-area');
  el.innerHTML = `
    <div id="vat-stats-row" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px"></div>
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="btn btn-primary" onclick="showVATCreateModal()">＋ 新建申报</button>
      </div>
      <div class="toolbar-right">
        <input type="month" class="form-control" id="vat-filter-period" value="${vatFilterPeriod}" onchange="vatFilterPeriod=this.value;renderVATDeclaration()" style="width:160px" placeholder="筛选期间">
      </div>
    </div>
    <div id="vat-list-table"></div>

    <!-- 新建/编辑模态框 -->
    <div id="vat-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)closeVATModal()">
      <div class="modal modal-lg" id="vat-modal-inner"></div>
    </div>

    <!-- 查看详情模态框（7张附表） -->
    <div id="vat-detail-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)closeVATDetailModal()">
      <div class="modal modal-lg" id="vat-detail-inner" style="max-width:1100px"></div>
    </div>
  `;
  await loadVATDeclarationList();
}

// ==================== 列表 ====================
async function loadVATDeclarationList() {
  try {
    let url = '/api/vat/declarations';
    if (vatFilterPeriod) url += '?period=' + encodeURIComponent(vatFilterPeriod);
    vatDeclarations = await api(url);
  } catch (e) {
    vatDeclarations = [];
    handleError(e, '加载申报表');
  }
  renderVATStats();
  renderVATTable();
}

function renderVATStats() {
  const total = vatDeclarations.length;
  const submitted = vatDeclarations.filter(d => d.status === '已申报').length;
  let totalTax = 0, totalSurcharge = 0;
  vatDeclarations.forEach(d => {
    // 从 vat.py 返回的 list 不包含 tax 数据，只做统计
  });
  const el = document.getElementById('vat-stats-row');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">申报表总数</div>
      <div class="stat-value">${total}</div>
      <div class="stat-sub">已申报 ${submitted} 份</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">最新申报期间</div>
      <div class="stat-value">${vatDeclarations.length > 0 ? vatDeclarations[0].period : '-'}</div>
      <div class="stat-sub">按时间倒序</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">草稿</div>
      <div class="stat-value" style="color:#f59e0b">${vatDeclarations.filter(d => d.status === '草稿').length}</div>
      <div class="stat-sub">待完成</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">已缴税</div>
      <div class="stat-value" style="color:#10b981">${vatDeclarations.filter(d => d.status === '已缴税').length}</div>
      <div class="stat-sub">已完成</div>
    </div>
  `;
}

function renderVATTable() {
  const el = document.getElementById('vat-list-table');
  if (!el) return;

  let html = '<div class="table-wrap"><table class="data-table"><thead><tr>';
  html += '<th>税款所属期</th><th>纳税人名称</th><th>小规模纳税人</th><th>六税两费减征</th><th>状态</th><th>填报日期</th><th>申报日期</th><th>操作</th>';
  html += '</tr></thead><tbody>';

  if (vatDeclarations.length === 0) {
    html += '<tr><td colspan="8" style="text-align:center;padding:40px;color:#9ca3af">暂无申报表，点击「＋ 新建申报」创建</td></tr>';
  } else {
    vatDeclarations.forEach(d => {
      const statusBadge = {
        '草稿': '<span class="badge badge-draft">草稿</span>',
        '已申报': '<span class="badge badge-audited">已申报</span>',
        '已缴税': '<span class="badge badge-posted">已缴税</span>'
      }[d.status] || d.status;

      html += '<tr>';
      html += '<td><strong>' + escHtml(d.period) + '</strong></td>';
      html += '<td>' + escHtml(d.taxpayer_name || '') + '</td>';
      html += '<td>' + (d.micro_enterprise ? '✅ 是' : '否') + '</td>';
      html += '<td>' + (d.six_tax_reduction ? '✅ 是' : '否') + '</td>';
      html += '<td>' + statusBadge + '</td>';
      html += '<td>' + (d.fill_date || '-') + '</td>';
      html += '<td>' + (d.submitted_at ? new Date(d.submitted_at).toLocaleDateString('zh-CN') : '-') + '</td>';
      html += '<td class="col-action">';
      html += '<button class="btn btn-sm btn-outline" onclick="openVATDetail(' + d.id + ')">📋 查看附表</button> ';
      html += '<button class="btn btn-sm btn-danger" onclick="deleteVATDeclaration(' + d.id + ',\'' + escJs(d.period) + '\')">🗑</button>';
      html += '</td></tr>';
    });
  }
  html += '</tbody></table></div>';
  el.innerHTML = html;
}

// ==================== 新建申报 ====================
function showVATCreateModal() {
  document.getElementById('vat-modal').style.display = 'flex';
  document.getElementById('vat-modal-inner').innerHTML = `
    <div class="modal-title">＋ 新建增值税申报表</div>
    <div class="form-grid">
      <div class="form-group">
        <label>税款所属期 *</label>
        <input type="month" class="form-control" id="vat-new-period" required>
      </div>
      <div class="form-group">
        <label>行业</label>
        <input type="text" class="form-control" id="vat-new-industry" placeholder="如：商业、服务业">
      </div>
      <div class="form-group">
        <label>登记注册类型</label>
        <input type="text" class="form-control" id="vat-new-register-type" placeholder="如：有限责任公司">
      </div>
      <div class="form-group">
        <label>银行账户</label>
        <input type="text" class="form-control" id="vat-new-bank-account" placeholder="开户行及账号">
      </div>
      <div class="form-group">
        <label>联系电话</label>
        <input type="text" class="form-control" id="vat-new-phone" placeholder="电话号码">
      </div>
    </div>
    <div style="margin-top:16px;display:flex;gap:24px;align-items:center">
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="vat-new-micro" checked> 小规模纳税人
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="vat-new-six-tax" checked> 享受六税两费减征
      </label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeVATModal()">取消</button>
      <button class="btn btn-primary" onclick="createVATDeclaration()">✅ 创建并自动计算</button>
    </div>
  `;
}

function closeVATModal() {
  document.getElementById('vat-modal').style.display = 'none';
}

async function createVATDeclaration() {
  const period = document.getElementById('vat-new-period').value;
  if (!period) { toast('请选择税款所属期', 'error'); return; }
  try {
    const body = {
      period: period,
      industry: document.getElementById('vat-new-industry').value,
      register_type: document.getElementById('vat-new-register-type').value,
      bank_account: document.getElementById('vat-new-bank-account').value,
      phone: document.getElementById('vat-new-phone').value,
      micro_enterprise: document.getElementById('vat-new-micro').checked,
      six_tax_reduction: document.getElementById('vat-new-six-tax').checked
    };
    const result = await api('/api/vat/declarations', { method: 'POST', body: JSON.stringify(body) });
    toast(result.msg || '创建成功', 'success');
    closeVATModal();
    await loadVATDeclarationList();
  } catch (e) {
    handleError(e, '创建申报表');
  }
}

// ==================== 查看7张附表 ====================
async function openVATDetail(id) {
  vatSelectedId = id;
  vatActiveTab = 'main';
  try {
    const data = await api('/api/vat/declarations/' + id);
    window._vatDetailData = data;
    renderVATDetailModal(data);
  } catch (e) {
    handleError(e, '加载申报表');
  }
}

function renderVATDetailModal(data) {
  document.getElementById('vat-detail-modal').style.display = 'flex';
  const el = document.getElementById('vat-detail-inner');

  let headerHtml = '<div class="modal-title">📋 ' + escHtml(data.period) + ' 增值税申报表 — ' + escHtml(data.taxpayer_name || '') + '</div>';
  headerHtml += '<div style="display:flex;gap:12px;margin-bottom:12px;font-size:13px;color:#6b7280">';
  headerHtml += '<span>纳税人识别号：' + escHtml(data.taxpayer_id || '-') + '</span>';
  headerHtml += '<span>行业：' + escHtml(data.industry || '-') + '</span>';
  headerHtml += '<span>状态：' + getStatusBadge(data.status) + '</span>';
  headerHtml += '<span>小规模：' + (data.micro_enterprise ? '是' : '否') + '</span>';
  headerHtml += '<span>六税两费减征：' + (data.six_tax_reduction ? '是' : '否') + '</span>';
  headerHtml += '</div>';

  // Tabs
  const tabs = [
    ['main', '增值税主表'],
    ['schedule1', '附表一（销项）'],
    ['schedule2', '附表二（进项）'],
    ['schedule3', '附表三（扣除）'],
    ['schedule4', '附表四（抵减）'],
    ['schedule5', '附表五（附加税费）'],
    ['reduction', '减免税明细']
  ];
  headerHtml += '<div class="tab-btn-group" style="margin-bottom:16px">';
  tabs.forEach(([t, label]) => {
    headerHtml += '<button class="tab-btn ' + (vatActiveTab === t ? 'active' : '') + '" onclick="switchVATTab(\'' + t + '\')">' + label + '</button>';
  });
  headerHtml += '</div>';

  headerHtml += '<div id="vat-tab-content" style="max-height:55vh;overflow:auto"></div>';

  headerHtml += '<div class="modal-footer">';
  headerHtml += '<button class="btn btn-outline" onclick="recomputeVAT(' + data.id + ')">🔄 重新计算</button>';
  headerHtml += '<button class="btn btn-outline" onclick="closeVATDetailModal()">关闭</button>';
  headerHtml += '</div>';

  el.innerHTML = headerHtml;
  renderVATTabContent(data);
}

function switchVATTab(tab) {
  vatActiveTab = tab;
  // update tab buttons
  document.querySelectorAll('#vat-detail-inner .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.trim().startsWith(getTabLabel(tab)));
  });
  renderVATTabContent(window._vatDetailData);
}

function getTabLabel(tab) {
  const map = {
    'main': '增值税主表', 'schedule1': '附表一', 'schedule2': '附表二',
    'schedule3': '附表三', 'schedule4': '附表四', 'schedule5': '附表五', 'reduction': '减免税'
  };
  return map[tab] || '';
}

function renderVATTabContent(data) {
  const el = document.getElementById('vat-tab-content');
  if (!el) return;

  switch (vatActiveTab) {
    case 'main': el.innerHTML = renderFormMain(data.form_main || {}); break;
    case 'schedule1': el.innerHTML = renderFormSales(data.form_sales || {}); break;
    case 'schedule2': el.innerHTML = renderFormInput(data.form_input || {}); break;
    case 'schedule3': el.innerHTML = renderFormDeduction(data.form_deduction || {}); break;
    case 'schedule4': el.innerHTML = renderFormCredit(data.form_credit || {}); break;
    case 'schedule5': el.innerHTML = renderFormSurcharge(data.form_surcharge || {}, data); break;
    case 'reduction': el.innerHTML = renderFormReduction(data.form_reduction || {}, data); break;
  }
}

function closeVATDetailModal() {
  document.getElementById('vat-detail-modal').style.display = 'none';
  vatSelectedId = null;
}

async function recomputeVAT(id) {
  try {
    const result = await api('/api/vat/declarations/' + id + '/recompute', { method: 'POST' });
    toast(result.msg || '重新计算完成', 'success');
    // 重新加载
    const data = await api('/api/vat/declarations/' + id);
    window._vatDetailData = data;
    renderVATTabContent(data);
  } catch (e) {
    handleError(e, '重新计算');
  }
}

// ==================== 删除 ====================
async function deleteVATDeclaration(id, period) {
  if (!confirm('确认删除 ' + period + ' 的申报表？此操作不可恢复。')) return;
  try {
    await api('/api/vat/declarations/' + id, { method: 'DELETE' });
    toast('删除成功', 'success');
    await loadVATDeclarationList();
  } catch (e) {
    handleError(e, '删除申报表');
  }
}

// ==================== 各附表渲染 ====================

function renderFormMain(f) {
  let h = '<div class="card"><div class="card-title">📊 增值税及附加税费申报表（主表）</div>';
  h += '<table class="data-table">';
  h += '<tr><td width="60">1</td><td>（一）按适用税率计税销售额</td><td class="num">' + fmt(f.row1_sales) + '</td></tr>';
  h += '<tr><td>11</td><td>销项税额</td><td class="num" style="font-weight:700;font-size:15px">' + fmt(f.row11_output_tax) + '</td></tr>';
  h += '<tr><td>12</td><td>进项税额</td><td class="num" style="font-weight:700;font-size:15px">' + fmt(f.row12_input_tax) + '</td></tr>';
  h += '<tr style="background:#fef3c7"><td>19</td><td><strong>应纳税额</strong></td><td class="num" style="font-weight:700;font-size:18px;color:#d97706">' + fmt(f.row19_tax_payable) + '</td></tr>';
  h += '</table></div>';

  h += '<div class="card" style="margin-top:12px"><div class="card-title">💰 附加税费</div>';
  h += '<table class="data-table">';
  h += '<tr><td>城市维护建设税</td><td class="num">' + fmt(f.city_maintenance_tax) + '</td></tr>';
  h += '<tr><td>教育费附加</td><td class="num">' + fmt(f.education_surcharge) + '</td></tr>';
  h += '<tr><td>地方教育附加</td><td class="num">' + fmt(f.local_education_surcharge) + '</td></tr>';
  h += '<tr style="background:#ecfdf5"><td><strong>附加税费合计</strong></td><td class="num" style="font-weight:700;font-size:16px;color:#059669">' + fmt(f.total_surcharge) + '</td></tr>';
  h += '</table></div>';
  return h;
}

function renderFormSales(f) {
  let h = '<div class="card"><div class="card-title">📤 附列资料（一）— 销售明细</div>';
  h += '<table class="data-table"><thead><tr>';
  h += '<th>税率</th><th class="num">销售额</th><th class="num">销项税额</th>';
  h += '</tr></thead><tbody>';
  h += '<tr><td>13% 税率</td><td class="num">' + fmt(f.rate_13_sales) + '</td><td class="num">' + fmt(f.rate_13_tax) + '</td></tr>';
  h += '<tr><td>6% 税率</td><td class="num">' + fmt(f.rate_6_sales) + '</td><td class="num">' + fmt(f.rate_6_tax) + '</td></tr>';
  h += '<tr style="background:#f0f9ff"><td><strong>合计</strong></td><td class="num" style="font-weight:700">' + fmt(f.total_sales) + '</td><td class="num" style="font-weight:700">' + fmt(f.total_output_tax) + '</td></tr>';
  h += '</tbody></table></div>';
  return h;
}

function renderFormInput(f) {
  let h = '<div class="card"><div class="card-title">📥 附列资料（二）— 进项明细</div>';
  h += '<table class="data-table"><thead><tr>';
  h += '<th>项目</th><th class="num">金额</th>';
  h += '</tr></thead><tbody>';
  h += '<tr><td>已认证发票数量</td><td class="num">' + (f.certified_count || 0) + ' 张</td></tr>';
  h += '<tr><td>已认证价税合计</td><td class="num">' + fmt(f.certified_amount) + '</td></tr>';
  h += '<tr><td>已认证税额</td><td class="num" style="font-weight:700;font-size:15px">' + fmt(f.certified_tax) + '</td></tr>';
  h += '<tr style="background:#f0f9ff"><td><strong>合计可抵扣税额</strong></td><td class="num" style="font-weight:700;font-size:16px;color:#1a56db">' + fmt(f.total_deductible) + '</td></tr>';
  h += '</tbody></table></div>';
  return h;
}

function renderFormDeduction(f) {
  let h = '<div class="card"><div class="card-title">📐 附列资料（三）— 服务、不动产和无形资产扣除项目</div>';
  h += '<table class="data-table"><thead><tr>';
  h += '<th>项目</th><th class="num">金额</th>';
  h += '</tr></thead><tbody>';
  h += '<tr><td>本期应税（价税合计）</td><td class="num">' + fmt(f.row1_total_price_tax) + '</td></tr>';
  h += '<tr><td>本期扣除额</td><td class="num">' + fmt(f.row1_deduction) + '</td></tr>';
  h += '<tr style="background:#f0f9ff"><td><strong>扣除后销售额</strong></td><td class="num" style="font-weight:700">' + fmt(f.row1_after_deduction) + '</td></tr>';
  h += '</tbody></table></div>';
  return h;
}

function renderFormCredit(f) {
  let h = '<div class="card"><div class="card-title">🔐 附列资料（四）— 税额抵减情况</div>';
  h += '<table class="data-table"><thead><tr>';
  h += '<th>项目</th><th class="num">金额</th>';
  h += '</tr></thead><tbody>';
  h += '<tr><td>税控设备及技术维护费</td><td class="num">' + fmt(f.tax_control_device) + '</td></tr>';
  h += '<tr><td colspan="2" style="font-weight:600;background:#f9fafb">—— 一般项目 ——</td></tr>';
  h += '<tr><td>期初余额</td><td class="num">' + fmt(f.item1_begin) + '</td></tr>';
  h += '<tr><td>本期发生额</td><td class="num">' + fmt(f.item1_occur) + '</td></tr>';
  h += '<tr><td>应调减额</td><td class="num">' + fmt(f.item1_should_deduct) + '</td></tr>';
  h += '<tr><td>实际抵减</td><td class="num">' + fmt(f.item1_actual_deduct) + '</td></tr>';
  h += '<tr style="background:#f0f9ff"><td><strong>期末余额</strong></td><td class="num" style="font-weight:700">' + fmt(f.item1_end) + '</td></tr>';
  h += '</tbody></table></div>';
  return h;
}

function renderFormSurcharge(f, data) {
  let h = '<div class="card"><div class="card-title">🧮 附列资料（五）— 附加税费情况</div>';
  h += '<div style="font-size:13px;color:#6b7280;margin-bottom:12px">';
  h += '计税依据 = 增值税应纳税额 ' + fmt(f.city_base) + ' 元';
  if (data.micro_enterprise && data.six_tax_reduction) {
    h += ' <span style="color:#059669">（小规模纳税人，减半征收）</span>';
  }
  h += '</div>';
  h += '<table class="data-table"><thead><tr>';
  h += '<th>税种</th><th>计税依据</th><th>税率</th><th>应纳税额</th><th>减征比例</th><th>实纳税额</th>';
  h += '</tr></thead><tbody>';
  h += '<tr><td>城市维护建设税</td><td class="num">' + fmt(f.city_base) + '</td><td class="num">7%</td><td class="num">' + fmt(f.city_tax) + '</td><td class="num">' + (f.city_reduction_rate * 100) + '%</td><td class="num" style="font-weight:700">' + fmt(f.city_final) + '</td></tr>';
  h += '<tr><td>教育费附加</td><td class="num">' + fmt(f.edu_base) + '</td><td class="num">3%</td><td class="num">' + fmt(f.edu_tax) + '</td><td class="num">' + (f.edu_reduction_rate * 100) + '%</td><td class="num" style="font-weight:700">' + fmt(f.edu_final) + '</td></tr>';
  h += '<tr><td>地方教育附加</td><td class="num">' + fmt(f.local_edu_base) + '</td><td class="num">2%</td><td class="num">' + fmt(f.local_edu_tax) + '</td><td class="num">' + (f.local_edu_reduction_rate * 100) + '%</td><td class="num" style="font-weight:700">' + fmt(f.local_edu_final) + '</td></tr>';
  h += '</tbody></table></div>';
  return h;
}

function renderFormReduction(f, data) {
  let h = '<div class="card"><div class="card-title">🎁 增值税减免税申报明细表</div>';
  h += '<div style="font-size:13px;color:#6b7280;margin-bottom:12px">';
  h += '小规模纳税人：' + (data.micro_enterprise ? '✅ 是' : '否') + ' | ';
  h += '享受六税两费减征：' + (data.six_tax_reduction ? '✅ 是' : '否');
  h += '</div>';
  const items = f.reduction_items || [];
  if (items.length === 0) {
    h += '<div style="text-align:center;padding:30px;color:#9ca3af">暂无减免税项目</div>';
  } else {
    h += '<table class="data-table"><thead><tr><th>减免项目</th><th>减免性质代码</th><th class="num">减免税额</th></tr></thead><tbody>';
    items.forEach(item => {
      h += '<tr><td>' + escHtml(item.name || '') + '</td><td>' + escHtml(item.code || '') + '</td><td class="num">' + fmt(item.amount) + '</td></tr>';
    });
    h += '</tbody></table>';
  }
  h += '</div>';
  return h;
}

// ==================== 辅助函数 ====================
function getStatusBadge(status) {
  const map = {
    '草稿': '<span class="badge badge-draft">草稿</span>',
    '已申报': '<span class="badge badge-audited">已申报</span>',
    '已缴税': '<span class="badge badge-posted">已缴税</span>'
  };
  return map[status] || status;
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escJs(s) {
  if (!s) return '';
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
