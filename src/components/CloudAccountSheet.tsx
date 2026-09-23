import { useState } from "react";
import type {
  CloudAuthState,
  CloudServiceStatus,
} from "../bridge-api";
import { zhCN } from "../locales/zh-CN";
import { Button } from "./Button";
import { Sheet } from "./Sheet";

interface CloudAccountSheetProps {
  busy: boolean;
  status: CloudServiceStatus | null;
  onClose: () => void;
  onLogin: (credentials: { email: string; password: string }) => void;
  onLogout: () => void;
  onManageAccount: () => void;
  onManageSubscription: () => void;
  onRefresh: () => void;
  onUseLocal: () => void;
}

export function CloudAccountSheet({
  busy,
  status,
  onClose,
  onLogin,
  onLogout,
  onManageAccount,
  onManageSubscription,
  onRefresh,
  onUseLocal,
}: CloudAccountSheetProps) {
  const copy = zhCN.account;
  const authenticated = status?.authState === "AUTHENTICATED";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const state = accountState(status);
  const normalizedUsage = Math.max(
    0,
    Math.min(100, status?.usagePercent ?? 0),
  );

  return (
    <Sheet onClose={onClose} title={copy.title}>
      <div className="sheet-header">
        <span>{copy.title}</span>
        <Button className="secondary" onClick={onClose} type="button">
          {zhCN.common.close}
        </Button>
      </div>

      <div className={`account-state state-panel-${state.tone}`}>
        <strong>
          <span aria-hidden="true">{state.symbol}</span>
          {state.title}
        </strong>
        <p>{state.message}</p>
      </div>

      {!authenticated && status?.authState === "SIGNED_OUT" && (
        <div className="cloud-login-fields">
          <label>
            <span>{copy.email}</span>
            <input
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </label>
          <label>
            <span>{copy.password}</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>
          <Button
            disabled={busy || !email || !password}
            onClick={() => onLogin({ email, password })}
            type="button"
          >
            {copy.login}
          </Button>
        </div>
      )}

      {status?.account && (
        <>
          <h3>{copy.account}</h3>
          <p className="account-primary-value" title={status.account}>
            {status.account}
          </p>

          <h3>套餐</h3>
          <p className="account-primary-value">{status.plan ?? "—"}</p>
          <CloudValue
            label={copy.subscription}
            value={subscriptionLabel(status.subscriptionStatus)}
          />
          <CloudValue
            label={copy.validUntil}
            value={formatDate(status.validUntil)}
          />

          <h3>AI 用量</h3>
          <div className="account-usage">
            <div>
              <span>本月</span>
              <strong>{`${String(status.usagePercent ?? 0)}%`}</strong>
            </div>
            <div
              aria-label={`${copy.usage} ${String(normalizedUsage)}%`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={normalizedUsage}
              className="usage-track"
              role="progressbar"
            >
              <span style={{ width: `${String(normalizedUsage)}%` }} />
            </div>
            <small>
              {`${String(status.usageRequests ?? 0)} 次请求 · ${String(status.usageTokens ?? 0)} tokens`}
            </small>
          </div>
          <CloudValue
            label={copy.period}
            value={formatPeriod(
              status.currentPeriodStart,
              status.currentPeriodEnd,
            )}
          />

          <h3>{copy.device}</h3>
          <p className="account-primary-value">{status.currentDevice}</p>
          {status.currentDeviceId && (
            <div className="cloud-value">
              <span>设备 ID</span>
              <span className="copyable-value">
                <strong>{maskDeviceId(status.currentDeviceId)}</strong>
                <Button
                  className="secondary compact"
                  onClick={() =>
                    void navigator.clipboard.writeText(status.currentDeviceId!)}
                  type="button"
                >
                  复制
                </Button>
              </span>
            </div>
          )}
          <CloudValue
            label={copy.cloudStatus}
            value={
              status.authState === "AUTHENTICATED"
              && status.serviceStatus === "AVAILABLE"
                ? `● ${copy.normal}`
                : state.title
            }
          />
        </>
      )}

      <AccountActions
        busy={busy}
        onLogout={onLogout}
        onManageAccount={onManageAccount}
        onManageSubscription={onManageSubscription}
        onRefresh={onRefresh}
        onUseLocal={onUseLocal}
        state={status?.authState ?? "SIGNED_OUT"}
        accountAvailable={status?.accountManagementAvailable === true}
        subscriptionAvailable={
          status?.subscriptionManagementAvailable === true
        }
      />
    </Sheet>
  );
}

function AccountActions({
  accountAvailable,
  busy,
  onLogout,
  onManageAccount,
  onManageSubscription,
  onRefresh,
  onUseLocal,
  state,
  subscriptionAvailable,
}: {
  accountAvailable: boolean;
  busy: boolean;
  onLogout: () => void;
  onManageAccount: () => void;
  onManageSubscription: () => void;
  onRefresh: () => void;
  onUseLocal: () => void;
  state: CloudAuthState;
  subscriptionAvailable: boolean;
}) {
  const copy = zhCN.account;
  if (state === "SIGNED_OUT" || state === "AUTHENTICATING") return null;

  const subscriptionAction = state === "SUBSCRIPTION_EXPIRED"
    ? copy.renew
    : state === "QUOTA_EXCEEDED" || state === "SUBSCRIPTION_REQUIRED"
      ? copy.upgrade
      : copy.manageSubscription;
  const accountAction = state === "DEVICE_REVOKED"
    ? copy.manageDevice
    : copy.manageAccount;
  return (
    <div className="cloud-actions">
      {(state === "SUBSCRIPTION_EXPIRED"
        || state === "SUBSCRIPTION_REQUIRED"
        || state === "QUOTA_EXCEEDED"
        || state === "AUTHENTICATED") && (
        <Button
          disabled={busy || !subscriptionAvailable}
          onClick={onManageSubscription}
          type="button"
        >
          {subscriptionAction}
        </Button>
      )}
      {(state === "DEVICE_REVOKED" || state === "AUTHENTICATED") && (
        <Button
          className="secondary"
          disabled={busy || !accountAvailable}
          onClick={onManageAccount}
          type="button"
        >
          {accountAction}
        </Button>
      )}
      {state === "SERVER_UNREACHABLE" && (
        <Button disabled={busy} onClick={onRefresh} type="button">
          {copy.retry}
        </Button>
      )}
      {state !== "AUTHENTICATED" && (
        <Button className="secondary" disabled={busy} onClick={onUseLocal} type="button">
          {copy.useLocal}
        </Button>
      )}
      {state === "AUTHENTICATED" && (
        <Button className="secondary" disabled={busy} onClick={onLogout} type="button">
          {copy.logout}
        </Button>
      )}
    </div>
  );
}

function CloudValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="cloud-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function accountState(status: CloudServiceStatus | null) {
  const copy = zhCN.account;
  const state = status?.authState ?? "SIGNED_OUT";
  const states = {
    SIGNED_OUT: {
      title: copy.signedOut,
      message: copy.signedOutMessage,
      symbol: "○",
      tone: "neutral",
    },
    AUTHENTICATING: {
      title: copy.authenticating,
      message: "正在验证账号并注册当前设备。",
      symbol: "◌",
      tone: "neutral",
    },
    AUTHENTICATED: {
      title: copy.authenticated,
      message: "你的套餐和设备状态已同步。",
      symbol: "●",
      tone: "success",
    },
    DEVICE_REVOKED: {
      title: copy.deviceRevoked,
      message: copy.deviceRevokedMessage,
      symbol: "●",
      tone: "danger",
    },
    SUBSCRIPTION_REQUIRED: {
      title: copy.subscriptionRequired,
      message: copy.subscriptionRequiredMessage,
      symbol: "●",
      tone: "warning",
    },
    SUBSCRIPTION_EXPIRED: {
      title: copy.subscriptionExpired,
      message: copy.subscriptionExpiredMessage,
      symbol: "●",
      tone: "warning",
    },
    QUOTA_EXCEEDED: {
      title: copy.quotaExceeded,
      message: status?.currentPeriodEnd
        ? `额度将在${formatDate(status.currentPeriodEnd)}恢复。`
        : copy.quotaExceededMessage,
      symbol: "●",
      tone: "warning",
    },
    SERVER_UNREACHABLE: {
      title: copy.serverUnreachable,
      message: copy.serverUnreachableMessage,
      symbol: "●",
      tone: "warning",
    },
  } as const;
  return states[state];
}

function subscriptionLabel(status: string | null): string {
  if (status === "ACTIVE" || status === "TRIAL") {
    return `● ${zhCN.account.active}`;
  }
  if (!status) return "—";
  const labels: Record<string, string> = {
    EXPIRED: "已到期",
    PAST_DUE: "待续费",
    CANCELED: "已取消",
    SUSPENDED: "已暂停",
  };
  return labels[status] ?? status;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function formatPeriod(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
  });
  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
}

function maskDeviceId(value: string): string {
  return `${value.slice(0, 4).toUpperCase()}…${value.slice(-4).toUpperCase()}`;
}
