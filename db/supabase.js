const { createClient } = require('@supabase/supabase-js');

let supabase;

function initializeSupabase() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase URL and service key must be provided in environment variables');
    }

    console.log('Initializing Supabase connection...');
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
    console.log('Supabase connection initialized');
}

function getSupabase() {
    if (!supabase) {
        console.error('Supabase client not initialized');
        throw new Error('Supabase client not initialized');
    }
    return supabase;
}

module.exports = {
    initializeSupabase,
    getSupabase
};