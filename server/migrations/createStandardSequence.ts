/**
 * Migration script to create Standard Sequence for existing users
 */

import 'dotenv/config';
import { storage } from '../storage';

async function createStandardSequenceForAllUsers() {
  console.log('🔄 Creating Standard Sequence for all users...');
  
  try {
    const users = await storage.getAllUsers();
    console.log(`Found ${users.length} users`);
    
    for (const user of users) {
      console.log(`\n📧 Processing user: ${user.email}`);
      
      // Check if user already has sequences
      const sequences = await storage.getSequencesByUser(user.id);
      const hasStandard = sequences.some(s => s.isDefault || s.name === 'Standard Sequence');
      
      if (hasStandard) {
        console.log(`✅ User already has Standard Sequence`);
        continue;
      }
      
      // Create Standard Sequence
      const standardSequence = await storage.createSequence({
        userId: user.id,
        name: 'Standard Sequence',
        isDefault: true,
        meetingTitle: '${companyName} & Google',
        meetingDescription: 'Looking forward to our conversation!',
        reminderEnabled: true,
        reminderTiming: '24h',
        reminderSubject: 'Reminder: Meeting Tomorrow',
        reminderBody: 'Hi ${contactName},\n\nThis is a friendly reminder about our meeting scheduled for tomorrow.\n\nLooking forward to speaking with you!\n\nBest,\n${yourName}'
      });
      
      console.log(`✅ Created Standard Sequence: ${standardSequence.id}`);
      
      // Get all templates without sequenceId
      const allTemplates = await storage.getTemplatesByUser(user.id);
      const orphanTemplates = allTemplates.filter(t => !t.sequenceId);
      
      console.log(`Found ${orphanTemplates.length} templates without sequence`);
      
      // Assign them to Standard Sequence
      for (let i = 0; i < orphanTemplates.length; i++) {
        const template = orphanTemplates[i];
        await storage.updateTemplate(template.id, {
          sequenceId: standardSequence.id,
          orderIndex: i
        });
        console.log(`  ✅ Linked template: ${template.templateName}`);
      }
    }
    
    console.log('\n✅ Standard Sequence created for all users!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the migration
createStandardSequenceForAllUsers().then(() => {
  console.log('Migration complete');
  process.exit(0);
}).catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});

