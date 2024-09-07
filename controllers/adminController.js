const { getSupabase } = require('../db/supabase');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const gameController = require('./gameController');
const { getRobotIcon, getFinalNodeIcon } = require('../iconUtils');

const handleErrors = (res, error, customMessage) => {
    console.error(customMessage, error);
    res.status(500).json({ error: customMessage });
};

exports.createBot = async (req, res) => {
    const { groupNumber, count } = req.body;
    const supabase = getSupabase();

    try {
        const robotIcon = getRobotIcon();
        const bots = Array.from({ length: count }, () => ({
            id: uuidv4(),
            group_number: groupNumber,
            is_bot: true,
            icon: robotIcon
        }));

        const { error } = await supabase.from('vk_demo_db').insert(bots);
        if (error) throw error;

        res.json({ message: `${count} bots created for group ${groupNumber}` });
    } catch (error) {
        console.error('Failed to create bots:', error);
        res.status(500).json({ error: 'Failed to create bots' });
    }
};

exports.getGameStats = async (req, res) => {
    const supabase = getSupabase();

    try {
        let gameState = await supabase
            .from('game_state')
            .select('*')
            .limit(1)
            .single();

        if (!gameState.data) {
            gameState = await gameController.resetGame();
        }

        const [{ count: group1Count }, { count: group2Count }, { count: imageCount }] = await Promise.all([
            supabase.from('vk_demo_db').select('id', { count: 'exact', head: true }).eq('group_number', 1),
            supabase.from('vk_demo_db').select('id', { count: 'exact', head: true }).eq('group_number', 2),
            supabase.from('images').select('id', { count: 'exact', head: true })
        ]);

        res.json({
            currentRound: gameState.data.current_round,
            totalUsers: group1Count + group2Count,
            group1Users: group1Count,
            group2Users: group2Count,
            totalImages: imageCount,
            usedImages: gameState.data.current_round,
            isRoundComplete: gameState.data.is_round_complete,
            gameStarted: gameState.data.game_started,
            gameOver: gameState.data.game_over,
            isWeightsUpdated: gameState.data.is_weights_updated
        });
    } catch (error) {
        console.error('Error fetching game stats:', error);
        res.status(500).json({ error: 'Failed to fetch game stats', details: error.message });
    }
};

exports.createFinalNodeBot = async (req, res) => {
    const supabase = getSupabase();

    try {
        const { data: existingBot } = await supabase
            .from('vk_demo_db')
            .select('id')
            .eq('group_number', -2)
            .single();

        if (existingBot) {
            return res.status(400).json({ message: 'Final node bot already exists' });
        }

        const finalNodeBotId = uuidv4();
        const finalNodeIcon = getFinalNodeIcon();
        await supabase
            .from('vk_demo_db')
            .insert({
                id: finalNodeBotId,
                group_number: -2,
                is_bot: true,
                icon: finalNodeIcon
            });

        res.json({ message: 'Final node bot created successfully', id: finalNodeBotId });
    } catch (error) {
        console.error('Error creating final node bot:', error);
        res.status(500).json({ error: 'Failed to create final node bot', details: error.message });
    }
};

exports.checkFinalNodeBot = async (req, res) => {
    const supabase = getSupabase();

    try {
        const { data: finalNodeBot } = await supabase
            .from('vk_demo_db')
            .select('id')
            .eq('group_number', -2)
            .single();

        res.json({ exists: !!finalNodeBot, id: finalNodeBot?.id });
    } catch (error) {
        console.error('Error checking final node bot:', error);
        res.status(500).json({ error: 'Failed to check final node bot status', details: error.message });
    }
};

exports.login = async (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === process.env.ADMIN_PASSWORD) {
        const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
};

exports.assignGroup = async (req, res) => {
    const { userID, groupNumber } = req.body;
    const supabase = getSupabase();

    try {
        await supabase
            .from('vk_demo_db')
            .update({ group_number: groupNumber })
            .eq('id', userID);

        if (groupNumber === 1) {
            await gameController.assignSubgroups();
        }

        res.json({ message: `User assigned to group ${groupNumber}` });
    } catch (error) {
        console.error('Failed to assign user to group:', error);
        res.status(500).json({ error: 'Failed to assign user to group' });
    }
};

exports.getUsersInfo = async (req, res) => {
    const supabase = getSupabase();

    try {
        const [
            { data: waitingUsers },
            { data: group1Users },
            { data: group2Users },
            { data: connections },
            { data: finalNode }
        ] = await Promise.all([
            supabase.from('vk_demo_db').select('id, is_bot, icon').eq('group_number', -1),
            supabase.from('vk_demo_db').select('id, is_bot, icon').eq('group_number', 1),
            supabase.from('vk_demo_db').select('id, is_bot, icon').eq('group_number', 2),
            supabase.from('connections').select('*'),
            supabase.from('vk_demo_db').select('id, is_bot, icon').eq('group_number, icon', -2).single()
        ]);

        res.json({
            waitingUsers,
            group1Users,
            group2Users,
            connections,
            finalNodeId: finalNode ? finalNode.id : null,
            groupCounts: {
                group1Count: group1Users.length,
                group2Count: group2Users.length
            }
        });
    } catch (error) {
        handleErrors(res, error, 'Failed to fetch users info');
    }
};

exports.deleteUser = async (req, res) => {
    const { userID } = req.body;
    const supabase = getSupabase();

    try {
        const { data: user, error: fetchError } = await supabase
            .from('vk_demo_db')
            .select('group_number')
            .eq('id', userID)
            .single();

        if (fetchError) throw fetchError;

        await supabase.from('vk_demo_db').delete().eq('id', userID);

        // Delete connections related to this user
        await supabase
            .from('connections')
            .delete()
            .or(`source_user_id.eq.${userID},target_user_id.eq.${userID}`);

        if (user.group_number === 1) {
            await gameController.assignSubgroups();
        }

        res.json({ message: 'User and related connections deleted successfully.' });
    } catch (error) {
        console.error('Failed to delete user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
};

// Add this new function to handle the /admin/assign-subgroups route
exports.assignSubgroups = async (req, res) => {
    try {
        await gameController.assignSubgroups();
        res.json({ message: 'Subgroups assigned successfully' });
    } catch (error) {
        console.error('Failed to assign subgroups:', error);
        res.status(500).json({ error: 'Failed to assign subgroups' });
    }
};



exports.getGameState = async (req, res) => {
    const supabase = getSupabase();

    try {
        const { data: gameState, error } = await supabase
            .from('game_state')
            .select('*')
            .order('current_round', { ascending: false })
            .limit(1)
            .single();

        if (error) throw error;
        res.json(gameState);
    } catch (error) {
        handleErrors(res, error, 'Failed to fetch game state');
    }
};

exports.resetGame = async (req, res) => {
    try {
        const result = await gameController.resetGame();
        res.json(result);
    } catch (error) {
        console.error('Error resetting game:', error);
        res.status(500).json({ error: 'Failed to reset game', details: error.message });
    }
};

exports.startGame = async (req, res) => {
    try {
        await gameController.startGame();
        res.json({ message: 'Game started successfully' });
    } catch (error) {
        console.error('Error starting game:', error);
        res.status(500).json({ error: 'Failed to start game' });
    }
};