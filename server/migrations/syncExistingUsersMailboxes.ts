/**
 * Script to sync mailboxes for existing users who have OAuth tokens
 * Run this once to create mailboxes for all existing users
 */

import { storage } from '../storage';
import { syncUserMainMailbox } from '../services/mailbox';

async function syncExistingUsers() {
  console.log('🔄 Starting sync of existing users mailboxes...');
  
  try {
    // Get all users
    const allUsers = await storage.getAllUsers();
    console.log(`📊 Found ${allUsers.length} users`);
    
    let synced = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const user of allUsers) {
      try {
        if (!user.googleAccessToken || !user.email) {
          console.log(`⏭️  Skipping ${user.email || user.id}: No OAuth tokens`);
          skipped++;
          continue;
        }
        
        // Check if mailbox already exists
        const existingMailboxes = await storage.getMailboxesByUser(user.id);
        const existingMailbox = existingMailboxes.find(m => m.email === user.email);
        
        if (existingMailbox) {
          console.log(`✅ ${user.email}: Mailbox already exists`);
          skipped++;
          continue;
        }
        
        // Sync mailbox
        const mailbox = await syncUserMainMailbox(user.id);
        if (mailbox) {
          console.log(`✅ ${user.email}: Mailbox created successfully`);
          synced++;
        } else {
          console.log(`⚠️  ${user.email}: Failed to create mailbox`);
          errors++;
        }
      } catch (error: any) {
        console.error(`❌ Error syncing ${user.email}:`, error.message);
        errors++;
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   ✅ Synced: ${synced}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log('\n🎉 Sync complete!');
    
  } catch (error: any) {
    console.error('❌ Sync failed:', error.message);
    process.exit(1);
  }
}

syncExistingUsers();

