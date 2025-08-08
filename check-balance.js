// Quick script to check your smart wallet balance
require('dotenv').config();
const { ethers } = require('ethers');

async function checkBalance() {
    try {
        // Use the smart wallet address from environment
        const smartWalletAddress = process.env.SMART_WALLET_ADDRESS;
        const rpcUrl = process.env.RPC_PROVIDER_URL || "https://sepolia.base.org";

        if (!smartWalletAddress) {
            console.log("❌ SMART_WALLET_ADDRESS not found in .env file");
            return;
        }

        const provider = new ethers.JsonRpcProvider(rpcUrl);

        // Check ETH balance
        const ethBalance = await provider.getBalance(smartWalletAddress);
        const ethFormatted = ethers.formatEther(ethBalance);

        console.log("🏦 Smart Wallet Balance Check:");
        console.log(`📍 Address: ${smartWalletAddress}`);
        console.log(`⚡ ETH Balance: ${ethFormatted} ETH`);

        // USDC contract address on Base Sepolia
        const usdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC
        const usdcAbi = [
            "function balanceOf(address owner) view returns (uint256)",
            "function decimals() view returns (uint8)"
        ];

        const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, provider);
        const usdcBalance = await usdcContract.balanceOf(smartWalletAddress);
        const decimals = await usdcContract.decimals();
        const usdcFormatted = ethers.formatUnits(usdcBalance, decimals);

        console.log(`💰 USDC Balance: ${usdcFormatted} USDC`);

        if (parseFloat(ethFormatted) < 0.01) {
            console.log("\n⚠️  Low ETH balance! You need ETH for gas fees.");
            console.log("🚰 Get free ETH from: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet");
        }

        if (parseFloat(usdcFormatted) < 10) {
            console.log("\n⚠️  Low USDC balance! You need USDC for purchases.");
            console.log("🚰 Get free USDC from: https://faucet.circle.com/");
        }

    } catch (error) {
        console.error("❌ Error checking balance:", error.message);
        console.log("\n💡 Make sure to set your environment variables:");
        console.log("SMART_WALLET_ADDRESS=your-crossmint-smart-wallet-address");
        console.log("RPC_PROVIDER_URL=https://sepolia.base.org");
    }
}

checkBalance();
