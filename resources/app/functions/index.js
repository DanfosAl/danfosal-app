const functions = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const express = require('express');

admin.initializeApp();
const db = admin.firestore();
const app = express();
app.use(express.json());

// Instagram Webhook Verification
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = 'your_custom_verify_token'; // Replace with the one used in Meta dashboard
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified');
    return res.status(200).send(challenge);
  } else {
    console.warn('❌ Webhook verification failed');
    return res.sendStatus(403);
  }
});

// Instagram Webhook Event Handler
app.post('/webhook', async (req, res) => {
  try {
    const entries = req.body.entry;

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const { field, value } = change;

        if (field === 'conversations') {
          const message = value?.messages?.[0]?.text?.trim() || '';
          const senderName = value?.participants?.[0]?.name || 'Unknown';

          if (message === '/.') {
            console.log(`📥 Command received from: ${senderName}`);

            await db.collection('onlineOrders').add({
              clientName: senderName,
              telephone: '',
              address: '',
              status: 'Ordered',
              price: '0',
              createdAt: new Date(),
              items: [
                {
                  name: 'Manual entry',
                  quantity: 1
                }
              ]
            });
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.sendStatus(500);
  }
});


// =================================================================
// **NEW ENDPOINT FOR YOUR INTELLIGENT CHATBOT**
// This is the "hook" your new chatbot will send structured lead data to.
// =================================================================
app.post('/api/new-lead', async (req, res) => {
  try {
    const leadData = req.body;

    // Basic validation to make sure we have the data we need
    if (!leadData || !leadData.contact || !leadData.product) {
      console.warn('⚠️ Received incomplete lead data from chatbot:', leadData);
      return res.status(400).send('Incomplete lead data');
    }

    console.log('✅ Received new lead from chatbot:', leadData);

    // Create a new order in your Firestore database from the chatbot's data
    await db.collection('onlineOrders').add({
      clientName: leadData.name || 'Unknown',
      telephone: leadData.contact,
      address: '', // Address can be filled in later by a human agent
      status: 'New Lead', // Set a specific status for chatbot leads
      price: '0', // Price can be confirmed by a human agent
      createdAt: new Date(),
      items: [
        {
          name: leadData.product,
          quantity: 1
        }
      ]
    });

    return res.status(201).send('Lead created successfully');

  } catch (error) {
    console.error('❌ Error creating new lead from chatbot:', error);
    return res.sendStatus(500);
  }
});


// Deploy the Express app as a single Firebase Function
exports.instagramWebhook = functions.onRequest({
  region: 'us-central1',
  cpu: 1,
  memory: '256MiB',
}, app);
