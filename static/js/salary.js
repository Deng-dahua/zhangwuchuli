/**
 * 工资薪金所得模块 - 前端
 * 功能：按期间管理工资表、导入税务模板、自动建人员档案、计算个税
 */
let currentSalaryPeriod = '';
let currentSalaryRecords = [];
let currentEditingSalaryId = null;

// ========== 页面渲染 ==========

function showSalaryPage(container) {
    const period = getCurrentPeriod();
    currentSalaryPeriod = period;
    api('/api/salary/periods').then(periods => {
        if (periods && periods.length > 0 && !currentSalaryPeriod) {
            currentSalaryPeriod = periods[0];
        }
        renderSalaryPage(container);
        loadSalaryData();
    }).catch(() => {
        renderSalaryPage(container);
        loadSalaryData();
    });
}

function renderSalaryPage(container) {
    const app = container || document.getElementById('page-salary') || document.getElementById('content-area');
    app.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;min-height:0';
    app.innerHTML = `
        <div class="page-header">
            <h2>工资薪金所得</h2>
            <div class="page-actions">
                <input type="text" id="salary-period-input" value="${currentSalaryPeriod}" placeholder="期间 如 2025-10" style="width:140px">
                <button class="btn btn-primary" onclick="loadSalaryData()">📅 查询</button>
                <button class="btn btn-success" onclick="showSalaryAddModal()">➕ 新增</button>
                <button class="btn btn-warning" onclick="showSalaryImportModal()">📁 导入Excel</button>
                <button class="btn btn-info" onclick="autoCreateEmployeesFromSalary()">👤 自动建人员档案</button>
                <button class="btn btn-secondary" onclick="computeSalaryTax()">🧮 计算个税</button>
                <button class="btn btn-danger" onclick="batchDeleteSalary()">🗑️ 批量删除</button>
            </div>
        </div>
        <div id="salary-stats" class="stats-cards"></div>
        <div class="table-wrap" style="flex:1;overflow:auto;min-height:0;padding-bottom:4px">
            <table class="data-table" id="salary-table">
                <thead>
                    <tr>
                        <th style="width:36px"><input type="checkbox" id="salary-select-all" onchange="toggleSelectAll('salary')" title="全选"></th>
                        <th>工号</th>
                        <th>姓名</th>
                        <th>证件类型</th>
                        <th>证件号码</th>
                        <th>税款所属期起</th>
                        <th>税款所属期止</th>
                        <th>所得项目</th>
                        <th style="text-align:right">本期收入</th>
                        <th style="text-align:right">本期费用</th>
                        <th style="text-align:right">本期免税收入</th>
                        <th style="text-align:right">本期基本养老保险费</th>
                        <th style="text-align:right">本期基本医疗保险费</th>
                        <th style="text-align:right">本期失业保险费</th>
                        <th style="text-align:right">本期住房公积金</th>
                        <th style="text-align:right">本期企业年金</th>
                        <th style="text-align:right">本期商业健康保险费</th>
                        <th style="text-align:right">本期税延养老保险费</th>
                        <th style="text-align:right">本期其他扣除</th>
                        <th style="text-align:right">累计收入额</th>
                        <th style="text-align:right">累计免税收入</th>
                        <th style="text-align:right">累计减除费用</th>
                        <th style="text-align:right">累计专项扣除</th>
                        <th style="text-align:right">累计子女教育</th>
                        <th style="text-align:right">累计继续教育</th>
                        <th style="text-align:right">累计住房贷款利息</th>
                        <th style="text-align:right">累计住房租金</th>
                        <th style="text-align:right">累计赡养老人</th>
                        <th style="text-align:right">累计3岁以下婴幼儿照护</th>
                        <th style="text-align:right">累计个人养老金</th>
                        <th style="text-align:right">累计其他扣除</th>
                        <th style="text-align:right">累计准予扣除的捐赠</th>
                        <th style="text-align:right">其他单位累计收入</th>
                        <th style="text-align:right">其他单位累计扣除</th>
                        <th style="text-align:right">其他单位累计减免税额</th>
                        <th style="text-align:right">其他单位累计已缴税额</th>
                        <th style="text-align:right">累计应纳税所得额</th>
                        <th style="text-align:center">税率</th>
                        <th style="text-align:right">速算扣除数</th>
                        <th style="text-align:right">累计应纳税额</th>
                        <th style="text-align:right">累计减免税额</th>
                        <th style="text-align:right">累计应扣缴税额</th>
                        <th style="text-align:right">已缴税额</th>
                        <th style="text-align:right">应补(退)税额</th>
                        <th style="text-align:right">实发工资</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody id="salary-tbody">
                    <tr><td colspan="45" style="text-align:center;color:#999">加载中...</td></tr>
                </tbody>
            </table>
        </div>
    `;
}

// ========== 数据加载 ==========

function loadSalaryData() {
    const periodInput = document.getElementById('salary-period-input');
    currentSalaryPeriod = periodInput ? periodInput.value : getCurrentPeriod();

    // 加载统计
    api('/api/salary/stats?period=' + encodeURIComponent(currentSalaryPeriod)).then(stats => {
        renderSalaryStats(stats);
    }).catch(() => {});

    // 加载列表
    api('/api/salary/records?period=' + encodeURIComponent(currentSalaryPeriod)).then(data => {
        currentSalaryRecords = data;
        renderSalaryTable(data);
    }).catch(err => {
        document.getElementById('salary-tbody').innerHTML =
            '<tr><td colspan="45" style="text-align:center;color:#f44">加载失败：' + (err.message || '') + '</td></tr>';
    });
}

function renderSalaryStats(stats) {
    const el = document.getElementById('salary-stats');
    if (!el) return;
    el.innerHTML = `
        <div class="stat-card"><div class="stat-label">人数</div><div class="stat-value">${stats.count || 0}</div></div>
        <div class="stat-card"><div class="stat-label">本期收入合计</div><div class="stat-value">${(stats.total_income || 0).toFixed(2)}</div></div>
        <div class="stat-card"><div class="stat-label">个税合计</div><div class="stat-value">${(stats.total_tax || 0).toFixed(2)}</div></div>
        <div class="stat-card"><div class="stat-label">实发工资合计</div><div class="stat-value">${(stats.total_net || 0).toFixed(2)}</div></div>
        <div class="stat-card"><div class="stat-label">人均收入</div><div class="stat-value">${(stats.avg_income || 0).toFixed(2)}</div></div>
    `;
}

function renderSalaryTable(records) {
    const tbody = document.getElementById('salary-tbody');
    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="45" style="text-align:center;color:#999">暂无数据，请点击"导入Excel"或"新增"</td></tr>';
        return;
    }
    tbody.innerHTML = records.map(r => `
        <tr>
            <td style="text-align:center"><input type="checkbox" class="salary-checkbox" value="${r.id}"></td>
            <td>${escapeHtml(r.employee_code || '-')}</td>
            <td>${escapeHtml(r.employee_name)}</td>
            <td>${escapeHtml(r.id_type || '-')}</td>
            <td style="font-size:12px">${escapeHtml(r.id_number || '')}</td>
            <td>${escapeHtml(r.tax_period_start || '-')}</td>
            <td>${escapeHtml(r.tax_period_end || '-')}</td>
            <td>${escapeHtml(r.income_type || '-')}</td>
            <td style="text-align:right">${(r.current_income || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.basic_deduction || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.tax_free_income || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.pension_insurance || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.medical_insurance || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.unemployment_insurance || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.housing_fund || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.enterprise_annuity || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.commercial_health || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.tax_deferred_pension || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.other_deduction || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.cumulative_income || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.cumulative_tax_free || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.cumulative_deduction || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.cumulative_special || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.child_education || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.continuing_education || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.housing_loan_interest || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.housing_rent || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.elderly_support || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.infant_care || 0).toFixed(2)}</td>
            <td style="text-align:right">0.00</td>
            <td style="text-align:right">${(r.cumulative_other || 0).toFixed(2)}</td>
            <td style="text-align:right">0.00</td>
            <td style="text-align:right">0.00</td>
            <td style="text-align:right">0.00</td>
            <td style="text-align:right">0.00</td>
            <td style="text-align:right">0.00</td>
            <td style="text-align:right">${(r.taxable_income || 0).toFixed(2)}</td>
            <td style="text-align:center">${((r.tax_rate || 0) * 100).toFixed(0)}%</td>
            <td style="text-align:right">${(r.quick_deduction || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.tax_payable || 0).toFixed(2)}</td>
            <td style="text-align:right">0.00</td>
            <td style="text-align:right">${(r.tax_to_pay || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.tax_already_withheld || 0).toFixed(2)}</td>
            <td style="text-align:right">${(r.tax_refund || 0).toFixed(2)}</td>
            <td style="text-align:right;color:#27ae60;font-weight:bold">${(r.net_salary || 0).toFixed(2)}</td>
            <td style="white-space:nowrap">
                <button class="btn btn-sm btn-secondary" onclick="showSalaryEditModal(${r.id})">编辑</button>
                <button class="btn btn-sm btn-danger" onclick="deleteSalaryRecord(${r.id})">删除</button>
            </td>
        </tr>
    `).join('');
}

// ========== 新增/编辑 ==========

function showSalaryAddModal() {
    currentEditingSalaryId = null;
    renderSalaryModal({});
}

function showSalaryEditModal(id) {
    currentEditingSalaryId = id;
    const r = currentSalaryRecords.find(x => x.id === id);
    if (!r) return;
    renderSalaryModal(r);
}

function renderSalaryModal(r) {
    const isEdit = currentEditingSalaryId !== null;
    const title = isEdit ? '编辑工资记录' : '新增工资记录';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'salary-modal';
    modal.innerHTML = `
        <div class="modal" style="max-width:900px;max-height:90vh;overflow-y:auto">
            <div class="modal-header"><h3>${title}</h3><button class="modal-close" onclick="closeModal('salary-modal')">&times;</button></div>
            <div class="modal-body">
                <div class="form-row">
                    <label>期间</label>
                    <input type="text" id="sal-modal-period" value="${r.period || currentSalaryPeriod}" placeholder="2025-10" required>
                </div>
                <div class="form-row">
                    <label>姓名</label>
                    <input type="text" id="sal-modal-name" value="${escapeHtml(r.employee_name || '')}" required>
                </div>
                <div class="form-row">
                    <label>证件类型</label>
                    <input type="text" id="sal-modal-id-type" value="${escapeHtml(r.id_type || '居民身份证')}">
                </div>
                <div class="form-row">
                    <label>证件号码</label>
                    <input type="text" id="sal-modal-id-number" value="${escapeHtml(r.id_number || '')}">
                </div>
                <div class="form-row">
                    <label>本期收入</label>
                    <input type="number" step="0.01" id="sal-modal-income" value="${r.current_income || 0}" onchange="calcSalaryNet()">
                </div>
                <div class="form-row">
                    <label>基本减除费用</label>
                    <input type="number" step="0.01" id="sal-modal-basic-deduction" value="${r.basic_deduction || 5000}" onchange="calcSalaryNet()">
                </div>
                <h4 style="margin:12px 0 8px;color:#555">专项扣除</h4>
                <div class="form-row"><label>基本养老保险</label><input type="number" step="0.01" id="sal-modal-pension" value="${r.pension_insurance || 0}" onchange="calcSalaryNet()"></div>
                <div class="form-row"><label>基本医疗保险</label><input type="number" step="0.01" id="sal-modal-medical" value="${r.medical_insurance || 0}" onchange="calcSalaryNet()"></div>
                <div class="form-row"><label>失业保险</label><input type="number" step="0.01" id="sal-modal-unemployment" value="${r.unemployment_insurance || 0}" onchange="calcSalaryNet()"></div>
                <div class="form-row"><label>住房公积金</label><input type="number" step="0.01" id="sal-modal-housing" value="${r.housing_fund || 0}" onchange="calcSalaryNet()"></div>
                <div class="form-row"><label>企业年金</label><input type="number" step="0.01" id="sal-modal-annuity" value="${r.enterprise_annuity || 0}" onchange="calcSalaryNet()"></div>
                <h4 style="margin:12px 0 8px;color:#555">专项附加扣除</h4>
                <div class="form-row"><label>子女教育</label><input type="number" step="0.01" id="sal-modal-child" value="${r.child_education || 0}" onchange="calcSalaryNet()"></div>
                <div class="form-row"><label>继续教育</label><input type="number" step="0.01" id="sal-modal-continuing" value="${r.continuing_education || 0}" onchange="calcSalaryNet()"></div>
                <div class="form-row"><label>住房贷款利息</label><input type="number" step="0.01" id="sal-modal-loan" value="${r.housing_loan_interest || 0}" onchange="calcSalaryNet()"></div>
                <div class="form-row"><label>住房租金</label><input type="number" step="0.01" id="sal-modal-rent" value="${r.housing_rent || 0}" onchange="calcSalaryNet()"></div>
                <div class="form-row"><label>赡养老人</label><input type="number" step="0.01" id="sal-modal-elderly" value="${r.elderly_support || 0}" onchange="calcSalaryNet()"></div>
                <div class="form-row"><label>3岁以下婴幼儿照护</label><input type="number" step="0.01" id="sal-modal-infant" value="${r.infant_care || 0}" onchange="calcSalaryNet()"></div>
                <div class="form-row"><label>大病医疗</label><input type="number" step="0.01" id="sal-modal-major" value="${r.major_medical || 0}" onchange="calcSalaryNet()"></div>
                <h4 style="margin:12px 0 8px;color:#555">税额</h4>
                <div class="form-row"><label>本期应预扣税额</label><input type="number" step="0.01" id="sal-modal-tax-to-pay" value="${r.tax_to_pay || 0}"></div>
                <div class="form-row"><label>实发工资（自动算）</label><input type="number" step="0.01" id="sal-modal-net" value="${r.net_salary || 0}" readonly style="background:#f5f5f5"></div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal('salary-modal')">取消</button>
                <button class="btn btn-primary" onclick="saveSalaryRecord()">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function calcSalaryNet() {
    const income = parseFloat(document.getElementById('sal-modal-income')?.value || 0);
    const tax = parseFloat(document.getElementById('sal-modal-tax-to-pay')?.value || 0);
    const special = (parseFloat(document.getElementById('sal-modal-pension')?.value || 0) +
                     parseFloat(document.getElementById('sal-modal-medical')?.value || 0) +
                     parseFloat(document.getElementById('sal-modal-unemployment')?.value || 0) +
                     parseFloat(document.getElementById('sal-modal-housing')?.value || 0));
    // 自动估算个税（简化）
    const net = income - special - tax;
    const netInput = document.getElementById('sal-modal-net');
    if (netInput) netInput.value = Math.round(net * 100) / 100;
}

function saveSalaryRecord() {
    const period = document.getElementById('sal-modal-period').value.trim();
    const name = document.getElementById('sal-modal-name').value.trim();
    if (!period || !name) { toast('期间和姓名必填', 'warning'); return; }

    const data = {
        period,
        employee_name: name,
        id_type: document.getElementById('sal-modal-id-type').value.trim(),
        id_number: document.getElementById('sal-modal-id-number').value.trim(),
        current_income: parseFloat(document.getElementById('sal-modal-income').value || 0),
        basic_deduction: parseFloat(document.getElementById('sal-modal-basic-deduction').value || 5000),
        pension_insurance: parseFloat(document.getElementById('sal-modal-pension').value || 0),
        medical_insurance: parseFloat(document.getElementById('sal-modal-medical').value || 0),
        unemployment_insurance: parseFloat(document.getElementById('sal-modal-unemployment').value || 0),
        housing_fund: parseFloat(document.getElementById('sal-modal-housing').value || 0),
        enterprise_annuity: parseFloat(document.getElementById('sal-modal-annuity').value || 0),
        child_education: parseFloat(document.getElementById('sal-modal-child').value || 0),
        continuing_education: parseFloat(document.getElementById('sal-modal-continuing').value || 0),
        housing_loan_interest: parseFloat(document.getElementById('sal-modal-loan').value || 0),
        housing_rent: parseFloat(document.getElementById('sal-modal-rent').value || 0),
        elderly_support: parseFloat(document.getElementById('sal-modal-elderly').value || 0),
        infant_care: parseFloat(document.getElementById('sal-modal-infant').value || 0),
        major_medical: parseFloat(document.getElementById('sal-modal-major').value || 0),
        tax_to_pay: parseFloat(document.getElementById('sal-modal-tax-to-pay').value || 0),
        net_salary: parseFloat(document.getElementById('sal-modal-net').value || 0),
    };

    const method = currentEditingSalaryId ? 'PUT' : 'POST';
    const url = currentEditingSalaryId ? '/api/salary/records/' + currentEditingSalaryId : '/api/salary/records';

    api(url, { method: method, body: JSON.stringify(data) }).then(() => {
        closeModal('salary-modal');
        loadSalaryData();
        toast('保存成功', 'success');
    }).catch(err => toast(err.message || '保存失败', 'error'));
}

// ========== 删除 ==========

function deleteSalaryRecord(id) {
    if (!confirm('确定删除该条工资记录？')) return;
    api('/api/salary/records/' + id, { method: 'DELETE' }).then(() => {
        loadSalaryData();
        toast('已删除', 'success');
    }).catch(err => toast('删除失败：' + (err.message || ''), 'error'));
}

function batchDeleteSalary() {
    const ids = getSelectedIds('salary');
    if (ids.length === 0) { toast('请先选择要删除的记录', 'error'); return; }
    if (!confirm('确定删除选中的 ' + ids.length + ' 条记录？')) return;
    api('/api/salary/records/batch-delete', { method: 'POST', body: JSON.stringify(ids) }).then(() => {
        loadSalaryData();
        toast('已删除 ' + ids.length + ' 条记录', 'success');
    }).catch(err => toast('删除失败：' + (err.message || ''), 'error'));
}

// ========== 导入Excel ==========

function showSalaryImportModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'salary-import-modal';
    modal.innerHTML = `
        <div class="modal" style="max-width:500px">
            <div class="modal-header"><h3>📁 导入工资表（税务模板）</h3><button class="modal-close" onclick="closeModal('salary-import-modal')">&times;</button></div>
            <div class="modal-body">
                <p style="color:#666;margin-bottom:12px">支持税务局"综合所得月工资薪所得"Excel模板（.xls/.xlsx）</p>
                <div class="form-row">
                    <label>期间</label>
                    <input type="text" id="sal-import-period" value="${currentSalaryPeriod}" placeholder="2025-10" required>
                </div>
                <div class="form-row">
                    <label>选择文件</label>
                    <input type="file" id="sal-import-file" accept=".xls,.xlsx" required>
                </div>
                <div id="sal-import-progress" style="margin-top:12px;color:#3498db;display:none">
                    导入中，请稍候...
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal('salary-import-modal')">取消</button>
                <button class="btn btn-primary" onclick="importSalaryExcel()">开始导入</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function importSalaryExcel() {
    const period = document.getElementById('sal-import-period').value.trim();
    const fileInput = document.getElementById('sal-import-file');
    if (!period) { toast('请填写期间', 'error'); return; }
    if (!fileInput.files.length) { toast('请选择文件', 'error'); return; }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('company_id', currentCompanyId);
    formData.append('period', period);

    const progress = document.getElementById('sal-import-progress');
    progress.style.display = 'block';

    fetch(`/api/salary/import?company_id=${currentCompanyId}&period=${encodeURIComponent(period)}`, {
        method: 'POST',
        body: fileInput.files[0]
    }).then(res => res.json()).then(data => {
        progress.style.display = 'none';
        closeModal('salary-import-modal');
        loadSalaryData();
        toast(data.msg || '导入完成', 'success');
    }).catch(err => {
        progress.style.display = 'none';
        toast(err.message || '导入失败', 'error');
    });
}

// ========== 自动建人员档案 ==========

function autoCreateEmployeesFromSalary() {
    if (!confirm('将根据工资表中的所有人员信息自动创建/更新人员档案（按证件号码匹配）？')) return;
    api('/api/salary/auto-create-employees?period=' + encodeURIComponent(currentSalaryPeriod), { method: 'POST' })
        .then(data => {
            toast(data.msg || '完成', 'success');
        }).catch(err => toast(err.message || '操作失败', 'error'));
}

// ========== 计算个税 ==========

function computeSalaryTax() {
    if (!confirm(`将重新计算 ${currentSalaryPeriod} 期间所有员工的个税（累计预扣法），确定？`)) return;
    api('/api/salary/compute?period=' + encodeURIComponent(currentSalaryPeriod), { method: 'POST' })
        .then(data => {
            toast(data.msg || '计算完成', 'success');
            loadSalaryData();
        }).catch(err => toast(err.message || '计算失败', 'error'));
}

// ========== 辅助 ==========

function getSelectedIds(type) {
    const checkboxes = document.querySelectorAll(`.${type}-checkbox:checked`);
    return Array.from(checkboxes).map(cb => parseInt(cb.value));
}

function toggleSelectAll(type) {
    const master = document.getElementById(`${type}-select-all`);
    const checked = master.checked;
    document.querySelectorAll(`.${type}-checkbox`).forEach(cb => cb.checked = checked);
}

// escHtml/closeModal 统一用 core.js 的 escapeHtml(), 不再重复定义

