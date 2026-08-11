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



// function extractFormData(reqBody) {
//   // Log the entire structure to debug
//   console.log('🔍 Full reqBody structure:', JSON.stringify(reqBody, null, 2));
  
//   // Webflow sends data in: reqBody.payload.data
//   const payloadData = reqBody.payload || reqBody.data || reqBody;
//   console.log('🔍 payloadData keys:', Object.keys(payloadData));
  
//   const formData = payloadData.data || payloadData;
//   console.log('🔍 formData keys:', Object.keys(formData));
//   console.log('🔍 Full formData:', JSON.stringify(formData, null, 2));
  
//   return {
//     email: formData['email-2'] || formData.Email || formData.email || '',
//     firstName: formData['name-2'] || formData.Name || formData.name || '',
//     message: formData['field-9'] || formData.Message || formData.message || '',
//     phone: formData['phone-2'] || formData.Phone || formData.phone || '',
//     formId: formData._form || payloadData.formId || '',
//     url: formData.url || payloadData.pageUrl || '',
//   };
// }

function extractFormData(reqBody) {
  const payloadData = reqBody.payload || reqBody.data || reqBody;
  const formData = payloadData.data || payloadData;
  
  console.log('🔍 Form data keys:', Object.keys(formData));
  
  return {
    // Contact Form fields (existing)
    firstName: formData['Name 2'] || formData.Name || formData.name || '',
    email: formData['Email 2'] || formData.Email || formData.email || '',
    message: formData['Tell us about your project'] || formData.Message || formData.message || '',
    
    // Hire Form fields (NEW)
    hireName: formData['Name'] || '',
    hireEmail: formData['Email'] || '',
    techStack: formData['Tech-Stack'] || '',
    duration: formData['Duration'] || '',
    developerCount: formData['Developers-Count'] || '',
    hireProjectDetails: formData['Project-Details'] || '',
    
    // Form identification
    formId: formData._form || payloadData.formId || '',
    url: formData.url || payloadData.pageUrl || '',
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
     
    // ===== EVENT DETECTION - ADD THIS HERE =====
    // Determine which event to send based on form data
    let eventName = EVENT_NAME; // Default: 'Lead'

    // Check if this is the Hire Form (check for Hire Form specific fields)
    if (formData.techStack || formData.duration || formData.developerCount) {
    eventName = 'Hire Developers';
    console.log('🔍 Detected Hire Form - using event: Hire Developers');
    } else if (formData.message || formData['Tell us about your project']) {
    eventName = 'Lead';
    console.log('🔍 Detected Contact Form - using event: Lead');
    } else {
    console.log('🔍 Using default event:', eventName);
    }
    // ===== END EVENT DETECTION =====

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
        // Contact Form data
        message: formData.message || '',
        
        // Hire Form data
        tech_stack: formData.techStack || '',
        duration: formData.duration || '',
        developer_count: formData.developerCount || '',
        project_details: formData.hireProjectDetails || '',
        
        // Common data
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