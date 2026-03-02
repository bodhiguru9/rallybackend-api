# Email OTP - How It Works

## Why We Need EMAIL_USER and EMAIL_PASSWORD

### The Email Sending Process:

```
┌─────────────────────────────────────────────────────────┐
│  YOUR APPLICATION (Rally Backend)                       │
│                                                          │
│  EMAIL_USER: noreply@rally.com  ← YOUR email account   │
│  EMAIL_PASSWORD: ********        ← Password for that    │
│                                      account            │
└─────────────────────────────────────────────────────────┘
                          │
                          │ Uses SMTP credentials
                          │ to authenticate
                          ▼
┌─────────────────────────────────────────────────────────┐
│  EMAIL SERVER (Gmail/SendGrid/etc.)                     │
│                                                          │
│  "I am noreply@rally.com, here's my password"          │
│  "I want to send an email to user@example.com"         │
│  "The OTP is: 123456"                                   │
└─────────────────────────────────────────────────────────┘
                          │
                          │ Delivers email
                          ▼
┌─────────────────────────────────────────────────────────┐
│  USER'S EMAIL INBOX                                      │
│                                                          │
│  From: noreply@rally.com                                 │
│  To: user@example.com  ← USER's email (they provide)   │
│  Subject: Signup Verification OTP                       │
│  Body: Your OTP is 123456                               │
└─────────────────────────────────────────────────────────┘
```

## Two Different Emails:

1. **EMAIL_USER** (Your App's Email):
   - This is YOUR application's email account
   - Used to SEND emails FROM your application
   - Example: `noreply@rally.com` or `support@rally.com`
   - You need the password to authenticate with email servers

2. **User's Email** (Recipient):
   - This is what the USER provides when they sign up
   - Used to SEND emails TO the user
   - Example: `john@example.com` (user provides this)
   - We don't need their password - we just send TO them

## Why We Need EMAIL_PASSWORD:

Email servers (like Gmail, SendGrid) require authentication to prevent spam. 
You can't just send emails without proving you own the sending account.

**Think of it like:**
- EMAIL_USER + EMAIL_PASSWORD = Your mailbox key
- User's email = The address you're sending the letter to
- You need your mailbox key to send letters, but you don't need the recipient's key

## Setup Options:

### Option 1: Use Gmail (Free, for development)
```env
EMAIL_OTP=true
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASSWORD=your-gmail-app-password  # Generate from Google Account settings
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

### Option 2: Use SendGrid (Recommended for production)
```env
EMAIL_OTP=true
EMAIL_USER=apikey
EMAIL_PASSWORD=your-sendgrid-api-key
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
```

### Option 3: Use AWS SES
```env
EMAIL_OTP=true
EMAIL_USER=your-aws-access-key
EMAIL_PASSWORD=your-aws-secret-key
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
```

## Summary:

- **EMAIL_USER + EMAIL_PASSWORD**: Your application's email account (to send FROM)
- **User's email**: Where to send the OTP TO (user provides this)
- **You need both**: Your credentials to authenticate, and the user's email to send to

