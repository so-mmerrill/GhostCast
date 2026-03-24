/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: String.raw`.*\.spec\.ts$`,
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    // Map workspace packages to their TypeScript source files
    // Note: rootDir is 'src', so we need to go up 3 levels to reach packages
    '^@ghostcast/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
    '^@ghostcast/shared/(.*)$': '<rootDir>/../../../packages/shared/src/$1',
    '^@ghostcast/database$': '<rootDir>/../../../packages/database/src/index.ts',
    '^@ghostcast/plugin-sdk$': '<rootDir>/../../../packages/plugin-sdk/src/index.ts',
    // Handle .js extensions in TypeScript ESM imports
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Transform workspace packages that are written in TypeScript
  transformIgnorePatterns: [
    'node_modules/(?!(@ghostcast)/)',
  ],
};
