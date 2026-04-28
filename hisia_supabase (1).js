// ============================================================
// HISIA — Supabase Frontend Integration
// supabase.js  →  import or <script> this before hisia-3.html logic
// ============================================================
// Replace the two constants below with your project values:
//   Supabase Dashboard → Settings → API
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL  = 'lxjbmdiytlqmhfjucopn'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4amJtZGl5dGxxbWhmanVjb3BuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODIxNTUsImV4cCI6MjA5Mjg1ODE1NX0.g9dDU0gUc2ts16ZyX1iS3M7XDh3oBRxiLdVOtkN5NyM'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)


// ============================================================
// AUTH — Sign Up + Profile Creation
// ============================================================

/**
 * Called after the onboarding form is validated (replacing saveState() call).
 * Creates a Supabase auth user and inserts the profile row.
 *
 * @param {string} email
 * @param {string} password
 * @param {object} profileData  — the `profile` object built in startApp()
 * @returns {{ user, error }}
 */
export async function signUpAndCreateProfile(email, password, profileData) {
  // 1. Create the auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  })
  if (authError) return { user: null, error: authError }

  const userId = authData.user.id

  // 2. Build the profile row — maps directly to the profiles table
  const row = {
    id:               userId,
    name:             profileData.name,
    age:              profileData.age,
    county:           profileData.county,
    cycle_type:       profileData.cycleType,
    last_period_date: profileData.lastPeriodDate,
  }

  if (profileData.cycleType === 'regular') {
    row.cycle_length  = profileData.cycleLength
    row.period_length = profileData.periodLength
  } else {
    row.min_cycle     = profileData.minCycle
    row.max_cycle     = profileData.maxCycle
    row.cycle_length  = profileData.cycleLength   // avg computed in frontend
    row.period_length = profileData.periodLength
  }

  const { error: profileError } = await supabase.from('profiles').insert(row)
  if (profileError) return { user: null, error: profileError }

  return { user: authData.user, error: null }
}

/**
 * Sign in existing user.
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { session: data?.session, error }
}

/**
 * Sign out.
 */
export async function signOut() {
  await supabase.auth.signOut()
}

/**
 * Load the current user's profile (replaces loadState() for profile).
 * Returns null if not signed in.
 */
export async function loadProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) { console.error('loadProfile error', error); return null }

  // Re-map snake_case DB fields → camelCase frontend profile object
  return {
    name:           data.name,
    age:            data.age,
    county:         data.county,
    cycleType:      data.cycle_type,
    cycleLength:    data.cycle_length,
    periodLength:   data.period_length,
    minCycle:       data.min_cycle,
    maxCycle:       data.max_cycle,
    lastPeriodDate: data.last_period_date,
  }
}

/**
 * Update profile (e.g. after user edits cycle info).
 */
export async function updateProfile(profileData) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: { message: 'Not signed in' } }

  const { error } = await supabase
    .from('profiles')
    .update({
      name:             profileData.name,
      age:              profileData.age,
      county:           profileData.county,
      cycle_type:       profileData.cycleType,
      cycle_length:     profileData.cycleLength,
      period_length:    profileData.periodLength,
      min_cycle:        profileData.minCycle  ?? null,
      max_cycle:        profileData.maxCycle  ?? null,
      last_period_date: profileData.lastPeriodDate,
    })
    .eq('id', user.id)

  return { error }
}


// ============================================================
// CYCLE LOGS — Daily Symptom Tracker
// ============================================================

/**
 * Save (or update) today's symptom log.
 * Maps the frontend `todaySymptoms` array to boolean columns.
 *
 * Usage inside saveSymptoms():
 *   await saveCycleLog(todaySymptoms)
 *
 * @param {string[]} symptomsArray  e.g. ['cramps','fatigue','cravings']
 * @param {string}   [notes]        optional free-text note
 * @param {string}   [dateStr]      YYYY-MM-DD — defaults to today
 */
export async function saveCycleLog(symptomsArray, notes = '', dateStr = null) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: { message: 'Not signed in' } }

  const logDate = dateStr ?? new Date().toISOString().split('T')[0]

  const row = {
    user_id:      user.id,
    log_date:     logDate,
    cramps:       symptomsArray.includes('cramps'),
    headache:     symptomsArray.includes('headache'),
    fatigue:      symptomsArray.includes('fatigue'),
    bloating:     symptomsArray.includes('bloating'),
    moody:        symptomsArray.includes('moody'),
    cravings:     symptomsArray.includes('cravings'),
    discharge:    symptomsArray.includes('discharge'),
    back_pain:    symptomsArray.includes('backpain'),
    feeling_good: symptomsArray.includes('good'),
    notes:        notes || null,
  }

  // upsert: insert if new date, update if already logged today
  const { error } = await supabase
    .from('cycle_logs')
    .upsert(row, { onConflict: 'user_id,log_date' })

  return { error }
}

/**
 * Fetch all cycle logs for the current user.
 * Use to rebuild the "Days Logged" insight counter.
 */
export async function fetchCycleLogs() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { logs: [], error: null }

  const { data, error } = await supabase
    .from('cycle_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('log_date', { ascending: false })

  return { logs: data ?? [], error }
}

/**
 * Fetch today's log to restore symptom chips on app load.
 */
export async function fetchTodayLog() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const today = new Date().toISOString().split('T')[0]

  const { data } = await supabase
    .from('cycle_logs')
    .select('*')
    .eq('user_id', user.id)
    .eq('log_date', today)
    .single()

  if (!data) return []

  // Rebuild the symptomsArray from booleans
  const symptoms = []
  if (data.cramps)       symptoms.push('cramps')
  if (data.headache)     symptoms.push('headache')
  if (data.fatigue)      symptoms.push('fatigue')
  if (data.bloating)     symptoms.push('bloating')
  if (data.moody)        symptoms.push('moody')
  if (data.cravings)     symptoms.push('cravings')
  if (data.discharge)    symptoms.push('discharge')
  if (data.back_pain)    symptoms.push('backpain')
  if (data.feeling_good) symptoms.push('good')
  return symptoms
}


// ============================================================
// RECORDS — Missed Work / School Days
// ============================================================

/**
 * Save a missed-day record.
 * Maps directly to the log form in the Records screen.
 *
 * Usage inside addLogEntry():
 *   await saveRecord({ date, type, severity, notes })
 *
 * @param {{ date: string, type: string, severity: string, notes?: string }} entry
 */
export async function saveRecord(entry) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: { message: 'Not signed in' } }

  const { error } = await supabase.from('records').insert({
    user_id:  user.id,
    log_date: entry.date,
    miss_type: entry.type,      // 'work' | 'school' | 'both'
    severity: entry.severity,   // 'mild' | 'moderate' | 'severe'
    notes:    entry.notes || null,
  })

  return { error }
}

/**
 * Fetch all records for the current user (for the stats counters).
 * Returns array sorted newest-first.
 */
export async function fetchRecords() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { records: [], error: null }

  const { data, error } = await supabase
    .from('records')
    .select('*')
    .eq('user_id', user.id)
    .order('log_date', { ascending: false })

  return { records: data ?? [], error }
}

/**
 * Compute record statistics matching the frontend stat boxes.
 * Pass the result of fetchRecords().records.
 *
 * @param {object[]} records
 * @returns {{ total, workDays, schoolDays }}
 */
export function computeRecordStats(records) {
  const total      = records.length
  const workDays   = records.filter(r => r.miss_type === 'work'   || r.miss_type === 'both').length
  const schoolDays = records.filter(r => r.miss_type === 'school' || r.miss_type === 'both').length
  return { total, workDays, schoolDays }
}

/**
 * Delete a record entry.
 */
export async function deleteRecord(recordId) {
  const { error } = await supabase
    .from('records')
    .delete()
    .eq('id', recordId)
  return { error }
}


// ============================================================
// SHOP — Products + Orders
// ============================================================

/**
 * Fetch all active products for the shop screen.
 * Replaces the hardcoded `products` array in the frontend.
 */
export async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('in_stock', true)
    .order('category')

  // Re-map to match the frontend products array shape
  const mapped = (data ?? []).map(p => ({
    id:       p.id,           // uuid (use instead of numeric id)
    name:     p.name,
    brand:    p.brand,
    price:    p.price_kes,    // frontend uses `price`
    emoji:    p.emoji,
    category: p.category,
  }))

  return { products: mapped, error }
}

/**
 * Place a mock order.
 * Stores the order + line items in DB even while checkout is mock.
 *
 * Usage inside placeOrder():
 *   await placeMockOrder(cart, selectedDeliveryCost)
 *
 * @param {object[]} cart               — array of { id, name, price, qty?, ... }
 * @param {number}   deliveryCost       — 0 or 200
 * @param {string}   deliveryType       — 'same_day' | 'scheduled'
 */
export async function placeMockOrder(cart, deliveryCost, deliveryType) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { order: null, error: { message: 'Not signed in' } }

  const subtotal = cart.reduce((sum, item) => sum + item.price * (item.qty ?? 1), 0)
  const total    = subtotal + deliveryCost

  // 1. Insert order header
  const { data: orderData, error: orderErr } = await supabase
    .from('orders')
    .insert({
      user_id:       user.id,
      delivery_type: deliveryType,
      delivery_cost: deliveryCost,
      subtotal,
      total,
      status:        'mock',
    })
    .select()
    .single()

  if (orderErr) return { order: null, error: orderErr }

  // 2. Insert order items
  const items = cart.map(item => ({
    order_id:   orderData.id,
    product_id: item.id,          // must be UUID from products table
    quantity:   item.qty ?? 1,
    unit_price: item.price,
    line_total: item.price * (item.qty ?? 1),
  }))

  const { error: itemsErr } = await supabase.from('order_items').insert(items)
  if (itemsErr) return { order: orderData, error: itemsErr }

  return { order: orderData, error: null }
}


// ============================================================
// CLINICS — Directory + Bookings
// ============================================================

/**
 * Fetch all active clinics (publicly readable).
 * Replaces the hardcoded `clinics` array in the frontend.
 *
 * @param {string} [county]  optional filter by county
 */
export async function fetchClinics(county = null) {
  let query = supabase
    .from('clinics')
    .select('*')
    .eq('is_active', true)
    .order('rating', { ascending: false })

  if (county) query = query.eq('county', county)

  const { data, error } = await query

  // Re-map to match the frontend clinics array shape
  const mapped = (data ?? []).map(c => ({
    id:         c.id,
    name:       c.name,
    area:       c.area,
    avatar:     c.avatar,
    color:      c.color_class,
    cost:       c.cost_range,
    rating:     c.rating?.toString(),
    // Tags for filter chips
    tags: [
      c.accepts_nhif   && 'nhif',
      c.has_female_dr  && 'female',
      c.treats_endo    && 'endo',
      c.treats_pcos    && 'pcos',
      c.is_affordable  && 'affordable',
    ].filter(Boolean),
    tagLabels: [
      c.accepts_nhif   && 'NHIF ✓',
      c.has_female_dr  && 'Female Drs',
      c.treats_endo    && 'Endo Clinic',
      c.treats_pcos    && 'PCOS Clinic',
      c.is_affordable  && 'Affordable',
    ].filter(Boolean),
  }))

  return { clinics: mapped, error }
}

/**
 * Save a mock booking (user's interest in a clinic).
 * Called when user taps "Book Now" — stores intent even while mock.
 *
 * @param {string} clinicId     — UUID from clinics table
 * @param {string} [clinicName] — for logging / notifications
 */
export async function saveMockBooking(clinicId, clinicName = '') {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { booking: null, error: { message: 'Not signed in' } }

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      user_id:   user.id,
      clinic_id: clinicId,
      status:    'mock',
      notes:     clinicName ? `Interest in: ${clinicName}` : null,
    })
    .select()
    .single()

  return { booking: data, error }
}


// ============================================================
// NOTIFICATIONS — Waitlist / Notify Me
// ============================================================

/**
 * Save a phone number from the "Notify Me" modal.
 * Works whether the user is signed in or not.
 *
 * Usage inside submitNotifyMe():
 *   await saveNotification(phone, context, type)
 *
 * @param {string} phone       — phone number entered by user
 * @param {string} context     — e.g. clinic name or product name
 * @param {string} notifyType  — 'booking' | 'shop' | 'general'
 */
export async function saveNotification(phone, context = '', notifyType = 'general') {
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('notifications').insert({
    user_id:     user?.id ?? null,   // null if anon
    phone,
    context:     context || null,
    notify_type: notifyType,
  })

  return { error }
}


// ============================================================
// UTILITY HELPERS
// ============================================================

/**
 * Get the currently signed-in user (or null).
 */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * Listen for auth state changes.
 * Call this once on app init to handle sign-in / sign-out.
 *
 * Usage:
 *   onAuthChange(async (user) => {
 *     if (user) {
 *       profile = await loadProfile()
 *       launchApp()
 *     } else {
 *       showOnboarding()
 *     }
 *   })
 */
export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null)
  })
}
