import { describe, expect, it } from 'vitest';
import { ImportError, detectFormat, importBank, parseCsv } from '@/core/import';
import { importExamTopics } from '@/core/import/examtopics';
import { importGift } from '@/core/import/gift';
import { importJson } from '@/core/import/json';
import { importAiken } from '@/core/import/aiken';
import { importCsv } from '@/core/import/csv';

const DUMP = `
AZ-104 Microsoft Azure Administrator

Question #1 Topic 2

Your company has an Azure subscription named Sub1.
You need to ensure that only compliant devices can sign in.
What should you configure?

A. a conditional access policy
B. an app protection policy
C. a device compliance policy
D. a network security group

Correct Answer: A

Community vote distribution
A (82%)
C (18%)

Explanation:
Conditional access evaluates device compliance state at sign-in.

Reference:
https://learn.microsoft.com/azure/active-directory/conditional-access/

Question #2 Topic 2

You need to configure high availability for a database. (Choose two.)

A. Enable geo-replication
B. Add a secondary replica
C. Increase the vCore count
D. Enable auto-failover groups

Correct Answer: BD

Community vote distribution
BD (74%)
AB (26%)
`;

describe('dump-text importer', () => {
  const { bank, warnings } = importExamTopics(DUMP);

  it('splits the dump into questions', () => {
    expect(bank.questions).toHaveLength(2);
    expect(warnings).toHaveLength(0);
  });

  it('guesses the exam code from the header', () => {
    expect(bank.code).toBe('AZ-104');
  });

  it('keeps the full multi-line stem but drops the options from it', () => {
    expect(bank.questions[0].stem).toContain('Your company has an Azure subscription');
    expect(bank.questions[0].stem).toContain('What should you configure?');
    expect(bank.questions[0].stem).not.toContain('conditional access policy');
  });

  it('parses lettered options in order', () => {
    expect(bank.questions[0].choices?.map((c) => c.text)).toEqual([
      'a conditional access policy',
      'an app protection policy',
      'a device compliance policy',
      'a network security group',
    ]);
  });

  it('resolves single and multi-letter answer keys', () => {
    expect(bank.questions[0].correct).toEqual(['A']);
    expect(bank.questions[1].correct).toEqual(['B', 'D']);
    expect(bank.questions[1].type).toBe('multiple');
  });

  it('captures community vote distribution', () => {
    expect(bank.questions[0].communityVotes).toEqual([
      { answer: 'A', count: 82 },
      { answer: 'C', count: 18 },
    ]);
    expect(bank.questions[0].communityAnswer).toBe('A');
  });

  it('captures explanation and reference separately', () => {
    expect(bank.questions[0].explanation).toContain('device compliance state');
    expect(bank.questions[0].reference).toContain('learn.microsoft.com');
    expect(bank.questions[0].explanation).not.toContain('learn.microsoft.com');
  });

  it('reads the topic number into a section', () => {
    expect(bank.questions[0].sectionId).toBe('topic-2');
    expect(bank.sections?.[0]).toEqual({ id: 'topic-2', title: 'Topic 2' });
  });

  it('picks up the "(Choose two.)" hint', () => {
    expect(bank.questions[1].selectCount).toBe(2);
  });

  it('ignores dump-site chrome such as "Show Suggested Answer"', () => {
    const noisy = importExamTopics(`
Question #1
Pick one.
Show Suggested Answer
A. Yes
B. No
Correct Answer: A
Upvoted 12 times
`);
    expect(noisy.bank.questions[0].stem).toBe('Pick one.');
    expect(noisy.bank.questions[0].choices).toHaveLength(2);
  });

  it('does not mistake a stem sentence starting with "A." for an option', () => {
    const tricky = importExamTopics(`
Question #1
A. Smith Corp needs a backup plan.
Which option is best?
A. Daily backups
B. Weekly backups
Correct Answer: A
`);
    expect(tricky.bank.questions[0].choices?.map((c) => c.text)).toEqual([
      'Daily backups',
      'Weekly backups',
    ]);
  });

  it('falls back to the community answer when the vendor key is missing', () => {
    const paywalled = importExamTopics(`
Question #1
Which one?
A. Alpha
B. Bravo

Community vote distribution
B (91%)
A (9%)
`);
    expect(paywalled.bank.questions[0].correct).toEqual(['B']);
  });

  it('rejects text with no question blocks', () => {
    expect(() => importExamTopics('just some prose')).toThrow(ImportError);
  });
});

describe('exam code detection', () => {
  const withHeader = (header: string) =>
    importExamTopics(`${header}\n\nQuestion #1\nPick one.\nA. Yes\nB. No\nCorrect Answer: A\n`).bank
      .code;

  it('reads the common vendor code shapes', () => {
    expect(withHeader('AZ-104 Microsoft Azure Administrator')).toBe('AZ-104');
    expect(withHeader('SY0-701 CompTIA Security+')).toBe('SY0-701');
    expect(withHeader('N10-009 CompTIA Network+')).toBe('N10-009');
    expect(withHeader('SAA-C03 AWS Solutions Architect')).toBe('SAA-C03');
    expect(withHeader('220-1101 CompTIA A+ Core 1')).toBe('220-1101');
    expect(withHeader('1Z0-808 Java SE Programmer')).toBe('1Z0-808');
  });

  it('ignores code-shaped tokens inside questions', () => {
    // "SHA-256" appears in an option and previously won over the real code.
    const { bank } = importExamTopics(`
SY0-701 Security Practice

Question #1

Which two are hashing algorithms? (Choose two.)

A. MD5
B. AES
C. SHA-256
D. RSA

Correct Answer: AC
`);
    expect(bank.code).toBe('SY0-701');
  });

  it('skips a denylisted token in the preamble and takes the real code after it', () => {
    expect(withHeader('SHA-256 and RFC-1918 notes for AZ-104')).toBe('AZ-104');
  });

  it('falls back to a placeholder when no code is present', () => {
    expect(withHeader('Practice questions')).toBe('DUMP');
  });
});

describe('JSON importer', () => {
  it('reads a full bank object', () => {
    const { bank } = importJson(
      JSON.stringify({
        code: 'SY0-701',
        title: 'Security+',
        passingScore: 75,
        timeLimitMinutes: 90,
        sections: [{ id: 's1', title: 'Threats' }],
        questions: [
          {
            stem: 'What does CIA stand for?',
            sectionId: 's1',
            options: ['Confidentiality, Integrity, Availability', 'Central Intelligence Agency'],
            answer: 'A',
            explanation: 'The security triad.',
          },
        ],
      }),
    );
    expect(bank.code).toBe('SY0-701');
    expect(bank.passingScore).toBe(75);
    expect(bank.questions[0].correct).toEqual(['A']);
    expect(bank.questions[0].explanation).toBe('The security triad.');
  });

  it('accepts a bare array of questions', () => {
    const { bank } = importJson(
      JSON.stringify([{ question: 'Pick one', options: ['x', 'y'], answer: 2 }]),
    );
    expect(bank.questions).toHaveLength(1);
    expect(bank.questions[0].correct).toEqual(['B']);
  });

  it('resolves answers given as letters, indexes, ids or text', () => {
    const build = (answer: unknown) =>
      importJson(
        JSON.stringify([{ question: 'Q', options: ['Alpha', 'Bravo', 'Charlie'], answer }]),
      ).bank.questions[0].correct;

    expect(build('B')).toEqual(['B']);
    expect(build(['A', 'C'])).toEqual(['A', 'C']);
    expect(build('AC')).toEqual(['A', 'C']);
    expect(build(2)).toEqual(['B']);
    expect(build('Charlie')).toEqual(['C']);
  });

  it('infers multi-select from a two-answer key', () => {
    const { bank } = importJson(
      JSON.stringify([{ question: 'Q', options: ['a', 'b', 'c'], answer: 'AB' }]),
    );
    expect(bank.questions[0].type).toBe('multiple');
  });

  it('infers true/false from the option text', () => {
    const { bank } = importJson(
      JSON.stringify([{ question: 'Q', options: ['True', 'False'], answer: 'A' }]),
    );
    expect(bank.questions[0].type).toBe('truefalse');
  });

  it('warns about and drops unanswerable questions', () => {
    const { bank, warnings } = importJson(
      JSON.stringify([
        { question: 'Good', options: ['a', 'b'], answer: 'A' },
        { question: 'No key', options: ['a', 'b'] },
      ]),
    );
    expect(bank.questions).toHaveLength(1);
    expect(warnings.join(' ')).toMatch(/no correct answer/i);
  });

  it('reports malformed JSON clearly', () => {
    expect(() => importJson('{ nope')).toThrow(ImportError);
  });

  it('rejects a file with no usable questions', () => {
    expect(() => importJson(JSON.stringify({ questions: [] }))).toThrow(ImportError);
  });
});

describe('GIFT importer', () => {
  const GIFT = `
// A comment line
::Subnetting::Which mask allows 30 usable hosts? {
  =255.255.255.224
  ~255.255.255.192
  ~255.255.255.240
}

::VLANs::A trunk port carries multiple VLANs. {T}

The command to show the routing table is {=show ip route =sh ip ro}

::Multi::Pick the two secure protocols {
  =SSH
  =HTTPS
  ~Telnet
  ~FTP
}
`;

  const { bank } = importGift(GIFT);

  it('parses each block', () => {
    expect(bank.questions).toHaveLength(4);
  });

  it('reads the title as the section', () => {
    expect(bank.questions[0].sectionId).toBe('Subnetting');
    expect(bank.questions[0].stem).toBe('Which mask allows 30 usable hosts?');
  });

  it('marks the "=" option correct', () => {
    expect(bank.questions[0].correct).toEqual(['A']);
    expect(bank.questions[0].choices).toHaveLength(3);
  });

  it('handles true/false shorthand', () => {
    expect(bank.questions[1].type).toBe('truefalse');
    expect(bank.questions[1].correct).toEqual(['A']);
  });

  it('handles short answer with several accepted spellings', () => {
    expect(bank.questions[2].type).toBe('fill');
    expect(bank.questions[2].correct).toEqual(['show ip route', 'sh ip ro']);
  });

  it('handles multi-select', () => {
    expect(bank.questions[3].type).toBe('multiple');
    expect(bank.questions[3].correct).toEqual(['A', 'B']);
  });

  it('strips partial-credit weights from option text', () => {
    const { bank: weighted } = importGift('::W::Q {=Right ~%50%Half right ~Wrong}');
    expect(weighted.questions[0].choices?.map((c) => c.text)).toEqual([
      'Right',
      'Half right',
      'Wrong',
    ]);
  });

  it('captures per-option feedback as the explanation', () => {
    const { bank: fb } = importGift('::F::Q {=Right#Because it is. ~Wrong}');
    expect(fb.questions[0].explanation).toContain('Because it is.');
  });
});

describe('Aiken importer', () => {
  const { bank } = importAiken(`
Which protocol resolves IP addresses to MAC addresses?
A. ARP
B. DNS
C. DHCP
D. ICMP
ANSWER: A

Which two are private ranges?
A. 10.0.0.0/8
B. 8.8.8.0/24
C. 192.168.0.0/16
D. 1.1.1.0/24
ANSWER: AC
`);

  it('parses each block', () => {
    expect(bank.questions).toHaveLength(2);
    expect(bank.questions[0].stem).toBe('Which protocol resolves IP addresses to MAC addresses?');
  });

  it('handles single and multi answers', () => {
    expect(bank.questions[0].correct).toEqual(['A']);
    expect(bank.questions[1].correct).toEqual(['A', 'C']);
    expect(bank.questions[1].type).toBe('multiple');
  });

  it('rejects text with no ANSWER lines', () => {
    expect(() => importAiken('Just a question?\nA. one\nB. two')).toThrow(ImportError);
  });
});

describe('CSV importer', () => {
  const CSV = `question,a,b,c,d,answer,explanation,section
"Which port does HTTPS use?",80,443,22,25,B,"TLS runs on 443",Networking
"Which two are hashes? ",MD5,AES,SHA-256,RSA,"A,C","Hashes are one-way",Crypto
`;

  const { bank } = importCsv(CSV);

  it('maps columns by header name', () => {
    expect(bank.questions).toHaveLength(2);
    expect(bank.questions[0].stem).toBe('Which port does HTTPS use?');
    expect(bank.questions[0].correct).toEqual(['B']);
    expect(bank.questions[0].explanation).toBe('TLS runs on 443');
    expect(bank.questions[0].sectionId).toBe('Networking');
  });

  it('handles comma-separated multi answers inside a quoted field', () => {
    expect(bank.questions[1].correct).toEqual(['A', 'C']);
    expect(bank.questions[1].type).toBe('multiple');
  });

  it('parses quoted fields containing commas and escaped quotes', () => {
    const rows = parseCsv('a,b\n"x,y","he said ""hi"""');
    expect(rows[1]).toEqual(['x,y', 'he said "hi"']);
  });

  it('detects tab-separated files', () => {
    const { bank: tsv } = importCsv('question\ta\tb\tanswer\nPick one\tYes\tNo\tA');
    expect(tsv.questions[0].correct).toEqual(['A']);
  });

  it('requires a question column', () => {
    expect(() => importCsv('foo,bar\n1,2')).toThrow(/question column/i);
  });
});

describe('format detection', () => {
  it('detects each supported format', () => {
    expect(detectFormat('{"questions":[]}')).toBe('json');
    expect(detectFormat('[{"question":"x"}]')).toBe('json');
    expect(detectFormat(DUMP)).toBe('examtopics');
    expect(detectFormat('::T::Q {=a ~b}')).toBe('gift');
    expect(detectFormat('Q?\nA. one\nB. two\nANSWER: A')).toBe('aiken');
    expect(detectFormat('question,a,b,answer\nq,1,2,A', 'bank.csv')).toBe('csv');
  });

  it('trusts the content over the file extension', () => {
    expect(detectFormat('{"questions":[]}', 'weird.txt')).toBe('json');
  });

  it('throws on unrecognisable input', () => {
    expect(() => detectFormat('hello world')).toThrow(ImportError);
  });
});

describe('importBank', () => {
  it('routes to the detected parser', () => {
    const result = importBank(DUMP, { fileName: 'az104.txt' });
    expect(result.format).toBe('examtopics');
    expect(result.bank.questions).toHaveLength(2);
  });

  it('lets explicit metadata override what was parsed', () => {
    const result = importBank(DUMP, {
      code: 'AZ-900',
      title: 'Azure Fundamentals',
      passingScore: 80,
      timeLimitMinutes: 45,
    });
    expect(result.bank.code).toBe('AZ-900');
    expect(result.bank.title).toBe('Azure Fundamentals');
    expect(result.bank.passingScore).toBe(80);
    expect(result.bank.timeLimitMinutes).toBe(45);
  });

  it('honours a forced format', () => {
    expect(importBank('Q?\nA. one\nB. two\nANSWER: B', { format: 'aiken' }).format).toBe('aiken');
  });

  it('gives every question a stable id across re-imports', () => {
    const first = importBank(DUMP).bank.questions.map((q) => q.id);
    const second = importBank(DUMP).bank.questions.map((q) => q.id);
    expect(first).toEqual(second);
  });
});
