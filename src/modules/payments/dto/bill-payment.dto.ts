import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Matches,
  Min,
  Max,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class BillPaymentDto {
  @ApiProperty({
    description: 'Customer account number to debit',
    example: '1000000001',
    minLength: 6,
    maxLength: 30,
    pattern: '^\\d{6,30}$',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6,30}$/, {
    message: 'Customer account number must contain 6 to 30 digits',
  })
  customerAccountNumber!: string;

  @ApiProperty({
    description: 'Merchant account number to credit',
    example: '2000000001',
    minLength: 6,
    maxLength: 30,
    pattern: '^\\d{6,30}$',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6,30}$/, {
    message: 'Merchant account number must contain 6 to 30 digits',
  })
  merchantAccountNumber!: string;

  @ApiProperty({
    description: 'Bill amount in KES, excluding the transaction charge',
    example: 1000,
    minimum: 0.01,
    maximum: 999999999999.99,
  })
  @IsNumber(
    {
      maxDecimalPlaces: 2,
      allowNaN: false,
      allowInfinity: false,
    },
    {
      message: 'Amount must be a valid number with up to 2 decimal places',
    },
  )
  @Min(0.01, {
    message: 'Payment amount must be greater than zero',
  })
  @Max(999999999999.99)
  amount!: number;
}