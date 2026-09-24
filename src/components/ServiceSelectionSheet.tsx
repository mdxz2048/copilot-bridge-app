import type { AIProvider, AIProviderId } from "../domain/product-models";
import { Button } from "./Button";
import { Sheet } from "./Sheet";

export function ServiceSelectionSheet({
  busy,
  onClose,
  onSelect,
  providers,
}: {
  busy: boolean;
  onClose: () => void;
  onSelect: (provider: AIProviderId) => void;
  providers: AIProvider[];
}) {
  return (
    <Sheet onClose={onClose} title="选择 AI 服务">
      <div className="sheet-header">
        <span>选择 AI 服务</span>
        <Button className="secondary" onClick={onClose} type="button">
          取消
        </Button>
      </div>
      <div className="provider-choice-list">
        {providers.map((provider) => (
          <ProviderChoice
            busy={busy}
            key={provider.id}
            onSelect={() => onSelect(provider.id)}
            provider={provider}
          />
        ))}
      </div>
    </Sheet>
  );
}

function ProviderChoice({
  busy,
  onSelect,
  provider,
}: {
  busy: boolean;
  onSelect: () => void;
  provider: AIProvider;
}) {
  return (
    <article className={`provider-choice ${provider.active ? "active" : ""}`}>
      <div className="provider-choice-main">
        <span className="provider-radio" aria-hidden="true">
          {provider.active ? "●" : "○"}
        </span>
        <div>
          <strong>{provider.name}</strong>
          <p>{provider.description}</p>
          <small>{providerStateLabel(provider)}</small>
        </div>
      </div>
      <Button
        className="secondary compact"
        disabled={busy || provider.active || !provider.available}
        onClick={onSelect}
        type="button"
      >
        {provider.active
          ? "当前使用"
          : provider.available
            ? "选择"
            : "尚未开放"}
      </Button>
    </article>
  );
}

function providerStateLabel(provider: AIProvider): string {
  switch (provider.connection) {
    case "connected":
      return "已连接";
    case "connecting":
      return "正在连接";
    case "unavailable":
      return "当前不可用";
    case "auth_expired":
      return "认证已失效";
    case "error":
      return "需要处理";
    case "not_configured":
      return provider.available ? "尚未配置" : "等待服务支持";
  }
}
