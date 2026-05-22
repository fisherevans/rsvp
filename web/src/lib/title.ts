import { useEffect } from 'react'

// useDocumentTitle sets document.title for the duration the calling
// component is mounted, then restores the previous title on unmount. Lets
// each page own its own tab label without races between pages.
export function useDocumentTitle(title: string): void {
    useEffect(() => {
        const prev = document.title
        document.title = title
        return () => {
            document.title = prev
        }
    }, [title])
}
