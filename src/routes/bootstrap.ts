import { Router } from 'express'
import express from 'express'
import { auth } from '../config/auth'
import { db } from '../config/db'
import { user } from '../models/schema'
import { eq } from 'drizzle-orm'

const router = Router()


router.use(express.json())

router.post('/create-admin', async (req, res) => {
  try {
    const { email, password, name } = req.body || {}

    if (!email || !password || !name) {
      return res.status(400).json({
        message: 'email, password and name are required',
      })
    }   

    if (!email || !password || !name) {
      return res.status(400).json({
        message: 'email, password and name are required',
      })
    }

    // Prevent creating duplicate admin
    const existing = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1)

    if (existing.length > 0) {
      return res.status(409).json({
        message: 'User already exists',
      })
    }

    // Let Better Auth create BOTH user and password account
    const result = await auth.api.signUpEmail({
      body: {
        name,
        email,
        password,
      },
    })

    if (!result.user) {
      return res.status(500).json({
        message: 'Failed to create user',
      })
    }

    // Promote the newly created user to admin
    const [adminUser] = await db
      .update(user)
      .set({
        role: 'admin',
      })
      .where(eq(user.id, result.user.id))
      .returning()

    return res.status(201).json({
      message: 'Admin created successfully',
      user: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
      },
    })
  } catch (error) {
    console.error('[Bootstrap] Failed:', error)

    return res.status(500).json({
      message: 'Failed to create admin',
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

export default router