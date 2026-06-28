import type { TxInfo, BlockInfo, LogInfo } from '../types.js';

export interface ChainStats {
  totalBlocksMonitored: number;
  totalTxsMonitored: number;
  highestValueTx: TxInfo | null;
  highestGasTx: TxInfo | null;
  largestBlock: BlockInfo | null;
  totalValueTransferred: string;
  avgGasPerBlock: string;
  failedTxCount: number;
  successRate: number;
  uniqueAddresses: Set<string>;
  contractDeployments: number;
  startTime: number;
  lastUpdate: number;
}

export class StatsTracker {
  private stats: ChainStats;

  constructor() {
    this.stats = {
      totalBlocksMonitored: 0,
      totalTxsMonitored: 0,
      highestValueTx: null,
      highestGasTx: null,
      largestBlock: null,
      totalValueTransferred: '0',
      avgGasPerBlock: '0',
      failedTxCount: 0,
      successRate: 100,
      uniqueAddresses: new Set(),
      contractDeployments: 0,
      startTime: Date.now(),
      lastUpdate: Date.now(),
    };
  }

  processBlock(block: BlockInfo, txs: TxInfo[]): void {
    this.stats.totalBlocksMonitored++;
    this.stats.totalTxsMonitored += txs.length;
    this.stats.lastUpdate = Date.now();

    const blockGasUsed = BigInt(block.gasUsed);
    if (!this.stats.largestBlock || blockGasUsed > BigInt(this.stats.largestBlock.gasUsed)) {
      this.stats.largestBlock = block;
    }

    for (const tx of txs) {
      const value = parseFloat(tx.value);

      if (!this.stats.highestValueTx || value > parseFloat(this.stats.highestValueTx.value)) {
        this.stats.highestValueTx = tx;
      }

      const gasUsed = BigInt(tx.gasUsed);
      if (!this.stats.highestGasTx || gasUsed > BigInt(this.stats.highestGasTx.gasUsed)) {
        this.stats.highestGasTx = tx;
      }

      if (tx.status === 'failed') {
        this.stats.failedTxCount++;
      }

      if (!tx.to) {
        this.stats.contractDeployments++;
      }

      this.stats.uniqueAddresses.add(tx.from);
      if (tx.to) this.stats.uniqueAddresses.add(tx.to);
    }

    if (this.stats.totalTxsMonitored > 0) {
      this.stats.successRate = ((this.stats.totalTxsMonitored - this.stats.failedTxCount) / this.stats.totalTxsMonitored) * 100;
    }

    const totalValue = parseFloat(this.stats.totalValueTransferred);
    const blockValue = txs.reduce((sum, tx) => sum + parseFloat(tx.value || '0'), 0);
    this.stats.totalValueTransferred = (totalValue + blockValue).toFixed(6);
  }

  processEvents(events: LogInfo[]): void {
    for (const event of events) {
      this.stats.uniqueAddresses.add(event.address);
    }
  }

  getStats(): ChainStats {
    return {
      ...this.stats,
      uniqueAddresses: this.stats.uniqueAddresses,
    } as ChainStats;
  }

  formatStats(): string {
    const s = this.stats;
    const uptime = Math.floor((Date.now() - s.startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    let output = `\n=== Ritual Chain Statistics ===\n`;
    output += `Monitoring uptime: ${hours}h ${minutes}m\n`;
    output += `Blocks monitored:  ${s.totalBlocksMonitored}\n`;
    output += `Txs monitored:     ${s.totalTxsMonitored}\n`;
    output += `Success rate:      ${s.successRate.toFixed(2)}%\n`;
    output += `Failed txs:        ${s.failedTxCount}\n`;
    output += `Contract deploys:  ${s.contractDeployments}\n`;
    output += `Unique addresses:  ${s.uniqueAddresses.size}\n`;
    output += `Total transferred: ${s.totalValueTransferred} RITUAL\n`;

    if (s.highestValueTx) {
      output += `\n--- Highest Value Transaction ---\n`;
      output += `  Hash:   ${s.highestValueTx.hash}\n`;
      output += `  Value:  ${s.highestValueTx.value} RITUAL\n`;
      output += `  From:   ${s.highestValueTx.from}\n`;
      output += `  To:     ${s.highestValueTx.to || 'CONTRACT_DEPLOY'}\n`;
      output += `  Block:  #${s.highestValueTx.blockNumber}\n`;
      output += `  Status: ${s.highestValueTx.status}\n`;
    }

    if (s.highestGasTx) {
      output += `\n--- Highest Gas Transaction ---\n`;
      output += `  Hash:     ${s.highestGasTx.hash}\n`;
      output += `  Gas used: ${s.highestGasTx.gasUsed}\n`;
      output += `  Block:    #${s.highestGasTx.blockNumber}\n`;
    }

    if (s.largestBlock) {
      output += `\n--- Largest Block (by gas) ---\n`;
      output += `  Block:    #${s.largestBlock.number}\n`;
      output += `  Gas used: ${s.largestBlock.gasUsed} / ${s.largestBlock.gasLimit}\n`;
      output += `  Txs:      ${s.largestBlock.txCount}\n`;
    }

    return output;
  }

  toJSON(): Record<string, unknown> {
    const s = this.stats;
    return {
      uptime_seconds: Math.floor((Date.now() - s.startTime) / 1000),
      totalBlocksMonitored: s.totalBlocksMonitored,
      totalTxsMonitored: s.totalTxsMonitored,
      successRate: s.successRate,
      failedTxCount: s.failedTxCount,
      contractDeployments: s.contractDeployments,
      uniqueAddresses: s.uniqueAddresses.size,
      totalValueTransferred: s.totalValueTransferred,
      highestValueTx: s.highestValueTx,
      highestGasTx: s.highestGasTx,
      largestBlock: s.largestBlock,
    };
  }

  exportSnapshot(): Record<string, unknown> {
    const s = this.stats;
    return {
      totalBlocksMonitored: s.totalBlocksMonitored,
      totalTxsMonitored: s.totalTxsMonitored,
      highestValueTx: s.highestValueTx,
      highestGasTx: s.highestGasTx,
      largestBlock: s.largestBlock,
      totalValueTransferred: s.totalValueTransferred,
      avgGasPerBlock: s.avgGasPerBlock,
      failedTxCount: s.failedTxCount,
      successRate: s.successRate,
      uniqueAddresses: Array.from(s.uniqueAddresses),
      contractDeployments: s.contractDeployments,
      startTime: s.startTime,
      lastUpdate: s.lastUpdate,
    };
  }

  importSnapshot(snapshot: Record<string, unknown>): void {
    const s = this.stats;
    s.totalBlocksMonitored = typeof snapshot.totalBlocksMonitored === 'number' ? snapshot.totalBlocksMonitored : s.totalBlocksMonitored;
    s.totalTxsMonitored = typeof snapshot.totalTxsMonitored === 'number' ? snapshot.totalTxsMonitored : s.totalTxsMonitored;
    s.highestValueTx = snapshot.highestValueTx as TxInfo | null ?? s.highestValueTx;
    s.highestGasTx = snapshot.highestGasTx as TxInfo | null ?? s.highestGasTx;
    s.largestBlock = snapshot.largestBlock as BlockInfo | null ?? s.largestBlock;
    s.totalValueTransferred = typeof snapshot.totalValueTransferred === 'string' ? snapshot.totalValueTransferred : s.totalValueTransferred;
    s.avgGasPerBlock = typeof snapshot.avgGasPerBlock === 'string' ? snapshot.avgGasPerBlock : s.avgGasPerBlock;
    s.failedTxCount = typeof snapshot.failedTxCount === 'number' ? snapshot.failedTxCount : s.failedTxCount;
    s.successRate = typeof snapshot.successRate === 'number' ? snapshot.successRate : s.successRate;
    s.contractDeployments = typeof snapshot.contractDeployments === 'number' ? snapshot.contractDeployments : s.contractDeployments;
    s.startTime = typeof snapshot.startTime === 'number' ? snapshot.startTime : s.startTime;
    s.lastUpdate = typeof snapshot.lastUpdate === 'number' ? snapshot.lastUpdate : s.lastUpdate;

    if (Array.isArray(snapshot.uniqueAddresses)) {
      s.uniqueAddresses = new Set(snapshot.uniqueAddresses as string[]);
    }
  }
}

