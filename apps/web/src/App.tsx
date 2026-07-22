import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AppRouter } from '@/router'
import { Toaster } from '@/components/ui/toaster'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRouter />
        <Toaster />
      </AuthProvider>
    </ThemeProvider>
  )
}
