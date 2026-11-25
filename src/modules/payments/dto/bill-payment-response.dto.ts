import { ApiProperty } from '@nestjs/swagger';

export class BillPaymentDataDto {
  @ApiProperty({
    example: 'PAY-ae94bfb2-9bde-4f30-85dc-7f75d7a9cf85',
  })
  reference!: string;

  @ApiProperty({ example: '1000000001' })
  customerAccountNumber!: string;

  @ApiProperty({ example: '2000000001' })
  merchantAccountNumber!: string;

  @ApiProperty({ example: 'Kenya Power' })
  merchantName!: string;

  @ApiProperty({ example: 'KES' })
  currency!: string;

  @ApiProperty({ example: '1000.00' })
  billAmount!: string;

  @ApiProperty({ example: '30.00' })
  transactionCharge!: string;

  @ApiProperty({ example: '1030.00' })
  totalDebit!: string;

  @ApiProperty({ example: '3970.00' })
  availableBalance!: string;

  @ApiProperty({ example: 'SUCCESS' })
  status!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-11-25T09:05:00.000Z',
  })
  transactionDate!: Date;
}

export class BillPaymentResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'Bill payment successful' })
  message!: string;

  @ApiProperty({ type: BillPaymentDataDto })
  data!: BillPaymentDataDto;
}