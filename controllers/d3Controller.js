const { getSupabase } = require("../db/supabase");

const FA_ICONS = {
    user: 'user',
    bot: 'robot',
    finalNode: 'network-wired'
};

exports.getNetworkData = async (req, res) => {
    const supabase = getSupabase();

    try {
        const { data, error } = await supabase.rpc('get_network_data');

        if (error) throw error;

        res.json(data);
    } catch (err) {
        console.error('Failed to fetch network data:', err);
        res.status(500).json({ error: 'Failed to fetch network data' });
    }
};