import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.CROSSMINT_API_KEY; // Use the staging key you have
const walletAddress = process.env.SIGNER_WALLET_ADDRESS;
const walletSignerSecretKey = process.env.SIGNER_WALLET_SECRET_KEY;

if (!apiKey || !walletAddress || !walletSignerSecretKey) {
    console.log("❌ Missing environment variables:");
    console.log(`   CROSSMINT_API_KEY: ${apiKey ? '✅ Set' : '❌ Missing'}`);
    console.log(`   SIGNER_WALLET_ADDRESS: ${walletAddress ? '✅ Set' : '❌ Missing'}`);
    console.log(`   SIGNER_WALLET_SECRET_KEY: ${walletSignerSecretKey ? '✅ Set' : '❌ Missing'}`);
    throw new Error("Missing required environment variables");
}

console.log("🔄 Creating smart wallet...");
console.log(`🔑 Signer Address: ${walletAddress}`);
console.log(`🔐 API Key: ${apiKey.substring(0, 8)}...`);

(async () => {
    try {
        const response = await createWallet(walletAddress as `0x${string}`, apiKey);

        if (response.error) {
            console.error("❌ Error creating wallet:", response);
            return;
        }

        console.log("\n🎉 Smart Wallet Created Successfully!");
        console.log(`📍 Smart Wallet Address: ${response.address}`);
        console.log(`🔗 Linked to Signer: ${walletAddress}`);
        console.log("\n📋 Update your .env file with:");
        console.log(`SMART_WALLET_ADDRESS=${response.address}`);
        console.log("\n📄 Full Response:");
        console.log(JSON.stringify(response, null, 2));

    } catch (error) {
        console.error("❌ Error:", error);
    }
})();

async function createWallet(signerPublicKey: `0x${string}`, apiKey: string) {
    // Use staging API endpoint
    const response = await fetch("https://staging.crossmint.com/api/2022-06-09/wallets", {
        method: "POST",
        headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            type: "evm-smart-wallet",
            config: {
                adminSigner: {
                    type: "evm-keypair",
                    address: signerPublicKey,
                },
            },
        }),
    });

    return await response.json();
}
