import 'dotenv/config';
import { RitualAgent } from '../agent.js';
import { formatEther } from 'viem';
import { createClients, getNativeBalance } from '../ritual/chain.js';
import { RitualWallet } from '../ritual/wallet.js';
import type { ChatRequest } from '../types.js';
import type { IncomingMessage, ServerResponse } from 'http';
import http from 'http';

const MONITOR_INTERVAL_MS = 2 * 60 * 1000;
const PORT = parseInt(process.env.PORT || '3000', 10);

async function main(): Promise<void> {
  const privateKey = process.env.PRIVATE_KEY || process.env.private_key;
  if (!privateKey) {
    console.error('FATAL: PRIVATE_KEY not set in environment');
    process.exit(1);
  }

  const env = {
    PRIVATE_KEY: privateKey,
    RITUAL_RPC_URL: process.env.RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org',
    RITUAL_CHAIN_ID: process.env.RITUAL_CHAIN_ID || '1979',
    GLM_MODEL: process.env.GLM_MODEL || '@cf/zai-org/glm-5.2',
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || process.env.cloud_flare_account_id || '',
    CLOUDFLARE_API_KEY: process.env.CLOUDFLARE_API_KEY || process.env.cloud_flare_api_key || '',
    TINYFISH_API_KEY: process.env.TINYFISH_API_KEY || process.env.tiny_fish_api_key || '',
    FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY || process.env.fire_claw_api_key || '',
    SOVEREIGN_FACTORY: '0x9dC4C054e53bCc4Ce0A0Ff09E890A7a8e817f304' as const,
    RITUAL_WALLET: '0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948' as const,
  };

  const agent = new RitualAgent(env);

  console.log('═══════════════════════════════════════════');
  console.log('  Ritual Agent — VPS Runner');
  console.log('  24/7 Chain Monitor + Chat + Search');
  console.log('═══════════════════════════════════════════');
  console.log(`  Wallet:   ${agent.getWalletAddress()}`);
  console.log(`  Chain:    Ritual (1979)`);
  console.log(`  Model:    ${env.GLM_MODEL}`);
  console.log(`  Search:   ${env.TINYFISH_API_KEY ? 'TinyFish OK' : 'TinyFish OFF'} | ${env.FIRECRAWL_API_KEY ? 'FireCrawl OK' : 'FireCrawl OFF'}`);
  console.log(`  Monitor:  every ${MONITOR_INTERVAL_MS / 1000}s`);
  console.log(`  Chat:     http://localhost:${PORT}/chat`);
  console.log('═══════════════════════════════════════════');
  console.log('');

  async function monitorCycle(): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] Monitor cycle starting...`);

    try {
      const { snapshot, alerts, summary } = await agent.runMonitorCycle();
      console.log(summary);

      if (alerts.length > 0) {
        console.log(`\n*** ${alerts.length} ALERTS ***`);
        for (const alert of alerts) {
          console.log(`  [${alert.type.toUpperCase()}] ${alert.message}`);
        }
      }
    } catch (err) {
      console.error(`  [ERROR] ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const clients = createClients(env.PRIVATE_KEY, env.RITUAL_RPC_URL);
  const wallet = new RitualWallet(clients);

  async function getHealthStatus() {
    const [nativeBalance, walletBalance, blockNumber, gasPrice] = await Promise.all([
      getNativeBalance(clients),
      wallet.balanceOf(),
      clients.publicClient.getBlockNumber(),
      clients.publicClient.getGasPrice(),
    ]);
    return {
      status: 'online',
      address: clients.account.address,
      nativeBalance: formatEther(nativeBalance),
      ritualWalletBalance: formatEther(walletBalance),
      blockNumber: Number(blockNumber),
      gasPrice: formatEther(gasPrice),
      chainId: 1979,
      model: env.GLM_MODEL,
      monitorInterval: `${MONITOR_INTERVAL_MS / 1000}s`,
      endpoints: ['/', '/health', '/status', '/chat', '/monitor', '/stats'],
      timestamp: new Date().toISOString(),
    };
  }

  function sendJson(res: ServerResponse, data: unknown, status = 200): void {
    const body = JSON.stringify(data, null, 2);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(body);
  }

  async function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => resolve(data));
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      try {
        const health = await getHealthStatus();
        sendJson(res, health);
      } catch (err) {
        sendJson(res, { status: 'error', error: String(err) }, 500);
      }
      return;
    }

    if (url.pathname === '/status') {
      try {
        const health = await getHealthStatus();
        sendJson(res, health);
      } catch (err) {
        sendJson(res, { error: String(err) }, 500);
      }
      return;
    }

    if (url.pathname === '/chat' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        const chatReq = JSON.parse(body) as ChatRequest;
        if (!chatReq.message) {
          sendJson(res, { error: 'Missing "message" field' }, 400);
          return;
        }
        console.log(`[Chat] ${chatReq.message.slice(0, 100)}`);
        const response = await agent.chat(chatReq.message, chatReq.history);
        console.log(`[Chat] Reply sent (${response.reply.length} chars)`);
        sendJson(res, response);
      } catch (err) {
        sendJson(res, {
          error: String(err),
          timestamp: new Date().toISOString(),
        }, 500);
      }
      return;
    }

    if (url.pathname === '/monitor' && req.method === 'POST') {
      try {
        const { snapshot, alerts, summary } = await agent.runMonitorCycle();
        sendJson(res, {
          snapshot, alerts,
          stats: agent.getStats(),
          summary,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        sendJson(res, { error: String(err) }, 500);
      }
      return;
    }

    if (url.pathname === '/stats') {
      sendJson(res, {
        stats: agent.getStats(),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    sendJson(res, {
      error: 'Not found',
      availableEndpoints: ['/', '/health', '/status', '/chat', '/monitor', '/stats'],
    }, 404);
  });

  server.listen(PORT, () => {
    console.log(`\n  HTTP server listening on port ${PORT}`);
    console.log(`  Chat endpoint: POST http://localhost:${PORT}/chat`);
    console.log(`  Monitor:       POST http://localhost:${PORT}/monitor`);
    console.log(`  Stats:         GET  http://localhost:${PORT}/stats\n`);
  });

  console.log('Starting initial monitor cycle...');
  await monitorCycle();

  setInterval(monitorCycle, MONITOR_INTERVAL_MS);

  console.log(`\nAgent running 24/7. Monitor every ${MONITOR_INTERVAL_MS / 1000}s.`);
  console.log('Press Ctrl+C to stop.');

  process.on('SIGINT', () => {
    console.log('\n[Agent] Shutting down gracefully...');
    server.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[Agent] Received SIGTERM, shutting down...');
    server.close();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
