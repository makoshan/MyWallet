import { StrictMode, useEffect, useState } from "react";
import initTokenCoreWasm from "@consenlabs/tcx-wasm";
import tokenCoreWasmUrl from "@consenlabs/tcx-wasm/tcx_wasm_bg.wasm?url";
import { createRoot } from "react-dom/client";
import "./styles.css";

const navItems = ["Dashboard", "Portfolio", "Deposit Funds", "Settings"];

const networks = [
  { name: "Ethereum Sepolia", status: "后续接入" },
  { name: "BSC Testnet", status: "后续接入" },
  { name: "Bitcoin Testnet", status: "后续接入" },
  { name: "Solana Devnet", status: "后续接入" },
  { name: "TRON Testnet", status: "后续接入" },
];

type PasskeySupport = "checking" | "supported" | "unsupported";
type WasmStatus = "loading" | "ready" | "failed";

function getPasskeySupportMessage(status: PasskeySupport) {
  if (status === "checking") {
    return "正在检查当前浏览器是否支持 Passkey。";
  }

  if (status === "supported") {
    return "当前浏览器支持 Passkey。下一步会接入真实创建流程。";
  }

  return "当前浏览器暂不支持 Passkey，请换 Chrome、Edge 或 Safari 再试。";
}

function App() {
  const [passkeySupport, setPasskeySupport] =
    useState<PasskeySupport>("checking");
  const [passkeyMessage, setPasskeyMessage] = useState(
    "打开页面后会自动检测 Passkey 支持情况。",
  );
  const [wasmStatus, setWasmStatus] = useState<WasmStatus>("loading");
  const [wasmMessage, setWasmMessage] = useState(
    "正在加载 Token Core WASM 模块。",
  );

  useEffect(() => {
    let cancelled = false;

    async function checkPasskeySupport() {
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
            "Token Core WASM 已初始化。当前步骤只验证加载能力，不创建钱包、不签名。",
          );
        }
      } catch (error) {
        if (!cancelled) {
          setWasmStatus("failed");
          setWasmMessage(
            error instanceof Error
              ? `Token Core WASM 初始化失败：${error.message}`
              : "Token Core WASM 初始化失败，请检查浏览器控制台。",
          );
        }
      }
    }

    void initializeTokenCore();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleCreatePasskeyPreview() {
    if (passkeySupport !== "supported") {
      setPasskeyMessage(getPasskeySupportMessage("unsupported"));
      return;
    }

    setPasskeyMessage(
      "检测通过。这一步只展示创建入口，真实 Passkey 创建会在后续步骤接入。",
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
          <button className="nav-item danger" type="button">
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
              第 4 步正在验证 Token Core WASM 初始化。现在还没有创建钱包、
              地址生成、签名或测试网广播。
            </p>
          </div>
          <button
            className="primary-button"
            onClick={handleCreatePasskeyPreview}
            type="button"
          >
            Create Passkey
          </button>
        </header>

        <section className="content-grid" aria-label="钱包概览">
          <article className="panel balance-panel">
            <div className="panel-label">Total Portfolio Value</div>
            <div className="balance">$0.00</div>
            <p className="muted-text">
              空资产状态正常。后续步骤会接入测试网地址和余额。
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

          <article className="panel passkey-panel">
            <div className="panel-header">
              <h2>Create Passkey</h2>
              <span className={`pill ${passkeySupport}`}>
                {passkeySupport === "checking"
                  ? "Checking"
                  : passkeySupport === "supported"
                    ? "Supported"
                    : "Unsupported"}
              </span>
            </div>
            <div className="passkey-visual" aria-hidden="true">
              <span>⌁</span>
            </div>
            <p className="muted-text">
              Passkey 会用系统生物识别或设备密码来保护钱包。当前步骤只做入口和支持检测，不创建钱包、不生成地址。
            </p>
            <div
              className={`support-message ${passkeySupport}`}
              role="status"
            >
              {passkeyMessage}
            </div>
            <button
              className="secondary-button"
              disabled={passkeySupport !== "supported"}
              onClick={handleCreatePasskeyPreview}
              type="button"
            >
              Check and Continue
            </button>
          </article>

          <article className="panel">
            <div className="panel-header">
              <h2>Token Core WASM</h2>
              <span className={`pill ${wasmStatus}`}>
                {wasmStatus === "loading"
                  ? "Loading"
                  : wasmStatus === "ready"
                    ? "Ready"
                    : "Failed"}
              </span>
            </div>
            <div className="wasm-meter" aria-hidden="true">
              <span />
            </div>
            <p className="muted-text">
              Token Core WASM 会在后续步骤中负责 Ethereum、BSC、Bitcoin 和 TRON
              的地址派生与签名。
            </p>
            <div className={`support-message ${wasmStatus}`} role="status">
              {wasmMessage}
            </div>
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
                  <span className="network-badge">Not connected</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <h2>Deposit Funds</h2>
              <span className="pill">预览</span>
            </div>
            <div className="qr-placeholder" aria-hidden="true">
              QR
            </div>
            <p className="muted-text">
              后续会在这里显示当前网络的收款二维码和复制地址。
            </p>
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
