import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Check,
} from 'typeorm';

import { AccountType } from '../../../common/enums/account-type.enum';

@Entity('accounts')
@Check('"balance" >= 0')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, length: 30 })
  accountNumber!: string;

  @Column({ length: 150 })
  name!: string;

  @Column({
    type: 'enum',
    enum: AccountType,
  })
  accountType!: AccountType;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
  })
  balance!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}