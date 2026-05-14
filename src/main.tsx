import "./buffer-polyfill";
import { StrictMode, useEffect, useState } from "react";
import initTokenCoreWasm, {
  create_keystore,
  derive_accounts,
  export_mnemonic,
  sign_tx,
} from "@consenlabs/tcx-wasm";
import tokenCoreWasmUrl from "@consenlabs/tcx-wasm/tcx_wasm_bg.wasm?url";
import {
  ExternalLink,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import QRCode from "qrcode";
import { createRoot } from "react-dom/client";
import { Keypair } from "@solana/web3.js";
import { mnemonicToSeedSync } from "bip39";
import { derivePath } from "ed25519-hd-key";
import {
  buildReceiveNetworks,
  formatLamportsToSol,
  formatWeiToEth,
  getDefaultAssetBalances,
  getMnemonicBackupWarnings,
  getPathForView,
  getViewFromPath,
  parseEthToWei,
  shortenAddress,
  validateEthereumAddress,
  type AssetBalance,
  type WalletView,
  type ReceiveNetworkId,
} from "./wallet-utils";
import "./styles.css";

const navItems = [
  { label: "Dashboard", view: "dashboard" },
  { label: "Deposit Funds", view: "receive" },
  { label: "Settings", view: "settings" },
] as const;
const walletStorageKey = "mywallet.passkeyWallet.v2";
const ethereumChainId = "1";
const ethereumChainIdHex = "0x1";
const ethereumDerivationPath = "m/44'/60'/0'/0/0";
const bitcoinDerivationPath = "m/84'/0'/0'/0/0";
const tronDerivationPath = "m/44'/195'/0'/0/0";
const solanaDerivationPath = "m/44'/501'/0'/0'";
const ethereumRpcUrl =
  import.meta.env.VITE_ETHEREUM_RPC_URL ||
  "https://ethereum-rpc.publicnode.com";
const bscRpcUrl =
  import.meta.env.VITE_BSC_RPC_URL ||
  "https://bsc-rpc.publicnode.com";
const solanaRpcUrl =
  import.meta.env.VITE_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";
const ethereumExplorerBaseUrl = "https://etherscan.io";

function getNetworks(
  ethereumAddress: string,
  bitcoinAddress: string,
  solanaAddress: string,
  tronAddress: string,
) {
  return [
    {
      name: "Ethereum",
      status: ethereumAddress ? "地址已生成" : "等待创建",
      badge: ethereumAddress ? "Connected" : "Not connected",
    },
    {
      name: "BSC",
      status: ethereumAddress ? "复用 EVM 地址" : "等待创建",
      badge: ethereumAddress ? "Connected" : "Not connected",
    },
    {
      name: "Bitcoin",
      status: bitcoinAddress ? "地址已生成" : "等待创建",
      badge: bitcoinAddress ? "Connected" : "Not connected",
    },
    {
      name: "Solana",
      status: solanaAddress ? "地址已生成" : "等待创建",
      badge: solanaAddress ? "Connected" : "Not connected",
    },
    {
      name: "TRON",
      status: tronAddress ? "地址已生成" : "等待创建",
      badge: tronAddress ? "Connected" : "Not connected",
    },
  ];
}

type PasskeySupport = "checking" | "supported" | "unsupported";
type WasmStatus = "loading" | "ready" | "failed";
type WalletStatus = "idle" | "creating" | "created" | "failed";
type AppView = WalletView;
type BalanceStatus = "idle" | "loading" | "ready" | "failed";
type SendStatus =
  | "idle"
  | "review"
  | "signing"
  | "broadcasting"
  | "sent"
  | "failed";
type MnemonicExportStatus = "idle" | "signing" | "revealed" | "failed";

type StoredWallet = {
  version: 2;
  keystoreJson: string;
  credentialId: string;
  credentialRawId: string;
  userId: string;
  rpId: string;
  prfSaltHex: string;
  bitcoinAddress: string;
  ethereumAddress: string;
  solanaAddress: string;
  tronAddress: string;
  createdAt: string;
};

type TransactionPlan = {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  nonce: bigint;
  totalCost: bigint;
  valueWei: bigint;
};

type SignedEthTransaction = {
  signature: string;
  txHash: string;
};

type ExportedMnemonic = {
  mnemonic?: string;
};

type DerivedAccount = {
  address?: string;
  chain?: string;
};

type PrfExtensionResults = {
  prf?: {
    enabled?: boolean;
    results?: {
      first?: ArrayBuffer;
    };
  };
};

function getPasskeySupportMessage(status: PasskeySupport) {
  if (status === "checking") {
    return "正在检查当前浏览器是否支持 Passkey。";
  }

  if (status === "supported") {
    return "当前浏览器具备基础 Passkey 能力。创建钱包时还会继续检查 PRF 加密能力。";
  }

  return "当前浏览器暂不支持 Passkey，请换 Chrome、Edge 或 Safari 再试。";
}

function getRandomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function arrayBufferToBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let value = "";

  bytes.forEach((byte) => {
    value += String.fromCharCode(byte);
  });

  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll(
    "=",
    "",
  );
}

function base64UrlToArrayBuffer(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function hexToBytes(value: string) {
  const bytes = new Uint8Array(new ArrayBuffer(value.length / 2));

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

function getRpId() {
  return window.location.hostname || "localhost";
}

function getPrfEnabled(credential: PublicKeyCredential) {
  const extensionResults =
    credential.getClientExtensionResults() as PrfExtensionResults;
  return extensionResults.prf?.enabled === true;
}

function getPrfResult(credential: PublicKeyCredential) {
  const extensionResults =
    credential.getClientExtensionResults() as PrfExtensionResults;
  return extensionResults.prf?.results?.first;
}

async function requestPasskeyPrfKey(
  credentialRawId: ArrayBuffer,
  prfSalt: Uint8Array,
) {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      allowCredentials: [
        {
          id: credentialRawId,
          type: "public-key",
        },
      ],
      challenge: getRandomBytes(32),
      extensions: {
        prf: {
          eval: {
            first: prfSalt,
          },
        },
      } as AuthenticationExtensionsClientInputs,
      timeout: 60_000,
      userVerification: "required",
    },
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error("Passkey 解锁被取消。");
  }

  const prfResult = getPrfResult(assertion);

  if (!prfResult) {
    throw new Error("当前浏览器或设备没有返回 Passkey PRF 结果。");
  }

  return new Uint8Array(prfResult);
}

async function createPasskeyCredential(userIdBytes: Uint8Array<ArrayBuffer>) {
  const credential = (await navigator.credentials.create({
    publicKey: {
      attestation: "none",
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required",
      },
      challenge: getRandomBytes(32),
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },
        { alg: -257, type: "public-key" },
      ],
      extensions: {
        prf: {},
      } as AuthenticationExtensionsClientInputs,
      rp: {
        name: "MyWallet",
      },
      timeout: 60_000,
      user: {
        displayName: "MyWallet Demo User",
        id: userIdBytes,
        name: "mywallet-demo-user",
      },
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Passkey 创建被取消。");
  }

  if (!getPrfEnabled(credential)) {
    throw new Error(
      "Passkey 已创建，但当前浏览器或设备没有启用 PRF，加密钱包无法继续创建。请换最新版 Chrome 或 Edge 再试。",
    );
  }

  return credential;
}

type DerivedWalletAddresses = {
  bitcoinAddress: string;
  ethereumAddress: string;
  solanaAddress: string;
  tronAddress: string;
};

function deriveTokenCoreMainnetAddresses(
  keystoreJson: string,
  prfKeyHex: string,
) {
  const accounts = JSON.parse(
    derive_accounts(
      JSON.stringify({
        derivations: [
          {
            chain: "ETHEREUM",
            chainId: ethereumChainId,
            derivationPath: ethereumDerivationPath,
            network: "MAINNET",
          },
          {
            chain: "BITCOIN",
            derivationPath: bitcoinDerivationPath,
            network: "MAINNET",
            segWit: "VERSION_0",
          },
          {
            chain: "TRON",
            derivationPath: tronDerivationPath,
            network: "MAINNET",
          },
        ],
        key: prfKeyHex,
        keystoreJson,
      }),
    ),
  ) as DerivedAccount[];

  const ethereumAddress =
    accounts.find((account) => account.chain === "ETHEREUM")?.address ??
    accounts[0]?.address;
  const bitcoinAddress =
    accounts.find((account) => account.chain === "BITCOIN")?.address ??
    accounts[1]?.address;
  const tronAddress =
    accounts.find((account) => account.chain === "TRON")?.address ??
    accounts[2]?.address;

  if (!ethereumAddress) {
    throw new Error("Token Core 没有返回 Ethereum 主网地址。");
  }

  if (!bitcoinAddress) {
    throw new Error("Token Core 没有返回 Bitcoin 主网地址。");
  }

  if (!tronAddress) {
    throw new Error("Token Core 没有返回 TRON 主网地址。");
  }

  return {
    bitcoinAddress,
    ethereumAddress,
    tronAddress,
  };
}

function exportWalletMnemonic(keystoreJson: string, prfKeyHex: string) {
  const result = JSON.parse(
    export_mnemonic(
      JSON.stringify({
        key: prfKeyHex,
        keystoreJson,
      }),
    ),
  ) as ExportedMnemonic;

  if (!result.mnemonic) {
    throw new Error("Token Core 没有返回助记词。");
  }

  return result.mnemonic;
}

function deriveSolanaAddressFromMnemonic(mnemonic: string) {
  const seed = mnemonicToSeedSync(mnemonic);
  const derivedSeed = derivePath(solanaDerivationPath, seed.toString("hex")).key;

  return Keypair.fromSeed(derivedSeed).publicKey.toBase58();
}

function deriveWalletAddresses(
  keystoreJson: string,
  prfKeyBytes: Uint8Array,
): DerivedWalletAddresses {
  const prfKeyHex = bytesToHex(prfKeyBytes);
  const tokenCoreAddresses = deriveTokenCoreMainnetAddresses(
    keystoreJson,
    prfKeyHex,
  );
  const mnemonic = exportWalletMnemonic(keystoreJson, prfKeyHex);
  const solanaAddress = deriveSolanaAddressFromMnemonic(mnemonic);

  return {
    ...tokenCoreAddresses,
    solanaAddress,
  };
}

function loadStoredWallet() {
  const rawWallet = localStorage.getItem(walletStorageKey);

  if (!rawWallet) {
    return null;
  }

  try {
    return JSON.parse(rawWallet) as StoredWallet;
  } catch {
    return null;
  }
}

function saveStoredWallet(wallet: StoredWallet) {
  localStorage.setItem(walletStorageKey, JSON.stringify(wallet));
}

function bigintToQuantity(value: bigint) {
  return `0x${value.toString(16)}`;
}

type EvmRpcConfig = {
  chainIdHex: string;
  name: string;
  url: string;
};

const ethereumRpcConfig: EvmRpcConfig = {
  chainIdHex: ethereumChainIdHex,
  name: "Ethereum",
  url: ethereumRpcUrl,
};
const bscRpcConfig: EvmRpcConfig = {
  chainIdHex: "0x38",
  name: "BSC",
  url: bscRpcUrl,
};
const evmRpcNetworkChecks = new Map<string, Promise<void>>();

async function callEvmRpc<T>(
  config: EvmRpcConfig,
  method: string,
  params: unknown[],
  options: { skipNetworkCheck?: boolean } = {},
) {
  if (!options.skipNetworkCheck && method !== "eth_chainId") {
    await ensureEvmRpcNetwork(config);
  }

  const response = await fetch(config.url, {
    body: JSON.stringify({
      id: Date.now(),
      jsonrpc: "2.0",
      method,
      params,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`${config.name} RPC 请求失败：HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    error?: { message?: string };
    result?: T;
  };

  if (data.error) {
    throw new Error(data.error.message ?? `${config.name} RPC 返回错误。`);
  }

  if (data.result === undefined || data.result === null) {
    throw new Error(`${config.name} RPC 没有返回结果。`);
  }

  return data.result;
}

function callEthereumRpc<T>(
  method: string,
  params: unknown[],
  options: { skipNetworkCheck?: boolean } = {},
) {
  return callEvmRpc<T>(ethereumRpcConfig, method, params, options);
}

async function ensureEvmRpcNetwork(config: EvmRpcConfig) {
  const cachedCheck =
    evmRpcNetworkChecks.get(config.name) ??
    callEvmRpc<string>(config, "eth_chainId", [], {
    skipNetworkCheck: true,
  }).then((chainId) => {
    if (chainId.toLowerCase() !== config.chainIdHex) {
      throw new Error(
        `当前 RPC 不是 ${config.name} 主网。请检查对应的 VITE RPC 配置。`,
      );
    }
  });

  evmRpcNetworkChecks.set(config.name, cachedCheck);

  return cachedCheck;
}

async function fetchEvmBalance(config: EvmRpcConfig, address: string) {
  const result = await callEvmRpc<string>(config, "eth_getBalance", [
    address,
    "latest",
  ]);
  return BigInt(result);
}

async function fetchEthereumBalance(address: string) {
  return fetchEvmBalance(ethereumRpcConfig, address);
}

async function callSolanaRpc<T>(method: string, params: unknown[]) {
  const response = await fetch(solanaRpcUrl, {
    body: JSON.stringify({
      id: Date.now(),
      jsonrpc: "2.0",
      method,
      params,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Solana RPC 请求失败：HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    error?: { message?: string };
    result?: T;
  };

  if (data.error) {
    throw new Error(data.error.message ?? "Solana RPC 返回错误。");
  }

  if (data.result === undefined || data.result === null) {
    throw new Error("Solana RPC 没有返回结果。");
  }

  return data.result;
}

async function fetchSolanaBalance(address: string) {
  const result = await callSolanaRpc<{ value: number }>("getBalance", [
    address,
  ]);

  return BigInt(result.value);
}

async function getPriorityFeePerGas() {
  try {
    return BigInt(await callEthereumRpc<string>("eth_maxPriorityFeePerGas", []));
  } catch {
    return 1_000_000_000n;
  }
}

async function getBaseFeePerGas() {
  const block = await callEthereumRpc<{ baseFeePerGas?: string }>(
    "eth_getBlockByNumber",
    ["latest", false],
  );

  if (!block.baseFeePerGas) {
    return BigInt(await callEthereumRpc<string>("eth_gasPrice", []));
  }

  return BigInt(block.baseFeePerGas);
}

async function estimateEthereumNativeTransferGas(
  from: string,
  to: string,
  valueWei: bigint,
) {
  try {
    const gasLimitHex = await callEthereumRpc<string>("eth_estimateGas", [
      {
        from,
        to,
        value: bigintToQuantity(valueWei),
      },
    ]);

    return BigInt(gasLimitHex);
  } catch {
    return 21_000n;
  }
}

async function prepareEthereumTransfer(
  from: string,
  to: string,
  valueWei: bigint,
): Promise<TransactionPlan> {
  const [nonceHex, gasLimit, baseFeePerGas, maxPriorityFeePerGas] =
    await Promise.all([
      callEthereumRpc<string>("eth_getTransactionCount", [from, "pending"]),
      estimateEthereumNativeTransferGas(from, to, valueWei),
      getBaseFeePerGas(),
      getPriorityFeePerGas(),
    ]);
  const maxFeePerGas = baseFeePerGas * 2n + maxPriorityFeePerGas;

  return {
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce: BigInt(nonceHex),
    totalCost: valueWei + gasLimit * maxFeePerGas,
    valueWei,
  };
}

async function broadcastRawTransaction(rawTransaction: string) {
  return callEthereumRpc<string>("eth_sendRawTransaction", [rawTransaction]);
}

function App() {
  const [passkeySupport, setPasskeySupport] =
    useState<PasskeySupport>("checking");
  const [passkeyMessage, setPasskeyMessage] = useState(
    "打开页面后会自动检测 Passkey 支持情况。",
  );
  const [wasmStatus, setWasmStatus] = useState<WasmStatus>("loading");
  const [wasmMessage, setWasmMessage] = useState(
    "正在准备安全钱包模块。",
  );
  const [walletStatus, setWalletStatus] = useState<WalletStatus>("idle");
  const [walletMessage, setWalletMessage] = useState(
    "点击 Create Passkey 后，会创建加密钱包并生成五链主网地址。",
  );
  const [hasStoredWallet, setHasStoredWallet] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>(() =>
    getViewFromPath(window.location.pathname),
  );
  const [ethereumAddress, setEthereumAddress] = useState("");
  const [bitcoinAddress, setBitcoinAddress] = useState("");
  const [solanaAddress, setSolanaAddress] = useState("");
  const [tronAddress, setTronAddress] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [assetBalances, setAssetBalances] = useState<AssetBalance[]>(() =>
    getDefaultAssetBalances(),
  );
  const [balanceStatus, setBalanceStatus] = useState<BalanceStatus>("idle");
  const [balanceMessage, setBalanceMessage] = useState(
    "创建钱包后可以刷新五条主网原生币余额。BTC 和 TRON 暂时默认显示 0。",
  );
  const [recipientAddress, setRecipientAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const [sendMessage, setSendMessage] = useState(
    "输入接收地址和数量后，可以先查看交易摘要。",
  );
  const [transactionPlan, setTransactionPlan] =
    useState<TransactionPlan | null>(null);
  const [sentTxHash, setSentTxHash] = useState("");
  const [selectedReceiveNetworkId, setSelectedReceiveNetworkId] =
    useState<ReceiveNetworkId>("ethereum");
  const [isReceiveNetworkMenuOpen, setIsReceiveNetworkMenuOpen] =
    useState(false);
  const [mnemonicExportStatus, setMnemonicExportStatus] =
    useState<MnemonicExportStatus>("idle");
  const [mnemonicExportMessage, setMnemonicExportMessage] = useState(
    "导出助记词前必须先阅读安全提醒，并用 Passkey 解锁签名。",
  );
  const [hasAcceptedMnemonicWarning, setHasAcceptedMnemonicWarning] =
    useState(false);
  const [exportedMnemonic, setExportedMnemonic] = useState("");

  const networks = getNetworks(
    ethereumAddress,
    bitcoinAddress,
    solanaAddress,
    tronAddress,
  );
  const receiveNetworks = buildReceiveNetworks({
    bitcoinAddress,
    ethereumAddress,
    solanaAddress,
    tronAddress,
  });
  const selectedReceiveNetwork =
    receiveNetworks.find((network) => network.id === selectedReceiveNetworkId) ??
    receiveNetworks[0];
  const mnemonicBackupWarnings = getMnemonicBackupWarnings();
  const mnemonicWords = exportedMnemonic ? exportedMnemonic.split(/\s+/) : [];

  useEffect(() => {
    let cancelled = false;

    async function checkPasskeySupport() {
      if (!window.isSecureContext) {
        if (!cancelled) {
          setPasskeySupport("unsupported");
          setPasskeyMessage(
            "Passkey 需要 HTTPS 或 localhost 环境。请使用 GitHub Pages 部署地址或本地开发地址打开。",
          );
        }
        return;
      }

      if (!window.PublicKeyCredential) {
        if (!cancelled) {
          setPasskeySupport("unsupported");
          setPasskeyMessage(getPasskeySupportMessage("unsupported"));
        }
        return;
      }

      try {
        const isPlatformAuthenticatorAvailable =
          await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();

        if (!cancelled) {
          const nextStatus = isPlatformAuthenticatorAvailable
            ? "supported"
            : "unsupported";
          setPasskeySupport(nextStatus);
          setPasskeyMessage(getPasskeySupportMessage(nextStatus));
        }
      } catch {
        if (!cancelled) {
          setPasskeySupport("unsupported");
          setPasskeyMessage(
            "Passkey 支持检测失败，请确认当前页面在 HTTPS 或 localhost 环境下打开。",
          );
        }
      }
    }

    void checkPasskeySupport();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initializeTokenCore() {
      try {
        await initTokenCoreWasm({ module_or_path: tokenCoreWasmUrl });

        if (!cancelled) {
          setWasmStatus("ready");
          setWasmMessage(
            "安全钱包模块已准备好。",
          );
        }
      } catch (error) {
        if (!cancelled) {
          setWasmStatus("failed");
          setWasmMessage(
            error instanceof Error
              ? `安全钱包模块初始化失败：${error.message}`
              : "安全钱包模块初始化失败，请检查浏览器控制台。",
          );
        }
      }
    }

    void initializeTokenCore();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const storedWallet = loadStoredWallet();

    if (!storedWallet?.ethereumAddress) {
      setHasStoredWallet(false);
      return;
    }

    setHasStoredWallet(true);
    setWalletMessage(
      "检测到本机浏览器里已有加密钱包记录，可用 Passkey 登录。",
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function createQrCode() {
      if (!selectedReceiveNetwork.address) {
        setQrCodeUrl("");
        return;
      }

      const nextQrCodeUrl = await QRCode.toDataURL(
        selectedReceiveNetwork.address,
        {
          color: {
            dark: "#111d4a",
            light: "#ffffff",
          },
          margin: 2,
          width: 240,
        },
      );

      if (!cancelled) {
        setQrCodeUrl(nextQrCodeUrl);
      }
    }

    void createQrCode();

    return () => {
      cancelled = true;
    };
  }, [selectedReceiveNetwork.address]);

  useEffect(() => {
    if (!ethereumAddress || !isAuthenticated) {
      setAssetBalances(getDefaultAssetBalances());
      setBalanceStatus("idle");
      return;
    }

    void refreshBalances();
  }, [ethereumAddress, isAuthenticated, solanaAddress]);

  useEffect(() => {
    function handlePopState() {
      setCurrentView(getViewFromPath(window.location.pathname));
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (currentView !== "settings") {
      setExportedMnemonic("");
      setMnemonicExportStatus("idle");
      setMnemonicExportMessage(
        "导出助记词前必须先阅读安全提醒，并用 Passkey 解锁签名。",
      );
      setHasAcceptedMnemonicWarning(false);
    }
  }, [currentView]);

  function navigateToView(view: AppView) {
    setCurrentView(view);
    const nextPath = getPathForView(view);

    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
  }

  function getAuthStatusMessage() {
    if (walletStatus === "creating" || walletStatus === "failed") {
      return walletMessage;
    }

    if (passkeySupport === "unsupported") {
      return passkeyMessage;
    }

    if (wasmStatus === "failed") {
      return wasmMessage;
    }

    if (passkeySupport === "checking" || wasmStatus === "loading") {
      return "正在准备安全创建环境。";
    }

    if (hasStoredWallet) {
      return "检测到本机已有加密钱包，可使用 Passkey 登录。";
    }

    return "使用本机 Passkey 创建五链主网钱包。";
  }

  function handleLogout() {
    setIsAuthenticated(false);
    navigateToView("dashboard");
    setEthereumAddress("");
    setBitcoinAddress("");
    setSolanaAddress("");
    setTronAddress("");
    setSelectedReceiveNetworkId("ethereum");
    setQrCodeUrl("");
    setCopyMessage("");
    setAssetBalances(getDefaultAssetBalances());
    setBalanceStatus("idle");
    setTransactionPlan(null);
    setSentTxHash("");
    setSendStatus("idle");
    setExportedMnemonic("");
    setMnemonicExportStatus("idle");
    setHasAcceptedMnemonicWarning(false);
    setWalletStatus("idle");
    setWalletMessage(
      hasStoredWallet
        ? "检测到本机浏览器里已有加密钱包记录，可用 Passkey 登录。"
        : "点击 Create Passkey 后，会创建加密钱包并生成五链主网地址。",
    );
  }

  async function refreshBalances() {
    if (!ethereumAddress) {
      return;
    }

    setBalanceStatus("loading");
    setBalanceMessage("正在查询 Ethereum、BSC 和 Solana 主网余额。");

    const [ethereumResult, bscResult, solanaResult] = await Promise.allSettled([
      fetchEthereumBalance(ethereumAddress),
      fetchEvmBalance(bscRpcConfig, ethereumAddress),
      solanaAddress ? fetchSolanaBalance(solanaAddress) : Promise.resolve(0n),
    ]);
    const failedNetworks: string[] = [];
    const nextBalances = getDefaultAssetBalances().map((asset) => {
      if (asset.id === "ethereum") {
        if (ethereumResult.status === "fulfilled") {
          return { ...asset, balance: formatWeiToEth(ethereumResult.value) };
        }
        failedNetworks.push("Ethereum");
      }

      if (asset.id === "bsc") {
        if (bscResult.status === "fulfilled") {
          return { ...asset, balance: formatWeiToEth(bscResult.value) };
        }
        failedNetworks.push("BSC");
      }

      if (asset.id === "solana") {
        if (solanaResult.status === "fulfilled") {
          return {
            ...asset,
            balance: formatLamportsToSol(solanaResult.value),
          };
        }
        failedNetworks.push("Solana");
      }

      return asset;
    });

    setAssetBalances(nextBalances);
    setBalanceStatus(failedNetworks.length ? "failed" : "ready");
    setBalanceMessage(
      failedNetworks.length
        ? `${failedNetworks.join("、")} 余额暂时查询失败，已按 0 显示；BTC 和 TRON 余额 API 后续接入。`
        : "Ethereum、BSC 和 Solana 主网余额已更新；BTC 和 TRON 暂时默认显示 0。",
    );
  }

  async function handleCreatePasskeyWallet() {
    if (passkeySupport !== "supported") {
      setPasskeyMessage(getPasskeySupportMessage("unsupported"));
      return;
    }

    if (wasmStatus !== "ready") {
      setWalletStatus("failed");
      setWalletMessage("安全钱包模块还没有准备完成，请稍后再试。");
      return;
    }

    try {
      setWalletStatus("creating");
      setCopyMessage("");
      setWalletMessage("正在创建 Passkey，请按浏览器提示完成系统验证。");

      const userIdBytes = getRandomBytes(16);
      const prfSalt = getRandomBytes(32);
      const credential = await createPasskeyCredential(userIdBytes);
      const prfKeyBytes = await requestPasskeyPrfKey(
        credential.rawId,
        prfSalt,
      );
      const prfKeyHex = bytesToHex(prfKeyBytes);
      const rpId = getRpId();
      const userId = arrayBufferToBase64Url(userIdBytes.buffer);

      const keystoreJson = create_keystore(
        JSON.stringify({
          credentialId: credential.id,
          network: "MAINNET",
          prfKey: prfKeyHex,
          rpId,
          userId,
        }),
      );
      const addresses = deriveWalletAddresses(
        keystoreJson,
        prfKeyBytes,
      );

      saveStoredWallet({
        createdAt: new Date().toISOString(),
        credentialId: credential.id,
        credentialRawId: arrayBufferToBase64Url(credential.rawId),
        bitcoinAddress: addresses.bitcoinAddress,
        ethereumAddress: addresses.ethereumAddress,
        keystoreJson,
        prfSaltHex: bytesToHex(prfSalt),
        rpId,
        solanaAddress: addresses.solanaAddress,
        tronAddress: addresses.tronAddress,
        userId,
        version: 2,
      });

      setEthereumAddress(addresses.ethereumAddress);
      setBitcoinAddress(addresses.bitcoinAddress);
      setSolanaAddress(addresses.solanaAddress);
      setTronAddress(addresses.tronAddress);
      setHasStoredWallet(true);
      setIsAuthenticated(true);
      navigateToView(getViewFromPath(window.location.pathname));
      setWalletStatus("created");
      setWalletMessage(
        "Ethereum、BSC、Bitcoin、Solana 和 TRON 主网地址已生成。助记词、私钥和 Passkey PRF 密钥都没有在页面显示。",
      );
    } catch (error) {
      setWalletStatus("failed");
      setWalletMessage(
        error instanceof Error
          ? error.message
          : "创建钱包失败，请重试或换支持 Passkey PRF 的浏览器。",
      );
    }
  }

  async function handleLoginWithPasskey() {
    const storedWallet = loadStoredWallet();

    if (!storedWallet) {
      setWalletStatus("failed");
      setWalletMessage("当前浏览器没有已保存的钱包记录，请先创建新主网钱包。");
      return;
    }

    if (wasmStatus !== "ready") {
      setWalletStatus("failed");
      setWalletMessage("安全钱包模块还没有准备完成，请稍后再试。");
      return;
    }

    try {
      setWalletStatus("creating");
      setWalletMessage("正在用 Passkey 解锁本机已保存的钱包记录。");

      const prfKeyBytes = await requestPasskeyPrfKey(
        base64UrlToArrayBuffer(storedWallet.credentialRawId),
        hexToBytes(storedWallet.prfSaltHex),
      );
      const addresses = deriveWalletAddresses(
        storedWallet.keystoreJson,
        prfKeyBytes,
      );

      saveStoredWallet({
        ...storedWallet,
        bitcoinAddress: addresses.bitcoinAddress,
        ethereumAddress: addresses.ethereumAddress,
        solanaAddress: addresses.solanaAddress,
        tronAddress: addresses.tronAddress,
      });

      setEthereumAddress(addresses.ethereumAddress);
      setBitcoinAddress(addresses.bitcoinAddress);
      setSolanaAddress(addresses.solanaAddress);
      setTronAddress(addresses.tronAddress);
      setHasStoredWallet(true);
      setIsAuthenticated(true);
      navigateToView(getViewFromPath(window.location.pathname));
      setWalletStatus("created");
      setWalletMessage("Passkey 解锁成功，五链主网地址已恢复。");
    } catch (error) {
      setWalletStatus("failed");
      setWalletMessage(
        error instanceof Error
          ? error.message
          : "Passkey 登录失败，请确认使用创建钱包时的同一台设备。",
      );
    }
  }

  async function copyAddress(address = ethereumAddress) {
    if (!address) {
      return;
    }

    try {
      await navigator.clipboard.writeText(address);
      setCopyMessage("地址已复制。");
    } catch {
      setCopyMessage("复制失败，请手动选择地址。");
    }
  }

  async function copyEthereumAddress() {
    await copyAddress(ethereumAddress);
  }

  async function handleReviewTransfer() {
    setSentTxHash("");
    setTransactionPlan(null);

    if (!validateEthereumAddress(recipientAddress)) {
      setSendStatus("failed");
      setSendMessage("请输入有效的 Ethereum 接收地址。");
      return;
    }

    try {
      const valueWei = parseEthToWei(sendAmount);
      setSendStatus("review");
      setSendMessage("正在准备交易摘要。");
      const plan = await prepareEthereumTransfer(
        ethereumAddress,
        recipientAddress.trim(),
        valueWei,
      );

      setTransactionPlan(plan);
      setSendStatus("review");
      setSendMessage("请确认接收地址、金额和预估网络费。");
    } catch (error) {
      setSendStatus("failed");
      setSendMessage(
        error instanceof Error ? error.message : "交易摘要生成失败。",
      );
    }
  }

  async function handleConfirmTransfer() {
    const storedWallet = loadStoredWallet();

    if (!storedWallet || !transactionPlan) {
      setSendStatus("failed");
      setSendMessage("缺少钱包或交易摘要，请重新登录后再试。");
      return;
    }

    try {
      setSendStatus("signing");
      setSendMessage("请使用 Passkey 解锁并签名交易。");
      const prfKeyBytes = await requestPasskeyPrfKey(
        base64UrlToArrayBuffer(storedWallet.credentialRawId),
        hexToBytes(storedWallet.prfSaltHex),
      );
      const signed = JSON.parse(
        sign_tx(
          JSON.stringify({
            chain: "ETHEREUM",
            derivationPath: ethereumDerivationPath,
            input: {
              accessList: [],
              chainId: ethereumChainId,
              data: "0x",
              gasLimit: String(transactionPlan.gasLimit),
              maxFeePerGas: String(transactionPlan.maxFeePerGas),
              maxPriorityFeePerGas: String(
                transactionPlan.maxPriorityFeePerGas,
              ),
              nonce: String(transactionPlan.nonce),
              to: recipientAddress.trim(),
              txType: "02",
              value: String(transactionPlan.valueWei),
            },
            key: bytesToHex(prfKeyBytes),
            keystoreJson: storedWallet.keystoreJson,
          }),
        ),
      ) as SignedEthTransaction;

      setSendStatus("broadcasting");
      setSendMessage("签名完成，正在广播到 Ethereum 主网。");
      const hash = await broadcastRawTransaction(signed.signature);
      setSentTxHash(hash || signed.txHash);
      setSendStatus("sent");
      setSendMessage("交易已广播。可以在 Etherscan 查看状态。");
      void refreshBalances();
    } catch (error) {
      setSendStatus("failed");
      setSendMessage(
        error instanceof Error ? error.message : "转账失败，请检查余额和网络。",
      );
    }
  }

  async function handleExportMnemonic() {
    const storedWallet = loadStoredWallet();

    if (!storedWallet) {
      setMnemonicExportStatus("failed");
      setMnemonicExportMessage("当前浏览器没有已保存的钱包记录，请先创建或登录钱包。");
      return;
    }

    if (!hasAcceptedMnemonicWarning) {
      setMnemonicExportStatus("failed");
      setMnemonicExportMessage("请先确认你理解助记词只能手抄离线保存。");
      return;
    }

    try {
      setExportedMnemonic("");
      setMnemonicExportStatus("signing");
      setMnemonicExportMessage("请使用 Passkey 解锁签名，确认是你本人在导出助记词。");
      const prfKeyBytes = await requestPasskeyPrfKey(
        base64UrlToArrayBuffer(storedWallet.credentialRawId),
        hexToBytes(storedWallet.prfSaltHex),
      );
      const mnemonic = exportWalletMnemonic(
        storedWallet.keystoreJson,
        bytesToHex(prfKeyBytes),
      );

      setExportedMnemonic(mnemonic);
      setMnemonicExportStatus("revealed");
      setMnemonicExportMessage(
        "助记词已临时显示在页面上。请只手抄到纸上，完成后点击隐藏。",
      );
    } catch (error) {
      setExportedMnemonic("");
      setMnemonicExportStatus("failed");
      setMnemonicExportMessage(
        error instanceof Error ? error.message : "导出助记词失败，请稍后重试。",
      );
    }
  }

  function hideExportedMnemonic() {
    setExportedMnemonic("");
    setMnemonicExportStatus("idle");
    setMnemonicExportMessage(
      "助记词已隐藏。需要再次查看时，必须重新用 Passkey 解锁签名。",
    );
    setHasAcceptedMnemonicWarning(false);
  }

  if (!isAuthenticated) {
    const authActionDisabled =
      passkeySupport !== "supported" ||
      wasmStatus !== "ready" ||
      walletStatus === "creating";

    return (
      <main className="auth-page" aria-label="创建或登录钱包">
        <section className="auth-hero">
          <div className="auth-icon-stack" aria-hidden="true">
            <div className="auth-icon-card">
              <Fingerprint size={64} strokeWidth={2.3} />
            </div>
            <div className="auth-icon-badge">
              <ShieldCheck size={22} strokeWidth={2.2} />
            </div>
          </div>

          <div className="auth-copy">
            <h1>
              Your keys,
              <br />
              simplified.
            </h1>
            <p>No seed phrase to lose. Access your assets with biometrics.</p>
          </div>
        </section>

        <section className="auth-actions" aria-label="钱包操作">
          <button
            className="auth-primary-button"
            disabled={authActionDisabled}
            onClick={handleCreatePasskeyWallet}
            type="button"
          >
            {walletStatus === "creating" ? "Creating..." : "Create Passkey"}
          </button>

          {hasStoredWallet ? (
            <button
              className="auth-secondary-button"
              disabled={wasmStatus !== "ready" || walletStatus === "creating"}
              onClick={handleLoginWithPasskey}
              type="button"
            >
              Login with Passkey
            </button>
          ) : null}

          <a
            className="passkey-help-link"
            href="https://passkeys.dev/docs/intro/what-are-passkeys/"
            rel="noreferrer"
            target="_blank"
          >
            What is a passkey?
            <ExternalLink size={15} strokeWidth={2.2} />
          </a>

          <div className="encrypted-pill">
            <LockKeyhole size={16} strokeWidth={2} />
            End-to-end encrypted storage
          </div>

          <div className={`auth-status ${walletStatus}`} role="status">
            {getAuthStatusMessage()}
          </div>
        </section>
      </main>
    );
  }

  const receiveAddress =
    selectedReceiveNetwork.address || `${selectedReceiveNetwork.name} 地址后续接入`;
  const viewTitle: Record<AppView, string> = {
    dashboard: "Passkey 多链钱包",
    receive: "Deposit Funds",
    send: "Send",
    settings: "Settings",
  };
  const viewDescription: Record<AppView, string> = {
    dashboard: "五链主网钱包已解锁。当前只显示公开地址和收款入口，不展示助记词或私钥。",
    receive: "Receive crypto to your wallet",
    send: "输入接收地址和金额，Review 后使用 Passkey 签名并广播到 Ethereum 主网。",
    settings: "当前 demo 只提供退出登录和安全提示。",
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="钱包导航">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            W
          </div>
          <div>
            <div className="brand-title">Wallet</div>
            <div className="brand-subtitle">Your secure vault</div>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              className={
                item.view === currentView ? "nav-item active" : "nav-item"
              }
              key={item.label}
              onClick={() => navigateToView(item.view)}
              type="button"
            >
              <span className="nav-dot" aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item muted" type="button">
            Help
          </button>
          <button className="nav-item danger" onClick={handleLogout} type="button">
            Log Out
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">主网 Demo</p>
            <h1>{viewTitle[currentView]}</h1>
            <p className="page-description">{viewDescription[currentView]}</p>
          </div>
          <button
            className="primary-button"
            onClick={handleLogout}
            type="button"
          >
            Log Out
          </button>
        </header>

        {currentView === "dashboard" ? (
          <section className="content-grid" aria-label="钱包概览">
            <article className="panel balance-panel">
              <div className="panel-header">
                <div>
                  <div className="panel-label">Mainnet Balances</div>
                  <h2>Native Assets</h2>
                </div>
                <span className={`pill ${balanceStatus}`}>
                  {balanceStatus === "loading"
                    ? "Loading"
                    : balanceStatus === "ready"
                      ? "Updated"
                      : balanceStatus === "failed"
                        ? "Partial"
                        : "Waiting"}
                </span>
              </div>
              <div className="asset-list compact">
                {assetBalances.map((asset) => (
                  <div className="asset-row" key={asset.id}>
                    <div className="network-avatar" aria-hidden="true">
                      {asset.symbol.slice(0, 1)}
                    </div>
                    <div>
                      <div className="network-name">{asset.symbol}</div>
                      <div className="network-status">{asset.name} 主网原生币</div>
                    </div>
                    <strong>
                      {asset.balance} {asset.symbol}
                    </strong>
                  </div>
                ))}
              </div>
              <p className="muted-text">{balanceMessage}</p>
              <button
                className="secondary-button compact"
                onClick={refreshBalances}
                type="button"
              >
                Refresh Balances
              </button>
            </article>

            <article className="panel">
              <div className="panel-header">
                <h2>Quick Actions</h2>
                <span className="pill">Mainnet</span>
              </div>
              <div className="action-grid">
                <button onClick={() => navigateToView("receive")} type="button">
                  Receive
                </button>
                <button onClick={() => navigateToView("send")} type="button">
                  Send
                </button>
                <button onClick={() => navigateToView("settings")} type="button">
                  Settings
                </button>
              </div>
            </article>

            <article className="panel wide">
              <div className="panel-header">
                <h2>Main Networks</h2>
                <span className="pill">5 chains</span>
              </div>
              <div className="network-list">
                {networks.map((network) => (
                  <div className="network-row" key={network.name}>
                    <div className="network-avatar" aria-hidden="true">
                      {network.name.slice(0, 1)}
                    </div>
                    <div>
                      <div className="network-name">{network.name}</div>
                      <div className="network-status">{network.status}</div>
                    </div>
                    <span
                      className={
                        network.badge === "Connected"
                          ? "network-badge connected"
                          : "network-badge"
                      }
                    >
                      {network.badge}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {currentView === "receive" ? (
          <section className="single-view" aria-label="收款">
            <article className="panel receive-panel">
              <div className="receive-network-label">Select Network</div>
              <button
                className="receive-network-select"
                onClick={() =>
                  setIsReceiveNetworkMenuOpen((isMenuOpen) => !isMenuOpen)
                }
                type="button"
              >
                <div className="network-avatar" aria-hidden="true">
                  {selectedReceiveNetwork.badge}
                </div>
                <strong>{selectedReceiveNetwork.name}</strong>
                <span aria-hidden="true">⌄</span>
              </button>
              {isReceiveNetworkMenuOpen ? (
                <div className="receive-network-menu">
                  {receiveNetworks.map((network) => (
                    <button
                      className={
                        network.id === selectedReceiveNetworkId
                          ? "receive-network-option active"
                          : "receive-network-option"
                      }
                      key={network.id}
                      onClick={() => {
                        setSelectedReceiveNetworkId(network.id);
                        setIsReceiveNetworkMenuOpen(false);
                        setCopyMessage("");
                      }}
                      type="button"
                    >
                      <div className="network-avatar" aria-hidden="true">
                        {network.badge}
                      </div>
                      <div>
                        <strong>{network.name}</strong>
                        <span>
                          {network.address
                            ? shortenAddress(network.address)
                            : "地址后续接入"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="panel-header">
                <h2>Receive {selectedReceiveNetwork.assetName}</h2>
                <span
                  className={
                    selectedReceiveNetwork.address
                      ? "pill created"
                      : "pill unsupported"
                  }
                >
                  {selectedReceiveNetwork.address ? "Ready" : "Coming Soon"}
                </span>
              </div>
              {qrCodeUrl ? (
                <img
                  alt={`${selectedReceiveNetwork.name} 收款二维码`}
                  className="qr-code large"
                  src={qrCodeUrl}
                />
              ) : (
                <div className="qr-placeholder receive-placeholder" aria-hidden="true">
                  QR
                </div>
              )}
              <p className="qr-caption">
                Scan this QR code to send {selectedReceiveNetwork.assetName} to
                your wallet
              </p>
              <div className="receive-address-label">
                Your {selectedReceiveNetwork.name} Address
              </div>
              <div className="deposit-address large">
                <span>{receiveAddress}</span>
                <button
                  disabled={!selectedReceiveNetwork.address}
                  onClick={() => copyAddress(selectedReceiveNetwork.address)}
                  type="button"
                >
                  Copy
                </button>
              </div>
              {copyMessage ? (
                <div className="copy-message" role="status">
                  {copyMessage}
                </div>
              ) : null}
              <div className="deposit-warning" role="note">
                {selectedReceiveNetwork.warning}
              </div>
              <div className="receive-copy-panel">
                <p>
                  <strong>Alpha:</strong> {selectedReceiveNetwork.note}
                </p>
                <button
                  className="primary-button receive-copy-button"
                  disabled={!selectedReceiveNetwork.address}
                  onClick={() => copyAddress(selectedReceiveNetwork.address)}
                  type="button"
                >
                  {selectedReceiveNetwork.address
                    ? `Copy ${shortenAddress(selectedReceiveNetwork.address)}`
                    : "Address Coming Soon"}
                </button>
              </div>
              <div className="faucet-row">
                <div>
                  <div className="network-name">主网资产提醒</div>
                  <p className="muted-text">
                    当前页面显示真实主网地址。第一次测试请只转入很小金额，并确认网络选择正确。
                  </p>
                </div>
              </div>
            </article>
          </section>
        ) : null}

        {currentView === "send" ? (
          <section className="single-view" aria-label="转账">
            <article className="panel send-panel">
              <div className="panel-header">
                <h2>Send ETH</h2>
                <span className={`pill ${sendStatus}`}>
                  {sendStatus === "sent"
                    ? "Broadcasted"
                    : sendStatus === "failed"
                      ? "Needs Review"
                      : sendStatus === "signing" ||
                          sendStatus === "broadcasting"
                        ? "Processing"
                        : "Draft"}
                </span>
              </div>
              <div className="form-grid">
                <label>
                  接收地址
                  <input
                    onChange={(event) => setRecipientAddress(event.target.value)}
                    placeholder="0x..."
                    value={recipientAddress}
                  />
                </label>
                <label>
                  金额
                  <input
                    inputMode="decimal"
                    onChange={(event) => setSendAmount(event.target.value)}
                    placeholder="0.001"
                    value={sendAmount}
                  />
                </label>
              </div>
              <button
                className="primary-button form-action"
                disabled={sendStatus === "signing" || sendStatus === "broadcasting"}
                onClick={handleReviewTransfer}
                type="button"
              >
                Review Transfer
              </button>

              {transactionPlan ? (
                <div className="review-box">
                  <h3>Review</h3>
                  <dl>
                    <div>
                      <dt>From</dt>
                      <dd>{shortenAddress(ethereumAddress)}</dd>
                    </div>
                    <div>
                      <dt>To</dt>
                      <dd>{shortenAddress(recipientAddress.trim())}</dd>
                    </div>
                    <div>
                      <dt>Amount</dt>
                      <dd>{formatWeiToEth(transactionPlan.valueWei)} ETH</dd>
                    </div>
                    <div>
                      <dt>Estimated fee</dt>
                      <dd>
                        {formatWeiToEth(
                          transactionPlan.gasLimit * transactionPlan.maxFeePerGas,
                        )}{" "}
                        ETH
                      </dd>
                    </div>
                    <div>
                      <dt>Total max cost</dt>
                      <dd>{formatWeiToEth(transactionPlan.totalCost)} ETH</dd>
                    </div>
                  </dl>
                  <button
                    className="primary-button form-action"
                    disabled={
                      sendStatus === "signing" ||
                      sendStatus === "broadcasting" ||
                      sendStatus === "sent"
                    }
                    onClick={handleConfirmTransfer}
                    type="button"
                  >
                    Sign with Passkey & Send
                  </button>
                </div>
              ) : null}

              <div className={`support-message ${sendStatus}`} role="status">
                {sendMessage}
              </div>
              {sentTxHash ? (
                <a
                  className="explorer-link"
                  href={`${ethereumExplorerBaseUrl}/tx/${sentTxHash}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  View transaction on Etherscan
                </a>
              ) : null}
            </article>
          </section>
        ) : null}

        {currentView === "settings" ? (
          <section className="single-view" aria-label="设置">
            <article className="panel settings-panel">
              <div className="panel-header">
                <h2>Settings</h2>
                <span className="pill">Demo</span>
              </div>
              <p className="muted-text">
                当前 demo 的加密钱包记录只保存在本机浏览器。主网操作请先小额测试，并做好助记词备份。
              </p>

              <div className="mnemonic-backup-box">
                <div className="panel-header">
                  <h3>导出助记词备份</h3>
                  <span className="pill unsupported">Sensitive</span>
                </div>
                <p className="muted-text">
                  导出前必须用 Passkey 解锁签名。助记词只会临时显示在当前页面，不会上传网络，也不会保存到服务器。
                </p>
                <ul className="warning-list">
                  {mnemonicBackupWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
                <label className="checkbox-row">
                  <input
                    checked={hasAcceptedMnemonicWarning}
                    onChange={(event) =>
                      setHasAcceptedMnemonicWarning(event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>我确认只手抄纸质备份，不截图、不复制、不上传网络。</span>
                </label>
                <button
                  className="primary-button form-action"
                  disabled={
                    !hasAcceptedMnemonicWarning ||
                    mnemonicExportStatus === "signing"
                  }
                  onClick={handleExportMnemonic}
                  type="button"
                >
                  {mnemonicExportStatus === "signing"
                    ? "Unlocking with Passkey..."
                    : "Export Mnemonic with Passkey"}
                </button>
                <div
                  className={`support-message ${mnemonicExportStatus}`}
                  role="status"
                >
                  {mnemonicExportMessage}
                </div>
                {mnemonicWords.length > 0 ? (
                  <div className="mnemonic-reveal" aria-label="助记词">
                    <ol>
                      {mnemonicWords.map((word, index) => (
                        <li key={`${word}-${index}`}>
                          <span>{index + 1}</span>
                          <strong>{word}</strong>
                        </li>
                      ))}
                    </ol>
                    <button
                      className="secondary-button compact"
                      onClick={hideExportedMnemonic}
                      type="button"
                    >
                      Hide Mnemonic
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                className="primary-button form-action"
                onClick={handleLogout}
                type="button"
              >
                Log Out
              </button>
            </article>
          </section>
        ) : null}

      </main>
    </div>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("找不到页面根节点 #root");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
