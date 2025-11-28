/**
 * Script to apply the mailboxes table migration in production
 * Run this once to create the mailboxes table
 */

import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';

async function applyMigration() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ ERROR: DATABASE_URL environment variable not found');
    process.exit(1);
  }

  console.log('🔄 Connecting to database...');
  const sql = neon(databaseUrl);

  try {
    // Read the migration SQL file
    const migrationPath = path.join(process.cwd(), 'migrations', '0009_add_mailboxes.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log('📝 Applying migration: Create mailboxes table...');
    
    // Execute the migration
    await sql(migrationSQL);
    
    console.log('✅ Migration applied successfully!');
    console.log('🎉 The mailboxes table has been created.');
    
    // Verify the table was created
    const result = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'mailboxes';
    `;
    
    if (result.length > 0) {
      console.log('✅ Verification: mailboxes table exists in database');
    } else {
      console.warn('⚠️  Warning: Could not verify table creation');
    }
    
    console.log('\n🚀 Migration complete! You can now use the mailboxes feature.');
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

applyMigration();

