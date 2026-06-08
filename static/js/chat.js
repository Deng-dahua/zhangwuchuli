// ==================== AI 助手对话 ====================
let chatSessionId = null;
let chatMessages = [];
let chatLoading = false;

async function renderChat(container) {
  if (!chatSessionId) {
    chatSessionId = 'sess_' + Date.now();
    chatMessages = [{
      role: 'ai',
      text: '👋 你好！我是**存勤账务助手**，你的 AI 会计搭档。\n\n直接告诉我你要做什么，例如：\n• 「录入凭证」— 我带你一步步填\n• 「新增客户」— 快速录入客户档案\n• 「查看利润表 2026-05」— 马上出报表\n\n输入「**帮助**」了解全部功能。'
    }];
  }

  const el = container || document.getElementById('page-' + currentPage) || document.getElementById('content-area');
  el.innerHTML = `
    <div class="chat-wrapper">
      <div class="chat-header">
        <h3>🤖 AI 智能助手</h3>
        <p>直接描述需求，我帮你搞定 — 新增客户 / 查报表</p>
      </div>
      <div class="chat-quick-actions" id="quick-actions">
                <span class="chat-chip" data-cmd="新增客户">👤 新增客户</span>
        <span class="chat-chip" data-cmd="新增供应商">📦 新增供应商</span>
        <span class="chat-chip" data-cmd="新增员工">🧑 新增员工</span>
        <span class="chat-chip" data-cmd="查看利润表">📈 利润表</span>
        <span class="chat-chip" data-cmd="查看资产负债表">⚖️ 资产负债表</span>
        <span class="chat-chip" data-cmd="总账">📒 总账</span>
        <span class="chat-chip" data-cmd="帮助">❓ 帮助</span>
      </div>
      <div class="chat-body" id="chat-body">
        ${renderMessages()}
      </div>
      <div class="chat-input-area">
        <input type="file" id="chat-file-input" accept=".xlsx,.xls,.csv,.pdf,.txt,.md,.log,.png,.jpg,.jpeg,.gif,.bmp,.webp" style="display:none" onchange="handleFileUpload(this)">
        <button class="chat-upload-btn" id="chat-upload-btn" onclick="document.getElementById('chat-file-input').click()" title="上传文件 (Excel/CSV/PDF/文本)">📎</button>
        <input id="chat-input" type="text" placeholder="输入你的需求，或上传文件，例如：5月28日 采购原材料" 
               onkeypress="if(event.key==='Enter') sendChat()" autofocus>
        <button onclick="sendChat()" id="chat-send-btn">发送</button>
      </div>
    </div>
  `;

  // 绑定快捷操作
  document.querySelectorAll('.chat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('chat-input').value = chip.dataset.cmd;
      sendChat();
    });
  });

  // 滚动到底部
  scrollChatBottom();
}

function renderMessages() {
  return chatMessages.map((m, i) => {
    const cls = m.role === 'user' ? 'user' : 'ai';
    // 简单 markdown 渲染：**粗体** 和换行
    let text = m.text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    return `<div class="chat-bubble ${cls}">${text}</div>`;
  }).join('') + (chatLoading ? '<div class="chat-bubble ai"><div class="typing-indicator"><span></span><span></span><span></span></div></div>' : '');
}

function scrollChatBottom() {
  setTimeout(() => {
    const body = document.getElementById('chat-body');
    if (body) body.scrollTop = body.scrollHeight;
  }, 100);
}

async function handleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;

  const uploadBtn = document.getElementById('chat-upload-btn');
  const sendBtn = document.getElementById('chat-send-btn');

  // 显示上传中
  uploadBtn.classList.add('uploading');
  uploadBtn.textContent = '⏳';
  sendBtn.disabled = true;

  chatMessages.push({ role: 'user', text: `<span class="chat-file-badge">📎 ${file.name} (${formatFileSize(file.size)})</span><br>正在识别文件内容...` });
  chatLoading = true;
  document.getElementById('chat-body').innerHTML = renderMessages();
  scrollChatBottom();

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', chatSessionId);

    const res = await fetch('/api/chat/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.error) {
      // 更新最后一条消息为错误
      chatMessages[chatMessages.length - 1].text = `📎 ${file.name}<br>❌ ${data.error}`;
    } else {
      // 更新最后一条消息为文件内容摘要
      const contentPreview = data.content.length > 300 ? data.content.substring(0, 300) + '...' : data.content;
      chatMessages[chatMessages.length - 1].text = `<span class="chat-file-badge">📎 ${data.file_name}</span><br><pre style="font-size:11px;max-height:200px;overflow-y:auto;background:#f8fafc;padding:8px;border-radius:6px;white-space:pre-wrap;word-break:break-all;margin:4px 0 0">${escapeHtml(contentPreview)}</pre>`;

      // 将文件内容送入对话处理
      const chatRes = await api('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: `[上传文件] ${data.file_name}\n\n文件内容如下，请帮我处理：\n\n${data.content}`,
          session_id: chatSessionId
        })
      });
      chatMessages.push({ role: 'ai', text: chatRes.reply });

      if (chatRes.action) {
        if (chatRes.action.type === 'navigate') {
          setTimeout(() => navigateTo(chatRes.action.page), 500);
        } else if (chatRes.action.type === 'reload') {
        }
      }
    }
  } catch (e) {
    chatMessages[chatMessages.length - 1].text = `📎 ${file.name}<br>❌ 上传失败：${e.message}`;
  }

  chatLoading = false;
  sendBtn.disabled = false;
  uploadBtn.classList.remove('uploading');
  uploadBtn.textContent = '📎';
  document.getElementById('chat-body').innerHTML = renderMessages();
  scrollChatBottom();
  document.getElementById('chat-input').focus();

  // 清空文件选择
  input.value = '';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('chat-send-btn');
  const uploadBtn = document.getElementById('chat-upload-btn');
  const msg = input.value.trim();
  if (!msg || chatLoading) return;

  input.value = '';
  chatMessages.push({ role: 'user', text: msg });
  chatLoading = true;
  btn.disabled = true;
  uploadBtn.disabled = true;
  uploadBtn.style.opacity = '0.5';
  uploadBtn.style.cursor = 'not-allowed';
  document.getElementById('chat-body').innerHTML = renderMessages();
  scrollChatBottom();

  try {
    const res = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: msg, session_id: chatSessionId })
    });
    chatMessages.push({ role: 'ai', text: res.reply });
    
    // 处理 action
    if (res.action) {
      if (res.action.type === 'navigate') {
        setTimeout(() => navigateTo(res.action.page), 500);
      } else if (res.action.type === 'reload') {
        // 提示用户刷新页面
      }
    }
  } catch (e) {
    chatMessages.push({ role: 'ai', text: '❌ 出错了：' + e.message + '\n\n请刷新页面重试。' });
  }

  chatLoading = false;
  btn.disabled = false;
  uploadBtn.disabled = false;
  uploadBtn.style.opacity = '';
  uploadBtn.style.cursor = '';
  document.getElementById('chat-body').innerHTML = renderMessages();
  scrollChatBottom();
  document.getElementById('chat-input').focus();
}

// esc() 已统一迁移到 core.js 作为 escapeHtml() 别名，此处不再重复定义
function showModal(html) {
  closeModal(); // P1-17: 先关闭已有弹窗，防止堆叠
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `<div class="modal modal-lg"><button class="modal-close" onclick="closeModal()">×</button>${html}</div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}
function createModal(title, body, extraClass) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `<div class="modal modal-lg ${extraClass || ''}" style="padding:0;">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--gray-200);">
      <h3 style="margin:0;font-size:16px;">${title}</h3>
      <button onclick="closeModal()" style="position:static;background:none;border:none;font-size:20px;cursor:pointer;color:var(--gray-500);">&times;</button>
    </div>
    <div style="padding:16px 20px;">${body}</div>
  </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  return overlay;
}

async function showVoucherDetail(voucherStr) {
  // 解析"记-5" → voucher_word="记", voucher_no=5
  const parts = voucherStr.split('-');
  if (parts.length < 2) { toast('凭证号格式无效', 'error'); return; }
  const voucherWord = parts[0];
  const voucherNo = parseInt(parts.slice(1).join('-'));

  try {
    const data = await api('/api/journal-entries/by-voucher?voucher_word=' + encodeURIComponent(voucherWord) + '&voucher_no=' + voucherNo);
    const balColor = data.is_balanced ? '#059669' : '#dc2626';
    const balIcon = data.is_balanced ? '✓' : '✗';
    let html = '';
    // 凭证头部信息
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">';
    html += '<div><span style="font-size:18px;font-weight:700;color:#1d4ed8">' + data.voucher_full + '</span>';
    html += '<span style="margin-left:8px;font-size:13px;color:var(--gray-500)">' + data.period + ' | ' + data.entry_date + '</span></div>';
    html += '<div style="display:flex;gap:12px;font-size:13px">';
    html += '<span style="color:var(--gray-500)">来源：<b>' + data.source + '</b></span>';
    html += '<span style="color:' + balColor + ';font-weight:600">' + balIcon + ' 借贷' + (data.is_balanced ? '平衡' : '不平衡') + '</span>';
    html += '</div></div>';
    // 分录表格
    html += '<table class="data-table" style="width:100%"><thead><tr>';
    html += '<th style="width:60px">#</th><th>摘要</th><th>科目编码</th><th>科目名称</th><th style="text-align:right">借方金额</th><th style="text-align:right">贷方金额</th>';
    html += '</tr></thead><tbody>';
    data.entries.forEach((e, idx) => {
      html += '<tr>';
      html += '<td style="color:var(--gray-400)">' + (idx + 1) + '</td>';
      html += '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(e.summary || '') + '">' + escapeHtml(e.summary || '-') + '</td>';
      html += '<td>' + e.account_code + '</td>';
      var afn = (e.account_full_name || e.account_name || '-');
      var afd = afn.split(' / ').map(function(s) { var m = s.match(/^\d+\s+(.*)/); return m ? m[1] : s; }).join(' &gt; ');
      html += '<td style="max-width:160px;overflow:hidden;text-overflow:ellipsis" title="' + escapeHtml(afn) + '">' + escapeHtml(afd) + '</td>';
      html += '<td style="text-align:right;color:#e02424;font-weight:600">' + (e.debit_amount > 0 ? '¥' + e.debit_amount.toLocaleString() : '') + '</td>';
      html += '<td style="text-align:right;color:#0e9f6e;font-weight:600">' + (e.credit_amount > 0 ? '¥' + e.credit_amount.toLocaleString() : '') + '</td>';
      html += '</tr>';
    });
    // 合计行
    html += '<tr style="border-top:2px solid var(--gray-300);font-weight:700;background:#f9fafb">';
    html += '<td colspan="4" style="text-align:right">合计（' + data.entry_count + '条分录）</td>';
    html += '<td style="text-align:right;color:#e02424">¥' + data.total_debit.toLocaleString() + '</td>';
    html += '<td style="text-align:right;color:#0e9f6e">¥' + data.total_credit.toLocaleString() + '</td>';
    html += '</tr>';
    html += '</tbody></table>';
    html += '<div style="text-align:right;margin-top:12px"><button class="btn" onclick="closeModal()">关闭</button></div>';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-overlay';
    overlay.innerHTML = '<div class="modal modal-lg" style="max-width:680px;padding:20px"><button class="modal-close" onclick="closeModal()">&times;</button>' + html + '</div>';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
  } catch (e) {
    toast(e.message || '获取凭证详情失败', 'error');
  }
}

