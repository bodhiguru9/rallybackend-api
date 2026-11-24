module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./tests/setup.js'],
  testTimeout: 30000,
  // Every suite shares the same sandboxed *_test collections and drops them in its global teardown, so suites
  // must not run in parallel (parallel runs made the concurrency suite fail by dropping each other's data).
  maxWorkers: 1,
  verbose: true,
};
