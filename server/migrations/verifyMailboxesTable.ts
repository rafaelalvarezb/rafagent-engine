/**
 * Script to verify that the mailboxes table exists
 */

import { neon } from '@neondatabase/serverless';

async function verifyTable() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ ERROR: DATABASE_URL environment variable not found');
    process.exit(1);
  }

  console.log('🔍 Verifying mailboxes table...');
  const sql = neon(databaseUrl);

  try {
    const result = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'mailboxes';
    `;
    
    if (result.length > 0) {
      console.log('✅ SUCCESS: mailboxes table exists in database!');
      
      // Get table structure
      const columns = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'mailboxes'
        ORDER BY ordinal_position;
      `;
      
      console.log('\n📋 Table structure:');
      columns.forEach((col: any) => {
        console.log(`   - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
      });
      
      console.log('\n🎉 Migration verified successfully!');
    } else {
      console.error('❌ ERROR: mailboxes table does not exist');
      process.exit(1);
    }
    
  } catch (error: any) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verifyTable();

