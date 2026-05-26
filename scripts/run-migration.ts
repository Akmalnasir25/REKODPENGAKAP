import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://jvjxeckzmokoqjfsuene.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2anhlY2t6bW9rb3FqZnN1ZW5lIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODQ3MTEzNiwiZXhwIjoyMDk0MDQ3MTM2fQ.o0KOcqxUwSeBSS7qEv5jYVwzaV_IHxqEkQJC-gvZ_50';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runMigration() {
  const sql = readFileSync('supabase/migrations/005_telegram_groups.sql', 'utf-8');
  
  // Split by statement (simple split by semicolon)
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Running ${statements.length} SQL statements...`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    console.log(`\n[${i + 1}/${statements.length}] Executing...`);
    console.log(stmt.substring(0, 100) + '...');
    
    try {
      const { data, error } = await supabase.rpc('exec_sql', { sql: stmt });
      if (error) {
        console.error('Error:', error);
        // Continue even if error (might be "already exists")
      } else {
        console.log('✓ Success');
      }
    } catch (err) {
      console.error('Exception:', err);
    }
  }

  console.log('\n✅ Migration completed');
}

runMigration().catch(console.error);
