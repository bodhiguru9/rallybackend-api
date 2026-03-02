# Booking API Documentation

## Overview
This API handles event bookings with Stripe payment integration. It supports both free and paid events.

## Flow

### For Free Events (price = 0):
1. User clicks booking API
2. Booking is created with status "booked" immediately
3. User is automatically added to event
4. No Stripe payment required

### For Paid Events (price > 0):
1. User clicks booking API
2. Booking is created with status "pending"
3. Stripe Payment Intent is created
4. Frontend receives payment intent details
5. User completes payment via Stripe
6. Payment verification updates booking to "booked"
7. User is added to event

---

## API Endpoint

### Book Event
**POST** `/api/bookings/book-event/:eventId`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json (optional)
```

**URL Parameters:**
- `eventId` (required): Event ID (e.g., "E1", "E2")

**Query Parameters (optional):**
- `promoCode` (optional): Promo code string (e.g., "SUMMER20")

**Request Body (optional):**
```json
{
  "promoCode": "SUMMER20"
}
```

**Note:** 
- `userId` is automatically picked from logged-in user (no need to send)
- `promoCode` can be sent in query params OR body (both optional)

---

## Response Examples

### 1. Free Event Response (price = 0)

**Request:**
```
POST /api/bookings/book-event/E1
Headers: Authorization: Bearer <token>
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Free event booked successfully",
  "data": {
    "user": {
      "userId": 5,
      "userType": "player",
      "email": "user@example.com",
      "fullName": "John Doe",
      "mobileNumber": "+1234567890",
      "profilePic": "https://example.com/profile.jpg"
    },
    "event": {
      "eventId": "E1",
      "eventTitle": "Cricket Championship 2024",
      "eventName": "Cricket Championship",
      "eventDateTime": "2024-12-25T10:00:00Z",
      "eventLocation": "Stadium Name",
      "eventImages": ["image1.jpg"],
      "gameJoinPrice": 0
    },
    "booking": {
      "bookingId": "booking1",
      "status": "booked",
      "amount": 0,
      "discountAmount": 0,
      "finalAmount": 0,
      "promoCode": null,
      "bookedAt": "2024-12-20T10:30:00.000Z",
      "createdAt": "2024-12-20T10:30:00.000Z"
    },
    "bookingConfirmationUrl": "https://yourapp.com/booking/confirmed?booking_id=booking1",
    "isFreeEvent": true,
    "paymentRequired": false,
    "paymentStatus": "not_required"
  }
}
```

---

### 2. Paid Event Response (price > 0)

**Request:**
```
POST /api/bookings/book-event/E2?promoCode=SUMMER20
Headers: Authorization: Bearer <token>
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Booking created. Please complete payment.",
  "data": {
    "user": {
      "userId": 5,
      "userType": "player",
      "email": "user@example.com",
      "fullName": "John Doe",
      "mobileNumber": "+1234567890",
      "profilePic": "https://example.com/profile.jpg"
    },
    "event": {
      "eventId": "E2",
      "eventTitle": "Football Tournament 2024",
      "eventName": "Football Tournament",
      "eventDateTime": "2024-12-25T10:00:00Z",
      "eventLocation": "Stadium Name",
      "eventImages": ["image1.jpg", "image2.jpg"],
      "gameJoinPrice": 100
    },
    "booking": {
      "bookingId": "booking2",
      "status": "pending",
      "amount": 100,
      "discountAmount": 20,
      "finalAmount": 80,
      "promoCode": "SUMMER20",
      "createdAt": "2024-12-20T10:30:00.000Z"
    },
    "payment": {
      "paymentId": "PAY1",
      "status": "pending",
      "originalAmount": 100,
      "discountAmount": 20,
      "finalAmount": 80,
      "finalAmountInCents": 8000,
      "currency": "usd",
      "promoCode": "SUMMER20",
      "stripePaymentIntentId": "pi_3ABC123xyz"
    },
    "paymentIntent": {
      "id": "pi_3ABC123xyz",
      "clientSecret": "pi_3ABC123xyz_secret_xyz789",
      "amount": 8000,
      "amountInDollars": "80.00",
      "currency": "usd",
      "status": "requires_payment_method",
      "description": "Payment for event: Football Tournament 2024"
    },
    "checkoutSession": {
      "id": "cs_test_abc123xyz",
      "url": "https://checkout.stripe.com/c/pay/cs_test_abc123xyz#...",
      "successUrl": "https://yourapp.com/payment/success?session_id={CHECKOUT_SESSION_ID}&booking_id=booking2",
      "cancelUrl": "https://yourapp.com/payment/cancel?booking_id=booking2"
    },
    "publishableKey": "pk_test_51ABC123...",
    "isFreeEvent": false,
    "paymentRequired": true,
    "paymentStatus": "pending"
  }
}
```

---

### 3. Existing Pending Booking Response

**Request:**
```
POST /api/bookings/book-event/E2
Headers: Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Pending booking found",
  "data": {
    "user": {
      "userId": 5,
      "userType": "player",
      "email": "user@example.com",
      "fullName": "John Doe",
      "mobileNumber": "+1234567890",
      "profilePic": "https://example.com/profile.jpg"
    },
    "event": {
      "eventId": "E2",
      "eventTitle": "Football Tournament 2024",
      "eventName": "Football Tournament",
      "eventDateTime": "2024-12-25T10:00:00Z",
      "eventLocation": "Stadium Name",
      "eventImages": ["image1.jpg"],
      "gameJoinPrice": 100
    },
    "booking": {
      "bookingId": "booking2",
      "status": "pending",
      "amount": 100,
      "discountAmount": 0,
      "finalAmount": 100,
      "promoCode": null,
      "createdAt": "2024-12-20T10:25:00.000Z"
    },
    "payment": {
      "paymentId": "PAY1",
      "status": "pending",
      "originalAmount": 100,
      "discountAmount": 0,
      "finalAmount": 100,
      "finalAmountInCents": 10000,
      "currency": "usd",
      "promoCode": null,
      "stripePaymentIntentId": "pi_3ABC123xyz"
    },
    "paymentIntent": {
      "id": "pi_3ABC123xyz",
      "clientSecret": "pi_3ABC123xyz_secret_xyz789",
      "amount": 10000,
      "amountInDollars": "100.00",
      "currency": "usd",
      "status": "requires_payment_method",
      "description": "Payment for event: Football Tournament 2024"
    },
    "checkoutSession": {
      "id": "cs_test_abc123xyz",
      "url": "https://checkout.stripe.com/c/pay/cs_test_abc123xyz#...",
      "successUrl": "https://yourapp.com/payment/success?session_id={CHECKOUT_SESSION_ID}&booking_id=booking2",
      "cancelUrl": "https://yourapp.com/payment/cancel?booking_id=booking2"
    },
    "publishableKey": "pk_test_51ABC123...",
    "isFreeEvent": false,
    "paymentRequired": true,
    "paymentStatus": "pending"
  }
}
```

---

## Error Responses

### 1. Event Not Found
```json
{
  "success": false,
  "error": "Event not found"
}
```

### 2. Already Joined Event
```json
{
  "success": false,
  "error": "Already joined this event"
}
```

### 3. Invalid Promo Code
```json
{
  "success": false,
  "error": "Promo code expired"
}
```

### 4. Stripe Payment Intent Creation Failed
```json
{
  "success": false,
  "error": "Failed to create payment intent",
  "details": "Stripe API error message"
}
```

---

## Frontend Integration

### For Paid Events:

1. **Call Booking API:**
```javascript
const response = await fetch('/api/bookings/book-event/E2?promoCode=SUMMER20', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
```

2. **Initialize Stripe:**
```javascript
const stripe = Stripe(data.data.publishableKey);
```

3. **Confirm Payment:**
```javascript
const { error, paymentIntent } = await stripe.confirmCardPayment(
  data.data.paymentIntent.clientSecret,
  {
    payment_method: {
      card: cardElement,
      billing_details: {
        name: 'User Name'
      }
    }
  }
);
```

4. **Verify Payment (after Stripe confirmation):**
```javascript
await fetch('/api/payments/verify', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    payment_intent_id: paymentIntent.id
  })
});
```

---

## Response Fields Explanation

### Booking Object:
- `bookingId`: Sequential booking ID (booking1, booking2, etc.)
- `eventId`: Event ID (E1, E2, etc.)
- `eventTitle`: Event title/name
- `status`: Booking status ("pending", "booked", "cancelled", "failed")
- `amount`: Original event price
- `discountAmount`: Discount amount from promo code
- `finalAmount`: Final amount after discount
- `promoCode`: Promo code used (if any)
- `bookedAt`: Timestamp when booking was confirmed (null for pending)
- `createdAt`: Timestamp when booking was created

### User Object:
- `userId`: Sequential user ID (1, 2, 3, etc.)
- `userType`: User type ("player" or "organiser")
- `email`: User email address
- `fullName`: User full name
- `mobileNumber`: User mobile number
- `profilePic`: User profile picture URL

### Event Object:
- `eventId`: Event ID (E1, E2, etc.)
- `eventTitle`: Event title/name
- `eventName`: Event name
- `eventDateTime`: Event date and time
- `eventLocation`: Event location
- `eventImages`: Array of event image URLs
- `gameJoinPrice`: Event join price

### Payment Intent Object (Stripe):
- `id`: Stripe Payment Intent ID (pi_xxx)
- `clientSecret`: Client secret for Stripe payment confirmation
- `amount`: Amount in cents (e.g., 8000 = $80.00)
- `amountInDollars`: Amount in dollars formatted as string (e.g., "80.00")
- `currency`: Currency code (e.g., "usd")
- `status`: Payment intent status ("requires_payment_method", "succeeded", etc.)
- `description`: Payment description

### Payment Object:
- `paymentId`: Sequential payment ID (PAY1, PAY2, etc.)
- `status`: Payment status ("pending", "success", "failed")
- `originalAmount`: Original event price
- `discountAmount`: Discount amount from promo code
- `finalAmount`: Final amount after discount
- `finalAmountInCents`: Final amount in cents (for Stripe)
- `currency`: Currency code (e.g., "usd")
- `promoCode`: Promo code used (if any)
- `stripePaymentIntentId`: Stripe Payment Intent ID

### Stripe Payment API Details:
- `publishableKey`: Stripe publishable key for frontend initialization
- `paymentIntent.clientSecret`: Use this with Stripe.js to confirm payment
- `paymentIntent.id`: Payment Intent ID for verification
- `paymentIntent.amount`: Amount in cents (Stripe format)
- `paymentIntent.amountInDollars`: Amount in dollars (for display)

### Checkout Session Object (Stripe Payment Link):
- `id`: Stripe Checkout Session ID (cs_test_xxx)
- `url`: **Payment link URL** - Direct link to Stripe checkout page (redirect user to this URL)
- `successUrl`: URL to redirect after successful payment
- `cancelUrl`: URL to redirect if payment is cancelled

### Booking Confirmation URL (Free Events):
- `bookingConfirmationUrl`: Direct link to booking confirmation page (for free events only)

### Flags:
- `isFreeEvent`: Boolean indicating if event is free
- `paymentRequired`: Boolean indicating if payment is required
- `paymentStatus`: Payment status ("pending", "not_required", "success", "failed")

---

## Notes

1. **User ID**: Automatically extracted from JWT token (no need to send)
2. **Event ID**: Must be in URL params (e.g., `/book-event/E1`)
3. **Promo Code**: Optional, can be in query params or body
4. **Free Events**: Automatically booked, no Stripe payment needed
5. **Paid Events**: Require Stripe payment completion before booking is confirmed
6. **Booking IDs**: Sequential format (booking1, booking2, etc.) - not MongoDB ObjectIds
