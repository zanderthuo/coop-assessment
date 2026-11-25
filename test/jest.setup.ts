import 'reflect-metadata';

import { Logger } from '@nestjs/common';

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: jest.fn(
    () => () => undefined,
  ),

  InjectDataSource: jest.fn(
    () => () => undefined,
  ),

  getRepositoryToken: jest.fn(
    (entity: { name: string }) =>
      `${entity.name}Repository`,
  ),
}));

beforeEach(() => {
  jest
    .spyOn(Logger.prototype, 'log')
    .mockImplementation(() => undefined);

  jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);

  jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);

  jest
    .spyOn(Logger.prototype, 'debug')
    .mockImplementation(() => undefined);

  jest
    .spyOn(Logger.prototype, 'verbose')
    .mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});