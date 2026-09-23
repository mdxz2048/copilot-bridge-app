import type {
  AppSettings,
  CloudServiceStatus,
} from "../bridge-api";
import { zhCN } from "../locales/zh-CN";
import { Button } from "./Button";

export function AccountSummaryCard({
  busy,
  cloud,
  service,
  onLogin,
  onOpenDetails,
  onRenew,
  onUseCloud,
}: {
  busy: boolean;
  cloud: CloudServiceStatus | null;
  service: AppSettings["backendMode"];
  onLogin: () => void;
  onOpenDetails: () => void;
  onRenew: () => void;
  onUseCloud: () => void;
}) {
  const signedIn = cloud?.account != null;
  if (!signedIn) {
    return (
      <section aria-labelledby="account-summary-heading">
        <h2 id="account-summary-heading">账号与订阅</h2>
        <div className="card account-summary-card signed-out-summary">
          <div>
            <strong>Copilot Bridge 云服务</strong>
            <p>登录后可使用托管 AI 模型，管理订阅、设备和 AI 用量。</p>
          </div>
          <Button disabled={busy} onClick={onLogin} type="button">
            {zhCN.account.login}
          </Button>
        </div>
      </section>
    );
  }

  const normalizedUsage = Math.max(
    0,
    Math.min(100, cloud.usagePercent ?? 0),
  );
  const actionLabel = cloud.authState === "SUBSCRIPTION_EXPIRED"
    ? zhCN.account.renew
    : cloud.authState === "QUOTA_EXCEEDED"
      ? zhCN.account.upgrade
      : "续费";

  return (
    <section aria-labelledby="account-summary-heading">
      <h2 id="account-summary-heading">账号与订阅</h2>
      <div className="card account-summary-card">
        <div className="account-summary-header">
          <strong title={cloud.account ?? undefined}>{cloud.account}</strong>
          {cloud.plan && <span className="plan-pill">{cloud.plan}</span>}
        </div>
        <div className="account-summary-usage">
          <div>
            <span>{zhCN.account.usage}</span>
            <strong>{`${String(cloud.usagePercent ?? 0)}%`}</strong>
          </div>
          <div
            aria-label={`${zhCN.account.usage} ${String(normalizedUsage)}%`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={normalizedUsage}
            className="usage-track"
            role="progressbar"
          >
            <span style={{ width: `${String(normalizedUsage)}%` }} />
          </div>
          <small>
            {`${String(cloud.usageRequests ?? 0)} 次请求 · ${String(cloud.usageTokens ?? 0)} tokens`}
          </small>
        </div>
        <div className="account-summary-meta">
          <span>到期</span>
          <strong>{formatDate(cloud.validUntil)}</strong>
          <span>设备</span>
          <strong>{cloud.currentDevice}</strong>
        </div>
        {service === "LOCAL" && (
          <p className="account-mode-note">
            正在使用“我的 GitHub Copilot”，不消耗云服务 AI 用量。
          </p>
        )}
        <div className="account-summary-actions">
          {service === "LOCAL" && (
            <Button className="compact" disabled={busy} onClick={onUseCloud} type="button">
              切换到云服务
            </Button>
          )}
          <Button className="secondary compact" onClick={onOpenDetails} type="button">
            账号详情
          </Button>
          <Button className="secondary compact" onClick={onRenew} type="button">
            {actionLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}
