const SPS_NAL_TYPE = 7

// Reads profile, constraint and level bytes from the first SPS in an Annex B config packet.
export function codecFromConfig(config: Uint8Array): string | undefined {
  for (let i = 0; i + 4 < config.length; i++) {
    if (config[i] === 0 && config[i + 1] === 0 && config[i + 2] === 1) {
      if ((config[i + 3] & 0x1f) === SPS_NAL_TYPE && i + 6 < config.length) {
        const hex = (value: number): string => value.toString(16).padStart(2, '0')
        return `avc1.${hex(config[i + 4])}${hex(config[i + 5])}${hex(config[i + 6])}`
      }
      i += 2
    }
  }
  return undefined
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
