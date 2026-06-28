import type { PublicClient } from 'viem';
import { formatEther, parseAbiItem } from 'viem';
import type {
  ChainSnapshot, BlockInfo, TxInfo, LogInfo, MonitorState, Alert,
} from '../types.js';
import { SYSTEM_CONTRACTS, type Address } from '../types.js';

const MONITORED_EVENTS = [
  {
    name: 'Deposit',
    address: SYSTEM_CONTRACTS.RITUAL_WALLET,
    event: parseAbiItem('event Deposit(address indexed user, uint256 amount, uint256 lockUntil)'),
  },
  {
    name: 'Withdrawal',
    address: SYSTEM_CONTRACTS.RITUAL_WALLET,
    event: parseAbiItem('event Withdrawal(address indexed user, uint256 amount)'),
  },
  {
    name: 'FeeDeduction',
    address: SYSTEM_CONTRACTS.RITUAL_WALLET,
    event: parseAbiItem('event FeeDeduction(address indexed user, uint256 amount, uint256 callId)'),
  },
];

export class ChainMonitor {
  private publicClient: PublicClient;
  private walletAddress: Address;
  private state: MonitorState;

  constructor(publicClient: PublicClient, walletAddress: Address) {
    this.publicClient = publicClient;
    this.walletAddress = walletAddress;
    this.state = {
      lastBlock: 0,
      lastUpdate: 0,
      totalTxSeen: 0,
      totalBlocksSeen: 0,
      alerts: [],
      snapshot: null,
    };
  }

  async getSnapshot(): Promise<ChainSnapshot> {
    const [blockNumber, balance, ritualBalance, gasPrice] = await Promise.all([
      this.publicClient.getBlockNumber(),
      this.publicClient.getBalance({ address: this.walletAddress }),
      this.getRitualWalletBalance(),
      this.publicClient.getGasPrice(),
    ]);

    const recentBlocks = await this.getRecentBlocks(5);
    const recentTransactions = await this.getRecentTransactions(recentBlocks);
    const events = await this.getRecentEvents(blockNumber);

    const snapshot: ChainSnapshot = {
      blockNumber: Number(blockNumber),
      blockTime: recentBlocks.length > 1
        ? recentBlocks[0].timestamp - recentBlocks[1].timestamp
        : 0,
      gasPrice: formatEther(gasPrice),
      txCount: recentTransactions.length,
      walletBalance: formatEther(balance),
      ritualWalletBalance: formatEther(ritualBalance),
      recentBlocks,
      recentTransactions,
      events,
      timestamp: new Date().toISOString(),
    };

    this.state.snapshot = snapshot;
    this.state.lastBlock = snapshot.blockNumber;
    this.state.lastUpdate = Date.now();
    this.state.totalBlocksSeen++;

    return snapshot;
  }

  private async getRitualWalletBalance(): Promise<bigint> {
    try {
      const WALLET_ABI = [
        { name: 'balanceOf', type: 'function', stateMutability: 'view',
          inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'uint256' }] },
      ] as const;
      return await this.publicClient.readContract({
        address: SYSTEM_CONTRACTS.RITUAL_WALLET,
        abi: WALLET_ABI,
        functionName: 'balanceOf',
        args: [this.walletAddress],
      }) as bigint;
    } catch {
      return 0n;
    }
  }

  private async getRecentBlocks(count: number): Promise<BlockInfo[]> {
    const currentBlock = await this.publicClient.getBlockNumber();
    const blocks: BlockInfo[] = [];

    for (let i = 0; i < count; i++) {
      const blockNum = currentBlock - BigInt(i);
      if (blockNum < 0n) break;
      try {
        const block = await this.publicClient.getBlock({
          blockNumber: blockNum,
          includeTransactions: false,
        });
        blocks.push({
          number: Number(block.number),
          hash: block.hash,
          timestamp: Number(block.timestamp),
          txCount: block.transactions.length,
          miner: block.miner,
          gasUsed: block.gasUsed.toString(),
          gasLimit: block.gasLimit.toString(),
        });
      } catch {
        continue;
      }
    }

    return blocks;
  }

  private async getRecentTransactions(blocks: BlockInfo[]): Promise<TxInfo[]> {
    const txs: TxInfo[] = [];

    for (const block of blocks.slice(0, 3)) {
      try {
        const fullBlock = await this.publicClient.getBlock({
          blockNumber: BigInt(block.number),
          includeTransactions: true,
        });

        for (const tx of fullBlock.transactions.slice(0, 5)) {
          try {
            const txData = tx as {
              hash: `0x${string}`;
              from: string;
              to: string | null;
              value: bigint;
            };
            const receipt = await this.publicClient.getTransactionReceipt({
              hash: txData.hash,
            });
            txs.push({
              hash: txData.hash,
              from: txData.from,
              to: txData.to,
              value: formatEther(txData.value || 0n),
              status: receipt.status === 'success' ? 'success' : 'failed',
              blockNumber: Number(receipt.blockNumber),
              gasUsed: receipt.gasUsed.toString(),
            });
          } catch {
            continue;
          }
        }
      } catch {
        continue;
      }
    }

    return txs;
  }

  private async getRecentEvents(currentBlock: bigint): Promise<LogInfo[]> {
    const fromBlock = currentBlock > 1000n ? currentBlock - 1000n : 0n;
    const events: LogInfo[] = [];

    for (const monitored of MONITORED_EVENTS) {
      try {
        const logs = await this.publicClient.getLogs({
          address: monitored.address,
          event: monitored.event,
          fromBlock,
          toBlock: currentBlock,
        });

        for (const log of logs.slice(-5)) {
          events.push({
            address: log.address,
            topics: log.topics as string[],
            data: log.data,
            blockNumber: Number(log.blockNumber),
            txHash: log.transactionHash,
            eventName: monitored.name,
          });
        }
      } catch {
        continue;
      }
    }

    return events;
  }

  async checkForAlerts(snapshot: ChainSnapshot): Promise<Alert[]> {
    const alerts: Alert[] = [];

    for (const tx of snapshot.recentTransactions) {
      const value = parseFloat(tx.value);
      if (value > 100) {
        alerts.push({
          type: 'large_transfer',
          message: `Large transfer of ${tx.value} RITUAL from ${tx.from} to ${tx.to}`,
          blockNumber: tx.blockNumber || 0,
          timestamp: Date.now(),
          data: tx,
        });
      }
      if (tx.status === 'failed') {
        alerts.push({
          type: 'failed_tx',
          message: `Failed transaction ${tx.hash} at block ${tx.blockNumber}`,
          blockNumber: tx.blockNumber || 0,
          timestamp: Date.now(),
          data: tx,
        });
      }
    }

    for (const block of snapshot.recentBlocks) {
      const gasUsed = BigInt(block.gasUsed);
      const gasLimit = BigInt(block.gasLimit);
      const usagePercent = Number((gasUsed * 100n) / gasLimit);
      if (usagePercent > 80) {
        alerts.push({
          type: 'high_gas',
          message: `Block ${block.number} gas usage at ${usagePercent}%`,
          blockNumber: block.number,
          timestamp: Date.now(),
          data: block,
        });
      }
    }

    this.state.alerts = [...alerts, ...this.state.alerts].slice(0, 100);
    return alerts;
  }

  async monitor(): Promise<{ snapshot: ChainSnapshot; alerts: Alert[] }> {
    const snapshot = await this.getSnapshot();
    const alerts = await this.checkForAlerts(snapshot);
    return { snapshot, alerts };
  }

  getState(): MonitorState {
    return { ...this.state };
  }

  formatSnapshot(snapshot: ChainSnapshot): string {
    let output = `\n=== Ritual Chain Monitor ===\n`;
    output += `Block: #${snapshot.blockNumber} | Gas: ${snapshot.gasPrice} RITUAL | Txs in recent blocks: ${snapshot.txCount}\n`;
    output += `Wallet: ${snapshot.walletBalance} RITUAL (native) | ${snapshot.ritualWalletBalance} RITUAL (escrow)\n\n`;

    output += `Recent Blocks:\n`;
    for (const block of snapshot.recentBlocks) {
      output += `  #${block.number} | ${block.txCount} txs | gas: ${block.gasUsed}/${block.gasLimit} | ${new Date(block.timestamp * 1000).toISOString()}\n`;
    }

    if (snapshot.recentTransactions.length > 0) {
      output += `\nRecent Transactions:\n`;
      for (const tx of snapshot.recentTransactions.slice(0, 5)) {
        output += `  ${tx.status === 'success' ? 'OK' : 'FAIL'} | ${tx.hash.slice(0, 18)}... | ${tx.value} RITUAL | ${tx.from.slice(0, 10)}... → ${tx.to?.slice(0, 10) || 'CREATE'}...\n`;
      }
    }

    if (snapshot.events.length > 0) {
      output += `\nRecent Events:\n`;
      for (const event of snapshot.events.slice(0, 5)) {
        output += `  ${event.eventName || 'Event'} | block #${event.blockNumber} | ${event.txHash.slice(0, 18)}...\n`;
      }
    }

    return output;
  }
}
