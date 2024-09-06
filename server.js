require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const { initializeSupabase } = require('./db/supabase');
const routes = require('./routes');
const cors = require('cors');
const { startGameLoop } = require('./gameLoop');
const networkConnections = require('./neuralNetworkConnections'); // Import the module to start connection updates

const app = express();
const PORT = process.env.PORT || 3000;

initializeSupabase();

// Enable CORS for all routes
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));

app.use((req, res, next) => {
    if (!req.session.userID) {
        req.session.userID = uuidv4();
    }
    next();
});

app.use('/api', routes);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/D3', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'D3.html'));
});

app.get('/group1', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'group1.html'));
});

app.get('/group2', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'group2.html'));
});

app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'An unexpected error occurred' });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    startGameLoop();
});