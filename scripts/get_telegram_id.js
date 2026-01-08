const axios = require('axios');
require('dotenv').config(); // Load from current directory (root)

const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) {
    console.error("❌ No TELEGRAM_TOKEN found in .env");
    process.exit(1);
}

const BASE_URL = `https://api.telegram.org/bot${TOKEN}`;

async function main() {
    try {
        console.log("🔄 Deleting webhook to enable getUpdates...");
        await axios.post(`${BASE_URL}/deleteWebhook`);
        console.log("✅ Webhook deleted.");

        console.log("⏳ Waiting for messages... Send 'Hello' to your bot now!");
        
        // Poll for updates
        const res = await axios.get(`${BASE_URL}/getUpdates`);
        const updates = res.data.result;

        if (updates.length > 0) {
            console.log("\n📬 Received updates:");
            updates.forEach(u => {
                if (u.message) {
                    console.log(`\n👤 User: ${u.message.from.first_name} (${u.message.from.username})`);
                    console.log(`🆔 Chat ID: ${u.message.chat.id}`);
                    console.log(`DO THIS: Add TELEGRAM_CHAT_ID=${u.message.chat.id} to your .env file.`);
                }
            });
        } else {
            console.log("📭 No messages found yet. Please message the bot and run this script again.");
        }

    } catch (e) {
        console.error("❌ Error:", e.message);
        if (e.response) console.error(e.response.data);
    }
}

main();
