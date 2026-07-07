import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Login from './Login'

const mockSignInWithPassword = vi.hoisted(() => vi.fn())

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignInWithPassword
    }
  }
}))

describe('Login page', () => {
  beforeEach(() => {
    mockSignInWithPassword.mockReset()
  })

  it('renders the login form controls', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: /مرحباً بك يا دكتور/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/البريد الإلكتروني/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/كلمة المرور/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /تسجيل الدخول/i })).toBeInTheDocument()
  })

  it('submits credentials and shows an error on auth failure', async () => {
    const user = userEvent.setup()
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'invalid credentials', status: 401 } })

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText(/البريد الإلكتروني/i), 'doctor@example.com')
    await user.type(screen.getByLabelText(/كلمة المرور/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /تسجيل الدخول/i }))

    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'doctor@example.com', password: 'secret123' })
    expect(await screen.findByText(/خطأ: invalid credentials/i)).toBeInTheDocument()
  })
})
