import { AuthProvider } from '@/contexts/AuthContext'
import { BranchProvider } from '@/contexts/BranchContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { NavigationGuardProvider } from '@/contexts/NavigationGuardContext'
import { AppRouter } from '@/router'
import { Toaster } from '@/components/ui/toaster'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BranchProvider>
          <NavigationGuardProvider>
            <AppRouter />
            <Toaster />
          </NavigationGuardProvider>
        </BranchProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

