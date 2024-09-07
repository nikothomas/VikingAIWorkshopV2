document.addEventListener('DOMContentLoaded', () => {
    const predictionBar = document.getElementById('prediction-bar');
    const predictionText = document.getElementById('prediction-text');
    const predictPhytoplanktonBtn = document.getElementById('predict-phytoplankton-btn');
    const predictNonPhytoplanktonBtn = document.getElementById('predict-non-phytoplankton-btn');
    const spinnerContainer = document.getElementById('spinner-container');
    const predictionContainer = document.getElementById('prediction-container');
    const userIconContainer = document.getElementById('user-icon-container');
    const userIcon = document.getElementById('user-icon');

    let currentRound = 0;
    let hasPredicted = false;
    let lastWeightedAverage = null;
    let userID = null;
    let currentState = 'loading'; // Possible states: 'loading', 'waiting', 'predicting', 'gameover'

    function checkForUpdates() {
        loadGroup2Data();
    }

    function loadGroup2Data() {
        fetch('/api/group2/get_data')
            .then(response => response.json())
            .then(data => {
                if (data.gameOver && currentState !== 'gameover') {
                    showGameOver();
                    clearInterval(updateInterval);
                    return;
                }

                let newState = currentState;
                if (data.waiting) {
                    if (data.message === 'Game has not started yet') {
                        newState = 'waiting';
                        updateSpinnerMessage('Waiting for game to start...');
                    } else if (hasPredicted) {
                        newState = 'waiting';
                        updateSpinnerMessage('Waiting for next round...');
                    } else {
                        newState = 'waiting';
                        updateSpinnerMessage('Waiting for Group 1 predictions...');
                    }
                } else if (data.round !== currentRound || !hasPredicted) {
                    currentRound = data.round;
                    updatePredictionData(data);
                    newState = 'predicting';
                    hasPredicted = false;
                }

                if (newState !== currentState) {
                    updateUIState(newState);
                }

                if (data.userID && data.userID !== userID) {
                    userID = data.userID;
                    fetchUserIcon(userID);
                }
            })
            .catch(handleError);
    }

    function updateUIState(newState) {
        currentState = newState;
        switch (newState) {
            case 'loading':
            case 'waiting':
                showSpinner();
                hidePredictionOptions();
                break;
            case 'predicting':
                hideSpinner();
                showPredictionOptions();
                break;
            case 'gameover':
                hideSpinner();
                hidePredictionOptions();
                showGameOver();
                break;
        }
    }

    function updateSpinnerMessage(message) {
        const spinnerMessage = spinnerContainer.querySelector('p');
        if (spinnerMessage.textContent !== message) {
            spinnerMessage.textContent = message;
        }
    }

    function fetchUserIcon(userID) {
        fetch(`/api/icon/${userID}`)
            .then(response => response.json())
            .then(data => {
                if (data.icon) {
                    updateUserIcon(data.icon);
                } else {
                    console.error('Icon not found for user');
                    updateUserIcon('fa-user'); // Default FontAwesome icon
                }
            })
            .catch(error => {
                console.error('Error fetching user icon:', error);
                updateUserIcon('fa-user'); // Default FontAwesome icon
            });
    }

    function updateUserIcon(iconClass) {
        // Remove all existing classes except 'fas'
        userIcon.className = 'fas';

        // Add the new icon class
        userIcon.classList.add(iconClass);

        // Show the icon container
        userIconContainer.classList.remove('hidden');
    }

    function showGameOver() {
        updateUIState('gameover');
        const gameOverDiv = document.createElement('div');
        gameOverDiv.id = 'game-over';
        gameOverDiv.innerHTML = '<h2>Game Over</h2><p>Thank you for participating!</p>';
        document.querySelector('.container').appendChild(gameOverDiv);
    }

    function showSpinner() {
        spinnerContainer.classList.remove('hidden');
    }

    function hideSpinner() {
        spinnerContainer.classList.add('hidden');
    }

    function showPredictionOptions() {
        predictionContainer.classList.remove('hidden');
    }

    function hidePredictionOptions() {
        predictionContainer.classList.add('hidden');
    }

    function submitPrediction(prediction) {
        updateUIState('waiting');
        updateSpinnerMessage('Submitting prediction...');
        fetch('/api/group2/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prediction, round: currentRound })
        })
            .then(response => response.json())
            .then(data => {
                console.log(data.message);
                hasPredicted = true;
                disablePredictionButtons();
                updateSpinnerMessage('Waiting for next round...');
            })
            .catch(handleError);
    }

    function updatePredictionData(data) {
        const newWeightedAverage = data.weightedAverage;

        if (newWeightedAverage !== lastWeightedAverage) {
            updatePredictionDisplay(newWeightedAverage);
            lastWeightedAverage = newWeightedAverage;
        }

        enablePredictionButtons();
    }

    function updatePredictionDisplay(value) {
        console.log('Original value:', value);

        // Clamp the value to be between -1 and 1
        const clampedValue = Math.max(-1, Math.min(1, value));
        console.log('Clamped value:', clampedValue);

        // Calculate the percentage for phytoplankton (green)
        const phytoplanktonPercentage = ((clampedValue + 1) / 2) * 100;

        // Update the prediction bar
        predictionBar.style.setProperty('--phytoplankton-percentage', `${phytoplanktonPercentage}%`);

        // Update the likelihood text based on the clamped value
        const likelihood = clampedValue > 0 ? "Likely" : "Not Likely";
        const percentage = Math.abs(clampedValue * 100).toFixed(1);
        const newText = `${likelihood} to be phytoplankton (${percentage}%)`;

        if (predictionText.textContent !== newText) {
            predictionText.textContent = newText;
        }
    }

    function handleError(error) {
        console.error('Error:', error);
        updateUIState('predicting');
        alert('An error occurred. Please try again.');
    }

    function disablePredictionButtons() {
        predictPhytoplanktonBtn.disabled = true;
        predictNonPhytoplanktonBtn.disabled = true;
    }

    function enablePredictionButtons() {
        predictPhytoplanktonBtn.disabled = false;
        predictNonPhytoplanktonBtn.disabled = false;
    }

    predictPhytoplanktonBtn.addEventListener('click', () => submitPrediction(1));
    predictNonPhytoplanktonBtn.addEventListener('click', () => submitPrediction(-1));

    updateUIState('loading');
    checkForUpdates();
    const updateInterval = setInterval(checkForUpdates, 1000);
});