#!/usr/bin/env python3
# replace_magic_strings.py
# 批量替换 index.html 中的魔法字符串为常量引用
# 用法：python replace_magic_strings.py

import re

FILE = 'static/index.html'

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# ── 第1步：在全局区域插入常量对象（幂等，已存在则跳过）──
CONST_BLOCK = """// ==================== 全局常量（替换魔法字符串）====================
const STATUS = {
  // 发票状态
  NORMAL: '正常',
  VOID: '作废',
  RED: '红冲',
  // 勾选状态
  CHECKED: '已勾选',
  UNCHECKED: '未勾选',
  // 认证/抵扣状态
  CERTIFIED: '已认证',
  DEDUCTED: '已抵扣',
  PARTIAL: '部分抵扣',
  NOT_DEDUCTIBLE: '不得抵扣',
  // 付款状态
  PENDING: '待审批',
  APPROVED: '已审批',
  PAID: '已付款',
  REJECTED: '已驳回',
  // 风险等级
  RISK_NORMAL: '正常',
  RISK_WARN: '疑点',
  RISK_ABNORMAL: '异常',
  RISK_LOST: '失控',
};
const PAYMENT_STATUS_COLORS = {
  [STATUS.PENDING]: '#c27803',
  [STATUS.APPROVED]: '#1a56db',
  [STATUS.PAID]: '#0e9f6e',
  [STATUS.REJECTED]: '#e02424'
};
// ============================================================

"""

if 'const STATUS = {' not in content:
    # 插在 "// ==================== 多公司支持 ====================" 前面
    anchor = '// ==================== 多公司支持 ===================='
    content = content.replace(anchor, CONST_BLOCK + anchor)
    print('[OK] 已插入 STATUS / PAYMENT_STATUS_COLORS 常量对象')
else:
    print('[WARN] 常量对象已存在，跳过插入')

# ── 第2步：付款状态下拉选项（含义唯一，安全替换）──
replacements = [
    # 付款状态下拉
    (
        r"(<option value=\")待审批(\">待审批</option>)",
        r"\1' + STATUS.PENDING + '\2".replace("\\1'", "' + STATUS.PENDING + '"),
    ),
]

# 用简单的字符串替换（只替换含义唯一的状态值）
simple_replaces = [
    # 付款状态下拉
    ("'<option value=\"待审批\">待审批</option>' +",
     "'<option value=\"' + STATUS.PENDING + '\">' + STATUS.PENDING + '</option>' +"),
    ("'<option value=\"已审批\">已审批</option>' +",
     "'<option value=\"' + STATUS.APPROVED + '\">' + STATUS.APPROVED + '</option>' +"),
    ("'<option value=\"已付款\">已付款</option>' +",
     "'<option value=\"' + STATUS.PAID + '\">' + STATUS.PAID + '</option>' +"),
    ("'<option value=\"已驳回\">已驳回</option>' +",
     "'<option value=\"' + STATUS.REJECTED + '\">' + STATUS.REJECTED + '</option>' +"),
    # 付款状态判断
    ("(p.status === '已审批' ?",
     "(p.status === STATUS.APPROVED ?"),
    ("(p.status === '待审批' ?",
     "(p.status === STATUS.PENDING ?"),
    # 付款状态统计卡片
    ("待审批</div><div class=\"psi-value\" style=\"color:#c27803\">",
     "' + STATUS.PENDING + '</div><div class=\"psi-value\" style=\"color:#c27803\">"),
    ("已审批</div><div class=\"psi-value\" style=\"color:#1a56db\">",
     "' + STATUS.APPROVED + '</div><div class=\"psi-value\" style=\"color:#1a56db\">"),
    ("已付款</div><div class=\"psi-value\" style=\"color:#0e9f6e\">",
     "' + STATUS.PAID + '</div><div class=\"psi-value\" style=\"color:#0e9f6e\">"),
    # markPaymentPaid
    ("{ status: '已付款' }",
     "{ status: STATUS.PAID }"),
    # paymentStatusBadge 内联 map
    ("'待审批': '#c27803', '已审批': '#1a56db', '已付款': '#0e9f6e', '已驳回': '#e02424'",
     "[STATUS.PENDING]: '#c27803', [STATUS.APPROVED]: '#1a56db', [STATUS.PAID]: '#0e9f6e', [STATUS.REJECTED]: '#e02424'"),
]

original_len = len(content)
for old, new in simple_replaces:
    if old in new:
        continue  # 防止死循环
    content = content.replace(old, new)

replaced = original_len - len(content)
print(f'[OK] 简单替换完成，影响字符数：{replaced}')

# ── 第3步：写入 ──
with open(FILE, 'w', encoding='utf-8') as f:
    f.write(content)

print(f'[OK] 已写入 {FILE}')
print('[WARN] 请手动检查发票状态（正常/作废/红冲）和风险等级（正常/疑点）的替换，因为它们有歧义')
