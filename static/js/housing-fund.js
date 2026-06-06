/*
 * 公积金缴存模块（单位住房公积金汇缴书）
 */

function renderHousingFund(container) {
    container.innerHTML = `
    <div class="page-header">
        <h2>🏡 公积金缴存</h2>
        <div class="header-actions">
            <input type="text" id="hf-period-filter" class="form-input" placeholder="期间(YYYY-MM)" style="width:140px">
            <button class="btn btn-primary" onclick="showHousingFundForm()">＋ 新建汇缴书</button>
        </div>
    </div>

    <div class="stats-cards" id="hf-stats-cards"></div>

    <div class="data-table-wrapper">
        <table class="data-table">
            <thead>
                <tr>
                    <th>汇缴年月</th>
                    <th>单位名称</th>
                    <th>本月汇缴人数</th>
                    <th>本月汇缴金额</th>
                    <th>缴款方式</th>
                    <th>状态</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody id="hf-tbody"></tbody>
        </table>
    </div>

    <div class="pagination" id="hf-pagination"></div>
    `;
    loadHousingFundStats();
    loadHousingFundList(1);
}

function loadHousingFundStats() {
    api('GET', '/api/housing-fund/stats').then(data => {
        $('#hf-stats-cards').innerHTML = `
            <div class="stat-card"><div class="stat-label">缴存记录</div><div class="stat-value">${data.total || 0}</div></div>
            <div class="stat-card"><div class="stat-label">缴存人数</div><div class="stat-value">${data.total_persons || 0}</div></div>
            <div class="stat-card"><div class="stat-label">缴存金额</div><div class="stat-value">￥${(data.total_amount || 0).toFixed(2)}</div></div>
        `;
    }).catch(() => {});
}

function loadHousingFundList(page) {
    const period = $('#hf-period-filter').value;
    let url = `/api/housing-fund/declarations?company_id=${currentCompanyId}&page=${page}&page_size=15`;
    if (period) url += `&period=${period}`;
    api('GET', url).then(data => {
        const tbody = $('#hf-tbody');
        tbody.innerHTML = '';
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;">暂无缴存记录</td></tr>';
            return;
        }
        data.forEach(d => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${d.period || ''}</td>
                <td>${d.unit_name || ''}</td>
                <td>${d.person_count_this || 0}</td>
                <td>￥${(d.amount || 0).toFixed(2)}</td>
                <td>${d.payment_method || ''}</td>
                <td><span class="status-badge status-${d.status === '已确认' ? 'active' : 'draft'}">${d.status || '草稿'}</span></td>
                <td class="table-actions">
                    <button class="btn btn-sm btn-outline" onclick="viewHousingFund(${d.id})">查看</button>
                    <button class="btn btn-sm btn-outline" onclick="editHousingFund(${d.id})">编辑</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteHousingFund(${d.id})">删除</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }).catch(() => {
        $('#hf-tbody').innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;">加载失败</td></tr>';
    });
}

function showHousingFundForm(id = null) {
    const isEdit = id !== null;
    let html = `
    <div class="form-overlay" onclick="closeModal()"></div>
    <div class="form-modal" style="max-width:800px;">
        <div class="form-header">
            <h3>${isEdit ? '编辑汇缴书' : '新建汇缴书'}</h3>
            <button class="form-close" onclick="closeModal()">×</button>
        </div>
        <div class="form-body" style="max-height:70vh;overflow-y:auto;">
            <div class="form-section-title">单位住房公积金汇缴书</div>
            <div class="form-row">
                <label>汇缴年月 *</label>
                <input type="month" id="hf-period" class="form-input" value="" required>
            </div>
            <div class="form-row">
                <label>汇缴单位名称（公章）</label>
                <input type="text" id="hf-unit-name" class="form-input" placeholder="汇缴单位名称">
            </div>
            <div class="form-row">
                <label>汇缴单位账号</label>
                <input type="text" id="hf-unit-account" class="form-input" placeholder="汇缴单位账号">
            </div>
            <div class="form-row">
                <label>资金来源</label>
                <select id="hf-funding-source" class="form-input">
                    <option value="非财政统发">非财政统发</option>
                    <option value="财政统发">财政统发</option>
                </select>
            </div>

            <div class="form-section-title">汇缴人数</div>
            <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;">
                <div>
                    <label>上月汇缴</label>
                    <input type="number" id="hf-person-last" class="form-input" value="0" min="0">
                </div>
                <div>
                    <label>本月增加</label>
                    <input type="number" id="hf-person-increase" class="form-input" value="0" min="0">
                </div>
                <div>
                    <label>本月减少</label>
                    <input type="number" id="hf-person-decrease" class="form-input" value="0" min="0">
                </div>
                <div>
                    <label>本月汇缴</label>
                    <input type="number" id="hf-person-this" class="form-input" value="0" min="0">
                </div>
            </div>

            <div class="form-section-title">汇缴金额（元）</div>
            <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;">
                <div>
                    <label>上月汇缴</label>
                    <input type="number" id="hf-amount-last" class="form-input" value="0" min="0" step="0.01">
                </div>
                <div>
                    <label>本月增加</label>
                    <input type="number" id="hf-amount-increase" class="form-input" value="0" min="0" step="0.01">
                </div>
                <div>
                    <label>本月减少</label>
                    <input type="number" id="hf-amount-decrease" class="form-input" value="0" min="0" step="0.01">
                </div>
                <div>
                    <label>本月汇缴</label>
                    <input type="number" id="hf-amount-this" class="form-input" value="0" min="0" step="0.01">
                </div>
            </div>

            <div class="form-section-title">缴款方式</div>
            <div class="form-row">
                <label>缴款方式</label>
                <select id="hf-payment-method" class="form-input">
                    <option value="委托扣款">委托扣款</option>
                    <option value="主动汇款">主动汇款</option>
                    <option value="暂存款">暂存款</option>
                </select>
            </div>
            <div class="form-row">
                <label>暂存款使用金额（元）</label>
                <input type="number" id="hf-temp-deposit" class="form-input" value="0" min="0" step="0.01">
            </div>
            <div class="form-row">
                <label>付款账户名称（主动汇款需填）</label>
                <input type="text" id="hf-payer-account-name" class="form-input" placeholder="付款账户名称">
            </div>
            <div class="form-row">
                <label>付款银行名称（主动汇款需填）</label>
                <input type="text" id="hf-payer-bank-name" class="form-input" placeholder="付款银行名称">
            </div>
            <div class="form-row">
                <label>付款账号（主动汇款需填）</label>
                <input type="text" id="hf-payer-account" class="form-input" placeholder="付款账号">
            </div>

            <div class="form-section-title">其他</div>
            <div class="form-row">
                <label>汇缴金额（大写）</label>
                <input type="text" id="hf-amount-capital" class="form-input" placeholder="如：壹仟贰佰叁拾肆元伍角陆分">
            </div>
            <div class="form-row">
                <label>备注</label>
                <textarea id="hf-note" class="form-input" rows="3" placeholder="备注信息"></textarea>
            </div>
            <div class="form-row">
                <label>填表日期</label>
                <input type="date" id="hf-fill-date" class="form-input">
            </div>
            <div class="form-row">
                <label>状态</label>
                <select id="hf-status" class="form-input">
                    <option value="草稿">草稿</option>
                    <option value="已确认">已确认</option>
                </select>
            </div>
        </div>
        <div class="form-footer">
            <button class="btn btn-outline" onclick="closeModal()">取消</button>
            <button class="btn btn-primary" onclick="saveHousingFund(${id || 'null'})">保存</button>
        </div>
    </div>
    `;
    const overlay = document.createElement('div');
    overlay.innerHTML = html;
    document.body.appendChild(overlay.firstElementChild);
    document.body.appendChild(overlay.lastElementChild);

    if (isEdit) {
        api('GET', `/api/housing-fund/declarations/${id}?company_id=${currentCompanyId}`).then(d => {
            $('#hf-period').value = d.period || '';
            $('#hf-unit-name').value = d.unit_name || '';
            $('#hf-unit-account').value = d.unit_account || '';
            $('#hf-funding-source').value = d.funding_source || '非财政统发';
            $('#hf-person-last').value = d.person_count_last || 0;
            $('#hf-person-increase').value = d.person_count_increase || 0;
            $('#hf-person-decrease').value = d.person_count_decrease || 0;
            $('#hf-person-this').value = d.person_count_this || 0;
            $('#hf-amount-last').value = d.amount_last || 0;
            $('#hf-amount-increase').value = d.amount_increase || 0;
            $('#hf-amount-decrease').value = d.amount_decrease || 0;
            $('#hf-amount-this').value = d.amount_this || 0;
            $('#hf-payment-method').value = d.payment_method || '委托扣款';
            $('#hf-temp-deposit').value = d.temp_deposit_amount || 0;
            $('#hf-payer-account-name').value = d.payer_account_name || '';
            $('#hf-payer-bank-name').value = d.payer_bank_name || '';
            $('#hf-payer-account').value = d.payer_account || '';
            $('#hf-amount-capital').value = d.amount_capital || '';
            $('#hf-note').value = d.note || '';
            $('#hf-fill-date').value = d.fill_date || '';
            $('#hf-status').value = d.status || '草稿';
            // 自动计算本月汇缴
            calcHousingFundTotals();
        }).catch(() => {});
    } else {
        // 默认汇缴年月为当前月
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        $('#hf-period').value = `${y}-${m}`;
        calcHousingFundTotals();
    }

    // 绑定自动计算
    ['hf-person-last','hf-person-increase','hf-person-decrease','hf-amount-last','hf-amount-increase','hf-amount-decrease'].forEach(id => {
        $(`#${id}`).addEventListener('input', calcHousingFundTotals);
    });
}

function calcHousingFundTotals() {
    const pl = Number($('#hf-person-last').value) || 0;
    const pi = Number($('#hf-person-increase').value) || 0;
    const pd = Number($('#hf-person-decrease').value) || 0;
    $('#hf-person-this').value = pl + pi - pd;

    const al = Number($('#hf-amount-last').value) || 0;
    const ai = Number($('#hf-amount-increase').value) || 0;
    const ad = Number($('#hf-amount-decrease').value) || 0;
    $('#hf-amount-this').value = (al + ai - ad).toFixed(2);
    $('#hf-amount').value = (al + ai - ad).toFixed(2);
}

function saveHousingFund(id) {
    const period = $('#hf-period').value;
    if (!period) { alert('请选择汇缴年月'); return; }
    const payload = {
        company_id: currentCompanyId,
        period: period,
        unit_name: $('#hf-unit-name').value,
        unit_account: $('#hf-unit-account').value,
        funding_source: $('#hf-funding-source').value,
        amount: Number($('#hf-amount-this').value) || 0,
        amount_capital: $('#hf-amount-capital').value,
        person_count_last: Number($('#hf-person-last').value) || 0,
        person_count_increase: Number($('#hf-person-increase').value) || 0,
        person_count_decrease: Number($('#hf-person-decrease').value) || 0,
        person_count_this: Number($('#hf-person-this').value) || 0,
        amount_last: Number($('#hf-amount-last').value) || 0,
        amount_increase: Number($('#hf-amount-increase').value) || 0,
        amount_decrease: Number($('#hf-amount-decrease').value) || 0,
        amount_this: Number($('#hf-amount-this').value) || 0,
        payment_method: $('#hf-payment-method').value,
        temp_deposit_amount: Number($('#hf-temp-deposit').value) || 0,
        payer_account_name: $('#hf-payer-account-name').value,
        payer_bank_name: $('#hf-payer-bank-name').value,
        payer_account: $('#hf-payer-account').value,
        note: $('#hf-note').value,
        fill_date: $('#hf-fill-date').value,
        status: $('#hf-status').value,
    };
    api('POST', '/api/housing-fund/declarations', payload).then(() => {
        closeModal();
        loadHousingFundStats();
        loadHousingFundList(1);
        showToast('保存成功');
    }).catch(err => {
        alert('保存失败：' + (err.message || err));
    });
}

function viewHousingFund(id) {
    api('GET', `/api/housing-fund/declarations/${id}?company_id=${currentCompanyId}`).then(d => {
        const html = `
        <div class="form-overlay" onclick="closeModal()"></div>
        <div class="form-modal" style="max-width:800px;">
            <div class="form-header">
                <h3>单位住房公积金汇缴书 - ${d.period || ''}</h3>
                <button class="form-close" onclick="closeModal()">×</button>
            </div>
            <div class="form-body" style="max-height:70vh;overflow-y:auto;">
                <div style="text-align:center;font-size:18px;font-weight:bold;margin-bottom:15px;">单位住房公积金汇缴书</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 30px;margin-bottom:15px;">
                    <div><strong>汇缴单位名称：</strong>${d.unit_name || '（公章）'}</div>
                    <div><strong>汇缴单位账号：</strong>${d.unit_account || ''}</div>
                    <div><strong>资金来源：</strong>${d.funding_source || ''}</div>
                    <div><strong>汇缴年月：</strong>${d.period || ''}</div>
                </div>
                <table class="data-table" style="margin-bottom:15px;">
                    <thead>
                        <tr>
                            <th></th><th>上月汇缴</th><th>本月增加</th><th>本月减少</th><th>本月汇缴</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td><strong>人数</strong></td><td>${d.person_count_last || 0}</td><td>${d.person_count_increase || 0}</td><td>${d.person_count_decrease || 0}</td><td>${d.person_count_this || 0}</td></tr>
                        <tr><td><strong>金额（元）</strong></td><td>${(d.amount_last || 0).toFixed(2)}</td><td>${(d.amount_increase || 0).toFixed(2)}</td><td>${(d.amount_decrease || 0).toFixed(2)}</td><td><strong>${(d.amount_this || 0).toFixed(2)}</strong></td></tr>
                    </tbody>
                </table>
                <div style="margin-bottom:10px;"><strong>汇缴金额（大写）：</strong>${d.amount_capital || '（未填写）'}</div>
                <div style="margin-bottom:10px;"><strong>缴款方式：</strong>${d.payment_method || ''}</div>
                ${d.payment_method === '暂存款' ? `<div style="margin-bottom:10px;"><strong>暂存款使用金额：</strong>￥${(d.temp_deposit_amount || 0).toFixed(2)}</div>` : ''}
                ${d.payment_method === '主动汇款' ? `
                <div style="margin-bottom:10px;">
                    <div><strong>付款账户名称：</strong>${d.payer_account_name || ''}</div>
                    <div><strong>付款银行名称：</strong>${d.payer_bank_name || ''}</div>
                    <div><strong>付款账号：</strong>${d.payer_account || ''}</div>
                </div>` : ''}
                <div style="margin-bottom:10px;"><strong>备注：</strong>${d.note || '（无）'}</div>
                <div style="margin-bottom:10px;"><strong>填表日期：</strong>${d.fill_date || '（未填写）'}</div>
                <div style="margin-bottom:10px;"><strong>状态：</strong>${d.status || '草稿'}</div>
                <div style="margin-top:20px;font-size:12px;color:#999;border-top:1px solid #eee;padding-top:10px;">
                    经核，以上内容无误。<br>
                    单位经办人签名：________________ &nbsp;&nbsp;&nbsp;&nbsp; 填表日期：${d.fill_date || '　　年　　月　　日'}
                </div>
            </div>
            <div class="form-footer">
                <button class="btn btn-outline" onclick="closeModal()">关闭</button>
                <button class="btn btn-primary" onclick="editHousingFund(${d.id});closeModal();">编辑</button>
            </div>
        </div>
        `;
        const overlay = document.createElement('div');
        overlay.innerHTML = html;
        document.body.appendChild(overlay.firstElementChild);
        document.body.appendChild(overlay.lastElementChild);
    }).catch(() => alert('加载失败'));
}

function editHousingFund(id) {
    showHousingFundForm(id);
}

function deleteHousingFund(id) {
    if (!confirm('确定要删除该汇缴书吗？')) return;
    api('DELETE', `/api/housing-fund/declarations/${id}?company_id=${currentCompanyId}`).then(() => {
        loadHousingFundStats();
        loadHousingFundList(1);
        showToast('删除成功');
    }).catch(err => alert('删除失败：' + (err.message || err)));
}

// 监听期间筛选
$(() => {
    const el = $('#hf-period-filter');
    if (el) el.addEventListener('change', () => loadHousingFundList(1));
});
