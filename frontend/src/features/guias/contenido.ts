// src/features/guias/contenido.ts
//
// Las guias paso a paso de Perfil > Guias. Son datos y no JSX a proposito:
// las pantallas (app/perfil/guias.tsx y app/perfil/guia/[id].tsx) solo los
// dibujan, asi que sumar una guia, corregir un paso o agregar capturas mas
// adelante no toca las pantallas.
//
// Los pasos describen la app tal como es: los textos entre comillas son los
// de los botones de verdad. Si se cambia un boton, hay que cambiar su guia.
//
// Puro: no importa React ni expo, asi lo lee scripts/probar-guias.mjs. Ese
// script verifica ids unicos, entre 1 y 6 pasos, que cada destino sea una
// ruta que existe y que cada <BotonGuia id="..."> apunte a una guia.

export type CategoriaGuia = 'entrenamiento' | 'comidas' | 'progreso';

export const CATEGORIAS_GUIA: { valor: CategoriaGuia; titulo: string }[] = [
  { valor: 'entrenamiento', titulo: 'Entrenamiento' },
  { valor: 'comidas', titulo: 'Comidas' },
  { valor: 'progreso', titulo: 'Tu progreso' },
];

export const MAX_PASOS = 6;

export interface PasoGuia {
  titulo: string;
  texto: string;
}

/** A donde lleva "Probalo ahora". pathname es una ruta de app/, sin grupos de mas. */
export interface DestinoGuia {
  pathname: string;
  params?: Record<string, string>;
}

export interface Guia {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: CategoriaGuia;
  pasos: PasoGuia[];
  destino: DestinoGuia;
}

const LISTA = [
  // -------------------------------------------------------------------------
  // Entrenamiento
  // -------------------------------------------------------------------------
  {
    id: 'mi-semana',
    titulo: 'Armá tu semana de gimnasio',
    descripcion: 'Elegí los días, qué rutina hacés cada uno y a qué hora.',
    categoria: 'entrenamiento',
    destino: { pathname: '/entrenamiento/mi-semana' },
    pasos: [
      {
        titulo: 'Abrí el asistente',
        texto:
          'En Entrenamientos, tocá "Empezar" en la card "Armá tu semana de gimnasio". Si ya tenés días armados, tocá "Editar mi semana".',
      },
      {
        titulo: 'Elegí los días',
        texto: 'Tocá las letras de los días que vas al gimnasio y después "Siguiente".',
      },
      {
        titulo: 'Elegí qué hacés cada día',
        texto:
          'Tocá cada día y elegí una rutina de "Rutinas listas" o de "Mis rutinas". Con "Completar con una sugerencia" se llenan todos según cuántos días vas.',
      },
      {
        titulo: 'Armá la tuya si querés',
        texto:
          'En la lista de cada día, tocá "Crear una nueva". Cuando la guardás, volvés al asistente con esa rutina elegida para ese día.',
      },
      {
        titulo: 'Elegí la hora y la duración',
        texto:
          'Tocá la hora para cambiarla; si cada día es distinto, prendé "Distinta por día". Elegí los minutos y tocá "Ver resumen".',
      },
      {
        titulo: 'Guardá',
        texto:
          'Revisá la lista y tocá "Guardar mi semana". El día que te toca aparece en Entrenamientos como "Hoy toca".',
      },
    ],
  },
  {
    id: 'crear-rutina',
    titulo: 'Crear tu propia rutina',
    descripcion: 'Ponele nombre, sumá ejercicios y ordenalos.',
    categoria: 'entrenamiento',
    destino: { pathname: '/rutina-gimnasio/nueva' },
    pasos: [
      {
        titulo: 'Abrí el editor',
        texto:
          'En Entrenamientos, tocá "Rutina" arriba a la derecha o "+ Nueva" en Mis Rutinas. Si preferís partir de una armada, tocá "Agregar predefinida".',
      },
      {
        titulo: 'Ponele nombre',
        texto: 'Escribilo en "Nombre de la rutina", por ejemplo "Pecho y tríceps".',
      },
      {
        titulo: 'Sumá ejercicios',
        texto:
          'Tocá "Agregar ejercicio", buscalo por nombre o filtrá por grupo, y tocalo. Si no está, tocá "Crear nuevo".',
      },
      {
        titulo: 'Ordenalos',
        texto: 'Con las flechas de cada ejercicio lo subís o lo bajás, y con el tacho lo sacás.',
      },
      {
        titulo: 'Guardá',
        texto: 'Tocá "Guardar rutina". Para hacerla en días fijos, sumala en Mi semana.',
      },
      {
        titulo: 'Series, repeticiones y peso',
        texto:
          'No se cargan acá: los anotás cuando entrenás. La primera vez arranca con 3 series y después repite lo que hiciste la última vez.',
      },
    ],
  },
  {
    id: 'tiempo-calentamiento',
    titulo: 'Ejercicios por tiempo y calentamiento',
    descripcion: 'Planchas, cardio y la entrada en calor, aparte del resto.',
    categoria: 'entrenamiento',
    destino: { pathname: '/rutina-gimnasio/nueva' },
    pasos: [
      {
        titulo: 'Sumá un calentamiento',
        texto:
          'En el editor de rutina, tocá "Agregar calentamiento" y elegí los ejercicios. Quedan en un bloque aparte, antes de "Principal".',
      },
      {
        titulo: 'Ejercicios por tiempo',
        texto: 'Algunos ya vienen así, como la plancha: en la lista dicen "por tiempo".',
      },
      {
        titulo: 'Creá uno por tiempo',
        texto:
          'En "Elegir ejercicio", tocá "Crear nuevo", escribí el nombre, elegí el grupo, tocá "Tiempo" y después "Guardar y agregar".',
      },
      {
        titulo: 'Medilo al entrenar',
        texto:
          'En esos ejercicios la tabla muestra "TIEMPO" en lugar de "KG" y "REPS". Tocá "Iniciar" al arrancar y "Parar" al terminar: el tiempo queda cargado en la serie.',
      },
      {
        titulo: 'Con peso, si usás',
        texto: 'Si lo hacés con peso, tocá "+ peso" y cargalo en la misma serie.',
      },
      {
        titulo: 'El calentamiento no cuenta en tus marcas',
        texto:
          'Sus series quedan guardadas, pero no suman al volumen ni a la progresión de Fuerza.',
      },
    ],
  },
  {
    id: 'superseries',
    titulo: 'Superseries: qué son y cómo agrupar ejercicios',
    descripcion: 'Dos o más ejercicios seguidos, sin pausa entre uno y otro.',
    categoria: 'entrenamiento',
    destino: { pathname: '/rutina-gimnasio/nueva' },
    pasos: [
      {
        titulo: 'Qué es',
        texto:
          'Una superserie son dos ejercicios que hacés uno detrás del otro, y recién ahí descansás. Con tres o más se llama circuito.',
      },
      {
        titulo: 'Uní dos ejercicios',
        texto:
          'En el editor de rutina, entre dos ejercicios tocá "Unir con el siguiente". Quedan en un recuadro que dice "Superserie".',
      },
      {
        titulo: 'Sumá uno más',
        texto:
          'Tocá "Unir con el siguiente" debajo del recuadro y el ejercicio de abajo se suma. El recuadro pasa a decir "Circuito".',
      },
      {
        titulo: 'Ordená o separá',
        texto:
          'Las flechas del recuadro mueven el grupo entero y las de cada ejercicio lo mueven adentro del grupo. "Separar" los vuelve a dejar sueltos.',
      },
      {
        titulo: 'Al entrenar se alternan',
        texto:
          'Cuando confirmás una serie, la app te lleva al siguiente ejercicio del grupo: primero la serie 1 de cada uno, después la 2.',
      },
    ],
  },
  {
    id: 'entrenar-rutina',
    titulo: 'Entrenar con la rutina',
    descripcion: 'Anotá peso y repeticiones mientras entrenás.',
    categoria: 'entrenamiento',
    destino: { pathname: '/(tabs)/entrenamientos' },
    pasos: [
      {
        titulo: 'Empezá',
        texto:
          'En Entrenamientos, tocá "Empezar entrenamiento" en "Hoy toca", o "Empezar ›" en cualquiera de Mis Rutinas.',
      },
      {
        titulo: 'Abrí un ejercicio',
        texto:
          'Tocá su nombre para ver las series. La columna "ANTERIOR" muestra lo que hiciste la última vez.',
      },
      {
        titulo: 'Cargá la serie',
        texto:
          'Tocá la serie y escribí con el teclado de abajo; arriba del teclado cambiás entre "Kg" y "Reps". "+1.25", "+2.5" y "+5" suman peso rápido, y "Corporal" es sin peso.',
      },
      {
        titulo: 'Confirmala',
        texto:
          'Tocá "Confirmar serie" y la app pasa sola a la siguiente. Para corregir una ya confirmada, mantenela apretada.',
      },
      {
        titulo: 'Sumá o sacá',
        texto:
          '"Agregar serie" suma otra serie y "Quitar ejercicio" lo saca por hoy. Al final, "Agregar ejercicio" suma uno que no estaba en la rutina.',
      },
      {
        titulo: 'Terminá',
        texto:
          'Tocá "Finalizar" arriba a la derecha. Si quedaron series sin confirmar, te pregunta si guardás solo las hechas.',
      },
    ],
  },
  {
    id: 'cronometro',
    titulo: 'Cronómetro libre',
    descripcion: 'Correr, caminar o bici con GPS, y la tarjeta para compartir.',
    categoria: 'entrenamiento',
    destino: { pathname: '/evento/temporizador', params: { modo: 'cronometro' } },
    pasos: [
      {
        titulo: 'Abrilo',
        texto: 'En Inicio, tocá "Entrenar" y elegí "Cronómetro libre".',
      },
      {
        titulo: 'Elegí la actividad',
        texto: 'Tocá "Correr", "Caminar" o "Bici" y después "Empezar".',
      },
      {
        titulo: 'Mientras te movés',
        texto:
          'Ves el tiempo y los km que mide el GPS. "Pausar" lo frena y "Reanudar" lo retoma.',
      },
      {
        titulo: 'Terminá',
        texto: 'Tocá "Terminar" y confirmá. Queda guardado en tu agenda.',
      },
      {
        titulo: 'Compartí',
        texto:
          'En la tarjeta, "Agregar foto" le pone una foto de fondo, "Compartir" la manda y "Guardar en galería" la guarda en el teléfono. Si los km no dieron bien, tocá "Corregir km".',
      },
      {
        titulo: 'Cerrá',
        texto: 'Tocá "Listo".',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Comidas
  // -------------------------------------------------------------------------
  {
    id: 'registrar-comida',
    titulo: 'Registrar una comida',
    descripcion: 'Buscá lo que comiste, sacale una foto o escaneá el código.',
    categoria: 'comidas',
    destino: { pathname: '/comida/nueva' },
    pasos: [
      {
        titulo: 'Abrí Registrar comida',
        texto:
          'En Inicio, tocá "Registrar comida". Arriba aparece la comida según la hora; tocala si querés cambiarla.',
      },
      {
        titulo: 'Buscá',
        texto:
          'Escribí en "Buscar alimento" y tocá el resultado. Elegí una porción, o escribí los gramos en "Otra cantidad" y tocá "Usar".',
      },
      {
        titulo: 'Si no aparece',
        texto: 'Tocá "+ Cargar "…" a mano" y completá la tabla nutricional por 100 g.',
      },
      {
        titulo: 'Con una foto',
        texto:
          'Tocá "Foto" y sacale una foto al plato. Revisá la lista: "Cambiar" corrige el alimento y, si tocás uno, ajustás la cantidad. Después tocá "Agregar a" y la comida.',
      },
      {
        titulo: 'Con el código de barras',
        texto: 'Tocá "Código" y centrá el código. Elegí la cantidad y tocá "Agregar a" y la comida.',
      },
      {
        titulo: 'Guardá',
        texto: 'Cuando esté todo, tocá "Guardar comida".',
      },
    ],
  },
  {
    id: 'mis-comidas',
    titulo: 'Mis comidas y recetas',
    descripcion: 'Repetí lo que ya comiste y guardá tus recetas.',
    categoria: 'comidas',
    destino: { pathname: '/perfil/comidas' },
    pasos: [
      {
        titulo: 'Abrí Mis comidas',
        texto: 'En Perfil, tocá "Mis comidas". Tiene dos pestañas: "Historial" y "Guardadas".',
      },
      {
        titulo: 'Repetí una comida',
        texto: 'En "Historial", tocá los tres puntos de una comida y elegí "Repetir hoy".',
      },
      {
        titulo: 'Guardala como receta',
        texto:
          'En el mismo menú, tocá "Guardar como receta" y ponele nombre. También está en el detalle de la comida.',
      },
      {
        titulo: 'Armá una receta de cero',
        texto:
          'En "Guardadas", tocá "Nueva receta" y cargá los ingredientes de la receta entera. En "Rinde", poné cuántas porciones salen y tocá "Guardar receta".',
      },
      {
        titulo: 'Usala',
        texto:
          'En "Guardadas", tocá "Agregar" y elegí la comida y las porciones. Al buscar en Registrar comida también aparece primero, con la etiqueta "Receta".',
      },
    ],
  },
  {
    id: 'avisos',
    titulo: 'Avisos',
    descripcion: 'Qué comer antes y después de entrenar o jugar.',
    categoria: 'comidas',
    destino: { pathname: '/perfil/avisos' },
    pasos: [
      {
        titulo: 'Qué son',
        texto:
          'Avisos en el teléfono antes y después de tus entrenamientos y partidos agendados, con qué comer y cuándo.',
      },
      {
        titulo: 'Activalos',
        texto:
          'La primera vez que agendás algo, la app te pregunta. Si dijiste que no, en Perfil > Avisos tocá "Activar notificaciones" o "Abrir Ajustes".',
      },
      {
        titulo: 'Elegí cuáles',
        texto:
          'En Perfil > Avisos, prendé o apagá "Antes de entrenar o jugar" y "Después de entrenar o jugar".',
      },
      {
        titulo: 'Gimnasio también',
        texto:
          'Prendé "Para el gimnasio también" si querés los mismos avisos en tus días de gimnasio.',
      },
      {
        titulo: 'Apagalos todos',
        texto: 'Con "Avisos de entrenamientos" los apagás de una vez.',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Tu progreso
  // -------------------------------------------------------------------------
  {
    id: 'niveles',
    titulo: 'Niveles y XP',
    descripcion: 'Cómo sumás puntos y subís de nivel.',
    categoria: 'progreso',
    destino: { pathname: '/(tabs)/perfil' },
    pasos: [
      {
        titulo: 'Dónde lo ves',
        texto:
          'Tu nivel está en Perfil y en Progreso, con una barra de lo que te falta para el siguiente.',
      },
      {
        titulo: 'Cómo sumás',
        texto:
          'Cada entrenamiento que completás suma 15 XP: gimnasio, cancha, pasadas o cronómetro.',
      },
      {
        titulo: 'El bono del mes',
        texto:
          'Si cerrás un mes yendo al 75% o más de tus rutinas agendadas, sumás 50 XP más. Para que cuente, tenés que haber marcado al menos 4 entrenamientos agendados en el mes, hechos o no.',
      },
      {
        titulo: 'Los niveles',
        texto:
          'Arrancando, En marcha (desde 500 XP), Constante (1.000), Firme (1.500) y Referente (2.000).',
      },
      {
        titulo: 'No baja nunca',
        texto:
          'Sumás por ir, no por cuánto levantás ni qué tan rápido corrés. Las reglas también están en la "i" al lado de tu nivel en Perfil.',
      },
    ],
  },
] as const satisfies readonly Guia[];

export type GuiaId = (typeof LISTA)[number]['id'];

export const GUIAS: readonly Guia[] = LISTA;

export function obtenerGuia(id: string): Guia | undefined {
  return GUIAS.find((g) => g.id === id);
}

export function guiasDeCategoria(categoria: CategoriaGuia): Guia[] {
  return GUIAS.filter((g) => g.categoria === categoria);
}
