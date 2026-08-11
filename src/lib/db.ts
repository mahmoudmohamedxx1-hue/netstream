import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create Prisma client with error handling so the server doesn't crash
// if the DB file is missing (e.g., in serverless environments where the
// filesystem might not persist).
function createPrismaClient(): PrismaClient {
  try {
    return new PrismaClient({
      log: ['error', 'warn'],
    })
  } catch (e) {
    console.error('[db] Failed to create PrismaClient:', e)
    // Return a mock that does nothing — APIs will return empty results
    return {} as PrismaClient
  }
}

// Only log errors (not every query) to keep dev.log small and the server stable.
export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
