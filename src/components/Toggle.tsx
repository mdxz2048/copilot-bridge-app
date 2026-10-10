export function Toggle({ checked, label, onChange, disabled = false }: { checked: boolean; label: string; disabled?: boolean; onChange(checked: boolean): void }) {
  return <button disabled={disabled} aria-checked={checked} aria-label={label} className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)} role="switch" type="button"><span /></button>;
}
