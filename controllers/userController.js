// controllers/userController.js
const { getSupabase } = require('../db/supabase');
const { getRandomIconUnicode } = require('../iconUtils');

exports.joinGame = async (req, res) => {
    const { userID } = req.session;

    if (!userID) {
        return res.status(400).json({ error: 'User ID not found in session. Please log in again.' });
    }

    const supabase = getSupabase();

    try {
        const randomIconUnicode = getRandomIconUnicode();
        const { data, error } = await supabase.rpc('user_operations', {
            p_operation: 'join_game',
            p_user_id: userID,
            p_icon: randomIconUnicode
        });

        if (error) throw error;

        res.json(data);
    } catch (err) {
        console.error('Error creating user:', err);
        res.status(500).json({ error: 'Failed to create user' });
    }
};

exports.checkGroup = async (req, res) => {
    const { userID } = req.session;
    const supabase = getSupabase();

    try {
        const { data, error } = await supabase.rpc('user_operations', {
            p_operation: 'check_group',
            p_user_id: userID
        });

        if (error) throw error;

        res.json(data);
    } catch (err) {
        console.error('Error checking group assignment:', err);
        res.status(500).json({ error: 'Failed to check group assignment' });
    }
};

exports.getUserIcon = async (req, res) => {
    const { userID } = req.params;

    if (!userID) {
        return res.status(400).json({ error: 'User ID is required.' });
    }

    const supabase = getSupabase();

    try {
        const { data, error } = await supabase.rpc('user_operations', {
            p_operation: 'get_user_icon',
            p_user_id: userID
        });

        if (error) throw error;

        if (data.error) {
            return res.status(404).json(data);
        }

        res.json(data);
    } catch (err) {
        console.error('Error fetching user icon:', err);
        res.status(500).json({ error: 'Failed to fetch user icon' });
    }
};