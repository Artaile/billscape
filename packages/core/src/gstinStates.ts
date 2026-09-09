// Maps GSTIN's 2-digit numeric state code (first 2 chars of any GSTIN) to the
// 2-letter alpha state code used elsewhere in this app (organizations.state_code,
// customers.state_code, the state <select> on Onboarding/Settings).
const GSTIN_NUMERIC_TO_ALPHA: Record<string, string> = {
  '01': 'JK', '02': 'HP', '03': 'PB', '04': 'CH', '05': 'UT',
  '06': 'HR', '07': 'DL', '08': 'RJ', '09': 'UP', '10': 'BR',
  '11': 'SK', '12': 'AR', '13': 'NL', '14': 'MN', '15': 'MZ',
  '16': 'TR', '17': 'ML', '18': 'AS', '19': 'WB', '20': 'JH',
  '21': 'OR', '22': 'CG', '23': 'MP', '24': 'GJ', '26': 'DN',
  '27': 'MH', '28': 'AP', '29': 'KA', '30': 'GA', '31': 'LD',
  '32': 'KL', '33': 'TN', '34': 'PY', '35': 'AN', '36': 'TS',
  '37': 'AP', '38': 'LA',
}

// Given a GSTIN, returns the 2-letter alpha state code (e.g. "TN") for comparison
// against organizations.state_code / customers.state_code, or undefined if the
// GSTIN's numeric prefix isn't recognized.
export function stateCodeFromGSTIN(gstin: string | null | undefined): string | undefined {
  if (!gstin || gstin.length < 2) return undefined
  return GSTIN_NUMERIC_TO_ALPHA[gstin.slice(0, 2)]
}

export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: 'AN', name: 'Andaman & Nicobar Islands' },
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'AR', name: 'Arunachal Pradesh' },
  { code: 'AS', name: 'Assam' },
  { code: 'BR', name: 'Bihar' },
  { code: 'CH', name: 'Chandigarh' },
  { code: 'CG', name: 'Chhattisgarh' },
  { code: 'DN', name: 'Dadra & Nagar Haveli and Daman & Diu' },
  { code: 'DL', name: 'Delhi' },
  { code: 'GA', name: 'Goa' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'HR', name: 'Haryana' },
  { code: 'HP', name: 'Himachal Pradesh' },
  { code: 'JK', name: 'Jammu & Kashmir' },
  { code: 'JH', name: 'Jharkhand' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'KL', name: 'Kerala' },
  { code: 'LA', name: 'Ladakh' },
  { code: 'LD', name: 'Lakshadweep' },
  { code: 'MP', name: 'Madhya Pradesh' },
  { code: 'MH', name: 'Maharashtra' },
  { code: 'MN', name: 'Manipur' },
  { code: 'ML', name: 'Meghalaya' },
  { code: 'MZ', name: 'Mizoram' },
  { code: 'NL', name: 'Nagaland' },
  { code: 'OR', name: 'Odisha' },
  { code: 'PY', name: 'Puducherry' },
  { code: 'PB', name: 'Punjab' },
  { code: 'RJ', name: 'Rajasthan' },
  { code: 'SK', name: 'Sikkim' },
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'TS', name: 'Telangana' },
  { code: 'TR', name: 'Tripura' },
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'UT', name: 'Uttarakhand' },
  { code: 'WB', name: 'West Bengal' },
]

export function getStateName(codeOrName: string | null | undefined): string {
  if (!codeOrName) return ''
  const found = INDIAN_STATES.find((s) => s.code === codeOrName || s.name === codeOrName)
  return found ? found.name : codeOrName
}

