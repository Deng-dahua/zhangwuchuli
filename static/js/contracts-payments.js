// ==================== 合同管理 ====================
async function renderContracts(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML = '<div class="card" style="margin-bottom:0">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
      '<button class="btn btn-primary" onclick="showContractForm()">\uff0b 新增合同</button>' +
    '</div>' +
    '<div class="filter-bar">' +
      '<input id="contractKeyword" placeholder="搜索合同编号/名称/对方..." style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;width:260px" onkeydown="if(event.key==\'Enter\')loadContracts()">' +
      '<button class="btn btn-primary" onclick="loadContracts()">搜索</button>' +
    '</div>' +
    '<div class="table-wrap" id="contract-table">\u52a0\u8f7d\u4e2d...</div>' +
  '</div>';
  await loadContracts();
}

async function loadContracts() {
  var kw = document.getElementById('contractKeyword')?.value || '';
  var url = '/api/contracts';
  if (kw) url += '?keyword=' + encodeURIComponent(kw);
  try {
    const data = await api(url);
    let tbody = '';
    for (const c of data) {
      tbody += '<tr>' +
        '<td><a href="#" onclick="showContractDetail(' + c.id + ');return false" style="color:var(--primary)">' + c.contract_no + '</a></td>' +
        '<td>' + c.contract_name + '</td>' +
        '<td>' + (c.party_a || '') + '</td>' +
        '<td>' + (c.party_b || '') + '</td>' +
        '<td>' + (c.contract_type || '') + '</td>' +
        '<td class="num">\uffe5' + (c.amount != null ? fmt(c.amount) : '-') + '</td>' +
        '<td>' + contractStatusBadge(c.status) + '</td>' +
        '<td>' +
          '<button class="btn btn-sm btn-secondary" onclick="showContractForm(' + c.id + ')">\u7f16\u8f91</button> ' +
          '<button class="btn btn-sm btn-danger" onclick="deleteContract(' + c.id + ')">\u5220\u9664</button>' +
        '</td>' +
      '</tr>';
    }
    document.getElementById('contract-table').innerHTML = '<table>' +
      '<thead><tr><th>\u5408\u540c\u7f16\u53f7</th><th>\u540d\u79f0</th><th>\u7532\u65b9</th><th>\u4e59\u65b9</th><th>\u7c7b\u578b</th><th class="num">\u91d1\u989d</th><th>\u72b6\u6001</th><th>\u64cd\u4f5c</th></tr></thead>' +
      '<tbody>' + (tbody || '<tr><td colspan="8"><div class="empty-state"><p>\u6682\u65e0\u5408\u540c</p></div></td></tr>') + '</tbody>' +
      '</table>';
  } catch (e) {
    document.getElementById('contract-table').innerHTML = '<p style="color:var(--danger)">' + e.message + '</p>';
  }
}

function contractStatusBadge(status) {
  const map = {
    '\u8349\u7a3f': 'badge-draft',
    '\u6267\u884c\u4e2d': 'badge-signed',
    '\u5df2\u5b8c\u7ed3': 'badge-closed',
    '\u5df2\u7ec8\u6b62': 'badge-deprecated'
  };
  return '<span class="badge ' + (map[status] || '') + '">' + status + '</span>';
}

async function showContractForm(contractId) {
  contractId = contractId || null;
  let html = '<div class="modal-title">' + (contractId ? '\u7f16\u8f91\u5408\u540c' : '\u65b0\u589e\u5408\u540c') + '</div>';
  html += '<form id="contract-form" class="form-grid">';
  const ctFields = [
    ['contract_no', '\u5408\u540c\u7f16\u53f7', 'text', 'required'],
    ['contract_name', '\u5408\u540c\u540d\u79f0', 'text', 'required'],
    ['contract_type', '\u5408\u540c\u7c7b\u578b', 'text', ''],
    ['party_a', '\u7532\u65b9', 'text', ''],
    ['party_b', '\u4e59\u65b9', 'text', ''],
    ['sign_date', '\u7b7e\u8ba2\u65e5\u671f', 'date', ''],
    ['effective_date', '\u751f\u6548\u65e5\u671f', 'date', ''],
    ['expiry_date', '\u5230\u671f\u65e5\u671f', 'date', ''],
    ['amount', '\u5408\u540c\u91d1\u989d', 'number', 'step=0.01'],
    ['currency', '\u5e01\u79cd', 'text', '', 'CNY'],
    ['status', '\u72b6\u6001', 'select', '["\u8349\u7a3f","\u6267\u884c\u4e2d","\u5df2\u5b8c\u7ed3","\u5df2\u7ec8\u6b62"]', '\u8349\u7a3f'],
    ['notes', '\u5907\u6ce8', 'text', ''],
  ];
  for (const f of ctFields) {
    const [k, label, type, extra, def] = f;
    html += '<div class="form-group"><label>' + label + '</label>';
    if (type === 'select') {
      const opts = JSON.parse(extra);
      html += '<select class="form-control" name="' + k + '">';
      for (const o of opts) {
        html += '<option value="' + o + '"' + (def === o ? ' selected' : '') + '>' + o + '</option>';
      }
      html += '</select>';
    } else if (type === 'number') {
      html += '<input type="number" class="form-control" name="' + k + '" ' + (extra || '') + ' value="' + (def || '') + '">';
    } else {
      html += '<input type="' + type + '" class="form-control" name="' + k + '" ' + (extra || '') + ' value="' + (def || '') + '">';
    }
    html += '</div>';
  }
  html += '</form>';
  html += '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="closeModal()">\u53d6\u6d88</button>' +
    '<button class="btn btn-primary" onclick="saveContract(' + (contractId || 'null') + ')">\u4fdd\u5b58</button>' +
    '</div>';
  showModal(html);
  if (contractId) {
    try {
      const c = await api('/api/contracts/' + contractId);
      for (const f of ctFields) {
        const el = document.querySelector('#contract-form [name="' + f[0] + '"]');
        if (el) el.value = c[f[0]] != null ? c[f[0]] : '';
      }
    } catch (e) {}
  }
}

async function saveContract(id) {
  const form = document.getElementById('contract-form');
  const body = {};
  new FormData(form).forEach(function(v, k) {
    if (v !== '' && v !== undefined) body[k] = (k === 'amount') ? parseFloat(v) : v;
  });
  try {
    if (id && id !== 'null') {
      await api('/api/contracts/' + id, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/api/contracts', { method: 'POST', body: JSON.stringify(body) });
    }
    closeModal();
    toast('\u4fdd\u5b58\u6210\u529f', 'success');
    await loadContracts();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteContract(id) {
  if (!confirm('\u786e\u8ba4\u5220\u9664\u8be5\u5408\u540c\uff1f')) return;
  try {
    await api('/api/contracts/' + id, { method: 'DELETE' });
    toast('\u5220\u9664\u6210\u529f', 'success');
    await loadContracts();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function showContractDetail(contractId) {
  try {
    const c = await api('/api/contracts/' + contractId);
    let html = '<div class="modal-title">\u5408\u540c\u8be6\u60c5 - ' + c.contract_no + '</div>';
    html += '<div class="form-grid-3" style="margin-bottom:16px;font-size:13px">';
    html += '<div><b>\u5408\u540c\u540d\u79f0\uff1a</b>' + c.contract_name + '</div>';
    html += '<div><b>\u7c7b\u578b\uff1a</b>' + (c.contract_type || '-') + '</div>';
    html += '<div><b>\u72b6\u6001\uff1a</b>' + contractStatusBadge(c.status) + '</div>';
    html += '<div><b>\u7532\u65b9\uff1a</b>' + (c.party_a || '-') + '</div>';
    html += '<div><b>\u4e59\u65b9\uff1a</b>' + (c.party_b || '-') + '</div>';
    html += '<div><b>\u91d1\u989d\uff1a</b>\uffe5' + (c.amount != null ? fmt(c.amount) : '-') + '</div>';
    html += '<div><b>\u7b7e\u8ba2\u65e5\u671f\uff1a</b>' + (c.sign_date || '-') + '</div>';
    html += '<div><b>\u751f\u6548\u65e5\u671f\uff1a</b>' + (c.effective_date || '-') + '</div>';
    html += '<div><b>\u5230\u671f\u65e5\u671f\uff1a</b>' + (c.expiry_date || '-') + '</div>';
    html += '</div>';
    if (c.notes) html += '<div style="margin-bottom:12px;font-size:13px"><b>\u5907\u6ce8\uff1a</b>' + c.notes + '</div>';

    html += '<div class="card-title" style="margin-top:16px">\U0001f4b0 收付款计划</div>';
    html += '<button class="btn btn-sm btn-primary" onclick="showPaymentForm(' + contractId + ')" style="margin-bottom:8px">\uff0b 添加收付款计划</button>';
    if (c.payments && c.payments.length > 0) {
      html += '<div class="table-wrap"><table><thead><tr><th>\u671f\u6b21</th><th>\u7c7b\u578b</th><th>\u8ba1\u5212\u65e5\u671f</th><th class="num">\u91d1\u989d</th><th>\u72b6\u6001</th><th>\u64cd\u4f5c</th></tr></thead><tbody>';
      for (const p of c.payments) {
        let pStatus;
        if (p.status === 'executed') pStatus = '<span class="badge badge-executed">\u5df2\u6267\u884c</span>';
        else if (p.status === 'overdue') pStatus = '<span class="badge badge-overdue">\u903e\u671f</span>';
        else pStatus = '<span class="badge badge-pending">\u5f85\u6267\u884c</span>';
        html += '<tr>' +
          '<td>' + (p.period_no || '') + '</td>' +
          '<td>' + (p.payment_type === 'receipt' ? '\u6536\u6b3e' : '\u4ed8\u6b3e') + '</td>' +
          '<td>' + (p.due_date || '') + '</td>' +
          '<td class="num">\uffe5' + fmt(p.amount) + '</td>' +
          '<td>' + pStatus + '</td>' +
          '<td><button class="btn btn-sm btn-danger" onclick="deleteContractPayment(' + contractId + ',' + p.id + ')">\u5220\u9664</button></td>' +
        '</tr>';
      }
      html += '</tbody></table></div>';
    } else {
      html += '<div style="color:var(--gray-500);font-size:13px;padding:8px 0">\u6682\u65e0\u6536\u4ed8\u6b3e\u8ba1\u5212</div>';
    }
    showModal(html);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function showPaymentForm(contractId) {
  let html = '<div class="modal-title">\uff0b 添加收付款计划</div>';
  html += '<form id="payment-form" class="form-grid">';
  const pmFields = {
    payment_type: ['\u7c7b\u578b', 'select', [["receipt","\u6536\u6b3e"],["payment","\u4ed8\u6b3e"]]],
    period_no: ['\u671f\u6b21', 'text', null],
    due_date: ['\u8ba1\u5212\u65e5\u671f', 'date', 'required'],
    amount: ['\u91d1\u989d', 'number', 'required step=0.01'],
    status: ['\u72b6\u6001', 'select', [["pending","\u5f85\u6267\u884c"],["executed","\u5df2\u6267\u884c"],["overdue","\u903e\u671f"]]],
    notes: ['\u5907\u6ce8', 'text', null],
  };
  for (const [k, [label, type, extra]] of Object.entries(pmFields)) {
    html += '<div class="form-group"><label>' + label + '</label>';
    if (type === 'select') {
      html += '<select class="form-control" name="' + k + '">';
      for (const [val, txt] of extra) {
        html += '<option value="' + val + '">' + txt + '</option>';
      }
      html += '</select>';
    } else if (type === 'number') {
      html += '<input type="number" class="form-control" name="' + k + '" ' + (extra || '') + '>';
    } else {
      html += '<input type="' + type + '" class="form-control" name="' + k + '" ' + (extra || '') + '>';
    }
    html += '</div>';
  }
  html += '</form>';
  html += '<div class="modal-footer">' +
    '<button class="btn btn-secondary" onclick="closeModal()">\u53d6\u6d88</button>' +
    '<button class="btn btn-primary" onclick="savePayment(' + contractId + ')">\u4fdd\u5b58</button>' +
    '</div>';
  showModal(html);
}

async function savePayment(contractId) {
  const form = document.getElementById('payment-form');
  const body = {};
  new FormData(form).forEach(function(v, k) {
    if (v !== '' && v !== undefined) body[k] = (k === 'amount') ? parseFloat(v) : v;
  });
  try {
    await api('/api/contracts/' + contractId + '/payments', { method: 'POST', body: JSON.stringify(body) });
    closeModal();
    toast('\u6536\u4ed8\u6b3e\u8ba1\u5212\u5df2\u4fdd\u5b58', 'success');
    await showContractDetail(contractId);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteContractPayment(contractId, paymentId) {
  if (!confirm('\u786e\u8ba4\u5220\u9664\u8be5\u6536\u4ed8\u6b3e\u8ba1\u5212\uff1f')) return;
  try {
    await api('/api/contracts/' + contractId + '/payments/' + paymentId, { method: 'DELETE' });
    toast('\u5220\u9664\u6210\u529f', 'success');
    await showContractDetail(contractId);
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ==================== 付款管理 ====================

let currentPaymentTab = 'internal'; // 'internal' = 内部人员, 'external' = 外部单位

async function renderPayments(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML =
    '<div class="card" style="margin-bottom:0;padding:24px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn-primary" id="btn-add-internal" onclick="switchPaymentTab(\'internal\');showPaymentForm()">＋ 新增付款</button>' +
          '<button class="btn btn-primary" id="btn-add-external" onclick="switchPaymentTab(\'external\');showPaymentForm()" style="display:none">＋ 新增付款</button>' +
        '</div>' +
      '</div>' +

      // Tab bar
      '<div class="payment-tab-bar">' +
        '<div class="payment-tab active" id="tab-internal" onclick="switchPaymentTab(\'internal\')">' +
          '<span class="tab-icon">👤</span> 内部人员' +
          '<span class="tab-count" id="tab-internal-count">0</span>' +
        '</div>' +
        '<div class="payment-tab" id="tab-external" onclick="switchPaymentTab(\'external\')">' +
          '<span class="tab-icon">🏢</span> 外部单位' +
          '<span class="tab-count" id="tab-external-count">0</span>' +
        '</div>' +
      '</div>' +

      // Stats row
      '<div class="payment-stats-row" id="payment-stats"></div>' +

      // Filters
      '<div class="filter-bar" style="margin-top:16px">' +
        '<select class="form-control" id="payment-status-filter" style="width:120px">' +
          '<option value="">全部状态</option>' +
          '<option value="' + STATUS.PENDING + '">' + STATUS.PENDING + '</option>' +
          '<option value="' + STATUS.APPROVED + '">' + STATUS.APPROVED + '</option>' +
          '<option value="' + STATUS.PAID + '">' + STATUS.PAID + '</option>' +
          '<option value="' + STATUS.REJECTED + '">' + STATUS.REJECTED + '</option>' +
        '</select>' +
        '<input class="form-control" id="payment-keyword-filter" placeholder="搜索单号/人员/供应商/用途..." style="width:240px">' +
        '<button class="btn btn-primary" onclick="loadPayments()">🔍 查询</button>' +
      '</div>' +

      // Table
      '<div class="table-wrap" id="payment-table" style="margin-top:12px">加载中...</div>' +
    '</div>';

  // Inject tab CSS
  injectPaymentStyles();

  await loadPaymentStats();
  await loadPayments();
}

function injectPaymentStyles() {
  if (document.getElementById('payment-inline-css')) return;
  const style = document.createElement('style');
  style.id = 'payment-inline-css';
  style.textContent = `
    .payment-tab-bar { display:flex; gap:0; background:var(--gray-100); border-radius:10px; padding:4px; margin-bottom:20px; }
    .payment-tab { flex:1; display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 16px; border-radius:8px; font-size:14px; font-weight:500; color:var(--gray-600); cursor:pointer; transition:all .2s; user-select:none; }
    .payment-tab:hover { color:var(--gray-800); background:rgba(255,255,255,.5); }
    .payment-tab.active { background:#fff; color:var(--primary); font-weight:600; box-shadow:0 1px 3px rgba(0,0,0,.08); }
    .payment-tab .tab-icon { font-size:16px; }
    .payment-tab .tab-count { display:inline-flex; align-items:center; justify-content:center; min-width:22px; height:22px; border-radius:11px; font-size:11px; font-weight:700; padding:0 6px; background:var(--gray-200); color:var(--gray-600); }
    .payment-tab.active .tab-count { background:var(--primary); color:#fff; }

    .payment-stats-row { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
    @media (max-width:900px) { .payment-stats-row { grid-template-columns:repeat(2,1fr); } }

    .payment-stat-item { background:var(--gray-50); border-radius:10px; padding:16px; border:1px solid var(--gray-200); transition:all .2s; }
    .payment-stat-item:hover { border-color:var(--primary); background:#fff; }
    .payment-stat-item .psi-label { font-size:12px; color:var(--gray-500); margin-bottom:6px; font-weight:500; }
    .payment-stat-item .psi-value { font-size:22px; font-weight:700; margin-bottom:4px; }
    .payment-stat-item .psi-sub { font-size:12px; color:var(--gray-400); }

    .payment-type-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:600; }
    .payment-type-badge.internal { background:#fef3c7; color:#92400e; }
    .payment-type-badge.external { background:#dbeafe; color:#1e40af; }

    .scenario-badge { display:inline-flex; align-items:center; padding:2px 10px; border-radius:12px; font-size:12px; font-weight:600; margin-left:6px; }

    .scenario-badge.scenario-internal-报销 { background:#e8f5e9; color:#1b5e20; }
    .scenario-badge.scenario-internal-借支 { background:#fff3e0; color:#e65100; }
    .scenario-badge.scenario-external-预付款 { background:#ede7f6; color:#4a148c; }
    .scenario-badge.scenario-external-应付款 { background:#e3f2fd; color:#0d47a1; }

    .payment-form-section { background:var(--gray-50); border-radius:10px; padding:16px; margin-bottom:16px; border:1px solid var(--gray-200); }
    .payment-form-section-title { font-size:13px; font-weight:700; color:var(--gray-700); margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--gray-200); display:flex;align-items:center;gap:6px; }

    /* 现代付款表单样式 */
    .modern-section { background:#fff; border-radius:12px; margin-bottom:20px; border:1px solid #e5e7eb; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,.04); }
    .modern-section-header { display:flex; align-items:center; gap:10px; padding:14px 20px; font-size:15px; font-weight:700; color:#1f2937; background:linear-gradient(135deg,#f9fafb,#f3f4f6); border-left:4px solid var(--primary); border-bottom:1px solid #e5e7eb; }
    .modern-section-icon { font-size:18px; }
    .modern-section-body { padding:20px; }
    .modern-label { display:block; font-size:13px; font-weight:600; color:#374151; margin-bottom:6px; }
    .modern-input { width:100%; padding:9px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; color:#1f2937; background:#fff; box-sizing:border-box; transition:border-color .15s,box-shadow .15s; outline:none; font-family:inherit; }
    .modern-input:focus { border-color:var(--primary); box-shadow:0 0 0 3px rgba(29,78,216,.1); }
    select.modern-input { cursor:pointer; appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' fill='none' stroke='%236b7280' stroke-width='1.5'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 12px center; padding-right:32px; }
    .modern-input-amount { font-size:22px; font-weight:700; text-align:right; background:linear-gradient(135deg,#fef9c3,#fef3c7); border-color:#f59e0b; color:#b45309; letter-spacing:1px; }
    .modern-input-amount:focus { border-color:#f59e0b; box-shadow:0 0 0 3px rgba(245,158,11,.15); }
    .modern-textarea { resize:vertical; min-height:70px; padding:10px 12px; }
  `;
  document.head.appendChild(style);
}

async function switchPaymentTab(tab) {
  currentPaymentTab = tab;
  document.getElementById('tab-internal').classList.toggle('active', tab === 'internal');
  document.getElementById('tab-external').classList.toggle('active', tab === 'external');
  document.getElementById('btn-add-internal').style.display = tab === 'internal' ? '' : 'none';
  document.getElementById('btn-add-external').style.display = tab === 'external' ? '' : 'none';
  await loadPaymentStats();
  await loadPayments();
}

async function loadPaymentStats() {
  try {
    const s = await api('/api/payments/stats');
    document.getElementById('tab-internal-count').textContent = s.internal_count || 0;
    document.getElementById('tab-external-count').textContent = s.external_count || 0;
    document.getElementById('payment-stats').innerHTML =
      '<div class="payment-stat-item"><div class="psi-label">' + STATUS.PENDING + '</div><div class="psi-value" style="color:#c27803">' + (s.pending_count||0) + '</div><div class="psi-sub">¥' + fmt(s.pending_amount||0) + '</div></div>' +
      '<div class="payment-stat-item"><div class="psi-label">' + STATUS.APPROVED + '</div><div class="psi-value" style="color:#1a56db">' + (s.approved_count||0) + '</div><div class="psi-sub">待付款项</div></div>' +
      '<div class="payment-stat-item"><div class="psi-label">' + STATUS.PAID + '</div><div class="psi-value" style="color:#0e9f6e">' + (s.paid_count||0) + '</div><div class="psi-sub">¥' + fmt(s.paid_amount||0) + '</div></div>' +
      '<div class="payment-stat-item"><div class="psi-label">' + (currentPaymentTab==='internal'?'内部总额':'外部总额') + '</div><div class="psi-value">' + (s.total_count||0) + '</div><div class="psi-sub">¥' + fmt(currentPaymentTab==='internal'?(s.internal_amount||0):(s.external_amount||0)) + '</div></div>';
  } catch (e) {}
}

async function loadPayments() {
  const status = document.getElementById('payment-status-filter')?.value || '';
  const keyword = document.getElementById('payment-keyword-filter')?.value || '';
  let url = '/api/payments?payment_type=' + encodeURIComponent(currentPaymentTab === 'internal' ? '内部人员' : '外部单位') + '&';
  if (status) url += 'status=' + encodeURIComponent(status) + '&';
  if (keyword) url += 'keyword=' + encodeURIComponent(keyword) + '&';
  try {
    const data = await api(url);
    const isInternal = currentPaymentTab === 'internal';
    let tbody = '';
    for (const p of data) {
      const typeBadge = p.payment_type === '内部人员'
        ? '<span class="payment-type-badge internal">👤 内部人员</span>'
        : '<span class="payment-type-badge external">🏢 外部单位</span>';
      const scenarioBadge = p.scenario
        ? '<span class="scenario-badge scenario-' + (isInternal ? 'internal-' : 'external-') + p.scenario + '">' + p.scenario + '</span>'
        : '-';
      const personCol = isInternal
        ? '<td>' + (p.employee_name || '-') + '</td>'
        : '<td>' + (p.supplier_name || '-') + '</td>';
      const payeeCol = isInternal
        ? '<td>' + (p.payee || p.employee_name || '-') + '</td>'
        : '<td>' + (p.payee || p.supplier_name || '-') + '</td>';
      tbody += '<tr>' +
        '<td><a href="#" onclick="showPaymentDetail(' + p.id + ');return false" style="color:var(--primary);font-weight:500">' + p.payment_no + '</a></td>' +
        '<td>' + typeBadge + '</td>' +
        '<td>' + scenarioBadge + '</td>' +
        '<td>' + (p.payment_date || '') + '</td>' +
        personCol +
        '<td class="num">¥' + fmt(p.amount) + '</td>' +
        '<td>' + (p.payment_method || '') + '</td>' +
        '<td>' + p.department + '</td>' +
        '<td>' + paymentStatusBadge(p.status) + '</td>' +
        '<td>' +
          '<button class="btn btn-sm btn-secondary" onclick="showPaymentForm(' + p.id + ')">编辑</button> ' +
          (p.status === STATUS.APPROVED ? '<button class="btn btn-sm btn-success" onclick="markPaymentPaid(' + p.id + ')">确认付款</button> ' : '') +
          (p.status === STATUS.PENDING ? '<button class="btn btn-sm btn-danger" onclick="deletePayment(' + p.id + ')">删除</button>' : '') +
        '</td>' +
      '</tr>';
    }
    const headerCol = isInternal ? '人员' : '单位';
    const emptyMsg = isInternal ? '暂无内部人员记录' : '暂无外部单位记录';
    document.getElementById('payment-table').innerHTML = '<table>' +
      '<thead><tr><th>单号</th><th>类型</th><th>情形</th><th>日期</th><th>' + headerCol + '</th><th class="num">金额</th><th>方式</th><th>部门</th><th>状态</th><th>操作</th></tr></thead>' +
      '<tbody>' + (tbody || '<tr><td colspan="10"><div class="empty-state"><p>' + emptyMsg + '</p></div></td></tr>') + '</tbody>' +
      '</table>';
  } catch (e) {
    document.getElementById('payment-table').innerHTML = '<p style="color:var(--danger)">' + e.message + '</p>';
  }
}

function paymentStatusBadge(status) {
  const map = {
    [STATUS.PENDING]: '#c27803', [STATUS.APPROVED]: '#1a56db', [STATUS.PAID]: '#0e9f6e', [STATUS.REJECTED]: '#e02424'
  };
  const color = map[status] || '#6b7280';
  return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;color:#fff;background:' + color + '">' + status + '</span>';
}

async function showPaymentForm(paymentId) {
  const isEdit = paymentId && paymentId !== 'null';
  let payment = null;
  if (isEdit) {
    const data = await api('/api/payments?');
    payment = data.find(p => p.id === paymentId);
    if (payment) currentPaymentTab = payment.payment_type === '内部人员' ? 'internal' : 'external';
  }
  const isInternal = currentPaymentTab === 'internal';

  // 加载供应商列表
  let suppOptions = '<option value="">选择供应商</option>';
  try {
    const sups = await api('/api/suppliers');
    for (const s of sups) {
      suppOptions += '<option value="' + s.id + '"' + (payment && payment.supplier_id === s.id ? ' selected' : '') + '>' + s.name + '</option>';
    }
  } catch (e) {}

  // 加载员工列表
  let empOptions = '<option value="">选择员工</option>';
  try {
    const emps = await api('/api/employees');
    for (const e of emps) {
      empOptions += '<option value="' + e.id + '"' + (payment && payment.employee_id === e.id ? ' selected' : '') + '>' + e.name + '</option>';
    }
  } catch (e) {}

  // 加载合同列表
  let contractOptions = '<option value="">选择合同</option>';
  try {
    const contracts = await api('/api/contracts');
    for (const c of contracts) {
      contractOptions += '<option value="' + c.id + '"' + (payment && payment.contract_id === c.id ? ' selected' : '') + '>' + c.contract_no + ' ' + c.name + '</option>';
    }
  } catch (e) {}

  const title = isInternal ? '👤 ' + (isEdit ? '编辑内部人员记录' : '新增内部人员记录') : '🏢 ' + (isEdit ? '编辑外部单位记录' : '新增外部单位记录');
  const defaultNo = (isInternal ? 'NR' : 'DW') + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.random().toString(36).substring(2,6).toUpperCase();

  // 情形选项
  const internalScenarios = ['报销', '借支'];
  const externalScenarios = ['预付款', '应付款'];
  const scenarios = isInternal ? internalScenarios : externalScenarios;
  let scenarioOptions = '<option value="">选择情形</option>';
  for (const sc of scenarios) {
    scenarioOptions += '<option value="' + sc + '"' + (payment && payment.scenario === sc ? ' selected' : '') + '>' + sc + '</option>';
  }

  const gf = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px';
  let basicSection = '';
  if (isInternal) {
    basicSection =
      '<div class="modern-section">' +
        '<div class="modern-section-header"><span class="modern-section-icon">👤</span>内部人员信息</div>' +
        '<div class="modern-section-body">' +
          '<div style="' + gf + '">' +
            '<div><label class="modern-label">单号 <span style="color:#e02424">*</span></label><input class="modern-input" name="payment_no" required value="' + (payment ? payment.payment_no : defaultNo) + '"></div>' +
            '<div><label class="modern-label">日期 <span style="color:#e02424">*</span></label><input class="modern-input" type="date" name="payment_date" required value="' + (payment ? payment.payment_date : new Date().toISOString().slice(0,10)) + '"></div>' +
            '<div><label class="modern-label">情形 <span style="color:#e02424">*</span></label><select class="modern-input" name="scenario">' + scenarioOptions + '</select></div>' +
          '</div>' +
          '<div style="' + gf + '">' +
            '<div><label class="modern-label">人员 <span style="color:#e02424">*</span></label><select class="modern-input" name="employee_id" onchange="updatePaymentEmployee()">' + empOptions + '</select></div>' +
            '<div><label class="modern-label">所属部门</label><input class="modern-input" name="department" value="' + (payment ? payment.department || '' : '') + '"></div>' +
            '<div><label class="modern-label">金额 <span style="color:#e02424">*</span></label><input class="modern-input modern-input-amount" type="number" step="0.01" name="amount" required value="' + (payment ? payment.amount : '') + '" placeholder="0.00"></div>' +
          '</div>' +
          '<div style="' + gf + '">' +
            '<div><label class="modern-label">收款方</label><input class="modern-input" name="payee" placeholder="款项转入账户名" value="' + (payment ? payment.payee || '' : '') + '"></div>' +
            '<div><label class="modern-label">收款账号</label><input class="modern-input" name="payee_account" placeholder="银行卡号" value="' + (payment ? payment.payee_account || '' : '') + '"></div>' +
            '<div><label class="modern-label">付款方式</label><select class="modern-input" name="payment_method"><option value="银行转账"' + (payment && payment.payment_method === '银行转账' ? ' selected' : '') + '>银行转账</option><option value="现金"' + (payment && payment.payment_method === '现金' ? ' selected' : '') + '>现金</option><option value="其他"' + (payment && payment.payment_method === '其他' ? ' selected' : '') + '>其他</option></select></div>' +
          '</div>' +
          '<div style="margin-bottom:16px"><label class="modern-label">用途说明</label><input class="modern-input" name="purpose" placeholder="如：差旅费报销、办公用品采购..." value="' + (payment ? payment.purpose || '' : '') + '"></div>' +
          '<div><label class="modern-label">备注</label><textarea class="modern-input modern-textarea" name="remark" rows="2" placeholder="其他需要说明的信息">' + (payment ? payment.remark || '' : '') + '</textarea></div>' +
          '<input type="hidden" name="employee_name" id="payment-employee-name" value="' + (payment ? payment.employee_name || '' : '') + '">' +
        '</div>' +
      '</div>';
  } else {
    basicSection =
      '<div class="modern-section">' +
        '<div class="modern-section-header"><span class="modern-section-icon">📋</span>付款信息</div>' +
        '<div class="modern-section-body">' +
          '<div style="' + gf + '">' +
            '<div><label class="modern-label">付款单号 <span style="color:#e02424">*</span></label><input class="modern-input" name="payment_no" required value="' + (payment ? payment.payment_no : defaultNo) + '"></div>' +
            '<div><label class="modern-label">付款日期 <span style="color:#e02424">*</span></label><input class="modern-input" type="date" name="payment_date" required value="' + (payment ? payment.payment_date : new Date().toISOString().slice(0,10)) + '"></div>' +
            '<div><label class="modern-label">情形 <span style="color:#e02424">*</span></label><select class="modern-input" name="scenario">' + scenarioOptions + '</select></div>' +
          '</div>' +
          '<div style="' + gf + '">' +
            '<div><label class="modern-label">供应商</label><select class="modern-input" name="supplier_id" onchange="updatePaymentSupplier()">' + suppOptions + '</select></div>' +
            '<div><label class="modern-label">关联合同</label><select class="modern-input" name="contract_id" onchange="updatePaymentContract()">' + contractOptions + '</select></div>' +
            '<div><label class="modern-label">付款金额 <span style="color:#e02424">*</span></label><input class="modern-input modern-input-amount" type="number" step="0.01" name="amount" required value="' + (payment ? payment.amount : '') + '" placeholder="0.00"></div>' +
          '</div>' +
          '<div style="' + gf + '">' +
            '<div><label class="modern-label">付款方式</label><select class="modern-input" name="payment_method"><option value="银行转账"' + (payment && payment.payment_method === '银行转账' ? ' selected' : '') + '>银行转账</option><option value="现金"' + (payment && payment.payment_method === '现金' ? ' selected' : '') + '>现金</option><option value="支票"' + (payment && payment.payment_method === '支票' ? ' selected' : '') + '>支票</option><option value="其他"' + (payment && payment.payment_method === '其他' ? ' selected' : '') + '>其他</option></select></div>' +
            '<div><label class="modern-label">所属部门</label><input class="modern-input" name="department" value="' + (payment ? payment.department || '' : '') + '"></div>' +
            '<div></div>' +
          '</div>' +
          '<div><label class="modern-label">用途说明</label><input class="modern-input" name="purpose" placeholder="采购款、工程款、服务费..." value="' + (payment ? payment.purpose || '' : '') + '"></div>' +
        '</div>' +
      '</div>' +
      '<div class="modern-section">' +
        '<div class="modern-section-header"><span class="modern-section-icon">🏦</span>收款信息</div>' +
        '<div class="modern-section-body">' +
          '<div style="' + gf + '">' +
            '<div><label class="modern-label">收款方</label><input class="modern-input" name="payee" value="' + (payment ? payment.payee || '' : '') + '"></div>' +
            '<div><label class="modern-label">收款银行</label><input class="modern-input" name="payee_bank" value="' + (payment ? payment.payee_bank || '' : '') + '"></div>' +
            '<div><label class="modern-label">收款账号</label><input class="modern-input" name="payee_account" value="' + (payment ? payment.payee_account || '' : '') + '"></div>' +
          '</div>' +
          '<div><label class="modern-label">备注</label><textarea class="modern-input modern-textarea" name="remark" rows="2" placeholder="其他需要说明的信息">' + (payment ? payment.remark || '' : '') + '</textarea></div>' +
          '<input type="hidden" name="supplier_name" id="payment-supplier-name" value="' + (payment ? payment.supplier_name || '' : '') + '">' +
          '<input type="hidden" name="contract_no" id="payment-contract-no" value="' + (payment ? payment.contract_no || '' : '') + '">' +
        '</div>' +
      '</div>';
  }

  const html = '<div style="font-size:16px;font-weight:700;margin-bottom:20px;color:#1f2937">' + title + '</div>' +
    '<form id="payment-form">' +
      '<input type="hidden" name="payment_type" value="' + (isInternal ? '内部人员' : '外部单位') + '">' +
      basicSection +
    '</form>' +
    '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid var(--gray-200)">' +
      '<button class="btn btn-secondary" onclick="closeModal()">取消</button>' +
      '<button class="btn btn-primary" onclick="savePaymentRecord(' + (isEdit ? paymentId : 'null') + ')" style="padding:8px 24px">保存</button>' +
    '</div>';
  showModal(html);
}

async function updatePaymentEmployee() {
  const sel = document.querySelector('[name="employee_id"]');
  const nameInput = document.getElementById('payment-employee-name');
  if (!sel || !nameInput) return;
  if (!sel.value) { nameInput.value = ''; return; }
  try {
    const emps = await api('/api/employees');
    const e = emps.find(x => x.id === parseInt(sel.value));
    nameInput.value = e ? e.name : '';
  } catch (ex) {}
}

async function updatePaymentSupplier() {
  const sel = document.querySelector('[name="supplier_id"]');
  const nameInput = document.getElementById('payment-supplier-name');
  if (!sel || !nameInput) return;
  if (!sel.value) { nameInput.value = ''; return; }
  try {
    const sups = await api('/api/suppliers');
    const s = sups.find(x => x.id === parseInt(sel.value));
    nameInput.value = s ? s.name : '';
  } catch (e) {}
}

async function updatePaymentContract() {
  const sel = document.querySelector('[name="contract_id"]');
  const noInput = document.getElementById('payment-contract-no');
  if (!sel || !noInput) return;
  if (!sel.value) { noInput.value = ''; return; }
  try {
    const contracts = await api('/api/contracts');
    const c = contracts.find(x => x.id === parseInt(sel.value));
    noInput.value = c ? c.contract_no : '';
  } catch (e) {}
}

async function savePaymentRecord(id) {
  const form = document.getElementById('payment-form');
  const body = {};
  new FormData(form).forEach(function(v, k) {
    if (v !== '' && v !== undefined) {
      body[k] = (k === 'amount') ? parseFloat(v) : (k === 'supplier_id' || k === 'contract_id' || k === 'employee_id') ? (v ? parseInt(v) : null) : v;
    }
  });
  try {
    if (id && id !== 'null') {
      await api('/api/payments/' + id, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/api/payments', { method: 'POST', body: JSON.stringify(body) });
    }
    closeModal();
    toast('保存成功', 'success');
    await loadPayments();
    await loadPaymentStats();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deletePayment(id) {
  if (!confirm('确认删除该记录？')) return;
  try {
    await api('/api/payments/' + id, { method: 'DELETE' });
    toast('删除成功', 'success');
    await loadPayments();
    await loadPaymentStats();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function markPaymentPaid(id) {
  if (!confirm('确认该笔款项已支付？')) return;
  try {
    await api('/api/payments/' + id, { method: 'PUT', body: JSON.stringify({ status: STATUS.PAID }) });
    toast('付款确认成功', 'success');
    await loadPayments();
    await loadPaymentStats();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function showPaymentDetail(paymentId) {
  try {
    const data = await api('/api/payments?');
    const p = data.find(x => x.id === paymentId);
    if (!p) { toast('记录不存在', 'error'); return; }
    const isInternal = p.payment_type === '内部人员';
    const typeBadge = isInternal
      ? '<span class="payment-type-badge internal">👤 内部人员</span>'
      : '<span class="payment-type-badge external">🏢 外部单位</span>';
    const scenarioText = p.scenario ? '<span class="scenario-badge scenario-' + (isInternal ? 'internal-' : 'external-') + p.scenario + '">' + p.scenario + '</span>' : '';
    let html = '<div style="font-size:16px;font-weight:700;margin-bottom:20px;color:#1f2937">' + (isInternal ? '👤 内部人员详情' : '🏢 外部单位详情') + ' - ' + p.payment_no + '</div>';
    html += '<div style="margin-bottom:20px">' + typeBadge + ' ' + scenarioText + ' ' + paymentStatusBadge(p.status) + '</div>';

    html += '<div class="payment-form-section"><div class="payment-form-section-title">📋 基本信息</div>';
    html += '<div class="form-grid-2" style="gap:10px;font-size:13px">';
    html += '<div><b>日期：</b>' + p.payment_date + '</div>';
    html += '<div><b>情形：</b>' + (p.scenario || '-') + '</div>';
    html += '<div><b>金额：</b><span style="font-size:16px;font-weight:700;color:var(--primary)">¥' + fmt(p.amount) + '</span></div>';
    html += '<div><b>部门：</b>' + (p.department || '-') + '</div>';
    html += '<div><b>方式：</b>' + p.payment_method + '</div>';
    if (isInternal) {
      html += '<div><b>人员：</b>' + (p.employee_name || '-') + '</div>';
      html += '<div><b>收款方：</b>' + (p.payee || '-') + '</div>';
      html += '<div><b>收款账号：</b>' + (p.payee_account || '-') + '</div>';
    } else {
      html += '<div><b>供应商：</b>' + (p.supplier_name || '-') + '</div>';
      html += '<div><b>合同：</b>' + (p.contract_no || '-') + '</div>';
      html += '<div><b>收款方：</b>' + (p.payee || '-') + '</div>';
      html += '<div><b>收款账号：</b>' + (p.payee_account || '-') + '</div>';
      html += '<div><b>收款银行：</b>' + (p.payee_bank || '-') + '</div>';
    }
    html += '<div><b>用途：</b>' + (p.purpose || '-') + '</div>';
    html += '</div></div>';

    html += '<div class="payment-form-section"><div class="payment-form-section-title">📎 审批记录</div>';
    html += '<div class="form-grid-2" style="gap:10px;font-size:13px">';
    html += '<div><b>审批人：</b>' + (p.approved_by || '-') + '</div>';
    html += '<div><b>审批时间：</b>' + (p.approved_at || '-') + '</div>';
    html += '<div><b>实际付款：</b>' + (p.paid_at || '-') + '</div>';
    html += '<div><b>备注：</b>' + (p.remark || '-') + '</div>';
    html += '</div></div>';

    html += '<div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn btn-secondary" onclick="closeModal()">关闭</button></div>';
    showModal(html);
  } catch (e) {
    toast(e.message, 'error');
  }
}

