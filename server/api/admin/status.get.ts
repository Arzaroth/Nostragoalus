import { isAdmin } from '../../utils/auth-guards'

export default defineEventHandler(async (event) => ({ isAdmin: await isAdmin(event) }))
