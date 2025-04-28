require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const cookieParser = require("cookie-parser");
const { v4: uuidv4 } = require("uuid");  // Importando o uuid

const app = express();

// Configurações do CORS
const corsOptions = {
    origin: 'https://promo-princesa-center.netlify.app',
    methods: 'GET, POST',
    allowedHeaders: 'Content-Type',
    credentials: true,  // Permitir envio de cookies
    exposedHeaders: ['Access-Control-Allow-Private-Network'],  // Expor o cabeçalho
};
app.use(cors(corsOptions));

// Depois, para as requisições OPTIONS (preflight), adicione:
app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Private-Network', 'true');
    res.send();
});

app.use(express.json());
app.use(cookieParser());  // Usando o cookie-parser para lidar com cookies

// Configuração do PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// Criando a tabela (apenas uma vez)
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

app.post("/claim", async (req, res) => {
    try {
        // Obter o session_id a partir do cookie ou gerar um novo
        let sessionId = req.cookies.session_id;
        
        if (!sessionId) {
            sessionId = uuidv4();  // Gerar um UUID novo se não houver no cookie
            res.cookie("session_id", sessionId, { httpOnly: true, maxAge: 3600000 });  // Armazenando o UUID no cookie por 1 hora
        }

        // Verificando se o session_id já existe no banco de dados
        const { rows: usuarioExistente } = await pool.query("SELECT numero FROM participantes WHERE session_id = $1", [sessionId]);

        if (usuarioExistente.length > 0) {
            // Se o usuário já tem um número, retorna apenas o número
            return res.json({ numero: usuarioExistente[0].numero });
        }

        // Verificando se ainda há números disponíveis
        const { rowCount } = await pool.query("SELECT * FROM participantes");
        if (rowCount >= 500) {
            return res.status(403).json({ message: "Promoção encerrada. Limite atingido!" });
        }

        // Obtém o próximo número
        const { rows } = await pool.query("SELECT COALESCE(MAX(numero), 0) + 1 AS proximo_numero FROM participantes");
        const proximoNumero = rows[0].proximo_numero;

        // Inserindo o número no banco junto com o session_id
        await pool.query("INSERT INTO participantes (numero, session_id) VALUES ($1, $2)", [proximoNumero, sessionId]);

        res.json({ numero: proximoNumero });
    } catch (error) {
        console.error("Erro no /claim:", error);
        res.status(500).json({ message: "Erro no servidor. Tente novamente." });
    }
});

// Iniciando o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
