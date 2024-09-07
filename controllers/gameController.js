const { getSupabase } = require('../db/supabase');
const { resetGame } = require("./adminController");

const handleError = (res, error, message) => {
    console.error(message, error);
    res.status(500).json({ error: message });
};

async function checkGameStarted() {
    const supabase = getSupabase();
    try {
        const { data, error } = await supabase
            .from('game_state')
            .select('game_started')
            .limit(1)
            .single();

        if (error) throw error;
        return data.game_started;
    } catch (err) {
        console.error('Error checking game state:', err);
        return false;
    }
}

exports.checkGameStatus = async (req, res) => {
    const supabase = getSupabase();

    try {
        const { data: gameState, error: gameStateError } = await supabase
            .from('game_state')
            .select('game_started, game_over')
            .limit(1)
            .single();

        if (gameStateError) throw gameStateError;

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
        // Delete all users except the final node bot
        const { error: deleteUserError } = await supabase
            .from('vk_demo_db')
            .delete()
            .not('group_number', 'eq', 100);

        if (deleteUserError) throw deleteUserError;

        // Reset all used images
        const { error: imageError } = await supabase
            .from('images')
            .update({ used: false })
            .eq('used', true);

        if (imageError) throw imageError;

        // Delete all game states
        const { error: deleteGameStateError } = await supabase
            .from('game_state')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (deleteGameStateError) throw deleteGameStateError;

        // Create a new initial game state
        const { data: newGameState, error: insertError } = await supabase
            .from('game_state')
            .insert({
                current_round: 0,
                current_image_id: null,
                current_image_url: null,
                group1_predictions: [],
                group2_predictions: [],
                is_round_complete: true,
                game_started: false,
                game_over: false,
                is_weights_updated: false
            })
            .select()
            .single();

        if (insertError) throw insertError;

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
        // Get the current game state
        const { data: currentState, error: stateError } = await supabase
            .from('game_state')
            .select('*')
            .single();

        if (stateError) throw stateError;

        if (currentState.game_started) {
            return { message: 'Game was already started' };
        }

        // Get an unused image
        const { data: newImage, error: imageError } = await supabase
            .from('images')
            .select('id, url')
            .eq('used', false)
            .limit(1)
            .single();

        if (imageError || !newImage) {
            return { message: 'No available images. Please upload images before starting the game.' };
        }

        // Mark the image as used
        await supabase
            .from('images')
            .update({ used: true })
            .eq('id', newImage.id);

        // Update the game state
        const { data: updatedState, error: updateError } = await supabase
            .from('game_state')
            .update({
                current_round: 1,
                current_image_id: newImage.id,
                current_image_url: newImage.url,
                group1_predictions: [],
                group2_predictions: [],
                is_round_complete: false,
                game_started: true,
                is_weights_updated: false
            })
            .eq('id', currentState.id)
            .select()
            .single();

        if (updateError) throw updateError;

        console.log('Game started successfully');
        return { message: 'Game started successfully', newState: updatedState };
    } catch (err) {
        console.error('Error starting game:', err);
        throw err;
    }
};

exports.getGroup1Image = async (req, res) => {
    const { userID } = req.session;
    const supabase = getSupabase();

    try {
        const gameStarted = await checkGameStarted();
        if (!gameStarted) {
            return res.json({ waiting: true, message: 'Game has not started yet' });
        }

        const { data: gameState, error: gameStateError } = await supabase
            .from('game_state')
            .select('current_round, current_image_url, is_round_complete, game_over')
            .order('current_round', { ascending: false })
            .limit(1)
            .single();

        if (gameStateError) throw gameStateError;

        if (gameState.game_over) {
            return res.json({ gameOver: true, message: 'Game is over' });
        }

        if (gameState.is_round_complete) {
            return res.json({ waiting: true });
        }

        res.json({
            round: gameState.current_round,
            image_url: gameState.current_image_url,
            userID: userID
        });
    } catch (err) {
        handleError(res, err, 'Failed to fetch current image');
    }
};

exports.getGroup2Data = async (req, res) => {
    const { userID } = req.session;
    const supabase = getSupabase();

    try {
        const gameStarted = await checkGameStarted();
        if (!gameStarted) {
            return res.json({ waiting: true, message: 'Game has not started yet' });
        }

        const { data: gameState, error: gameStateError } = await supabase
            .from('game_state')
            .select('group1_predictions, group1_complete, is_round_complete, game_over, current_round')
            .order('current_round', { ascending: false })
            .limit(1)
            .single();

        if (gameStateError) throw gameStateError;

        if (gameState.game_over) {
            return res.json({ gameOver: true, message: 'Game is over' });
        }

        if (!gameState.group1_complete || gameState.is_round_complete) {
            return res.json({ waiting: true });
        }

        // Fetch connections for the current user
        const { data: connections, error: connectionsError } = await supabase
            .from('connections')
            .select('source_user_id, weight')
            .eq('target_user_id', userID);

        if (connectionsError) throw connectionsError;

        let weightedSum = 0;
        let totalWeight = 0;

        for (const prediction of gameState.group1_predictions) {
            const connection = connections.find(conn => conn.source_user_id === prediction.user_id);
            if (connection) {
                weightedSum += prediction.prediction * connection.weight;
                totalWeight += connection.weight;
            }
        }

        const weightedAverage = totalWeight > 0 ? weightedSum / totalWeight : 0;
        const normalizedAverage = Math.max(-1, Math.min(1, weightedAverage));

        res.json({
            round: gameState.current_round,
            weightedAverage: normalizedAverage,
            userID: userID
        });
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

    // Validate round
    if (round === undefined || round === null || isNaN(parseInt(round))) {
        console.error(`Invalid round: ${round}`);
        return res.status(400).json({ error: 'Invalid or missing round number' });
    }

    const roundNumber = parseInt(round);

    try {
        // Fetch the current game state
        const { data: gameState, error: gameStateError } = await supabase
            .from('game_state')
            .select(`current_round, group${groupNumber}_predictions`)
            .eq('current_round', roundNumber)
            .single();

        if (gameStateError) {
            console.error('Error fetching game state:', gameStateError);
            return res.status(500).json({ error: 'Failed to fetch game state', details: gameStateError });
        }

        if (!gameState) {
            console.error(`No game state found for round ${roundNumber}`);
            return res.status(404).json({ error: 'No active game found for the specified round' });
        }

        if (gameState.current_round !== roundNumber) {
            console.error(`Round mismatch: current=${gameState.current_round}, submitted=${roundNumber}`);
            return res.status(400).json({ error: 'Round mismatch' });
        }

        // Check if the user has already predicted
        const alreadyPredicted = gameState[`group${groupNumber}_predictions`].some(p => p.user_id === userID);
        if (alreadyPredicted) {
            console.error(`User ${userID} has already predicted for round ${roundNumber}`);
            return res.status(400).json({ error: 'User has already submitted a prediction for this round' });
        }

        const updatedPredictions = [
            ...gameState[`group${groupNumber}_predictions`],
            { user_id: userID, prediction }
        ];

        // Update the game state with the new prediction
        const { error: updateError } = await supabase
            .from('game_state')
            .update({ [`group${groupNumber}_predictions`]: updatedPredictions })
            .eq('current_round', roundNumber);

        if (updateError) {
            console.error('Error updating game state:', updateError);
            return res.status(500).json({ error: 'Failed to update game state', details: updateError });
        }

        // Mark that the user has given input (optional, based on your requirements)
        const { error: userUpdateError } = await supabase
            .from('vk_demo_db')
            .update({ has_given_input: true })
            .eq('id', userID);

        if (userUpdateError) {
            console.error('Error updating user input status:', userUpdateError);
            // We'll continue even if this fails, as it's not critical
        }

        console.log(`Prediction submitted successfully: userID=${userID}, groupNumber=${groupNumber}, round=${roundNumber}`);
        res.json({ message: 'Prediction submitted successfully' });
    } catch (err) {
        console.error(`Failed to submit Group ${groupNumber} prediction:`, err);
        res.status(500).json({ error: `Failed to submit Group ${groupNumber} prediction`, details: err.message });
    }
};

exports.submitGroup1Prediction = (req, res) => exports.submitPrediction(req, res, 1);
exports.submitGroup2Prediction = (req, res) => exports.submitPrediction(req, res, 2);

// Fetch round results
exports.getRoundResults = async (req, res) => {
    const supabase = getSupabase();

    try {
        const { data: gameState } = await supabase
            .from('game_state')
            .select('*')
            .order('current_round', { ascending: false })
            .limit(1)
            .single();

        if (!gameState.is_round_complete) {
            return res.json({ isComplete: false });
        }

        const { data: currentImage } = await supabase
            .from('images')
            .select('correct_answer')
            .eq('id', gameState.current_image_id)
            .single();

        res.json({
            isComplete: true,
            finalPrediction: gameState.final_prediction,
            correctAnswer: currentImage.correct_answer,
            isCorrect: gameState.final_prediction === currentImage.correct_answer
        });
    } catch (err) {
        handleError(res, err, 'Failed to fetch round results');
    }
};