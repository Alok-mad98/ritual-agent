# AGENTS.md

## Project Overview
Autonomous AI agent on Ritual Chain (ID 1979) powered by GLM-5.2 via Cloudflare Workers AI.

## Build & Typecheck
```bash
npm run typecheck    # TypeScript type checking (no emit)
npm run build        # Compile to dist/
```

## Development Commands
```bash
npm run check-wallet     # Check wallet balances on Ritual Chain
npm run deposit 5        # Deposit 5 RITUAL into RitualWallet
npm run deploy:sovereign # Deploy a sovereign agent job
npm run dev:worker       # Local Cloudflare Worker dev
npm run dev:vps          # VPS runner (Node.js loop)
npm run deploy:worker    # Deploy to Cloudflare Workers
```

## Architecture
- **Brain**: GLM-5.2 via Cloudflare Workers AI (`@cf/zai-org/glm-5.2`)
- **Chain**: Ritual Chain (ID 1979, RPC: https://rpc.ritualfoundation.org)
- **Wallet**: viem with privateKeyToAccount from `PRIVATE_KEY` env var
- **24/7**: Cloudflare cron (every 5 min) or VPS Node.js loop

## Key Files
- `src/index.ts` — Cloudflare Worker entry (cron + HTTP routes)
- `src/agent.ts` — Agent orchestration loop (LLM decides → executes)
- `src/llm.ts` — LLM client (binding for Workers, REST API for VPS)
- `src/ritual/chain.ts` — viem client setup, transaction helpers
- `src/ritual/wallet.ts` — RitualWallet deposit/withdraw/balance
- `src/ritual/precompiles.ts` — Precompile ABI encoding/decoding
- `src/ritual/sovereign.ts` — SovereignAgentFactory integration

## Important Notes
- Ritual Chain requires EIP-1559 (type-2) transactions — never use legacy
- SovereignAgentFactory: `0x9dC4C054e53bCc4Ce0A0Ff09E890A7a8e817f304`
- RitualWallet: `0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948`
- Async precompiles return `abi.encode(bytes simmedInput, bytes actualOutput)` — unwrap to get real result
- RitualWallet fee checks use the signing EOA, not the contract address
- `configureFundAndStart` requires gas limit >= 3,000,000

## Environment Variables
All secrets are in `.env` (gitignored). See `.env.example` for template.
Never commit `.env` to the repository.
