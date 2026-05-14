import { describe, expect, it } from "vitest";

import {
  buildReceiveNetworks,
  formatWeiToEth,
  getPathForView,
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
    expect(getViewFromPath("/MyWallet/unknown")).toBe("dashboard");
  });

  it("builds GitHub Pages paths for wallet views", () => {
    expect(getPathForView("receive")).toBe("/MyWallet/receive");
    expect(getPathForView("dashboard")).toBe("/MyWallet/");
  });

  it("builds receive network options without fake non-EVM addresses", () => {
    const address = "0x4533c05fCB9d719327016e5029d985aB6a7275BB";
    const networks = buildReceiveNetworks(address);

    expect(networks.map((network) => network.id)).toEqual([
      "ethereum",
      "bsc",
      "tron",
      "solana",
    ]);
    expect(networks[0].address).toBe(address);
    expect(networks[1].address).toBe(address);
    expect(networks[2].address).toBe("");
    expect(networks[3].address).toBe("");
  });
});
