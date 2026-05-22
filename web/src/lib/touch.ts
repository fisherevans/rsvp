import { useEffect, useState } from 'react'

// useTouchDevice returns true on devices whose primary input is coarse (touch
// fingers, stylus). Lets components branch between a touch-first UX (which
// hands off to the OS native control) and a richer desktop UX.
//
// The matchMedia listener re-evaluates on input-mode changes - relevant on
// hybrids like a Surface where the user can switch between trackpad and
// touch.
export function useTouchDevice(): boolean {
    const [touch, setTouch] = useState<boolean>(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return false
        return window.matchMedia('(pointer: coarse)').matches
    })

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return
        const mq = window.matchMedia('(pointer: coarse)')
        const handler = (e: MediaQueryListEvent) => setTouch(e.matches)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [])

    return touch
}
