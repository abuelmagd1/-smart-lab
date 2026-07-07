import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Reports from './Reports'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: mockGetUser },
    from: mockFrom,
  },
}))

describe('Reports page', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    mockFrom.mockReset()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockImplementation((table) => {
      if (table === 'patients') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'أحمد', age: 33, gender: 'ذكر', doctor: 'د. سارة', created_at: '2026-01-01', tests: [{ name: 'CBC', value: '5', status: 'معتمد', unit: 'mg/dL', normal_range: '4-10' }] }] }),
        }
      }
      if (table === 'lab_settings') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { doctor_name: 'د. سارة' } }),
          update: vi.fn().mockReturnThis(),
        }
      }
      return {}
    })
  })

  it('renders the reports page and patient preview', async () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    )

    expect(await screen.findByText(/التقارير/i)).toBeInTheDocument()
    expect(await screen.findByText(/أحمد/i)).toBeInTheDocument()
  })
})
