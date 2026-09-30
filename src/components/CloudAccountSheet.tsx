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
  loginIssue: "SUBSCRIPTION_REQUIRED" | null;
  status: CloudServiceStatus | null;
  onClose: () => void;
  onLogin: (credentials: { email: string; password: string }) => void;
  onOpenRegistration: () => void;
  onLogout: () => void;
  onManageAccount: () => void;
  onManageSubscription: () => void;
  onRefresh: () => void;
  onRevokeDevice: (id: string) => void;
  onUseLocal: () => void;
}

export function CloudAccountSheet({
  busy,
  loginIssue,
  status,
  onClose,
  onLogin,
  onOpenRegistration,
  onLogout,
  onManageAccount,
  onManageSubscription,
  onRefresh,
  onRevokeDevice,
  onUseLocal,
}: CloudAccountSheetProps) {
  const copy = zhCN.account;
  const authenticated = status?.authState === "AUTHENTICATED";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [view, setView] = useState<
    "account" | "devices" | "referral" | "usage"
  >("account");
  const state = accountState(status);
  const subscriptionRequired = !authenticated
    && (loginIssue === "SUBSCRIPTION_REQUIRED"
      || status?.authState === "SUBSCRIPTION_REQUIRED");
  const normalizedUsage = Math.max(
    0,
    Math.min(100, status?.usagePercent ?? 0),
  );

  return (
    <Sheet onClose={onClose} title={copy.title}>
      <div className="sheet-header">
        <span>{view === "devices" ? "我的设备" : "我的账户"}</span>
        <Button className="secondary" onClick={onClose} type="button">
          {zhCN.common.close}
        </Button>
      </div>

      {view === "devices"
        ? (
          <DeviceList
            currentDeviceId={status?.currentDeviceId ?? null}
            devices={status?.devices ?? []}
            onBack={() => setView("account")}
            onRevoke={onRevokeDevice}
          />
        )
        : view === "referral"
          ? (
            <ReferralDetail
              history={status?.referralHistory ?? []}
              onBack={() => setView("account")}
              referral={status?.referral ?? null}
              registrationUrl={status?.referralRegistrationUrl ?? null}
            />
          )
          : view === "usage"
            ? (
              <UsageDetail
                history={status?.usageHistory ?? []}
                onBack={() => setView("account")}
                transactions={status?.walletTransactions ?? []}
              />
            )
        : (
          <>
            {subscriptionRequired ? (
              <div className="account-state state-panel-warning" role="status">
                <strong>Cloud 套餐未开通</strong>
                <p>注册不会自动开通套餐。网站二维码仅为测试占位，不收款、不会自动开通；请联系管理员人工开通，开通后返回此处重试登录。</p>
                {status?.accountManagementAvailable
                  ? <Button className="secondary compact" onClick={onManageAccount} type="button">打开网站账户中心查看开通说明</Button>
                  : <p>当前环境未配置网站入口，请联系管理员开通后重试。</p>}
              </div>
            ) : (
              <div className={`account-state state-panel-${state.tone}`}>
                <strong>
                  <span aria-hidden="true">{state.symbol}</span>
                  {state.title}
                </strong>
                <p>{state.message}</p>
              </div>
            )}

            {!authenticated && (status?.authState === "SIGNED_OUT"
              || status?.authState === "SUBSCRIPTION_REQUIRED") && (
        <div className="cloud-login-fields">
          <div className="cloud-auth-mode">
            <strong>登录 Cloud</strong>
            {status?.accountManagementAvailable && (
              <Button className="secondary compact" onClick={onOpenRegistration} type="button">
                去网站注册
              </Button>
            )}
          </div>
          <p>新账号请先在网站注册，待管理员开通 Cloud 套餐后返回 App 登录。</p>
          {!status?.accountManagementAvailable && <p>当前环境未配置网站注册地址，请联系管理员。</p>}
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
            onClick={() => onLogin({ email: email.trim(), password })}
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

          <h3>AI 点数</h3>
          <div className="account-usage">
            <div>
              <span>本月已用</span>
              <strong>
                {status.usagePointsUsed == null
                  ? "—"
                  : `${formatPoints(status.usagePointsUsed)} 点`}
              </strong>
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
              {status.remainingPoints == null
                ? "剩余点数待服务端提供"
                : `剩余 ${formatPoints(status.remainingPoints)} 点`}
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
          <button
            className="account-link-row"
            onClick={() => setView("devices")}
            type="button"
          >
            <span>{`${String(status.devices.length)} 台设备`}</span>
            <strong>查看 ›</strong>
          </button>
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
          <h3>邀请奖励</h3>
          <button
            className="account-link-row"
            disabled={!status.referral}
            onClick={() => setView("referral")}
            type="button"
          >
            <span>
              {status.referral
                ? `${status.referral.rewarded} 个有效邀请 · ${formatPoints(status.referral.pointsEarned)} 点`
                : "暂无邀请数据"}
            </span>
            <strong>查看 ›</strong>
          </button>
          <h3>账单与使用记录</h3>
          <button
            className="account-link-row"
            onClick={() => setView("usage")}
            type="button"
          >
            <span>
              {`${
                status.walletTransactions.length + status.usageHistory.length
              } 条记录`}
            </span>
            <strong>查看 ›</strong>
          </button>
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
          </>
        )}
    </Sheet>
  );
}

function DeviceList({
  currentDeviceId,
  devices,
  onBack,
  onRevoke,
}: {
  currentDeviceId: string | null;
  devices: CloudServiceStatus["devices"];
  onBack: () => void;
  onRevoke: (id: string) => void;
}) {
  return (
    <div className="device-list">
      <Button className="secondary compact" onClick={onBack} type="button">
        ‹ 返回账户
      </Button>
      {devices.length === 0
        ? <p className="empty-detail">暂无设备数据。</p>
        : devices.map((device) => (
          <article className="device-row" key={device.id}>
            <div>
              <strong>
                {device.status === "ACTIVE" ? "●" : "○"}
                {` ${device.name}`}
              </strong>
              <span>
                {device.platform}
                {device.deviceId === currentDeviceId ? " · 当前设备" : ""}
              </span>
            </div>
            <div className="device-row-action">
              <span>{formatLastSeen(device.lastSeenAt)}</span>
              {!device.current && device.status === "ACTIVE" && (
                <Button
                  className="secondary compact"
                  onClick={() => onRevoke(device.id)}
                  type="button"
                >
                  移除此设备
                </Button>
              )}
            </div>
          </article>
        ))}
    </div>
  );
}

function ReferralDetail({
  history,
  onBack,
  referral,
  registrationUrl,
}: {
  history: CloudServiceStatus["referralHistory"];
  onBack: () => void;
  referral: CloudServiceStatus["referral"];
  registrationUrl: string | null;
}) {
  const [copyFeedback, setCopyFeedback] = useState<{
    message: string;
    error: boolean;
  } | null>(null);

  const copy = async (value: string, kind: "邀请码" | "邀请链接") => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(value);
      setCopyFeedback({ message: `${kind}已复制，可以分享给朋友。`, error: false });
    } catch {
      setCopyFeedback({
        message: `${kind}复制失败，请手动选中上方${kind}复制。`,
        error: true,
      });
    }
  };

  return (
    <div className="detail-view">
      <Button className="secondary compact" onClick={onBack} type="button">
        ‹ 返回账户
      </Button>
      {referral && (
        <>
          <h3>你的邀请码</h3>
          <div className="copy-code">
            <code>{referral.code}</code>
            <Button
              className="secondary compact"
              onClick={() => void copy(referral.code, "邀请码")}
              type="button"
            >
              复制邀请码
            </Button>
          </div>
          {registrationUrl ? (
            <div className="copy-code invite-link">
              <code>{registrationUrl}</code>
              <Button
                className="secondary compact"
                onClick={() => void copy(registrationUrl, "邀请链接")}
                type="button"
              >
                复制邀请链接
              </Button>
            </div>
          ) : (
            <p>当前环境未配置可信的网站邀请链接，可复制邀请码分享。</p>
          )}
          {copyFeedback && (
            <p role={copyFeedback.error ? "alert" : "status"}>{copyFeedback.message}</p>
          )}
          <p>注册仅记录邀请，不即时发奖。需受邀人的真实付费订单满足活动门槛及风控条件后，才可能获得奖励；测试占位二维码和单纯的人工开通不代表已付款。是否入账以服务端邀请记录和点数流水为准。</p>
          <div className="detail-stats">
            <CloudValue label="已邀请" value={String(referral.registered)} />
            <CloudValue label="有效邀请" value={String(referral.rewarded)} />
            <CloudValue
              label="累计奖励"
              value={`${formatPoints(referral.pointsEarned)} 点`}
            />
          </div>
        </>
      )}
      <h3>邀请记录</h3>
      {history.length === 0
        ? <p className="empty-detail">暂无邀请记录。</p>
        : history.map((record) => (
          <div className="history-row" key={record.id}>
            <span>{formatDate(record.registeredAt)}</span>
            <strong>{referralStatusLabel(record.status)}</strong>
          </div>
        ))}
    </div>
  );
}

function UsageDetail({
  history,
  onBack,
  transactions,
}: {
  history: CloudServiceStatus["usageHistory"];
  onBack: () => void;
  transactions: CloudServiceStatus["walletTransactions"];
}) {
  return (
    <div className="detail-view">
      <Button className="secondary compact" onClick={onBack} type="button">
        ‹ 返回账户
      </Button>
      <h3>AI 请求记录</h3>
      {history.length === 0
        ? <p className="empty-detail">暂无 AI 请求记录。</p>
        : (
          <>
            {history.slice(0, 20).map((record) => (
              <div className="history-row" key={record.id}>
                <div>
                  <strong>AI 请求</strong>
                  <span>{formatDate(record.createdAt)}</span>
                </div>
                <strong>{usageStatusLabel(record.status)}</strong>
              </div>
            ))}
            {history.length > 20 && (
              <p className="empty-detail">仅显示最近 20 条请求。</p>
            )}
          </>
        )}
      <h3>点数记录</h3>
      {transactions.length === 0
        ? <p className="empty-detail">暂无点数记录。</p>
        : transactions.map((transaction) => (
          <div className="history-row" key={transaction.id}>
            <div>
              <strong>{walletTypeLabel(transaction.type)}</strong>
              <span>{formatDate(transaction.createdAt)}</span>
            </div>
            <strong className={transaction.points >= 0 ? "positive" : ""}>
              {`${transaction.points >= 0 ? "+" : ""}${formatPoints(transaction.points)} 点`}
            </strong>
          </div>
        ))}
    </div>
  );
}

function usageStatusLabel(status: string): string {
  return {
    RUNNING: "处理中",
    COMPLETED: "已完成",
    FAILED: "失败",
  }[status] ?? status;
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
    : state === "QUOTA_EXCEEDED"
      ? copy.upgrade
      : copy.manageSubscription;
  const accountAction = state === "DEVICE_REVOKED"
    ? copy.manageDevice
    : copy.manageAccount;
  return (
    <div className="cloud-actions">
      {(state === "SUBSCRIPTION_EXPIRED"
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

function formatPoints(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatLastSeen(value: string | null): string {
  if (!value) return "尚未活跃";
  const elapsed = Date.now() - new Date(value).getTime();
  if (elapsed < 5 * 60_000) return "刚刚活跃";
  if (elapsed < 24 * 60 * 60_000) {
    return `${String(Math.max(1, Math.floor(elapsed / 3_600_000)))} 小时前`;
  }
  return `${String(Math.max(1, Math.floor(elapsed / 86_400_000)))} 天前`;
}

function referralStatusLabel(
  status: CloudServiceStatus["referralHistory"][number]["status"],
): string {
  return {
    REGISTERED: "已注册",
    PENDING: "待审核",
    QUALIFIED: "已达成",
    REWARDED: "已奖励",
    REJECTED: "未通过",
  }[status];
}

function walletTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    PURCHASE: "购买点数",
    SUBSCRIPTION_GRANT: "套餐发放",
    REFERRAL_REWARD: "邀请奖励",
    USAGE: "AI 使用",
    REFUND: "退款",
    EXPIRATION: "点数到期",
    ADMIN_ADJUSTMENT: "账户调整",
  };
  return labels[type] ?? "点数变动";
}
