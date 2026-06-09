/**
 * 工资薪金所得模块 - 前端
 * 功能：按期间管理工资表、导入税务模板、自动建人员档案、计算个税
 */
var currentSalaryPeriod = '';
var currentSalaryRecords = [];
var currentEditingSalaryId = null;

// 确认 salary.js 已加载（调试用）
console.log('[salary.js] 已加载，当前时间：' + new Date().toLocaleTimeString());

// 全局 JS 错误捕获——任何报错都直接显示到页面上
window.addEventListener('error', function(e) {
    const msg = '工资模块JS错误：' + (e.message || String(e)) + '（文件：' + (e.filename || '') + ':' + (e.lineno || '') + '）';
    const el = document.getElementById('page-salary') || document.getElementById('content-area');
    if (el) {
        el.innerHTML = '<div style="padding:40px;color:#f44;font-size:14px">' + escapeHtml(msg) + '<br><br>请按 F12 打开控制台查看详细错误</div>';
        el.style.display = 'block';
    }
});

// ========== 页面渲染 ==========

function showSalaryPage(container) {
    try {
        // 期间与顶栏会计期间保持一致
        currentSalaryPeriod = currentPeriod || '';

        // 先渲染页面
        renderSalaryPage(container);

        // 初始化期间选择栏
        buildSalaryPeriodBar();

        // 再加载数据
        loadSalaryData();
    } catch(err) {
        const app = container || document.getElementById('page-salary') || document.getElementById('content-area');
        if (app) {
            app.innerHTML = '<div style="padding:40px;text-align:center;color:#f44">工资薪金模块加载失败：' + escapeHtml(err.message || String(err)) + '<br><br>请按F12打开控制台查看详细错误</div>';
            app.style.display = 'block';
        }
    }
}

// ========== 期间选择栏（序时账同款样式，单期间）==========

function _salYearOptions() {
    const y = new Date().getFullYear();
    let ops = '<option value="">年</option>';
    for (let i = y - 5; i <= y + 1; i++) ops += '<option value="' + i + '">' + i + '年</option>';
    return ops;
}

function _salMonthOptions() {
    return '<option value="">月</option><option value="01">01月</option><option value="02">02月</option><option value="03">03月</option><option value="04">04月</option><option value="05">05月</option><option value="06">06月</option><option value="07">07月</option><option value="08">08月</option><option value="09">09月</option><option value="10">10月</option><option value="11">11月</option><option value="12">12月</option>';
}

function buildSalaryPeriodBar() {
    let bar = document.getElementById('salary-period-bar');
    if (!bar) return;
    bar.innerHTML =
        '<div class="period-stepper">' +
            '<select id="salary-y" class="period-selector-year">' + _salYearOptions() + '</select>' +
            '<div class="stepper-arrows">' +
                '<button class="stepper-btn stepper-up" data-type="year" data-delta="1" title="下一年">▲</button>' +
                '<button class="stepper-btn stepper-down" data-type="year" data-delta="-1" title="上一年">▼</button>' +
            '</div>' +
        '</div>' +
        '<div class="period-stepper">' +
            '<select id="salary-m" class="period-selector-month">' + _salMonthOptions() + '</select>' +
            '<div class="stepper-arrows">' +
                '<button class="stepper-btn stepper-up" data-type="month" data-delta="1" title="下一月">▲</button>' +
                '<button class="stepper-btn stepper-down" data-type="month" data-delta="-1" title="上一月">▼</button>' +
            '</div>' +
        '</div>' +
        '<button class="sal-query-btn btn-toolbar">查询</button>' +
        '<button class="sal-clear-btn btn-toolbar">清除</button>' +
        '<button class="sal-add-btn btn-toolbar">新增工资薪金</button>' +
        '<button class="sal-import-btn btn-toolbar">导入文件</button>' +
        '<button class="sal-tax-btn btn-toolbar">计算个税</button>' +
        '<button class="sal-voucher-btn btn-toolbar">生成凭证</button>' +
        '<button class="sal-batch-del-btn btn-toolbar-danger">批量删除</button>';

    // stepper 按钮
    bar.querySelectorAll('.stepper-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var type = this.getAttribute('data-type');
            var delta = parseInt(this.getAttribute('data-delta'));
            if (type === 'year') _stepSalYear(delta);
            else _stepSalMonth(delta);
        });
    });

    // 下拉变化
    bar.querySelectorAll('.period-selector-month, .period-selector-year').forEach(function(sel) {
        sel.addEventListener('change', loadSalaryData);
    });

    // 清除按钮
    var clearBtn = bar.querySelector('.sal-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', function() {
        document.getElementById('salary-y').value = '';
        document.getElementById('salary-m').value = '';
        loadSalaryData();
    });
    // 查询按钮
    var queryBtn = bar.querySelector('.sal-query-btn');
    if (queryBtn) queryBtn.addEventListener('click', loadSalaryData);
    // 新增按钮
    var addBtn = bar.querySelector('.sal-add-btn');
    if (addBtn) addBtn.addEventListener('click', showSalaryAddModal);
    // 导入按钮
    var importBtn = bar.querySelector('.sal-import-btn');
    if (importBtn) importBtn.addEventListener('click', showSalaryImportModal);
    // 计算个税按钮
    var taxBtn = bar.querySelector('.sal-tax-btn');
    if (taxBtn) taxBtn.addEventListener('click', computeSalaryTax);
    // 生成凭证按钮
    var voucherBtn = bar.querySelector('.sal-voucher-btn');
    if (voucherBtn) voucherBtn.addEventListener('click', generateSalaryVouchers);
    // 批量删除按钮
    var batchDelBtn = bar.querySelector('.sal-batch-del-btn');
    if (batchDelBtn) batchDelBtn.addEventListener('click', batchDeleteSalary);

    // 默认期间
    _setSalPeriod(currentSalaryPeriod);
}

function _stepSalYear(delta) {
    let sel = document.getElementById('salary-y');
    if (!sel || !sel.value) return;
    sel.value = parseInt(sel.value) + delta;
    loadSalaryData();
}

function _stepSalMonth(delta) {
    let ySel = document.getElementById('salary-y');
    let mSel = document.getElementById('salary-m');
    if (!ySel || !mSel || !mSel.value) return;
    let y = parseInt(ySel.value) || new Date().getFullYear();
    let m = parseInt(mSel.value) + delta;
    if (m > 12) { m = 1; y++; }
    else if (m < 1) { m = 12; y--; }
    ySel.value = y;
    mSel.value = String(m).padStart(2, '0');
    loadSalaryData();
}

function _setSalPeriod(period) {
    if (!period || !period.includes('-')) {
        let now = new Date();
        period = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }
    let parts = period.split('-');
    let ySel = document.getElementById('salary-y');
    let mSel = document.getElementById('salary-m');
    if (ySel) ySel.value = parts[0];
    if (mSel) mSel.value = parts[1];
}

function getSalaryPeriod() {
    let y = document.getElementById('salary-y')?.value;
    let m = document.getElementById('salary-m')?.value;
    if (!y || !m) return '';
    return y + '-' + m;
}

// ========== 页面渲染 ==========

function renderSalaryPage(container) {
    const app = container || document.getElementById('page-salary') || document.getElementById('content-area');
    app.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;min-height:0';
    app.innerHTML = `
        <div id="salary-stats" class="stats-cards"></div>
        <div class="page-header">
            <div></div>
            <div class="page-actions">
                <div id="salary-period-bar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"></div>
            </div>
        </div>
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
                        <th>凭证号</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody id="salary-tbody">
                    <tr><td colspan="46" style="text-align:center;color:#999">加载中...</td></tr>
                </tbody>
            </table>
        </div>
    `;
}

// ========== 凭证生成 ==========

async function generateSalaryVouchers() {
    const period = document.getElementById('salary-y')?.value + '-' + 
                   document.getElementById('salary-m')?.value;
    if (!period || period.length !== 7) {
        alert('请先选择期间');
        return;
    }
    // 检查该期间是否已有凭证
    if (currentSalaryRecords.length > 0 && currentSalaryRecords[0].voucher_no) {
        alert('该期间已生成凭证（' + currentSalaryRecords[0].voucher_no + '），请勿重复生成。如需重做，请先删除已有凭证。');
        return;
    }
    if (!confirm(`确认生成 ${period} 的工资凭证？（将生成计提/发放/个税/社保公积金4组凭证）`)) return;
    try {
        const result = await api(`/api/salary/generate-journals?company_id=${currentCompanyId}&period=${period}`, {
            method: 'POST'
        });
        alert(`生成成功！共生成 ${result.generated} 张凭证\n` + (result.message || ''));
        // 刷新工资页面
        loadSalaryData();
        // 刷新序时账（如果用户正在看）
        if (typeof loadJePage === 'function') loadJePage(1);
    } catch (e) {
        alert('生成失败：' + e.message);
    }
}


// ========== 数据加载 ==========

function loadSalaryData() {
    const period = getSalaryPeriod();
    if (!period) return;
    currentSalaryPeriod = period;

    // 加载统计
    api('/api/salary/stats?period=' + encodeURIComponent(period)).then(stats => {
        renderSalaryStats(stats);
    }).catch(() => {});

    // 加载列表
    api('/api/salary/records?period=' + encodeURIComponent(period)).then(data => {
        currentSalaryRecords = data;
        renderSalaryTable(data);
    }).catch(err => {
        document.getElementById('salary-tbody').innerHTML =
            '<tr><td colspan="46" style="text-align:center;color:#f44">加载失败：' + (err.message || '') + '</td></tr>';
    });
}

function renderSalaryStats(stats) {
    const el = document.getElementById('salary-stats');
    if (!el) return;
    el.innerHTML = `
        <div class="stat-card"><div class="stat-label">人数</div><div class="stat-value">${stats.count || 0}</div></div>
        <div class="stat-card"><div class="stat-label">本期收入合计</div><div class="stat-value">${(stats.total_income || 0).toFixed(2)}</div></div>
        <div class="stat-card"><div class="stat-label">应补(退)税额合计</div><div class="stat-value">${(stats.total_tax_refund || 0).toFixed(2)}</div></div>
        <div class="stat-card"><div class="stat-label">实发工资合计</div><div class="stat-value">${(stats.total_net || 0).toFixed(2)}</div></div>
        <div class="stat-card"><div class="stat-label">人均收入</div><div class="stat-value">${(stats.avg_income || 0).toFixed(2)}</div></div>
    `;
}

function renderSalaryTable(records) {
    const tbody = document.getElementById('salary-tbody');
    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="46" style="text-align:center;color:#999">暂无数据，请点击"导入Excel"或"新增"</td></tr>';
        return;
    }
    tbody.innerHTML = records.map(r => {
        const hasVoucher = r.voucher_no && r.voucher_no !== '';
        const cbAttr = hasVoucher ? 'disabled title="该记录已生成凭证，不可操作"' : '';
        const editBtn = hasVoucher
            ? '<button class="btn btn-sm btn-secondary" disabled style="opacity:0.35;cursor:not-allowed" title="已生成凭证，不可编辑">编辑</button>'
            : `<button class="btn btn-sm btn-secondary" onclick="showSalaryEditModal(${r.id})">编辑</button>`;
        const delBtn = hasVoucher
            ? '<button class="btn btn-sm btn-danger" disabled style="opacity:0.35;cursor:not-allowed" title="已生成凭证，不可删除">删除</button>'
            : `<button class="btn btn-sm btn-danger" onclick="deleteSalaryRecord(${r.id})">删除</button>`;
        const voucherNoHtml = r.voucher_no
            ? `<a href="javascript:void(0)" onclick="showVoucherDetail('${r.voucher_no.replace(/'/g, "\\'")}')">${escapeHtml(r.voucher_no)}</a>`
            : '-';
        return `
        <tr>
            <td style="text-align:center"><input type="checkbox" class="salary-checkbox" value="${r.id}" ${cbAttr}></td>
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
            <td style="text-align:center">${voucherNoHtml}</td>
            <td style="white-space:nowrap">
                ${editBtn}
                ${delBtn}
            </td>
        </tr>
    `;
    }).join('');
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
    if (r.voucher_no && r.voucher_no !== '') {
        toast('该记录已生成凭证（' + r.voucher_no + '），不可编辑。', 'warning');
        return;
    }
    renderSalaryModal(r);
}

function renderSalaryModal(r) {
    const isEdit = currentEditingSalaryId !== null;
    const title = isEdit ? '编辑工资记录' : '新增工资记录';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'salary-modal';
    modal.innerHTML = `
        <div class="modal" style="max-width:960px;max-height:90vh;overflow-y:auto">
            <div class="modal-header"><h3>${title}</h3><button class="modal-close" onclick="closeModal('salary-modal')">&times;</button></div>
            <div class="modal-body salary-form">
                <div class="form-grid-2">
                    <div class="form-row"><label>期间</label><input type="text" id="sal-modal-period" value="${r.period || currentSalaryPeriod}" placeholder="2025-10" required></div>
                    <div class="form-row"><label>姓名 <span style="color:#ef4444">*</span></label><input type="text" id="sal-modal-name" value="${escapeHtml(r.employee_name || '')}" required></div>
                    <div class="form-row"><label>证件类型</label><input type="text" id="sal-modal-id-type" value="${escapeHtml(r.id_type || '居民身份证')}"></div>
                    <div class="form-row"><label>证件号码</label><input type="text" id="sal-modal-id-number" value="${escapeHtml(r.id_number || '')}"></div>
                    <div class="form-row"><label>本期收入</label><input type="number" step="0.01" id="sal-modal-income" value="${r.current_income || 0}" onchange="calcSalaryNet()"></div>
                    <div class="form-row"><label>基本减除费用</label><input type="number" step="0.01" id="sal-modal-basic-deduction" value="${r.basic_deduction || 5000}" onchange="calcSalaryNet()"></div>
                </div>
                <div class="section-title">专项扣除</div>
                <div class="form-grid-3">
                    <div class="form-row"><label>基本养老保险</label><input type="number" step="0.01" id="sal-modal-pension" value="${r.pension_insurance || 0}" onchange="calcSalaryNet()"></div>
                    <div class="form-row"><label>基本医疗保险</label><input type="number" step="0.01" id="sal-modal-medical" value="${r.medical_insurance || 0}" onchange="calcSalaryNet()"></div>
                    <div class="form-row"><label>失业保险</label><input type="number" step="0.01" id="sal-modal-unemployment" value="${r.unemployment_insurance || 0}" onchange="calcSalaryNet()"></div>
                    <div class="form-row"><label>住房公积金</label><input type="number" step="0.01" id="sal-modal-housing" value="${r.housing_fund || 0}" onchange="calcSalaryNet()"></div>
                    <div class="form-row"><label>企业年金</label><input type="number" step="0.01" id="sal-modal-annuity" value="${r.enterprise_annuity || 0}" onchange="calcSalaryNet()"></div>
                </div>
                <div class="section-title">专项附加扣除</div>
                <div class="form-grid-3">
                    <div class="form-row"><label>子女教育</label><input type="number" step="0.01" id="sal-modal-child" value="${r.child_education || 0}" onchange="calcSalaryNet()"></div>
                    <div class="form-row"><label>继续教育</label><input type="number" step="0.01" id="sal-modal-continuing" value="${r.continuing_education || 0}" onchange="calcSalaryNet()"></div>
                    <div class="form-row"><label>住房贷款利息</label><input type="number" step="0.01" id="sal-modal-loan" value="${r.housing_loan_interest || 0}" onchange="calcSalaryNet()"></div>
                    <div class="form-row"><label>住房租金</label><input type="number" step="0.01" id="sal-modal-rent" value="${r.housing_rent || 0}" onchange="calcSalaryNet()"></div>
                    <div class="form-row"><label>赡养老人</label><input type="number" step="0.01" id="sal-modal-elderly" value="${r.elderly_support || 0}" onchange="calcSalaryNet()"></div>
                    <div class="form-row"><label>3岁以下婴幼儿照护</label><input type="number" step="0.01" id="sal-modal-infant" value="${r.infant_care || 0}" onchange="calcSalaryNet()"></div>
                    <div class="form-row"><label>大病医疗</label><input type="number" step="0.01" id="sal-modal-major" value="${r.major_medical || 0}" onchange="calcSalaryNet()"></div>
                </div>
                <div class="section-title">税额</div>
                <div class="form-grid-2">
                    <div class="form-row"><label>本期应预扣税额</label><input type="number" step="0.01" id="sal-modal-tax-to-pay" value="${r.tax_to_pay || 0}"></div>
                    <div class="form-row"><label>实发工资（自动算）</label><input type="number" step="0.01" id="sal-modal-net" value="${r.net_salary || 0}" readonly></div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal('salary-modal')">取消</button>
                <button class="btn btn-primary" onclick="saveSalaryRecord()">确定</button>
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
    const r = currentSalaryRecords.find(x => x.id === id);
    if (r && r.voucher_no && r.voucher_no !== '') {
        toast('该记录已生成凭证（' + r.voucher_no + '），不可删除。', 'warning');
        return;
    }
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

    // 默认使用顶栏会计期间
    let defYear = new Date().getFullYear();
    let defMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    if (currentPeriod && currentPeriod.includes('-')) {
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
            <div class="modal-header"><h3>导入工资薪金</h3><button class="modal-close" onclick="closeModal('salary-import-modal')">&times;</button></div>
            <div class="modal-body salary-form">
                <div style="margin-top:16px;text-align:center">
                    <label style="font-size:13px;font-weight:600;color:var(--gray-700);display:block;margin-bottom:6px">所属期间</label>
                    <div class="period-selector-bar" style="display:inline-flex">
                        <div class="period-stepper">
                            <select id="sal-import-year" class="period-selector-year">${yearOpts}</select>
                            <div class="stepper-arrows">
                                <button class="stepper-btn stepper-up" type="button" onclick="stepSalImportYear(1)">▲</button>
                                <button class="stepper-btn stepper-down" type="button" onclick="stepSalImportYear(-1)">▼</button>
                            </div>
                        </div>
                        <div class="period-stepper">
                            <select id="sal-import-month" class="period-selector-month">
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
                                <button class="stepper-btn stepper-up" type="button" onclick="stepSalImportMonth(1)">▲</button>
                                <button class="stepper-btn stepper-down" type="button" onclick="stepSalImportMonth(-1)">▼</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="form-row" style="margin-top:24px;flex-direction:column;align-items:stretch;gap:6px">
                    <label style="width:auto;text-align:left">选择文件</label>
                    <div class="file-upload-zone" id="sal-upload-zone" onclick="document.getElementById('sal-import-file').click()">
                        <div class="upload-icon">&#128206;</div>
                        <div class="upload-text" id="sal-upload-text">点击或拖拽上传 Excel 文件</div>
                        <div class="upload-hint">支持 .xls、.xlsx 格式</div>
                    </div>
                    <input type="file" id="sal-import-file" accept=".xls,.xlsx" style="display:none" onchange="handleSalaryFileSelected(this)">
                </div>
                <div id="sal-import-progress" style="margin-top:12px;color:#3498db;display:none;font-size:13px">
                    导入中，请稍候...
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal('salary-import-modal')">取消</button>
                <button class="btn btn-primary" onclick="importSalaryExcel()">确定</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';

    // 拖拽上传
    const zone = document.getElementById('sal-upload-zone');
    if (zone) {
        zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.style.borderColor = 'var(--primary)'; zone.style.background = '#eff6ff'; });
        zone.addEventListener('dragleave', function(e) { e.preventDefault(); zone.style.borderColor = ''; zone.style.background = ''; });
        zone.addEventListener('drop', function(e) {
            e.preventDefault();
            zone.style.borderColor = ''; zone.style.background = '';
            const files = e.dataTransfer.files;
            if (files.length) {
                const input = document.getElementById('sal-import-file');
                const dt = new DataTransfer();
                dt.items.add(files[0]);
                input.files = dt.files;
                handleSalaryFileSelected(input);
            }
        });
    }
}

function handleSalaryFileSelected(input) {
    const zone = document.getElementById('sal-upload-zone');
    const text = document.getElementById('sal-upload-text');
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (zone) zone.classList.add('has-file');
        if (text) text.textContent = file.name;
    } else {
        if (zone) zone.classList.remove('has-file');
        if (text) text.textContent = '点击或拖拽上传 Excel 文件';
    }
}

function importSalaryExcel() {
    const yearSel = document.getElementById('sal-import-year');
    const monthSel = document.getElementById('sal-import-month');
    if (!yearSel || !monthSel) { toast('页面未加载完成，请重试', 'error'); return; }
    const period = yearSel.value + '-' + monthSel.value;
    const fileInput = document.getElementById('sal-import-file');
    if (!fileInput.files.length) { toast('请选择文件', 'error'); return; }

    const progress = document.getElementById('sal-import-progress');
    progress.style.display = 'block';

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('company_id', currentCompanyId);
    formData.append('period', period);

    fetch('/api/salary/import?company_id=' + currentCompanyId + '&period=' + encodeURIComponent(period), {
        method: 'POST',
        body: formData
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


function autoCreateEmployeesFromSalary() {
    if (!confirm('将根据工资表中的所有人员信息自动创建/更新人员档案（按证件号码匹配）？')) return;
    api('/api/salary/auto-create-employees?period=' + encodeURIComponent(currentSalaryPeriod), { method: 'POST' })
        .then(data => {
            toast(data.msg || '完成', 'success');
            // 自动建档后重新加载，后端会在 employees 表更新 employee_code
            // 如果后端已回填 salary 表的 employee_code，直接重新加载即可
            loadSalaryData();
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
    document.querySelectorAll(`.${type}-checkbox:not([disabled])`).forEach(cb => cb.checked = checked);
}

// escHtml/closeModal 统一用 core.js 的 escapeHtml(), 不再重复定义

// ========== 导入弹窗年度/月份步进 ==========
function stepSalImportYear(delta) {
    const sel = document.getElementById('sal-import-year');
    if (!sel) return;
    const opts = Array.from(sel.options).map(o => parseInt(o.value));
    const cur = parseInt(sel.value);
    const idx = opts.indexOf(cur);
    const next = idx + delta;
    if (next >= 0 && next < opts.length) sel.value = opts[next];
}

function stepSalImportMonth(delta) {
    const yearSel = document.getElementById('sal-import-year');
    const monSel = document.getElementById('sal-import-month');
    if (!monSel) return;
    let y = parseInt(yearSel.value);
    let m = parseInt(monSel.value) + delta;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    // 确保年度在下拉范围内
    const yearOpts = Array.from(yearSel.options).map(o => parseInt(o.value));
    if (!yearOpts.includes(y)) return;
    yearSel.value = y;
    monSel.value = String(m).padStart(2, '0');
}

