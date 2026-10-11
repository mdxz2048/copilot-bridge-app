export function ServiceMark({original=false}:{original?:boolean}) {
  return <span className={`service-mark ${original?'service-mark-original':'service-mark-cloud'}`} aria-hidden="true">
    <svg viewBox="0 0 48 48" fill="none">
      {original?<><path d="M12 9h24a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H23l-10 6v-6h-1a6 6 0 0 1-6-6V15a6 6 0 0 1 6-6Z"/><path d="M15 20h18M15 26h12"/></>
        :<><path d="m24 8 5 11 11 5-11 5-5 11-5-11-11-5 11-5 5-11Z"/><path d="m37 6 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z"/></>}
    </svg>
  </span>;
}
export function ServiceActionIcon(){return <svg className="service-action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20V4m-6 6 6-6 6 6"/></svg>;}
