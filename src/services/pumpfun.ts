import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { WalletManager } from '../utils/wallet';
import { PUMPFUN_CONSTANTS, BotConfig } from '../config';
import { logger } from '../utils/logger';

/**
 * Interface for bonding curve account data
 */
interface BondingCurveData {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
}

/**
 * PumpFun service for interacting with pump.fun protocol
 */
export class PumpFunService {
  private wallet: WalletManager;
  private config: BotConfig;
  private tokenMint: PublicKey;

  constructor(wallet: WalletManager, config: BotConfig) {
    this.wallet = wallet;
    this.config = config;
    this.tokenMint = new PublicKey(config.tokenMintAddress);
  }

  /**
   * Derive the bonding curve PDA for a token
   */
  getBondingCurvePDA(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from(PUMPFUN_CONSTANTS.BONDING_CURVE_SEED),
        this.tokenMint.toBuffer(),
      ],
      PUMPFUN_CONSTANTS.PROGRAM_ID
    );
    return pda;
  }

  /**
   * Derive the creator vault PDA for claiming fees
   */
  getCreatorVaultPDA(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from(PUMPFUN_CONSTANTS.CREATOR_VAULT_SEED),
        this.tokenMint.toBuffer(),
      ],
      PUMPFUN_CONSTANTS.PROGRAM_ID
    );
    return pda;
  }

  /**
   * Get the associated bonding curve token account
   */
  getBondingCurveTokenAccount(): PublicKey {
    const bondingCurve = this.getBondingCurvePDA();
    const [ata] = PublicKey.findProgramAddressSync(
      [
        bondingCurve.toBuffer(),
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA').toBuffer(),
        this.tokenMint.toBuffer(),
      ],
      new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
    );
    return ata;
  }

  /**
   * Check claimable creator fees from the creator vault
   */
  async getClaimableFees(): Promise<number> {
    try {
      const creatorVault = this.getCreatorVaultPDA();
      const connection = this.wallet.getConnection();

      // Get the balance of the creator vault
      const balance = await connection.getBalance(creatorVault);

      // Subtract rent-exempt minimum (approximately 0.00089 SOL for the account)
      const rentExempt = await connection.getMinimumBalanceForRentExemption(0);
      const claimable = Math.max(0, balance - rentExempt);

      logger.debug(`Creator vault balance: ${balance / LAMPORTS_PER_SOL} SOL`);
      logger.debug(`Claimable fees: ${claimable / LAMPORTS_PER_SOL} SOL`);

      return claimable / LAMPORTS_PER_SOL;
    } catch (error) {
      logger.error('Failed to get claimable fees:', error);
      return 0;
    }
  }

  /**
   * Claim accumulated creator fees from pump.fun
   *
   * Note: This creates the instruction to withdraw fees from the creator vault
   */
  async claimFees(): Promise<string | null> {
    try {
      const claimableSol = await this.getClaimableFees();

      if (claimableSol < 0.001) {
        logger.info('No significant fees to claim (less than 0.001 SOL)');
        return null;
      }

      logger.info(`Attempting to claim ${claimableSol.toFixed(6)} SOL in fees...`);

      const creatorVault = this.getCreatorVaultPDA();
      const bondingCurve = this.getBondingCurvePDA();

      // Create the claim instruction
      // Pump.fun uses instruction discriminator for withdraw_creator_fees
      const discriminator = Buffer.from([
        0x1a, 0x5b, 0x8c, 0x4d, 0x9e, 0x2f, 0x7a, 0x3b // withdraw_creator_fees discriminator
      ]);

      const instruction = new TransactionInstruction({
        programId: PUMPFUN_CONSTANTS.PROGRAM_ID,
        keys: [
          { pubkey: this.wallet.getPublicKey(), isSigner: true, isWritable: true }, // creator
          { pubkey: this.tokenMint, isSigner: false, isWritable: false }, // mint
          { pubkey: bondingCurve, isSigner: false, isWritable: true }, // bonding_curve
          { pubkey: creatorVault, isSigner: false, isWritable: true }, // creator_vault
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
        ],
        data: discriminator,
      });

      const signature = await this.wallet.sendTransaction([instruction]);
      logger.success(`Fees claimed successfully!`);
      logger.tx('Claim transaction', signature);

      return signature;
    } catch (error) {
      logger.error('Failed to claim fees:', error);
      return null;
    }
  }

  /**
   * Get the current bonding curve data for the token
   */
  async getBondingCurveData(): Promise<BondingCurveData | null> {
    try {
      const bondingCurve = this.getBondingCurvePDA();
      const connection = this.wallet.getConnection();

      const accountInfo = await connection.getAccountInfo(bondingCurve);
      if (!accountInfo) {
        logger.warn('Bonding curve account not found - token may have graduated to Raydium');
        return null;
      }

      // Parse bonding curve account data
      // Layout: discriminator(8) + virtualTokenReserves(8) + virtualSolReserves(8) +
      //         realTokenReserves(8) + realSolReserves(8) + tokenTotalSupply(8) + complete(1)
      const data = accountInfo.data;

      const virtualTokenReserves = data.readBigUInt64LE(8);
      const virtualSolReserves = data.readBigUInt64LE(16);
      const realTokenReserves = data.readBigUInt64LE(24);
      const realSolReserves = data.readBigUInt64LE(32);
      const tokenTotalSupply = data.readBigUInt64LE(40);
      const complete = data.readUInt8(48) === 1;

      return {
        virtualTokenReserves,
        virtualSolReserves,
        realTokenReserves,
        realSolReserves,
        tokenTotalSupply,
        complete,
      };
    } catch (error) {
      logger.error('Failed to get bonding curve data:', error);
      return null;
    }
  }

  /**
   * Calculate the amount of tokens received for a given SOL amount
   */
  calculateBuyAmount(solAmount: number, curveData: BondingCurveData): bigint {
    const solLamports = BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));

    // AMM formula: tokens_out = (sol_in * virtual_token_reserves) / (virtual_sol_reserves + sol_in)
    const tokensOut =
      (solLamports * curveData.virtualTokenReserves) /
      (curveData.virtualSolReserves + solLamports);

    return tokensOut;
  }

  /**
   * Check if the token has graduated to Raydium
   */
  async hasGraduated(): Promise<boolean> {
    const curveData = await this.getBondingCurveData();
    if (!curveData) {
      return true; // Assume graduated if we can't find the bonding curve
    }
    return curveData.complete;
  }
}
