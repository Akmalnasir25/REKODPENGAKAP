import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jvjxeckzmokoqjfsuene.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2anhlY2t6bW9rb3FqZnN1ZW5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NzExMzYsImV4cCI6MjA5NDA0NzEzNn0.P5zhMteXlYSmpIDRq5n_hx5xNRguAYfUwzJUZu2JRFo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1`;
