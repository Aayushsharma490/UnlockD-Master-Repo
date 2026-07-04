/**
 * scheduler.js — Cron daemon for automated execution of scheduled/recurring transfers (PostgreSQL)
 */

import cron from 'node-cron';
import db from './db.js';
import { executeTransfer } from './routes/transactions.js';

// Helper to advance the next run date of a scheduled transfer
async function advanceNextRunDate(client, task, now) {
  let nextDate = new Date(task.next_run_date);
  let status = 'active';

  if (task.frequency === 'once') {
    status = 'completed';
  } else if (task.frequency === 'weekly') {
    nextDate.setDate(nextDate.getDate() + 7);
  } else if (task.frequency === 'monthly') {
    nextDate.setMonth(nextDate.getMonth() + 1);
  }

  // Prevent infinite loops if nextDate is somehow in the past
  while (nextDate <= now && status === 'active') {
    if (task.frequency === 'weekly') {
      nextDate.setDate(nextDate.getDate() + 7);
    } else if (task.frequency === 'monthly') {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }
  }

  await client.query(`
    UPDATE scheduled_transfers
    SET next_run_date = $1, status = $2, last_run_at = $3
    WHERE id = $4
  `, [nextDate, status, now, task.id]);
}

export function startScheduler() {
  console.log('⏰ Scheduled Transfer cron daemon initialized.');

  // Run every minute
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    try {
      // Find all active scheduled transfers that are due
      const { rows: due } = await db.query(`
        SELECT * FROM scheduled_transfers
        WHERE status = 'active' AND next_run_date <= $1
      `, [now]);

      if (due.length === 0) return;

      console.log(`⏰ [Scheduler] Found ${due.length} due scheduled transfers.`);

      for (const task of due) {
        const client = await db.getPool().connect();
        try {
          await client.query('BEGIN');

          // Row lock using SELECT FOR UPDATE
          const lockResult = await client.query('SELECT * FROM scheduled_transfers WHERE id = $1 FOR UPDATE', [task.id]);
          const currentTask = lockResult.rows[0];

          if (!currentTask || currentTask.status !== 'active' || new Date(currentTask.next_run_date) > now) {
            await client.query('ROLLBACK');
            client.release();
            continue;
          }

          const nextRunIso = new Date(currentTask.next_run_date).toISOString();
          const ikey = `scheduled_${currentTask.id}_${nextRunIso}`;

          // Verify idempotency
          const existRes = await client.query('SELECT id FROM transactions WHERE idempotency_key = $1', [ikey]);
          if (existRes.rows.length > 0) {
            console.log(`⏰ [Scheduler] Duplicate transaction blocked for ikey: ${ikey}`);
            await advanceNextRunDate(client, currentTask, now);
            await client.query('COMMIT');
            client.release();
            continue;
          }

          // Execute atomic transfer
          try {
            await executeTransfer(client, {
              from_account: currentTask.from_account,
              to_account: currentTask.to_account,
              amount: parseInt(currentTask.amount, 10),
              category: 'Other',
              note: `Scheduled Transfer (${currentTask.frequency})`,
              description: `Recurring transfer: ${currentTask.frequency}`,
              merchant: 'Verdant Scheduler',
              idempotency_key: ikey,
              userId: currentTask.user_id,
            });

            await advanceNextRunDate(client, currentTask, now);
            await client.query('COMMIT');
            console.log(`⏰ [Scheduler] Scheduled transfer ${currentTask.id} executed successfully.`);
          } catch (txErr) {
            await client.query('ROLLBACK');
            console.error(`⏰ [Scheduler] Transfer execution failed for task ${currentTask.id}:`, txErr);

            // Record failure in history to prevent blocking or silently swallowing errors
            const failClient = await db.getPool().connect();
            try {
              await failClient.query('BEGIN');
              
              const failedTxnId = 'tx_' + Math.random().toString(36).substring(2, 10);
              const errMsg = txErr.error || txErr.code || 'UNKNOWN_ERROR';
              
              await failClient.query(`
                INSERT INTO transactions (id, idempotency_key, from_account, to_account, amount, status, category, note, description, merchant, created_at)
                VALUES ($1, $2, $3, $4, $5, 'failed', $6, $7, $8, $9, $10)
              `, [
                failedTxnId, 
                ikey, 
                currentTask.from_account, 
                currentTask.to_account, 
                parseInt(currentTask.amount, 10), 
                'Other', 
                `Scheduled Transfer Failed (${currentTask.frequency})`,
                `Failed scheduled transfer: ${errMsg}`,
                'Verdant Scheduler',
                now
              ]);

              // Advance run date anyway so we try next time
              await advanceNextRunDate(failClient, currentTask, now);
              await failClient.query('COMMIT');
            } catch (failErr) {
              await failClient.query('ROLLBACK');
              console.error('⏰ [Scheduler] Failed to write scheduled transfer failure row:', failErr);
            } finally {
              failClient.release();
            }
          }

        } catch (err) {
          console.error(`⏰ [Scheduler] Exception processing task ${task.id}:`, err);
          try { await client.query('ROLLBACK'); } catch (_) {}
        } finally {
          client.release();
        }
      }
    } catch (tickErr) {
      console.error('⏰ [Scheduler] Global scheduler tick exception:', tickErr);
    }
  });
}
