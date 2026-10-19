import type {
  AppSettings,
  CloudServiceStatus,
} from "../bridge-api";

export function AccountSummaryCard({
  cloud,
  busy,
  onTopup,
  onLogin,
  onOpenDetails,
}: {
  busy: boolean;
  cloud: CloudServiceStatus | null;
  service: AppSettings["backendMode"];
  onTopup: () => void;
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
    <div className="account-status-bar" aria-label="账户摘要">
      <span className="account-summary-content">
        <span className="account-plan-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m4 7 4 4 4-7 4 7 4-4-2 11H6L4 7Z"/></svg></span>
        <strong className="account-plan-name">{cloud.plan ?? "云服务"}</strong>
        <span className="account-summary-metrics">
          {cloud.billing ? <><span>本周期已用 ¥{cloud.billing.usedRmb.toFixed(4)}</span><span>{cloud.billing.balanceRmb <= 0 ? "余额不足 · 需充值" : `余额 ¥${cloud.billing.balanceRmb.toFixed(4)}`}</span></> : cloud.usagePointsUsed == null
            ? null : <span>本月已用 {formatPoints(cloud.usagePointsUsed)} 点</span>}
          {cloud.validUntil && <span>{formatShortDate(cloud.validUntil)}到期</span>}
        </span>
      </span>
      <div className="account-summary-actions">
        {cloud.authState === "AUTHENTICATED" && <>
          <span className="account-login-state">已登录<span aria-hidden="true"> · </span></span>
          <button className="account-topup-link" type="button" disabled={busy} onClick={onTopup}>充值</button>
        </>}
        <button className="account-details-action" title={cloud.account} onClick={onOpenDetails} type="button">账户 ›</button>
      </div>
    </div>
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
