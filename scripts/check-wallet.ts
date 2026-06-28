import 'dotenv/config';
import { createClients, getNativeBalance } from '../src/ritual/chain.js';
import { RitualWallet } from '../src/ritual/wallet.js';
import { formatEther } from 'viem';

async function main(): Promise<void> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('PRIVATE_KEY not set');
    process.exit(1);
  }

  const rpcUrl = process.env.RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org';
  const clients = createClients(privateKey, rpcUrl);
  const wallet = new RitualWallet(clients);

  const [nativeBalance, walletStatus, blockNumber] = await Promise.all([
    getNativeBalance(clients),
    wallet.getStatus(),
    clients.publicClient.getBlockNumber(),
  ]);

  console.log('========================================');
  console.log('  Wallet Status');
  console.log('========================================');
  console.log(`  Address:              ${clients.account.address}`);
  console.log(`  Chain:                Ritual (${clients.walletClient.chain?.id})`);
  console.log(`  RPC:                  ${rpcUrl}`);
  console.log(`  Block:                ${blockNumber}`);
  console.log('');
  console.log(`  Native balance:       ${formatEther(nativeBalance)} RITUAL`);
  console.log(`  RitualWallet balance: ${formatEther(walletStatus.balance)} RITUAL`);
  console.log(`  Lock until block:     ${walletStatus.lockExpiry}`);
  console.log(`  Locked:               ${walletStatus.isLocked}`);
  if (walletStatus.isLocked) {
    const blocksRemaining = walletStatus.lockExpiry - blockNumber;
    console.log(`  Blocks remaining:     ${blocksRemaining} (~${Number(blocksRemaining) * 0.35}s)`);
  }
  console.log('========================================');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
