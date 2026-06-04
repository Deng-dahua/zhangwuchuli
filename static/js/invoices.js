// ==================== 开具发票 ====================

function fmtDate(d) {
  if (!d) return '';
  return d.replace(/-/g, '/');
}

let siTab = 'all'; // all / 正常 / 作废 / 红冲
let siFilter = { category: '', keyword: '', dateFrom: '', dateTo: '' };

async function renderSalesInvoices(container) {
  var el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  // 全局期间联动
  // dateFrom/dateTo 保持空，不自动填充期间
  try {
    const [inv, stats] = await Promise.all([
      api('/api/sales-invoices'),
      api('/api/sales-invoices/stats')
    ]);
    const fmt = n => (n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 });
    let html = '';

    // 统计卡片
    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:12px;margin-bottom:16px">';
    html += '<div class="stat-card"><div class="stat-value">' + stats.total_count + '</div><div class="stat-label">发票总数</div></div>';
    html += '<div class="stat-card"><div class="stat-value">¥' + fmt(stats.total_amt) + '</div><div class="stat-label">金额合计</div></div>';
    html += '<div class="stat-card"><div class="stat-value">¥' + fmt(stats.total_amount) + '</div><div class="stat-label">价税合计</div></div>';
    html += '<div class="stat-card"><div class="stat-value">¥' + fmt(stats.total_tax) + '</div><div class="stat-label">税额合计</div></div>';
    html += '<div class="stat-card"><div class="stat-value">' + stats.normal_count + '</div><div class="stat-label">正常</div></div>';
    html += '<div class="stat-card"><div class="stat-value">' + stats.void_count + '</div><div class="stat-label">作废</div></div>';
    html += '<div class="stat-card"><div class="stat-value">' + stats.red_count + '</div><div class="stat-label">红冲</div></div>';
    html += '</div>';

    // 工具栏
    html += '<div class="toolbar" style="flex-wrap:wrap;gap:8px;">';
    html += '<div class="toolbar-left" style="flex:1 1 100%;">';
    html += '<input id="siKeyword" placeholder="搜索发票号/代码/购方/货物..." style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;width:220px" value="' + (siFilter.keyword||'') + '" onkeydown="if(event.key==\'Enter\'){siFilter.keyword=this.value;renderSalesInvoices()}">';
    html += '<button onclick="siFilter.keyword=document.getElementById(\'siKeyword\').value;renderSalesInvoices()" style="padding:6px 12px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;cursor:pointer">🔍 搜索</button>';
    html += '<input type="text" placeholder="yyyy/mm/dd" data-val="' + (siFilter.dateFrom||'') + '" value="' + fmtDate(siFilter.dateFrom) + '" onclick="this.type=\'date\';this.value=this.dataset.val||\'\';this.showPicker()" onchange="if(this.type==\'date\'){siFilter.dateFrom=this.value;this.dataset.val=this.value;this.type=\'text\';this.value=this.value.replace(/-/g,\'/\');renderSalesInvoices()}else{siFilter.dateFrom=this.value.replace(/\\//g,\'-\');this.dataset.val=siFilter.dateFrom;renderSalesInvoices()}" onblur="if(this.type==\'date\'){this.type=\'text\';this.value=this.dataset.val?this.dataset.val.replace(/-/g,\'/\'):\'\'}" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;width:120px" title="起始日期">';
    html += '<span style="color:#9ca3af">至</span>';
    html += '<input type="text" placeholder="yyyy/mm/dd" data-val="' + (siFilter.dateTo||'') + '" value="' + fmtDate(siFilter.dateTo) + '" onclick="this.type=\'date\';this.value=this.dataset.val||\'\';this.showPicker()" onchange="if(this.type==\'date\'){siFilter.dateTo=this.value;this.dataset.val=this.value;this.type=\'text\';this.value=this.value.replace(/-/g,\'/\');renderSalesInvoices()}else{siFilter.dateTo=this.value.replace(/\\//g,\'-\');this.dataset.val=siFilter.dateTo;renderSalesInvoices()}" onblur="if(this.type==\'date\'){this.type=\'text\';this.value=this.dataset.val?this.dataset.val.replace(/-/g,\'/\'):\'\'}" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;width:120px" title="截止日期">';
    html += '<button onclick="siFilter.keyword=\'\';siFilter.dateFrom=\'\';siFilter.dateTo=\'\';siTab=\'all\';document.getElementById(\'siKeyword\').value=\'\';renderSalesInvoices();toast(\'已清除筛选条件\')" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer">清除筛选</button>';
    html += '<button class="btn btn-outline" onclick="showUploadModal(\'sales-invoice\')">📁 导入文件</button>';
    html += '<button class="btn btn-danger" id="siBatchDelBtn" onclick="batchDeleteSalesInvoices()">🗑 批量删除</button>';
        html += '<div class="tab-btn-group">';
    const salesTabs = [['all', '全部'], [STATUS.NORMAL, STATUS.NORMAL], [STATUS.VOID, STATUS.VOID], [STATUS.RED, STATUS.RED]];
    salesTabs.forEach(([t, label]) => {
      html += '<button class="tab-btn ' + (siTab === t ? 'active' : '') + '" onclick="siTab=\'' + t + '\';renderSalesInvoices()">' + label + '</button>';
    });
    html += '</div></div></div>';

    // 过滤
    let items = inv;
    if (siTab !== 'all') items = items.filter(i => i.status && i.status.includes(siTab));
    // 日期筛选：统一转成 YYYY-MM-DD 字符串比较
    if (siFilter.dateFrom) {
      const dFrom = siFilter.dateFrom.length === 10 && siFilter.dateFrom.includes('/') ? siFilter.dateFrom.replace(/\//g, '-') : siFilter.dateFrom;
      items = items.filter(i => i.invoice_date && i.invoice_date >= dFrom);
    }
    if (siFilter.dateTo) {
      const dTo = siFilter.dateTo.length === 10 && siFilter.dateTo.includes('/') ? siFilter.dateTo.replace(/\//g, '-') : siFilter.dateTo;
      items = items.filter(i => i.invoice_date && i.invoice_date <= dTo);
    }
    if (siFilter.keyword) {
      const kw = siFilter.keyword.toLowerCase();
      items = items.filter(i =>
        (i.invoice_no && i.invoice_no.toLowerCase().includes(kw)) ||
        (i.invoice_code && i.invoice_code.toLowerCase().includes(kw)) ||
        (i.digital_invoice_no && i.digital_invoice_no.toLowerCase().includes(kw)) ||
        (i.buyer_name && i.buyer_name.toLowerCase().includes(kw)) ||
        (i.seller_name && i.seller_name.toLowerCase().includes(kw)) ||
        (i.goods_name && i.goods_name.toLowerCase().includes(kw))
      );
    }

    // 表格
    html += '<div class="table-wrap" style="flex:1;overflow:auto;padding-bottom:15px"><table><thead><tr>';
    html += '<th style="width:36px"><input type="checkbox" id="siSelectAll" onclick="toggleSiSelectAll()" title="全选"></th>';
    html += '<th>发票代码</th><th>发票号码</th><th>数电发票号码</th><th>销方识别号</th><th>销方名称</th><th>购方识别号</th><th>购买方名称</th><th>开票日期</th><th>税收分类编码</th><th>特定业务类型</th><th>货物或应税劳务名称</th><th>规格型号</th><th>单位</th><th style="text-align:right">数量</th><th style="text-align:right">单价</th><th style="text-align:right">金额</th><th style="text-align:right">税率</th><th style="text-align:right">税额</th><th style="text-align:right">价税合计</th><th>发票来源</th><th>发票票种</th><th>发票状态</th><th>是否正数发票</th><th>发票风险等级</th><th>开票人</th><th>备注</th><th>凭证号</th><th style="width:90px">生成凭证</th><th>操作</th>';
    html += '</tr></thead><tbody>';

    if (items.length === 0) {
      html += '<tr><td colspan="30" style="text-align:center;color:#9ca3af;padding:40px">暂无开具发票记录</td></tr>';
    } else {
      items.forEach(i => {
        const stCls = i.status === STATUS.NORMAL ? 'badge-green' : i.status === STATUS.RED ? 'badge-red' : 'badge-gray';
        const posText = i.is_positive === true ? '是' : i.is_positive === false ? '否' : '-';
        html += '<tr>';
        html += '<td><input type="checkbox" class="si-check" data-id="' + i.id + '" onchange="updateSiBatchBtn()"></td>';
        html += '<td>' + (i.invoice_code || '-') + '</td>';
        html += '<td><a href="javascript:void(0)" style="color:#1d4ed8;font-weight:500;text-decoration:none" onclick="showSalesDetail(' + i.id + ')">' + (i.invoice_no || '-') + '</a></td>';
        html += '<td>' + (i.digital_invoice_no || '-') + '</td>';
        html += '<td>' + (i.seller_tax_no || '-') + '</td>';
        html += '<td>' + (i.seller_name || '-') + '</td>';
        html += '<td>' + (i.buyer_tax_no || '-') + '</td>';
        html += '<td>' + (i.buyer_name || '-') + '</td>';
        html += '<td>' + fmtDate(i.invoice_date) + '</td>';
        html += '<td>' + (i.tax_category_code || '-') + '</td>';
        html += '<td>' + (i.specific_business_type || '-') + '</td>';
        html += '<td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (i.goods_name || '') + '">' + (i.goods_name || '-') + '</td>';
        html += '<td>' + (i.spec || '-') + '</td>';
        html += '<td>' + (i.unit || '-') + '</td>';
        html += '<td style="text-align:right">' + (i.quantity != null ? i.quantity : '-') + '</td>';
        html += '<td style="text-align:right">' + (i.unit_price != null ? i.unit_price.toFixed(2) : '-') + '</td>';
        html += '<td style="text-align:right">' + fmt(i.amount) + '</td>';
        html += '<td style="text-align:right">' + (i.tax_rate || 0) + '%</td>';
        html += '<td style="text-align:right">' + fmt(i.tax_amount) + '</td>';
        html += '<td style="text-align:right;font-weight:600">' + fmt(i.total_amount) + '</td>';
        html += '<td>' + (i.invoice_source || '-') + '</td>';
        html += '<td>' + (i.invoice_category || '-') + '</td>';
        html += '<td><span class="' + stCls + '">' + i.status + '</span></td>';
        html += '<td>' + posText + '</td>';
        html += '<td>' + (i.invoice_risk_level || '-') + '</td>';
        html += '<td>' + (i.issuer || '-') + '</td>';
        html += '<td style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (i.remark || '') + '">' + (i.remark || '-') + '</td>';
        const jv = i.journal_voucher_no || '';
        html += '<td>' + (jv ? '<span style="color:#1d4ed8;font-weight:500">' + jv + '</span>' : '-') + '</td>';
        html += '<td>' + (jv ? '<button class="btn btn-sm" style="background:#e5e7eb;color:#9ca3af;cursor:not-allowed;font-size:12px" disabled>已生成</button>' : '<button class="btn btn-primary btn-sm" style="font-size:12px" onclick="generateFromSalesInvoice(' + i.id + ')">生成凭证</button>') + '</td>';
        html += '<td style="white-space:nowrap">';
        html += '<button class="btn btn-sm btn-secondary" onclick="showSalesInvoiceForm(' + i.id + ')" style="margin-right:4px">编辑</button>';
        html += '<button class="btn btn-sm btn-danger" onclick="deleteSalesInvoice(' + i.id + ')">删除</button>';
        html += '</td></tr>';
      });
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function showSalesInvoiceForm(id) {
  let data = {};
  if (id) {
    data = await api('/api/sales-invoices/' + id);
  }
  const isEdit = !!id;
  let html = '<div class="modal-header"><h3>' + (isEdit ? '编辑开具发票' : '新增开具发票') + '</h3><button class="modal-close" onclick="closeModal()">×</button></div>';
  html += '<div class="modal-body" style="max-height:70vh;overflow-y:auto">';

  // ── 发票基本信息 ──
  html += '<div class="payment-form-section"><div class="payment-form-section-title">📋 发票基本信息</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">发票代码</label><input class="form-input" id="si-invoice-code" value="' + (data.invoice_code || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">发票号码</label><input class="form-input" id="si-invoice-no" value="' + (data.invoice_no || '-') + '" ' + (isEdit ? 'readonly' : '') + '></div>';
  html += '</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">数电发票号码</label><input class="form-input" id="si-digital-invoice-no" value="' + (data.digital_invoice_no || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">开票日期</label><input type="date" class="form-input" id="si-invoice-date" value="' + (data.invoice_date || '') + '"></div>';
  html += '</div></div>';

  // ── 销方信息 ──
  html += '<div class="payment-form-section"><div class="payment-form-section-title">🏢 销方信息</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">销方识别号</label><input class="form-input" id="si-seller-taxno" value="' + (data.seller_tax_no || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">销方名称</label><input class="form-input" id="si-seller-name" value="' + (data.seller_name || '') + '"></div>';
  html += '</div></div>';

  // ── 购方信息 ──
  html += '<div class="payment-form-section"><div class="payment-form-section-title">🏢 购方信息</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">购方识别号</label><input class="form-input" id="si-buyer-taxno" value="' + (data.buyer_tax_no || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">购买方名称</label><input class="form-input" id="si-buyer-name" value="' + (data.buyer_name || '') + '"></div>';
  html += '</div></div>';

  // ── 分类信息 ──
  html += '<div class="payment-form-section"><div class="payment-form-section-title">🏷️ 分类信息</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">税收分类编码</label><input class="form-input" id="si-tax-category-code" value="' + (data.tax_category_code || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">特定业务类型</label><input class="form-input" id="si-specific-business-type" value="' + (data.specific_business_type || '') + '"></div>';
  html += '</div></div>';

  // ── 货物明细 ──
  html += '<div class="payment-form-section"><div class="payment-form-section-title">📦 货物明细</div>';
  html += '<div class="form-group"><label class="form-label">货物或应税劳务名称</label><input class="form-input" id="si-goods-name" value="' + (data.goods_name || '') + '"></div>';
  html += '<div class="form-grid-4">';
  html += '<div class="form-group"><label class="form-label">规格型号</label><input class="form-input" id="si-spec" value="' + (data.spec || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">单位</label><input class="form-input" id="si-unit" value="' + (data.unit || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">数量</label><input type="number" step="any" class="form-input" id="si-qty" value="' + (data.quantity || 0) + '" onchange="calcSiTotal()"></div>';
  html += '<div class="form-group"><label class="form-label">单价</label><input type="number" step="any" class="form-input" id="si-price" value="' + (data.unit_price || 0) + '" onchange="calcSiTotal()"></div>';
  html += '</div></div>';

  // ── 金额信息 ──
  html += '<div class="payment-form-section"><div class="payment-form-section-title">💰 金额信息</div>';
  html += '<div class="form-grid-3">';
  html += '<div class="form-group"><label class="form-label">金额（不含税）</label><input type="number" step="any" class="form-input" id="si-amount" value="' + (data.amount || 0) + '" onchange="calcSiTax()"></div>';
  html += '<div class="form-group"><label class="form-label">税率（%）</label><input type="number" step="any" class="form-input" id="si-taxrate" value="' + (data.tax_rate || 0) + '" onchange="calcSiTax()"></div>';
  html += '<div class="form-group"><label class="form-label">税额</label><input type="number" step="any" class="form-input" id="si-taxamount" value="' + (data.tax_amount || 0) + '" onchange="calcSiAmount()"></div>';
  html += '</div>';
  html += '<div class="form-group"><label class="form-label">价税合计</label><input type="number" step="any" class="form-input" id="si-total" value="' + (data.total_amount || 0) + '" readonly style="background:#f0f9ff;font-weight:600;font-size:16px"></div>';
  html += '</div>';

  // ── 发票属性 ──
  html += '<div class="payment-form-section"><div class="payment-form-section-title">📄 发票属性</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">发票票种</label><select class="form-input" id="si-category">';
  ['增值税专用发票', '增值税普通发票', '电子普通发票', '其他'].forEach(t => {
    html += '<option value="' + t + '"' + (data.invoice_category === t ? ' selected' : '') + '>' + t + '</option>';
  });
  html += '</select></div>';
  html += '<div class="form-group"><label class="form-label">发票状态</label><select class="form-input" id="si-status">';
  [STATUS.NORMAL, STATUS.VOID, STATUS.RED].forEach(s => {
    html += '<option value="' + s + '"' + (data.status === s ? ' selected' : '') + '>' + s + '</option>';
  });
  html += '</select></div>';
  html += '</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">发票来源</label><input class="form-input" id="si-source" value="' + (data.invoice_source || '') + '"></div>';
  html += '<div class="form-group"><label class="form-label">发票风险等级</label><select class="form-input" id="si-risk-level">';
  ['', STATUS.RISK_NORMAL, STATUS.FOLLOW_ATTENTION, STATUS.RISK_ABNORMAL].forEach(r => {
    html += '<option value="' + r + '"' + (data.invoice_risk_level === r ? ' selected' : '') + '>' + (r || '--') + '</option>';
  });
  html += '</select></div>';
  html += '</div>';
  html += '<div class="form-grid-2">';
  html += '<div class="form-group"><label class="form-label">是否正数发票</label><select class="form-input" id="si-is-positive">';
  html += '<option value="1"' + (data.is_positive !== false ? ' selected' : '') + '>是</option>';
  html += '<option value="0"' + (data.is_positive === false ? ' selected' : '') + '>否</option>';
  html += '</select></div>';
  html += '<div class="form-group"><label class="form-label">开票人</label><input class="form-input" id="si-issuer" value="' + (data.issuer || '') + '"></div>';
  html += '</div></div>';

  // ── 备注 ──
  html += '<div class="payment-form-section"><div class="payment-form-section-title">📝 备注</div>';
  html += '<div class="form-group"><label class="form-label">备注</label><textarea class="form-input" id="si-remark" rows="2" style="width:100%">' + (data.remark || '') + '</textarea></div>';
  html += '</div>';

  html += '</div>';
  html += '<div class="modal-footer">';
  html += '<button class="btn btn-secondary" onclick="closeModal()">取消</button>';
  html += '<button class="btn btn-primary" onclick="saveSalesInvoice(' + (id || 0) + ')">保存</button>';
  html += '</div>';
  showModal(html);
}

function calcSiTotal() {
  const qty = parseFloat(document.getElementById('si-qty').value) || 0;
  const price = parseFloat(document.getElementById('si-price').value) || 0;
  document.getElementById('si-amount').value = (qty * price).toFixed(2);
  calcSiTax();
}

function calcSiTax() {
  const amount = parseFloat(document.getElementById('si-amount').value) || 0;
  const rate = parseFloat(document.getElementById('si-taxrate').value) || 0;
  const tax = amount * rate / 100;
  document.getElementById('si-taxamount').value = tax.toFixed(2);
  document.getElementById('si-total').value = (amount + tax).toFixed(2);
}

function calcSiAmount() {
  const tax = parseFloat(document.getElementById('si-taxamount').value) || 0;
  const amount = parseFloat(document.getElementById('si-amount').value) || 0;
  document.getElementById('si-total').value = (amount + tax).toFixed(2);
}

async function saveSalesInvoice(id) {
  try {
    const body = {
      invoice_code: document.getElementById('si-invoice-code').value.trim(),
      invoice_no: document.getElementById('si-invoice-no').value.trim(),
      digital_invoice_no: document.getElementById('si-digital-invoice-no').value.trim(),
      seller_tax_no: document.getElementById('si-seller-taxno').value.trim(),
      seller_name: document.getElementById('si-seller-name').value.trim(),
      buyer_tax_no: document.getElementById('si-buyer-taxno').value.trim(),
      buyer_name: document.getElementById('si-buyer-name').value.trim(),
      invoice_date: document.getElementById('si-invoice-date').value,
      tax_category_code: document.getElementById('si-tax-category-code').value.trim(),
      specific_business_type: document.getElementById('si-specific-business-type').value.trim(),
      goods_name: document.getElementById('si-goods-name').value.trim(),
      spec: document.getElementById('si-spec').value.trim(),
      unit: document.getElementById('si-unit').value.trim(),
      quantity: parseFloat(document.getElementById('si-qty').value) || 0,
      unit_price: parseFloat(document.getElementById('si-price').value) || 0,
      amount: parseFloat(document.getElementById('si-amount').value) || 0,
      tax_rate: parseFloat(document.getElementById('si-taxrate').value) || 0,
      tax_amount: parseFloat(document.getElementById('si-taxamount').value) || 0,
      total_amount: parseFloat(document.getElementById('si-total').value) || 0,
      invoice_source: document.getElementById('si-source').value.trim(),
      invoice_category: document.getElementById('si-category').value,
      status: document.getElementById('si-status').value,
      is_positive: document.getElementById('si-is-positive').value === '1',
      invoice_risk_level: document.getElementById('si-risk-level').value,
      issuer: document.getElementById('si-issuer').value.trim(),
      remark: document.getElementById('si-remark').value.trim()
    };
    let result;
    if (id) {
      result = await api('/api/sales-invoices/' + id, { method: 'PUT', body });
    } else {
      result = await api('/api/sales-invoices', { method: 'POST', body });
    }
    toast(result.message || '保存成功', 'success');
    closeModal();
    renderSalesInvoices();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteSalesInvoice(id) {
  if (!confirm('确认删除该开具发票？')) return;
  try {
    const result = await api('/api/sales-invoices/' + id, { method: 'DELETE' });
    toast(result.message, 'success');
    renderSalesInvoices();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function toggleSiSelectAll() {
  const all = document.getElementById('siSelectAll');
  document.querySelectorAll('.si-check').forEach(cb => cb.checked = all.checked);
  updateSiBatchBtn();
}

function updateSiBatchBtn() {
  const count = document.querySelectorAll('.si-check:checked').length;
  const btn = document.getElementById('siBatchDelBtn');
  if (btn) {
    btn.textContent = count > 0 ? '🗑 批量删除（' + count + '）' : '🗑 批量删除';
    btn.disabled = count === 0;
  }
}

async function batchDeleteSalesInvoices() {
  const checked = document.querySelectorAll('.si-check:checked');
  if (checked.length === 0) return;
  if (!confirm('确认删除选中的 ' + checked.length + ' 条开具发票？此操作不可恢复。')) return;
  const ids = Array.from(checked).map(cb => parseInt(cb.dataset.id));
  try {
    const result = await api('/api/sales-invoices/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids)
    });
    toast(result.message, 'success');
    renderSalesInvoices();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function showSalesDetail(id) {
  try {
    const i = await api('/api/sales-invoices/' + id);
    const fmt = n => (n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 });
    let html = '<div class="modal-header"><h3>开具发票详情</h3><button class="modal-close" onclick="closeModal()">×</button></div>';
    html += '<div class="modal-body" style="max-height:70vh;overflow-y:auto">';

    // 基本信息
    html += '<div class="payment-form-section"><div class="payment-form-section-title">📋 基本信息</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>发票代码：</b>' + (i.invoice_code || '-') + '</div>';
    html += '<div><b>发票号码：</b>' + (i.invoice_no || '-') + '</div>';
    html += '<div><b>数电发票号码：</b>' + (i.digital_invoice_no || '-') + '</div>';
    html += '<div><b>开票日期：</b>' + fmtDate(i.invoice_date) + '</div>';
    html += '</div></div>';

    // 销方信息
    html += '<div class="payment-form-section"><div class="payment-form-section-title">🏢 销方信息</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>销方识别号：</b>' + (i.seller_tax_no || '-') + '</div>';
    html += '<div><b>销方名称：</b>' + (i.seller_name || '-') + '</div>';
    html += '</div></div>';

    // 购方信息
    html += '<div class="payment-form-section"><div class="payment-form-section-title">🏢 购方信息</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>购方识别号：</b>' + (i.buyer_tax_no || '-') + '</div>';
    html += '<div><b>购买方名称：</b>' + (i.buyer_name || '-') + '</div>';
    html += '</div></div>';

    // 分类信息
    html += '<div class="payment-form-section"><div class="payment-form-section-title">🏷️ 分类信息</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>税收分类编码：</b>' + (i.tax_category_code || '-') + '</div>';
    html += '<div><b>特定业务类型：</b>' + (i.specific_business_type || '-') + '</div>';
    html += '</div></div>';

    // 货物明细
    html += '<div class="payment-form-section"><div class="payment-form-section-title">📦 货物明细</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>货物或应税劳务名称：</b>' + (i.goods_name || '-') + '</div>';
    html += '<div><b>规格型号：</b>' + (i.spec || '-') + '</div>';
    html += '<div><b>单位：</b>' + (i.unit || '-') + '</div>';
    html += '<div><b>数量：</b>' + i.quantity + '</div>';
    html += '<div><b>单价：</b>¥' + fmt(i.unit_price) + '</div>';
    html += '</div></div>';

    // 金额信息
    html += '<div class="payment-form-section"><div class="payment-form-section-title">💰 金额信息</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>金额（不含税）：</b>¥' + fmt(i.amount) + '</div>';
    html += '<div><b>税率：</b>' + i.tax_rate + '%</div>';
    html += '<div><b>税额：</b>¥' + fmt(i.tax_amount) + '</div>';
    html += '<div><b>价税合计：</b><span style="font-weight:700;font-size:16px;color:#1d4ed8">¥' + fmt(i.total_amount) + '</span></div>';
    html += '</div></div>';

    // 发票属性
    html += '<div class="payment-form-section"><div class="payment-form-section-title">📄 发票属性</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>发票票种：</b>' + (i.invoice_category || '-') + '</div>';
    html += '<div><b>发票状态：</b>' + i.status + '</div>';
    html += '<div><b>发票来源：</b>' + (i.invoice_source || '-') + '</div>';
    html += '<div><b>发票风险等级：</b>' + (i.invoice_risk_level || '-') + '</div>';
    html += '<div><b>是否正数发票：</b>' + (i.is_positive ? '是' : '否') + '</div>';
    html += '<div><b>开票人：</b>' + (i.issuer || '-') + '</div>';
    html += '</div></div>';

    if (i.remark) {
      html += '<div class="payment-form-section"><div class="payment-form-section-title">📝 备注</div><div>' + i.remark + '</div></div>';
    }

    html += '<div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn btn-secondary" onclick="closeModal()">关闭</button></div>';
    showModal(html);
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ==================== 取得发票 ====================

let piTab = 'all';
let piFilter = { category: '', cert: '', keyword: '', dateFrom: '', dateTo: '' };

async function renderPurchaseInvoices(container) {
  var el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  // 全局期间联动
  // dateFrom/dateTo 保持空，不自动填充期间
  try {
    const [inv, stats] = await Promise.all([
      api('/api/purchase-invoices'),
      api('/api/purchase-invoices/stats')
    ]);
    const fmt = n => (n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 });
    let html = '';

    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:12px;margin-bottom:16px">';
    html += '<div class="stat-card"><div class="stat-value">' + stats.total_count + '</div><div class="stat-label">发票总数</div></div>';
    html += '<div class="stat-card"><div class="stat-value">¥' + fmt(stats.total_amt) + '</div><div class="stat-label">金额合计</div></div>';
    html += '<div class="stat-card"><div class="stat-value">¥' + fmt(stats.total_amount) + '</div><div class="stat-label">价税合计</div></div>';
    html += '<div class="stat-card"><div class="stat-value">¥' + fmt(stats.total_tax) + '</div><div class="stat-label">可抵扣税额</div></div>';
    html += '<div class="stat-card"><div class="stat-value">' + stats.normal_count + '</div><div class="stat-label">正常</div></div>';
    html += '<div class="stat-card"><div class="stat-value">' + stats.void_count + '</div><div class="stat-label">作废</div></div>';
    html += '<div class="stat-card"><div class="stat-value">' + stats.red_count + '</div><div class="stat-label">红冲</div></div>';
    html += '</div>';

    html += '<div class="toolbar" style="flex-wrap:wrap;gap:8px;">';
    html += '<div class="toolbar-left" style="flex:1 1 100%;">';
    html += '<input id="piKeyword" placeholder="搜索发票号/代码/销方/货物..." style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;width:220px" value="' + (piFilter.keyword||'') + '" onkeydown="if(event.key==\'Enter\'){piFilter.keyword=this.value;renderPurchaseInvoices()}">';
    html += '<button onclick="piFilter.keyword=document.getElementById(\'piKeyword\').value;renderPurchaseInvoices()" style="padding:6px 12px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;cursor:pointer">🔍 搜索</button>';
    html += '<input type="date" value="' + (piFilter.dateFrom||'') + '" onchange="piFilter.dateFrom=this.value;renderPurchaseInvoices()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px" title="起始日期">';
    html += '<span style="color:#9ca3af">至</span>';
    html += '<input type="date" value="' + (piFilter.dateTo||'') + '" onchange="piFilter.dateTo=this.value;renderPurchaseInvoices()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px" title="截止日期">';
    html += '<button onclick="piFilter.keyword=\'\';piFilter.dateFrom=\'\';piFilter.dateTo=\'\';piTab=\'all\';document.getElementById(\'piKeyword\').value=\'\';renderPurchaseInvoices();toast(\'已清除筛选条件\')" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer">清除筛选</button>';
    html += '<button class="btn btn-outline" onclick="showUploadModal(\'purchase-invoice\')">📁 导入文件</button>';
    html += '<button class="btn btn-danger" id="piBatchDelBtn" onclick="batchDeletePurchaseInvoices()">🗑 批量删除</button>';
    html += '</div></div>';
    let items = inv;
    if (piFilter.cert) items = items.filter(i => i.certification_status === piFilter.cert);
    if (piFilter.dateFrom) {
      const dFrom = piFilter.dateFrom.length === 10 && piFilter.dateFrom.includes('/') ? piFilter.dateFrom.replace(/\//g, '-') : piFilter.dateFrom;
      items = items.filter(i => i.invoice_date && i.invoice_date >= dFrom);
    }
    if (piFilter.dateTo) {
      const dTo = piFilter.dateTo.length === 10 && piFilter.dateTo.includes('/') ? piFilter.dateTo.replace(/\//g, '-') : piFilter.dateTo;
      items = items.filter(i => i.invoice_date && i.invoice_date <= dTo);
    }
    if (piFilter.keyword) {
      const kw = piFilter.keyword.toLowerCase();
      items = items.filter(i =>
        (i.invoice_no && i.invoice_no.toLowerCase().includes(kw)) ||
        (i.invoice_code && i.invoice_code.toLowerCase().includes(kw)) ||
        (i.digital_invoice_no && i.digital_invoice_no.toLowerCase().includes(kw)) ||
        (i.seller_name && i.seller_name.toLowerCase().includes(kw)) ||
        (i.buyer_name && i.buyer_name.toLowerCase().includes(kw)) ||
        (i.goods_name && i.goods_name.toLowerCase().includes(kw))
      );
    }

    // 表格
    html += '<div class="table-wrap" style="flex:1;overflow:auto;padding-bottom:15px"><table><thead><tr>';
    html += '<th style="width:36px"><input type="checkbox" id="piSelectAll" onclick="togglePiSelectAll()" title="全选"></th>';
    html += '<th>发票代码</th><th>发票号码</th><th>数电发票号码</th><th>销方识别号</th><th>销方名称</th><th>购方识别号</th><th>购买方名称</th><th>开票日期</th><th>税收分类编码</th><th>特定业务类型</th><th>货物或应税劳务名称</th><th>规格型号</th><th>单位</th><th style="text-align:right">数量</th><th style="text-align:right">单价</th><th style="text-align:right">金额</th><th style="text-align:right">税率</th><th style="text-align:right">税额</th><th style="text-align:right">价税合计</th><th>发票来源</th><th>发票票种</th><th>发票状态</th><th>是否正数发票</th><th>发票风险等级</th><th>认证状态</th><th>认证日期</th><th>抵扣所属期</th><th>开票人</th><th>备注</th><th>凭证号</th><th style="width:90px">生成凭证</th><th>操作</th>';
    html += '</tr></thead><tbody>';

    if (items.length === 0) {
      html += '<tr><td colspan="33" style="text-align:center;color:#9ca3af;padding:40px">暂无取得发票记录</td></tr>';
    } else {
      items.forEach(i => {
        const stCls = i.status === STATUS.NORMAL ? 'badge-green' : 'badge-gray';
        const posText = i.is_positive === true ? '是' : i.is_positive === false ? '否' : '-';
        html += '<tr>';
        html += '<td><input type="checkbox" class="pi-check" data-id="' + i.id + '" onchange="updatePiBatchBtn()"></td>';
        html += '<td>' + (i.invoice_code || '-') + '</td>';
        html += '<td><a href="javascript:void(0)" style="color:#1d4ed8;font-weight:500;text-decoration:none" onclick="showPurchaseDetail(' + i.id + ')">' + (i.invoice_no || '-') + '</a></td>';
        html += '<td>' + (i.digital_invoice_no || '-') + '</td>';
        html += '<td>' + (i.seller_tax_no || '-') + '</td>';
        html += '<td>' + (i.seller_name || '-') + '</td>';
        html += '<td>' + (i.buyer_tax_no || '-') + '</td>';
        html += '<td>' + (i.buyer_name || '-') + '</td>';
        html += '<td>' + i.invoice_date + '</td>';
        html += '<td>' + (i.tax_category_code || '-') + '</td>';
        html += '<td>' + (i.specific_business_type || '-') + '</td>';
        html += '<td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (i.goods_name || '') + '">' + (i.goods_name || '-') + '</td>';
        html += '<td>' + (i.spec || '-') + '</td>';
        html += '<td>' + (i.unit || '-') + '</td>';
        html += '<td style="text-align:right">' + (i.quantity != null ? i.quantity : '-') + '</td>';
        html += '<td style="text-align:right">' + (i.unit_price != null ? i.unit_price.toFixed(2) : '-') + '</td>';
        html += '<td style="text-align:right">' + fmt(i.amount) + '</td>';
        html += '<td style="text-align:right">' + (i.tax_rate || 0) + '%</td>';
        html += '<td style="text-align:right">' + fmt(i.tax_amount) + '</td>';
        html += '<td style="text-align:right;font-weight:600">' + fmt(i.total_amount) + '</td>';
        html += '<td>' + (i.invoice_source || '-') + '</td>';
        html += '<td>' + (i.invoice_category || '-') + '</td>';
        html += '<td><span class="' + stCls + '">' + i.status + '</span></td>';
        html += '<td>' + posText + '</td>';
        html += '<td>' + (i.invoice_risk_level || '-') + '</td>';
        const certCls = i.certification_status === STATUS.CERTIFIED ? 'badge-green' : i.certification_status === STATUS.DEDUCTED ? 'badge-blue' : 'badge-gray';
        html += '<td><span class="' + certCls + '">' + (i.certification_status || '未认证') + '</span></td>';
        html += '<td>' + (i.certification_date || '-') + '</td>';
        html += '<td>' + (i.deduction_period || '-') + '</td>';
        html += '<td>' + (i.issuer || '-') + '</td>';
        html += '<td style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (i.remark || '') + '">' + (i.remark || '-') + '</td>';
        const pjv = i.journal_voucher_no || '';
        html += '<td>' + (pjv ? '<span style="color:#1d4ed8;font-weight:500">' + pjv + '</span>' : '-') + '</td>';
        html += '<td>' + (pjv ? '<button class="btn btn-sm" style="background:#e5e7eb;color:#9ca3af;cursor:not-allowed;font-size:12px" disabled>已生成</button>' : '<button class="btn btn-primary btn-sm" style="font-size:12px" onclick="generateFromPurchaseInvoice(' + i.id + ')">生成凭证</button>') + '</td>';
        html += '<td style="white-space:nowrap">';
        html += '<button class="btn btn-sm btn-danger" onclick="deletePurchaseInvoice(' + i.id + ')">删除</button>';
        html += '</td></tr>';
      });
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deletePurchaseInvoice(id) {
  if (!confirm('确认删除该取得发票？')) return;
  try {
    const result = await api('/api/purchase-invoices/' + id, { method: 'DELETE' });
    toast(result.message, 'success');
    renderPurchaseInvoices();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function togglePiSelectAll() {
  const all = document.getElementById('piSelectAll');
  document.querySelectorAll('.pi-check').forEach(cb => cb.checked = all.checked);
  updatePiBatchBtn();
}

function updatePiBatchBtn() {
  const count = document.querySelectorAll('.pi-check:checked').length;
  const btn = document.getElementById('piBatchDelBtn');
  if (btn) {
    btn.textContent = count > 0 ? '🗑 批量删除（' + count + '）' : '🗑 批量删除';
    btn.disabled = count === 0;
  }
}

async function batchDeletePurchaseInvoices() {
  const checked = document.querySelectorAll('.pi-check:checked');
  if (checked.length === 0) return;
  if (!confirm('确认删除选中的 ' + checked.length + ' 条取得发票？此操作不可恢复。')) return;
  const ids = Array.from(checked).map(cb => parseInt(cb.dataset.id));
  try {
    const result = await api('/api/purchase-invoices/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids)
    });
    toast(result.message, 'success');
    renderPurchaseInvoices();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function showPurchaseDetail(id) {
  try {
    const i = await api('/api/purchase-invoices/' + id);
    const fmt = n => (n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 });
    let html = '<div class="modal-header"><h3>取得发票详情</h3><button class="modal-close" onclick="closeModal()">×</button></div>';
    html += '<div class="modal-body" style="max-height:70vh;overflow-y:auto">';

    // 基本信息
    html += '<div class="payment-form-section"><div class="payment-form-section-title">📋 基本信息</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>发票代码：</b>' + (i.invoice_code || '-') + '</div>';
    html += '<div><b>发票号码：</b>' + (i.invoice_no || '-') + '</div>';
    html += '<div><b>数电发票号码：</b>' + (i.digital_invoice_no || '-') + '</div>';
    html += '<div><b>开票日期：</b>' + (i.invoice_date || '-') + '</div>';
    html += '</div></div>';

    // 销方信息
    html += '<div class="payment-form-section"><div class="payment-form-section-title">🏢 销方信息</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>销方识别号：</b>' + (i.seller_tax_no || '-') + '</div>';
    html += '<div><b>销方名称：</b>' + (i.seller_name || '-') + '</div>';
    html += '</div></div>';

    // 购方信息
    html += '<div class="payment-form-section"><div class="payment-form-section-title">🏢 购方信息</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>购方识别号：</b>' + (i.buyer_tax_no || '-') + '</div>';
    html += '<div><b>购买方名称：</b>' + (i.buyer_name || '-') + '</div>';
    html += '</div></div>';

    // 分类信息
    html += '<div class="payment-form-section"><div class="payment-form-section-title">🏷️ 分类信息</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>税收分类编码：</b>' + (i.tax_category_code || '-') + '</div>';
    html += '<div><b>特定业务类型：</b>' + (i.specific_business_type || '-') + '</div>';
    html += '</div></div>';

    // 货物明细
    html += '<div class="payment-form-section"><div class="payment-form-section-title">📦 货物明细</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>货物或应税劳务名称：</b>' + (i.goods_name || '-') + '</div>';
    html += '<div><b>规格型号：</b>' + (i.spec || '-') + '</div>';
    html += '<div><b>单位：</b>' + (i.unit || '-') + '</div>';
    html += '<div><b>数量：</b>' + i.quantity + '</div>';
    html += '<div><b>单价：</b>¥' + fmt(i.unit_price) + '</div>';
    html += '</div></div>';

    // 金额信息
    html += '<div class="payment-form-section"><div class="payment-form-section-title">💰 金额信息</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>金额（不含税）：</b>¥' + fmt(i.amount) + '</div>';
    html += '<div><b>税率：</b>' + i.tax_rate + '%</div>';
    html += '<div><b>税额：</b>¥' + fmt(i.tax_amount) + '</div>';
    html += '<div><b>抵扣率：</b>' + (i.deduction_rate != null ? i.deduction_rate + '%' : '100%') + '</div>';
    html += '<div><b>价税合计：</b><span style="font-weight:700;font-size:16px;color:#1d4ed8">¥' + fmt(i.total_amount) + '</span></div>';
    html += '</div></div>';

    // 发票属性
    html += '<div class="payment-form-section"><div class="payment-form-section-title">📄 发票属性</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>发票票种：</b>' + (i.invoice_category || '-') + '</div>';
    html += '<div><b>发票状态：</b>' + i.status + '</div>';
    html += '<div><b>发票来源：</b>' + (i.invoice_source || '-') + '</div>';
    html += '<div><b>发票风险等级：</b>' + (i.invoice_risk_level || '-') + '</div>';
    html += '<div><b>是否正数发票：</b>' + (i.is_positive ? '是' : '否') + '</div>';
    html += '<div><b>开票人：</b>' + (i.issuer || '-') + '</div>';
    html += '</div></div>';

    // 认证信息
    html += '<div class="payment-form-section"><div class="payment-form-section-title">✅ 认证信息</div>';
    html += '<div class="form-grid-2">';
    html += '<div><b>认证状态：</b><span class="' + (i.certification_status === STATUS.DEDUCTED ? 'badge-green' : i.certification_status === STATUS.CERTIFIED ? 'badge-blue' : 'badge-gray') + '">' + i.certification_status + '</span></div>';
    html += '<div><b>认证日期：</b>' + (i.certification_date || '-') + '</div>';
    html += '<div><b>抵扣期间：</b>' + (i.deduction_period || '-') + '</div>';
    html += '</div></div>';

    if (i.remark) {
      html += '<div class="payment-form-section"><div class="payment-form-section-title">📝 备注</div><div>' + i.remark + '</div></div>';
    }

    html += '<div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn btn-secondary" onclick="closeModal()">关闭</button></div>';
    showModal(html);
  } catch (e) {
    toast(e.message, 'error');
  }
}

