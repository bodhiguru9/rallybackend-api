# Stripe Payment Integration Guide

## Overview
This guide explains how to integrate Stripe payments with the booking API. After calling the booking API, you'll receive a Stripe Payment Intent that you can use to process payments.

---

## Step 1: Create Booking (Get Stripe Payment Intent)

### API Call
```
POST /api/bookings/book-event/:eventId
```

### Request
```javascript
// Example: Book event E2 with promo code
const response = await fetch('/api/bookings/book-event/E2?promoCode=SUMMER20', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${your_token}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
```

### Response Body
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
      "eventImages": ["image1.jpg"],
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
    "publishableKey": "pk_test_51ABC123...",
    "isFreeEvent": false,
    "paymentRequired": true,
    "paymentStatus": "pending"
  }
}
```

---

## Step 2: Initialize Stripe (Frontend)

### Install Stripe.js
```bash
npm install @stripe/stripe-js
```

### Initialize Stripe
```javascript
import { loadStripe } from '@stripe/stripe-js';

// Use the publishableKey from booking API response
const stripe = await loadStripe(data.data.publishableKey);
```

---

## Step 3: Confirm Payment with Stripe

### Method 1: confirmCardPayment (Recommended for Card Payments)

#### Request Body
```javascript
const { error, paymentIntent } = await stripe.confirmCardPayment(
  data.data.paymentIntent.clientSecret, // From booking API response
  {
    payment_method: {
      card: cardElement, // Stripe Elements card element
      billing_details: {
        name: data.data.user.fullName,
        email: data.data.user.email,
        phone: data.data.user.mobileNumber,
        address: {
          // Optional address details
          line1: "123 Main St",
          city: "New York",
          state: "NY",
          postal_code: "10001",
          country: "US"
        }
      }
    },
    return_url: 'https://yourapp.com/payment-complete', // For redirect-based flows
  }
);
```

#### Response Body (Success)
```json
{
  "paymentIntent": {
    "id": "pi_3ABC123xyz",
    "object": "payment_intent",
    "amount": 8000,
    "currency": "usd",
    "status": "succeeded",
    "client_secret": "pi_3ABC123xyz_secret_xyz789",
    "payment_method": "pm_1ABC123xyz",
    "description": "Payment for event: Football Tournament 2024",
    "metadata": {
      "bookingId": "booking2",
      "eventId": "E2",
      "eventTitle": "Football Tournament 2024",
      "userId": "...",
      "promoCode": "SUMMER20"
    }
  }
}
```

#### Response Body (Error)
```json
{
  "error": {
    "type": "card_error",
    "code": "card_declined",
    "message": "Your card was declined.",
    "decline_code": "generic_decline",
    "payment_intent": {
      "id": "pi_3ABC123xyz",
      "status": "requires_payment_method"
    }
  }
}
```

---

### Method 2: confirmPayment (For Payment Element)

#### Request Body
```javascript
const { error, paymentIntent } = await stripe.confirmPayment({
  elements,
  confirmParams: {
    return_url: 'https://yourapp.com/payment-complete',
    payment_method_data: {
      billing_details: {
        name: data.data.user.fullName,
        email: data.data.user.email,
        phone: data.data.user.mobileNumber,
      }
    }
  }
});
```

---

### Method 3: Manual Payment Method Creation

#### Step 3a: Create Payment Method
```javascript
// Create payment method
const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
  type: 'card',
  card: cardElement,
  billing_details: {
    name: data.data.user.fullName,
    email: data.data.user.email,
    phone: data.data.user.mobileNumber,
  }
});

// Response
{
  "paymentMethod": {
    "id": "pm_1ABC123xyz",
    "object": "payment_method",
    "type": "card",
    "card": {
      "brand": "visa",
      "last4": "4242",
      "exp_month": 12,
      "exp_year": 2025
    }
  }
}
```

#### Step 3b: Confirm Payment with Payment Method
```javascript
const { error, paymentIntent } = await stripe.confirmCardPayment(
  data.data.paymentIntent.clientSecret,
  {
    payment_method: paymentMethod.id
  }
);
```

---

## Step 4: Verify Payment (Backend API)

After Stripe confirms payment, verify it on your backend:

### API Call
```
POST /api/payments/verify
```

### Request Body
```json
{
  "payment_intent_id": "pi_3ABC123xyz"
}
```

### Request (JavaScript)
```javascript
const verifyResponse = await fetch('/api/payments/verify', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${your_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    payment_intent_id: paymentIntent.id // From Stripe response
  })
});

const verifyData = await verifyResponse.json();
```

### Response Body
```json
{
  "success": true,
  "message": "Payment verified and event booked successfully",
  "data": {
    "payment": {
      "paymentId": "PAY1",
      "status": "success",
      "amount": 100,
      "discountAmount": 20,
      "finalAmount": 80,
      "promoCode": "SUMMER20",
      "stripePaymentIntentId": "pi_3ABC123xyz",
      "stripePaymentId": "ch_1ABC123xyz",
      "createdAt": "2024-12-20T10:30:00.000Z"
    },
    "booking": {
      "bookingId": "booking2",
      "eventId": "E2",
      "eventTitle": "Football Tournament 2024",
      "status": "booked",
      "bookedAt": "2024-12-20T10:35:00.000Z"
    }
  }
}
```

---

## Complete Frontend Integration Example

```javascript
// 1. Create booking
async function bookEvent(eventId, promoCode) {
  const response = await fetch(`/api/bookings/book-event/${eventId}?promoCode=${promoCode}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  return data;
}

// 2. Process Stripe payment
async function processStripePayment(bookingData, cardElement) {
  const stripe = await loadStripe(bookingData.data.publishableKey);
  
  const { error, paymentIntent } = await stripe.confirmCardPayment(
    bookingData.data.paymentIntent.clientSecret,
    {
      payment_method: {
        card: cardElement,
        billing_details: {
          name: bookingData.data.user.fullName,
          email: bookingData.data.user.email,
          phone: bookingData.data.user.mobileNumber
        }
      }
    }
  );
  
  if (error) {
    console.error('Payment failed:', error);
    return { success: false, error };
  }
  
  // 3. Verify payment on backend
  const verifyResponse = await fetch('/api/payments/verify', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      payment_intent_id: paymentIntent.id
    })
  });
  
  const verifyData = await verifyResponse.json();
  return { success: true, data: verifyData };
}

// Complete flow
async function completeBooking(eventId, promoCode, cardElement) {
  try {
    // Step 1: Create booking
    const bookingData = await bookEvent(eventId, promoCode);
    
    if (bookingData.data.isFreeEvent) {
      // Free event - no payment needed
      return { success: true, data: bookingData };
    }
    
    // Step 2 & 3: Process payment and verify
    const paymentResult = await processStripePayment(bookingData, cardElement);
    return paymentResult;
    
  } catch (error) {
    console.error('Booking failed:', error);
    return { success: false, error: error.message };
  }
}
```

---

## Stripe Payment Intent Status Values

- `requires_payment_method` - Payment method required
- `requires_confirmation` - Payment confirmation required
- `requires_action` - Additional action required (3D Secure, etc.)
- `processing` - Payment is processing
- `requires_capture` - Payment needs to be captured
- `canceled` - Payment was canceled
- `succeeded` - Payment succeeded ✅

---

## Stripe Test Cards

For testing in development mode:

```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
Requires 3D Secure: 4000 0027 6000 3184
```

Use any future expiry date (e.g., 12/25) and any 3-digit CVC.

---

## Error Handling

### Common Stripe Errors

```javascript
{
  "error": {
    "type": "card_error",
    "code": "card_declined",
    "message": "Your card was declined.",
    "decline_code": "insufficient_funds"
  }
}
```

### Error Codes:
- `card_declined` - Card was declined
- `insufficient_funds` - Not enough funds
- `expired_card` - Card has expired
- `incorrect_cvc` - CVC is incorrect
- `processing_error` - Processing error occurred

---

## Payment Status Flow

```
1. Booking API called
   ↓
2. Booking created (status: "pending")
   ↓
3. Stripe Payment Intent created (status: "requires_payment_method")
   ↓
4. User enters card details
   ↓
5. Stripe confirms payment (status: "succeeded")
   ↓
6. Verify payment API called
   ↓
7. Booking updated (status: "booked")
   ↓
8. User added to event
```

---

## Important Notes

1. **clientSecret**: Use `data.data.paymentIntent.clientSecret` for Stripe payment confirmation
2. **publishableKey**: Use `data.data.publishableKey` to initialize Stripe
3. **payment_intent_id**: Use `paymentIntent.id` from Stripe response to verify payment
4. **Amount**: Amount is in cents (e.g., 8000 = $80.00)
5. **Status**: Always check `paymentStatus: "pending"` before showing payment form
6. **Free Events**: Skip Stripe for events with `isFreeEvent: true`

---

## Security Best Practices

1. Never expose Stripe secret key on frontend
2. Always verify payment on backend after Stripe confirmation
3. Use HTTPS for all payment operations
4. Validate payment intent client secret before use
5. Check payment status on backend before marking booking as complete
