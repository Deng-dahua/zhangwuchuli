// ==================== 文件导入 - 列映射 ====================

function showUploadModal(module) {
  const titles = { 'bank-transaction': '导入银行流水', 'sales-invoice': '导入开具发票', 'purchase-invoice': '导入取得发票', 'input-vat-deduction': '导入进项抵扣', 'employee': '导入人员档案', 'customer': '导入客户档案', 'supplier': '导入供应商档案', 'department': '导入部门档案' };
  const modal = createModal(titles[module] || '导入文件', `
    <p style="margin-bottom:12px;color:var(--gray-500);">上传 xlsx 或 csv 文件，系统将自动识别表头。</p>
    <div style="border:2px dashed var(--gray-300);border-radius:8px;padding:30px;text-align:center;margin-bottom:16px;cursor:pointer;" onclick="document.getElementById('upload-file-input').click()">
      <div style="font-size:32px;margin-bottom:8px;">📁</div>
      <div style="color:var(--gray-500);">点击选择文件 或拖拽到此处</div>
      <div style="font-size:12px;color:var(--gray-400);margin-top:4px;">支持 .xlsx .csv</div>
    </div>
    <input type="file" id="upload-file-input" accept=".xlsx,.xls,.csv" style="display:none;" onchange="handleFileSelect(this, '${module}')">
    <div id="upload-progress" style="display:none;text-align:center;color:var(--primary);"></div>
    <div id="mapping-section" style="display:none;"></div>
    <div id="mapping-error" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:10px 14px;border-radius:6px;font-size:13px;margin-top:12px;"></div>
    <div id="mapping-warning" style="display:none;background:#fffbeb;border:1px solid #fde68a;color:#b45309;padding:10px 14px;border-radius:6px;font-size:13px;margin-top:12px;"></div>
    <div style="text-align:right;margin-top:16px;"><button class="btn" onclick="closeModal()">关闭</button></div>
  `, 'modal-xl');
  document.body.appendChild(modal);
}

async function handleFileSelect(input, module) {
  const file = input.files[0];
  if (!file) return;
  _importFile = file;
  _importModule = module;

  // 部门档案：直接导入，跳过列映射
  if (module === 'department') {
    document.getElementById('upload-progress').style.display = 'block';
    document.getElementById('upload-progress').innerText = '正在导入部门...';
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('company_id', currentCompanyId || 1);
      const resp = await fetch('/api/departments/import?company_id=' + (currentCompanyId || 1), { method: 'POST', body: fd });
      const result = await resp.json();
      if (resp.ok) {
        toast(result.message || '导入成功', 'success');
        closeModal();
        // 渲染到部门页面容器，避免覆盖当前页面
        const deptContainer = document.getElementById('page-departments');
        if (deptContainer) { renderDepartments(deptContainer); }
        else { renderDepartments(); }
      } else {
        toast(result.detail || '导入失败', 'error');
      }
    } catch(e) {
      handleError(e, '导入');
    }
    document.getElementById('upload-progress').style.display = 'none';
    return;
  }

  document.getElementById('upload-progress').style.display = 'block';
  document.getElementById('upload-progress').innerText = '正在分析文件表头...';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('module', module);

  let bankConfigId = null;
  if (module === 'bank-transaction' && _currentBankId) {
    bankConfigId = _currentBankId;
  }
  _importBankConfigId = bankConfigId;
  if (bankConfigId) {
    formData.append('bank_config_id', bankConfigId);
  }

  const resp = await fetch('/api/file/analyze-headers', { method: 'POST', body: formData });
  const result = await resp.json();

  document.getElementById('upload-progress').style.display = 'none';

  if (result.error) {
    toast(result.error, 'error');
    return;
  }

  // 渲染列映射界面
  buildMappingUI(result, module, file, bankConfigId);
}

function buildMappingUI(result, module, file, bankConfigId) {
  const fieldLabels = {
    'transaction_date': '交易日期', 'transaction_time': '交易时间', 'application_date': '申请日期',
    'voucher_no': '凭证号', 'debit_amount': '借方金额', 'credit_amount': '贷方金额', 'balance': '余额',
    'counterparty_account': '对方账号', 'counterparty_name': '对方户名', 'counterparty_bank': '对方行名',
    'transaction_serial_no': '交易流水号', 'voucher_seq': '传票序号', 'record_status': '记录状态',
    'summary': '摘要', 'transaction_remark': '交易附言', 'account_type': '客户账户类型',
    // 旧字段（保留向后兼容）
    'amount': '金额', 'transaction_type': '交易类型', 'payment_method': '结算方式',
    'reference_no': '流水号', 'remark': '备注',
    'invoice_code': '发票代码', 'invoice_no': '发票号码', 'digital_invoice_no': '数电发票号码',
    'seller_tax_no': '销方识别号', 'seller_name': '销方名称',
    'buyer_tax_no': '购方识别号', 'buyer_name': '购买方名称',
    'invoice_date': '开票日期', 'tax_category_code': '税收分类编码',
    'specific_business_type': '特定业务类型',
    'goods_name': '货物或应税劳务名称', 'spec': '规格型号', 'unit': '单位',
    'quantity': '数量', 'unit_price': '单价',
    'tax_rate': '税率', 'tax_amount': '税额', 'total_amount': '价税合计',
    'invoice_source': '发票来源', 'invoice_category': '发票票种', 'status': '发票状态',
    'is_positive': '是否正数发票', 'invoice_risk_level': '发票风险等级', 'issuer': '开票人',
    'certification_status': '认证状态', 'certification_date': '认证日期', 'deduction_period': '抵扣期间',
    'check_status': '勾选状态', 'domestic_sale_cert_no': '转内销证明编号',
    'seller_tax_id': '销售方纳税人识别号', 'invoice_category_label': '票种标签',
    'check_time': '勾选时间', 'risk_level': '发票风险等级',
    'deductible_tax_amount': '有效抵扣税额',
    'invoice_status': '发票状态',
    // 人员/客户/供应商
    'code': '编码', 'name': '名称', 'id_card': '身份证号',
    'uscc': '统一社会信用代码',
    'email': '邮箱', 'salary': '基本工资', 'leave_date': '离职日期',
    'tax_no': '税号', 'contact': '联系人', 'phone': '联系电话',
    'address': '地址', 'credit_limit': '信用额度', 'payment_terms': '账期(天)',
    'bank_name': '开户银行', 'bank_account': '银行账号',
    'is_active': '启用状态',
  };

  const fieldOrder = result.field_order; // 发票模块用平铺列表
  const groups = result.field_groups || {};  // 其他模块用分组

  let mappingHtml = '<div style="margin-top:12px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
  mappingHtml += '<h4 style="margin:0;">列映射配置</h4>';
  mappingHtml += `<span style="font-size:12px;color:var(--gray-500);">${result.file_name} | ${result.total_rows} 行 | ${result.headers.length} 列</span></div>`;

  if (fieldOrder) {
    // 发票模块：26字段严格按顺序，3列网格平铺
    mappingHtml += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px 12px;max-height:60vh;overflow-y:auto;padding:2px;">';
    fieldOrder.forEach((field, idx) => {
      const label = (module === 'customer' && field === 'name') ? '客户名称' : (module === 'supplier' && field === 'name') ? '供应商名称' : (fieldLabels[field] || field);
      mappingHtml += `<div style="display:flex;align-items:center;gap:6px;font-size:12px;padding:4px 0;border-bottom:1px solid var(--gray-100);">
        <span style="color:var(--gray-400);min-width:20px;text-align:right;flex-shrink:0;">${idx + 1}.</span>
        <span style="width:90px;color:var(--gray-700);flex-shrink:0;white-space:nowrap;">${label}</span>
        <select id="map-${field}" style="flex:1;padding:3px 6px;border:1px solid var(--gray-300);border-radius:4px;font-size:11px;background:#fff;min-width:0;">
          <option value="">-- 不映射 --</option>
          ${result.headers.map(h => `<option value="${h}">${h}</option>`).join('')}
        </select>
      </div>`;
    });
    mappingHtml += '</div>';
  } else {
    // 其他模块：分组卡片
    mappingHtml += '<div class="mapping-grid">';
    for (const [groupName, fields] of Object.entries(groups)) {
      mappingHtml += `<div class="mapping-card">`;
      mappingHtml += `<div class="mapping-card-header">${groupName}</div>`;
      mappingHtml += '<div class="mapping-card-body">';
      for (const field of fields) {
        const label = (module === 'customer' && field === 'name') ? '客户名称' : (module === 'supplier' && field === 'name') ? '供应商名称' : (fieldLabels[field] || field);
        mappingHtml += `<div class="mapping-row">
          <span class="mapping-row-label">${label}</span>
          <select id="map-${field}">
            <option value="">-- 不映射 --</option>
            ${result.headers.map(h => `<option value="${h}">${h}</option>`).join('')}
          </select>
        </div>`;
      }
      mappingHtml += '</div></div>';
    }
    mappingHtml += '</div>';
  }

  // 自动猜测映射
  const autoGuess = {};
  const allFields = fieldOrder || [].concat(...Object.values(groups));
  for (const field of allFields) {
    for (const h of result.headers) {
      const hl = h.toLowerCase();
      const fl = field.toLowerCase();
      const km = {

          'transaction_date': ['交易日期', '日期', 'date'],
          'transaction_time': ['交易时间', '时间', 'time'],
          'application_date': ['申请日期', '申请', 'application'],
          'voucher_no': ['凭证号', 'voucher'],
          'debit_amount': ['借方金额', '借方', 'debit'],
          'credit_amount': ['贷方金额', '贷方', 'credit'],
          'balance': ['余额', 'bal'],
          'counterparty_account': ['对方账号', '账号', 'account'],
          'counterparty_name': ['对方户名', '户名', '对方名称'],
          'counterparty_bank': ['对方行名', '行名', '开户行', '银行名称'],
          'transaction_serial_no': ['交易流水号', '流水号', 'serial'],
          'voucher_seq': ['传票序号', '传票', 'seq'],
          'record_status': ['记录状态', '状态', 'status'],
          'summary': ['摘要', '用途', '说明'],
          'transaction_remark': ['交易附言', '附言', 'remark'],
          'account_type': ['客户账户类型', '账户类型', 'account_type'],
          // 旧字段（保留向后兼容）
          'amount': ['金额', 'amt', '不含税'],
          'reference_no': ['参考号', 'ref'],
          'invoice_no': ['发票号码', 'inv_no'],
          'invoice_code': ['发票代码', 'inv_code'],
          'invoice_date': ['开票日期', 'inv_date', '发票日期'],
          'digital_invoice_no': ['数电', '全电'],
          'seller_tax_no': ['销方识别号', '销方税号', 'seller_tax'],
          'seller_name': ['销方名称', 'seller_name', '销售方名称'],
          'buyer_tax_no': ['购方识别号', '购方税号', 'buyer_tax'],
          'buyer_name': ['购买方', '购方名称', 'buyer_name'],
          'tax_category_code': ['税收分类', '分类编码', 'tax_category'],
          'specific_business_type': ['特定业务', '业务类型', 'specific'],
          'goods_name': ['货物或应税劳务', '货物', 'goods_name', 'goods'],
          'spec': ['规格', 'spec'],
          'unit': ['单位', 'unit'],
          'quantity': ['数量', 'qty', 'quantity'],
          'unit_price': ['单价', 'price', 'unit_price'],
          'tax_rate': ['税率', 'tax_rate'],
          'tax_amount': ['税额', 'tax_amt'],
          'total_amount': ['价税合计', 'total', '合计'],
          'invoice_source': ['发票来源', '来源', 'source'],
          'invoice_category': ['发票票种', '票种', 'category'],
          'status': ['发票状态'],
          'is_positive': ['正数', 'positive', '是否正数'],
          'invoice_risk_level': ['风险等级', 'risk', '风险'],
          'issuer': ['开票人', 'issuer'],
          'certification_status': ['认证状态', 'cert'],
          'certification_date': ['认证日期'],
          'deduction_period': ['抵扣期间', '抵扣期', 'deduction'],
          'remark': ['备注', 'remark'],
          'check_status': ['勾选状态', '勾选', 'check'],
          'domestic_sale_cert_no': ['转内销', '转内销证明', 'domestic'],
          'seller_tax_id': ['销方识别号', '销方税号', '销售方纳税人', 'seller_tax_id'],
          'invoice_category_label': ['票种标签', '标签', 'label'],
          'check_time': ['勾选时间', 'check_time'],
          'risk_level': ['风险等级', 'risk_level'],
          'deductible_tax_amount': ['有效抵扣', '可抵扣', 'deductible'],
          'invoice_status': ['发票状态', 'invoice_status'],
          // 人员/客户/供应商
          'code': ['编码', '工号', '编号', 'code'],
          'name': ['名称', '姓名', '名字', 'name'],
          'id_card': ['身份证', '身份证号', 'id_card'],
          'uscc': ['统一社会信用代码', '信用代码', 'uscc'],
          'email': ['邮箱', 'email'],
          'salary': ['工资', '基本工资', 'salary'],
          'leave_date': ['离职日期', '离职', 'leave_date'],
          'tax_no': ['税号', '纳税人识别号', 'tax_no'],
          'contact': ['联系人', '经办人', 'contact'],
          'phone': ['电话', '联系电话', '手机', 'phone'],
          'address': ['地址', 'address'],
          'credit_limit': ['信用额度', '额度', 'credit'],
          'payment_terms': ['账期', '付款期限', 'payment_terms'],
          'bank_name': ['开户银行', '开户行', '银行', 'bank_name'],
          'bank_account': ['银行账号', '账号', 'account'],
          'is_active': ['启用', '状态', 'is_active', 'active']
        };
        const keys = km[field] || [fl];
        if (hl.includes(fl) || fl.includes(hl) || keys.some(k => hl.includes(k))) {
          autoGuess[field] = h;
          break;
        }
      }
  }

  mappingHtml += `
    <div style="margin-top:12px;">
      <label style="font-size:12px;display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="save-as-template"> 保存此映射为模板，下次导入自动匹配
      </label>
      <input id="template-name" placeholder="模板名称（可选）" style="margin-top:4px;padding:4px 8px;border:1px solid var(--gray-300);border-radius:4px;font-size:12px;width:200px;display:none;">
    </div>
    <div style="text-align:right;margin-top:16px;">
      <button class="btn" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="doImportWithMapping('${module}', '${file.name}', ${bankConfigId || 'null'})">开始导入</button>
    </div>`;

  document.getElementById('mapping-section').innerHTML = mappingHtml;
  document.getElementById('mapping-section').style.display = 'block';

  // 应用自动猜测
  setTimeout(() => {
    for (const [field, col] of Object.entries(autoGuess)) {
      const sel = document.getElementById('map-' + field);
      if (sel) sel.value = col;
    }
    document.getElementById('save-as-template').onchange = function() {
      document.getElementById('template-name').style.display = this.checked ? 'block' : 'none';
    };
  }, 100);
}

async function doImportWithMapping(module, fileName, bankConfigId) {
  const mapping = {};
  const selects = document.querySelectorAll('[id^="map-"]');
  selects.forEach(sel => {
    if (sel.value) {
      const field = sel.id.replace('map-', '');
      mapping[field] = sel.value;
    }
  });

  // 隐藏旧错误提示
  const errEl = document.getElementById('mapping-error');
  const warnEl = document.getElementById('mapping-warning');
  if (errEl) { errEl.style.display = 'none'; errEl.innerText = ''; }
  if (warnEl) { warnEl.style.display = 'none'; warnEl.innerText = ''; }

  if (Object.keys(mapping).length === 0) {
    if (errEl) { errEl.innerText = '列映射配置错误：请至少映射一个字段，必须将Excel列与系统字段进行对应后方可导入。'; errEl.style.display = 'block'; }
    return;
  }

  // 人员/客户/供应商：检查必需字段
  const requiredFields = {
    employee: { fields: ['name'], label: '人员档案' },
    customer: { fields: ['name'], label: '客户档案' },
    supplier: { fields: ['name'], label: '供应商档案' }
  };
  if (requiredFields[module]) {
    const rf = requiredFields[module];
    const missing = rf.fields.filter(f => !mapping[f]);
    if (missing.length > 0) {
      const fieldLabels = { name: module === 'customer' ? '客户名称' : (module === 'supplier' ? '供应商名称' : '名称'), code: '编码' };
      const missingNames = missing.map(f => fieldLabels[f] || f).join('、');
      if (errEl) { errEl.innerText = `列映射配置错误：${rf.label}导入时必须映射「${missingNames}」字段，请检查列对应关系。`; errEl.style.display = 'block'; }
      return;
    }
  }

  // 保存模板
  if (document.getElementById('save-as-template')?.checked) {
    const tplName = document.getElementById('template-name')?.value || fileName + '_模板';
    await api('/api/column-templates', {
      method: 'POST',
      body: {
        module: module,
        template_name: tplName,
        bank_config_id: _importBankConfigId || null,
        column_mapping: JSON.stringify(mapping)
      }
    });
  }

  // 使用全局保存的 File 对象（避免第一次 fetch 后文件流已消费）
  const fileToUse = _importFile;
  if (!fileToUse) { toast('请重新选择文件', 'error'); return; }

  const formData = new FormData();
  formData.append('file', fileToUse);
  formData.append('module', module);
  formData.append('column_mapping', JSON.stringify(mapping));
  formData.append('company_id', currentCompanyId);
  if (_importBankConfigId) formData.append('bank_config_id', _importBankConfigId);

  // 第一轮：带去重导入
  document.getElementById('upload-progress').innerText = '正在导入数据...';
  document.getElementById('upload-progress').style.display = 'block';

  const resp = await fetch('/api/file/import-with-mapping', { method: 'POST', body: formData });
  const result = await resp.json();

  document.getElementById('upload-progress').style.display = 'none';

  if (result.error) {
    if (errEl) { errEl.innerText = '导入失败：' + result.error; errEl.style.display = 'block'; }
    return;
  }

  closeModal();
  // 刷新列表（同原代码）
  if (module === 'bank-transaction') renderBankTransactions();
  else if (module === 'sales-invoice') renderSalesInvoices();
  else if (module === 'purchase-invoice') renderPurchaseInvoices();
  else if (module === 'input-vat-deduction') renderInputVATDeductions();
  else if (module === 'employee') { const c = document.getElementById('page-employees'); if (c) renderEmployees(c); else renderEmployees(); }
  else if (module === 'customer') { const c = document.getElementById('page-customers'); if (c) renderCustomers(c); else renderCustomers(); }
  else if (module === 'supplier') { const c = document.getElementById('page-suppliers'); if (c) renderSuppliers(c); else renderSuppliers(); }
  let msg = `成功导入 ${result.imported}/${result.total} 条记录`;
  if (result.skipped > 0) {
    msg += `，跳过 ${result.skipped} 条重复记录`;
  }
  if (result.errors && result.errors.length > 0) {
    msg += `，${result.errors.length} 条错误`;
  }
  toast(msg, 'success');
  if (result.errors && result.errors.length > 0) console.warn('Import errors:', result.errors);
  if (result.infos && result.infos.length > 0) console.log('Import infos:', result.infos);
}

