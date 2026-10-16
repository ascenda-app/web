# Ascenda · Portal web

Portal público de Ascenda en Next.js 16 (App Router). Cubre los requisitos RF-WEB-01…09 de
`.claude/docs/REQUIREMENTS.md` §10, según el blueprint de `.claude/docs/FRONTEND.md`.

## Puesta en marcha

```bash
cp .env.example .env
npm install
npm run dev
```

`GATEWAY_URL` debe apuntar al api-gateway (`http://localhost:8080` en local,
`http://gateway:8080` dentro de la red de Docker Compose). **Nunca lleva el prefijo
`NEXT_PUBLIC_`**: expondría el gateway al navegador.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con Turbopack |
| `npm run build` | Build de producción |
| `npm run typecheck` | TypeScript en modo estricto, sin emitir |
| `npm run lint` | ESLint: cero texto literal en JSX, cero clases direccionales físicas |
| `npm test` | Tests unitarios y de componente (Vitest) |
| `npm run test:coverage` | Igual, con el umbral del 80 % |
| `npm run e2e` | Recorridos críticos (Playwright) |
| `npm run check:messages` | Paridad de claves de los cinco diccionarios contra `en.json` |
| `npm run check:rtl` | Verifica que no hay utilidades direccionales físicas en `src/` |
| `npm run check:detail` | Verifica que `ProblemDetails.detail` no se renderiza |
| `npm run verify` | Encadena todas las comprobaciones anteriores |

## Arquitectura en una pantalla

- **Un solo árbol de componentes** bajo `src/app/[locale]/`. Los cinco idiomas salen de
  `messages/<locale>.json`. Duplicar pantallas por idioma es un error grave.
- **El JWT nunca llega al navegador.** Vive en cookies `httpOnly` y solo el servidor de Next.js
  habla con el gateway, a través de `src/app/api/bff/[...path]/route.ts`.
- **Los errores se traducen por `ProblemDetails.title`**, que es el código estable.
  `detail` viene en español fijo desde el backend y **nunca** se pinta.
- **`src/proxy.ts`, no `middleware.ts`**: el convenio está deprecado en Next 16.

El detalle normativo está en `.claude/docs/FRONTEND.md`; este README no lo duplica.
