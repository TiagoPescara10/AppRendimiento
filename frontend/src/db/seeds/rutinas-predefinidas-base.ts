// src/db/seeds/rutinas-predefinidas-base.ts
//
// Biblioteca inicial de 10 rutinas de gimnasio predefinidas (lote 1).
//
// Los ejercicios se referencian por NOMBRE y no por id: los ids de la tabla
// ejercicio son UUID generados en cada instalacion, asi que no hay id fijo
// que escribir aca. La semilla resuelve cada nombre contra la tabla al
// sembrar y falla si alguno no existe. Por eso cada nombre tiene que ser
// identico al de ejercicios-base.ts, letra por letra.
//
// Los ids de rutina son slugs fijos: hacen idempotente la semilla y permiten
// que un lote posterior agregue rutinas sin duplicar las anteriores.

import type { CategoriaRutinaPredefinida } from '../schema';

export interface RutinaPredefinidaSemilla {
  id: string;
  nombre: string;
  categoria: CategoriaRutinaPredefinida;
  descripcion: string;
  /** Nombres de ejercicio en el orden en que se hacen. */
  ejercicios: string[];
}

export const RUTINAS_PREDEFINIDAS_BASE: RutinaPredefinidaSemilla[] = [
  // Principiante (3)
  {
    id: 'predef-full-body-principiante',
    nombre: 'Full body principiante',
    categoria: 'principiante',
    descripcion: 'Para quien empieza: todo el cuerpo con maquinas y basicos, 3 dias por semana',
    ejercicios: [
      'Prensa de piernas inclinada',
      'Press de banca plano con barra',
      'Jalon al pecho en polea',
      'Press militar con mancuernas sentado',
      'Remo en polea baja',
      'Curl femoral acostado en maquina',
      'Plancha isometrica',
    ],
  },
  {
    id: 'predef-full-body-mancuernas',
    nombre: 'Full body con mancuernas',
    categoria: 'principiante',
    descripcion: 'Cuerpo completo solo con mancuernas, ideal para casa o gimnasio chico',
    ejercicios: [
      'Sentadilla goblet con mancuerna',
      'Press de banca plano con mancuernas',
      'Remo con mancuerna a una mano',
      'Peso muerto rumano con mancuernas',
      'Press militar con mancuernas sentado',
      'Estocadas con mancuernas',
      'Curl martillo con mancuernas',
    ],
  },
  {
    id: 'predef-circuito-adaptacion',
    nombre: 'Circuito de adaptacion',
    categoria: 'principiante',
    descripcion: 'Volumen bajo para volver a entrenar o las primeras semanas',
    ejercicios: [
      'Bicicleta fija',
      'Prensa de piernas inclinada',
      'Flexiones de brazos',
      'Jalon al pecho en polea',
      'Puente de gluteos',
      'Plancha isometrica',
    ],
  },

  // Split intermedio (5)
  {
    id: 'predef-push',
    nombre: 'Push',
    categoria: 'split',
    descripcion: 'Dia de empuje: pecho, hombro y triceps',
    ejercicios: [
      'Press de banca plano con barra',
      'Press de banca inclinado con mancuernas',
      'Press militar con mancuernas sentado',
      'Elevaciones laterales con mancuernas',
      'Cruces en polea',
      'Extension de triceps en polea con soga',
      'Extension de triceps trasnuca con mancuerna',
    ],
  },
  {
    id: 'predef-pull',
    nombre: 'Pull',
    categoria: 'split',
    descripcion: 'Dia de tiron: espalda, deltoide posterior y biceps',
    ejercicios: [
      'Dominadas pronas',
      'Remo con barra',
      'Remo en polea baja',
      'Pullover en polea alta',
      'Face pull en polea alta',
      'Curl de biceps con barra de pie',
      'Curl martillo con mancuernas',
    ],
  },
  {
    id: 'predef-legs',
    nombre: 'Legs',
    categoria: 'split',
    descripcion: 'Pierna completa con enfasis en gluteos',
    ejercicios: [
      'Sentadilla trasera con barra',
      'Peso muerto rumano con barra',
      'Prensa de piernas inclinada',
      'Sentadilla bulgara con mancuernas',
      'Hip thrust con barra',
      'Extensiones de piernas en maquina',
      'Curl femoral sentado en maquina',
      'Elevacion de talones de pie',
    ],
  },
  {
    id: 'predef-torso-pierna-a',
    nombre: 'Torso/Pierna A',
    categoria: 'split',
    descripcion: 'Torso completo para alternar con el dia B, 4 dias por semana',
    ejercicios: [
      'Press de banca plano con barra',
      'Remo con barra',
      'Press militar con barra',
      'Jalon al pecho en polea',
      'Press de banca inclinado con mancuernas',
      'Elevaciones laterales con mancuernas',
      'Curl de biceps con mancuernas alternado',
      'Extension de triceps en polea con barra',
    ],
  },
  {
    // Variantes distintas a Legs (frontal, estocadas, talones sentado) para
    // que no sea la misma rutina con otro nombre.
    id: 'predef-torso-pierna-b',
    nombre: 'Torso/Pierna B',
    categoria: 'split',
    descripcion: 'Pierna completa y core para alternar con el dia A',
    ejercicios: [
      'Sentadilla frontal con barra',
      'Peso muerto rumano con barra',
      'Estocadas con mancuernas',
      'Hip thrust con barra',
      'Curl femoral acostado en maquina',
      'Extensiones de piernas en maquina',
      'Elevacion de talones sentado',
      'Elevacion de piernas colgado',
    ],
  },

  // Especificas (2)
  {
    id: 'predef-pecho-triceps',
    nombre: 'Pecho y triceps',
    categoria: 'especifica',
    descripcion: 'Sesion clasica de pecho y triceps para un split de 4 o 5 dias',
    ejercicios: [
      'Press de banca plano con barra',
      'Press de banca inclinado con mancuernas',
      'Aperturas con mancuernas en banco plano',
      'Fondos en paralelas para pecho',
      'Press frances con barra en banco plano',
      'Extension de triceps en polea con soga',
    ],
  },
  {
    id: 'predef-espalda-biceps',
    nombre: 'Espalda y biceps',
    categoria: 'especifica',
    descripcion: 'Sesion clasica de espalda y biceps para un split de 4 o 5 dias',
    ejercicios: [
      'Dominadas pronas',
      'Remo con barra',
      'Jalon al pecho en polea',
      'Remo con mancuerna a una mano',
      'Hiperextensiones lumbares',
      'Curl de biceps con barra de pie',
      'Curl en banco Scott con barra W',
    ],
  },
];
