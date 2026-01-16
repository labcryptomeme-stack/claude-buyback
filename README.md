# Pump.fun Automatic Buyback Bot

An open-source bot that automatically claims creator fees from pump.fun and uses them to buy back your token. Perfect for meme token creators who want to support their token price by reinvesting trading fees.

## Features

- **Automatic Fee Claiming**: Monitors and claims accumulated creator fees from pump.fun
- **Automatic Buyback**: Uses claimed fees to purchase your token from the bonding curve
- **Configurable Intervals**: Set custom check intervals for fee claiming
- **Slippage Protection**: Configurable slippage tolerance to protect against price impact
- **Priority Fees**: Optional priority fees for faster transaction confirmation
- **Statistics Tracking**: Tracks total claimed fees and buyback history
- **Graceful Shutdown**: Clean shutdown with statistics display

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     Pump.fun Buyback Bot                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   1. Check Creator Vault  ──►  2. Claim Fees (if available)    │
│                                        │                        │
│                                        ▼                        │
│   4. Repeat on Schedule  ◄──  3. Execute Buyback               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

1. The bot periodically checks the creator vault for claimable fees
2. If fees are available, it claims them to your wallet
3. The claimed SOL is then used to buy back your token on pump.fun
4. Process repeats on the configured schedule

## Prerequisites

- Node.js 18.0.0 or higher
- A Solana wallet with SOL for transaction fees
- A token created on pump.fun (you must be the creator)
- A reliable Solana RPC endpoint (recommended: Helius, QuickNode)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/labcryptomeme-stack/claude-buyback.git
cd claude-buyback
```

2. Install dependencies:
```bash
npm install
```

3. Copy the environment example file:
```bash
cp .env.example .env
```

4. Edit `.env` with your configuration (see Configuration section below)

5. Build the project:
```bash
npm run build
```

6. Run the bot:
```bash
npm start
```

For development:
```bash
npm run dev
```

## Configuration

Create a `.env` file based on `.env.example`:

| Variable | Description | Default |
|----------|-------------|---------|
| `SOLANA_RPC_ENDPOINT` | Solana RPC endpoint URL | Required |
| `WALLET_PRIVATE_KEY` | Your wallet's private key (base58 or JSON array) | Required |
| `TOKEN_MINT_ADDRESS` | The mint address of your pump.fun token | Required |
| `MIN_BUYBACK_AMOUNT` | Minimum SOL to trigger a buyback | `0.01` |
| `CHECK_INTERVAL_MINUTES` | How often to check for fees (minutes) | `5` |
| `SLIPPAGE_BPS` | Slippage tolerance in basis points (500 = 5%) | `500` |
| `USE_PRIORITY_FEE` | Enable priority fees | `false` |
| `PRIORITY_FEE_MICRO_LAMPORTS` | Priority fee amount | `50000` |
| `DEBUG` | Enable debug logging | `false` |

### Example Configuration

```env
SOLANA_RPC_ENDPOINT=https://api.mainnet-beta.solana.com
WALLET_PRIVATE_KEY=5your...privatekey...here
TOKEN_MINT_ADDRESS=YourTokenMintAddressHere
MIN_BUYBACK_AMOUNT=0.05
CHECK_INTERVAL_MINUTES=10
SLIPPAGE_BPS=300
USE_PRIORITY_FEE=true
PRIORITY_FEE_MICRO_LAMPORTS=100000
```

## Security Considerations

1. **Never share your private key** - The private key in `.env` should never be committed to git or shared
2. **Use a dedicated wallet** - Create a separate wallet for the bot with only the necessary SOL
3. **Secure your server** - If running on a VPS, ensure proper security measures
4. **Monitor transactions** - Regularly check transaction history on Solscan

## Project Structure

```
claude-buyback/
├── src/
│   ├── index.ts              # Main entry point
│   ├── config.ts             # Configuration management
│   ├── services/
│   │   ├── pumpfun.ts        # Pump.fun interaction service
│   │   └── buyback.ts        # Buyback execution service
│   └── utils/
│       ├── wallet.ts         # Wallet management utilities
│       └── logger.ts         # Logging utilities
├── .env.example              # Environment variables template
├── .gitignore               # Git ignore rules
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
└── README.md                # This file
```

## Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run build` | Build TypeScript to JavaScript |
| `npm start` | Run the compiled bot |
| `npm run dev` | Run in development mode with ts-node |
| `npm run clean` | Remove build artifacts |

## API Reference

### PumpFunService

- `getClaimableFees()` - Check available fees in creator vault
- `claimFees()` - Claim accumulated creator fees
- `getBondingCurveData()` - Get current bonding curve state
- `hasGraduated()` - Check if token has graduated to Raydium

### BuybackService

- `executeBuyback(solAmount)` - Execute a token buyback
- `executeAutomaticBuyback()` - Run full claim + buyback cycle

## Limitations

- Currently only supports tokens still on the pump.fun bonding curve
- Tokens that have graduated to Raydium require a different swap mechanism (coming soon)
- Requires you to be the token creator to claim fees

## Troubleshooting

### "Missing required environment variable"
Make sure all required variables in `.env` are set correctly.

### "Invalid private key format"
The private key must be either:
- Base58 encoded string
- JSON array of bytes (e.g., `[1,2,3,...]`)

### "Bonding curve account not found"
Your token may have graduated to Raydium. Check on pump.fun.

### "No significant fees to claim"
Trading fees accumulate slowly. Wait for more trading activity.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Disclaimer

This software is provided "as is" without warranty of any kind. Use at your own risk. The authors are not responsible for any financial losses incurred through the use of this bot. Always verify transactions before executing them and never invest more than you can afford to lose.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you find this project useful, consider:
- Starring the repository
- Sharing with other token creators
- Contributing to the codebase

## Links

- [Pump.fun](https://pump.fun)
- [Solana Documentation](https://docs.solana.com)
- [GitHub Repository](https://github.com/labcryptomeme-stack/claude-buyback)
