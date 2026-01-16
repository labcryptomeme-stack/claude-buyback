/**
 * Simple logger utility for the buyback bot
 * Provides colored console output with timestamps
 */

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

/**
 * Get current timestamp in ISO format
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Logger class with different log levels
 */
export const logger = {
  /**
   * Log informational messages (blue)
   */
  info: (message: string, ...args: unknown[]): void => {
    console.log(
      `${colors.blue}[${getTimestamp()}] [INFO]${colors.reset} ${message}`,
      ...args
    );
  },

  /**
   * Log success messages (green)
   */
  success: (message: string, ...args: unknown[]): void => {
    console.log(
      `${colors.green}[${getTimestamp()}] [SUCCESS]${colors.reset} ${message}`,
      ...args
    );
  },

  /**
   * Log warning messages (yellow)
   */
  warn: (message: string, ...args: unknown[]): void => {
    console.log(
      `${colors.yellow}[${getTimestamp()}] [WARN]${colors.reset} ${message}`,
      ...args
    );
  },

  /**
   * Log error messages (red)
   */
  error: (message: string, ...args: unknown[]): void => {
    console.log(
      `${colors.red}[${getTimestamp()}] [ERROR]${colors.reset} ${message}`,
      ...args
    );
  },

  /**
   * Log debug messages (magenta) - only shown if DEBUG env var is set
   */
  debug: (message: string, ...args: unknown[]): void => {
    if (process.env.DEBUG === 'true') {
      console.log(
        `${colors.magenta}[${getTimestamp()}] [DEBUG]${colors.reset} ${message}`,
        ...args
      );
    }
  },

  /**
   * Log transaction-related messages (cyan)
   */
  tx: (message: string, signature?: string): void => {
    const txLink = signature
      ? `https://solscan.io/tx/${signature}`
      : '';
    console.log(
      `${colors.cyan}[${getTimestamp()}] [TX]${colors.reset} ${message}`,
      txLink ? `\n    ${txLink}` : ''
    );
  },

  /**
   * Log a separator line for visual clarity
   */
  separator: (): void => {
    console.log(`${colors.white}${'='.repeat(60)}${colors.reset}`);
  },

  /**
   * Log bot startup banner
   */
  banner: (): void => {
    console.log(`
${colors.cyan}
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██████╗ ██╗   ██╗██╗   ██╗██████╗  █████╗  ██████╗██╗  ██╗  ║
║   ██╔══██╗██║   ██║╚██╗ ██╔╝██╔══██╗██╔══██╗██╔════╝██║ ██╔╝  ║
║   ██████╔╝██║   ██║ ╚████╔╝ ██████╔╝███████║██║     █████╔╝   ║
║   ██╔══██╗██║   ██║  ╚██╔╝  ██╔══██╗██╔══██║██║     ██╔═██╗   ║
║   ██████╔╝╚██████╔╝   ██║   ██████╔╝██║  ██║╚██████╗██║  ██╗  ║
║   ╚═════╝  ╚═════╝    ╚═╝   ╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝  ║
║                                                           ║
║           Pump.fun Automatic Buyback Bot                  ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
${colors.reset}`);
  },
};
