// --- 1. IMPORTAÇÕES E CONFIGURAÇÃO INICIAL ---
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// --- INICIALIZAÇÃO DO FIREBASE ADMIN ---
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- ROTAS DA API ---

app.get('/', (req, res) => {
    res.send('API do Açaí do Heitor está funcionando!');
});

// Rota para o PAINEL DE NOTAS buscar TODOS os pedidos
app.get('/orders', async (req, res) => {
    try {
        const ordersSnapshot = await db.collection('pedidos').orderBy('timestamp', 'desc').get();
        const orders = [];
        ordersSnapshot.forEach(doc => {
            orders.push({ id: doc.id, data: doc.data() });
        });
        res.status(200).json(orders);
    } catch (error) {
        console.error("Erro ao buscar todos os pedidos:", error);
        res.status(500).json({ error: "Erro ao buscar pedidos." });
    }
});

// Rota para o CLIENTE buscar o status de UM pedido específico pelo ID
app.get('/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const orderRef = db.collection('pedidos').doc(id);
        const doc = await orderRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: "Pedido não encontrado." });
        }
        
        // ======================= INÍCIO DA ALTERAÇÃO =======================
        // Agora, além do status e orderId, também retornamos o deliveryMode.
        // Isso é crucial para que o site do cliente saiba qual timeline mostrar.
        res.status(200).json({
            status: doc.data().status,
            orderId: doc.data().orderId,
            deliveryMode: doc.data().deliveryMode 
        });
        // ======================== FIM DA ALTERAÇÃO =========================

    } catch (error) {
        console.error(`Erro ao buscar pedido ${req.params.id}:`, error);
        res.status(500).json({ error: "Erro ao buscar o pedido." });
    }
});

// Rota para o CLIENTE criar um novo pedido
app.post('/orders', async (req, res) => {
    try {
        const orderData = req.body;
        const newOrder = {
            ...orderData,
            orderId: Date.now().toString().slice(-6),
            status: 'novo',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };
        const docRef = await db.collection('pedidos').add(newOrder);
        res.status(201).json({ message: 'Pedido criado com sucesso!', id: docRef.id, data: newOrder });
    } catch (error) {
        console.error("Erro ao criar pedido:", error);
        res.status(500).json({ error: "Erro ao criar pedido." });
    }
});

// Rota para o PAINEL DE NOTAS atualizar o status de um pedido
app.patch('/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const orderRef = db.collection('pedidos').doc(id);
        const doc = await orderRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: "Pedido não encontrado." });
        }
        
        await orderRef.update({ status: status });
        
        res.status(200).json({ message: `Pedido ${id} atualizado com sucesso!` });
    } catch (error) {
        console.error(`Erro ao atualizar pedido ${req.params.id}:`, error);
        res.status(500).json({ error: "Erro ao atualizar pedido." });
    }
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});