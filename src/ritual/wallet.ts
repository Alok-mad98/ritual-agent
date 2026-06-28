import { parseEther, formatEther, parseAbiItem } from 'viem';
import type { Address } from '../types.js';
import { SYSTEM_CONTRACTS } from '../types.js';
import type { RitualClients } from './chain.js';

const RITUAL_WALLET_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'lockDuration', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'depositFor',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'lockDuration', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'lockUntil',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export class RitualWallet {
  private clients: RitualClients;
  private walletAddress: Address;

  constructor(clients: RitualClients) {
    this.clients = clients;
    this.walletAddress = SYSTEM_CONTRACTS.RITUAL_WALLET;
  }

  async balanceOf(address?: Address): Promise<bigint> {
    const addr = address || this.clients.account.address;
    return this.clients.publicClient.readContract({
      address: this.walletAddress,
      abi: RITUAL_WALLET_ABI,
      functionName: 'balanceOf',
      args: [addr],
    }) as Promise<bigint>;
  }

  async lockUntil(address?: Address): Promise<bigint> {
    const addr = address || this.clients.account.address;
    return this.clients.publicClient.readContract({
      address: this.walletAddress,
      abi: RITUAL_WALLET_ABI,
      functionName: 'lockUntil',
      args: [addr],
    }) as Promise<bigint>;
  }

  async deposit(amount: bigint, lockBlocks: bigint): Promise<`0x${string}`> {
    const hash = await this.clients.walletClient.writeContract({
      address: this.walletAddress,
      abi: RITUAL_WALLET_ABI,
      functionName: 'deposit',
      args: [lockBlocks],
      value: amount,
      account: this.clients.account,
      chain: this.clients.walletClient.chain,
      gas: 200_000n,
      maxFeePerGas: 20_000_000_000n,
      maxPriorityFeePerGas: 2_000_000_000n,
    });
    return hash;
  }

  async withdraw(amount: bigint): Promise<`0x${string}`> {
    const hash = await this.clients.walletClient.writeContract({
      address: this.walletAddress,
      abi: RITUAL_WALLET_ABI,
      functionName: 'withdraw',
      args: [amount],
      account: this.clients.account,
      chain: this.clients.walletClient.chain,
      gas: 150_000n,
      maxFeePerGas: 20_000_000_000n,
      maxPriorityFeePerGas: 2_000_000_000n,
    });
    return hash;
  }

  async getStatus(address?: Address): Promise<{
    balance: bigint;
    lockExpiry: bigint;
    currentBlock: bigint;
    isLocked: boolean;
  }> {
    const [balance, lockExpiry, currentBlock] = await Promise.all([
      this.balanceOf(address),
      this.lockUntil(address),
      this.clients.publicClient.getBlockNumber(),
    ]);
    return {
      balance,
      lockExpiry,
      currentBlock,
      isLocked: currentBlock < lockExpiry,
    };
  }

  static format(amount: bigint): string {
    return formatEther(amount);
  }

  static parse(amount: string): bigint {
    return parseEther(amount);
  }
}
