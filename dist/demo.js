export const DEMO_FILENAME = 'faculty_assignments_2026.csv';

export const DEFAULT_CONFIG = {
  days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  start: '09:00',
  end: '16:30',
  slotMinutes: 60,
  breaks: [
    { name: 'Short break', start: '11:00', end: '11:15' },
    { name: 'Lunch', start: '13:15', end: '14:00' },
  ],
  maxTeacherHoursPerDay: 5,
  maxTeacherHoursPerWeek: 24,
  maxClassHoursPerDay: 6,
  teacherRules: [],
};

export const DEFAULT_INSTRUCTIONS = `College hours: 09:00-16:30
Working days: Monday-Friday
Short break: 11:00-11:15
Lunch: 13:15-14:00
Maximum teacher hours per day: 5
Maximum teacher hours per week: 24
Maximum class hours per day: 6
Dr. Ananya Rao unavailable on Friday`;

const rows = [
  ['Computer Science', 3, 'Dr. Ananya Rao', 'Data Structures', 'CS301', 'lecture', 3, 'C301'],
  ['Computer Science', 3, 'Dr. Karthik Iyer', 'Discrete Mathematics', 'CS302', 'lecture', 3, 'C301'],
  ['Computer Science', 3, 'Prof. Meera Nair', 'Digital Logic', 'CS303', 'lecture', 3, 'C301'],
  ['Computer Science', 3, 'Dr. Rahul Menon', 'Computer Organization', 'CS304', 'lecture', 3, 'C301'],
  ['Computer Science', 3, 'Prof. Priya Sharma', 'Object-Oriented Programming', 'CS305', 'lecture', 3, 'C301'],
  ['Computer Science', 3, 'Dr. Ananya Rao', 'Data Structures Lab', 'CS351', 'lab', 2, 'Computing Lab 1'],
  ['Computer Science', 3, 'Prof. Priya Sharma', 'OOP Lab', 'CS352', 'lab', 2, 'Computing Lab 2'],
  ['Computer Science', 1, 'Dr. Karthik Iyer', 'Engineering Mathematics I', 'MA101', 'lecture', 3, 'C101'],
  ['Computer Science', 1, 'Dr. Kavya Desai', 'Applied Physics', 'PH101', 'lecture', 3, 'C101'],
  ['Computer Science', 1, 'Prof. Arjun Patel', 'Programming in C', 'CS101', 'lecture', 3, 'C101'],
  ['Computer Science', 1, 'Prof. Riya Thomas', 'Technical Communication', 'HS101', 'lecture', 3, 'C101'],
  ['Computer Science', 1, 'Prof. Arjun Patel', 'Programming Lab', 'CS151', 'lab', 2, 'Computing Lab 1'],
  ['Computer Science', 5, 'Dr. Ananya Rao', 'Design of Algorithms', 'CS501', 'lecture', 3, 'C501'],
  ['Computer Science', 5, 'Dr. Rahul Menon', 'Operating Systems', 'CS502', 'lecture', 3, 'C501'],
  ['Computer Science', 5, 'Dr. Sneha Joshi', 'Database Management', 'CS503', 'lecture', 3, 'C501'],
  ['Computer Science', 5, 'Prof. Aditya Kulkarni', 'Computer Networks', 'CS504', 'lecture', 3, 'C501'],
  ['Computer Science', 5, 'Dr. Sneha Joshi', 'Database Lab', 'CS551', 'lab', 2, 'Computing Lab 2'],
  ['Computer Science', 7, 'Dr. Nisha Kapoor', 'Machine Learning', 'CS701', 'lecture', 3, 'C701'],
  ['Computer Science', 7, 'Prof. Aditya Kulkarni', 'Cloud Computing', 'CS702', 'lecture', 3, 'C701'],
  ['Computer Science', 7, 'Dr. Rahul Menon', 'Distributed Systems', 'CS703', 'lecture', 3, 'C701'],
  ['Computer Science', 7, 'Prof. Priya Sharma', 'Software Architecture', 'CS704', 'lecture', 3, 'C701'],
  ['Computer Science', 7, 'Dr. Nisha Kapoor', 'Machine Learning Lab', 'CS751', 'lab', 2, 'Computing Lab 3'],
  ['Electronics', 3, 'Dr. Vikram Shah', 'Electronic Devices', 'EC301', 'lecture', 3, 'E301'],
  ['Electronics', 3, 'Prof. Meera Nair', 'Digital Electronics', 'EC302', 'lecture', 3, 'E301'],
  ['Electronics', 3, 'Dr. Aditi Sen', 'Signals and Systems', 'EC303', 'lecture', 3, 'E301'],
  ['Electronics', 3, 'Dr. Karthik Iyer', 'Engineering Mathematics III', 'MA301', 'lecture', 3, 'E301'],
  ['Electronics', 3, 'Dr. Vikram Shah', 'Electronics Lab', 'EC351', 'lab', 2, 'Electronics Lab'],
  ['Mechanical', 3, 'Dr. Sanjay Kumar', 'Engineering Thermodynamics', 'ME301', 'lecture', 3, 'M301'],
  ['Mechanical', 3, 'Prof. Neha Reddy', 'Strength of Materials', 'ME302', 'lecture', 3, 'M301'],
  ['Mechanical', 3, 'Dr. Dev Malhotra', 'Fluid Mechanics', 'ME303', 'lecture', 3, 'M301'],
  ['Mechanical', 3, 'Prof. Ishaan Bose', 'Manufacturing Processes', 'ME304', 'lecture', 3, 'M301'],
  ['Mechanical', 3, 'Prof. Ishaan Bose', 'Manufacturing Lab', 'ME351', 'lab', 2, 'Manufacturing Lab'],
];

export const DEMO_ASSIGNMENTS = rows.map((row, index) => ({
  id: `demo-${index + 1}`, department: row[0], semester: row[1], section: 'A',
  teacher: row[2], subject: row[3], code: row[4], type: row[5], hours: row[6], room: row[7],
  blockHours: row[5] === 'lab' ? 2 : 1,
}));
