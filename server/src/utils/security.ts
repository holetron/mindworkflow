import { URL } from 'url';

/**
 * Checks if a URL is external (HTTP/HTTPS) and safe to download from.
 * Prevents SSRF attacks by blocking:
 * - localhost/127.0.0.1
 * - Private IP ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
 * - Link-local addresses (169.254.x.x)
 * - Data URIs
 * - Local file paths
 * 
 * @param urlString - The URL string to validate
 * @returns true if the URL is safe to download from, false otherwise
 */
export function isExternalUrl(urlString: unknown): boolean {
  if (typeof urlString !== 'string' || !urlString) {
    return false;
  }

  // Data URIs should not be downloaded
  if (urlString.startsWith('data:')) {
    return false;
  }

  // Local paths should not be downloaded
  if (urlString.startsWith('/') || urlString.startsWith('./')) {
    return false;
  }

  try {
    const url = new URL(urlString);

    // Only allow HTTP/HTTPS protocols
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    // Block localhost variations
    if (
      hostname === 'localhost' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.localhost')
    ) {
      return false;
    }

    // Block loopback addresses
    if (hostname === '127.0.0.1' || hostname === '::1') {
      return false;
    }

    // Check for IPv4 private ranges
    const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
    if (ipv4Match) {
      const octets = ipv4Match.slice(1).map(Number);
      
      // 10.0.0.0/8
      if (octets[0] === 10) {
        return false;
      }
      
      // 172.16.0.0/12
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
        return false;
      }
      
      // 192.168.0.0/16
      if (octets[0] === 192 && octets[1] === 168) {
        return false;
      }
      
      // 169.254.0.0/16 (link-local)
      if (octets[0] === 169 && octets[1] === 254) {
        return false;
      }
      
      // 127.0.0.0/8 (loopback)
      if (octets[0] === 127) {
        return false;
      }
    }

    // Block IPv6 private/local addresses
    if (hostname.includes(':')) {
      const ipv6Lower = hostname.toLowerCase();
      if (
        ipv6Lower.startsWith('::1') || // loopback
        ipv6Lower.startsWith('fe80:') || // link-local
        ipv6Lower.startsWith('fc00:') || // unique local
        ipv6Lower.startsWith('fd00:')    // unique local
      ) {
        return false;
      }
    }

    return true;
  } catch {
    // Invalid URL
    return false;
  }
}

/**
 * Checks if a URL points to a local upload path
 * @param urlString - The URL string to check
 * @returns true if the URL is a local upload path
 */
export function isLocalUploadPath(urlString: unknown): boolean {
  if (typeof urlString !== 'string') {
    return false;
  }
  return urlString.startsWith('/uploads/');
}
