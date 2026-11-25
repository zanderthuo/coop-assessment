import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsNumber,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AccountType } from '../../../common/enums/account-type.enum';

export class RegisterAccountDto {
  @ApiProperty({ example: '1000000001' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6,30}$/)
  accountNumber!: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(150)
  name!: string;

  @ApiProperty({
    enum: [AccountType.CUSTOMER, AccountType.MERCHANT],
    example: AccountType.CUSTOMER,
  })
  @IsIn([AccountType.CUSTOMER, AccountType.MERCHANT])
  accountType!: AccountType;

  @ApiProperty({ example: 5000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  openingBalance!: number;
}