import type { ChainSnapshot } from '../types.js';

const EXPLORER_BASE = 'https://explorer.ritualfoundation.org';

export interface ExplorerData {
  blockHeight: number;
  gasPrice: string;
  tps: number;
  topAccounts: { address: string; balance: string }[];
  recentBlocks: { number: number; txCount: number; timestamp: string }[];
  recentTxs: { hash: string; from: string; to: string; value: string; status: string }[];
  contracts: { name: string; address: string; verified: boolean }[];
  rawHtml?: string;
}

export class ExplorerScraper {
  private baseUrl: string;

  constructor(baseUrl: string = EXPLORER_BASE) {
    this.baseUrl = baseUrl;
  }

  async fetchPage(path: string): Promise<string> {
    try {
      const resp = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml',
          'User-Agent': 'RitualAgent/1.0',
        },
      });
      if (!resp.ok) return '';
      return await resp.text();
    } catch {
      return '';
    }
  }

  async fetchApi(endpoint: string): Promise<unknown> {
    try {
      const resp = await fetch(`${this.baseUrl}/api${endpoint}`, {
        headers: { 'Accept': 'application/json' },
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }

  async getOverview(): Promise<ExplorerData | null> {
    try {
      const [stats, blocks, txs] = await Promise.all([
        this.fetchApi('/stats') as Promise<{
          block_height?: number;
          gas_price?: string;
          tps?: number;
        } | null>,
        this.fetchApi('/blocks?limit=10') as Promise<Array<{
          number: number; tx_count: number; timestamp: string;
        }> | null>,
        this.fetchApi('/transactions?limit=10') as Promise<Array<{
          hash: string; from: string; to: string; value: string; status: string;
        }> | null>,
      ]);

      return {
        blockHeight: stats?.block_height || 0,
        gasPrice: stats?.gas_price || '0',
        tps: stats?.tps || 0,
        topAccounts: [],
        recentBlocks: (blocks || []).map(b => ({
          number: b.number,
          txCount: b.tx_count,
          timestamp: b.timestamp,
        })),
        recentTxs: (txs || []).map(t => ({
          hash: t.hash,
          from: t.from,
          to: t.to,
          value: t.value,
          status: t.status,
        })),
        contracts: this.getKnownContracts(),
      };
    } catch {
      return null;
    }
  }

  async getAddressInfo(address: string): Promise<{
    balance: string;
    nonce: number;
    code: string;
    isContract: boolean;
  } | null> {
    try {
      const data = await this.fetchApi(`/addresses/${address}`) as {
        balance?: string;
        nonce?: number;
        code?: string;
        is_contract?: boolean;
      } | null;

      if (!data) return null;
      return {
        balance: data.balance || '0',
        nonce: data.nonce || 0,
        code: data.code || '',
        isContract: data.is_contract || false,
      };
    } catch {
      return null;
    }
  }

  async getTransactionInfo(txHash: string): Promise<{
    hash: string;
    from: string;
    to: string;
    value: string;
    status: string;
    blockNumber: number;
    gasUsed: string;
    logs: unknown[];
  } | null> {
    try {
      const data = await this.fetchApi(`/transactions/${txHash}`) as {
        hash: string; from: string; to: string; value: string;
        status: string; block_number: number; gas_used: string; logs: unknown[];
      } | null;

      if (!data) return null;
      return {
        hash: data.hash,
        from: data.from,
        to: data.to,
        value: data.value,
        status: data.status,
        blockNumber: data.block_number,
        gasUsed: data.gas_used,
        logs: data.logs || [],
      };
    } catch {
      return null;
    }
  }

  getKnownContracts(): { name: string; address: string; verified: boolean }[] {
    return [
      { name: 'RitualWallet', address: '0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948', verified: true },
      { name: 'SovereignAgentFactory', address: '0x9dC4C054e53bCc4Ce0A0Ff09E890A7a8e817f304', verified: true },
      { name: 'PersistentAgentFactory', address: '0xD4AA9D55215dc8149Af57605e70921Ea16b73591', verified: true },
      { name: 'TEEServiceRegistry', address: '0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F', verified: true },
      { name: 'Scheduler', address: '0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B', verified: true },
      { name: 'AsyncDelivery', address: '0x5A16214fF555848411544b005f7Ac063742f39F6', verified: true },
      { name: 'AsyncJobTracker', address: '0xC069FFCa0389f44eCA2C626e55491b0ab045AEF5', verified: true },
      { name: 'SecretsAccessControl', address: '0xf9BF1BC8A3e79B9EBeD0fa2Db70D0513fecE32FD', verified: true },
      { name: 'ModelPricingRegistry', address: '0x7A85F48b971ceBb75491b61abe279728F4c4384f', verified: true },
      { name: 'Multicall3', address: '0x5577Ea679673Ec7508E9524100a188E7600202a3', verified: true },
    ];
  }

  formatExplorerData(data: ExplorerData): string {
    let output = `\n=== Ritual Explorer ===\n`;
    output += `Block Height: ${data.blockHeight} | Gas: ${data.gasPrice} | TPS: ${data.tps}\n\n`;

    output += `Recent Blocks:\n`;
    for (const block of data.recentBlocks.slice(0, 5)) {
      output += `  #${block.number} | ${block.txCount} txs | ${block.timestamp}\n`;
    }

    output += `\nRecent Transactions:\n`;
    for (const tx of data.recentTxs.slice(0, 5)) {
      output += `  ${tx.status} | ${tx.hash.slice(0, 18)}... | ${tx.value} | ${tx.from.slice(0, 10)}... → ${tx.to?.slice(0, 10) || '?'}...\n`;
    }

    output += `\nKnown System Contracts:\n`;
    for (const contract of data.contracts) {
      output += `  ${contract.verified ? 'OK' : '??'} | ${contract.name.padEnd(25)} | ${contract.address}\n`;
    }

    return output;
  }
}
