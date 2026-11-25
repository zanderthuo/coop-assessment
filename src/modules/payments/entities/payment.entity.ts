import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

import { Account } from '../../accounts/entities/account.entity';

@Entity('payments')
@Index(['customerAccountNumber', 'createdAt'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, length: 50 })
  reference!: string;

  @Column({ length: 30 })
  customerAccountNumber!: string;

  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'customerAccountNumber',
    referencedColumnName: 'accountNumber',
  })
  customerAccount!: Account;

  @Column({ length: 30 })
  merchantAccountNumber!: string;

  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'merchantAccountNumber',
    referencedColumnName: 'accountNumber',
  })
  merchantAccount!: Account;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amount!: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  charge!: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  totalDebit!: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  balanceBefore!: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  balanceAfter!: string;

  @Column({ length: 20, default: 'SUCCESS' })
  status!: string;

  @CreateDateColumn()
  createdAt!: Date;
}