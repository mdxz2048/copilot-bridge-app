import type { ProfileStatus } from "../bridge-api";
import { Toggle } from "./Toggle";

export function BridgeActivationBar({
  busy,
  chatGptInstalled,
  profile,
  onChange,
}: {
  busy: boolean;
  chatGptInstalled: boolean;
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
          {!chatGptInstalled ? "请先安装 ChatGPT，安装完成后才能开启 Bridge"
            : pending
            ? profile?.pendingProfile === "bridge"
              ? "Bridge 连接待生效：保存工作后重新打开 ChatGPT 即可"
              : "原账号连接待生效：保存工作后重新打开 ChatGPT 即可"
            : enabled
              ? "ChatGPT 使用下方选择的 AI 服务"
              : "关闭时，ChatGPT 使用原账号配置"}
        </span>
      </div>
      <Toggle
        disabled={busy || !chatGptInstalled}
        checked={enabled}
        label="在 ChatGPT 中使用 Copilot Bridge"
        onChange={onChange}
      />
      {busy && <span className="visually-hidden">正在切换环境</span>}
    </section>
  );
}
