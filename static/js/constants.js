// ==================== 全局常量（替换魔法字符串）====================
const STATUS = {
  // 发票状态
  NORMAL: '正常',
  VOID: STATUS.VOID,
  RED: STATUS.RED,
  // 勾选状态
  CHECKED: STATUS.CHECKED,
  UNCHECKED: STATUS.UNCHECKED,
  // 认证/抵扣状态
  CERTIFIED: STATUS.CERTIFIED,
  DEDUCTED: STATUS.DEDUCTED,
  PARTIAL: STATUS.PARTIAL,
  NOT_DEDUCTIBLE: STATUS.NOT_DEDUCTIBLE,
  // 付款状态
  PENDING: '待审批',
  APPROVED: '已审批',
  PAID: '已付款',
  REJECTED: '已驳回',
  // 风险等级
  RISK_NORMAL: '正常',
  RISK_WARN: STATUS.RISK_WARN,
  RISK_ABNORMAL: STATUS.RISK_ABNORMAL,
  RISK_LOST: STATUS.RISK_LOST,
};
const PAYMENT_STATUS_COLORS = {
  [STATUS.PENDING]: '#c27803',
  [STATUS.APPROVED]: '#1a56db',
  [STATUS.PAID]: '#0e9f6e',
  [STATUS.REJECTED]: '#e02424'
};
// ============================================================

