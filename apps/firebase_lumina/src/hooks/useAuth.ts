import { useState, useEffect } from 'react'
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GithubAuthProvider,
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { auth, githubProvider, db } from '../lib/firebase'

interface UserData {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  githubUsername: string | null
  githubAccessToken: string | null
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null)
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      setUser(user)

      if (user) {
        // Fetch additional user data from Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        if (userDoc.exists()) {
          setUserData(userDoc.data() as UserData)
        } else {
          // Create basic user data if not in Firestore yet
          const basicUserData: UserData = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            githubUsername: user.providerData[0]?.uid || null,
            githubAccessToken: null,
          }
          setUserData(basicUserData)
        }
      } else {
        setUserData(null)
      }

      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const signInWithGitHub = async () => {
    try {
      const result = await signInWithPopup(auth, githubProvider)

      // Get the GitHub access token using the proper method
      const credential = GithubAuthProvider.credentialFromResult(result)
      const accessToken = credential?.accessToken

      // Debug logging
      console.log('GitHub Auth Result:', {
        credential: credential,
        accessToken: accessToken,
        user: result.user.providerData[0],
      })

      // Get GitHub username from the user profile
      const githubUsername = result.user.providerData[0]?.uid || null

      // Store user data in Firestore including the GitHub access token
      const userData: UserData = {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
        photoURL: result.user.photoURL,
        githubUsername,
        githubAccessToken: accessToken || null,
      }

      // Store user data in Firestore including the GitHub access token
      await setDoc(doc(db, 'users', result.user.uid), userData, { merge: true })
      setUserData(userData)

      return result
    } catch (error) {
      console.error('Error signing in with GitHub:', error)
      throw error
    }
  }

  const signOutUser = async () => {
    try {
      await signOut(auth)
      setUserData(null)
    } catch (error) {
      console.error('Error signing out:', error)
      throw error
    }
  }

  return {
    user,
    userData,
    loading,
    signInWithGitHub,
    signOut: signOutUser,
  }
}
