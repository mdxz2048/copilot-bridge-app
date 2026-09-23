import type { AppSettings } from "../bridge-api";
import { zhCN } from "../locales/zh-CN";
import { Button } from "./Button";
import { Modal } from "./Modal";

export function FirstRunDialog({
  busy,
  onChoose,
}: {
  busy: boolean;
  onChoose: (service: AppSettings["backendMode"]) => void;
}) {
  const copy = zhCN.onboarding;
  return (
    <Modal title={copy.title}>
      <p className="onboarding-subtitle">{copy.subtitle}</p>
      <div className="onboarding-options">
        <section className="onboarding-option recommended-option">
          <span className="recommendation">{copy.recommended}</span>
          <h3>{copy.cloudTitle}</h3>
          <p>{copy.cloudDescription}</p>
          <Button
            disabled={busy}
            onClick={() => onChoose("REMOTE")}
            type="button"
          >
            {copy.cloudAction}
          </Button>
        </section>
        <section className="onboarding-option">
          <span className="onboarding-eyebrow">{copy.localEyebrow}</span>
          <h3>{copy.localTitle}</h3>
          <p>{copy.localDescription}</p>
          <Button
            className="secondary"
            disabled={busy}
            onClick={() => onChoose("LOCAL")}
            type="button"
          >
            {copy.localAction}
          </Button>
        </section>
      </div>
    </Modal>
  );
}
