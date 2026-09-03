import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { colors, spacing, radius } from './theme';

type Props = {
    actual: number;
    total: number;
    style?: ViewStyle;
};

const DURACION = 300;

// Un unico shared value que avanza en "pasos" (0..total). Cada segmento
// deriva su propio relleno de ahi, asi un salto de 1 a 2 solo anima el
// segundo segmento y los demas quedan quietos.
function Segmento({ indice, progreso }: { indice: number; progreso: SharedValue<number> }) {
    const estiloRelleno = useAnimatedStyle(() => {
        const relleno = Math.min(Math.max(progreso.value - indice, 0), 1);
        return { width: `${relleno * 100}%` };
    });

    return (
        <View style={estilos.segmento}>
            <Animated.View style={[estilos.relleno, estiloRelleno]} />
        </View>
    );
}

export function Progreso({ actual, total, style }: Props) {
    const cantidad = Math.max(0, Math.floor(total));
    const progreso = useSharedValue(actual);

    useEffect(() => {
        progreso.value = withTiming(actual, {
            duration: DURACION,
            easing: Easing.out(Easing.cubic),
        });
    }, [actual, progreso]);

    return (
        <View style={[estilos.fila, style]}>
            {Array.from({ length: cantidad }, (_, i) => (
                <Segmento key={i} indice={i} progreso={progreso} />
            ))}
        </View>
    );
}

const estilos = StyleSheet.create({
    fila: {
        flexDirection: 'row',
        gap: spacing.xs,
    },
    segmento: {
        flex: 1,
        height: 10,
        backgroundColor: colors.border,
        borderRadius: radius.md,
        overflow: 'hidden',
    },
    relleno: {
        height: '100%',
        backgroundColor: colors.action,
    },
});
