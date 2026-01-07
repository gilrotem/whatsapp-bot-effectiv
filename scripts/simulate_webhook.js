const axios = require('axios');

async function simulateWebhook() {
    try {
        const payload = {
            object: "whatsapp_business_account",
            entry: [{
                id: "123456789",
                changes: [{
                    value: {
                        messaging_product: "whatsapp",
                        metadata: {
                            display_phone_number: "123456789",
                            phone_number_id: "945758331953624" // The REAL Phone ID from .env
                        },
                        contacts: [{
                            profile: { name: "Simulated User" },
                            wa_id: "972547462208" // The USER'S real number
                        }],
                        messages: [{
                            from: "972547462208", // The USER'S real number
                            id: "wamid.simulated_test",
                            timestamp: Math.floor(Date.now() / 1000),
                            text: { body: "בדיקת סימולציה מקומית" },
                            type: "text"
                        }]
                    },
                    field: "messages"
                }]
            }]
        };

        console.log('Simulating incoming webhook POST to http://localhost:3002/webhook...');
        await axios.post('http://localhost:3002/webhook', payload);
        console.log('Simulation POST sent successfully.');

    } catch (error) {
        console.error('Simulation Failed:', error.message);
    }
}

simulateWebhook();