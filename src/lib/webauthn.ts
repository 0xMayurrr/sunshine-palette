export function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function isWebAuthnSupported(): boolean {
  return isMobile() && !!window.PublicKeyCredential
}

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const buffer = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i)
  return buffer.buffer
}

export async function registerPasskey(userId: string, email: string): Promise<{ credentialId: string; publicKey: string } | null> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32))

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Buildicy Calendar', id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(userId),
          name: email,
          displayName: email.split('@')[0],
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },   // ES256
          { alg: -257, type: 'public-key' },  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // forces fingerprint/Face ID
          userVerification: 'required',
        },
        timeout: 60000,
      },
    }) as PublicKeyCredential | null

    if (!credential) return null

    const response = credential.response as AuthenticatorAttestationResponse
    const credentialId = bufferToBase64(credential.rawId)
    const publicKey = bufferToBase64(response.getPublicKey?.() || new ArrayBuffer(0))

    return { credentialId, publicKey }
  } catch (err) {
    console.error('[WebAuthn Register]', err)
    return null
  }
}

export async function authenticatePasskey(credentialId: string): Promise<boolean> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32))

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [
          {
            id: base64ToBuffer(credentialId),
            type: 'public-key',
          },
        ],
        userVerification: 'required',
        timeout: 60000,
      },
    }) as PublicKeyCredential | null

    return !!assertion
  } catch (err) {
    console.error('[WebAuthn Auth]', err)
    return false
  }
}
