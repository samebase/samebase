import { DocumentData, onSnapshot, Query, QuerySnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'

export function useFirestoreQuery<T = DocumentData>(query: Query<T>) {
  const [data, setData] = useState<(T & { id: string })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query,
      (snapshot: QuerySnapshot<T>) => {
        setData(
          snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })),
        )
        setLoading(false)
      },
      () => {
        setData([])
        setLoading(false)
      },
    )

    return unsubscribe
  }, [query])

  return { data, loading }
}
