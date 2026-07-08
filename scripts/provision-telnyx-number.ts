/**
 * provision-telnyx-number.ts
 * 
 * Provisions a new Telnyx phone number for an org and assigns it to the
 * shared voice + SMS connections. Saves the number to agents.telnyx_phone_number.
 * 
 * Called automatically by the portal provisioner when creating a new org.
 */

const TELNYX_API_KEY = process.env.TELNYX_API_KEY!
const TELNYX_BASE = 'https://api.telnyx.com/v2'

// Shared connections created in Phase 5 — all new org numbers go here
const SHARED_VOICE_APP_ID = '2996679323039040927'   // "Empower Shared Voice"
const SHARED_SMS_PROFILE_ID = '40019f2d-ab2d-4418-8872-62bde04f05eb'  // "Empower Shared SMS"

interface ProvisionResult {
  phoneNumber: string
  telnyxNumberId: string
}

/**
 * Find an available US number with voice + SMS capabilities
 */
async function findAvailableNumber(): Promise<string> {
  const url = `${TELNYX_BASE}/available_phone_numbers?filter[country_code]=US&filter[features][]=sms&filter[features][]=voice&filter[limit]=5`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TELNYX_API_KEY}` }
  })
  const data = await res.json()
  const numbers = data?.data || []
  if (!numbers.length) throw new Error('No available Telnyx numbers found')
  return numbers[0].phone_number
}

/**
 * Order a phone number
 */
async function orderNumber(phoneNumber: string): Promise<string> {
  const res = await fetch(`${TELNYX_BASE}/number_orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TELNYX_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      phone_numbers: [{ phone_number: phoneNumber }],
      connection_id: SHARED_VOICE_APP_ID
    })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Number order failed: ${JSON.stringify(data)}`)
  
  const orderedNumber = data?.data?.phone_numbers?.[0]
  if (!orderedNumber) throw new Error('No number in order response')
  return orderedNumber.id
}

/**
 * Assign the ordered number to the shared SMS messaging profile
 */
async function assignSmsProfile(telnyxNumberId: string): Promise<void> {
  const res = await fetch(`${TELNYX_BASE}/phone_numbers/${telnyxNumberId}/messaging`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${TELNYX_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_profile_id: SHARED_SMS_PROFILE_ID
    })
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`SMS profile assignment failed: ${JSON.stringify(err)}`)
  }
}

/**
 * Main: provision a number and return the details
 */
export async function provisionTelnyxNumber(): Promise<ProvisionResult> {
  console.log('[telnyx] Finding available number...')
  const phoneNumber = await findAvailableNumber()
  console.log('[telnyx] Ordering:', phoneNumber)

  const telnyxNumberId = await orderNumber(phoneNumber)
  console.log('[telnyx] Ordered, id:', telnyxNumberId)

  // Brief wait for number to become active
  await new Promise(r => setTimeout(r, 2000))

  console.log('[telnyx] Assigning SMS profile...')
  await assignSmsProfile(telnyxNumberId)

  console.log('[telnyx] Done:', phoneNumber)
  return { phoneNumber, telnyxNumberId }
}
