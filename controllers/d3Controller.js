const { getSupabase } = require("../db/supabase");

const FA_ICONS = {
    user: 'user',
    bot: 'robot',
    finalNode: 'network-wired'
};

exports.getNetworkData = async (req, res) => {
    const supabase = getSupabase();

    try {
        // Fetch all users and bots data from vk_demo_db
        const { data: usersData, error: usersError } = await supabase
            .from('vk_demo_db')
            .select('id, group_number, is_bot, has_given_input, icon');

        if (usersError) throw usersError;

        // Fetch all connections from the connections table
        const { data: connectionsData, error: connectionsError } = await supabase
            .from('connections')
            .select('source_user_id, target_user_id, weight');

        if (connectionsError) throw connectionsError;

        // Format nodes for D3.js
        const nodes = usersData.map(user => ({
            id: user.id,
            group: user.group_number,
            isBot: user.is_bot,
            hasGivenInput: user.has_given_input || false,
            icon: user.icon || (user.group_number === -2 ? FA_ICONS.finalNode : (user.is_bot ? FA_ICONS.bot : FA_ICONS.user))
        }));

        // Generate links based on connections
        const links = connectionsData.map(connection => ({
            source: connection.source_user_id,
            target: connection.target_user_id,
            weight: connection.weight // Include the weight of the connection
        }));

        res.json({ nodes, links });

    } catch (err) {
        console.error('Failed to fetch network data:', err);
        res.status(500).json({ error: 'Failed to fetch network data' });
    }
};