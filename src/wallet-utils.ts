const ethDecimals = 18;
const weiBase = 10n ** BigInt(ethDecimals);
const appBasePath = "/MyWallet";

export type WalletView = "dashboard" | "receive" | "send" | "settings";
export type ReceiveNetworkId =
  | "ethereum"
  | "bsc"
  | "bitcoin"
  | "solana"
  | "tron";

export type ReceiveNetwork = {
  id: ReceiveNetworkId;
  name: string;
  assetName: string;
  address: string;
  badge: string;
  note: string;
  warning: string;
};

export type ReceiveAddresses = {
  bitcoinAddress: string;
  ethereumAddress: string;
  solanaAddress: string;
  tronAddress: string;
};

export type AssetBalance = {
  id: ReceiveNetworkId;
  name: string;
  symbol: string;
  balance: string;
};

export function getDefaultAssetBalances(): AssetBalance[] {
  return [
    { balance: "0", id: "ethereum", name: "Ethereum", symbol: "ETH" },
    { balance: "0", id: "bsc", name: "BSC", symbol: "BNB" },
    { balance: "0", id: "bitcoin", name: "Bitcoin", symbol: "BTC" },
    { balance: "0", id: "solana", name: "Solana", symbol: "SOL" },
    { balance: "0", id: "tron", name: "TRON", symbol: "TRX" },
  ];
}

export function getMnemonicBackupWarnings() {
  return [
    "只手抄到纸上，不要截图、拍照或复制到剪贴板。",
    "不要保存到网盘、聊天软件、邮箱、备忘录或任何联网服务。",
    "不要发给任何人，也不要发给 AI、客服或社群管理员。",
    "任何人拿到助记词都可以转走你的资产。",
    "确认纸质备份清楚、完整，再关闭页面。",
  ];
}

export function formatWeiToEth(wei: bigint) {
  const whole = wei / weiBase;
  const fraction = (wei % weiBase).toString().padStart(ethDecimals, "0");
  const trimmedFraction = fraction.slice(0, 6).replace(/0+$/, "");

  if (!trimmedFraction) {
    return whole.toString();
  }

  return `${whole.toString()}.${trimmedFraction}`;
}

export function formatLamportsToSol(lamports: bigint) {
  const solBase = 1_000_000_000n;
  const whole = lamports / solBase;
  const fraction = (lamports % solBase).toString().padStart(9, "0");
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

export function buildReceiveNetworks({
  bitcoinAddress,
  ethereumAddress,
  solanaAddress,
  tronAddress,
}: ReceiveAddresses): ReceiveNetwork[] {
  return [
    {
      address: ethereumAddress,
      assetName: "ETH",
      badge: "E",
      id: "ethereum",
      name: "Ethereum",
      note: "Ethereum 使用当前钱包的 EVM 主网地址。",
      warning:
        "只发送 Ethereum 主网 ETH 到这个地址。发送其他网络或资产可能无法找回。",
    },
    {
      address: ethereumAddress,
      assetName: "BNB",
      badge: "B",
      id: "bsc",
      name: "BSC",
      note: "BSC 与 Ethereum 使用同一个 EVM 地址，但网络不同。",
      warning:
        "只发送 BSC 主网 BNB 到这个地址。不要把其他网络资产转入。",
    },
    {
      address: bitcoinAddress,
      assetName: "BTC",
      badge: "B",
      id: "bitcoin",
      name: "Bitcoin",
      note: "Bitcoin 使用 Native SegWit 主网地址，地址通常以 bc1q 开头。",
      warning:
        "只发送 Bitcoin 主网 BTC 到这个地址。不要把其他网络 BTC 或其他资产转入。",
    },
    {
      address: solanaAddress,
      assetName: "SOL",
      badge: "S",
      id: "solana",
      name: "Solana",
      note: "Solana 使用助记词按 Solana 路径派生出的主网地址。",
      warning:
        "只发送 Solana 主网 SOL 到这个地址。不要把其他网络资产转入。",
    },
    {
      address: tronAddress,
      assetName: "TRX",
      badge: "T",
      id: "tron",
      name: "TRON",
      note: "TRON 使用 Token Core 按 TRON 路径派生出的主网地址。",
      warning:
        "只发送 TRON 主网 TRX 到这个地址。不要把其他网络资产转入。",
    },
  ];
}
