/**
 * Migration script to update existing templates to use the same subject for threading
 * This ensures all touch points in a sequence use the SAME subject line
 */

import 'dotenv/config';
import { db } from '../db';
import { templates } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export async function updateTemplateSubjects() {
  console.log('🔄 Starting template subject migration for email threading...');
  
  try {
    // Get all users' templates
    const allTemplates = await db.select().from(templates);
    
    // Group by userId
    const userTemplates = allTemplates.reduce((acc, template) => {
      if (!acc[template.userId]) {
        acc[template.userId] = [];
      }
      acc[template.userId].push(template);
      return acc;
    }, {} as Record<string, typeof allTemplates>);
    
    let updatedCount = 0;
    
    // For each user, update their sequence templates
    for (const [userId, userTemps] of Object.entries(userTemplates)) {
      // Find the Initial template to get the base subject
      const initialTemplate = userTemps.find(t => t.templateName === 'Initial');
      
      if (!initialTemplate) {
        console.log(`⚠️  User ${userId} has no Initial template, skipping...`);
        continue;
      }
      
      const baseSubject = initialTemplate.subject;
      console.log(`📧 User ${userId} base subject: "${baseSubject}"`);
      
      // Update Second, Third, Fourth Touch to use the same subject
      const touchpointsToUpdate = ['Second Touch', 'Third Touch', 'Fourth Touch'];
      
      for (const templateName of touchpointsToUpdate) {
        const template = userTemps.find(t => t.templateName === templateName);
        
        if (template && template.subject !== baseSubject) {
          console.log(`  ↳ Updating ${templateName}: "${template.subject}" → "${baseSubject}"`);
          
          await db
            .update(templates)
            .set({ subject: baseSubject })
            .where(
              and(
                eq(templates.id, template.id),
                eq(templates.userId, userId)
              )
            );
          
          updatedCount++;
        }
      }
    }
    
    console.log(`✅ Migration completed! Updated ${updatedCount} templates for email threading.`);
    return { success: true, updatedCount };
    
  } catch (error) {
    console.error('❌ Error during migration:', error);
    throw error;
  }
}

// Run migration
updateTemplateSubjects()
  .then(() => {
    console.log('🎉 All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });

