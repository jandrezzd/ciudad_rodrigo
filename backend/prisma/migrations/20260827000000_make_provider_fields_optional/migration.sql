-- Proveedor de vehículo (Owner), Proveedor de material (MaterialProvider) y
-- Cantera dejan de exigir varios campos a nivel de base de datos, para que se
-- puedan registrar sin llenarlos todos de una vez.

-- Owner (Proveedor de vehículo)
ALTER TABLE "Owner" ALTER COLUMN "ruc" DROP NOT NULL;
ALTER TABLE "Owner" ALTER COLUMN "companyname" DROP NOT NULL;
ALTER TABLE "Owner" ALTER COLUMN "name" DROP NOT NULL;
ALTER TABLE "Owner" ALTER COLUMN "document" DROP NOT NULL;

-- MaterialProvider (Proveedor de material)
ALTER TABLE "MaterialProvider" ALTER COLUMN "ruc" DROP NOT NULL;
ALTER TABLE "MaterialProvider" ALTER COLUMN "razonsocial" DROP NOT NULL;
ALTER TABLE "MaterialProvider" ALTER COLUMN "tipo" DROP NOT NULL;
ALTER TABLE "MaterialProvider" ALTER COLUMN "email" DROP NOT NULL;

-- Cantera
ALTER TABLE "Cantera" ALTER COLUMN "nombre" DROP NOT NULL;
