import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://wskhdqpdwwjygtordako.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indza2hkcXBkd3dqeWd0b3JkYWtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NTk5MzMsImV4cCI6MjA5NzEzNTkzM30.gLqYfvUTbdRAfqIVUZAFUoCqL4G21HSuSo8ybf_MBMc'

export const supabase = createClient(supabaseUrl, supabaseKey)