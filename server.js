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

// --- ROTA ESTRATÉGICA ATUALIZADA (AUTOMAÇÃO TOTAL) ---
// Rota para verificar o status de funcionamento da loja AUTOMATICAMENTE
app.get('/store-status', async (req, res) => {
    try {
        const docRef = db.collection('siteContent').doc('operatingHours');
        const doc = await docRef.get();

        if (!doc.exists) {
            console.warn("Documento 'operatingHours' não encontrado. Assumindo 'fechada'.");
            return res.status(200).json({ status: 'fechada' });
        }

        const operatingHours = doc.data();

        // **LÓGICA DE VERIFICAÇÃO DE HORÁRIO**
        // 1. Pega a data e hora atual no fuso horário de São Paulo/Brasília
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        
        // 2. Mapeia o dia da semana (JS: 0=Domingo, 1=Segunda... Firestore: 'domingo', 'segunda')
        const daysMapping = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
        const todayKey = daysMapping[now.getDay()];

        // 3. Pega os horários de hoje
        const todaySchedule = operatingHours[todayKey];

        // 4. Verifica se a loja está marcada como fechada hoje
        if (!todaySchedule || todaySchedule.isClosed) {
            return res.status(200).json({ status: 'fechada' });
        }

        // 5. Compara a hora atual com os horários de abertura e fechamento
        const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
        
        const [openHour, openMinute] = todaySchedule.open.split(':').map(Number);
        const openTimeInMinutes = openHour * 60 + openMinute;

        const [closeHour, closeMinute] = todaySchedule.close.split(':').map(Number);
        const closeTimeInMinutes = closeHour * 60 + closeMinute;

        if (currentTimeInMinutes >= openTimeInMinutes && currentTimeInMinutes < closeTimeInMinutes) {
            return res.status(200).json({ status: 'aberta' });
        } else {
            return res.status(200).json({ status: 'fechada' });
        }

    } catch (error) {
        console.error("Erro ao buscar/calcular status da loja:", error);
        res.status(500).json({ error: "Erro ao processar status da loja." });
    }
});


// Rota OTIMIZADA para o PAINEL DE NOTAS buscar apenas os pedidos ATIVOS.
app.get('/active-orders', async (req, res) => {
    try {
        const activeStatuses = ['novo', 'preparo', 'entrega', 'pronto_retirada'];
        const ordersSnapshot = await db.collection('pedidos')
                                     .where('status', 'in', activeStatuses)
                                     .orderBy('timestamp', 'asc')
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

// Rota para calcular as estatísticas do Dashboard.
app.get('/dashboard-stats', async (req, res) => {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
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

// Rota para a funcionalidade de BUSCA.
app.get('/search', async (req, res) => {
    try {
        const { term } = req.query;
        if (!term || term.trim() === '') {
            return res.status(400).json({ error: 'Termo de busca é obrigatório.' });
        }
        const searchTerm = term.trim();
        const promises = [];
        promises.push(db.collection('pedidos').where('orderId', '==', searchTerm).get());
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

// Rota para o CLIENTE buscar o status de UM pedido específico pelo ID
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

// Rota para o CLIENTE criar um novo pedido
app.post('/orders', async (req, res) => {
    try {
        const orderData = req.body;
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

// Rota para o PAINEL DE NOTAS atualizar o status de um pedido
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