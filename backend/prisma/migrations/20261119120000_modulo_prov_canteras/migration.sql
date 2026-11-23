-- Renombrar el módulo "Prov. Material" a "Prov. Canteras" (pantalla de roles y permisos).
-- Solo cambia el texto visible; la clave 'material-providers' y los permisos no cambian.
UPDATE "Modulo" SET "label" = 'Prov. Canteras' WHERE "key" = 'material-providers';
