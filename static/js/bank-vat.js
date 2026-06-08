// ==================== 银行流水 ====================

var _bankConfigs = [];
var _currentBankId = null;

// ==================== 进项抵扣 ====================
var ivdFilter = { checkStatus: '', keyword: '', dateFrom: '', dateTo: '' };

async function loadBankConfigs() {
  const data = await api('/api/bank-configs');
  _bankConfigs = data;
  return data;
}

async function renderBankTransactions(container) {
  try {
  let el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  const [configs, stats] = await Promise.all([
    loadBankConfigs(),
    api('/api/bank-transactions/stats' + (_currentBankId ? '?bank_config_id=' + _currentBankId : ''))
  ]);

  document.title = '银行流水 - 财税风险防控系统';

  let bankSelectHtml = '';
  if (configs.length > 0) {
    const opts = configs.map(c => `<option value="${c.id}" ${c.id == _currentBankId ? 'selected' : ''}>${c.bank_name} ${c.account_number ? '(' + c.account_number.slice(-4) + ')' : ''}</option>`).join('');
    bankSelectHtml = `<select onchange="switchBank(this.value)" style="padding:6px 12px;border:1px solid var(--gray-300);border-radius:6px;font-size:13px;min-width:180px;">
      <option value="">全部银行</option>${opts}
    </select>`;
  }

  const fmt = n => (n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 });
  let html = '';

  // 统计卡片
  html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px">';
  html += '<div class="stat-card"><div class="stat-value">' + stats.total_count + '</div><div class="stat-label">流水总数</div></div>';
  html += '<div class="stat-card"><div class="stat-value" style="color:#e02424;">¥' + fmt(stats.total_income) + '</div><div class="stat-label">收入合计</div></div>';
  html += '<div class="stat-card"><div class="stat-value" style="color:#0e9f6e;">¥' + fmt(stats.total_expense) + '</div><div class="stat-label">支出合计</div></div>';
  const net = stats.total_income - stats.total_expense;
  html += '<div class="stat-card"><div class="stat-value" style="color:' + (net >= 0 ? '#e02424' : '#0e9f6e') + ';">¥' + fmt(net) + '</div><div class="stat-label">净流入</div></div>';
  html += '<div class="stat-card"><div class="stat-value">¥' + fmt(stats.last_balance) + '</div><div class="stat-label">最新余额</div></div>';
  html += '</div>';

  // 工具栏
  html += '<div class="toolbar" style="flex-wrap:wrap;gap:8px;">';
  html += '<div class="toolbar-left" style="display:flex;align-items:center;gap:8px;">';
  html += bankSelectHtml;
  html += '<button class="btn btn-outline" onclick="showUploadModal(\'bank-transaction\')">导入文件</button>';
  html += '<button class="btn btn-primary" id="btBatchGenBtn" onclick="batchGenerateBankVouchers()">生成凭证</button>';
  html += '<button class="btn btn-danger" id="btBatchDelBtn" onclick="batchDeleteBankTx()">批量删除</button>';
  html += '</div></div>';

  // 表格
  html += '<div id="bank-tx-table-container" style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0"></div>';

  el.innerHTML = html;
  loadBankTxList();
  } catch(e) { console.error('[renderBankTransactions]', e); el.innerHTML = '<div class="empty-state"><p style="color:var(--danger)">银行流水加载失败：' + e.message + '</p></div>'; }
}

window.switchBank = function(bankId) {
  _currentBankId = bankId || null;
  renderBankTransactions();
};

async function loadBankTxList() {
  const type = document.getElementById('bt-type-filter')?.value || '';
  const params = new URLSearchParams();
  if (_currentBankId) params.set('bank_config_id', _currentBankId);
  if (type) params.set('transaction_type', type);
  const qs = params.toString();
  const data = await api('/api/bank-transactions' + (qs ? '?' + qs : ''));

  const rows = data.map(tx => {
    const debitColor = (tx.debit_amount || 0) > 0 ? 'color:#e02424;font-weight:600;' : '';
    const creditColor = (tx.credit_amount || 0) > 0 ? 'color:#0e9f6e;font-weight:600;' : '';
    return `
      <tr>
        <td><input type="checkbox" class="bt-check" data-id="${tx.id}" onchange="updateBankTxBatchBtn()"></td>
        <td>${tx.transaction_date}</td>
        <td>${tx.transaction_time || '-'}</td>
        <td>${tx.application_date || '-'}</td>
        <td>${tx.voucher_no || '-'}</td>
        <td style="${debitColor}">${(tx.debit_amount || 0) > 0 ? '¥' + (tx.debit_amount || 0).toLocaleString() : '-'}</td>
        <td style="${creditColor}">${(tx.credit_amount || 0) > 0 ? '¥' + (tx.credit_amount || 0).toLocaleString() : '-'}</td>
        <td>¥${(tx.balance || 0).toLocaleString()}</td>
        <td>${tx.counterparty_account || '-'}</td>
        <td>${tx.counterparty_name || '-'}</td>
        <td>${tx.counterparty_bank || '-'}</td>
        <td>${tx.transaction_serial_no || '-'}</td>
        <td>${tx.voucher_seq || '-'}</td>
        <td>${tx.record_status || '-'}</td>
        <td>${tx.summary || '-'}</td>
        <td>${tx.transaction_remark || '-'}</td>
        <td>${tx.account_type || '-'}</td>
        <td>${tx.journal_voucher_no ? '<a href="javascript:void(0)" onclick="showVoucherDetail(\'' + tx.journal_voucher_no + '\')" style="color:#1d4ed8;font-weight:500;text-decoration:none;border-bottom:1px dashed #1d4ed8;cursor:pointer">' + tx.journal_voucher_no + '</a>' : '-'}</td>
        <td>${tx.journal_voucher_no ? '<button class="btn btn-sm" style="background:#e5e7eb;color:#9ca3af;cursor:not-allowed;font-size:12px" disabled>已生成</button>' : '<button class="btn btn-primary btn-sm" style="font-size:12px" onclick="generateFromBankTx(' + tx.id + ')">生成凭证</button>'}</td>
        <td style="white-space:nowrap">
          ${tx.journal_voucher_no 
            ? '<button class="btn btn-sm btn-secondary" style="background:#e5e7eb;color:#9ca3af;cursor:not-allowed" disabled>编辑</button><button class="btn btn-sm btn-danger" style="background:#e5e7eb;color:#9ca3af;cursor:not-allowed" disabled>删除</button>'
            : '<button class="btn btn-sm btn-secondary" onclick="editBankTx(' + tx.id + ')">编辑</button><button class="btn btn-sm btn-danger" onclick="deleteBankTx(' + tx.id + ')">删除</button>'
          }
        </td>
      </tr>`;
  }).join('');

  document.getElementById('bank-tx-table-container').innerHTML = `
    <div class="table-wrap" style="flex:1;overflow:auto;padding-bottom:15px">
    <table class="data-table"><thead><tr>
      <th style="width:36px"><input type="checkbox" id="btSelectAll" onclick="toggleBankTxSelectAll()" title="全选"></th>
      <th>交易日期</th><th>交易时间</th><th>申请日期</th><th>凭证号</th><th style="text-align:right">借方金额</th><th style="text-align:right">贷方金额</th><th style="text-align:right">余额</th><th>对方账号</th><th>对方户名</th><th>对方行名</th><th>交易流水号</th><th>传票序号</th><th>记录状态</th><th>摘要</th><th>交易附言</th><th>客户账户类型</th><th>凭证号</th><th style="width:90px">生成凭证</th><th>操作</th>
    </tr></thead><tbody>${rows || '<tr><td colspan="20" style="text-align:center;padding:40px;color:var(--gray-500);">暂无流水记录</td></tr>'}</tbody></table>
    </div>`;
}

function toggleBankTxSelectAll() {
  const all = document.getElementById('btSelectAll');
  document.querySelectorAll('.bt-check').forEach(cb => cb.checked = all.checked);
  updateBankTxBatchBtn();
}

function updateBankTxBatchBtn() {
  const count = document.querySelectorAll('.bt-check:checked').length;
  const delBtn = document.getElementById('btBatchDelBtn');
  if (delBtn) {
    delBtn.textContent = count > 0 ? '批量删除（' + count + '）' : '批量删除';
    delBtn.disabled = count === 0;
  }
  const genBtn = document.getElementById('btBatchGenBtn');
  if (genBtn) {
    genBtn.textContent = count > 0 ? '生成凭证（' + count + '）' : '生成凭证';
  }
}

async function batchDeleteBankTx() {
  const checked = document.querySelectorAll('.bt-check:checked');
  if (checked.length === 0) return;
  if (!confirm('确认删除选中的 ' + checked.length + ' 条银行流水记录？此操作不可恢复。')) return;
  const ids = Array.from(checked).map(cb => parseInt(cb.dataset.id));
  try {
    const result = await api('/api/bank-transactions/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ids: ids})
    });
    toast(result.message, 'success');
    loadBankTxList();
  } catch (e) { toast(e.message, 'error'); }
}

function showBankTxForm(id) {
  const isEdit = !!id;
  const title = isEdit ? '编辑银行流水' : '新增银行流水';
  const bankOpts = _bankConfigs.map(c => `<option value="${c.id}">${c.bank_name}</option>`).join('');

  const modal = createModal(title, `
    <div class="form-grid">
      <div class="form-group"><label>银行</label><select id="btf-bank" class="form-input">${bankOpts}</select></div>
      <div class="form-group"><label>交易日期 *</label><input id="btf-date" type="date" class="form-input"></div>
      <div class="form-group"><label>交易时间</label><input id="btf-time" type="time" step="1" class="form-input"></div>
      <div class="form-group"><label>申请日期</label><input id="btf-app-date" type="date" class="form-input"></div>
      <div class="form-group"><label>凭证号</label><input id="btf-voucher" class="form-input"></div>
      <div class="form-group"><label>借方金额</label><input id="btf-debit" type="number" step="0.01" class="form-input" placeholder="0.00"></div>
      <div class="form-group"><label>贷方金额</label><input id="btf-credit" type="number" step="0.01" class="form-input" placeholder="0.00"></div>
      <div class="form-group"><label>余额</label><input id="btf-balance" type="number" step="0.01" class="form-input"></div>
      <div class="form-group"><label>对方账号</label><input id="btf-cparty-acc" class="form-input"></div>
      <div class="form-group"><label>对方户名</label><input id="btf-cparty" class="form-input"></div>
      <div class="form-group"><label>对方行名</label><input id="btf-cparty-bank" class="form-input"></div>
      <div class="form-group"><label>交易流水号</label><input id="btf-serial" class="form-input"></div>
      <div class="form-group"><label>传票序号</label><input id="btf-seq" class="form-input"></div>
      <div class="form-group"><label>记录状态</label><input id="btf-status" class="form-input" placeholder="正常"></div>
      <div class="form-group"><label>客户账户类型</label><input id="btf-account-type" class="form-input"></div>
      <div class="form-group" style="grid-column:1/-1;"><label>摘要</label><input id="btf-summary" class="form-input" placeholder="交易摘要/用途说明"></div>
      <div class="form-group" style="grid-column:1/-1;"><label>交易附言</label><textarea id="btf-txn-remark" class="form-input" rows="2"></textarea></div>
    </div>
    <div style="text-align:right;margin-top:16px;">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveBankTx(${isEdit ? id : 0})">保存</button>
    </div>
  `);
  document.body.appendChild(modal);

  if (isEdit) {
    api('/api/bank-transactions/' + id).then(tx => {
      document.getElementById('btf-bank').value = tx.bank_config_id || '';
      document.getElementById('btf-date').value = tx.transaction_date;
      document.getElementById('btf-time').value = tx.transaction_time || '';
      document.getElementById('btf-app-date').value = tx.application_date || '';
      document.getElementById('btf-voucher').value = tx.voucher_no || '';
      document.getElementById('btf-debit').value = tx.debit_amount || 0;
      document.getElementById('btf-credit').value = tx.credit_amount || 0;
      document.getElementById('btf-balance').value = tx.balance || 0;
      document.getElementById('btf-cparty-acc').value = tx.counterparty_account || '';
      document.getElementById('btf-cparty').value = tx.counterparty_name || '';
      document.getElementById('btf-cparty-bank').value = tx.counterparty_bank || '';
      document.getElementById('btf-serial').value = tx.transaction_serial_no || '';
      document.getElementById('btf-seq').value = tx.voucher_seq || '';
      document.getElementById('btf-status').value = tx.record_status || '';
      document.getElementById('btf-account-type').value = tx.account_type || '';
      document.getElementById('btf-summary').value = tx.summary || '';
      document.getElementById('btf-txn-remark').value = tx.transaction_remark || '';
    });
  }
}

async function saveBankTx(id) {
  const dateVal = document.getElementById('btf-date').value;
  if (!dateVal || !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
    toast('请输入有效的日期（YYYY-MM-DD）', 'error');
    return;
  }
  const body = {
    bank_config_id: parseInt(document.getElementById('btf-bank').value) || null,
    transaction_date: dateVal,
    transaction_time: document.getElementById('btf-time').value || null,
    application_date: document.getElementById('btf-app-date').value || null,
    voucher_no: document.getElementById('btf-voucher').value,
    debit_amount: parseFloat(document.getElementById('btf-debit').value) || 0,
    credit_amount: parseFloat(document.getElementById('btf-credit').value) || 0,
    balance: parseFloat(document.getElementById('btf-balance').value) || 0,
    counterparty_account: document.getElementById('btf-cparty-acc').value,
    counterparty_name: document.getElementById('btf-cparty').value,
    counterparty_bank: document.getElementById('btf-cparty-bank').value,
    transaction_serial_no: document.getElementById('btf-serial').value,
    voucher_seq: document.getElementById('btf-seq').value,
    record_status: document.getElementById('btf-status').value,
    summary: document.getElementById('btf-summary').value,
    transaction_remark: document.getElementById('btf-txn-remark').value,
    account_type: document.getElementById('btf-account-type').value
  };
  try {
    if (id) {
      await api('/api/bank-transactions/' + id, { method: 'PUT', body });
    } else {
      await api('/api/bank-transactions', { method: 'POST', body });
    }
    closeModal();
    renderBankTransactions();
    toast(id ? '更新成功' : '创建成功');
  } catch (e) { toast(e.message, 'error'); }
}

async function editBankTx(id) { showBankTxForm(id); }

async function deleteBankTx(id) {
  if (!confirm('确定删除此流水记录？')) return;
  await api('/api/bank-transactions/' + id, { method: 'DELETE' });
  renderBankTransactions();
  toast('已删除');
}

// ==================== 银行配置弹窗 ====================

function showBankConfigModal() {
  const list = _bankConfigs.map(c => `
    <tr>
      <td>${c.bank_name}</td><td>${c.account_number || '-'}</td><td>${c.account_name || '-'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm btn-secondary" onclick="editBankConfig(${c.id})">编辑</button>
        <button class="btn btn-sm btn-danger" onclick="deleteBankConfig(${c.id})">删除</button>
      </td>
    </tr>`).join('');

  const modal = createModal('银行设置', `
    <table class="data-table" style="margin-bottom:16px;"><thead><tr><th>银行名称</th><th>账号</th><th>账户名称</th><th>操作</th></tr></thead>
      <tbody>${list || '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--gray-500);">暂无银行配置</td></tr>'}</tbody>
    </table>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-primary" onclick="showBankConfigForm()">+ 添加银行</button>
    </div>
    <div style="text-align:right;margin-top:16px;"><button class="btn" onclick="closeModal()">关闭</button></div>
  `);
  document.body.appendChild(modal);
}

function showBankConfigForm(id) {
  const isEdit = !!id;
  const title = isEdit ? '编辑银行配置' : '添加银行';
  const modal2 = createModal(title, `
    <div class="form-grid">
      <div class="form-group"><label>银行名称 *</label><input id="bcf-name" class="form-input" placeholder="如：中国工商银行"></div>
      <div class="form-group"><label>银行账号</label><input id="bcf-acc" class="form-input"></div>
      <div class="form-group"><label>账户名称</label><input id="bcf-acc-name" class="form-input"></div>
    </div>
    <div style="text-align:right;margin-top:16px;">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveBankConfig(${isEdit ? id : 0})">保存</button>
    </div>
  `);
  document.body.appendChild(modal2);

  if (isEdit) {
    const cfg = _bankConfigs.find(c => c.id === id);
    if (cfg) {
      document.getElementById('bcf-name').value = cfg.bank_name;
      document.getElementById('bcf-acc').value = cfg.account_number;
      document.getElementById('bcf-acc-name').value = cfg.account_name;
    }
  }
}

async function saveBankConfig(id) {
  const body = {
    bank_name: document.getElementById('bcf-name').value,
    account_number: document.getElementById('bcf-acc').value,
    account_name: document.getElementById('bcf-acc-name').value
  };
  if (!body.bank_name) { toast('请输入银行名称', 'error'); return; }
  try {
    if (id) {
      await api('/api/bank-configs/' + id, { method: 'PUT', body });
    } else {
      await api('/api/bank-configs', { method: 'POST', body });
    }
    closeModal();
    await loadBankConfigs();
    showBankConfigModal();
    toast(id ? '更新成功' : '添加成功');
  } catch (e) { toast(e.message, 'error'); }
}

function editBankConfig(id) { showBankConfigForm(id); }

async function deleteBankConfig(id) {
  if (!confirm('确定删除此银行配置？')) return;
  await api('/api/bank-configs/' + id, { method: 'DELETE' });
  await loadBankConfigs();
  showBankConfigModal();
  toast('已停用');
}

// ==================== 进项抵扣 - 认证台账 ====================

async function renderInputVATDeductions(container) {
  try {
  let el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  // 全局期间联动
  if (currentPeriod && !ivdFilter.dateFrom) { const r = periodToDateRange(currentPeriod); ivdFilter.dateFrom = r.from; ivdFilter.dateTo = r.to; }
  const params = new URLSearchParams();
  if (ivdFilter.checkStatus) params.set('check_status', ivdFilter.checkStatus);
  if (ivdFilter.dateFrom) params.set('date_from', ivdFilter.dateFrom);
  if (ivdFilter.dateTo) params.set('date_to', ivdFilter.dateTo);
  if (ivdFilter.keyword) params.set('keyword', ivdFilter.keyword);
  const qs = params.toString();

  const [list, stats] = await Promise.all([
    api('/api/input-vat-deductions' + (qs ? '?' + qs : '')),
    api('/api/input-vat-deductions/stats')
  ]);

  document.title = '进项抵扣 - 财税风险防控系统';
  const fmt = n => (n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 });
  let html = '';

  // 统计卡片
  html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px">';
  html += '<div class="stat-card"><div class="stat-value">' + stats.total_count + '</div><div class="stat-label">记录总数</div></div>';
  html += '<div class="stat-card"><div class="stat-value">¥' + fmt(stats.total_amount) + '</div><div class="stat-label">金额合计</div></div>';
  html += '<div class="stat-card"><div class="stat-value">¥' + fmt(stats.total_tax) + '</div><div class="stat-label">税额合计</div></div>';
  html += '<div class="stat-card"><div class="stat-value">' + stats.checked_count + '</div><div class="stat-label">已勾选</div></div>';
  html += '<div class="stat-card"><div class="stat-value">' + stats.abnormal_count + '</div><div class="stat-label">异常发票</div></div>';
  html += '</div>';

  // 工具栏
  html += '<div class="toolbar" style="flex-wrap:wrap;gap:8px;">';
  html += '<div class="toolbar-left" style="display:flex;align-items:center;gap:8px;">';
  html += '<button class="btn btn-outline" onclick="showUploadModal(\'input-vat-deduction\')">导入文件</button>';
  html += '<button class="btn btn-primary" id="ivdBatchGenBtn" onclick="batchGenerateIVDVouchers()">生成凭证</button>';
  html += '<button class="btn btn-danger" id="ivdBatchDelBtn" onclick="batchDeleteIVD()">批量删除</button>';
  html += '</div></div>';

  // 表格
  const riskColors = { [STATUS.RISK_NORMAL]: '#059669', [STATUS.RISK_WARN]: '#d97706', [STATUS.RISK_ABNORMAL]: '#e02424', [STATUS.RISK_LOST]: '#7c3aed' };
  html += '<div class="table-wrap" style="flex:1;overflow:auto;padding-bottom:15px"><table class="data-table"><thead><tr>';
  html += '<th style="width:36px"><input type="checkbox" id="ivdSelectAll" onclick="toggleIVDSelectAll()" title="全选"></th>';
  html += '<th>勾选状态</th><th>发票来源</th><th>转内销证明编号</th><th>数电发票号码</th><th>发票代码</th><th>发票号码</th><th>开票日期</th><th>销售方纳税人识别号</th><th>销售方纳税人名称</th><th style="text-align:right">金额</th><th style="text-align:right">税额</th><th style="text-align:right">有效抵扣税额</th><th>票种</th><th>票种标签</th><th>发票状态</th><th>勾选时间</th><th>发票风险等级</th><th>凭证号</th><th style="width:90px">生成凭证</th><th>操作</th>';
  html += '</tr></thead><tbody>';

  if (list.length === 0) {
    html += '<tr><td colspan="22" style="text-align:center;color:#9ca3af;padding:40px">暂无认证记录</td></tr>';
  } else {
    // 按 import_batch_id 分组
    const ivdGroups = [];
    let ivdCur = null;
    list.forEach(it => {
      const ivdKey = it.import_batch_id || ('_' + it.id);
      if (!ivdCur || ivdCur.key !== ivdKey) {
        ivdCur = { key: ivdKey, items: [] };
        ivdGroups.push(ivdCur);
      }
      ivdCur.items.push(it);
    });
    ivdGroups.forEach(g => {
      const ivdAllIds = g.items.map(x => x.id).join(',');
      g.items.forEach((it, idx) => {
      const stCls = it.invoice_status === STATUS.NORMAL ? 'badge-green' : it.invoice_status === STATUS.VOID ? 'badge-gray' : 'badge-red';
      const jv2 = it.journal_voucher_no || '';
      html += '<tr>';
      // 每组只显示一个复选框，垂直居中
      html += '<td style="text-align:center;vertical-align:middle">' + (idx === 0 ? '<input type="checkbox" class="ivd-check" data-id="' + it.id + '" data-all-ids="' + ivdAllIds + '" onchange="updateIVDBatchBtn()" ' + (jv2 ? 'disabled title="已生成凭证，不可操作"' : '') + '>' : '') + '</td>';
      html += '<td><span style="color:' + (it.check_status === STATUS.CHECKED ? 'var(--success)' : 'var(--gray-400)') + ';font-weight:500;">' + (it.check_status || '-') + '</span></td>';
      html += '<td>' + (it.invoice_source || '-') + '</td>';
      html += '<td>' + (it.domestic_sale_cert_no || '-') + '</td>';
      html += '<td>' + (it.digital_invoice_no || '-') + '</td>';
      html += '<td>' + (it.invoice_code || '-') + '</td>';
      html += '<td>' + (it.invoice_no || '-') + '</td>';
      html += '<td>' + (it.invoice_date || '-') + '</td>';
      html += '<td>' + (it.seller_tax_id || '-') + '</td>';
      html += '<td>' + (it.seller_name || '-') + '</td>';
      html += '<td style="text-align:right">' + (it.amount != null ? '¥' + it.amount.toLocaleString() : '-') + '</td>';
      html += '<td style="text-align:right;font-weight:600">' + (it.tax_amount != null ? '¥' + it.tax_amount.toLocaleString() : '-') + '</td>';
      html += '<td style="text-align:right;color:var(--primary)">' + (it.deductible_tax_amount != null ? '¥' + it.deductible_tax_amount.toLocaleString() : '0') + '</td>';
      html += '<td>' + (it.invoice_category || '-') + '</td>';
      html += '<td>' + (it.invoice_category_label || '-') + '</td>';
      html += '<td><span class="' + stCls + '">' + (it.invoice_status || '-') + '</span></td>';
      html += '<td>' + (it.check_time ? it.check_time.slice(0,16).replace('T',' ') : '-') + '</td>';
      html += '<td><span style="color:' + (riskColors[it.risk_level] || '#333') + ';font-weight:500;">' + (it.risk_level || '-') + '</span></td>';
      // 凭证号（每行独立）
      html += '<td>' + (jv2 ? '<a href="javascript:void(0)" onclick="showVoucherDetail(\'' + jv2 + '\')" style="color:#1d4ed8;font-weight:500;text-decoration:none;border-bottom:1px dashed #1d4ed8;cursor:pointer">' + jv2 + '</a>' : '-') + '</td>';
      // 生成凭证（每行独立）
      html += '<td style="width:90px">' + (jv2 ? '<button class="btn btn-sm" style="background:#e5e7eb;color:#9ca3af;cursor:not-allowed;font-size:12px" disabled>已生成</button>' : '<button class="btn btn-primary btn-sm" style="font-size:12px" onclick="generateFromIVD(' + it.id + ')">生成凭证</button>') + '</td>';
      // 操作（每行独立）
      html += '<td style="white-space:nowrap">';
      if (jv2) {
        html += '<button class="btn btn-sm btn-secondary" style="background:#e5e7eb;color:#9ca3af;cursor:not-allowed" disabled>编辑</button>';
        html += '<button class="btn btn-sm btn-danger" style="background:#e5e7eb;color:#9ca3af;cursor:not-allowed" disabled>删除</button>';
      } else {
        html += '<button class="btn btn-sm btn-secondary" onclick="editVATDeduction(' + it.id + ')">编辑</button>';
        html += '<button class="btn btn-sm btn-danger" onclick="deleteIVD(' + it.id + ')">删除</button>';
      }
      html += '</td>';
      html += '</tr>';
      });
    });
  }
  html += '</tbody></table></div>';

  el.innerHTML = html;
  } catch(e) { console.error('[renderInputVATDeductions]', e); el.innerHTML = '<div class="empty-state"><p style="color:var(--danger)">进项抵扣加载失败：' + e.message + '</p></div>'; }
}

function toggleIVDSelectAll() {
  const all = document.getElementById('ivdSelectAll');
  document.querySelectorAll('.ivd-check:not(:disabled)').forEach(cb => cb.checked = all.checked);
  updateIVDBatchBtn();
}

function updateIVDBatchBtn() {
  const enabledBoxes = document.querySelectorAll('.ivd-check:not(:disabled)');
  const checkedEnabled = document.querySelectorAll('.ivd-check:not(:disabled):checked');
  const count = checkedEnabled.length;
  const delBtn = document.getElementById('ivdBatchDelBtn');
  const certBtn = document.getElementById('ivdBatchCertBtn');
  if (delBtn) {
    delBtn.textContent = count > 0 ? '批量删除（' + count + '）' : '批量删除';
    delBtn.disabled = count === 0;
  }
  if (certBtn) {
    certBtn.textContent = count > 0 ? '✅ 批量认证（' + count + '）' : '✅ 批量认证';
    certBtn.disabled = count === 0;
  }
  const genBtn = document.getElementById('ivdBatchGenBtn');
  if (genBtn) {
    genBtn.textContent = count > 0 ? '生成凭证（' + count + '）' : '生成凭证';
    genBtn.disabled = count === 0;
  }
  // 同步全选框状态
  const selectAll = document.getElementById('ivdSelectAll');
  if (selectAll) {
    selectAll.checked = enabledBoxes.length > 0 && enabledBoxes.length === checkedEnabled.length;
    selectAll.indeterminate = checkedEnabled.length > 0 && checkedEnabled.length < enabledBoxes.length;
  }
}

async function batchDeleteIVD() {
  const checked = document.querySelectorAll('.ivd-check:not(:disabled):checked');
  if (checked.length === 0) return;
  const ids = [];
  checked.forEach(cb => {
    // 如果有 data-all-ids，则拆分并添加所有 ID
    if (cb.dataset.allIds) {
      cb.dataset.allIds.split(',').forEach(id => { const n = parseInt(id); if (n) ids.push(n); });
    } else {
      const n = parseInt(cb.dataset.id);
      if (n) ids.push(n);
    }
  });
  if (!confirm('确认删除选中的 ' + ids.length + ' 条认证记录？此操作不可恢复。')) return;
  try {
    const result = await api('/api/input-vat-deductions/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids)
    });
    toast(result.message, 'success');
    renderInputVATDeductions();
  } catch (e) { toast(e.message, 'error'); }
}

async function batchCertifyIVD() {
  const checked = document.querySelectorAll('.ivd-check:not(:disabled):checked');
  if (checked.length === 0) return;
  const ids = [];
  checked.forEach(cb => {
    if (cb.dataset.allIds) {
      cb.dataset.allIds.split(',').forEach(id => { const n = parseInt(id); if (n) ids.push(n); });
    } else {
      String(cb.dataset.id).split(',').forEach(id => { const n = parseInt(id); if (n) ids.push(n); });
    }
  });
  if (!confirm('确认认证选中的 ' + ids.length + ' 条记录？认证后将标记为"已勾选"并设置勾选时间。')) return;
  try {
    const result = await api('/api/input-vat-deductions/batch-certify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids)
    });
    toast(result.message, 'success');
    renderInputVATDeductions();
  } catch (e) { toast(e.message, 'error'); }
}

function showVATDeductionForm(id) {
  const isEdit = !!id;
  const title = isEdit ? '编辑认证记录' : '新增认证记录';
  const modal = createModal(title, `
    <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr;">
      <div class="form-group"><label>勾选状态</label><select id="ivdf-check-status" class="form-input">
        <option value="${STATUS.UNCHECKED}">未勾选</option><option value="${STATUS.CHECKED}">已勾选</option>
      </select></div>
      <div class="form-group"><label>发票来源</label><input id="ivdf-source" class="form-input" placeholder="勾选平台/扫描认证/手工录入"></div>
      <div class="form-group"><label>转内销证明编号</label><input id="ivdf-domestic-cert" class="form-input"></div>
      <div class="form-group"><label>数电发票号码</label><input id="ivdf-digital-no" class="form-input"></div>
      <div class="form-group"><label>发票代码</label><input id="ivdf-invoice-code" class="form-input"></div>
      <div class="form-group"><label>发票号码</label><input id="ivdf-invoice-no" class="form-input"></div>
      <div class="form-group"><label>开票日期</label><input id="ivdf-date" type="date" class="form-input"></div>
      <div class="form-group"><label>销售方纳税人识别号</label><input id="ivdf-seller-taxid" class="form-input"></div>
      <div class="form-group"><label>销售方纳税人名称</label><input id="ivdf-seller" class="form-input"></div>
      <div class="form-group"><label>金额（不含税）</label><input id="ivdf-amount" type="number" step="0.01" class="form-input" oninput="autoCalcVAT()"></div>
      <div class="form-group"><label>税额</label><input id="ivdf-tax" type="number" step="0.01" class="form-input"></div>
      <div class="form-group"><label>有效抵扣税额</label><input id="ivdf-deductible" type="number" step="0.01" class="form-input"></div>
      <div class="form-group"><label>票种</label><input id="ivdf-category" class="form-input" placeholder="如：数电发票（增值税专用发票）"></div>
      <div class="form-group"><label>票种标签</label><input id="ivdf-category-label" class="form-input"></div>
      <div class="form-group"><label>发票状态</label><select id="ivdf-inv-status" class="form-input">
        <option value="正常">正常</option><option value="作废">作废</option><option value="红冲">红冲</option>
      </select></div>
      <div class="form-group"><label>勾选时间</label><input id="ivdf-check-time" type="datetime-local" class="form-input"></div>
      <div class="form-group"><label>发票风险等级</label><select id="ivdf-risk" class="form-input">
        <option value="正常">正常</option><option value="疑点">疑点</option><option value="异常">异常</option><option value="失控">失控</option>
      </select></div>
      <div class="form-group"><label>抵扣所属期</label><input id="ivdf-period" class="form-input" placeholder="YYYY-MM"></div>
      <div class="form-group"><label>抵扣方式</label><select id="ivdf-method" class="form-input">
        <option value="凭票抵扣">凭票抵扣</option><option value="计算抵扣">计算抵扣</option><option value="核定抵扣">核定抵扣</option>
      </select></div>
      <div class="form-group"><label>货物名称</label><input id="ivdf-goods" class="form-input"></div>
      <div class="form-group"><label>税率(%)</label><input id="ivdf-rate" type="number" step="0.01" class="form-input" value="13"></div>
      <div class="form-group"><label>价税合计</label><input id="ivdf-total" type="number" step="0.01" class="form-input"></div>
      <div class="form-group" style="grid-column:1/-1;"><label>备注</label><textarea id="ivdf-remark" class="form-input" rows="2"></textarea></div>
    </div>
    <div style="text-align:right;margin-top:16px;">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveVATDeduction(${isEdit ? id : 0})">保存</button>
    </div>
  `);
  document.body.appendChild(modal);

  if (isEdit) {
    api('/api/input-vat-deductions/' + id).then(it => {
      document.getElementById('ivdf-check-status').value = it.check_status || STATUS.UNCHECKED;
      document.getElementById('ivdf-source').value = it.invoice_source || '';
      document.getElementById('ivdf-domestic-cert').value = it.domestic_sale_cert_no || '';
      document.getElementById('ivdf-digital-no').value = it.digital_invoice_no || '';
      document.getElementById('ivdf-invoice-code').value = it.invoice_code || '';
      document.getElementById('ivdf-invoice-no').value = it.invoice_no || '';
      document.getElementById('ivdf-date').value = it.invoice_date || '';
      document.getElementById('ivdf-seller-taxid').value = it.seller_tax_id || '';
      document.getElementById('ivdf-seller').value = it.seller_name || '';
      document.getElementById('ivdf-amount').value = it.amount || 0;
      document.getElementById('ivdf-tax').value = it.tax_amount || 0;
      document.getElementById('ivdf-deductible').value = it.deductible_tax_amount || 0;
      document.getElementById('ivdf-category').value = it.invoice_category || '';
      document.getElementById('ivdf-category-label').value = it.invoice_category_label || '';
      document.getElementById('ivdf-inv-status').value = it.invoice_status || STATUS.NORMAL;
      document.getElementById('ivdf-check-time').value = it.check_time ? it.check_time.slice(0,16) : '';
      document.getElementById('ivdf-risk').value = it.risk_level || STATUS.RISK_NORMAL;
      document.getElementById('ivdf-period').value = it.deduction_period || '';
      document.getElementById('ivdf-method').value = it.deduction_method || '凭票抵扣';
      document.getElementById('ivdf-goods').value = it.goods_name || '';
      document.getElementById('ivdf-rate').value = it.tax_rate || 0;
      document.getElementById('ivdf-total').value = it.total_amount || 0;
      document.getElementById('ivdf-remark').value = it.remark || '';
    });
  }
}

async function saveVATDeduction(id) {
  const body = {
    check_status: document.getElementById('ivdf-check-status').value,
    invoice_source: document.getElementById('ivdf-source').value,
    domestic_sale_cert_no: document.getElementById('ivdf-domestic-cert').value,
    digital_invoice_no: document.getElementById('ivdf-digital-no').value,
    invoice_code: document.getElementById('ivdf-invoice-code').value,
    invoice_no: document.getElementById('ivdf-invoice-no').value,
    invoice_date: document.getElementById('ivdf-date').value || null,
    seller_tax_id: document.getElementById('ivdf-seller-taxid').value,
    seller_name: document.getElementById('ivdf-seller').value,
    amount: parseFloat(document.getElementById('ivdf-amount').value) || 0,
    tax_amount: parseFloat(document.getElementById('ivdf-tax').value) || 0,
    deductible_tax_amount: parseFloat(document.getElementById('ivdf-deductible').value) || 0,
    invoice_category: document.getElementById('ivdf-category').value,
    invoice_category_label: document.getElementById('ivdf-category-label').value,
    invoice_status: document.getElementById('ivdf-inv-status').value,
    check_time: document.getElementById('ivdf-check-time').value || null,
    risk_level: document.getElementById('ivdf-risk').value,
    goods_name: document.getElementById('ivdf-goods').value,
    tax_rate: parseFloat(document.getElementById('ivdf-rate').value) || 0,
    total_amount: parseFloat(document.getElementById('ivdf-total').value) || 0,
    deduction_period: document.getElementById('ivdf-period').value,
    deduction_method: document.getElementById('ivdf-method').value,
    remark: document.getElementById('ivdf-remark').value
  };
  try {
    if (id) {
      await api('/api/input-vat-deductions/' + id, { method: 'PUT', body });
    } else {
      await api('/api/input-vat-deductions', { method: 'POST', body });
    }
    closeModal();
    renderInputVATDeductions();
    toast(id ? '更新成功' : '创建成功');
  } catch (e) { toast(e.message, 'error'); }
}

function autoCalcVAT() {
  const amount = parseFloat(document.getElementById('ivdf-amount')?.value) || 0;
  const rate = parseFloat(document.getElementById('ivdf-rate')?.value) || 0;
  if (amount && rate) {
    const tax = Math.round(amount * rate) / 100;
    document.getElementById('ivdf-tax').value = tax.toFixed(2);
    document.getElementById('ivdf-deductible').value = tax.toFixed(2);
  }
}

function editVATDeduction(id) { showVATDeductionForm(id); }

async function generateFromIVDGroup(idStr) {
  let ids = idStr.split(',').map(function(id) { return parseInt(id); }).filter(Boolean);
  if (!confirm('确认为该组 ' + ids.length + ' 条认证记录生成进项抵扣凭证？')) return;
  try {
    // 逐条生成凭证
    for (var j = 0; j < ids.length; j++) {
      await api('/api/input-vat-deductions/' + ids[j] + '/to-journal', { method: 'POST' });
    }
    toast('已为 ' + ids.length + ' 条记录生成凭证', 'success');
    renderInputVATDeductions();
  } catch (e) {
    handleError(e, '生成凭证');
  }
}

async function deleteIVDGroup(idStr) {
  let ids = idStr.split(',').map(function(id) { return parseInt(id); }).filter(Boolean);
  if (!confirm('确认删除该组 ' + ids.length + ' 条认证记录？此操作不可恢复。')) return;
  try {
    let result = await api('/api/input-vat-deductions/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids)
    });
    toast(result.message, 'success');
    renderInputVATDeductions();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteVATDeduction(id) {
  if (!confirm('确定删除此认证记录？')) return;
  await api('/api/input-vat-deductions/' + id, { method: 'DELETE' });
  renderInputVATDeductions();
  toast('已删除');
}

async function generateFromIVD(id) {
  if (!confirm('确认从该认证记录生成凭证？')) return;
  try {
    let res = await api('/api/input-vat-deductions/' + id + '/to-journal', { method: 'POST' });
    toast(res.message, 'success');
    renderInputVATDeductions();
  } catch (e) { toast(e.message || '生成失败', 'error'); }
}

// 批量生成进项抵扣凭证（每行独立勾选）
async function batchGenerateIVDVouchers() {
  // 收集选中的进项抵扣ID
  const checked = document.querySelectorAll('.ivd-check:not(:disabled):checked');
  if (checked.length === 0) { toast('请先勾选需要生成凭证的记录', 'warn'); return; }
  const ids = [];
  checked.forEach(cb => {
    if (cb.dataset.allIds) {
      cb.dataset.allIds.split(',').forEach(id => { const n = parseInt(id); if (n) ids.push(n); });
    } else {
      const n = parseInt(cb.dataset.id);
      if (n) ids.push(n);
    }
  });
  const btn = document.getElementById('ivdBatchGenBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 生成中...'; }
  try {
    const res = await api('/api/input-vat-deductions/batch-to-journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids)
    });
    toast(res.message, 'success');
    renderInputVATDeductions();
  } catch (e) {
    toast(e.message || '生成失败', 'error');
  } finally {
    // 不直接启用按钮，让 renderInputVATDeductions 重新渲染
    renderInputVATDeductions();
  }
}

async function batchGenerateBankVouchers() {
  // 收集选中的银行流水ID
  const checked = document.querySelectorAll('.bt-check:checked');
  if (checked.length === 0) { toast('请先勾选需要生成凭证的记录', 'warn'); return; }
  const ids = [];
  checked.forEach(cb => { const n = parseInt(cb.dataset.id); if (n) ids.push(n); });
  // 先预览
  try {
    const data = await api('/api/bank-transactions/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids)
    });
    showBankVoucherPreview(data.results, ids);
  } catch (e) {
    toast(e.message || '预览失败', 'error');
  }
}

// ==================== 银行规则库管理 ====================

var _bankRules = [];

async function showBankRuleModal() {
  try {
    const rules = await api('/api/bank-rules');
    _bankRules = rules;
    const txTypes = ['全部', '收入', '支出'];
    let rows = rules.map(r => `
      <tr>
        <td style="padding:6px 8px">${r.keyword}</td>
        <td style="padding:6px 8px">${r.account_code}</td>
        <td style="padding:6px 8px">${r.account_name || ''}</td>
        <td style="padding:6px 8px">${r.transaction_type}</td>
        <td style="padding:6px 8px">${r.direction}</td>
        <td style="padding:6px 8px">${r.priority}</td>
        <td style="padding:6px 8px">${r.is_active ? '<span style="color:#0e9f6e">启用</span>' : '<span style="color:#9ca3af">禁用</span>'}</td>
        <td style="padding:6px 8px;white-space:nowrap">
          <button class="btn btn-sm btn-secondary" onclick="editBankRule(${r.id})">编辑</button>
          <button class="btn btn-sm btn-danger" onclick="deleteBankRule(${r.id})">删除</button>
        </td>
      </tr>`).join('');

    const modal = createModal('银行规则库', `
      <div style="margin-bottom:12px">
        <button class="btn btn-primary btn-sm" onclick="showBankRuleForm(0)">新增规则</button>
        <span style="font-size:12px;color:var(--gray-500);margin-left:8px">规则按优先级从高到低匹配，关键词命中即使用对应科目</span>
      </div>
      <div class="table-wrap" style="max-height:400px;overflow:auto">
      <table class="data-table" style="font-size:13px">
        <thead><tr>
          <th>关键词</th><th>科目代码</th><th>科目名称</th><th>收支类型</th><th>方向</th><th>优先级</th><th>状态</th><th>操作</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--gray-500)">暂无规则，请新增</td></tr>'}</tbody>
      </table>
      </div>
      <div style="text-align:right;margin-top:12px"><button class="btn" onclick="closeModal()">关闭</button></div>
    `);
    document.body.appendChild(modal);
  } catch (e) {
    toast('加载规则失败: ' + e.message, 'error');
  }
}

async function showBankRuleForm(ruleId) {
  const isEdit = !!ruleId;
  const title = isEdit ? '编辑规则' : '新增规则';
  const txOpts = ['全部', '收入', '支出'].map(t => `<option value="${t}">${t}</option>`).join('');
  const dirOpts = ['auto', 'debit', 'credit'].map(d => `<option value="${d}">${d}</option>`).join('');

  const modal = createModal(title, `
    <div class="form-grid">
      <div class="form-group"><label>关键词 *</label><input id="brf-keyword" class="form-input" placeholder="如：工资、增值税、房租"></div>
      <div class="form-group"><label>科目代码 *</label><input id="brf-code" class="form-input" placeholder="如：221101"></div>
      <div class="form-group"><label>科目名称</label><input id="brf-name" class="form-input" placeholder="自动填充" disabled></div>
      <div class="form-group"><label>收支类型</label><select id="brf-type" class="form-input">${txOpts}</select></div>
      <div class="form-group"><label>方向</label><select id="brf-dir" class="form-input">${dirOpts}</select></div>
      <div class="form-group"><label>优先级</label><input id="brf-priority" type="number" class="form-input" value="0" placeholder="数字越大越优先"></div>
    </div>
    <div style="text-align:right;margin-top:16px">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveBankRule(${ruleId})">保存</button>
    </div>
  `);
  document.body.appendChild(modal);

  // 科目代码输入时自动查询科目名称
  document.getElementById('brf-code').addEventListener('blur', async function() {
    const code = this.value.trim();
    if (!code) return;
    try {
      const accts = await api('/api/accounts?keyword=' + encodeURIComponent(code));
      const found = accts.find(a => a.code === code);
      if (found) document.getElementById('brf-name').value = found.name;
    } catch(e) {}
  });

  if (isEdit) {
    const r = _bankRules.find(x => x.id === ruleId);
    if (r) {
      document.getElementById('brf-keyword').value = r.keyword;
      document.getElementById('brf-code').value = r.account_code;
      document.getElementById('brf-name').value = r.account_name || '';
      document.getElementById('brf-type').value = r.transaction_type || '全部';
      document.getElementById('brf-dir').value = r.direction || 'auto';
      document.getElementById('brf-priority').value = r.priority || 0;
    }
  }
}

async function saveBankRule(ruleId) {
  const isEdit = !!ruleId;
  const keyword = document.getElementById('brf-keyword').value.trim();
  const account_code = document.getElementById('brf-code').value.trim();
  if (!keyword || !account_code) { toast('关键词和科目代码必填', 'warn'); return; }
  const body = {
    keyword, account_code,
    account_name: document.getElementById('brf-name').value.trim() || undefined,
    transaction_type: document.getElementById('brf-type').value,
    direction: document.getElementById('brf-dir').value,
    priority: parseInt(document.getElementById('brf-priority').value) || 0,
  };
  try {
    if (isEdit) {
      await api('/api/bank-rules/' + ruleId, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body)
      });
    } else {
      await api('/api/bank-rules', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body)
      });
    }
    toast('规则已保存', 'success');
    closeModal();
    showBankRuleModal();
  } catch (e) { toast(e.message, 'error'); }
}

async function editBankRule(ruleId) {
  closeModal();
  setTimeout(() => showBankRuleForm(ruleId), 200);
}

async function deleteBankRule(ruleId) {
  if (!confirm('确认删除该规则？')) return;
  try {
    await api('/api/bank-rules/' + ruleId, { method: 'DELETE' });
    toast('规则已删除', 'success');
    showBankRuleModal();
  } catch (e) { toast(e.message, 'error'); }
}

// ==================== 凭证生成预览 ====================

var _previewIds = [];

async function showBankVoucherPreview(results, ids) {
  _previewIds = ids;
  const fmt = n => (n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 });
  let rows = results.map((r, i) => `
    <tr>
      <td style="padding:4px 6px;font-size:13px">${r.summary}</td>
      <td style="padding:4px 6px;font-size:13px;color:${r.is_debit ? '#e02424' : '#0e9f6e'};font-weight:600">¥${fmt(r.amount)}</td>
      <td style="padding:4px 6px;font-size:13px">
        <input value="${r.debit_account}" data-idx="${i}" data-field="debit_account" class="preview-acct" style="width:70px;padding:2px 4px;border:1px solid #d1d5db;border-radius:3px;font-size:13px">
        <span style="font-size:12px;color:#6b7280">${r.debit_name}</span>
      </td>
      <td style="padding:4px 6px;font-size:13px">
        <input value="${r.credit_account}" data-idx="${i}" data-field="credit_account" class="preview-acct" style="width:70px;padding:2px 4px;border:1px solid #d1d5db;border-radius:3px;font-size:13px">
        <span style="font-size:12px;color:#6b7280">${r.credit_name}</span>
      </td>
      <td style="padding:4px 6px;font-size:12px;color:#6b7280">${r.match_type}</td>
    </tr>`).join('');

  const modal = createModal('预览凭证生成', `
    <p style="font-size:13px;color:#6b7280;margin-bottom:10px">请确认以下流水将生成的凭证分录，可修改科目代码：</p>
    <div class="table-wrap" style="max-height:400px;overflow:auto">
    <table class="data-table" id="bank-preview-table" style="font-size:13px">
      <thead><tr>
        <th>摘要</th><th>金额</th><th>借方科目</th><th>贷方科目</th><th>匹配类型</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="confirmGenerateBankVouchers()">✅ 确认生成凭证</button>
    </div>
  `);
  document.body.appendChild(modal);

  // 科目代码失焦时自动填充名称
  document.querySelectorAll('.preview-acct').forEach(inp => {
    inp.addEventListener('blur', async function() {
      const code = this.value.trim();
      if (!code) return;
      try {
        const accts = await api('/api/accounts?keyword=' + encodeURIComponent(code));
        const found = accts.find(a => a.code === code);
        if (found) {
          const idx = this.dataset.idx;
          const field = this.dataset.field;
          // 更新名称显示（下一个 sibling 是 span）
          const span = this.parentElement.querySelector('span');
          if (span) span.textContent = found.name;
        }
      } catch(e) {}
    });
  });
}

async function confirmGenerateBankVouchers() {
  // 收集预览表格中的科目代码（用户可能已修改）
  const rows = document.querySelectorAll('#bank-preview-table tbody tr');
  // 目前后端不支持自定义科目，先按原有逻辑生成
  closeModal();
  try {
    const res = await api('/api/bank-transactions/batch-to-journal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_previewIds)
    });
    toast(res.message, 'success');
    renderBankTransactions();
  } catch (e) {
    toast(e.message || '生成失败', 'error');
  }
}

