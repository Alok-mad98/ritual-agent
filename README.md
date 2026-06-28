# Ritual Agent

Autonomous AI agent on Ritual Chain powered by GLM-5.2 via Cloudflare Workers AI.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Agent Brain                        │
│   GLM-5.2 via Cloudflare Workers AI                  │
│   (OpenAI-compatible API / AI binding)               │
└──────────────────────┬──────────────────────────────┘
                       │ decides actions
┌──────────────────────▼──────────────────────────────┐
│              Agent Orchestration Loop                 │
│   Reads chain state → LLM decides → executes         │
└──────────────────────┬──────────────────────────────┘
                       │ executes on-chain
┌──────────────────────▼──────────────────────────────┐
│                 Ritual Chain (1979)                   │
│   ┌────────────┐ ┌──────────┐ ┌────────────────┐    │
│   │ HTTP 0x0801│ │ LLM 0x802│ │ Sovereign 0x80C│    │
│   └────────────┘ └──────────┘ └────────────────┘    │
│   ┌────────────┐ ┌──────────┐ ┌────────────────┐    │
│   │ Wallet     │ │Scheduler │ │  TEE Registry  │    │
│   └────────────┘ └──────────┘ └────────────────┘    │
└─────────────────────────────────────────────────────┘
```

## Features

- **GLM-5.2 Brain**: Uses Cloudflare Workers AI (`@cf/zai-org/glm-5.2`) for decision-making
- **Ritual Precompiles**: HTTP (0x0801), LLM (0x0802), Sovereign Agent (0x080C)
- **RitualWallet**: Deposit, withdraw, and monitor fee balances
- **Sovereign Agent**: Deploy and manage sovereign agent jobs via SovereignAgentFactory
- **24/7 Operation**: Cloudflare Workers cron (every 5 min) or VPS Node.js loop
- **Dual Deployment**: Run on Cloudflare Workers or any VPS with Node.js

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required environment variables:
- `PRIVATE_KEY` — Funded wallet private key on Ritual Chain
- `CLOUDFLARE_ACCOUNT_ID` — Your Cloudflare account ID
- `CLOUDFLARE_API_KEY` — Cloudflare API token with Workers AI access

### 3. Check Wallet Status

```bash
npm run check-wallet
```

### 4. Deposit RITUAL into RitualWallet

```bash
npm run deposit 5    # deposits 5 RITUAL, locked for 100,000 blocks
```

### 5. Deploy a Sovereign Agent

```bash
npm run deploy:sovereign
```

## Deployment Options

### Option A: Cloudflare Workers (Recommended)

```bash
# Set secrets
npx wrangler secret put PRIVATE_KEY
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
npx wrangler secret put CLOUDFLARE_API_KEY

# Deploy
npm run deploy:worker
```

The Worker runs on a cron schedule (every 5 minutes) and also exposes:
- `GET /` — Health check
- `GET /status` — Wallet and chain status
- `POST /run` — Trigger an agent cycle manually

### Option B: VPS (Node.js)

```bash
# Install tsx globally if needed
npm install -g tsx

# Run the agent loop
npm run dev:vps
```

For 24/7 VPS operation, use a process manager:

```bash
# PM2
pm2 start "npx tsx src/vps/runner.ts" --name ritual-agent
pm2 save
pm2 startup
```

## Ritual Chain Reference

| Property | Value |
|----------|-------|
| Chain ID | 1979 |
| RPC | `https://rpc.ritualfoundation.org` |
| Explorer | `https://explorer.ritualfoundation.org` |
| Faucet | `https://faucet.ritualfoundation.org` |
| Currency | RITUAL (18 decimals) |

### System Contracts

| Contract | Address |
|----------|---------|
| RitualWallet | `0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948` |
| SovereignAgentFactory | `0x9dC4C054e53bCc4Ce0A0Ff09E890A7a8e817f304` |
| PersistentAgentFactory | `0xD4AA9D55215dc8149Af57605e70921Ea16b73591` |
| TEEServiceRegistry | `0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F` |
| Scheduler | `0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B` |
| AsyncDelivery | `0x5A16214fF555848411544b005f7Ac063742f39F6` |

### Precompile Addresses

| Precompile | Address |
|------------|---------|
| HTTP Call | `0x0801` |
| LLM Call | `0x0802` |
| Sovereign Agent | `0x080C` |
| Persistent Agent | `0x0820` |

## Project Structure

```
ritual-agent/
├── src/
│   ├── index.ts              # Cloudflare Worker entry (cron + HTTP)
│   ├── agent.ts              # Agent orchestration loop
│   ├── llm.ts                # GLM-5.2 LLM client
│   ├── config.ts             # Chain config, constants, system prompt
│   ├── types.ts              # TypeScript types & contract addresses
│   ├── ritual/
│   │   ├── chain.ts          # viem clients, transactions
│   │   ├── wallet.ts         # RitualWallet integration
│   │   ├── precompiles.ts    # Precompile ABI encoding/decoding
│   │   └── sovereign.ts      # SovereignAgentFactory integration
│   └── vps/
│       └── runner.ts         # VPS Node.js runner
├── contracts/
│   └── SovereignAgentConsumer.sol  # Solidity consumer contract
├── scripts/
│   ├── deploy-sovereign.ts   # Deploy sovereign agent
│   ├── check-wallet.ts       # Check wallet balances
│   └── deposit.ts            # Deposit to RitualWallet
├── skills/                   # ritual-dapp-skills (gitignored)
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── wrangler.jsonc
```

## Agent Actions

The agent's LLM brain decides from these actions each cycle:

| Action | Description |
|--------|-------------|
| `http_call` | HTTP request via Ritual precompile |
| `llm_call` | On-chain LLM call via Ritual precompile |
| `onchain_tx` | Raw on-chain transaction |
| `deposit_wallet` | Deposit RITUAL into RitualWallet |
| `withdraw_wallet` | Withdraw RITUAL from RitualWallet |
| `deploy_sovereign` | Launch a sovereign agent job |
| `check_balance` | Check native and wallet balances |
| `noop` | Do nothing this cycle |

## Security

- Private keys are read from environment variables, never hardcoded
- `.env` is gitignored — no credentials in the repo
- Cloudflare Workers uses secrets for sensitive values
- All transactions use EIP-1559 (type-2) as required by Ritual Chain

## Resources

- [Ritual Docs](http://docs.ritualfoundation.org/)
- [Ritual Skills](https://skills.ritualfoundation.org/)
- [Ritual dApp Skills Repo](https://github.com/ritual-foundation/ritual-dapp-skills)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Reference Deployment](https://github.com/zunmax/ritual-agent-deployment)

## License

MIT
