import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

// Types
export interface Vault {
  id?: string
  userId: string
  repositoryFullName: string
  repositoryId: string
  repositoryName: string
  repositoryOwner: string
  isPrivate: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface User {
  id?: string
  uid: string
  email: string
  displayName: string
  githubUsername: string
  githubAccessToken: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// Collections
const USERS_COLLECTION = 'users'
const VAULTS_COLLECTION = 'vaults'

// User operations
export const createUser = async (userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>) => {
  const now = serverTimestamp()
  const userWithTimestamps = {
    ...userData,
    createdAt: now,
    updatedAt: now,
  }

  const docRef = await addDoc(collection(db, USERS_COLLECTION), userWithTimestamps)
  return docRef.id
}

export const getUserByUid = async (uid: string): Promise<User | null> => {
  const q = query(collection(db, USERS_COLLECTION), where('uid', '==', uid))
  const querySnapshot = await getDocs(q)

  if (querySnapshot.empty) {
    return null
  }

  const doc = querySnapshot.docs[0]
  return { id: doc.id, ...doc.data() } as User
}

export const updateUser = async (userId: string, updates: Partial<User>) => {
  const userRef = doc(db, USERS_COLLECTION, userId)
  await updateDoc(userRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

// Vault operations
export const createVault = async (vaultData: Omit<Vault, 'id' | 'createdAt' | 'updatedAt'>) => {
  const now = serverTimestamp()
  const vaultWithTimestamps = {
    ...vaultData,
    createdAt: now,
    updatedAt: now,
  }

  const docRef = await addDoc(collection(db, VAULTS_COLLECTION), vaultWithTimestamps)
  return docRef.id
}

export const getUserVaults = async (userId: string): Promise<Vault[]> => {
  const q = query(
    collection(db, VAULTS_COLLECTION),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
  )

  const querySnapshot = await getDocs(q)
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Vault[]
}

export const getVaultByRepository = async (
  userId: string,
  repositoryFullName: string,
): Promise<Vault | null> => {
  const q = query(
    collection(db, VAULTS_COLLECTION),
    where('userId', '==', userId),
    where('repositoryFullName', '==', repositoryFullName),
  )

  const querySnapshot = await getDocs(q)

  if (querySnapshot.empty) {
    return null
  }

  const doc = querySnapshot.docs[0]
  return { id: doc.id, ...doc.data() } as Vault
}

export const deleteVault = async (vaultId: string) => {
  const vaultRef = doc(db, VAULTS_COLLECTION, vaultId)
  await deleteDoc(vaultRef)
}

export const updateVault = async (vaultId: string, updates: Partial<Vault>) => {
  const vaultRef = doc(db, VAULTS_COLLECTION, vaultId)
  await updateDoc(vaultRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}
