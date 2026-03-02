const nodemailer = require('nodemailer');

/**
 * Create email transporter
 */
const createTransporter = () => {
  // Support Email_ID (capital E) and EMAIL_ID (uppercase) with fallback to old variables
  const emailId = process.env.Email_ID || process.env.EMAIL_ID || process.env.EMAIL_USER;
  const serviceKey = process.env.SERVICE_KEY || process.env.EMAIL_PASSWORD;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);

  // Gmail SMTP configuration
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || smtpHost,
    port: smtpPort,
    secure: false,
    auth: {
      user: process.env.Email_ID || process.env.EMAIL_ID || emailId,
      pass: process.env.SERVICE_KEY || serviceKey,
    },
  });
};

/**
 * Send password reset email
 */
const sendPasswordResetEmail = async (email, resetUrl) => {
  // If email is not configured, log the reset URL instead
  const emailId = process.env.Email_ID || process.env.EMAIL_ID || process.env.EMAIL_USER;
  const serviceKey = process.env.SERVICE_KEY || process.env.EMAIL_PASSWORD;
  
  if (!emailId || !serviceKey) {
    console.log('📧 Email not configured. Password reset URL:', resetUrl);
    console.log('⚠️  To enable email, set EMAIL_ID and SERVICE_KEY (or EMAIL_USER and EMAIL_PASSWORD) in .env');
    return;
  }

  try {
    const transporter = createTransporter();

    const emailId = process.env.Email_ID || process.env.EMAIL_ID || process.env.EMAIL_USER;
    const mailOptions = {
      from: `"${process.env.APP_NAME || 'Rally'}" <${emailId}>`,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .button:hover { background-color: #0056b3; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Password Reset Request</h2>
            <p>You requested to reset your password. Click the button below to reset it:</p>
            <a href="${resetUrl}" class="button">Reset Password</a>
            <p>Or copy and paste this link into your browser:</p>
            <p>${resetUrl}</p>
            <p><strong>This link will expire in 10 minutes.</strong></p>
            <p>If you didn't request this, please ignore this email.</p>
            <div class="footer">
              <p>This is an automated message, please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Reset Request
        
        You requested to reset your password. Click the link below to reset it:
        ${resetUrl}
        
        This link will expire in 10 minutes.
        
        If you didn't request this, please ignore this email.
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to ${email}`);
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send password reset email');
  }
};

/**
 * Send OTP via email for password reset
 */
const sendPasswordResetOTP = async (email, otp) => {
  // Check if EMAIL_OTP is enabled
  const emailOTPEnabled = process.env.EMAIL_OTP === 'true' || 
                           process.env.EMAIL_OTP === '1' || 
                           process.env.EMAIL_OTP === 'enabled' ||
                           process.env.EMAIL_OTP === 'yes';

  if (!emailOTPEnabled) {
    console.log('\n⚠️  ========== EMAIL OTP DISABLED (Password Reset) ==========');
    console.log('📧 Email:', email);
    console.log('🔢 OTP Code:', otp);
    console.log('⚠️  EMAIL_OTP is not enabled in .env');
    console.log('💡 Set EMAIL_OTP=true in .env to enable email OTP');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('============================================================\n');
    return;
  }

  // If email is not configured, log the OTP instead
  const emailId = process.env.Email_ID || process.env.EMAIL_ID || process.env.EMAIL_USER;
  const serviceKey = process.env.SERVICE_KEY || process.env.EMAIL_PASSWORD;
  
  if (!emailId || !serviceKey) {
    console.log('\n⚠️  ========== EMAIL NOT CONFIGURED (Password Reset) ==========');
    console.log('📧 Email:', email);
    console.log('🔢 OTP Code:', otp);
    console.log('⚠️  To enable email, set Email_ID (or EMAIL_ID) and SERVICE_KEY in .env');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('==============================================================\n');
    return;
  }

  try {
    const transporter = createTransporter();
    const appName = process.env.APP_NAME || 'Rally';

    console.log('\n📧 ========== SENDING PASSWORD RESET EMAIL OTP ==========');
    const emailId = process.env.Email_ID || process.env.EMAIL_ID || process.env.EMAIL_USER;
    console.log('📮 To:', email);
    console.log('🔢 OTP Code:', otp);
    console.log('📝 Subject: Password Reset OTP');
    console.log('📤 From:', emailId);
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('==========================================================\n');

    const mailOptions = {
      from: `"${appName}" <${emailId}>`,
      to: email,
      subject: 'Password Reset OTP',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .otp-box { background-color: #f4f4f4; padding: 20px; text-align: center; border-radius: 5px; margin: 20px 0; }
            .otp-code { font-size: 32px; font-weight: bold; color: #007bff; letter-spacing: 5px; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Password Reset OTP</h2>
            <p>You requested to reset your password. Use the OTP code below:</p>
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>
            <p><strong>This OTP will expire in 10 minutes.</strong></p>
            <p>If you didn't request this, please ignore this email.</p>
            <div class="footer">
              <p>This is an automated message, please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Reset OTP
        
        You requested to reset your password. Use the OTP code below:
        
        ${otp}
        
        This OTP will expire in 10 minutes.
        
        If you didn't request this, please ignore this email.
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    
    console.log('\n✅ ========== PASSWORD RESET EMAIL OTP SENT SUCCESSFULLY ==========');
    console.log('📮 To:', email);
    console.log('🔢 OTP Code:', otp);
    console.log('📧 Message ID:', result.messageId);
    console.log('⏰ Sent At:', new Date().toISOString());
    console.log('==================================================================\n');
  } catch (error) {
    console.error('\n❌ ========== PASSWORD RESET EMAIL OTP SEND FAILED ==========');
    console.error('📮 To:', email);
    console.error('🔢 OTP Code:', otp);
    console.error('❌ Error:', error.message);
    console.error('⏰ Timestamp:', new Date().toISOString());
    console.error('==============================================================\n');
    throw new Error('Failed to send password reset OTP email');
  }
};

/**
 * Send OTP via email for signup verification
 */
const sendSignupOTP = async (email, otp) => {
  // Check if EMAIL_OTP is enabled
  const emailOTPEnabled = process.env.EMAIL_OTP === 'true' || 
                           process.env.EMAIL_OTP === '1' || 
                           process.env.EMAIL_OTP === 'enabled' ||
                           process.env.EMAIL_OTP === 'yes';

  if (!emailOTPEnabled) {
    console.log('\n⚠️  ========== EMAIL OTP DISABLED ==========');
    console.log('📧 Email:', email);
    console.log('🔢 OTP Code:', otp);
    console.log('⚠️  EMAIL_OTP is not enabled in .env');
    console.log('💡 Set EMAIL_OTP=true in .env to enable email OTP');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('==========================================\n');
    return;
  }

  // If email is not configured, log the OTP instead
  const emailId = process.env.Email_ID || process.env.EMAIL_ID || process.env.EMAIL_USER;
  const serviceKey = process.env.SERVICE_KEY || process.env.EMAIL_PASSWORD;
  
  if (!emailId || !serviceKey) {
    console.log('\n⚠️  ========== EMAIL NOT CONFIGURED ==========');
    console.log('📧 Email:', email);
    console.log('🔢 OTP Code:', otp);
    console.log('⚠️  To enable email, set Email_ID (or EMAIL_ID) and SERVICE_KEY in .env');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('==============================================\n');
    return;
  }

  try {
    const transporter = createTransporter();
    const appName = process.env.APP_NAME || 'Rally';

    const emailId = process.env.Email_ID || process.env.EMAIL_ID || process.env.EMAIL_USER;
    console.log('\n📧 ========== SENDING EMAIL OTP ==========');
    console.log('📮 To:', email);
    console.log('🔢 OTP Code:', otp);
    console.log('📝 Subject: Signup Verification OTP');
    console.log('📤 From:', emailId);
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('==========================================\n');

    const mailOptions = {
      from: `"${appName}" <${emailId}>`,
      to: email,
      subject: 'Signup Verification OTP',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .otp-box { background-color: #f4f4f4; padding: 20px; text-align: center; border-radius: 5px; margin: 20px 0; }
            .otp-code { font-size: 32px; font-weight: bold; color: #007bff; letter-spacing: 5px; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Welcome to ${appName}!</h2>
            <p>Thank you for signing up. Use the OTP code below to verify your account:</p>
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>
            <p><strong>This OTP will expire in 10 minutes.</strong></p>
            <p>If you didn't request this, please ignore this email.</p>
            <div class="footer">
              <p>This is an automated message, please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Welcome to ${appName}!
        
        Thank you for signing up. Use the OTP code below to verify your account:
        
        ${otp}
        
        This OTP will expire in 10 minutes.
        
        If you didn't request this, please ignore this email.
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    
    console.log('\n✅ ========== EMAIL OTP SENT SUCCESSFULLY ==========');
    console.log('📮 To:', email);
    console.log('🔢 OTP Code:', otp);
    console.log('📧 Message ID:', result.messageId);
    console.log('⏰ Sent At:', new Date().toISOString());
    console.log('====================================================\n');
  } catch (error) {
    console.error('\n❌ ========== EMAIL OTP SEND FAILED ==========');
    console.error('📮 To:', email);
    console.error('🔢 OTP Code:', otp);
    console.error('❌ Error:', error.message);
    console.error('==============================================\n');
    throw new Error('Failed to send signup OTP email');
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendPasswordResetOTP,
  sendSignupOTP,
  createTransporter,
};

