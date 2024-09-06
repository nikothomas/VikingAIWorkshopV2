// routes/index.js
const express = require('express');
const multer = require('multer');
const userController = require('../controllers/userController');
const gameController = require('../controllers/gameController');
const adminController = require('../controllers/adminController');
const imageController = require('../controllers/imageController');
const jwtAuth = require('../middleware/jwtAuth');
const d3Controller = require('../controllers/d3Controller');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// User routes
router.post('/join-game', userController.joinGame);
router.get('/check-group', userController.checkGroup);
router.get('/check-game-status', gameController.checkGameStatus);

// Game routes
router.get('/group1/get_image', gameController.getGroup1Image);
router.post('/group1/submit', gameController.submitGroup1Prediction);
router.get('/group2/get_data', gameController.getGroup2Data);
router.post('/group2/submit', gameController.submitGroup2Prediction);
router.get('/round-results', gameController.getRoundResults);

// Admin routes
router.post('/admin/login', adminController.login);
router.use('/admin', jwtAuth); // Apply JWT authentication to all admin routes
router.post('/admin/assign-group', adminController.assignGroup);
router.get('/admin/users-info', adminController.getUsersInfo);
router.delete('/admin/delete-user', adminController.deleteUser);
router.get('/admin/game-state', adminController.getGameState);
router.post('/admin/upload-image', upload.single('image'), imageController.uploadImage);
router.get('/admin/game-stats', adminController.getGameStats);
router.post('/admin/create-bots', adminController.createBot);
router.post('/admin/create-final-node-bot', adminController.createFinalNodeBot);
router.get('/admin/check-final-node-bot', adminController.checkFinalNodeBot);
router.post('/admin/reset-game', adminController.resetGame);
router.post('/admin/start-game', adminController.startGame);

// D3 Visualization route
router.get('/get-network-data', d3Controller.getNetworkData);

module.exports = router;