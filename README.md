# Ritual Agent

Autonomous AI agent on Ritual Chain powered by GLM-5.2 via Cloudflare Workers AI.

This repo is the **backend**. Run it 24/7 on a VPS and connect any frontend to its HTTP API.

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                   │
│   (Your Next.js / React / Vue / mobile app — you build this)            │
│                          calls HTTP API                                 │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────────┐
│                         RITUAL AGENT BACKEND                            │
│  ┌───────────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │
│  │   HTTP API Server     │  │   Chain Monitor  │  │  Stats Tracker  │  │
│  │   /chat /monitor      │  │   (live blocks,  │  │  (highest tx,   │  │
│  │   /status /stats      │  │   txs, events)   │  │   gas, blocks)  │  │
│  └───────────────────────┘  └──────────────────┘  └─────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │     Agent Brain — GLM-5.2 via Cloudflare Workers AI             │   │
│  │     Answers questions about Ritual using chain data + web search │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │
┌──────────────────────────────▼────────────────────────────────────────┐
│                          Ritual Chain (1979)                           │
│  ┌────────────┐ ┌──────────┐ ┌────────────────┐ ┌──────────────────┐   │
│  │ HTTP 0x801 │ │ LLM 0x802│ │ Sovereign 0x80C│ │ RitualWallet     │   │
│  └────────────┘ └──────────┘ └────────────────┘ └──────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

## Features

- **GLM-5.2 Brain**: Uses Cloudflare Workers AI (`@cf/zai-org/glm-5.2`) for decision-making and chat answers
- **Chain Monitor**: Constantly watches blocks, transactions, gas, events
- **Statistics Tracker**: Highest-value tx, highest-gas tx, largest block, success rate, total value transferred
- **Explorer Integration**: Fetches data from `https://explorer.ritualfoundation.org`
- **Web Search**: TinyFish + FireCrawl for answering questions with real-time web data
- **Chat API**: Any user can ask anything about Ritual and get an answer
- **RitualWallet**: Deposit, withdraw, and monitor fee balances
- **Sovereign Agent**: Deploy and manage sovereign agent jobs via SovereignAgentFactory
- **24/7 Operation**: Run permanently on a VPS (or optional Cloudflare Workers cron)

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/Alok-mad98/ritual-agent.git
cd ritual-agent
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
nano .env    # edit with your credentials
```

Required variables:
- `PRIVATE_KEY` — Funded wallet private key on Ritual Chain
- `CLOUDFLARE_ACCOUNT_ID` — Your Cloudflare account ID
- `CLOUDFLARE_API_KEY` — Cloudflare API token with Workers AI access
- `TINYFISH_API_KEY` — TinyFish web search API key
- `FIRECRAWL_API_KEY` — FireCrawl web scraping API key

### 3. Verify Build

```bash
npm run typecheck
npm run build
```

### 4. Check Wallet

```bash
npm run check-wallet
```

### 5. Deploy to Cloudflare Workers (Recommended)

```bash
npm run setup:secrets   # uploads secrets from .env to Cloudflare
npm run deploy:worker   # deploys the backend to Cloudflare's edge
```

Wrangler will output a URL like:
```
https://ritual-agent.<your-subdomain>.workers.dev
```

Test it:
```bash
curl https://ritual-agent.<your-subdomain>.workers.dev/health
```

Your frontend calls:
```
https://ritual-agent.<your-subdomain>.workers.dev/chat
```

No VPS needed. The cron monitor runs automatically every 5 minutes.

---

### 6. Or Deploy to VPS + Cloudflare Tunnel

If you prefer owning the server, follow the full VPS guide below.

---

## VPS Deployment Guide — Run 24/7

These steps deploy the backend to any Linux VPS (Ubuntu 22.04/24.04 recommended).

### Step 1: Provision the VPS

- Minimum: 1 vCPU, 2 GB RAM, 20 GB SSD
- Open port `3000` (or whichever `PORT` you set)
- (Optional) Open port `80/443` if you put a reverse proxy in front

### Step 2: Install Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # should be v22.x
npm -v
```

### Step 3: Create user and directories

```bash
sudo useradd -r -s /bin/false ritual || true
sudo mkdir -p /opt/ritual-agent
sudo mkdir -p /var/log/ritual-agent
sudo chown -R $USER:$USER /opt/ritual-agent
sudo chown -R ritual:ritual /var/log/ritual-agent
```

### Step 4: Copy the project

On your local machine:

```bash
git clone https://github.com/Alok-mad98/ritual-agent.git ritual-agent-backend
cd ritual-agent-backend
# create your .env file
cp .env.example .env
# edit .env with your real credentials
nano .env
```

Then upload to the VPS:

```bash
scp -r ./* root@your-vps-ip:/opt/ritual-agent/
# Don't forget .env (it is gitignored)
scp .env root@your-vps-ip:/opt/ritual-agent/
```

On the VPS:

```bash
ssh root@your-vps-ip
cd /opt/ritual-agent
npm ci
npm run build
```

### Step 5: Keep it running 24/7

Choose **one** of the following methods.

#### Method A: PM2 (recommended for beginners)

```bash
sudo npm install -g pm2
pm2 start pm2.config.json
pm2 save
pm2 startup systemd
# Run the command PM2 prints, usually:
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ritual --hp /opt/ritual-agent
pm2 save
```

Check status:
```bash
pm2 status
pm2 logs ritual-agent --lines 50
```

Restart:
```bash
pm2 restart ritual-agent
```

#### Method B: systemd service

```bash
sudo cp ritual-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ritual-agent
sudo systemctl start ritual-agent
sudo systemctl status ritual-agent
```

View logs:
```bash
sudo journalctl -u ritual-agent -f
```

#### Method C: Docker + docker compose

```bash
sudo docker compose up -d --build
sudo docker compose logs -f
```

### Step 6: Verify it's running

```bash
curl http://your-vps-ip:3000/health
```

Expected response:
```json
{
  "status": "online",
  "agent": "ritual-agent",
  "model": "@cf/zai-org/glm-5.2",
  "chain": "ritual-1979"
}
```

### Step 7: (Optional) Add HTTPS + custom domain with Nginx

Install Nginx + Certbot:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/ritual-agent`:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable:

```bash
sudo ln -s /etc/nginx/sites-available/ritual-agent /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo certbot --nginx -d api.yourdomain.com
```

Now your frontend talks to `https://api.yourdomain.com`.

---

## Cloudflare Endpoint Deployment

You have three ways to make the public endpoint go through Cloudflare:

| Option | VPS required? | Best for |
|--------|---------------|----------|
| **Cloudflare Tunnel** | Yes | You want VPS 24/7 + Cloudflare HTTPS/domain |
| **Cloudflare Workers** | No | Fully serverless, free `*.workers.dev` URL |
| **Cloudflare DNS proxy** | Yes | You already point an A record to your VPS IP |

### Recommended: VPS + Cloudflare Tunnel

This keeps your backend on the VPS (24/7) but serves the public URL through Cloudflare. You get HTTPS, custom domain, DDoS protection, and don't need to open inbound ports on the VPS.

#### 1. Install cloudflared on the VPS

```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
cloudflared --version
```

#### 2. Authenticate

```bash
cloudflared tunnel login
```

Select the domain you want (e.g., `yourdomain.com`). It downloads a cert to `~/.cloudflared/cert.pem`.

#### 3. Create the tunnel

```bash
cloudflared tunnel create ritual-agent
```

Copy the tunnel ID (UUID) from the output.

#### 4. Create DNS route

```bash
cloudflared tunnel route dns ritual-agent api.yourdomain.com
```

#### 5. Configure the tunnel

Create `/root/.cloudflared/config.yml` (use the tunnel ID you copied):

```yaml
tunnel: <your-tunnel-id>
credentials-file: /root/.cloudflared/<your-tunnel-id>.json

ingress:
  - hostname: api.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

The repo includes `cloudflared-config.yml` and `cloudflared.service` you can copy.

#### 6. Run cloudflared as a systemd service

```bash
sudo mkdir -p /var/log/cloudflared
sudo cp cloudflared.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
sudo systemctl status cloudflared
```

#### 7. Test

```bash
curl https://api.yourdomain.com/health
```

Your frontend now calls:
- `https://api.yourdomain.com/chat`
- `https://api.yourdomain.com/status`
- `https://api.yourdomain.com/monitor`

### Option: Cloudflare DNS Proxy (no tunnel)

If you already have a domain in Cloudflare:
1. Add an A record: `api.yourdomain.com` → your VPS public IP
2. Set the record to **Proxied** (orange cloud)
3. Install Nginx + Certbot on the VPS (see VPS guide Step 7)
4. Your endpoint becomes `https://api.yourdomain.com` with Cloudflare as reverse proxy

### Option: Cloudflare Workers (serverless, recommended if you have paid Workers AI)

The whole backend runs on Cloudflare's edge network. No VPS needed. It runs the cron monitor every 5 minutes and exposes all HTTP endpoints.

#### 1. Upload secrets from `.env`

```bash
npm run setup:secrets
```

This reads your `.env` and uploads the required secrets to Cloudflare Workers.

#### 2. (Optional but recommended) Create a KV namespace for persistent state

With a paid plan, stats and monitor progress can persist across Worker restarts:

```bash
npx wrangler kv namespace create "AGENT_STATE"
```

Copy the namespace ID, then edit `wrangler.jsonc` and uncomment the `kv_namespaces` section:

```jsonc
"kv_namespaces": [
  {
    "binding": "AGENT_STATE",
    "id": "your-kv-namespace-id"
  }
]
```

#### 3. Deploy

```bash
npm run deploy:worker
```

Wrangler will output a URL like:
```
https://ritual-agent.<your-subdomain>.workers.dev
```

Test it:
```bash
curl https://ritual-agent.<your-subdomain>.workers.dev/health
```

Your frontend calls:
```
https://ritual-agent.<your-subdomain>.workers.dev/chat
https://ritual-agent.<your-subdomain>.workers.dev/status
https://ritual-agent.<your-subdomain>.workers.dev/stats
```

#### 4. (Optional) Add a custom domain

In the Cloudflare dashboard:
1. Go to Workers & Pages → your Worker
2. Triggers → Custom Domains
3. Add `api.yourdomain.com`
4. Your frontend now calls `https://api.yourdomain.com/chat`

---

## Backend HTTP API for Your Frontend

All endpoints return JSON and support CORS.

### `GET /health` or `GET /`
Basic health check.

```bash
curl http://your-vps-ip:3000/health
```

### `GET /status`
Wallet and chain status.

Response:
```json
{
  "status": "online",
  "address": "0x7cEcCA8e5f3596b598C3f01fB9dB1759ed676614",
  "nativeBalance": "12.54",
  "ritualWalletBalance": "5.00",
  "blockNumber": 1234567,
  "gasPrice": "0.000000001"
}
```

### `POST /chat`
Ask the agent anything about Ritual. **Payment is required** if `CHAT_PAYMENT_ADDRESS` is configured.

#### Direct payment (one tx per question from user's wallet)

Request:
```json
{
  "message": "What was the highest transaction value recently?",
  "txHash": "0x...payAndAsk transaction hash...",
  "history": []
}
```

#### Session-key payment (advanced — sign once, chat many times)

Request:
```json
{
  "message": "What was the highest transaction value recently?",
  "questionHash": "0x...keccak256(message)...",
  "fee": "1000000000000000",
  "nonce": "1",
  "payer": "0x...user wallet...",
  "sessionKey": "0x...session key address...",
  "sessionSignature": "0x...signature...",
  "history": []
}
```

Response:
```json
{
  "reply": "The highest value transaction was...",
  "txHash": "0x...session payment tx hash...",
  "sources": [{ "title": "Ritual Docs", "url": "https://docs.ritualfoundation.org" }],
  "chainData": { ... },
  "timestamp": "2026-06-28T18:30:00.000Z"
}
```

See [`FRONTEND.md`](./FRONTEND.md) for a complete **Privy + session-key + lovable.dev** integration.

### `POST /monitor`
Trigger a monitoring cycle and return chain data + alerts.

Response:
```json
{
  "snapshot": { "blockNumber": 1234567, "recentTransactions": [...], ... },
  "alerts": [
    { "type": "large_transfer", "message": "Large transfer of 150 RITUAL...", "blockNumber": 1234560 }
  ],
  "stats": { "highestValueTx": {...}, "successRate": 98.5, ... },
  "summary": "..."
}
```

### `GET /stats`
Get running statistics.

Response:
```json
{
  "stats": {
    "totalBlocksMonitored": 42,
    "totalTxsMonitored": 137,
    "successRate": 98.54,
    "highestValueTx": { ... },
    "highestGasTx": { ... },
    "largestBlock": { ... }
  }
}
```

### `POST /run`
Trigger one autonomous agent decision cycle.

---

## Frontend Integration Example

Your frontend just calls the backend API:

```typescript
// utils/api.ts
const API = process.env.NEXT_PUBLIC_AGENT_API || 'http://your-vps-ip:3000';

export async function askAgent(message: string, history?: any[]) {
  const res = await fetch(`${API}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  });
  return res.json();
}

export async function getStatus() {
  const res = await fetch(`${API}/status`);
  return res.json();
}

export async function getStats() {
  const res = await fetch(`${API}/stats`);
  return res.json();
}
```

```tsx
// components/ChatBox.tsx
'use client';
import { useState } from 'react';
import { askAgent } from '@/utils/api';

export function ChatBox() {
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = await askAgent(message);
    setReply(data.reply);
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input value={message} onChange={e => setMessage(e.target.value)} placeholder="Ask about Ritual..." />
        <button type="submit">Ask</button>
      </form>
      {reply && <p>{reply}</p>}
    </div>
  );
}
```

---

## Cloudflare Workers (Optional Alternative)

If you prefer serverless instead of VPS:

```bash
npx wrangler secret put PRIVATE_KEY
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
npx wrangler secret put CLOUDFLARE_API_KEY
npx wrangler secret put TINYFISH_API_KEY
npx wrangler secret put FIRECRAWL_API_KEY
npm run deploy:worker
```

---

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

### Project Structure

```
ritual-agent/
├── src/
│   ├── index.ts              # Cloudflare Worker entry (cron + HTTP)
│   ├── agent.ts              # Agent orchestration + chat + monitoring
│   ├── llm.ts                # GLM-5.2 client with retry logic
│   ├── config.ts             # Chain config, system prompt
│   ├── types.ts              # TypeScript types
│   ├── monitor/
│   │   ├── chain.ts          # Chain monitor
│   │   ├── explorer.ts       # Explorer scraper
│   │   └── stats.ts          # Statistics tracker
│   ├── tools/
│   │   ├── tinyfish.ts       # TinyFish search
│   │   └── firecrawl.ts      # FireCrawl scrape
│   ├── ritual/
│   │   ├── chain.ts          # viem clients
│   │   ├── wallet.ts         # RitualWallet
│   │   ├── precompiles.ts    # Precompile encoding
│   │   └── sovereign.ts      # SovereignAgentFactory
│   └── vps/
│       └── runner.ts         # VPS HTTP server
├── contracts/
│   ├── RitualChatPayment.sol       # On-chain chat payment + session keys
│   ├── SovereignAgentConsumer.sol  # Sovereign agent harness
│   └── out/
│       └── RitualChatPayment.json  # Compiled artifact
├── scripts/
│   ├── deploy-chat-payment.ts      # Deploy RitualChatPayment
│   ├── setup-secrets.ts            # Upload secrets to Cloudflare
│   ├── deploy-sovereign.ts
│   ├── check-wallet.ts
│   └── deposit.ts
├── pm2.config.json           # PM2 process config
├── ritual-agent.service      # systemd service file
├── cloudflared-config.yml    # Cloudflare Tunnel config
├── cloudflared.service       # Cloudflare Tunnel systemd service
├── Dockerfile                # Docker image
├── docker-compose.yml        # Docker Compose stack
├── FRONTEND.md               # Privy + lovable.dev integration guide
├── .env.example
├── .gitignore
└── README.md
```

## Security

- Private keys are read from `.env`, never hardcoded
- `.env` is gitignored — no credentials in the repo
- All transactions use EIP-1559 (type-2) as required by Ritual Chain
- CORS enabled for frontend access (lock down to your domain in production)

## Resources

- [Ritual Docs](http://docs.ritualfoundation.org/)
- [Ritual Explorer](https://explorer.ritualfoundation.org)
- [Ritual Skills](https://skills.ritualfoundation.org/)
- [Ritual dApp Skills Repo](https://github.com/ritual-foundation/ritual-dapp-skills)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)

## License

MIT
