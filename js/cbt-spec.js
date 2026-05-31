/** NSW Selective High School Placement Test — CBT specifications */
export const CBT_SPECS = {
  reading: {
    section: 'reading',
    label: 'Reading Test',
    questionCount: 17,
    multiPartCount: 3,
    minutes: 45,
    optionCount: 4,
    weighting: 0.25,
    responseType: 'mcq',
    instructions:
      'There are 17 questions in this test. Three questions have multiple parts — answer every part before clicking Next.',
  },
  'mathematical-reasoning': {
    section: 'mathematical-reasoning',
    label: 'Mathematical Reasoning Test',
    questionCount: 35,
    multiPartCount: 0,
    minutes: 40,
    optionCount: 5,
    weighting: 0.25,
    responseType: 'mcq',
    instructions: 'There are 35 questions in this test. Choose one answer (A–E) for each question.',
  },
  'thinking-skills': {
    section: 'thinking-skills',
    label: 'Thinking Skills Test',
    questionCount: 40,
    multiPartCount: 0,
    minutes: 40,
    optionCount: 4,
    weighting: 0.25,
    responseType: 'mcq',
    instructions: 'There are 40 questions in this test. Choose one answer (A–D) for each question.',
  },
  writing: {
    section: 'writing',
    label: 'Writing Test',
    questionCount: 1,
    multiPartCount: 0,
    minutes: 30,
    optionCount: 0,
    weighting: 0.25,
    responseType: 'open',
    instructions: 'There is one writing task. Plan on the screen if you wish; type your full response in the text area.',
  },
};

export const CBT_SECTION_ORDER = [
  'reading',
  'mathematical-reasoning',
  'thinking-skills',
  'writing',
];
