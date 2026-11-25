module.exports = {
  rootDir: '.',

  moduleFileExtensions: [
    'js',
    'json',
    'ts',
    'mjs',
  ],

  testEnvironment: 'node',

  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
  ],

  setupFilesAfterEnv: [
    '<rootDir>/test/jest.setup.ts',
  ],

  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],

    '^.+\\.m?js$': [
      'babel-jest',
      {
        presets: [
          [
            '@babel/preset-env',
            {
              targets: {
                node: 'current',
              },
              modules: 'commonjs',
            },
          ],
        ],

        plugins: [
          'babel-plugin-transform-import-meta',
        ],
      },
    ],
  },

  transformIgnorePatterns: [
    '/node_modules/(?!@nestjs/typeorm/|@nestjs/config/)',
  ],

  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.module.ts',
    '!src/**/*.entity.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.enum.ts',
    '!src/main.ts',
    '!src/config/**',
    '!src/database/**',
  ],

  coverageDirectory: '<rootDir>/coverage',

  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
  ],

  clearMocks: true,
  restoreMocks: true,
  verbose: true,
};