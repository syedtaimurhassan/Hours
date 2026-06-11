/**
 * Random persistent device id — keys stopClaims and updatedBy so offline ends
 * from different devices never collide and writes are attributable.
 */
const KEY = 'hours.deviceId'

let inMemory: string | null = null

export function getDeviceId(): string {
  if (inMemory) return inMemory
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = crypto.randomUUID().slice(0, 12)
      localStorage.setItem(KEY, id)
    }
    inMemory = id
  } catch {
    // Private browsing: a per-session id still keeps claims keyed sanely.
    inMemory = crypto.randomUUID().slice(0, 12)
  }
  return inMemory
}
