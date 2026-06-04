// ==================== 数据看板 ====================
async function renderDashboard(container) {
  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML = '<div style="color:#999;padding:20px">加载中...</div>';
  try {
    const data = await api('/api/dashboard');
    el.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">客户档案</div>
          <div class="stat-value">${data.customer_count}</div>
          <div class="stat-sub">个</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">供应商</div>
          <div class="stat-value">${data.supplier_count}</div>
          <div class="stat-sub">个</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">员工</div>
          <div class="stat-value">${data.employee_count}</div>
          <div class="stat-sub">人</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">会计科目</div>
          <div class="stat-value">${data.account_count}</div>
          <div class="stat-sub">个</div>
        </div>
      </div>
      <div class="stat-grid" style="grid-template-columns:repeat(2,1fr)">
        <div class="stat-card">
          <div class="stat-label">开具发票</div>
          <div class="stat-value" style="color:var(--primary)">${data.sales_invoice_count}</div>
          <div class="stat-sub">张</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">取得发票</div>
          <div class="stat-value" style="color:var(--success)">${data.purchase_invoice_count}</div>
          <div class="stat-sub">张</div>
        </div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px">
        <button class="btn btn-primary" onclick="navigateTo('sales-invoices')">开具发票</button>
        <button class="btn btn-secondary" onclick="navigateTo('purchase-invoices')">取得发票</button>
      </div>
    `;
  } catch (e) {
    showError(el, e, '加载看板数据');
  }
}
