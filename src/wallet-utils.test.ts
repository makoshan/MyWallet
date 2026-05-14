import { describe, expect, it } from "vitest";

import {
  buildReceiveNetworks,
  formatLamportsToSol,
  formatSunToTrx,
  formatWeiToEth,
  getDefaultAssetBalances,
  getMnemonicBackupWarnings,
  getPathForView,
  getRpcUrls,
  getViewFromPath,
  parseEthToWei,
  shortenAddress,
  validateEthereumAddress,
} from "./wallet-utils";

describe("wallet utils", () => {
  it("formats wei as a readable ETH amount", () => {
    expect(formatWeiToEth(0n)).toBe("0");
    expect(formatWeiToEth(1_000_000_000_000_000_000n)).toBe("1");
    expect(formatWeiToEth(1_234_567_890_000_000_000n)).toBe("1.234567");
  });

  it("formats lamports as a readable SOL amount", () => {
    expect(formatLamportsToSol(0n)).toBe("0");
    expect(formatLamportsToSol(1_000_000_000n)).toBe("1");
    expect(formatLamportsToSol(1_234_567_890n)).toBe("1.234567");
  });

  it("formats sun as a readable TRX amount", () => {
    expect(formatSunToTrx(0n)).toBe("0");
    expect(formatSunToTrx(1_000_000n)).toBe("1");
    expect(formatSunToTrx(1_234_567n)).toBe("1.234567");
  });

  it("parses ETH amount text into wei", () => {
    expect(parseEthToWei("0.001")).toBe(1_000_000_000_000_000n);
    expect(parseEthToWei("1")).toBe(1_000_000_000_000_000_000n);
    expect(parseEthToWei("1.000000000000000001")).toBe(
      1_000_000_000_000_000_001n,
    );
  });

  it("rejects invalid ETH amount text", () => {
    expect(() => parseEthToWei("")).toThrow("请输入转账金额");
    expect(() => parseEthToWei("0")).toThrow("转账金额必须大于 0");
    expect(() => parseEthToWei("1.1234567890123456789")).toThrow(
      "最多支持 18 位小数",
    );
  });

  it("validates and shortens ethereum addresses", () => {
    const address = "0x4533c05fCB9d719327016e5029d985aB6a7275BB";
    expect(validateEthereumAddress(address)).toBe(true);
    expect(validateEthereumAddress("0x1234")).toBe(false);
    expect(shortenAddress(address)).toBe("0x4533...7275BB");
  });

  it("maps receive route to receive view", () => {
    expect(getViewFromPath("/MyWallet/receive")).toBe("receive");
    expect(getViewFromPath("/MyWallet/")).toBe("dashboard");
    expect(getViewFromPath("/MyWallet/portfolio")).toBe("dashboard");
    expect(getViewFromPath("/MyWallet/unknown")).toBe("dashboard");
  });

  it("builds GitHub Pages paths for wallet views", () => {
    expect(getPathForView("receive")).toBe("/MyWallet/receive");
    expect(getPathForView("dashboard")).toBe("/MyWallet/");
  });

  it("builds receive network options with mainnet EVM, BTC, Solana and TRON addresses", () => {
    const ethereumAddress = "0x4533c05fCB9d719327016e5029d985aB6a7275BB";
    const bitcoinAddress = "bc1q7j6f7m9q2sx8d2c0z6v5zn7l2skq9mfd0rw9z8";
    const solanaAddress = "7iUP2xPy1Gzgbgbp9MpBuXAbE7xFaMRZGXtXH3wmv9Y8";
    const tronAddress = "TJ83hu2gvY93FGhgDt9Ws5FB7TrhDYy3XG";
    const networks = buildReceiveNetworks({
      bitcoinAddress,
      ethereumAddress,
      solanaAddress,
      tronAddress,
    });

    expect(networks.map((network) => network.id)).toEqual([
      "ethereum",
      "bsc",
      "bitcoin",
      "solana",
      "tron",
    ]);
    expect(networks[0].address).toBe(ethereumAddress);
    expect(networks[1].address).toBe(ethereumAddress);
    expect(networks[2].address).toBe(bitcoinAddress);
    expect(networks[3].address).toBe(solanaAddress);
    expect(networks[4].address).toBe(tronAddress);
    expect(networks.every((network) => !network.name.includes("Testnet"))).toBe(
      true,
    );
  });

  it("defaults all mainnet asset balances to zero", () => {
    const defaultBalances = getDefaultAssetBalances();

    expect(defaultBalances.map((asset) => asset.symbol)).toEqual([
      "ETH",
      "BNB",
      "BTC",
      "SOL",
      "TRX",
    ]);
    expect(defaultBalances.every((asset) => asset.balance === "0")).toBe(true);
    expect(defaultBalances.every((asset) => asset.logoFile)).toBe(true);
  });

  it("adds token logos to receive network options", () => {
    const networks = buildReceiveNetworks({
      bitcoinAddress: "bc1q7j6f7m9q2sx8d2c0z6v5zn7l2skq9mfd0rw9z8",
      ethereumAddress: "0x4533c05fCB9d719327016e5029d985aB6a7275BB",
      solanaAddress: "7iUP2xPy1Gzgbgbp9MpBuXAbE7xFaMRZGXtXH3wmv9Y8",
      tronAddress: "TJ83hu2gvY93FGhgDt9Ws5FB7TrhDYy3XG",
    });

    expect(networks.map((network) => network.logoFile)).toEqual([
      "ethereum.png",
      "bnb.svg",
      "bitcoin.png",
      "solana.svg",
      "tron.png",
    ]);
  });

  it("keeps mnemonic backup warnings explicit and offline-only", () => {
    const warnings = getMnemonicBackupWarnings();

    expect(warnings).toContain("只手抄到纸上，不要截图、拍照或复制到剪贴板。");
    expect(warnings).toContain("不要保存到网盘、聊天软件、邮箱、备忘录或任何联网服务。");
    expect(warnings).toContain("任何人拿到助记词都可以转走你的资产。");
  });

  it("builds Alchemy mainnet RPC URLs from one API key", () => {
    expect(getRpcUrls({ VITE_ALCHEMY_API_KEY: "alchemy-key" })).toEqual({
      bsc: "https://bnb-mainnet.g.alchemy.com/v2/alchemy-key",
      ethereum: "https://eth-mainnet.g.alchemy.com/v2/alchemy-key",
      solana: "https://solana-mainnet.g.alchemy.com/v2/alchemy-key",
      tron: "https://tron-mainnet.g.alchemy.com/v2/alchemy-key",
    });
  });

  it("lets full RPC URLs override the shared Alchemy key", () => {
    expect(
      getRpcUrls({
        VITE_ALCHEMY_API_KEY: "alchemy-key",
        VITE_ETHEREUM_RPC_URL: "https://example.com/eth",
        VITE_TRON_RPC_URL: "https://example.com/tron/",
      }),
    ).toMatchObject({
      ethereum: "https://example.com/eth",
      tron: "https://example.com/tron/",
    });
  });
});
