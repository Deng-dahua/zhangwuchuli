// ==================== 序时账 ====================
let _jeData = null;

async function renderJournal(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML = '<div style="color:#999;padding:20px">加载中...</div>';
  try {
    const [data, stats] = await Promise.all([
      api('/api/journal-entries'),
      api('/api/journal-entries/stats')
    ]);
    let html = '';

    // 统计卡片
    html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px">';
    html += '<div class="stat-card"><div class="stat-value">' + stats.total_count + '</div><div class="stat-label">记录总数</div></div>';
    html += '<div class="stat-card"><div class="stat-value" style="color:var(--primary)">¥' + fmt(stats.total_debit) + '</div><div class="stat-label">借方合计</div></div>';
    html += '<div class="stat-card"><div class="stat-value" style="color:var(--success)">¥' + fmt(stats.total_credit) + '</div><div class="stat-label">贷方合计</div></div>';
    html += '<div class="stat-card"><div class="stat-value" style="color:var(--success)">' + stats.reviewed_count + '</div><div class="stat-label">已复核</div></div>';
    html += '<div class="stat-card"><div class="stat-value" style="color:var(--warning)">' + stats.unreviewed_count + '</div><div class="stat-label">未复核</div></div>';
    html += '</div>';

    // 期间选择栏 + 批量删除按钮
    html += '<div class="toolbar" style="flex-wrap:wrap;gap:8px;">';
    html += '<div class="toolbar-left" style="display:flex;align-items:center;gap:8px">';
    html += '<div id="je-period-bar" style="display:flex;align-items:center;gap:4px"></div>';
    html += '<button class="btn" style="color:var(--danger);border-color:var(--danger)" id="jeBatchDelBtn" onclick="batchDeleteJe()">🗑 批量删除</button>';
    html += '</div>';
    html += '</div>';

    // 表格容器
    html += '<div id="je-table-wrap" class="table-wrap" style="flex:1;overflow:auto;padding-bottom:4px"></div>';

    el.innerHTML = html;
    _jeData = data;
    buildJePeriodBar();
    renderJeTable(data);
    updateJeBatchBtn();
  } catch (e) {
    showError(el, e, '加载序时账');
  }
}

function renderJeTable(data) {
  const el = document.getElementById('je-table-wrap');
  if (!el) return;

  // 根据期间选择过滤数据
  let from = getJePeriod('from');
  let to = getJePeriod('to');
  let items = data;
  if (from) items = items.filter(r => r.period && r.period >= from);
  if (to) items = items.filter(r => r.period && r.period <= to);

  if (items.length === 0) {
    el.innerHTML = '<div style="color:#9ca3af;padding:40px;text-align:center;font-size:13px">暂无记录</div>';
    return;
  }

  let html = '<table><thead><tr>';
  html += '<th style="width:36px"><input type="checkbox" id="je-select-all" onchange="jeToggleAll(this)" title="全选"></th>';
  html += '<th>期间</th><th>凭证号</th><th>摘要</th><th>科目名称</th><th>往来项目</th><th>规格型号</th><th>数量</th><th>单位</th><th style="text-align:right">单价</th><th style="text-align:right">借方金额</th><th style="text-align:right">贷方金额</th><th>来源</th><th>操作</th>';
  html += '</tr></thead><tbody>';

  // 按凭证号分组
  const groups = [];
  let cur = null;
  items.forEach(r => {
    const key = r.period + '|' + (r.voucher_word || '记') + '|' + r.voucher_no;
    if (!cur || cur.key !== key) {
      cur = { key, entries: [] };
      groups.push(cur);
    }
    cur.entries.push(r);
  });

  groups.forEach(g => {
    const allIds = g.entries.map(e => e.id).join(',');
    g.entries.forEach((r, idx) => {
      html += '<tr>';
      html += '<td style="text-align:center"><input type="checkbox" class="je-row-check" data-id="' + r.id + '" data-all-ids="' + allIds + '" onchange="jeOnCheck()"></td>';
      html += '<td>' + r.period + '</td>';
      html += '<td style="text-align:center">' + (r.voucher_word || '记') + '-' + String(r.voucher_no).padStart(4, '0') + '</td>';
      html += '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis" title="' + escapeHtml(r.summary || '') + '">' + (r.summary || '-') + '</td>';
      html += '<td>' + (r.account_name || '-') + '</td>';
      html += '<td>' + (r.contact_project || '-') + '</td>';
      html += '<td>' + (r.spec_model || '-') + '</td>';
      html += '<td style="text-align:right">' + (r.quantity !== 0 ? r.quantity : '-') + '</td>';
      html += '<td>' + (r.unit || '-') + '</td>';
      html += '<td style="text-align:right">' + (r.unit_price !== 0 ? '¥' + fmt(r.unit_price) : '-') + '</td>';
      html += '<td style="text-align:right">' + (r.debit_amount !== 0 ? '¥' + fmt(r.debit_amount) : '-') + '</td>';
      html += '<td style="text-align:right">' + (r.credit_amount !== 0 ? '¥' + fmt(r.credit_amount) : '-') + '</td>';
      const src = r.source || '手动录入';
      const srcColors = { '开具发票': '#1d4ed8', '进项抵扣': '#7c3aed', '手动录入': '#6b7280' };
      html += '<td><span style="font-size:12px;color:' + (srcColors[src] || '#6b7280') + ';background:' + (src !== '手动录入' ? (src === '开具发票' ? '#dbeafe' : '#ede9fe') : '#f3f4f6') + ';padding:2px 8px;border-radius:10px;white-space:nowrap">' + src + '</span></td>';
      html += '<td style="white-space:nowrap">';
      html += '<button class="btn btn-sm btn-secondary" onclick="editJeEntry(' + r.id + ')">编辑</button>';
      html += '<button class="btn btn-sm btn-danger" onclick="deleteJeEntry(' + r.id + ')">删除</button>';
      html += '</td></tr>';
    });
  });

  html += '</tbody></table>';
  el.innerHTML = html;
}



async function showInvoicePicker() {
  const data = await api('/api/sales-invoices');
  if (!data.length) { toast('没有可用的销项发票', 'warning'); return; }
  let html = '<div style="padding:16px"><h3 style="margin-bottom:12px">选择销项发票生成凭证</h3><table style="width:100%;border-collapse:collapse">';
  html += '<thead><tr style="background:#f5f5f5;text-align:left"><th style="padding:8px 12px">发票号</th><th style="padding:8px 12px">日期</th><th style="padding:8px 12px">购方</th><th style="padding:8px 12px">货物</th><th style="padding:8px 12px" class="num">价税合计</th><th style="padding:8px 12px">状态</th><th style="padding:8px 12px">操作</th></tr></thead><tbody>';
  data.forEach(r => {
    html += `<tr>
      <td style="padding:6px 12px">${r.invoice_no || '-'}</td>
      <td style="padding:6px 12px">${r.invoice_date || ''}</td>
      <td style="padding:6px 12px">${r.buyer_name || ''}</td>
      <td style="padding:6px 12px">${(r.goods_name||'').substring(0,30)}</td>
      <td style="padding:6px 12px" class="num">¥${fmt(r.total_amount)}</td>
      <td style="padding:6px 12px">${r.status}</td>
      <td style="padding:6px 12px">${r.journal_voucher_no ? '<button class="btn btn-sm" style="background:#e5e7eb;color:#9ca3af;cursor:not-allowed" disabled>已生成</button>' : '<button class="btn btn-primary btn-sm" onclick="generateFromInvoice(' + r.id + ')">生成</button>'}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  const dlg = document.createElement('div');
  dlg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999';
  dlg.id = 'je-invoice-picker';
  dlg.innerHTML = `<div style="background:#fff;border-radius:8px;max-width:900px;max-height:80vh;overflow:auto;position:relative">
    <button style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:20px;cursor:pointer" onclick="document.getElementById('je-invoice-picker').remove()">×</button>
    ${html}
  </div>`;
  document.body.appendChild(dlg);
}

async function generateFromInvoice(invoiceId) {
        if (!confirm('确认从该销项发票生成记账凭证？')) return;
  try {
    const res = await api('/api/sales-invoices/' + invoiceId + '/to-journal', { method: 'POST' });
    toast(res.message, 'success');
    closeModal();
    renderJournal();
  } catch (e) {
    handleError(e, '生成');
  }
}

async function generateFromSalesInvoice(id) {
  if (!confirm('确认从该销项发票生成记账凭证？')) return;
  try {
    const res = await api('/api/sales-invoices/' + id + '/to-journal', { method: 'POST' });
    toast(res.message, 'success');
    renderSalesInvoices();
  } catch (e) {
    handleError(e, '生成');
  }
}

async function generateFromPurchaseInvoice(id) {
  if (!confirm('确认从该取得发票生成进项抵扣凭证？')) return;
  try {
    const res = await api('/api/purchase-invoices/' + id + '/to-journal', { method: 'POST' });
    toast(res.message, 'success');
    renderPurchaseInvoices();
  } catch (e) {
    handleError(e, '生成');
  }
}

async function generateFromInputVAT(id) {
  if (!confirm('确认重新生成该期间的进项抵扣凭证？')) return;
  try {
    const res = await api('/api/input-vat-deductions/' + id + '/to-journal', { method: 'POST' });
    toast(res.message, 'success');
    renderInputVATDeductions();
  } catch (e) {
    handleError(e, '生成');
  }
}

async function generateFromBankTx(id) {
  if (!confirm('确认从该银行流水生成记账凭证？')) return;
  try {
    const res = await api('/api/bank-transactions/' + id + '/to-journal', { method: 'POST' });
    toast(res.message, 'success');
    loadBankTxList();
  } catch (e) {
    handleError(e, '生成');
  }
}

function jeToggleAll(checkbox) {
  document.querySelectorAll('.je-row-check').forEach(cb => cb.checked = checkbox.checked);
  updateJeBatchBtn();
}

function jeOnCheck() {
  const all = document.querySelectorAll('.je-row-check');
  const checked = document.querySelectorAll('.je-row-check:checked');
  const selectAll = document.getElementById('je-select-all');
  if (selectAll) selectAll.checked = checked.length === all.length && all.length > 0;
  updateJeBatchBtn();
}

function updateJeBatchBtn() {
  const count = document.querySelectorAll('.je-row-check:checked').length;
  const btn = document.getElementById('jeBatchDelBtn');
  if (btn) {
    btn.textContent = count > 0 ? '🗑 批量删除（' + count + '）' : '🗑 批量删除';
    btn.disabled = count === 0;
  }
}

async function batchDeleteJe() {
  const checked = document.querySelectorAll('.je-row-check:checked');
  if (checked.length === 0) { toast('请先选择凭证', 'warning'); return; }
  // 收集所有选中凭证的分录ID
  const ids = [];
  checked.forEach(cb => {
    if (cb.dataset.allIds) {
      cb.dataset.allIds.split(',').forEach(id => ids.push(parseInt(id)));
    }
  });
  if (!confirm('确认删除选中的 ' + checked.length + ' 个凭证（共 ' + ids.length + ' 条分录）？此操作不可恢复。')) return;
  try {
    const result = await api('/api/journal-entries/batch-delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids })
    });
    toast(result.message, 'success');
    renderJournal();
  } catch (e) {
    handleError(e, '批量删除');
  }
}

async function editJeEntry(id) {
  showJournalForm(id);
}

async function deleteJeEntry(id) {
  if (!confirm('确认删除该记录？此操作不可恢复。')) return;
  try {
    const result = await api('/api/journal-entries/' + id, { method: 'DELETE' });
    toast(result.message, 'success');
    renderJournal();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function showJournalForm(entryId) {
  const isEdit = entryId && entryId !== 'null';
  let entry = null;
  if (isEdit) {
    entry = await api('/api/journal-entries/' + entryId);
  }
  // 加载末级科目和往来单位
  const [accounts, customers, suppliers, employees] = await Promise.all([
    api('/api/accounts?leaf_only=1'),
    api('/api/customers'),
    api('/api/suppliers'),
    api('/api/employees')
  ]);
  const title = isEdit ? '编辑序时账记录' : '新增序时账记录';
  const gw = entry ? entry.voucher_word : '记';
  const today = entry ? entry.entry_date : new Date().toISOString().slice(0,10);
  const period = entry ? entry.period : (currentPeriod || today.slice(0,7));
  let html = '<div class="modal-header"><h3>' + title + '</h3><button class="modal-close" onclick="closeModal()">×</button></div>';
  html += '<div class="modal-body" style="max-height:70vh;overflow-y:auto">';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">';
  html += '<div class="form-group"><label>日期 <span style="color:var(--danger)">*</span></label><input class="form-input" id="je-entry-date" type="date" value="' + today + '"></div>';
  html += '<div class="form-group"><label>期间 <span style="color:var(--danger)">*</span></label><input class="form-input" id="je-period-input" value="' + period + '"></div>';
  html += '<div class="form-group"><label>凭证字</label><select class="form-input" id="je-word-input"><option value="记"' + (gw==='记'?' selected':'') + '>记</option><option value="收"' + (gw==='收'?' selected':'') + '>收</option><option value="付"' + (gw==='付'?' selected':'') + '>付</option><option value="转"' + (gw==='转'?' selected':'') + '>转</option></select></div>';
  html += '<div class="form-group"><label>凭证号 <span style="color:var(--danger)">*</span></label><input class="form-input" id="je-voucher-no" type="number" value="' + (entry ? entry.voucher_no : '') + '"></div>';
  html += '<div class="form-group"><label>附单据</label><input class="form-input" id="je-attach" type="number" value="' + (entry ? entry.attach_count : '0') + '"></div>';
  html += '<div class="form-group"><label>制单人</label><input class="form-input" id="je-prepared" value="' + (entry ? escapeHtml(entry.prepared_by) : '') + '"></div>';
  html += '<div class="form-group"><label>复核人</label><input class="form-input" id="je-reviewed-by" value="' + (entry ? escapeHtml(entry.reviewed_by) : '') + '"></div>';
  html += '<div class="form-group"><label>复核状态</label><select class="form-input" id="je-is-reviewed"><option value="0"' + (entry && !entry.is_reviewed ? ' selected' : '') + '>未复核</option><option value="1"' + (entry && entry.is_reviewed ? ' selected' : '') + '>已复核</option></select></div>';
  html += '</div>';
  html += '<div class="form-group"><label>摘要</label><textarea class="form-input" id="je-summary" rows="3" style="width:100%">' + (entry ? escapeHtml(entry.summary) : '') + '</textarea></div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:16px">';
  // 科目下拉（末级科目）
  const selCode = entry ? entry.account_code : '';
  html += '<div class="form-group"><label>科目 <span style="color:var(--danger)">*</span></label><select class="form-input" id="je-account-select" onchange="onJeAccountChange()"><option value="">请选择科目</option>';
  accounts.forEach(a => {
    const displayName = a.full_name || (a.code + ' ' + a.name);
    html += '<option value="' + a.code + '" data-name="' + escapeHtml(a.name) + '" data-full-name="' + escapeHtml(displayName) + '"' + (a.code === selCode ? ' selected' : '') + '>' + displayName + '</option>';
  });
  html += '</select></div>';
  html += '<input type="hidden" id="je-account-code" value="' + (entry ? entry.account_code : '') + '">';
  html += '<input type="hidden" id="je-account-name" value="' + (entry ? escapeHtml(entry.account_name) : '') + '">';
  html += '<div class="form-group"><label>借方金额</label><input class="form-input" id="je-debit" type="number" step="0.01" value="' + (entry ? entry.debit_amount : '') + '"></div>';
  html += '<div class="form-group"><label>贷方金额</label><input class="form-input" id="je-credit" type="number" step="0.01" value="' + (entry ? entry.credit_amount : '') + '"></div>';
  html += '<div class="form-group"><label>备注</label><input class="form-input" id="je-remark" value="' + (entry ? escapeHtml(entry.remark) : '') + '"></div>';
  // 往来项目下拉（仅往来科目时显示）
  const selContact = entry ? entry.contact_project : '';
  html += '<div class="form-group" id="je-contact-wrap"><label>往来项目</label><select class="form-input" id="je-contact"><option value="">无</option>';
  if (customers.length) { html += '<optgroup label="── 客户 ──">'; customers.forEach(c => { html += '<option value="' + escapeHtml(c.name) + '"' + (c.name === selContact ? ' selected' : '') + '>' + c.name + '</option>'; }); html += '</optgroup>'; }
  if (suppliers.length) { html += '<optgroup label="── 供应商 ──">'; suppliers.forEach(s => { html += '<option value="' + escapeHtml(s.name) + '"' + (s.name === selContact ? ' selected' : '') + '>' + s.name + '</option>'; }); html += '</optgroup>'; }
  if (employees.length) { html += '<optgroup label="── 人员 ──">'; employees.forEach(e => { html += '<option value="' + escapeHtml(e.name) + '"' + (e.name === selContact ? ' selected' : '') + '>' + e.name + '</option>'; }); html += '</optgroup>'; }
  html += '</select></div>';
  // 主营业务收入子科目选择
  html += '<div class="form-group" id="je-revenue-sub-wrap" style="display:none"><label>收入明细</label><select class="form-input" id="je-revenue-sub"><option value="">自动（6001）</option></select></div>';
  html += '<div class="form-group"><label>规格型号</label><input class="form-input" id="je-spec" value="' + (entry ? escapeHtml(entry.spec_model) : '') + '"></div>';
  html += '<div class="form-group"><label>数量</label><input class="form-input" id="je-qty" type="number" step="0.01" value="' + (entry ? entry.quantity : '') + '"></div>';
  html += '<div class="form-group"><label>单位</label><input class="form-input" id="je-unit-val" value="' + (entry ? escapeHtml(entry.unit) : '') + '"></div>';
  html += '<div class="form-group"><label>单价</label><input class="form-input" id="je-price" type="number" step="0.01" value="' + (entry ? entry.unit_price : '') + '"></div>';
  html += '</div>';
  html += '</div>';
  html += '<div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveJournal(' + (isEdit ? entryId : 'null') + ')">保存</button></div>';
  showModal(html);
  // 初始化往来项目显隐 + 收入明细状态
  setTimeout(() => onJeAccountChange(), 50);
}

function onJeAccountChange() {
  const sel = document.getElementById('je-account-select');
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  const code = opt.value;
  const name = opt.getAttribute('data-name') || '';
  const fullName = opt.getAttribute('data-full-name') || (code + ' ' + name);
  document.getElementById('je-account-code').value = code;
  document.getElementById('je-account-name').value = name;

  // 往来项目：仅往来科目显示
  const contactWrap = document.getElementById('je-contact-wrap');
  if (contactWrap) {
    const往来前缀 = ['1121','1122','1123','1221','2201','2202','2203','2241'];
    const is往来 = 往来前缀.some(p => code.startsWith(p));
    contactWrap.style.display = is往来 ? '' : 'none';
    if (!is往来) {
      const contactSel = document.getElementById('je-contact');
      if (contactSel) contactSel.value = '';
    }
  }

  // 主营业务收入：显示子科目
  const revWrap = document.getElementById('je-revenue-sub-wrap');
  if (revWrap) {
    if (code === '6001') {
      revWrap.style.display = '';
      const revSel = document.getElementById('je-revenue-sub');
      if (revSel && revSel.options.length <= 1) {
        // 加载6001下子科目
        revSel.innerHTML = '<option value="">自动（6001 主营业务收入）</option>';
        api('/api/accounts?company_id=' + currentCompanyId).then(accts => {
          const subs = accts.filter(a => a.parent_code === '6001');
          subs.forEach(a => {
            revSel.innerHTML += '<option value="' + a.code + '" data-name="' + escapeHtml(a.name) + '" data-full-name="' + escapeHtml(a.full_name || (a.code + ' ' + a.name)) + '">' + (a.full_name || (a.code + ' ' + a.name)) + '</option>';
          });
        });
      }
    } else {
      revWrap.style.display = 'none';
      const revSel = document.getElementById('je-revenue-sub');
      if (revSel) revSel.value = '';
    }
  }
}

async function saveJournal(entryId) {
  const isEdit = entryId && entryId !== 'null';
  // 主营业务收入子科目：优先使用子科目
  let account_code = document.getElementById('je-account-code').value;
  let account_name = document.getElementById('je-account-name').value;
  const revSub = document.getElementById('je-revenue-sub');
  if (revSub && revSub.value) {
    const subOpt = revSub.options[revSub.selectedIndex];
    if (subOpt.value) {
      account_code = subOpt.value;
      account_name = subOpt.getAttribute('data-name') || account_name;
    }
  }
  const body = {
    entry_date: document.getElementById('je-entry-date').value,
    period: document.getElementById('je-period-input').value,
    voucher_word: document.getElementById('je-word-input').value,
    voucher_no: parseInt(document.getElementById('je-voucher-no').value) || 0,
    attach_count: parseInt(document.getElementById('je-attach').value) || 0,
    summary: document.getElementById('je-summary').value,
    account_code: account_code,
    account_name: account_name,
    debit_amount: parseFloat(document.getElementById('je-debit').value) || 0,
    credit_amount: parseFloat(document.getElementById('je-credit').value) || 0,
    prepared_by: document.getElementById('je-prepared').value,
    reviewed_by: document.getElementById('je-reviewed-by').value,
    is_reviewed: document.getElementById('je-is-reviewed').value === '1',
    remark: document.getElementById('je-remark').value,
    contact_project: document.getElementById('je-contact')?.value || '',
    spec_model: document.getElementById('je-spec')?.value || '',
    quantity: parseFloat(document.getElementById('je-qty')?.value) || 0,
    unit: document.getElementById('je-unit-val')?.value || '',
    unit_price: parseFloat(document.getElementById('je-price')?.value) || 0,
  };
  if (!body.entry_date || !body.period || !body.voucher_no || !body.account_code) {
    toast('日期、期间、凭证号、科目编码为必填项', 'error'); return;
  }
  try {
    if (isEdit) {
      await api('/api/journal-entries/' + entryId, { method: 'PUT', body: JSON.stringify(body) });
      toast('更新成功', 'success');
    } else {
      await api('/api/journal-entries', { method: 'POST', body: JSON.stringify(body) });
      toast('创建成功', 'success');
    }
    closeModal();
    renderJournal();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteJournal(id) {
  if (!confirm('确认删除此记录？')) return;
  try {
    await api('/api/journal-entries/' + id, { method: 'DELETE' });
    toast('删除成功', 'success');
    renderJournal();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ==================== 序时账期间选择栏 ====================

function buildJePeriodBar() {
  let bar = document.getElementById('je-period-bar');
  if (!bar) return;
  bar.innerHTML =
    '<div class="period-stepper">' +
      '<select id="je-from-y" class="period-selector-year">' + jeYearOptions() + '</select>' +
      '<div class="stepper-arrows">' +
        '<button class="stepper-btn stepper-up" data-side="from" data-type="year" data-delta="1" title="下一年">▲</button>' +
        '<button class="stepper-btn stepper-down" data-side="from" data-type="year" data-delta="-1" title="上一年">▼</button>' +
      '</div>' +
    '</div>' +
    '<div class="period-stepper">' +
      '<select id="je-from-m" class="period-selector-month">' + jeMonthOptions() + '</select>' +
      '<div class="stepper-arrows">' +
        '<button class="stepper-btn stepper-up" data-side="from" data-type="month" data-delta="1" title="下一月">▲</button>' +
        '<button class="stepper-btn stepper-down" data-side="from" data-type="month" data-delta="-1" title="上一月">▼</button>' +
      '</div>' +
    '</div>' +
    '<span style="color:#9ca3af;font-size:13px;line-height:32px">至</span>' +
    '<div class="period-stepper">' +
      '<select id="je-to-y" class="period-selector-year">' + jeYearOptions() + '</select>' +
      '<div class="stepper-arrows">' +
        '<button class="stepper-btn stepper-up" data-side="to" data-type="year" data-delta="1" title="下一年">▲</button>' +
        '<button class="stepper-btn stepper-down" data-side="to" data-type="year" data-delta="-1" title="上一年">▼</button>' +
      '</div>' +
    '</div>' +
    '<div class="period-stepper">' +
      '<select id="je-to-m" class="period-selector-month">' + jeMonthOptions() + '</select>' +
      '<div class="stepper-arrows">' +
        '<button class="stepper-btn stepper-up" data-side="to" data-type="month" data-delta="1" title="下一月">▲</button>' +
        '<button class="stepper-btn stepper-down" data-side="to" data-type="month" data-delta="-1" title="上一月">▼</button>' +
      '</div>' +
    '</div>' +
    '<button class="btn btn-primary je-query-btn">🔍 查询</button>' +
    '<button class="je-clear-btn" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px">清除</button>';

  // 为所有 stepper 按钮绑定点击事件
  bar.querySelectorAll('.stepper-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var side = this.getAttribute('data-side');
      var type = this.getAttribute('data-type');
      var delta = parseInt(this.getAttribute('data-delta'));
      if (type === 'year') stepJeYear(side, delta);
      else stepJeMonth(side, delta);
    });
  });

  // 月份下拉变化时触发
  bar.querySelectorAll('.period-selector-month').forEach(function(sel) {
    sel.addEventListener('change', onJePeriodChange);
  });
  bar.querySelectorAll('.period-selector-year').forEach(function(sel) {
    sel.addEventListener('change', onJePeriodChange);
  });

  // 查询按钮
  var queryBtn = bar.querySelector('.je-query-btn');
  if (queryBtn) queryBtn.addEventListener('click', onJePeriodChange);

  // 清除按钮
  var clearBtn = bar.querySelector('.je-clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', clearJePeriod);

  // 默认设置当前期间
  setJePeriod('from', currentPeriod);
  setJePeriod('to', currentPeriod);
}

function jeYearOptions() {
  let now = new Date(), y = now.getFullYear(), ops = '<option value="">年</option>';
  for (let i = y - 5; i <= y + 5; i++) ops += '<option value="' + i + '">' + i + '年</option>';
  return ops;
}

function jeMonthOptions() {
  return '<option value="">月</option><option value="01">01月</option><option value="02">02月</option><option value="03">03月</option><option value="04">04月</option><option value="05">05月</option><option value="06">06月</option><option value="07">07月</option><option value="08">08月</option><option value="09">09月</option><option value="10">10月</option><option value="11">11月</option><option value="12">12月</option>';
}

function setJePeriod(side, period) {
  if (!period) return;
  let parts = period.split('-');
  if (parts.length < 2) return;
  let ySel = document.getElementById('je-' + side + '-y');
  let mSel = document.getElementById('je-' + side + '-m');
  if (ySel) ySel.value = parts[0];
  if (mSel) mSel.value = parts[1];
}

function getJePeriod(side) {
  let y = document.getElementById('je-' + side + '-y')?.value;
  let m = document.getElementById('je-' + side + '-m')?.value;
  if (!y || !m) return '';
  return y + '-' + m;
}

function stepJeYear(side, delta) {
  let sel = document.getElementById('je-' + side + '-y');
  if (!sel || !sel.value) return;
  sel.value = parseInt(sel.value) + delta;
  onJePeriodChange();
}

function stepJeMonth(side, delta) {
  let ySel = document.getElementById('je-' + side + '-y');
  let mSel = document.getElementById('je-' + side + '-m');
  if (!ySel || !mSel || !mSel.value) return;
  let y = parseInt(ySel.value) || new Date().getFullYear();
  let m = parseInt(mSel.value) + delta;
  if (m > 12) { m = 1; y++; }
  else if (m < 1) { m = 12; y--; }
  ySel.value = y;
  mSel.value = String(m).padStart(2, '0');
  onJePeriodChange();
}

function onJePeriodChange() {
  if (_jeData) renderJeTable(_jeData);
}

function clearJePeriod() {
  document.getElementById('je-from-y').value = '';
  document.getElementById('je-from-m').value = '';
  document.getElementById('je-to-y').value = '';
  document.getElementById('je-to-m').value = '';
  if (_jeData) renderJeTable(_jeData);
}
