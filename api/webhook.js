// api/webhook.js
const crypto = require('crypto');

// ===== CONFIGURATION =====
const META_PIXEL_ID = process.env.META_PIXEL_ID || '1732549614454823';
const META_ACCESS_TOKEN = 'EAAWQKUKP670BSCC6hAlUTwTeqReFyuZCZCMGPWMpzrr73D1Iiqc2Ay4U0FNrPNvSm4JYYCjbmdIEDr0nLzZAQ5NMmigxK4dtmcKVoq8CzEdw2ZAAEFlsK1dOC5jWLqjSQ9d8xiimrTKTeNVhM6ASFDamHM3RxKPvE4BgfMan2StSQTjQi84WKkr6HSk1Kh7dcQZDZD';
const WEBFLOW_SECRET = '';
const EVENT_NAME = process.env.EVENT_NAME || 'Lead';
// =========================

function hashData(value) {
  if (!value) return null;
  const cleanValue = value.toString().toLowerCase().trim();
  return crypto.createHash('sha256').update(cleanValue).digest('hex');
}

function extractFormData(payload) {
  const data = payload.data || payload;
  console.log('🔍 Looking for fields in:', Object.keys(data));
  
  return {
    email: data['email-2'] || data.Email || data.email || '',
    firstName: data['name-2'] || data.Name || data.name || '',
    message: data['field-9'] || data.Message || data.message || '',
    phone: data['phone-2'] || data.Phone || data.phone || '',
    formId: data._form || payload.formId || '',
    url: data.url || payload.url || '',
  };
}

function verifyWebflowSignature(reqBody, signature, secret) {
  if (!signature || !secret) return true;
  const computed = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(reqBody))
    .digest('base64');
  return signature === computed;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const payload = req.body;
    console.log('📩 Webhook received from Webflow');
    
    // 🔥 NEW: Log the raw payload to see what Webflow is sending
    console.log('📦 RAW Webflow Payload:', JSON.stringify(payload, null, 2));

    const signature = req.headers['x-webflow-signature'];
    if (WEBFLOW_SECRET && !verifyWebflowSignature(payload, signature, WEBFLOW_SECRET)) {
      console.error('❌ Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Extract form data
    const formData = extractFormData(payload);
    console.log('📋 Form Data:', {
      email: formData.email ? '✅ Received' : '❌ Missing',
      firstName: formData.firstName ? '✅ Received' : '❌ Missing',
      message: formData.message ? '✅ Received' : '❌ Missing',
      phone: formData.phone ? '✅ Received' : '❌ Missing',
    });
    console.log('📝 Actual Data:', {
      email: formData.email || '(empty)',
      firstName: formData.firstName || '(empty)',
      message: formData.message ? formData.message.substring(0, 50) + '...' : '(empty)',
    });

    // Hash PII data
    const hashedEmail = hashData(formData.email);
    const hashedPhone = hashData(formData.phone);
    const hashedFirstName = hashData(formData.firstName);

    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    // Build Meta CAPI payload
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
          client_ip_address: clientIP,
          client_user_agent: userAgent,
        },
        custom_data: {
          message: formData.message,
          form_id: formData.formId,
          site_url: 'https://www.webbugs.com',
        },
        event_id: `${formData.formId || 'form'}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      }]
    };

    console.log('📤 Sending to Meta Conversions API...');

    const metaResponse = await fetch(
      `https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metaPayload),
      }
    );

    const metaResult = await metaResponse.json();

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