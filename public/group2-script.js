document.addEventListener('DOMContentLoaded', () => {
    const predictionDisplay = document.getElementById('prediction-display');
    const weightDisplay = document.getElementById('weight');
    const predictPhytoplanktonBtn = document.getElementById('predict-phytoplankton-btn');
    const predictNonPhytoplanktonBtn = document.getElementById('predict-non-phytoplankton-btn');
    const spinnerContainer = document.getElementById('spinner-container');
    const predictionContainer = document.getElementById('prediction-container');
    let currentRound = 0;
    let hasPredicted = false;
    let lastWeightedAverage = null;
    let lastWeight = null;

    function checkForUpdates() {
        loadGroup2Data();
    }

    function loadGroup2Data() {
        fetch('/api/group2/get_data')
            .then(response => response.json())
            .then(data => {
                if (data.gameOver) {  // Check if the game is over
                    showGameOver();
                    clearInterval(updateInterval);  // Stop further checks once game is over
                    return; // Exit the function early to avoid any further processing
                }

                if (data.waiting) {
                    if (data.message === 'Game has not started yet') {
                        showWaiting('Waiting for game to start...');
                    } else if (hasPredicted) {
                        showWaiting('Waiting for next round...');
                    } else {
                        showWaiting('Waiting for Group 1 predictions...');
                    }
                } else if (data.round !== currentRound || !hasPredicted) {
                    currentRound = data.round;
                    updatePredictionData(data);
                    showPredictionOptions();
                    hasPredicted = false;
                }
            })
            .catch(handleError);
    }

    function showGameOver() {
        setLoading(false);
        predictionContainer.classList.add('hidden');

        const gameOverDiv = document.createElement('div');
        gameOverDiv.id = 'game-over';
        gameOverDiv.innerHTML = '<h2>Game Over</h2><p>Thank you for participating!</p>';
        document.querySelector('.container').appendChild(gameOverDiv);

        // Ensure the interval is cleared when the game is over
        clearInterval(updateInterval); // Stop further checks once game is over
    }

    function setLoading(isLoading, message = 'Loading...') {
        spinnerContainer.classList.toggle('hidden', !isLoading);
        spinnerContainer.querySelector('p').textContent = message;
    }

    function showWaiting(message) {
        setLoading(true, message);
        predictionContainer.classList.add('hidden');
    }

    function showPredictionOptions() {
        setLoading(false);
        predictionContainer.classList.remove('hidden');
    }

    function submitPrediction(prediction) {
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
                showWaiting('Waiting for next round...');
            })
            .catch(handleError);
    }

    function updatePredictionData(data) {
        const newWeightedAverage = data.weightedAverage;
        const newWeight = data.userWeight.toFixed(2);

        if (newWeightedAverage !== lastWeightedAverage) {
            updatePredictionDisplay(newWeightedAverage);
            lastWeightedAverage = newWeightedAverage;
        }

        if (newWeight !== lastWeight) {
            weightDisplay.textContent = newWeight;
            weightDisplay.classList.add('fade-in');
            setTimeout(() => weightDisplay.classList.remove('fade-in'), 500);
            lastWeight = newWeight;
        }

        enablePredictionButtons();
    }

    function updatePredictionDisplay(value) {
        // Convert -1 to 1 scale to 0 to 1 scale
        const normalizedValue = (value + 1) / 2;

        // Calculate color (red to green)
        const red = Math.round(255 * (1 - normalizedValue));
        const green = Math.round(255 * normalizedValue);
        const color = `rgb(${red}, ${green}, 0)`;

        // Update display
        predictionDisplay.style.backgroundColor = color;
        predictionDisplay.textContent = value.toFixed(2);
        predictionDisplay.classList.add('fade-in');
        setTimeout(() => predictionDisplay.classList.remove('fade-in'), 500);
    }

    function handleError(error) {
        console.error('Error:', error);
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

    // Start the update cycle
    checkForUpdates();
    const updateInterval = setInterval(checkForUpdates, 1000);  // Keep track of interval ID
});