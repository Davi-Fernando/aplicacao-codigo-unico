require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

const corsOptions = {
    origin: '*', // Permitir qualquer origem
    methods: 'GET,POST', // Permitir GET e POST
    allowedHeaders: 'Content-Type', // Permitir cabeçalhos específicos
};

app.use(cors(corsOptions));

// Configurando PostgreSQL
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
                uuid VARCHAR(36) UNIQUE NOT NULL
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
        const { uuid } = req.body; // Recebe o UUID do corpo da requisição

        if (!uuid) {
            return res.status(400).json({ message: "UUID não fornecido." });
        }

        // Verificando se o UUID já existe no banco e obtendo o número associado
        const { rows: usuarioExistente } = await pool.query(
            "SELECT numero FROM participantes WHERE uuid = $1",
            [uuid]
        );

        if (usuarioExistente.length > 0) {
            // Se o usuário já tem um número, retorna apenas o número
            return res.json({ numero: usuarioExistente[0].numero });
        }

        // Verificando se ainda há números disponíveis (limite de 500)
        const { rowCount } = await pool.query("SELECT * FROM participantes");
        if (rowCount >= 500) {
            return res.status(403).json({ message: "Promoção encerrada. Limite atingido!" });
        }

        // Obtém o próximo número
        const { rows } = await pool.query(
            "SELECT COALESCE(MAX(numero), 0) + 1 AS proximo_numero FROM participantes"
        );
        const proximoNumero = rows[0].proximo_numero;

        // Inserindo o número no banco junto com o UUID
        await pool.query(
            "INSERT INTO participantes (numero, uuid) VALUES ($1, $2)",
            [proximoNumero, uuid]
        );

        res.json({ numero: proximoNumero });
    } catch (error) {
        console.error("Erro no /claim:", error);
        res.status(500).json({ message: "Erro no servidor. Tente novamente." });
    }
});

// Iniciando o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
