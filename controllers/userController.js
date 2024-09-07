// controllers/userController.js
const { getSupabase } = require('../db/supabase');
const { getRandomIconUnicode } = require('../iconUtils'); // Import functions from iconUtils

exports.joinGame = async (req, res) => {
    const { userID } = req.session;

    // Validate that userID exists
    if (!userID) {
        return res.status(400).json({ error: 'User ID not found in session. Please log in again.' });
    }

    const supabase = getSupabase();

    try {
        // Select a random Unicode icon for the user using the external iconUtils script
        const randomIconUnicode = getRandomIconUnicode();

        // Insert new user into the vk_demo_db
        const { error } = await supabase.from('vk_demo_db').insert([
            {
                id: userID,
                group_number: -1, // Default group, will be assigned later
                icon: randomIconUnicode // Store the randomly chosen Unicode icon
            }
        ]);

        if (error) {
            console.error('Database insertion error:', error);
            throw new Error('Error inserting user into database');
        }

        // Success response
        res.json({ message: 'User created successfully with a random icon, waiting for group assignment.' });
    } catch (err) {
        console.error('Error creating user:', err);
        res.status(500).json({ error: 'Failed to create user' });
    }
};

exports.checkGroup = async (req, res) => {
    const { userID } = req.session;
    const supabase = getSupabase();

    try {
        const { data: user, error } = await supabase
            .from('vk_demo_db')
            .select('group_number')
            .eq('id', userID)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No user found, which means the user hasn't joined the game yet
                return res.json({ assigned: false, message: 'User not found. Please join the game first.' });
            }
            throw error;
        }

        if (user.group_number !== -1) {
            res.json({ assigned: true, groupNumber: user.group_number, userID: userID });
        } else {
            res.json({ assigned: false });
        }
    } catch (err) {
        console.error('Error checking group assignment:', err);
        res.status(500).json({ error: 'Failed to check group assignment' });
    }
};

exports.getUserIcon = async (req, res) => {
    const { userID } = req.params; // Get userID from route parameters

    // Validate that userID exists
    if (!userID) {
        return res.status(400).json({ error: 'User ID is required.' });
    }

    const supabase = getSupabase();

    try {
        const { data: user, error } = await supabase
            .from('vk_demo_db')
            .select('icon')
            .eq('id', userID)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No user found
                return res.status(404).json({ error: 'User not found.' });
            }
            throw error;
        }

        if (user && user.icon) {
            res.json({ icon: user.icon });
        } else {
            res.status(404).json({ error: 'Icon not found for this user.' });
        }
    } catch (err) {
        console.error('Error fetching user icon:', err);
        res.status(500).json({ error: 'Failed to fetch user icon' });
    }
};