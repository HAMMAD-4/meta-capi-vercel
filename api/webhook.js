// api/webhook.js
const crypto = require('crypto');

// ===== ⚠️ IMPORTANT: REPLACE THESE WITH YOUR VALUES =====
// Get these from Meta Events Manager

const META_PIXEL_ID = process.env.META_PIXEL_ID || '1732549614454823';
const META_ACCESS_TOKEN = 'EAAWQKUKP670BSCC6hAlUTwTeqReFyuZCZCMGPWMpzrr73D1Iiqc2Ay4U0FNrPNvSm4JYYCjbmdIEDr0nLzZAQ5NMmigxK4dtmcKVoq8CzEdw2ZAAEFlsK1dOC5jWLqjSQ9d8xiimrTKTeNVhM6ASFDamHM3RxKPvE4BgfMan2StSQTjQi84WKkr6HSk1Kh7dcQZDZD';
// At the top of webhook.js, replace the hardcoded values with:



// Which event type do you want to track?
// Options: 'Lead', 'Contact', 'CompleteRegistration', 'Subscribe'
const EVENT_NAME = process.env.EVENT_NAME || 'Lead';

// Optional: Add a secret in Webflow webhook settings for verification
const WEBFLOW_SECRET = process.env.WEBFLOW_SECRET || '';
// ============================================================

/**
 * Hashes a string using SHA-256 (required by Meta Conversions API)
 */
function hashData(value) {
  if (!value) return null;
  // Meta requires: lowercase, trimmed, then SHA-256 hashed
  const cleanValue = value.toString().toLowerCase().trim();
  return crypto.createHash('sha256').update(cleanValue).digest('hex');
}

/**
 * Verifies Webflow webhook signature (optional but recommended)
 */
function verifyWebflowSignature(reqBody, signature, secret) {
  if (!signature || !secret) return true;
  const computed = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(reqBody))
    .digest('base64');
  return signature === computed;
}

/**
 * Extracts form data from Webflow payload
 * ADJUST THESE FIELD NAMES TO MATCH YOUR WEBFLOW FORM
 */
function extractFormData(payload) {
  const data = payload.data || payload;
  
  return {
    // Field names from your Webflow form
    email: data['email-2'] || data.Email || data.email || '',
    firstName: data['name-2'] || data.Name || data.name || '',
    message: data['field-9'] || data.Message || data.message || '',
    
    // Phone - you may not have this field, but keeping it for compatibility
    phone: data['phone-2'] || data.Phone || data.phone || '',
    
    // Additional useful data
    formId: data._form || payload.formId || '',
    url: data.url || payload.url || '',
  };
}

/**
 * Main webhook handler - This is what Vercel will call
 */
module.exports = async function handler(req, res) {
  // ✅ Only allow POST requests (webhooks use POST)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    // 1. Parse the incoming request
    const payload = req.body;
    console.log('📩 Webhook received from Webflow');

    // 2. (Optional) Verify webhook signature
    const signature = req.headers['x-webflow-signature'];
    if (WEBFLOW_SECRET && !verifyWebflowSignature(payload, signature, WEBFLOW_SECRET)) {
      console.error('❌ Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // 3. Extract form data from Webflow payload
    const formData = extractFormData(payload);
    console.log('📋 Form Data:', {
      email: formData.email ? '✅ Received' : '❌ Missing',
      phone: formData.phone ? '✅ Received' : '❌ Missing',
      name: formData.firstName ? '✅ Received' : '❌ Missing',
    });

    // 4. Hash the PII data (required by Meta)
    const hashedEmail = hashData(formData.email);
    const hashedPhone = hashData(formData.phone);
    const hashedFirstName = hashData(formData.firstName);
    const hashedLastName = hashData(formData.lastName);

    // 5. Get IP and User Agent for better matching
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    // 6. Build the Meta Conversions API payload
    const metaPayload = {
      data: [{
        event_name: EVENT_NAME,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: formData.url || 'https://www.webbugs.com',
        user_data: {
          em: hashedEmail ? [hashedEmail] : [],
          ph: hashedPhone ? [hashedPhone] : [],
          fn: hashedFirstName ? [hashedFirstName] : [],
          ln: hashedLastName ? [hashedLastName] : [],
          client_ip_address: clientIP,
          client_user_agent: userAgent,
        },
        custom_data: {
          message: formData.message,
          form_id: formData.formId,
          site_url: 'https://www.webbugs.com',
        },
        // Unique ID to help Meta deduplicate events
        event_id: `${formData.formId || 'form'}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      }]
    };

    console.log('📤 Sending to Meta Conversions API...');

    // 7. Send to Meta's API
    const metaResponse = await fetch(
      `https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metaPayload),
      }
    );

    const metaResult = await metaResponse.json();

    // 8. Log the result
    if (metaResponse.ok) {
      console.log('✅ Event sent to Meta successfully!');
      console.log('📊 Meta Response:', JSON.stringify(metaResult, null, 2));
      
      return res.status(200).json({
        success: true,
        message: 'Event sent to Meta successfully',
        meta: metaResult,
      });
    } else {
      console.error('❌ Meta API Error:', metaResult);
      
      return res.status(metaResponse.status).json({
        success: false,
        error: 'Meta API error',
        meta: metaResult,
      });
    }

  } catch (error) {
    console.error('❌ Error in webhook handler:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};