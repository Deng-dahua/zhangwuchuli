# 财税系统自动审查

## 触发条件
每次修改 `database.py`、`main.py`、`tax_risk.py` 后自动运行。

## 执行
```bash
cd caishuixitong && python audit.py 1
```

## 7项检查
1. 重复记账 — 同凭证号+科目+金额完全重复的行
2. 借贷不平 — 每组凭证的借方合计与贷方合计是否相等
3. 三号拆分 — 相同三号(invoice_code, invoice_no, digital_invoice_no)被拆分为多个凭证号
4. BK凭证号一致性 — BookkeepingInvoice.voucher_no 是否与序时账凭证号一致(通过三号匹配PI→JE)
5. 科目名称格式错误 — Account.name和JournalEntry.account_name是否含"/"全路径、是否与Account表一致
6. 档案锁定缺失 — 被序时账引用的部门/人员/客户/供应商是否在后端API正确锁定
7. 来源不一致 — JournalEntry.source 是否使用标准化值

## 要求
全部7项通过才提交代码。
