// Set only the isolated fixture selector; this test never uses hosting credentials.
process.env.QUIZMINT_TIMING_TEST_RUNTIME = 'namecheap';
await import('../tests/quiz-timing.mjs');
