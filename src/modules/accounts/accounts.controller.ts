import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

import { AccountsService } from './accounts.service';
import { RegisterAccountDto } from './dto/register-account.dto';

@ApiTags('Accounts')
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a customer or merchant account' })
  @ApiResponse({ status: 201, description: 'Account registered' })
  @ApiResponse({ status: 400, description: 'Invalid account details' })
  @ApiResponse({ status: 409, description: 'Duplicate account number' })
  register(@Body() dto: RegisterAccountDto) {
    return this.accountsService.register(dto);
  }

  @Get(':accountNumber/mini-statement')
  @ApiOperation({ summary: 'Retrieve customer mini statement' })
  @ApiResponse({ status: 200, description: 'Mini statement retrieved' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  getMiniStatement(@Param('accountNumber') accountNumber: string) {
    if (!/^\d{6,30}$/.test(accountNumber)) {
      throw new BadRequestException('Invalid account number');
    }

    return this.accountsService.getMiniStatement(accountNumber);
  }
}