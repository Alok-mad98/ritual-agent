import { encodeAbiParameters, keccak256, toHex, type Hex } from 'viem';
import { AGENT_FACTORIES, SYSTEM_CONTRACTS, type Address } from '../types.js';
import type { RitualClients } from './chain.js';
import { encodeSovereignAgentCall, type SovereignAgentParams } from './precompiles.js';

const SOVEREIGN_FACTORY_ABI = [
  {
    name: 'deployHarness',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'userSalt', type: 'bytes32' }],
    outputs: [{ name: 'harness', type: 'address' }],
  },
  {
    name: 'predictHarness',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'userSalt', type: 'bytes32' },
    ],
    outputs: [
      { name: 'harness', type: 'address' },
      { name: 'childSalt', type: 'bytes32' },
    ],
  },
  {
    name: 'predictCompressedHarness',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'userSalt', type: 'bytes32' },
    ],
    outputs: [
      { name: 'harness', type: 'address' },
      { name: 'compressedSalt', type: 'bytes32' },
      { name: 'childSalt', type: 'bytes32' },
    ],
  },
] as const;

export interface SovereignLaunchConfig {
  prompt: string;
  model: string;
  maxTurns: number;
  maxTokens: number;
  executor: Address;
  rpcUrls: string;
}

export class SovereignAgent {
  private clients: RitualClients;
  private factoryAddress: Address;

  constructor(clients: RitualClients) {
    this.clients = clients;
    this.factoryAddress = AGENT_FACTORIES.SOVEREIGN_FACTORY;
  }

  async predictHarness(userSalt: Hex): Promise<{ harness: Address; childSalt: Hex }> {
    const result = await this.clients.publicClient.readContract({
      address: this.factoryAddress,
      abi: SOVEREIGN_FACTORY_ABI,
      functionName: 'predictHarness',
      args: [this.clients.account.address, userSalt],
    });
    return {
      harness: result[0] as Address,
      childSalt: result[1] as Hex,
    };
  }

  async predictCompressedHarness(userSalt: Hex): Promise<{
    harness: Address;
    compressedSalt: Hex;
    childSalt: Hex;
  }> {
    const result = await this.clients.publicClient.readContract({
      address: this.factoryAddress,
      abi: SOVEREIGN_FACTORY_ABI,
      functionName: 'predictCompressedHarness',
      args: [this.clients.account.address, userSalt],
    });
    return {
      harness: result[0] as Address,
      compressedSalt: result[1] as Hex,
      childSalt: result[2] as Hex,
    };
  }

  async deployHarness(userSalt: Hex): Promise<Address> {
    const hash = await this.clients.walletClient.writeContract({
      address: this.factoryAddress,
      abi: SOVEREIGN_FACTORY_ABI,
      functionName: 'deployHarness',
      args: [userSalt],
      account: this.clients.account,
      chain: this.clients.walletClient.chain,
      gas: 500_000n,
      maxFeePerGas: 20_000_000_000n,
      maxPriorityFeePerGas: 2_000_000_000n,
    });
    const receipt = await this.clients.publicClient.waitForTransactionReceipt({ hash });
    return receipt.contractAddress as Address;
  }

  buildSovereignParams(config: SovereignLaunchConfig, deliveryTarget: Address): SovereignAgentParams {
    const callbackSelector = '0x8ca12055' as Hex;

    return {
      executor: config.executor,
      ttl: 500n,
      userPublicKey: '0x',
      pollIntervalBlocks: 10n,
      maxPollBlock: 500n,
      taskIdMarker: `agent-${Date.now()}`,
      deliveryTarget,
      deliverySelector: callbackSelector,
      deliveryGasLimit: 3_000_000n,
      deliveryMaxFeePerGas: 1_000_000_000n,
      deliveryMaxPriorityFeePerGas: 100_000_000n,
      cliType: 0,
      prompt: config.prompt,
      encryptedSecrets: '0x',
      convoHistory: ['', '', ''],
      output: ['', '', ''],
      skills: [],
      systemPrompt: ['', '', ''],
      model: config.model,
      tools: [],
      maxTurns: config.maxTurns,
      maxTokens: config.maxTokens,
      rpcUrls: config.rpcUrls,
    };
  }

  async submitSovereignJob(
    params: SovereignAgentParams,
  ): Promise<{ hash: Hex; precompileAddress: Address }> {
    const encoded = encodeSovereignAgentCall(params);
    const precompileAddress = '0x000000000000000000000000000000000000080C' as Address;

    const hash = await this.clients.walletClient.sendTransaction({
      to: precompileAddress,
      data: encoded,
      account: this.clients.account,
      chain: this.clients.walletClient.chain,
      gas: 3_000_000n,
      maxFeePerGas: 20_000_000_000n,
      maxPriorityFeePerGas: 2_000_000_000n,
    });

    return { hash, precompileAddress };
  }

  async getExecutor(): Promise<Address> {
    const TEE_REGISTRY_ABI = [
      {
        name: 'getServicesByCapability',
        type: 'function',
        stateMutability: 'view',
        inputs: [
          { name: 'capability', type: 'uint8' },
          { name: 'checkValidity', type: 'bool' },
        ],
        outputs: [
          {
            type: 'tuple[]',
            components: [
              {
                name: 'node',
                type: 'tuple',
                components: [
                  { name: 'paymentAddress', type: 'address' },
                  { name: 'teeAddress', type: 'address' },
                  { name: 'teeType', type: 'uint8' },
                  { name: 'publicKey', type: 'bytes' },
                  { name: 'endpoint', type: 'string' },
                  { name: 'certPubKeyHash', type: 'bytes32' },
                  { name: 'capability', type: 'uint8' },
                ],
              },
              { name: 'isValid', type: 'bool' },
              { name: 'workloadId', type: 'bytes32' },
            ],
          },
        ],
      },
    ] as const;

    const services = (await this.clients.publicClient.readContract({
      address: SYSTEM_CONTRACTS.TEE_SERVICE_REGISTRY,
      abi: TEE_REGISTRY_ABI,
      functionName: 'getServicesByCapability',
      args: [0, true],
    }) as unknown) as Array<{
      node: { teeAddress: Address };
      isValid: boolean;
    }>;

    const valid = services.find(s => s.isValid);
    if (!valid) {
      throw new Error('No valid executor found for HTTP_CALL capability');
    }
    return valid.node.teeAddress;
  }

  static generateSalt(seed: string): Hex {
    return keccak256(toHex(seed));
  }
}
