require("dotenv").config();

const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function test() {
  try {
    await client.connect();
    console.log("DATABASE CONNECTED");

    const result = await client.query('SELECT COUNT(*) FROM "user"');

    console.log("USER COUNT:", result.rows[0].count);
  } catch (error) {
    console.error("QUERY ERROR:", error.message);
  } finally {
    await client.end();
  }
}

test();