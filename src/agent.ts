import { formatEther } from 'viem';
import { LLMClient } from './llm.js';
import { createClients, getNativeBalance, type RitualClients } from './ritual/chain.js';
import { RitualWallet } from './ritual/wallet.js';
import { SovereignAgent } from './ritual/sovereign.js';
import { ChainMonitor } from './monitor/chain.js';
import { StatsTracker } from './monitor/stats.js';
import { ExplorerScraper } from './monitor/explorer.js';
import { TinyFishClient } from './tools/tinyfish.js';
import { FireCrawlClient } from './tools/firecrawl.js';
import { ChatPaymentManager, hashQuestion } from './payment/chat-payment.js';
import { RITUAL_EXPERT_SYSTEM_PROMPT, getConfig } from './config.js';
import type {
  AgentAction, AgentState, ChatMessage, ChatResponse, ChatRequest, ChainSnapshot,
  Env, SearchResult, Alert, Address, Hex,
} from './types.js';

export class RitualAgent {
  private llm: LLMClient;
  private clients: RitualClients;
  private wallet: RitualWallet;
  private sovereign: SovereignAgent;
  private monitor: ChainMonitor;
  private stats: StatsTracker;
  private explorer: ExplorerScraper;
  private tinyfish: TinyFishClient | null;
  private firecrawl: FireCrawlClient | null;
  private kv: KVNamespace | null;
  private paymentManager: ChatPaymentManager | null;
  private state: AgentState;
  private config: ReturnType<typeof getConfig>;

  constructor(env: Partial<Env> | Record<string, string | undefined>) {
    this.config = getConfig(env as Record<string, string | undefined>);
    this.llm = new LLMClient(env as Partial<Env>);
    this.clients = createClients(this.config.privateKey, this.config.rpcUrl);
    this.wallet = new RitualWallet(this.clients);
    this.sovereign = new SovereignAgent(this.clients);
    this.monitor = new ChainMonitor(this.clients.publicClient, this.clients.account.address);
    this.stats = new StatsTracker();
    this.explorer = new ExplorerScraper();

    this.tinyfish = this.config.tinyFishApiKey
      ? new TinyFishClient(this.config.tinyFishApiKey)
      : null;
    this.firecrawl = this.config.firecrawlApiKey
      ? new FireCrawlClient(this.config.firecrawlApiKey)
      : null;

    this.kv = (env as Partial<Env>).AGENT_STATE || null;

    const paymentAddress = (env as Partial<Env>).CHAT_PAYMENT_ADDRESS;
    this.paymentManager = paymentAddress
      ? new ChatPaymentManager(this.clients, paymentAddress)
      : null;

    this.state = {
      lastRun: 0,
      runCount: 0,
      walletBalance: 0n,
      ritualWalletBalance: 0n,
      lastAction: null,
      lastResponse: null,
      errors: [],
      sovereignAgentAddress: null,
      monitor: {
        lastBlock: 0,
        lastUpdate: 0,
        totalTxSeen: 0,
        totalBlocksSeen: 0,
        alerts: [],
        snapshot: null,
      },
    };
  }

  async monitorCycle(): Promise<{
    snapshot: ChainSnapshot;
    alerts: Alert[];
    statsText: string;
  }> {
    const { snapshot, alerts } = await this.monitor.monitor();

    const latestBlock = snapshot.recentBlocks[0] || {
      number: snapshot.blockNumber,
      hash: '',
      timestamp: Math.floor(Date.now() / 1000),
      txCount: snapshot.txCount,
      miner: '',
      gasUsed: '0',
      gasLimit: '0',
    };
    this.stats.processBlock(latestBlock, snapshot.recentTransactions);
    this.stats.processEvents(snapshot.events);

    this.state.walletBalance = BigInt(Math.floor(parseFloat(snapshot.walletBalance) * 1e18));
    this.state.ritualWalletBalance = BigInt(Math.floor(parseFloat(snapshot.ritualWalletBalance) * 1e18));
    this.state.monitor.lastBlock = snapshot.blockNumber;
    this.state.monitor.lastUpdate = Date.now();
    this.state.monitor.totalBlocksSeen++;
    this.state.monitor.totalTxSeen += snapshot.txCount;
    this.state.monitor.alerts = [...alerts, ...this.state.monitor.alerts].slice(0, 100);
    this.state.monitor.snapshot = snapshot;

    const statsText = this.stats.formatStats();
    return { snapshot, alerts, statsText };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { message, history } = request;
    let paymentTxHash: string | undefined;

    // Payment verification / relayer
    if (this.paymentManager) {
      const questionHash = hashQuestion(message);

      // Direct payment: frontend already submitted payAndAsk tx
      if (request.txHash) {
        const direct = await this.paymentManager.verifyDirectPayment(
          request.txHash as Hex,
          questionHash,
        );
        if (!direct.valid) {
          throw new Error(`Payment verification failed: ${direct.error}`);
        }
        paymentTxHash = request.txHash;
      }
      // Session-key payment: backend acts as relayer
      else if (
        request.questionHash &&
        request.fee &&
        request.nonce &&
        request.payer &&
        request.sessionKey &&
        request.sessionSignature
      ) {
        const payload = {
          questionHash: request.questionHash as Hex,
          fee: BigInt(request.fee),
          nonce: BigInt(request.nonce),
          payer: request.payer as Address,
          sessionKey: request.sessionKey as Address,
          sessionSignature: request.sessionSignature as Hex,
        };

        // Off-chain signature check before spending gas
        const sigValid = await this.paymentManager.verifySessionSignature(payload);
        if (!sigValid) {
          throw new Error('Invalid session key signature');
        }

        // Check if already paid (idempotent)
        const alreadyPaid = await this.paymentManager.isQuestionPaid(payload.questionHash);
        if (!alreadyPaid) {
          const result = await this.paymentManager.submitSessionPayment(payload);
          paymentTxHash = result.txHash;
        } else {
          paymentTxHash = 'already-paid';
        }
      }
      // No payment provided
      else {
        throw new Error('Payment required: provide txHash (direct) or session-key signed payload (advanced)');
      }
    }

    const sources: { title: string; url: string }[] = [];
    let contextData = '';

    try {
      const { snapshot } = await this.monitor.monitor();
      contextData += this.monitor.formatSnapshot(snapshot);
      contextData += this.stats.formatStats();
      this.state.monitor.snapshot = snapshot;
    } catch (err) {
      contextData += `[Chain monitor error: ${err}]\n`;
    }

    try {
      const explorerData = await this.explorer.getOverview();
      if (explorerData) {
        contextData += this.explorer.formatExplorerData(explorerData);
      }
    } catch {
      // Non-critical
    }

    const lowerMsg = message.toLowerCase();
    const needsSearch = this.needsWebSearch(lowerMsg);

    if (needsSearch && (this.tinyfish || this.firecrawl)) {
      const searchQuery = `Ritual chain blockchain ${message}`;
      let searchResults: SearchResult[] = [];

      if (this.firecrawl) {
        searchResults = await this.firecrawl.search(searchQuery, 5);
      }
      if (searchResults.length === 0 && this.tinyfish) {
        searchResults = await this.tinyfish.search(searchQuery, 5);
      }

      if (searchResults.length > 0) {
        contextData += '\n=== Web Search Results ===\n';
        for (const result of searchResults.slice(0, 5)) {
          contextData += `\n[${result.title}]\n${result.url}\n${result.snippet}\n`;
          if (result.content) {
            contextData += `${result.content.slice(0, 2000)}\n`;
          }
          sources.push({ title: result.title, url: result.url });
        }
      }
    }

    const needsScrape = lowerMsg.includes('docs') || lowerMsg.includes('documentation') ||
      lowerMsg.includes('how to') || lowerMsg.includes('tutorial');
    if (needsScrape && this.firecrawl) {
      const docsResult = await this.firecrawl.scrape('https://docs.ritualfoundation.org');
      if (docsResult && docsResult.content) {
        contextData += `\n=== Ritual Docs ===\n${docsResult.content.slice(0, 5000)}\n`;
        sources.push({ title: 'Ritual Docs', url: 'https://docs.ritualfoundation.org' });
      }
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: RITUAL_EXPERT_SYSTEM_PROMPT },
      { role: 'system', content: `Current live chain data and context:\n${contextData}` },
      ...(history || []),
      { role: 'user', content: message },
    ];

    const llmResponse = await this.llm.chat(messages, {
      temperature: 0.4,
      maxTokens: 2048,
    });

    return {
      reply: llmResponse.text,
      txHash: paymentTxHash,
      sources: sources.length > 0 ? sources : undefined,
      chainData: this.state.monitor.snapshot || undefined,
      timestamp: new Date().toISOString(),
    };
  }

  private needsWebSearch(message: string): boolean {
    const searchIndicators = [
      'news', 'latest', 'update', 'what is', 'how does', 'explain',
      'tell me about', 'what happened', 'recent', 'current',
      'price', 'market', 'compare', 'vs', 'versus', 'alternative',
      'any new', 'announcement', 'roadmap', 'future', 'plan',
    ];
    return searchIndicators.some(indicator => message.includes(indicator));
  }

  async runMonitorCycle(): Promise<{ snapshot: ChainSnapshot; alerts: Alert[]; summary: string }> {
    const { snapshot, alerts, statsText } = await this.monitorCycle();

    let summary = `\n=== Monitor Cycle #${this.state.runCount + 1} ===\n`;
    summary += `Time: ${new Date().toISOString()}\n`;
    summary += `Block: #${snapshot.blockNumber}\n`;
    summary += `Gas: ${snapshot.gasPrice} RITUAL\n`;
    summary += `Wallet: ${snapshot.walletBalance} RITUAL (native) | ${snapshot.ritualWalletBalance} RITUAL (escrow)\n`;
    summary += statsText;

    if (alerts.length > 0) {
      summary += `\n=== ALERTS (${alerts.length}) ===\n`;
      for (const alert of alerts) {
        summary += `  [${alert.type.toUpperCase()}] ${alert.message}\n`;
      }
    } else {
      summary += `\nNo alerts.\n`;
    }

    const llmAnalysis = await this.llm.chat([
      { role: 'system', content: RITUAL_EXPERT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Here is the latest chain monitoring data:\n${summary}\n\nProvide a brief analysis (2-3 sentences) of the chain state. Note anything unusual or interesting.`,
      },
    ], { temperature: 0.3, maxTokens: 256 });

    summary += `\n=== AI Analysis ===\n${llmAnalysis.text}\n`;

    this.state.runCount++;
    this.state.lastRun = Date.now();

    return { snapshot, alerts, summary };
  }

  async runAutonomousCycle(): Promise<{ action: AgentAction; result: string }> {
    try {
      const { snapshot, alerts } = await this.monitorCycle();

      const stateSummary = {
        run: this.state.runCount,
        block: snapshot.blockNumber,
        nativeBalance: snapshot.walletBalance,
        ritualWalletBalance: snapshot.ritualWalletBalance,
        gasPrice: snapshot.gasPrice,
        alerts: alerts.length,
        stats: this.stats.toJSON(),
        sovereignDeployed: this.state.sovereignAgentAddress,
      };

      const messages: ChatMessage[] = [
        { role: 'system', content: RITUAL_EXPERT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Current state: ${JSON.stringify(stateSummary, null, 2)}\n\nWhat action should you take this cycle? Respond with JSON matching the AgentAction type.`,
        },
      ];

      const llmResponse = await this.llm.chat(messages, {
        temperature: 0.4,
        maxTokens: 512,
      });

      const action = this.parseAction(llmResponse.text);
      this.state.lastAction = action;

      const result = await this.executeAction(action);
      this.state.lastResponse = result;

      return { action, result };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.state.errors.push(errorMsg);
      return {
        action: { type: 'noop', reason: `Error: ${errorMsg}` },
        result: `Error: ${errorMsg}`,
      };
    }
  }

  private parseAction(text: string): AgentAction {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { type: 'noop', reason: 'No JSON in LLM response' };
      return JSON.parse(jsonMatch[0]) as AgentAction;
    } catch {
      return { type: 'noop', reason: `Failed to parse: ${text.slice(0, 200)}` };
    }
  }

  private async executeAction(action: AgentAction): Promise<string> {
    switch (action.type) {
      case 'search_web': {
        if (!this.tinyfish && !this.firecrawl) return 'No search tools available';
        const query = action.query || 'Ritual chain';
        let results: SearchResult[] = [];
        if (this.firecrawl) results = await this.firecrawl.search(query, 5);
        if (results.length === 0 && this.tinyfish) results = await this.tinyfish.search(query, 5);
        return `Found ${results.length} results:\n${results.map(r => `- ${r.title}: ${r.url}`).join('\n')}`;
      }

      case 'scrape_url': {
        if (!this.firecrawl && !this.tinyfish) return 'No scrape tools available';
        const url = action.url || '';
        if (this.firecrawl) {
          const result = await this.firecrawl.scrape(url);
          if (result) return `Scraped ${url}: ${result.content.slice(0, 500)}`;
        }
        if (this.tinyfish) {
          const result = await this.tinyfish.fetch(url);
          if (result) return `Fetched ${url}: ${result.content.slice(0, 500)}`;
        }
        return `Failed to scrape ${url}`;
      }

      case 'check_chain': {
        const { snapshot, statsText } = await this.monitorCycle();
        return this.monitor.formatSnapshot(snapshot) + statsText;
      }

      case 'check_explorer': {
        const data = await this.explorer.getOverview();
        if (data) return this.explorer.formatExplorerData(data);
        return 'Failed to fetch explorer data';
      }

      case 'check_balance': {
        const addr = action.address as `0x${string}` | undefined;
        const [native, ritual] = await Promise.all([
          getNativeBalance(this.clients, addr),
          this.wallet.balanceOf(addr),
        ]);
        return `Balance: ${formatEther(native)} RITUAL (native), ${formatEther(ritual)} RITUAL (wallet)`;
      }

      case 'deposit_wallet': {
        const amount = BigInt(action.amount || '0');
        const lockBlocks = BigInt(action.lockBlocks || '100000');
        const hash = await this.wallet.deposit(amount, lockBlocks);
        return `Deposited ${formatEther(amount)} RITUAL. TX: ${hash}`;
      }

      case 'withdraw_wallet': {
        const amount = BigInt(action.amount || '0');
        const hash = await this.wallet.withdraw(amount);
        return `Withdrew ${formatEther(amount)} RITUAL. TX: ${hash}`;
      }

      case 'deploy_sovereign': {
        const executor = await this.sovereign.getExecutor();
        const userSalt = SovereignAgent.generateSalt(`agent-${Date.now()}`);
        const { harness } = await this.sovereign.predictHarness(userSalt);
        const params = this.sovereign.buildSovereignParams({
          prompt: action.prompt || 'Monitor Ritual Chain',
          model: action.model || 'zai-org/GLM-4.7-FP8',
          maxTurns: action.maxTurns || 10,
          maxTokens: 4096,
          executor,
          rpcUrls: this.config.rpcUrl,
        }, harness);
        const { hash } = await this.sovereign.submitSovereignJob(params);
        this.state.sovereignAgentAddress = harness;
        return `Sovereign agent job submitted. Harness: ${harness}, TX: ${hash}`;
      }

      case 'noop':
        return `No-op: ${action.reason || 'no action needed'}`;

      default:
        return `Unknown action: ${(action as { type: string }).type}`;
    }
  }

  getState(): AgentState {
    return { ...this.state };
  }

  getStats(): ReturnType<StatsTracker['toJSON']> {
    return this.stats.toJSON();
  }

  getWalletAddress(): `0x${string}` {
    return this.clients.account.address;
  }

  getSnapshot(): ChainSnapshot | null {
    return this.state.monitor.snapshot;
  }

  async loadState(): Promise<void> {
    if (!this.kv) return;
    try {
      const stored = await this.kv.get('agent-state');
      if (!stored) return;
      const parsed = JSON.parse(stored) as {
        state?: Partial<AgentState>;
        stats?: Record<string, unknown>;
      };

      if (parsed.state) {
        this.state = {
          ...this.state,
          ...parsed.state,
          walletBalance: typeof parsed.state.walletBalance === 'string'
            ? BigInt(parsed.state.walletBalance)
            : this.state.walletBalance,
          ritualWalletBalance: typeof parsed.state.ritualWalletBalance === 'string'
            ? BigInt(parsed.state.ritualWalletBalance)
            : this.state.ritualWalletBalance,
        };
      }

      if (parsed.stats) {
        this.stats.importSnapshot(parsed.stats);
      }
    } catch (err) {
      console.error('[Agent] Failed to load state from KV:', err);
    }
  }

  async saveState(): Promise<void> {
    if (!this.kv) return;
    try {
      const payload = {
        state: {
          ...this.state,
          walletBalance: this.state.walletBalance.toString(),
          ritualWalletBalance: this.state.ritualWalletBalance.toString(),
        },
        stats: this.stats.exportSnapshot(),
      };
      await this.kv.put('agent-state', JSON.stringify(payload));
    } catch (err) {
      console.error('[Agent] Failed to save state to KV:', err);
    }
  }
}
