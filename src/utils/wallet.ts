import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { BotConfig } from '../config';

/**
 * Wallet manager class for handling Solana wallet operations
 */
export class WalletManager {
  private connection: Connection;
  private keypair: Keypair;
  private config: BotConfig;

  constructor(config: BotConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcEndpoint, 'confirmed');

    // Initialize keypair from private key (supports both base58 and array formats)
    try {
      // Try parsing as base58 first
      const privateKeyBytes = bs58.decode(config.privateKey);
      this.keypair = Keypair.fromSecretKey(privateKeyBytes);
    } catch {
      // Try parsing as JSON array
      try {
        const privateKeyArray = JSON.parse(config.privateKey);
        this.keypair = Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
      } catch {
        throw new Error('Invalid private key format. Must be base58 encoded or JSON array.');
      }
    }

    console.log(`Wallet initialized: ${this.keypair.publicKey.toBase58()}`);
  }

  /**
   * Get the wallet's public key
   */
  getPublicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  /**
   * Get the Solana connection instance
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get the keypair for signing transactions
   */
  getKeypair(): Keypair {
    return this.keypair;
  }

  /**
   * Get the current SOL balance of the wallet
   */
  async getBalance(): Promise<number> {
    const balance = await this.connection.getBalance(this.keypair.publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  /**
   * Send a transaction with optional priority fee
   */
  async sendTransaction(
    instructions: TransactionInstruction[],
    signers: Keypair[] = []
  ): Promise<string> {
    const transaction = new Transaction();

    // Add priority fee if configured
    if (this.config.usePriorityFee) {
      const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: this.config.priorityFeeMicroLamports,
      });
      transaction.add(priorityFeeInstruction);
    }

    // Add all instructions
    for (const instruction of instructions) {
      transaction.add(instruction);
    }

    // Get recent blockhash
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.keypair.publicKey;

    // Sign and send transaction
    const allSigners = [this.keypair, ...signers];
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      allSigners,
      { commitment: 'confirmed' }
    );

    return signature;
  }

  /**
   * Check if wallet has sufficient balance for operations
   */
  async hasSufficientBalance(requiredSol: number): Promise<boolean> {
    const balance = await this.getBalance();
    // Keep some SOL for transaction fees (0.01 SOL buffer)
    return balance >= requiredSol + 0.01;
  }
}

/**
 * Format SOL amount for display
 */
export function formatSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(6);
}

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}
