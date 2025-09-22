import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  moduleNameMapper: {
    '^server/(.*)$': '<rootDir>/server/$1',
  },
  globals: {
    'ts-jest': {
      isolatedModules: true,
      tsconfig: '<rootDir>/server/tsconfig.json',
    },
  },
};

export default config;
