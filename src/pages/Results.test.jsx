import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Results from './Results'

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('../supabase', () => ({
  supabase: { from: mockFrom }
}))

describe('Results page', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    mockFrom.mockImplementation((table) => {
      if (table === 'patients') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'أحمد', age: 33, doctor: 'د. سارة', created_at: '2026-01-01', tests: [{ id: 10, name: 'CBC', value: '', status: 'تم التجميع' }] }] }),
        }
      }
      if (table === 'tests') {
        return {
          update: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({}),
        }
      }
      return {}
    })
  })

  it('renders patients and allows opening the details panel', async () => {
    render(<Results />)
    expect(await screen.findByRole('heading', { name: /نتائج التحاليل/i })).toBeInTheDocument()
    expect(await screen.findByText(/أحمد/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /عرض تفاصيل أحمد/i }))
    expect(await screen.findByText(/CBC/i)).toBeInTheDocument()
  })
})
