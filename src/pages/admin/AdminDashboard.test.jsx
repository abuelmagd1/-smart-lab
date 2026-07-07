import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminDashboard from './AdminDashboard'

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('../../supabase', () => ({
  supabase: { from: mockFrom }
}))

describe('AdminDashboard page', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    mockFrom.mockImplementation((table) => {
      if (table === 'lab_settings') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [{ id: 1, lab_name: 'معمل النور', doctor_name: 'د. سارة', email: 'lab@example.com', is_active: true, activation_code: 'ABC123' }] }),
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }
      if (table === 'profiles') {
        return { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
      }
      if (table === 'logos') {
        return { remove: vi.fn().mockResolvedValue({}) }
      }
      return {}
    })
  })

  it('renders labs and supports toggling', async () => {
    render(<AdminDashboard />)
    expect(await screen.findByText(/المعامل المشتركة/i)).toBeInTheDocument()
    expect(await screen.findByText(/معمل النور/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /إيقاف/i }))
    await waitFor(() => expect(mockFrom).toHaveBeenCalled())
  })
})
