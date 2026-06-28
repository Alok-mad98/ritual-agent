import 'dotenv/config';
import { createClients } from '../src/ritual/chain.js';
import { RitualWallet } from '../src/ritual/wallet.js';
import { formatEther, parseEther } from 'viem';

async function main(): Promise<void> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('PRIVATE_KEY not set');
    process.exit(1);
  }

  const amount = process.argv[2] || '5';
  const lockBlocks = BigInt(process.argv[3] || '100000');

  const rpcUrl = process.env.RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org';
  const clients = createClients(privateKey, rpcUrl);
  const wallet = new RitualWallet(clients);

  console.log('========================================');
  console.log('  Deposit to RitualWallet');
  console.log('========================================');
  console.log(`  Address:     ${clients.account.address}`);
  console.log(`  Amount:      ${amount} RITUAL`);
  console.log(`  Lock blocks: ${lockBlocks} (~${Number(lockBlocks) * 0.35 / 60} min)`);
  console.log('');

  const nativeBalance = await clients.publicClient.getBalance({ address: clients.account.address });
  const depositAmount = parseEther(amount);

  if (nativeBalance < depositAmount) {
    console.error(`  [ERROR] Insufficient native balance: ${formatEther(nativeBalance)} RITUAL`);
    console.error('  Get testnet RITUAL from https://faucet.ritualfoundation.org');
    process.exit(1);
  }

  console.log('  Depositing...');
  const hash = await wallet.deposit(depositAmount, lockBlocks);
  console.log(`  TX: ${hash}`);

  await clients.publicClient.waitForTransactionReceipt({ hash });

  const newBalance = await wallet.balanceOf();
  console.log('');
  console.log(`  New RitualWallet balance: ${formatEther(newBalance)} RITUAL`);
  console.log('========================================');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
