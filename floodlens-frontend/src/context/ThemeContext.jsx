import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext({
  theme: 'light',
  isDark: false,
  toggleTheme: () => {},
  setTheme: () => {},
})

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    // 1. One-time reset to ensure pure white Light Mode is active across previously cached sessions
    if (typeof window !== 'undefined' && !localStorage.getItem('floodlens_theme_white_v1')) {
      localStorage.setItem('floodlens_theme_white_v1', 'true')
      localStorage.setItem('floodlens_theme', 'light')
      return 'light'
    }

    // 2. Saved user preference
    const saved = typeof window !== 'undefined' ? localStorage.getItem('floodlens_theme') : null
    if (saved === 'dark' || saved === 'light') return saved

    // 3. Clean light default (pure white #FFFFFF)
    return 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('floodlens_theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  const setTheme = (newTheme) => {
    if (newTheme === 'dark' || newTheme === 'light') {
      setThemeState(newTheme)
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === 'dark', toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
