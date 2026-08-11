# Ciudad Rodrigo Constructora - Sistema de Gestión

Sistema de gestión integral para constructora con manejo de vehículos, obras, planificaciones, clientes y reportes.

## Características

- Gestión de Vehículos (CRUD completo con QR)
- Gestión de Obras
- Planificación de Obras con asignación de vehículos
- Gestión de Clientes
- Generación de Reportes en Excel
- Dashboard con estadísticas
- Autenticación con JWT
- Diseño responsive

## Stack Tecnológico

- React 18.3.1
- TypeScript 5.5.3
- Vite 5.4.2
- React Router DOM 6.30.1
- TailwindCSS 3.4.1
- Axios 1.13.2
- xlsx 0.18.5
- Vitest 4.0.13
- Playwright 1.56.1

## Estructura del Proyecto

```
src/
├── modules/              # Módulos de la aplicación
│   ├── auth/            # Autenticación
│   ├── vehicles/        # Gestión de vehículos
│   ├── obras/           # Gestión de obras
│   ├── planificacion/   # Planificación
│   ├── clientes/        # Gestión de clientes
│   ├── reportes/        # Generación de reportes
│   └── dashboard/       # Dashboard principal
├── shared/              # Componentes y utilidades compartidas
│   ├── components/      # Componentes UI reutilizables
│   ├── types/          # Tipos TypeScript compartidos
│   └── utils/          # Funciones utilitarias
├── config/             # Configuraciones
├── router/             # Configuración de rutas
└── test/              # Configuración de tests
```

## Instalación

```bash
npm install
```

## Variables de Entorno

Crear un archivo `.env` basado en `.env.example`:

```
VITE_API_URL=http://localhost:3000/api
```

## Desarrollo

```bash
npm run dev
```

## Pruebas

```bash
# Tests unitarios
npm run test

# Tests unitarios con UI
npm run test:ui

# Tests E2E
npm run test:e2e

# Tests E2E con UI
npm run test:e2e:ui
```

## Build

```bash
npm run build
```

## Arquitectura

El proyecto sigue una arquitectura modular donde cada funcionalidad está contenida en su propio módulo con:

- **types/**: Tipos TypeScript específicos del módulo
- **services/**: Servicios de API
- **hooks/**: Hooks personalizados de React
- **components/**: Componentes React del módulo

Los componentes compartidos están en `src/shared/components/` y son reutilizados por todos los módulos.

## Módulos Principales

### Auth
- Login con JWT
- Context API para manejo de estado de autenticación
- Rutas protegidas

### Vehículos
- CRUD completo
- Gestión de códigos QR
- Estados activo/inactivo
- Tipos: Propio/Alquilado

### Obras
- CRUD completo
- Información de ubicación
- Montos y fechas
- Estados múltiples

### Planificación
- Creación de planificaciones
- Asignación de vehículos a obras
- Gestión de estados
- Vista detallada

### Reportes
- Exportación a Excel
- Reportes por vehículo
- Reportes por obra
- Reportes por rango de fechas

## Colores del Tema

- Primary (Azul): #2563EB
- Secondary (Naranja): #F97316
- Success (Verde): #10B981
- Error (Rojo): #EF4444

## Licencia

Propiedad de Ciudad Rodrigo Constructora
