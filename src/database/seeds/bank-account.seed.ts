import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { Account } from '../../modules/accounts/entities/account.entity';
import { AccountType } from '../../common/enums/account-type.enum';

@Injectable()
export class BankAccountSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(BankAccountSeed.name);

  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,

    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedBankAccount();
  }

  private async seedBankAccount(): Promise<void> {
    const accountNumber =
      this.configService.getOrThrow<string>(
        'BANK_FEE_ACCOUNT_NUMBER',
      );

    if (!/^\d{6,30}$/.test(accountNumber)) {
      throw new Error(
        'Invalid BANK_FEE_ACCOUNT_NUMBER configuration',
      );
    }

    await this.accountRepository
      .createQueryBuilder()
      .insert()
      .into(Account)
      .values({
        accountNumber,
        name: 'Bank Fee Account',
        accountType: AccountType.BANK,
        balance: '0.00',
      })
      .orIgnore()
      .execute();

    const bankAccount =
      await this.accountRepository.findOne({
        where: { accountNumber },
      });

    if (!bankAccount) {
      throw new Error(
        'Failed to initialize bank fee account',
      );
    }

    if (bankAccount.accountType !== AccountType.BANK) {
      throw new Error(
        'Configured bank fee account has an invalid account type',
      );
    }

    this.logger.log(
      'Bank fee account initialized successfully',
    );
  }
}