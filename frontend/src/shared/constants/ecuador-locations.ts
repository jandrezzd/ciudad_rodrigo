export const ECUADOR_LOCATIONS = {
  "Azuay": [
    "Cuenca", "Gualaceo", "Paute", "Sigsig", "Girón", "Santa Isabel", "San Fernando", 
    "Chordeleg", "Nabón", "Pucará", "Oña", "Sevilla de Oro", "Guachapala", 
    "Camilo Ponce Enríquez", "El Pan"
  ],
  "Bolívar": ["Guaranda", "Chillanes", "Chimbo", "Echeandía", "San Miguel", "Caluma", "Las Naves"],
  "Cañar": ["Azogues", "Biblián", "Cañar", "La Troncal", "El Tambo", "Déleg", "Suscal"],
  "Carchi": ["Tulcán", "Bolívar", "Espejo", "Mira", "Montúfar", "San Pedro de Huaca"],
  "Chimborazo": [
    "Riobamba", "Alausi", "Colta", "Chambo", "Chunchi", "Guamote", "Guano", 
    "Pallatanga", "Penipe", "Cumandá"
  ],
  "Cotopaxi": ["Latacunga", "La Maná", "Pangua", "Pujilí", "Salcedo", "Saquisilí", "Sigchos"],
  "El Oro": [
    "Machala", "Arenillas", "Atahualpa", "Balsas", "Chilla", "El Guabo", "Huaquillas", 
    "Marcabelí", "Pasaje", "Piñas", "Portovelo", "Santa Rosa", "Zaruma", "Las Lajas"
  ],
  "Esmeraldas": [
    "Esmeraldas", "Eloy Alfaro", "Muisne", "Quinindé", "San Lorenzo", "Atacames", 
    "Rioverde", "La Concordia"
  ],
  "Galápagos": ["San Cristóbal", "Isabela", "Santa Cruz"],
  "Guayas": [
    "Guayaquil", "Alfredo Baquerizo Moreno (Juján)", "Balao", "Balzar", "Colimes", "Daule", 
    "Durán", "El Empalme", "El Triunfo", "Milagro", "Naranjal", "Naranjito", "Palestina", 
    "Pedro Carbo", "Samborondón", "Santa Lucía", "Salitre (Urbina Jado)", 
    "San Jacinto de Yaguachi", "Playas", "Simón Bolívar", "Marcelino Maridueña", 
    "Nobol", "Lomas de Sargentillo", "Antonio Elizalde (Bucay)", "Isidro Ayora"
  ],
  "Imbabura": ["Ibarra", "Antonio Ante", "Cotacachi", "Otavalo", "Pimampiro", "San Miguel de Urcuquí"],
  "Loja": [
    "Loja", "Calvas", "Catamayo", "Celica", "Chaguarpamba", "Espíndola", "Gonzanamá", 
    "Macará", "Paltas", "Puyango", "Saraguro", "Sozoranga", "Zapotillo", "Pindal", 
    "Quilanga", "Olmedo"
  ],
  "Los Ríos": [
    "Babahoyo", "Baba", "Montalvo", "Puebloviejo", "Quevedo", "Urdaneta", "Ventanas", 
    "Vinces", "Palenque", "Buena Fé", "Valencia", "Mocache", "Quinsaloma"
  ],
  "Manabí": [
    "Portoviejo", "Bolívar", "Chone", "El Carmen", "Flavio Alfaro", "Jipijapa", "Junín", 
    "Manta", "Montecristi", "Paján", "Pichincha", "Rocafuerte", "Santa Ana", "Sucre", 
    "Tosagua", "24 de Mayo", "Pedernales", "Olmedo", "Puerto López", "Jama", "Jaramijó", 
    "San Vicente"
  ],
  "Morona Santiago": [
    "Morona", "Gualaquiza", "Limón Indanza", "Palora", "Santiago", "Sucúa", "Huamboya", 
    "San Juan Bosco", "Taisha", "Logroño", "Pablo Sexto", "Tiwintza"
  ],
  "Napo": ["Tena", "Archidona", "El Chaco", "Quijos", "Carlos Julio Arosemena Tola"],
  "Orellana": ["Orellana", "Aguuarico", "La Joya de los Sachas", "Loreto"],
  "Pastaza": ["Pastaza", "Mera", "Santa Clara", "Arajuno"],
  "Pichincha": [
    "Quito", "Cayambe", "Mejía", "Pedro Moncayo", "Rumiñahui", "San Miguel de los Bancos", 
    "Pedro Vicente Maldonado", "Puerto Quito"
  ],
  "Santa Elena": ["Santa Elena", "La Libertad", "Salinas"],
  "Santo Domingo de los Tsáchilas": ["Santo Domingo", "La Concordia"],
  "Sucumbíos": [
    "Lago Agrio", "Gonzalo Pizarro", "Putumayo", "Shushufindi", "Sucumbíos", "Cascales", 
    "Cuyabeno"
  ],
  "Tungurahua": [
    "Ambato", "Baños de Agua Santa", "Cevallos", "Mocha", "Patate", "Quero", 
    "San Pedro de Pelileo", "Santiago de Píllaro", "Tisaleo"
  ],
  "Zamora Chinchipe": [
    "Zamora", "Chinchipe", "Nangaritza", "Yacuambi", "Yantzaza (El Pangui)", 
    "Centinela del Cóndor", "Palanda", "Paquisha"
  ]
};

/** Sin tildes, mayúsculas ni espacios extra: "MANABI" y "Manabí" son la misma. */
const normalizar = (valor: string) =>
  valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/**
 * Provincia tal como está en la lista ("MANABI" -> "Manabí"). Si no existe en
 * la lista se devuelve el valor original, para no perder lo guardado.
 */
export const resolverProvincia = (valor?: string | null): string => {
  if (!valor) return '';
  const clave = Object.keys(ECUADOR_LOCATIONS).find((p) => normalizar(p) === normalizar(valor));
  return clave ?? valor;
};

/**
 * Cantones de una provincia, o lista vacía si la provincia no está en el
 * catálogo. Nunca indexar ECUADOR_LOCATIONS directo: una provincia escrita
 * distinto (ej. importada en mayúsculas) deja la pantalla en blanco.
 */
export const cantonesDe = (provincia?: string | null): string[] => {
  const clave = resolverProvincia(provincia);
  return (ECUADOR_LOCATIONS as Record<string, string[]>)[clave] ?? [];
};

/** Cantón tal como está en la lista de su provincia, o el valor original. */
export const resolverCanton = (provincia?: string | null, canton?: string | null): string => {
  if (!canton) return '';
  return cantonesDe(provincia).find((c) => normalizar(c) === normalizar(canton)) ?? canton;
};
