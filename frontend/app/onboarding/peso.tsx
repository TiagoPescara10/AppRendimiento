import { Alert } from 'react-native';
import { useRef, useState, } from 'react';
import { useRouter } from 'expo-router';
import { PasoOnboarding } from '@/features/perfil/components/PasoOnboarding';
import {crearRegistroPeso, actualizarRegistroPeso, ultimoPeso } from '@/db/queries/peso';
import { Input } from '@/ui/Input';
import { obtenerPerfilLocal } from '@/db/queries/perfil';
import { aFechaLocal } from '@/lib/fechas';
import { randomUUID } from '@/db/sync/uuid';
import { useOnboarding } from '@/features/perfil/hooks/useOnboarding';

export default function Peso() {
  const router = useRouter();
  const { perfil, cargando } = useOnboarding();
  const [peso, setPeso] = useState('');
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);

    const guardar = async () => {
        if (guardandoRef.current) return;


        if (!peso) {
            Alert.alert('Faltan datos', 'Completá todos los campos.');
            return;
        }

        const pesoKg = parseFloat(peso.replace(',', '.'));
        if (!Number.isFinite(pesoKg) || pesoKg < 30 || pesoKg > 300) {
            Alert.alert('Peso inválido', 'Ingresá un peso entre 30 y 300 kg.');
            return;
        }

        guardandoRef.current = true;
        setGuardando(true);

        try {
            //Como las funciones de la bd, necesitamos traernos el perfil para poder guardar el peso, si no existe el perfil, redirigimos al usuario a la pantalla de datos.
            const perfil = await obtenerPerfilLocal();
            if (!perfil) {
                Alert.alert('Falta un paso', 'Completá primero tus datos personales.');
                router.replace('/onboarding/datos');
                return;
            }

        const hoy = aFechaLocal(new Date());
        const ultimo = await ultimoPeso(perfil.id);

        if (ultimo && ultimo.fecha === hoy) {
            await actualizarRegistroPeso(ultimo.id, { peso_kg: pesoKg });
        } else {
            //Si tenemos todo procedemos a crear el registro de peso, generando un id unico para el registro.
            await crearRegistroPeso({
            id: randomUUID(),
            usuario_id: perfil.id,
            peso_kg: pesoKg,
            fecha: hoy,
            fuente: 'manual',
            });
        }

        if (perfil.modo_nutricion === 'recuento') {
          router.push('/onboarding/resumen');
        } else {
          router.push('/onboarding/actividad');
        }
        } catch (error) {
        console.error('Error al guardar el peso:', error);
        Alert.alert('Error', 'No se pudo guardar el peso. Por favor, intentá nuevamente.');
        } finally {
        guardandoRef.current = false;
        setGuardando(false);
        }
    }

    const totalPasos = perfil?.modo_nutricion === 'recuento' ? 4 : 6;

    return (
        <PasoOnboarding
            paso={3}
            totalPasos={totalPasos}
            titulo={
                perfil?.nombre
                    ? `Hola ${perfil.nombre}, ¿cuál es tu peso actual?`
                    : '¿Cuál es tu peso actual?'
                }
            subtitulo="Ingresá tu peso en kilogramos."
            onSiguiente={guardar}
            puedeSeguir={!!peso && !cargando}
            guardando={guardando}
        >
        <Input
        label="Peso (kg)"
        value={peso}
        onChangeText={setPeso}
        placeholder="72,5"
        keyboardType="decimal-pad"
        />
        </PasoOnboarding>
    );
}




