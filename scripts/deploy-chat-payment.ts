import 'dotenv/config';
import { createClients } from '../src/ritual/chain.js';
import { parseEther } from 'viem';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const MINIMUM_FEE = parseEther('0.001'); // 0.001 RITUAL per question

async function main(): Promise<void> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('PRIVATE_KEY not set');
    process.exit(1);
  }

  const rpcUrl = process.env.RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org';
  const clients = createClients(privateKey, rpcUrl);

  const artifactPath = resolve('contracts', 'artifacts', 'RitualChatPayment.json');
  if (!existsSync(artifactPath)) {
    console.error('Contract artifact not found. Compile first:');
    console.error('  npm run compile:contracts');
    process.exit(1);
  }

  const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8')) as {
    abi: unknown[];
    bytecode: `0x${string}`;
  };

  console.log('========================================');
  console.log('  Deploy RitualChatPayment Contract');
  console.log('========================================');
  console.log(`  Deployer: ${clients.account.address}`);
  console.log(`  Minimum fee per question: ${MINIMUM_FEE} wei`);
  console.log('');

  const hash = await clients.walletClient.deployContract({
    abi: artifact.abi as any,
    bytecode: artifact.bytecode,
    args: [MINIMUM_FEE],
    account: clients.account,
    chain: clients.walletClient.chain,
    gas: 1_000_000n,
    maxFeePerGas: 20_000_000_000n,
    maxPriorityFeePerGas: 2_000_000_000n,
  });

  console.log(`  TX: ${hash}`);
  console.log('  Waiting for confirmation...');

  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash });
  console.log(`  Status: ${receipt.status}`);
  console.log(`  Contract: ${receipt.contractAddress}`);
  console.log('');
  console.log('  Add this address to your .env:');
  console.log(`  CHAT_PAYMENT_ADDRESS=${receipt.contractAddress}`);
  console.log('  Then update wrangler secrets: npx wrangler secret put CHAT_PAYMENT_ADDRESS');
  console.log('========================================');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
