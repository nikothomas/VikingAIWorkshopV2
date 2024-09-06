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

        // Fetch the latest game state
        const { data: gameState, error: gameStateError } = await supabase
            .from('game_state')
            .select('*')
            .order('current_round', { ascending: false })
            .limit(1)
            .single();

        if (gameStateError) throw gameStateError;

        // Fetch the last 10 completed rounds
        const { data: recentRounds, error: recentRoundsError } = await supabase
            .from('game_state')
            .select('current_round, current_image_id, final_prediction, is_round_complete')
            .eq('is_round_complete', true)
            .order('current_round', { ascending: false })
            .limit(10);

        if (recentRoundsError) throw recentRoundsError;

        // Calculate accuracy
        const correctPredictions = await Promise.all(recentRounds.map(async (round) => {
            const { data: image, error: imageError } = await supabase
                .from('images')
                .select('correct_answer')
                .eq('id', round.current_image_id)
                .single();

            if (imageError) {
                console.error(`Error fetching image data for round ${round.current_round}:`, imageError);
                return false;
            }

            return round.final_prediction === image.correct_answer;
        }));

        const accuracy = correctPredictions.filter(Boolean).length / correctPredictions.length;

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
            weight: connection.weight
        }));

        res.json({
            nodes,
            links,
            accuracy,
            currentRound: gameState.current_round,
            isRoundComplete: gameState.is_round_complete,
            gameStarted: gameState.game_started,
            gameOver: gameState.game_over || false
        });

    } catch (err) {
        console.error('Failed to fetch network data:', err);
        res.status(500).json({ error: 'Failed to fetch network data' });
    }
};