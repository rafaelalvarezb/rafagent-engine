/**
 * Migration script to update template names from old format to new format
 * Run this once to update existing users' templates
 * 
 * Old names: Follow-up 1, Follow-up 2, Follow-up 3, Referral-Initial
 * New names: Second Touch, Third Touch, Fourth Touch (Referral-Initial removed)
 */

import { storage } from '../storage';
import { db } from '../db';
import { templates } from '@shared/schema';
import { eq } from 'drizzle-orm';

const nameMapping: { [key: string]: string } = {
  'Follow-up 1': 'Second Touch',
  'Follow-up 2': 'Third Touch',
  'Follow-up 3': 'Fourth Touch'
};

export async function updateTemplateNames() {
  console.log('🔄 Starting template name migration...');
  
  try {
    // Get all templates that need to be updated
    const templatesToUpdate = await db
      .select()
      .from(templates)
      .where(eq(templates.templateName, 'Follow-up 1'))
      .union(
        db.select().from(templates).where(eq(templates.templateName, 'Follow-up 2'))
      )
      .union(
        db.select().from(templates).where(eq(templates.templateName, 'Follow-up 3'))
      )
      .union(
        db.select().from(templates).where(eq(templates.templateName, 'Referral-Initial'))
      );

    let updatedCount = 0;
    let deletedCount = 0;

    for (const template of templatesToUpdate) {
      const newName = nameMapping[template.templateName];
      
      if (newName) {
        // Update template name
        await storage.updateTemplate(template.id, {
          templateName: newName
        });
        console.log(`✅ Updated "${template.templateName}" to "${newName}" for user ${template.userId}`);
        updatedCount++;
      } else if (template.templateName === 'Referral-Initial') {
        // Delete Referral-Initial template
        await storage.deleteTemplate(template.id);
        console.log(`🗑️  Deleted "Referral-Initial" template for user ${template.userId}`);
        deletedCount++;
      }
    }

    console.log(`\n✅ Migration completed successfully!`);
    console.log(`   - Updated: ${updatedCount} templates`);
    console.log(`   - Deleted: ${deletedCount} templates`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateTemplateNames()
    .then(() => {
      console.log('\n🎉 All done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Migration failed:', error);
      process.exit(1);
    });
}

