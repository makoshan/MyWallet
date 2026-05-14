const ethDecimals = 18;
const weiBase = 10n ** BigInt(ethDecimals);
const appBasePath = "/MyWallet";

export type WalletView = "dashboard" | "portfolio" | "receive" | "send" | "settings";
export type ReceiveNetworkId = "ethereum" | "bsc" | "tron" | "solana";

export type ReceiveNetwork = {
  id: ReceiveNetworkId;
  name: string;
  assetName: string;
  address: string;
  badge: string;
  note: string;
  warning: string;
};

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

export function buildReceiveNetworks(ethereumAddress: string): ReceiveNetwork[] {
  return [
    {
      address: ethereumAddress,
      assetName: "Sepolia ETH",
      badge: "E",
      id: "ethereum",
      name: "Ethereum Sepolia",
      note: "Ethereum Sepolia 使用当前钱包的 EVM 测试网地址。",
      warning:
        "只发送 Ethereum Sepolia 测试网 ETH 到这个地址。发送其他网络或资产可能无法找回。",
    },
    {
      address: ethereumAddress,
      assetName: "BSC Testnet BNB",
      badge: "B",
      id: "bsc",
      name: "BSC Testnet",
      note: "BSC Testnet 与 Ethereum 使用同一个 EVM 地址，但网络不同。",
      warning:
        "只发送 BSC Testnet BNB 到这个地址。不要把主网 BNB 或其他网络资产转入。",
    },
    {
      address: "",
      assetName: "TRON Testnet TRX",
      badge: "T",
      id: "tron",
      name: "TRON Testnet",
      note: "TRON 地址会在第 12 步接入 Token Core 后显示。",
      warning:
        "TRON 测试网地址尚未生成，当前不要向这里转入 TRX。",
    },
    {
      address: "",
      assetName: "Solana Devnet SOL",
      badge: "S",
      id: "solana",
      name: "Solana Devnet",
      note: "Solana Devnet 地址会在第 11 步接入 Solana 专用库后显示。",
      warning:
        "Solana Devnet 地址尚未生成，当前不要向这里转入 SOL。",
    },
  ];
}
