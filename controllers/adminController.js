const { getSupabase } = require('../db/supabase');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
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
        const { data, error } = await supabase.rpc('get_game_stats');
        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Error fetching game stats:', error);
        res.status(500).json({ error: 'Failed to fetch game stats', details: error.message });
    }
};

exports.createFinalNodeBot = async (req, res) => {
    const supabase = getSupabase();

    try {
        const { data, error } = await supabase.rpc('create_final_node_bot', {
            p_icon: getFinalNodeIcon()
        });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Error creating final node bot:', error);
        res.status(500).json({ error: 'Failed to create final node bot', details: error.message });
    }
};

exports.checkFinalNodeBot = async (req, res) => {
    const supabase = getSupabase();

    try {
        const { data, error } = await supabase.rpc('check_final_node_bot');
        if (error) throw error;

        res.json(data);
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
        const { data, error } = await supabase.rpc('assign_group', {
            p_user_id: userID,
            p_group_number: groupNumber
        });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Failed to assign user to group:', error);
        res.status(500).json({ error: 'Failed to assign user to group' });
    }
};

exports.getUsersInfo = async (req, res) => {
    const supabase = getSupabase();

    try {
        const { data, error } = await supabase.rpc('get_users_info');
        if (error) throw error;

        res.json(data);
    } catch (error) {
        handleErrors(res, error, 'Failed to fetch users info');
    }
};

exports.deleteUser = async (req, res) => {
    const { userID } = req.body;
    const supabase = getSupabase();

    try {
        const { data, error } = await supabase.rpc('delete_user', { p_user_id: userID });
        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Failed to delete user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
};

exports.assignSubgroups = async (req, res) => {
    const supabase = getSupabase();

    try {
        const { data, error } = await supabase.rpc('assign_subgroups');
        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Failed to assign subgroups:', error);
        res.status(500).json({ error: 'Failed to assign subgroups' });
    }
};

exports.getGameState = async (req, res) => {
    const supabase = getSupabase();

    try {
        const { data, error } = await supabase.rpc('get_game_state');
        if (error) throw error;

        res.json(data);
    } catch (error) {
        handleErrors(res, error, 'Failed to fetch game state');
    }
};

exports.resetGame = async (req, res) => {
    const supabase = getSupabase();

    try {
        const { data, error } = await supabase.rpc('reset_game');
        if (error) throw error;

        res.json({ message: data });
    } catch (error) {
        console.error('Error resetting game:', error);
        res.status(500).json({ error: 'Failed to reset game', details: error.message });
    }
};

exports.startGame = async (req, res) => {
    const supabase = getSupabase();

    try {
        const { data, error } = await supabase.rpc('start_game');
        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Error starting game:', error);
        res.status(500).json({ error: 'Failed to start game' });
    }
};