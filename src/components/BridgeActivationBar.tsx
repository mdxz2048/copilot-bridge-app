import type { ProfileStatus } from "../bridge-api";
import { Toggle } from "./Toggle";

export function BridgeActivationBar({
  busy,
  profile,
  onChange,
}: {
  busy: boolean;
  profile: ProfileStatus | null;
  onChange: (enabled: boolean) => void;
}) {
  const enabled = profile?.activeProfile === "bridge";
  const pending = profile?.restartRequired === true;
  return (
    <section className="bridge-activation" aria-label="ChatGPT 环境">
      <div>
        <strong>在 ChatGPT 中使用 Copilot Bridge</strong>
        <span>
          {pending
            ? "等待重新登录 Windows 后生效"
            : enabled
              ? "ChatGPT 使用下方选择的 AI 服务"
              : "关闭时，ChatGPT 使用原账号配置"}
        </span>
      </div>
      <Toggle
        checked={enabled}
        label="在 ChatGPT 中使用 Copilot Bridge"
        onChange={onChange}
      />
      {busy && <span className="visually-hidden">正在切换环境</span>}
    </section>
  );
}
