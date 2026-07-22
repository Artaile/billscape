// Half-up rounding to 2 decimal places (standard for Indian billing)
export function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function amountInWords(amount: number): string {
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ]
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  if (amount === 0) return 'Zero Rupees Only'

  const rupees = Math.floor(amount)
  const paise = Math.round((amount - rupees) * 100)

  function convertHundreds(n: number): string {
    if (n === 0) return ''
    if (n < 20) return (ones[n] ?? '') + ' '
    if (n < 100) return (tens[Math.floor(n / 10)] ?? '') + ' ' + (ones[n % 10] ?? '') + ' '
    return (ones[Math.floor(n / 100)] ?? '') + ' Hundred ' + convertHundreds(n % 100)
  }

  function convertToWords(n: number): string {
    if (n === 0) return ''
    if (n < 100) return convertHundreds(n)
    if (n < 1000) return convertHundreds(n)
    if (n < 100000) return convertToWords(Math.floor(n / 1000)) + 'Thousand ' + convertHundreds(n % 1000)
    if (n < 10000000) return convertToWords(Math.floor(n / 100000)) + 'Lakh ' + convertToWords(n % 100000)
    return convertToWords(Math.floor(n / 10000000)) + 'Crore ' + convertToWords(n % 10000000)
  }

  let result = convertToWords(rupees).trim() + ' Rupees'
  if (paise > 0) result += ' and ' + convertToWords(paise).trim() + ' Paise'
  return result + ' Only'
}
