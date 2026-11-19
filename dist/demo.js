export const DEMO_FILENAME = 'faculty_assignments_2026.csv';

export const DEFAULT_CONFIG = {
  days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  start: '08:30',
  end: '16:30',
  slotMinutes: 60,
  breaks: [
    { name: 'Short break', start: '10:30', end: '10:45' },
    { name: 'Lunch', start: '12:45', end: '13:30' },
  ],
  maxTeacherHoursPerDay: 5,
  maxTeacherHoursPerWeek: 24,
  maxClassHoursPerDay: 6,
  teacherRules: [],
  teacherBlocks: [],
  earlyStart: { enabled: true, time: '08:30', perTeacher: 1 },
};

export const DEFAULT_INSTRUCTIONS = `College hours: 08:30-16:30
Working days: Monday-Friday
Short break: 10:30-10:45
Lunch: 12:45-13:30
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
  ['Computer Science', null, 'Dr. Ananya Rao', 'Research and publication', 'RES01', 'research', 2, ''],
  ['Electronics', null, 'Prof. Meera Nair', 'Research and development', 'RES02', 'research', 2, ''],
];

export const DEMO_ASSIGNMENTS = rows.map((row, index) => ({
  id: `demo-${index + 1}`, department: row[0], semester: row[1], section: row[5] === 'research' ? '' : 'A',
  teacher: row[2], subject: row[3], code: row[4], type: row[5], hours: row[6], room: row[7],
  blockHours: row[5] === 'lab' ? 2 : 1,
}));

export const DEMO_BLOCKS = [
  { id: 'demo-duty-1', teacher: 'Dr. Ananya Rao', title: 'Test invigilation', type: 'duty', day: 'Thursday', start: '13:30', end: '14:30', date: '' },
  { id: 'demo-duty-2', teacher: 'Dr. Rahul Menon', title: 'Department meeting', type: 'other', day: 'Tuesday', start: '14:30', end: '15:30', date: '' },
];
