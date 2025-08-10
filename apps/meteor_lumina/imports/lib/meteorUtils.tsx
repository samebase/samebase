import { useState, useCallback } from 'react'
import { Meteor } from 'meteor/meteor'

// Meteor method wrapper that returns loading state
export function useMeteorMethod<T extends any[], R>(methodName: string) {
  const [state, setState] = useState<'idle' | 'loading'>('idle')

  const wrappedMethod = useCallback(
    async (...args: T): Promise<R> => {
      setState('loading')
      try {
        const result = await Meteor.callAsync(methodName, ...args)
        setState('idle')
        return result
      } catch (error) {
        setState('idle')
        throw error
      }
    },
    [methodName],
  )

  return [wrappedMethod, state] as const
}
