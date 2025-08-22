// --- 1. IMPORTAÇÕES E CONFIGURAÇÃO INICIAL ---
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const axios = require('axios');

// --- INICIALIZAÇÃO DO FIREBASE ADMIN ---
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// --- CONFIGURAÇÕES DA API DA META ---
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

async function sendWhatsAppNotification(to, templateName, templateParams = []) {
    let formattedTo = to.replace(/\D/g, '');
    if (formattedTo.length === 11 && !formattedTo.startsWith('55')) {
        formattedTo = `55${formattedTo}`;
    }

    const url = `https://graph.facebook.com/v19.0/${META_PHONE_NUMBER_ID}/messages`;

    const data = {
        messaging_product: "whatsapp",
        to: formattedTo,
        type: "template",
        template: {
            name: templateName,
            language: { code: "pt_BR" },
            components: templateParams
        }
    };

    try {
        await axios.post(url, data, {
            headers: {
                'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        console.log("Notificação enviada com sucesso!");
    } catch (error) {
        console.error("Erro ao enviar notificação do WhatsApp:", error.response ? error.response.data : error.message);
    }
}

app.get('/', (req, res) => {
    res.send('API do Açaí do Heitor está funcionando!');
});

app.get('/orders', async (req, res) => {
    try {
        const ordersSnapshot = await db.collection('orders').orderBy('timestamp', 'desc').get();
        const orders = [];
        ordersSnapshot.forEach(doc => {
            orders.push({ id: doc.id, data: doc.data() });
        });
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar pedidos." });
    }
});

app.post('/orders', async (req, res) => {
    try {
        const orderData = req.body;
        const newOrder = {
            ...orderData,
            orderId: Date.now().toString().slice(-6),
            status: 'novo',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await db.collection('orders').add(newOrder);
        res.status(201).json({ message: 'Pedido criado com sucesso!', id: docRef.id, data: newOrder });
    } catch (error) {
        res.status(500).json({ error: "Erro ao criar pedido." });
    }
});

app.patch('/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const orderRef = db.collection('orders').doc(id);
        const doc = await orderRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: "Pedido não encontrado." });
        }
        
        await orderRef.update({ status: status });
        
        // Notificações via WhatsApp desativadas conforme solicitado.
        /*
        const orderData = doc.data();
        const customerName = (orderData.customer && orderData.customer.name) ? orderData.customer.name : orderData.customerName;
        const customerPhone = (orderData.customer && orderData.customer.phone) ? orderData.customer.phone : orderData.customerPhone;

        if (status === 'preparo' && customerName && customerPhone) {
            const firstName = customerName.split(' ')[0];
            const params = [{ type: "body", parameters: [{ type: "text", text: firstName }, { type: "text", text: orderData.orderId }] }];
            await sendWhatsAppNotification(customerPhone, 'pedido_em_preparo', params);
        }
        */
        
        res.status(200).json({ message: `Pedido ${id} atualizado com sucesso!` });
    } catch (error) {
        res.status(500).json({ error: "Erro ao atualizar pedido." });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});