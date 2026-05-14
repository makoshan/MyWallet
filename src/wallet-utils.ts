const ethDecimals = 18;
const weiBase = 10n ** BigInt(ethDecimals);
const appBasePath = "/MyWallet";

export type WalletView = "dashboard" | "portfolio" | "receive" | "send" | "settings";

export function formatWeiToEth(wei: bigint) {
  const whole = wei / weiBase;
  const fraction = (wei % weiBase).toString().padStart(ethDecimals, "0");
  const trimmedFraction = fraction.slice(0, 6).replace(/0+$/, "");

  if (!trimmedFraction) {
    return whole.toString();
  }

  return `${whole.toString()}.${trimmedFraction}`;
}

export function parseEthToWei(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("请输入转账金额");
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("请输入有效的 ETH 金额");
  }

  const [whole, fraction = ""] = normalized.split(".");

  if (fraction.length > ethDecimals) {
    throw new Error("最多支持 18 位小数");
  }

  const wei =
    BigInt(whole) * weiBase +
    BigInt((fraction + "0".repeat(ethDecimals)).slice(0, ethDecimals));

  if (wei <= 0n) {
    throw new Error("转账金额必须大于 0");
  }

  return wei;
}

export function validateEthereumAddress(address: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

export function shortenAddress(address: string) {
  if (address.length <= 14) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export function getViewFromPath(pathname: string): WalletView {
  const normalizedPath = pathname.replace(/\/+$/, "");
  const route = normalizedPath.startsWith(appBasePath)
    ? normalizedPath.slice(appBasePath.length)
    : normalizedPath;

  if (route === "/portfolio") {
    return "portfolio";
  }

  if (route === "/receive") {
    return "receive";
  }

  if (route === "/send") {
    return "send";
  }

  if (route === "/settings") {
    return "settings";
  }

  return "dashboard";
}

export function getPathForView(view: WalletView) {
  if (view === "dashboard") {
    return `${appBasePath}/`;
  }

  return `${appBasePath}/${view}`;
}
