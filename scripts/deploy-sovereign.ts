import 'dotenv/config';
import { createClients } from '../src/ritual/chain.js';
import { RitualWallet } from '../src/ritual/wallet.js';
import { SovereignAgent } from '../src/ritual/sovereign.js';
import { formatEther, toHex } from 'viem';

async function main(): Promise<void> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('PRIVATE_KEY not set');
    process.exit(1);
  }

  const rpcUrl = process.env.RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org';
  const clients = createClients(privateKey, rpcUrl);
  const wallet = new RitualWallet(clients);
  const sovereign = new SovereignAgent(clients);

  console.log('========================================');
  console.log('  Deploy Sovereign Agent');
  console.log('========================================');
  console.log(`  Wallet: ${clients.account.address}`);
  console.log('');

  const [nativeBalance, walletStatus] = await Promise.all([
    clients.publicClient.getBalance({ address: clients.account.address }),
    wallet.getStatus(),
  ]);

  console.log(`  Native balance:       ${formatEther(nativeBalance)} RITUAL`);
  console.log(`  RitualWallet balance: ${formatEther(walletStatus.balance)} RITUAL`);
  console.log(`  Lock until block:     ${walletStatus.lockExpiry} (current: ${walletStatus.currentBlock})`);
  console.log(`  Locked:               ${walletStatus.isLocked}`);
  console.log('');

  if (walletStatus.balance < 1n * 10n ** 18n) {
    console.error('  [WARNING] RitualWallet balance is low. Deposit at least 1 RITUAL before launching.');
    console.error('  Run: npm run deposit');
    process.exit(1);
  }

  console.log('  Step 1: Finding executor...');
  const executor = await sovereign.getExecutor();
  console.log(`  Executor: ${executor}`);
  console.log('');

  const userSalt = SovereignAgent.generateSalt(`ritual-agent-${Date.now()}`);
  console.log('  Step 2: Predicting harness address...');
  const { harness } = await sovereign.predictHarness(userSalt);
  console.log(`  Harness:  ${harness}`);
  console.log('');

  const prompt = process.argv[2] || 'You are a sovereign AI agent on Ritual Chain. Monitor the chain state and report any interesting events. Perform useful tasks autonomously.';
  const model = process.argv[2] || 'zai-org/GLM-4.7-FP8';

  console.log('  Step 3: Building sovereign agent params...');
  const params = sovereign.buildSovereignParams(
    {
      prompt,
      model,
      maxTurns: 10,
      maxTokens: 4096,
      executor,
      rpcUrls: rpcUrl,
    },
    harness,
  );
  console.log('  Params built.');
  console.log('');

  console.log('  Step 4: Deploying harness contract...');
  const deployedAddress = await sovereign.deployHarness(userSalt);
  console.log(`  Deployed: ${deployedAddress}`);
  console.log('');

  console.log('  Step 5: Submitting sovereign agent job...');
  const { hash } = await sovereign.submitSovereignJob(params);
  console.log(`  TX: ${hash}`);
  console.log('');

  console.log('  Waiting for transaction receipt...');
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash });
  console.log(`  Status: ${receipt.status === 'success' ? 'SUCCESS' : 'FAILED'}`);
  console.log(`  Block:  ${receipt.blockNumber}`);
  console.log('');
  console.log('========================================');
  console.log('  Sovereign agent deployed!');
  console.log(`  Harness: ${deployedAddress}`);
  console.log('========================================');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
