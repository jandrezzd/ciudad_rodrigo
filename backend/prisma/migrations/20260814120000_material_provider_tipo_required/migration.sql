-- El tipo INTERNO/EXTERNO pasa a ser obligatorio: la base rechaza un proveedor
-- sin clasificar, sin importar por dónde entre (API, seed, importación).
--
-- Los proveedores cargados antes de que existiera el campo quedan como EXTERNO
-- (proveedor de terceros, el caso habitual). Es el único valor posible para
-- poder aplicar el NOT NULL; se corrige desde la pantalla de edición si alguno
-- es una cantera propia.
UPDATE "MaterialProvider" SET "tipo" = 'EXTERNO' WHERE "tipo" IS NULL;

-- Sin DEFAULT a propósito: con un default, un POST sin `tipo` crearía un
-- EXTERNO en silencio en vez de fallar, que es justo lo que se quiere evitar.
ALTER TABLE "MaterialProvider" ALTER COLUMN "tipo" SET NOT NULL;
