import type { CloudClient } from "./cloud-client.js";
import type {
  DeviceV2,
  MeV2,
  ProviderConnectionV2,
  ProviderV2,
  ReferralRecordV2,
  ReferralSummaryV2,
  UsageSummaryV2,
  WalletSummaryV2,
  WalletTransactionV2,
} from "./contract.js";

export interface ProductAccountSnapshot {
  me: MeV2;
  wallet: WalletSummaryV2;
  usage: UsageSummaryV2;
  devices: DeviceV2[];
  walletTransactions: WalletTransactionV2[];
  referral: ReferralSummaryV2;
  referralHistory: ReferralRecordV2[];
  providers: ProviderV2[];
  providerConnections: ProviderConnectionV2[];
}

export interface ProductAccountApi {
  getSnapshot(): Promise<ProductAccountSnapshot>;
}

export class ContractProductAccountApi implements ProductAccountApi {
  private readonly cloud: CloudClient;

  constructor(cloud: CloudClient) {
    this.cloud = cloud;
  }

  async getSnapshot(): Promise<ProductAccountSnapshot> {
    const me = await this.cloud.getMeV2();
    const wallet = await this.cloud.getWallet();
    const usage = await this.cloud.getUsageV2();
    const devices = await this.cloud.listDevicesV2();
    const walletTransactions = await this.cloud.listWalletTransactions();
    const referral = await this.cloud.getReferralSummary();
    const referralHistory = await this.cloud.getReferralHistory();
    const providers = await this.cloud.listProviders();
    const providerConnections = await this.cloud.listProviderConnections();
    return {
      me,
      wallet,
      usage,
      devices,
      walletTransactions,
      referral,
      referralHistory,
      providers,
      providerConnections,
    };
  }
}

export class MockProductAccountApi implements ProductAccountApi {
  snapshot: ProductAccountSnapshot | null = null;

  async getSnapshot(): Promise<ProductAccountSnapshot> {
    if (!this.snapshot) throw new Error("Mock product account is not configured.");
    return this.snapshot;
  }
}
