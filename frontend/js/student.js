const BACKEND_URL = 'https://gurukulx-project.onrender.com';
const API_URL = `${BACKEND_URL}/api`;

let currentUser = null;
let currentStudent = null;
let submissions = [];

function showStatus(message, type = 'error') {
    let status = document.getElementById('studentStatus');

    if (!status) {
        status = document.createElement('div');
        status.id = 'studentStatus';
        status.className = 'status-message';
        const uploadForm = document.getElementById('uploadForm');
        uploadForm.appendChild(status);
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
    if (currentUser.role !== 'student') {
        window.location.href = '/';
        return;
    }
    
    loadStudentData();
}

// Load student data
async function loadStudentData() {
    try {
        // Get student details
        const response = await fetchWithTimeout(`${API_URL}/students`);
        const students = await response.json();
        
        currentStudent = students.find(s => s.user_id === currentUser.id);
        
        if (currentStudent) {
            document.getElementById('studentName').textContent = currentUser.name;
            document.getElementById('studentRoll').textContent = `Roll No: ${currentStudent.roll_no}`;
            document.getElementById('userInitial').textContent = currentUser.name.charAt(0);
        }
        
        // Load submissions
        await loadSubmissions();
    } catch (error) {
        console.error('Error loading student data:', error);
    }
}

// Load submissions
async function loadSubmissions() {
    try {
        const response = await fetchWithTimeout(`${API_URL}/submissions?student_id=${currentStudent.id}`);
        submissions = await response.json();
        
        updateStats();
        renderSubmissions();
        loadStudentFeed();
    } catch (error) {
        console.error('Error loading submissions:', error);
    }
}

// Get all submissions of student (requested container view)
function loadStudentFeed() {
    const container = document.getElementById('studentData');
    if (!container || !currentStudent) {
        return;
    }

    fetch(`${BACKEND_URL}/submissions?student_id=${currentStudent.id}`)
        .then(res => res.json())
        .then(data => {
            console.log(data);
            container.innerHTML = '';

            data.forEach(item => {
                container.innerHTML += `
                    <div class="clay-card" style="margin-bottom: 12px; padding: 16px; border-radius: 12px;">
                        <p><strong>Type:</strong> ${item.type}</p>
                        <p><strong>Status:</strong> ${item.status}</p>
                        <a href="${item.file_url}" target="_blank" style="color: var(--violet-medium);">View File</a>
                    </div>
                `;
            });

            if (!data.length) {
                container.innerHTML = '<p style="color: var(--text-secondary);">No submissions found.</p>';
            }
        })
        .catch(err => {
            console.error('Student feed fetch error:', err);
            container.innerHTML = '<p style="color: var(--danger);">Unable to load student data.</p>';
        });
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No submissions yet</td></tr>';
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
        
        return `
            <tr>
                <td>${sub.type.charAt(0).toUpperCase() + sub.type.slice(1)}</td>
                <td>${details}</td>
                <td><a href="${sub.file_url}" target="_blank" style="color: var(--violet-medium);">View File</a></td>
                <td>${date}</td>
                <td><span class="status-badge status-${sub.status}">${sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}</span></td>
            </tr>
        `;
    }).join('');
}

// Handle file selection
document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const label = document.getElementById('selectedFile');
    
    if (file) {
        label.innerHTML = `
            <span style="color: var(--violet-medium);">📎 Selected: ${file.name}</span>
            <span style="color: var(--text-secondary); margin-left: 8px;">(${(file.size / 1024 / 1024).toFixed(2)} MB)</span>
        `;
    } else {
        label.innerHTML = '';
    }
});

// Show/hide assignment number field
document.getElementById('submissionType').addEventListener('change', (e) => {
    const assignmentGroup = document.getElementById('assignmentNoGroup');
    if (e.target.value === 'assignment') {
        assignmentGroup.style.display = 'block';
    } else {
        assignmentGroup.style.display = 'none';
    }
});

// Handle form submission
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    const type = document.getElementById('submissionType').value;
    const assignmentNo = document.getElementById('assignmentNo').value;
    
    if (!file) {
        alert('Please select a file');
        return;
    }
    
    if (!type) {
        alert('Please select submission type');
        return;
    }
    
    if (type === 'assignment' && !assignmentNo) {
        alert('Please select assignment number');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('student_id', currentStudent.id);
    formData.append('type', type);
    if (type === 'assignment') {
        formData.append('assignment_no', assignmentNo);
    }
    
    try {
        const button = e.target.querySelector('button[type="submit"]');
        button.disabled = true;
        button.innerHTML = '<span>Uploading...</span>';
        showStatus('Uploading file. Please wait...', 'success');
        
        const response = await fetchWithTimeout(`${API_URL}/upload`, {
            method: 'POST',
            body: formData
        }, 30000);
        
        const data = await response.json();
        
        if (response.ok) {
            showStatus('File uploaded successfully.', 'success');
            document.getElementById('uploadForm').reset();
            document.getElementById('selectedFile').innerHTML = '';
            document.getElementById('assignmentNoGroup').style.display = 'none';
            await loadSubmissions();
        } else {
            showStatus(data.error || 'Upload failed', 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        if (error.name === 'AbortError') {
            showStatus('Upload timed out. Try a smaller file or check network speed.', 'error');
        } else {
            showStatus('Network error. Please try again.', 'error');
        }
    } finally {
        const button = e.target.querySelector('button[type="submit"]');
        button.disabled = false;
        button.innerHTML = '<span>Upload</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 16V4M8 12L12 16L16 12" stroke="currentColor" stroke-width="2"/><path d="M4 20H20" stroke="currentColor" stroke-width="2"/></svg>';
    }
});

// Logout function
function logout() {
    localStorage.removeItem('user');
    window.location.href = '/';
}

// Initialize
checkAuth();