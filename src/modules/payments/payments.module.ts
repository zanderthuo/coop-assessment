import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

import { Payment } from './entities/payment.entity';
import { Account } from '../accounts/entities/account.entity';

import { BankAccountSeed } from '../../database/seeds/bank-account.seed';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      Account,
    ]),
  ],

  controllers: [
    PaymentsController,
  ],

  providers: [
    PaymentsService,
    BankAccountSeed,
  ],

  exports: [
    PaymentsService,
  ],
})
export class PaymentsModule {}