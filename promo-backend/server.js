require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const cookieParser = require("cookie-parser");
const { v4: uuidv4 } = require("uuid");

const app = express();

// Configurações do CORS
const corsOptions = {
    origin: 'https://promo-princesa-center.netlify.app',  // Domínio correto do frontend
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true,  // Permite envio de cookies
    exposedHeaders: ['Access-Control-Allow-Private-Network'],
};
app.use(cors(corsOptions));

// Para as requisições OPTIONS (preflight)
app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Private-Network', 'true');
    res.sendStatus(200);
});

// Middlewares
app.use(express.json());
app.use(cookieParser());

// Configuração do PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// Função para criar a tabela, se não existir
async function setupDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS participantes (
                id SERIAL PRIMARY KEY,
                numero INT UNIQUE NOT NULL,
                session_id VARCHAR(255) UNIQUE NOT NULL
            );
        `);
        console.log("Banco de dados configurado!");
    } catch (error) {
        console.error("Erro ao configurar o banco de dados:", error);
    }
}
setupDatabase();

// Endpoint principal
app.post("/claim", async (req, res) => {
    try {
        let sessionId = req.cookies.session_id;

        if (!sessionId) {
            sessionId = uuidv4();  // Gera novo UUID
            res.cookie("session_id", sessionId, { 
                httpOnly: true, 
                secure: true, 
                sameSite: 'Lax'
            });
        }

        // Verifica se já existe
        const { rows: usuarioExistente } = await pool.query(
            "SELECT numero FROM participantes WHERE session_id = $1", 
            [sessionId]
        );

        if (usuarioExistente.length > 0) {
            return res.json({ numero: usuarioExistente[0].numero });
        }

        // Limite de 500 participantes
        const { rowCount } = await pool.query("SELECT 1 FROM participantes");
        if (rowCount >= 500) {
            return res.status(403).json({ message: "Promoção encerrada. Limite de participantes atingido." });
        }

        // Próximo número
        const { rows } = await pool.query(
            "SELECT COALESCE(MAX(numero), 0) + 1 AS proximo_numero FROM participantes"
        );
        const proximoNumero = rows[0].proximo_numero;

        // Salva no banco
        await pool.query(
            "INSERT INTO participantes (numero, session_id) VALUES ($1, $2)", 
            [proximoNumero, sessionId]
        );

        return res.json({ numero: proximoNumero });
    } catch (error) {
        console.error("Erro no /claim:", error.message || error);
        res.status(500).json({ message: "Erro interno no servidor. Tente novamente mais tarde." });
    }
});

// Iniciando o servidor
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
