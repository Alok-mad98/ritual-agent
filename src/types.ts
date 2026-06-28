export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
}

export interface ScrapeResult {
  url: string;
  title: string;
  content: string;
  markdown?: string;
  links?: string[];
}

export interface ChatRequest {
  message: string;
  history?: ChatMessage[];
  sessionId?: string;
  // Payment proof options
  txHash?: string;                          // direct payAndAsk tx hash
  // session-key payment (advanced path)
  questionHash?: string;
  fee?: string;
  nonce?: string;
  payer?: string;
  sessionKey?: string;
  sessionSignature?: string;
}

export interface ChatResponse {
  reply: string;
  txHash?: string;
  sources?: { title: string; url: string }[];
  chainData?: ChainSnapshot;
  timestamp: string;
}

export interface ChainSnapshot {
  blockNumber: number;
  blockTime: number;
  gasPrice: string;
  txCount: number;
  walletBalance: string;
  ritualWalletBalance: string;
  recentBlocks: BlockInfo[];
  recentTransactions: TxInfo[];
  events: LogInfo[];
  timestamp: string;
}

export interface BlockInfo {
  number: number;
  hash: string;
  timestamp: number;
  txCount: number;
  miner: string;
  gasUsed: string;
  gasLimit: string;
}

export interface TxInfo {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  status: 'success' | 'failed' | 'pending';
  blockNumber: number | null;
  gasUsed: string;
}

export interface LogInfo {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  txHash: string;
  eventName?: string;
}

export interface MonitorState {
  lastBlock: number;
  lastUpdate: number;
  totalTxSeen: number;
  totalBlocksSeen: number;
  alerts: Alert[];
  snapshot: ChainSnapshot | null;
}

export interface Alert {
  type: 'large_transfer' | 'contract_deploy' | 'failed_tx' | 'high_gas' | 'custom';
  message: string;
  blockNumber: number;
  timestamp: number;
  data?: unknown;
}

export interface AgentAction {
  type: 'search_web' | 'scrape_url' | 'check_chain' | 'check_explorer' |
        'http_call' | 'llm_call' | 'onchain_tx' | 'deposit_wallet' |
        'withdraw_wallet' | 'deploy_sovereign' | 'check_balance' | 'noop';
  query?: string;
  url?: string;
  prompt?: string;
  method?: string;
  body?: string;
  model?: string;
  maxTurns?: number;
  to?: `0x${string}`;
  data?: `0x${string}`;
  value?: string;
  amount?: string;
  lockBlocks?: string;
  address?: `0x${string}`;
  reason?: string;
}

export interface AgentState {
  lastRun: number;
  runCount: number;
  walletBalance: bigint;
  ritualWalletBalance: bigint;
  lastAction: AgentAction | null;
  lastResponse: string | null;
  errors: string[];
  sovereignAgentAddress: `0x${string}` | null;
  monitor: MonitorState;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface LLMResponse {
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
  raw?: unknown;
}

export type Address = `0x${string}`;
export type Hash = `0x${string}`;
export type Hex = `0x${string}`;

export interface Env {
  AI: Ai;
  PRIVATE_KEY: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_KEY: string;
  TINYFISH_API_KEY: string;
  FIRECRAWL_API_KEY: string;
  RITUAL_RPC_URL: string;
  RITUAL_CHAIN_ID: string;
  GLM_MODEL: string;
  SOVEREIGN_FACTORY: Address;
  RITUAL_WALLET: Address;
  CHAT_PAYMENT_ADDRESS?: Address;
  AGENT_STATE?: KVNamespace;
}

export const PRECOMPILES = {
  ONNX: '0x0000000000000000000000000000000000000800' as Address,
  HTTP_CALL: '0x0000000000000000000000000000000000000801' as Address,
  LLM: '0x0000000000000000000000000000000000000802' as Address,
  JQ: '0x0000000000000000000000000000000000000803' as Address,
  LONG_RUNNING_HTTP: '0x0000000000000000000000000000000000000805' as Address,
  ZK_TWO_PHASE: '0x0000000000000000000000000000000000000806' as Address,
  FHE_CALL: '0x0000000000000000000000000000000000000807' as Address,
  SOVEREIGN_AGENT: '0x000000000000000000000000000000000000080C' as Address,
  IMAGE_CALL: '0x0000000000000000000000000000000000000818' as Address,
  AUDIO_CALL: '0x0000000000000000000000000000000000000819' as Address,
  VIDEO_CALL: '0x000000000000000000000000000000000000081A' as Address,
  DKMS_KEY: '0x000000000000000000000000000000000000081B' as Address,
  PERSISTENT_AGENT: '0x0000000000000000000000000000000000000820' as Address,
  ED25519: '0x0000000000000000000000000000000000000009' as Address,
  SECP256R1: '0x0000000000000000000000000000000000000100' as Address,
  TX_HASH: '0x0000000000000000000000000000000000000830' as Address,
} as const;

export const SYSTEM_CONTRACTS = {
  RITUAL_WALLET: '0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948' as Address,
  ASYNC_JOB_TRACKER: '0xC069FFCa0389f44eCA2C626e55491b0ab045AEF5' as Address,
  TEE_SERVICE_REGISTRY: '0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F' as Address,
  SCHEDULER: '0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B' as Address,
  ASYNC_DELIVERY: '0x5A16214fF555848411544b005f7Ac063742f39F6' as Address,
  SECRETS_ACCESS_CONTROL: '0xf9BF1BC8A3e79B9EBeD0fa2Db70D0513fecE32FD' as Address,
  MODEL_PRICING_REGISTRY: '0x7A85F48b971ceBb75491b61abe279728F4c4384f' as Address,
} as const;

export const AGENT_FACTORIES = {
  SOVEREIGN_FACTORY: '0x9dC4C054e53bCc4Ce0A0Ff09E890A7a8e817f304' as Address,
  PERSISTENT_FACTORY: '0xD4AA9D55215dc8149Af57605e70921Ea16b73591' as Address,
} as const;

export const HTTP_METHODS = {
  GET: 1,
  POST: 2,
  PUT: 3,
  DELETE: 4,
  PATCH: 5,
  HEAD: 6,
  OPTIONS: 7,
} as const;
