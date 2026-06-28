# Frontend Integration Guide — Privy + Session Keys (for lovable.dev)

This guide wires a **Next.js + lovable.dev** frontend to the Ritual Agent backend, using **Privy** for wallet onboarding and **session keys** so users sign only once to enable automatic per-question payments.

> **Architecture summary**
> 1. User connects/creates a wallet via Privy.
> 2. Browser generates a local session keypair.
> 3. User signs **one** `approveSession` transaction: "allow session key X to spend up to Y RITUAL."
> 4. User deposits RITUAL into `RitualChatPayment` contract (one transaction).
> 5. For every chat question, the session key signs a payment payload off-chain; the backend relays it on-chain as proof, then answers.

---

## 1. Install Dependencies

```bash
npm install @privy-io/react-auth @privy-io/wagmi viem wagmi @tanstack/react-query
```

---

## 2. Add Environment Variables

```env
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_AGENT_API=https://ritual-agent.<your-subdomain>.workers.dev
NEXT_PUBLIC_RITUAL_CHAT_PAYMENT=0x6c4b1131d691a04c39f37ede5834eebde39eb009
NEXT_PUBLIC_RITUAL_RPC_URL=https://rpc.ritualfoundation.org
NEXT_PUBLIC_RITUAL_CHAIN_ID=1979
```

---

## 3. Wrap App with Privy + Wagmi

```tsx
// app/providers.tsx
'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider, createConfig } from 'wagmi';
import { http } from 'wagmi/actions';
import { defineChain } from 'viem';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const ritualChain = defineChain({
  id: 1979,
  name: 'Ritual',
  nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.ritualfoundation.org'] },
  },
});

export const config = createConfig({
  chains: [ritualChain],
  transports: {
    [ritualChain.id]: http(),
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ['wallet', 'email', 'google', 'twitter'],
        appearance: {
          theme: 'dark',
          accentColor: '#a0a0a0',
          logo: '/ritual-mark.svg',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
      }}
    >
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    </PrivyProvider>
  );
}
```

---

## 4. Session Key Utility

```ts
// lib/session-key.ts
import { generatePrivateKey, privateKeyToAccount, keccak256, toHex } from 'viem';

const SESSION_KEY_STORAGE = 'ritual-session-key';
const SESSION_NONCE_STORAGE = 'ritual-session-nonce';

export function getOrCreateSessionKey() {
  if (typeof window === 'undefined') return null;
  let pk = localStorage.getItem(SESSION_KEY_STORAGE);
  if (!pk) {
    pk = generatePrivateKey();
    localStorage.setItem(SESSION_KEY_STORAGE, pk);
  }
  return privateKeyToAccount(pk as `0x${string}`);
}

export function getNextNonce(): bigint {
  if (typeof window === 'undefined') return 0n;
  const current = BigInt(localStorage.getItem(SESSION_NONCE_STORAGE) || '0');
  const next = current + 1n;
  localStorage.setItem(SESSION_NONCE_STORAGE, next.toString());
  return next;
}

export function hashQuestion(message: string): `0x${string}` {
  return keccak256(toHex(message));
}
```

---

## 5. Chat Payment Contract ABI

```ts
// lib/abis.ts
export const CHAT_PAYMENT_ABI = [
  {
    name: 'deposit', stateMutability: 'payable', inputs: [], outputs: [], type: 'function',
  },
  {
    name: 'approveSession',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionKey', type: 'address' },
      { name: 'allowance', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'minimumFee', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
] as const;
```

---

## 6. Wallet Setup Component (Deposit + Approve Session)

```tsx
// components/WalletSetup.tsx
'use client';

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useWriteContract, useAccount } from 'wagmi';
import { parseEther } from 'viem';
import { CHAT_PAYMENT_ABI } from '@/lib/abis';
import { getOrCreateSessionKey } from '@/lib/session-key';

const CHAT_PAYMENT_ADDRESS = process.env.NEXT_PUBLIC_RITUAL_CHAT_PAYMENT as `0x${string}`;

export function WalletSetup() {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { address } = useAccount();
  const { writeContract } = useWriteContract();

  const sessionKey = getOrCreateSessionKey();

  async function depositAndApprove() {
    if (!authenticated) return login();

    const wallet = wallets[0];
    await wallet.switchChain(1979);

    // 1. Deposit 0.01 RITUAL into contract
    writeContract({
      abi: CHAT_PAYMENT_ABI,
      address: CHAT_PAYMENT_ADDRESS,
      functionName: 'deposit',
      value: parseEther('0.01'),
    });

    // 2. Approve session key with 0.009 RITUAL allowance
    writeContract({
      abi: CHAT_PAYMENT_ABI,
      address: CHAT_PAYMENT_ADDRESS,
      functionName: 'approveSession',
      args: [sessionKey!.address, parseEther('0.009')],
    });
  }

  return (
    <div>
      {!authenticated ? (
        <button onClick={login}>Connect Wallet</button>
      ) : (
        <div>
          <p>Connected: {address}</p>
          <p>Session Key: {sessionKey?.address}</p>
          <button onClick={depositAndApprove}>
            Deposit + Enable Auto-Pay
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## 7. Chat Component with Session-Key Payment

```tsx
// components/ChatBox.tsx
'use client';

import { useState } from 'react';
import { getOrCreateSessionKey, getNextNonce, hashQuestion } from '@/lib/session-key';

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API!;

export function ChatBox() {
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const sessionKey = getOrCreateSessionKey();
      if (!sessionKey) throw new Error('Session key not available');

      const questionHash = hashQuestion(message);
      const fee = 1000000000000000n; // 0.001 RITUAL, must match contract minimumFee
      const nonce = getNextNonce();
      const payer = sessionKey.address; // or user's wallet address if different

      // The session key signs the payment payload
      const sessionSignature = await sessionKey.signMessage({
        message: {
          raw: getSessionMessageHash(questionHash, fee, nonce, payer, sessionKey.address),
        },
      });

      const res = await fetch(`${AGENT_API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          questionHash,
          fee: fee.toString(),
          nonce: nonce.toString(),
          payer,
          sessionKey: sessionKey.address,
          sessionSignature,
        }),
      });

      const data = await res.json();
      setReply(data.reply);
      console.log('Payment TX:', data.txHash);
    } catch (err) {
      setReply(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask about Ritual..."
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Asking...' : 'Ask'}
        </button>
      </form>
      {reply && <p>{reply}</p>}
    </div>
  );
}

// Replicates backend hashing logic
function getSessionMessageHash(
  questionHash: `0x${string}`,
  fee: bigint,
  nonce: bigint,
  payer: `0x${string}`,
  sessionKey: `0x${string}`,
): `0x${string}` {
  const contract = process.env.NEXT_PUBLIC_RITUAL_CHAT_PAYMENT as `0x${string}`;
  const packed =
    questionHash.slice(2) +
    fee.toString(16).padStart(64, '0') +
    nonce.toString(16).padStart(64, '0') +
    payer.slice(2) +
    sessionKey.slice(2) +
    contract.slice(2);
  return keccak256(`0x${packed}`);
}
```

---

## 8. Direct Payment Alternative (EOA, simpler but prompts every time)

If you don't need session-key auto-pay, call `payAndAsk` from the user's wallet each question:

```tsx
import { useWriteContract } from 'wagmi';

const { writeContractAsync } = useWriteContract();

async function askDirect(message: string) {
  const questionHash = hashQuestion(message);
  const fee = parseEther('0.001');

  const txHash = await writeContractAsync({
    abi: CHAT_PAYMENT_ABI,
    address: CHAT_PAYMENT_ADDRESS,
    functionName: 'payAndAsk',
    args: [questionHash],
    value: fee,
  });

  const res = await fetch(`${AGENT_API}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, txHash }),
  });

  return res.json();
}
```

---

## 9. Lovable.dev Notes

- Use the above code as **custom code blocks** in lovable.dev.
- Ensure `app/providers.tsx` wraps `layout.tsx`.
- Use lovable's built-in button/input components for the UI; inject the logic above.
- The session key is stored in `localStorage`. For production, consider a more secure storage mechanism or a Privy embedded wallet as the session signer.
- The payer in the session-key example is the session key itself. In a real app, the `payer` should be the user's connected wallet address, and the session key is only the signer.

---

## 10. Testnet Faucet

Get RITUAL for user wallets from: `https://faucet.ritualfoundation.org`
