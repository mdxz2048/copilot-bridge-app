import type {
  AppSettings,
  BridgeStatus,
  CloudServiceStatus,
} from "../bridge-api";
import { zhCN } from "../locales/zh-CN";
import { Button } from "./Button";
import { Sheet } from "./Sheet";

interface ServiceSelectionSheetProps {
  busy: boolean;
  bridge: BridgeStatus | null;
  cloud: CloudServiceStatus | null;
  current: AppSettings["backendMode"];
  onClose: () => void;
  onSelect: (target: AppSettings["backendMode"]) => void;
}

export function ServiceSelectionSheet({
  busy,
  bridge,
  cloud,
  current,
  onClose,
  onSelect,
}: ServiceSelectionSheetProps) {
  const copy = zhCN.services;
  return (
    <Sheet onClose={onClose} title={copy.title}>
      <div className="sheet-header">
        <span>{copy.title}</span>
        <Button className="secondary" onClick={onClose} type="button">
          {zhCN.common.close}
        </Button>
      </div>

      <div className="service-choice-list">
        <article className="service-choice">
          <div className="choice-heading">
            <div>
              <span className="recommendation">{copy.recommended}</span>
              <h3>{copy.cloudTitle}</h3>
            </div>
            {current === "REMOTE" && (
              <span className="active-pill">{copy.active}</span>
            )}
          </div>
          <p>{copy.cloudDescription}</p>
          <p className="choice-status">
            {cloud?.authState === "AUTHENTICATED"
              ? `${cloud.plan ?? "Cloud"} · ${zhCN.product.serviceNormal}`
              : cloudStatusLabel(cloud)}
          </p>
          <Button
            disabled={busy || current === "REMOTE"}
            onClick={() => onSelect("REMOTE")}
            type="button"
          >
            {busy ? copy.switching : copy.useCloud}
          </Button>
        </article>

        <div className="choice-divider" />

        <article className="service-choice">
          <div className="choice-heading">
            <h3>{copy.localTitle}</h3>
            {current === "LOCAL" && (
              <span className="active-pill">{copy.active}</span>
            )}
          </div>
          <p>{copy.localDescription}</p>
          <p className="choice-status">
            {current === "LOCAL"
              ? bridge?.state === "ready"
                ? zhCN.product.connected
                : zhCN.product.notConnected
              : copy.checkOnSwitch}
          </p>
          <Button
            className="secondary"
            disabled={busy || current === "LOCAL"}
            onClick={() => onSelect("LOCAL")}
            type="button"
          >
            {busy ? copy.switching : copy.useLocal}
          </Button>
        </article>
      </div>
    </Sheet>
  );
}

function cloudStatusLabel(cloud: CloudServiceStatus | null): string {
  switch (cloud?.authState) {
    case "AUTHENTICATING":
      return zhCN.account.authenticating;
    case "DEVICE_REVOKED":
      return zhCN.account.deviceRevoked;
    case "SUBSCRIPTION_REQUIRED":
      return zhCN.account.subscriptionRequired;
    case "SUBSCRIPTION_EXPIRED":
      return zhCN.account.subscriptionExpired;
    case "QUOTA_EXCEEDED":
      return zhCN.account.quotaExceeded;
    case "SERVER_UNREACHABLE":
      return zhCN.account.serverUnreachable;
    default:
      return zhCN.account.signedOut;
  }
}
