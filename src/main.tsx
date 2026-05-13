import { StrictMode, useEffect, useState } from "react";
import initTokenCoreWasm, {
  create_keystore,
  derive_accounts,
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
import "./styles.css";

const navItems = ["Dashboard", "Portfolio", "Deposit Funds", "Settings"];
const walletStorageKey = "mywallet.passkeyWallet.v1";

function getNetworks(ethereumAddress: string) {
  return [
    {
      name: "Ethereum Sepolia",
      status: ethereumAddress ? "地址已生成" : "等待创建",
      badge: ethereumAddress ? "Connected" : "Not connected",
    },
    { name: "BSC Testnet", status: "后续接入", badge: "Not connected" },
    { name: "Bitcoin Testnet", status: "后续接入", badge: "Not connected" },
    { name: "Solana Devnet", status: "后续接入", badge: "Not connected" },
    { name: "TRON Testnet", status: "后续接入", badge: "Not connected" },
  ];
}

type PasskeySupport = "checking" | "supported" | "unsupported";
type WasmStatus = "loading" | "ready" | "failed";
type WalletStatus = "idle" | "creating" | "created" | "failed";

type StoredWallet = {
  version: 1;
  keystoreJson: string;
  credentialId: string;
  credentialRawId: string;
  userId: string;
  rpId: string;
  prfSaltHex: string;
  ethereumSepoliaAddress: string;
  createdAt: string;
};

type DerivedAccount = {
  address?: string;
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

function deriveEthereumSepoliaAddress(keystoreJson: string, prfKeyHex: string) {
  const accounts = JSON.parse(
    derive_accounts(
      JSON.stringify({
        derivations: [
          {
            chain: "ETHEREUM",
            chainId: "11155111",
            derivationPath: "m/44'/60'/0'/0/0",
            network: "TESTNET",
          },
        ],
        key: prfKeyHex,
        keystoreJson,
      }),
    ),
  ) as DerivedAccount[];

  const address = accounts[0]?.address;

  if (!address) {
    throw new Error("Token Core 没有返回 Ethereum Sepolia 地址。");
  }

  return address;
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
    "点击 Create Passkey 后，会创建加密钱包并生成 Ethereum Sepolia 地址。",
  );
  const [hasStoredWallet, setHasStoredWallet] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [ethereumAddress, setEthereumAddress] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const networks = getNetworks(ethereumAddress);

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

    if (!storedWallet?.ethereumSepoliaAddress) {
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
      if (!ethereumAddress) {
        setQrCodeUrl("");
        return;
      }

      const nextQrCodeUrl = await QRCode.toDataURL(ethereumAddress, {
        color: {
          dark: "#111d4a",
          light: "#ffffff",
        },
        margin: 2,
        width: 240,
      });

      if (!cancelled) {
        setQrCodeUrl(nextQrCodeUrl);
      }
    }

    void createQrCode();

    return () => {
      cancelled = true;
    };
  }, [ethereumAddress]);

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

    return "使用本机 Passkey 创建 Ethereum Sepolia 测试钱包。";
  }

  function handleLogout() {
    setIsAuthenticated(false);
    setEthereumAddress("");
    setQrCodeUrl("");
    setCopyMessage("");
    setWalletStatus("idle");
    setWalletMessage(
      hasStoredWallet
        ? "检测到本机浏览器里已有加密钱包记录，可用 Passkey 登录。"
        : "点击 Create Passkey 后，会创建加密钱包并生成 Ethereum Sepolia 地址。",
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
          network: "TESTNET",
          prfKey: prfKeyHex,
          rpId,
          userId,
        }),
      );
      const address = deriveEthereumSepoliaAddress(keystoreJson, prfKeyHex);

      saveStoredWallet({
        createdAt: new Date().toISOString(),
        credentialId: credential.id,
        credentialRawId: arrayBufferToBase64Url(credential.rawId),
        ethereumSepoliaAddress: address,
        keystoreJson,
        prfSaltHex: bytesToHex(prfSalt),
        rpId,
        userId,
        version: 1,
      });

      setEthereumAddress(address);
      setHasStoredWallet(true);
      setIsAuthenticated(true);
      setWalletStatus("created");
      setWalletMessage(
        "Ethereum Sepolia 地址已生成。助记词、私钥和 Passkey PRF 密钥都没有在页面显示。",
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
      setWalletMessage("当前浏览器没有已保存的钱包记录，请先创建新测试钱包。");
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
      const address = deriveEthereumSepoliaAddress(
        storedWallet.keystoreJson,
        bytesToHex(prfKeyBytes),
      );

      setEthereumAddress(address);
      setHasStoredWallet(true);
      setIsAuthenticated(true);
      setWalletStatus("created");
      setWalletMessage("Passkey 解锁成功，Ethereum Sepolia 地址已恢复。");
    } catch (error) {
      setWalletStatus("failed");
      setWalletMessage(
        error instanceof Error
          ? error.message
          : "Passkey 登录失败，请确认使用创建钱包时的同一台设备。",
      );
    }
  }

  async function copyEthereumAddress() {
    if (!ethereumAddress) {
      return;
    }

    try {
      await navigator.clipboard.writeText(ethereumAddress);
      setCopyMessage("地址已复制。");
    } catch {
      setCopyMessage("复制失败，请手动选择地址。");
    }
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
              <Fingerprint size={88} strokeWidth={2.4} />
            </div>
            <div className="auth-icon-badge">
              <ShieldCheck size={30} strokeWidth={2.2} />
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
            <ExternalLink size={18} strokeWidth={2.2} />
          </a>

          <div className="encrypted-pill">
            <LockKeyhole size={20} strokeWidth={2} />
            End-to-end encrypted storage
          </div>

          <div className={`auth-status ${walletStatus}`} role="status">
            {getAuthStatusMessage()}
          </div>
        </section>
      </main>
    );
  }

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
              className={item === "Dashboard" ? "nav-item active" : "nav-item"}
              key={item}
              type="button"
            >
              <span className="nav-dot" aria-hidden="true" />
              {item}
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
            <p className="eyebrow">测试网 Demo</p>
            <h1>Passkey 多链钱包</h1>
            <p className="page-description">
              Ethereum Sepolia 测试钱包已解锁。当前只显示公开地址和收款入口，
              不展示助记词或私钥。
            </p>
          </div>
          <button
            className="primary-button"
            onClick={handleLogout}
            type="button"
          >
            Log Out
          </button>
        </header>

        <section className="content-grid" aria-label="钱包概览">
          <article className="panel balance-panel">
            <div className="panel-label">Total Portfolio Value</div>
            <div className="balance">$0.00</div>
            <p className="muted-text">
              空资产状态正常。第 7 步会接入 Sepolia ETH 余额查询。
            </p>
          </article>

          <article className="panel">
            <div className="panel-header">
              <h2>Quick Actions</h2>
              <span className="pill">占位</span>
            </div>
            <div className="action-grid">
              <button type="button">Receive</button>
              <button type="button">Send</button>
              <button type="button">Portfolio</button>
              <button type="button">Settings</button>
            </div>
          </article>

          <article className="panel address-panel">
            <div className="panel-header">
              <h2>Ethereum Sepolia</h2>
              <span className={`pill ${walletStatus}`}>
                {walletStatus === "creating"
                  ? "Creating"
                  : walletStatus === "created"
                    ? "Address Ready"
                    : walletStatus === "failed"
                      ? "Needs Retry"
                      : "Not Created"}
              </span>
            </div>
            <p className="muted-text">
              这是公开收款地址，可以复制给自己用于测试网转入 Sepolia ETH。
            </p>
            <div className="address-box">
              <span>{ethereumAddress || "创建钱包后显示 Ethereum Sepolia 地址"}</span>
              <button
                disabled={!ethereumAddress}
                onClick={copyEthereumAddress}
                type="button"
              >
                Copy
              </button>
            </div>
            <div className={`support-message ${walletStatus}`} role="status">
              {walletMessage}
            </div>
            {copyMessage ? (
              <div className="copy-message" role="status">
                {copyMessage}
              </div>
            ) : null}
          </article>

          <article className="panel wide">
            <div className="panel-header">
              <h2>Test Networks</h2>
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

          <article className="panel">
            <div className="panel-header">
              <h2>Deposit Funds</h2>
              <span className={`pill ${ethereumAddress ? "created" : ""}`}>
                {ethereumAddress ? "Ready" : "Waiting"}
              </span>
            </div>
            {qrCodeUrl ? (
              <img
                alt="Ethereum Sepolia 收款二维码"
                className="qr-code"
                src={qrCodeUrl}
              />
            ) : (
              <div className="qr-placeholder" aria-hidden="true">
                QR
              </div>
            )}
            <p className="muted-text">扫描二维码或复制地址，向钱包转入测试币。</p>
            <div className="deposit-address">
              <span>{ethereumAddress || "创建钱包后显示收款地址"}</span>
              <button
                disabled={!ethereumAddress}
                onClick={copyEthereumAddress}
                type="button"
              >
                Copy
              </button>
            </div>
            <div className="deposit-warning" role="note">
              只发送 Ethereum Sepolia 测试网 ETH 到这个地址。发送其他网络或资产可能无法找回。
            </div>
            {copyMessage ? (
              <div className="copy-message" role="status">
                {copyMessage}
              </div>
            ) : null}
          </article>
        </section>

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
