import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || 'حدث خطأ غير متوقع' }
  }

  componentDidCatch(error, info) {
    console.error('حصل خطأ في التطبيق:', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    window.location.href = '/dashboard'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6" dir="rtl" style={{ background: 'var(--surface)' }}>
          <div className="bg-white rounded-2xl p-8 w-full max-w-md text-center" style={{ border: '1px solid var(--outline-variant)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <h1 className="text-lg font-bold mb-2" style={{ color: 'var(--on-surface)' }}>حصل خطأ غير متوقع</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--on-surface-variant)' }}>
              حاجة معينة في الصفحة دي عملت مشكلة. بياناتك محفوظة وآمنة، جرّب تعيد تحميل الصفحة.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={this.handleGoHome}
                className="px-5 py-2.5 rounded-lg text-sm font-medium"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                الرجوع للوحة التحكم
              </button>
              <button onClick={this.handleReload}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--primary-container)' }}>
                🔄 إعادة تحميل الصفحة
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
