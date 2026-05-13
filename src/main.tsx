import { StrictMode } from "react";
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

function App() {
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
              第 2 步完成基础钱包布局。现在还没有接入 Passkey、Token Core WASM、
              地址生成或测试网广播。
            </p>
          </div>
          <button className="primary-button" type="button">
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
