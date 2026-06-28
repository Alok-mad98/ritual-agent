import 'dotenv/config';
import { createClients, waitForTx } from '../src/ritual/chain.js';
import { getConfig, ritualChain } from '../src/config.js';
import { CHAT_PAYMENT_ABI, hashQuestion } from '../src/payment/chat-payment.js';
import { encodeFunctionData, parseEther } from 'viem';

const WORKER_URL = process.env.WORKER_URL || 'https://ritual-ask.arechampionw.workers.dev';
const QUESTION = process.env.QUESTION || 'What is Ritual Chain and what makes it unique?';

async function main(): Promise<void> {
  const config = getConfig(process.env as Record<string, string | undefined>);
  const clients = createClients(config.privateKey, config.rpcUrl);

  console.log(`Agent wallet: ${clients.account.address}`);
  const paymentAddress = config.chatPaymentAddress as `0x${string}`;
  console.log(`Payment contract: ${paymentAddress}`);
  console.log(`Worker URL: ${WORKER_URL}`);
  console.log(`Question: ${QUESTION}`);

  const questionHash = hashQuestion(QUESTION);
  console.log(`Question hash: ${questionHash}`);

  const minimumFee = await clients.publicClient.readContract({
    address: paymentAddress,
    abi: CHAT_PAYMENT_ABI,
    functionName: 'minimumFee',
  });
  console.log(`Minimum fee: ${minimumFee.toString()} wei`);

  const fee = minimumFee > 0n ? minimumFee : parseEther('0.001');

  const data = encodeFunctionData({
    abi: CHAT_PAYMENT_ABI,
    functionName: 'payAndAsk',
    args: [questionHash],
  });

  console.log('Sending payAndAsk transaction...');
  const txHash = await clients.walletClient.sendTransaction({
    account: clients.account,
    chain: ritualChain,
    to: paymentAddress,
    data,
    value: fee,
    maxFeePerGas: 20_000_000_000n,
    maxPriorityFeePerGas: 2_000_000_000n,
  });
  console.log(`Payment TX: ${txHash}`);

  const receipt = await waitForTx(clients, txHash);
  console.log(`Confirmed in block #${receipt.blockNumber}, status: ${receipt.status}`);

  console.log('Calling worker /chat with payment proof...');
  const response = await fetch(`${WORKER_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: QUESTION, txHash }),
  });

  const bodyText = await response.text();
  console.log(`Worker status: ${response.status}`);
  console.log('Worker response:');
  console.log(bodyText);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
