const { getSupabase } = require('../db/supabase');

const handleError = (res, error, message) => {
    console.error(message, error);
    res.status(500).json({ error: message });
};

exports.assignSubgroups = async () => {
    const supabase = getSupabase();

    try {
        const { data: group1Users, error: fetchError } = await supabase
            .from('vk_demo_db')
            .select('id')
            .eq('group_number', 1);

        if (fetchError) throw fetchError;

        const shuffledUsers = group1Users.sort(() => 0.5 - Math.random());
        const updates = shuffledUsers.map((user, index) => ({
            id: user.id,
            group_one_subgroup: index
        }));

        const { error: updateError } = await supabase
            .from('vk_demo_db')
            .upsert(updates);

        if (updateError) throw updateError;

        console.log(`Assigned subgroups to ${updates.length} Group 1 users`);
    } catch (error) {
        console.error('Error assigning subgroups:', error);
        throw error;
    }
};

async function getGameState() {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('game_state')
        .select('*')
        .order('current_round', { ascending: false })
        .limit(1)
        .single();

    if (error) throw error;
    return data;
}

exports.checkGameStatus = async (req, res) => {
    try {
        const gameState = await getGameState();
        res.json({
            gameStarted: gameState.game_started,
            gameOver: gameState.game_over
        });
    } catch (err) {
        handleError(res, err, 'Failed to check game status');
    }
};

exports.resetGame = async () => {
    const supabase = getSupabase();

    try {
        await supabase.rpc('reset_game');

        const newGameState = await getGameState();

        return {
            message: 'Game reset successfully. All users deleted except the final node bot. All used images reset to unused. Ready to start a new game.',
            newGameState
        };
    } catch (error) {
        console.error('Error resetting game:', error);
        throw error;
    }
};

exports.startGame = async () => {
    const supabase = getSupabase();
    try {
        const { data, error } = await supabase.rpc('start_game');

        if (error) throw error;

        console.log('Game started successfully');
        return { message: 'Game started successfully', newState: data };
    } catch (err) {
        console.error('Error starting game:', err);
        throw err;
    }
};

exports.getGroup1Image = async (req, res) => {
    const { userID } = req.session;
    const supabase = getSupabase();

    try {
        const { data, error } = await supabase.rpc('get_group1_image', { user_id: userID });

        if (error) throw error;

        res.json(data);
    } catch (err) {
        console.error('Failed to fetch current image:', err);
        res.status(500).json({ error: 'Failed to fetch current image' });
    }
};

exports.getGroup2Data = async (req, res) => {
    const { userID } = req.session;
    const supabase = getSupabase();

    try {
        const { data, error } = await supabase.rpc('get_group2_data', { user_id: userID });

        if (error) throw error;

        res.json(data);
    } catch (err) {
        console.error('Failed to fetch group 2 data:', err);
        res.status(500).json({ error: 'Failed to fetch group 2 data' });
    }
};

exports.submitPrediction = async (req, res, groupNumber) => {
    const { userID } = req.session;
    const { prediction, round } = req.body;
    const supabase = getSupabase();

    console.log(`Received prediction submission: userID=${userID}, groupNumber=${groupNumber}, prediction=${prediction}, round=${round}`);

    if (round === undefined || round === null || isNaN(parseInt(round))) {
        console.error(`Invalid round: ${round}`);
        return res.status(400).json({ error: 'Invalid or missing round number' });
    }

    const roundNumber = parseInt(round);

    try {
        const { data, error } = await supabase.rpc('submit_prediction', {
            p_user_id: userID,
            p_group_number: groupNumber,
            p_prediction: prediction,
            p_round: roundNumber
        });

        if (error) throw error;

        console.log(`Prediction submitted successfully: userID=${userID}, groupNumber=${groupNumber}, round=${roundNumber}`);
        res.json({ message: 'Prediction submitted successfully' });
    } catch (err) {
        console.error(`Failed to submit Group ${groupNumber} prediction:`, err);
        res.status(500).json({ error: `Failed to submit Group ${groupNumber} prediction`, details: err.message });
    }
};

exports.submitGroup1Prediction = (req, res) => exports.submitPrediction(req, res, 1);
exports.submitGroup2Prediction = (req, res) => exports.submitPrediction(req, res, 2);

exports.getRoundResults = async (req, res) => {
    const supabase = getSupabase();

    try {
        const { data, error } = await supabase.rpc('get_round_results');

        if (error) throw error;

        res.json(data);
    } catch (err) {
        handleError(res, err, 'Failed to fetch round results');
    }
};