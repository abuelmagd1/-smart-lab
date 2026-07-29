import useCountUp from '../hooks/useCountUp'

// بيعرض أي رقم بحركة count-up ناعمة، مع دعم فواصل الآلاف والعشري والوحدة (زي "جنيه")
// مثال: <AnimatedNumber value={1500} suffix=" جنيه" />
export default function AnimatedNumber({ value, decimals = 0, suffix = '', prefix = '', locale = 'ar-EG' }) {
  const animated = useCountUp(value)
  const formatted = animated.toLocaleString(locale, { maximumFractionDigits: decimals, minimumFractionDigits: decimals })
  return <>{prefix}{formatted}{suffix}</>
}