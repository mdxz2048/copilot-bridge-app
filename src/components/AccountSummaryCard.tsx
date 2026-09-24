import type {
  AppSettings,
  CloudServiceStatus,
} from "../bridge-api";

export function AccountSummaryCard({
  cloud,
  service,
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
  if (!cloud?.account) {
    return (
      <button
        className="account-status-bar account-status-button"
        onClick={onLogin}
        type="button"
      >
        <span>Copilot Bridge 云服务 · 未登录</span>
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
      <span>
        <strong>{cloud.plan ?? "云服务"}</strong>
        {cloud.usagePointsUsed == null
          ? ""
          : ` · 本月已用 ${formatPoints(cloud.usagePointsUsed)} 点`}
        {cloud.validUntil ? ` · ${formatShortDate(cloud.validUntil)}到期` : ""}
        {service === "LOCAL" ? " · 当前使用我的 GitHub Copilot" : ""}
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
