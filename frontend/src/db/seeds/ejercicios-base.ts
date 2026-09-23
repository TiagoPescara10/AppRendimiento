// src/db/seeds/ejercicios-base.ts
//
// Catalogo base de 74 ejercicios comunes para la semilla inicial (lote 1).
// Nombres genericos, sin marcas ni maquinas propietarias de ningun gimnasio.

import type { GrupoMuscular } from '../schema';

export interface EjercicioSemilla {
  nombre: string;
  grupo: GrupoMuscular;
}

export const EJERCICIOS_BASE: EjercicioSemilla[] = [
  // Pecho (10)
  { nombre: 'Press de banca plano con barra', grupo: 'pecho' },
  { nombre: 'Press de banca inclinado con barra', grupo: 'pecho' },
  { nombre: 'Press de banca declinado con barra', grupo: 'pecho' },
  { nombre: 'Press de banca plano con mancuernas', grupo: 'pecho' },
  { nombre: 'Press de banca inclinado con mancuernas', grupo: 'pecho' },
  { nombre: 'Aperturas con mancuernas en banco plano', grupo: 'pecho' },
  { nombre: 'Aperturas con mancuernas en banco inclinado', grupo: 'pecho' },
  { nombre: 'Cruces en polea', grupo: 'pecho' },
  { nombre: 'Flexiones de brazos', grupo: 'pecho' },
  { nombre: 'Fondos en paralelas para pecho', grupo: 'pecho' },

  // Espalda (11)
  { nombre: 'Dominadas pronas', grupo: 'espalda' },
  { nombre: 'Dominadas supinas', grupo: 'espalda' },
  { nombre: 'Jalon al pecho en polea', grupo: 'espalda' },
  { nombre: 'Jalon trasnuca en polea', grupo: 'espalda' },
  { nombre: 'Remo con barra', grupo: 'espalda' },
  { nombre: 'Remo con mancuerna a una mano', grupo: 'espalda' },
  { nombre: 'Remo en polea baja', grupo: 'espalda' },
  { nombre: 'Remo en barra T', grupo: 'espalda' },
  { nombre: 'Pullover en polea alta', grupo: 'espalda' },
  { nombre: 'Hiperextensiones lumbares', grupo: 'espalda' },
  { nombre: 'Peso muerto convencional', grupo: 'espalda' },

  // Piernas (16)
  { nombre: 'Sentadilla trasera con barra', grupo: 'piernas' },
  { nombre: 'Sentadilla frontal con barra', grupo: 'piernas' },
  { nombre: 'Sentadilla goblet con mancuerna', grupo: 'piernas' },
  { nombre: 'Prensa de piernas inclinada', grupo: 'piernas' },
  { nombre: 'Estocadas con mancuernas', grupo: 'piernas' },
  { nombre: 'Sentadilla bulgara con mancuernas', grupo: 'piernas' },
  { nombre: 'Extensiones de piernas en maquina', grupo: 'piernas' },
  { nombre: 'Curl femoral acostado en maquina', grupo: 'piernas' },
  { nombre: 'Curl femoral sentado en maquina', grupo: 'piernas' },
  { nombre: 'Peso muerto rumano con barra', grupo: 'piernas' },
  { nombre: 'Peso muerto rumano con mancuernas', grupo: 'piernas' },
  { nombre: 'Hip thrust con barra', grupo: 'piernas' },
  { nombre: 'Puente de gluteos', grupo: 'piernas' },
  { nombre: 'Elevacion de talones de pie', grupo: 'piernas' },
  { nombre: 'Elevacion de talones sentado', grupo: 'piernas' },
  { nombre: 'Abductores en maquina', grupo: 'piernas' },

  // Hombros (9)
  { nombre: 'Press militar con barra', grupo: 'hombros' },
  { nombre: 'Press militar con mancuernas sentado', grupo: 'hombros' },
  { nombre: 'Press Arnold con mancuernas', grupo: 'hombros' },
  { nombre: 'Elevaciones laterales con mancuernas', grupo: 'hombros' },
  { nombre: 'Elevaciones frontales con mancuernas', grupo: 'hombros' },
  { nombre: 'Elevaciones laterales en polea', grupo: 'hombros' },
  { nombre: 'Pajaros con mancuernas', grupo: 'hombros' },
  { nombre: 'Face pull en polea alta', grupo: 'hombros' },
  { nombre: 'Remo al menton con barra', grupo: 'hombros' },

  // Brazos (14)
  { nombre: 'Curl de biceps con barra de pie', grupo: 'brazos' },
  { nombre: 'Curl de biceps con mancuernas alternado', grupo: 'brazos' },
  { nombre: 'Curl martillo con mancuernas', grupo: 'brazos' },
  { nombre: 'Curl en banco Scott con barra W', grupo: 'brazos' },
  { nombre: 'Curl concentrado con mancuerna', grupo: 'brazos' },
  { nombre: 'Curl de biceps en polea baja', grupo: 'brazos' },
  { nombre: 'Fondos en paralelas para triceps', grupo: 'brazos' },
  { nombre: 'Press frances con barra en banco plano', grupo: 'brazos' },
  { nombre: 'Extension de triceps en polea con soga', grupo: 'brazos' },
  { nombre: 'Extension de triceps en polea con barra', grupo: 'brazos' },
  { nombre: 'Patada de triceps con mancuerna', grupo: 'brazos' },
  { nombre: 'Extension de triceps trasnuca con mancuerna', grupo: 'brazos' },
  { nombre: 'Flexion de munecas con barra', grupo: 'brazos' },
  { nombre: 'Extension de munecas con barra', grupo: 'brazos' },

  // Core (8)
  { nombre: 'Plancha isometrica', grupo: 'core' },
  { nombre: 'Plancha lateral', grupo: 'core' },
  { nombre: 'Crunch abdominal en suelo', grupo: 'core' },
  { nombre: 'Crunch en polea alta', grupo: 'core' },
  { nombre: 'Elevacion de piernas colgado', grupo: 'core' },
  { nombre: 'Rueda abdominal', grupo: 'core' },
  { nombre: 'Giros rusos', grupo: 'core' },
  { nombre: 'Vacio abdominal', grupo: 'core' },

  // Cardio (6)
  { nombre: 'Cinta de correr', grupo: 'cardio' },
  { nombre: 'Bicicleta fija', grupo: 'cardio' },
  { nombre: 'Eliptico', grupo: 'cardio' },
  { nombre: 'Remo ergometro', grupo: 'cardio' },
  { nombre: 'Salto a la soga', grupo: 'cardio' },
  { nombre: 'Escalador', grupo: 'cardio' },
];
