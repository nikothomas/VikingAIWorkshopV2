document.addEventListener('DOMContentLoaded', () => {
    const assignResult = document.getElementById('assign-result');
    const waitingUsersList = document.getElementById('waiting-users-list');
    const group1UsersList = document.getElementById('group1-users');
    const group2UsersList = document.getElementById('group2-users');
    const imageUploadForm = document.getElementById('image-upload-form');
    const gameStateDiv = document.getElementById('game-state');
    const resetGameBtn = document.getElementById('reset-game-btn');
    const gameStatsDiv = document.getElementById('game-stats');
    const createBotsForm = document.getElementById('create-bots-form');
    const createFinalNodeBtn = document.getElementById('create-final-node-bot');
    const finalNodeInfo = document.getElementById('final-node-info');
    const startGameBtn = document.getElementById('start-game');
    // Image upload event listener
    imageUploadForm.addEventListener('submit', handleImageUpload);
    createBotsForm.addEventListener('submit', createBots);
    resetGameBtn.addEventListener('click', resetGame);
    createFinalNodeBtn.addEventListener('click', createFinalNodeBot);

    function getAuthHeaders() {
        const token = localStorage.getItem('adminToken');
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }

    document.addEventListener('click', event => {
        if (event.target.classList.contains('delete-btn')) {
            deleteUser(event.target.dataset.userId);
        } else if (event.target.classList.contains('assign-btn')) {
            assignGroup(event.target.dataset.userId, event.target.dataset.group);
        } else if (event.target.classList.contains('reassign-btn')) {
            const newGroup = event.target.dataset.currentGroup === '1' ? '2' : '1';
            assignGroup(event.target.dataset.userId, newGroup);
        }
    });

    startGameBtn.addEventListener('click', startGame);

    function startGame() {
        fetch('/api/admin/start-game', {
            method: 'POST',
            headers: getAuthHeaders()
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    showMessage(data.error, 'error');
                } else {
                    showMessage(data.message, 'success');
                    updateGameStats();
                }
            })
            .catch(error => {
                console.error('Error starting game:', error);
                showMessage('Failed to start game.', 'error');
            });
    }

    function updateGameStats() {
        fetch('/api/admin/game-stats', { headers: getAuthHeaders() })
            .then(response => response.json())
            .then(data => {
                gameStatsDiv.innerHTML = `
                <h3>Game Statistics</h3>
                <p>Current Round: ${data.currentRound}</p>
                <p>Total Users: ${data.totalUsers}</p>
                <p>Group 1 Users: ${data.group1Users}</p>
                <p>Group 2 Users: ${data.group2Users}</p>
                <p>Total Images: ${data.totalImages}</p>
                <p>Used Images: ${data.usedImages}</p>
                <p>Game Started: ${data.gameStarted ? 'Yes' : 'No'}</p>
                <p>Game Over: ${data.gameOver ? 'Yes' : 'No'}</p>
                <p>Weights Updated: ${data.isWeightsUpdated ? 'Yes' : 'No'}</p>
            `;

                startGameBtn.disabled = data.gameStarted && !data.gameOver;
                createBotsForm.querySelectorAll('input, select, button').forEach(el => el.disabled = data.gameStarted && !data.gameOver);
            })
            .catch(error => console.error('Error fetching game stats:', error));
    }

    function updateUserList(listElement, users, groupNumber, connections, finalNodeId) {
        listElement.innerHTML = '';
        users.forEach(user => {
            const li = document.createElement('li');
            li.className = `user-item ${user.is_bot ? 'bot' : 'human'}`;
            let connectionsInfo = '';
            let buttons = '';

            if (groupNumber === -1) {
                // Waiting users
                buttons = `
                <button class="assign-btn" data-user-id="${user.id}" data-group="1">Assign to Group 1</button>
                <button class="assign-btn" data-user-id="${user.id}" data-group="2">Assign to Group 2</button>
            `;
            } else if (groupNumber === 1) {
                // Group 1 users
                const userConnections = connections.filter(conn => conn.source_user_id === user.id);
                connectionsInfo = `<span>Connections: ${userConnections.map(conn => conn.target_user_id).join(', ')}</span>`;
                buttons = `<button class="reassign-btn" data-user-id="${user.id}" data-current-group="1">Reassign</button>`;
            } else if (groupNumber === 2) {
                // Group 2 users
                const finalNodeConnection = connections.find(conn =>
                    conn.source_user_id === user.id && conn.target_user_id === finalNodeId
                );
                connectionsInfo = finalNodeConnection
                    ? `<span class="connected">Connected to Final Node (ID: ${finalNodeId})</span>`
                    : '<span class="not-connected">Not connected to Final Node</span>';
                buttons = `<button class="reassign-btn" data-user-id="${user.id}" data-current-group="2">Reassign</button>`;
            }

            li.innerHTML = `
            <span>${user.is_bot ? 'Bot' : 'Human'} ID: ${user.id}</span>
            ${connectionsInfo}
            ${buttons}
            <button class="delete-btn" data-user-id="${user.id}">Delete</button>
        `;
            listElement.appendChild(li);
        });
    }

    function fetchUsersInfo() {
        fetch('/api/admin/users-info', { headers: getAuthHeaders() })
            .then(response => {
                if (!response.ok) throw new Error('Unauthorized');
                return response.json();
            })
            .then(data => {
                console.log('Fetched user data:', data); // For debugging
                updateUserList(waitingUsersList, data.waitingUsers || [], -1, data.connections, data.finalNodeId);
                updateUserList(group1UsersList, data.group1Users || [], 1, data.connections, data.finalNodeId);
                updateUserList(group2UsersList, data.group2Users || [], 2, data.connections, data.finalNodeId);
                updateGroupCounts(data.groupCounts);
            })
            .catch(error => {
                console.error('Error fetching users info:', error);
                if (error.message === 'Unauthorized') window.location.href = '/admin/login';
            });
    }

    function updateGroupCounts(counts) {
        document.getElementById('group1-count').textContent = counts.group1Count;
        document.getElementById('group2-count').textContent = counts.group2Count;
    }

    function assignGroup(userID, groupNumber) {
        fetch('/api/admin/assign-group', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ userID, groupNumber })
        })
            .then(response => response.json())
            .then(data => {
                showMessage(data.message, 'success');
                fetchUsersInfo();
            })
            .catch(error => {
                console.error('Error assigning group:', error);
                showMessage('Failed to assign group.', 'error');
            });
    }

    function createBots(event) {
        event.preventDefault();
        const groupNumber = document.getElementById('bot-group').value;
        const count = document.getElementById('bot-count').value;

        fetch('/api/admin/create-bots', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ groupNumber, count })
        })
            .then(response => response.json())
            .then(data => {
                showBotStatus(data.message, 'success');
                fetchUsersInfo();
            })
            .catch(error => {
                console.error('Error creating bots:', error);
                showBotStatus('Failed to create bots.', 'error');
            });
    }

    function showBotStatus(message, type) {
        showMessage(message, type, 'Bot Management');
    }

    function showMessage(message, type, action = '') {
        const messageElement = document.createElement('div');
        messageElement.className = `status-message ${type}`;

        let icon, title;
        if (type === 'success') {
            icon = '✅';
            title = 'Success';
        } else if (type === 'error') {
            icon = '❌';
            title = 'Error';
        } else {
            icon = 'ℹ️';
            title = 'Info';
        }

        messageElement.innerHTML = `
            <strong>${icon} ${title}:</strong> ${message}
            ${action ? `<br><em>${action}</em>` : ''}
        `;

        assignResult.innerHTML = '';
        assignResult.appendChild(messageElement);

        setTimeout(() => {
            messageElement.style.opacity = '0';
            setTimeout(() => assignResult.removeChild(messageElement), 300);
        }, 5000);
    }

    function deleteUser(userID) {
        if (!confirm('Are you sure you want to delete this user?')) return;

        fetch('/api/admin/delete-user', {
            method: 'DELETE',
            headers: getAuthHeaders(),
            body: JSON.stringify({ userID })
        })
            .then(response => response.json())
            .then(data => {
                showMessage(data.message, 'success');
                fetchUsersInfo();
            })
            .catch(error => {
                console.error('Error deleting user:', error);
                showMessage('Failed to delete user.', 'error');
            });
    }

    function resetGame() {
        if (!confirm('Are you sure you want to reset the game? This will reset all user data and game progress.')) return;

        fetch('/api/admin/reset-game', {
            method: 'POST',
            headers: getAuthHeaders()
        })
            .then(response => response.json())
            .then(data => {
                showMessage(data.message, 'success');
                fetchUsersInfo();
                updateGameStats();
            })
            .catch(error => {
                console.error('Error resetting game:', error);
                showMessage('Failed to reset game.', 'error');
            });
    }

    function checkFinalNodeBot() {
        fetch('/api/admin/check-final-node-bot', { headers: getAuthHeaders() })
            .then(response => response.json())
            .then(data => {
                if (data.exists) {
                    finalNodeInfo.textContent = `Created (ID: ${data.id})`;
                    createFinalNodeBtn.disabled = true;
                } else {
                    finalNodeInfo.textContent = 'Not created';
                    createFinalNodeBtn.disabled = false;
                }
            })
            .catch(error => {
                console.error('Error checking final node bot:', error);
                finalNodeInfo.textContent = 'Error checking status';
                createFinalNodeBtn.disabled = false;
            });
    }

    function createFinalNodeBot() {
        fetch('/api/admin/create-final-node-bot', {
            method: 'POST',
            headers: getAuthHeaders()
        })
            .then(response => response.json())
            .then(data => {
                showMessage(data.message, 'success');
                checkFinalNodeBot();
            })
            .catch(error => {
                console.error('Error creating final node bot:', error);
                showMessage(`Failed to create final node bot: ${error.message}`, 'error');
            });
    }

    fetchUsersInfo();
    updateGameStats();
    checkFinalNodeBot();

    setInterval(() => {
        checkFinalNodeBot();
        fetchUsersInfo();
        updateGameStats();
    }, 10000);
    // Function to handle image uploads
    function handleImageUpload(event) {
        event.preventDefault();

        const fileInput = document.getElementById('image-file');
        const correctAnswer = document.getElementById('correct-answer').value;
        const file = fileInput.files[0];

        if (!file || !correctAnswer) {
            showUploadStatus('Please select an image and provide the correct answer.', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('image', file);
        formData.append('correctAnswer', correctAnswer);

        fetch('/api/admin/upload-image', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('adminToken')}` // Auth header
            },
            body: formData // Send form data (image + answer)
        })
            .then(response => response.json())
            .then(data => {
                showUploadStatus(data.message, 'success');
                imageUploadForm.reset();
            })
            .catch(error => {
                console.error('Error uploading image:', error);
                showUploadStatus('Failed to upload image.', 'error');
            });
    }

    function showUploadStatus(message, type) {
        showMessage(message, type, 'Image Upload');
    }
});