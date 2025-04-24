require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

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
                ip VARCHAR(45) UNIQUE NOT NULL
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
        let userIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
        if (userIp.includes("::ffff:")) {
            userIp = userIp.replace("::ffff:", "");
        }


        // Verificando se o IP já existe no banco e obtendo o número associado
        const { rows: usuarioExistente } = await pool.query("SELECT numero FROM participantes WHERE ip = $1", [userIp]);

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

        // Inserindo o número no banco junto com o IP
        await pool.query("INSERT INTO participantes (numero, ip) VALUES ($1, $2)", [proximoNumero, userIp]);

        res.json({ numero: proximoNumero });
    } catch (error) {
        console.error("Erro no /claim:", error);
        res.status(500).json({ message: "Erro no servidor. Tente novamente." });
    }
});


// Iniciando o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
