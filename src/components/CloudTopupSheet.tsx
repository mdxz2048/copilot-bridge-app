import {CompactDialog} from "./CompactDialog";
import {PurchaseTopup} from "./PurchaseTopup";
import type {PurchaseClient} from "../purchase-types";

const purchaseClient: PurchaseClient = {
  create: () => window.copilotBridge.createPurchaseTicket(),
  list: (page, status) => window.copilotBridge.listPurchaseClaims(page, status),
  status: id => window.copilotBridge.getPurchaseTicketStatus(id),
};

export function CloudTopupSheet({account, onClose, onRefresh}: {
  account: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  return <CompactDialog title="充值" className="account-dialog account-detail topup-dialog"
    subtitle={<div className="compact-identity"><span title={account}>{account}</span></div>}
    onClose={onClose}>
    <PurchaseTopup client={purchaseClient} qrSource="./xianyu-profile.jpg" onCredited={onRefresh}/>
  </CompactDialog>;
}
