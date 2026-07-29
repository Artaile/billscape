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
