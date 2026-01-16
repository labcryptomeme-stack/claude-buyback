/**
 * Pump.fun Automatic Buyback Bot
 *
 * This bot automatically:
 * 1. Claims creator fees from pump.fun
 * 2. Uses those fees to buy back your token
 *
 * Perfect for token creators who want to support their token price
 * by reinvesting trading fees into buybacks.
 */

import cron from 'node-cron';
import { loadConfig } from './config';
import { WalletManager } from './utils/wallet';
import { PumpFunService } from './services/pumpfun';
import { BuybackService } from './services/buyback';
import { logger } from './utils/logger';

// Statistics tracking
interface BotStats {
  totalClaimed: number;
  totalBuybacks: number;
  successfulBuybacks: number;
  failedBuybacks: number;
  startTime: Date;
}

const stats: BotStats = {
  totalClaimed: 0,
  totalBuybacks: 0,
  successfulBuybacks: 0,
  failedBuybacks: 0,
  startTime: new Date(),
};

/**
 * Display current bot statistics
 */
function displayStats(): void {
  const uptime = Math.floor((Date.now() - stats.startTime.getTime()) / 1000 / 60);
  logger.info('=== Bot Statistics ===');
  logger.info(`Uptime: ${uptime} minutes`);
  logger.info(`Total SOL claimed: ${stats.totalClaimed.toFixed(6)} SOL`);
  logger.info(`Total buyback attempts: ${stats.totalBuybacks}`);
  logger.info(`Successful buybacks: ${stats.successfulBuybacks}`);
  logger.info(`Failed buybacks: ${stats.failedBuybacks}`);
}

/**
 * Main entry point for the buyback bot
 */
async function main(): Promise<void> {
  logger.banner();
  logger.info('Initializing Pump.fun Buyback Bot...');

  // Load configuration
  let config;
  try {
    config = loadConfig();
    logger.success('Configuration loaded successfully');
  } catch (error) {
    logger.error('Failed to load configuration:', error);
    process.exit(1);
  }

  // Initialize wallet
  let wallet;
  try {
    wallet = new WalletManager(config);
    const balance = await wallet.getBalance();
    logger.success(`Wallet connected with ${balance.toFixed(6)} SOL`);
  } catch (error) {
    logger.error('Failed to initialize wallet:', error);
    process.exit(1);
  }

  // Initialize services
  const pumpfunService = new PumpFunService(wallet, config);
  const buybackService = new BuybackService(wallet, config, pumpfunService);

  // Display configuration
  logger.separator();
  logger.info('Configuration:');
  logger.info(`  Token Mint: ${config.tokenMintAddress}`);
  logger.info(`  Min Buyback Amount: ${config.minBuybackAmount} SOL`);
  logger.info(`  Check Interval: ${config.checkIntervalMinutes} minutes`);
  logger.info(`  Slippage: ${config.slippageBps / 100}%`);
  logger.info(`  Priority Fees: ${config.usePriorityFee ? 'Enabled' : 'Disabled'}`);
  logger.separator();

  // Check if token has graduated
  const graduated = await pumpfunService.hasGraduated();
  if (graduated) {
    logger.warn('Token has graduated to Raydium!');
    logger.warn('This bot currently only supports tokens on the pump.fun bonding curve.');
    logger.warn('Raydium support coming soon...');
  }

  // Run initial buyback cycle
  logger.info('Running initial buyback cycle...');
  await runBuybackCycle(buybackService);

  // Schedule recurring buyback cycles
  const cronExpression = `*/${config.checkIntervalMinutes} * * * *`;
  logger.info(`Scheduling buyback cycles every ${config.checkIntervalMinutes} minutes`);

  cron.schedule(cronExpression, async () => {
    await runBuybackCycle(buybackService);
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logger.separator();
    logger.info('Shutting down...');
    displayStats();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.separator();
    logger.info('Shutting down...');
    displayStats();
    process.exit(0);
  });

  logger.success('Bot is now running! Press Ctrl+C to stop.');
}

/**
 * Run a single buyback cycle
 */
async function runBuybackCycle(buybackService: BuybackService): Promise<void> {
  try {
    const result = await buybackService.executeAutomaticBuyback();

    // Update statistics
    stats.totalClaimed += result.claimedSol;

    if (result.buybackTx) {
      stats.totalBuybacks++;
      stats.successfulBuybacks++;
    } else if (result.claimedSol >= 0.01) {
      // We had enough to try but it failed
      stats.totalBuybacks++;
      stats.failedBuybacks++;
    }
  } catch (error) {
    logger.error('Error in buyback cycle:', error);
    stats.failedBuybacks++;
  }
}

// Run the bot
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
