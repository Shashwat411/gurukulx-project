const API_URL = 'http://localhost:5000/api';

let currentUser = null;
let submissions = [];

function showStatus(message, type = 'error') {
    let status = document.getElementById('facultyStatus');

    if (!status) {
        status = document.createElement('div');
        status.id = 'facultyStatus';
        status.className = 'status-message';
        const section = document.querySelector('.submissions-section');
        section.insertBefore(status, section.querySelector('.table-wrapper'));
    }

    status.className = `status-message ${type}`;
    status.textContent = message;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

// Check authentication
function checkAuth() {
    const user = localStorage.getItem('user');
    if (!user) {
        window.location.href = '/';
        return;
    }
    
    currentUser = JSON.parse(user);
    if (currentUser.role !== 'faculty') {
        window.location.href = '/';
        return;
    }
    
    document.getElementById('facultyName').textContent = currentUser.name;
    document.getElementById('userInitial').textContent = currentUser.name.charAt(0);
    
    loadSubmissions();
}

// Load all submissions
async function loadSubmissions() {
    try {
        const response = await fetchWithTimeout(`${API_URL}/submissions/all`);
        submissions = await response.json();
        
        updateStats();
        renderSubmissions();
    } catch (error) {
        console.error('Error loading submissions:', error);
    }
}

// Update statistics
function updateStats() {
    const total = submissions.length;
    const pending = submissions.filter(s => s.status === 'pending').length;
    const approved = submissions.filter(s => s.status === 'approved').length;
    const rejected = submissions.filter(s => s.status === 'rejected').length;
    
    document.getElementById('totalSubmissions').textContent = total;
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('approvedCount').textContent = approved;
    document.getElementById('rejectedCount').textContent = rejected;
}

// Render submissions table
function renderSubmissions() {
    const tbody = document.getElementById('submissionsTableBody');
    
    if (submissions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No submissions yet</td></tr>';
        return;
    }
    
    tbody.innerHTML = submissions.map(sub => {
        const date = new Date(sub.created_at).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const details = sub.type === 'assignment' 
            ? `Assignment ${sub.assignment_no}` 
            : sub.type.charAt(0).toUpperCase() + sub.type.slice(1);
        
        const studentName = sub.students?.users?.name || 'Unknown';
        const rollNo = sub.students?.roll_no || 'N/A';
        
        return `
            <tr>
                <td>${studentName}</td>
                <td>${rollNo}</td>
                <td>${sub.type.charAt(0).toUpperCase() + sub.type.slice(1)}</td>
                <td>${details}</td>
                <td><a href="${sub.file_url}" target="_blank" style="color: var(--violet-medium);">View File</a></td>
                <td>${date}</td>
                <td><span class="status-badge status-${sub.status}">${sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}</span></td>
                <td>
                    <div class="action-buttons">
                        ${sub.status === 'pending' ? `
                            <button class="btn-success" onclick="approveSubmission('${sub.id}')">Approve</button>
                            <button class="btn-danger" onclick="rejectSubmission('${sub.id}')">Reject</button>
                        ` : `
                            <span style="color: var(--text-secondary); font-size: 12px;">Reviewed</span>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Approve submission
async function approveSubmission(id) {
    if (!confirm('Approve this submission?')) return;
    
    try {
        const response = await fetchWithTimeout(`${API_URL}/approve/${id}`, {
            method: 'POST'
        }, 15000);
        
        if (response.ok) {
            showStatus('Submission approved.', 'success');
            await loadSubmissions();
        } else {
            showStatus('Failed to approve submission.', 'error');
        }
    } catch (error) {
        console.error('Error approving submission:', error);
        showStatus('Network error while approving submission.', 'error');
    }
}

// Reject submission
async function rejectSubmission(id) {
    if (!confirm('Reject this submission?')) return;
    
    try {
        const response = await fetchWithTimeout(`${API_URL}/reject/${id}`, {
            method: 'POST'
        }, 15000);
        
        if (response.ok) {
            showStatus('Submission rejected.', 'success');
            await loadSubmissions();
        } else {
            showStatus('Failed to reject submission.', 'error');
        }
    } catch (error) {
        console.error('Error rejecting submission:', error);
        showStatus('Network error while rejecting submission.', 'error');
    }
}

// Logout function
function logout() {
    localStorage.removeItem('user');
    window.location.href = '/';
}

// Initialize
checkAuth();