// Las cuatro pantallas que muestran que hace la app, entre el resumen del
// onboarding y la pasarela.
//
// UNA ruta con un pager horizontal y no cuatro rutas: el swipe es lo que la
// gente espera de esto, la barra de progreso se actualiza sola, y el "atras"
// del sistema sale del pager de una en vez de desapilar cuatro pantallas.
//
// El pager es una FlatList horizontal con pagingEnabled. No agrega dependencia
// y el paginado nativo alcanza: no hay animaciones por pagina que justifiquen
// meter react-native-pager-view.

import { useRef, useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useRouter } from 'expo-router';

import { Pantalla } from '@/ui/Pantalla';
import { Progreso } from '@/ui/Progreso';
import { Boton } from '@/ui/Boton';
import { spacing } from '@/ui/theme';

import { PantallaBeneficio } from '@/features/onboarding/components/PantallaBeneficio';
import { PreviewComidas } from '@/features/onboarding/components/PreviewComidas';
import { PreviewNotificaciones } from '@/features/onboarding/components/PreviewNotificaciones';
import { PreviewCronometro } from '@/features/onboarding/components/PreviewCronometro';
import { PreviewConstancia } from '@/features/onboarding/components/PreviewConstancia';

// ---------------------------------------------------------------------------

type Beneficio = {
  clave: string;
  titulo: string;
  bajada: string;
  Preview: () => React.JSX.Element;
};

// El contenido de las cuatro paginas. Agregar una quinta es agregar una
// entrada aca: el progreso, el paginado y el boton salen todos del largo.
const PANTALLAS: Beneficio[] = [
  {
    clave: 'comidas',
    titulo: 'Sacá una foto\ny listo',
    bajada: 'Milanesa con puré, no chicken breast 100g. Comida argentina de verdad.',
    Preview: PreviewComidas,
  },
  {
    clave: 'notificaciones',
    titulo: 'Te avisa qué comer\nantes de jugar',
    bajada: 'Sabe que tenés partido el sábado. Vos no tenés que acordarte de nada.',
    Preview: PreviewNotificaciones,
  },
  {
    clave: 'cronometro',
    titulo: 'Un cronómetro\nque te habla',
    bajada: 'Pasadas, series o salir a correr. Suena en cada cambio, no mirás la pantalla.',
    Preview: PreviewCronometro,
  },
  {
    clave: 'constancia',
    titulo: 'Cargá tu semana\nuna sola vez',
    bajada: 'La app te pregunta después si fuiste. Al mes ya sabés cuánto cumpliste.',
    Preview: PreviewConstancia,
  },
];

// Sin boton de saltear a proposito: cuatro swipes no es una tortura, y si el
// boton esta lo van a tocar.

// ---------------------------------------------------------------------------

export default function Beneficios() {
  const router = useRouter();
  const { width: ancho } = useWindowDimensions();
  const lista = useRef<FlatList<Beneficio>>(null);
  const [indice, setIndice] = useState(0);

  const ultima = indice === PANTALLAS.length - 1;

  // El indice sale del scroll y no del boton: asi el swipe y el boton no
  // pueden desincronizarse, porque los dos terminan pasando por aca.
  const alTerminarScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const n = Math.round(e.nativeEvent.contentOffset.x / ancho);
      setIndice(Math.min(Math.max(n, 0), PANTALLAS.length - 1));
    },
    [ancho],
  );

  // El boton hace lo MISMO que el swipe hasta la ultima pagina: mueve el
  // pager. Recien ahi navega.
  const avanzar = () => {
    if (ultima) {
      router.push('/onboarding/planes');
      return;
    }
    lista.current?.scrollToIndex({ index: indice + 1, animated: true });
  };

  return (
    // scroll false porque el scroll de esta pantalla es horizontal y lo maneja
    // la FlatList. El padding horizontal lo pone cada zona: el pager tiene que
    // llegar de borde a borde para que cada pagina mida una pantalla exacta.
    <Pantalla scroll={false} style={estilos.pantalla}>
      {/* El progreso y el boton viven AFUERA del pager. Adentro habria cuatro
          barras y cuatro botones desplazandose de costado; afuera, la barra
          anima su segmento y el boton solo cambia de texto. */}
      <View style={estilos.zona}>
        <Progreso actual={indice + 1} total={PANTALLAS.length} />
      </View>

      <FlatList
        ref={lista}
        data={PANTALLAS}
        keyExtractor={(p) => p.clave}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={alTerminarScroll}
        // Todas las paginas miden lo mismo, asi que no hace falta que las mida
        // una por una: sin esto scrollToIndex tiene que esperar al layout.
        getItemLayout={(_, i) => ({ length: ancho, offset: ancho * i, index: i })}
        renderItem={({ item }) => (
          <PantallaBeneficio ancho={ancho} titulo={item.titulo} bajada={item.bajada}>
            <item.Preview />
          </PantallaBeneficio>
        )}
      />

      <View style={estilos.zona}>
        <Boton titulo={ultima ? 'Ver planes' : 'Siguiente'} onPress={avanzar} />
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  pantalla: {
    paddingHorizontal: 0,
    gap: spacing.md,
  },
  zona: {
    paddingHorizontal: spacing.lg,
  },
});
