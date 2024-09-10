const { getSupabase } = require('./db/supabase');
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const GAME_TICK_INTERVAL = 2000; // 2 seconds
const GAME_START_CHECK_INTERVAL = 10000; // 10 seconds

let gameInterval;
let checkGameStartInterval;
let currentGameState = null;

async function fetchGameState() {
    const supabase = getSupabase();
    const { data: gameState, error } = await supabase
        .from('game_state')
        .select('*')
        .order('current_round', { ascending: false })
        .limit(1)
        .single();

    if (error) throw error;
    return gameState;
}

async function updateGameState(updates) {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('game_state')
        .update(updates)
        .eq('current_round', currentGameState.current_round)
        .select()
        .single();

    if (error) throw error;
    currentGameState = data;
}

async function gameLoop() {
    try {
        currentGameState = await fetchGameState();
        if (!currentGameState.game_started) return console.log('Game has not started yet');

        if (currentGameState.is_round_complete) {
            if (!currentGameState.is_weights_updated) {
                await backpropagateWeightsForRound(currentGameState.current_round);
            } else {
                await startNewRound();
            }
            return;
        }

        if (!currentGameState.group1_complete) {
            await handleGroupBots(1);
            await checkGroupCompletion(1);
        }

        if (currentGameState.group1_complete && !currentGameState.group2_complete) {
            await handleGroupBots(2);
            await checkGroupCompletion(2);
        }

        if (currentGameState.group2_complete && !currentGameState.is_round_complete) {
            await makeFinalNodeBotPrediction(currentGameState.current_round);
            await storeRoundAccuracy(currentGameState.current_round);
        }
    } catch (error) {
        console.error('Error in game loop:', error);
    }
}

async function handleGroupBots(groupNumber) {
    const supabase = getSupabase();
    const { data: bots, error } = await supabase
        .from('vk_demo_db')
        .select('id')
        .eq('group_number', groupNumber)
        .eq('is_bot', true)
        .eq('has_given_input', false);

    if (error) throw error;

    const predictions = bots.map(bot => ({
        user_id: bot.id,
        prediction: Math.random() < 0.5 ? -1 : 1
    }));

    if (predictions.length > 0) {
        const updatedPredictions = [
            ...currentGameState[`group${groupNumber}_predictions`],
            ...predictions
        ];

        await updateGameState({ [`group${groupNumber}_predictions`]: updatedPredictions });

        await supabase
            .from('vk_demo_db')
            .update({ has_given_input: true })
            .in('id', bots.map(bot => bot.id));
    }
}

async function checkGroupCompletion(groupNumber) {
    const supabase = getSupabase();
    const { data: users, error } = await supabase
        .from('vk_demo_db')
        .select('id')
        .eq('group_number', groupNumber);

    if (error) throw error;

    if (currentGameState[`group${groupNumber}_predictions`].length === users.length) {
        await updateGameState({ [`group${groupNumber}_complete`]: true });
    }
}

async function makeFinalNodeBotPrediction(round) {
    const supabase = getSupabase();

    try {
        if (currentGameState.final_prediction !== null) {
            return console.log(`Final prediction for round ${round} already made`);
        }

        const { data: connections } = await supabase
            .from('connections')
            .select('source_user_id, target_user_id, weight')
            .eq('target_user_id', (await supabase.from('vk_demo_db').select('id').eq('group_number', -2).single()).data.id);

        let weightedSum = 0;
        for (const prediction of currentGameState.group2_predictions) {
            const connection = connections.find(c => c.source_user_id === prediction.user_id);
            if (connection) {
                weightedSum += prediction.prediction * connection.weight;
            }
        }

        // Use sign function instead of sigmoid for binary classification
        const finalPrediction = Math.sign(weightedSum);

        const { data: correctAnswer } = await supabase
            .from('images')
            .select('correct_answer')
            .eq('id', currentGameState.current_image_id)
            .single();

        const isCorrect = finalPrediction === correctAnswer.correct_answer;

        await supabase
            .from('vk_demo_db')
            .update({ has_given_input: true })
            .eq('group_number', '-2');

        await updateGameState({
            final_prediction: finalPrediction,
            is_round_complete: true,
            is_weights_updated: false
        });

        console.log(`Final prediction for round ${round}: ${finalPrediction}, Correct: ${isCorrect}`);
    } catch (error) {
        console.error('Error making final node bot prediction:', error);
    }
}

async function backpropagateWeightsForRound(round) {
    const supabase = getSupabase();

    try {
        console.log(`Starting weight updates for round ${round}`);

        if (!currentGameState.is_round_complete || currentGameState.is_weights_updated) {
            console.log(`Weights already updated or round not complete for round ${round}.`);
            return;
        }

        const { data: correctAnswer } = await supabase
            .from('images')
            .select('correct_answer')
            .eq('id', currentGameState.current_image_id)
            .single();

        const { data: connections } = await supabase
            .from('connections')
            .select('*');

        const { data: finalNode } = await supabase
            .from('vk_demo_db')
            .select('id')
            .eq('group_number', -2)
            .single();

        const finalNodeId = finalNode.id;
        const learningRate = 0.05;

        // Calculate weighted sum for the final node
        const weightedSum = currentGameState.group2_predictions.reduce((sum, pred) => {
            const connection = connections.find(c => c.source_user_id === pred.user_id && c.target_user_id === finalNodeId);
            return sum + (connection ? pred.prediction * connection.weight : 0);
        }, 0);

        // Calculate Hinge Loss
        const hingeLoss = Math.max(0, 1 - correctAnswer.correct_answer * weightedSum);
        console.log(`Round ${round} - Hinge Loss: ${hingeLoss.toFixed(4)}`);
        console.log(`  Correct Answer: ${correctAnswer.correct_answer}, Weighted Sum: ${weightedSum.toFixed(4)}`);

        // Object to store all weight updates
        const weightUpdates = {};

        // Update weights for Group 2 to Final Node
        for (const prediction of currentGameState.group2_predictions) {
            const connection = connections.find(c => c.source_user_id === prediction.user_id && c.target_user_id === finalNodeId);
            if (connection) {
                const gradient = hingeLoss > 0 ? -correctAnswer.correct_answer * prediction.prediction : 0;
                const weightUpdate = learningRate * gradient;
                const newWeight = connection.weight - weightUpdate;
                weightUpdates[connection.id] = newWeight;
            }
        }

        // Calculate gradients for Group 2 nodes
        const group2Gradients = {};
        for (const g2Prediction of currentGameState.group2_predictions) {
            const connection = connections.find(c => c.source_user_id === g2Prediction.user_id && c.target_user_id === finalNodeId);
            if (connection) {
                group2Gradients[g2Prediction.user_id] = hingeLoss > 0 ? -correctAnswer.correct_answer * connection.weight : 0;
            }
        }

        // Update weights for Group 1 to Group 2
        for (const g1Prediction of currentGameState.group1_predictions) {
            for (const g2Prediction of currentGameState.group2_predictions) {
                const connection = connections.find(c => c.source_user_id === g1Prediction.user_id && c.target_user_id === g2Prediction.user_id);
                if (connection) {
                    const g2Gradient = group2Gradients[g2Prediction.user_id];
                    const weightUpdate = learningRate * g2Gradient * g1Prediction.prediction;
                    const newWeight = connection.weight - weightUpdate;
                    weightUpdates[connection.id] = newWeight;
                }
            }
        }

        // Batch update all weights
        const updatePromises = Object.entries(weightUpdates).map(([connectionId, newWeight]) =>
            supabase
                .from('connections')
                .update({ weight: newWeight })
                .eq('id', connectionId)
        );

        await Promise.all(updatePromises);

        await updateGameState({ is_weights_updated: true });

        console.log(`Weights updated successfully for round ${round}.`);
    } catch (error) {
        console.error(`Error in backpropagateWeightsForRound for round ${round}:`, error);
    }
}

async function startNewRound() {
    const supabase = getSupabase();

    try {
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

        const newGameState = {
            current_round: currentGameState.current_round + 1,
            current_image_id: newImage.id,
            current_image_url: newImage.url,
            group1_predictions: [],
            group2_predictions: [],
            group1_complete: false,
            group2_complete: false,
            is_round_complete: false,
            final_prediction: null,
            game_started: true,
            is_weights_updated: false
        };

        await supabase
            .from('game_state')
            .insert(newGameState)
            .select()
            .single();

        await supabase
            .from('vk_demo_db')
            .update({ has_given_input: false })
            .neq('group_number', 100);

        currentGameState = newGameState;
        console.log('New round started');
    } catch (error) {
        console.error('Error starting new round:', error);
        throw error;
    }
}

async function storeRoundAccuracy(round) {
    const supabase = getSupabase();

    try {
        const { data: image } = await supabase
            .from('images')
            .select('correct_answer')
            .eq('id', currentGameState.current_image_id)
            .single();

        const accuracy = currentGameState.final_prediction === image.correct_answer ? 1 : 0;

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

        // Define margins
        const margin = { top: 20, right: 30, bottom: 50, left: 60 };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;

        // Draw axes
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(margin.left, height - margin.bottom);
        ctx.lineTo(width - margin.right, height - margin.bottom);
        ctx.moveTo(margin.left, height - margin.bottom);
        ctx.lineTo(margin.left, margin.top);
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
            const x = margin.left + (index / (accuracies.length - 1)) * plotWidth;
            const y = height - margin.bottom - point.accuracy * plotHeight;
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
            const x = margin.left + ((index + 2) / (accuracies.length - 1)) * plotWidth;
            const y = height - margin.bottom - point.average * plotHeight;
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
        ctx.textAlign = 'center';
        ctx.fillText('Round', width / 2, height - 10);
        ctx.save();
        ctx.translate(20, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Accuracy', 0, 0);
        ctx.restore();

        // Add legend
        ctx.font = '14px Arial';
        ctx.fillStyle = 'blue';
        ctx.fillRect(width - margin.right - 150, margin.top, 20, 10);
        ctx.fillStyle = 'black';
        ctx.fillText('Accuracy', width - margin.right - 125, margin.top + 10);
        ctx.fillStyle = 'red';
        ctx.fillRect(width - margin.right - 150, margin.top + 20, 20, 10);
        ctx.fillStyle = 'black';
        ctx.fillText('3-Round Moving Average', width - margin.right - 125, margin.top + 30);

        // Add tick marks and labels for y-axis
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.textAlign = 'right';
        for (let i = 0; i <= 10; i++) {
            const y = height - margin.bottom - i * (plotHeight / 10);
            ctx.beginPath();
            ctx.moveTo(margin.left - 5, y);
            ctx.lineTo(margin.left, y);
            ctx.stroke();
            ctx.fillText((i / 10).toFixed(2), margin.left - 10, y + 5);
        }

        // Add tick marks and labels for x-axis
        ctx.textAlign = 'center';
        const tickInterval = Math.ceil(accuracies.length / 10);
        for (let i = 0; i < accuracies.length; i += tickInterval) {
            const x = margin.left + (i / (accuracies.length - 1)) * plotWidth;
            ctx.beginPath();
            ctx.moveTo(x, height - margin.bottom);
            ctx.lineTo(x, height - margin.bottom + 5);
            ctx.stroke();
            ctx.fillText(accuracies[i].round.toString(), x, height - margin.bottom + 20);
        }

        // Add ticks for the last round of each moving average window
        ctx.strokeStyle = 'red';
        movingAverage.forEach((point, index) => {
            const x = margin.left + ((index + 2) / (accuracies.length - 1)) * plotWidth;
            ctx.beginPath();
            ctx.moveTo(x, height - margin.bottom);
            ctx.lineTo(x, height - margin.bottom + 10);
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
                group2_complete: true,
                is_round_complete: true,
                game_over: true,
                game_started: false,
                is_weights_updated: true
            })
            .select()
            .single();

        stopGameLoop();
        console.log('Game ended.');

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
    try {
        const gameState = await fetchGameState();
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
        console.log('Checking game start every 5 seconds.');
    }
}

function stopCheckGameStartInterval() {
    if (checkGameStartInterval) {
        clearInterval(checkGameStartInterval);
        checkGameStartInterval = null;
        console.log('Stopped checking game start.');
    }
}

module.exports = {
    startGameLoop,
    stopGameLoop,
    startNewRound,
    endGame
};