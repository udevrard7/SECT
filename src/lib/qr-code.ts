/**
 * QR Code generator using the `qrcode` library.
 * Returns raw SVG markup for use with react-pdf's <Image> component
 * or as a data URI for browser `<img>` tags.
 */

import QRCode from 'qrcode'

/**
 * Generate a QR code as raw SVG string (for react-pdf or inline rendering).
 * @param data - Text/URL to encode.
 * @param size - Width of the QR code (pixels), default 150.
 */
export async function generateQRSvg(data: string, size = 150): Promise<string> {
  return QRCode.toString(data, {
    type: 'svg',
    width: size,
    margin: 1,
    color: { dark: '#1B3A5C', light: '#FFFFFF' },
  })
}

/**
 * Generate a QR code as a base64 data URI (for <Image src=...> in react-pdf).
 * react-pdf <Image> accepts data URIs directly.
 * @param data - Text/URL to encode.
 * @param size - Width of the QR code (pixels), default 150.
 */
export async function generateQRDataUri(data: string, size = 150): Promise<string> {
  return QRCode.toDataURL(data, {
    width: size,
    margin: 1,
    color: { dark: '#1B3A5C', light: '#FFFFFF' },
  })
}
