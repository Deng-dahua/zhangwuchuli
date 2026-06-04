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

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
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

// HTML 转义
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function showModal(html) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `<div class="modal modal-lg"><button class="modal-close" onclick="closeModal()">×</button>${html}</div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}

function closeModal() {
  document.getElementById('modal-overlay')?.remove();
}

// 强制导入确认弹窗。返回 'yes'（是）、'no'（否）或 null（取消）
// dupErrors: 重复记录的详细信息数组
// 强制导入确认弹窗。返回 'yes'（是）、'no'（否）或 null（取消）
// dupErrors: 重复记录的详细信息数组
function showForceConfirmDialog(skipped, total, dupErrors) {
  const ok = total - skipped;
  return new Promise((resolve) => {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'force-confirm-overlay';
    overlay.innerHTML = '<div class="modal" style="max-width:480px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px 12px 20px;border-bottom:1px solid #e5e7eb;">' +
        '<div style="font-size:16px;font-weight:700;">导入确认</div>' +
        '<button onclick="resolveForceConfirm(null)" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">&times;</button>' +
      '</div>' +
      '<div style="padding:16px 20px;">' +
        '<div style="margin-bottom:16px;font-size:14px;color:#374151;line-height:1.6;">导入结果：成功 <b>' + ok + '</b> 条，跳过 <b style="color:#e53e3e;">' + skipped + '</b> 条重复记录。</div>' +
        '<div style="margin-bottom:16px;font-size:14px;font-weight:600;color:#1f2937;">是否强制导入这' + skipped + '条重复记录？</div>' +
        '<div style="margin-bottom:20px;display:flex;gap:28px;font-size:14px;">' +
          '<label style="cursor:pointer;display:flex;align-items:center;gap:6px;">' +
            '<input type="radio" name="force-import" value="yes" style="accent-color:#1a56db;"> 是（导入全部' + total + '条）</label>' +
          '<label style="cursor:pointer;display:flex;align-items:center;gap:6px;">' +
            '<input type="radio" name="force-import" value="no" checked style="accent-color:#1a56db;"> 否（导入' + ok + '条）</label>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px;padding:12px 20px 16px 20px;border-top:1px solid #e5e7eb;">' +
        '<button class="btn btn-sm btn-primary" onclick="resolveForceConfirm(true)">确定</button>' +
      '</div>' +
    '</div>';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) { overlay.remove(); resolve(null); } });
    document.body.appendChild(overlay);
    window._forceConfirmResolve = resolve;
  });
}

function resolveForceConfirm(confirmed) {
  var overlay = document.getElementById('force-confirm-overlay');
  var choice = null;
  if (confirmed && overlay) {
    var selected = overlay.querySelector('input[name="force-import"]:checked');
    choice = selected ? selected.value : 'no';
  }
  if (overlay) overlay.remove();
  if (window._forceConfirmResolve) {
    window._forceConfirmResolve(choice);
    delete window._forceConfirmResolve;
  }
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

