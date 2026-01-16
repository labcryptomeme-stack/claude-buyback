import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { WalletManager, solToLamports } from '../utils/wallet';
import { BotConfig, PUMPFUN_CONSTANTS } from '../config';
import { PumpFunService } from './pumpfun';
import { logger } from '../utils/logger';

/**
 * Buyback service for executing token purchases on pump.fun
 */
export class BuybackService {
  private wallet: WalletManager;
  private config: BotConfig;
  private pumpfun: PumpFunService;
  private tokenMint: PublicKey;

  constructor(wallet: WalletManager, config: BotConfig, pumpfun: PumpFunService) {
    this.wallet = wallet;
    this.config = config;
    this.pumpfun = pumpfun;
    this.tokenMint = new PublicKey(config.tokenMintAddress);
  }

  /**
   * Get or create the associated token account for the wallet
   */
  async getOrCreateTokenAccount(): Promise<PublicKey> {
    const ata = await getAssociatedTokenAddress(
      this.tokenMint,
      this.wallet.getPublicKey()
    );

    const connection = this.wallet.getConnection();
    const accountInfo = await connection.getAccountInfo(ata);

    if (!accountInfo) {
      logger.info('Creating associated token account...');

      const createAtaInstruction = createAssociatedTokenAccountInstruction(
        this.wallet.getPublicKey(), // payer
        ata, // ata
        this.wallet.getPublicKey(), // owner
        this.tokenMint // mint
      );

      await this.wallet.sendTransaction([createAtaInstruction]);
      logger.success('Token account created');
    }

    return ata;
  }

  /**
   * Execute a buyback (purchase tokens with SOL)
   */
  async executeBuyback(solAmount: number): Promise<string | null> {
    try {
      // Check if token has graduated to Raydium
      const graduated = await this.pumpfun.hasGraduated();
      if (graduated) {
        logger.warn('Token has graduated to Raydium. Use Raydium for swaps.');
        // TODO: Implement Raydium swap for graduated tokens
        return null;
      }

      // Get bonding curve data for price calculation
      const curveData = await this.pumpfun.getBondingCurveData();
      if (!curveData) {
        logger.error('Could not fetch bonding curve data');
        return null;
      }

      // Calculate expected tokens with slippage
      const expectedTokens = this.pumpfun.calculateBuyAmount(solAmount, curveData);
      const minTokens = (expectedTokens * BigInt(10000 - this.config.slippageBps)) / BigInt(10000);

      logger.info(`Executing buyback of ${solAmount.toFixed(6)} SOL`);
      logger.info(`Expected tokens: ${expectedTokens.toString()}`);
      logger.info(`Minimum tokens (with ${this.config.slippageBps / 100}% slippage): ${minTokens.toString()}`);

      // Ensure token account exists
      const userTokenAccount = await this.getOrCreateTokenAccount();
      const bondingCurve = this.pumpfun.getBondingCurvePDA();
      const bondingCurveTokenAccount = this.pumpfun.getBondingCurveTokenAccount();

      // Build the buy instruction
      // Pump.fun buy instruction discriminator
      const discriminator = Buffer.from([
        0x66, 0x06, 0x3d, 0x12, 0x01, 0xda, 0xeb, 0xea // buy discriminator
      ]);

      // Encode the instruction data: discriminator + amount + min_tokens
      const solLamports = BigInt(solToLamports(solAmount));
      const instructionData = Buffer.alloc(8 + 8 + 8);
      discriminator.copy(instructionData, 0);
      instructionData.writeBigUInt64LE(solLamports, 8);
      instructionData.writeBigUInt64LE(minTokens, 16);

      const buyInstruction = new TransactionInstruction({
        programId: PUMPFUN_CONSTANTS.PROGRAM_ID,
        keys: [
          { pubkey: PUMPFUN_CONSTANTS.GLOBAL_STATE, isSigner: false, isWritable: false }, // global
          { pubkey: PUMPFUN_CONSTANTS.FEE_ACCOUNT, isSigner: false, isWritable: true }, // fee_recipient
          { pubkey: this.tokenMint, isSigner: false, isWritable: false }, // mint
          { pubkey: bondingCurve, isSigner: false, isWritable: true }, // bonding_curve
          { pubkey: bondingCurveTokenAccount, isSigner: false, isWritable: true }, // bonding_curve_token_account
          { pubkey: userTokenAccount, isSigner: false, isWritable: true }, // user_token_account
          { pubkey: this.wallet.getPublicKey(), isSigner: true, isWritable: true }, // user
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
          { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false }, // rent
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // associated_token_program
        ],
        data: instructionData,
      });

      const signature = await this.wallet.sendTransaction([buyInstruction]);
      logger.success(`Buyback executed successfully!`);
      logger.tx('Buyback transaction', signature);

      return signature;
    } catch (error) {
      logger.error('Buyback failed:', error);
      return null;
    }
  }

  /**
   * Execute automatic buyback with claimed fees
   * This is the main function that combines fee claiming and buying
   */
  async executeAutomaticBuyback(): Promise<{
    claimedSol: number;
    buybackTx: string | null;
  }> {
    logger.separator();
    logger.info('Starting automatic buyback cycle...');

    // Step 1: Check wallet balance
    const walletBalance = await this.wallet.getBalance();
    logger.info(`Wallet balance: ${walletBalance.toFixed(6)} SOL`);

    // Step 2: Get claimable fees
    const claimableFees = await this.pumpfun.getClaimableFees();
    logger.info(`Claimable fees: ${claimableFees.toFixed(6)} SOL`);

    let totalBuybackAmount = 0;

    // Step 3: Claim fees if available
    if (claimableFees >= 0.001) {
      const claimTx = await this.pumpfun.claimFees();
      if (claimTx) {
        totalBuybackAmount = claimableFees;
        // Wait a bit for the claim transaction to finalize
        await this.sleep(2000);
      }
    }

    // Step 4: Check if we have enough for a buyback
    if (totalBuybackAmount < this.config.minBuybackAmount) {
      logger.info(
        `Insufficient amount for buyback. Need ${this.config.minBuybackAmount} SOL, have ${totalBuybackAmount.toFixed(6)} SOL`
      );
      return { claimedSol: totalBuybackAmount, buybackTx: null };
    }

    // Step 5: Execute the buyback
    const buybackTx = await this.executeBuyback(totalBuybackAmount);

    logger.separator();
    return { claimedSol: totalBuybackAmount, buybackTx };
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
