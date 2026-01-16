import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { WalletManager } from '../utils/wallet';
import { BotConfig } from '../config';
import { PumpFunService } from './pumpfun';
import { logger } from '../utils/logger';

/**
 * Buyback service for executing token purchases on pump.fun
 */
export class BuybackService {
  private wallet: WalletManager;
  private config: BotConfig;
  private pumpfun: PumpFunService;

  constructor(wallet: WalletManager, config: BotConfig, pumpfun: PumpFunService) {
    this.wallet = wallet;
    this.config = config;
    this.pumpfun = pumpfun;
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

    // Step 2: Try to get claimable fees info
    const claimableFees = await this.pumpfun.getClaimableFees();
    if (claimableFees >= 0) {
      logger.info(`Claimable fees: ${claimableFees.toFixed(6)} SOL`);
    } else {
      logger.info('Claimable fees: checking via claim attempt...');
    }

    // Step 3: Attempt to claim fees
    const claimResult = await this.pumpfun.claimFees();

    if (!claimResult) {
      logger.info('No fees claimed in this cycle');
      return { claimedSol: 0, buybackTx: null };
    }

    const claimedAmount = claimResult.amount;
    logger.info(`Claimed ${claimedAmount.toFixed(6)} SOL in fees`);

    // Step 4: Wait a moment for balance to update
    await this.sleep(2000);

    // Step 5: Check if we have enough for a buyback
    if (claimedAmount < this.config.minBuybackAmount) {
      logger.info(
        `Claimed amount (${claimedAmount.toFixed(6)} SOL) is below minimum buyback threshold (${this.config.minBuybackAmount} SOL)`
      );
      logger.info('Fees claimed but no buyback executed. Will accumulate for next cycle.');
      return { claimedSol: claimedAmount, buybackTx: null };
    }

    // Step 6: Execute the buyback
    logger.info(`Executing buyback with ${claimedAmount.toFixed(6)} SOL...`);
    const buybackTx = await this.pumpfun.buyTokens(claimedAmount);

    if (buybackTx) {
      logger.success(`Buyback cycle completed successfully!`);
    } else {
      logger.warn('Buyback transaction failed, but fees were claimed');
    }

    logger.separator();
    return { claimedSol: claimedAmount, buybackTx };
  }

  /**
   * Execute buyback with a specific SOL amount (manual trigger)
   */
  async executeBuybackWithAmount(solAmount: number): Promise<string | null> {
    logger.info(`Manual buyback triggered with ${solAmount.toFixed(6)} SOL`);

    // Check if we have sufficient balance
    const balance = await this.wallet.getBalance();
    if (balance < solAmount + 0.01) {
      logger.error(`Insufficient balance. Have ${balance.toFixed(6)} SOL, need ${(solAmount + 0.01).toFixed(6)} SOL`);
      return null;
    }

    return await this.pumpfun.buyTokens(solAmount);
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
