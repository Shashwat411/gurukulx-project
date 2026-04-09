-- Run this in Supabase SQL Editor

-- Create tables
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  role text CHECK (role IN ('student', 'faculty')) NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  roll_no text UNIQUE NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE TABLE faculty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  subject_name text NOT NULL,
  subject_code text NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE TABLE submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  type text CHECK (type IN ('assignment', 'practical', 'microproject')) NOT NULL,
  assignment_no int,
  file_url text NOT NULL,
  file_name text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamp DEFAULT now()
);

-- Insert Faculty
INSERT INTO users (name, email, role) VALUES ('Prof. Sharma', 'faculty@gpnagpur.edu', 'faculty');
INSERT INTO faculty (user_id, subject_name, subject_code) 
SELECT id, 'Cloud Computing', 'CM309H' FROM users WHERE email = 'faculty@gpnagpur.edu';

-- Insert 10 Students
INSERT INTO users (name, email, role) VALUES 
('Aditya Kumar', '2313001@gpnagpur.edu', 'student'),
('Priya Singh', '2313002@gpnagpur.edu', 'student'),
('Rahul Verma', '2313003@gpnagpur.edu', 'student'),
('Neha Patil', '2313004@gpnagpur.edu', 'student'),
('Sachin Deshmukh', '2313005@gpnagpur.edu', 'student'),
('Pooja Jadhav', '2313006@gpnagpur.edu', 'student'),
('Amit Thakur', '2313007@gpnagpur.edu', 'student'),
('Kavita Reddy', '2313008@gpnagpur.edu', 'student'),
('Vikram Singh', '2313009@gpnagpur.edu', 'student'),
('Anjali Gupta', '2313010@gpnagpur.edu', 'student');

INSERT INTO students (user_id, roll_no) 
SELECT id, SPLIT_PART(email, '@', 1) FROM users WHERE role = 'student';

-- Create Storage Bucket (do this in Supabase Storage UI)
-- Bucket name: submissions
-- Make it Public