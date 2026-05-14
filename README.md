# MyWallet

一个个人自用的 PC 网页钱包 Demo，用来验证 **Passkey + imToken Token Core WASM + 多链地址展示** 的产品想法。

- 在线预览：https://makoshan.github.io/MyWallet/
- 源码仓库：https://github.com/makoshan/MyWallet

> 这是学习和验证用 Demo，不是正式钱包产品。请不要直接存入大额真实资产。

## 这个 Demo 做什么

MyWallet 的目标是让用户通过 Passkey 创建和解锁钱包，日常使用时不需要一直面对助记词。

当前 Demo 重点验证这些能力：

- 使用 Passkey 创建 / 解锁本地钱包。
- 基于 imToken Token Core WASM 创建加密 keystore。
- 展示多条主网地址：
  - Ethereum
  - BSC
  - Bitcoin
  - Solana
  - TRON
- 在 Receive 页面按链展示收款地址和二维码。
- 在 Dashboard 显示原生币余额入口，余额默认安全显示为 0。
- 在 Settings 页面提供助记词导出入口。
- 导出助记词前必须再次使用 Passkey 解锁，并展示安全提醒。

## 当前不是正式产品

这个项目还没有达到生产钱包标准，使用时请注意：

- 不要存入大额资产。
- 不要把助记词、私钥、正式 API Key 写进代码、截图、日志或 GitHub。
- 不要把助记词上传服务器。
- 前端 `VITE_*` 环境变量会进入浏览器构建产物，不能放高权限密钥。
- 如果后续加入签名和广播，必须先展示人能看懂的交易摘要，并要求用户二次确认。

## 技术栈

- React
- TypeScript
- Vite
- imToken Token Core WASM：`@consenlabs/tcx-wasm`
- Passkey / WebAuthn PRF
- Solana 地址扩展：
  - `@solana/web3.js`
  - `bip39`
  - `ed25519-hd-key`
- QRCode：生成收款二维码
- Vitest：基础测试
- GitHub Pages：静态部署

## 多链说明

| 链 | 当前处理方式 |
| --- | --- |
| Ethereum | Token Core WASM 派生地址 |
| BSC | 复用 EVM 地址 |
| Bitcoin | Token Core WASM 派生地址 |
| TRON | Token Core WASM 派生地址 |
| Solana | Token Core WASM 当前不直接支持，本 Demo 用 Solana 专用库从助记词临时派生地址 |

Solana 派生只在内存中临时使用助记词，不应该保存明文助记词或 Solana 私钥。

## 本地运行

先安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

浏览器打开终端显示的本地地址，通常是：

```text
http://localhost:5173/
```

## 环境变量

复制示例文件：

```bash
cp .env.example .env.local
```

可配置的变量：

```bash
VITE_ALCHEMY_API_KEY=your-alchemy-api-key

# 可选：只在需要覆盖某条链 RPC 时配置
# VITE_ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your-alchemy-api-key
# VITE_BSC_RPC_URL=https://bnb-mainnet.g.alchemy.com/v2/your-alchemy-api-key
# VITE_SOLANA_RPC_URL=https://solana-mainnet.g.alchemy.com/v2/your-alchemy-api-key
# VITE_TRON_RPC_URL=https://tron-mainnet.g.alchemy.com/v2/your-alchemy-api-key
```

注意：

- `.env.local` 已加入 `.gitignore`，不要提交。
- 前端环境变量会暴露给浏览器，不要放助记词、私钥或高权限 API Key。
- 如果只是体验页面，可以先使用默认公共 RPC。

## 常用命令

```bash
# 本地开发
npm run dev

# 类型检查
npm run typecheck

# 运行测试
npm test

# 生产构建
npm run build

# 本地预览构建产物
npm run preview
```

## 页面说明

| 页面 | 说明 |
| --- | --- |
| `/` | Dashboard，展示钱包状态、余额概览和快捷入口 |
| `/receive` | Receive 页面，下拉选择链，展示地址和二维码 |
| `/settings` | Settings 页面，导出助记词前要求 Passkey 解锁 |

GitHub Pages 使用静态站点部署，构建时会生成 `404.html` 和 `/receive/index.html`，避免刷新子路由时空白。

## 部署到 GitHub Pages

项目已经支持 GitHub Pages 静态部署。

基本流程：

1. 推送代码到 GitHub。
2. 在 GitHub 仓库设置里开启 Pages。
3. 使用 GitHub Actions 或手动构建 `dist/`。
4. 访问：

```text
https://makoshan.github.io/MyWallet/
```

如果你 fork 了这个项目，需要确认 `vite.config.ts` 里的 `base` 是否匹配你的仓库名。

## 安全检查清单

提交或部署前请检查：

- 没有提交 `.env.local`。
- 没有提交助记词、私钥、Passkey PRF key。
- 控制台没有打印助记词或私钥。
- 截图和文档里没有真实助记词。
- 导出助记词前有明确安全提醒。
- 公开网页中没有正式高权限 API Key。

## 后续计划

可以继续逐步完善：

- 接入更稳定的余额查询服务。
- 增加每条链的 explorer 链接。
- 增加转账 Review 页面。
- 增加签名前交易摘要。
- 增加测试网优先的转账广播实验。
- 设计加密备份方案，但服务器永远不能拿到明文助记词。

## 参考资料

- imToken Token Core WASM：https://github.com/consenlabs/token-core-monorepo/tree/tenth-anniversary/token-core/tcx-wasm
- imToken token-ui：https://github.com/consenlabs/token-ui
- Solana Web3.js：https://github.com/solana-labs/solana-web3.js
