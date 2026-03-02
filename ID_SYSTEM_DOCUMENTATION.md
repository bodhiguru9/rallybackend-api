# Sequential ID System Documentation

## Overview
This system ensures unique sequential IDs for all entities (users, events, payments, etc.) even under high traffic conditions. It prevents ID collisions and ensures no IDs are missed or collapsed.

## Key Components

### 1. Counter Model (`src/models/Counter.js`)
- **Purpose**: Atomic counter management using MongoDB's `findOneAndUpdate` with `$inc`
- **Thread-Safety**: Uses `upsert: true` and `writeConcern: { w: 'majority' }` for high-traffic scenarios
- **Supported IDs**:
  - `userId`: Sequential numbers (1, 2, 3, ...)
  - `eventId`: Sequential numbers (1, 2, 3, ...) formatted as E1, E2, E3
  - `paymentId`: Sequential numbers formatted as PAY1, PAY2, PAY3
  - `requestId`: Sequential numbers (1, 2, 3, ...)
  - `joinRequestId`: Sequential numbers formatted as R1, R2, R3
  - `waitlistId`: Sequential numbers formatted as W1, W2, W3
  - `promoCodeId`: Sequential numbers formatted as PRO1, PRO2, PRO3
  - `sportId`: Sequential numbers formatted as SP1, SP2, SP3

### 2. ID Manager Utility (`src/utils/idManager.js`)
- **Purpose**: Centralized ID management with uniqueness verification
- **Key Functions**:
  - `getNextUniqueUserId()`: Gets next user ID with uniqueness check and retry logic
  - `getNextUniqueEventId()`: Gets next event ID with uniqueness check and retry logic
  - `getNextUniquePaymentId()`: Gets next payment ID with uniqueness check and retry logic
  - `verifyUserIdUniqueness()`: Verifies if a userId is unique
  - `verifyEventIdUniqueness()`: Verifies if an eventId is unique
  - `verifyPaymentIdUniqueness()`: Verifies if a paymentId is unique
  - `toSequentialUserId()`: Converts any ID format to sequential userId
  - `toSequentialEventId()`: Converts any ID format to sequential eventId
  - `userIdToMongoId()`: Converts sequential userId to MongoDB ObjectId
  - `eventIdToMongoId()`: Converts sequential eventId to MongoDB ObjectId

### 3. ID Usage in Models

#### User Model (`src/models/User.js`)
- **Primary ID**: `userId` (sequential: 1, 2, 3, ...)
- **Internal ID**: `_id` (MongoDB ObjectId - for database operations only)
- **Creation**: Uses `getNextUniqueUserId()` from ID Manager

#### Event Model (`src/models/Event.js`)
- **Primary ID**: `eventId` (sequential: E1, E2, E3, ...)
- **Internal ID**: `_id` (MongoDB ObjectId - for database operations only)
- **Creation**: Uses `getNextUniqueEventId()` from ID Manager

#### Payment Model (`src/models/Payment.js`)
- **Primary ID**: `paymentId` (sequential: PAY1, PAY2, PAY3, ...)
- **Internal ID**: `_id` (MongoDB ObjectId - for database operations only)
- **Creation**: Uses `getNextUniquePaymentId()` from ID Manager

## ID Format Guidelines

### Sequential IDs (Primary - Exposed in API)
- **Users**: `1`, `2`, `3`, ... (numbers)
- **Events**: `E1`, `E2`, `E3`, ... (string with E prefix)
- **Payments**: `PAY1`, `PAY2`, `PAY3`, ... (string with PAY prefix)
- **Requests**: `R1`, `R2`, `R3`, ... (string with R prefix)
- **Waitlist**: `W1`, `W2`, `W3`, ... (string with W prefix)
- **Promo Codes**: `PRO1`, `PRO2`, `PRO3`, ... (string with PRO prefix)
- **Sports**: `SP1`, `SP2`, `SP3`, ... (string with SP prefix)

### MongoDB ObjectIds (Internal - Not Exposed)
- Used only for:
  - Database queries and relationships
  - Internal operations
  - Foreign key references in collections

## High Traffic Protection

### 1. Atomic Operations
- All counter increments use MongoDB's atomic `$inc` operation
- `findOneAndUpdate` with `upsert: true` ensures thread-safety

### 2. Uniqueness Verification
- ID Manager verifies uniqueness before returning IDs
- Retry logic (max 5 attempts) if collision detected
- Exponential backoff between retries

### 3. Write Concern
- Uses `writeConcern: { w: 'majority' }` for data consistency
- Ensures writes are acknowledged by majority of replica set

## API Response Format

### User Response
```json
{
  "id": 5,                    // Sequential userId (PRIMARY)
  "userId": 5,                // Sequential userId (for clarity)
  "mongoId": "507f1f77bcf86cd799439011",  // MongoDB ObjectId (internal reference only)
  "userType": "organiser",
  ...
}
```

### Event Response
```json
{
  "eventId": "E1",            // Sequential eventId (PRIMARY)
  "mongoId": "507f1f77bcf86cd799439011",  // MongoDB ObjectId (internal reference only)
  "gameTitle": "Cricket Match",
  ...
}
```

### Payment Response
```json
{
  "paymentId": "PAY1",       // Sequential paymentId (PRIMARY)
  "mongoId": "507f1f77bcf86cd799439011",  // MongoDB ObjectId (internal reference only)
  "amount": 100,
  ...
}
```

## Best Practices

1. **Always use sequential IDs in API responses** - Never expose MongoDB ObjectIds as primary identifiers
2. **Use ID Manager for ID generation** - Don't call Counter directly
3. **Convert IDs when needed** - Use `toSequentialUserId()` or `toSequentialEventId()` for conversions
4. **Verify uniqueness** - ID Manager handles this automatically, but you can verify manually if needed
5. **Handle both formats in queries** - Support both sequential IDs and ObjectIds for backward compatibility

## Migration Notes

- Old code may still accept MongoDB ObjectIds for queries (backward compatibility)
- New code should prefer sequential IDs
- Internal database operations use ObjectIds for relationships
- API responses always use sequential IDs as primary identifier

## Error Handling

- If ID collision detected: Automatic retry with exponential backoff
- If max retries exceeded: Error thrown with descriptive message
- All ID operations are logged for debugging

## Testing High Traffic Scenarios

The system is designed to handle:
- Concurrent user registrations
- Concurrent event creations
- Concurrent payment processing
- High-frequency ID generation

All operations are atomic and thread-safe, ensuring no ID collisions or missed IDs.

