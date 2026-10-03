import dotenv from 'dotenv'
dotenv.config()

import { processDueReminders } from '../src/lib/services/reminders.js'

console.log('===========================================================')
console.log('⚡ BUILDICY CALENDAR BACKGROUND REMINDER WORKER STARTED')
console.log('===========================================================')
console.log('🔄 Automatically checking Supabase for due reminders every 30s...\n')

async function tick() {
  try {
    const res = await processDueReminders()
    if (res.processed > 0) {
      console.log(`[${new Date().toLocaleTimeString()}] ✅ Processed ${res.processed} due reminders: ${res.sent} sent, ${res.failed} failed.`)
    }
  } catch (err: any) {
    console.error(`[${new Date().toLocaleTimeString()}] ❌ Worker error:`, err.message || err)
  }
}

tick()
setInterval(tick, 30000)
