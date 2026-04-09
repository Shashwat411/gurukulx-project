from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from supabase import create_client, Client
from datetime import datetime
from werkzeug.utils import secure_filename
import uuid
from config import Config

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

MAX_FILE_SIZE_MB = 100
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE_BYTES

ALLOWED_EXTENSIONS = {'pdf', 'docx', 'zip'}

# Initialize Supabase
supabase: Client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
supabase_admin: Client = create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_KEY)


def is_allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def is_timeout_error(err: Exception) -> bool:
    err_text = str(err).lower()
    return 'timed out' in err_text or 'timeout' in err_text or 'write operation timed out' in err_text


def update_submission_status(submission_id: str, status: str):
    response = supabase_admin.table('submissions').update({'status': status}).eq('id', submission_id).execute()
    if response.data:
        return response.data[0]
    return None


@app.errorhandler(413)
def file_too_large(_):
    return jsonify({'error': f'File too large. Maximum allowed size is {MAX_FILE_SIZE_MB}MB.'}), 413

# Serve frontend files
@app.route('/')
def serve_index():
    return send_from_directory('../frontend', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('../frontend', path)

# API Routes
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')  # Roll number as password for students
    
    try:
        # Get user by email
        response = supabase_admin.table('users').select('*').eq('email', email).execute()
        
        if not response.data:
            return jsonify({'error': 'User not found'}), 404
        
        user = response.data[0]
        
        # For students, verify roll number as password
        if user['role'] == 'student':
            student_response = supabase_admin.table('students').select('roll_no').eq('user_id', user['id']).execute()
            if not student_response.data or student_response.data[0]['roll_no'] != password:
                return jsonify({'error': 'Invalid credentials'}), 401
        else:
            # For faculty, simple password check (in production, use proper auth)
            if password != 'faculty123':  # Simple password for demo
                return jsonify({'error': 'Invalid credentials'}), 401
        
        return jsonify({
            'user': user,
            'message': 'Login successful'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/submissions', methods=['GET'])
def get_submissions():
    student_id = request.args.get('student_id')
    
    try:
        query = supabase_admin.table('submissions').select('*, students(roll_no, users(name))').order('created_at', desc=True)
        
        if student_id:
            query = query.eq('student_id', student_id)
        
        response = query.execute()
        return jsonify(response.data)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/submissions', methods=['GET'])
def get_submissions_compat():
    student_id = request.args.get('student_id')

    try:
        query = supabase_admin.table('submissions').select('*').order('created_at', desc=True)

        if student_id:
            query = query.eq('student_id', student_id)

        response = query.execute()
        return jsonify(response.data)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/submissions/all', methods=['GET'])
def get_all_submissions():
    try:
        response = supabase_admin.table('submissions').select(
            '*, students(roll_no, users(name))'
        ).order('created_at', desc=True).execute()
        
        return jsonify(response.data)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload', methods=['POST'])
def upload_submission():
    try:
        file = request.files.get('file')
        student_id = request.form.get('student_id')
        submission_type = request.form.get('type')
        assignment_no = request.form.get('assignment_no')
        
        if not all([file, student_id, submission_type]):
            return jsonify({'error': 'Missing required fields'}), 400

        if not file.filename:
            return jsonify({'error': 'No file selected'}), 400

        if not is_allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type. Allowed: PDF, DOCX, ZIP'}), 400

        # Validate file size before upload to reduce storage write timeouts.
        file.seek(0, 2)
        file_size = file.tell()
        file.seek(0)

        if file_size > MAX_FILE_SIZE_BYTES:
            return jsonify({'error': f'File too large. Maximum allowed size is {MAX_FILE_SIZE_MB}MB.'}), 400
        
        # Generate unique filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = secure_filename(file.filename)
        file_ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
        unique_filename = f"{timestamp}_{uuid.uuid4().hex[:8]}.{file_ext}"
        
        # Upload to Supabase Storage
        file_path = f"{student_id}/{unique_filename}"
        
        file_content = file.read()
        
        response = supabase_admin.storage.from_('submissions').upload(
            file_path,
            file_content,
            {'content-type': file.content_type}
        )
        
        # Get public URL
        file_url = supabase_admin.storage.from_('submissions').get_public_url(file_path)
        
        # Save to database
        submission_data = {
            'student_id': student_id,
            'type': submission_type,
            'file_url': file_url,
            'file_name': filename,
            'status': 'pending'
        }
        
        if submission_type == 'assignment' and assignment_no:
            submission_data['assignment_no'] = int(assignment_no)
        
        db_response = supabase_admin.table('submissions').insert(submission_data).execute()
        
        return jsonify({
            'message': 'File uploaded successfully',
            'submission': db_response.data[0] if db_response.data else None
        })
        
    except Exception as e:
        if is_timeout_error(e):
            return jsonify({'error': 'Upload timed out. Please retry with a smaller file or check your network.'}), 504
        return jsonify({'error': str(e)}), 500

@app.route('/api/approve/<submission_id>', methods=['POST'])
def approve_submission(submission_id):
    try:
        updated = update_submission_status(submission_id, 'approved')
        if not updated:
            return jsonify({'error': 'Submission not found'}), 404
        return jsonify({'message': 'Submission approved', 'submission': updated})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/reject/<submission_id>', methods=['POST'])
def reject_submission(submission_id):
    try:
        updated = update_submission_status(submission_id, 'rejected')
        if not updated:
            return jsonify({'error': 'Submission not found'}), 404
        return jsonify({'message': 'Submission rejected', 'submission': updated})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/approve', methods=['POST'])
def approve_submission_compat():
    try:
        data = request.get_json(silent=True) or {}
        submission_id = data.get('id')

        if not submission_id:
            return jsonify({'error': 'Missing submission id'}), 400

        updated = update_submission_status(submission_id, 'approved')
        if not updated:
            return jsonify({'error': 'Submission not found'}), 404

        return jsonify({'message': 'Submission approved', 'submission': updated})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/reject', methods=['POST'])
def reject_submission_compat():
    try:
        data = request.get_json(silent=True) or {}
        submission_id = data.get('id')

        if not submission_id:
            return jsonify({'error': 'Missing submission id'}), 400

        updated = update_submission_status(submission_id, 'rejected')
        if not updated:
            return jsonify({'error': 'Submission not found'}), 404

        return jsonify({'message': 'Submission rejected', 'submission': updated})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/students', methods=['GET'])
def get_students():
    try:
        response = supabase_admin.table('students').select('*, users(name, email)').execute()
        return jsonify(response.data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/student/<student_id>', methods=['GET'])
def get_student(student_id):
    try:
        response = supabase_admin.table('students').select('*, users(name, email)').eq('id', student_id).execute()
        if response.data:
            return jsonify(response.data[0])
        return jsonify({'error': 'Student not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=10000)