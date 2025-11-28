/**
 * Migration script to associate existing templates with the Standard Sequence
 * Run this ONCE to fix legacy templates
 */

import { db } from '../db';
import { templates, sequences } from '../../shared/schema';
import { eq, and, isNull } from 'drizzle-orm';

export async function migrateExistingTemplates() {
  console.log('🔄 Starting migration: Associating existing templates with Standard Sequence...');
  
  try {
    // Get all users
    const allUsers = await db.select().from(sequences).groupBy(sequences.userId);
    
    for (const userSeq of allUsers) {
      const userId = userSeq.userId;
      
      // Find or create Standard Sequence for this user
      let standardSequence = await db.select().from(sequences).where(
        and(
          eq(sequences.userId, userId),
          eq(sequences.isDefault, true)
        )
      ).limit(1);
      
      if (standardSequence.length === 0) {
        // Create Standard Sequence
        console.log(`Creating Standard Sequence for user ${userId}`);
        const newSeq = await db.insert(sequences).values({
          userId,
          name: 'Standard Sequence',
          isDefault: true
        }).returning();
        standardSequence = newSeq;
      }
      
      const sequenceId = standardSequence[0].id;
      
      // Get all templates without sequenceId for this user
      const orphanTemplates = await db.select().from(templates).where(
        and(
          eq(templates.userId, userId),
          isNull(templates.sequenceId)
        )
      );
      
      console.log(`Found ${orphanTemplates.length} orphan templates for user ${userId}`);
      
      // Associate them with Standard Sequence
      for (let i = 0; i < orphanTemplates.length; i++) {
        const template = orphanTemplates[i];
        await db.update(templates)
          .set({ 
            sequenceId,
            orderIndex: i
          })
          .where(eq(templates.id, template.id));
        
        console.log(`✅ Associated template "${template.templateName}" with Standard Sequence`);
      }
    }
    
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  migrateExistingTemplates()
    .then(() => {
      console.log('Migration finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration error:', error);
      process.exit(1);
    });
}


