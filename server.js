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

// --- ALTERAÇÃO ESTRATÉGICA ---
// Rota OTIMIZADA para o PAINEL DE NOTAS buscar apenas os pedidos ATIVOS.
// Esta será a rota mais usada pelo painel, reduzindo drasticamente as leituras.
app.get('/active-orders', async (req, res) => {
    try {
        // Usamos 'in' para buscar múltiplos status. O Firestore pode pedir um índice para isso.
        const activeStatuses = ['novo', 'preparo', 'entrega', 'pronto_retirada'];
        const ordersSnapshot = await db.collection('pedidos')
                                     .where('status', 'in', activeStatuses)
                                     .orderBy('timestamp', 'asc') // Ordena do mais antigo para o mais novo
                                     .get();
        const orders = [];
        ordersSnapshot.forEach(doc => {
            orders.push({ id: doc.id, data: doc.data() });
        });
        res.status(200).json(orders);
    } catch (error) {
        console.error("Erro ao buscar pedidos ativos:", error);
        res.status(500).json({ error: "Erro ao buscar pedidos ativos." });
    }
});


// --- NOVA ROTA ESTRATÉGICA ---
// Rota para calcular as estatísticas do Dashboard. O painel só consome o resultado.
app.get('/dashboard-stats', async (req, res) => {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Busca apenas os pedidos de hoje
        const snapshot = await db.collection('pedidos')
                                 .where('timestamp', '>=', startOfDay)
                                 .get();

        let totalRevenue = 0;
        let totalOrdersConcluded = 0;
        const todaysOrdersCount = snapshot.size;

        snapshot.forEach(doc => {
            const order = doc.data();
            if (order.status === 'concluido') {
                totalRevenue += order.totals?.total || 0;
                totalOrdersConcluded++;
            }
        });
        
        const averageTicket = totalOrdersConcluded > 0 ? (totalRevenue / totalOrdersConcluded) : 0;

        res.status(200).json({
            totalRevenue,
            totalOrdersConcluded,
            averageTicket,
            todaysOrdersCount
        });
    } catch (error) {
        console.error("Erro ao calcular stats do dashboard:", error);
        res.status(500).json({ error: "Erro ao buscar dados do dashboard." });
    }
});

// --- NOVA ROTA ESTRATÉGICA ---
// Rota para a funcionalidade de BUSCA. A busca é feita no servidor.
app.get('/search', async (req, res) => {
    try {
        const { term } = req.query;
        if (!term || term.trim() === '') {
            return res.status(400).json({ error: 'Termo de busca é obrigatório.' });
        }

        const searchTerm = term.trim();
        const promises = [];

        // Busca por ID do pedido
        promises.push(db.collection('pedidos').where('orderId', '==', searchTerm).get());
        
        // Busca por nome do cliente (iniciando com)
        promises.push(db.collection('pedidos')
                        .orderBy('customerName')
                        .startAt(searchTerm)
                        .endAt(searchTerm + '\uf8ff')
                        .get());

        const [byIdSnapshot, byNameSnapshot] = await Promise.all(promises);

        const resultsMap = new Map();
        byIdSnapshot.forEach(doc => resultsMap.set(doc.id, { id: doc.id, data: doc.data() }));
        byNameSnapshot.forEach(doc => resultsMap.set(doc.id, { id: doc.id, data: doc.data() }));

        const results = Array.from(resultsMap.values());
        
        res.status(200).json(results);
    } catch (error) {
        console.error("Erro na busca:", error);
        res.status(500).json({ error: "Erro ao realizar busca." });
    }
});

// Rota para o CLIENTE buscar o status de UM pedido específico pelo ID (sem alterações)
app.get('/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const orderRef = db.collection('pedidos').doc(id);
        const doc = await orderRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: "Pedido não encontrado." });
        }
        
        res.status(200).json({
            status: doc.data().status,
            orderId: doc.data().orderId,
            deliveryMode: doc.data().deliveryMode 
        });

    } catch (error) {
        console.error(`Erro ao buscar pedido ${req.params.id}:`, error);
        res.status(500).json({ error: "Erro ao buscar o pedido." });
    }
});

// Rota para o CLIENTE criar um novo pedido (sem alterações)
app.post('/orders', async (req, res) => {
    try {
        const orderData = req.body;
        // Validação básica
        if (!orderData || !orderData.items || orderData.items.length === 0) {
            return res.status(400).json({ error: "Dados do pedido inválidos." });
        }
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

// Rota para o PAINEL DE NOTAS atualizar o status de um pedido (sem alterações)
app.patch('/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ error: "Novo status é obrigatório." });
        }
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