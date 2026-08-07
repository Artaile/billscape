import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { NavigationGuardProvider } from '@/contexts/NavigationGuardContext'
import { AppRouter } from '@/router'
import { Toaster } from '@/components/ui/toaster'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NavigationGuardProvider>
          <AppRouter />
          <Toaster />
        </NavigationGuardProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
