import dotenv from 'dotenv';
import { PublicKey } from '@solana/web3.js';

dotenv.config();

/**
 * Configuration interface for the buyback bot
 */
export interface BotConfig {
  // Solana RPC endpoint (mainnet-beta recommended for production)
  rpcEndpoint: string;

  // Private key of the wallet that created the token and receives fees
  // This wallet will be used to claim fees and execute buybacks
  privateKey: string;

  // The mint address of your token on pump.fun
  tokenMintAddress: string;

  // Minimum SOL balance to trigger a buyback (in SOL)
  minBuybackAmount: number;

  // How often to check for claimable fees (in minutes)
  checkIntervalMinutes: number;

  // Slippage tolerance for buyback swaps (in percentage, e.g., 5 = 5%)
  slippageBps: number;

  // Whether to use priority fees for faster transactions
  usePriorityFee: boolean;

  // Priority fee in microlamports (if usePriorityFee is true)
  priorityFeeMicroLamports: number;
}

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): BotConfig {
  const requiredEnvVars = [
    'SOLANA_RPC_ENDPOINT',
    'WALLET_PRIVATE_KEY',
    'TOKEN_MINT_ADDRESS'
  ];

  // Check for required environment variables
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  // Validate token mint address
  try {
    new PublicKey(process.env.TOKEN_MINT_ADDRESS!);
  } catch {
    throw new Error('Invalid TOKEN_MINT_ADDRESS - must be a valid Solana public key');
  }

  return {
    rpcEndpoint: process.env.SOLANA_RPC_ENDPOINT!,
    privateKey: process.env.WALLET_PRIVATE_KEY!,
    tokenMintAddress: process.env.TOKEN_MINT_ADDRESS!,
    minBuybackAmount: parseFloat(process.env.MIN_BUYBACK_AMOUNT || '0.01'),
    checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES || '5', 10),
    slippageBps: parseInt(process.env.SLIPPAGE_BPS || '500', 10), // 5% default
    usePriorityFee: process.env.USE_PRIORITY_FEE === 'true',
    priorityFeeMicroLamports: parseInt(process.env.PRIORITY_FEE_MICRO_LAMPORTS || '50000', 10),
  };
}

/**
 * Pump.fun program addresses and constants
 */
export const PUMPFUN_CONSTANTS = {
  // Pump.fun program ID on Solana mainnet
  PROGRAM_ID: new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),

  // Pump.fun fee account where trading fees are collected
  FEE_ACCOUNT: new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM'),

  // Pump.fun global state account
  GLOBAL_STATE: new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf'),

  // Bonding curve seed for PDA derivation
  BONDING_CURVE_SEED: 'bonding-curve',

  // Creator vault seed for PDA derivation
  CREATOR_VAULT_SEED: 'creator-vault',
};
