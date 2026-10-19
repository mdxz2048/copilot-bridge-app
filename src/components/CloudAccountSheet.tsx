import {InviteFriendControl} from "./InviteFriendControl";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type {
  CloudAuthState,
  CloudServiceStatus,
} from "../bridge-api";
import { zhCN } from "../locales/zh-CN";
import { Button } from "./Button";
import { CompactDialog } from "./CompactDialog";

interface CloudAccountSheetProps {
  busy: boolean;
  loginIssue: "SUBSCRIPTION_REQUIRED" | null;
  status: CloudServiceStatus | null;
  onClose: () => void;
  onLogin: (credentials: { email: string; password: string; replaceDeviceId?: string }) => void;
  onOpenRegistration: () => void;
  onLogout: () => void;
  onManageAccount: () => void;
  onManageSubscription: () => void;
  onRefresh: () => void;
  onRevokeDevice: (id: string) => void;
  onUseOriginal: () => void;
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
  onUseOriginal,
}: CloudAccountSheetProps) {
  const copy = zhCN.account;
  const authenticated = status?.authState === "AUTHENTICATED";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const passwordInputId = useId();
  const passwordInput = useRef<HTMLInputElement>(null);
  const passwordSelection = useRef<{start: number; end: number; direction: "forward" | "backward" | "none"} | null>(null);
  useEffect(() => setPasswordVisible(false), [authenticated]);
  useLayoutEffect(() => {
    const selection = passwordSelection.current;
    if (selection) passwordInput.current?.setSelectionRange(selection.start, selection.end, selection.direction);
    passwordSelection.current = null;
  }, [passwordVisible]);
  const togglePasswordVisibility = () => {
    const input = passwordInput.current;
    if (input?.selectionStart != null && input.selectionEnd != null) {
      passwordSelection.current = {start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection ?? "none"};
    }
    setPasswordVisible(visible => !visible);
  };
  const [view, setView] = useState<
    "account" | "devices" | "referral" | "usage"
  >("account");
  useEffect(()=>setView("account"),[authenticated]);
  const state = accountState(status);
  const subscriptionRequired = !authenticated
    && (loginIssue === "SUBSCRIPTION_REQUIRED"
      || status?.authState === "SUBSCRIPTION_REQUIRED");
  const title=view==="devices"?"我的设备":view==="referral"?"邀请记录":view==="usage"?"充值与调整记录":"我的账户";
  const money=Boolean(status?.billing),total=money?`¥${status!.billing!.balanceRmb.toFixed(4)}`:status?.remainingPoints==null?"—":`${formatPoints(status.remainingPoints)} 点`;
  const online=(status?.devices??[]).filter(d=>d.status==="ACTIVE"&&(d.current||(d.lastSeenAt&&Date.now()-Date.parse(d.lastSeenAt)<300000))).length;
  const loginLimit=status?.loginDeviceLimit?.email===email.trim().toLowerCase()?status.loginDeviceLimit:undefined;
  const balanceRequired=authenticated&&status?.billing!=null&&status.billing.balanceRmb<=0;
  const healthy=authenticated&&status?.serviceStatus==="AVAILABLE"&&!balanceRequired;
  const badge=balanceRequired?"余额不足":healthy?"账户正常":state.title;
  const back=()=>setView("account");
  const footer=authenticated?<><Button className="secondary compact" disabled={busy||!status?.accountManagementAvailable} onClick={onManageAccount}>账户管理</Button><Button className="compact text-action" disabled={busy} onClick={onLogout}>退出登录</Button></>:status?.authState==="SIGNED_OUT"||status?.authState==="AUTHENTICATING"?null:<AccountActions loggedIn={Boolean(status?.account)} busy={busy} onLogout={onLogout} onManageAccount={onManageAccount} onManageSubscription={onManageSubscription} onRefresh={onRefresh} onUseOriginal={onUseOriginal} state={status?.authState??"SIGNED_OUT"} accountAvailable={status?.accountManagementAvailable===true} subscriptionAvailable={status?.subscriptionManagementAvailable===true}/>;
  return <CompactDialog onClose={onClose} title={title} className={`account-dialog ${view==="account"?"account-overview":"account-detail"}`} subtitle={status?.account&&<div className="compact-identity"><span title={status.account}>{status.account}</span><span className={`account-badge ${healthy?"good":"attention"}`}>{badge}</span></div>} footer={footer}>
    {view==="devices"?<DeviceList currentDeviceId={status?.currentDeviceId??null} devices={status?.devices??[]} onBack={back} onRevoke={onRevokeDevice}/>:view==="referral"?<ReferralDetail history={status?.referralHistory??[]} onBack={back} referral={status?.referral??null} registrationUrl={status?.referralRegistrationUrl??null}/>:view==="usage"?<BalanceRecords transactions={status?.walletTransactions??[]} onBack={back} total={total} money={money}/>:<>
    {(!status?.account)&&<div className={`compact-state state-panel-${state.tone}`} role="status"><strong>{subscriptionRequired?"Cloud 套餐未开通":state.title}</strong><p>{subscriptionRequired?(status?.accountManagementAvailable?"请联系管理员开通套餐后重试登录。":"当前环境未配置网站入口，请联系管理员开通后重试。"):state.message}</p>{subscriptionRequired&&status?.accountManagementAvailable&&<Button className="secondary compact" onClick={onManageAccount}>打开网站账户中心查看开通说明</Button>}</div>}
    {!authenticated&&(status?.authState==="SIGNED_OUT"||status?.authState==="SUBSCRIPTION_REQUIRED"||status?.authState==="DEVICE_REVOKED")&&(
        <div className="cloud-login-fields">
          <div className="cloud-auth-mode">
            <strong>登录 Cloud</strong>
            {status?.accountManagementAvailable && (
              <Button className="secondary compact" onClick={onOpenRegistration} type="button">
                去网站注册
              </Button>
            )}
          </div>
          {loginLimit&&<section className="device-limit-panel" role="alert"><strong>已达到登录设备上限（{loginLimit.maxDevices} 台）</strong><p>选择一台设备移除后，继续登录此电脑。被移除的设备需要重新登录。</p>{loginLimit.devices.map(d=><div className="device-row" key={d.id}><div><strong>{d.deviceName}</strong><p>{d.platform} · {d.lastSeenAt?new Date(d.lastSeenAt).toLocaleString('zh-CN'):'暂无活动记录'}</p></div><Button className="secondary compact" disabled={busy||!password} onClick={()=>{if(window.confirm(`移除 ${d.deviceName} 并登录此电脑？`))onLogin({email:email.trim(),password,replaceDeviceId:d.id});}}>移除此设备并登录</Button></div>)}<Button className="secondary compact" disabled={busy} onClick={onManageAccount}>去网站管理设备</Button></section>}
          <p>新账号请先在网站完成验证注册。登录后可在首页点击“充值”。</p>
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
          <div className="cloud-password-field">
            <label htmlFor={passwordInputId}>{copy.password}</label>
            <div className="password-input-control">
            <input
              autoComplete="current-password"
              id={passwordInputId}
              onChange={(event) => setPassword(event.target.value)}
              ref={passwordInput}
              type={passwordVisible ? "text" : "password"}
              value={password}
            />
            <button
              aria-controls={passwordInputId}
              aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
              aria-pressed={passwordVisible}
              className="password-visibility-toggle"
              onClick={togglePasswordVisibility}
              onMouseDown={event => event.preventDefault()}
              title={passwordVisible ? "隐藏密码" : "显示密码"}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {passwordVisible && <path d="m3 3 18 18" />}
              </svg>
            </button>
            </div>
          </div>
          <Button
            disabled={busy || !email || !password}
            onClick={() => onLogin({ email: email.trim(), password })}
            type="button"
          >
            {copy.login}
          </Button>
        </div>)}
    {status?.account&&<>
      <section className="compact-wallet" aria-label="账户余额"><div className="compact-wallet-total"><span>{money?"可用总余额":"可用点数"}</span><strong>{total}</strong></div>{status.balanceBreakdown&&<div className="compact-wallet-parts"><span>正常余额 <b>¥{status.balanceBreakdown.regularRmb.toFixed(4)}</b></span><span>奖励余额 <b>¥{status.balanceBreakdown.rewardRmb.toFixed(4)}</b></span></div>}{status.balanceBreakdown?.rewardExpiresAt&&<p className="reward-expiry" title={new Date(status.balanceBreakdown.rewardExpiresAt).toLocaleString("zh-CN")}>其中 ¥{(status.balanceBreakdown.rewardExpiringRmb??0).toFixed(4)} 奖励于 {formatRewardDate(status.balanceBreakdown.rewardExpiresAt)} 到期</p>}</section>
      <div className="compact-plan"><div><strong>{status.plan?`Cloud ${status.plan}`:"Cloud 按量使用"}</strong><small>{status.accountNeverExpires?"长期有效":`有效期至 ${formatDate(status.validUntil)}`}</small></div><button type="button" className="text-action" disabled={busy||!status.subscriptionManagementAvailable} onClick={onManageSubscription}>管理套餐 ›</button></div>
      <div className="compact-account-actions"><button type="button" className="small-action" onClick={()=>setView("devices")}><svg aria-hidden="true" viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="10" rx="2"/><path d="M1 17h18"/></svg>在线设备 {online}{status.billing?.maxDevices?` / ${status.billing.maxDevices}`:""}</button>{authenticated&&<InviteFriendControl small onHistory={()=>setView("referral")}/>}</div>
      <button className="compact-record-entry" type="button" onClick={()=>setView("usage")}><span>充值与调整记录</span><span aria-hidden="true">›</span></button>
      <p className={`compact-account-note ${balanceRequired||!healthy?"attention":""}`} role="status">{balanceRequired?"余额不足，模型请求已暂停，请充值。":!healthy?state.message:"余额与权限自动同步；需要调整请联系管理员。"}</p>
    </>}
    </>}
  </CompactDialog>;
}

function formatRewardDate(value:string){return new Intl.DateTimeFormat("zh-CN",{month:"long",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value));}

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
                <span className="bound-device-id">设备号：{device.deviceId}</span>
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
          <p>新用户首次购买并审核到账后，双方各得 ¥5。奖励 7 天有效，到账后请确认弹窗。</p>
          <div className="detail-stats">
            <CloudValue label="已邀请" value={String(referral.registered)} />
            <CloudValue label="有效邀请" value={String(referral.rewarded)} />
            <CloudValue
              label="累计奖励"
              value={`¥${(referral.pointsEarned/10000).toFixed(4)}`}
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

function BalanceRecords({onBack,transactions,total,money}:{onBack:()=>void;transactions:CloudServiceStatus["walletTransactions"];total:string;money:boolean}){
 const records=transactions.filter(t=>['PURCHASE','ADMIN_ADJUSTMENT'].includes(t.type));
 const amount=(points:number)=>money?`¥${(Math.abs(points)/10000).toFixed(4)}`:`${formatPoints(Math.abs(points))} 点`;
 return <div className="detail-view balance-records"><Button className="secondary compact" onClick={onBack}>‹ 返回账户</Button><div className="compact-wallet-total"><span>当前余额</span><strong>{total}</strong></div><p className="detail-caption">仅展示最近的充值与管理员调整，不包含逐次模型扣费。</p><div className="compact-record-list">{records.length===0?<p className="empty-detail">暂无充值或管理员调整记录。</p>:records.map(t=><div className="history-row" key={t.id}><div><strong>{t.type==='PURCHASE'?'账户充值':t.points>0?'管理员增加余额':'管理员减少余额'}</strong><span>{new Date(t.createdAt).toLocaleString('zh-CN')}</span></div><div><strong className={t.points>0?'positive':''}>{t.points>0?'+':'−'} {amount(t.points)}</strong><span>变动后 {money?`¥${(t.balanceAfter/10000).toFixed(4)}`:`${formatPoints(t.balanceAfter)} 点`}</span></div></div>)}</div></div>;
}

function AccountActions({
  loggedIn,
  accountAvailable,
  busy,
  onLogout,
  onManageAccount,
  onManageSubscription,
  onRefresh,
  onUseOriginal,
  state,
  subscriptionAvailable,
}: {
  loggedIn:boolean;
  accountAvailable: boolean;
  busy: boolean;
  onLogout: () => void;
  onManageAccount: () => void;
  onManageSubscription: () => void;
  onRefresh: () => void;
  onUseOriginal: () => void;
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
      {(state === "SERVER_UNREACHABLE" || state === "ACCOUNT_LOCKED") && (
        <Button disabled={busy} onClick={onRefresh} type="button">
          {copy.retry}
        </Button>
      )}
      {state !== "AUTHENTICATED" && (
        <Button className="secondary" disabled={busy} onClick={onUseOriginal} type="button">
          恢复 ChatGPT 原账号
        </Button>
      )}
      {(state === "AUTHENTICATED"||loggedIn) && (
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
    ACCOUNT_LOCKED: { symbol: "●", title: "账号已锁定", message: "账号已被管理员锁定，请联系管理员解锁。", tone: "danger" },
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

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
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
