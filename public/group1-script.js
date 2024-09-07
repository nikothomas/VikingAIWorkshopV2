document.addEventListener('DOMContentLoaded', () => {
    const imageContainer = document.getElementById('image-container');
    const buttonContainer = document.getElementById('button-container');
    const spinnerContainer = document.getElementById('spinner-container');
    const userIconContainer = document.getElementById('user-icon-container');

    let currentRound = 0;
    let currentImageUrl = null;
    let userID = null;

    function checkForUpdates() {
        loadGroup1Data();
    }

    function loadGroup1Data() {
        fetch('/api/group1/get_image')
            .then(response => response.json())
            .then(data => {
                if (data.gameOver) {
                    showGameOver();
                    clearInterval(updateInterval);
                    return;
                } else if (data.waiting) {
                    if (data.message === 'Game has not started yet') {
                        showWaiting('Waiting for game to start...');
                    } else {
                        showWaiting('Waiting for next round...');
                    }
                } else if (data.round !== currentRound || data.image_url !== currentImageUrl) {
                    currentRound = data.round;
                    currentImageUrl = data.image_url;
                    updateGameImage(data.image_url);
                    console.log(`Updated current round to: ${currentRound}`);
                }

                if (data.userID && data.userID !== userID) {
                    userID = data.userID;
                    fetchUserIcon(userID);
                }
            })
            .catch(handleError);
    }

    function fetchUserIcon(userID) {
        fetch(`/api/users/icon/${userID}`)
            .then(response => response.json())
            .then(data => {
                if (data.icon) {
                    updateUserIcon(data.icon);
                } else {
                    console.error('Icon not found for user');
                }
            })
            .catch(error => console.error('Error fetching user icon:', error));
    }

    function updateUserIcon(iconUnicode) {
        userIconContainer.textContent = String.fromCodePoint(parseInt(iconUnicode, 16));
        userIconContainer.classList.remove('hidden');
    }


    function getCurrentRound() {
        return fetch('/api/group1/get_image')
            .then(response => response.json())
            .then(data => {
                if (data.round) {
                    console.log(`Fetched current round: ${data.round}`);
                    return data.round;
                } else {
                    throw new Error('Failed to fetch current round');
                }
            });
    }

    function submitPrediction(prediction) {
        setLoading(true, 'Submitting prediction...');
        getCurrentRound()
            .then(round => {
                console.log(`Submitting prediction for round: ${round}`);
                return fetch('/api/group1/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prediction, round })
                });
            })
            .then(response => {
                if (!response.ok) {
                    return response.text().then(text => {
                        throw new Error(`HTTP error! status: ${response.status}, message: ${text}`);
                    });
                }
                return response.json();
            })
            .then(data => {
                console.log(data.message);
                showWaiting('Waiting for next round...');
            })
            .catch(handleError);
    }

    function showGameOver() {
        setLoading(false);
        imageContainer.classList.add('hidden');
        buttonContainer.classList.add('hidden');

        const gameOverDiv = document.createElement('div');
        gameOverDiv.id = 'game-over';
        gameOverDiv.innerHTML = '<h2>Game Over</h2><p>Thank you for participating!</p>';
        document.querySelector('.container').appendChild(gameOverDiv);
    }

    function updateGameImage(imageUrl) {
        imageContainer.innerHTML = `<img id="game-image" src="${imageUrl}" alt="Phytoplankton Image" class="fade-in">`;
        showImage();
    }

    function showWaiting(message) {
        setLoading(true, message);
        imageContainer.classList.add('hidden');
        buttonContainer.classList.add('hidden');
    }

    function setLoading(isLoading, message = 'Loading...') {
        spinnerContainer.classList.toggle('hidden', !isLoading);
        spinnerContainer.querySelector('p').textContent = message;
    }

    function showImage() {
        setLoading(false);
        imageContainer.classList.remove('hidden');
        buttonContainer.classList.remove('hidden');
    }

    function handleError(error) {
        console.error('Error:', error);
        setLoading(false);
        alert(`An error occurred: ${error.message}. Please try again.`);
    }

    document.getElementById('phytoplankton-btn').addEventListener('click', () => submitPrediction(1));
    document.getElementById('non-phytoplankton-btn').addEventListener('click', () => submitPrediction(-1));

    // Start the update cycle
    checkForUpdates();
    const updateInterval = setInterval(checkForUpdates, 1000);
});