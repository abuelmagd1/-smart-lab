import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminNotifications from './AdminNotifications'

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('../../supabase', () => ({
  supabase: { from: mockFrom }
}))

describe('AdminNotifications page', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    mockFrom.mockImplementation((table) => {
      if (table === 'admin_notifications') {
        return {
          delete: vi.fn().mockReturnThis(),
          insert: vi.fn().mockResolvedValue({}),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockResolvedValue({}),
          order: vi.fn().mockResolvedValue({ data: [{ id: 1, title: 'Test', message: 'Hello', created_at: '2026-01-01' }] }),
        }
      }
      if (table === 'lab_settings') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [{ user_id: 'u1', lab_name: 'معمل النور', doctor_name: 'د. سارة' }] }),
        }
      }
      return {}
    })
  })

  it('renders the notification form and allows sending', async () => {
    render(<AdminNotifications />)
    expect(await screen.findByText(/إرسال إشعار/i)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/عنوان الإشعار/i), 'تنبيه')
    await userEvent.type(screen.getByLabelText(/نص الرسالة/i), 'مرحبا')
    await userEvent.click(screen.getByRole('button', { name: /إرسال الإشعار/i }))
    expect(await screen.findByText(/تم إرسال الإشعار بنجاح/i)).toBeInTheDocument()
  })
})
