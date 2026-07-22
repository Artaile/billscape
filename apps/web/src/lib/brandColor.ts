function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

export function applyBrandColor(hex: string) {
  if (!hex || !hex.startsWith('#') || hex.length !== 7) return
  try {
    const hsl = hexToHsl(hex)
    // Inject a <style> tag that overrides :root with higher specificity
    // This beats Tailwind's @layer base :root declaration
    const styleId = 'billscape-brand-color'
    let el = document.getElementById(styleId) as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = styleId
      document.head.appendChild(el)
    }
    el.textContent = `
      :root, .dark, .light {
        --primary: ${hsl} !important;
        --accent: ${hsl} !important;
        --ring: ${hsl} !important;
        --sidebar-accent: ${hsl} !important;
      }
    `
    document.documentElement.style.setProperty('--brand-color', hex)
  } catch {
    // ignore
  }
}
