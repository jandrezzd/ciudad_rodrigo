-- La cantera pasa a tener estado activo/inactivo, como ya lo tienen Owner,
-- Vehicle, Client, ConstSite y MaterialProvider. Hasta ahora era el único
-- modelo del catálogo sin él, así que el `estado` del listado de la empresa no
-- tenía dónde guardarse y la única forma de retirar una cantera era borrarla,
-- lo que arrastra en cascada su historial de consumo.
--
-- DEFAULT true a propósito: las canteras ya cargadas están en uso, así que
-- quedan activas y ningún listado cambia al aplicar esta migración.
ALTER TABLE "Cantera" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
