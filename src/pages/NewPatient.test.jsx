import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewPatient from './NewPatient'

const mockSelect = vi.hoisted(() => vi.fn())
const mockInsert = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('../supabase', () => ({
  supabase: {
    from: mockFrom,
  },
}))

describe('NewPatient page', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    mockSelect.mockReset()
    mockInsert.mockReset()
    mockFrom.mockImplementation((table) => {
      if (table === 'test_catalog') {
        return { select: mockSelect.mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'CBC', category: 'Blood', unit: 'mg/dL', normal_range: '4-10' }] }) }
      }
      if (table === 'patients') {
        return {
          insert: mockInsert.mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 42 }, error: null }),
        }
      }
      if (table === 'tests') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return {}
    })
  })

  it('renders the form and saves a new patient', async () => {
    const user = userEvent.setup()
    render(<NewPatient />)

    expect(await screen.findByText(/تسجيل مريض جديد/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/الاسم بالكامل/i), 'أحمد محمد')
    await user.type(screen.getByLabelText(/رقم الهاتف/i), '01000000000')
    await user.type(screen.getByLabelText(/السن/i), '33')
    await user.selectOptions(screen.getByLabelText(/النوع/i), 'ذكر')
    await user.type(screen.getByLabelText(/اسم الدكتور/i), 'د. سارة')
    await user.click(screen.getByText(/CBC/i))
    await user.click(screen.getByRole('button', { name: /حفظ/i }))

    await waitFor(() => expect(mockInsert).toHaveBeenCalled())
    expect(screen.getByText(/تم حفظ بيانات المريض بنجاح/i)).toBeInTheDocument()
  })
})
