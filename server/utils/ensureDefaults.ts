/**
 * Utility script to ensure all users have default sequences and templates
 * This can be run manually or automatically on server startup
 */

import { storage } from '../storage';
import { createDefaultTemplates, createDefaultUserConfig } from '../automation/defaultTemplates';

export async function ensureDefaultSequencesForAllUsers() {
  console.log('🔍 Checking all users for default sequences...');
  
  try {
    const users = await storage.getAllUsers();
    console.log(`Found ${users.length} users to check`);
    
    for (const user of users) {
      try {
        console.log(`\n👤 Checking user: ${user.email}`);
        
        // Check if user has sequences
        const sequences = await storage.getSequencesByUser(user.id);
        console.log(`  - Has ${sequences.length} sequences`);
        
        if (sequences.length === 0) {
          console.log(`  ⚠️  User has no sequences, creating defaults...`);
          await createDefaultTemplates(user.id);
          console.log(`  ✅ Created default sequence and templates`);
        } else {
          // Check if has default sequence
          const hasDefault = sequences.some(s => s.isDefault);
          if (!hasDefault) {
            console.log(`  ⚠️  User has sequences but no default, marking first as default...`);
            await storage.updateSequence(sequences[0].id, { isDefault: true });
            console.log(`  ✅ Marked ${sequences[0].name} as default`);
          } else {
            console.log(`  ✅ User has default sequence`);
          }
        }
        
        // Check if user has config
        const config = await storage.getUserConfig(user.id);
        if (!config) {
          console.log(`  ⚠️  User has no config, creating default...`);
          await createDefaultUserConfig(user.id);
          console.log(`  ✅ Created default config`);
        }
        
      } catch (error) {
        console.error(`  ❌ Error processing user ${user.email}:`, error);
      }
    }
    
    console.log('\n✅ Finished checking all users');
    
  } catch (error) {
    console.error('❌ Error in ensureDefaultSequencesForAllUsers:', error);
    throw error;
  }
}

// Run this function on server startup in development
export async function ensureCurrentUserDefaults(userId: string) {
  console.log(`🔍 Ensuring defaults for user ${userId}...`);
  
  try {
    const sequences = await storage.getSequencesByUser(userId);
    
    if (sequences.length === 0) {
      console.log(`Creating default sequence and templates for user...`);
      await createDefaultTemplates(userId);
    }
    
    const config = await storage.getUserConfig(userId);
    if (!config) {
      console.log(`Creating default config for user...`);
      await createDefaultUserConfig(userId);
    }
    
    console.log(`✅ Defaults ensured for user ${userId}`);
  } catch (error) {
    console.error(`Error ensuring defaults:`, error);
  }
}
