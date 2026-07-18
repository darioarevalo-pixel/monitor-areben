// jsbarcode no publica tipos propios y no queremos sumar @types/jsbarcode: esta
// declaración mínima cubre el único uso (dibujar un CODE128 en un <canvas>).
declare module 'jsbarcode' {
  export interface JsBarcodeOptions {
    format?: string
    displayValue?: boolean
    width?: number
    height?: number
    margin?: number
    fontSize?: number
    [k: string]: unknown
  }
  const JsBarcode: (element: HTMLCanvasElement | SVGElement | string, text: string, options?: JsBarcodeOptions) => void
  export default JsBarcode
}
