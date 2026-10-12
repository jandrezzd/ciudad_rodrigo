/** Transportista que retira el material de una orden de venta. Solo guarda
 *  el nombre o razón social; no tiene pantalla propia, se gestiona desde la
 *  orden. */
export interface Transportista {
  id: number;
  name: string;
  isActive: boolean;
  /** Solo en la respuesta de crear: ya había uno con ese nombre y se devolvió ese. */
  yaExistia?: boolean;
}
