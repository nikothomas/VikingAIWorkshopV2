exports.uploadImage = async (req, res) => {
    try {
        const supabase = getSupabase();
        const file = req.file;
        const correctAnswer = parseInt(req.body.correctAnswer);

        if (!file || ![0, 1].includes(correctAnswer)) {
            return res.status(400).json({ error: 'Invalid input' });
        }

        const fileExt = file.originalname.split('.').pop();
        const fileName = `${uuidv4()}.${fileExt}`;
        const filePath = `uploads/${fileName}`;

        // Upload file to storage
        const { data: storageData, error: storageError } = await supabase.storage
            .from('game-images')
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
            });

        if (storageError) {
            console.error('Storage upload error:', storageError);
            throw storageError;
        }

        // Get public URL
        const { data: urlData, error: urlError } = supabase.storage
            .from('game-images')
            .getPublicUrl(filePath);

        if (urlError) {
            console.error('Get public URL error:', urlError);
            throw urlError;
        }

        const imageUrl = urlData.publicUrl;

        // Insert into database
        const { data: imageData, error: insertError } = await supabase
            .from('images')
            .insert({
                url: imageUrl,
                correct_answer: correctAnswer,
                used: false
            })
            .select('id, url, correct_answer, used')
            .single();

        if (insertError) {
            console.error('Database insert error:', insertError);
            throw insertError;
        }

        console.log('Inserted image data:', imageData);  // Log the inserted data

        res.json({ message: 'Image uploaded successfully', imageId: imageData.id });
    } catch (error) {
        console.error('Error in uploadImage:', error);
        res.status(500).json({ error: 'Failed to upload image', details: error.message });
    }
};