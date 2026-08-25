require('dotenv').config()

const { Client } = require('pg')

const client = new Client({
  connectionString: process.env.DATABASE_URL,
})

async function test() {
  try {
    await client.connect()

    console.log('DATABASE CONNECTED')

    const result = await client.query(`
      SELECT
        "id",
        "name",
        "email",
        "emailVerified",
        "image",
        "avatarUrl",
        "role",
        "banned",
        "enable_teams_notifications",
        "welcome_email_sent",
        "createdAt",
        "updatedAt"
      FROM "user"
      LIMIT 1
    `)

    console.log('QUERY SUCCESS')
    console.log(result.rows)
  } catch (error) {
    console.error('QUERY ERROR:')
    console.error(error.message)
  } finally {
    await client.end()
  }
}

test()