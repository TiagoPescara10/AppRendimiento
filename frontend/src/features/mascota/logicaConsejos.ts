// src/features/mascota/logicaConsejos.ts
//
// Motor de recomendaciones y estado de animacion de la mascota leon de Avanza.
//
// Evalua de forma pura los datos del usuario (eventos del dia, calorias,
// macros, hora actual) y devuelve el estado de animo del leon y el mensaje.

import type { ResultadoNutricional } from '@/lib/nutricion';

export type EstadoLeon = 'idle' | 'motivado' | 'festejo' | 'atento' | 'descanso';

export interface EventoProximoResumen {
  id: string;
  titulo: string;
  tipo: string;
  /** ISO string o 'HH:MM' */
  horaInicio?: string;
  /** En minutos desde ahora hasta que arranca el evento */
  minutosParaInicio?: number;
}

export interface DatosConsejo {
  consumido: { kcal: number; prot: number; carb: number; grasa: number };
  objetivo: ResultadoNutricional | null;
  proximoEvento?: EventoProximoResumen | null;
  ahora?: Date;
}

export interface ConsejoLeon {
  estado: EstadoLeon;
  esEvento: boolean;
  saludo: string;
  mensaje: string;
  accion?: {
    texto: string;
    ruta: string;
  };
}

export function obtenerConsejoLeon(datos: DatosConsejo): ConsejoLeon {
  const { consumido, objetivo, proximoEvento, ahora = new Date() } = datos;
  const hora = ahora.getHours();
  const minutos = ahora.getMinutes();

  const saludo = hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';

  // 1. REGLA SUPREMA: Evento deportivo / partido en las proximas 2.5 horas
  if (proximoEvento && proximoEvento.minutosParaInicio !== undefined && proximoEvento.minutosParaInicio > 0) {
    const mins = proximoEvento.minutosParaInicio;
    if (mins <= 150) {
      const tiempoTexto = mins <= 60 ? `en ${mins} minutos` : `en unas 2 horas`;

      return {
        estado: 'motivado',
        esEvento: true,
        saludo,
        mensaje: `Tenés ${proximoEvento.titulo} ${tiempoTexto}. Meté carbohidratos de fácil digestión (banana, tostada con dulce o avena) para tener nafta.`,
        accion: {
          texto: 'Ver evento',
          ruta: `/evento/${proximoEvento.id}`,
        },
      };
    }
  }

  // 2. Festejo: Alcanzo el objetivo de calorias (dentro del rango 95% - 105%)
  if (objetivo && objetivo.kcal_objetivo > 0) {
    const metaKcal = objetivo.kcal_objetivo;
    const ratioKcal = consumido.kcal / metaKcal;

    if (ratioKcal >= 0.95 && ratioKcal <= 1.05) {
      return {
        estado: 'festejo',
        esEvento: false,
        saludo,
        mensaje: '¡Clavaste el objetivo de calorías del día! Impecable la disciplina, así se construye el rendimiento.',
      };
    }

    // 3. Alerta: Se paso en mas del 10%
    if (ratioKcal > 1.10) {
      return {
        estado: 'atento',
        esEvento: false,
        saludo,
        mensaje: 'Te pasaste un poco de calorías hoy, pero sin drama. Mañana entrenamos y se compensa.',
      };
    }

    // 4. Macro crucial: Son las 19hs en adelante y falta mas del 35% de la proteina
    if (hora >= 19 && objetivo.macros.proteina_g > 0) {
      const faltaProt = objetivo.macros.proteina_g - consumido.prot;
      if (faltaProt > objetivo.macros.proteina_g * 0.3) {
        return {
          estado: 'atento',
          esEvento: false,
          saludo,
          mensaje: `Venís corto de proteínas (te faltan unos ${Math.round(faltaProt)} g). Una cena con carne, huevos o legumbres te deja listo.`,
          accion: {
            texto: '+ Registrar cena',
            ruta: '/comida/nueva',
          },
        };
      }
    }
  }

  // 5. Descanso nocturno: Despues de las 22:30
  if (hora >= 22 && minutos >= 30) {
    return {
      estado: 'descanso',
      esEvento: false,
      saludo,
      mensaje: 'Momento de bajar revoluciones y descansar. En el sueño es donde el músculo se repara y crece.',
    };
  }

  // 6. Manana: No registro nada todavia
  if (hora < 12 && consumido.kcal === 0) {
    return {
      estado: 'idle',
      esEvento: false,
      saludo,
      mensaje: 'Arrancamos el día. Meté un buen desayuno cargado y asegurate un vaso grande de agua.',
      accion: {
        texto: '+ Registrar comida',
        ruta: '/comida/nueva',
      },
    };
  }

  // 7. Estado default motivacional
  return {
    estado: 'idle',
    esEvento: false,
    saludo,
    mensaje: 'La constancia le gana al talento. Mantené el plan de comidas y no descuides la hidratación.',
  };
}
