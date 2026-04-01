const twilio = require('twilio');

/**
 * Initialize Twilio client
 */
const getTwilioClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return null;
  }

  // Validate accountSid format (must start with AC)
  if (!accountSid.startsWith('AC')) {
    return null;
  }
  
  try {
    const client = twilio(accountSid, authToken);
    return client;
  } catch (error) {
    return null;
  }
};

/**
 * Generate a random 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Create or get WhatsApp OTP template
 * @param {Object} client - Twilio client
 * @returns {Promise<string>} Content SID
 */
const createOrGetOTPTemplate = async (client) => {
  try {
    const appName = process.env.APP_NAME || 'Rally';
    
    // Check if template already exists by trying to list content
    try {
      const contents = await client.content.v1.contents.list({ limit: 20 });
      
      // Look for existing OTP template
      const existingTemplate = contents.find(
        content => content.friendlyName === 'OTP Verification Template' || 
                   content.friendlyName?.toLowerCase().includes('otp') ||
                   content.friendlyName === 'Rally OTP'
      );
      
      if (existingTemplate) {
        return existingTemplate.sid;
      }
    } catch (listError) {
      // Continue to create new template
    }

    // Create new WhatsApp template
    const content = await client.content.v1.contents.create({
      friendlyName: 'OTP Verification Template',
      types: {
        'twilio/text': {
          body: `Your ${appName} verification code is: {{1}}\n\nThis code will expire in {{2}} minutes. Do not share this code with anyone.`
        }
      },
      language: 'en'
    });
    
    return content.sid;
  } catch (error) {
    throw error;
  }
};

/**
 * Normalize mobile number for WhatsApp
 * @param {string} mobileNumber - Mobile number to normalize
 * @returns {string} Normalized mobile number
 */
const normalizeMobileNumberForWhatsApp = (mobileNumber) => {
  let normalized = mobileNumber.replace(/[^\d+]/g, '').trim();
  normalized = normalized.replace(/\s+/g, '').replace(/-/g, '');
  
  if (!normalized.startsWith('+')) {
    // If the number already has enough digits to include a country code, just prefix +
    // We cannot assume a specific country code for bare numbers
    normalized = `+${normalized}`;
  }
  
  const digitsOnly = normalized.replace(/\+/g, '');
  if (digitsOnly.length < 7 || digitsOnly.length > 15) {
    throw new Error(`Invalid phone number format. Number should be 7-15 digits with country code. Got: ${normalized}`);
  }
  
  return normalized;
};

/**
 * Send OTP via WhatsApp using Twilio
 * @param {string} mobileNumber - Recipient mobile number (with country code, e.g., +1234567890)
 * @param {string} otp - The OTP code to send
 * @param {string} context - Optional context: 'signup', 'forgot-password', 'login', etc.
 * @returns {Promise<Object>} Twilio message result
 */
const sendWhatsAppOTP = async (mobileNumber, otp, context = 'general') => {
  const client = getTwilioClient();
  
  if (!client) {
    // In development, return success without sending
    return { success: true, message: 'OTP logged (Twilio not configured)' };
  }

  // Get Twilio WhatsApp number from env, or use default UAE number
  let twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  
  if (!twilioWhatsAppNumber) {
    twilioWhatsAppNumber = 'whatsapp:+97142589790'; // Default UAE WhatsApp number
  } else {
    // Ensure it has whatsapp: prefix
    if (!twilioWhatsAppNumber.startsWith('whatsapp:')) {
      twilioWhatsAppNumber = `whatsapp:${twilioWhatsAppNumber}`;
    }
  }

  const appName = process.env.APP_NAME || 'Rally';

  try {
    // Normalize mobile number
    const normalizedNumber = normalizeMobileNumberForWhatsApp(mobileNumber);
    const whatsappNumber = `whatsapp:${normalizedNumber}`;
    
    // Validate that both From and To use the same channel (whatsapp:)
    if (!twilioWhatsAppNumber.startsWith('whatsapp:')) {
      throw new Error(`Invalid From number format. Must start with "whatsapp:". Got: ${twilioWhatsAppNumber}`);
    }
    
    if (!whatsappNumber.startsWith('whatsapp:')) {
      throw new Error(`Invalid To number format. Must start with "whatsapp:". Got: ${whatsappNumber}`);
    }

    // Get WhatsApp Content SID from env, or create template if not exists
    let contentSid = process.env.WHATSAPP_CONTENT_SID;
    
    // If no template SID provided, try to create or get existing template
    if (!contentSid) {
      try {
        contentSid = await createOrGetOTPTemplate(client);
      } catch (templateError) {
        contentSid = null; // Ensure it's null so we try fallback
      }
    }
    
    let message;
    
    // Use WhatsApp template if ContentSid is available
    if (contentSid) {
      // Try to verify template exists and get its status
      let templateInfo = null;
      try {
        templateInfo = await client.content.v1.contents(contentSid).fetch();
      } catch (verifyError) {
        // Continue with default variables
      }
      
      try {
        // Determine variables based on template info
        let contentVariables = { '1': otp }; // Default: OTP only
        
        if (templateInfo) {
          const templateBody = templateInfo.types?.['whatsapp/authentication']?.body || 
                              templateInfo.types?.['twilio/text']?.body || '';
          
          // Check if template has {{2}} placeholder for expiry
          if (templateBody.includes('{{2}}')) {
            contentVariables = {
              '1': otp,      // OTP code as first variable {{1}}
              '2': '10'      // Expiry time in minutes as second variable {{2}}
            };
          }
        }
        
        message = await client.messages.create({
          from: twilioWhatsAppNumber,
          to: whatsappNumber,
          contentSid: contentSid,
          contentVariables: JSON.stringify(contentVariables),
        });
      } catch (templateError) {
        // Re-throw template errors
        throw templateError;
      }
    } else {
      // Fallback: Try regular message (only works in sandbox or 24-hour window)
      try {
        message = await client.messages.create({
          from: twilioWhatsAppNumber,
          to: whatsappNumber,
          body: `Your ${appName} verification code is: ${otp}\n\nThis code will expire in 10 minutes. Do not share this code with anyone.`,
        });
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
    
    return {
      success: true,
      messageSid: message.sid,
      status: message.status,
    };
  } catch (error) {
    // Re-throw with more context
    const errorMessage = error.code 
      ? `Twilio Error ${error.code}: ${error.message}` 
      : `Failed to send WhatsApp OTP: ${error.message}`;
    throw new Error(errorMessage);
  }
};

/**
 * Send a generic WhatsApp message
 * @param {string} mobileNumber - Recipient mobile number
 * @param {string} messageText - The message to send
 * @returns {Promise<Object>} Twilio message result
 */
const sendWhatsAppMessage = async (mobileNumber, messageText) => {
  const client = getTwilioClient();
  
  if (!client) {
    console.log('📱 Twilio not configured. WhatsApp message:', messageText);
    return { success: true, message: 'Logged (Twilio not configured)' };
  }

  let twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  if (!twilioWhatsAppNumber) {
    twilioWhatsAppNumber = 'whatsapp:+97142589790';
  } else if (!twilioWhatsAppNumber.startsWith('whatsapp:')) {
    twilioWhatsAppNumber = `whatsapp:${twilioWhatsAppNumber}`;
  }

  try {
    const normalizedNumber = normalizeMobileNumberForWhatsApp(mobileNumber);
    const whatsappNumber = `whatsapp:${normalizedNumber}`;
    
    const message = await client.messages.create({
      from: twilioWhatsAppNumber,
      to: whatsappNumber,
      body: messageText,
    });
    
    return {
      success: true,
      messageSid: message.sid,
      status: message.status,
    };
  } catch (error) {
    console.error('Error sending WhatsApp message:', error.message);
    throw error;
  }
};

/**
 * Verify if a phone number is valid for WhatsApp
 */
const isValidWhatsAppNumber = (mobileNumber) => {
  if (!mobileNumber) return false;
  
  // Remove all non-digit characters except +
  const cleaned = mobileNumber.replace(/[^\d+]/g, '');
  
  // Should have country code and be 10-15 digits
  if (cleaned.startsWith('+')) {
    const digitsOnly = cleaned.replace(/\+/g, '');
    return digitsOnly.length >= 10 && digitsOnly.length <= 15;
  }
  
  // Without +, should be 10-15 digits
  return cleaned.length >= 10 && cleaned.length <= 15;
};

module.exports = {
  sendWhatsAppOTP,
  sendWhatsAppMessage,
  generateOTP,
  isValidWhatsAppNumber,
  getTwilioClient,
  createOrGetOTPTemplate,
  normalizeMobileNumberForWhatsApp,
};
