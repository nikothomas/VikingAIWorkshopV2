/* public/admin-login.js */
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const loginStatus = document.getElementById('login-status');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('adminToken', data.token);
                window.location.href = '/admin';
            } else {
                loginStatus.textContent = data.error || 'Login failed';
                loginStatus.className = 'status-message error';
            }
        } catch (error) {
            console.error('Login error:', error);
            loginStatus.textContent = 'An error occurred during login';
            loginStatus.className = 'status-message error';
        }
    });
});