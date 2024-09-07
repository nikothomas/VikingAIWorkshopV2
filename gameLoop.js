const { getSupabase } = require('./db/supabase');

let gameInterval;
let checkGameStartInterval;
const GAME_TICK_INTERVAL = 15000; // 15 seconds
const GAME_START_CHECK_INTERVAL = 9000; // 9 seconds
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

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

        // After making the final node bot prediction, calculate and store the accuracy
        if (gameState.group2_predictions.length === group2Users.length && !gameState.is_round_complete) {
            await makeFinalNodeBotPrediction(gameState.current_round);
            await storeRoundAccuracy(gameState.current_round);
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
        console.log(`Starting weight updates for round ${round}`);

        // Fetch game state
        const { data: gameState, error: gameStateError } = await supabase
            .from('game_state')
            .select('group1_predictions, group2_predictions, current_image_id, final_prediction, is_round_complete, is_weights_updated')
            .eq('current_round', round)
            .single();

        if (gameStateError) {
            throw new Error(`Failed to fetch game state: ${gameStateError.message}`);
        }

        if (!gameState.is_round_complete || gameState.is_weights_updated) {
            console.log(`Weights already updated or round not complete for round ${round}.`);
            return;
        }

        // Fetch correct answer
        const { data: correctAnswer, error: correctAnswerError } = await supabase
            .from('images')
            .select('correct_answer')
            .eq('id', gameState.current_image_id)
            .single();

        if (correctAnswerError) {
            throw new Error(`Failed to fetch correct answer: ${correctAnswerError.message}`);
        }

        console.log(`Correct answer for round ${round}: ${correctAnswer.correct_answer}`);
        console.log(`Final prediction for round ${round}: ${gameState.final_prediction}`);

        // Fetch connections
        const { data: connections, error: connectionsError } = await supabase
            .from('connections')
            .select('*');

        if (connectionsError) {
            throw new Error(`Failed to fetch connections: ${connectionsError.message}`);
        }

        console.log(`Fetched ${connections.length} connections`);

        // Fetch final node ID
        const { data: finalNode, error: finalNodeError } = await supabase
            .from('vk_demo_db')
            .select('id')
            .eq('group_number', -2)
            .single();

        if (finalNodeError) {
            throw new Error(`Failed to fetch final node: ${finalNodeError.message}`);
        }

        const finalNodeId = finalNode.id;
        console.log(`Final node ID: ${finalNodeId}`);

        const learningRate = 0.05;

        // Correct error calculation
        const outputError = correctAnswer.correct_answer - gameState.final_prediction;
        console.log(`Output error: ${outputError} (Correct Answer: ${correctAnswer.correct_answer}, Final Prediction: ${gameState.final_prediction})`);

        // Update weights for connections between Group 2 and Final Node
        console.log('Updating weights for Group 2 to Final Node connections:');
        for (const prediction of gameState.group2_predictions) {
            const connection = connections.find(c => c.source_user_id === prediction.user_id && c.target_user_id === finalNodeId);
            if (connection) {
                const weightUpdate = learningRate * outputError * prediction.prediction;
                const oldWeight = connection.weight;
                const newWeight = oldWeight + weightUpdate;

                try {
                    const { error: updateError } = await supabase
                        .from('connections')
                        .update({ weight: newWeight })
                        .eq('id', connection.id);

                    if (updateError) {
                        throw new Error(`Failed to update Group 2 to Final Node connection: ${updateError.message}`);
                    }
                } catch (error) {
                    console.error(`    Error updating Group 2 to Final Node connection for user ${prediction.user_id}:`, error);
                }
            }
        }

        // Calculate errors for Group 2 nodes
        const group2Errors = {};
        console.log('Calculating errors for Group 2 nodes:');
        for (const g2Prediction of gameState.group2_predictions) {
            const connection = connections.find(c => c.source_user_id === g2Prediction.user_id && c.target_user_id === finalNodeId);
            if (connection) {
                group2Errors[g2Prediction.user_id] = outputError * connection.weight;

            }
        }

        // Update weights for connections between Group 1 and Group 2
        console.log('Updating weights for Group 1 to Group 2 connections:');
        for (const g1Prediction of gameState.group1_predictions) {
            for (const g2Prediction of gameState.group2_predictions) {
                const connection = connections.find(c => c.source_user_id === g1Prediction.user_id && c.target_user_id === g2Prediction.user_id);
                if (connection) {
                    const g2Error = group2Errors[g2Prediction.user_id];
                    const weightUpdate = learningRate * g2Error * g1Prediction.prediction;
                    const oldWeight = connection.weight;
                    const newWeight = oldWeight + weightUpdate;

                    try {
                        const { error: updateError } = await supabase
                            .from('connections')
                            .update({ weight: newWeight })
                            .eq('id', connection.id);

                        if (updateError) {
                            throw new Error(`Failed to update Group 1 to Group 2 connection: ${updateError.message}`);
                        }
                    } catch (error) {
                        console.error(`    Error updating Group 1 to Group 2 connection for users ${g1Prediction.user_id} to ${g2Prediction.user_id}:`, error);
                    }
                }
            }
        }

        // Mark weights as updated
        const { error: finalUpdateError } = await supabase
            .from('game_state')
            .update({ is_weights_updated: true })
            .eq('current_round', round);

        if (finalUpdateError) {
            throw new Error(`Failed to mark weights as updated: ${finalUpdateError.message}`);
        }

        console.log(`Weights updated successfully for round ${round}.`);
    } catch (error) {
        console.error(`Error in backpropagateWeightsForRound for round ${round}:`, error);
        // You might want to add additional error handling here, such as notifying an admin or retrying the operation
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

async function storeRoundAccuracy(round) {
    const supabase = getSupabase();

    try {
        const { data: gameState } = await supabase
            .from('game_state')
            .select('final_prediction, current_image_id')
            .eq('current_round', round)
            .single();

        const { data: image } = await supabase
            .from('images')
            .select('correct_answer')
            .eq('id', gameState.current_image_id)
            .single();

        const accuracy = gameState.final_prediction === image.correct_answer ? 1 : 0;

        await supabase
            .from('round_accuracies')
            .insert({ round, accuracy });

    } catch (error) {
        console.error('Error storing round accuracy:', error);
    }
}

async function generateAccuracyPlot() {
    const supabase = getSupabase();

    try {
        const { data: accuracies } = await supabase
            .from('round_accuracies')
            .select('round, accuracy')
            .order('round', { ascending: true });

        const width = 800;
        const height = 400;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Set background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);

        // Draw axes
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(50, 350);
        ctx.lineTo(750, 350);
        ctx.moveTo(50, 350);
        ctx.lineTo(50, 50);
        ctx.stroke();

        // Calculate moving average
        const movingAverage = accuracies.map((point, index, array) => {
            if (index < 2) return null;
            const sum = array.slice(index - 2, index + 1).reduce((acc, curr) => acc + curr.accuracy, 0);
            return { round: point.round, average: sum / 3 };
        }).filter(point => point !== null);

        // Plot accuracy points
        ctx.strokeStyle = 'blue';
        ctx.lineWidth = 2;
        ctx.beginPath();
        accuracies.forEach((point, index) => {
            const x = 50 + (index / (accuracies.length - 1)) * 700;
            const y = 350 - point.accuracy * 300;
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();

        // Plot moving average
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.beginPath();
        movingAverage.forEach((point, index) => {
            const x = 50 + ((index + 2) / (accuracies.length - 1)) * 700;
            const y = 350 - point.average * 300;
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();

        // Add labels
        ctx.fillStyle = 'black';
        ctx.font = '16px Arial';
        ctx.fillText('Round', 375, 390);
        ctx.save();
        ctx.translate(20, 200);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Accuracy', 0, 0);
        ctx.restore();

        // Add legend
        ctx.font = '14px Arial';
        ctx.fillStyle = 'blue';
        ctx.fillRect(600, 50, 20, 10);
        ctx.fillStyle = 'black';
        ctx.fillText('Accuracy', 625, 60);
        ctx.fillStyle = 'red';
        ctx.fillRect(600, 70, 20, 10);
        ctx.fillStyle = 'black';
        ctx.fillText('3-Round Moving Average', 625, 80);

        // Add tick marks and labels for y-axis
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.textAlign = 'right';
        for (let i = 0; i <= 10; i++) {
            const y = 350 - i * 30;
            ctx.beginPath();
            ctx.moveTo(45, y);
            ctx.lineTo(55, y);
            ctx.stroke();
            ctx.fillText((i / 10).toFixed(2), 40, y + 5);
        }

        // Add tick marks and labels for x-axis
        ctx.textAlign = 'center';
        const tickInterval = Math.ceil(accuracies.length / 10);
        for (let i = 0; i < accuracies.length; i += tickInterval) {
            const x = 50 + (i / (accuracies.length - 1)) * 700;
            ctx.beginPath();
            ctx.moveTo(x, 350);
            ctx.lineTo(x, 355);
            ctx.stroke();
            ctx.fillText(accuracies[i].round.toString(), x, 370);
        }

        // Add ticks for the last round of each moving average window
        ctx.strokeStyle = 'red';
        movingAverage.forEach((point, index) => {
            const x = 50 + ((index + 2) / (accuracies.length - 1)) * 700;
            ctx.beginPath();
            ctx.moveTo(x, 350);
            ctx.lineTo(x, 360);
            ctx.stroke();
        });

        // Save the plot
        const buffer = canvas.toBuffer('image/png');
        const plotPath = path.join(__dirname, 'public', 'accuracy_plot.png');
        fs.writeFileSync(plotPath, buffer);

        console.log('Accuracy plot generated and saved');
        return plotPath;
    } catch (error) {
        console.error('Error generating accuracy plot:', error);
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

        // Generate and save the accuracy plot
        const plotPath = await generateAccuracyPlot();
        console.log(`Accuracy plot saved at: ${plotPath}`);

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