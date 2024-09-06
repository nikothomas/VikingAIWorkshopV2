/* middleware/adminAuth.js */
const adminAuth = (req, res, next) => {
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
        console.error('ADMIN_PASSWORD not set in environment variables');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'No authorization header provided' });
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');

    if (username === 'admin' && password === adminPassword) {
        next();
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
};

module.exports = adminAuth;