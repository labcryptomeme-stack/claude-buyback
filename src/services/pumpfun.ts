import {
  PublicKey,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import axios from 'axios';
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
 * PumpPortal API response for transaction
 */
interface PumpPortalResponse {
  transaction?: string;
  error?: string;
}

/**
 * PumpFun service for interacting with pump.fun protocol via PumpPortal API
 */
export class PumpFunService {
  private wallet: WalletManager;
  private config: BotConfig;
  private tokenMint: PublicKey;

  // PumpPortal API endpoint
  private readonly PUMPPORTAL_API = 'https://pumpportal.fun/api/trade-local';

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
   * Check claimable creator fees using pump.fun website API
   * Note: This checks all fees across all tokens created by this wallet
   */
  async getClaimableFees(): Promise<number> {
    try {
      const walletAddress = this.wallet.getPublicKey().toBase58();

      // Try to get fee info from pump.fun API
      const response = await axios.get(
        `https://frontend-api.pump.fun/creators/${walletAddress}/fees`,
        {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: 10000,
        }
      );

      if (response.data && typeof response.data.claimable === 'number') {
        const claimableSol = response.data.claimable / LAMPORTS_PER_SOL;
        logger.debug(`Claimable fees from API: ${claimableSol} SOL`);
        return claimableSol;
      }

      // Fallback: return -1 to indicate we should try claiming anyway
      logger.debug('Could not fetch claimable fees, will attempt claim');
      return -1;
    } catch (error) {
      // API might not be available, try claiming anyway
      logger.debug('Fee check API not available, will attempt claim');
      return -1;
    }
  }

  /**
   * Claim accumulated creator fees from pump.fun using PumpPortal API
   * Note: pump.fun claims ALL fees at once, not per-token
   */
  async claimFees(): Promise<{ signature: string; amount: number } | null> {
    try {
      logger.info('Attempting to claim creator fees via PumpPortal API...');

      // Get transaction from PumpPortal
      const response = await axios.post<string>(
        this.PUMPPORTAL_API,
        {
          publicKey: this.wallet.getPublicKey().toBase58(),
          action: 'collectCreatorFee',
          pool: 'pump',
          priorityFee: this.config.usePriorityFee
            ? this.config.priorityFeeMicroLamports / 1_000_000
            : 0.0001,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 30000,
        }
      );

      // Decode the transaction
      const txBuffer = Buffer.from(response.data);

      // Try to deserialize as VersionedTransaction first
      let signature: string;
      const connection = this.wallet.getConnection();
      const balanceBefore = await connection.getBalance(this.wallet.getPublicKey());

      try {
        const versionedTx = VersionedTransaction.deserialize(txBuffer);
        versionedTx.sign([this.wallet.getKeypair()]);
        signature = await connection.sendTransaction(versionedTx, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
      } catch {
        // Fallback to legacy transaction
        const legacyTx = Transaction.from(txBuffer);
        legacyTx.sign(this.wallet.getKeypair());
        signature = await connection.sendRawTransaction(legacyTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
      }

      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');

      // Calculate claimed amount
      const balanceAfter = await connection.getBalance(this.wallet.getPublicKey());
      const claimedAmount = (balanceAfter - balanceBefore) / LAMPORTS_PER_SOL;

      logger.success(`Fees claimed successfully! Amount: ~${claimedAmount.toFixed(6)} SOL`);
      logger.tx('Claim transaction', signature);

      return { signature, amount: Math.max(0, claimedAmount) };
    } catch (error: any) {
      if (error.response) {
        const errorText = Buffer.from(error.response.data).toString();
        if (errorText.includes('no fees') || errorText.includes('No fees')) {
          logger.info('No fees available to claim');
          return null;
        }
        logger.error('PumpPortal API error:', errorText);
      } else {
        logger.error('Failed to claim fees:', error.message || error);
      }
      return null;
    }
  }

  /**
   * Buy tokens using PumpPortal API
   */
  async buyTokens(solAmount: number): Promise<string | null> {
    try {
      logger.info(`Buying tokens with ${solAmount.toFixed(6)} SOL via PumpPortal API...`);

      // Get transaction from PumpPortal
      const response = await axios.post<string>(
        this.PUMPPORTAL_API,
        {
          publicKey: this.wallet.getPublicKey().toBase58(),
          action: 'buy',
          mint: this.tokenMint.toBase58(),
          amount: solAmount,
          denominatedInSol: 'true',
          slippage: this.config.slippageBps / 100, // Convert bps to percentage
          priorityFee: this.config.usePriorityFee
            ? this.config.priorityFeeMicroLamports / 1_000_000
            : 0.0001,
          pool: 'pump',
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 30000,
        }
      );

      // Decode the transaction
      const txBuffer = Buffer.from(response.data);
      const connection = this.wallet.getConnection();
      let signature: string;

      try {
        const versionedTx = VersionedTransaction.deserialize(txBuffer);
        versionedTx.sign([this.wallet.getKeypair()]);
        signature = await connection.sendTransaction(versionedTx, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
      } catch {
        // Fallback to legacy transaction
        const legacyTx = Transaction.from(txBuffer);
        legacyTx.sign(this.wallet.getKeypair());
        signature = await connection.sendRawTransaction(legacyTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });
      }

      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');

      logger.success(`Tokens purchased successfully!`);
      logger.tx('Buy transaction', signature);

      return signature;
    } catch (error: any) {
      if (error.response) {
        const errorText = Buffer.from(error.response.data).toString();
        logger.error('PumpPortal API error:', errorText);
      } else {
        logger.error('Failed to buy tokens:', error.message || error);
      }
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
