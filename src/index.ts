import { RitualAgent } from './agent.js';
import { RitualWallet } from './ritual/wallet.js';
import { createClients, getNativeBalance } from './ritual/chain.js';
import { formatEther } from 'viem';
import type { Env, ChatRequest } from './types.js';

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    console.log(`[Ritual Agent] Cron triggered at ${new Date().toISOString()}`);
    ctx.waitUntil(runMonitorCycle(env));
  },

  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'online',
        agent: 'ritual-agent',
        model: env.GLM_MODEL || '@cf/zai-org/glm-5.2',
        chain: 'ritual-1979',
        endpoints: ['/', '/health', '/status', '/chat', '/monitor', '/stats', '/run'],
        timestamp: new Date().toISOString(),
      }, null, 2), { headers: corsHeaders });
    }

    if (url.pathname === '/status') {
      try {
        const clients = createClients(env.PRIVATE_KEY, env.RITUAL_RPC_URL);
        const [nativeBalance, walletBalance, blockNumber, gasPrice] = await Promise.all([
          getNativeBalance(clients),
          new RitualWallet(clients).balanceOf(),
          clients.publicClient.getBlockNumber(),
          clients.publicClient.getGasPrice(),
        ]);
        return new Response(JSON.stringify({
          address: clients.account.address,
          nativeBalance: formatEther(nativeBalance),
          ritualWalletBalance: formatEther(walletBalance),
          blockNumber: Number(blockNumber),
          gasPrice: formatEther(gasPrice),
          chainId: 1979,
          timestamp: new Date().toISOString(),
        }, null, 2), { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500, headers: corsHeaders,
        });
      }
    }

    if (url.pathname === '/chat' && request.method === 'POST') {
      try {
        const body = await request.json() as ChatRequest;
        if (!body.message) {
          return new Response(JSON.stringify({ error: 'Missing "message" field' }), {
            status: 400, headers: corsHeaders,
          });
        }
        const agent = new RitualAgent(env);
        const response = await agent.chat(body.message, body.history);
        return new Response(JSON.stringify(response, null, 2), { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({
          error: String(err),
          timestamp: new Date().toISOString(),
        }), { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === '/monitor' && request.method === 'POST') {
      try {
        const agent = new RitualAgent(env);
        const { snapshot, alerts, summary } = await agent.runMonitorCycle();
        return new Response(JSON.stringify({
          snapshot,
          alerts,
          stats: agent.getStats(),
          summary,
          timestamp: new Date().toISOString(),
        }, null, 2), { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500, headers: corsHeaders,
        });
      }
    }

    if (url.pathname === '/stats') {
      try {
        const agent = new RitualAgent(env);
        const stats = agent.getStats();
        return new Response(JSON.stringify({
          stats,
          timestamp: new Date().toISOString(),
        }, null, 2), { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500, headers: corsHeaders,
        });
      }
    }

    if (url.pathname === '/run' && request.method === 'POST') {
      try {
        const agent = new RitualAgent(env);
        const { action, result } = await agent.runAutonomousCycle();
        return new Response(JSON.stringify({
          action, result,
          timestamp: new Date().toISOString(),
        }, null, 2), { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500, headers: corsHeaders,
        });
      }
    }

    return new Response(JSON.stringify({
      error: 'Not found',
      availableEndpoints: ['/', '/health', '/status', '/chat', '/monitor', '/stats', '/run'],
    }), { status: 404, headers: corsHeaders });
  },
};

async function runMonitorCycle(env: Env): Promise<void> {
  try {
    const agent = new RitualAgent(env);
    const { snapshot, alerts, summary } = await agent.runMonitorCycle();
    console.log(`[Ritual Agent] Block #${snapshot.blockNumber}, ${alerts.length} alerts`);
    if (alerts.length > 0) {
      for (const alert of alerts) {
        console.log(`[ALERT] ${alert.type}: ${alert.message}`);
      }
    }
  } catch (err) {
    console.error(`[Ritual Agent] Monitor error: ${err}`);
  }
}
