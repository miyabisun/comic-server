import './config.js' // Sets DATABASE_URL before PrismaClient initialization
import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()
