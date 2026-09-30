export const PRODUCTION_CLOUD_BASE_URL = "https://ai.mddxz.top";
export const PRODUCTION_ACCOUNT_MANAGEMENT_URL =
  "https://ai.mddxz.top/dashboard";
export const PRODUCTION_SUBSCRIPTION_MANAGEMENT_URL =
  "https://ai.mddxz.top/dashboard";

export type CloudRuntimeMode = "PRODUCTION" | "DEVELOPMENT" | "TEST";

export interface CloudConfiguration {
  contractStatus: "PENDING" | "READY";
  runtimeMode: CloudRuntimeMode;
  gatewayBaseUrl: string | null;
  accountManagementUrl: string | null;
  subscriptionManagementUrl: string | null;
}

export interface CloudConfigurationProvider {
  get(): Promise<CloudConfiguration>;
}

export interface CloudRuntimeConfigurationOptions {
  isPackaged: boolean;
  environment?: NodeJS.ProcessEnv;
}

export function resolveCloudRuntimeConfiguration(
  options: CloudRuntimeConfigurationOptions,
): CloudConfiguration {
  const environment = options.environment ?? process.env;
  const mode = parseRuntimeMode(
    environment.COPILOT_BRIDGE_CLOUD_MODE
      ?? (options.isPackaged ? "PRODUCTION" : "DEVELOPMENT"),
  );
  const override = environment.COPILOT_BRIDGE_CLOUD_BASE_URL;

  if (
    mode === "PRODUCTION"
    && override
    && normalizeUrl(override) !== PRODUCTION_CLOUD_BASE_URL
  ) {
    throw new Error(
      "Production Cloud mode cannot use a development or test base URL.",
    );
  }

  const gatewayBaseUrl = normalizeUrl(
    mode === "PRODUCTION"
      ? PRODUCTION_CLOUD_BASE_URL
      : override ?? PRODUCTION_CLOUD_BASE_URL,
  );

  if (mode === "TEST" && !isLoopbackUrl(gatewayBaseUrl)) {
    throw new Error("Test Cloud mode requires a loopback base URL.");
  }

  const accountManagementUrl = mode === "TEST"
    ? null
    : normalizeUrl(
        environment.COPILOT_BRIDGE_ACCOUNT_MANAGEMENT_URL
          ?? PRODUCTION_ACCOUNT_MANAGEMENT_URL,
      );
  const subscriptionManagementUrl = mode === "TEST"
    ? null
    : normalizeUrl(
        environment.COPILOT_BRIDGE_SUBSCRIPTION_MANAGEMENT_URL
          ?? PRODUCTION_SUBSCRIPTION_MANAGEMENT_URL,
      );

  return {
    contractStatus: "READY",
    runtimeMode: mode,
    gatewayBaseUrl,
    accountManagementUrl,
    subscriptionManagementUrl,
  };
}

function trustedRegistrationUrl(configuration: CloudConfiguration): URL | null {
  const siteUrl = configuration.accountManagementUrl;
  if (
    configuration.contractStatus !== "READY"
    || !siteUrl
    || !URL.canParse(siteUrl)
  ) {
    return null;
  }
  const site = new URL(siteUrl);
  const productionSite = site.origin === PRODUCTION_CLOUD_BASE_URL
    && site.protocol === "https:";
  const loopbackSite = configuration.runtimeMode !== "PRODUCTION"
    && (site.protocol === "http:" || site.protocol === "https:")
    && isLoopbackUrl(siteUrl);
  if ((!productionSite && !loopbackSite) || site.username || site.password) {
    return null;
  }

  return new URL("/register", site);
}

export function cloudRegistrationUrl(configuration: CloudConfiguration): string | null {
  return trustedRegistrationUrl(configuration)?.toString() ?? null;
}

export function referralRegistrationUrl(
  configuration: CloudConfiguration,
  code: string,
): string | null {
  if (!code) return null;
  const registration = trustedRegistrationUrl(configuration);
  if (!registration) return null;
  try {
    registration.search = `?ref=${encodeURIComponent(code)}`;
  } catch (error) {
    if (error instanceof URIError) return null;
    throw error;
  }
  return registration.toString();
}

export class StaticCloudConfigurationProvider
  implements CloudConfigurationProvider
{
  private readonly configuration: CloudConfiguration;

  constructor(configuration: CloudConfiguration) {
    this.configuration = configuration;
  }

  async get(): Promise<CloudConfiguration> {
    return this.configuration;
  }
}

export class PendingCloudConfigurationProvider
  implements CloudConfigurationProvider
{
  async get(): Promise<CloudConfiguration> {
    return {
      contractStatus: "PENDING",
      runtimeMode: "DEVELOPMENT",
      gatewayBaseUrl: null,
      accountManagementUrl: null,
      subscriptionManagementUrl: null,
    };
  }
}

function parseRuntimeMode(value: string): CloudRuntimeMode {
  if (
    value === "PRODUCTION"
    || value === "DEVELOPMENT"
    || value === "TEST"
  ) {
    return value;
  }
  throw new Error(`Invalid Cloud runtime mode: ${value}`);
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Cloud URL must use HTTP or HTTPS.");
  }
  return url.toString().replace(/\/$/, "");
}

function isLoopbackUrl(value: string): boolean {
  const hostname = new URL(value).hostname;
  return hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "localhost";
}
