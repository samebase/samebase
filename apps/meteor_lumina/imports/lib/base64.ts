/**
 * Properly decode base64 to UTF-8 string, handling special characters like "ă"
 * This replaces the browser's atob() which doesn't handle UTF-8 properly
 */
export function base64ToUtf8(base64: string): string {
  try {
    // Remove any whitespace/newlines from base64 string
    const cleanBase64 = base64.replace(/\s/g, '')

    // Decode base64 to binary string using atob
    const binaryString = atob(cleanBase64)

    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    // Use TextDecoder to properly decode UTF-8
    const decoder = new TextDecoder('utf-8')
    return decoder.decode(bytes)
  } catch (error) {
    console.error('Failed to decode base64 to UTF-8:', error)
    // Fallback to original atob behavior
    return atob(base64)
  }
}

/**
 * Encode UTF-8 string to base64, handling special characters properly
 */
export function utf8ToBase64(text: string): string {
  try {
    // Use TextEncoder to properly encode UTF-8 to bytes
    const encoder = new TextEncoder()
    const bytes = encoder.encode(text)

    // Convert bytes to binary string
    const binaryString = String.fromCharCode(...bytes)

    // Encode to base64
    return btoa(binaryString)
  } catch (error) {
    console.error('Failed to encode UTF-8 to base64:', error)
    // Fallback to original btoa behavior
    return btoa(text)
  }
}
