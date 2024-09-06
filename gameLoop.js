const { getSupabase } = require('./db/supabase');

let gameInterval;
let checkGameStartInterval;
const GAME_TICK_INTERVAL = 5000; // 5 seconds
const GAME_START_CHECK_INTERVAL = 10000; // 10 seconds

async function gameLoop() {
    const supabase = getSupabase();

    try {
        // Fetch current game state
        const { data: gameState, error: stateError } = await supabase
            .from('game_state')
            .select('*')
            .order('current_round', { ascending: false })
            .limit(1)
            .single();

        if (stateError) throw stateError;
        if (!gameState.game_started) return console.log('Game has not started yet');

        // Handle round completion and weight update
        if (gameState.is_round_complete) {
            if (!gameState.is_weights_updated) {
                await backpropagateWeightsForRound(gameState.current_round);
            } else {
                await startNewRound();
            }
            return;
        }

        // Group 1 prediction handling
        if (!gameState.group1_complete) await handleGroup1Bots(gameState);

        const { data: group1Users, error: group1Error } = await supabase
            .from('vk_demo_db')
            .select('id')
            .eq('group_number', 1);

        if (group1Error) throw group1Error;

        if (gameState.group1_predictions.length === group1Users.length && !gameState.group1_complete) {
            await supabase
                .from('game_state')
                .update({ group1_complete: true })
                .eq('current_round', gameState.current_round);
        }

        // Group 2 prediction handling
        if (gameState.group1_complete) await handleGroup2Bots(gameState);

        const { data: group2Users, error: group2Error } = await supabase
            .from('vk_demo_db')
            .select('id')
            .eq('group_number', 2);

        if (group2Error) throw group2Error;

        if (gameState.group2_predictions.length === group2Users.length && !gameState.is_round_complete) {
            await makeFinalNodeBotPrediction(gameState.current_round);
        }

    } catch (error) {
        console.error('Error in game loop:', error);
    }
}

async function makeFinalNodeBotPrediction(round) {
    const supabase = getSupabase();

    try {
        const { data: gameState } = await supabase
            .from('game_state')
            .select('group2_predictions, current_image_id, final_prediction')
            .eq('current_round', round)
            .single();

        if (gameState.final_prediction !== null) {
            return console.log(`Final prediction for round ${round} already made`);
        }

        const { data: connections } = await supabase
            .from('connections')
            .select('source_user_id, target_user_id, weight')
            .eq('target_user_id', (await supabase.from('vk_demo_db').select('id').eq('group_number', -2).single()).data.id);

        let weightedSum = 0;
        for (const prediction of gameState.group2_predictions) {
            const connection = connections.find(c => c.source_user_id === prediction.user_id);
            if (connection) {
                weightedSum += prediction.prediction * connection.weight;
            }
        }

        // Apply sigmoid to convert weighted sum to a probability
        const sigmoidResult = sigmoid(weightedSum);

        // Threshold to decide between 1 (phytoplankton) or -1 (not phytoplankton)
        const finalPrediction = sigmoidResult >= 0.5 ? 1 : -1;

        const { data: correctAnswer } = await supabase
            .from('images')
            .select('correct_answer')
            .eq('id', gameState.current_image_id)
            .single();

        const isCorrect = finalPrediction === correctAnswer.correct_answer;

        await supabase
            .from('vk_demo_db')
            .update({
                has_given_input: true
            })
            .eq('group_number', '-2')

        await supabase
            .from('game_state')
            .update({
                final_prediction: finalPrediction,
                is_round_complete: true,
                is_weights_updated: false  // Reset this flag for the new round
            })
            .eq('current_round', round);

        console.log(`Final prediction for round ${round}: ${finalPrediction}, Correct: ${isCorrect}`);
    } catch (error) {
        console.error('Error making final node bot prediction:', error);
    }
}

async function backpropagateWeightsForRound(round) {
    const supabase = getSupabase();

    try {
        const { data: gameState } = await supabase
            .from('game_state')
            .select('group1_predictions, group2_predictions, current_image_id, final_prediction, is_round_complete, is_weights_updated')
            .eq('current_round', round)
            .single();

        if (!gameState.is_round_complete || gameState.is_weights_updated) {
            console.log(`Weights already updated or round not complete for round ${round}.`);
            return;
        }

        const { data: correctAnswer } = await supabase
            .from('images')
            .select('correct_answer')
            .eq('id', gameState.current_image_id)
            .single();

        const { data: connections } = await supabase
            .from('connections')
            .select('*');

        const finalNodeId = (await supabase.from('vk_demo_db').select('id').eq('group_number', -2).single()).data.id;

        const learningRate = 0.1;
        const target = correctAnswer.correct_answer === gameState.final_prediction ? 1 : -1;

        // Calculate error for the final output
        const outputError = target - (gameState.final_prediction === correctAnswer.correct_answer ? 1 : -1);

        // Update weights for connections between Group 2 and Final Node
        for (const prediction of gameState.group2_predictions) {
            const connection = connections.find(c => c.source_user_id === prediction.user_id && c.target_user_id === finalNodeId);
            if (connection) {
                const weightUpdate = learningRate * outputError * prediction.prediction;
                await supabase
                    .from('connections')
                    .update({ weight: connection.weight + weightUpdate })
                    .eq('id', connection.id);
            }
        }

        // Calculate errors for Group 2 nodes
        const group2Errors = {};
        for (const g2Prediction of gameState.group2_predictions) {
            const connection = connections.find(c => c.source_user_id === g2Prediction.user_id && c.target_user_id === finalNodeId);
            if (connection) {
                group2Errors[g2Prediction.user_id] = outputError * connection.weight;
            }
        }

        // Update weights for connections between Group 1 and Group 2
        for (const g1Prediction of gameState.group1_predictions) {
            for (const g2Prediction of gameState.group2_predictions) {
                const connection = connections.find(c => c.source_user_id === g1Prediction.user_id && c.target_user_id === g2Prediction.user_id);
                if (connection) {
                    const g2Error = group2Errors[g2Prediction.user_id];
                    const weightUpdate = learningRate * g2Error * g1Prediction.prediction;
                    await supabase
                        .from('connections')
                        .update({ weight: connection.weight + weightUpdate })
                        .eq('id', connection.id);
                }
            }
        }

        await supabase
            .from('game_state')
            .update({ is_weights_updated: true })
            .eq('current_round', round);

        console.log(`Weights updated successfully for round ${round}.`);
    } catch (error) {
        console.error('Error updating weights for round:', error);
    }
}


async function handleGroup1Bots(gameState) {
    const supabase = getSupabase();
    const { data: group1Bots, error } = await supabase
        .from('vk_demo_db')
        .select('id')
        .eq('group_number', 1)
        .eq('is_bot', true);

    if (error) throw error;

    for (const bot of group1Bots) {
        const alreadyPredicted = gameState.group1_predictions.some(p => p.user_id === bot.id);
        if (!alreadyPredicted) {
            await submitBotPrediction(bot.id, gameState.current_round, 1);
        }
    }
}

async function handleGroup2Bots(gameState) {
    const supabase = getSupabase();
    const { data: group2Bots, error } = await supabase
        .from('vk_demo_db')
        .select('id')
        .eq('group_number', 2)
        .eq('is_bot', true);

    if (error) throw error;

    for (const bot of group2Bots) {
        const alreadyPredicted = gameState.group2_predictions.some(p => p.user_id === bot.id);
        if (!alreadyPredicted) {
            await submitBotPrediction(bot.id, gameState.current_round, 2);
        }
    }
}

async function submitBotPrediction(botId, round, groupNumber) {
    const prediction = Math.random() < 0.5 ? -1 : 1;
    const supabase = getSupabase();

    try {
        const { data: gameState, error } = await supabase
            .from('game_state')
            .select(`current_round, group${groupNumber}_predictions`)
            .eq('current_round', round)
            .single();

        if (error) throw error;

        const alreadyPredicted = gameState[`group${groupNumber}_predictions`].some(p => p.user_id === botId);
        if (alreadyPredicted) return;

        const updatedPredictions = [
            ...gameState[`group${groupNumber}_predictions`],
            { user_id: botId, prediction }
        ];

        await supabase
            .from('game_state')
            .update({ [`group${groupNumber}_predictions`]: updatedPredictions })
            .eq('current_round', round);

        await supabase
            .from('vk_demo_db')
            .update({ has_given_input: true })
            .eq('id', botId);

        console.log(`Bot ${botId} prediction submitted for round ${round}`);
    } catch (error) {
        console.error(`Error submitting prediction for bot ${botId}:`, error);
    }
}

async function startNewRound() {
    const supabase = getSupabase();

    try {
        const { data: currentState } = await supabase
            .from('game_state')
            .select('*')
            .order('current_round', { ascending: false })
            .limit(1)
            .single();

        const { data: newImage } = await supabase
            .from('images')
            .select('id, url')
            .eq('used', false)
            .limit(1)
            .single();

        if (!newImage) {
            await endGame();
            return;
        }

        await supabase
            .from('images')
            .update({ used: true })
            .eq('id', newImage.id);

        await supabase
            .from('game_state')
            .insert({
                current_round: currentState.current_round + 1,
                current_image_id: newImage.id,
                current_image_url: newImage.url,
                group1_predictions: [],
                group2_predictions: [],
                group1_complete: false,
                is_round_complete: false,
                final_prediction: null,
                game_started: true,
                is_weights_updated: false
            })
            .select()
            .single();

        await supabase
            .from('vk_demo_db')
            .update({ has_given_input: false })
            .neq('group_number', 100);

        console.log('New round started');
    } catch (error) {
        console.error('Error starting new round:', error);
        throw error;
    }
}

function startGameLoop() {
    if (!gameInterval) {
        gameInterval = setInterval(gameLoop, GAME_TICK_INTERVAL);
        console.log('Game loop started');
    }
}

function stopGameLoop() {
    if (gameInterval) {
        clearInterval(gameInterval);
        gameInterval = null;
        console.log('Game loop stopped');
        startCheckGameStartInterval();
    }
}

async function checkGameStart() {
    const supabase = getSupabase();

    try {
        const { data: gameState, error } = await supabase
            .from('game_state')
            .select('game_started')
            .order('current_round', { ascending: false })
            .limit(1)
            .single();

        if (error) throw error;

        if (gameState.game_started) {
            startGameLoop();
            stopCheckGameStartInterval();
        }
    } catch (error) {
        console.error('Error checking game start:', error);
    }
}

function startCheckGameStartInterval() {
    if (!checkGameStartInterval) {
        checkGameStartInterval = setInterval(checkGameStart, GAME_START_CHECK_INTERVAL);
        console.log('Checking game start every 10 seconds.');
    }
}

function stopCheckGameStartInterval() {
    if (checkGameStartInterval) {
        clearInterval(checkGameStartInterval);
        checkGameStartInterval = null;
        console.log('Stopped checking game start.');
    }
}

async function endGame() {
    const supabase = getSupabase();

    try {
        await supabase
            .from('game_state')
            .insert({
                current_round: 100,
                current_image_id: null,
                group1_predictions: [],
                group2_predictions: [],
                group1_complete: true,
                is_round_complete: true,
                game_over: true,
                game_started: false,
                is_weights_updated: true
            })
            .select()
            .single();

        stopGameLoop();
        console.log('Game ended.');
    } catch (error) {
        console.error('Error ending game:', error);
        throw error;
    }
}

function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
}

module.exports = {
    startGameLoop,
    stopGameLoop,
    startNewRound,
    endGame
};