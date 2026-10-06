// src/config/beta.ts
//
// Beta cerrada con amigos: el pago queda apagado, no borrado.
//
// Con MODO_BETA en true:
//   - la ultima pagina de beneficios dice "Empezar" y entra directo a la app
//     (guarda la sesion igual que hoy lo hace planes.tsx al "comprar");
//   - planes.tsx no se alcanza por ninguna navegacion y, si alguien llega
//     igual, redirige a la app;
//   - Perfil oculta "Suscripcion" y "Cerrar sesion" (este ultimo lleva a un
//     login de mentira que acepta cualquier cosa y solo confunde).
//
// Para volver al flujo con planes, pasarlo a false. No hay que tocar nada mas.

export const MODO_BETA = true;
