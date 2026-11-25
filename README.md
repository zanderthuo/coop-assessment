# Co-operative Bank — Bill Payment API

## 1. Project overview

This project implements a banking REST API for customer and merchant account registration, bill payment processing and customer mini statements. It uses NestJS, TypeScript and PostgreSQL, with TypeORM for persistence and Swagger for interactive API documentation.

## 2. Implemented functionality

- Customer and merchant account registration with unique account numbers and opening balances.
- Automatic initialization of an internal bank fee account.
- Bill payments with a fixed KES 30 transaction charge.
- Customer debit, merchant credit and bank fee credit within one database transaction.
- Unique payment references and transaction history.
- Customer mini statements showing the current available balance and up to five recent payments.
- Request validation, exception handling, application logging and Swagger documentation.
- Jest unit tests for controllers and services, including payment validation and database failure scenarios.

## 3. Technology stack

| Technology | Purpose |
|---|---|
| Node.js 22 | Runtime |
| NestJS 11 / TypeScript | Backend framework and language |
| PostgreSQL 17 | Relational database |
| TypeORM | Entity mapping and transactions |
| Decimal.js | Precise monetary calculations |
| class-validator / class-transformer | Request validation |
| Swagger / OpenAPI | API documentation |
| Docker Compose | Local database infrastructure |
| Jest / ts-jest | Unit testing |

## 4. Project structure

```text
coop-assessment/
├── src/
│   ├── common/
│   │   ├── enums/account-type.enum.ts
│   │   ├── filters/http-exception.filter.ts
│   │   └── interceptors/logging.interceptor.ts
│   ├── config/database.config.ts
│   ├── database/seeds/bank-account.seed.ts
│   ├── modules/
│   │   ├── accounts/
│   │   │   ├── dto/
│   │   │   ├── entities/account.entity.ts
│   │   │   ├── accounts.controller.ts
│   │   │   ├── accounts.service.ts
│   │   │   ├── accounts.module.ts
│   │   │   └── *.spec.ts
│   │   └── payments/
│   │       ├── dto/
│   │       ├── entities/payment.entity.ts
│   │       ├── payments.controller.ts
│   │       ├── payments.service.ts
│   │       ├── payments.module.ts
│   │       └── *.spec.ts
│   ├── app.module.ts
│   └── main.ts
├── test/
├── docker-compose.yml
├── jest.config.cjs
├── tsconfig.spec.json
├── package.json
└── .env
```

The application separates HTTP controllers, business services, DTO validation, persistence entities and shared infrastructure.

## 5. Getting started

### Prerequisites

Node.js 22, npm, Docker and Docker Compose.

### Environment configuration

Create `.env` in the project root using the following local development values:

```dotenv
PORT=5003
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5433
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=coop_assessment
DB_SYNCHRONIZE=true
DB_LOGGING=true
BANK_FEE_ACCOUNT_NUMBER=9999999999
```

These are development-only credentials. Do not commit real credentials or enable automatic schema synchronization in production.

### Start the application

```bash
npm install
docker compose up -d
npm run start:dev
```

- Base URL: `http://localhost:5003`
- Swagger UI: `http://localhost:5003/docs`
- PostgreSQL: `localhost:5433`

The bank fee account seed runs at application startup. It creates the configured BANK account if missing, without resetting an existing balance. A missing or incorrectly typed bank account prevents successful payment processing.

## 6. Database design

### Accounts (`accounts`)

| Field | Description |
|---|---|
| id | UUID primary key |
| accountNumber | Unique account identifier, stored as a string |
| name | Account holder or merchant name |
| accountType | CUSTOMER, MERCHANT or BANK |
| balance | Decimal balance, numeric(18,2), non-negative |
| createdAt / updatedAt | Audit timestamps |

### Payments (`payments`)

| Field | Description |
|---|---|
| id | UUID primary key |
| reference | Unique payment reference |
| customerAccountNumber | Customer account foreign key |
| merchantAccountNumber | Merchant account foreign key |
| amount | Bill amount |
| charge | Fixed KES 30 fee |
| totalDebit | Amount plus charge |
| balanceBefore / balanceAfter | Customer balance before and after payment |
| status | SUCCESS for completed payments |
| createdAt | Transaction timestamp |

The payment table includes an index on customer account number and creation date to support mini statement queries. Monetary values use decimal database columns and are returned as strings to preserve precision.

## 7. Bill payment business rules

1. Validate the amount and ensure the customer, merchant and bank accounts are distinct.
2. Start a database transaction and acquire pessimistic write locks on all three accounts in consistent account-number order.
3. Verify account existence and account types.
4. Check that the customer can cover the bill amount plus KES 30.
5. Debit the customer, credit the merchant with the bill amount and credit the bank with the fee.
6. Persist the updated balances and payment record with a unique reference.
7. Commit the transaction before returning success. A database failure is intended to roll back the transaction.

Example: a KES 1,000 bill paid from a KES 5,000 customer balance results in:

| Account | Before | Change | After |
|---|---:|---:|---:|
| Customer | 5,000.00 | -1,030.00 | 3,970.00 |
| Merchant | 0.00 | +1,000.00 | 1,000.00 |
| Bank fee | 0.00 | +30.00 | 30.00 |
| Total | 5,000.00 | 0.00 | 5,000.00 |

## 8. API reference

All examples below assume a fresh database and the requests are executed in the order shown. IDs, timestamps and references are illustrative; actual values are generated by the application.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/accounts/register` | Register customer or merchant |
| POST | `/api/v1/payments/bill` | Process bill payment |
| GET | `/api/v1/accounts/:accountNumber/mini-statement` | Retrieve customer mini statement |

Use `Content-Type: application/json` for POST requests and `Accept: application/json` for all requests.

### 8.1 Register a customer account

**POST** `http://localhost:3000/api/v1/accounts/register`

Request body:

```json
{
  "accountNumber": "1000000001",
  "name": "John Doe",
  "accountType": "CUSTOMER",
  "openingBalance": 5000
}
```

Example cURL:

```bash
curl -X POST http://localhost:3000/api/v1/accounts/register \
  -H 'Content-Type: application/json' \
  -d '{"accountNumber":"1000000001","name":"John Doe","accountType":"CUSTOMER","openingBalance":5000}'
```

Expected response: **201 Created**

```json
{
  "success": true,
  "message": "Account registered successfully",
  "data": {
    "id": "11111111-1111-4111-8111-111111111111",
    "accountNumber": "1000000001",
    "name": "John Doe",
    "accountType": "CUSTOMER",
    "balance": "5000.00",
    "createdAt": "2026-11-25T09:00:00.000Z",
    "updatedAt": "2026-11-25T09:00:00.000Z"
  }
}
```

### 8.2 Register a merchant account

**POST** `http://localhost:3000/api/v1/accounts/register`

```json
{
  "accountNumber": "2000000001",
  "name": "Kenya Power",
  "accountType": "MERCHANT",
  "openingBalance": 0
}
```

```bash
curl -X POST http://localhost:3000/api/v1/accounts/register \
  -H 'Content-Type: application/json' \
  -d '{"accountNumber":"2000000001","name":"Kenya Power","accountType":"MERCHANT","openingBalance":0}'
```

Expected response: **201 Created**, with the same registration response structure, account type `MERCHANT` and balance `0.00`.

Registration validation:

| Field | Rule |
|---|---|
| accountNumber | String of 6–30 digits; unique |
| name | Nonblank string, maximum 150 characters |
| accountType | CUSTOMER or MERCHANT only |
| openingBalance | Number, 0 to 999999999999.99, maximum two decimal places |

Duplicate account numbers return 409; invalid fields return 400. BANK accounts are initialized internally, not through public registration.

### 8.3 Process a bill payment

**POST** `http://localhost:3000/api/v1/payments/bill`

```json
{
  "customerAccountNumber": "1000000001",
  "merchantAccountNumber": "2000000001",
  "amount": 1000
}
```

```bash
curl -X POST http://localhost:3000/api/v1/payments/bill \
  -H 'Content-Type: application/json' \
  -d '{"customerAccountNumber":"1000000001","merchantAccountNumber":"2000000001","amount":1000}'
```

Expected response: **201 Created**

```json
{
  "success": true,
  "message": "Bill payment successful",
  "data": {
    "reference": "PAY-43b7a000-701e-48cd-8011-a251cedf612a",
    "customerAccountNumber": "1000000001",
    "merchantAccountNumber": "2000000001",
    "merchantName": "Kenya Power",
    "currency": "KES",
    "billAmount": "1000.00",
    "transactionCharge": "30.00",
    "totalDebit": "1030.00",
    "availableBalance": "3970.00",
    "status": "SUCCESS",
    "transactionDate": "2026-11-25T09:05:00.000Z"
  }
}
```

Both account numbers must be strings of 6–30 digits. The amount must be a finite number from 0.01 to 999999999999.99 with at most two decimal places. The fee is calculated by the server; clients must not supply it.

Example insufficient-funds request after the successful payment:

```json
{
  "customerAccountNumber": "1000000001",
  "merchantAccountNumber": "2000000001",
  "amount": 5000
}
```

Expected response: **400 Bad Request**.

### 8.4 Retrieve a mini statement

**GET** `http://localhost:3000/api/v1/accounts/1000000001/mini-statement`

No request body is required. The customer account number is a path parameter.

```bash
curl http://localhost:3000/api/v1/accounts/1000000001/mini-statement \
  -H 'Accept: application/json'
```

Expected response: **200 OK**

```json
{
  "success": true,
  "message": "Mini statement retrieved successfully",
  "data": {
    "accountNumber": "1000000001",
    "accountName": "John Doe",
    "accountType": "CUSTOMER",
    "currency": "KES",
    "availableBalance": "3970.00",
    "transactionCount": 1,
    "transactions": [
      {
        "reference": "PAY-43b7a000-701e-48cd-8011-a251cedf612a",
        "transactionDate": "2026-11-25T09:05:00.000Z",
        "description": "Bill payment to Kenya Power",
        "transactionType": "DEBIT",
        "billAmount": "1000.00",
        "charge": "30.00",
        "totalAmount": "1030.00",
        "balanceAfter": "3970.00",
        "status": "SUCCESS"
      }
    ]
  }
}
```

The statement reads the current account balance and up to five latest payment records in a REPEATABLE READ transaction. A registered customer with no payments receives an empty transactions array and transactionCount of zero. Merchant and bank accounts are not eligible.

## 9. Validation and error handling

Global request validation rejects unknown fields and invalid DTO values. The HTTP exception filter is intended to provide a consistent error response when registered in application bootstrap.

Example error response:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Insufficient funds to cover bill amount and transaction charge",
  "timestamp": "2026-11-25T09:10:00.000Z"
}
```

Validation errors may contain an array of messages. If the custom filter is not registered, NestJS uses its default error response format.

| Status | Scenario |
|---|---|
| 400 | Invalid input, insufficient funds, identical accounts, incorrect customer/merchant type |
| 404 | Customer, merchant or statement account not found |
| 409 | Duplicate account number or payment uniqueness conflict |
| 500 | Missing/invalid bank fee account, unexpected database or transaction failure |

The payment service logs transaction progress and database error codes while returning generic messages for unexpected database failures. Development database logging should be disabled in production.

## 10. Testing

```bash
npm run test -- --runInBand
npm run test:cov -- --runInBand
npm run test -- --runInBand --detectOpenHandles
```

Unit tests use mocked repositories, configuration and transaction managers. Coverage scenarios include account registration, duplicate detection, decimal amounts, insufficient funds, account type checks, bank fee handling, payment references, lock ordering, database failure handling and mini statement queries.

### Manual API verification

| Scenario | Expected result |
|---|---|
| Register customer and merchant | 201 for each |
| Repeat registration with same account number | 409 |
| Pay KES 1,000 from KES 5,000 | 201; balance KES 3,970 |
| Pay more than available funds | 400; no persisted balance changes |
| Submit zero, negative or three-decimal amount | 400 |
| Use nonexistent merchant/customer | 404 |
| Request customer statement | 200; latest five or fewer payments |
| Request merchant statement | 400 |
| Request nonexistent account statement | 404 |

### Database verification

```bash
docker exec -it coop-postgres psql -U postgres -d coop_assessment
```

```sql
SELECT "accountNumber", name, "accountType", balance FROM accounts;
SELECT reference, amount, charge, "totalDebit", "balanceAfter", status
FROM payments ORDER BY "createdAt" DESC;
```

### Test execution status

The last supplied test run reported 24 passing tests and two passing suites. Three suites were blocked during initialization by a missing Babel plugin; the subsequent install attempt exposed a Babel 7/8 peer dependency conflict. A compatible plugin version must be verified and installed before rerunning the full suite. Full test success and coverage percentages have not yet been confirmed.

Mocked unit tests verify transaction and locking calls but do not establish actual PostgreSQL rollback or concurrent payment behavior. Those require integration tests against a real database.

## 11. Production considerations and future improvements

- Add authentication, authorization and account ownership checks before exposing banking endpoints.
- Add idempotency keys to prevent duplicate debits when clients retry requests.
- Replace schema synchronization with versioned migrations and secure database credentials.
- Introduce an immutable double-entry ledger, reconciliation and audit controls.
- Add PostgreSQL integration tests for atomic rollback, concurrent payments and constraints.
- Add rate limiting, monitoring and CI/CD quality gates.

## 12. Conclusion

The implementation provides the core account registration, bill payment and mini statement workflows required by the assessment, with modular architecture, decimal arithmetic, transaction-based balance updates, validation and API documentation. The remaining verification work is to resolve the test tooling dependency conflict and confirm full test execution and real-database transaction guarantees.
