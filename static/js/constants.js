// ==================== 全局常量（替换魔法字符串）====================
const STATUS = {
  // 发票/档案通用状态
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
  RISK_FOLLOW: '关注',
  FOLLOW_ATTENTION: '关注',
  RISK_WARN: '疑点',
  RISK_ABNORMAL: '异常',
  RISK_LOST: '失控',
};
const PAYMENT_STATUS_COLORS = {
  '待审批': '#c27803',
  '已审批': '#1a56db',
  '已付款': '#0e9f6e',
  '已驳回': '#e02424'
};
// ============================================================

