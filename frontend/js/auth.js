const API_URL = 'http://localhost:5000/api';

function showStatus(message, type = 'error') {
    let status = document.getElementById('loginStatus');

    if (!status) {
        status = document.createElement('div');
        status.id = 'loginStatus';
        status.className = 'status-message';
        document.querySelector('.login-form').appendChild(status);
    }

    status.className = `status-message ${type}`;
    status.textContent = message;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
        showStatus('Signing you in...', 'success');

        const response = await fetchWithTimeout(`${API_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password })
        }, 15000);
        
        const data = await response.json();
        
        if (response.ok) {
            // Store user data
            localStorage.setItem('user', JSON.stringify(data.user));
            
            // Redirect based on role
            if (data.user.role === 'student') {
                window.location.href = '/pages/student-dashboard.html';
            } else {
                window.location.href = '/pages/faculty-dashboard.html';
            }
        } else {
            showStatus(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        if (error.name === 'AbortError') {
            showStatus('Request timed out. Please check server/network and retry.', 'error');
            return;
        }
        showStatus('Network error. Please try again.', 'error');
    }
});

// Check if already logged in
const user = localStorage.getItem('user');
if (user) {
    const userData = JSON.parse(user);
    if (userData.role === 'student') {
        window.location.href = '/pages/student-dashboard.html';
    } else {
        window.location.href = '/pages/faculty-dashboard.html';
    }
}