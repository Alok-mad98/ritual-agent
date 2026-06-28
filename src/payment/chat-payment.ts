import {
  keccak256, toHex, verifyMessage, formatEther, parseEther,
} from 'viem';
import type { Address, Hex } from '../types.js';
import type { RitualClients } from '../ritual/chain.js';

export const CHAT_PAYMENT_ABI = [
  {
    name: 'payAndAsk',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'questionHash', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'payWithSession',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'questionHash', type: 'bytes32' },
      { name: 'fee', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'payer', type: 'address' },
      { name: 'sessionKey', type: 'address' },
      { name: 'sessionSignature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'getPayment',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'questionHash', type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'payer', type: 'address' },
          { name: 'fee', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'exists', type: 'bool' },
        ],
      },
    ],
  },
  {
    name: 'minimumFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'balances',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'payer', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'sessionAllowances',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'payer', type: 'address' },
      { name: 'sessionKey', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'QuestionPaid',
    type: 'event',
    inputs: [
      { name: 'questionHash', type: 'bytes32', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'fee', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
    ],
  },
] as const;

export interface SessionPaymentPayload {
  questionHash: Hex;
  fee: bigint;
  nonce: bigint;
  payer: Address;
  sessionKey: Address;
  sessionSignature: Hex;
}

export function hashQuestion(message: string): Hex {
  return keccak256(toHex(message));
}

export function getSessionMessageHash(
  questionHash: Hex,
  fee: bigint,
  nonce: bigint,
  payer: Address,
  sessionKey: Address,
  contractAddress: Address,
): Hex {
  return keccak256(
    toHex(
      questionHash + fee.toString(16).padStart(64, '0') + nonce.toString(16).padStart(64, '0') +
      payer.slice(2) + sessionKey.slice(2) + contractAddress.slice(2)
    ),
  );
}

export class ChatPaymentManager {
  private clients: RitualClients;
  private contractAddress: Address;

  constructor(clients: RitualClients, contractAddress: Address) {
    this.clients = clients;
    this.contractAddress = contractAddress;
  }

  async getPayment(questionHash: Hex): Promise<{
    payer: Address;
    fee: bigint;
    timestamp: bigint;
    exists: boolean;
  } | null> {
    try {
      const result = await this.clients.publicClient.readContract({
        address: this.contractAddress,
        abi: CHAT_PAYMENT_ABI,
        functionName: 'getPayment',
        args: [questionHash],
      }) as { payer: Address; fee: bigint; timestamp: bigint; exists: boolean };

      return {
        payer: result.payer,
        fee: result.fee,
        timestamp: result.timestamp,
        exists: result.exists,
      };
    } catch {
      return null;
    }
  }

  async verifyDirectPayment(txHash: Hex, questionHash: Hex): Promise<{
    valid: boolean;
    fee: bigint;
    payer: Address;
    error?: string;
  }> {
    try {
      const receipt = await this.clients.publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        return { valid: false, fee: 0n, payer: '0x' as Address, error: 'Transaction failed' };
      }

      const payment = await this.getPayment(questionHash);
      if (!payment || !payment.exists) {
        return { valid: false, fee: 0n, payer: '0x' as Address, error: 'Payment not found for question hash' };
      }

      return { valid: true, fee: payment.fee, payer: payment.payer };
    } catch (err) {
      return { valid: false, fee: 0n, payer: '0x' as Address, error: String(err) };
    }
  }

  async submitSessionPayment(payload: SessionPaymentPayload): Promise<{
    txHash: Hex;
    fee: bigint;
    payer: Address;
  }> {
    const hash = await this.clients.walletClient.writeContract({
      address: this.contractAddress,
      abi: CHAT_PAYMENT_ABI,
      functionName: 'payWithSession',
      args: [
        payload.questionHash,
        payload.fee,
        payload.nonce,
        payload.payer,
        payload.sessionKey,
        payload.sessionSignature,
      ],
      account: this.clients.account,
      chain: this.clients.walletClient.chain,
      gas: 500_000n,
      maxFeePerGas: 20_000_000_000n,
      maxPriorityFeePerGas: 2_000_000_000n,
    });

    const receipt = await this.clients.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new Error('Session payment transaction failed');
    }

    return { txHash: hash, fee: payload.fee, payer: payload.payer };
  }

  async verifySessionSignature(payload: SessionPaymentPayload): Promise<boolean> {
    const messageHash = getSessionMessageHash(
      payload.questionHash,
      payload.fee,
      payload.nonce,
      payload.payer,
      payload.sessionKey,
      this.contractAddress,
    );

    try {
      const recovered = await verifyMessage({
        address: payload.sessionKey,
        message: { raw: messageHash },
        signature: payload.sessionSignature,
      });
      return recovered;
    } catch {
      return false;
    }
  }

  async getMinimumFee(): Promise<bigint> {
    return this.clients.publicClient.readContract({
      address: this.contractAddress,
      abi: CHAT_PAYMENT_ABI,
      functionName: 'minimumFee',
      args: [],
    }) as Promise<bigint>;
  }

  async isQuestionPaid(questionHash: Hex): Promise<boolean> {
    const payment = await this.getPayment(questionHash);
    return payment?.exists || false;
  }
}
