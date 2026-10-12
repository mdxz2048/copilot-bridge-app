import type {
  AppSettings,
  CloudServiceStatus,
} from "../bridge-api";

export function AccountSummaryCard({
  cloud,
  onLogin,
  onOpenDetails,
}: {
  busy: boolean;
  cloud: CloudServiceStatus | null;
  service: AppSettings["backendMode"];
  onLogin: () => void;
  onOpenDetails: () => void;
  onRenew: () => void;
  onUseCloud: () => void;
}) {
  if (cloud?.authState === "ACCOUNT_LOCKED") {
    return <button className="account-status-bar account-status-button" onClick={onOpenDetails} type="button"><strong>账号已锁定</strong><span>请联系管理员解锁</span><strong>账户 ›</strong></button>;
  }

  if (!cloud?.account) {
    return (
      <button
        className="account-status-bar account-status-button"
        onClick={onLogin}
        type="button"
      >
        <span className="account-summary-content"><span className="account-plan-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m4 7 4 4 4-7 4 7 4-4-2 11H6L4 7Z"/></svg></span><span>Copilot Bridge 云服务 · 未登录</span></span>
        <strong>登录 ›</strong>
      </button>
    );
  }

  return (
    <button
      className="account-status-bar account-status-button"
      onClick={onOpenDetails}
      title={cloud.account}
      type="button"
    >
      <span className="account-summary-content">
        <span className="account-plan-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m4 7 4 4 4-7 4 7 4-4-2 11H6L4 7Z"/></svg></span>
        <strong className="account-plan-name">{cloud.plan ?? "云服务"}</strong>
        <span className="account-summary-metrics">
          {cloud.billing ? <><span>本周期已用 ¥{cloud.billing.usedRmb.toFixed(4)}</span><span>{cloud.billing.balanceRmb <= 0 ? "余额不足 · 仍可使用" : `余额 ¥${cloud.billing.balanceRmb.toFixed(4)}`}</span></> : cloud.usagePointsUsed == null
            ? null : <span>本月已用 {formatPoints(cloud.usagePointsUsed)} 点</span>}
          {cloud.validUntil && <span>{formatShortDate(cloud.validUntil)}到期</span>}
        </span>
      </span>
      <strong>账户 ›</strong>
    </button>
  );
}

function formatPoints(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}
