import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from 'viem';
import { ritualChain, getAccount } from '../config.js';
import type { Address, Env } from '../types.js';

export interface RitualClients {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: ReturnType<typeof getAccount>;
}

export function createClients(privateKey: string, rpcUrl?: string): RitualClients {
  const account = getAccount(privateKey);
  const transport = http(rpcUrl || 'https://rpc.ritualfoundation.org');

  const publicClient = createPublicClient({
    chain: ritualChain,
    transport,
  });

  const walletClient = createWalletClient({
    account,
    chain: ritualChain,
    transport,
  });

  return { publicClient, walletClient, account };
}

export async function getNativeBalance(clients: RitualClients, address?: Address): Promise<bigint> {
  const addr = address || clients.account.address;
  return clients.publicClient.getBalance({ address: addr });
}

export async function getBlockNumber(clients: RitualClients): Promise<bigint> {
  return clients.publicClient.getBlockNumber();
}

export async function sendTransaction(
  clients: RitualClients,
  to: Address,
  data: `0x${string}`,
  value: bigint = 0n,
  gas?: bigint,
): Promise<`0x${string}`> {
  const params: Record<string, unknown> = {
    to,
    data,
    value,
    account: clients.account,
    chain: ritualChain,
    maxFeePerGas: 20_000_000_000n,
    maxPriorityFeePerGas: 2_000_000_000n,
  };
  if (gas) params.gas = gas;
  return clients.walletClient.sendTransaction(params as Parameters<typeof clients.walletClient.sendTransaction>[0]);
}

export async function waitForTx(clients: RitualClients, hash: `0x${string}`) {
  return clients.publicClient.waitForTransactionReceipt({ hash });
}
