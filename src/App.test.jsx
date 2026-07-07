import { render, screen } from '@testing-library/react'
import App from './App'

const mockGetSession = vi.hoisted(() => vi.fn())
const mockOnAuthStateChange = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange
    },
    from: mockFrom
  }
}))

vi.mock('./pages/Login', () => ({
  default: () => <div>Login page</div>,
}))

describe('App routing', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockOnAuthStateChange.mockReset()
    mockFrom.mockReset()
    mockGetSession.mockResolvedValue({ data: { session: null } })
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  })

  it('renders the login page for an unauthenticated user', async () => {
    render(<App />)

    expect(await screen.findByText(/Login page/i)).toBeInTheDocument()
  })
})
