import { render, screen } from '@testing-library/react'
import BarcodeLabel from './BarcodeLabel'

describe('BarcodeLabel component', () => {
  it('renders the barcode modal for a patient', () => {
    render(<BarcodeLabel patient={{ name: 'أحمد', age: 33, gender: 'ذكر' }} onClose={() => {}} />)
    expect(screen.getByText(/باركود العينة/i)).toBeInTheDocument()
    expect(screen.getByText(/أحمد/i)).toBeInTheDocument()
  })
})
