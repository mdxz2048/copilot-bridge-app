import type {PropsWithChildren,ReactNode} from "react";
import {createPortal} from "react-dom";
import {useDialogFocus} from "./useDialogFocus";
export function CompactDialog({title,subtitle,footer,children,onClose,className=""}:PropsWithChildren<{title:string;subtitle?:ReactNode;footer?:ReactNode;onClose:()=>void;className?:string}>){
 const dialog=useDialogFocus<HTMLElement>(onClose);
 return createPortal(<div className="compact-dialog-backdrop"><section ref={dialog} className={`compact-dialog ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
 <header className="compact-dialog-header"><div><h2>{title}</h2>{subtitle}</div><button type="button" className="compact-dialog-close" aria-label="关闭" onClick={onClose}><svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
 <div className="compact-dialog-body">{children}</div>{footer&&<footer className="compact-dialog-footer">{footer}</footer>}
 </section></div>,document.body);
}
