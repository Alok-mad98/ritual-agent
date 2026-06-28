import { encodeAbiParameters, parseAbiParameters, decodeAbiParameters, type Hex } from 'viem';
import { PRECOMPILES, HTTP_METHODS, type Address } from '../types.js';

const StorageRefTuple = {
  type: 'tuple' as const,
  components: [
    { name: 'platform', type: 'string' },
    { name: 'path', type: 'string' },
    { name: 'keyRef', type: 'string' },
  ],
};

export interface HttpCallParams {
  executor: Address;
  url: string;
  method: keyof typeof HTTP_METHODS;
  headersKeys?: string[];
  headersValues?: string[];
  body?: Hex;
  ttl?: bigint;
  userPublicKey?: Hex;
  piiEnabled?: boolean;
}

export function encodeHttpCall(params: HttpCallParams): Hex {
  return encodeAbiParameters(
    parseAbiParameters([
      'address, bytes[], uint256, bytes[], bytes,',
      'string, uint8, string[], string[], bytes,',
      'uint256, uint8, bool',
    ].join(' ')),
    [
      params.executor,
      [],
      params.ttl || 100n,
      [],
      params.userPublicKey || '0x',
      params.url,
      HTTP_METHODS[params.method],
      params.headersKeys || [],
      params.headersValues || [],
      params.body || '0x',
      0n,
      0,
      params.piiEnabled || false,
    ],
  );
}

export interface LlmCallParams {
  executor: Address;
  messagesJson: string;
  model: string;
  maxTokens?: bigint;
  temperature?: bigint;
  ttl?: bigint;
  stream?: boolean;
  reasoningEffort?: string;
}

export function encodeLlmCall(params: LlmCallParams): Hex {
  return encodeAbiParameters(
    parseAbiParameters([
      'address, bytes[], uint256, bytes[], bytes,',
      'string, string, int256, string, bool, int256, string, string,',
      'uint256, bool, int256, string, bytes, int256, string, string, bool,',
      'int256, bytes, bytes, int256, int256, string, bool,',
      '(string,string,string)',
    ].join('')),
    [
      params.executor,
      [],
      params.ttl || 300n,
      [],
      '0x',
      params.messagesJson,
      params.model,
      0n,
      '',
      false,
      params.maxTokens || 4096n,
      '',
      '',
      1n,
      true,
      0n,
      params.reasoningEffort || 'medium',
      '0x',
      -1n,
      'auto',
      '',
      params.stream || false,
      params.temperature || 700n,
      '0x',
      '0x',
      -1n,
      1000n,
      '',
      false,
      ['', '', ''],
    ],
  );
}

export function decodeAsyncOutput(rawOutput: Hex): { simmedInput: Hex; actualOutput: Hex } {
  const [simmedInput, actualOutput] = decodeAbiParameters(
    parseAbiParameters('bytes, bytes'),
    rawOutput,
  );
  return { simmedInput: simmedInput as Hex, actualOutput: actualOutput as Hex };
}

export function decodeHttpResult(output: Hex): {
  statusCode: number;
  headerKeys: string[];
  headerValues: string[];
  body: Hex;
  errorMessage: string;
} {
  const [statusCode, headerKeys, headerValues, body, errorMessage] = decodeAbiParameters(
    parseAbiParameters('uint16, string[], string[], bytes, string'),
    output,
  );
  return {
    statusCode: Number(statusCode),
    headerKeys: headerKeys as string[],
    headerValues: headerValues as string[],
    body: body as Hex,
    errorMessage: errorMessage as string,
  };
}

export function decodeLlmResult(output: Hex): {
  hasError: boolean;
  completionData: Hex;
  modelMetadata: Hex;
  errorMessage: string;
} {
  const [hasError, completionData, modelMetadata, errorMessage] = decodeAbiParameters(
    parseAbiParameters('bool, bytes, bytes, string'),
    output,
  );
  return {
    hasError: Boolean(hasError),
    completionData: completionData as Hex,
    modelMetadata: modelMetadata as Hex,
    errorMessage: errorMessage as string,
  };
}

export interface SovereignAgentParams {
  executor: Address;
  ttl: bigint;
  userPublicKey: Hex;
  pollIntervalBlocks: bigint;
  maxPollBlock: bigint;
  taskIdMarker: string;
  deliveryTarget: Address;
  deliverySelector: Hex;
  deliveryGasLimit: bigint;
  deliveryMaxFeePerGas: bigint;
  deliveryMaxPriorityFeePerGas: bigint;
  cliType: number;
  prompt: string;
  encryptedSecrets: Hex;
  convoHistory: [string, string, string];
  output: [string, string, string];
  skills: [string, string, string][];
  systemPrompt: [string, string, string];
  model: string;
  tools: string[];
  maxTurns: number;
  maxTokens: number;
  rpcUrls: string;
}

export function encodeSovereignAgentCall(params: SovereignAgentParams): Hex {
  const skillsTuple = params.skills.map(s => ({ platform: s[0], path: s[1], keyRef: s[2] }));
  return encodeAbiParameters(
    [
      { type: 'address' },
      { type: 'uint256' },
      { type: 'bytes' },
      { type: 'uint64' },
      { type: 'uint64' },
      { type: 'string' },
      { type: 'address' },
      { type: 'bytes4' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint16' },
      { type: 'string' },
      { type: 'bytes' },
      StorageRefTuple,
      StorageRefTuple,
      { type: 'tuple[]', components: StorageRefTuple.components },
      StorageRefTuple,
      { type: 'string' },
      { type: 'string[]' },
      { type: 'uint16' },
      { type: 'uint32' },
      { type: 'string' },
    ],
    [
      params.executor,
      params.ttl,
      params.userPublicKey,
      params.pollIntervalBlocks,
      params.maxPollBlock,
      params.taskIdMarker,
      params.deliveryTarget,
      params.deliverySelector,
      params.deliveryGasLimit,
      params.deliveryMaxFeePerGas,
      params.deliveryMaxPriorityFeePerGas,
      params.cliType,
      params.prompt,
      params.encryptedSecrets,
      { platform: params.convoHistory[0], path: params.convoHistory[1], keyRef: params.convoHistory[2] },
      { platform: params.output[0], path: params.output[1], keyRef: params.output[2] },
      skillsTuple,
      { platform: params.systemPrompt[0], path: params.systemPrompt[1], keyRef: params.systemPrompt[2] },
      params.model,
      params.tools,
      params.maxTurns,
      params.maxTokens,
      params.rpcUrls,
    ],
  );
}

export const PRECOMPILE_ADDRESSES = PRECOMPILES;
