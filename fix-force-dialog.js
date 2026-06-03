// fix-force-dialog.js
// 精准替换损坏的 showForceConfirmDialog + resolveForceConfirm 为正确版本

const fs = require('fs');
const path = process.argv[2] || 'static/index.html';

let content = fs.readFileSync(path, 'utf8');

const old = `// 强制导入确认弹窗。返回 'yes'（是）、'no'（否）或 null（取消）
// dupErrors: 重复记录的详细信息数组
function showForceConfirmDialog(skipped, total, dupErrors) {
  const ok = total - skipped;
  return new Promise((resolve) => {
    const errHtml = (dupErrors && dupErrors.length > 0)
      ? \`<div style="margin-bottom:16px;font-size:13px;color:var(--gray-700);max-height:180px;overflow-y:auto;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:6px;padding:10px 12px;line-height:1.7;">
           \${dupErrors.map(e => \`<div style="padding:2px 0;">• \${e}</div>\`).join('')}
         </div>\`
      : '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'force-confirm-overlay';
    overlay.innerHTML = \`<div class="modal" style="max-width:660px;">
      <div class="modal-title">导入确认</div>
      <div style="margin-bottom:12px;font-size:14px;color:var(--gray-700);line-height:1.6;">
        导入结果：成功 <b>\${ok}</b> 条，跳过 <b style="color:#e53e3e;">\${skipped}</b> 条重复记录。
      </div>
      \${errHtml}
      <div style="margin-bottom:16px;font-size:14px;font-weight:600;color:var(--gray-800);">
        是否强制导入这\${skipped}条重复记录？
      </div>
      <div style="margin-bottom:20px;display:flex;gap:28px;font-size:14px;">
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;">
          <input type="radio" name="force-import" value="yes" style="accent-color:var(--primary);"> 是（导入全部\${total}条）
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;">
          <input type="radio" name="force-import" value="no" checked style="accent-color:var(--primary);"> 否（导入\${ok}条）
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-sm" onclick="resolveForceConfirm(null)" style="background:var(--gray-200);color:var(--gray-700);">取消</button>
        <button class="btn btn-sm btn-primary" onclick="resolveForceConfirm(true)">确定</button>
      </div>
    </div>\`;
    overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(null); } });
    document.body.appendChild(overlay);
    window._forceConfirmResolve = resolve;
  });
}

function resolveForceConfirm(confirmed) {
  const overlay = document.getElementById('force-confirm-overlay');
  let choice = null;
  if (confirmed) {
    const selected = overlay?.querySelector('input[name="force-import"]:checked');
    choice = selected ? selected.value : 'no';
  }
  overlay?.remove();
  if (window._forceConfirmResolve) {
    window._forceConfirmResolve(choice);
    delete window._forceConfirmResolve;
  }
}`;

const replacement = `// 强制导入确认弹窗。返回 'yes'（是）、'no'（否）或 null（取消）
// dupErrors: 重复记录的详细信息数组
function showForceConfirmDialog(skipped, total, dupErrors) {
  const ok = total - skipped;
  return new Promise((resolve) => {
    // 构建重复信息HTML
    var dupHtml = '';
    if (dupErrors && dupErrors.length > 0) {
      var items = dupErrors.map(function(e) { return '<div style="padding:3px 0;">• ' + e + '</div>'; }).join('');
      dupHtml = '<div style="margin-bottom:16px;font-size:13px;color:#374151;max-height:260px;overflow-y:auto;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;line-height:1.7;">' + items + '</div>';
    }
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'force-confirm-overlay';
    overlay.innerHTML = '<div class="modal" style="max-width:680px;max-height:88vh;overflow-y:auto;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px 12px 20px;border-bottom:1px solid #e5e7eb;">' +
        '<div style="font-size:16px;font-weight:700;">导入确认</div>' +
        '<button onclick="resolveForceConfirm(null)" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">&times;</button>' +
      '</div>' +
      '<div style="padding:16px 20px;">' +
        '<div style="margin-bottom:12px;font-size:14px;color:#374151;line-height:1.6;">导入结果：成功 <b>' + ok + '</b> 条，跳过 <b style="color:#e53e3e;">' + skipped + '</b> 条重复记录。</div>' +
        dupHtml +
        '<div style="margin-bottom:16px;font-size:14px;font-weight:600;color:#1f2937;">是否强制导入这' + skipped + '条重复记录？</div>' +
        '<div style="margin-bottom:20px;display:flex;gap:28px;font-size:14px;">' +
          '<label style="cursor:pointer;display:flex;align-items:center;gap:6px;">' +
            '<input type="radio" name="force-import" value="yes" style="accent-color:#1a56db;"> 是（导入全部' + total + '条）</label>' +
          '<label style="cursor:pointer;display:flex;align-items:center;gap:6px;">' +
            '<input type="radio" name="force-import" value="no" checked style="accent-color:#1a56db;"> 否（导入' + ok + '条）</label>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px;padding:12px 20px 16px 20px;border-top:1px solid #e5e7eb;">' +
        '<button class="btn btn-sm" onclick="resolveForceConfirm(null)" style="background:#e5e7eb;color:#374151;">取消</button>' +
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
}`;

// 尝试精确匹配（处理Windows/Unix换行）
const variations = [
  old,
  old.replace(/\r\n/g, '\n'),
  old.replace(/\n/g, '\r\n')
];

let replaced = false;
for (const v of variations) {
  if (content.includes(v)) {
    content = content.replace(v, replacement);
    replaced = true;
    console.log('✅ 精确匹配替换成功');
    break;
  }
}

if (!replaced) {
  // 退而求其次：按函数签名定位，替换从 showForceConfirmDialog 到下一个 function 之前的内容
  console.log('⚠️  精确匹配失败，尝试按函数边界替换...');
  // 找到 showForceConfirmDialog 起点和 resolveForceConfirm 终点
  const startIdx = content.indexOf('function showForceConfirmDialog(');
  if (startIdx === -1) {
    console.error('❌ 找不到 showForceConfirmDialog 函数，中止');
    process.exit(1);
  }
  // 找到 resolveForceConfirm 函数结束位置（下一个 function 或 </script>）
  const resolveStart = content.indexOf('function resolveForceConfirm(', startIdx);
  if (resolveStart === -1) {
    console.error('❌ 找不到 resolveForceConfirm 函数，中止');
    process.exit(1);
  }
  // 找到 resolveForceConfirm 函数体结束的右大括号
  let braceCount = 0;
  let endIdx = -1;
  let inFunc = false;
  for (let i = resolveStart; i < content.length; i++) {
    if (content[i] === '{') { braceCount++; inFunc = true; }
    if (content[i] === '}') { braceCount--; }
    if (inFunc && braceCount === 0) { endIdx = i + 1; break; }
  }
  if (endIdx === -1) {
    console.error('❌ 找不到 resolveForceConfirm 函数结束位置，中止');
    process.exit(1);
  }
  content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
  replaced = true;
  console.log('✅ 按函数边界替换成功');
}

fs.writeFileSync(path, content, 'utf8');
console.log('✅ 文件已更新：' + path);
