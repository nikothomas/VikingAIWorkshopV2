document.addEventListener('DOMContentLoaded', () => {
    const joinGameBtn = document.getElementById('join-game-btn');
    const spinnerContainer = document.getElementById('spinner-container');
    const joinGameSection = document.getElementById('join-game-section');

    joinGameBtn.addEventListener('click', joinGame);

    function joinGame() {
        showSpinner();
        hideJoinSection();

        fetch('/api/join-game', { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                console.log(data.message);
                checkGroupAssignment();
            })
            .catch(handleError);
    }

    function checkGroupAssignment() {
        fetch('/api/check-group')
            .then(response => response.json())
            .then(data => {
                if (data.assigned) {
                    hideSpinner();
                    redirectToGroup(data.groupNumber);
                } else if (data.message === 'User not found. Please join the game first.') {
                    hideSpinner();
                    showJoinSection();
                } else {
                    setTimeout(checkGroupAssignment, 2000);
                }
            })
            .catch(handleError);
    }

    function showSpinner() {
        spinnerContainer.classList.remove('hidden');
        spinnerContainer.classList.add('fade-in');
        spinnerContainer.querySelector('p').textContent = "Waiting for group assignment...";
    }

    function hideSpinner() {
        spinnerContainer.classList.add('hidden');
    }

    function hideJoinSection() {
        joinGameSection.classList.add('hidden');
    }

    function showJoinSection() {
        joinGameSection.classList.remove('hidden');
    }

    function redirectToGroup(groupNumber) {
        const groupPage = groupNumber === 1 ? '/group1' : '/group2';
        window.location.href = groupPage;
    }

    function handleError(error) {
        console.error('Error:', error);
        hideSpinner();
        showJoinSection();
        alert('An error occurred. Please try again.');
    }

    // Check if the user is already in a group when the page loads
    checkGroupAssignment();
});